# Sun Odyssey 24.2 — GLB fourni par l’utilisateur

Le rendu utilise [KJP_SunOdyssey242.glb](../KJP_SunOdyssey242.glb), copie intacte
du fichier fourni le 22 octobre 2026 dans `Downloads/KJP_SunOdyssey242_pack (1)`.
La [notice d’intégration version 2](sun-odyssey-24-2-glb-notice.txt) est conservée.
Cette version contient déjà le lazybag remontant vers le mât et posé sur la bôme.

- SHA256 : `b1681d04f1993598cddd4b26873659c2c7fcd39a1232fb3ab2322e234bde96d3`.
- FNV : `0xb0507705` ; 238 108 octets, 3 438 triangles, 7 270 sommets.
- Un maillage indexé, une primitive, un matériau source ; normales et RGBA
  normalisées conservées. Aucune texture, animation ou ressource externe.
- Coque mesurée : 7,20 × 2,49 m ; tirant d’eau visuel : 1,10 m.
- Échelle 1, rotation KJP `[π/2, π/2, 0]`, translation visuelle `[0,05, 0, 0,02]`.

Les 5 cm de calage alignent le milieu de coque sur le rail KJP existant
`[−3,55 ; +3,65] m`. La référence de coque embarquée est utilisée sans recentrage
sur la boîte du gréement. Le safran et le davier portent la boîte complète à
7,302 m ; cette dimension ne remplace ni la longueur de coque ni les collisions.
Le mât de 10,65 m reste une estimation visuelle de l’auteur. La flottaison
documentaire de 6,60 m annoncée par la notice ne remplace pas les 6,61 m du profil.

Navigation conserve la coque blanche, les liserés bleu ardoise, la barre franche,
le safran unique au tableau, la jupe et son encoche. Comprendre réutilise les
rôles existants : coque, pont et jupe translucides ; liseré en silhouette ;
roof et vitrages en rôle roof ; quille, bulbe et safran en rôle organe.
Les détails de cockpit et de gréement restent masqués en radiographie.
Les 18 plages d’indices sont propres au binaire version 2 ; la housse occupe
les indices 5 376 à 5 615, soit 80 triangles.

L’hélice décorative est coupée sous la flottaison en Navigation et masquée dans
Comprendre pour conserver l’hélice KJP séparée. Les repères `Mooring...`,
`RudderPivot` et `TillerPivot` du GLB ne deviennent pas des points fonctionnels.
Moteur, profil, commandes, contacts, aussières, pare-battages et secours Canvas
restent inchangés. Les dimensions et implantations stylisées ne sont pas des
données physiques nouvelles.

L’ancien `kjp_sun_odyssey_24_2.glb` reste une sortie historique du générateur,
sans être embarqué pour ce bateau. Les mesures et performances du
[rapport initial](four-vessel-glb.md) concernent cette ancienne ressource.

## Contrôles

- Build et `npm run check:simulator` réussis.
- `npm run test:rendering` : 15 contrôles réussis, dont empreinte du fichier,
  attributs et indices chargés identiques au GLB fourni, plages version 2 et cache.
- `controls.60` réussi : sélection des six bateaux, persistance, remise à zéro
  et conservation du port.
- Navigation dessus/oblique, thèmes sombre/clair, Comprendre Translation/Rotation
  et Canvas inspectés ; aucune erreur console ni requête externe inattendue.
- Comparaison avant/après sur 12 secondes : états, forces, axes de gouverne,
  cibles interactives et caméra strictement identiques. Aucun transfert de
  géométrie pendant l’orbite caméra ; GLB chargé une seule fois.
- Audit indépendant : plages et bornes conformes au binaire, normales unitaires
  et orientées, aucune face dégénérée. Les sept sections du lazybag montent
  jusqu’au mât ; le pied reste en contact avec la bôme ou le mât.
- `graphify update .` réalisé ; diff sans erreur d’espacement.

Le moteur et les profils conservent leurs SHA256
`06032b6c3075061bd37a154d02720b3332728ce4ee65fcb19204733fc7f94251`
et `cf394bea6f06da25852fac82d038f182d33e10945d601927e031122e868383d7`.

Les preuves de rendu sont conservées sous
`/Users/arnaud/.codex/visualizations/2026/10/20/01a15a7f-dff5-76e2-adad-ded3e9a47761/sun-odyssey-24-2-supplied/`.
Aucune qualification globale de release ou de performance n’est incluse.
