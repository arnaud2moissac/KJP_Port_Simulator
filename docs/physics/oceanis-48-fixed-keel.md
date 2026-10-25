# Oceanis 48 — fiche de profil physique

Profil `oceanis-48-fixed-keel-experimental`, version `1.1.0`, schéma 5, moteur 6.0.0. **Plausible mais non calibré.**

## Configuration, sources et arbitrages

Oceanis 48, inventaire **Europe V10166 (Y), 1er juin 2017**, quille longue fixe de 2,17 m, mât classique, sail-drive conventionnel et tripale fixe standard. P.1 : LOA 14,60 m, coque 14,27 m, LWL 13,86 m, largeur 4,74 m, déplacement lège 12594 kg. P.2 : un safran suspendu à mèche composite, deux consoles de barre et six taquets. P.4 : Yanmar Common Rail 80 cv, sail-drive standard, tripale fixe ; Dock&Go est une option séparée exclue du profil.

La configuration 2017 évite de mélanger le moteur 75 ch des premières unités avec l'inventaire 80 ch. Moteur compatible retenu : Yanmar 4JH80, 58,8 kW à 3200 tr/min, associé à un SD60 conventionnel. Les fiches Yanmar confirment ce couple moteur/transmission, mais l'identification exacte et le rapport du bateau individuel ne sont pas publiés dans l'inventaire : réduction 2,23, rotation gauche, diamètre 0,508 m et pas 0,356 m restent estimés.

Divergences conservées : page Beneteau, tirant minimal 1,83 m ; manuel index H de septembre 2015, quille courte 1,96 m ; fiche 2017, quille courte 1,83 m. La version **longue 2,17 m**, commune aux documents utilisés, est retenue. Le déplacement 12594 kg n'est pas remplacé par un poids issu d'une autre variante. P.1, capacité d'eau 370 L ; liste p.4, 330 L : le chargement de calcul retient 185 kg (moitié de 370 L), écart de 20 kg couvert par l'incertitude.

Charge : 12594 + 150 kg personnes + 185 kg eau + 84 kg gazole + 180 kg équipement = 13193 kg, arrondi à 13200 kg. Une gouverne physique, deux roues seulement en présentation ultérieure. Aucun propulseur d'étrave ou de poupe, aucune force Dock&Go.

## Inventaire de charge additionnelle

Hypothèse E, masse en kg. Cet inventaire décrit une charge de simulation, sans prétendre reproduire le manifeste d’une unité réelle. Les personnes, l’eau et le gazole sont comptés séparément dans le calcul précédent ; les équipements fixes déjà compris dans le poids publié ne sont pas ajoutés. Pour le Pogo, les équipements réglementaires de jauge ne sont pas recomptés.

| Équipement mobile additionnel | Masse, kg |
|---|---:|
| Effets personnels | 40 |
| Avitaillement hors eau du réservoir | 60 |
| Outillage et rechanges mobiles | 30 |
| Consommables de bord supplémentaires | 20 |
| Amarrage additionnel transporté | 30 |
| **Total** | **180** |

L’inclusion exacte des équipements dans le poids de référence reste incertaine ; cette limite est conservée dans l’incertitude de chargement. Aucun détail de cet inventaire n’est présenté comme une donnée constructeur.

## Repère, méthode et limites

Unités SI ; x positif vers l’avant, y positif vers tribord, z positif vers le haut, flottaison z=0. Origine au CG longitudinal supposé, transverse symétrique ; incertitude de position du CG ±0,20 m pour les petits et ±0,35 m pour les grands. `centerOfGravity` n’est pas consommé par la matrice : aucune compensation de forces n’est ajoutée.

Carène nue représentée par onze sections propres. Les profondeurs individuelles stockées sont documentaires : le moteur emploie `canoeDraft × (0,46 + 0,54 × shape)`. Les masses ajoutées sway/yaw ne sont pas réglables séparément et les appendices n’y contribuent pas directement. La géométrie de coque ne constitue pas une intégration hydrostatique validée du déplacement.

Le rayon de giration est un prior E propre à la répartition longitudinale supposée, pas une mesure ni une similitude dimensionnelle du SO36i. La résistance longitudinale est un prior E indépendant : `R(u)=a u+b u|u|+montée de vague`. À 1 m/s, hors montée de vague, le coefficient effectif rapporté à la surface mouillée vaut `2(a+b)/(1025 S) = 0.01264`. Ce calcul explicite l’ordre de grandeur du choix, sans en faire une valeur constructeur ou une mesure. Linéaire, quadratique et seuil de Froude restent à calibrer séparément contre des essais propres au bateau.

Les coefficients sans dimension de foil et de fardage sont des priors génériques estimés, non des coefficients mesurés de cette coque. Les tables quatre quadrants sont générées avec des entrées propres explicites ; les constantes du générateur représentent sa structure commune, pas une hélice certifiée. Inerties moteur/arbre, courbe de couple et délais d’embrayage sont des priors mécaniques ; la courbe de puissance ne remplace pas une courbe constructeur complète.

Fardage : franc-bord intégré sur le rail propre ; roof, bôme et gréement décomposés en panneaux estimés, voiles affalées/enroulées, sans capote/bimini. La hauteur influence le vent local, sans roulis. Contacts 2D : enveloppe tangentielle estimée, défenses cylindriques ; raideurs et charges de travail sont des choix d’équipements pédagogiques E. Une ligne polyester équivalente travaille à 15 % d’allongement ; effort humain 200 N commun, non proportionnel au déplacement. Aucun paramètre n’a été calibré sur une trajectoire réelle dans cette version.

Domaine : bateau à plat, eau profonde (hypothèse h/T ≥ 4), 0–4 nd surface. Hors modèle : vagues, gîte, émergence des safrans, faible profondeur, berge, squat, interaction entre appendices et repli d’hélice. Les cas de vent dont un panneau dépasse 20 nd apparents sont signalés hors plage de référence ; aucune mesure tronquée n’est interprétée comme zéro.

## Masse et inertie calculées

| Grandeur | Valeur | Unité |
|---|---:|---|
| surge | 13200.000 | kg |
| sway | 13200.000 | kg |
| yaw | 175857.000 | kg·m² |
| added.surge | 1082.400 | kg |
| added.sway | 9046.008 | kg |
| added.swayYaw | -8022.641 | kg·m |
| added.yaw | 117962.049 | kg·m² |

Matrice effective : `[[14282.4,0,0],[0,22246.007580660757,-8022.641289894917],[0,-8022.641289894917,293819.0486503566]]`. Les valeurs sont issues du moteur inchangé.

## Provenance par famille

A constructeur/architecte ; B documentation technique ; C calcul ; D littérature applicable ; E estimation ; F calibration. Une famille couvre ses feuilles numériques sauf chemin plus précis. Les incertitudes sont relatives, sauf mention contraire.

