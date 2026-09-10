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
| 6 · bateaux et overlays monde | monde complet et overlays composés ; contact/animation couverts, défaut de coloration Legacy identifié | 338 comparaisons raster + 24 traversées de ±π exactes |
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

## Pointillés — 10 septembre 2026

Départ de `3dd82f5`, branche `codex/threejs-v2`. Le snapshot monde accepte
désormais les motifs finis, les copie et les fige. La tessellation des lignes
Three reprend exactement les règles Legacy : longueurs en pixels CSS, valeurs
positives ramenées à au moins 0,5 px, phase conservée entre sommets après
clipping écran, parité d'index inchangée pour les motifs impairs et plafond de
4 096 portions dessinées par ligne. Le compteur `dashLimitHits` est comparé
avec le Legacy. Les quatre passes et leurs règles de profondeur ne changent pas.

Le chemin des fixtures synthétiques conserve maintenant une polyline entièrement
devant `near`, comme le vrai `addWorldLine`, au lieu de la couper en segments.
Dès qu'un point passe derrière `near`, le découpage historique par segment
réinitialise la phase par record : ce comportement est volontairement conservé.
Ni `addWorldLine`, ni `createDepthRenderer`, ni les constructeurs d'overlays
visibles n'ont changé. Le support des pointillés reste dans le banc isolé ;
les aussières et autres overlays réels ne sont pas encore capturés.

Onze fixtures raster supplémentaires par DPR couvrent continuité de phase,
motifs impairs/à une valeur, normalisation, clipping extrême, sortie/rentrée
du viewport, passages multiples de `near`, profondeur, alpha et plafond.
Les tests unitaires vérifient aussi qu'un segment rejeté ne consomme pas de phase
et qu'atteindre le plafond ne supprime pas la ligne suivante. La revue
indépendante retrouve les mêmes tableaux de sommets et compteurs que le Legacy
sur 200 cas CPU déterministes (sans navigateur).

Validation finale : dix tests unitaires réussis, suite navigateur 50/50 puis
relance ciblée avec captures ; 188 comparaisons raster strictes et zéro pixel
différent à DPR 1/2. Captures polyline, passages de near et occlusion inspectées.
Console/page/GL et réseau sans erreur ; trois trajectoires étalons exactes et
six empreintes Legacy inchangées. Build autonome, contrôle de build et diff
validés ; graphe AST mis à jour (960 nœuds, 1 727 arêtes). `main`, physique,
profils et étalons sont intacts. Modifications non commitées. Aucun gain de
performance ni qualification du rendu Three visible revendiqué.

## Monde complet et overlays conservés — 10 septembre 2026

Suite du WIP pointillés, toujours sur `3dd82f5` / `codex/threejs-v2`.
`enableSurfaceComparison({world:true})` observe désormais tous les polygones et
les lignes de layer inférieur à 10 lors de leur passage normal dans les
collecteurs. La construction du cache n'est pas capturée ; son replay l'est,
sans collecte supplémentaire par famille. Le joueur est toujours observé
pendant son unique construction. Les listes projetées de référence sont
copiées à la fin de la construction du monde, avant tout rendu ou tri fallback.

Cela ajoute la grille (layer −30), les traces réelles de vent/courant (−2),
les taquets distants (5), les repères visiteurs (8) et les objectifs (9).
L'axe du safran (12), les flèches prioritaires (10), aussières, pendilles,
taquets interactifs et labels restent sur le Canvas2D supérieur, comme prévu
par le contrat de migration. Aucun déplacement vers le test de profondeur GPU.

`surfaceComparisonReport({composite:true})` compose chaque monde détaché avec
le même canvas overlay déjà dessiné, dans un appel synchrone. Il ne rappelle
aucun constructeur d'overlay ni `mooringReport()` (qui recalcule la caméra).
Le contrôle strict du monde reste indépendant de la composition : les pixels
opaques d'un overlay ne peuvent donc pas masquer une régression monde.
Les PNG composés restent transparents : eau CSS, HUD et vignette DOM ne sont
pas rasterisés dans ce diagnostic, et la composition ne constitue pas un
portage des aussières vers Three.

Le diagnostic est refusé si le renderer actif est en repli Canvas2D, ou si la
composition demande un périmètre partiel/synthétique. La revue indépendante a
identifié un ancien snapshot réutilisable après changement de scope : activer
un périmètre invalide maintenant la capture et exige une nouvelle frame.
Les canvases de composition sont réutilisés, redimensionnés puis libérés au
disposal ; aucun nouveau contexte GPU, aucune nouvelle boucle de rendu.

