# Clôture de la migration Three.js

Ce document est le manifeste de retrait et de reproduction associé au cadrage
de référence [`../threejs-renderer-migration.md`](../threejs-renderer-migration.md).
Il décrit l'état antérieur fixé par le tag `threejs-migration-legacy-final`, les
dépendances examinées et les preuves du produit nettoyé. Il ne remplace pas le
contrat d'architecture du cadrage.

## Référence historique reproductible

Le tag Git annoté `threejs-migration-legacy-final` pointe vers
`78fb7d148fe065d6fa2479dc8c1eaae151f755e1`, dernier état où Three natif,
Legacy WebGL et Three de compatibilité coexistent. Cet état a été constaté sur
la branche `codex/threejs-v2` avec un arbre propre avant le retrait.

| Artefact du tag | SHA-256 |
| --- | --- |
| `simulateur-port.html` | `d5b522731174ed9404f7a528686f9979acf0f141382920c7b3ccfa603e8ae223` |
| `kjp_sun_odyssey_36i.glb` | `b16e5d0c656e71a25ef12d4e6e278c7f9b358f35ddd75eeebb620fdffaba4dc9` |
| `package-lock.json` | `1f8dfee8fd6e39da5e733eb8349da3dcc4d7a2d2bd27a59ca810f9313acb4316` |
| `tests/visual-baselines/legacy/manifest.json` | `07ddb0f8bd9ebc6ed6f308806c44178dbe5c4b67232ca0de50820df6e1536106` |

Environnement consigné : macOS arm64, Node `v26.5.0`, npm `11.17.0`,
Playwright `1.61.1`, Three `0.186.0` / r186 et Chromium
`149.0.7827.55`. Le lockfile est l'autorité pour les dépendances. Les six scènes
du manifeste Legacy et les six scènes du manifeste natif emploient un viewport
1280 × 800, DPR 1 et le timestamp visuel 12 345 ms. Les limites historiques de
Firefox, WebKit, du matériel et des profils sont conservées dans le journal.

Pour reconstruire sans modifier la branche courante :

```sh
git worktree add --detach /tmp/kjp-threejs-legacy threejs-migration-legacy-final
cd /tmp/kjp-threejs-legacy
npm ci
npm run check:simulator
npm run capture:renderer-baseline
```

Le HTML autonome du tag peut aussi être exécuté directement. Le contrôle de
clôture a extrait le tag dans un répertoire isolé, réutilisé les dépendances du
lockfile courant identique, validé la reconstruction du HTML et rejoué la capture
historique : 6/6 empreintes Legacy identiques, sans mise à jour. Le worktree
temporaire peut être supprimé après inspection ;
le tag et les objets Git constituent la référence durable.

## Inventaire et classification

Chaque retrait ci-dessous a été précédé d'une recherche de ses imports, globals,
paramètres URL, scripts et tests. Une entrée « archiver » reste accessible dans
le tag et n'est plus une dépendance du produit courant.

