# Audit Graphify — 7 octobre 2026

Graphify `0.9.79` produit un graphe structurellement cohérent, mais plusieurs
erreurs d'extraction et pertes d'information limitent sa fiabilité pour expliquer
le comportement actuel de KJP. Les corrections ci-dessous sont proposées ;
aucun correctif à l'outil, à sa configuration ou aux sources produit n'est
appliqué par cet audit.

**Suivi :** les trois P1 sont désormais corrigés dans la distribution locale
`0.9.79+kjp.1`. La construction vérifiée et les patches sont décrits dans
[`tools/graphify/README.md`](../../tools/graphify/README.md). Les observations
ci-dessous conservent l'état initial `0.9.79` ; les P2/P3 restent ouverts.

## Périmètre et méthode

- Lecture du graphe courant, de son manifeste, du rapport et des leçons.
- Contrôle des identifiants, extrémités, sources, positions et hyperrelations.
- Comparaison aux sources KJP et au code installé de Graphify : `extract.py`,
  `extractors/engine.py`, `extractors/markdown.py`, `build.py`, `watch.py`,
  `cache.py` et `extractors/models.py`.
- Extraction AST neuve des 76 fichiers classés comme code, avec un cache séparé.
- Reproductions minimales des erreurs de récepteur, de portée et de portabilité.
- Mises à jour et mesures sur une copie du projet, avec `PYTHONHASHSEED=0`.

Les données et reproductions temporaires sont dans `/tmp/kjp-graphify-audit/`.
Les conclusions portent sur la version installée et cet état de KJP, sans
prétendre vérifier chaque relation sémantique ou chaque langage de Graphify.
Cet audit concerne l'outillage ; il ne déclenche pas la règle bibliographique
réservée aux sujets nautiques et physiques.

## Contrôles satisfaisants

Le graphe contient **1 671 nœuds, 2 882 liens, 118 communautés et 16
hyperrelations**. Aucun identifiant n'est dupliqué, aucune extrémité de lien ou
d'hyperrelation ne manque, aucune source déclarée n'a disparu, et aucune
position de nœud au format `L<n>` ne dépasse son fichier.

Les noms des 118 communautés sont présents. Les compteurs du rapport concordent
avec le JSON. Les 26 nœuds externes sans fichier source sont explicitement
identifiés comme externes : cette absence de source n'est pas une corruption.
Les 39 composantes et les quatre nœuds isolés ne constituent pas, à eux seuls,
une erreur.

Les hooks Git et le pilote de fusion sont installés. Les commandes `query`,
`path` et `explain` fonctionnent. Sur la copie, les mises à jour sans changement
laissent le JSON identique et ne relancent pas inutilement le clustering.

## Constats et corrections proposées

### 1. P1 — Faux appels dus à la résolution des méthodes

Sur les **21 auto-relations `calls`, 11 sont fausses et 10 sont valides**.
Graphify traite le nom d'une méthode appelée sur un objet comme celui d'une
fonction du fichier, sans preuve que les deux désignent la même cible.
Les liens incorrects sont pourtant marqués `EXTRACTED`, confiance `1.0`.

Exemples vérifiés :

- [`native-world-renderer.mjs`](../../src/simulateur-port/rendering/native-world-renderer.mjs),
  ligne 94 : `renderer.render(...)` devient une récursion de la fonction locale
  `render()`.
- [`native-player-resources.mjs`](../../src/simulateur-port/rendering/native-player-resources.mjs),
  lignes 140 et 149 : les méthodes `report()` et `dispose()` de ressources
  distinctes sont confondues avec les fonctions locales homonymes.
- [`port-editor-core.js`](../../src/ports/port-editor-core.js), ligne 1101 :
  l'appel à la fonction `populateBoats()` définie ligne 730 est attribué à la
  méthode homonyme définie ligne 1093.
- [`native-world-renderer.test.js`](../../tests/native-world-renderer.test.js),
  ligne 25 : le `digest()` d'un objet de hachage devient un appel à la fonction
  locale `digest()`.

Reproduction minimale :

```js
function render(renderer) { renderer.render(); } // fausse récursion produite
function realRec(n) { if (n > 0) return realRec(n - 1); } // récursion valide
```

**Correction proposée :** résoudre les appels par portée lexicale et par
récepteur. Une méthode de cible inconnue doit rester non résolue ou ambiguë.
Conserver les récursions prouvées ; supprimer toutes les auto-relations serait
une régression. Les 11 cas confirmés sont un minimum, pas un décompte exhaustif
des erreurs possibles parmi les 982 liens `calls`.

### 2. P1 — Relations distinctes perdues à la construction du graphe