72 cas monde complet sont ajoutés : départ au ponton avec deux aussières,
départ avec deux aussières et une pendille frappée, grand port La Trinité ;
trois vues × deux thèmes × deux modes × DPR 1/2. Ils contrôlent la présence
des couches attendues et l'égalité des compteurs Three avec le renderer actif,
afin de détecter une omission ou un doublon. État physique, canvas overlay,
sélection et hitTargets restent inchangés après le diagnostic. La composition
est aussi exercée pendant l'animation anatomie, au resize et après recréation.
Les captures composées ponton/anatomie, pendille/skipper et grand port/anatomie
ont été inspectées.

Validation finale de cette tranche : build et contrôle autonome réussis,
dix tests unitaires et 50 tests navigateur verts. Les 260 comparaisons monde
ont zéro pixel différent ; les 82 compositions (72 scènes, six images animées,
deux resize et deux recréations) sont également strictement identiques.
Aucune erreur console/page/GL ni requête HTTP détectée ; les trois trajectoires
étalons et six empreintes Legacy restent exactes. Les fonctions Legacy de rendu,
overlays, construction bateau et interpolation ont été comparées au HEAD :
inchangées octet pour octet. Diff contrôlé et graphe AST mis à jour.
`main`, sources physiques, profils et étalons sont intacts. Cette tranche et
le prérequis pointillés restent non commités. Pas de bascule du renderer actif,
de qualification GPU matériel ni de gain de performance revendiqué.

## Contacts et animation — 10 septembre 2026

Départ de `9bd55a7`, branche `codex/threejs-v2`. Seuls les tests navigateur
et ce journal changent. L'animation réelle passe de trois images anatomie ×1
par DPR à trois images par vue (dessus/anatomie/skipper) et vitesse ×1/×2.
Chaque lecture vérifie x/y et cap interpolés, progression du joueur, ratio
fractionnaire et absence de mutation physique ou des interactions.

Un test séparé couvre 24 traversées de ±π : deux sens × trois vues × deux
vitesses × DPR 1/2. Comme dans les baselines, il contrôle les horodatages
transmis à la boucle requestAnimationFrame existante ; les équations et états
ne sont pas remplacés. Il vérifie qu'une vraie transition entre poses
autoritaires de signes opposés est observée avec un ratio fractionnaire, puis
déroule les angles pour contrôler le petit arc autour de π. Monde et overlays
composés sont comparés exactement sur cette frame.

48 cas supplémentaires reproduisent un contact réel avec le quai sud et son
contrôle sans contact : bâbord/tribord × contact/non-contact × deux thèmes ×
trois vues × DPR 1/2. Recette : port intégré, position `(25,-43.92)`, cap 0
et vitesse latérale −0,05 (tribord), ou cap π et vitesse latérale +0,05
(bâbord), puis un pas de 1/120 s. Le contrôle utilise `y=-43.8`.
Le diagnostic vérifie contact physique présent/absent et parité raster,
sans demander de modification du moteur ou du renderer.

### Défaut Legacy constaté : couleur des pare-battages au contact

`addBoatMesh()` recherche un contact par préfixe numérique `${fenderIndex}:`,
mais les contacts du moteur portent des identifiants comme
`fender-mid-starboard:quay-south`, conservés par `physicsStep()`.
Le contact existe donc sans activer la couleur de contact du pare-battage.
La comparaison CPU indépendante a identifié cette incompatibilité ; les
tests navigateur comptent les faces de couleur contact et consignent le
résultat. Ils n'exigent pas zéro face, afin de ne pas figer ce défaut comme
comportement souhaité. La qualification porte sur l'apparence Legacy actuelle ;
la coloration de contact fonctionnelle reste à corriger dans une intervention
visuelle dédiée, qui changerait les références Legacy.

Résultats : 338 comparaisons monde dans le banc étendu, plus 24 traversées
de ±π, toutes sans pixel différent ; 184 compositions strictement identiques
au total. Le navigateur confirme un contact actif et zéro face de couleur
contact pour chaque côté/thème/DPR. Les captures contact/anatomie bâbord et
tribord ont été inspectées. Les assertions navigateur comptent les contacts
actifs ; leur identité `fender-mid-{side}:quay-south` provient de la recette
CPU vérifiée indépendamment, car le snapshot public n'expose pas ces IDs.
Le code de simulation/rendu et le HTML généré restent identiques à `9bd55a7`.

