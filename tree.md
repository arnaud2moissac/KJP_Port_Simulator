# Arborescence du projet KJP

Inventaire du dépôt au 7 octobre 2026 : **212 fichiers** et
**37 répertoires**, chacun accompagné d’une description courte.
L’arbre repose sur les fichiers suivis par Git (`git ls-files`), complétés par
le présent `tree.md`, destiné à être versionné. Les répertoires correspondent
aux chemins de ces fichiers ; Git ne versionne pas les répertoires vides.

Les caches, les dépendances installées, les sorties locales ignorées et les
autres fichiers non suivis sont exclus. Cela comprend notamment `graphify-out/`,
`.validation-runs/`, `.agents/checkpoints/`, `node_modules/` et `.DS_Store`.
Les métadonnées internes de `.git/` sont également exclues.

Les sources éditables sont dans `src/` ; les deux fichiers HTML à la racine
sont des livrables générés et versionnés. Les références visuelles des tests,
les exports documentaires et les archives bibliographiques sont inclus, car
ils font partie du dépôt. Cet inventaire est un instantané sans mise à jour
automatique.

```text
KJP_Port_Simulator/ — Simulateur nautique et générateur de ports autonomes.
├── .codex/ — Configuration, hooks et skills Codex propres au projet.
│   ├── skills/ — Instructions spécialisées disponibles dans ce dépôt.
│   │   └── graphify/ — Skill de navigation dans le graphe de connaissances.
│   │       ├── references/ — Procédures complémentaires du skill Graphify.
│   │       │   ├── add-watch.md — Procédures Graphify d'ajout de sources et de surveillance.
│   │       │   ├── exports.md — Procédures d'export des vues et formats Graphify.
│   │       │   ├── extraction-spec.md — Spécification des entités et relations extraites par Graphify.
│   │       │   ├── github-and-merge.md — Procédures Graphify pour les dépôts GitHub et les fusions de graphes.
│   │       │   ├── hooks.md — Intégration de Graphify aux hooks et aux agents.
│   │       │   ├── query.md — Navigation et interrogation du graphe de connaissances.
│   │       │   ├── transcribe.md — Procédure de transcription des contenus audio et vidéo.
│   │       │   └── update.md — Procédures de mise à jour et de regroupement du graphe.
│   │       ├── .graphify_version — Version installée du skill Graphify.
│   │       └── SKILL.md — Instructions du skill de graphe de connaissances.
│   ├── hooks.json — Configuration des hooks Codex et de l'intégration Graphify.
│   └── hooks.json.graphify-bak — Sauvegarde de la configuration des hooks avant intégration Graphify.
├── assets/ — Ressources graphiques communes aux produits.
│   └── kjp-port-simulator-logo.png — Logo du projet intégré aux interfaces.
├── bibliographie/ — Sources externes archivées et registre bibliographique.
│   ├── A Diesel Engine Modelling Approach for Ship Propulsion Real-Time Simulators.pdf — Source archivée : modélisation des moteurs diesel pour la simulation de propulsion.
│   ├── biblio.txt — Registre des sources, de leur rôle et de leur archivage.
│   ├── brezhoneg21-simulateur.html — Source archivée : terminologie scientifique bretonne du simulateur.
│   ├── delefortrie-2022-rudder-forces.pdf — Source archivée : référence scientifique sur les efforts de gouvernail.
│   ├── esa-sentinel-2.html — Source archivée : présentation des images et missions Sentinel-2.
│   ├── fossen-marine-craft-model.html — Source archivée : modèle dynamique de référence des véhicules marins.
│   ├── Four-Quadrant Propeller Modeling A Low-Order Harmonic Approximation.pdf — Source archivée : modélisation des hélices dans les quatre quadrants.
│   ├── geriafurch-inertiezh.html — Source archivée : référence terminologique bretonne pour l'inertie.
│   ├── geriafurch-rod-vins.html — Source archivée : référence terminologique bretonne pour l'hélice.
│   ├── google-map-tile-policy.html — Source archivée : règles d'utilisation des tuiles Google Maps.
│   ├── hse-push-pull-assessment.html — Source archivée : évaluation ergonomique des efforts de poussée et traction.
│   ├── iala-r1001.html — Source archivée : référence du système de balisage maritime IALA.
│   ├── ign-bd-ortho-metadata.html — Source archivée : métadonnées de l'orthophotographie IGN.
│   ├── ittc-75-02-06-03-2024.pdf — Source archivée : édition 2024 de la procédure ITTC de manœuvrabilité.
│   ├── ittc-75-02-06-03.pdf — Source archivée : procédure ITTC de référence pour les essais de manœuvrabilité.
│   ├── ittc-stopping-test.pdf — Source archivée : référence ITTC des essais d'arrêt.
│   ├── jeanneau-so36i-inventaire-2010-fr.pdf — Source archivée : inventaire français 2010 du Sun Odyssey 36i.
│   ├── jeanneau-sun-odyssey-36i-inventory.pdf — Source archivée : inventaire constructeur du Sun Odyssey 36i.
│   ├── jstage-low-speed-mmg.html — Source archivée : modèle MMG simplifié pour les manœuvres à faible vitesse.
│   ├── la-trinite-passage-brochure.pdf — Source archivée : brochure d'accueil et de passage du port de La Trinité.
│   ├── lexique-maritime-v1-2025.pdf — Source archivée : lexique maritime de référence, édition 2025.
│   ├── liros-moorex.html — Source archivée : caractéristiques des cordages d'amarrage LIROS Moorex.
│   ├── liros-technical-info.html — Source archivée : informations techniques des cordages LIROS.
│   ├── marin-cross-flow-drag.html — Source archivée : référence sur la traînée transversale d'un navire en manœuvre.
│   ├── mca-mgn-301-appendix-2.html — Source archivée : annexe de recommandations nautiques de la MCA.
│   ├── mmg-standard.html — Source archivée : présentation de la méthode MMG de prédiction des manœuvres.
│   ├── openseamap-qgis.html — Source archivée : utilisation des données OpenSeaMap dans QGIS.
│   ├── osm-seamark-buoys.html — Source archivée : description des bouées dans OpenStreetMap.
│   ├── osm-seamark-item-q6753.html — Source archivée : description de l'objet ponton/quai dans OpenStreetMap.
│   ├── osm-seamark-object-usage.html — Source archivée : règles d'utilisation des objets de balisage OpenStreetMap.
│   ├── osm-tile-policy.html — Source archivée : politique d'utilisation des tuiles OpenStreetMap.
│   ├── overpass-api.html — Source archivée : documentation de l'API de requêtes OpenStreetMap Overpass.
│   ├── overpass-command-line.html — Source archivée : utilisation d'Overpass en ligne de commande.
│   ├── overpass-common-queries.html — Source archivée : exemples de requêtes communes Overpass.
│   ├── owasp-denial-of-service.html — Source archivée : prévention des dénis de service lors du traitement des données.
│   ├── owasp-dom-xss-prevention.html — Source archivée : prévention des injections XSS dans le DOM.
│   ├── owasp-prototype-pollution-prevention.html — Source archivée : prévention de la pollution des prototypes JavaScript.
│   ├── polyform-f-series-fenders.html — Source archivée : caractéristiques des pare-battages Polyform série F.
│   ├── polyform-fender-inflation.html — Source archivée : recommandations de gonflage des pare-battages Polyform.
│   ├── rya-med-mooring.html — Source archivée : guide de l'amarrage méditerranéen cul à quai.
│   └── uscg-boat-crew-handbook.pdf — Source archivée : manuel de l'US Coast Guard sur la conduite et les manœuvres.
├── docs/ — Documentation utilisateur, technique et études du projet.
│   ├── images/ — Illustrations et captures des guides utilisateur.
│   │   ├── 01-navigation-generale.br.jpg — Capture du guide en breton : navigation générale.
│   │   ├── 01-navigation-generale.en.jpg — Capture du guide en anglais : navigation générale.
│   │   ├── 01-navigation-generale.jpg — Capture du guide en français : navigation générale.
│   │   ├── 02-commandes-et-vues.br.jpg — Capture du guide en breton : commandes et vues.
│   │   ├── 02-commandes-et-vues.en.jpg — Capture du guide en anglais : commandes et vues.
│   │   ├── 02-commandes-et-vues.jpg — Capture du guide en français : commandes et vues.
│   │   ├── 03-mode-comprendre.br.jpg — Capture du guide en breton : mode Comprendre.
│   │   ├── 03-mode-comprendre.en.jpg — Capture du guide en anglais : mode Comprendre.
│   │   ├── 03-mode-comprendre.jpg — Capture du guide en français : mode Comprendre.
│   │   ├── 04-aussieres-et-taquets.br.jpg — Capture du guide en breton : aussières et taquets.
│   │   ├── 04-aussieres-et-taquets.en.jpg — Capture du guide en anglais : aussières et taquets.
│   │   ├── 04-aussieres-et-taquets.jpg — Capture du guide en français : aussières et taquets.
│   │   └── 05-generateur de port.png — Capture du guide en français : générateur de ports.
│   ├── validation/ — Rapports d'audit et résultats de qualification conservés.
│   │   ├── audit-niveaux-tests-2026-10-06.md — Audit du coût et des niveaux de validation.
│   │   ├── audit-securite-import-kjp.md — Audit de sécurité de l’import KJP — 7 octobre 2026.
│   │   ├── rapport-audit-calibration-experte.md — Audit des paramètres de « Calibration experte ».
│   │   ├── rapport-recalibration-aerodynamique.md — Recalibration aérodynamique basse vitesse.
│   │   ├── rapport-test-manoeuvres-dynamiques.md — Rapport — départ dynamique sur pointe arrière au vent.
│   │   └── threejs-migration-closure.md — Notice de récupération des archives de migration dans Git.
│   ├── guide-utilisateur.br.md — Guide utilisateur illustré en breton.
│   ├── guide-utilisateur.en.md — Guide utilisateur illustré en anglais.
│   ├── guide-utilisateur.md — Guide utilisateur illustré en français.
│   ├── localisation-simulateur.md — Organisation des langues et règles de traduction du simulateur.
│   ├── renderer-three.md — Contrat et maintenance du renderer natif et du secours Canvas.
│   └── validation-levels.md — Politique de validation proportionnelle au risque et commandes ciblées.
├── examples/ — Exemples de ports importables au format KJP.
│   └── la-trinite-sur-mer.kjp — Exemple complet de La Trinité-sur-Mer à importer.
├── output/ — Livrables documentaires et modèles exportés.
│   ├── modeles-physiques/ — Illustrations et exploration des modèles physiques du bateau.
│   │   ├── donnees-modele.json — Données descriptives des modèles et dessins physiques exportés.
│   │   ├── explorer-les-modeles.html — Explorateur autonome des modèles pédagogiques exportés.
│   │   ├── fardage-catalogue.svg — Planche vectorielle avec catalogue des surfaces exposées au vent.
│   │   ├── fardage.glb — Modèle 3D exporté des surfaces exposées au vent.
│   │   ├── fardage.png — Illustration raster des surfaces exposées au vent.
│   │   ├── fardage.svg — Dessin technique vectoriel des surfaces exposées au vent.
│   │   ├── lire-les-modeles.md — Guide de lecture des modèles, unités et représentations.
│   │   ├── parties-immergees-catalogue.svg — Planche vectorielle avec catalogue des parties immergées du bateau.
│   │   ├── parties-immergees.glb — Modèle 3D exporté des parties immergées du bateau.
│   │   ├── parties-immergees.png — Illustration raster des parties immergées du bateau.
│   │   └── parties-immergees.svg — Dessin technique vectoriel des parties immergées du bateau.
│   └── pdf/ — Dessins techniques exportés au format PDF.
│       ├── fardage-dessin-technique.pdf — Dessin technique PDF des surfaces exposées au vent.
│       └── parties-immergees-dessin-technique.pdf — Dessin technique PDF des parties immergées du bateau.
├── ports/ — Topologies embarquées et documentation du format de port.
│   ├── KJP.md — Spécification du format communautaire KJP et de ses limites.
│   ├── la-trinite-pedagogique.js — Topologie pédagogique du port embarquée dans le simulateur.
│   └── README.md — Contrat des topologies et commandes communautaires.
├── scripts/ — Construction, captures, audits et sélection des validations.
│   ├── audit-dynamic-mooring.js — Audit reproductible d'un départ cul à quai sur pointe arrière.
│   ├── audit-kjp-import.js — Audit de robustesse et de coût des imports KJP.
│   ├── audit-wind-current.js — Audit numérique des efforts de vent et de courant.
│   ├── build-port-generator.js — Assemblage et contrôle du HTML autonome du générateur.
│   ├── build-simulateur-port.js — Assemblage et contrôle du HTML autonome du simulateur.
│   ├── capture-simulator-localized-guide.js — Captures des guides dans les langues du simulateur.
│   ├── capture-simulator-native-baseline.js — Création et mise à jour des références visuelles natives.
│   ├── check-simulator-i18n.js — Contrôle de cohérence des catalogues et des messages traduits.
│   ├── embed-project-readme.js — Conversion du README et intégration des ressources dans les HTML.
│   ├── export-physics-model-illustrations.mjs — Export des illustrations et modèles pédagogiques de la physique.
│   ├── localization-assets.js — Chargement des traductions et préparation des gabarits localisés.
│   ├── physics-model-viewer.html — Gabarit de l'explorateur pédagogique des modèles physiques.
│   ├── physics-model-viewer.mjs — Affichage interactif des modèles et explication du profil de vent.
│   ├── profile-simulator-native-renderer.js — Mesure des performances du renderer natif dans le navigateur.
│   ├── qualify-simulator-native-activation.js — Qualification de l'activation du renderer natif et de ses invariants.
│   ├── render-physics-model-pdfs.py — Production des dessins techniques PDF à partir des opérations vectorielles.
│   ├── run-validation.js — Sélection et exécution des validations par produit, risque, groupe ou cas.
│   ├── simulator-render-scenes.js — Définition des scènes stables de référence visuelle.
│   └── validation-reporter.js — Collecte des cas exécutés et résultats des tests Node.
├── skills/ — Skills réutilisables conservés avec le projet.
│   └── validate-nautical-physics/ — Skill d'audit et de validation de la physique nautique.
│       ├── agents/ — Métadonnées du skill pour les agents.
│       │   └── openai.yaml — Présentation et paramètres du skill dans l’interface des agents.
│       ├── references/ — Contrats, bibliographie et matrice de validation physique.
│       │   ├── literature-routing.md — Orientation vers les références adaptées au composant physique.
│       │   ├── model-contract.md — Contrat du modèle physique et de ses invariants.
│       │   ├── validation-matrix.md — Matrice des contrôles physiques à appliquer.
│       │   └── vessel-profile-schema.md — Schéma et contraintes des profils de bateau.
│       ├── scripts/ — Outils d'audit des profils et des trajectoires.
│       │   ├── audit-vessel-profile.js — Audit de validité et de cohérence d'un profil de bateau.
│       │   ├── check-passivity.js — Contrôle de passivité et de dissipation des composants physiques.
│       │   ├── compare-trajectories.js — Comparaison numérique de trajectoires de référence.
│       │   └── run-physics-matrix.js — Exécution d'une matrice de scénarios physiques.
│       └── SKILL.md — Instructions d’audit et validation du moteur nautique.
├── src/ — Sources des deux produits et modules partagés.
│   ├── generateur-port/ — Interface et logique du générateur de ports.
│   │   ├── main.js — Logique de l'éditeur cartographique et des interactions.
│   │   ├── styles.css — Styles de l'interface du générateur.
│   │   └── template.html — Gabarit HTML de l'interface assemblé par le build.
│   ├── ports/ — Codec, import et édition des données de port.
│   │   ├── kjp-codec.js — Lecture, validation, normalisation et écriture du format KJP.
│   │   ├── osm-import.js — Conversion des données OpenStreetMap en structures de port.
│   │   ├── pontoon-decomposition.js — Décomposition géométrique des pontons importés.
│   │   └── port-editor-core.js — Opérations et transformations des objets de l'éditeur de ports.
│   └── simulateur-port/ — Interface, physique, profils et rendu du simulateur.
│       ├── locales/ — Catalogues de traduction du simulateur.
│       │   ├── br.json — Catalogue de traduction en breton.
│       │   ├── en.json — Catalogue de traduction en anglais.
│       │   └── fr.json — Catalogue de référence en français.
│       ├── rendering/ — Renderer Three natif et adaptation à la présentation KJP.
│       │   ├── index.js — Point d'entrée du rendu Three et de son intégration au simulateur.
│       │   ├── native-flow-resources.mjs — Ressources visuelles des champs et particules de vent et courant.
│       │   ├── native-infrastructure-resources.mjs — Géométries et matériaux des infrastructures du port.
│       │   ├── native-player-model.mjs — Chargement et préparation du modèle GLB du bateau joueur.
│       │   ├── native-player-resources.mjs — Ressources graphiques du bateau et mise à jour de sa pose.
│       │   ├── native-understanding-resources.mjs — Repères, vecteurs et éléments pédagogiques du mode Comprendre.
│       │   ├── native-world-renderer.mjs — Scène Three persistante et rendu du monde portuaire.
│       │   └── three-camera.mjs — Adaptation de la caméra KJP à la caméra Three.
│       ├── i18n.js — Choix de langue, traductions et formatage des messages.
│       ├── physics-core.js — Moteur nautique : dynamique, forces, contacts et aussières.
│       ├── template.html — Source principale de l'interface et de l'orchestration du simulateur.
│       └── vessel-profiles.js — Profils de bateau, validation et compilation des paramètres physiques.
├── tests/ — Tests fonctionnels, physiques, graphiques et de performance.
│   ├── fixtures/ — Données de référence utilisées par les tests.
│   │   ├── kjp-large-port-definition.json — Grand port de référence pour les tests de charge et de géométrie.
│   │   ├── osm-port-sample.json — Échantillon OpenStreetMap pour tester l'import de ports.
│   │   └── port-trajectories.json — Trajectoires nautiques de référence des tests.
│   ├── helpers/ — Utilitaires partagés des tests.
│   │   ├── browser-harness.js — Instrumentation du navigateur et exécution des cas sélectionnés.
│   │   └── large-port-obstacles.js — Construction des obstacles d'un grand port de test.
│   ├── performance/ — Contrôles des budgets de calcul et de simulation.
│   │   ├── physics-performance.test.js — Mesure des budgets de calcul du moteur physique.
│   │   └── simulator-budget.test.js — Mesure des budgets de fonctionnement du simulateur.
│   ├── physics/ — Tests du moteur nautique et des obstacles.
│   │   ├── port-obstacles.test.js — Tests des contacts et obstacles portuaires.
│   │   ├── port-physics.test.js — Tests des composants et invariants du moteur physique.
│   │   └── wind-current-profiles.test.js — Tests du vent, du courant et des profils environnementaux.
│   ├── ports/ — Tests des transformations et du codec de ports.
│   │   ├── kjp-codec.test.js — Tests de validation, compatibilité et robustesse du format KJP.
│   │   └── pontoon-decomposition.test.js — Tests de décomposition géométrique des pontons.
│   ├── visual-baselines/ — Captures de référence pour les comparaisons visuelles.
│   │   └── native/ — Références courantes du renderer Three natif.
│   │       ├── built-in-chart-skipper-navigation.png — Référence visuelle : port embarqué, thème carte, vue skipper en navigation.
│   │       ├── built-in-chart-top-understand.png — Référence visuelle : port embarqué, thème carte, vue de dessus en mode Comprendre.
│   │       ├── built-in-dark-top-navigation.png — Référence visuelle : port embarqué, thème sombre, vue de dessus en navigation.
│   │       ├── la-trinite-chart-skipper-navigation.png — Référence visuelle : la Trinité, thème carte, vue skipper en navigation.
│   │       ├── la-trinite-dark-top-navigation.png — Référence visuelle : la Trinité, thème sombre, vue de dessus en navigation.
│   │       └── manifest.json — Inventaire, empreintes et métadonnées des captures de référence.
│   ├── browser-cases.json — Registre des cas navigateur, produits et groupes de validation.
│   ├── native-player.test.js — Tests du bateau joueur et de ses ressources graphiques natives.
│   ├── native-renderer-activation.test.js — Tests d'activation du rendu natif et du secours Canvas.
│   ├── native-renderer-qualification.test.js — Qualification étendue du renderer sur les scènes de référence.
│   ├── native-rendering.test.js — Tests locaux des ressources graphiques et de la caméra.
│   ├── native-world-renderer.test.js — Tests d'intégration du renderer monde et de ses invariants.
│   ├── port-generator.test.js — Cas navigateur du générateur, de l'édition et des imports de ports.
│   ├── simulateur-port.test.js — Cas fonctionnels du simulateur, des commandes et des manœuvres.
│   ├── simulator-i18n-ui.test.js — Tests navigateur des langues et de la conservation de l'état.
│   ├── simulator-i18n-unit.test.js — Tests unitaires de traduction, choix de langue et formatage.
│   ├── simulator-i18n.test.js — Point d'entrée de compatibilité regroupant les tests de localisation.
│   ├── understanding-rotation.test.js — Tests de rotation et d'interaction dans le mode Comprendre.
│   └── validation-routing.test.js — Tests du routage des validations et de la sélection des cas.
├── .gitattributes — Règles Git de traitement des fichiers et des fins de ligne.
├── .gitignore — Exclusions des dépendances, secrets et sorties locales.
├── AGENTS.md — Consignes de travail ciblé et de validation pour les agents.
├── CONTRIBUTING.md — Guide de contribution et commandes de développement.
├── generateur-port.html — Livrable HTML autonome du générateur, généré depuis les sources.
├── kjp_sun_odyssey_36i.glb — Modèle 3D binaire du Sun Odyssey 36i utilisé par le renderer.
├── la_Trinite.kjp — Fichier de port KJP de La Trinité conservé à la racine.
├── LICENSE — Licence Apache 2.0 du projet.
├── package-lock.json — Versions verrouillées des dépendances npm.
├── package.json — Dépendances npm et commandes de build, audit et validation.
├── README.md — Présentation, démarrage et versions des deux produits.
├── simulateur-port.html — Livrable HTML autonome du simulateur, généré depuis les sources.
└── tree.md — Cet inventaire commenté des fichiers et répertoires.
```
