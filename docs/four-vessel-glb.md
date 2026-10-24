# Quatre modèles de bateaux — phase 2

**Remplacements visuels ultérieurs :** le Sun Odyssey 24.2 affiche le fichier utilisateur `KJP_SunOdyssey242.glb` version 2 ; le Pogo/Class40 affiche `KJP_Class40_lazybag.glb` ; la Contessa utilise `KJP_Contessa26_rouge_lazybag.glb`, qui conserve sa peinture rouge ; l’Oceanis affiche `KJP_Oceanis48_lazybag.glb`. Ces trois derniers dérivés corrigent uniquement le lazybag ; les sources fournies restent intactes. Voir les notices d’intégration [Sun Odyssey 24.2](sun-odyssey-24-2-glb.md), [Class40](class40-glb.md), [Contessa](contessa26-glb.md) et [Oceanis](oceanis48-glb.md). Les mesures géométriques et performances ci-dessous restent les preuves historiques de la livraison initiale ; elles décrivent leurs anciens GLB procéduraux. Les profils physiques acceptés restent inchangés.

La phase 2 est autorisée par la validation utilisateur « comportements validés. continue » du 21 octobre 2026. Les comportements livrés en [phase 1](physics/four-vessel-validation.md) restent figés. Le petit croiseur retenu est le **Sun Odyssey 24.2**, conformément à l’arbitrage utilisateur remplaçant le SO26 bi-safran.

## Ressources et fabrication

Les quatre ressources sont produites localement par [build-vessel-models.mjs](../scripts/build-vessel-models.mjs), avec Three **r186**, sans téléchargement, texture, dépendance distante ou reprise d’un ancien maillage. Chaque bateau possède ses propres dimensions de carène, roof, cockpit, gréement et équipements de présentation. Les fonctions de construction sont partagées ; aucun modèle existant n’est redimensionné.

```sh
npm run build:vessel-models
npm run check:vessel-models
npm run build:simulator
npm run test:rendering
```

Le mode `--check` compare les octets attendus des GLB et le manifeste sans écrire, ni modifier les dates des fichiers. Le générateur refuse un profil dont l’empreinte compilée diffère de celle acceptée en phase 1. Les empreintes binaires et plages d’indices du catalogue natif sont contrôlées indépendamment des métadonnées GLB.

| Bateau | Fichier | Triangles | Architecture représentée |
|---|---|---:|---|
| Sun Odyssey 24.2 | `kjp_sun_odyssey_24_2.glb` | 1 562 | Petit croiseur, barre franche, quille fixe, un safran |
| Contessa 26 | `kjp_contessa_26.glb` | 1 550 | Coque étroite, quille longue continue, safran distinct associé |
| Pogo 40 S4 | `kjp_pogo_40_s4.glb` | 1 698 | Coque large à bouchains, cockpit ouvert, deux safrans écartés |
| Oceanis 48 | `kjp_oceanis_48.glb` | 1 986 | Coque volumineuse, plateforme arrière, deux roues, un seul safran |

Chaque fichier contient un maillage indexé, une primitive, un matériau source, des normales et des couleurs RGBA. Les voiles sont affalées et aucun bimini ou capote n’est déployé. Les safrans GLB restent statiques, comme ceux des ressources historiques. Taquets fonctionnels, pare-battages, hélice animée et aussières restent des objets KJP séparés ; leurs positions, capacités et forces n’ont pas changé.

Les roofs, fenêtres, gréements et détails de cockpit sont des interprétations stylisées des configurations documentées en phase 1. Ils ne constituent pas des relevés de chantier. Aucun document nautique supplémentaire n’a été utilisé pour modifier une donnée physique pendant cette phase.

## Mesures réellement exportées

Les mesures proviennent des positions `float32` et indices relus dans les GLB, puis transformés comme dans le produit. Le fichier [four-vessel-glb-geometry.json](four-vessel-glb-geometry.json) contient les SHA256, FNV, bornes, dimensions, surfaces projetées, centres d’appendices et plages de parties de chaque ressource.