Validation exécutée en trois sélections complémentaires du même fichier :
`interpolation du cap` (1 test), `terrain Three` (1 test) et
`caméra Three|simulateur de port —` (49 tests), soit 51 tests réussis.
Les trois trajectoires étalons restent exactes et les 2 211 ancres caméra
présentent un écart maximal de 1,33e−8 px. Console/page/GL et réseau sont
contrôlés dans les nouveaux cas. `npm run check:simulator` et le contrôle
du diff passent ; graphe AST mis à jour. Les tests unitaires et les six
captures de référence n'ont pas été relancés : leurs sources et le livrable
sont inchangés depuis la validation précédente. Tests et journal non commités.

## Profilage reproductible du grand port

La commande `npm run profile:renderers` ouvre le HTML autonome dans Chromium,
sans requête HTTP, et écrit les mesures brutes ainsi que les captures dans un
dossier temporaire `kjp-render-profile-*`. `--quick` contrôle le fonctionnement
du banc avec trois échantillons et trois cycles ; ses percentiles ne constituent
pas une mesure de performance exploitable.

Le protocole `projected-input-cpu-v1` utilise La Trinité, une fenêtre 1280 × 800,
le mode navigation, la physique pausée et un timestamp visuel fixé à 12 345 ms.
Pour chaque DPR 1/2, il compare les vues dessus, anatomie, skipper et dessus au
zoom maximal, dans les deux thèmes. Le cas retenu est celui qui soumet le plus
de triangles parmi ces huit cadrages ; ce critère ne prétend pas trouver le
pire temps CPU parmi tous les états possibles du simulateur.

Chaque DPR fait ensuite l'objet de trois répétitions : 30 images de chauffe et
120 paires Legacy/Three, en alternant l'ordre AB/BA. Les backends détachés
reçoivent **exactement la même entrée projetée**. Le temps inclut compilation,
préparation des buffers et soumission WebGL ; la projection Three est mesurée
séparément. Capture du monde, physique, overlays, lectures de pixels et attente
de fin GPU sont exclus. `gl.finish()` vide les deux files avant chaque mesure,
hors minuterie. Ce microbenchmark ne mesure ni le FPS de la boucle visible, ni
le coût complet monde→écran. Les percentiles ne s'additionnent pas.

