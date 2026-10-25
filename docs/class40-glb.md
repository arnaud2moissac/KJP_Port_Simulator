# Class40 — intégration du GLB fourni

Le 21 octobre 2026, l’utilisateur demande de remplacer uniquement le rendu du Pogo/Class40 par `KJP_Class40.glb`, avec interdiction de modifier le modèle physique.

## Fichier et calage

Le [GLB racine](../KJP_Class40.glb) est une copie **strictement identique** du fichier fourni dans `Downloads/KJP_Class40_pack`. Sa [notice d’origine](class40-glb-notice.txt) est conservée avec l’intégration.

Le 22 octobre, le lazybag est corrigé sur demande utilisateur : le rendu utilise
désormais [KJP_Class40_lazybag.glb](../KJP_Class40_lazybag.glb), dérivé de ce fichier.
La housse remonte vers le mât, s’y raccorde avec environ 3 mm de recouvrement
visuel et garde son pied sur la bôme. Seules les positions et normales de la
housse changent ; mât, bôme, couleurs, indices et autres pièces sont conservés.
`node scripts/reshape-lazybags.mjs` régénère les trois dérivés ; `--check` les
vérifie sans écriture. SHA256 du Class40 actif :
`af14b22e4768cd814bd0685c0d5f26affe4390b6e04d88ebe6eccb4cdefcbba6`,
FNV `0x1b27fe7b`. L’original et les paramètres physiques restent inchangés.

- SHA256 : `091385c899dd2ed0c679d4b9e5b027f903e5b9dc9880e3f7a51cf6683c838e84`.
- FNV : `0xcf74b8c6` ; 160 540 octets, 2 618 triangles, 4 863 sommets.
- Un maillage, une primitive indexée, un matériau, normales et couleurs RGBA normalisées ; aucune texture, ressource externe ou animation.
- Échelle 1, rotation KJP existante `[π/2, π/2, 0]`, translation visuelle `[0,095, 0, 0,02]`.

L’origine du fichier est au milieu de sa coque. Le décalage de 9,5 cm aligne ses extrémités sur le rail existant `[-6 ; 6,19]`, sans déplacer le bateau simulé. La coque mesurée fait 12,19 × 4,50 m ; la boîte complète inclut bout-dehors et safrans et mesure 14,306699 m de long. Le tirant d’eau visuel est 3 m et le sommet du mât 19 m au-dessus de la flottaison.

Le catalogue de rendu complète les bornes de `hullReference`, absentes de la notice embarquée du nœud, à partir des 295 premiers triangles de coque. Le binaire original n’est pas réécrit. Les attributs POSITION, NORMAL, COLOR_0 et les indices chargés sont comparés exactement au fichier fourni dans les tests.

## Présentation et indépendance physique

L’entrée `pogo-40-s4` du catalogue GLB charge désormais ce fichier. Le fichier procédural précédent `kjp_pogo_40_s4.glb` reste une sortie historique du générateur ; il n’est plus embarqué ni affiché pour ce bateau. Reconstruire les modèles procéduraux n’écrase pas le fichier utilisateur.

Les couleurs du fichier sont conservées en Navigation. Comprendre utilise les rôles existants : coque translucide, roof, quille et deux lames de safran visibles ; gréement, crosses de barre et détails du pont masqués. Les plages des deux lames sont les triangles 746–793 et 878–925. Leurs noms de diagnostic suivent le repère KJP ; les nœuds auxiliaires nommés du fichier ne sont pas utilisés.

L’hélice statique du fichier est sous la coupe de flottaison en Navigation et masquée en Comprendre, où l’hélice KJP reste affichée. Les quatre taquets décoratifs du fichier ne portent aucune interaction. Les six taquets fonctionnels, pare-battages, cibles de picking, aussières, points de force et axes de gouvernes restent définis par KJP. Le secours Canvas conserve sa silhouette et son état antérieurs.

Ce fichier est un Class40 scow générique, conformément à sa notice ; il n’est pas une géométrie physique du Pogo S4. Les écarts restent **visuels**, sans correction des paramètres acceptés :

| Mesure | GLB fourni | Profil physique conservé |
|---|---:|---:|
| Largeur | 4,50 m | 4,42 m |
| Profondeur de carène nue | 0,70 m | 0,46 m |
| Longueur à la flottaison géométrique | 10,360625 m | 10,90 m |
| Aire immergée projetée par lame | 0,865154 m² | 0,49 m² |
| Envergure immergée par lame | 1,81 m | 1,10 m |

Aucune de ces mesures Three/GLB ne pilote les collisions ou les calculs hydrodynamiques. Aucun fichier physique, coefficient, commande ou pas de temps n’a été modifié.

## Contrôles ciblés

- `npm run build:simulator` et `npm run check:simulator`.
- `npm run test:rendering` : 14/14, dont intégrité du GLB fourni et immutabilité des six profils/moteur.
- `npm run test:renderer:quick` : 19/19, dont sélection, cache, picking, radiographie et secours sur les six bateaux.
- `npm run validate:ui -- --product simulator --case controls.60` : sélection, persistance et conservation du port réussies.
- Inspection Navigation dessus/oblique, Comprendre Translation/Rotation et Canvas : aucune erreur console.
- Comparaison avec l’HTML sauvegardé avant remplacement : **état physique, efforts, axes, cibles d’amarrage et caméra strictement identiques**, après les mêmes commandes sur 12 secondes. L’orbite caméra n’entraîne aucun transfert GPU.

Les empreintes des fichiers restent exactement : moteur `06032b6c3075061bd37a154d02720b3332728ce4ee65fcb19204733fc7f94251`, profils `cf394bea6f06da25852fac82d038f182d33e10945d601927e031122e868383d7`.

Les captures avant/après et le JSON de comparaison sont archivés sous `/Users/arnaud/.codex/visualizations/2026/10/20/01a15a7f-dff5-76e2-adad-ded3e9a47761/class40-supplied/`. Les résultats de performance et mesures du précédent [rapport des quatre modèles](four-vessel-glb.md) concernent la livraison initiale, avant ce remplacement visuel. Aucune qualification globale de release ou de performance n’a été relancée pour cette substitution locale.