| Bateau | Coque (m) | LOA coque et équipements (m) | Largeur (m) | Flottaison (m) | Tirant d’eau (m) |
|---|---:|---:|---:|---:|---:|
| SO24.2 | 7,200 | 7,300 | 2,490 | 6,610 | 1,100 |
| Contessa | 7,770 | 7,770 | 2,280 | 6,080 | 1,210 |
| Pogo | 12,190 | 12,190 | 4,420 | 10,900 | 3,000 |
| Oceanis | 14,270 | 14,600 | 4,740 | 13,860 | 2,170 |

Les tolérances sont 1 cm sur les dimensions et le calage, 2 cm sur les centres d’appendices et 2 % sur leurs surfaces projetées. Les tests calculent les intersections réelles des triangles avec la flottaison, les projections de faces fermées et les centres pondérés. Ils détectent aussi indices hors bornes, triangles dégénérés et normales opposées. Les valeurs de tolérance ne mesurent pas l’incertitude du bateau réel.

La quille Contessa suit le contour continu accepté en phase 1 : aire projetée **3,26925 m²**, centre longitudinal **−0,937 m** et vertical **−0,748 m**. Ses sept sections physiques ne deviennent pas sept ailerons visuels. Le Pogo conserve les deux safrans de **0,49 m²** à **y = ±1,74 m**. Les deux roues Oceanis ne créent aucune gouverne supplémentaire.

Deux distinctions sont conservées explicitement :

- SO24.2 : coque documentaire de 7,20 m, LOA de 7,30 m avec balcon ; enveloppe fonctionnelle de profil de 7,10 m. La géométrie ne remplace pas cette enveloppe physique.
- Pogo : les positions et cordes acceptées placent les safrans légèrement derrière la coque. L’enveloppe complète du maillage avec appendices mesure **12,279 m**, pour une coque/LOA de référence de **12,190 m**. Les safrans n’ont pas été déplacés pour réduire cette enveloppe.

Les axes source sont +Y vertical, +Z avant, en mètres, flottaison à Y = 0. Le transform de présentation vaut rotation `[π/2, π/2, 0]`, échelle 1, translation `[0, 0, 0,02]` : un point physique `[x, y, z]` devient `[x, −y, z + 0,02]` dans la scène. Le SO36i et le Dufour gardent leurs ressources et transforms antérieurs, y compris le décalage longitudinal du Dufour.

## Intégration et secours

Le catalogue [native-player-model.mjs](../src/simulateur-port/rendering/native-player-model.mjs) ajoute uniquement les quatre ressources, leurs empreintes et rôles. Le chargeur, cache, matériaux de présentation, renderer, caméra et boucle existants sont conservés. Le HTML autonome embarque les ressources ; aucune requête GLB externe n’est nécessaire.

Navigation emploie les couleurs des sommets et le masquage sous la flottaison existants. Comprendre conserve les cinq rôles `hull`, `silhouette`, `organ`, `roof`, `hidden` : quille et safrans restent visibles en radiographie, le gréement et les accessoires disparaissent, les flèches et interactions restent sur les propriétaires KJP.

Le secours Canvas reste une silhouette simplifiée issue du profil actif. Il représente la quille longue Contessa par son contour continu, les deux safrans Pogo aux bonnes positions, et les autres appendices par leurs surfaces et envergures acceptées. Ce secours ne lit aucune géométrie Three. Il ne reproduit pas les détails de roof et de cockpit des GLB.

Le sélecteur conserve le SO36i par défaut, mémorise les six profils et garde le port lors des changements. Les quatre nouveaux profils ont leur descriptif et un statut expérimental FR/EN/BR. Leur physique reste « plausible mais non calibrée » ; l’ajout d’un modèle reconnaissable ne change pas ce verdict.

## Vérifications physiques et fonctionnelles