L'extraction AST neuve produit **2 643 relations**. La construction en graphe
simple n'en conserve que **2 323**, soit **320 occurrences fusionnées**.
Le diagnostic relève **278 groupes contenant des types de relation différents** :
152 groupes `contains`/`indirect_call`, 122 `contains`/`calls`, deux groupes avec
les trois types et deux `imports`/`indirect_call`.

Exemple vérifié dans
[`build-port-generator.js`](../../scripts/build-port-generator.js) : le fichier
contient `build()` ligne 40 et l'appelle ligne 72. Le graphe construit ne conserve
que `contains`. Un parcours filtré sur les appels perd donc une information réelle.

Le mode dirigé seul ne suffit pas : le diagnostic prévoit encore **318
occurrences fusionnées**. Le contrôle du JSON final ne peut pas retrouver ces
relations déjà perdues.

**Correction proposée :** préserver les relations, leurs directions et leurs
preuves dans un multigraphe, ou dans une collection explicitement exploitée par
les parcours. Adapter et tester ensemble les requêtes, le clustering, les
exports et les mises à jour. Un simple changement de classe NetworkX sans ces
contrôles ne suffit pas.

### 3. P1 — JavaScript du template absent, avec des références trompeuses

[`src/simulateur-port/template.html`](../../src/simulateur-port/template.html)
contient **217 fonctions nommées**, mais Graphify ne lui associe aucun extracteur
AST. Ses 15 nœuds sont sémantiques et ne représentent pas ces définitions.
Le template du générateur n'a pas non plus d'extracteur AST.

Conséquence vérifiée : deux mentions de `drawWater()` dans
[`threejs-renderer-migration.md`](../threejs-renderer-migration.md), lignes 358
et 1247, sont reliées à la fonction homonyme du script d'illustration
`scripts/export-physics-model-illustrations.mjs`, alors que la fonction du
simulateur est dans le template, ligne 6485. `graphify explain drawWater` renvoie
ainsi le script d'illustration.

**Correction proposée :** extraire les blocs JavaScript inline des templates,
en conservant le fichier HTML et les numéros de ligne d'origine, sans déplacer
le code produit. Puis refaire la résolution des références documentaires ;
l'unicité d'un nom dans un graphe incomplet ne prouve pas sa cible.

### 4. P2 — Fraîcheur sémantique et documentaire insuffisamment visible

Le graphe conserve le concept `Release 1.1 Version Set` relié au simulateur et
au générateur depuis `README.md`. Le
[`README actuel`](../../README.md), lignes 43–49, décrit la release produit
`2.0.0`, moteur `6.0.0`, profil `6.0.1` et générateur `1.1.0`.
Le concept ancien ne permet donc pas de décrire fidèlement la release courante.

Les empreintes AST de `AGENTS.md` et `bibliographie/biblio.txt` ne correspondent
plus à leurs contenus après le dernier commit. Le hook a consigné
`No tracked code files in change set - skipping rebuild`, sans créer de signal
`needs_update`. Par conception, `graphify update .` conserve les représentations
sémantiques des documents ; cette commande seule ne rafraîchira pas le README.

**Correction proposée :** signaler les sources périmées par empreinte et par
type d'extraction, même pour un commit documentaire. Rafraîchir uniquement les
sources concernées, distinguer les versions historiques de la version actuelle,
et enregistrer la provenance temporelle. Les 190 nœuds sémantiques issus de 22
sources ne sont pas tous déclarés faux par cet audit.

### 5. P2 — Définitions distinctes fusionnées sous un même identifiant

Dans [`tests/ports/kjp-codec.test.js`](../../tests/ports/kjp-codec.test.js), quatre
méthodes `fetchImpl` appartenant à des objets de tests différents, lignes 913,
947, 985 et 1017, convergent vers le même nœud. La position du nœud n'identifie
qu'une des définitions. L'absence de doublons d'identifiants dans le JSON ne
détecte pas cette fusion préalable.

Reproduction : deux objets passés séparément à `harness`, chacun définissant
`run()`, produisent un seul nœud `run()` et deux relations de contenu.

**Correction proposée :** inclure l'identité du conteneur et de la portée
anonyme dans les identifiants des définitions. Tester la stabilité des
identifiants ainsi que la résolution vers chaque définition distincte.

### 6. P2 — Identifiants externes dépendants de la machine

Deux nœuds externes relatifs à `babelParse` et `traverse` embarquent
`users_arnaud_codex_main_kjp_port_simulator` dans leur identifiant. Ils proviennent
de l'import de la dépendance Playwright dans
[`check-simulator-i18n.js`](../../scripts/check-simulator-i18n.js), ligne 4.

Une reproduction dans deux répertoires temporaires confirme que le même import
de `node_modules/vendor/lib.js` produit des identifiants différents selon la
racine absolue du checkout.

