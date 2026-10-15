# GLB du Dufour 310 Grand Large 2014 — recette visuelle

## État et provenance

Intégration du 15 octobre 2026 sur `codex/dufour-310-bisafran`, à partir du
profil existant `dufour-310-gl-2014-deep-keel-experimental` 1.0.0.
Le GLB est actif automatiquement lorsque le profil Dufour est sélectionné.
L'utilisateur a autorisé la réduction des safrans et l'activation le 15 octobre
2026, après signalement des écarts du premier aperçu. Le Sun Odyssey
reste le bateau par défaut.

Ressource fournie par l'utilisateur :
[`kjp_dufour_310_gl_2014_dimfix.glb`](../kjp_dufour_310_gl_2014_dimfix.glb),
copiée sans modification depuis le fichier homonyme de Downloads. Aucune autre
version antérieure du Dufour n'est utilisée comme source.

La ressource affichée est le dérivé
[`kjp_dufour_310_gl_2014_dimfix_rudders.glb`](../kjp_dufour_310_gl_2014_dimfix_rudders.glb).
Il conserve tous les octets d'origine sauf les positions et les normales des
60 sommets appartenant exclusivement aux deux safrans (32 triangles).
Le fichier fourni reste intact, ainsi que ses couleurs, indices et métadonnées.

- SHA-256 du dérivé : `12b51b6eedc5f3a7503a4b07918e8a33ac46b37077b6e2fc302d232d1dcf229c`.
- Génération reproductible : `node scripts/resize-dufour-rudders.mjs`.
- Vérification sans écriture : `node scripts/resize-dufour-rudders.mjs --check`.

- Taille : 137 272 octets.
- SHA-256 : `e4db9395319edaa673f03ca94a7e552ccd65e9bacf24bba10704db540061e4d7`.
- glTF 2.0, un maillage, une primitive indexée, 4 354 sommets, 1 970 triangles.
- Un matériau mat, couleurs de sommets RGBA normalisées, sans texture ni
  extension de compression, sans animation.
- Ressource locale de rendu, sans nouvelle source nautique externe. Elle
  n'établit aucune cote ni valeur physique du profil existant.

## Mesures sur la géométrie chargée

`tests/dufour-player.test.js` charge les octets avec le GLTFLoader installé
(Three.js 0.186.0/r186). Les mesures ci-dessous utilisent les positions réellement
indexées, et non les dimensions déclarées dans `extras`. Les plages de triangles
ont été relevées dans le fichier et sont verrouillées par son empreinte ; l'ordre
alphabétique du catalogue des parties ne donne pas leurs offsets.

| Mesure | Résultat | Périmètre mesuré |
| --- | ---: | --- |
| Longueur de coque | 9,35000038 | bordé supérieur, flancs, carène et tableau ; hors accessoires |
| Largeur de coque | 3,30999994 | mêmes surfaces de coque |
| Longueur hors tout | 9,67000008 | toute la géométrie, marche arrière et balcon avant inclus |
| Longueur à la flottaison | 8,69999981 | sommets de la carène sur le plan Y = 0 |
| Tirant d'eau | 1,89999998 | point bas du bulbe par rapport à Y = 0 |
| Tête de mât | 14,56000042 | sommet du mât par rapport à Y = 0 |
| Hauteur totale | 16,46000040 | de la quille à la tête de mât |
| Envergure verticale d'un safran | 0,82000002 | sommets du safran seul ; avant : 1,45999994 m |
| Aire projetée d'un safran | 0,30999999 m² | projection latérale des triangles ; avant : 0,62675023 m² |

La coque seule occupe X ±1,655 m, Y de −0,65 à +1,055 m et Z de −4,80 à
+4,55 m. L'enveloppe totale occupe Z de −4,84 à +4,83 m. Ces deux enveloppes
ne sont pas interchangeables.

La géométrie confirme une flottaison Y = 0, un mât suivant +Y et une étrave
suivant +Z. Les grandes dimensions correspondent aux mètres annoncés. Le test
ne trouve aucun triangle dégénéré, normale non unitaire ou normale opposée au
sens des indices. Les jantes ont des positions et des enveloppes symétriques ;
les deux ensembles de gouverne ont des enveloppes symétriques. Les trois
rayons de chaque roue emploient la même orientation autour de leurs
centres ; ils ne sont pas une copie miroir de chaque rayon.

## Calage visuel, sans transformation de la simulation

Le milieu longitudinal réel de la coque est Z = −0,125 m, malgré la déclaration
de milieu de coque dans les métadonnées. Le milieu du rail de présentation KJP
existant est (+4,750 − 4,585) / 2 = +0,0825 m.

Le calage visuel aligne ces deux milieux :

```text
x local KJP = Z GLB + 0,2075 m
y local KJP = X GLB
z local KJP = Y GLB + 0,0200 m
```