| Élément | Consommateurs avant clôture | Classement et justification |
| --- | --- | --- |
| `createDepthRenderer`, canvas `worldScene`, sélection `legacy` | boucle produit, repli N6, tests d'activation | **Supprimer du produit** : ancien backend WebGL2. Le painter existant dessine maintenant directement sur le Canvas 2D de secours. |
| `three-surfaces.mjs`, `surface-frame.mjs`, `surface-geometry.mjs`, `render-frame.cjs` | Three de compatibilité et bancs exacts | **Archiver** puis **supprimer du produit** : chaîne projetée exclusive aux backends retirés. Aucun overlay, picking ou secours ne l'importait. |
| `surface-comparison.mjs`, `surface-profile.mjs`, `three-smoke.js` | comparateurs de migration et smoke de façade | **Archiver** puis **supprimer** : leurs garanties utiles sont reprises par les tests natifs, les références et le profil apparié. |
| `native-static-resources.mjs`, `native-static-prototype.mjs` | prototype N1 devenu renderer visible | **Adapter** : le prototype a été consolidé sous `native-world-renderer.mjs`; son contrat de persistance et ses diagnostics sont conservés. |
| `rendering/index.js` et globals `KJPThree*` | façade du bundle et hooks de test | **Adapter** : exposer seulement la caméra et la fabrique native utilisées par le produit. |
| `profile-simulator-renderers.js`, `profile-simulator-active-renderers.js` | comparaison Legacy/compatibilité | **Archiver** puis **supprimer** : remplacés par le profil référence native/candidate du chemin complet. |
| `capture-simulator-render-baseline.js` | production des références Legacy | **Archiver** puis **supprimer des scripts actifs** : les PNG et leur manifeste restent intacts ; la capture pérenne cible le natif. |
| `tests/render-frame.test.js`, `tests/native-infrastructure.test.js` | contrats du compilateur projeté et prototype | **Archiver** puis **retirer** : les contrats natifs durables sont regroupés dans `native-rendering.test.js`; les assertions exclusives à Legacy restent au tag. |
| Comparaisons raster Legacy et intermédiaires projetés dans `simulateur-port.test.js` | suite fonctionnelle principale | **Archiver** puis **retirer** : la suite principale démarre sur le natif ; les oracles exacts de simulation et de trajectoires restent inchangés. |
| `native-infrastructure-resources.mjs`, `native-flow-resources.mjs` | monde Three natif | **Conserver** : géométries métriques persistantes, palettes et flux visibles. |
| `native-player-model.mjs`, `native-player-resources.mjs`, GLB | bateau joueur natif | **Conserver** : forme validée, chargement unique, géométrie partagée, pose locale et cycle de vie explicite. |
| `three-camera.mjs`, `cameraBasis`, interpolation et boucle existantes | natif et projections Canvas | **Conserver** : point de vue et progression KJP restent propriétaires ; aucun calcul Three n'autorise la simulation. |
| `addBoatMesh`, `boatShape`, géométries métriques et caches de projection | bateaux statiques natifs, secours Canvas, aides et rapports | **Conserver** : helpers partagés avec des consommateurs actifs. Leur origine historique ne justifie aucun retrait. |
| Canvas `scene`, overlays, `drawMooringLayer`, picking et `hitTargets` | aides, aussières, pare-battages, souris et tactile | **Conserver** : garanties fonctionnelles. Le renderer Three garde `pointer-events: none`; aucun raycasting ne les remplace. |
| Paramètre `?renderer=canvas` et erreurs natives | diagnostic et repli | **Adapter** : secours direct pour WebGL2 absent, initialisation, GLB, reconstruction et perte de contexte. |
| `tests/visual-baselines/legacy/` | aucun test ou bundle courant | **Archiver** : référence historique intacte, volontairement conservée et justifiée par la reproductibilité. |
| `tests/visual-baselines/native/` et scènes partagées | qualification native | **Conserver et adapter** : oracles propres au backend courant, avec mutations contrôlant omission, déplacement, miniature et lisibilité. |
| générateur de ports | produit autonome | **Conserver sans modification fonctionnelle** : hors périmètre du nettoyage renderer. |

## Garanties transférées

- `tests/simulateur-port.test.js` conserve les commandes, interactions,
  scénarios, imports, unités, trajectoires étalons et assertions physiques ; il
  les exerce au démarrage sur le renderer natif réel.
- `tests/native-rendering.test.js` vérifie rapidement la persistance des
  géométries, palettes, libération, joueur local et caméra. Un mouvement de
  caméra ne modifie ni identité, contenu, version d'attribut ni compteur
  d'upload statique après chauffe.
- `tests/native-world-renderer.test.js` couvre la composition avec le Canvas 2D,
  le picking, les cycles native/Canvas, le grand port et la visibilité séparée
  du vent et du courant en vues dessus et skipper.
- `tests/native-player.test.js` couvre le GLB, son calage, son chargement unique,
  les équipements existants, les thèmes, vues et DPR.
- `tests/native-renderer-activation.test.js` couvre le démarrage produit et les
  replis WebGL2, GLB, reconstruction et contexte perdu, puis vérifie l'état et
  une interaction réelle en Canvas.
- `tests/native-renderer-qualification.test.js` compare le natif à ses propres
  références déterministes et vérifie que les mutations significatives sont
  détectées. La progression temporelle contrôlée compare deux exécutions
  natives indépendantes.
- `profile-simulator-native-renderer.js` alterne référence et candidate sur les
  mêmes scènes, états, caméras, DPR et timestamps. Il sépare la chauffe et les
  uploads de la mesure, exige zéro retransfert statique et conserve une capture
  visible.

## Hiérarchie et coût des tests renderer

Les durées sont des ordres de grandeur observés sur la machine de clôture et
doivent être remesurées après une évolution de l'environnement.

