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

Pour tout travail sur le rendu Three du simulateur, lire le skill
`kjp-three-render-migration` puis suivre le cadrage de référence dans
[`docs/threejs-renderer-migration.md`](docs/threejs-renderer-migration.md), en
particulier sa section prescriptive et son suivi de clôture. L'inventaire de
retrait et le manifeste historique sont dans
[`docs/validation/threejs-migration-closure.md`](docs/validation/threejs-migration-closure.md).

Le produit contient le renderer Three natif à géométries monde persistantes et
un secours Canvas 2D direct. Les anciens backends WebGL sont disponibles dans la
référence Git `threejs-migration-legacy-final`, pas dans le produit courant. Le
natif reste soumis aux invariants physiques et fonctionnels exacts ; sa gate
visuelle porte sur la fidélité, la lisibilité, l'information et l'interaction.
Les références raster natives servent à détecter les régressions de ce backend,
sans rétablir une exigence de parité pixel avec Legacy.

## Sources et bibliographie

Par défaut, toute source externe effectivement utilisée pour comprendre,
concevoir, calibrer, valider ou implémenter KJP doit être ajoutée au même
changement dans [`bibliographie/biblio.txt`](bibliographie/biblio.txt). Indiquer
l'URL canonique, le rôle précis de la source dans le projet et, si utile, la
conversation ou le document KJP qui l'a introduite.

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
source est utilisée ; elle n'autorise pas à remplacer une mesure, une calibration
ou une validation par une simple citation.

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

Utiliser `npm run test:rendering` pour un changement local de ressources ou de
caméra et `npm run test:renderer:quick` pour un changement intégré du renderer ou
du secours. Réserver `npm run test:renderer:qualification`,
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

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
