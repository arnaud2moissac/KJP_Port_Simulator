# Changelog

## 3.0.0 — 27 octobre 2026

Cette release majeure rassemble les changements depuis la dernière release
officielle, **v2.1.0 du 11 octobre 2026**. Elle étend le simulateur à six bateaux,
relie les deux produits à une bibliothèque communautaire de ports et enrichit
l'édition cartographique, les commandes et les guides trilingues.

### Six bateaux et leurs modèles

- Au Sun Odyssey 36i s'ajoutent le **Dufour 310 Grand Large 2014**, le
  **Sun Odyssey 24.2**, le **Contessa 26**, le **Pogo 40 S4** et l'**Oceanis 48**.
  Chaque bateau possède son profil indépendant, son descriptif localisé et son
  modèle visuel embarqué ; le choix est mémorisé.
- Les commandes représentent une roue ou une barre franche selon le bateau.
  Les configurations comprennent des quilles et des propulsions différentes,
  ainsi que deux safrans pour le Dufour et le Pogo.
- Les profils passent au **schéma 5**, avec adaptation des anciens schémas.
  Les unités propulsives, les safrans et leurs relations sont explicites ; le
  Dufour conserve notamment ses deux safrans hors du jet direct d'hélice.
- Les modèles 3D et les silhouettes de secours suivent le bateau sélectionné.
  Les ressources restent embarquées dans le simulateur autonome.
- **Limite : les nouveaux profils sont expérimentaux, plausibles mais non
  calibrés.** Les données documentaires, estimations, incertitudes et résultats
  historiques sont décrits dans `docs/physics/`. Une qualification logicielle
  ne constitue pas une calibration sur un bateau réel.

### Commandes, préparation et confort

- Commandes à la souris et au doigt enrichies, avec des crans de marche avant
  et arrière au ralenti et un passage par le point mort avant inversion.
- Choix du sens du pas d'hélice et descriptif du bateau donnant accès aux
  réglages correspondants.
- Correction de la prise de pendille et de la sélection des taquets.
- Accès direct à **Pause / reprise**, après le régime moteur, pour préparer
  les amarres ; réglages avancés regroupés et retours aux valeurs par défaut.
- Commandes tactiles adaptées aux tablettes et smartphones, taille réglable
  et message de démarrage sur téléphone.
- Eau calme éclairée en journée activée par défaut dans le rendu natif.
- Vue Skipper recadrée pour mieux voir le pont et les alentours du bateau.

### Bibliothèques de ports KJP et Communauté

- Le simulateur consulte directement les fichiers `.kjp` du dossier Git
  `ports/`, avec tri et chargement depuis sa bibliothèque KJP.
- Une seconde bibliothèque **Communauté**, hébergée dans un dossier public
  pCloud, permet de consulter les contributions depuis les deux produits.
- Le générateur ouvre et publie les ports communautaires sans compte ni clé
  personnelle. La sauvegarde locale reste disponible.
- Chaque publication comprend le port validé et un catalogue avec taille et
  empreinte SHA-256. Les mises à jour demandent confirmation et conservent les
  publications précédentes ; le succès est vérifié dans le dossier public.
- La lecture traite aussi les fichiers sans catalogue, borne les réponses et
  maintient l'indépendance entre la source Git et la source Communauté.
- Le dépôt comprend **La Rochelle**, **Saint-Malo** et **Tréguier**.
  Saint-Malo est enrichi de places et d'un bateau statique. L'exemple guidé de
  Port Tudy comporte des aménagements pédagogiques signalés.
- La consultation distante et la publication nécessitent Internet ; les ports
  locaux restent utilisables avec le simulateur hors ligne.

### Générateur de ports

- Interface et aide embarquée en **français, anglais et breton**, avec détection
  de la langue et mémorisation du choix.
- Création et ajustement des pontons par leurs extrémités, amélioration de
  l'exploitation des candidats OpenStreetMap et des séries de catways.
- Outil de mesure des distances et reprise de l'entraxe pour l'édition.
- Multisélection et édition de plusieurs objets, ajout de places manuelles,
  option visiteurs, contrôle du dégagement et répartition des tailles de bateaux.
- Parcours de création, import, édition, validation et export documentés dans
  un guide illustré, avec un exercice Port Tudy et des vues sur tablette.