Une passe distincte observe les appels `bufferData`/`bufferSubData`, sans ajouter
d'instrumentation aux échantillons CPU. Les octets transférés sont distingués
des capacités retenues et des allocations. Les capacités internes Legacy ne
sont pas exposées : le rapport porte `null`, pas zéro. Les compteurs Three
incluent géométries, textures, programmes, cache couleurs et capacité des
buffers ; cette dernière n'est pas une mesure exhaustive de mémoire GPU.
Les API ont été vérifiées avec le runtime installé r186 et les documentations
[WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html) et
[InterleavedBuffer](https://threejs.org/docs/pages/InterleavedBuffer.html).

Le soak alterne vingt fois port intégré et La Trinité, avec le même banc
conservé. Les ressources de chaque port doivent rester identiques à celles de
son deuxième passage. Le tas JS est relevé après GC explicite via CDP ; sa
croissance finale est bornée à 15 % + 2 Mio par rapport au deuxième passage.
Cette borne et la stabilité des compteurs ne prouvent pas l'absence exhaustive
de fuite. La destruction/recréation finale contrôle le fonctionnement et les
pixels, pas la restitution effective de toute la mémoire du pilote.

Le chemin `renderProjected` est réservé au banc. Le renderer Legacy reste actif
et son implémentation n'est pas modifiée. Les équations, profils et étalons
physiques restent gelés.

### Mesures du 10 septembre 2026

Exécution complète sur Apple M1, Chromium 149.0.7827.55, Three r186,
ANGLE/SwiftShader Vulkan (rendu logiciel). L'extension de temps GPU est absente ;
les temps et la mémoire GPU restent indisponibles. Le HTML mesuré porte le
SHA-256 `faa472f18514db185b08d32a854534d1dc038c7db533041e1e6fcd42d98e6164`.
Les échantillons bruts et captures de cette session sont dans
`/var/folders/5y/sj7vgmys4h98d70vjx_njb480000gn/T/kjp-render-profile-i51xfV/`.

Le cadrage retenu aux deux DPR est la vue dessus, thème carte, distance
1 200 m, cible `(200, 305, 0)` : 936 objets visibles, 8 384 polygones monde et
5 148 lignes. Chaque backend soumet 82 199 triangles en trois appels, avec
trois transferts totalisant 6 904 716 octets par image. Aucune allocation GPU
n'est observée dans la passe instrumentée après chauffe, et Three ne réalloue
aucun buffer pendant les mesures.

Temps CPU en millisecondes, trois répétitions indépendantes de 120 échantillons
par DPR et backend ; chaque cellule donne **p50 / p95 / p99** :

| DPR | Répétition | Legacy, entrée projetée | Three, même entrée projetée |
| --- | --- | --- | --- |
| 1 | 1 | 137,1 / 245,0 / 255,7 | 140,4 / 249,6 / 283,0 |
| 1 | 2 | 135,8 / 213,8 / 271,0 | 132,5 / 221,0 / 248,0 |
| 1 | 3 | 130,8 / 245,8 / 270,3 | 131,7 / 225,4 / 259,4 |
| 2 | 1 | 145,0 / 217,4 / 259,1 | 138,5 / 202,9 / 246,0 |
| 2 | 2 | 146,4 / 240,5 / 279,3 | 143,2 / 228,6 / 272,9 |
| 2 | 3 | 186,0 / 262,8 / 296,0 | 180,5 / 251,3 / 266,2 |

La compilation des géométries domine les passes Three instrumentées : médianes
de 129,8 à 211,6 ms, contre 2,0–2,7 ms pour la préparation des buffers et
0,3–0,4 ms pour la soumission. La projection séparée a une médiane de
25,4–38,8 ms. Ces distributions distinctes ne s'additionnent pas. Un pic de
soumission est conservé dans les données (p99 de 128,8 ms sur la première
répétition DPR 1), sans attribution forcée au GPU ou au GC. La variabilité et
le périmètre partiel ne permettent pas de revendiquer un gain global Three.

Les vingt cycles par DPR, soit quatre-vingts chargements de ports au total,
passent. Les compteurs Three restent à quatre géométries, un programme, zéro
texture, 72 couleurs et 2 883 860 floats de capacité (11 535 440 octets).
Les caches de géométrie statique retrouvent respectivement 56 et 937 entrées
pour le port intégré et La Trinité. Le tas JS de La Trinité après GC passe de
74,1 à 84,5 Mo au DPR 1, et de 83,2 à 73,9 Mo au DPR 2 : la borne de croissance
est respectée, sans affirmer que le tas est parfaitement constant. Les pixels
monde et composés restent identiques avant/après profilage, après soak et après
recréation ; le chemin à entrée projetée est également comparé. Les snapshots
physiques restent inchangés par chaque appel au diagnostic. Aucune erreur
console/page/GL ni requête HTTP n'a été détectée par le banc.

Validation finale : `npm run check:simulator`, les 10 tests de
`npm run test:rendering` et les 51 tests navigateur de
`tests/simulateur-port.test.js` passent. Le banc conserve ses 338 comparaisons
raster et ses 24 traversées de ±π strictement identiques ; les 2 211 ancres
caméra ont un écart maximal de `2,79e-8 px` pour une tolérance de 0,5 px.
Les trois trajectoires étalons sont exactes. Les six empreintes de
`npm run capture:renderer-baseline` sont identiques, sans `--update`.
Les captures du grand port ont été inspectées aux deux DPR. `git diff --check`
et `graphify update .` passent (999 nœuds, 1 776 arêtes, 54 communautés).
Les premiers lancements Chromium bloqués par le bac à sable macOS ont été
relancés avec autorisation ; les exécutions navigateur autorisées passent.
Pas de validation GPU matériel, Safari/Firefox, mobile réel ou release dans
cette tranche. Modifications non commitées.

## Réutilisation des sommets encodés dans le compilateur Three

La tranche suivante part du commit `6e30acf`, arbre propre. Elle modifie
uniquement `surface-geometry.mjs`, le HTML régénéré et ce journal. Chaque sommet
de remplissage est encodé une fois par polygone, puis réutilisé par ses
triangles. Chaque quad de contour ou de ligne encode quatre positions écran
et deux profondeurs, puis émet les six sommets dans le même ordre. Une
triangulation vide ne déclenche aucun encodage.

L'encodage reste en nombres JavaScript, sans arrondi Float32 anticipé. Les
expressions arithmétiques, les offsets, le clamp final, le tri des transparents
et la triangulation ne changent pas. Les contours utilisent toujours les
points originaux du polygone, indépendamment des points nettoyés du remplissage.
Aucun cache inter-frame n'est ajouté ; l'implémentation Legacy reste inchangée.

Une comparaison directe charge le compilateur du commit de départ et le
candidat dans le même Chromium. Sur les huit cadrages de La Trinité, les
7 375 998 nombres produits sont strictement identiques (`Object.is`, y compris
le signe du zéro), ainsi que tous les compteurs. Sur la vue générale en thème
carte, les appels à `Math.log` passent de 493 194 à 197 934, soit environ 60 %
de moins. Ce comptage se fait hors des mesures de temps.

Trois répétitions appariées alternent les deux compilateurs après trente
compilations de chauffe, sur 120 échantillons chacun. Elles utilisent la même
entrée projetée et les mêmes couleurs déjà parsées. Temps CPU de compilation
en millisecondes, **p50 / p95 / p99** :

| Répétition | Avant | Après |
| --- | --- | --- |
| 1 | 74,5 / 86,6 / 89,5 | 60,7 / 70,7 / 73,4 |
| 2 | 74,8 / 86,1 / 95,4 | 60,7 / 70,5 / 72,7 |
| 3 | 74,6 / 86,3 / 92,4 | 60,8 / 71,4 / 79,3 |

Le gain médian de ce microbenchmark est de 18,5–18,9 %, et celui du p95 de
17,3–18,4 %. Il ne mesure pas la cadence du simulateur. Les données de cette
comparaison sont dans `/tmp/kjp-compiler.mtJZpn/comparison.json` ; le script
ponctuel et le compilateur de départ sont conservés dans le même dossier.

Le protocole complet `npm run profile:renderers` passe également, sur le HTML
de SHA-256 `d7c49f8c670f490ca76e0f53a761603b8daa3b362ef522c90d2d31218e7fb695`.
Rapport et captures :
`/var/folders/5y/sj7vgmys4h98d70vjx_njb480000gn/T/kjp-render-profile-QlWWBE/`.
Temps CPU de préparation/soumission depuis l'entrée projetée commune, mêmes
conditions et limites que le protocole précédent, **p50 / p95 / p99** :

| DPR | Répétition | Legacy inchangé | Three optimisé |
| --- | --- | --- | --- |
| 1 | 1 | 74,9 / 86,7 / 97,1 | 61,9 / 72,7 / 77,7 |
| 1 | 2 | 74,8 / 86,6 / 96,6 | 62,0 / 73,1 / 80,0 |
| 1 | 3 | 75,2 / 86,1 / 93,2 | 61,7 / 72,5 / 73,2 |
| 2 | 1 | 77,6 / 82,9 / 87,2 | 64,2 / 74,8 / 75,9 |
| 2 | 2 | 81,5 / 115,9 / 156,6 | 67,2 / 98,9 / 120,9 |
| 2 | 3 | 82,8 / 94,6 / 105,2 | 68,7 / 77,6 / 85,4 |

Les valeurs absolues du témoin Legacy ont aussi baissé depuis la session de
profilage initiale : cette baisse commune ne peut pas être attribuée au patch.
Le gain annoncé du compilateur repose donc sur la comparaison appariée
avant/après dans la même session, et non sur la différence entre ces deux
sessions. Le banc complet confirme une médiane Three inférieure de 17–18 % à
celle du Legacy inchangé pour son périmètre à entrée projetée.

Les 82 199 triangles, trois appels de dessin et 6 904 716 octets transférés par
image sont conservés. Les vingt cycles d'import par DPR passent avec les mêmes
compteurs et capacités stables, sans réallocation après chauffe. Le tas JS de
La Trinité après GC évolue de 71,1 à 71,2 Mo au DPR 1 et de 91,7 à 90,8 Mo au
DPR 2, dans la borne du protocole. Les pixels monde et composés, les snapshots
physiques et les contrôles console/page/GL/réseau du banc passent également.

Validation après optimisation : build et contrôle du HTML autonome réussis,
10 tests unitaires de rendu et 51 tests navigateur réussis. Les 338 comparaisons
raster et 24 traversées de ±π sont strictement identiques, ainsi que les six
références Legacy sans `--update`. Les 2 211 ancres caméra restent dans la
tolérance (écart maximal `1,33e-8 px`) et les trois trajectoires étalons sont
exactes. La capture du grand port optimisé a été inspectée. Le graphe est mis à
jour (1 000 nœuds, 1 777 arêtes, 53 communautés) et `git diff --check` passe.
Legacy reste actif ; physique et profils inchangés. Modifications non commitées.

## Prochaine tranche

Qualifier le coût complet avec activité et GPU matériel avant d'envisager une
bascule visible vers Three. La compilation reste à surveiller ; toute nouvelle
optimisation doit garder sa comparaison avant/après et les références visuelles.
Garder le
défaut Legacy de coloration des contacts explicite dans les critères visuels ;
ne pas revendiquer son bon fonctionnement au titre de la parité Three.
Ne pas superposer deux canevas de backends partiels : leurs buffers de profondeur
ne seraient pas partagés. Le renderer Legacy reste actif.
