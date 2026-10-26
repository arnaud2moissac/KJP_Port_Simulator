# Lire les modèles de fardage et d’eau

Les deux GLB séparés et les planches SVG concernent le Sun Odyssey 36i. Ils sont générés depuis le profil sun-odyssey-36i-pedagogical 6.0.1, moteur 6.0.0. Les PDF comportent chacun une planche multi-axe et un catalogue des valeurs exactes.

## Explorer les trois bateaux

Ouvrir [explorer-les-modeles.html](explorer-les-modeles.html), puis choisir **Sun Odyssey 36i**, **Contessa 26** ou **Dufour 310 Grand Large 2014** dans le menu **Bateau**. Le menu **Modèle** donne accès au fardage et aux parties immergées du bateau choisi. Les modèles embarqués sont construits depuis les profils versionnés du dépôt ; le nom et la version du profil actif figurent en bas du panneau latéral.

Tourner le modèle par glisser, zoomer à la molette et déplacer avec le bouton droit. Les boutons **Perspective**, **Profil**, **Plan** et **Coupe** offrent des vues prédéfinies. Cliquer sur une surface colorée pour lire ses données ; les légendes, les compteurs et l'explication de la hauteur des panneaux suivent le bateau choisi.

Le Contessa comporte sept sections équivalentes de quille longue. Le Dufour affiche ses deux safrans, avec cinq bandes chacun ; son profil ne relie aucune hélice directement aux safrans. Le lecteur reste autonome et fonctionne sans réseau : ses six modèles sont inclus dans le fichier HTML. Le lien **GLB** télécharge le modèle du bateau et de la vue actifs. Le lien **Dessin vectoriel** concerne uniquement les planches du Sun Odyssey 36i.

Les dessins **fardage.svg** et **parties-immergees.svg** utilisent les mêmes coordonnées que les GLB séparés du Sun Odyssey 36i. Les nombres ci-dessous décrivent ces planches.

Repère bateau : x vers l’étrave, y vers tribord, z vers le haut. Repère GLB : X=-y, Y=z, Z=x. Les points noirs sont les centres. Pour l’eau, les flèches doubles montrent les axes latéraux ±y : elles ne fixent pas le sens de la force. La flèche orange avant montre l’axe propulsif +x et les flèches orange arrière le jet -x. Toutes les longueurs de flèche sont illustratives.

## Exactitude

- Fardage : les 28 flancs et le tableau reprennent leurs contours exacts. Les 4 panneaux de rouf et les 2 de bôme sont des rectangles équivalents conservant exactement aire, centre et normale. Le mât/gréement est omnidirectionnel : son symbole représente le centre et son aire est une valeur de calcul, pas celle de la sphère.
- Eau : les 11 rubans bleus représentent l’aire efficace de résistance latérale, pas des morceaux de carène. Quilles et bandes de safran préservent aire, centre et envergure sous une forme rectangulaire équivalente. Le disque d’hélice conserve son diamètre.
- Gris : silhouette extraite du GLB visuel versionné ; elle ne sert à aucun calcul physique.
- Les surfaces aérodynamiques totalisent 37,656 m² en additionnant les deux bords. Ce total n’est pas une aire de fardage projetée sous un vent donné.
- Les aires de cross-flow totalisent 3,324 m² ; les 28,5 m² de surface mouillée globale désignent une autre grandeur.

## Reproduire

Reconstruire uniquement le lecteur autonome et ses trois bateaux :

`node scripts/export-physics-model-illustrations.mjs --viewer-only`

Régénérer aussi les GLB séparés, les planches, le catalogue JSON et les PDF du Sun Odyssey 36i :

`node scripts/export-physics-model-illustrations.mjs --python <python-avec-reportlab>`

Les sources du lecteur sont `scripts/physics-model-viewer.html` et `scripts/physics-model-viewer.mjs` ; modifier ces sources puis relancer l'export, plutôt que le HTML généré.

Sources internes : `src/simulateur-port/vessel-profiles.js`, `src/simulateur-port/physics-core.js`, `kjp_sun_odyssey_36i.glb`, `KJP_Contessa26_rouge_lazybag.glb`, `kjp_dufour_310_gl_2014_dimfix_rudders.glb`. Les sources et dépendances locales sont exclues de la bibliographie externe. Le fichier `donnees-modele.json` conserve les valeurs du Sun Odyssey 36i et le classement exact/équivalent/illustratif.

## Mèche du safran

La ligne rouge représente l’axe fixe de la mèche. Pour le profil Sun Odyssey 36i 6.0.1, elle se situe à 20 % de la corde moyenne depuis le bord d’attaque, soit x=-4,142 m dans le repère bateau. Quand la barre tourne, le rectangle équivalent du safran et son centre d’application pivotent autour de cette ligne ; le recouvrement du jet est intégré sur la corde et la hauteur.