| Commande | Risque et assertions propres | Durée observée | Déclencheur |
| --- | --- | --- | --- |
| `npm run test:rendering` | ressources, attributs, palettes, libération, caméra | ~0,5 s | modification locale de rendu |
| `npm run test:e2e` | fonctions usuelles, physique intégrée et trajectoires sur natif | 78,5 s lors de la release finale | changement fonctionnel du simulateur ou release |
| `npm run test:renderer:quick` | monde, GLB, interactions et secours intégrés | ~85 s | changement intégré du renderer ou du fallback |
| `npm run test:renderer:qualification` | niveau rapide + références, mutations, déterminisme et soak 1 200 images | 340,1 s avec soak | qualification renderer explicite et release |
| `npm run qualify:renderer:native` | Chromium, Firefox et WebKit sur trois formats | 9 cas, environ 2 min | matrice navigateur/format explicite |
| `npm run profile:renderer:native` | profil apparié du chemin complet et rendu visible | dépend du protocole ; 12 paires en mode complet | performance ou clôture ; pas pour un patch local |
| `npm run verify:release` | les deux produits, physique, fonctionnel et qualification renderer une fois | environ 6 min 55 s avant ajout du soak explicite | release seulement |

Les imports renderer lourds ne sont plus dans `test:e2e`. Les matrices, mutations,
cycles de ressources, soak et performances couvrent chacun un risque distinct et
restent sélectionnables. Les centaines de comparaisons raster/intermédiaires dont
l'unique objet était la parité avec Legacy sont archivées. Une sélection vide,
un test ignoré ou un contrôle non lancé est consigné comme non exécuté.

## Résultats de clôture

Le produit nettoyé est fixé par `8f9dcb8` ; les stabilisations d'observation de
la suite fonctionnelle sont dans `11b0d7a` et le soak pérenne dans `0eb10d0`.
Le HTML testé a le SHA-256
`1b62901a473663f31f90ffbf6820fb879f1f80cc62fbcccaaccd4070370ec8f1`.

| Contrôle | Résultat |
| --- | --- |
| Archive isolée | `check:simulator` réussi puis 6/6 empreintes Legacy identiques depuis le tag, sans mise à jour |
| `npm run verify:release` hors sandbox | réussi sur `11b0d7a` : builds simulateur/générateur, 33/33 ports, 42/42 physique, 47/47 fonctionnel natif, 11/11 renderer et 24/24 générateur |
| `npm run test:renderer:qualification` après ajout du soak | 12/12 sur `0eb10d0`, dont 1 200 images skipper, 20,00 s simulées, 532 géométries stables, une boucle et aucun upload après chauffe |
| Matrice native | 9/9 : Chromium 149, Firefox 151 et WebKit 26.5, chacun en bureau DPR 1, compact DPR 2 et mobile DPR 3 demandé (DPR effectif borné à 2 par KJP) |
| Fidélité native | six scènes DPR 1 identiques à leur référence native ; deux scènes DPR 2 dans les seuils ; mutations d'omission, déplacement, miniature et illisibilité détectées |
| Grand port | vent/courant visibles : 491/159 pixels en vue dessus et 571/277 en vue skipper |
| Profil matériel apparié | 12 paires Apple M1/Metal ; états, caméras et images identiques ; zéro upload après chauffe ; ratio p95 médian candidate/référence `0,8982`, seuil `≤ 1,15` réussi |
| Contrôles statiques | build autonome cohérent, syntaxe Node et `git diff --check` réussis ; aucun ancien backend dans imports, globals, routage, scripts actifs ou HTML |
| Graphify | mise à jour AST réussie après les changements de code |

Les tentatives échouées restent distinguées des validations : un premier
`verify:release` a été interrompu avant Chromium par la sandbox macOS ; la
relance hors sandbox a mis en évidence trois attentes temporelles instables de
test, ensuite rendues déterministes sans changer les garanties. La relance
fonctionnelle a fait 47/47, puis la release complète a réussi. La première
matrice signalait la perte volontaire du contexte WebGL de pré-vérification ;
ce contexte inutile a été retiré et les neuf cas ont réussi. Le premier profil
a exposé un tampon `git show` trop petit puis un sélecteur propre au nouveau nom
du canvas ; le banc corrigé a ensuite produit les douze paires archivées.

Non exécutés : appareils physiques, navigateurs système hors moteurs Playwright,
chronométrage GPU et compositing, autre GPU que l'Apple M1/Metal, et soak de
plus de 20 secondes simulées. Ces limites ne masquent aucun échec connu. Toute
dépendance historique conservée est celle justifiée dans l'inventaire : baselines
Legacy, tag reproductible et helpers partagés encore consommés. La clôture est
validée sans modification du moteur, des profils, collisions, commandes,
interpolation ou trajectoires étalons.
