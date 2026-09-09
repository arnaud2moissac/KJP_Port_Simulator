# Migration du renderer du simulateur vers Three.js

## Objectif et invariants

La v2 remplace progressivement le renderer WebGL2 maison par Three.js afin de
réduire le travail CPU et les transferts GPU sur les grands ports, puis de
permettre des bateaux visuellement plus riches. La première migration reste
strictement iso-rendu.

- Le moteur physique, les profils de bateau, le pas fixe et les trajectoires
  étalons sont gelés.
- Le Canvas 2D supérieur, les commandes, le picking et les overlays écran sont
  conservés pendant le portage du monde WebGL.
- Le livrable reste un unique `simulateur-port.html` utilisable hors ligne.
- Aucun CDN, WebGPU, PBR, éclairage, ombre, brouillard ou post-traitement ne
  fait partie de la phase d'iso-rendu.
- Legacy et Three reçoivent à terme le même `RenderFrame` immuable ; le choix du
  backend ne doit jamais modifier l'état autoritaire du simulateur.

## Décisions vérifiées

- Cible : Three.js `0.186.0` / révision `186`, version stable consultée le
  8 septembre 2026 et épinglée exactement dans le lockfile.
- Renderer : `WebGLRenderer`. Le projet est déjà WebGL2 et ne présente aucun
  besoin TSL, compute ou post-processing justifiant le renderer WebGPU
  expérimental.
- Intégration : modules ES bundlés par esbuild dans le HTML autonome.
- Composition : canevas Three transparent sur le fond de scène HTML, comme le
  canevas WebGL Legacy actuel.
- Boucle : un seul propriétaire actif. Le spike Three n'instancie un renderer
  que depuis le test explicite et le détruit immédiatement.

