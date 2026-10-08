# Renderer Three.js du simulateur

Ce document définit les consignes de maintenance, qualification et optimisation
du renderer natif et de son secours Canvas 2D. Ces interventions conservent
strictement la physique, les fonctions et le livrable HTML autonome. Elles
concernent le simulateur KJP ; le générateur de ports et les modifications de
physique nautique suivent leur propre périmètre dans [AGENTS.md](../AGENTS.md).

Le simulateur utilise Three.js `0.186.0` / r186 avec `WebGLRenderer`. Le renderer,
ses modules et les octets du GLB joueur sont intégrés au livrable
`simulateur-port.html` par esbuild ; leur fonctionnement ne dépend pas d'un CDN.
Les sources sont sous `src/simulateur-port/`. Modifier ces sources puis régénérer
le HTML, sans éditer directement le livrable.

## Responsabilités et chemins de rendu

| Chemin | Activation | Entrée |
| --- | --- | --- |
| Three natif | défaut et `?renderer=native` | ressources monde persistantes, pose interpolée, caméra et présentation KJP |
| Canvas 2D | `?renderer=canvas` et erreurs natives | primitives projetées et caches Canvas partagés |

`render(time)` possède l'unique boucle et la progression temporelle.
`prepareInterpolatedFrameMotion()` produit la pose affichée et `cameraBasis()`
possède le suivi caméra. `rendering/three-camera.mjs` adapte cette base aux matrices
Three sans créer de contrôleur, d'horloge ou de boucle supplémentaire.

Le moteur physique, ses profils, repères, collisions, commandes, pas fixe,
accumulateur, interpolation et trajectoires restent propriétaires de la simulation.
Aucun objet, rayon, matrice ou calcul Three ne devient une entrée physique.
Un travail de rendu ne modifie ni ces éléments, ni les ancrages fonctionnels,
ni les références physiques.

Le Canvas 2D supérieur conserve les overlays pédagogiques, les aussières,
pare-battages, taquets, `drawMooringLayer()`, le picking et les `hitTargets`.
Le canvas Three garde `pointer-events: none`. Le raycasting ne remplace pas les
interactions souris ou tactiles existantes.

## Ressources persistantes et secours

`rendering/native-world-renderer.mjs` possède la scène, le canvas, les ressources
GPU et leur cycle de vie. Les catalogues d'infrastructure, du joueur, des flux et
de Comprendre ont des propriétaires et des invalidations explicites.

- Construire les géométries statiques en coordonnées monde au chargement du port
  ou lors d'une invalidation pertinente. Un mouvement de caméra actualise les
  matrices et paramètres, sans reconstruction ni retransfert des attributs.
- Conserver le joueur en coordonnées locales et actualiser sa transformation
  avec la pose interpolée. Seules les données visuelles variables peuvent
  modifier des attributs ; les ressources statiques restent identiques après chauffe.
- Libérer les ressources remplacées et appeler `dispose()` à la destruction du
  backend. La géométrie GLB partagée conserve sa durée de vie propre.
- En fonctionnement natif, éviter la construction du monde projeté complet.
  Conserver les projections et caches nécessaires au secours, aux overlays et
  au picking, ainsi que les constructeurs métriques partagés.

Une absence de WebGL2, une erreur d'initialisation, de chargement GLB ou de
reconstruction du port, ainsi qu'une perte de contexte, doivent produire un
diagnostic explicite puis activer le painter Canvas 2D. Le canvas natif est libéré ;
le routage ne remplace ni n'avance l'état physique. Un joueur invisible ne constitue
pas un secours acceptable : l'erreur asynchrone du GLB doit être relayée au produit.

## Joueur et mode Comprendre

Le GLB joueur est chargé une fois, sa géométrie reste partagée et son calage local
est conservé. Les équipements et cibles interactives utilisent les positions KJP.
Le rail de fargue du profil reste la référence du contour affiché et des
équipements ; le renderer ne déduit aucune enveloppe physique du maillage Three.
Le secours Canvas conserve ce contour, les cylindres de pare-battages et le picking.

En Navigation, le joueur conserve ses couleurs de sommets et sa coupe de
flottaison au plan monde `z=0,02 m`. Le clipping n'altère pas les attributs du GLB
et n'entraîne aucun transfert de géométrie par image.

Comprendre utilise une présentation radiographique. Les plages d'indices du GLB,
son empreinte et ses comptes de triangles sont vérifiés explicitement ; les
métadonnées de parties ne suffisent pas à déduire l'ordre des indices. La coque
translucide, la silhouette, le roof, la quille et le safran restent visibles selon
leurs rôles. Les détails du pont et `hull_underwater` restent cachés ; la coupe
des groupes quille/safran est levée dans cette vue.

