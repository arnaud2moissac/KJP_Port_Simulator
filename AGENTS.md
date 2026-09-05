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

## Valider proportionnellement au risque

### `patch-local`

Inspecter le diff et, si une source générée change, lancer seulement son contrôle
de build : `npm run check:simulator` ou `npm run check:generator`.

### `ui-check`

Contrôler le build concerné, ouvrir la page, vérifier l'absence d'erreur console,
puis tester uniquement l'état et l'interaction modifiés. Une inspection visuelle
ciblée suffit pour une modification visuelle locale.

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

### `release-check`

Lancer `npm run verify:release` une fois. Ne répéter que les tests de
déterminisme ou trajectoires concernés. Une seconde suite complète n'est utile
que si la qualification demandée exige explicitement deux exécutions.

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