Référence de version : [guide de migration officiel Three.js r185 → r186](https://github.com/mrdoob/three.js/wiki/Migration-Guide#185--186).

## Baseline Legacy

La commande `npm run capture:renderer-baseline` recharge une page propre par
scène, fixe le temps visuel, attend la disparition des notifications d'import,
chauffe la lecture du canevas transparent et refuse les requêtes HTTP. Elle écrit
les captures candidates et diagnostics dans un dossier temporaire, puis compare
les six empreintes au manifeste de `tests/visual-baselines/legacy/`.
Toute différence fait échouer la commande. Les références restent intactes ;
leur remplacement exige explicitement `npm run capture:renderer-baseline -- --update`.

| Scène | P95 CPU indicatif | Draw calls | Upload/image |
| --- | ---: | ---: | ---: |
| intégré · nuit · dessus · navigation | 11,6 ms | 3 | 293 Ko |
| intégré · carte · dessus · comprendre | 12,8 ms | 3 | 305 Ko |
| intégré · nuit · anatomie · comprendre | 11,2 ms | 4 | 310 Ko |
| intégré · carte · skipper · navigation | 8,8 ms | 3 | 167 Ko |
| La Trinité · nuit · dessus · navigation | 17,3 ms | 3 | 519 Ko |
| La Trinité · carte · skipper · navigation | 81,8 ms | 3 | 5,35 Mo |

Ces temps proviennent de Chromium headless/SwiftShader et servent à comparer
les backends dans le même environnement, pas à qualifier un GPU matériel. Deux
passes Legacy consécutives, puis une passe après intégration du bundle Three,
ont produit les mêmes six empreintes SHA-256.

## Phases et gates

| Phase | État | Gate de sortie |
| --- | --- | --- |
| 0 · audit et choix du renderer | terminé | frontières, risques et WebGLRenderer décidés |
| 1 · baseline Legacy | terminé | 6 scènes reproductibles, diagnostics et réseau contrôlés |
| 2 · build Three autonome | terminé | r186 embarqué, smoke triangle, Legacy actif, 48 tests navigateur verts |
| 3 · extraction de `RenderFrame` | terminé (contrat projeté transitoire) | 3 tests de contrat, 48 tests navigateur, six empreintes Legacy identiques |
| 4 · caméra et projection Three | validé pour les ancres, hors rasterisation | 2 211 ancres dans la tolérance de 0,5 px ; Legacy toujours actif |
| 5 · port, eau et infrastructures | en cours : terrain isolé validé, eau CSS conservée | 42 comparaisons raster exactes ; infrastructures et occlusions mixtes à porter |
| 6 · bateaux et overlays monde | en attente | six scènes dans la tolérance définie |
| 7 · optimisation | en attente | grand port plus rapide, allocations et mémoire stables |
| 8 · bascule v2 | en attente | Three par défaut, Legacy retiré après qualification complète |

## Contrat de frame — 9 septembre 2026

Le commit `644c8f6` sauvegarde la préparation sur `codex/threejs-v2` ; `main`
reste au commit `972f583`.

`rendering/render-frame.cjs` fournit un snapshot profondément immuable des
polygones et lignes transmis au monde WebGL. Les points utilisent les pixels du
canevas et la profondeur métrique après projection/clipping Legacy. Les styles,
pointillés et ordre d'insertion sont conservés, les valeurs numériques sont
finies et aucune donnée mutable du producteur n'est partagée avec la frame.
Le snapshot peut donc survivre à la réutilisation des listes de construction.

La façade `renderLegacyFrame` adapte seulement la signature d'appel. La fonction
`createDepthRenderer` reste identique octet pour octet au commit de préparation ;
le chemin Canvas 2D de repli et les overlays écran sont conservés. Le moteur,
les profils et les trajectoires sont identiques à `main`.

Validation : `npm run check:simulator`, `npm run test:rendering` (3 tests),
`npm run test:e2e` (48 tests, dont trajectoires étalons) et
`npm run capture:renderer-baseline` (6/6 empreintes strictement identiques).
Les références n'ont pas été réécrites. Un premier écart dû au toast d'import
a conduit à ajouter son attente explicite dans le script de capture.

Ce contrat projeté est une première frontière de comparaison, pas encore une
représentation du monde avec buffers GPU persistants. Il copie et fige les
données chaque frame ; cette allocation transitoire devra être mesurée et
remplacée par des ressources immuables réutilisables au portage des géométries.
Les mesures courtes headless ne qualifient pas un gain de performance.

## Caméra et projection — 9 septembre 2026

`rendering/three-camera.mjs` adapte un snapshot immuable de la base Legacy à une
`PerspectiveCamera` Three r186 réutilisable, sans boucle, contrôleur ou ressource
GPU supplémentaire. Les API sont vérifiées dans les sources installées de
`PerspectiveCamera`, `Camera`, `Object3D` et `Vector3`.

- Monde métrique XY, Z vertical ; colonnes de la matrice caméra : droite, haut,
  opposé de la direction de visée. Aucun changement de repère physique.
- Viewport en pixels CSS, indépendant du DPR (canevas physique plafonné à 2).
- Focale `min(width, height) × focalScale`, convertie en angle vertical par
  `2 × atan(height / (2 × focal))`. Le suivi et l'interpolation restent Legacy.
- Plan proche : 0,035 m ; plan lointain : 6 000 m. Les ancres conservent le seuil
  proche avec epsilon `1e-7` et le dénominateur borné du Legacy. Les points hors
  écran ou au-delà du plan lointain restent projetables.

Le diagnostic `__PORTANCE_TEST__.projectionComparisonReport(points)` compare
la projection Legacy existante et celle obtenue par les matrices Three. Il ne
rappelle pas `cameraBasis()` (qui avance le suivi), ne modifie pas la simulation
et n'est installé qu'en mode test. La caméra Three n'est pas utilisée par le
rendu actif. Ce snapshot caméra reste distinct du `RenderFrame` projeté ; son
raccordement aux géométries monde appartient à la tranche suivante.

Tests navigateur ciblés : dessus/anatomie/skipper, deux caps, viewports
1280×800, 800×600 et 390×844, DPR 1/2/3, redimensionnements et gestes réels de
rotation/décalage/zoom. Sur 2 211 ancres acceptées, l'écart maximal observé est
`1,53e-8 px` (tolérance `0,5 px`). Les rejets proches/arrière concordent et les
lectures répétées laissent l'état physique et la base caméra inchangés.
Les cinq tests unitaires couvrent aussi la copie immuable, les frustums invalides,
le seuil proche, le hors-champ et la réutilisation après changement de viewport.
La suite navigateur complète passe à 49 tests, dont les trois trajectoires
étalons rejouées exactement. Le build autonome est validé et les six empreintes
Legacy restent strictement identiques, sans réécriture des références ni erreur
console/page ou requête HTTP détectée. Ces preuves sont obtenues avec Chromium
headless ; elles ne constituent pas une qualification GPU matériel.

Limite explicite : cette validation concerne les coordonnées écran, pas encore
la rasterisation Three. Le clipping des primitives, la profondeur logarithmique
et bornée Legacy, les priorités de couche et l'antialiasing doivent être portés
et comparés avec les premières géométries. La profondeur perspective standard
de Three ne peut pas être considérée comme équivalente. La qualification
Safari/Firefox, appareil mobile réel et performance GPU reste à faire.

## Terrain isolé et eau — 9 septembre 2026

La tranche caméra est sauvegardée dans `66b7fb6`. Le WIP terrain de l'utilisateur
est `6c07053` ; la correction du test et le durcissement du comparateur suivent
ce WIP sur la même branche `codex/threejs-v2`.

Le terrain Three est un backend de comparaison hors écran, pas le renderer
actif. `surface-frame.mjs` copie les polygones métriques de terrain/terre issus
du cache visible et leur caméra ; il les clippe au plan proche puis les projette
avec la caméra Three. `surface-geometry.mjs` reprend les choix de triangulation
Legacy (nettoyage, concavité, diagonales), les contours en pixels, la profondeur
logarithmique par sommet et les biais de couche. `three-surfaces.mjs` dessine
trois lots avec `WebGLRenderer`, `BufferGeometry` et `RawShaderMaterial` :
opaques, translucides triés sans écriture profondeur, puis contours.

Les sommets GPU sont déjà en NDC avec `w=1`, afin de conserver l'interpolation
écran de la profondeur Legacy. Couleurs CSS display-referred, alpha prémultiplié,
`LEQUAL` et blending séparé identiques ; aucune conversion colorimétrique ni
tone mapping ajouté. Les API ont été vérifiées dans les sources Three r186
installées. Les buffers sont réutilisés, agrandis au besoin en libérant les
précédents, et les ressources/contexte sont détruits explicitement à la fermeture
du banc. La projection/triangulation CPU reste transitoire : aucun gain de
performance ou stockage GPU permanent du monde n'est revendiqué.

L'eau WebGL actuelle est un fond CSS porté par `.stage`, non un maillage.
`drawWater()` reste inchangée, ainsi que `createDepthRenderer()`. Ne pas ajouter
un plan opaque à z=0 : il masquerait notamment le terrain intégré à z=-0,08.
L'image transparente Three conserve donc le même fond partagé.

En mode `?test`, appeler `enableSurfaceComparison()`, attendre deux frames puis
`surfaceComparisonReport({images:true})`. Le rapport fournit les compteurs,
pixels et deux PNG transparents ; `disposeSurfaceComparison()` ferme le banc.
Le Legacy de référence utilise un contexte détaché indépendant. Aucun canevas
visible, état GL actif, état physique, commande ou boucle n'est remplacé.

Validation : 42 comparaisons sur les terrains intégré et La Trinité, deux thèmes,
trois vues, DPR 1/2, resize portrait, concavité et winding inversé, clipping
proche/arrière, alpha/layers/seuil opaque, buffers stables à scène constante et
disposal/recréation. Les scènes terrain utilisent `(25,-38,-π/2)` dans le port
intégré et `(480,540,0)` près de `land-1` à La Trinité ; les vues prises à l'entrée
ne suffisaient pas. Résultat : zéro pixel différent dans Chromium headless.
Les captures isolées ont été inspectées ; les six captures du rendu actif
conservent exactement leurs empreintes Legacy.

La revue indépendante a montré qu'une tolérance limitée aux bordures pouvait
laisser disparaître un trait fin. Le critère d'acceptation est donc désormais
strict (`pixels.equal`) dans le même navigateur/GPU ; la classification des
bordures n'est qu'un diagnostic. Un test de mutation vérifie qu'une bande fine
entièrement absente échoue. Le premier échec navigateur provenait d'une lecture
de `water` au lieu de `compositor` dans le test, corrigée après le WIP.

Contrôles : build/check autonome, 8 tests unitaires, suite navigateur 50/50
(dont les trois trajectoires étalons exactes), puis test terrain strict relancé
après durcissement du comparateur. Aucune erreur console/page, GL ou requête
HTTP détectée. Graphify mis à jour en AST. Pas de qualification GPU matériel,
Safari/Firefox, mobile réel, performance ou occlusions terrain/bateaux/pontons.

## Prochaine tranche

Porter les infrastructures (quais, pontons, catways) dans le même banc et vérifier
leur profondeur commune avec le terrain, avant les bateaux et overlays monde.
Ajouter une scène réellement dense autour de `(200,305,0.5084)` à La Trinité,
distincte de la scène de rive. Ne pas superposer simplement deux canevas de
backends partiels : leurs buffers de profondeur ne seraient pas partagés.
Le renderer Legacy reste actif ; la bascule de renderer par défaut est ultérieure.