La preuve [physics-freeze-and-replay.json](four-vessel-glb-validation/physics-freeze-and-replay.json) conserve les empreintes acceptées du moteur, du fichier de profils et des six profils compilés. Le moteur reste en **6.0.0**, les profils au schéma **4** et Three à **0.186.0**.

Les **720 scénarios** de phase 1 ont été rejoués avec les mêmes commandes, environnements et pas : **720 lignes de métriques et empreintes d’état final strictement identiques**, soit 120 par bateau. Les segments hors domaine gardent leurs résultats et statuts initiaux ; aucune mesure n’est remplacée par zéro.

[four-vessel-player.test.js](../tests/four-vessel-player.test.js) vérifie sur les six bateaux les commandes clavier, le picking Canvas des taquets avec GLB présent, les axes de gouvernes, Translation/Rotation, le chargement unique et la réutilisation de la même géométrie après changements de bateau/backend. Il compare exactement les états physiques et trajectoires natifs, Canvas explicite et secours.

Les erreurs de chargement GLB, l’absence de WebGL2 et une perte de contexte injectée produisent le diagnostic attendu et le secours Canvas sur chacun des six bateaux, sans changement d’état. La perte de contexte est un événement synthétique de test ; aucun défaut matériel réel n’est revendiqué. Le démarrage ordinaire des quatre modèles est également vérifié sans API de recette.

## Performance et ressources

Comparaison matérielle sur **Apple M1**, Darwin 24.6.0, Chromium 149.0.7827.55, **ANGLE Metal**, sans renderer logiciel. Même port pédagogique, caméra KJP, état initial et commandes ; viewport **1440 × 1000**, DPR 1 (canvas effectif 1114 × 934). Pour chacun des six bateaux et trois modes : **60 images de chauffe, 300 mesurées, trois répétitions alternées**, soit 54 paires et 108 exécutions. Chaque exécution ouvre une page isolée pour éviter la contamination du cache et des compteurs.

Les valeurs ci-dessous sont les médianes des trois mesures par version, avant → après. Le ratio est la médiane des trois **ratios appariés** ; il peut différer du quotient des deux p95 médians. Les pics isolés, échantillons et compteurs complets sont conservés dans le [rapport compact](four-vessel-glb-validation/performance.json) et son archive brute.

| Bateau | Vue | CPU médiane (ms) | CPU p95 (ms) | GPU p95 WebGL (ms) | Ratio p95 apparié |
|---|---|---:|---:|---:|---:|
| SO36i | Navigation | 2,0 → 2,0 | 3,1 → 2,5 | 0,637 → 0,576 | 1,042 |
| SO36i | Translation | 2,5 → 2,5 | 3,7 → 3,1 | 0,637 → 0,597 | 0,969 |
| SO36i | Rotation | 2,7 → 2,5 | 5,4 → 3,1 | 0,641 → 0,606 | 0,815 |
| Dufour310 | Navigation | 2,2 → 2,1 | 3,0 → 2,8 | 0,624 → 0,612 | 0,933 |
| Dufour310 | Translation | 2,4 → 2,2 | 3,5 → 2,9 | 0,608 → 0,597 | 0,857 |
| Dufour310 | Rotation | 2,3 → 2,4 | 2,9 → 2,9 | 0,586 → 0,621 | 1,036 |
| SO24.2 | Navigation | 1,8 → 1,8 | 2,2 → 2,2 | 0,530 → 0,533 | 1,000 |
| SO24.2 | Translation | 2,0 → 2,0 | 2,5 → 2,7 | 0,591 → 0,576 | 1,040 |
| SO24.2 | Rotation | 2,2 → 2,2 | 2,8 → 2,8 | 0,583 → 0,589 | 1,000 |
| Contessa26 | Navigation | 1,8 → 1,9 | 2,2 → 2,4 | 0,526 → 0,568 | 1,087 |
| Contessa26 | Translation | 2,1 → 2,2 | 2,9 → 2,8 | 0,597 → 0,593 | 0,966 |
| Contessa26 | Rotation | 2,2 → 2,3 | 2,7 → 2,8 | 0,597 → 0,606 | 1,074 |
| Pogo40S4 | Navigation | 1,8 → 1,8 | 2,3 → 2,3 | 0,545 → 0,548 | 1,000 |
| Pogo40S4 | Translation | 2,1 → 2,2 | 2,7 → 2,8 | 0,589 → 0,601 | 1,077 |
| Pogo40S4 | Rotation | 2,2 → 2,4 | 2,8 → 3,2 | 0,601 → 0,611 | 1,143 |
| Oceanis48 | Navigation | 1,8 → 1,9 | 2,4 → 2,6 | 0,548 → 0,573 | 1,083 |
| Oceanis48 | Translation | 2,1 → 2,2 | 2,7 → 2,8 | 0,580 → 0,597 | 1,037 |
| Oceanis48 | Rotation | 2,3 → 2,3 | 2,9 → 3,0 | 0,610 → 0,615 | 1,034 |