| Chemin | Classe | Incertitude | Source et méthode |
|---|---|---:|---|
| `geometry` | E / estimated | 0.25 | docs/physics/oceanis-48-fixed-keel.md ;  ; Contour propre estimé depuis les dessins publiés ; sections de carène nue sans quille ; cf. fiche et tableau intégral |
| `mass` | E / estimated | 0.2 | docs/physics/oceanis-48-fixed-keel.md ;  ; Chargement inventorié ; rayon de giration propre ; masse ajoutée sectionnelle équivalente |
| `hull` | E / estimated | 0.3 | docs/physics/oceanis-48-fixed-keel.md ;  ; Prior indépendant de coque à déplacement ; résistance déduite de surface mouillée/vitesse de Froude, non mesurée |
| `appendages` | E / estimated | 0.25 | docs/physics/oceanis-48-fixed-keel.md ;  ; Géométrie plane estimée sur plan ; polarité générique, aucune interaction quille-safran |
| `propulsors` | E / estimated | 0.25 | docs/physics/oceanis-48-fixed-keel.md ;  ; Géométrie hélice et transmission estimées sauf chemins officiels ci-dessous ; tables quatre quadrants et dynamique mécanique comme priors non calibrés |
| `rudders` | E / estimated | 0.25 | docs/physics/oceanis-48-fixed-keel.md ;  ; Surfaces et centres équivalents à plat ; polaires de littérature et dynamique de barre estimée ; jet déterminé par géométrie |
| `steering` | E / estimated | 0.25 | docs/physics/oceanis-48-fixed-keel.md ;  ; Barres à roue couplées ; vitesse maximale conservée à 46°/s sans nouvelle calibration |
| `aerodynamics` | E / estimated | 0.25 | docs/physics/oceanis-48-fixed-keel.md ;  ; Franc-bord intégré sur contour versionné ; roof, bôme et gréement propres estimés ; coefficients de corps non profilés |
| `contacts` | E / estimated | 0.25 | docs/physics/oceanis-48-fixed-keel.md ;  ; Enveloppe tangentielle propre ; raideurs de défenses correspondant au gabarit ; loi KJP inchangée |
| `deckHardware` | E / estimated | 0.15 | docs/physics/oceanis-48-fixed-keel.md ;  ; Points fonctionnels estimés depuis plan de pont ; attaches 7 cm en dedans du rail |
| `mooring` | E / estimated | 0.25 | docs/physics/oceanis-48-fixed-keel.md ;  ; Polyester équivalent dimensionné par charge de travail propre ; effort humain 200 N et solveur KJP communs |
| `geometry.loa` | A / official | 0.03 | https://pro.beneteau.fr/documents/bateau/7937/V10166_OCEANIS_48_FR_LIGHT.pdf ; Inventaire Europe V10166(Y), 01/06/2017, p.1-2 et p.4 : quille longue, 80 cv, tripale fixe ; Valeur constructeur ; définition et variante conservées dans la fiche |
| `geometry.beam` | A / official | 0.03 | https://pro.beneteau.fr/documents/bateau/7937/V10166_OCEANIS_48_FR_LIGHT.pdf ; Inventaire Europe V10166(Y), 01/06/2017, p.1-2 et p.4 : quille longue, 80 cv, tripale fixe ; Valeur constructeur ; définition et variante conservées dans la fiche |
| `geometry.draft` | A / official | 0.03 | https://pro.beneteau.fr/documents/bateau/7937/V10166_OCEANIS_48_FR_LIGHT.pdf ; Inventaire Europe V10166(Y), 01/06/2017, p.1-2 et p.4 : quille longue, 80 cv, tripale fixe ; Valeur constructeur ; définition et variante conservées dans la fiche |
| `mass.lightDisplacement` | A / official | 0.03 | https://pro.beneteau.fr/documents/bateau/7937/V10166_OCEANIS_48_FR_LIGHT.pdf ; Inventaire Europe V10166(Y), 01/06/2017, p.1-2 et p.4 : quille longue, 80 cv, tripale fixe ; Valeur constructeur ; définition et variante conservées dans la fiche |
| `mass.displacement` | C / estimated | 0.08 | docs/physics/oceanis-48-fixed-keel.md ;  ; Somme explicite du déplacement de référence, personnes, liquides et charge additionnelle ; arrondi documenté |
| `mass.yawRadius` | E / estimated | 0.2 | docs/physics/oceanis-48-fixed-keel.md ;  ; Prior de répartition longitudinale propre ; inertie rigide m*k², aucune copie dimensionnelle |
| `mass.addedMassModel` | E / estimated | 0.25 | https://fossen.biz/html/marineCraftModel.html ;  ; Coefficients numériques estimés ; cadre de masse ajoutée de Fossen et modèle sectionnel KJP ; surge indépendant, sway/yaw couplés depuis carène nue, sans masse ajoutée des appendices |
| `hull.crossFlow.linearDampingFroude` | E / estimated | 0.2 | https://fossen.biz/html/marineCraftModel.html ;  ; Valeur estimée de régularisation KJP, non issue du document Fossen ; vitesse équivalente Fr*sqrt(g*LWL) |
| `propulsors.0.engine.powerKw` | A / official | 0.03 | https://www.yanmar.com/marine/product/engines/4jh80/ ; Spécifications moteur ; Puissance publiée du moteur ; 30 cv Pogo et 8 cv YS8 convertis à 0,7355 kW/cv |

Les éventuels regroupements A d’unités converties conservent les valeurs publiées et la conversion dans la méthode. Les dimensions non indiquées dans une source principale restent des estimations ou des données techniques secondaires dans les arbitrages ci-dessus.

## Valeurs numériques effectivement compilées

Ce tableau décrit le profil source, avant aplatissement de compilation ; les valeurs 1 sont sans dimension ou des comptages. Il comprend les stations, équipements, hélice et coefficients dérivés. Il évite qu’une valeur cachée soit présentée comme une donnée constructeur.

