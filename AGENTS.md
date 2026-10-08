# Travail ciblé sur le projet

Ce dépôt contient deux produits autonomes : le simulateur et le générateur de
ports. La complexité scientifique du moteur ne justifie pas une validation
globale pour chaque changement d'interface.

## Classer la demande avant d'agir

Choisir une seule route principale :

- `patch-local` : texte, style, documentation, configuration ou correction
  isolée sans effet physique ;
- `ui-check` : rendu ou interaction dans le simulateur ou le générateur ;
- `physics-check` : équation, coefficient, profil de bateau, repère, force,
  intégrateur, contact, pare-battage ou aussière ;
- `release-check` : qualification explicite d'une version complète.

Ne pas transformer une demande locale en refactoring. Ne pas créer de fichier,
rapport, abstraction ou test si le besoin n'est ni demandé ni durable.

## Lire seulement ce qui est utile

- Commencer par `rg`, `rg --files` et les sections appelantes directes.
- Pour le simulateur et sa physique, privilégier `src/simulateur-port/`.
- Pour le générateur, privilégier `src/generateur-port/` et `src/ports/`.
- Ne pas lire intégralement `simulateur-port.html`, `generateur-port.html`,
  `package-lock.json`, les rapports, fixtures ou prototypes pour une tâche
  locale. Les deux HTML sont des livrables générés : modifier leurs sources.
- Ne charger le skill `validate-nautical-physics` que pour une demande classée
  `physics-check`, pas pour une modification purement visuelle ou éditoriale.

## Maintenance du renderer Three.js

Pour maintenir, qualifier ou optimiser le rendu Three natif du simulateur et
son secours Canvas 2D, lire d'abord le contrat de
[`docs/renderer-three.md`](docs/renderer-three.md). Ce contrat concerne le
simulateur ; il ne s'applique ni au générateur de ports ni aux modifications de
physique nautique. Le renderer natif conserve ses géométries monde.

- Relever le répertoire réel, la branche, HEAD et le diff avant de travailler ;
  préserver les modifications préexistantes, sans changement de branche ni reset.
- Three consomme la pose et la caméra KJP. Ne modifier ni moteur, profil,
  collision, pas de temps, interpolation, commande, trajectoire ou ancrage
  fonctionnel ou référence physique pour adapter le rendu ; aucun calcul Three
  ne pilote la simulation.
- Conserver le Canvas 2D supérieur, les overlays, le picking et les `hitTargets`,
  les aussières et les pare-battages. Ne pas substituer du raycasting aux
  interactions existantes.
- Garder les ressources statiques persistantes et le GLB joueur chargé une fois.
  Un mouvement de caméra ne reconstruit ni ne retransfère leurs attributs.
- Les erreurs WebGL2, GLB, reconstruction ou perte de contexte doivent produire
  un diagnostic explicite et activer le secours Canvas sans changer l'état physique.
- La fidélité visuelle porte sur les dimensions, l'occlusion, la lisibilité,
  l'information et l'interaction. Les références natives détectent les régressions ;
  les comparaisons physiques, fonctionnelles et de trajectoires restent exactes.

Classer la demande selon les routes ci-dessus : rendu ou interaction relève de
`ui-check` ; une qualification complète ne s'exécute que si elle est demandée.
Les validations proportionnées sont définies ci-dessous. L'accès aux anciens
backends et aux preuves historiques est décrit dans la
[notice de récupération](docs/validation/threejs-migration-closure.md) ; ne pas
réintroduire les anciens renderers WebGL comme dépendances du produit.
Pour adapter une API Three, charger le skill global `threejs-game-studio` et
vérifier la révision installée. Ses exemples génériques de boucle, éclairage ou
raycasting ne remplacent pas les propriétaires KJP. Ne pas modifier un skill
global pour une règle propre à ce dépôt.

## Sources et bibliographie

L'obligation de référencement et d'archivage bibliographique s'applique
uniquement aux sources externes effectivement utilisées pour comprendre,
concevoir, calibrer, valider ou implémenter les sujets nautiques ou physiques
de KJP (navigation, manœuvre, terminologie nautique, modèles et phénomènes
physiques). Ajouter ces sources au même changement dans
[`bibliographie/biblio.txt`](bibliographie/biblio.txt). Indiquer l'URL canonique,
le rôle précis de la source dans le projet et, si utile, la conversation ou le
document KJP qui l'a introduite.

