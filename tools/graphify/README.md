# Graphify corrigé pour KJP

La distribution `graphifyy 0.9.79+kjp.1` corrige les trois P1 de
[l'audit du 7 octobre 2026](../../docs/validation/audit-graphify-2026-10-07.md).

- Les appels JavaScript/TypeScript sont résolus par portée ; une méthode sur un
  objet inconnu ne devient pas un appel à une fonction locale homonyme.
- Un multigraphe conserve chaque relation, sa direction et sa preuve. Le
  clustering et la cohésion utilisent une projection simple ; les requêtes et
  exports consultent les relations multiples.
- Les scripts JavaScript inline des HTML sous `src/` sont extraits avec le
  fichier et les lignes d'origine. Les scripts externes et les blocs JSON sont
  exclus. Les concepts sémantiques existants restent conservés.

Les patches sont dans `p1.patch`, avec les empreintes des fichiers de base dans
`base-files.json`. La version et la SHA-256 de la wheel officielle sont fixées
dans `build-wheel.py`. La construction refuse une base différente et génère
une wheel déterministe avec un manifeste `RECORD` recalculé.

## Reconstruction et installation

Depuis la racine du dépôt, avec Python 3 et `patch` :

```sh
python3 tools/graphify/build-wheel.py
uv tool install --force tools/graphify/.build/graphifyy-0.9.79+kjp.1-py3-none-any.whl
graphify --version
```

Le téléchargement officiel est public, vérifié par SHA-256. Avec une wheel
déjà téléchargée, passer `--base-wheel /chemin/graphifyy-0.9.79-py3-none-any.whl`.
Les fichiers `.build/` sont générés et ignorés par Git. La wheel installée
contient tous les patches ; aucun patch manuel de `site-packages` n'est requis.

Les commandes `graphify` et `graphify-mcp` utilisent cette distribution. Le
chemin Python des hooks Git existants reste valable après le remplacement du
paquet dans le même environnement uv. Vérifier `graphify hook status` ; après
un changement d'environnement Python, réinstaller les hooks avec
`graphify hook install`.

## Validation ciblée

```sh
GRAPHIFY_NO_AUTO_REFRESH=1 PYTHONHASHSEED=0 "$(cat graphify-out/.graphify_python)" tests/graphify/test_p1.py
PYTHONHASHSEED=0 graphify update .
```

La suite vérifie les récepteurs inconnus, les récursions JS et TS, les méthodes
`this`, le masquage par paramètre, les imports nommés, les relations parallèles
et réciproques, leurs sites, les exports JSON/HTML, les requêtes, le clustering,
les scripts HTML et leurs lignes, la couverture des 217 fonctions du template,
la cible de `populateBoats`, et la concordance des mises à jour complètes et
incrémentales. Aucune suite produit globale n'est nécessaire pour ces patches.

## Maintenance et retour arrière

Une mise à jour officielle de Graphify doit faire l'objet d'un nouveau portage
des patches et des tests. Ne pas remplacer cette distribution par une release
officielle sans vérifier que les trois P1 y sont corrigés.

Pour revenir à l'amont : `uv tool install --force graphifyy==0.9.79`, puis
restaurer le graphe sauvegardé avant activation. Le retour à la version amont
réintroduit les défauts corrigés ; il sert uniquement au diagnostic.

Les P2/P3 de l'audit restent hors de ce correctif, notamment la fraîcheur des
concepts sémantiques, les identités des portées anonymes, la portabilité de
certains identifiants externes et le cache JS/TS.