**Correction proposée :** identifier les symboles externes par paquet, chemin
relatif et nom exporté, sans préfixe machine. Comparer deux copies du même corpus
et vérifier que leurs identifiants canoniques concordent.

### 7. P3 — Recalcul AST systématique de JavaScript/TypeScript

Le code de Graphify contourne explicitement le cache pour `.js`, `.mjs`, `.ts`
et les autres extensions de `_JS_CACHE_BYPASS_SUFFIXES`. Sur la copie, **59
fichiers sont reparsés à chaque mise à jour**, même sans changement de topologie.

Mesures indicatives d'une mise à jour sans changement :

| Workers | Durée | JSON identique |
| --- | ---: | --- |
| 8 | 2,572 s | oui |
| 1 | 3,297 s | oui |
| 4 | 2,309 s | oui |

Il s'agit d'un seul échantillon par réglage, pas d'une qualification de
performance. Il ne justifie pas à lui seul de modifier le nombre de workers.

**Correction proposée :** mettre en cache l'analyse syntaxique indépendante des
résolutions, puis invalider les résolutions selon les imports et exports
modifiés. Réactiver aveuglément le cache existant risquerait de conserver des
cibles périmées. Mesurer le gain après les corrections de fiabilité.

### 8. P3 — Dépendances représentées par deux hubs

`esbuild`, `ol`, `playwright` et `three` ont chacun un nœud de dépendance issu de
`package.json` et un nœud de référence issu des imports. Leurs degrés et chemins
sont séparés malgré une même dépendance.

**Correction proposée :** relier ou canonicaliser les deux représentations par
identité de paquet, en conservant les preuves d'import et la version déclarée.
Ce point est moins urgent que les faux appels et les omissions de sources.

## Plan de correction recommandé

1. **Fiabilité de l'extracteur :** corriger les récepteurs et les portées ;
   ajouter l'extraction des scripts inline avec positions d'origine. Vérifier
   les récursions valides, les méthodes homonymes et les mentions de `drawWater`.
2. **Préservation et fraîcheur :** conserver les relations multiples et
   dirigées ; afficher les sources périmées ; rafraîchir les documents concernés
   et régénérer le graphe sur une copie avant remplacement.
3. **Portabilité et coût :** normaliser les identifiants externes, rapprocher
   les hubs de dépendances et qualifier un cache AST correctement invalidé.

Les changements doivent porter sur une version Graphify corrigée et
reproductible, avec tests propres à l'outil. Une retouche isolée de `graph.json`
serait écrasée par les hooks ; un patch manuel non suivi dans l'environnement
global serait perdu lors d'une mise à jour.

Avant remplacement : conserver une sauvegarde ; vérifier les concepts KJP,
les lignes sources, les relations attendues et les récursions valides ; exécuter
`query`, `path` et `explain` ; comparer extraction complète et incrémentale ;
vérifier l'idempotence ; contrôler que les sources et livrables produit sont
strictement inchangés. Aucune qualification physique ou renderer globale n'est
nécessaire pour ces corrections de l'outillage.

## Clôture des trois P1

Les correctifs sont activés dans `graphifyy 0.9.79+kjp.1`. La wheel est construite
à partir de la distribution officielle vérifiée par SHA-256, avec des patches
suivis dans le dépôt. Les 190 concepts sémantiques existants sont conservés,
y compris les deux pages des templates, séparées de leurs modules de scripts.

Résultats des contrôles ciblés :

- 11 faux appels récursifs supprimés ; les 10 auto-relations valides conservées.
- Les 217 fonctions nommées du template sont indexées à leurs lignes d'origine,
  ainsi que ses helpers locaux définis par fonctions fléchées. Les alias de
  fonction dont la cible n'est pas prouvée restent non résolus.
- Les deux références erronées à la fonction `drawWater` du script d'illustration
  sont supprimées. La fonction du simulateur est accessible par son identifiant
  `src_simulateur_port_template_drawwater` ; les noms homonymes doivent être
  qualifiés lorsque leur contexte ne prouve pas la cible.
- Sur l'extraction AST complète du code et des deux templates : 3 485 relations
  produites, 3 485 conservées lors de la construction. Les relations multiples,
  leurs sites et leurs directions survivent à la sérialisation.
- 16 tests ciblés couvrent les corrections, les exports, les parcours, le
  clustering, la conservation des concepts et les mises à jour.
- Les empreintes des sources produit, des HTML livrés et des dépendances
  restent identiques à celles d'avant l'intervention.

La procédure de reconstruction, de validation et de retour arrière est dans
[`tools/graphify/README.md`](../../tools/graphify/README.md). Les P2/P3 de cet
audit ne sont pas inclus dans cette clôture.
