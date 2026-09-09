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
| 5 · port, eau et infrastructures | terrain/quais/pontons/catways validés dans le banc isolé ; eau CSS conservée | 76 comparaisons raster exactes avant extension bateaux |
| 6 · bateaux et overlays monde | bateaux statiques/joueur et balisage validés ; overlays à porter | 166 comparaisons raster exactes, dont poses joueur animées |
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
du cache visible et leur caméra ; il les clippe au plan proche puis les projette.
La projection matricielle initiale est remplacée pour les surfaces par le mode
de compatibilité numérique décrit ci-dessous. `surface-geometry.mjs` reprend les choix de triangulation
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

## Quais, pontons et catways — 9 septembre 2026

La tranche terrain précédente est commitée dans `ccc5198`. Le banc accepte
maintenant `enableSurfaceComparison({infrastructures:true})` : il collecte les
familles `terrain`, `land`, `dock`, `catway` et `obstacle`, avec leurs polygones
et lignes monde. Les styles sont résolus comme dans `addPolygon` (notamment
`stroke:false`), les raccords de catways proviennent des constructeurs existants,
sans modifier leur géométrie ni leur représentation physique.

Les arêtes des volumes utilisent une quatrième passe Three, après les contours
de polygones, avec écriture/test de profondeur actifs. Leur épaisseur en pixels
CSS, le clipping au plan proche puis au viewport avec marge, et le biais de
profondeur `-2e-6` restent ceux du Legacy. Seules les lignes pleines sont admises
à cette étape ; les pointillés sont explicitement refusés, pas ignorés.

Décision d'iso-rendu : la vue skipper dense La Trinité a révélé un contour
concave traversant le plan proche, dont les arrondis matriciels changeaient le
nettoyage et l'ear clipping (56 triangles supplémentaires, 38 pixels différents).
`projectSurfacePoint` conserve donc l'ordre arithmétique Legacy à partir du
snapshot immuable, sans appeler le renderer Legacy ni lire l'état physique.
La caméra matricielle Three reste validée séparément par les ancres ; le banc
raster ne prouve pas son équivalence sur ces triangulations sensibles.
La fonction Legacy, y compris son rejet historique de ce contour, reste gelée.
`surfaceComparisonReport({geometry:true})` expose les snapshots de diagnostic.

Les 76 comparaisons couvrent les 42 cas terrain précédents, les infrastructures
des deux ports dans les trois vues et les deux thèmes/DPR, et les lignes proches,
lointaines, hors écran, devant et derrière une surface. La scène dense de
La Trinité utilise `(200,305,0.5084)` ; le rapport vérifie la présence des quais,
catways et obstacles linéaires. La scène intégrée vérifie ensemble terrain et
infrastructures. Zéro pixel différent, compteurs de polygones, triangles,
segments acceptés/rejetés et appels de dessin identiques ; snapshots physiques
inchangés. Captures isolées inspectées, quatre lots GPU au maximum, textures
absentes et ressources stables à scène constante après resize/recréation.

Contrôles : build/check autonome, 9 tests unitaires, suite navigateur 50/50
incluant les trajectoires exactes, six captures Legacy identiques, diff contrôlé
et Graphify mis à jour. La revue indépendante ne relève pas de défaut concret.
Les limitations restent le rendu isolé, l'absence de qualification GPU matériel
et les allocations CPU transitoires ; aucun gain de performance revendiqué.

## Bateaux statiques et joueur — 9 septembre 2026

Départ de `aebbdc4`, branche `codex/threejs-v2`. L'option
`enableSurfaceComparison({boats:true})` inclut le terrain, les infrastructures,
les bateaux statiques du cache (`boat`) et exactement un bateau joueur (`player`).
Le joueur est observé pendant l'unique appel habituel `addBoatMesh(frameMotion,true)` :
les primitives monde sont recueillies avant clipping, les sorties Legacy après.
Il n'est ni reconstruit une seconde fois ni inséré dans le cache statique.
Le drapeau de capture est réinitialisé par `finally`.