Les flèches et contours de forces utilisent des instances persistantes alimentées
par les rapports physiques existants, avec les mêmes origines, vecteurs et échelles
de présentation. Leur longueur suit la contribution brute ; le renderer ne
stabilise pas artificiellement une force. L'hélice visuelle et les pivots
appartiennent aux ressources de présentation. Les pivots calculés par KJP peuvent
être hors coque et sont masqués quand la rotation est trop faible. Les survols
conservent noms et intensités ; le Canvas supérieur garde le jet d'hélice et le
repère du safran. Le secours Canvas reproduit cette hiérarchie aux mêmes positions.

## Validation et outillage

La [politique de validation](validation-levels.md) et [AGENTS.md](../AGENTS.md)
définissent le niveau proportionné au changement.

- Ressource, palette ou caméra locale : `npm run test:rendering`, contrôle du
  build concerné et inspection ciblée.
- Intégration native ou secours Canvas : `npm run test:renderer:quick`, page
  visible et vérification de l'interaction concernée.
- Qualification renderer explicitement demandée :
  `npm run test:renderer:qualification`, matrice
  `npm run qualify:renderer:native` et profil apparié
  `npm run profile:renderer:native -- --reference <HTML>`.
- Release : `npm run verify:release` une seule fois selon `AGENTS.md`.

| Commande | Usage |
| --- | --- |
| `npm run build:simulator` puis `npm run check:simulator` | régénération et cohérence du livrable |
| `npm run test:rendering` | ressources, caméra, palettes, persistance et libération |
| `npm run test:renderer:quick` | intégration native, GLB, composition, interactions et replis Canvas |
| `npm run validate:ui -- --product simulator --group <groupe>` | interactions ciblées, build et console |
| `npm run test:renderer:qualification` | qualification explicite : références, mutations, déterminisme et soak, niveau rapide inclus |
| `npm run qualify:renderer:native` | matrice explicite de navigateurs et formats |
| `npm run profile:renderer:native -- --reference <HTML>` | profil apparié avec une référence HTML explicitement fournie |
| `npm run capture:renderer:native-baseline -- --html <HTML>` | captures candidates temporaires d'un HTML, livrable courant par défaut |

Le profil conserve les scènes, états, caméras, DPR et timestamps appariés, l'ordre
alterné, les contrôles d'upload et le seuil p95 existant. `--quick` réduit son
protocole ; `--headless --allow-software` fournit un diagnostic logiciel qui ne
qualifie pas les performances matérielles. Le rapport identifie le chemin réel de
référence et les empreintes des deux HTML.
La référence peut être un HTML fourni ou celui extrait du tag historique selon
la notice de récupération ; elle est toujours passée explicitement à
`--reference`, sans sélection automatique d'une version historique.

Les captures indiquent le chemin et le SHA-256 de l'HTML lu. Un commit n'est
indiqué que si cet HTML correspond exactement à son fichier suivi dans HEAD.
Sans `--update`, les captures restent candidates ; ne pas actualiser une référence
pour masquer une divergence. Les métadonnées historiques des références natives
existantes ne sont pas réécrites.

La fidélité porte sur la présence, les dimensions, l'occlusion, la lisibilité,
l'information et les interactions. Les références raster natives protègent ce
backend ; les mutations significatives doivent rester détectées. Les snapshots
physiques, fonctions et trajectoires restent comparés exactement, indépendamment
du chemin de rendu. Une inspection visible ciblée complète les tests graphiques.
La fidélité native n'impose aucune identité de pixels avec Legacy. Une référence
raster native peut être exacte dans un environnement déterministe ; les contrôles
tolérants doivent aussi vérifier que les mutations significatives sont détectées.

Les matrices multi-navigateurs, mutations visuelles, cycles de ressources, soak
et profils sont coûteux et couvrent des risques distincts. Ils restent séparés
de `test:e2e` ; ne pas les ajouter à un contrôle local. Une release exécute
`verify:release` une seule fois ; ne pas lancer le niveau rapide avant la
qualification étendue qui l'inclut. Après modification du code, actualiser le
graphe avec `graphify update .`.

Les anciens backends et les preuves de migration sont accessibles uniquement
dans Git, selon la [notice de récupération](validation/threejs-migration-closure.md).
L'inventaire original des retraits, de leurs consommateurs et le manifeste de
reproduction sont conservés dans cette archive. Les décisions N1 à N6 restent
historiques ; le présent document définit le contrat du produit courant.