Il correspond à `rotation = [π/2, π/2, 0]` en Euler XYZ,
`position = [0.2075, 0, 0.02]` et `scale = [1, 1, 1]`. Le décalage vertical
est celui de la flottaison de présentation déjà utilisée par KJP. Le bateau
entier conserve une échelle uniforme de 1. La seule édition locale est la
réduction des safrans décrite ci-dessous, effectuée hors ligne.

Après calage, la coque va de x = −4,5925 à +4,7575 m, contre −4,585 à +4,750 m
pour le rail KJP : écart de 7,5 mm à chaque extrémité. Cette mise en place n'est
pas une estimation du centre de gravité. La pose, l'interpolation et les
ancrages physiques sont ceux que KJP produisait avant cette intégration.

## Réduction autorisée des safrans et écarts conservés

Chaque safran est ramené à l'envergure verticale de 0,82 m et à l'aire projetée
de 0,31 m² de l'équivalent du profil existant. Cela ne transforme pas ces
estimations physiques en cotes mesurées sur le Dufour réel.

Le script applique aux seuls sommets de chaque lame des facteurs
`[0.5616438582, 0.5616438582, 0.8806557578]` selon les axes X/Y/Z du GLB.
Le point fixe est à `[±0.9102500081, -0.1000000015, -4.1160000038]` m : centre
transversal de la racine, hauteur de racine et station de mèche équivalente à
24 % de corde. La hauteur des racines et leur position de mèche sont conservées,
ainsi que la symétrie et l'inclinaison. Les normales sont transformées par
l'inverse transposée puis normalisées. Aucun autre sommet n'est modifié.

1. **Raccord coque/pont du fichier.** Les stations du bord de pont et du haut
   de coque ne coïncident pas. Le bord avant du pont est à Z = +4,670 m contre
   +4,550 m pour le haut de coque : décalage de 12 cm. À l'arrière, les stations
   correspondantes diffèrent de 11,5 cm. Les niveaux verticaux diffèrent
   d'environ 2,1 cm. Une transformation rigide du bateau entier ne répare pas
   ces raccords internes. Ce raccord n'est pas retouché par la réduction des
   safrans et reste une limite visuelle documentée.
2. **Gabarit du profil.** LOA 9,67 m, largeur 3,31 m, LWL 8,70 m et tirant d'eau
   1,90 m concordent. La coque de 9,35 m diffère de 1 cm des 9,36 m du dossier
   constructeur retenu antérieurement ; le contour de rail du profil fait
   9,335 m. La silhouette Canvas antérieure place sa tête de mât à 12,40 m,
   contre 14,56 m dans ce GLB ; cette ancienne présentation de secours est
   conservée. Aucun de ces nombres n'a été corrigé pour adapter le visuel.
3. **Safrans.** Chaque safran du dérivé va de Y = −0,10 à −0,92 m, avec une
   envergure verticale de 0,82 m et une aire projetée de 0,31 m². Les racines
   visuelles sont centrées à X = ±0,91025 m, contre y = ±1,03 m pour les
   points physiques. Ces écarts restent visibles en Comprendre ; les efforts
   conservent leurs origines physiques, indépendantes des surfaces GLB.
4. **Équipements.** Le contour local du GLB diffère du rail estimé existant.
   À l'abscisse des attaches avant, le rail KJP est environ 10,5 cm plus en
   dedans que le bord de pont GLB ; aux stations milieu et arrière, il est
   environ 4,4 et 3,8 cm plus en dehors. Les différences verticales locales
   sont de l'ordre de 2 à 3,4 cm. Les taquets, attaches et pare-battages KJP
   ne sont pas déplacés. L'activation conserve ces écarts d'alignement.

L'inspection des vues de dessus, de profil, de poupe et radiographiques a été
effectuée dans le simulateur. Elle ne constitue ni une certification de
continuité topologique du modèle, ni une mesure réelle des appendices du bateau.

## Branchement et cycle de vie

L'association est dans `nativePlayerDefinition()` de
`src/simulateur-port/template.html`. Le profil Dufour utilise la ressource
`dufour-310-gl-2014-dimfix-rudders`, sans paramètre d'aperçu. Le Sun Odyssey
conserve sa propre ressource et le secours Canvas sa silhouette Dufour.

`rendering/native-player-model.mjs` contient le catalogue des deux GLB et un
cache de chargement par ressource. Le chemin existant GLTFLoader/parseAsync
consomme les octets intégrés par esbuild au HTML autonome. Chaque GLB est chargé
une fois par page ; les changements de profil ou de backend réutilisent sa
géométrie. Les instances libèrent leurs matériaux propres, et ne libèrent pas
la géométrie partagée du cache.

Navigation utilise les couleurs originales sans teinte multiplicative, avec
le matériau non éclairé mat du chemin natif existant. Comprendre affecte les
matériaux radiographiques existants à des plages d'indices ; ni indices ni
sommets ne sont reconstruits. Les deux safrans restent statiques, comme dans le
GLB fourni et le chemin joueur déjà présent. Les axes de gouverne et les flèches
restent ceux de KJP. Il n'a pas été nécessaire de découper le maillage.

