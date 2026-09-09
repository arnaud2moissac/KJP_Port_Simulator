---
name: kjp-three-render-migration
description: Migrer ou optimiser le renderer du simulateur KJP avec Three.js tout en conservant strictement la physique, le look & feel et le livrable HTML autonome. Utiliser pour la branche de migration Legacy/Three et ses validations visuelles ou de performance ; ne pas utiliser pour le générateur de ports ni pour modifier la physique nautique.
---

# Migration du renderer KJP vers Three.js

## Contrat non négociable

- Classer ce travail `ui-check`, jamais `physics-check`, tant qu'aucune équation ou donnée physique ne change.
- Ne modifier ni `src/simulateur-port/physics-core.js`, ni `src/simulateur-port/vessel-profiles.js`, ni `tests/physics/`, ni les trajectoires étalons.
- Conserver les mêmes états autoritaires, pas de temps, commandes et résultats physiques. Le renderer ne reçoit que des données de présentation dérivées.
- Maintenir l'iso-rendu : mêmes cadrages, silhouettes, couleurs, épaisseurs, thèmes, overlays et priorités visuelles. Les écarts dus à l'antialiasing sont les seuls écarts implicites acceptables.
- Maintenir `simulateur-port.html` comme livrable autonome hors ligne : Three.js et ses éventuels addons sont intégrés au build, sans CDN ni requête runtime.
- Ne pas introduire WebGPU, PBR, éclairage, ombres, brouillard, post-traitement, OrbitControls ou Raycaster pendant la phase d'iso-rendu.

## Architecture de migration

- Préserver le Canvas 2D supérieur et remplacer progressivement le monde WebGL seulement.
- Introduire une façade de rendu avec deux backends temporaires, `legacy` et `three`, alimentés par un `RenderFrame` immuable.
- Garder caméra, projection, ordre de rendu et clipping comme contrats explicites et testables.
- Préférer des géométries et buffers persistants, reconstruits à l'import ou au changement de topologie, pas à chaque image.
- Utiliser le partage de géométries, l'instancing ou le batching seulement lorsque les mesures identifient leur propriétaire. Définir le disposal de toute ressource GPU.
- Conserver un seul propriétaire de la boucle de rendu pendant chaque étape. Une bascule de backend ne doit jamais créer une seconde boucle.

## Séquence et gates

1. Relever une baseline Legacy reproductible sur six scènes couvrant vues dessus/skipper, thèmes, port pédagogique, grand port KJP et overlays actifs. Enregistrer captures, temps CPU/frame, appels de dessin, volumes transférés et mémoire lorsque disponible.
2. Extraire `RenderFrame` sans changer le backend. La baseline et les tests existants doivent rester identiques.
3. Ajouter Three.js via paquet npm et bundle local dans `scripts/build-simulateur-port.js`. Vérifier l'absence de requête réseau dans le HTML généré.
4. Porter par propriétaires : caméra/projection, eau et terrain, infrastructures, bateaux, puis overlays monde. Comparer Legacy/Three à chaque tranche.
5. Optimiser le grand port après preuve par profilage : géométries persistantes, chunks, instancing/batching, culling et allocations du hot path.
6. Ne basculer le défaut vers Three qu'après iso-rendu, performance, stabilité mémoire, console propre et identité des snapshots physiques.

## Validation proportionnelle

- Après une source du simulateur : `npm run check:simulator`.
- Après une interaction ou un rendu : ouvrir le HTML réel, vérifier console/page errors, puis tester uniquement les scènes touchées.
- Utiliser `window.__PORTANCE_TEST__` pour choisir scénario, caméra, thème et rapports déterministes ; étendre cette API seulement avec des diagnostics de rendu.
- Comparer les ancres de projection à environ 0,5 px et les captures avec une tolérance explicite limitée à l'antialiasing.
- Vérifier les snapshots physiques bit à bit sans modifier leurs étalons. Une divergence arrête la tranche de migration.
- Pour les changements de performance, mesurer le pire grand port avant/après, plusieurs frames après échauffement, et surveiller la mémoire après imports répétés.
- Mettre à jour le graphe par `graphify update .` après toute modification de code.

## Sources à modifier

- Modifier les sources sous `src/simulateur-port/` et `scripts/build-simulateur-port.js`.
- Ne jamais éditer directement `simulateur-port.html`, qui est généré.
- Garder les tests de migration dans les suites du simulateur, près des contrats caméra/rendu existants ; ne créer une nouvelle fixture que si elle devient une baseline durable.

Pour les API Three.js, charger `threejs-game-studio` et vérifier la révision installée. Utiliser `WebGLRenderer`, des modules ES bundlés et les API correspondant exactement à cette révision.