La coque, les contours/halos de collision, le mât, les pare-battages et les
éléments anatomiques empruntent les quatre passes existantes. Toutes les lignes
actuelles de `addBoatMesh` sont pleines et de layer inférieur à 10. La géométrie
de ce constructeur, `prepareInterpolatedFrameMotion` et `createDepthRenderer`
restent identiques octet pour octet à `aebbdc4` ; aucun changement physique.
Le rapport `player` copie la pose affichée, les poses précédente/autoritaire et
le ratio d'interpolation, sans exposer leurs références mutables.

Validation ciblée : 130 comparaisons raster strictes, zéro pixel différent.
Aux 76 cas précédents s'ajoutent les deux ports × trois vues × deux thèmes ×
vitesses 1/2 × DPR 1/2, puis trois images réellement animées par DPR en anatomie
à vitesse 1. Présence de bateaux statiques, joueur et infrastructures contrôlée ;
pose x/y et cap interpolés vérifiés, mouvement entre captures et état physique
inchangé pendant chaque comparaison. Les captures anatomie intégré/La Trinité
ont été inspectées. Les neuf tests unitaires existants restent verts.
Build et contrôle du HTML autonome réussis ; suite navigateur finale 50/50,
dont les trois trajectoires étalons exactes ; six empreintes Legacy inchangées.
Aucune erreur console/page/GL ni requête HTTP détectée. Diff vérifié et graphe
mis à jour en AST. Les modifications de cette tranche restent non commitées.

La revue indépendante ne relève pas de bug concret dans la capture. Limites :
pas encore de cas raster dédié au changement de couleur des pare-battages en
contact, ni à l'interpolation du cap traversant ±π ; animation raster exercée en
anatomie ×1 seulement, autres vues et ×2 en pause. Les overlays d'aussières,
le balisage et la bascule Three visible restent hors de cette tranche. Le banc
avec lectures de pixels n'est pas une mesure de performance.

## Bouées et balisage — 9 septembre 2026

Départ de `42b1dfc`, branche `codex/threejs-v2`. L'option de diagnostic
`enableSurfaceComparison({seamarks:true})` étend la capture complète précédente
aux propriétaires `buoy` et `lights`. Elle reprend les primitives du cache
historique, dans leur ordre habituel, et conserve exactement un joueur.
Aucun changement de constructeur, d'apparence nautique, de collision ou de
backend visible. Les feux restent des lignes colorées, sans éclairage Three.

36 cas supplémentaires couvrent le port intégré avec feux/pontons/bateaux,
une bouée réelle de La Trinité et une fixture de dix variantes : latérales,
quatre cardinales, danger isolé, eaux saines, spéciale et installation.
Chaque scène est exercée dans les trois vues, les deux thèmes et à DPR 1/2.
Les captures rapprochées anatomie/skipper ont été inspectées ; les silhouettes,
bandes et marques reproduisent uniquement les formes Legacy existantes, sans
prétendre à une représentation réglementaire exhaustive.

La revue indépendante n'a trouvé aucun bug de capture ; elle a conduit à
renforcer le contrôle des feux : les quinze segments du port intégré sont
identifiés par leurs coordonnées, puis retirés d'une copie du même snapshot.
Leur suppression doit changer l'image, ce qui prouve leur contribution raster
et ne se limite pas au comptage d'un propriétaire de cache éventuellement vide.

Validation : build et contrôle du HTML autonome réussis, neuf tests unitaires,
suite navigateur 50/50 puis relance ciblée après renforcement du test des feux :
166 comparaisons exactes, zéro pixel différent, aucune erreur console/page/GL
ni requête HTTP. Les trois trajectoires étalons et six empreintes Legacy sont
inchangées. Diff contrôlé, `graphify update .` exécuté (aucun changement de
topologie du graphe). `main` et les sources physiques restent intacts.
La tranche reste non commitée. Les limites du banc isolé et les cas de contact/
animation encore manquants de la tranche bateaux restent valables ; aucun gain
de performance n'est revendiqué.

## Prochaine tranche

Ajouter les overlays monde au même snapshot. Le support des pointillés devra
précéder l'intégration des aussières et overlays concernés.
Compléter les cas de contact/animation manquants avant qualification globale.
Ne pas superposer deux canevas de backends partiels : leurs buffers de profondeur
ne seraient pas partagés. Le renderer Legacy reste actif.
