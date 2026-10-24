# Contessa 26 — GLB fourni par l’utilisateur

Remplacement demandé le 22 octobre 2026, uniquement pour le rendu. Le [fichier racine](../KJP_Contessa26.glb) est une copie intacte du GLB fourni dans `Downloads/KJP_Contessa26_pack`, accompagné de sa [notice d’origine](contessa26-glb-notice.txt).

Sur demande ultérieure du même jour, le dérivé [KJP_Contessa26_rouge.glb](../KJP_Contessa26_rouge.glb) a été créé. Le bleu de coque est remplacé par **#DD3746**, rouge relevé sur la photo utilisateur (médiane de 45 647 pixels de peinture saturée dans la zone centrale). Le script `node scripts/recolor-contessa-glb.mjs` régénère ce dérivé ; `--check` le vérifie sans écriture. Seuls les octets RGB de 901 sommets de coque changent. Positions, normales, indices, alpha, liserés, pont et autres pièces sont préservés ; le fichier fourni reste intact.

Le rendu utilise maintenant [KJP_Contessa26_rouge_lazybag.glb](../KJP_Contessa26_rouge_lazybag.glb),
qui conserve cette peinture et corrige la housse de grand-voile sur demande du
22 octobre. Le lazybag remonte vers le mât et s’y raccorde avec environ 3 mm de
recouvrement visuel ; son pied reste sur la bôme. Le script
`node scripts/reshape-lazybags.mjs` ne retouche que ses positions et normales ;
`--check` vérifie la reproduction sans écriture. SHA256 du modèle actif :
`9f4623baf122cb6c4d5b14e48b4c5ea3e06bfa9507d6e2ee35cf97e54673d864`,
FNV `0xf3b5c439`. Le dérivé rouge précédent et les profils restent intacts.

Empreintes du dérivé rouge : SHA256 `71f0d23085ea812699692b878ceee5cea6a0a89543c1cde3b336a76e32775877`, FNV `0x56b46020`. La retouche de couleur passe le build, les 14 contrôles `test:rendering` et une inspection navigateur ciblée, avec comparaison physique avant/après identique.

- SHA256 : `597c70f1cc57290f26649c96c4f80fb1845dd0306296d382b8c2c2fbcbd430a5`.
- FNV : `0xe292c284` ; 223 240 octets, 3 265 triangles, 6 878 sommets.
- Un maillage indexé, une primitive et un matériau, normales et couleurs RGBA normalisées ; aucune texture, animation ou ressource externe.
- Échelle 1, rotation KJP existante `[π/2, π/2, 0]`, translation visuelle `[0,135, 0, 0,02]`.

Les 13,5 cm de décalage alignent le milieu de coque du GLB sur celui du rail KJP existant : extrémités `[-3,75 ; 4,02]`. La boîte avec safran et balcons n’est pas assimilée à la longueur de coque. Les bornes manquantes de `hullReference` sont complétées dans le catalogue de rendu, sans réécriture du binaire.

Navigation affiche maintenant la coque rouge, en conservant la bande ivoire, les œuvres vives et les autres couleurs de sommets. Comprendre conserve sa palette pédagogique et distingue les surfaces de quille longue intégrée au sein des 883 premiers triangles, la coque translucide et la lame de safran. La barre, ses ferrures, le gréement et les détails du pont restent masqués en radiographie. Aucun attribut ni indice n’est changé pour cette répartition des rôles.

L’hélice décorative du fichier est coupée sous la flottaison en Navigation et masquée en Comprendre, où l’hélice KJP reste affichée. Les marqueurs `RudderPivot` et `Mooring` du fichier ne sont jamais utilisés comme contraintes ou ancrages. Taquets fonctionnels, aussières, pare-battages, picking, forces et axe vertical équivalent de safran restent ceux du profil accepté. Le secours Canvas reste inchangé.

La notice décrit des conversions documentaires arrondies et une interprétation stylisée. Ces différences restent visuelles :

| Mesure | GLB fourni | Profil physique conservé |
|---|---:|---:|
| Longueur de coque | 7,77 m | 7,77 m |
| Largeur nominale | 2,29 m | 2,28 m |
| Flottaison de référence annoncée | 6,10 m | 6,08 m |
| Tirant d’eau | 1,22 m | 1,21 m |

Le mât de 9,50 m est une estimation visuelle de l’auteur. Le safran incliné et sa géométrie ne remplacent pas le safran équivalent du simulateur. Les 3 265 triangles fournis sont conservés, sans réduction pour revenir à la cible initiale des modèles procéduraux. Aucune cote visuelle ne devient un paramètre physique.

L’ancien fichier `kjp_contessa_26.glb` reste une sortie historique du générateur, sans être embarqué pour ce bateau. Les preuves géométriques et performances du [rapport initial](four-vessel-glb.md) concernent cette ancienne ressource.

## Contrôles

- Build et `npm run check:simulator` réussis.
- `npm run test:rendering` : 14 contrôles réussis, dont SHA du fichier utilisateur, conservation exacte des attributs/indices et cache du modèle.
- `npm run test:renderer:quick` : 18 contrôles réussis au premier passage ; le contrôle de démarrage Dufour initialement en échec est réussi en reprise isolée, sans modification du code (`node --test --test-name-pattern='activation native, cache' tests/dufour-player.test.js`).
- `controls.60` : sélection, persistance et conservation du port réussies en reprise isolée après un délai de démarrage dépassé au premier lancement simultané. Aucun seuil ou test n’a été assoupli.
- Inspection Navigation dessus/oblique, Comprendre Translation/Rotation et Canvas : aucune erreur console.
- Même protocole avant/après sur 12 secondes : état physique, forces, axe de gouverne, cibles d’amarrage et caméra strictement identiques. Aucun transfert GPU pendant l’orbite caméra.
- Audit indépendant : aucun indice invalide, triangle dégénéré ou normale inversée. Les 192 triangles de quille mis en évidence forment une seule composante connectée ; les raccords restent translucides.
- `graphify update .` réalisé ; diff sans erreur d’espacement.

Le moteur et les profils conservent leurs SHA256 : `06032b6c3075061bd37a154d02720b3332728ce4ee65fcb19204733fc7f94251` et `cf394bea6f06da25852fac82d038f182d33e10945d601927e031122e868383d7`.

Les captures et la comparaison avant/après sont archivées sous `/Users/arnaud/.codex/visualizations/2026/10/20/01a15a7f-dff5-76e2-adad-ded3e9a47761/contessa-supplied/`. Aucune qualification globale de release ni modification physique n’est incluse.