Le plus grand ratio CPU p95 apparié des nouveaux modèles vaut **1,143** (Pogo/Rotation, +0,4 ms médian), sous le seuil renderer existant de **+15 %**. Aucun ancien bateau ne dépasse de manière reproductible les deux seuils du plan (**+10 % et +0,5 ms**). Les variations des anciennes scènes, dont le code de rendu est conservé, ne prouvent pas un gain de performance.

| Bateau | Vue | Dessins avant → après | Triangles scène avant → après |
|---|---|---:|---:|
| SO36i | Navigation | 365 → 365 | 18268 → 18268 |
| SO36i | Translation | 402 → 402 | 20378 → 20378 |
| SO36i | Rotation | 406 → 406 | 26626 → 26626 |
| Dufour310 | Navigation | 369 → 369 | 18338 → 18338 |
| Dufour310 | Translation | 406 → 406 | 20430 → 20430 |
| Dufour310 | Rotation | 410 → 410 | 27174 → 27174 |
| SO24.2 | Navigation | 382 → 369 | 17281 → 17930 |
| SO24.2 | Translation | 404 → 402 | 20203 → 20242 |
| SO24.2 | Rotation | 408 → 406 | 26451 → 26490 |
| Contessa26 | Navigation | 382 → 369 | 17281 → 17918 |
| Contessa26 | Translation | 404 → 402 | 19707 → 19746 |
| Contessa26 | Rotation | 408 → 406 | 29427 → 29466 |
| Pogo40S4 | Navigation | 374 → 361 | 17309 → 17970 |
| Pogo40S4 | Translation | 396 → 394 | 20231 → 20250 |
| Pogo40S4 | Rotation | 400 → 398 | 26975 → 26994 |
| Oceanis48 | Navigation | 366 → 353 | 17211 → 18160 |
| Oceanis48 | Translation | 388 → 386 | 22117 → 22112 |
| Oceanis48 | Rotation | 392 → 390 | 26381 → 26376 |

Les compteurs des deux anciens bateaux sont exactement conservés dans chaque paire. Les nouveaux modèles réduisent Navigation de **13 appels de dessin** et les vues Comprendre de **2 appels** par rapport aux silhouettes. Le coût supplémentaire Navigation va de **637 à 949 triangles de scène** ; les vues Comprendre varient de −5 à +39 triangles. La scène entière est comptée ici, distinctement des 1 500 à 3 000 triangles autorisés par modèle.

Pour chaque nouveau bateau, les compteurs Three passent de 522 à 510 géométries en Navigation, de 528 à 516 en Translation et de 530 à 518 en Rotation. Les textures restent à 0 ; les matériaux passent de 65 à 56 en Navigation et à 60 dans Comprendre. Il s’agit de compteurs disponibles, pas de mesures exhaustives de mémoire GPU. Les relevés de mémoire JavaScript disponibles restent dans les rapports.

