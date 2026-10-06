# Validation proportionnée au risque

Choisir une seule route avant d'agir. Les moteurs de production ne sont pas
modifiés par le routage ; le Canvas et le pilotage RAF sont des choix du banc
navigateur, pas de l'utilisateur. Aucun test ne se relance automatiquement.

| Route | Commande type | Périmètre |
| --- | --- | --- |
| `patch-local` | `npm run validate:patch -- --product simulator` | diff à inspecter et contrôle du build concerné |
| `ui-check` | `npm run validate:ui -- --product simulator --group controls` | build, cas indépendants sélectionnés, console |
| `physics-check` local | `npm run validate:physics -- --component rudder` | build, cas numériques du composant |
| `physics-check` transversal | `npm run verify:physics` | physique fonctionnelle complète et trajectoires intégrées |
| `release-check` | `npm run verify:release` | deux produits, ports, physique, localisation, E2E, une qualification renderer |

Une inspection visuelle ciblée reste nécessaire pour une modification visuelle.
`test:rendering` couvre les ressources/caméras locales ; `test:renderer:quick`
couvre un changement intégré du renderer/secours. Les références raster,
mutations, soak et matrices navigateur restent des qualifications explicites.
Ne pas lancer le niveau rapide juste avant le niveau étendu qui l'inclut.

## Sélection navigateur fiable

Les définitions sont dans `tests/browser-cases.json`, les corps dans les deux
fichiers E2E. Chaque cas dispose d'un contexte navigateur neuf, d'une préparation
explicite et d'un nettoyage garanti. Seul le processus Chromium est partagé.

- Simulateur : `smoke`, `controls`, `interface`, `guide`, `ports`, `camera`,
  `calibration`, `audio`, `moorings`, `topology`, `scenarios`, `physics`,
  `rendering`, `trajectories`.
- Générateur : `smoke`, `guide`, `interface`, `editing`, `pendilles`, `import`,
  `candidates`, `maps`, `integration`.

Exemples :

```bash
npm run validate:ui -- --product simulator --case controls.48
npm run validate:ui -- --product simulator --case controls.47,controls.48
npm run validate:ui -- --product simulator --group guide,ports
npm run validate:ui -- --product generator --group import
npm run validate:ui -- --group controls --list
npm run test:smoke
npm run test:i18n:unit
npm run test:i18n:ui
```

`--list` décrit le périmètre sans exécuter. Une sélection vide, un simple succès
de fichier ou un nombre de cas différent de la sélection échoue. Ne pas utiliser
le filtre Node sur un ancien test parent comme preuve d'exécution ciblée.

`test:e2e` exécute tous les cas simulateur ; `test:port-generator` tous ceux du
générateur. `verify:simulator` et `verify:port-generator` qualifient un produit
entier. Ce sont des agrégats explicites, pas des validations locales.

## Composants physiques et performance

`validate:physics` accepte `mass`, `hull`, `propulsion`, `rudder`, `moorings`,
`contacts`, `environment` et `transversal`. Seul `environment` ajoute l'audit
vent/courant. Choisir `transversal` si un changement touche les repères,
l'accumulateur, l'intégrateur ou les contraintes communes. Le skill nautique
détermine les invariants et cas à ajouter pour une modification physique réelle.

Les suites `test:physics:core`, `test:physics:environment`,
`test:physics:contacts` et `test:physics` restent fonctionnelles. Le stress de
10 000 pas, les douze aussières, les 3 000 obstacles et les égalités ×1/×2 y
restent vérifiés, sans verdict dépendant du temps mural.

`npm run qualify:performance` exécute seul les mesures originales : moyenne et
p95 core < 1 ms/pas, p95 grand port < 1 ms et avance ×2 < 250 ms/seconde réelle.
Les seuils ne changent pas. Le rapport indique machine, Node, navigateur et
mesures ; exécuter au repos, sans autre banc navigateur concurrent. Un échec CPU
reproduit sur la référence ne justifie ni changement moteur ni relance globale.

## Journal et reprises

Le routage écrit dans `.validation-runs/` (ignoré par Git) : arguments, environnement,
cas attendus/exécutés, verdicts, diagnostics et durées par étape. Une sélection
invalide est consignée sans exécution. Pour relier une reprise ciblée à l'échec :

```bash
npm run validate:ui -- --case controls.48 --retry-of .validation-runs/<rapport>.json
```

Conserver le premier verdict. Ne reprendre que les cas affectés par une correction
ou un diagnostic précis ; arrêter lorsque les validations proportionnées passent.
