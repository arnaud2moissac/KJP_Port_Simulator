# Migration du renderer du simulateur vers Three.js

## Statut prescriptif et orientation de référence — 14 septembre 2026

Ce document reste la référence unique du renderer KJP. La présente section et
la section [Clôture de la migration](#clôture-de-la-migration--14-septembre-2026)
fixent le contrat courant. Les sections « Baseline Legacy », « Migration
progressive », « Tranches natives planifiées » et les livraisons N1 à N6 sont
un journal historique : leurs mesures et décisions restent reproductibles, mais
leurs prescriptions de conserver ou d'activer les anciens backends sont
**remplacées** par la clôture.

**État du produit après N7 et C1–C4 :** Three natif est le seul backend WebGL
du produit et le Canvas 2D existant est son secours direct. Legacy WebGL, Three
de compatibilité, le `RenderFrame` projeté qui leur était exclusif et les
comparateurs embarqués ont été retirés. Les garanties utiles ont été transférées
vers des tests natifs et des résultats reproductibles indépendants du renderer.
L'inventaire, les justifications de conservation et le manifeste historique sont
dans
[`docs/validation/threejs-migration-closure.md`](validation/threejs-migration-closure.md).

La clôture a commencé dans
`/Users/arnaud/Codex_main/KJP_Port_Simulator`, sur la branche
`codex/threejs-v2`, au commit
`78fb7d148fe065d6fa2479dc8c1eaae151f755e1`, avec un arbre propre. Le tag annoté
`threejs-migration-legacy-final` fixe cet état avant retrait. Aucun changement de
branche, reset ou suppression de travail préexistant n'a été effectué.

**État constaté au début de N6 :** répertoire réel
`/Users/arnaud/Codex_main/KJP_Port_Simulator`, branche `codex/threejs-v2`, HEAD
`f136091d2ccfbfd6628587454f9ece16806710a8` (`refactor_v2:N5`), arbre Git
propre. Aucun changement de branche, reset, suppression ou reprise des travaux
validés n'a été effectué.

**État constaté au début de N3 :** même répertoire et même branche, HEAD
`f69900fdf7d5378debf7e10b6da69650eeae99bf` (`refactor_v2:N2.3`), arbre Git
propre. Les livraisons N1 et N2 étaient donc déjà commitées et ont été
réutilisées. Aucun changement de branche, reset, suppression ou reprise des
travaux validés.

**État constaté à la revue documentaire et au début de N1 :** répertoire réel
`/Users/arnaud/Codex_main/KJP_Port_Simulator`, branche `codex/threejs-v2`, commit
`24100376c9bfadfbb0a9caa18dc630487d2c101f`. Les quatre fichiers de cadrage
listés ci-dessous étaient déjà modifiés au début de cette revue ; aucun autre
changement Git n'était présent. Le suivi N1 complète ce document ; les trois
autres fichiers de cadrage préexistants sont préservés. Aucun changement de
branche, reset ni nettoyage de l'arbre.

La cible livrée reste Three.js `0.186.0` / révision `186` avec
`WebGLRenderer`, modules ES intégrés par esbuild et HTML autonome hors ligne.
Le produit possède deux chemins :

- **Three natif**, renderer normal à géométries monde persistantes. Il ne reçoit
  pas de `RenderFrame` projeté et ne devient jamais une autorité pour la
  simulation ;
- **Canvas 2D**, secours direct sélectionnable par `?renderer=canvas` et activé
  automatiquement après une erreur native explicite.

Legacy WebGL et Three de compatibilité n'appartiennent plus au produit. Leurs
sources, tests, références et mesures restent accessibles via le tag
`threejs-migration-legacy-final` et le manifeste de clôture.

### Invariants physiques et fonctionnels stricts

- `physics-core.js`, les profils, les collisions, le pas fixe, l'accumulateur,
  la progression temporelle, les trajectoires étalons et l'interpolation
  existante restent inchangés. Les commandes, scénarios et résultats physiques
  sont comparés exactement avec les mêmes entrées et timestamps contrôlés.
- La simulation et ses repères restent l'unique autorité. Aucun objet, rayon,
  matrice, horloge ou calcul Three ne devient une entrée du moteur physique.
- La fonction `render(time)`, `prepareInterpolatedFrameMotion()` et
  `cameraBasis()` conservent la propriété de la boucle, de la pose affichée et
  du suivi caméra. Le backend natif adapte cette base aux matrices Three sans
  ajouter de boucle, d'horloge ni de suivi concurrent.
- Le Canvas 2D supérieur, les overlays pédagogiques, le picking et les
  `hitTargets`, notamment ceux reconstruits par `drawMooringLayer()`, restent
  fonctionnels et propriétaires de leurs interactions. Le raycasting Three ne
  remplace pas ce contrat dans ce chantier.
- Le livrable reste un unique `simulateur-port.html` autonome hors ligne. Le
  fond d'eau actuel et une apparence simple sont conservés. Aucun CDN, WebGPU,
  PBR, éclairage, ombre, brouillard, post-traitement ou correction fonctionnelle
  sans rapport avec la migration n'entre dans le périmètre.

### Critères des chemins maintenus

| Contrat | Three natif | Secours Canvas 2D |
| --- | --- | --- |
| Entrée | ressources monde persistantes + état de présentation compact | primitives projetées et caches Canvas conservés |
| Validation visuelle | présence, dimensions, occlusion, lisibilité et stabilité des références natives | monde lisible et interactions utilisables dans les erreurs qualifiées |
| Physique et fonctions | exactes | exactes |
| Activation | défaut produit et `?renderer=native` | erreurs natives et `?renderer=canvas` |

Les exigences historiques de `RenderFrame` commun, de projection/clipping
Legacy, d'identité des tableaux intermédiaires, des compteurs et des pixels ont
été retirées avec les backends auxquels elles s'appliquaient. Elles restent
documentées et reproductibles dans l'archive. Le contrat natif est :

- produire un rendu proche de Legacy et cohérent avec les dimensions et
  positions KJP, les cadrages, silhouettes, couleurs, épaisseurs, thèmes,
  priorités visuelles et occlusions utiles, sans réintroduire leur identité
  raster comme condition implicite ;
- ne perdre aucune primitive significative, information pédagogique,
  lisibilité ni interaction ;
- accepter les différences de rasterisation et de tessellation qui ne changent
  pas ces propriétés ;
- garder exactes les validations physiques, fonctionnelles et les trajectoires
  étalons, indépendamment du chemin de rendu.

### Architecture cible du backend Three natif

- Le backend reçoit des ressources construites depuis le monde métrique et un
  état de présentation compact : pose interpolée du joueur, base et paramètres
  caméra existants, visibilité, thème et données visuelles réellement variables.
  Le `RenderFrame` projeté n'est ni son entrée ni une condition d'acceptation.
- Les géométries statiques sont construites au chargement du port ou à une
  invalidation pertinente, conservées en coordonnées monde et possédées par un
  cycle de vie explicite. Un changement de caméra ne les reconstruit pas et ne
  marque pas leurs attributs pour retransfert.
- La coque du joueur est conservée en coordonnées locales. Sa pose affichée met
  à jour la transformation de l'objet ; seules les données visuelles réellement
  variables peuvent modifier des attributs.
- En fonctionnement natif normal, la boucle évite de construire le monde
  projeté Legacy complet. Les projections nécessaires au Canvas 2D, aux
  overlays et au picking restent autorisées. L'ancien monde WebGL projeté ne
  peut être chargé qu'en reconstruisant l'archive historique isolée.
- Le canevas Three reste composé avec le fond d'eau et le Canvas 2D existants.
  Les ressources GPU ont un propriétaire, des invalidations identifiées et un
  `dispose()` lors du changement de port ou de la destruction du backend.
- Les backends partiels ne sont pas superposés comme s'ils partageaient un
  tampon de profondeur. Le prototype isolé précède l'intégration d'un monde
  natif complet ; l'overlay Canvas 2D conserve son rôle de composition.

### Cartographie vérifiée et documents de cadrage

| Emplacement existant | Constat et usage |
| --- | --- |
| `src/simulateur-port/template.html` : `render`, `prepareInterpolatedFrameMotion`, `cameraBasis` | Boucle, interpolation et suivi existants ; réutilisation sans changement de leur logique (N1/N3/N4) |
| Même source : `installRuntimeTopology`, `addCachedWorldGeometry` | Installation du port et caches de primitives projetées conservés pour le secours Canvas 2D ; le catalogue Three persistant est possédé séparément par le natif |
| `rendering/three-camera.mjs` sous `src/simulateur-port/` | Adaptateur matriciel validé sur les ancres et réutilisé par le natif ; les occlusions visibles sont qualifiées séparément en N5 |
| `rendering/native-infrastructure-resources.mjs`, `nativeInfrastructureDefinition()`, `addBoatMesh()`, `addBuoyGeometry()` et `addHarborLightGeometry()` dans le template | Ajouts N2.1 à N2.3 : catalogue monde par propriétaire, triangulation statique, matériaux partagés, bateaux/bouées/feux figés, remplacement du port et diagnostic de libération |
| `rendering/native-player-resources.mjs`, `nativePlayerDefinition()`, `nativePlayerPresentation()` | Ajout N3 : coque et appendices locaux persistants, groupe transformé par la pose interpolée, matériaux/visibilités variables et unique buffer dynamique des pales |
| `rendering/native-player-model.mjs`, `kjp_sun_odyssey_36i.glb` | Modèle joueur chargé une fois, géométrie partagée, calage uniforme et erreurs asynchrones relayées au secours |
| `rendering/native-world-renderer.mjs` | Renderer de production, scène persistante, adaptation caméra, flux et cycle de vie des ressources |
| `tests/native-rendering.test.js`, autres tests `native-*.test.js`, `tests/simulateur-port.test.js` | Contrats unitaires rapides, intégration/erreurs, fidélité native, progression reproductible et fonctions usuelles séparées selon leur coût |
| `scripts/capture-simulator-native-baseline.js`, `profile-simulator-native-renderer.js` | Références natives et profil apparié version native de référence / candidate |
| `scripts/qualify-simulator-native-activation.js` | Matrice étendue multi-moteurs et formats, sans requête réseau |
| `rendering/index.js`, `scripts/build-simulateur-port.js` | Façade native minimale bundlée localement et HTML autonome |

Les fonctions sans fichier explicite dans les tranches ci-dessous appartiennent
à `src/simulateur-port/template.html`. Le cadrage est porté par quatre fichiers :
ce document (décision, historique, validation et tranches), `AGENTS.md` (routage),
`.codex/skills/kjp-three-render-migration/SKILL.md` (maintenance dédiée) et son
`agents/openai.yaml` (description). L'inventaire détaillé et les commandes de
reproduction sont séparés dans `docs/validation/threejs-migration-closure.md`
afin de ne pas dupliquer les règles.

### Acquis réutilisables

Il n'est pas nécessaire de recommencer les tranches déjà validées :

- Three r186 est épinglé, bundlé localement et vérifié dans le HTML autonome ;
- les scènes déterministes, le contrôle réseau, les trajectoires, les hooks
  `__PORTANCE_TEST__` et les références natives fournissent les protections
  pérennes ; les baselines Legacy restent intactes dans l'archive ;
- `three-camera.mjs` documente et vérifie l'adaptation de la base caméra et ses
  ancres, sans devenir propriétaire du suivi ;
- le tag historique conserve le backend de compatibilité, son compilateur, ses
  comparaisons raster et ses profils pour une investigation reproductible ;
- `installRuntimeTopology()` possède l'installation du monde et invalide
  `staticWorldGeometryCache`; `addCachedWorldGeometry()` et les géométries de
  boîtes/taquets pré-calculées ont guidé les propriétaires et invalidations des
  ressources Three, sans réutiliser leurs sorties projetées ;
- le banc de boucle active rejoue les mêmes timestamps, états et caméras,
  attribue le coût CPU et contrôle les snapshots physiques. Le protocole N5
  mesure le chemin natif complet sans lui imposer l'entrée projetée de
  compatibilité.
- N1 à N4 fournissent le catalogue persistant, le groupe joueur local, la pose
  compacte et la composition visible sans `RenderFrame` natif. N5 et N6 ont
  fourni les protocoles de fidélité, performance et activation ; N7 et C1–C4
  les ont adaptés au produit pérenne sans recommencer ces constructions.

### Instructions externes au dépôt

Le skill global `threejs-game-studio` reste une référence pour les API de la
révision installée, la propriété des ressources et la validation navigateur.
Ses valeurs par défaut génériques concernant la boucle, les matériaux ou
l'éclairage ne remplacent pas le contrat KJP explicite ci-dessus, conformément
à sa propre règle de priorité aux contraintes du projet et de l'utilisateur.
Aucune modification d'un skill global n'est nécessaire pour cette orientation ;
toute évolution de ces instructions externes constituerait une intervention
distincte hors de ce dépôt.

En particulier, la référence globale `threejs-game-studio/references/visual-regression.md`
propose de partir d'une comparaison exacte et de ne tolérer que le bruit de
plateforme. Cette règle ne définit pas la comparaison **Legacy/natif** : la
présente consigne exige une fidélité sans identité pixel. Elle peut servir à la
stabilité d'une référence propre à un backend. De même, les exemples génériques
`Timer`, `setAnimationLoop`, éclairage ou raycasting ne justifient aucune
substitution des propriétaires KJP. Ces écarts d'application sont signalés ici ;
le skill global et ses références restent inchangés.

Référence de version historique : [guide de migration officiel Three.js r185 → r186](https://github.com/mrdoob/three.js/wiki/Migration-Guide#185--186).

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

## Historique des phases de compatibilité

Ce tableau décrit les acquis du chemin Legacy/Three de compatibilité. Ses gates
d'identité raster et géométrique ne sont pas des gates du backend Three natif.

| Phase | État | Gate de sortie |
| --- | --- | --- |
| 0 · audit et choix du renderer | terminé | frontières, risques et WebGLRenderer décidés |
| 1 · baseline Legacy | terminé | 6 scènes reproductibles, diagnostics et réseau contrôlés |
| 2 · build Three autonome | terminé | r186 embarqué, smoke triangle, Legacy actif, 48 tests navigateur verts |
| 3 · extraction de `RenderFrame` | terminé (contrat projeté transitoire) | 3 tests de contrat, 48 tests navigateur, six empreintes Legacy identiques |
| 4 · caméra et projection Three | validé pour les ancres, hors rasterisation | 2 211 ancres dans la tolérance de 0,5 px ; Legacy toujours actif |
| 5 · port, eau et infrastructures | terrain/quais/pontons/catways validés dans le banc isolé ; eau CSS conservée | 76 comparaisons raster exactes avant extension bateaux |
| 6 · bateaux et overlays monde | monde complet et overlays composés ; contact/animation couverts, défaut de coloration Legacy identifié | 338 comparaisons raster + 24 traversées de ±π exactes |
| 7 · optimisation du compilateur projeté | partielle, mesures conservées ci-dessous | gain local mesuré ; coût structurel toujours présent |
| 8 · bascule v2 de compatibilité | remplacée pour le chemin natif | aucune bascule de ce backend projeté n'est planifiée |

Les anciennes phases 7 et 8 sont remplacées, pour Three natif uniquement, par
les tranches N1 à N6 décrites en fin de document. Legacy et Three de
compatibilité restent des références pendant cette qualification.

Historique des décisions remplacées le 11 septembre 2026 : le cadrage initial
visait une première migration strictement iso-rendu, puis des bateaux visuellement
plus riches ; cette extension esthétique est hors du chantier natif actuel.
L'ancienne phase 8 prévoyait « Three par défaut, Legacy retiré après qualification
complète » : elle est remplacée par la qualification native et le maintien des
deux références. La précédente « Prochaine tranche » préconisait de profiler
l'intérieur du compilateur projeté (traits, triangulation, tableaux), après une
attribution de 85–86 % du CPU et un coût dense de 68–70 ms. Ces mesures sont
conservées ci-dessous ; cette priorité est remplacée par N1 pour le natif et
n'impose pas de nouvelle optimisation préalable du compilateur de compatibilité.

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

## Boucle active sur GPU matériel

`npm run profile:renderers:active` exécute le protocole
`active-loop-projected-cpu-v1` dans Chromium avec fenêtre. Le GPU est contrôlé
par les chaînes des **deux contextes réellement utilisés**, corroborées par
`SystemInfo.getInfo` de Chromium. Le banc échoue si aucun GPU matériel n'est
identifié ; `--headless --allow-software` permet un contrôle logiciel explicite,
sans qualification matérielle. `--quick` utilise seulement trois images de
chauffe et six mesures : ses temps ne sont pas exploitables comme résultats.

Le branchement existe uniquement dans l'API `?test`. Une seule soumission par
image remplace temporairement la soumission visible dans l'unique fonction
`render(time)` : Legacy et Three dessinent chacun dans leur canevas détaché.
Le rendu normal reste Legacy, et l'arrêt du diagnostic restitue ce chemin sans
modifier le snapshot physique. Le banc n'ajoute aucune boucle au produit.

Le temps CPU mesuré directement au début et à la fin de `render` comprend les
pas physiques, l'interpolation, la caméra, la visibilité, la construction et
projection du monde, le snapshot projeté immuable, la compilation/soumission
du backend, les overlays Canvas 2D, l'actualisation audio et l'interface. Les
deux backends réutilisent la projection existante ; Three reçoit
`renderProjected`, sans seconde projection. Aucun enregistrement du monde,
readback, `gl.finish`, chronométrage GPU ou observation des uploads n'est inclus.
Les snapshots de contrôle et les captures finales sont collectés hors minuterie.

La matrice couvre La Trinité en mode navigation, thème carte, dessus à 1 200 m et skipper, aux
DPR 1/2, fenêtre 1280 × 800. Chaque case comprend trois paires de séquences,
d'ordre Legacy/Three, Three/Legacy, Legacy/Three, dans des pages neuves du même
navigateur. Chaque séquence comporte 30 images de chauffe puis 120 mesures.
L'état initial est `(200,305)`, cap `0,5084 rad`, vitesse longitudinale `1 m/s`,
gaz cible `0,55`, safran cible `0,12 rad`, vent `8 nd`, courant `0,4 nd`, temps ×1.
Le bateau évolue réellement à chaque séquence. Les callbacks reçoivent la même
suite de timestamps, espacés de `1000/60 ms`, et conservent le pas physique
existant. Le hash de tous les snapshots physiques est comparé, ainsi que celui
des caméras, temps et nombres de primitives de chaque image. Les compteurs de
triangles, appels, triangulations et segments sont vérifiés image par image.
Les captures monde et monde+overlays de fin d'activité doivent être identiques.

Cette mesure qualifie le **coût CPU complet du chemin projeté dans la boucle
active, avec GPU matériel**, et non les FPS du futur Three visible. La composition
navigateur, la fin d'exécution GPU et la synthèse audio restent hors périmètre.
L'audio est coupé pour le banc ; les avertissements attendus de suspension
AudioContext à l'ouverture sont conservés dans le JSON. Les timestamps RAF
natifs sont conservés séparément, mais comprennent les contrôles du pilote entre
les callbacks. Le ratio CPU au-delà de 16,67 ms est un dépassement de budget CPU,
pas un taux d'images perdues. L'extension GPU peut être présente sans que son
temps soit mesuré : `gpuTimeMs` et `gpuMemoryBytes` restent alors `null`.

### Résultats du 11 septembre 2026

Collecte complète réussie avec Chromium 149.0.7827.55, Three r186, Apple M1,
ANGLE Metal et pilote Apple 15.7.7. Les 24 contextes sélectionnés et leurs
contextes homologues déclarent `ANGLE Metal Renderer: Apple M1` ; CDP confirme
le même GPU et WebGL/composition GPU activés. L'extension timer query est
disponible, mais n'a pas été utilisée. Le HTML mesuré porte le SHA-256
`006ee7267444ce867e880640d8fa0247d33fda213c4768fff37c3570c0d86865`.

Les colonnes donnent **p50 / p95 / p99 CPU en ms**, pour 120 échantillons après
30 images de chauffe par backend. Le gain est calculé sur les médianes de la
même paire, sans comparaison avec la précédente session SwiftShader.

| Vue | DPR | Paire | Legacy | Three | Réduction p50 |
| --- | ---: | ---: | --- | --- | ---: |
| Dessus 1 200 m | 1 | 1 | 84,0 / 94,4 / 104,5 | 70,8 / 79,4 / 95,1 | 15,7 % |
| Dessus 1 200 m | 1 | 2 | 85,3 / 94,9 / 118,2 | 70,0 / 80,6 / 90,4 | 17,9 % |
| Dessus 1 200 m | 1 | 3 | 87,7 / 128,1 / 166,1 | 70,3 / 77,6 / 78,7 | 19,8 % |
| Dessus 1 200 m | 2 | 1 | 86,7 / 115,8 / 136,2 | 70,6 / 80,1 / 93,9 | 18,6 % |
| Dessus 1 200 m | 2 | 2 | 83,8 / 92,2 / 117,3 | 70,3 / 80,5 / 90,2 | 16,1 % |
| Dessus 1 200 m | 2 | 3 | 84,8 / 92,7 / 121,2 | 69,8 / 82,0 / 87,7 | 17,7 % |
| Skipper | 1 | 1 | 19,3 / 21,4 / 27,0 | 12,0 / 14,7 / 25,0 | 37,8 % |
| Skipper | 1 | 2 | 19,2 / 21,7 / 26,3 | 12,0 / 14,4 / 25,4 | 37,5 % |
| Skipper | 1 | 3 | 19,2 / 21,8 / 26,3 | 12,0 / 15,8 / 26,3 | 37,5 % |
| Skipper | 2 | 1 | 19,3 / 21,4 / 28,9 | 11,9 / 16,2 / 33,9 | 38,3 % |
| Skipper | 2 | 2 | 19,2 / 22,2 / 25,6 | 12,0 / 16,6 / 32,2 | 37,5 % |
| Skipper | 2 | 3 | 19,4 / 21,9 / 26,3 | 11,9 / 14,7 / 21,4 | 38,7 % |

Le gain médian est reproductible, mais ne garantit pas tous les pics : deux
p99 skipper au DPR 2 restent plus élevés avec Three. Le grand port dense dépasse
16,67 ms sur **100 %** des échantillons des deux backends. En skipper, ce ratio
est de 100 % pour Legacy et 3,3–5,0 % pour Three. Le temps entre le premier et le
dernier début de callback mesuré est de 8,55–11,28 s en vue dense et 2,00–2,42 s
en skipper ; ces durées incluent les contrôles entre callbacks et ne donnent
pas une cadence du produit. La séquence représente 2,4916666666666605 secondes
physiques, soit 299 pas existants à 1/120 s, avec déplacement et changement de cap.

Au total : 2 880 mesures CPU, 1 800 paires d'états/caméras/compteurs identiques,
et 12 paires de captures finales monde + composition identiques (48 PNG).
Le hash de la série de 150 snapshots physiques est identique dans les 24
séquences, y compris entre les vues et DPR :
`c67d19de3f82bc9e405d8d42f820dcaa2f3836368b18fc5422b69a718a98149f`.
La vue dense conserve 8 384 polygones et environ 82 200 triangles GPU, avec
trois appels de dessin. Aucune réallocation après chauffe : zéro par image
côté Legacy, compteur cumulatif Three constant à quatre. Le skipper présente
une triangulation rejetée au début et à la fin dans **les deux** backends ;
cette parité ne constitue pas une correction de géométrie. Aucune erreur
console/page/GL ni requête HTTP ; les seuls avertissements sont ceux du démarrage
audio suspendu. Les captures dessus et skipper ont été inspectées.

Contrôles complémentaires réussis : build et `check:simulator`, 10 tests de
`test:rendering`, 51 tests sélectionnés du simulateur, dont 338 comparaisons
raster strictes, 24 traversées de ±π, 2 211 ancres caméra (écart maximal
`1,32e-8 px`) et trois trajectoires étalons exactes. Les six empreintes de
`capture:renderer-baseline` sont identiques, sans mise à jour des références.
Physique, profils et fixtures gelés inchangés ; `git diff --check` réussi et
graphe AST actualisé (1 021 nœuds, 1 800 arêtes, 54 communautés).

Les données brutes, métadonnées et captures locales sont dans
`/var/folders/5y/sj7vgmys4h98d70vjx_njb480000gn/T/kjp-active-profile-95XuH5/`.
Ce dossier temporaire peut disparaître ; le protocole et les résultats essentiels
sont conservés ici. Cette tranche n'ajoute aucune optimisation du compilateur.

### Correction de l'affichage du banc actif

Le contrôle visuel utilisateur a révélé une erreur d'affichage du banc : pendant
les mesures, `renderBackend` dessinait dans le canevas détaché et ne rafraîchissait
plus `worldScene`, alors que le Canvas 2D des taquets continuait de s'animer.
La fenêtre montrait donc un port figé avec des taquets mobiles. Les comparaisons
précédentes portaient sur les captures hors écran, pas sur cette fenêtre visible ;
elles ne pouvaient pas détecter ce défaut de présentation du diagnostic.

La reproduction sur 60 images skipper confirme que le port visible évolue en
mode normal. Au même instant, son image est strictement identique aux images
hors écran Legacy et Three, et les trois snapshots physiques concordent. Le
problème se situe dans l'affichage du banc, pas dans le suivi caméra ou la
progression du monde calculé.

Le banc couvre désormais toute la scène par un panneau opaque « Mesure de
performance en cours — Le rendu est calculé hors écran ». À l'arrêt, ce panneau
reste présent jusqu'au premier rendu Legacy complet, pour éviter de révéler
une image périmée. Aucun changement du renderer, de la physique ou de la caméra.
Le test ciblé `profilage actif — skipper mobile, scène masquée et reprise sans
image périmée` vérifie le mouvement normal, l'identité des images calculées,
la couverture de la scène, la conservation du snapshot à l'arrêt et le
rafraîchissement visible avant retrait du panneau. Il passe sur les deux
backends. Les chiffres ci-dessus restent ceux de l'artefact antérieur, identifié
par son SHA-256 ; cette correction visuelle ne constitue pas une nouvelle
qualification de performance ou d'animation Three visible.

Validation de cette correction : build et `check:simulator` réussis, test
skipper ciblé réussi sur 60 images pour chacun des trois chemins, smoke
`profile:renderers:active -- --quick` réussi sur les deux vues et DPR 1/2.
Le panneau opaque et le retour à la vue skipper ont été inspectés ; aucune
erreur page. `git diff --check` passe et le graphe AST est actualisé. Aucune
suite physique globale ni collecte longue de performance n'a été relancée.

## Attribution du coût CPU dans la boucle active

La commande `npm run profile:renderers:active -- --owners` lance une passe
distincte `active-loop-owners-cpu-v1` : Three seulement, grand port dense dessus
à 1 200 m, thème carte, DPR 1, trois séquences de 30 images de chauffe puis
120 mesures. `--quick` reste un smoke test. Le panneau de profilage hors écran
reste actif. Les mesures comparatives ordinaires n'activent pas ces horloges.

Cinq phases disjointes couvrent le temps CPU complet : physique, préparation
du monde (interpolation, caméra, visibilité, géométrie et projection), snapshot
projeté immuable, backend, puis overlays/audio/interface. Chaque image vérifie
que leur somme retrouve le temps total. Les trois mesures Three existantes
compilation, staging et soumission sont des **sous-coûts du backend**. Le staging
couvre la copie JavaScript vers Float32 et le marquage des buffers ; les uploads
WebGL ont lieu dans la soumission `renderer.render`. Aucun de ces nombres ne
mesure le temps d'exécution GPU. Les temps d'instrumentation sont inclus dans
cette passe diagnostique, séparée de la comparaison des performances.

Résultats sur Apple M1 / ANGLE Metal, Chromium 149.0.7827.55, avant le candidat
d'optimisation décrit ci-dessous :

| Phase | p50 CPU sur les trois répétitions | Part du CPU total |
| --- | --- | --- |
| Physique et gestion du temps | 1,6 / 1,5 / 1,6 ms | 2,29–2,42 % |
| Préparation monde et projection | 2,6 / 2,4 / 2,4 ms | 3,46–3,99 % |
| Snapshot projeté | 3,3 / 3,4 / 3,4 ms | 4,80–4,97 % |
| Backend Three | 61,6 / 62,8 / 62,4 ms | 88,28–88,87 % |
| Overlays, audio et interface | 0,4 / 0,3 / 0,3 ms | 0,46–0,51 % |

La **compilation seule** prend 59,4 / 60,4 / 60,1 ms en médiane, soit
**85,32–85,93 % du CPU total**. Le staging représente environ 1,63 %, la
soumission CPU environ 1,30–1,32 %. Les médianes de boucle entière sont
70,0 / 70,6 / 70,3 ms. Les parts sont calculées à partir des sommes des
échantillons de chaque phase et du total ; les percentiles ne sont pas additionnés.
Les snapshots physiques, caméras, complexités et captures finales des trois
répétitions sont identiques. Les cinq phases ferment le budget sur les 360
échantillons ; aucune erreur page/GL. Source et mesures brutes dans
`/var/folders/5y/sj7vgmys4h98d70vjx_njb480000gn/T/kjp-active-profile-BCv0Y8/`.

## Réduction des allocations des quadrilatères de traits

Après attribution du coût actif, une seule optimisation est retenue dans
`surface-geometry.mjs` : `appendQuad` conserve ses huit coordonnées écran dans
des scalaires, puis émet directement les 42 nombres des six sommets. Elle
supprime quatre tableaux temporaires par quadrilatère. Les deux profondeurs,
divisions, ordre d'évaluation et ordre `a/b/c/a/c/d` sont conservés, sans cache
inter-frame ni conversion Float32 anticipée. La triangulation, le clipping,
les couleurs, les offsets et le renderer Legacy ne changent pas.

La comparaison des compilateurs avant/candidat dans le même Chromium couvre
huit cadrages La Trinité (dessus, anatomie, skipper, port entier, deux thèmes) :
**7 375 998 nombres identiques avec `Object.is`**, capacités logiques et compteurs
identiques. Le cadrage dense conserve 197 934 appels à `Math.log` : le gain ne
provient pas d'un raccourci numérique. Trois séries appariées AB/BA, chacune
avec 30 chauffes et 120 mesures par compilateur, donnent en ms :

| Série | Avant p50 / p95 / p99 | Candidat p50 / p95 / p99 | Réduction p50 |
| ---: | --- | --- | ---: |
| 1 | 60,2 / 70,5 / 75,0 | 57,1 / 66,6 / 72,1 | 5,1 % |
| 2 | 62,1 / 108,9 / 158,5 | 59,3 / 100,4 / 132,1 | 4,5 % |
| 3 | 61,0 / 82,5 / 118,3 | 57,7 / 73,3 / 101,3 | 5,4 % |

Une seconde comparaison porte sur le **coût CPU de la boucle active entière**,
propriétaires désactivés. Un pilote temporaire réutilise `run` du banc et alterne
les HTML avant/candidat dans le même navigateur matériel, sur la vue dense DPR 1.
Chaque paire rejoue les mêmes 150 images (30 chauffe + 120 mesurées). Une première
série de trois paires a montré un pic p95/p99 défavorable ; seule cette mesure
a donc été répétée, en trois nouvelles paires. Tous les résultats sont conservés :

| Série / paire | Avant p50 / p95 / p99 | Candidat p50 / p95 / p99 | Réduction p50 |
| --- | --- | --- | ---: |
| 1 / 1 | 69,9 / 87,6 / 125,8 | 68,5 / 82,9 / 110,1 | 2,0 % |
| 1 / 2 | 70,3 / 82,7 / 95,0 | 67,7 / 74,7 / 77,7 | 3,7 % |
| 1 / 3 | 70,3 / 79,0 / 88,3 | 69,7 / 120,9 / 143,0 | 0,9 % |
| 2 / 1 | 70,2 / 103,7 / 139,0 | 69,7 / 83,7 / 97,3 | 0,7 % |
| 2 / 2 | 70,7 / 77,3 / 85,9 | 67,8 / 77,0 / 87,5 | 4,1 % |
| 2 / 3 | 70,4 / 78,4 / 88,6 | 67,8 / 81,8 / 85,5 | 3,7 % |

Le bénéfice médian de boucle est donc **modeste, 0,7–4,1 % dans ces six paires**.
Les pics restent variables et parfois moins bons : aucune amélioration
systématique de p95/p99 n'est revendiquée. Tous les échantillons denses restent
au-dessus de 16,67 ms. L'optimisation est conservée pour la réduction d'allocations,
la parité exacte et le petit gain médian retrouvé dans les six paires, sans
prétendre résoudre le coût du grand port ni qualifier une cadence visible.

Les 900 paires d'états/caméras et tous les compteurs renderer sont identiques ;
les captures monde et composition finales aussi. Le SHA-256 des 150 snapshots
physiques reste `c67d19de3f82bc9e405d8d42f820dcaa2f3836368b18fc5422b69a718a98149f`.
Les deux séries ont utilisé les mêmes artefacts : avant
`3d7451ce17c6f5fb9d211285a3ed8d7a997ee2e28ae0b620f2dbff600710398f`, candidat
`68adc876100dd291f32681858adb3f0520431ef4e4a5427f9158b69a5bcc9b74`.
Le compilateur précédent, le HTML précédent, les pilotes ponctuels et les
JSON bruts sont dans `/tmp/kjp-active-optimization-GQ4ZZ8/` ; ce répertoire est
temporaire. Les captures appariées sont dans les dossiers temporaires
`kjp-active-profile-IyTnCT` et `kjp-active-profile-3y8Ptp` du répertoire système.

Validation finale : build et `check:simulator`, 10 tests unitaires de rendu,
trois tests navigateur ciblés (338 comparaisons raster strictes sans différence,
24 traversées de ±π, reprise skipper et identité du chemin instrumenté avec le
chemin normal), puis six références Legacy inchangées. Une capture skipper avec
overlays a été inspectée. Les smoke tests du banc détaillé et du banc habituel
réussissent. Aucun fichier physique ou étalon de trajectoire n'est modifié.
`git diff --check` passe ; graphe AST actualisé après N3 (1 135 nœuds,
1 947 arêtes, 72 communautés). Le renderer Legacy reste actif par défaut. Modifications non
commitées ; aucune qualification de release ou de GPU/composition visible.

## Tranches natives planifiées

Les modules et points d'ancrage ci-dessous ont été livrés dans l'ordre prévu.
Chaque tranche reste réversible par désactivation ou suppression du chemin natif
concerné ; aucune tranche ne réécrit le moteur ni les références
Legacy/compatibilité. Chaque tranche a commencé après réussite des gates de la
précédente.

**Suivi : N1, les trois lots N2.1 à N2.3, N3, N4, N5 et N6 sont validés. Three
natif est actif par défaut depuis N6 ; Legacy reste le repli et une référence
exacte.** À chaque livraison, consigner les résultats
et limites avec son commit ou artefact, les contrôles exécutés et le retour
arrière vérifié. Les règles de validation ci-dessous s'appliquent à chaque
tranche selon son périmètre. Le statut initial « aucune commencée » désignait
la livraison documentaire, avant l'autorisation de code.

### Stratégie de validation commune

- Réutiliser `npm run check:simulator`, `npm run test:rendering` et les tests
  ciblés de `tests/simulateur-port.test.js`. Les six références Legacy se
  contrôlent par `npm run capture:renderer-baseline`, sans `--update`. Les
  comparaisons strictes de compatibilité sont conservées ; aucun résultat
  historique n'est présenté comme une nouvelle exécution.
- Comparer exactement les snapshots physiques, commandes, scénarios, poses
  interpolées et bases caméra à entrées et timestamps identiques. Ne pas
  modifier les pas, l'accumulateur ou le moteur pour stabiliser un test. Lors
  de l'intégration N4/N5, rejouer aussi les trajectoires étalons existantes.
- Les assertions fonctionnelles sont distinctes des seuils visuels : mêmes
  `hitTargets` (identifiants, coordonnées, disponibilité), mêmes sélections et
  mêmes résultats de gestes d'aussières/pendilles aux mêmes instants. Conserver
  `drawMooringLayer()` dans le flux normal, sans second calcul du suivi caméra.
- Les ancres matricielles conservent leur tolérance numérique existante de
  0,5 px ; cela n'impose ni égalité des pixels ni même triangulation native.
  Calibrer les critères de présence, d'occlusion et de lisibilité sur les
  objets/informations à protéger ; un trait fin supprimé doit être détecté.
- Un test d'identité d'attributs entre deux images **natives** protège leur
  persistance. Il n'exige aucune identité entre tableaux natifs et tableaux
  Legacy/compatibilité. Mesurer constructions et uploads dans une passe
  diagnostique séparée des chronométrages de performance.
- N5 compare chaque chemin complet à scène, état, caméra, viewport et DPR
  identiques, avec chauffe et répétitions appariées alternant l'ordre. Inclure
  préparation monde, soumission, overlays et interface ; distinguer CPU, GPU
  et cadence visible, en déclarant ce qui est mesuré. Le banc actif actuel
  dessine hors écran derrière un panneau : ses résultats seuls ne confirment
  pas une performance visible. Les confirmer sur la scène effectivement
  animée, notamment skipper (port et taquets se déplacent de façon cohérente).
- En cas de régression, conserver les références, utiliser le repli Legacy,
  corriger la tranche concernée puis répéter ses contrôles. Aucun test physique
  ou fonctionnel n'est rendu tolérant pour accepter un écart visuel.

### N1 · Protections puis prototype statique persistant isolé

- **Objectif** : écrire d'abord les protections du contrat, puis prouver sur un
  sous-ensemble représentatif que Three conserve une géométrie statique en
  coordonnées monde pendant les mouvements de caméra.
- **Périmètre et points d'ancrage** : `render(time)`, `cameraBasis()`,
  `installRuntimeTopology()`, `addCachedWorldGeometry()`,
  `rendering/three-camera.mjs`, `rendering/index.js`, l'API
  `__PORTANCE_TEST__`, `tests/render-frame.test.js` et
  `tests/simulateur-port.test.js`. Les deux modules isolés N1 sous
  `src/simulateur-port/rendering/` sont `native-static-resources.mjs` pour la
  construction statique et `native-static-prototype.mjs` pour le renderer. Le prototype couvre
  au moins une surface pleine, un contour fin et un trait de largeur écran
  représentative, avec caméra dessus et skipper, y compris à proximité du plan
  de clipping. Il reste hors du canevas actif et consomme directement des
  ressources monde, sans passer par `RenderFrame` ou `renderProjected()`.
- **Invariants protégés** : aucune modification de la physique, du pas, de
  l'interpolation, du suivi caméra, des commandes, du `RenderFrame` de
  compatibilité, du Canvas 2D, du picking ou des références existantes. Un seul
  appel de la boucle existante peut piloter le prototype de test.
- **Tests prévus** : tests de contrat sur la séparation des autorités et le
  cycle de vie ; scénario navigateur déterministe qui initialise les ressources,
  enregistre l'identité des géométries, attributs et tableaux, les versions des
  attributs/buffers et les compteurs de construction, puis déplace et fait
  tourner la caméra, et varie le zoom dans les deux vues. Observer également
  les appels de transfert WebGL (`bufferData`/`bufferSubData`) et les octets
  attribuables aux buffers statiques concernés, après leur premier rendu et
  upload effectifs. Des compteurs de réallocation ou `needsUpdate` seuls ne
  prouvent pas l'absence de retransfert. Vérifier simultanément les ancres caméra, les snapshots
  physiques et l'absence d'erreur console/GL.
- **Critère de sortie** : après initialisation, tout mouvement de caméra testé
  conserve les mêmes géométries et tableaux d'attributs statiques, n'incrémente
  ni construction ni upload de ces attributs et ne pose pas `needsUpdate` sur
  eux. Les mises à jour des matrices d'objets et des paramètres/matrices caméra
  restent permises. Le prototype montre ses surfaces et traits aux positions et
  dimensions attendues dans les captures ciblées.
  Démontrer que la protection échoue lorsqu'une mutation de test force un
  rebuild ou un retransfert statique. Ne pas compter les mises à jour normales
  de matrices, uniforms ou paramètres caméra comme des uploads géométriques.
- **Dépendances** : acquis caméra r186, topologie runtime, scènes et hooks de
  test existants. Les seuils visuels natifs sont fixés dans les tests de
  protection avant d'accepter la capture du prototype.
- **Retour arrière** : retirer les modules et hooks natifs isolés ; Legacy et le
  banc de compatibilité restent inchangés et actifs comme avant la tranche.

### N2 · Cycle de vie des ressources statiques du port

- **Objectif** : étendre le prototype aux propriétaires statiques du monde et
  définir précisément création, partage, visibilité, invalidation et disposal.
- **Périmètre et points d'ancrage** : familles terrain/terre, quais, pontons,
  catways, obstacles, bateaux statiques, bouées et feux ;
  `installRuntimeTopology()`, `installCommunityDocument()`,
  `restoreBuiltInPort()`, `buildHarborRenderIndex()`, les cartes
  `boxRenderGeometryById`, `shoreCleatRenderGeometryById` et
  `staticWorldGeometryCache`. Le propriétaire Three garde ses propres
  ressources monde ; il ne met pas les primitives projetées dans ses buffers.
- **Invariants protégés** : topologie et dimensions KJP inchangées, visibilité
  fonctionnelle conservée, fond d'eau existant, aucune autorité Three sur les
  collisions ou les scénarios.
- **Tests prévus** : chargement/restauration/import répétés, changement de thème
  selon son effet réel sur matériaux ou géométries, culling aux cadrages limites,
  stabilité des identités/capacités après chauffe, libération des ressources à
  l'invalidation et absence de croissance monotone après cycles.
- **Critère de sortie** : chaque famille statique a un propriétaire et une cause
  d'invalidation documentés ; une caméra mobile ne reconstruit aucun buffer
  statique ; un changement de port remplace puis libère exactement les ressources
  concernées ; les scènes de référence ne présentent ni omission ni perte de
  lisibilité.
- **Découpage limité** : livrer successivement N2.1 terrain/infrastructures,
  N2.2 bateaux statiques, puis N2.3 bouées/feux. Chaque lot applique les invariants,
  tests et critères ci-dessus à ses seules familles, dépend du lot précédent
  et peut être désactivé séparément dans le prototype isolé. Ne pas exposer un
  assemblage de backends partiels au rendu actif.
- **Dépendances** : N1 et inventaire des familles déjà couvertes par le banc de
  compatibilité.
- **Retour arrière** : désactiver la construction du catalogue natif et disposer
  ses ressources ; réutiliser sans changement le cache et le renderer Legacy.

### N3 · Joueur local et données visuelles variables

**Statut : livrée et validée dans le prototype isolé ; preuves détaillées dans
[Livraison N3](#livraison-n3--joueur-local-et-données-visuelles-variables).**

- **Objectif** : conserver la coque du joueur en coordonnées locales et ne
  mettre à jour que sa transformation et les données visuelles réellement
  variables.
- **Périmètre et points d'ancrage** : `addBoatMesh()`,
  `prepareInterpolatedFrameMotion()`, `sceneMotion()`, pare-battages, gouvernail,
  halos/états de contact et autres éléments animés. Inventorier aussi
  `addChartGrid()`, `drawFlowParticles()`, `addGoalGeometry()`,
  `addDistantShoreCleatGeometry()` et `addRudderAxis()` pour leur attribuer un
  chemin natif ou une projection d'overlay conservée. Les flux ou marqueurs très
  dynamiques peuvent rester sur un chemin séparé tant que leur propriétaire et
  leur coût sont mesurés, sans reconstruire tout le monde projeté.
- **Invariants protégés** : pose autoritaire, interpolation de x/y/cap y compris
  les traversées de ±π, contacts, profils, dimensions de coque et sémantique des
  couleurs inchangés.
- **Tests prévus** : identité des attributs de coque sur une trajectoire
  contrôlée, comparaison exacte des poses et snapshots, mises à jour de matrices
  à chaque frame, cas de contact et animation, vérification visuelle des trois
  vues et des deux thèmes.
- **Critère de sortie** : le déplacement normal du bateau ne reconstruit ni ne
  retransfère la coque ; seules les ressources déclarées dynamiques changent ;
  mouvement, cap, contacts et informations pédagogiques restent cohérents avec
  les références.
- **Dépendances** : catalogue et instrumentation de N2.
- **Retour arrière** : retirer les objets dynamiques natifs et conserver le
  constructeur/rendu Legacy et la capture de compatibilité.

### N4 · Intégration dans la boucle et composition interactive

- **Objectif** : raccorder le backend natif à l'unique boucle existante derrière
  une sélection de qualification, initialement désactivée jusqu'à N6, puis éviter la
  construction du monde projeté Legacy complet lorsqu'il est sélectionné.
- **Périmètre et points d'ancrage** : `render(time)`, `resizeCanvas()`,
  `drawWater()`, la façade sous `rendering/index.js`, Canvas 2D supérieur,
  `drawMooringLayer()`, `drawUnderstandingOverlay()`, `drawAnatomyLabels()`,
  picking et `hitTargets`. Seules les projections nécessaires à ces overlays,
  interactions et diagnostics sont maintenues.
- **Invariants protégés** : un seul RAF, une seule progression physique, une
  seule interpolation et une seule base caméra ; ordre fonctionnel des overlays,
  interactions et resize/DPR inchangé ; Legacy reste le défaut pendant N4.
- **Tests prévus** : instrumentation qui échoue si le monde projeté complet ou
  `createRenderFrame()` est construit dans le chemin natif normal ; contrôles
  des `hitTargets`, gestes caméra, aussières, pendilles, thèmes, vues, resize et
  reprise ; captures complètes monde + Canvas 2D ; console/page/GL/réseau.
- **Critère de sortie** : le chemin natif visible fonctionne dans la boucle
  existante, sans deuxième horloge ni double progression ; il omet le pipeline
  projeté complet hors besoins explicitement autorisés ; les interactions et
  informations pédagogiques restent disponibles.
- **Dépendances** : N2 et N3.
- **Retour arrière** : supprimer la sélection native ou la forcer inactive ; la
  branche Legacy et le banc Three de compatibilité restent immédiatement
  utilisables.

### N5 · Qualification visuelle, fonctionnelle et de performance

- **Objectif** : qualifier le chemin natif sans convertir l'oracle Legacy en
  exigence d'identité raster.
- **Périmètre et points d'ancrage** : scènes des six baselines, grand port dense,
  vues dessus/anatomie/skipper, thèmes, DPR et overlays ; validateurs natifs
  dans les suites de rendu/simulateur et adaptation des scripts de profil après
  autorisation de cette tranche ; fichiers précis indiqués
  dans la cartographie vérifiée ci-dessus.
- **Invariants protégés** : tests physiques et fonctionnels exacts inchangés ;
  références Legacy et comparaisons Three de compatibilité conservées exactes.
- **Tests prévus** : mêmes entrées et progression temporelle contrôlée pour les
  trois chemins ; inventaire sémantique des familles visibles, ancres et
  dimensions écran bornées, captures avec régions/seuils calibrés pour détecter
  une omission, un déplacement significatif, un texte/trait illisible ou une
  interaction perdue. Une mutation volontaire doit faire échouer chaque seuil.
  Les différences de pixels, de tessellation et de compteurs ne sont pas des
  échecs en elles-mêmes. Effectuer des comparaisons appariées du chemin CPU
  complet sur mêmes scènes/états/caméras après chauffe, puis confirmer en rendu
  visible avec p50/p95/p99, stabilité mémoire, absence de reconstruction/upload
  statique et inspection des captures.
- **Critère de sortie** : zéro divergence physique ou fonctionnelle, zéro
  omission significative et seuils de lisibilité/mutation démontrés ; gain de
  performance reproductible sur le chemin complet et confirmé dans le canevas
  visible, sans imposer au natif l'entrée projetée de compatibilité.
- **Dépendances** : N4 ; environnement navigateur/GPU déclaré pour chaque
  mesure et baseline.
- **Retour arrière** : conserver le natif désactivé et ses résultats comme
  diagnostic ; aucune référence Legacy/compatibilité n'est réécrite.

### N6 · Activation contrôlée

**État : validée le 11 septembre 2026 ; Three natif est le défaut, Legacy reste
disponible et les deux références historiques sont conservées.**

- **Objectif** : décider séparément d'une activation par défaut après les gates,
  sans confondre qualification technique et suppression des références.
- **Périmètre et points d'ancrage** : sélection du backend, démarrage, repli et
  documentation utilisateur ; retrait éventuel différé seulement sur décision
  explicite.
- **Invariants protégés** : HTML hors ligne, physique/fonctions exactes, Canvas
  2D et interactions, repli exploitable.
- **Tests prévus** : matrice navigateur/appareil déclarée, démarrage propre,
  reprise, resize, import de port, stabilité longue et contrôle du repli.
- **Critère de sortie** : toutes les preuves de N5 sont archivées, le natif est
  stable dans le rendu visible et le retour à Legacy reste opérant. Legacy et le
  backend de compatibilité demeurent des références tant qu'une décision
  ultérieure ne fixe pas leur retrait.
- **Dépendances** : N5 et décision explicite d'activer le défaut.
- **Retour arrière** : remettre Legacy par défaut par la sélection prévue, sans
  migration de données ni modification du moteur.

Le défaut Legacy de coloration des contacts décrit dans le journal reste un
défaut connu de la référence. Le reproduire dans Three de compatibilité satisfait
son contrat historique. La règle initiale qui interdisait au natif de s'en
écarter sans tranche distincte est désormais satisfaite par N3 : son état de
présentation associe explicitement les identifiants physiques existants aux six
propriétaires visuels de pare-battages. Cette divergence visuelle est limitée au
backend natif ; elle ne modifie ni le moteur, ni les contacts calculés, ni Legacy,
ni ses références. N1 à N5 ont construit et qualifié le chemin natif ; la
livraison N6 ci-dessous termine l'activation prévue par ce plan. Tout retrait
ultérieur de Legacy ou du backend de compatibilité exige une décision distincte.

## Livraison N1 — 11 septembre 2026

**N1 validée dans son périmètre de prototype isolé : tous ses critères de sortie
testés ci-dessous sont satisfaits.** Travail non
commité sur `codex/threejs-v2`, depuis HEAD
`24100376c9bfadfbb0a9caa18dc630487d2c101f`, sans changement de branche.
Le diff initial se limitait aux quatre fichiers de cadrage cités plus haut :
leurs modifications sont conservées. Seul ce journal reçoit un complément
N1 ; `AGENTS.md`, le skill dédié et son `agents/openai.yaml` ne sont pas
modifiés par cette tranche. Les skills globaux restent inchangés.

### Réalisation et frontières

- `native-static-resources.mjs` construit une seule fois un quadrilatère plan
  convexe en coordonnées monde, son contour de 0,7 px CSS et un segment de
  3 px CSS. Les entrées sont copiées, les attributs conservés, les matériaux
  simples et sans éclairage. Les traits utilisent les addons locaux r186
  `LineSegments2`/`LineSegmentsGeometry`/`LineMaterial` avec `worldUnits: false`.
  Leur largeur ne multiplie pas le DPR : la résolution du matériau suit le
  viewport logique fourni par Three.
- `native-static-prototype.mjs` possède le renderer, les ressources et leur
  libération idempotente. Il reçoit uniquement la définition monde puis le
  `CameraSnapshot` existant et le DPR. Il réutilise `createThreeCamera()` sans
  ajouter de contrôleur ni de boucle. Son canvas transparent est détaché du DOM.
  `preserveDrawingBuffer` sert aux captures diagnostiques ; ce prototype ne
  constitue pas un candidat de performance du chemin complet.
- `rendering/index.js` expose la fabrique native. Dans `template.html`, les
  hooks `enableNativeStaticPrototype`, `nativeStaticPrototypeReport`,
  `mutateNativeStaticPrototype` et `disposeNativeStaticPrototype` sont limités
  à l'API `__PORTANCE_TEST__` activée par `?test`. Sans activation explicite,
  aucune ressource ni aucun renderer natif n'est construit. L'activation sans
  argument copie une face et une arête réelles du cache monde du port ; le banc
  peut aussi fournir une définition métrique synthétique contrôlée.
- Le seul raccord de dessin est à la fin du rendu existant, après les overlays,
  avec `frameBasis` déjà calculée. Aucun `RenderFrame`, `SurfaceFrame` ou
  `renderProjected()` n'alimente le prototype. Le rendu Legacy normal reste
  complet et actif : son évitement concerne le futur chemin intégré de N4,
  pas ce banc isolé. `installRuntimeTopology()` dispose le prototype lors d'un
  remplacement du port ; sa recréation automatique et le catalogue multi-familles
  sont réservés à N2.
- Les ajouts à `tests/render-frame.test.js` et `tests/simulateur-port.test.js`
  protègent ce contrat. Aucun test existant, référence raster/physique,
  dépendance ou script n'est réécrit. `simulateur-port.html` est régénéré par
  le build existant. SHA-256 de l'artefact N1 :
  `3e739e3416941130077cb692778b824a176a24ead9b0d6dde0e7bee9e10490db`.

### Preuves observées

Les protections de contrat et le premier scénario navigateur ont d'abord
échoué avec le module et le hook natifs absents, avant leur implémentation.
Les seuils de présence et de largeur ont été fixés pour le fixture métrique
avant son acceptation ; la revue a ajouté les contrôles analytiques du centre,
de la hauteur et du bornage des traits clippés.

Le scénario de persistance utilise les mêmes entrées et timestamps (pas de
présentation de 1/60 s injecté par le pilote de test) dans deux pages, prototype
absent puis activé. Il laisse inchangés le pas physique, l'accumulateur et le
moteur. Pour les vues dessus/skipper et DPR 1/2 :

- les premiers `bufferData`/`bufferSubData` natifs transfèrent effectivement
  des octets ; après ce premier rendu, les 30 frames de suivi par configuration
  et chaque geste effectif de pan, rotation, zoom et resize ajoutent **zéro
  construction et zéro appel/octet de transfert géométrique** ;
- géométries, attributs, buffers interleavés et tableaux gardent leurs identités,
  versions et empreintes ; matrices/uniforms caméra ne sont pas comptés comme
  attributs géométriques. L'instrumentation intercepte les véritables appels
  WebGL2 du canvas natif, sans déduire les uploads de `needsUpdate` seul ;
- une seule callback de la boucle reste en attente. Les 120 paires de snapshots
  (30 × 2 vues × 2 DPR), commandes/scénarios inclus, poses interpolées, bases et
  réglages caméra, `hitTargets` et images du monde/overlay actifs sont exactes.
  La base de suivi se déplace effectivement ; chaque geste est vérifié avant
  le suivant et le snapshot caméra natif correspond à celui de la frame ;
- forcer séparément un retransfert puis une reconstruction fait échouer la
  protection sur une référence fraîche pour chaque mutation : `bufferSubData`
  et octets supplémentaires dans le premier cas ; nouvelle géométrie et
  `bufferData` supplémentaire dans le second. Aucun écart n'est accepté au
  prétexte du contrat visuel natif ;
- la double désactivation conserve le snapshot physique ; la recréation depuis
  une face réelle et la désactivation au remplacement du port fonctionnent.
  Le test unitaire observe six libérations uniques (trois géométries et trois
  matériaux), même après deux appels de disposal.

Le scénario visuel vérifie la présence des trois familles, la largeur et la
hauteur projetées du quad de 8 × 4 m (tolérance 4 px CSS), son centre (2 px CSS),
le trait de 3 px CSS (±1,5 px), aux deux vues et DPR. Masquer séparément surface,
contour ou segment échoue. Une surface, son contour et un trait traversant le
plan proche restent visibles ; un segment traversant le plan de l'œil reste
borné et fin (hauteur ≤6 px CSS, centre vertical à moins de 2 px). Les objets
entièrement derrière la caméra sont rejetés. Aucune égalité raster ou de
triangulation avec Legacy n'est imposée. Les échantillons contrôlés ne signalent
aucune erreur GL, console ou page ; le scénario apparié n'émet aucune requête
HTTP(S).

### Vérifications de cette livraison

| Contrôle exécuté | Résultat réellement observé |
| --- | --- |
| `npm run build:simulator`, puis `npm run check:simulator` | Réussis ; HTML autonome cohérent avec ses sources et la topologie intégrée |
| `npm run test:rendering` | 11 tests réussis, dont la nouvelle protection unitaire N1 |
| `node --test --test-name-pattern='Three natif N1' tests/render-frame.test.js tests/simulateur-port.test.js` | 3 tests réussis, 0 échec ; persistance, mutations, cycle de vie et gates visuelles ci-dessus |
| `node --test --test-name-pattern='^(profilage actif\|terrain Three\|monde Three\|caméra Three)' tests/simulateur-port.test.js` | 4 tests existants réussis ; 338 comparaisons raster strictes, 0 pixel différent ; 24 traversées de ±π ; reprise skipper ; 2 211 ancres, écart maximal 2,7827 × 10⁻⁸ px (seuil 0,5 px) |
| `npm run capture:renderer-baseline` sans `--update` | Réussi : 6/6 empreintes Legacy identiques, références du dépôt inchangées |
| Inspection ciblée des captures | Dessus DPR1 et skipper DPR2 : surface, contour et trait présents et cohérents avec le fixture ; pas de qualification du monde complet |
| Contrôle de périmètre et `git diff --check` | Réussis ; seules additions aux sources/hooks/tests de rendu. `cameraBasis`, `prepareInterpolatedFrameMotion`, `drawMooringLayer` et `testSnapshot` comparés textuellement à HEAD : identiques. Aucun diff dans physique, fixtures, références, dépendances ou scripts |
| `graphify update .` | Mise à jour AST réussie : 1 050 nœuds, 1 843 arêtes, 54 communautés. Cinq noms de communautés ajustés automatiquement ; pas de réétiquetage sémantique/LLM |

L'essai de lancement Chromium dans le sandbox a échoué sur
`mach_port_rendezvous: Permission denied`, avant exécution du rendu. La même
commande autorisée hors sandbox a ensuite réussi ; ce n'était pas un défaut du
renderer. Les échecs de mutation attendus sont interceptés par les tests et ne
sont pas des échecs de la suite. Aucun échec de test exécuté ne reste non résolu.

Captures N1 de la dernière passe :
`/var/folders/5y/sj7vgmys4h98d70vjx_njb480000gn/T/kjp-native-n1-uy6WkL/`
(`top-dpr1.png`, `top-dpr2.png`, `skipper-dpr1.png`, `skipper-dpr2.png`).
Les captures de compatibilité sont dans `kjp-surface-comparison-4vbmpF/` sous
le même répertoire temporaire système ; les six captures Legacy candidates
sont dans `kjp-render-candidate-voLMNp/`. Ces artefacts sont temporaires ; les
tests permettent de les reproduire sans réécrire les références du dépôt.

### Limites, retour arrière et suite

Tests exécutés sous Chromium headless sur cette machine, pas de qualification
multi-navigateur/appareil ni de mesures GPU ou de cadence visible. Aucune suite
physique globale, trajectoire étalon ou release complète n'est rejouée ici : les
comparaisons exactes N1 et les validations existantes ciblées ci-dessus couvrent
le risque de cette tranche isolée. Les trajectoires restent intactes et leur
rejeu d'intégration reste prévu en N4/N5. Les gestes d'aussières/pendilles avec
un renderer natif visible relèvent de N4 ; N1 protège leurs snapshots et
`hitTargets` ainsi que le Canvas actif inchangé.

Le prototype couvre un quad convexe plan et des traits pleins, sans catalogue
port, coque mobile, styles pointillés, profondeur à l'échelle d'un port complet
ou synchronisation des thèmes. Leur qualification reste dans N2–N4 ; aucun gain
de performance n'est revendiqué. Le fond d'eau et la présentation produit
restent ceux de Legacy.

Retour arrière opérationnel vérifié par désactivation, double disposal,
réactivation et invalidation du port ; Legacy reste utilisable à chaque étape.
Un retrait du prototype consisterait uniquement à retirer les deux modules,
leur façade et les hooks/bloc de dessin N1 puis à rebâtir le HTML. Aucun retrait
de code ni reset n'a été effectué pour simuler ce retour arrière.

Suite prévue à la livraison N1 : **N2, lot terrain/infrastructures**, avec propriétaires des
ressources, invalidations et libération répétée documentés/testés selon le plan
ci-dessus. Ce lot a depuis été engagé comme N2.1, voir le bilan suivant.
Ne pas activer le renderer natif par défaut.

## Livraison N2.1 — terrain et infrastructures

**N2.1 validée dans son périmètre isolé.** Tous les critères de sortie de ce lot
ont été vérifiés selon le bilan ci-dessous ; aucun échec exécuté ne reste non
résolu. Cette livraison ne valide pas les lots suivants ni l'intégration visible.

Reprise dans `/Users/arnaud/Codex_main/KJP_Port_Simulator`, sur
`codex/threejs-v2`, HEAD `ae033d4d1093e16cbb2436ecf3106c0ee08202fb`
(`refactor_v2:N1`). L'arbre était propre : N1 et son cadrage étaient commités.
Le checkpoint Codex `20260911-163728-threejs-active-loop-profiling.md` reste un
historique antérieur à l'orientation native ; sa prochaine étape sur le
compilateur de compatibilité est remplacée par le présent plan. Aucun changement
de branche, reset, nettoyage, dépendance ou référence existante dans N2.1.

### Périmètre réalisé et propriétaires

| Famille | Ressource monde réutilisée | Propriété et visibilité natives |
| --- | --- | --- |
| Terrain | `harborTerrain.polygons[].points` | Propriétaire `terrain:id/index`, remplissage concave et contour |
| Quais, pontons, brise-lames, attente | `boxRenderGeometryById` via `addBox` | Propriétaire `dock:id`, dessus/côtés/arêtes et palette selon le type |
| Catways et raccords | `addBox` et `addCatwayConnector` | Propriétaire `catway:id`, faces cachées, ouvertures, recouvrement visuel et raccords flush/hinge/ramp conservés |
| Obstacles linéaires | `addExtrudedPolyline` | Propriétaire `obstacle:id`, mitres, dessus, côtés et extrémités |
| Terres importées | `landAreas`, z monde 0,025 m existant | Propriétaire `land:id`, polygone concave et contour 1 px CSS |

`nativeInfrastructureDefinition()` collecte ces seuls constructeurs monde sous
`worldGeometryCapture`, restauré dans un `finally`. Les primitives sortent avant
projection ; aucun appel au monde projeté complet, à `addHarborGeometry()` ou au
suivi caméra n'est nécessaire pour cette collecte. Elle est exécutée à activation
explicite et au remplacement du port, jamais par mouvement caméra. Les hooks de
rapport peuvent la relire explicitement à des fins de diagnostic ; ils retournent
des copies et ne font pas partie du chemin mesuré.

Le module `native-infrastructure-resources.mjs` possède les attributs, géométries
et matériaux. Il regroupe les primitives par propriétaire/style et partage les
matériaux par rôle de palette, type et largeur. La triangulation utilise le plan
dominant du polygone monde et `ShapeUtils.triangulateShape` r186, vérifié dans le
runtime installé et la [documentation officielle](https://threejs.org/docs/pages/ShapeUtils.html).
Elle ne reprend pas la triangulation écran Legacy. Les positions KJP restent
inchangées ; les petites priorités des raccords sont un ordre de rendu, pas une
translation du monde.

Invalidation : un changement de port construit le nouveau catalogue puis libère
l'ancien, dans le renderer détaché existant. Les géométries ne sont pas partagées
entre ports. Dark/chart modifient uniquement couleurs et opacités des matériaux,
sans nouveau catalogue, attribut ou upload géométrique. Le mode anatomie ne
modifie aucune géométrie de ce lot. La désactivation libère aussi le renderer et
son contexte ; elle reste idempotente. Une erreur de construction à l'import
désactive le banc et conserve son message dans le rapport, tout en laissant
l'installation autoritaire du port et Legacy se poursuivre.

Visibilité : le premier rendu soumet tous les attributs statiques, même hors
champ ; ensuite les faces utilisent les bounds calculés sur leurs vrais sommets,
y compris rampes et mitres. Les traits de largeur écran restent soumis au
clipping GPU sans culling CPU par sphère, qui pourrait couper leur bord. Aucun
filtre radial Legacy ni second calcul caméra n'est ajouté. Ce choix conservateur
peut soumettre davantage d'objets que Legacy ; il ne revendique pas un gain de
performance. Les hooks d'isolation par famille/style n'agissent que sur `.visible`
dans le prototype de test.

Le prototype N1 reste disponible séparément. Son renderer et son adaptateur caméra
sont réutilisés ; seuls le remplacement de ressources, les métriques de catalogue
et la mise à jour des matériaux sont ajoutés. Le `RenderFrame` de compatibilité,
le Canvas 2D, les commandes, le picking, l'eau et les constructeurs physiques
restent inchangés. À la clôture de N2.1, N2.2/N2.3, le joueur natif et
l'intégration visible n'étaient pas implémentés. N2.2 et N2.3 sont depuis
livrées dans les sections suivantes ; le chemin natif demeure désactivé par
défaut.

### Défauts trouvés et corrections dans le lot

Le test unitaire initial a échoué avant création du module N2, puis est passé.
Le premier contrôle navigateur échouait sur des avertissements autoplay audio et
`GPU stall due to ReadPixels` également observés sans natif. Ces deux catégories
précises sont maintenant consignées séparément ; toute autre alerte, erreur
console/page ou requête HTTP(S) fait toujours échouer le contrôle.

La revue a ajouté une gate par famille/style à la silhouette globale : cette
dernière seule ne détectait pas tous les contours manquants. La gate renforcée a
révélé deux défauts du candidat, corrigés sans diminuer ses seuils :

- contours translucides trop faibles avec `alphaToCoverage` et blending cumulés ;
  désactivation d'alpha-to-coverage pour ces matériaux N2, MSAA conservé ;
- coupures des très longues arêtes de terre à un cadrage limite du ruban écran
  Three ; subdivision collinéaire en segments d'au plus 16 m lors de la seule
  construction monde. Les points restent sur l'arête, la largeur reste en pixels
  CSS et aucune subdivision n'est déclenchée par la caméra.

La protection de rollback couvre une erreur après allocations partielles en
unité. La panne injectée dans le navigateur se produit avant la nouvelle
construction : elle vérifie séparément que l'import, le snapshot, la caméra et
les images Legacy sont exactement ceux de l'import sans prototype.

### Vérifications N2.1

| Commande / contrôle | Résultat de cette livraison |
| --- | --- |
| `npm run build:simulator`, `npm run check:simulator` | Réussis ; HTML autonome régénéré par le build existant |
| `npm run test:rendering` | 12 tests réussis, dont catalogue concave/vertical, palette/alpha, copie source, disposal et rollback partiel |
| `node --test --test-name-pattern='Three natif' tests/render-frame.test.js tests/simulateur-port.test.js` | 7 tests réussis : 2 unités N1/N2 et 5 tests navigateur N1/N2. Les tests N2 sont reliés à `test:e2e` et aux validations usuelles par le `require` dans la suite existante |
| N2.1 : état et transferts | 20 frames skipper appariées aux mêmes entrées/timestamps : snapshots physiques/commandes/scénarios, pose, caméra, hitTargets et images actives exacts. Un seul RAF ; après soumission initiale complète, zéro construction et zéro appel/octet géométrique supplémentaire sur suivi, pan, rotation, zoom, changement de vue, thème et resize testés |
| N2.1 : cycles de vie | 3 imports du grand port et 3 restaurations : chaque ancien catalogue libéré, nouvelles identités, aucune croissance des ressources vivantes ; import invalide sans changement natif ; double disposal sans buffers restants ; panne native injectée sans incidence sur l'import/Legacy, réactivation réussie |
| N2.1 : fidélité globale | 24 cas (2 ports × 2 thèmes × 3 vues × DPR 1/2), occupation de silhouette réduite 64×48 : présence, rappel ≥95 %, débordement borné ; aucune exigence pixel exacte |
| N2.1 : détail par famille | 20 cas (5 familles × 2 thèmes × remplissage/traits), masque 256×192 avec voisinage d'un échantillon : rappel observé 100 % (seuil 90 %), écart maximal des moyennes RGB pondérées par alpha 0,407/255 (seuil 25). Les 20 omissions réelles forcées font échouer la gate |
| `node --test --test-name-pattern='^(profilage actif\|terrain Three\|monde Three\|caméra Three)' tests/simulateur-port.test.js` | 4 tests existants réussis : 338 comparaisons raster strictes, 0 pixel différent ; 24 traversées de ±π ; reprise skipper ; 2 211 ancres caméra, écart maximal 2,7731 × 10⁻⁸ px (seuil 0,5 px) |
| `npm run capture:renderer-baseline` sans `--update` | 6/6 empreintes Legacy identiques, références inchangées |
| Inspection des captures | Dessus clair pédagogique, skipper clair grand port et contour de terre corrigé inspectés : infrastructures et contours présents, sans composition native active |
| `git diff --check` et périmètre | Réussis. Fonctions `prepareInterpolatedFrameMotion`, `cameraBasis`, `drawMooringLayer`, `testSnapshot`, `buildBoxRenderGeometry`, `addCatwayConnector`, `addExtrudedPolyline`, `addHarborGeometry` identiques à HEAD. Aucun diff physique/profils/trajectoires/références, dépendance, script ou adaptateur caméra |
| `graphify update .` | Réussi, AST : 1 083 nœuds, 1 885 arêtes, 55 communautés ; pas de réétiquetage LLM |

Ressources natives vivantes après chaque retour au même port, après chauffe :

| Port | Géométries | Matériaux partagés | Buffers GL suivis |
| --- | ---: | ---: | ---: |
| Pédagogique | 145 | 12 | 376 |
| La Trinité importée | 1 834 | 11 | 4 606 |

Ces compteurs comparent le natif à lui-même pendant ses cycles de vie, jamais
au nombre de triangles ou de buffers Legacy. La persistance inclut les attributs
interleavés des traits, leurs versions et leurs octets réellement transférés.
Les matrices et uniforms ne sont pas des transferts géométriques.

Fichiers du lot : nouveau `rendering/native-infrastructure-resources.mjs` ;
adaptations de `rendering/native-static-prototype.mjs`, `rendering/index.js` et
`template.html` sous `src/simulateur-port/` ; nouveau
`tests/native-infrastructure.test.js`, compléments à `tests/render-frame.test.js`
et `tests/simulateur-port.test.js` ; `simulateur-port.html` généré et présent
journal. Aucun fichier d'instructions ou skill global modifié. Les fichiers
N1 préexistants sont réutilisés, pas recommencés.

SHA-256 du HTML vérifié :
`05a5f3ce7703d2e2efbd7e6c08cf853b4f3c91cdf22614ee50f154a8d411ea3f`.
Dernières captures temporaires sous
`/var/folders/5y/sj7vgmys4h98d70vjx_njb480000gn/T/` :
`kjp-native-n2-9GBZhU/` (cadrages), `kjp-native-n2-details-OURMKT/`
(familles/styles), `kjp-native-n1-ZgmKtU/` (régression N1),
`kjp-surface-comparison-yaPFad/` (compatibilité),
`kjp-render-candidate-oqPXXc/` (Legacy). Les tests reproduisent ces captures ;
leur répertoire temporaire n'est pas une archive permanente.

### Limites, retour arrière et prochaine tranche

Les tests sont exécutés sous Chromium headless sur cette machine. Aucun gain de
performance, budget GPU ou cadence de composition visible n'est qualifié ; le
catalogue conserve volontairement une granularité par propriétaire. Les suites
physiques globales, trajectoires étalons, release complète, autres navigateurs et
appareils ne sont pas rejoués. Les vérifications physiques exactes de cette
tranche portent sur les scénarios appariés indiqués, sans affaiblir les suites
ou références existantes. Les gestes d'aussières/pendilles dans un natif visible
restent à qualifier en N4.

Retour arrière testé : désactivation et double disposal, puis réactivation du
prototype ; repli automatique après échec de construction. Legacy continue de
dessiner tout le monde et les overlays. Le retrait éventuel du seul branchement
N2.1 et de son module conserve le prototype N1. Aucun retrait/reset n'a été
effectué pour cette vérification.

À la clôture de N2.1, le prochain lot prévu était **N2.2, bateaux statiques**,
avec propriété et libération des ressources, visibilité et palette selon les
gates N2. Ce lot est maintenant livré ci-dessous. À ce stade historique, N2.3
bouées/feux restait à faire et N2 n'était donc pas complète ; N2.3 est depuis
livrée après N2.2. Legacy reste le renderer par défaut.

## Livraison N2.2 — bateaux statiques

**N2.2 validée dans son périmètre isolé.** Les bateaux statiques du port ont
maintenant des ressources Three monde persistantes dans le catalogue N2. Les
critères de propriété, pose, palette, visibilité, absence de retransfert après
chauffe, remplacement de port et retour arrière ont été vérifiés. Cette
livraison ne couvre ni le bateau joueur, ni les bouées/feux N2.3, ni
l'intégration du renderer natif dans le canevas actif.

Reprise dans `/Users/arnaud/Codex_main/KJP_Port_Simulator`, sur
`codex/threejs-v2`, HEAD
`b733c0d80943c722e4f19cadd0deb51b08d980e3` (`refactor_v2:N2.1`). L'arbre était
propre. Le checkpoint repo-local disponible décrivait un état antérieur à N1 ;
le présent plan et les commits N1/N2.1 constituent l'état de reprise effectif.
Aucun changement de branche, reset ou suppression de travail préexistant.

### Périmètre réalisé et cycle de vie

`nativeInfrastructureDefinition()` crée un propriétaire `boat:<id>` par entrée
de `staticBoats` au moment de l'activation explicite du prototype ou du
remplacement de la topologie. Il appelle le constructeur monde existant
`addBoatMesh(boat, false)` avant toute projection. La pose x/y/cap, la longueur
et le maître-bau installés par la topologie sont donc figés dans les attributs
monde du catalogue ; une caméra mobile ne relit ni ne transforme la topologie.
Chaque coque actuelle produit neuf faces latérales, un pont, leurs contours et
un mât pour les voiliers. Le joueur et ses pare-battages, contacts, anatomie et
animation restent exclus.

`addBoatMesh()` accepte désormais une palette de présentation optionnelle, avec
la palette habituelle comme valeur par défaut. Le chemin Legacy continue donc
d'utiliser exactement ses couleurs actuelles. Le collecteur natif lui fournit
des rôles `boat.*` ; dark/chart modifient seulement les matériaux partagés, sans
reconstruire ni marquer les attributs géométriques. Le module générique N2.1
`native-infrastructure-resources.mjs` est réutilisé sans modification : il reste
propriétaire des géométries, matériaux, bounds, diagnostics et `dispose()`.

Le changement de port reconstruit le catalogue complet depuis la nouvelle
topologie, installe le nouveau groupe, puis libère une fois toutes les anciennes
ressources. La désactivation et le double `dispose()` libèrent le catalogue et
le contexte. L'option de test
`enableNativeInfrastructurePrototype({staticBoats:false})` fournit un repli
indépendant N2.2 vers le seul catalogue N2.1 ; sa réactivation reconstruit les
bateaux. Ce contrôle reste limité au banc `?test` détaché et ne crée aucun choix
de backend partiel dans le produit.

Le banc de comparaison distingue maintenant `{staticBoats:true}` de l'option
historique `{boats:true}`. Le nouveau périmètre inclut terrain,
infrastructures et bateaux statiques, mais exclut le joueur réservé à N3. La
sémantique et les tests existants de `{boats:true}` restent inchangés. Cette
séparation a corrigé la première exécution N2.2, qui comparait par erreur un
candidat sans joueur à un oracle qui l'incluait.

### Protections et résultats N2.2

Les protections ont été modifiées avant le code. Elles ont d'abord échoué comme
attendu : famille `boat` absente du catalogue, couverture globale insuffisante
et aucune ressource `boat` isolable. Après implémentation, les résultats sont :

| Commande / contrôle | Résultat de cette livraison |
| --- | --- |
| `npm run build:simulator`, `npm run check:simulator` | Réussis ; HTML autonome régénéré et cohérent avec les sources |
| `npm run test:rendering` | 12/12 tests réussis ; contrats N1/N2 de géométrie, palette, copie, rollback et disposal inchangés |
| `node --test --test-name-pattern='Three natif' tests/render-frame.test.js tests/simulateur-port.test.js` | 7/7 tests réussis : unités N1/N2, deux contrôles N1 et trois contrôles N2.2 reliés à la suite habituelle |
| Catalogue et persistance | 18 propriétaires bateau dans le port pédagogique et 463 dans le port importé. Sur mouvement skipper, pan, rotation, zoom, trois vues, thème et resize : mêmes identités/attributs/versions, zéro allocation, libération ou appel/octet `bufferData`/`bufferSubData` supplémentaire après chauffe |
| Cycles de vie et repli | 3 imports et 3 restaurations sans croissance ; anciennes géométries et matériaux libérés exactement. Repli N2.2 séparé, réactivation, import invalide, panne injectée, désactivation et double disposal réussis ; Legacy et les snapshots appariés restent exacts |
| Fidélité globale native | 24 cadrages (2 ports × 2 thèmes × 3 vues × DPR 1/2) : scène présente, rappel d'occupation ≥95 %, débordement borné, sans égalité pixel exigée |
| Détail par famille/style | 28 contrôles, dont 8 propres aux bateaux (2 ports × 2 thèmes × remplissage/traits) : rappel 100 % au seuil 90 %, erreur couleur maximale observée 3,210/255 au seuil 25. Chacune des 28 omissions forcées fait échouer la gate |
| Compatibilité stricte existante | 4/4 tests réussis : 338 comparaisons raster, 0 pixel différent ; 24 traversées de ±π ; 2 211 ancres caméra, écart maximal 2,779 × 10⁻⁸ px au seuil 0,5 px |
| `npm run capture:renderer-baseline` sans `--update` | 6/6 empreintes Legacy identiques ; aucune référence réécrite |
| Inspection visuelle ciblée | Couples natif/Legacy inspectés en skipper nuit pédagogique et dessus carte du port importé : pontons et bateaux cohérents ; coques, contours et mâts présents dans le cadrage qui les expose |
| `graphify update .` | Réussi sans appel LLM : graphe AST actualisé à 1 092 nœuds, 1 894 arêtes et 63 communautés |

SHA-256 du HTML autonome régénéré :
`784be087a3860399dc55d7685d7c267290a8d46d3b8dd2ef091f7d2346a06ef3`.

Ressources natives vivantes après chauffe et retour au même port :

| Port | Géométries | Matériaux partagés | Buffers GL suivis |
| --- | ---: | ---: | ---: |
| Pédagogique, dont 18 bateaux | 253 | 18 | 700 |
| La Trinité importée, dont 463 bateaux | 4 612 | 17 | 12 940 |

Chaque bateau actuel ajoute six lots géométriques par propriétaire, soit 108
géométries dans le port pédagogique et 2 778 dans le port importé. Ces compteurs
servent uniquement à vérifier l'absence de croissance et la libération du même
backend ; ils ne constituent pas une exigence de parité avec Legacy ni une
preuve de performance. La granularité par bateau est volontaire pour ce lot et
pourra être mesurée, sans modifier sa fidélité, lors de N5.

Fichiers du lot : adaptations de `src/simulateur-port/template.html`, des
protections `tests/native-infrastructure.test.js`, du livrable généré
`simulateur-port.html` et du présent journal. Aucun moteur, profil, collision,
pas de temps, interpolation, commande, trajectoire, référence Legacy,
dépendance, script, adaptateur caméra, skill ou instruction globale n'est
modifié. Le renderer Legacy reste actif par défaut ; le prototype natif reste
détaché, sans deuxième RAF ni horloge.

### Limites, retour arrière et prochaine tranche

Les contrôles navigateur ont été exécutés avec Chromium headless sur cette
machine. Les avertissements autoplay et synchronisation GPU `ReadPixels`, déjà
présents sans le prototype, ont été consignés séparément ; aucune autre erreur
console/page, requête HTTP(S) ou erreur GL n'a été observée. Les suites physiques
globales, les trajectoires étalons complètes, la qualification release, les
autres navigateurs/appareils et une mesure de performance en rendu visible
n'ont pas été exécutés, car N2.2 ne modifie ni la physique ni le renderer actif
et ne revendique aucun gain de performance.

Retour arrière vérifié : omettre les propriétaires bateau par l'option de banc
N2.2 libère leurs ressources et conserve N2.1 ; la réactivation restaure une
nouvelle identité de catalogue. La désactivation complète rend le banc inactif
et laisse zéro buffer GL suivi. Retirer ultérieurement la boucle `boat` et ses
rôles de palette restituerait le catalogue N2.1 sans toucher à Legacy.

À la clôture de N2.2, le prochain lot prévu était **N2.3, bouées et feux**, avec
propriétaires, apparences, visibilité, thèmes, invalidation et disposal selon
les mêmes gates N2. Ce lot est maintenant livré ci-dessous. Le joueur local N3
et l'intégration visible N4 restent différés. Ne pas activer le renderer natif
par défaut.

## Livraison N2.3 — bouées et feux

**N2.3 validée dans son périmètre isolé ; la tranche N2 est complète.** Les
bouées et feux statiques ont maintenant des propriétaires Three monde
persistants, avec invalidation, palette, visibilité et libération couvertes par
les mêmes gates que N2.1/N2.2. Le joueur N3 et l'intégration dans le canevas
actif restent hors de cette livraison.

Reprise dans `/Users/arnaud/Codex_main/KJP_Port_Simulator`, sur
`codex/threejs-v2`, HEAD
`16ed3e0bce5f6ecf2e68650217155ec40763cb6a` (`refactor_v2:N2.2`). L'arbre était
propre. Le checkpoint repo-local décrit toujours le chantier de compatibilité
antérieur ; le présent document et les commits N1/N2 constituent l'état de
reprise. Aucun changement de branche, reset ou suppression de travail.

### Périmètre réalisé et propriétaires

- Chaque entrée de `buoys` crée un propriétaire `buoy:<id>` lors de
  l'activation explicite ou du changement de topologie. `addBuoyGeometry()`
  conserve ses dimensions, bandes, formes, mât et marques supérieures, en
  réutilisant `resolvedBuoyAppearance()` et les recommandations KJP existantes.
  Le constructeur reçoit des rôles de couleur dans le chemin natif ; son appel
  Legacy sans option conserve exactement la palette actuelle.
- Les sept couleurs de balisage prises en charge — rouge, vert, jaune, noir,
  blanc, orange et bleu — deviennent des rôles `buoy.*`. Dark/chart mettent à
  jour les matériaux seulement. La couleur inconnue conserve le repli jaune
  existant. Le contour reste le rôle portuaire `outline`.
- Les 13 poteaux et le feu d'entrée du port pédagogique appartiennent au groupe
  `lights:harbor`. Le constructeur monde commun
  `addHarborLightGeometry()` produit les mêmes segments, largeurs et priorités
  que le bloc Legacy remplacé. Les rôles `lightPost`, `lightHead` et `entrance`
  existaient déjà dans la palette du port.
- `nativeInfrastructureDefinition({includeSeamarks:false})` et le hook
  `enableNativeInfrastructurePrototype({seamarks:false})` fournissent le repli
  N2.3 séparé demandé par le plan. Ils conservent N2.1/N2.2. Le repli N2.2
  `staticBoats:false` reste lui aussi testé et conserve les feux N2.3.

Toutes les positions, hauteurs et rayons sont transformés une fois en attributs
monde avant projection. Le changement de caméra, de vue, de DPR ou de thème ne
relit pas la topologie et ne reconstruit aucun buffer. Un changement de port
remplace le groupe complet puis libère exactement l'ancien. Les bouées restent
des données de topologie et de collision du simulateur ; les objets Three n'en
deviennent jamais l'autorité.

Le banc ajoute `{staticSeamarks:true}` : il capture terrain, infrastructures,
bateaux statiques, bouées et feux tout en excluant le joueur N3. L'option
historique `{seamarks:true}`, qui inclut le joueur pour la compatibilité exacte,
garde sa sémantique. La première exécution des protections a échoué comme prévu
sur le propriétaire `lights` absent, le mauvais périmètre global et les familles
`buoy`/`lights` non isolables ; aucun seuil n'a été diminué pour les faire passer.

### Vérifications N2.3

| Commande / contrôle | Résultat de cette livraison |
| --- | --- |
| `npm run build:simulator`, `npm run check:simulator` | Réussis ; HTML autonome régénéré et vérifié |
| `npm run test:rendering` | 12/12 tests réussis ; contrats génériques N1/N2 inchangés |
| `node --test --test-name-pattern='Three natif' tests/render-frame.test.js tests/simulateur-port.test.js` | 7/7 tests réussis : unités N1/N2, deux contrôles N1 et trois contrôles N2.3 reliés à la suite habituelle |
| Catalogue et transferts | Trois ports parcourus deux fois : port pédagogique avec feux, La Trinité avec 4 bouées, port déterministe avec les 10 familles de balisage. Après chauffe : identités, attributs et versions stables ; zéro allocation, libération ou appel/octet `bufferData`/`bufferSubData` supplémentaire pendant caméra, vue, thème et resize |
| Cycle de vie et replis | Remplacements et libérations exacts, aucune croissance entre retours au même port ; imports invalides et panne injectée sans effet sur Legacy ; replis N2.2 et N2.3 séparés, réactivation, désactivation et double disposal réussis |
| Fidélité globale native | 36 cadrages (3 ports × 2 thèmes × 3 vues × DPR 1/2) : présence, rappel d'occupation ≥95 % et débordement borné, sans identité pixel exigée |
| Détail par famille/style | 38 contrôles, dont 10 propres à N2.3 : feux dans 2 thèmes et remplissage/traits des bouées importées et des 10 familles. Rappel 100 % au seuil 90 % ; erreur couleur maximale N2.3 1,914/255 au seuil 25. Chacune des 38 omissions forcées fait échouer la gate |
| Compatibilité stricte existante | 4/4 tests réussis : 338 comparaisons raster, 0 pixel différent ; 24 traversées de ±π ; 2 211 ancres caméra, écart maximal 2,786 × 10⁻⁸ px au seuil 0,5 px |
| `npm run capture:renderer-baseline` sans `--update` | 6/6 empreintes Legacy identiques ; aucune référence mise à jour |
| Inspection visuelle ciblée | Couples natif/Legacy du port aux 10 balises en thème carte et feux isolés en thème nuit inspectés : formes, bandes, contours, mâts et segments présents et cohérents |
| `graphify update .` | Réussi sans appel LLM : graphe AST actualisé à 1 100 nœuds, 1 902 arêtes et 62 communautés |

Ressources natives vivantes après chauffe et retour au même port :

| Port | Géométries | Matériaux partagés | Buffers GL suivis |
| --- | ---: | ---: | ---: |
| Pédagogique, 13 poteaux + entrée | 257 | 22 | 716 |
| La Trinité importée, 4 bouées | 4 632 | 23 | 13 004 |
| Port déterministe, 10 familles de bouées | 63 | 13 | 188 |

Ces nombres servent à vérifier la stabilité interne du catalogue et sa
libération. Ils ne sont ni des références de parité avec Legacy, ni une mesure
de performance. Aucun gain de cadence ou de GPU n'est revendiqué dans ce banc
détaché.

Fichiers du lot : adaptations de `src/simulateur-port/template.html`, des
protections `tests/native-infrastructure.test.js`, du livrable généré
`simulateur-port.html` et du présent journal. SHA-256 du HTML :
`4e4fed2b9a2f2404c7edb9c0156b7c3b5e96d00bc19931e2a2afd37894e2c81a`.
Aucun moteur, profil, collision, pas de temps, interpolation, commande,
trajectoire, référence Legacy, dépendance, script, adaptateur caméra, skill ou
instruction globale n'est modifié. Legacy reste actif par défaut et le
prototype natif reste détaché, sans seconde boucle ni horloge.

### Limites, retour arrière et prochaine tranche

Les contrôles navigateur ont été exécutés avec Chromium headless sur cette
machine. Les avertissements autoplay et synchronisation GPU `ReadPixels` déjà
présents sans prototype ont été consignés séparément ; aucune autre erreur
console/page, requête HTTP(S) ou erreur GL n'a été observée. Les suites physiques
globales, les trajectoires complètes, la qualification release, les autres
navigateurs/appareils et la performance en rendu visible n'ont pas été exécutés,
car N2.3 ne modifie ni la physique ni le renderer actif.

Retour arrière vérifié : `seamarks:false` retire bouées et feux, libère leurs
ressources et conserve terrain, infrastructures et bateaux statiques ; la
réactivation restaure une nouvelle identité de catalogue. La désactivation
complète laisse zéro buffer GL suivi. Retirer les collecteurs N2.3 et leurs rôles
restituerait le catalogue N2.2 sans toucher à Legacy.

Prochaine tranche prévue : **N3, joueur local et données visuelles variables**.
Elle devra conserver la coque du joueur en coordonnées locales, ne mettre à jour
que sa transformation et ses éléments réellement animés, et protéger exactement
pose interpolée, contacts, commandes et picking. N3 n'est pas commencée dans
cette livraison N2.3. Ce statut historique est remplacé par la livraison N3
ci-dessous. Ne pas activer le renderer natif par défaut.

## Livraison N3 — joueur local et données visuelles variables

**N3 est validée dans le prototype isolé : ses critères de sortie sont
satisfaits.** Départ du commit
`f69900fdf7d5378debf7e10b6da69650eeae99bf` (`refactor_v2:N2.3`) sur
`codex/threejs-v2`, avec un arbre propre. Les acquis N1/N2 ont été conservés et
étendus ; aucune branche ni référence Legacy n'a été changée.

### Réalisation et propriété des ressources

- `addBoatMesh()` reste le constructeur partagé par Legacy. Des options de
  collecte, sans effet sur ses appels historiques, permettent à
  `nativePlayerDefinition()` de l'exécuter une seule fois avec un transformeur
  local. Les quatre groupes obtenus sont `player:hull`,
  `player-anatomy:static`, `player-propeller:blades` et six propriétaires
  `player-fender:<index>`. La coque, le mât, les halos, la quille, le safran,
  l'arbre et les pare-battages conservent ainsi les dimensions, faces, couches,
  couleurs et largeurs KJP existantes sans dépendre d'une pose monde.
- `native-player-resources.mjs` possède ces géométries et leur groupe Three.
  `nativePlayerPresentation()` lui transmet uniquement la pose interpolée
  fournie par `sceneMotion()`, la vue, le thème, l'état anatomie, la vitesse
  d'affichage, les indices de pare-battages en contact et l'angle visuel de
  l'hélice. La pose met à jour `position`/`rotation.z` et la matrice du groupe ;
  elle ne modifie aucun attribut de coque.
- Les changements de thème, de mode ×2, de vue skipper et de contact mettent à
  jour les matériaux, leurs couleurs, opacités ou largeurs. Les appendices sont
  masqués hors anatomie. Les trois pales partagent un seul buffer interleaved de
  72 octets ; il conserve son identité et constitue la seule donnée géométrique
  invalidée lorsque l'angle change en vue anatomie. Une hélice masquée ne produit
  aucun transfert. Après chauffe, le joueur représente 9 propriétaires,
  52 géométries/objets et 50 matériaux ; ces nombres servent au contrôle de
  stabilité interne, sans constituer une cible de parité avec Legacy.
- Les identifiants de contacts physiques `fender-{bow|mid|stern}-{side}:…` sont
  associés aux six propriétaires locaux. Le repli numérique historique reste
  accepté. Cela restaure dans le natif la couleur pédagogique du pare-battage
  réellement sollicité sans modifier le contact, le profil ou le rendu Legacy.
- `native-static-prototype.mjs` compose le catalogue N2 et le joueur N3 dans sa
  scène détachée. Il est toujours appelé par l'unique boucle existante et réutilise
  le même snapshot caméra. Un changement de port remplace et libère le catalogue
  N2, mais conserve les identités du joueur ; la désactivation libère les deux.
  Ni `RenderFrame`, ni projection Legacy, ni second RAF ou horloge n'entre dans
  l'entrée du joueur natif.

Le hook de qualification `enableNativePlayerPrototype()` reste accessible
uniquement avec `?test`. Il n'insère pas son canvas dans le DOM, ne sélectionne
aucun backend visible et ne change pas le défaut Legacy.

### Inventaire des autres données variables

| Producteur existant | Propriété retenue pour la suite | Invalidation / raison |
| --- | --- | --- |
| `addChartGrid()` | Ressource native séparée, métrique et persistante entre deux changements de maille/étendue | Vue, thème, distance ou franchissement de cellule ; éviter sa reconstruction à chaque image |
| `drawFlowParticles()` | Buffer natif dynamique dédié au vent et au courant | Temps de présentation et vecteurs de flux ; coût et uploads à mesurer séparément en N5 |
| `addDistantShoreCleatGeometry()` | Propriétaires natifs du port avec visibilité et matériau variables | Port, visibilité, proximité et sélection ; les taquets interactifs restent au Canvas 2D |
| `addGoalGeometry()` | Projection d'overlay conservée | Objectif/scénario ; les pointillés et l'information pédagogique sont autorisés dans l'overlay |
| `addRudderAxis()` | Canvas 2D supérieur conservé | Angle de barre et pose interpolée ; couche 12 déjà exclue du monde Three |
| `drawMooringLayer()` et `hitTargets` | Canvas 2D et picking existants conservés | Reconstruction par image nécessaire aux interactions ; aucun raycasting prévu |

Ces affectations préparent N4 mais ne l'implémentent pas. En particulier, le
chemin visible continue de construire et dessiner son monde Legacy complet.

### Vérifications N3

| Commande / contrôle | Résultat de cette livraison |
| --- | --- |
| Protection écrite avant le module | Échec attendu `ERR_MODULE_NOT_FOUND`, puis réussite après ajout de `native-player-resources.mjs` |
| `npm run test:rendering` | 13/13 tests réussis, dont le contrat N3 sur matrice, identités d'attributs, visibilité, matériaux, contact et buffer de pales |
| `node --test tests/native-player.test.js` | 2/2 tests réussis : trajectoire appariée, gestes caméra, thèmes, ×2, import, contacts sur les deux bords, animation et fidélité visuelle |
| Persistance et transferts réels | Sur 20 images de déplacement en vue normale : mêmes géométries/attributs/versions et zéro `bufferData`/`bufferSubData` après chauffe. En anatomie animée : une seule soumission de 72 octets par changement d'angle, attribuée au buffer des pales ; zéro allocation/libération et identités inchangées |
| Pose, fonctions et repli | Pose x/y/cap identique à la pose interpolée à chaque image, matrices mises à jour, franchissement continu de ±π, snapshots/rendu actif/overlay/`hitTargets` exacts avec ou sans prototype ; changement de port sans rebuild joueur ; double disposal avec zéro buffer GL restant |
| Fidélité native du joueur | 12 cadrages (2 DPR × 2 thèmes × 3 vues) sur un port vide : silhouette présente, rappel ≥82 %, débordement et erreur couleur bornés ; anatomie présente uniquement dans sa vue ; omission forcée détectée |
| Inspection des captures | Les six couples natif/Legacy à DPR 1 ont été inspectés : coque, franc-bord, mât, pare-battages et appendices anatomiques présents et lisibles dans les trois vues et les deux thèmes |
| Régression N2 ciblée | Les 38 contrôles de famille/style et omissions forcées repassent après correction du rapport de visibilité ; les 36 cadrages et cycles N2 passent dans la suite complète |
| `npm run test:e2e` | 59/59 tests réussis : 338 comparaisons Three de compatibilité à zéro pixel différent, 24 traversées de ±π, 2 211 ancres caméra, interactions et trois trajectoires étalons exactes |
| `npm run capture:renderer-baseline` sans `--update` | 6/6 empreintes Legacy identiques ; aucune référence réécrite |
| `npm run build:simulator`, `npm run check:simulator`, `git diff --check` | Réussis ; HTML autonome régénéré et diff sans erreur d'espacement |
| `graphify update .` | Réussi sans appel LLM : 1 135 nœuds, 1 947 arêtes et 72 communautés ; les fichiers `graphify-out` sont actualisés |

Une régression intermédiaire du test N2 d'omission a révélé que le rapport
commun exposait temporairement `visible` et rendait donc l'identité statique
sensible au hook d'isolation. La visibilité a été déplacée dans le rapport N3
propre au joueur ; la gate N2 ciblée puis la suite complète passent. Aucun seuil
visuel, physique ou fonctionnel n'a été diminué.

Les fichiers N3 sont le nouveau
`src/simulateur-port/rendering/native-player-resources.mjs`, les adaptations de
`native-static-prototype.mjs`, `native-infrastructure-resources.mjs`,
`rendering/index.js` et `src/simulateur-port/template.html`, le nouveau
`tests/native-player.test.js`, les compléments à `tests/render-frame.test.js` et
`tests/simulateur-port.test.js`, le livrable régénéré `simulateur-port.html` et
ce journal. SHA-256 final du HTML :
`f55894e0328cc8094a637ba9542f4dc5cac9399a65e1491b94b6b923e0eb4da2`.
Aucun moteur, profil, collision, pas de temps, interpolation,
commande, trajectoire, référence Legacy, dépendance, script, skill ou instruction
globale n'est modifié.

### Limites, retour arrière et prochaine tranche

Les contrôles ont été exécutés avec Chromium headless sur cette machine. Les
avertissements autoplay et synchronisation `ReadPixels`
connus ont été séparés ; aucune erreur console/page/GL ni requête HTTP(S) n'a
été observée. Les suites physiques autonomes, `verify:release`, les autres
navigateurs/appareils, la composition native visible et les mesures de
performance du chemin complet n'ont pas été exécutés. Aucun gain de performance
n'est revendiqué à partir du prototype détaché.

Retour arrière vérifié : ne pas appeler `enableNativePlayerPrototype()` laisse
N2 inchangée ; disposer le prototype laisse zéro buffer suivi. Retirer le module
joueur, son option de façade et ses hooks rend le banc N2.3 sans toucher au
renderer actif. Legacy reste le défaut.

Prochaine tranche prête : **N4, intégration dans la boucle et composition
interactive**. Elle pourra sélectionner explicitement le chemin natif visible,
composer fond d'eau et Canvas 2D, conserver picking/overlays, et prouver que le
monde projeté Legacy complet n'est plus construit dans son fonctionnement
normal. N4 n'est pas commencée dans cette livraison.

## Livraison N4 — intégration dans la boucle et composition interactive

**N4 est validée dans son périmètre : tous ses critères de sortie ont été
vérifiés.** Le statut « N4 n'est pas commencée » ci-dessus est historique et
remplacé par cette livraison. Départ du commit
`f0565aa8dc8965ebf5e8cbb8705828f7cd74cede` (`refactor_v2:N3`) sur
`codex/threejs-v2`, avec un arbre propre. Aucun changement de branche, reset ou
nettoyage de modifications préexistantes n'a été effectué.

### Routage visible et composition

- `activeWorldRenderer` vaut `legacy` au démarrage. Le hook de qualification
  `selectWorldRenderer("native")`, disponible uniquement avec `?test`, construit
  le catalogue N2, le joueur N3, les taquets lointains et les buffers de flux,
  puis insère le canvas Three sous `#scene`. Le Canvas 2D supérieur garde les
  événements pointeur ; le canvas natif a `pointer-events:none`. Revenir à
  `legacy` libère le monde natif et réaffiche immédiatement `worldScene`.
- `render(time)` conserve son unique RAF, l'accumulateur et le pas fixe, puis
  calcule une seule fois `frameMotion`, `frameBasis` et la visibilité. Dans le
  chemin natif, il transmet ce même `CameraSnapshot` et la même pose interpolée
  aux ressources persistantes. Aucun contrôleur, suivi caméra, horloge ou calcul
  Three n'alimente la simulation.
- Le chemin natif normal n'appelle pas `addHarborGeometry()`, le replay du cache
  projeté, `addBoatMesh()` pour le joueur visible, ni
  `KJPRenderFrames.createRenderFrame()`. Les tableaux projetés restent vides de
  polygones. `addGoalGeometry()` et `addRudderAxis()` conservent seulement leurs
  projections d'overlay autorisées. `drawMooringLayer()`,
  `drawUnderstandingOverlay()` et `drawAnatomyLabels()` restent dans le même
  ordre après le monde natif.
- Le fond d'eau demeure celui de `.stage`; les deux canvases de monde restent
  transparents. `resizeCanvas()` continue d'établir le viewport CSS et le DPR
  communs. Aucun éclairage, ombre, post-traitement, raycasting ou ressource
  réseau n'est ajouté.

### Ressources variables achevées en N4

- La grille carte est une couche métrique séparée. Sa signature contient thème,
  vue, pas et bornes alignées. Elle persiste entre deux images et n'est remplacée
  que lorsque cette signature change ; elle est retirée en thème nuit ou en vue
  skipper. Une invalidation de grille ne remplace ni le port ni le joueur.
- Tous les taquets de rive ont un propriétaire `shore-cleat:<id>` construit avec
  le port. Chaque image ne change que leur visibilité et le matériau partagé
  selon la visibilité du parent, la proximité du bateau et la sélection en
  cours. Les taquets interactifs restent dessinés et indexés par
  `drawMooringLayer()` sur Canvas 2D.
- `native-flow-resources.mjs` alloue une fois deux buffers séparés, vent et
  courant. `nativeFlowPresentation()` transmet leurs segments monde à chaque
  image ; seuls ces attributs dynamiques sont marqués pour transfert. Le port,
  la coque et les autres attributs ne sont pas invalidés par le temps ou les
  vecteurs de flux. Les traits droits du vent et ondulés du courant conservent
  leurs couleurs, largeurs, altitudes, densités et déplacements ; leur
  qualification visuelle multi-scène reste attribuée à N5.
- Une reconstruction de port remplace le catalogue monde en conservant le
  joueur et les buffers de flux. Une panne injectée libère le natif, remet
  `activeWorldRenderer` à `legacy` et restaure le canvas historique. Une nouvelle
  sélection native repart ensuite d'un catalogue frais.

### Vérifications N4

| Commande / contrôle | Résultat de cette livraison |
| --- | --- |
| Protection N4 ciblée finale | `node --test tests/native-world-renderer.test.js` : 1/1 réussi après renforcement du picking et de la reprise ; 136 images natives lors de la dernière relance, 282 propriétaires monde et 288 185 pixels natifs non transparents dans le cadrage principal |
| Routage et boucle | Pendant les images natives observées, compteurs de construction du monde projeté et de `RenderFrame` strictement constants ; zéro polygone projeté, uniquement couches d'overlay 9/10/12 selon l'état ; un seul callback `render` en attente et maximum simultané égal à 1 |
| Persistance et transferts | Après chauffe avec flux nuls, attente et mouvement de caméra : identités des géométries, attributs, buffers, tableaux et versions du port/de la coque inchangées ; zéro appel/octet `bufferData` ou `bufferSubData` supplémentaire. Le déplacement du bateau modifie sa matrice et le `CameraSnapshot`, pas ces ressources |
| Régression skipper signalée | Bateau avancé en vue skipper à temps contrôlé : pose joueur et base caméra évoluent, l'empreinte du canvas monde change, les identités géométriques restent stables. Le port n'est donc plus figé derrière les taquets Canvas 2D |
| Interactions et composition | Nombre de `hitTargets` identique avant/après sélection ; clic réel sur un taquet bateau puis un taquet rive : une aussière ajoutée. Taquets, aussières, pendilles et overlays conservent le Canvas 2D et aucun raycasting n'est utilisé |
| Vues, thèmes, flux, resize et reprise | Dessus, anatomie et skipper parcourus ; thèmes nuit/carte ; apparition/retrait persistant de la grille ; appendices anatomiques ; buffers vent/courant alimentés ; resize 840 × 620 ; panne de reconstruction injectée, retour Legacy puis réactivation native réussis |
| Inspection visuelle ciblée | Vue skipper native visible inspectée à 1 180 × 760 : coque, ponton, taquets, axe de barre, fond d'eau et HUD composés et lisibles ; aucune erreur page/console/GL |
| `npm run build:simulator`, `npm run check:simulator` | Réussis ; HTML autonome régénéré puis validé |
| `npm run test:rendering` | 13/13 tests réussis ; contrats N1 à N3 et RenderFrame de compatibilité inchangés |
| `npm run test:e2e` | 60/60 tests réussis, N4 incluse : 338 comparaisons raster Three de compatibilité avec zéro pixel différent, 24 traversées de ±π, 2 211 ancres caméra, picking, aussières, pendilles et trois trajectoires étalons exactes |
| `npm run capture:renderer-baseline` sans `--update` | 6/6 empreintes Legacy identiques ; aucune référence réécrite |
| `git diff --check` et contrôle de périmètre | Réussis ; aucun diff sous physique, profils, ports, trajectoires, références Legacy, dépendances ou scripts |
| `graphify update .` | Réussi sans appel LLM : graphe AST actualisé à 1 163 nœuds, 1 984 arêtes et 73 communautés |

Le test N4 a d'abord échoué uniquement parce que `pngjs`, absent des
dépendances du projet, avait été utilisé pour lire une capture. Cette dépendance
n'a pas été ajoutée : la lecture a été déplacée dans le Canvas 2D du navigateur.
Après ajout du scénario de panne, une assertion comparait un état physique qui
avait normalement continué à progresser après le rechargement du scénario ; le
test remet désormais explicitement la simulation en pause avant de vérifier le
changement de renderer. Aucun comportement physique, seuil ou étalon n'a été
adapté pour résoudre ces défauts de banc.

Les fichiers N4 sont le nouveau
`src/simulateur-port/rendering/native-flow-resources.mjs`, les adaptations de
`native-static-prototype.mjs`, `native-infrastructure-resources.mjs`,
`rendering/index.js` et `src/simulateur-port/template.html`, le nouveau
`tests/native-world-renderer.test.js`, son branchement dans
`tests/simulateur-port.test.js`, le livrable régénéré `simulateur-port.html` et
le présent journal. Aucun fichier de physique, profil, collision, trajectoire,
référence visuelle Legacy, dépendance ou script n'est modifié.
SHA-256 du HTML autonome :
`cf22d3e549dcf30c8f8ae8a0afd92a500a3cb5f3399bdb58d938f13c9a210d21`.

### Limites, retour arrière et prochaine tranche

Les contrôles navigateur ont été exécutés avec Chromium headless sur cette
machine. Une relance finale a été bloquée avant chargement de page par le sandbox
macOS (`MachPortRendezvousServer: Permission denied`) ; la même commande relancée
hors sandbox a réussi 1/1. L'inspection visuelle N4 est ciblée ; les seuils visuels sémantiques des
six scènes, les mutations volontaires par famille, les autres navigateurs et
appareils, le soak mémoire et les mesures appariées p50/p95/p99 du chemin complet
restent à réaliser. Aucun gain de performance n'est encore revendiqué. Les
pointillés raster exacts ne constituent pas une exigence du natif ; N5 devra
toutefois vérifier que les flux et marqueurs restent lisibles et qu'aucune
information pédagogique n'est perdue.

Le retour arrière est le hook `selectWorldRenderer("legacy")`; son cycle de
libération et la reprise après panne sont testés. Sans appel explicite au hook,
le canvas natif n'est pas attaché et Legacy reste le renderer actif. Le backend
Three de compatibilité et ses comparaisons exactes restent disponibles.

Prochaine tranche prête : **N5, qualification visuelle, fonctionnelle et de
performance**. Elle doit ajouter les seuils natifs multi-scènes et mutations,
mesurer le chemin complet sur les mêmes états et caméras puis confirmer en rendu
visible, sans modifier les références Legacy ni basculer le renderer par défaut.
N5 n'est pas commencée dans cette livraison.

## Livraison N5 — qualification visuelle, fonctionnelle et de performance

**N5 est validée dans son périmètre : tous ses critères de sortie ont été
vérifiés.** Le statut « N5 n'est pas commencée » ci-dessus est historique et
remplacé par cette livraison. Départ du commit
`26b234b35e5cc0e14220f68a6399feaa50f1ba25` (`refactor_v2:N4`) sur
`codex/threejs-v2`, avec un arbre propre. Aucun changement de branche, reset ou
nettoyage de travail préexistant n'a été effectué. Legacy reste le renderer par
défaut ; N6 n'est pas commencée.

### Oracle natif et protections exactes

- La matrice des six scènes du manifeste Legacy est maintenant partagée par
  `capture-simulator-render-baseline.js` et le validateur N5. Le natif parcourt
  les six scènes à DPR 1, puis un cadrage dessus et un cadrage skipper à DPR 2.
  Pour chaque cas, l'inventaire des propriétaires et familles, la couche de
  picking, les aussières, la caméra et les dimensions métriques projetées sont
  contrôlés. Le Canvas 2D supérieur reste l'autorité des interactions.
- L'oracle visuel natif travaille sur l'occupation, le rappel de silhouette,
  l'alignement, l'étendue et la densité de traits à une résolution calibrée. Ses
  seuils sont respectivement une occupation de 65 à 140 % de la référence, un
  rappel d'au moins 80 %, un déplacement de centre limité à 16 % de chaque axe,
  une étendue de 65 à 140 % et une densité de traits de 50 à 200 %. Il ne compare
  ni les tableaux, ni la tessellation, ni l'identité des pixels.
- Les huit cadrages finaux donnent un rappel de silhouette de 96,7 à 100 %, une
  occupation de 96,9 à 100,5 % et une densité de traits de 76,0 à 101,9 %. Les
  empreintes natives diffèrent bien des empreintes Legacy. Des mutations
  volontaires indépendantes — omission complète, déplacement de 32 %, réduction
  à 20 %, perte de détail par sous-échantillonnage et désactivation des événements
  du Canvas 2D — font chacune échouer le seuil qu'elles doivent protéger.
- Un rejeu temporel séparé fait avancer exactement les chemins Legacy et natif
  pendant 30 images contrôlées dans les vues dessus et skipper. Toutes les
  structures de `snapshot()` et tous les rapports caméra sont identiques à chaque
  image ; la pose et la caméra évoluent effectivement. Le port se déplace donc
  avec la caméra en vue skipper, sans reprendre l'ancien défaut de décor figé.
- Les comparaisons Legacy/Three de compatibilité restent exactes et conservent
  leurs références. Aucun étalon physique, fonctionnel ou raster Legacy n'a été
  modifié pour qualifier le natif.

### Chemin visible et performance appariée

Le nouveau script `profile-simulator-native-renderer.js`, exposé par
`npm run profile:renderers:native`, mesure `render()` avec le canvas du backend
sélectionné attaché à la scène. Il alterne l'ordre Legacy/natif et rejoue la même
pose, les mêmes commandes, les mêmes pas de temps et la même caméra. Il exclut
le compositing et l'achèvement GPU de son temps CPU ; les captures visibles et
les rapports WebGL prouvent séparément que le backend mesuré est bien présenté.
Le protocole complet et ses résultats sont archivés dans
`docs/validation/threejs-native-n5-performance.json`.

Campagne finale : Chromium 149, ANGLE Metal matériel sur Apple M1, viewport
1280 × 800, DPR 1 et 2, grand port de La Trinité, vues dessus nuit et skipper
carte, 30 images de chauffe puis 120 mesures, trois répétitions par combinaison.

| Scène / DPR | Legacy p50 / p95 / p99 | Natif p50 / p95 / p99 |
| --- | ---: | ---: |
| La Trinité dessus nuit / 1 | 33,2 / 41,1 / 43,1 ms | 14,2 / 15,0 / 16,1 ms |
| La Trinité dessus nuit / 2 | 33,0 / 41,2 / 42,9 ms | 14,5 / 15,3 / 15,6 ms |
| La Trinité skipper carte / 1 | 27,9 / 40,4 / 43,0 ms | 15,6 / 16,7 / 17,4 ms |
| La Trinité skipper carte / 2 | 27,7 / 32,2 / 36,1 ms | 16,0 / 17,2 / 18,2 ms |

Le natif est plus rapide sur p50 et p95 dans 12 paires sur 12. Les ratios
médians natif/Legacy sont 0,523 en p50 et 0,464 en p95. Chaque paire conserve
exactement les snapshots physiques et les caméras. Après chauffe, les identités,
contenus et versions des ressources statiques, le nombre de géométries WebGL et
les compteurs instrumentés d'upload restent constants.

La première campagne longue a révélé deux uploads tardifs : Three préparait les
programmes mais attendait la première visibilité de certains taquets pour
transférer leurs attributs. `native-static-prototype.mjs` effectue désormais un
rendu d'amorçage du catalogue lors de sa création ou de son invalidation, avec
les familles temporairement visibles dans le même callback, puis rend l'état
réel avant toute composition. Les douze mesures finales constatent zéro upload
après la chauffe. Les invalidations explicites de port ou de grille restent
autorisées et continuent de remplacer uniquement leur ressource concernée.

### Vérifications N5

| Commande / contrôle | Résultat de cette livraison |
| --- | --- |
| Qualification N5 ciblée | 2/2 tests réussis : huit cadrages sémantiques, cinq mutations détectées, progression contrôlée exacte en dessus et skipper |
| Inspection visuelle | Captures Legacy/natives inspectées pour dessus nuit, anatomie, skipper carte du port pédagogique et skipper carte de La Trinité ; coque, port, balisage, objectif, labels, traits, fond d'eau et HUD restent lisibles |
| `npm run profile:renderers:native` | 12/12 paires matérielles réussies ; natif plus rapide sur p50 et p95 dans tous les cas ; zéro divergence d'état/caméra et zéro reconstruction/upload statique après chauffe |
| `npm run check:simulator` | Réussi ; HTML autonome et topologie intégrée validés |
| `npm run test:rendering` | 13/13 tests réussis ; contrats RenderFrame et ressources N1 à N3 inchangés |
| `npm run test:e2e` | 62/62 tests réussis ; 338 comparaisons raster Three de compatibilité à zéro pixel différent, 24 traversées de ±π, 2 211 ancres caméra et trois trajectoires étalons exactes |
| `npm run capture:renderer-baseline` sans `--update` | 6/6 empreintes Legacy identiques ; aucune référence réécrite |
| Contrôles statiques | `node --check` sur les scripts/tests N5 et `git diff --check` réussis |
| `graphify update .` puis hook de commit | Réussis sans appel LLM : graphe AST final à 1 210 nœuds, 2 038 arêtes et 74 communautés |

Les premiers essais ont échoué avant la validation finale pour trois raisons
identifiées. Une assertion demandait à tort l'identité du seul Canvas 2D alors
que les traits pédagogiques de couches basses changent volontairement de canvas
dans la composition native ; elle a été remplacée par un contrôle de présence et
de lisibilité, tandis que les hitTargets et résultats d'interaction restent
exacts. Les matériaux de flux transmettaient d'abord une couleur `rgba()` au
constructeur Three avant d'en extraire l'alpha, ce qui produisait un avertissement
sans effet visuel ; leur couleur est maintenant initialisée neutre puis appliquée
une seule fois par la fonction commune. Enfin, les deux uploads tardifs décrits
ci-dessus ont conduit à l'amorçage réel des buffers. Aucun test physique,
fonctionnel ou Legacy n'a été affaibli pour résoudre ces échecs.

Les contrôles navigateur ont été réalisés sous Chromium sur cette machine. Une
mesure courte SwiftShader déclarée a aussi confirmé la tendance, mais seule la
campagne Metal matérielle fonde le critère de performance. Le temps GPU, le
compositing, les autres navigateurs/appareils et un soak prolongé au-delà des
cycles de ports et des 120 images mesurées n'ont pas été exécutés ; ils restent
des contrôles d'activation N6. `verify:release` n'a pas été lancé, cette tranche
étant une qualification ciblée de renderer et non une qualification de version
complète.

Les fichiers N5 sont `scripts/simulator-render-scenes.js`,
`scripts/profile-simulator-native-renderer.js`, l'adaptation du script de
baseline et de `package.json`, `tests/native-renderer-qualification.test.js` et
son branchement, les diagnostics/amorçages de `native-static-prototype.mjs`, la
correction de `native-flow-resources.mjs`, le présent journal, le rapport de
performance archivé et le HTML autonome régénéré. Aucun fichier de physique,
profil, collision, commandes, trajectoires ou référence Legacy n'est modifié.
SHA-256 du HTML autonome :
`347d67ea03e18b3c81a393957aa43e64fa09a9acfb98dea1a91e9182d3422aa0`.

Retour arrière : `selectWorldRenderer("legacy")` libère toujours le natif et
réaffiche le canvas historique ; ne pas appeler le hook conserve le démarrage
Legacy. Prochaine tranche prévue : **N6, activation contrôlée**. Elle décidera
séparément du défaut, complétera la matrice navigateurs/appareils et le soak, et
vérifiera le repli en conditions d'activation. N6 n'est pas commencée dans cette
livraison.

## Livraison N6 — activation contrôlée

**N6 est validée : Three natif est activé par défaut et chaque critère de sortie
du plan a été vérifié.** La tranche a commencé sur `codex/threejs-v2`, HEAD
`f136091d2ccfbfd6628587454f9ece16806710a8` (`refactor_v2:N5`), avec un arbre
Git propre. Les livraisons N1 à N5 et leurs preuves ont été réutilisées sans
reconstruction ni modification de leurs références.

### Activation, repli et frontières

- `DEFAULT_WORLD_RENDERER` sélectionne désormais `native` au démarrage produit
  et diagnostic. Le paramètre public `?renderer=legacy` force le repli ;
  `?renderer=native` explicite le choix natif. Une valeur inconnue est ignorée.
- La création initiale native est entourée par un repli automatique vers Legacy.
  Un échec de construction libère les ressources partielles, réaffiche
  `worldScene` et expose l'état courant dans `data-world-renderer`. Le scénario
  injecté `?test=1&failNativeStartup=1` valide ce chemin sans ajouter de mode
  produit.
- Legacy et Three de compatibilité restent présents. Les bancs et tests qui
  mesurent leurs contrats les demandent explicitement avec `renderer=legacy` ;
  les six références raster Legacy et les 338 comparaisons de compatibilité
  n'ont pas été modifiées.
- Le Canvas Three est masqué aux technologies d'assistance, conserve
  `pointer-events: none` et reste sous le Canvas 2D. Le picking, les
  `hitTargets`, les commandes et les overlays gardent donc leurs propriétaires
  existants.
- Aucune ligne de physique, profil, collision, gestion du temps, interpolation,
  commande ou trajectoire étalon n'est modifiée par N6. La boucle, la pose et la
  caméra restent celles qualifiées en N4 et N5.

### Matrice et stabilité observées

Le rapport `docs/validation/threejs-native-n6-matrix.json` archive neuf cas
réussis sous macOS 15.7.7 arm64 : Chromium 149.0.7827.55, Firefox 151.0 et
WebKit 26.5, chacun en 1280 × 800 DPR 1, 1024 × 720 DPR 2 et 390 × 844 DPR 3.
Le DPR effectif reste borné à 2 par le comportement KJP existant. Chaque cas
charge le HTML produit sans API de test, constate le WebGL2 sans erreur, le
canvas natif visible et dimensionné, le Canvas Legacy masqué, le Canvas 2D
interactif, l'absence de débordement et de requête réseau, puis vérifie par
capture qu'une interaction visible modifie la scène. Les dix-huit captures ont
été inspectées localement ; leurs empreintes sont archivées, leurs fichiers
temporaires ne sont pas versionnés.

Le test ciblé complète la matrice par le chargement de La Trinité, un
redimensionnement, le passage Legacy puis natif avec état exact, l'échec de
démarrage injecté, et le repli produit `?renderer=legacy` sans API de test. Le
soak fait avancer une vue skipper durant 1 200 images et 20,00 secondes simulées
avec une unique callback d'animation en attente. Les 537 géométries, les
identités, contenus et versions d'attributs, la mémoire WebGL et les compteurs
d'upload restent strictement constants après initialisation ; la pose et la
caméra avancent réellement et aucun monde projeté ni `RenderFrame` n'est
construit.

### Vérifications N6

| Commande / contrôle | Résultat de cette livraison |
| --- | --- |
| `npm run qualify:renderer:native -- --output docs/validation/threejs-native-n6-matrix.json` | 9/9 cas réussis sur trois moteurs et trois formats ; rapport archivé |
| `node --test tests/native-renderer-activation.test.js` | 2/2 tests réussis : activation produit, interactions, import, resize, repli et soak |
| Inspection visuelle | Captures bureau skipper, compact et mobile inspectées sur Chromium, Firefox et WebKit ; monde, coque, objectif, HUD et commandes lisibles |
| `npm run build:simulator`, puis `npm run check:simulator` | Réussis ; HTML autonome régénéré et cohérent avec ses sources |
| `npm run test:rendering` | 13/13 tests réussis ; contrats N1 à N3 et compatibilité inchangés |
| `npm run verify:simulator` | Réussi : 42/42 tests physiques et 64/64 tests navigateur, trois trajectoires étalons exactes |
| `npm run capture:renderer-baseline` sans `--update` | 6/6 empreintes Legacy identiques ; aucune référence réécrite |
| Contrôles statiques | `node --check` sur le script et le test N6, puis `git diff --check`, réussis |
| `graphify update .` | Réussi sans appel LLM : graphe AST à 1 248 nœuds, 2 079 arêtes et 79 communautés |

Les premiers essais de validation ont échoué sur quatre hypothèses du nouveau
protocole, sans défaut produit : le DPR demandé à 3 est volontairement borné à
2 par KJP ; les onglets de vue et de mode sont masqués par la mise en page
compacte ; l'état devait être mis en pause avant une comparaison exacte pendant
le repli ; Firefox formule autrement l'avertissement AudioContext attendu. Les
assertions ont été corrigées pour décrire ces comportements existants sans
élargir le filtre aux autres avertissements. Aucun seuil physique, fonctionnel,
Legacy ou de compatibilité n'a été affaibli.

Limites déclarées : la matrice utilise les moteurs headless fournis par
Playwright sur cette machine, pas des navigateurs installés ni des appareils
physiques. Elle contrôle WebGL2, les captures et les interactions, sans mesurer
le temps GPU ou le compositing. Ces mesures de performance restent celles de N5
sur Chromium/Metal. `verify:release` n'a pas été lancé, N6 étant un `ui-check`
du simulateur et non une qualification explicite des deux produits.

Les fichiers N6 sont la sélection et le repli dans
`src/simulateur-port/template.html`, l'accessibilité du canvas dans
`rendering/native-static-prototype.mjs`, les tests et scripts explicitant leurs
backends, `tests/native-renderer-activation.test.js`,
`scripts/qualify-simulator-native-activation.js`, `package.json`, le rapport de
matrice, le guide utilisateur, les instructions propres au dépôt, le présent
journal et le HTML autonome régénéré. SHA-256 du HTML autonome :
`bb09ce2444aebaa6a16a21f16a71f2cd06dad418243d4da80e3703f4270b4044`.

Retour arrière : définir `DEFAULT_WORLD_RENDERER` à `legacy` remet le défaut
historique sans migration de données ni changement du moteur ; le repli
immédiat reste disponible par `?renderer=legacy`. N6 termine les tranches
planifiées. Aucun retrait de Legacy ou du backend Three de compatibilité n'est
engagé ; une telle évolution demanderait un nouveau cadrage et une décision
explicite.

### Correction post-N6 — flux visibles dans les grands ports

Le 11 septembre 2026, `la trinv2.kjp` a révélé que les 30 traits de vent et les
24 vagues de courant étaient répartis sur toute l'emprise du port, soit environ
3 905 × 3 496 m. Les buffers natifs étaient alimentés, mais aucun segment ne
tombait nécessairement dans le cadrage courant. `flowParticleDomain()` conserve
la distribution historique des petits ports et répète, pour une emprise plus
grande que le champ visuel, le même ensemble déterministe près de la caméra. Le
nombre de ressources, les vecteurs physiques, les vitesses et les directions ne
changent pas.

La protection navigateur charge le grand port versionné, active séparément le
vent et le courant, puis exige une différence visible dans les vues dessus et
skipper. Elle échouait avant correction avec zéro pixel de vent. Sur le fichier
exact externe `la trinv2.kjp`, la vérification finale observe respectivement
349/155 pixels modifiés en vue dessus et 608/286 en vue skipper pour le
vent/courant, sans erreur console. `npm run check:simulator`, les 13 tests de
rendu et la protection navigateur ciblée réussissent ; les six empreintes
Legacy restent identiques sans mise à jour des références.

## Intégration post-N6 — modèle GLB du bateau joueur

Le 11 septembre 2026, le modèle fourni `kjp_sun_odyssey_36i.glb` remplace la
coque procédurale du seul bateau joueur dans le backend Three natif. Le fichier
source reste importé directement, sans reconstruction, simplification ni
modification de ses attributs. Son SHA-256 est
`b16e5d0c656e71a25ef12d4e6e278c7f9b358f35ddd75eeebb620fdffaba4dc9` pour
136 444 octets. Il contient un maillage, 4 306 sommets, 1 948 triangles, une
matière à couleurs de sommets, aucune texture, aucune animation et aucune
extension glTF optionnelle.

### Calage métrique et séparation fonctionnelle

Les métadonnées embarquées donnent une coque seule de 10,69 × 3,59 m, hors
gréement et accessoires, contre le contour KJP de 10,94 × 3,59 m. L'échelle
reste donc uniforme et métrique à `1`. La largeur coïncide ; la coque conserve
0,25 m de marge longitudinale totale, soit 2,3 %, tandis que le rouleau d'étrave
porte l'encombrement total du modèle à 10,94 m. Aucune déformation ni adaptation
physique n'est appliquée. L'axe `+Z` du GLB devient l'avant `+X` KJP, son axe
`+Y` devient la verticale `+Z` KJP, et son plan de flottaison `Y=0` est placé au
niveau visuel existant `z=0,02 m`. Les bornes locales obtenues pour la coque
sont `[-5,345 ; +5,345] × [-1,795 ; +1,795] × [-0,66 ; +1,16] m`.

Le contour de collision natif existant est conservé comme aide visuelle et
reste alimenté par le gabarit KJP. Les six pare-battages, les six taquets
fonctionnels du Canvas 2D, les aussières, le picking, les `hitTargets`, les
appendices pédagogiques et leurs états de contact ne changent pas. Le mât et la
coque procéduraux ne sont plus construits dans le chemin natif, ce qui évite un
doublon décoratif. Les bateaux statiques gardent leur représentation existante.

### Chargement et cycle de vie

`native-player-model.mjs` précharge une fois les octets GLB intégrés au bundle,
les confie à `GLTFLoader.parseAsync()` puis conserve la géométrie durant la vie
de la page. Chaque activation du renderer réutilise cette géométrie et ne crée
qu'une matière de présentation locale ; un changement de port ne recharge ni ne
reconstruit le modèle. La pose interpolée continue de déplacer le groupe joueur
parent. Les gestes caméra ne modifient aucun attribut du GLB. La matière
`MeshBasicMaterial` conserve les couleurs de sommets et permet le rendu dans la
scène KJP non éclairée, sans lumière, ombre ou post-traitement supplémentaire.
Le chemin réseau inutilisé de `GLTFLoader` est neutralisé au bundling ; le HTML
reste autonome et ne contient aucun appel `fetch`, `XMLHttpRequest` ou
`WebSocket`.

### Vérifications et coût observé

- `node --test tests/native-player.test.js` réussit 2/2 tests : chargement
  unique, métrique, axes, flottaison, absence de coque procédurale, ressources
  persistantes, thèmes, ×2, contacts, import de port et douze cadrages
  vue/thème/DPR.
- Le contrôle N5 des huit scènes/DPR réussit avec ses seuils d'origine après
  attente explicite de la ressource embarquée. Les mutations d'omission,
  déplacement, miniature et perte de lisibilité restent détectées.
- `npm run test:rendering` réussit 13/13 contrats ; le test N4 du renderer
  visible réussit, de même que les six empreintes Legacy sans modification de
  référence. Le premier passage de `npm run test:e2e` a exposé deux assertions
  de banc devenues obsolètes : capture du natif avant la fin du parse GLB et mot
  `fetch()` présent dans un message mort de Three. Les deux contrôles ciblés
  réussissent après correction ; la suite complète n'a pas été relancée une
  seconde fois.
- La comparaison avant/après utilise le même profil court visible attaché,
  La Trinité en vue dessus sombre, DPR 1, huit images de chauffe puis trente
  images mesurées sous Chromium headless/SwiftShader. Le natif passe de
  17,76 à 17,86 ms de moyenne, de 16,0 à 16,9 ms au p50 et de 23,3 à 22,9 ms au
  p95. Les appels de dessin passent de 3 299 à 3 294, les triangles de 210 793
  à 212 440, les géométries de 7 055 à 7 050 et les octets chargés au GPU de
  2 298 826 à 2 428 700. Cette unique mesure logicielle courte montre un coût
  CPU moyen quasi stable (+0,6 %) mais ne constitue pas une qualification GPU
  matérielle.

Le HTML autonome final mesure 1 941 960 octets, contre 1 676 064 avant
l'intégration. Aucun moteur, profil, collision, commande, interpolation,
trajectoire, autre bateau, eau, ponton, caméra, éclairage global ou référence
Legacy n'est modifié.

## Clôture de la migration — 14 septembre 2026

Cette section remplace, pour le produit courant, les prescriptions historiques
qui imposaient de conserver Legacy WebGL, Three de compatibilité, leur
`RenderFrame` commun ou leurs comparateurs. Elle ne remplace aucune garantie
physique ou fonctionnelle et ne modifie pas les résultats historiques N1–N6.

### N7 — transfert des garanties vers le natif

La suite fonctionnelle principale démarre désormais sur le renderer natif réel
et attend le GLB avant ses observations visuelles. Ses assertions de commandes,
unités, imports, aussières, pare-battages, picking, tactile, physique intégrée et
trajectoires étalons restent inchangées. Les assertions qui ne décrivaient que
l'ancien backend ont été retirées de cette suite et sont accessibles dans le tag
historique.

Le chargement GLB expose une promesse `ready` qui rejette explicitement. Le
renderer visible relaie cette erreur au cycle produit et active le secours au
lieu de laisser un joueur invisible. La géométrie chargée reste partagée pendant
la vie de la page ; une instance libère sa matière, pas cette géométrie commune.
Les tests ciblent le joueur et ses équipements, le grand port avec vent et
courant en vues dessus et skipper, les thèmes, DPR, imports et interactions.

### C1 — inventaire et archive

Le tag annoté `threejs-migration-legacy-final` fixe le commit
`78fb7d148fe065d6fa2479dc8c1eaae151f755e1`. Les empreintes, versions,
commandes, scènes, consommateurs, classifications et limites figurent dans le
[manifeste de clôture](validation/threejs-migration-closure.md). Un contrôle
historique est exécuté depuis une extraction isolée avant de fermer cette phase.

### C2 — secours Canvas 2D direct

`?renderer=canvas` sélectionne le painter Canvas 2D existant. Les échecs de
WebGL2, de construction initiale, de chargement GLB, de reconstruction du port et
la perte de contexte basculent vers ce chemin avec un diagnostic explicite. Le
Canvas natif est libéré ; l'état de simulation n'est ni remplacé ni avancé par le
routage. Les primitives projetées et caches nécessaires au secours, les overlays,
`drawMooringLayer()`, le picking et les `hitTargets` sont conservés.

### C3 — retrait des anciens chemins et bancs pérennes

La façade ne bundle plus que Three r186, l'adaptateur caméra et le renderer
natif. Legacy WebGL, Three de compatibilité, les modules de `RenderFrame`, de
surfaces projetées, de comparaison et de profil exclusifs ont été retirés avec
leurs globals, hooks, paramètres et scripts actifs. Le prototype N1 a été adapté
et renommé `native-world-renderer.mjs` parce qu'il porte le renderer de
production.

Les six références raster Legacy restent intactes comme archive et ne sont plus
chargées par un test courant. Les références natives sont capturées par
`capture-simulator-native-baseline.js`. Le profil compare désormais une version
native de référence et la candidate, en ordre alterné, après chauffe, sur les
mêmes scènes, états, caméras, DPR et timestamps. Les uploads statiques sont
instrumentés séparément et doivent rester nuls durant la fenêtre mesurée.

### C4 — instructions, build et requalification

`AGENTS.md` conserve sa validation hiérarchique et rend les contrôles renderer
lourds explicitement sélectionnables. Le skill local KJP devient une procédure
de maintenance du natif et du secours ; aucun skill global n'est modifié. Le
guide utilisateur décrit le repli Canvas. `package.json` sépare les contrats
unitaires, l'intégration rapide, la qualification étendue, la matrice et le
profil. `verify:release` inclut une seule qualification renderer étendue.

Le HTML autonome est régénéré depuis les sources. Le statut détaillé des tests,
leurs durées, l'inventaire des dépendances conservées et la vérification d'archive
sont consignés dans le manifeste. Une preuve absente y laisse la clôture ouverte ;
un échec inexpliqué n'est jamais présenté comme une validation.

**Clôture validée.** La release complète réussit avec les 33 contrôles de ports,
42 invariants physiques, 47 scénarios fonctionnels natifs, 24 contrôles du
générateur et la qualification renderer. Celle-ci réussit 12/12 après
réintégration du soak de 1 200 images. La matrice fait 9/9 et le profil visible
Apple M1/Metal fait 12 paires, sans upload statique après chauffe et avec un
ratio p95 médian candidate/référence de `0,8982`. Les résultats bruts sont dans
[`threejs-native-closure-matrix.json`](validation/threejs-native-closure-matrix.json)
et
[`threejs-native-closure-performance.json`](validation/threejs-native-closure-performance.json).
Les limites matérielles et les tentatives échouées corrigées sont distinguées
dans le manifeste de clôture.