Après chauffe, aucune allocation/transmission de géométrie statique, texture ou shader n’est détectée. Les mises à jour des matrices des flèches pendant le mouvement sont consignées séparément : 2 700 appels `bufferSubData`, soit 8 064 000 octets sur 300 images Comprendre, pour les deux versions. Une orbite de 20 images à état physique figé produit **zéro transfert GPU**, sans changement des géométries, états ou caméras appariées.

Le CPU mesure le callback KJP synchrone complet. Les durées GPU sont de vraies requêtes `EXT_disjoint_timer_query_webgl2` asynchrones : **32 400 échantillons valides**, aucun résultat rejeté ou disjoint. Leurs médianes/p95 et échantillons sont archivés. Elles excluent la composition CSS de l’eau et le Canvas supérieur. Les résultats ne garantissent pas la cadence sur toute autre machine.

Des pointes CPU isolées jusqu’à **58,8 ms** restent dans les résultats : 7 images candidates et 3 images de référence dépassent 16,67 ms sur 16 200 images par version. Elles ne sont pas reproductibles au seuil bloquant. Les p95 de certaines répétitions montent à 6,6 ms ; la table présente leur médiane sur les trois répétitions et ne masque pas ces extrêmes, détaillés dans `performance-analysis.json` de l’archive.

Reproduction : utiliser `profile-four-vessels.cjs` dans le dossier de preuves avec `--reference phase1-reference.html --candidate phase2-candidate.html --out resultat.json` (chemins absolus). Les SHA des deux HTML sont vérifiés avant et après la mesure.

## Contrôles exécutés

- `npm run check:simulator`
- `npm run check:vessel-models`
- `npm run test:rendering` : 14 contrôles réussis, dont les huit tests indépendants des nouveaux GLB.
- `npm run test:renderer:quick` : 19 contrôles réussis, incluant les ressources historiques, les six bateaux et les chemins de secours.
- `npm run validate:ui -- --product simulator --case controls.60` : un cas ciblé réussi, sélection/persistance/réinitialisation/conservation du port pour six profils et descriptifs FR/EN/BR.
- `node --test tests/validation-routing.test.js tests/simulator-i18n-unit.test.js` : huit contrôles réussis.
- `node scripts/check-simulator-i18n.js` : trois langues et 518 messages validés.
- Runner commun sans DOM : 720 scénarios rejoués, zéro différence avec la phase 1.
- Inspection des quatre modèles en Navigation, Translation, Rotation, secours Canvas et projections des cinq vues : aucune erreur console.
- `graphify update .` : graphe de code actualisé, 2 460 nœuds et 5 207 relations.

Aucune qualification globale de release n’a été lancée. Aucun changement du moteur ou des profils n’a été nécessaire. Une évolution future de la physique ou d’une configuration validée demande un nouvel accord.

## Essai manuel et preuves visuelles

Ouvrir `simulateur-port.html`, choisir successivement les quatre bateaux dans les réglages, passer en Navigation puis Comprendre/Translation et Rotation. Incliner la caméra pour examiner les appendices et la quille longue ; les deux axes du Pogo et les deux roues de l’Oceanis restent distincts. Essayer la barre, une aussière et un changement de bateau, puis recharger pour vérifier la sélection mémorisée.

Les captures, projections, mesures brutes de performance et scripts de reproduction sont archivés dans le répertoire `four-vessel-phase2` indiqué par [artifacts.json](four-vessel-glb-validation/artifacts.json). Les images sont des preuves de présentation ; elles ne valident pas l’hydrodynamique réelle.

Fichiers de phase 2 : quatre GLB racine ; générateur local ; manifeste géométrique ; catalogue GLB ; données de présentation et silhouettes Canvas dans `template.html` ; trois catalogues de traduction ; deux nouveaux fichiers de tests et extension du cas `controls.60` ; commandes npm et routage de validation ; HTML autonome reconstruit ; présent rapport et preuves associées. Les changements préexistants du générateur de ports sont préservés. Un commit concurrent du générateur a avancé HEAD depuis le gel initial ; il ne modifie pas les empreintes physiques vérifiées.

**Livraison locale uniquement : aucune publication, fusion ou release GitHub.**