| Chemin | Valeur | Unité | Classe de provenance |
|---|---:|---|---|
| `geometry.loa` | 14.6 | m | A (`geometry.loa`) |
| `geometry.lwl` | 13.86 | m | E (`geometry`) |
| `geometry.lpp` | 13.5 | m | E (`geometry`) |
| `geometry.beam` | 4.74 | m | A (`geometry.beam`) |
| `geometry.draft` | 2.17 | m | A (`geometry.draft`) |
| `geometry.canoeDraft` | 0.84 | m | E (`geometry`) |
| `geometry.wettedArea` | 48 | m² | E (`geometry`) |
| `geometry.gunwale.0.x` | -7.05 | m | E (`geometry`) |
| `geometry.gunwale.0.halfBeam` | 1.83 | m | E (`geometry`) |
| `geometry.gunwale.0.z` | 1.22 | m | E (`geometry`) |
| `geometry.gunwale.1.x` | -6.1 | m | E (`geometry`) |
| `geometry.gunwale.1.halfBeam` | 2.13 | m | E (`geometry`) |
| `geometry.gunwale.1.z` | 1.18 | m | E (`geometry`) |
| `geometry.gunwale.2.x` | -4.8 | m | E (`geometry`) |
| `geometry.gunwale.2.halfBeam` | 2.3 | m | E (`geometry`) |
| `geometry.gunwale.2.z` | 1.15 | m | E (`geometry`) |
| `geometry.gunwale.3.x` | -3.3 | m | E (`geometry`) |
| `geometry.gunwale.3.halfBeam` | 2.37 | m | E (`geometry`) |
| `geometry.gunwale.3.z` | 1.13 | m | E (`geometry`) |
| `geometry.gunwale.4.x` | -1.6 | m | E (`geometry`) |
| `geometry.gunwale.4.halfBeam` | 2.36 | m | E (`geometry`) |
| `geometry.gunwale.4.z` | 1.13 | m | E (`geometry`) |
| `geometry.gunwale.5.x` | 0.2 | m | E (`geometry`) |
| `geometry.gunwale.5.halfBeam` | 2.25 | m | E (`geometry`) |
| `geometry.gunwale.5.z` | 1.16 | m | E (`geometry`) |
| `geometry.gunwale.6.x` | 1.9 | m | E (`geometry`) |
| `geometry.gunwale.6.halfBeam` | 2.03 | m | E (`geometry`) |
| `geometry.gunwale.6.z` | 1.2 | m | E (`geometry`) |
| `geometry.gunwale.7.x` | 3.4 | m | E (`geometry`) |
| `geometry.gunwale.7.halfBeam` | 1.68 | m | E (`geometry`) |
| `geometry.gunwale.7.z` | 1.28 | m | E (`geometry`) |
| `geometry.gunwale.8.x` | 4.7 | m | E (`geometry`) |
| `geometry.gunwale.8.halfBeam` | 1.23 | m | E (`geometry`) |
| `geometry.gunwale.8.z` | 1.36 | m | E (`geometry`) |
| `geometry.gunwale.9.x` | 5.8 | m | E (`geometry`) |
| `geometry.gunwale.9.halfBeam` | 0.75 | m | E (`geometry`) |
| `geometry.gunwale.9.z` | 1.44 | m | E (`geometry`) |
| `geometry.gunwale.10.x` | 6.6 | m | E (`geometry`) |
| `geometry.gunwale.10.halfBeam` | 0.31 | m | E (`geometry`) |
| `geometry.gunwale.10.z` | 1.5 | m | E (`geometry`) |
| `geometry.gunwale.11.x` | 7.22 | m | E (`geometry`) |
| `geometry.gunwale.11.halfBeam` | 0 | m | E (`geometry`) |
| `geometry.gunwale.11.z` | 1.55 | m | E (`geometry`) |
| `geometry.hullSections.0.x` | -6.3 | m | E (`geometry`) |
| `geometry.hullSections.0.dx` | 1.26 | m | E (`geometry`) |
| `geometry.hullSections.0.breadthFactor` | 0.72 | 1 | E (`geometry`) |
| `geometry.hullSections.0.immersedDepth` | 0.712992 | m | E (`geometry`) |
| `geometry.hullSections.0.shape` | 0.72 | 1 | E (`geometry`) |
| `geometry.hullSections.1.x` | -5.039999999999999 | m | E (`geometry`) |
| `geometry.hullSections.1.dx` | 1.26 | m | E (`geometry`) |
| `geometry.hullSections.1.breadthFactor` | 0.87 | 1 | E (`geometry`) |
| `geometry.hullSections.1.immersedDepth` | 0.7810320000000001 | m | E (`geometry`) |
| `geometry.hullSections.1.shape` | 0.87 | 1 | E (`geometry`) |
| `geometry.hullSections.2.x` | -3.78 | m | E (`geometry`) |
| `geometry.hullSections.2.dx` | 1.26 | m | E (`geometry`) |
| `geometry.hullSections.2.breadthFactor` | 0.97 | 1 | E (`geometry`) |
| `geometry.hullSections.2.immersedDepth` | 0.826392 | m | E (`geometry`) |
| `geometry.hullSections.2.shape` | 0.97 | 1 | E (`geometry`) |
| `geometry.hullSections.3.x` | -2.5199999999999996 | m | E (`geometry`) |
| `geometry.hullSections.3.dx` | 1.26 | m | E (`geometry`) |
| `geometry.hullSections.3.breadthFactor` | 1 | 1 | E (`geometry`) |
| `geometry.hullSections.3.immersedDepth` | 0.84 | m | E (`geometry`) |
| `geometry.hullSections.3.shape` | 1 | 1 | E (`geometry`) |
| `geometry.hullSections.4.x` | -1.2599999999999998 | m | E (`geometry`) |
| `geometry.hullSections.4.dx` | 1.26 | m | E (`geometry`) |
| `geometry.hullSections.4.breadthFactor` | 0.99 | 1 | E (`geometry`) |
| `geometry.hullSections.4.immersedDepth` | 0.8354640000000001 | m | E (`geometry`) |
| `geometry.hullSections.4.shape` | 0.99 | 1 | E (`geometry`) |
| `geometry.hullSections.5.x` | 0 | m | E (`geometry`) |
| `geometry.hullSections.5.dx` | 1.26 | m | E (`geometry`) |
| `geometry.hullSections.5.breadthFactor` | 0.94 | 1 | E (`geometry`) |
| `geometry.hullSections.5.immersedDepth` | 0.812784 | m | E (`geometry`) |
| `geometry.hullSections.5.shape` | 0.94 | 1 | E (`geometry`) |
| `geometry.hullSections.6.x` | 1.2599999999999998 | m | E (`geometry`) |
| `geometry.hullSections.6.dx` | 1.26 | m | E (`geometry`) |
| `geometry.hullSections.6.breadthFactor` | 0.85 | 1 | E (`geometry`) |
| `geometry.hullSections.6.immersedDepth` | 0.77196 | m | E (`geometry`) |
| `geometry.hullSections.6.shape` | 0.85 | 1 | E (`geometry`) |
| `geometry.hullSections.7.x` | 2.5199999999999996 | m | E (`geometry`) |
| `geometry.hullSections.7.dx` | 1.26 | m | E (`geometry`) |
| `geometry.hullSections.7.breadthFactor` | 0.72 | 1 | E (`geometry`) |
| `geometry.hullSections.7.immersedDepth` | 0.712992 | m | E (`geometry`) |
| `geometry.hullSections.7.shape` | 0.72 | 1 | E (`geometry`) |
| `geometry.hullSections.8.x` | 3.780000000000001 | m | E (`geometry`) |
| `geometry.hullSections.8.dx` | 1.26 | m | E (`geometry`) |
| `geometry.hullSections.8.breadthFactor` | 0.54 | 1 | E (`geometry`) |
| `geometry.hullSections.8.immersedDepth` | 0.631344 | m | E (`geometry`) |
| `geometry.hullSections.8.shape` | 0.54 | 1 | E (`geometry`) |
| `geometry.hullSections.9.x` | 5.040000000000001 | m | E (`geometry`) |
| `geometry.hullSections.9.dx` | 1.26 | m | E (`geometry`) |
| `geometry.hullSections.9.breadthFactor` | 0.34 | 1 | E (`geometry`) |
| `geometry.hullSections.9.immersedDepth` | 0.540624 | m | E (`geometry`) |
| `geometry.hullSections.9.shape` | 0.34 | 1 | E (`geometry`) |
| `geometry.hullSections.10.x` | 6.300000000000001 | m | E (`geometry`) |
| `geometry.hullSections.10.dx` | 1.26 | m | E (`geometry`) |
| `geometry.hullSections.10.breadthFactor` | 0.15 | 1 | E (`geometry`) |
| `geometry.hullSections.10.immersedDepth` | 0.45444 | m | E (`geometry`) |
| `geometry.hullSections.10.shape` | 0.15 | 1 | E (`geometry`) |
| `mass.lightDisplacement` | 12594 | kg | A (`mass.lightDisplacement`) |
| `mass.displacement` | 13200 | kg | C (`mass.displacement`) |
| `mass.centerOfGravity.x` | 0 | m | E (`mass`) |
| `mass.centerOfGravity.y` | 0 | m | E (`mass`) |
| `mass.yawRadius` | 3.65 | m | E (`mass.yawRadius`) |
| `mass.addedMassModel.surgeMassRatio` | 0.082 | 1 | E (`mass.addedMassModel`) |
| `mass.addedMassModel.sectionalScale` | 0.38 | 1 | E (`mass.addedMassModel`) |
| `hull.axialResistance.surgeLinear` | 155 | N·s/m | E (`hull`) |
| `hull.axialResistance.surgeQuadratic` | 156 | N·s²/m² | E (`hull`) |
| `hull.axialResistance.waveRise` | 56 | N·s²/m² | E (`hull`) |
| `hull.axialResistance.waveOnset` | 2.5 | m/s | E (`hull`) |
| `hull.crossFlow.cd` | 1.1 | 1 | E (`hull`) |
| `hull.crossFlow.areaFactor` | 0.75 | 1 | E (`hull`) |
| `hull.crossFlow.linearDampingFroude` | 0.02 | 1 | E (`hull.crossFlow.linearDampingFroude`) |
| `appendages.0.position.x` | -0.25 | m | E (`appendages`) |
| `appendages.0.position.y` | 0 | m | E (`appendages`) |
| `appendages.0.position.z` | -1.48 | m | E (`appendages`) |
| `appendages.0.area` | 4.55 | m² | E (`appendages`) |
| `appendages.0.span` | 1.33 | m | E (`appendages`) |
| `appendages.0.aspectRatio` | 1.24 | 1 | E (`appendages`) |
| `appendages.0.coefficients.efficiency` | 0.75 | 1 | E (`appendages`) |
| `appendages.0.coefficients.cd0` | 0.019 | 1 | E (`appendages`) |
| `appendages.0.coefficients.normalCd90` | 1.18 | 1 | E (`appendages`) |
| `appendages.0.coefficients.stallStartDeg` | 24 | ° | E (`appendages`) |
| `appendages.0.coefficients.stallEndDeg` | 52 | ° | E (`appendages`) |
| `propulsors.0.position.x` | -4.45 | m | E (`propulsors`) |
| `propulsors.0.position.y` | 0 | m | E (`propulsors`) |
| `propulsors.0.position.z` | -0.88 | m | E (`propulsors`) |
| `propulsors.0.axis.x` | 1 | 1 | E (`propulsors`) |
| `propulsors.0.axis.y` | 0 | 1 | E (`propulsors`) |
| `propulsors.0.engine.powerKw` | 58.8 | kW | A (`propulsors.0.engine.powerKw`) |
| `propulsors.0.engine.idleRpm` | 850 | tr/min | E (`propulsors`) |
| `propulsors.0.engine.maxRpm` | 3200 | tr/min | E (`propulsors`) |
| `propulsors.0.engine.dynamics.inertiaKgM2` | 0.36456 | kg·m² | E (`propulsors`) |
| `propulsors.0.engine.dynamics.frictionNm` | 9.650757861734805 | N·m | E (`propulsors`) |
| `propulsors.0.engine.dynamics.governorKpNmPerRadS` | 4.386708118970366 | N·m·s/rad | E (`propulsors`) |
| `propulsors.0.engine.dynamics.governorKiNmPerRad` | 2.699512688597148 | N·m/rad | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.0.rpm` | 850 | tr/min | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.0.torqueNm` | 126.33719382634652 | N·m | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.1.rpm` | 1500 | tr/min | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.1.torqueNm` | 168.44959176846203 | N·m | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.2.rpm` | 2200 | tr/min | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.2.torqueNm` | 193.0151572346961 | N·m | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.3.rpm` | 2800 | tr/min | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.3.torqueNm` | 185.9964242443435 | N·m | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.4.rpm` | 3200 | tr/min | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.4.torqueNm` | 175.46832475881462 | N·m | E (`propulsors`) |
| `propulsors.0.gearbox.ratioAhead` | 2.23 | 1 | E (`propulsors`) |
| `propulsors.0.gearbox.ratioAstern` | 2.23 | 1 | E (`propulsors`) |
| `propulsors.0.gearbox.efficiency` | 0.94 | 1 | E (`propulsors`) |
| `propulsors.0.gearbox.clutch.capacityEngineNm` | 289.5227358520441 | N·m | E (`propulsors`) |
| `propulsors.0.gearbox.clutch.stiffnessNmPerRadS` | 0.82 | N·m·s/rad | E (`propulsors`) |
| `propulsors.0.gearbox.clutch.disengageTimeS` | 0.12 | s | E (`propulsors`) |
| `propulsors.0.gearbox.clutch.neutralDwellS` | 0.18 | s | E (`propulsors`) |
| `propulsors.0.gearbox.clutch.engageTimeS` | 0.36 | s | E (`propulsors`) |
| `propulsors.0.propeller.diameter` | 0.508 | m | E (`propulsors`) |
| `propulsors.0.propeller.pitch` | 0.356 | m | E (`propulsors`) |
| `propulsors.0.propeller.blades` | 3 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.expandedAreaRatio` | 0.55 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.shaft.inertiaKgM2` | 0.045672241868236804 | kg·m² | E (`propulsors`) |
| `propulsors.0.propeller.shaft.viscousFrictionNmPerRadS` | 0.018 | N·m·s/rad | E (`propulsors`) |
| `propulsors.0.propeller.shaft.coulombFrictionNm` | 0.18 | N·m | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.sampleCount` | 32 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.betaOriginRad` | -3.141592653589793 | rad | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.0` | -0.07148762959883409 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.1` | -0.07734022647383974 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.2` | -0.07007705188590611 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.3` | -0.05080385832520452 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.4` | -0.02245481479941703 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.5` | 0.010654193799374712 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.6` | 0.04348262104591487 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.7` | 0.07103263648235189 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.8` | 0.08911000000000002 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.9` | 0.11226909731652984 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.10` | 0.13257644292550386 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.11` | 0.14694042754450215 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.12` | 0.15317426472512702 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.13` | 0.15032890926650316 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.14` | 0.13883754074399451 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.15` | 0.12044961584563801 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.16` | 0.09796452945025409 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.17` | 0.068022337275805 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.18` | 0.028398371796283475 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.19` | -0.014874977436194856 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.20` | -0.05520973527487295 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.21` | -0.08646530047430225 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.22` | -0.10388329656527365 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.23` | -0.10481199153746469 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.24` | -0.08911000000000002 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.25` | -0.0764743082670751 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.26` | -0.06442086298446119 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.27` | -0.054784691931682734 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.28` | -0.04903281479941704 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.29` | -0.048040902740155586 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.30` | -0.05195996537321567 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.31` | -0.06019336093910518 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.0` | -0.019508236122960446 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.1` | -0.01899913670563939 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.2` | -0.016209952211687834 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.3` | -0.0115653106962895 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.4` | -0.005772316726383594 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.5` | 0.0002870988797328089 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.6` | 0.005690445024767722 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.7` | 0.009615111239594382 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.8` | 0.011463602670193251 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.9` | 0.01236676140690215 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.10` | 0.013599347873241442 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.11` | 0.014973711953135104 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.12` | 0.016280619174060748 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.13` | 0.01732110475877589 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.14` | 0.017936764209032965 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.15` | 0.018033868954497156 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.16` | 0.017597635677928238 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.17` | 0.015821862146859364 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.18` | 0.012104278989608658 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.19` | 0.0070108545418923005 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.20` | 0.001317016503867496 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.21` | -0.004110399897946816 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.22` | -0.008445119716026578 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.23` | -0.011027221152402192 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.24` | -0.011463602670193251 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.25` | -0.011100087293154334 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.26` | -0.011404275096194476 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.27` | -0.012329856243770107 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.28` | -0.013735919396576849 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.29` | -0.015408404185594088 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.30` | -0.017092689962806298 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.31` | -0.018532359486721547 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.uncertainty` | 0.25 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.safety.maximumThrustCoefficient` | 2.2 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.safety.maximumTorqueCoefficient` | 0.12 | 1 | E (`propulsors`) |
| `propulsors.0.transverseWalk.base` | 0.035 | 1 | E (`propulsors`) |
| `propulsors.0.transverseWalk.gain` | 0.125 | 1 | E (`propulsors`) |
| `rudders.0.position.x` | -5.85 | m | E (`rudders`) |
| `rudders.0.position.y` | 0 | m | E (`rudders`) |
| `rudders.0.position.z` | -1.2 | m | E (`rudders`) |
| `rudders.0.area` | 1.35 | m² | E (`rudders`) |
| `rudders.0.span` | 1.44 | m | E (`rudders`) |
| `rudders.0.aspectRatio` | 1.54 | 1 | E (`rudders`) |
| `rudders.0.coefficients.efficiency` | 0.73 | 1 | E (`rudders`) |
| `rudders.0.coefficients.cd0` | 0.022 | 1 | E (`rudders`) |
| `rudders.0.coefficients.normalCd90` | 1.12 | 1 | E (`rudders`) |
| `rudders.0.coefficients.stallStartDeg` | 24 | ° | E (`rudders`) |
| `rudders.0.coefficients.stallEndDeg` | 52 | ° | E (`rudders`) |
| `rudders.0.axis.x` | 0 | 1 | E (`rudders`) |
| `rudders.0.axis.y` | 0 | 1 | E (`rudders`) |
| `rudders.0.axis.z` | 1 | 1 | E (`rudders`) |
| `rudders.0.stock.chordFraction` | 0.22 | 1 | E (`rudders`) |
| `rudders.0.maxAngleDeg` | 35 | ° | E (`rudders`) |
| `steering.maximumRudderRateDegS` | 46 | °/s | E (`steering`) |
| `rudders.0.slipstream.stripCount` | 5 | 1 | E (`rudders`) |
| `rudders.0.slipstream.contractionRatio` | 0.86 | 1 | E (`rudders`) |
| `rudders.0.slipstream.downstreamVelocityFactor` | 0.55 | 1 | E (`rudders`) |
| `rudders.0.slipstream.upstreamVelocityFactor` | 0.24 | 1 | E (`rudders`) |
| `rudders.0.slipstream.swirlFraction` | 0.055 | 1 | E (`rudders`) |
| `rudders.0.slipstream.convectionTimeBoundsS.0` | 0.05 | s | E (`rudders`) |
| `rudders.0.slipstream.convectionTimeBoundsS.1` | 0.55 | s | E (`rudders`) |
| `rudders.0.slipstream.flowStraightening` | 0.92 | 1 | E (`rudders`) |
| `rudders.0.slipstream.momentumSafetyFactor` | 1.18 | 1 | E (`rudders`) |
| `aerodynamics.referenceWindHeight` | 10 | m | E (`aerodynamics`) |
| `aerodynamics.verticalProfile.exponent` | 0.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.verticalProfile.minimumVelocityFactor` | 0.82 | 1 | E (`aerodynamics`) |
| `aerodynamics.verticalProfile.maximumVelocityFactor` | 1.05 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.0.area` | 1.1954915307102767 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.0.normalBody.x` | -0.30113136793709716 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.0.normalBody.y` | 0.9535826651341417 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.0.center.x` | -6.577638888888888 | m | E (`aerodynamics`) |
| `aerodynamics.panels.0.center.y` | 1.979166666666667 | m | E (`aerodynamics`) |
| `aerodynamics.panels.0.center.z` | 0.6000555555555555 | m | E (`aerodynamics`) |
| `aerodynamics.panels.0.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.0.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.0.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.1.area` | 1.1954915307102767 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.1.normalBody.x` | -0.30113136793709716 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.1.normalBody.y` | -0.9535826651341417 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.1.center.x` | -6.577638888888888 | m | E (`aerodynamics`) |
| `aerodynamics.panels.1.center.y` | -1.979166666666667 | m | E (`aerodynamics`) |
| `aerodynamics.panels.1.center.z` | 0.6000555555555555 | m | E (`aerodynamics`) |
| `aerodynamics.panels.1.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.1.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.1.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.2.area` | 1.5273945307287176 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.2.normalBody.x` | -0.12966525414066432 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.2.normalBody.y` | 0.9915578257815512 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.2.center.x` | -5.452789699570816 | m | E (`aerodynamics`) |
| `aerodynamics.panels.2.center.y` | 2.2146351931330472 | m | E (`aerodynamics`) |
| `aerodynamics.panels.2.center.z` | 0.5825321888412016 | m | E (`aerodynamics`) |
| `aerodynamics.panels.2.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.2.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.2.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.3.area` | 1.5273945307287176 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.3.normalBody.x` | -0.12966525414066432 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.3.normalBody.y` | -0.9915578257815512 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.3.center.x` | -5.452789699570816 | m | E (`aerodynamics`) |
| `aerodynamics.panels.3.center.y` | -2.2146351931330472 | m | E (`aerodynamics`) |
| `aerodynamics.panels.3.center.z` | 0.5825321888412016 | m | E (`aerodynamics`) |
| `aerodynamics.panels.3.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.3.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.3.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.4.area` | 1.7118609873468114 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.4.normalBody.x` | -0.04661593469904422 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.4.normalBody.y` | 0.9989128864080864 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.4.center.x` | -4.052192982456139 | m | E (`aerodynamics`) |
| `aerodynamics.panels.4.center.y` | 2.3348976608187133 | m | E (`aerodynamics`) |
| `aerodynamics.panels.4.center.z` | 0.5700146198830408 | m | E (`aerodynamics`) |
| `aerodynamics.panels.4.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.4.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.4.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.5.area` | 1.7118609873468114 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.5.normalBody.x` | -0.04661593469904422 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.5.normalBody.y` | -0.9989128864080864 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.5.center.x` | -4.052192982456139 | m | E (`aerodynamics`) |
| `aerodynamics.panels.5.center.y` | -2.3348976608187133 | m | E (`aerodynamics`) |
| `aerodynamics.panels.5.center.z` | 0.5700146198830408 | m | E (`aerodynamics`) |
| `aerodynamics.panels.5.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.5.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.5.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.6.area` | 1.9210332350066197 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.6.normalBody.x` | 0.005882251173005512 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.6.normalBody.y` | 0.9999826994109137 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.6.center.x` | -2.4499999999999997 | m | E (`aerodynamics`) |
| `aerodynamics.panels.6.center.y` | 2.3649999999999993 | m | E (`aerodynamics`) |
| `aerodynamics.panels.6.center.z` | 0.565 | m | E (`aerodynamics`) |
| `aerodynamics.panels.6.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.6.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.6.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.7.area` | 1.9210332350066197 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.7.normalBody.x` | 0.005882251173005512 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.7.normalBody.y` | -0.9999826994109137 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.7.center.x` | -2.4499999999999997 | m | E (`aerodynamics`) |
| `aerodynamics.panels.7.center.y` | -2.3649999999999993 | m | E (`aerodynamics`) |
| `aerodynamics.panels.7.center.z` | 0.565 | m | E (`aerodynamics`) |
| `aerodynamics.panels.7.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.7.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.7.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.8.area` | 2.0648448858207247 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.8.normalBody.x` | 0.060997317941360936 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.8.normalBody.y` | 0.9981379299495438 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.8.center.x` | -0.6960698689956332 | m | E (`aerodynamics`) |
| `aerodynamics.panels.8.center.y` | 2.3047598253275106 | m | E (`aerodynamics`) |
| `aerodynamics.panels.8.center.z` | 0.572532751091703 | m | E (`aerodynamics`) |
| `aerodynamics.panels.8.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.8.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.8.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.9.area` | 2.0648448858207247 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.9.normalBody.x` | 0.060997317941360936 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.9.normalBody.y` | -0.9981379299495438 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.9.center.x` | -0.6960698689956332 | m | E (`aerodynamics`) |
| `aerodynamics.panels.9.center.y` | -2.3047598253275106 | m | E (`aerodynamics`) |
| `aerodynamics.panels.9.center.z` | 0.572532751091703 | m | E (`aerodynamics`) |
| `aerodynamics.panels.9.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.9.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.9.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.10.area` | 2.0227279006332015 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.10.normalBody.x` | 0.12834153319323582 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.10.normalBody.y` | 0.9917300292204576 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.10.center.x` | 1.0548022598870057 | m | E (`aerodynamics`) |
| `aerodynamics.panels.10.center.y` | 2.1393785310734468 | m | E (`aerodynamics`) |
| `aerodynamics.panels.10.center.z` | 0.5900564971751413 | m | E (`aerodynamics`) |
| `aerodynamics.panels.10.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.10.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.10.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.11.area` | 2.0227279006332015 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.11.normalBody.x` | 0.12834153319323582 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.11.normalBody.y` | -0.9917300292204576 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.11.center.x` | 1.0548022598870057 | m | E (`aerodynamics`) |
| `aerodynamics.panels.11.center.y` | -2.1393785310734468 | m | E (`aerodynamics`) |
| `aerodynamics.panels.11.center.z` | 0.5900564971751413 | m | E (`aerodynamics`) |
| `aerodynamics.panels.11.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.11.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.11.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.12.area` | 1.909962303292921 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.12.normalBody.x` | 0.22722961560641833 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.12.normalBody.y` | 0.9738412097417932 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.12.center.x` | 2.658064516129032 | m | E (`aerodynamics`) |
| `aerodynamics.panels.12.center.y` | 1.8531182795698922 | m | E (`aerodynamics`) |
| `aerodynamics.panels.12.center.z` | 0.6202150537634409 | m | E (`aerodynamics`) |
| `aerodynamics.panels.12.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.12.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.12.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.13.area` | 1.909962303292921 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.13.normalBody.x` | 0.22722961560641833 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.13.normalBody.y` | -0.9738412097417932 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.13.center.x` | 2.658064516129032 | m | E (`aerodynamics`) |
| `aerodynamics.panels.13.center.y` | -1.8531182795698922 | m | E (`aerodynamics`) |
| `aerodynamics.panels.13.center.z` | 0.6202150537634409 | m | E (`aerodynamics`) |
| `aerodynamics.panels.13.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.13.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.13.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.14.area` | 1.8158997769700842 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.14.normalBody.x` | 0.32711056388316617 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.14.normalBody.y` | 0.9449860734402581 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.14.center.x` | 4.056565656565657 | m | E (`aerodynamics`) |
| `aerodynamics.panels.14.center.y` | 1.4527272727272726 | m | E (`aerodynamics`) |
| `aerodynamics.panels.14.center.z` | 0.6602020202020202 | m | E (`aerodynamics`) |
| `aerodynamics.panels.14.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.14.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.14.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.15.area` | 1.8158997769700842 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.15.normalBody.x` | 0.32711056388316617 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.15.normalBody.y` | -0.9449860734402581 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.15.center.x` | 4.056565656565657 | m | E (`aerodynamics`) |
| `aerodynamics.panels.15.center.y` | -1.4527272727272726 | m | E (`aerodynamics`) |
| `aerodynamics.panels.15.center.z` | 0.6602020202020202 | m | E (`aerodynamics`) |
| `aerodynamics.panels.15.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.15.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.15.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.16.area` | 1.6802333171318793 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.16.normalBody.x` | 0.3999444560158401 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.16.normalBody.y` | 0.9165393783696332 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.16.center.x` | 5.255238095238096 | m | E (`aerodynamics`) |
| `aerodynamics.panels.16.center.y` | 0.9877142857142855 | m | E (`aerodynamics`) |
| `aerodynamics.panels.16.center.z` | 0.7001904761904763 | m | E (`aerodynamics`) |
| `aerodynamics.panels.16.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.16.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.16.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.17.area` | 1.6802333171318793 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.17.normalBody.x` | 0.3999444560158401 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.17.normalBody.y` | -0.9165393783696332 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.17.center.x` | 5.255238095238096 | m | E (`aerodynamics`) |
| `aerodynamics.panels.17.center.y` | -0.9877142857142855 | m | E (`aerodynamics`) |
| `aerodynamics.panels.17.center.z` | 0.7001904761904763 | m | E (`aerodynamics`) |
| `aerodynamics.panels.17.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.17.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.17.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.18.area` | 1.3421349559563671 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.18.normalBody.x` | 0.48191874977215593 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.18.normalBody.y` | 0.8762159086766469 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.18.center.x` | 6.202721088435374 | m | E (`aerodynamics`) |
| `aerodynamics.panels.18.center.y` | 0.5285034013605443 | m | E (`aerodynamics`) |
| `aerodynamics.panels.18.center.z` | 0.7351020408163265 | m | E (`aerodynamics`) |
| `aerodynamics.panels.18.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.18.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.18.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.19.area` | 1.3421349559563671 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.19.normalBody.x` | 0.48191874977215593 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.19.normalBody.y` | -0.8762159086766469 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.19.center.x` | 6.202721088435374 | m | E (`aerodynamics`) |
| `aerodynamics.panels.19.center.y` | -0.5285034013605443 | m | E (`aerodynamics`) |
| `aerodynamics.panels.19.center.z` | 0.7351020408163265 | m | E (`aerodynamics`) |
| `aerodynamics.panels.19.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.19.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.19.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.20.area` | 1.0571011363630258 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.20.normalBody.x` | 0.4472135954999578 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.20.normalBody.y` | 0.8944271909999159 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.20.center.x` | 6.911693989071038 | m | E (`aerodynamics`) |
| `aerodynamics.panels.20.center.y` | 0.15415300546448088 | m | E (`aerodynamics`) |
| `aerodynamics.panels.20.center.z` | 0.7625683060109291 | m | E (`aerodynamics`) |
| `aerodynamics.panels.20.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.20.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.20.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.21.area` | 1.0571011363630258 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.21.normalBody.x` | 0.4472135954999578 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.21.normalBody.y` | -0.8944271909999159 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.21.center.x` | 6.911693989071038 | m | E (`aerodynamics`) |
| `aerodynamics.panels.21.center.y` | -0.15415300546448088 | m | E (`aerodynamics`) |
| `aerodynamics.panels.21.center.z` | 0.7625683060109291 | m | E (`aerodynamics`) |
| `aerodynamics.panels.21.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.21.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.21.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.22.area` | 3.8 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.22.normalBody.x` | -0.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.22.normalBody.y` | 0.997 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.22.center.x` | -1.65 | m | E (`aerodynamics`) |
| `aerodynamics.panels.22.center.y` | 1.08 | m | E (`aerodynamics`) |
| `aerodynamics.panels.22.center.z` | 2 | m | E (`aerodynamics`) |
| `aerodynamics.panels.22.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.22.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.22.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.23.area` | 3.8 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.23.normalBody.x` | -0.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.23.normalBody.y` | -0.997 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.23.center.x` | -1.65 | m | E (`aerodynamics`) |
| `aerodynamics.panels.23.center.y` | -1.08 | m | E (`aerodynamics`) |
| `aerodynamics.panels.23.center.z` | 2 | m | E (`aerodynamics`) |
| `aerodynamics.panels.23.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.23.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.23.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.24.area` | 2.65 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.24.normalBody.x` | 0.12 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.24.normalBody.y` | 0.993 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.24.center.x` | 1.65 | m | E (`aerodynamics`) |
| `aerodynamics.panels.24.center.y` | 0.94 | m | E (`aerodynamics`) |
| `aerodynamics.panels.24.center.z` | 2.06 | m | E (`aerodynamics`) |
| `aerodynamics.panels.24.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.24.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.24.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.25.area` | 2.65 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.25.normalBody.x` | 0.12 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.25.normalBody.y` | -0.993 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.25.center.x` | 1.65 | m | E (`aerodynamics`) |
| `aerodynamics.panels.25.center.y` | -0.94 | m | E (`aerodynamics`) |
| `aerodynamics.panels.25.center.z` | 2.06 | m | E (`aerodynamics`) |
| `aerodynamics.panels.25.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.25.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.25.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.26.area` | 1.55 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.26.normalBody.x` | 0 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.26.normalBody.y` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.26.center.x` | -0.45 | m | E (`aerodynamics`) |
| `aerodynamics.panels.26.center.y` | 0.2 | m | E (`aerodynamics`) |
| `aerodynamics.panels.26.center.z` | 3.3 | m | E (`aerodynamics`) |
| `aerodynamics.panels.26.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.26.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.26.exposure` | 0.92 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.27.area` | 1.55 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.27.normalBody.x` | 0 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.27.normalBody.y` | -1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.27.center.x` | -0.45 | m | E (`aerodynamics`) |
| `aerodynamics.panels.27.center.y` | -0.2 | m | E (`aerodynamics`) |
| `aerodynamics.panels.27.center.z` | 3.3 | m | E (`aerodynamics`) |
| `aerodynamics.panels.27.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.27.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.27.exposure` | 0.92 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.28.area` | 3.15 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.28.normalBody.x` | 0 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.28.normalBody.y` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.28.center.x` | 0.45 | m | E (`aerodynamics`) |
| `aerodynamics.panels.28.center.y` | 0 | m | E (`aerodynamics`) |
| `aerodynamics.panels.28.center.z` | 7.2 | m | E (`aerodynamics`) |
| `aerodynamics.panels.28.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.28.cdTangential` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.28.exposure` | 0.95 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.29.area` | 4.4652 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.29.normalBody.x` | -1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.29.normalBody.y` | 0 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.29.center.x` | -7.05 | m | E (`aerodynamics`) |
| `aerodynamics.panels.29.center.y` | 0 | m | E (`aerodynamics`) |
| `aerodynamics.panels.29.center.z` | 0.61 | m | E (`aerodynamics`) |
| `aerodynamics.panels.29.cdNormal` | 1.02 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.29.cdTangential` | 0.04 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.29.exposure` | 0.96 | 1 | E (`aerodynamics`) |
| `contacts.fenderRadius` | 0.22 | m | E (`contacts`) |
| `contacts.hullRadius` | 0.26 | m | E (`contacts`) |
| `contacts.fenderStiffness` | 65000 | N/m | E (`contacts`) |
| `contacts.hullStiffness` | 135000 | N/m | E (`contacts`) |
| `contacts.dampingRatio` | 0.82 | 1 | E (`contacts`) |
| `contacts.friction` | 0.3 | 1 | E (`contacts`) |
| `contacts.hullFriction` | 0.3 | 1 | E (`contacts`) |
| `contacts.fenderFriction` | 0.03 | 1 | E (`contacts`) |
| `contacts.forceLimit` | 140000 | N | E (`contacts`) |
| `contacts.fenders.0.position.x` | 4.933988335763326 | m | E (`contacts`) |
| `contacts.fenders.0.position.y` | -1.3570187240030778 | m | E (`contacts`) |
| `contacts.fenders.0.position.z` | 0.38 | m | E (`contacts`) |
| `contacts.fenders.0.attachment.x` | 4.85 | m | E (`contacts`) |
| `contacts.fenders.0.attachment.y` | -1.1645454545454548 | m | E (`contacts`) |
| `contacts.fenders.0.attachment.z` | 1.3709090909090909 | m | E (`contacts`) |
| `contacts.fenders.0.preload` | 0.01 | m | E (`contacts`) |
| `contacts.fenders.1.position.x` | -0.13719056323231418 | m | E (`contacts`) |
| `contacts.fenders.1.position.y` | -2.480997854178293 | m | E (`contacts`) |
| `contacts.fenders.1.position.z` | 0.38 | m | E (`contacts`) |
| `contacts.fenders.1.attachment.x` | -0.15 | m | E (`contacts`) |
| `contacts.fenders.1.attachment.y` | -2.2713888888888887 | m | E (`contacts`) |
| `contacts.fenders.1.attachment.z` | 1.1541666666666666 | m | E (`contacts`) |
| `contacts.fenders.1.preload` | 0.01 | m | E (`contacts`) |
| `contacts.fenders.2.position.x` | -4.97722970336954 | m | E (`contacts`) |
| `contacts.fenders.2.position.y` | -2.488611758798741 | m | E (`contacts`) |
| `contacts.fenders.2.position.z` | 0.38 | m | E (`contacts`) |
| `contacts.fenders.2.attachment.x` | -4.95 | m | E (`contacts`) |
| `contacts.fenders.2.attachment.y` | -2.280384615384615 | m | E (`contacts`) |
| `contacts.fenders.2.attachment.z` | 1.1534615384615383 | m | E (`contacts`) |
| `contacts.fenders.2.preload` | 0.01 | m | E (`contacts`) |
| `contacts.fenders.3.position.x` | 4.933988335763326 | m | E (`contacts`) |
| `contacts.fenders.3.position.y` | 1.3570187240030778 | m | E (`contacts`) |
| `contacts.fenders.3.position.z` | 0.38 | m | E (`contacts`) |
| `contacts.fenders.3.attachment.x` | 4.85 | m | E (`contacts`) |
| `contacts.fenders.3.attachment.y` | 1.1645454545454548 | m | E (`contacts`) |
| `contacts.fenders.3.attachment.z` | 1.3709090909090909 | m | E (`contacts`) |
| `contacts.fenders.3.preload` | 0.01 | m | E (`contacts`) |
| `contacts.fenders.4.position.x` | -0.13719056323231418 | m | E (`contacts`) |
| `contacts.fenders.4.position.y` | 2.480997854178293 | m | E (`contacts`) |
| `contacts.fenders.4.position.z` | 0.38 | m | E (`contacts`) |
| `contacts.fenders.4.attachment.x` | -0.15 | m | E (`contacts`) |
| `contacts.fenders.4.attachment.y` | 2.2713888888888887 | m | E (`contacts`) |
| `contacts.fenders.4.attachment.z` | 1.1541666666666666 | m | E (`contacts`) |
| `contacts.fenders.4.preload` | 0.01 | m | E (`contacts`) |
| `contacts.fenders.5.position.x` | -4.97722970336954 | m | E (`contacts`) |
| `contacts.fenders.5.position.y` | 2.488611758798741 | m | E (`contacts`) |
| `contacts.fenders.5.position.z` | 0.38 | m | E (`contacts`) |
| `contacts.fenders.5.attachment.x` | -4.95 | m | E (`contacts`) |
| `contacts.fenders.5.attachment.y` | 2.280384615384615 | m | E (`contacts`) |
| `contacts.fenders.5.attachment.z` | 1.1534615384615383 | m | E (`contacts`) |
| `contacts.fenders.5.preload` | 0.01 | m | E (`contacts`) |
| `contacts.hullEnvelope.0.position.x` | -6.971705844336355 | m | E (`contacts`) |
| `contacts.hullEnvelope.0.position.y` | -1.5820685070651233 | m | E (`contacts`) |
| `contacts.hullEnvelope.0.radius` | 0.26 | m | E (`contacts`) |
| `contacts.hullEnvelope.0.reference.x` | -7.05 | m | E (`contacts`) |
| `contacts.hullEnvelope.0.reference.y` | -1.83 | m | E (`contacts`) |
| `contacts.hullEnvelope.1.position.x` | -6.0217058443363545 | m | E (`contacts`) |
| `contacts.hullEnvelope.1.position.y` | -1.882068507065123 | m | E (`contacts`) |
| `contacts.hullEnvelope.1.radius` | 0.26 | m | E (`contacts`) |
| `contacts.hullEnvelope.1.reference.x` | -6.1 | m | E (`contacts`) |
| `contacts.hullEnvelope.1.reference.y` | -2.13 | m | E (`contacts`) |
| `contacts.hullEnvelope.2.position.x` | -4.766287033923427 | m | E (`contacts`) |
| `contacts.hullEnvelope.2.position.y` | -2.0421949652967966 | m | E (`contacts`) |
| `contacts.hullEnvelope.2.radius` | 0.26 | m | E (`contacts`) |
| `contacts.hullEnvelope.2.reference.x` | -4.8 | m | E (`contacts`) |
| `contacts.hullEnvelope.2.reference.y` | -2.3 | m | E (`contacts`) |
| `contacts.hullEnvelope.3.position.x` | -3.287879856978248 | m | E (`contacts`) |
| `contacts.hullEnvelope.3.position.y` | -2.1102826495338975 | m | E (`contacts`) |
| `contacts.hullEnvelope.3.radius` | 0.26 | m | E (`contacts`) |
| `contacts.hullEnvelope.3.reference.x` | -3.3 | m | E (`contacts`) |
| `contacts.hullEnvelope.3.reference.y` | -2.37 | m | E (`contacts`) |
| `contacts.hullEnvelope.4.position.x` | -1.6015293853049815 | m | E (`contacts`) |
| `contacts.hullEnvelope.4.position.y` | -2.1000044981531625 | m | E (`contacts`) |
| `contacts.hullEnvelope.4.radius` | 0.26 | m | E (`contacts`) |
| `contacts.hullEnvelope.4.reference.x` | -1.6 | m | E (`contacts`) |
| `contacts.hullEnvelope.4.reference.y` | -2.36 | m | E (`contacts`) |
| `contacts.hullEnvelope.5.position.x` | 0.18414069733524616 | m | E (`contacts`) |
| `contacts.hullEnvelope.5.position.y` | -1.9904841382131186 | m | E (`contacts`) |
| `contacts.hullEnvelope.5.radius` | 0.26 | m | E (`contacts`) |
| `contacts.hullEnvelope.5.reference.x` | 0.2 | m | E (`contacts`) |
| `contacts.hullEnvelope.5.reference.y` | -2.25 | m | E (`contacts`) |
| `contacts.hullEnvelope.6.position.x` | 1.8666312013697586 | m | E (`contacts`) |
| `contacts.hullEnvelope.6.position.y` | -1.7721501924026808 | m | E (`contacts`) |
| `contacts.hullEnvelope.6.radius` | 0.26 | m | E (`contacts`) |
| `contacts.hullEnvelope.6.reference.x` | 1.9 | m | E (`contacts`) |
| `contacts.hullEnvelope.6.reference.y` | -2.03 | m | E (`contacts`) |
| `contacts.hullEnvelope.7.position.x` | 3.340920299942331 | m | E (`contacts`) |
| `contacts.hullEnvelope.7.position.y` | -1.4268012854671337 | m | E (`contacts`) |
| `contacts.hullEnvelope.7.radius` | 0.26 | m | E (`contacts`) |
| `contacts.hullEnvelope.7.reference.x` | 3.4 | m | E (`contacts`) |
| `contacts.hullEnvelope.7.reference.y` | -1.68 | m | E (`contacts`) |
| `contacts.hullEnvelope.8.position.x` | 4.614951253390377 | m | E (`contacts`) |
| `contacts.hullEnvelope.8.position.y` | -0.9843036209055329 | m | E (`contacts`) |
| `contacts.hullEnvelope.8.radius` | 0.26 | m | E (`contacts`) |
| `contacts.hullEnvelope.8.reference.x` | 4.7 | m | E (`contacts`) |
| `contacts.hullEnvelope.8.reference.y` | -1.23 | m | E (`contacts`) |
| `contacts.hullEnvelope.9.position.x` | 5.6960144414358815 | m | E (`contacts`) |
| `contacts.hullEnvelope.9.position.y` | -0.5116997616238954 | m | E (`contacts`) |
| `contacts.hullEnvelope.9.radius` | 0.26 | m | E (`contacts`) |
| `contacts.hullEnvelope.9.reference.x` | 5.8 | m | E (`contacts`) |
| `contacts.hullEnvelope.9.reference.y` | -0.75 | m | E (`contacts`) |
| `contacts.hullEnvelope.10.position.x` | -6.971705844336355 | m | E (`contacts`) |
| `contacts.hullEnvelope.10.position.y` | 1.5820685070651233 | m | E (`contacts`) |
| `contacts.hullEnvelope.10.radius` | 0.26 | m | E (`contacts`) |
| `contacts.hullEnvelope.10.reference.x` | -7.05 | m | E (`contacts`) |
| `contacts.hullEnvelope.10.reference.y` | 1.83 | m | E (`contacts`) |
| `contacts.hullEnvelope.11.position.x` | -6.0217058443363545 | m | E (`contacts`) |
| `contacts.hullEnvelope.11.position.y` | 1.882068507065123 | m | E (`contacts`) |
| `contacts.hullEnvelope.11.radius` | 0.26 | m | E (`contacts`) |
| `contacts.hullEnvelope.11.reference.x` | -6.1 | m | E (`contacts`) |
| `contacts.hullEnvelope.11.reference.y` | 2.13 | m | E (`contacts`) |
| `contacts.hullEnvelope.12.position.x` | -4.766287033923427 | m | E (`contacts`) |
| `contacts.hullEnvelope.12.position.y` | 2.0421949652967966 | m | E (`contacts`) |
| `contacts.hullEnvelope.12.radius` | 0.26 | m | E (`contacts`) |
| `contacts.hullEnvelope.12.reference.x` | -4.8 | m | E (`contacts`) |
| `contacts.hullEnvelope.12.reference.y` | 2.3 | m | E (`contacts`) |
| `contacts.hullEnvelope.13.position.x` | -3.287879856978248 | m | E (`contacts`) |
| `contacts.hullEnvelope.13.position.y` | 2.1102826495338975 | m | E (`contacts`) |
| `contacts.hullEnvelope.13.radius` | 0.26 | m | E (`contacts`) |
| `contacts.hullEnvelope.13.reference.x` | -3.3 | m | E (`contacts`) |
| `contacts.hullEnvelope.13.reference.y` | 2.37 | m | E (`contacts`) |
| `contacts.hullEnvelope.14.position.x` | -1.6015293853049815 | m | E (`contacts`) |
| `contacts.hullEnvelope.14.position.y` | 2.1000044981531625 | m | E (`contacts`) |
| `contacts.hullEnvelope.14.radius` | 0.26 | m | E (`contacts`) |
| `contacts.hullEnvelope.14.reference.x` | -1.6 | m | E (`contacts`) |
| `contacts.hullEnvelope.14.reference.y` | 2.36 | m | E (`contacts`) |
| `contacts.hullEnvelope.15.position.x` | 0.18414069733524616 | m | E (`contacts`) |
| `contacts.hullEnvelope.15.position.y` | 1.9904841382131186 | m | E (`contacts`) |
| `contacts.hullEnvelope.15.radius` | 0.26 | m | E (`contacts`) |
| `contacts.hullEnvelope.15.reference.x` | 0.2 | m | E (`contacts`) |
| `contacts.hullEnvelope.15.reference.y` | 2.25 | m | E (`contacts`) |
| `contacts.hullEnvelope.16.position.x` | 1.8666312013697586 | m | E (`contacts`) |
| `contacts.hullEnvelope.16.position.y` | 1.7721501924026808 | m | E (`contacts`) |
| `contacts.hullEnvelope.16.radius` | 0.26 | m | E (`contacts`) |
| `contacts.hullEnvelope.16.reference.x` | 1.9 | m | E (`contacts`) |
| `contacts.hullEnvelope.16.reference.y` | 2.03 | m | E (`contacts`) |
| `contacts.hullEnvelope.17.position.x` | 3.340920299942331 | m | E (`contacts`) |
| `contacts.hullEnvelope.17.position.y` | 1.4268012854671337 | m | E (`contacts`) |
| `contacts.hullEnvelope.17.radius` | 0.26 | m | E (`contacts`) |
| `contacts.hullEnvelope.17.reference.x` | 3.4 | m | E (`contacts`) |
| `contacts.hullEnvelope.17.reference.y` | 1.68 | m | E (`contacts`) |
| `contacts.hullEnvelope.18.position.x` | 4.614951253390377 | m | E (`contacts`) |
| `contacts.hullEnvelope.18.position.y` | 0.9843036209055329 | m | E (`contacts`) |
| `contacts.hullEnvelope.18.radius` | 0.26 | m | E (`contacts`) |
| `contacts.hullEnvelope.18.reference.x` | 4.7 | m | E (`contacts`) |
| `contacts.hullEnvelope.18.reference.y` | 1.23 | m | E (`contacts`) |
| `contacts.hullEnvelope.19.position.x` | 5.6960144414358815 | m | E (`contacts`) |
| `contacts.hullEnvelope.19.position.y` | 0.5116997616238954 | m | E (`contacts`) |
| `contacts.hullEnvelope.19.radius` | 0.26 | m | E (`contacts`) |
| `contacts.hullEnvelope.19.reference.x` | 5.8 | m | E (`contacts`) |
| `contacts.hullEnvelope.19.reference.y` | 0.75 | m | E (`contacts`) |
| `contacts.hullEnvelope.20.position.x` | -6.79 | m | E (`contacts`) |
| `contacts.hullEnvelope.20.position.y` | -1.57 | m | E (`contacts`) |
| `contacts.hullEnvelope.20.radius` | 0.26 | m | E (`contacts`) |
| `contacts.hullEnvelope.20.reference.x` | -7.05 | m | E (`contacts`) |
| `contacts.hullEnvelope.20.reference.y` | -1.57 | m | E (`contacts`) |
| `contacts.hullEnvelope.21.position.x` | -6.79 | m | E (`contacts`) |
| `contacts.hullEnvelope.21.position.y` | 0 | m | E (`contacts`) |
| `contacts.hullEnvelope.21.radius` | 0.26 | m | E (`contacts`) |
| `contacts.hullEnvelope.21.reference.x` | -7.05 | m | E (`contacts`) |
| `contacts.hullEnvelope.21.reference.y` | 0 | m | E (`contacts`) |
| `contacts.hullEnvelope.22.position.x` | -6.79 | m | E (`contacts`) |
| `contacts.hullEnvelope.22.position.y` | 1.57 | m | E (`contacts`) |
| `contacts.hullEnvelope.22.radius` | 0.26 | m | E (`contacts`) |
| `contacts.hullEnvelope.22.reference.x` | -7.05 | m | E (`contacts`) |
| `contacts.hullEnvelope.22.reference.y` | 1.57 | m | E (`contacts`) |
| `contacts.hullEnvelope.23.position.x` | 6.96 | m | E (`contacts`) |
| `contacts.hullEnvelope.23.position.y` | 0 | m | E (`contacts`) |
| `contacts.hullEnvelope.23.radius` | 0.26 | m | E (`contacts`) |
| `contacts.hullEnvelope.23.reference.x` | 7.22 | m | E (`contacts`) |
| `contacts.hullEnvelope.23.reference.y` | 0 | m | E (`contacts`) |
| `deckHardware.cleats.0.position.x` | 5.916265687515949 | m | E (`deckHardware`) |
| `deckHardware.cleats.0.position.y` | -0.6061648863926344 | m | E (`deckHardware`) |
| `deckHardware.cleats.0.position.z` | 1.49125 | m | E (`deckHardware`) |
| `deckHardware.cleats.0.attachment.x` | 5.95 | m | E (`deckHardware`) |
| `deckHardware.cleats.0.attachment.y` | -0.6674999999999998 | m | E (`deckHardware`) |
| `deckHardware.cleats.0.attachment.z` | 1.45125 | m | E (`deckHardware`) |
| `deckHardware.cleats.1.position.x` | -0.10426981225589527 | m | E (`deckHardware`) |
| `deckHardware.cleats.1.position.y` | -2.1984636782368656 | m | E (`deckHardware`) |
| `deckHardware.cleats.1.position.z` | 1.1949999999999998 | m | E (`deckHardware`) |
| `deckHardware.cleats.1.attachment.x` | -0.1 | m | E (`deckHardware`) |
| `deckHardware.cleats.1.attachment.y` | -2.2683333333333335 | m | E (`deckHardware`) |
| `deckHardware.cleats.1.attachment.z` | 1.1549999999999998 | m | E (`deckHardware`) |
| `deckHardware.cleats.2.position.x` | -6.078920804244403 | m | E (`deckHardware`) |
| `deckHardware.cleats.2.position.y` | -2.06324921344061 | m | E (`deckHardware`) |
| `deckHardware.cleats.2.position.z` | 1.22 | m | E (`deckHardware`) |
| `deckHardware.cleats.2.attachment.x` | -6.1 | m | E (`deckHardware`) |
| `deckHardware.cleats.2.attachment.y` | -2.13 | m | E (`deckHardware`) |
| `deckHardware.cleats.2.attachment.z` | 1.18 | m | E (`deckHardware`) |
| `deckHardware.cleats.3.position.x` | 5.916265687515949 | m | E (`deckHardware`) |
| `deckHardware.cleats.3.position.y` | 0.6061648863926344 | m | E (`deckHardware`) |
| `deckHardware.cleats.3.position.z` | 1.49125 | m | E (`deckHardware`) |
| `deckHardware.cleats.3.attachment.x` | 5.95 | m | E (`deckHardware`) |
| `deckHardware.cleats.3.attachment.y` | 0.6674999999999998 | m | E (`deckHardware`) |
| `deckHardware.cleats.3.attachment.z` | 1.45125 | m | E (`deckHardware`) |
| `deckHardware.cleats.4.position.x` | -0.10426981225589527 | m | E (`deckHardware`) |
| `deckHardware.cleats.4.position.y` | 2.1984636782368656 | m | E (`deckHardware`) |
| `deckHardware.cleats.4.position.z` | 1.1949999999999998 | m | E (`deckHardware`) |
| `deckHardware.cleats.4.attachment.x` | -0.1 | m | E (`deckHardware`) |
| `deckHardware.cleats.4.attachment.y` | 2.2683333333333335 | m | E (`deckHardware`) |
| `deckHardware.cleats.4.attachment.z` | 1.1549999999999998 | m | E (`deckHardware`) |
| `deckHardware.cleats.5.position.x` | -6.078920804244403 | m | E (`deckHardware`) |
| `deckHardware.cleats.5.position.y` | 2.06324921344061 | m | E (`deckHardware`) |
| `deckHardware.cleats.5.position.z` | 1.22 | m | E (`deckHardware`) |
| `deckHardware.cleats.5.attachment.x` | -6.1 | m | E (`deckHardware`) |
| `deckHardware.cleats.5.attachment.y` | 2.13 | m | E (`deckHardware`) |
| `deckHardware.cleats.5.attachment.z` | 1.18 | m | E (`deckHardware`) |
| `mooring.maxLength` | 25 | m | E (`mooring`) |
| `mooring.maximumLinesPerBoatCleat` | 2 | 1 | E (`mooring`) |
| `mooring.maximumHaulInducedSpeed` | 0.1028888 | m/s | E (`mooring`) |
| `mooring.humanPullForce` | 200 | N | E (`mooring`) |
| `mooring.haulInRate` | 1 | m/s | E (`mooring`) |
| `mooring.payOutRate` | 1.2 | m/s | E (`mooring`) |
| `mooring.tautTolerance` | 0.02 | m | E (`mooring`) |
| `mooring.solverTolerance` | 0.001 | m | E (`mooring`) |
| `mooring.solverIterations` | 8 | 1 | E (`mooring`) |
| `mooring.elasticity.workingStrain` | 0.15 | 1 | E (`mooring`) |
| `mooring.elasticity.workingLoadN` | 18000 | N | E (`mooring`) |
| `mooring.elasticity.dampingRatio` | 0.35 | 1 | E (`mooring`) |
| `mooring.elasticity.hardeningGain` | 8 | 1 | E (`mooring`) |
| `mooring.elasticity.maximumStrain` | 0.2 | 1 | E (`mooring`) |

## Qualification et essais utilisateur

Voir [le rapport commun](four-vessel-validation.md) et les résultats bruts associés. Les invariants et trajectoires vérifient la cohérence du modèle ; les références SO36i/Dufour ne constituent pas des mesures de ce bateau. Les paramètres estimés sont soumis à une sensibilité séparée à ±20 %, avec limites géométriques signalées.

Sélectionner le bateau dans « Profil du bateau ». Le changement réinitialise commandes et mouvement, conserve le port et mémorise le choix. Replacer le bateau si le scénario est incompatible avec son gabarit. La silhouette procédurale et les formes immergées affichées sont provisoires. La validation utilisateur porte sur les comportements ; le GLB spécifique appartient à la phase 2 encore non autorisée.