- Correction d'une régression : un changement de langue conserve les dimensions
  en cours de saisie dans l'inspecteur sans rétablir leur valeur enregistrée.

### Modèles physiques et documentation

- L'explorateur autonome propose désormais le **Sun Odyssey 36i**, le
  **Contessa 26** et le **Dufour 310**, chacun avec ses modèles de fardage et
  de parties immergées, ses légendes et ses données inspectables.
- Les exports GLB suivent le bateau et le modèle sélectionnés. Les dessins
  vectoriels et PDF fournis concernent le Sun Odyssey 36i.
- Guides du simulateur et du générateur actualisés dans les trois langues,
  captures localisées et captures tactiles réalisées sur un profil iPad Pro.
- Documentation des profils, des ressources visuelles et de leurs limites,
  études des contacts coque/pare-battages et bibliographie nautique enrichies.

### Versions et compatibilité

| Composant | v2.1.0 officielle | v3.0.0 |
| --- | --- | --- |
| Produit / paquet | 2.1.0 | **3.0.0** |
| Moteur physique | 6.0.0 | **6.0.0** |
| Profil Sun Odyssey 36i | 6.0.1 | **6.1.0** |
| Schéma des profils de bateau | 4 | **5** |
| Générateur de ports | 1.1.0 | **1.1.0** |
| Format des ports KJP | 3 | **3** |

Les versions des composants évoluent séparément. Le numéro du moteur reste
6.0.0 ; cette release comprend toutefois les évolutions des profils et de leur
prise en charge depuis v2.1.0. Le format de port KJP ne change pas.

### Qualification de la release

- Qualification complète lancée une fois par `npm run verify:release`, puis
  poursuite des seules étapes non exécutées et reprises ciblées après diagnostic.
  Les premiers verdicts sont conservés dans les journaux locaux de validation.
- **77 tests physiques**, **51 tests de ports**, **9 tests de localisation**,
  **79 cas navigateur du simulateur**, **34 cas navigateur du générateur** et
  **33 tests de rendu et de modèles** validés après les corrections ciblées.
- Contrôles complémentaires de la bibliothèque communautaire et du routage
  des validations : **13 tests** validés ; **4 tests** supplémentaires couvrent
  l'eau en journée, son horloge, ses ressources et le secours Canvas.
  Total : **300 contrôles distincts validés**. Les trois fichiers de ports livrés
  sont acceptés par le codec KJP.
- Correction de la perte de saisie au changement de langue du générateur ;
  actualisation des attentes de test du guide, des réglages et du numéro de
  profil. Ressources sources et modèles intermédiaires manquants rétablis pour
  rendre les vérifications géométriques et la génération reproductibles.
- Cinq références natives 3.0 inspectées et conservées dans un répertoire
  distinct, sept combinaisons scène/DPR qualifiées et mutations détectées.
  Les cinq rapports historiques 2.1 ont été reproduits exactement avant la
  comparaison ; les écarts de diagnostics et de cadrage Skipper sont documentés.
- Trajectoires historiques comparées exactement, secours WebGL/GLB/Canvas et
  perte de contexte vérifiés ; soak de **1 200 images Skipper** sans dérive de
  ressources. Les références physiques et les anciennes références graphiques
  ne sont pas réécrites pour cette préparation de release.
- Les budgets CPU matériels ne sont pas requalifiés par cette campagne
  fonctionnelle ; ils relèvent de `npm run qualify:performance`.

### Téléchargements

- `simulateur-port.html` : simulateur autonome avec les six bateaux et les
  guides français, anglais et breton.
- `generateur-port.html` : générateur autonome trilingue ; les services
  cartographiques et communautaires nécessitent une connexion.
- `explorer-les-modeles.html` : explorateur autonome des trois bateaux documentés.
- `fardage-dessin-technique.pdf` et `parties-immergees-dessin-technique.pdf` :
  planches du Sun Odyssey 36i, également disponibles dans `output/pdf/`.

Les archives du dépôt comprennent les ports, les sources, les ressources et
les exports documentés dans `output/`.

**Historique complet :** [v2.1.0…v3.0.0](https://github.com/arnaud2moissac/KJP_Port_Simulator/compare/v2.1.0...v3.0.0).
