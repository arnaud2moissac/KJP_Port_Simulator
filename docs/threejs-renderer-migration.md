# Migration du renderer du simulateur vers Three.js

## Objectif et invariants

La v2 remplace progressivement le renderer WebGL2 maison par Three.js afin de
réduire le travail CPU et les transferts GPU sur les grands ports, puis de
permettre des bateaux visuellement plus riches. La première migration reste
strictement iso-rendu.

- Le moteur physique, les profils de bateau, le pas fixe et les trajectoires
  étalons sont gelés.
- Le Canvas 2D supérieur, les commandes, le picking et les overlays écran sont
  conservés pendant le portage du monde WebGL.
- Le livrable reste un unique `simulateur-port.html` utilisable hors ligne.
- Aucun CDN, WebGPU, PBR, éclairage, ombre, brouillard ou post-traitement ne
  fait partie de la phase d'iso-rendu.
- Legacy et Three reçoivent à terme le même `RenderFrame` immuable ; le choix du
  backend ne doit jamais modifier l'état autoritaire du simulateur.

## Décisions vérifiées

- Cible : Three.js `0.186.0` / révision `186`, version stable consultée le
  8 septembre 2026 et épinglée exactement dans le lockfile.
- Renderer : `WebGLRenderer`. Le projet est déjà WebGL2 et ne présente aucun
  besoin TSL, compute ou post-processing justifiant le renderer WebGPU
  expérimental.
- Intégration : modules ES bundlés par esbuild dans le HTML autonome.
- Composition : canevas Three transparent sur le fond de scène HTML, comme le
  canevas WebGL Legacy actuel.
- Boucle : un seul propriétaire actif. Le spike Three n'instancie un renderer
  que depuis le test explicite et le détruit immédiatement.

Référence de version : [guide de migration officiel Three.js r185 → r186](https://github.com/mrdoob/three.js/wiki/Migration-Guide#185--186).

## Baseline Legacy

La commande `npm run capture:renderer-baseline` recharge une page propre par
scène, fixe le temps visuel, chauffe la lecture du canevas transparent, refuse
les requêtes HTTP et écrit les captures et diagnostics dans
`tests/visual-baselines/legacy/`.

| Scène | P95 CPU indicatif | Draw calls | Upload/image |
| --- | ---: | ---: | ---: |
| intégré · nuit · dessus · navigation | 11,6 ms | 3 | 293 Ko |
| intégré · carte · dessus · comprendre | 12,8 ms | 3 | 305 Ko |
| intégré · nuit · anatomie · comprendre | 11,2 ms | 4 | 310 Ko |
| intégré · carte · skipper · navigation | 8,8 ms | 3 | 167 Ko |
| La Trinité · nuit · dessus · navigation | 17,3 ms | 3 | 519 Ko |
| La Trinité · carte · skipper · navigation | 81,8 ms | 3 | 5,35 Mo |

Ces temps proviennent de Chromium headless/SwiftShader et servent à comparer
les backends dans le même environnement, pas à qualifier un GPU matériel. Deux
passes Legacy consécutives, puis une passe après intégration du bundle Three,
ont produit les mêmes six empreintes SHA-256.

## Phases et gates

| Phase | État | Gate de sortie |
| --- | --- | --- |
| 0 · audit et choix du renderer | terminé | frontières, risques et WebGLRenderer décidés |
| 1 · baseline Legacy | terminé | 6 scènes reproductibles, diagnostics et réseau contrôlés |
| 2 · build Three autonome | terminé | r186 embarqué, smoke triangle, Legacy actif, 48 tests navigateur verts |
| 3 · extraction de `RenderFrame` | prochaine | Legacy consomme la façade sans écart visuel ni physique |
| 4 · caméra et projection Three | en attente | ancres Legacy/Three à environ 0,5 px |
| 5 · port, eau et infrastructures | en attente | captures iso-rendu sur intégré et La Trinité |
| 6 · bateaux et overlays monde | en attente | six scènes dans la tolérance définie |
| 7 · optimisation | en attente | grand port plus rapide, allocations et mémoire stables |
| 8 · bascule v2 | en attente | Three par défaut, Legacy retiré après qualification complète |

## Prochaine tranche

Créer sous `src/simulateur-port/rendering/` un contrat `RenderFrame` composé de
données de présentation finies et immuables, puis adapter le renderer Legacy à
ce contrat sans déplacer les fonctions de simulation. La tranche s'arrête dès
que le build, les 48 tests navigateur, les trajectoires étalons et les six
captures Legacy restent identiques.
