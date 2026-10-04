# Lire les modèles de fardage et d’eau

Les deux GLB et les planches SVG sont générés depuis le profil sun-odyssey-36i-pedagogical 6.0.1, moteur 6.0.0. Les PDF comportent chacun une planche multi-axe et un catalogue des valeurs exactes.

Ouvrir **explorer-les-modeles.html** pour tourner les modèles, sélectionner un panneau, lire ses coordonnées et afficher les normales. Ce lecteur est autonome et fonctionne sans réseau. Les dessins **fardage.svg** et **parties-immergees.svg** utilisent les mêmes coordonnées que les GLB.

Repère bateau : x vers l’étrave, y vers tribord, z vers le haut. Repère GLB : X=-y, Y=z, Z=x. Les points noirs sont les centres. Pour l’eau, les flèches doubles montrent les axes latéraux ±y : elles ne fixent pas le sens de la force. La flèche orange avant montre l’axe propulsif +x et les flèches orange arrière le jet -x. Toutes les longueurs de flèche sont illustratives.

## Exactitude

- Fardage : les 28 flancs et le tableau reprennent leurs contours exacts. Les 4 panneaux de rouf et les 2 de bôme sont des rectangles équivalents conservant exactement aire, centre et normale. Le mât/gréement est omnidirectionnel : son symbole représente le centre et son aire est une valeur de calcul, pas celle de la sphère.
- Eau : les 11 rubans bleus représentent l’aire efficace de résistance latérale, pas des morceaux de carène. Quilles et bandes de safran préservent aire, centre et envergure sous une forme rectangulaire équivalente. Le disque d’hélice conserve son diamètre.
- Gris : silhouette extraite du GLB visuel versionné ; elle ne sert à aucun calcul physique.
- Les surfaces aérodynamiques totalisent 37,656 m² en additionnant les deux bords. Ce total n’est pas une aire de fardage projetée sous un vent donné.
- Les aires de cross-flow totalisent 3,324 m² ; les 28,5 m² de surface mouillée globale désignent une autre grandeur.

## Reproduire

`node scripts/export-physics-model-illustrations.mjs --python <python-avec-reportlab>`

Sources internes : `src/simulateur-port/vessel-profiles.js`, `src/simulateur-port/physics-core.js`, `kjp_sun_odyssey_36i.glb`. Les sources et dépendances locales sont exclues de la bibliographie externe. Le fichier `donnees-modele.json` conserve les valeurs et le classement exact/équivalent/illustratif.

## Mèche du safran

La ligne rouge représente l’axe fixe de la mèche. Pour le profil Sun Odyssey 36i 6.0.1, elle se situe à 20 % de la corde moyenne depuis le bord d’attaque, soit x=-4,142 m dans le repère bateau. Quand la barre tourne, le rectangle équivalent du safran et son centre d’application pivotent autour de cette ligne ; le recouvrement du jet est intégré sur la corde et la hauteur.
