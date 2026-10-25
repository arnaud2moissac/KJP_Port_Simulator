# Oceanis 48 — GLB fourni par l’utilisateur

Remplacement visuel demandé le 22 octobre 2026. Le [fichier racine](../KJP_Oceanis48.glb) est une copie intacte du fichier utilisateur `Downloads/KJP_Oceanis48_pack/KJP_Oceanis48.glb`. Sa [notice d’origine](oceanis48-glb-notice.txt) est conservée avec cette intégration.

Après correction du lazybag demandée le même jour, le rendu utilise
[KJP_Oceanis48_lazybag.glb](../KJP_Oceanis48_lazybag.glb). Sa housse remonte vers
le mât et s’y raccorde avec environ 3 mm de recouvrement visuel ; son pied reste
sur la bôme. Seules les positions et normales de la housse sont retouchées,
sans changement de couleurs, d’indices ou d’autre pièce. La reproduction est
assurée par `node scripts/reshape-lazybags.mjs`, avec `--check` sans écriture.
SHA256 actif : `7a2f571a5b4e04cd075273b6a37121bedba2186876e05cfaf4b33c616aace1b8`,
FNV `0x32f9fcee`. L’original et les paramètres physiques restent inchangés.

- SHA256 : `2d3b423ebeedaf57f4d47f192ba8f141612d1ff3ab2dd311f34619876b983618`.
- FNV : `0x4f3ac30c` ; 307 636 octets, 4 559 triangles, 9 467 sommets.
- Un maillage indexé, une primitive, un matériau source ; normales et couleurs RGBA normalisées conservées. Aucune texture, animation ou ressource externe.
- Échelle 1, rotation KJP existante `[π/2, π/2, 0]`, translation de rendu `[0,085, 0, 0,02]`.

Le décalage longitudinal de 8,5 cm aligne le milieu de coque du GLB sur celui du rail KJP existant, entre `−7,05` et `+7,22 m`. La coque mesure 14,27 × 4,74 m. Le calage utilise sa référence de coque embarquée, sans recentrage sur la boîte du gréement, sans redimensionnement ni réexportation du fichier.

Navigation conserve la coque blanche, les décorations, les vitrages et les deux roues distinctes. Le fichier représente une quille à aileron avec bulbe, un safran central et une plateforme arrière fermée. Ces pièces restent statiques comme dans les autres modèles KJP. Les 4 559 triangles sont conservés, sans réduction pour rejoindre le budget initial des modèles procéduraux.

Comprendre réutilise les matériaux radiographiques existants : coque, pont et plateforme translucides ; roof et vitrage de roof dans le rôle roof ; quille, bulbe et safran dans le rôle organe. Les autres détails et le gréement sont masqués. Les plages sont vérifiées contre les indices du binaire et son empreinte complète. Aucun attribut ni indice n’est modifié.

Le groupe décoratif `saildrive_and_propeller` est coupé sous la flottaison en Navigation et masqué en Comprendre pour conserver l’hélice fonctionnelle KJP distincte. Les marqueurs `Mooring...`, `RudderPivot` et autres nœuds du GLB restent des informations visuelles : aucun ne remplace un taquet, une force, une collision ou une commande du simulateur. Les sections et implantations stylisées annoncées par la notice ne deviennent pas des paramètres physiques.

Le moteur, les profils acceptés, le secours Canvas, les interactions, les aussières et les pare-battages restent inchangés. L’ancien `kjp_oceanis_48.glb` reste une sortie historique du générateur, sans être embarqué pour l’Oceanis. Les mesures et performances du [rapport initial](four-vessel-glb.md) décrivent cette ancienne ressource.

## Contrôles

- Build et `npm run check:simulator` réussis.
- `npm run test:rendering` : 14 contrôles réussis, dont empreinte du fichier, conservation exacte des attributs et indices, deux roues séparées, safran unique et cache partagé.
- `npm run test:renderer:quick` : 19 contrôles réussis, dont les six modèles, le cache, le picking, Comprendre et les secours en cas d’échec GLB, d’absence WebGL ou de perte de contexte.
- `npm run validate:ui -- --product simulator --case controls.60` réussi : sélection des six bateaux, persistance, remise à zéro et conservation du port.
- Inspection navigateur : Navigation dessus/oblique, thèmes sombre/clair, Comprendre Translation/Rotation et Canvas ; aucune erreur console ni requête externe inattendue.
- Comparaison avant/après sur 12 secondes : états physiques, forces, axes de gouverne, cibles d’amarrage et caméra strictement identiques. Aucun transfert de buffer GPU lors de l’orbite caméra.
- Revue indépendante : 20 plages conformes au binaire, aucun indice invalide, triangle dégénéré ou normale inversée ; calage et attributs vérifiés hors navigateur.
- `graphify update .` réalisé ; diff sans erreur d’espacement.

Les SHA256 du moteur et des profils restent respectivement `06032b6c3075061bd37a154d02720b3332728ce4ee65fcb19204733fc7f94251` et `cf394bea6f06da25852fac82d038f182d33e10945d601927e031122e868383d7`.

Les captures et comparaisons sont conservées sous `/Users/arnaud/.codex/visualizations/2026/10/20/01a15a7f-dff5-76e2-adad-ded3e9a47761/oceanis-supplied/`. Aucune qualification globale de release ou de performance n’est incluse.
