# Contribuer à KJP Port Simulator

Merci de contribuer à un outil qui cherche à rester à la fois simple à utiliser et sérieux dans son comportement nautique.

## Préparer son fork

1. Forkez le dépôt sur GitHub, puis clonez votre fork.
2. Installez Node.js 20 ou plus récent.
3. Installez exactement les dépendances verrouillées :

   ```bash
   npm ci
   ```

4. Créez une branche courte et descriptive depuis `main`.

Aucun serveur applicatif n'est requis. Les cartes du générateur utilisent des services en ligne, mais les fixtures permettent de tester leur traitement hors ligne.

## Où intervenir

- `src/simulateur-port/` : rendu, interface et moteur physique du simulateur ;
- `src/generateur-port/` : interface de l'éditeur 2D ;
- `src/ports/` : codec KJP, import OpenStreetMap et outils géométriques ;
- `ports/` : topologie pédagogique et spécification KJP ;
- `tests/` : tests physiques, KJP et navigateur ;
- `scripts/` : builds autonomes et audits scientifiques.

Ne modifiez pas directement `simulateur-port.html` ou `generateur-port.html`. Ils sont reconstruits depuis les sources :

```bash
npm run build:simulator
npm run build:port-generator
```

## Choisir une validation proportionnée

- `patch-local` : texte, documentation ou correction isolée ; inspectez le diff et contrôlez le build concerné.
- `ui-check` : rendu ou interaction ; ouvrez la page, surveillez la console et testez l'état modifié.
- `physics-check` : force, coefficient, profil, contact, aussière ou intégrateur ; vérifiez unités, signes, passivité, finitude et cas numériques concernés.
- `release-check` : utilisez `npm run verify:release` pour une qualification complète.

Commandes ciblées utiles :

```bash
npm run test:physics:core
npm run test:physics:environment
npm run test:physics:contacts
npm run verify:simulator
npm run verify:port-generator
```

Pour un changement physique, appliquez le cadre décrit dans `skills/validate-nautical-physics/`. Un changement transversal de repère, d'intégrateur ou de contraintes justifie `npm run verify:physics`. Un changement visuel n'en a pas besoin.

## Principes à préserver

- Le moteur reste déterministe, à pas physique fixe de 1/120 s, y compris en mode ×2.
- Toutes les forces passent par le même accumulateur 3-DOF et déclarent leur point d'application, leur moment et leur puissance.
- Une force hydrodynamique passive ne doit pas créer d'énergie.
- Le courant agit par la vitesse relative bateau–eau ; le vent utilise le vent apparent.
- Les coefficients estimés restent regroupés dans les profils et documentés comme tels.
- Une amélioration locale ne doit pas entraîner de refactoring opportuniste.

Le format KJP est non exécutable. Toute évolution doit rester validable, préserver les unités et références parent–enfant, et fournir une migration explicite si le schéma change. Voir `ports/KJP.md`.

## Avant une pull request

- le diff reste limité au besoin ;
- aucun secret, `.env`, chemin personnel ou dépendance vers un projet voisin ;
- les HTML ont été reconstruits et correspondent aux sources ;
- les tests proportionnés passent ;
- toute modification d'étalon physique est expliquée ;
- la documentation est mise à jour si le comportement utilisateur ou une interface durable change.

Arrêtez-vous lorsque le comportement demandé est obtenu et validé. Les améliorations collatérales appartiennent à une autre contribution.