Les autres sujets, notamment l'outillage de développement, les bibliothèques
logicielles, le rendu et l'interface, n'imposent ni entrée bibliographique ni
archive. Une source utilisée pour un sujet nautique ou physique reste soumise
à la règle, quel que soit le composant du projet concerné.

- Archiver la réponse originale dans `bibliographie/` au format PDF ou HTML
  lorsque son téléchargement public est possible ; employer un nom de fichier
  descriptif et stable.
- Si la récupération échoue, est refusée, exige une authentification ou ne
  fournit pas de document archivable, conserver au minimum l'URL et le motif
  dans `biblio.txt`.
- Dédupliquer les alias et les URL avec fragment autour d'une référence
  canonique. Ne pas classer comme bibliographie les URL internes KJP, les dépôts,
  les releases, les fixtures ou les URL de test ; signaler une exclusion utile
  dans le manifeste.

Cette mise à jour documentaire fait partie du comportement normal dès qu'une
source du périmètre nautique ou physique est utilisée ; elle n'autorise pas à
remplacer une mesure, une calibration ou une validation par une simple citation.

## Valider proportionnellement au risque

### `patch-local`

Inspecter le diff et, si une source générée change, lancer seulement son contrôle
de build : `npm run check:simulator` ou `npm run check:generator`.

### `ui-check`

Contrôler le build concerné, ouvrir la page, vérifier l'absence d'erreur console,
puis tester uniquement l'état et l'interaction modifiés. Une inspection visuelle
ciblée suffit pour une modification visuelle locale.

Pour un test automatisé ciblé, utiliser `npm run validate:ui -- --product
simulator --group controls` (ou le produit/groupe concerné), et `--case
controls.48` pour un seul cas. Les groupes et commandes sont décrits dans
[`docs/validation-levels.md`](docs/validation-levels.md). Le sélecteur refuse une
sélection vide et vérifie les cas réellement exécutés. `test:e2e`,
`verify:simulator` et `verify:port-generator` ne sont pas des contrôles locaux.

Utiliser `npm run test:rendering` pour un changement local de ressources, de
palette ou de caméra et `npm run test:renderer:quick` pour un changement intégré
du renderer ou du secours. Réserver `npm run test:renderer:qualification`,
`npm run qualify:renderer:native` et `npm run profile:renderer:native` à une
qualification explicite : ces contrôles sont lourds et ne font pas partie de
`test:e2e`.

### `physics-check`

Appliquer `validate-nautical-physics` et distinguer :

- changement local d'un composant : unités, signes, finitude, bornes, invariants
  et quelques cas numériques du composant ;
- changement transversal (repères, intégrateur, matrice de masse, accumulateur,
  courant relatif, contraintes) : suite physique et trajectoires concernées ;
- vent/courant : ajouter `npm run check:wind-current` seulement dans ce cas.

Utiliser `npm run test:physics:core`, `test:physics:environment` ou
`test:physics:contacts` selon le composant. Réserver `npm run verify:physics` aux
changements physiques transversaux.

Pour un composant core isolé, préférer `npm run validate:physics -- --component
rudder` (ou `mass`, `hull`, `propulsion`, `moorings`). Les invariants restent
dans les tests fonctionnels ; les budgets CPU inchangés se qualifient séparément
par `npm run qualify:performance`, sans relance automatique d'une suite globale.

### `release-check`

Lancer `npm run verify:release` une fois. Ne répéter que les tests de
déterminisme ou trajectoires concernés. Une seconde suite complète n'est utile
que si la qualification demandée exige explicitement deux exécutions.
La commande inclut une seule qualification renderer étendue ; ne pas la lancer
séparément juste avant sans besoin de diagnostic.

## Critère d'arrêt

Arrêter dès que le comportement demandé est obtenu, que le diff reste dans le
périmètre et que les validations proportionnelles passent. Ne pas poursuivre
avec des améliorations collatérales. La réponse finale résume brièvement le
résultat, les fichiers touchés et les contrôles réellement exécutés.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

L'outil utilisé par ce projet est `graphifyy 0.9.79+kjp.1`, avec les correctifs
P1 reproductibles décrits dans [`tools/graphify/README.md`](tools/graphify/README.md).
Avant une mise à jour officielle, porter et valider ces correctifs.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
