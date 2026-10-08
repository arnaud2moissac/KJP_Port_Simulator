# Récupération de l’historique Three.js

Le contrat du renderer actuel est dans [renderer-three.md](../renderer-three.md).
Les anciens backends, journaux, captures, rapports et le skill de migration sont
conservés dans Git, sans dépendance du produit courant.

| Référence Git | Contenu |
| --- | --- |
| `threejs-migration-legacy-final` (`78fb7d148fe065d6fa2479dc8c1eaae151f755e1`) | Dernier état avec les anciens backends ; six captures Legacy et leur manifeste |
| `b93f3da0f20b4e2f18f337d4f77936da9bf2a0e1` | Archive complète avant nettoyage : journal et clôture, quatre rapports N5/N6/clôture, sept fichiers Legacy, huit archives techniques et skill dédié |

Le second commit contient les preuves postérieures au tag et les corrections
post-clôture. Le tag seul ne suffit donc pas à récupérer tout l’historique.
Les références natives courantes restent dans `tests/visual-baselines/native/`.

Pour consulter un fichier sans modifier le checkout courant :

```sh
git show b93f3da0f20b4e2f18f337d4f77936da9bf2a0e1:docs/threejs-renderer-migration.md
git show b93f3da0f20b4e2f18f337d4f77936da9bf2a0e1:docs/validation/threejs-migration-closure.md
```

Pour reproduire un ancien backend dans un checkout isolé :

```sh
git worktree add --detach /tmp/kjp-threejs-legacy threejs-migration-legacy-final
cd /tmp/kjp-threejs-legacy
npm ci
npm run check:simulator
npm run capture:renderer-baseline
```

Pour récupérer tous les documents et résultats historiques, créer de la même
façon un worktree sur le commit d’archive complet. Ses versions, empreintes,
protocoles, résultats et limites sont consignés dans le manifeste original.
Ne pas réintroduire les anciens backends dans le produit pour consulter l’archive.