Le GLB n'ajoute ni aussière, ni pare-battage, ni taquet interactif ni collision.
Les équipements existants et leurs cibles Canvas restent propriétaires de ces
fonctions ; le canvas Three conserve `pointer-events: none`. L'échec GLB est
relayé au repli Canvas existant. Celui-ci garde la silhouette Dufour antérieure,
et non une projection reconstruite du GLB.

## Validation et preuves

Le HTML antérieur à la réduction, avec le GLB initial affiché en aperçu, a été
conservé avant toute modification
(SHA-256 `ea55ec6b4375c1091db6200f225a531b4b34f6c0113a9f3858d8c6f0fb8f209c`).
La comparaison appariée rejoue le même profil, la même météo et les mêmes
commandes : accélération, neutre, inversion, barre en avant et en arrière.
**33 états physiques sont exactement identiques par comparaison profonde.**

Les fichiers physiques préexistants ont gardé leurs empreintes :

- `physics-core.js` : `06032b6c3075061bd37a154d02720b3332728ce4ee65fcb19204733fc7f94251`.
- `vessel-profiles.js` : `d3ecd2b22a206842b0b86b7b4e9453440d859dc217c7c84d51ecd35c461878d4`.

### Coût de rendu apparié

Chromium 149.0.7827.55, macOS arm64, WebGLRenderer r186, backend ANGLE Vulkan
**SwiftShader logiciel**, navigateur headless, 1 440 × 1 000 pixels CSS, DPR 1.
Comparaison GLB initial en aperçu / dérivé réduit et activé. Même port, profil
Dufour, état, météo, caméra de dessus, mode et timestamps :
32 images de chauffe puis 120 images mesurées, trois répétitions avec ordre
avant/après alterné. Les snapshots et caméras sont exactement identiques dans
chaque paire, avec zéro transfert de buffer après chauffe.

Les nombres de triangles et d'appels sont ceux de la scène entière. Les temps
sont les médianes des trois p95 du callback CPU KJP ; ce ne sont pas des temps
GPU matériels ni une mesure de fréquence d'affichage.

| Mode | Triangles avant → après | Appels avant → après | p95 CPU avant → après |
| --- | ---: | ---: | ---: |
| Navigation | 18 585 → 18 585 | 380 → 380 | 1,9 → 1,6 ms |
| Comprendre / Translation | 21 677 → 21 677 | 427 → 427 | 4,7 → 5,1 ms |
| Comprendre / Rotation | 27 925 → 27 925 | 431 → 431 | 4,3 → 5,8 ms |

Le p95 CPU baisse en Navigation et augmente dans les deux vues Comprendre de
cet échantillon, particulièrement en Rotation. Le chronométrage avec
`WebGL.finish()` après le callback donne les mêmes p95 arrondis au dixième de
milliseconde. Ce protocole logiciel ne qualifie pas le coût sur le GPU matériel.
Aucun seuil n'a été modifié et aucune absence de régression de performance
n'est revendiquée.

SHA-256 du HTML candidat mesuré :
`c2e91b56748cee49dba327d5f9e18e08e0fac86eab74709032bf593dc912f8c8`.
SHA-256 des 33 états physiques comparés :
`a83bbbd6da2cd22e2a057c6df2f82d47f72cfa192ac7e63b3ccef546cd3f2883`.

Les tests couvrent les dimensions et normales chargées, le fichier
exact, la symétrie des enveloppes, le calage, le picking d'un taquet, la commande
clavier, Translation/Rotation, le repli, le cache après un aller-retour Sun/Dufour
et l'activation ordinaire sans paramètre de recette. Ils vérifient aussi que
les deux safrans mesurent 0,82 m / 0,31 m² et que tous les autres sommets,
normales, couleurs, indices et métadonnées restent identiques au fichier fourni.

Contrôles exécutés avec succès :

- `npm run build:simulator` puis `npm run check:simulator`.
- `npm run test:rendering` : 6/6.
- `npm run test:renderer:quick` : 12/12, dont les trois cas Dufour.
- `npm run validate:ui -- --product simulator --case controls.60` : changement
  de bateau, persistance et conservation du port.
- `node --test tests/validation-routing.test.js` : 4/4.
- Comparaison appariée des 33 états et des trois modes décrite ci-dessus.
- `git diff --check` et mise à jour AST `graphify update .`.

La suite physique complète et une qualification de release n'ont pas été
relancées pour cette intervention exclusivement visuelle. L'iso-physique est
contrôlée ici par les empreintes des sources et la comparaison des états.

Les captures et le rapport JSON apparié sont conservés dans les artefacts de la
conversation sous le dossier `dufour-glb-final`. L'audit générique `audit:assets` du
skill Three n'a pas pu démarrer : son environnement n'a pas la dépendance `tsx`.
Les contrôles GLTFLoader propres au dépôt ci-dessus ont été exécutés directement.
Safari, Firefox, appareils mobiles réels et chronométrage GPU matériel dédié
ne font pas partie des vérifications effectuées.
