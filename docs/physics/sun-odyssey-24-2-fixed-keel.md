# Sun Odyssey 24.2 — fiche de profil physique

Profil `sun-odyssey-24-2-fixed-keel-experimental`, version `1.1.2`, schéma 5, moteur 6.0.0. **Plausible mais non calibré.**

## Configuration, sources et arbitrages

Le Sun Odyssey 24.2 remplace le SO26 à la suite de la décision utilisateur du 20 octobre 2026 : conserver l'objectif d'un petit croiseur moderne **monosafran**. L'inventaire officiel SO26 de janvier 2003 indique « Bi-safran » et « Twin rudders » p.2 ; aucune configuration monosafran fiable n'a été établie. Il n'est créé aucun faux SO26 monosafran.

La page constructeur SO24.2 établit LOA 7,30 m, coque 7,20 m, quille fixe 1,10 m, poids publié 1830 kg, réservoir d'eau 56 L et disponibilité d'une version inboard. Sailboatdata décrit un safran suspendu unique et donne LWL 6,61 m, largeur 2,49 m et déplacement 1905 kg. Le manuel Jeanneau mis à jour en mai 2002 (page PDF 7, texte indexé ; archivage refusé) indique LWL 6,60 m : la différence de 1 cm est conservée. Les 6,61 m restent une hypothèse E : un arrondi du manuel est possible mais non démontré, et l’écart de 0,15 % est inférieur à l’incertitude du contour de carène. Aucune précision métrique supérieure n’est revendiquée. Ces deux derniers documents ne donnent pas la même définition du poids : 1830 kg est retenu comme référence constructeur, avec incertitude sur l'équipement inboard. Les 1905 kg restent une divergence de documentation, pas une seconde mesure de la même condition.

Moteur équivalent retenu : Yanmar 1GM10 de 6,6 kW à 3600 tr/min, compatible avec des SO24.2 documentés par leurs propriétaires. L'identité exacte du montage usine et de l'inverseur de chaque unité n'est pas établie ; rapports 2,62/3,06, rotation droite, diamètre et pas sont des hypothèses E. Ne pas confondre rotation du vilebrequin et rotation de l'hélice.

Charge : 1830 + 150 kg personnes + 28 kg eau + 10,92 kg gazole (13 L à 0,84 kg/L) + 80 kg équipement = 2098,92 kg, arrondi à 2100 kg. L'incertitude de 8 % couvre notamment la définition du poids publié et le montage inboard. Quatre taquets fonctionnels, deux par bord. Le contour, le roof et l'appendice sont des approximations géométriques E, sans numérisation métrique certifiée d'un plan de formes.

## Inventaire de charge additionnelle

Hypothèse E, masse en kg. Cet inventaire décrit une charge de simulation, sans prétendre reproduire le manifeste d’une unité réelle. Les personnes, l’eau et le gazole sont comptés séparément dans le calcul précédent ; les équipements fixes déjà compris dans le poids publié ne sont pas ajoutés. Pour le Pogo, les équipements réglementaires de jauge ne sont pas recomptés.

| Équipement mobile additionnel | Masse, kg |
|---|---:|
| Effets personnels | 20 |
| Avitaillement hors eau du réservoir | 20 |
| Sécurité portable additionnelle | 15 |
| Outillage et rechanges mobiles | 15 |
| Amarrage additionnel transporté | 10 |
| **Total** | **80** |

L’inclusion exacte des équipements dans le poids de référence reste incertaine ; cette limite est conservée dans l’incertitude de chargement. Aucun détail de cet inventaire n’est présenté comme une donnée constructeur.

## Repère, méthode et limites

Unités SI ; x positif vers l’avant, y positif vers tribord, z positif vers le haut, flottaison z=0. Origine au CG longitudinal supposé, transverse symétrique ; incertitude de position du CG ±0,20 m pour les petits et ±0,35 m pour les grands. `centerOfGravity` n’est pas consommé par la matrice : aucune compensation de forces n’est ajoutée.

Carène nue représentée par onze sections propres. Les profondeurs individuelles stockées sont documentaires : le moteur emploie `canoeDraft × (0,46 + 0,54 × shape)`. Les masses ajoutées sway/yaw ne sont pas réglables séparément et les appendices n’y contribuent pas directement. La géométrie de coque ne constitue pas une intégration hydrostatique validée du déplacement.

Le rayon de giration est un prior E propre à la répartition longitudinale supposée, pas une mesure ni une similitude dimensionnelle du SO36i. La résistance longitudinale est un prior E indépendant : `R(u)=a u+b u|u|+montée de vague`. À 1 m/s, hors montée de vague, le coefficient effectif rapporté à la surface mouillée vaut `2(a+b)/(1025 S) = 0.01150`. Ce calcul explicite l’ordre de grandeur du choix, sans en faire une valeur constructeur ou une mesure. Linéaire, quadratique et seuil de Froude restent à calibrer séparément contre des essais propres au bateau.

Les coefficients sans dimension de foil et de fardage sont des priors génériques estimés, non des coefficients mesurés de cette coque. Les tables quatre quadrants sont générées avec des entrées propres explicites ; les constantes du générateur représentent sa structure commune, pas une hélice certifiée. Inerties moteur/arbre, courbe de couple et délais d’embrayage sont des priors mécaniques ; la courbe de puissance ne remplace pas une courbe constructeur complète.

Fardage : franc-bord intégré sur le rail propre ; roof, bôme et gréement décomposés en panneaux estimés, voiles affalées/enroulées, sans capote/bimini. La hauteur influence le vent local, sans roulis. Contacts 2D : enveloppe tangentielle estimée, défenses cylindriques ; raideurs et charges de travail sont des choix d’équipements pédagogiques E. Une ligne polyester équivalente travaille à 15 % d’allongement ; effort humain 200 N commun, non proportionnel au déplacement. Aucun paramètre n’a été calibré sur une trajectoire réelle dans cette version.

Domaine : bateau à plat, eau profonde (hypothèse h/T ≥ 4), 0–4 nd surface. Hors modèle : vagues, gîte, émergence des safrans, faible profondeur, berge, squat, interaction entre appendices et repli d’hélice. Les cas de vent dont un panneau dépasse 20 nd apparents sont signalés hors plage de référence ; aucune mesure tronquée n’est interprétée comme zéro.

## Masse et inertie calculées

| Grandeur | Valeur | Unité |
|---|---:|---|
| surge | 2100.000 | kg |
| sway | 2100.000 | kg |
| yaw | 5443.410 | kg·m² |
| added.surge | 136.500 | kg |
| added.sway | 866.893 | kg |
| added.swayYaw | -366.769 | kg·m |
| added.yaw | 2484.073 | kg·m² |

Matrice effective : `[[2236.5,0,0],[0,2966.8926423587277,-366.76935201030665],[0,-366.76935201030665,7927.483463812028]]`. Les valeurs sont issues du moteur inchangé.

## Provenance par famille

A constructeur/architecte ; B documentation technique ; C calcul ; D littérature applicable ; E estimation ; F calibration. Une famille couvre ses feuilles numériques sauf chemin plus précis. Les incertitudes sont relatives, sauf mention contraire.

| Chemin | Classe | Incertitude | Source et méthode |
|---|---|---:|---|
| `geometry` | E / estimated | 0.25 | docs/physics/sun-odyssey-24-2-fixed-keel.md ;  ; Contour propre estimé depuis les dessins publiés ; sections de carène nue sans quille ; cf. fiche et tableau intégral |
| `mass` | E / estimated | 0.2 | docs/physics/sun-odyssey-24-2-fixed-keel.md ;  ; Chargement inventorié ; rayon de giration propre ; masse ajoutée sectionnelle équivalente |
| `hull` | E / estimated | 0.3 | docs/physics/sun-odyssey-24-2-fixed-keel.md ;  ; Prior indépendant de coque à déplacement ; résistance déduite de surface mouillée/vitesse de Froude, non mesurée |
| `appendages` | E / estimated | 0.25 | docs/physics/sun-odyssey-24-2-fixed-keel.md ;  ; Géométrie plane estimée sur plan ; polarité générique, aucune interaction quille-safran |
| `propulsors` | E / estimated | 0.25 | docs/physics/sun-odyssey-24-2-fixed-keel.md ;  ; Géométrie hélice et transmission estimées sauf chemins officiels ci-dessous ; tables quatre quadrants et dynamique mécanique comme priors non calibrés |
| `rudders` | E / estimated | 0.25 | docs/physics/sun-odyssey-24-2-fixed-keel.md ;  ; Surfaces et centres équivalents à plat ; polaires de littérature et dynamique de barre estimée ; jet déterminé par géométrie |
| `steering` | E / estimated | 0.25 | Réglage KJP demandé : vitesse maximale de 100°/s ; estimation non calibrée sur essai réel |
| `aerodynamics` | E / estimated | 0.25 | docs/physics/sun-odyssey-24-2-fixed-keel.md ;  ; Franc-bord intégré sur contour versionné ; roof, bôme et gréement propres estimés ; coefficients de corps non profilés |
| `contacts` | E / estimated | 0.25 | docs/physics/sun-odyssey-24-2-fixed-keel.md ;  ; Enveloppe tangentielle propre ; raideurs de défenses correspondant au gabarit ; loi KJP inchangée |
| `deckHardware` | E / estimated | 0.15 | docs/physics/sun-odyssey-24-2-fixed-keel.md ;  ; Points fonctionnels estimés depuis plan de pont ; attaches 7 cm en dedans du rail |
| `mooring` | E / estimated | 0.25 | docs/physics/sun-odyssey-24-2-fixed-keel.md ;  ; Polyester équivalent dimensionné par charge de travail propre ; effort humain 200 N et solveur KJP communs |
| `geometry.loa` | A / official | 0.03 | https://www.jeanneau.com/fr/bateaux/voilier/2-sun-odyssey/486-sun-odyssey-24-2 ; Spécifications ; plan Fauroux, version quillard inboard ; Valeur constructeur ; définition et variante conservées dans la fiche |
| `geometry.beam` | B / literature | 0.03 | https://sailboatdata.com/sailboat/sun-odyssey-242-jeanneau/ ; Sailboat Specifications ; Largeur technique secondaire 2,49 m ; absente de la page constructeur actuelle |
| `geometry.draft` | A / official | 0.03 | https://www.jeanneau.com/fr/bateaux/voilier/2-sun-odyssey/486-sun-odyssey-24-2 ; Spécifications ; plan Fauroux, version quillard inboard ; Valeur constructeur ; définition et variante conservées dans la fiche |
| `mass.lightDisplacement` | E / estimated | 0.08 | https://www.jeanneau.com/fr/bateaux/voilier/2-sun-odyssey/486-sun-odyssey-24-2 ; Spécifications ; plan Fauroux, version quillard inboard ; Poids constructeur 1830 kg ; interprétation en référence lège inboard incertaine, divergence technique 1905 kg conservée |
| `mass.displacement` | C / estimated | 0.08 | docs/physics/sun-odyssey-24-2-fixed-keel.md ;  ; Somme explicite du déplacement de référence, personnes, liquides et charge additionnelle ; arrondi documenté |
| `mass.yawRadius` | E / estimated | 0.2 | docs/physics/sun-odyssey-24-2-fixed-keel.md ;  ; Prior de répartition longitudinale propre ; inertie rigide m*k², aucune copie dimensionnelle |
| `mass.addedMassModel` | E / estimated | 0.25 | https://fossen.biz/html/marineCraftModel.html ;  ; Coefficients numériques estimés ; cadre de masse ajoutée de Fossen et modèle sectionnel KJP ; surge indépendant, sway/yaw couplés depuis carène nue, sans masse ajoutée des appendices |
| `hull.crossFlow.linearDampingFroude` | E / estimated | 0.2 | https://fossen.biz/html/marineCraftModel.html ;  ; Valeur estimée de régularisation KJP, non issue du document Fossen ; vitesse équivalente Fr*sqrt(g*LWL) |
| `propulsors.0.engine.powerKw` | A / official | 0.03 | https://www.yanmar.com/marine/product/engines/1gm10-marine-diesel-engine/ ; Spécifications moteur ; Puissance publiée du moteur ; 30 cv Pogo et 8 cv YS8 convertis à 0,7355 kW/cv |

Les éventuels regroupements A d’unités converties conservent les valeurs publiées et la conversion dans la méthode. Les dimensions non indiquées dans une source principale restent des estimations ou des données techniques secondaires dans les arbitrages ci-dessus.

## Valeurs numériques effectivement compilées

Ce tableau décrit le profil source, avant aplatissement de compilation ; les valeurs 1 sont sans dimension ou des comptages. Il comprend les stations, équipements, hélice et coefficients dérivés. Il évite qu’une valeur cachée soit présentée comme une donnée constructeur.

| Chemin | Valeur | Unité | Classe de provenance |
|---|---:|---|---|
| `geometry.loa` | 7.3 | m | A (`geometry.loa`) |
| `geometry.lwl` | 6.61 | m | E (`geometry`) |
| `geometry.lpp` | 6.35 | m | E (`geometry`) |
| `geometry.beam` | 2.49 | m | B (`geometry.beam`) |
| `geometry.draft` | 1.1 | m | A (`geometry.draft`) |
| `geometry.canoeDraft` | 0.43 | m | E (`geometry`) |
| `geometry.wettedArea` | 16.8 | m² | E (`geometry`) |
| `geometry.gunwale.0.x` | -3.5 | m | E (`geometry`) |
| `geometry.gunwale.0.halfBeam` | 0.78 | m | E (`geometry`) |
| `geometry.gunwale.0.z` | 0.78 | m | E (`geometry`) |
| `geometry.gunwale.1.x` | -3.1 | m | E (`geometry`) |
| `geometry.gunwale.1.halfBeam` | 1.04 | m | E (`geometry`) |
| `geometry.gunwale.1.z` | 0.76 | m | E (`geometry`) |
| `geometry.gunwale.2.x` | -2.35 | m | E (`geometry`) |
| `geometry.gunwale.2.halfBeam` | 1.18 | m | E (`geometry`) |
| `geometry.gunwale.2.z` | 0.74 | m | E (`geometry`) |
| `geometry.gunwale.3.x` | -1.45 | m | E (`geometry`) |
| `geometry.gunwale.3.halfBeam` | 1.245 | m | E (`geometry`) |
| `geometry.gunwale.3.z` | 0.73 | m | E (`geometry`) |
| `geometry.gunwale.4.x` | -0.4 | m | E (`geometry`) |
| `geometry.gunwale.4.halfBeam` | 1.23 | m | E (`geometry`) |
| `geometry.gunwale.4.z` | 0.74 | m | E (`geometry`) |
| `geometry.gunwale.5.x` | 0.65 | m | E (`geometry`) |
| `geometry.gunwale.5.halfBeam` | 1.13 | m | E (`geometry`) |
| `geometry.gunwale.5.z` | 0.77 | m | E (`geometry`) |
| `geometry.gunwale.6.x` | 1.6 | m | E (`geometry`) |
| `geometry.gunwale.6.halfBeam` | 0.92 | m | E (`geometry`) |
| `geometry.gunwale.6.z` | 0.81 | m | E (`geometry`) |
| `geometry.gunwale.7.x` | 2.35 | m | E (`geometry`) |
| `geometry.gunwale.7.halfBeam` | 0.64 | m | E (`geometry`) |
| `geometry.gunwale.7.z` | 0.85 | m | E (`geometry`) |
| `geometry.gunwale.8.x` | 2.95 | m | E (`geometry`) |
| `geometry.gunwale.8.halfBeam` | 0.34 | m | E (`geometry`) |
| `geometry.gunwale.8.z` | 0.9 | m | E (`geometry`) |
| `geometry.gunwale.9.x` | 3.4 | m | E (`geometry`) |
| `geometry.gunwale.9.halfBeam` | 0.08 | m | E (`geometry`) |
| `geometry.gunwale.9.z` | 0.93 | m | E (`geometry`) |
| `geometry.gunwale.10.x` | 3.6 | m | E (`geometry`) |
| `geometry.gunwale.10.halfBeam` | 0 | m | E (`geometry`) |
| `geometry.gunwale.10.z` | 0.94 | m | E (`geometry`) |
| `geometry.hullSections.0.x` | -3.004545454545455 | m | E (`geometry`) |
| `geometry.hullSections.0.dx` | 0.600909090909091 | m | E (`geometry`) |
| `geometry.hullSections.0.breadthFactor` | 0.6 | 1 | E (`geometry`) |
| `geometry.hullSections.0.immersedDepth` | 0.33712000000000003 | m | E (`geometry`) |
| `geometry.hullSections.0.shape` | 0.6 | 1 | E (`geometry`) |
| `geometry.hullSections.1.x` | -2.403636363636364 | m | E (`geometry`) |
| `geometry.hullSections.1.dx` | 0.600909090909091 | m | E (`geometry`) |
| `geometry.hullSections.1.breadthFactor` | 0.79 | 1 | E (`geometry`) |
| `geometry.hullSections.1.immersedDepth` | 0.381238 | m | E (`geometry`) |
| `geometry.hullSections.1.shape` | 0.79 | 1 | E (`geometry`) |
| `geometry.hullSections.2.x` | -1.8027272727272727 | m | E (`geometry`) |
| `geometry.hullSections.2.dx` | 0.600909090909091 | m | E (`geometry`) |
| `geometry.hullSections.2.breadthFactor` | 0.93 | 1 | E (`geometry`) |
| `geometry.hullSections.2.immersedDepth` | 0.41374600000000006 | m | E (`geometry`) |
| `geometry.hullSections.2.shape` | 0.93 | 1 | E (`geometry`) |
| `geometry.hullSections.3.x` | -1.2018181818181817 | m | E (`geometry`) |
| `geometry.hullSections.3.dx` | 0.600909090909091 | m | E (`geometry`) |
| `geometry.hullSections.3.breadthFactor` | 1 | 1 | E (`geometry`) |
| `geometry.hullSections.3.immersedDepth` | 0.43 | m | E (`geometry`) |
| `geometry.hullSections.3.shape` | 1 | 1 | E (`geometry`) |
| `geometry.hullSections.4.x` | -0.6009090909090911 | m | E (`geometry`) |
| `geometry.hullSections.4.dx` | 0.600909090909091 | m | E (`geometry`) |
| `geometry.hullSections.4.breadthFactor` | 0.98 | 1 | E (`geometry`) |
| `geometry.hullSections.4.immersedDepth` | 0.425356 | m | E (`geometry`) |
| `geometry.hullSections.4.shape` | 0.98 | 1 | E (`geometry`) |
| `geometry.hullSections.5.x` | 0 | m | E (`geometry`) |
| `geometry.hullSections.5.dx` | 0.600909090909091 | m | E (`geometry`) |
| `geometry.hullSections.5.breadthFactor` | 0.92 | 1 | E (`geometry`) |
| `geometry.hullSections.5.immersedDepth` | 0.411424 | m | E (`geometry`) |
| `geometry.hullSections.5.shape` | 0.92 | 1 | E (`geometry`) |
| `geometry.hullSections.6.x` | 0.6009090909090911 | m | E (`geometry`) |
| `geometry.hullSections.6.dx` | 0.600909090909091 | m | E (`geometry`) |
| `geometry.hullSections.6.breadthFactor` | 0.8 | 1 | E (`geometry`) |
| `geometry.hullSections.6.immersedDepth` | 0.38356000000000007 | m | E (`geometry`) |
| `geometry.hullSections.6.shape` | 0.8 | 1 | E (`geometry`) |
| `geometry.hullSections.7.x` | 1.2018181818181817 | m | E (`geometry`) |
| `geometry.hullSections.7.dx` | 0.600909090909091 | m | E (`geometry`) |
| `geometry.hullSections.7.breadthFactor` | 0.64 | 1 | E (`geometry`) |
| `geometry.hullSections.7.immersedDepth` | 0.34640800000000005 | m | E (`geometry`) |
| `geometry.hullSections.7.shape` | 0.64 | 1 | E (`geometry`) |
| `geometry.hullSections.8.x` | 1.8027272727272732 | m | E (`geometry`) |
| `geometry.hullSections.8.dx` | 0.600909090909091 | m | E (`geometry`) |
| `geometry.hullSections.8.breadthFactor` | 0.46 | 1 | E (`geometry`) |
| `geometry.hullSections.8.immersedDepth` | 0.304612 | m | E (`geometry`) |
| `geometry.hullSections.8.shape` | 0.46 | 1 | E (`geometry`) |
| `geometry.hullSections.9.x` | 2.403636363636364 | m | E (`geometry`) |
| `geometry.hullSections.9.dx` | 0.600909090909091 | m | E (`geometry`) |
| `geometry.hullSections.9.breadthFactor` | 0.28 | 1 | E (`geometry`) |
| `geometry.hullSections.9.immersedDepth` | 0.26281600000000005 | m | E (`geometry`) |
| `geometry.hullSections.9.shape` | 0.28 | 1 | E (`geometry`) |
| `geometry.hullSections.10.x` | 3.0045454545454544 | m | E (`geometry`) |
| `geometry.hullSections.10.dx` | 0.600909090909091 | m | E (`geometry`) |
| `geometry.hullSections.10.breadthFactor` | 0.12 | 1 | E (`geometry`) |
| `geometry.hullSections.10.immersedDepth` | 0.225664 | m | E (`geometry`) |
| `geometry.hullSections.10.shape` | 0.12 | 1 | E (`geometry`) |
| `mass.lightDisplacement` | 1830 | kg | E (`mass.lightDisplacement`) |
| `mass.displacement` | 2100 | kg | C (`mass.displacement`) |
| `mass.centerOfGravity.x` | 0 | m | E (`mass`) |
| `mass.centerOfGravity.y` | 0 | m | E (`mass`) |
| `mass.yawRadius` | 1.61 | m | E (`mass.yawRadius`) |
| `mass.addedMassModel.surgeMassRatio` | 0.065 | 1 | E (`mass.addedMassModel`) |
| `mass.addedMassModel.sectionalScale` | 0.31 | 1 | E (`mass.addedMassModel`) |
| `hull.axialResistance.surgeLinear` | 48 | N·s/m | E (`hull`) |
| `hull.axialResistance.surgeQuadratic` | 51 | N·s²/m² | E (`hull`) |
| `hull.axialResistance.waveRise` | 18 | N·s²/m² | E (`hull`) |
| `hull.axialResistance.waveOnset` | 1.78 | m/s | E (`hull`) |
| `hull.crossFlow.cd` | 1.07 | 1 | E (`hull`) |
| `hull.crossFlow.areaFactor` | 0.69 | 1 | E (`hull`) |
| `hull.crossFlow.linearDampingFroude` | 0.019 | 1 | E (`hull.crossFlow.linearDampingFroude`) |
| `appendages.0.position.x` | -0.1 | m | E (`appendages`) |
| `appendages.0.position.y` | 0 | m | E (`appendages`) |
| `appendages.0.position.z` | -0.76 | m | E (`appendages`) |
| `appendages.0.area` | 1.24 | m² | E (`appendages`) |
| `appendages.0.span` | 0.67 | m | E (`appendages`) |
| `appendages.0.aspectRatio` | 0.85 | 1 | E (`appendages`) |
| `appendages.0.coefficients.efficiency` | 0.72 | 1 | E (`appendages`) |
| `appendages.0.coefficients.cd0` | 0.02 | 1 | E (`appendages`) |
| `appendages.0.coefficients.normalCd90` | 1.16 | 1 | E (`appendages`) |
| `appendages.0.coefficients.stallStartDeg` | 24 | ° | E (`appendages`) |
| `appendages.0.coefficients.stallEndDeg` | 52 | ° | E (`appendages`) |
| `propulsors.0.position.x` | -2.25 | m | E (`propulsors`) |
| `propulsors.0.position.y` | 0 | m | E (`propulsors`) |
| `propulsors.0.position.z` | -0.52 | m | E (`propulsors`) |
| `propulsors.0.axis.x` | 1 | 1 | E (`propulsors`) |
| `propulsors.0.axis.y` | 0 | 1 | E (`propulsors`) |
| `propulsors.0.engine.powerKw` | 6.6 | kW | A (`propulsors.0.engine.powerKw`) |
| `propulsors.0.engine.idleRpm` | 850 | tr/min | E (`propulsors`) |
| `propulsors.0.engine.maxRpm` | 3600 | tr/min | E (`propulsors`) |
| `propulsors.0.engine.dynamics.inertiaKgM2` | 0.07 | kg·m² | E (`propulsors`) |
| `propulsors.0.engine.dynamics.frictionNm` | 1.8 | N·m | E (`propulsors`) |
| `propulsors.0.engine.dynamics.governorKpNmPerRadS` | 0.84 | N·m·s/rad | E (`propulsors`) |
| `propulsors.0.engine.dynamics.governorKiNmPerRad` | 0.64 | N·m/rad | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.0.rpm` | 850 | tr/min | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.0.torqueNm` | 12.605071492878112 | N·m | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.1.rpm` | 1500 | tr/min | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.1.torqueNm` | 16.80676199050415 | N·m | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.2.rpm` | 2200 | tr/min | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.2.torqueNm` | 19.25774811411934 | N·m | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.3.rpm` | 2800 | tr/min | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.3.torqueNm` | 18.557466364515 | N·m | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.4.rpm` | 3600 | tr/min | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.4.torqueNm` | 17.50704374010849 | N·m | E (`propulsors`) |
| `propulsors.0.gearbox.ratioAhead` | 2.62 | 1 | E (`propulsors`) |
| `propulsors.0.gearbox.ratioAstern` | 3.06 | 1 | E (`propulsors`) |
| `propulsors.0.gearbox.efficiency` | 0.94 | 1 | E (`propulsors`) |
| `propulsors.0.gearbox.clutch.capacityEngineNm` | 28.886622171179006 | N·m | E (`propulsors`) |
| `propulsors.0.gearbox.clutch.stiffnessNmPerRadS` | 0.82 | N·m·s/rad | E (`propulsors`) |
| `propulsors.0.gearbox.clutch.disengageTimeS` | 0.12 | s | E (`propulsors`) |
| `propulsors.0.gearbox.clutch.neutralDwellS` | 0.18 | s | E (`propulsors`) |
| `propulsors.0.gearbox.clutch.engageTimeS` | 0.36 | s | E (`propulsors`) |
| `propulsors.0.propeller.diameter` | 0.305 | m | E (`propulsors`) |
| `propulsors.0.propeller.pitch` | 0.229 | m | E (`propulsors`) |
| `propulsors.0.propeller.blades` | 2 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.expandedAreaRatio` | 0.35 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.shaft.inertiaKgM2` | 0.012 | kg·m² | E (`propulsors`) |
| `propulsors.0.propeller.shaft.viscousFrictionNmPerRadS` | 0.018 | N·m·s/rad | E (`propulsors`) |
| `propulsors.0.propeller.shaft.coulombFrictionNm` | 0.18 | N·m | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.sampleCount` | 32 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.betaOriginRad` | -3.141592653589793 | rad | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.0` | -0.051172372341907614 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.1` | -0.05685633583310484 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.2` | -0.05177181848583795 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.3` | -0.03669289197496384 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.4` | -0.013915186170953789 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.5` | 0.013093599697948897 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.6` | 0.04022162281845729 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.7` | 0.06333888758661609 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.8` | 0.078926 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.9` | 0.09865812082313975 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.10` | 0.11496717944826701 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.11` | 0.12537026954169075 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.12` | 0.1282836149409337 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.13` | 0.12326368521850298 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.14` | 0.11107471916886241 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.15` | 0.09357237637981736 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.16` | 0.07342122988186744 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.17` | 0.047681225041713474 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.18` | 0.014263160245529883 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.19` | -0.02174536707697619 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.20` | -0.05486238505906626 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.21` | -0.08004612791948265 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.22` | -0.09346259909892439 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.23` | -0.09306926248093574 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.24` | -0.078926 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.25` | -0.06723415249178857 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.26` | -0.05520966366799908 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.27` | -0.04468315294979088 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.28` | -0.037257186170953804 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.29` | -0.03406229945700938 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.30` | -0.035584885348435444 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.31` | -0.041593143945537855 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.0` | -0.014534004925457998 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.1` | -0.014322492041579173 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.2` | -0.012380762295866366 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.3` | -0.009004426440280383 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.4` | -0.004707501002273428 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.5` | -0.0001441539280559775 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.6` | 0.0039908865571665906 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.7` | 0.0070680980237544985 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.8` | 0.008619002920911138 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.9` | 0.009449503469615324 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.10` | 0.01047517692241608 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.11` | 0.011539873793877489 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.12` | 0.012481503636820731 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.13` | 0.013156711843553475 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.14` | 0.013462704085378297 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.15` | 0.01335289581730395 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.16` | 0.012844004352730323 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.17` | 0.011357421272399793 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.18` | 0.008463382842757172 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.19` | 0.004602480180191847 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.20` | 0.0003625007159095944 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.21` | -0.0036110571121621624 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.22` | -0.006713255145090894 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.23` | -0.008471811853858422 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.24` | -0.008619002920911138 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.25` | -0.008174433273163622 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.26` | -0.008247798042034557 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.27` | -0.008827928106516622 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.28` | -0.009826503923184569 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.29` | -0.011091501376063009 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.30` | -0.01243033607018166 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.31` | -0.013639182559927698 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.uncertainty` | 0.25 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.safety.maximumThrustCoefficient` | 2.2 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.safety.maximumTorqueCoefficient` | 0.12 | 1 | E (`propulsors`) |
| `propulsors.0.transverseWalk.base` | 0.032 | 1 | E (`propulsors`) |
| `propulsors.0.transverseWalk.gain` | 0.125 | 1 | E (`propulsors`) |
| `rudders.0.position.x` | -2.95 | m | E (`rudders`) |
| `rudders.0.position.y` | 0 | m | E (`rudders`) |
| `rudders.0.position.z` | -0.64 | m | E (`rudders`) |
| `rudders.0.area` | 0.39 | m² | E (`rudders`) |
| `rudders.0.span` | 0.75 | m | E (`rudders`) |
| `rudders.0.aspectRatio` | 1.44 | 1 | E (`rudders`) |
| `rudders.0.coefficients.efficiency` | 0.72 | 1 | E (`rudders`) |
| `rudders.0.coefficients.cd0` | 0.022 | 1 | E (`rudders`) |
| `rudders.0.coefficients.normalCd90` | 1.12 | 1 | E (`rudders`) |
| `rudders.0.coefficients.stallStartDeg` | 24 | ° | E (`rudders`) |
| `rudders.0.coefficients.stallEndDeg` | 52 | ° | E (`rudders`) |
| `rudders.0.axis.x` | 0 | 1 | E (`rudders`) |
| `rudders.0.axis.y` | 0 | 1 | E (`rudders`) |
| `rudders.0.axis.z` | 1 | 1 | E (`rudders`) |
| `rudders.0.stock.chordFraction` | 0.18 | 1 | E (`rudders`) |
| `rudders.0.maxAngleDeg` | 35 | ° | E (`rudders`) |
| `steering.maximumRudderRateDegS` | 100 | °/s | E (`steering`) |
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
| `aerodynamics.panels.0.area` | 0.36734730160979806 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.0.normalBody.x` | -0.5449883505954142 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.0.normalBody.y` | 0.838443616300637 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.0.center.x` | -3.3008658008658007 | m | E (`aerodynamics`) |
| `aerodynamics.panels.0.center.y` | 0.9094372294372295 | m | E (`aerodynamics`) |
| `aerodynamics.panels.0.center.z` | 0.385021645021645 | m | E (`aerodynamics`) |
| `aerodynamics.panels.0.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.0.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.0.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.1.area` | 0.36734730160979806 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.1.normalBody.x` | -0.5449883505954142 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.1.normalBody.y` | -0.838443616300637 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.1.center.x` | -3.3008658008658007 | m | E (`aerodynamics`) |
| `aerodynamics.panels.1.center.y` | -0.9094372294372295 | m | E (`aerodynamics`) |
| `aerodynamics.panels.1.center.z` | 0.385021645021645 | m | E (`aerodynamics`) |
| `aerodynamics.panels.1.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.1.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.1.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.2.area` | 0.5722160868063743 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.2.normalBody.x` | -0.18349711310288572 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.2.normalBody.y` | 0.9830202487654599 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.2.center.x` | -2.726666666666667 | m | E (`aerodynamics`) |
| `aerodynamics.panels.2.center.y` | 1.1096888888888887 | m | E (`aerodynamics`) |
| `aerodynamics.panels.2.center.z` | 0.3750222222222223 | m | E (`aerodynamics`) |
| `aerodynamics.panels.2.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.2.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.2.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.3.area` | 0.5722160868063743 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.3.normalBody.x` | -0.18349711310288572 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.3.normalBody.y` | -0.9830202487654599 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.3.center.x` | -2.726666666666667 | m | E (`aerodynamics`) |
| `aerodynamics.panels.3.center.y` | -1.1096888888888887 | m | E (`aerodynamics`) |
| `aerodynamics.panels.3.center.z` | 0.3750222222222223 | m | E (`aerodynamics`) |
| `aerodynamics.panels.3.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.3.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.3.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.4.area` | 0.6632229644885648 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.4.normalBody.x` | -0.07203459855591875 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.4.normalBody.y` | 0.9974021338511804 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.4.center.x` | -1.9010204081632653 | m | E (`aerodynamics`) |
| `aerodynamics.panels.4.center.y` | 1.2124263038548755 | m | E (`aerodynamics`) |
| `aerodynamics.panels.4.center.z` | 0.3675056689342404 | m | E (`aerodynamics`) |
| `aerodynamics.panels.4.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.4.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.4.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.5.area` | 0.6632229644885648 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.5.normalBody.x` | -0.07203459855591875 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.5.normalBody.y` | -0.9974021338511804 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.5.center.x` | -1.9010204081632653 | m | E (`aerodynamics`) |
| `aerodynamics.panels.5.center.y` | -1.2124263038548755 | m | E (`aerodynamics`) |
| `aerodynamics.panels.5.center.z` | 0.3675056689342404 | m | E (`aerodynamics`) |
| `aerodynamics.panels.5.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.5.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.5.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.6.area` | 0.7718287459825526 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.6.normalBody.x` | 0.014284256782850266 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.6.normalBody.y` | 0.99989797479951 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.6.center.x` | -0.923809523809524 | m | E (`aerodynamics`) |
| `aerodynamics.panels.6.center.y` | 1.237482993197279 | m | E (`aerodynamics`) |
| `aerodynamics.panels.6.center.z` | 0.36750566893424036 | m | E (`aerodynamics`) |
| `aerodynamics.panels.6.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.6.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.6.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.7.area` | 0.7718287459825526 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.7.normalBody.x` | 0.014284256782850266 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.7.normalBody.y` | -0.99989797479951 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.7.center.x` | -0.923809523809524 | m | E (`aerodynamics`) |
| `aerodynamics.panels.7.center.y` | -1.237482993197279 | m | E (`aerodynamics`) |
| `aerodynamics.panels.7.center.z` | 0.36750566893424036 | m | E (`aerodynamics`) |
| `aerodynamics.panels.7.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.7.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.7.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.8.area` | 0.7963371223922693 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.8.normalBody.x` | 0.09480909262799553 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.8.normalBody.y` | 0.9954954725939522 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.8.center.x` | 0.12847682119205298 | m | E (`aerodynamics`) |
| `aerodynamics.panels.8.center.y` | 1.1796688741721852 | m | E (`aerodynamics`) |
| `aerodynamics.panels.8.center.z` | 0.37754966887417213 | m | E (`aerodynamics`) |
| `aerodynamics.panels.8.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.8.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.8.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.9.area` | 0.7963371223922693 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.9.normalBody.x` | 0.09480909262799553 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.9.normalBody.y` | -0.9954954725939522 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.9.center.x` | 0.12847682119205298 | m | E (`aerodynamics`) |
| `aerodynamics.panels.9.center.y` | -1.1796688741721852 | m | E (`aerodynamics`) |
| `aerodynamics.panels.9.center.z` | 0.37754966887417213 | m | E (`aerodynamics`) |
| `aerodynamics.panels.9.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.9.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.9.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.10.area` | 0.7686176292539744 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.10.normalBody.x` | 0.21584204380144595 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.10.normalBody.y` | 0.9764282933874944 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.10.center.x` | 1.1290084388185657 | m | E (`aerodynamics`) |
| `aerodynamics.panels.10.center.y` | 1.024113924050633 | m | E (`aerodynamics`) |
| `aerodynamics.panels.10.center.z` | 0.39508438818565406 | m | E (`aerodynamics`) |
| `aerodynamics.panels.10.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.10.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.10.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.11.area` | 0.7686176292539744 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.11.normalBody.x` | 0.21584204380144595 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.11.normalBody.y` | -0.9764282933874944 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.11.center.x` | 1.1290084388185657 | m | E (`aerodynamics`) |
| `aerodynamics.panels.11.center.y` | -1.024113924050633 | m | E (`aerodynamics`) |
| `aerodynamics.panels.11.center.z` | 0.39508438818565406 | m | E (`aerodynamics`) |
| `aerodynamics.panels.11.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.11.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.11.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.12.area` | 0.6644667109795646 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.12.normalBody.x` | 0.3497541654982132 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.12.normalBody.y` | 0.9368415147273568 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.12.center.x` | 1.978012048192771 | m | E (`aerodynamics`) |
| `aerodynamics.panels.12.center.y` | 0.7788755020080322 | m | E (`aerodynamics`) |
| `aerodynamics.panels.12.center.z` | 0.4150803212851405 | m | E (`aerodynamics`) |
| `aerodynamics.panels.12.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.12.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.12.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.13.area` | 0.6644667109795646 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.13.normalBody.x` | 0.3497541654982132 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.13.normalBody.y` | -0.9368415147273568 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.13.center.x` | 1.978012048192771 | m | E (`aerodynamics`) |
| `aerodynamics.panels.13.center.y` | -0.7788755020080322 | m | E (`aerodynamics`) |
| `aerodynamics.panels.13.center.z` | 0.4150803212851405 | m | E (`aerodynamics`) |
| `aerodynamics.panels.13.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.13.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.13.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.14.area` | 0.586967844093695 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.14.normalBody.x` | 0.4472135954999578 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.14.normalBody.y` | 0.8944271909999159 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.14.center.x` | 2.652857142857142 | m | E (`aerodynamics`) |
| `aerodynamics.panels.14.center.y` | 0.48857142857142855 | m | E (`aerodynamics`) |
| `aerodynamics.panels.14.center.z` | 0.4376190476190475 | m | E (`aerodynamics`) |
| `aerodynamics.panels.14.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.14.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.14.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.15.area` | 0.586967844093695 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.15.normalBody.x` | 0.4472135954999578 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.15.normalBody.y` | -0.8944271909999159 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.15.center.x` | 2.652857142857142 | m | E (`aerodynamics`) |
| `aerodynamics.panels.15.center.y` | -0.48857142857142855 | m | E (`aerodynamics`) |
| `aerodynamics.panels.15.center.z` | 0.4376190476190475 | m | E (`aerodynamics`) |
| `aerodynamics.panels.15.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.15.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.15.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.16.area` | 0.4755359844428178 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.16.normalBody.x` | 0.5002775978746294 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.16.normalBody.y` | 0.8658650732445503 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.16.center.x` | 3.1762295081967213 | m | E (`aerodynamics`) |
| `aerodynamics.panels.16.center.y` | 0.20928961748633884 | m | E (`aerodynamics`) |
| `aerodynamics.panels.16.center.z` | 0.45754098360655737 | m | E (`aerodynamics`) |
| `aerodynamics.panels.16.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.16.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.16.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.17.area` | 0.4755359844428178 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.17.normalBody.x` | 0.5002775978746294 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.17.normalBody.y` | -0.8658650732445503 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.17.center.x` | 3.1762295081967213 | m | E (`aerodynamics`) |
| `aerodynamics.panels.17.center.y` | -0.20928961748633884 | m | E (`aerodynamics`) |
| `aerodynamics.panels.17.center.z` | 0.45754098360655737 | m | E (`aerodynamics`) |
| `aerodynamics.panels.17.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.17.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.17.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.18.area` | 0.20140516378683063 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.18.normalBody.x` | 0.3713906763541034 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.18.normalBody.y` | 0.9284766908852594 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.18.center.x` | 3.5001782531194294 | m | E (`aerodynamics`) |
| `aerodynamics.panels.18.center.y` | 0.039928698752228174 | m | E (`aerodynamics`) |
| `aerodynamics.panels.18.center.z` | 0.4675044563279857 | m | E (`aerodynamics`) |
| `aerodynamics.panels.18.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.18.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.18.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.19.area` | 0.20140516378683063 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.19.normalBody.x` | 0.3713906763541034 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.19.normalBody.y` | -0.9284766908852594 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.19.center.x` | 3.5001782531194294 | m | E (`aerodynamics`) |
| `aerodynamics.panels.19.center.y` | -0.039928698752228174 | m | E (`aerodynamics`) |
| `aerodynamics.panels.19.center.z` | 0.4675044563279857 | m | E (`aerodynamics`) |
| `aerodynamics.panels.19.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.19.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.19.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.20.area` | 1.45 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.20.normalBody.x` | -0.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.20.normalBody.y` | 0.997 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.20.center.x` | -0.7 | m | E (`aerodynamics`) |
| `aerodynamics.panels.20.center.y` | 0.56 | m | E (`aerodynamics`) |
| `aerodynamics.panels.20.center.z` | 1.3 | m | E (`aerodynamics`) |
| `aerodynamics.panels.20.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.20.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.20.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.21.area` | 1.45 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.21.normalBody.x` | -0.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.21.normalBody.y` | -0.997 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.21.center.x` | -0.7 | m | E (`aerodynamics`) |
| `aerodynamics.panels.21.center.y` | -0.56 | m | E (`aerodynamics`) |
| `aerodynamics.panels.21.center.z` | 1.3 | m | E (`aerodynamics`) |
| `aerodynamics.panels.21.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.21.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.21.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.22.area` | 0.85 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.22.normalBody.x` | 0.12 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.22.normalBody.y` | 0.993 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.22.center.x` | 0.85 | m | E (`aerodynamics`) |
| `aerodynamics.panels.22.center.y` | 0.46 | m | E (`aerodynamics`) |
| `aerodynamics.panels.22.center.z` | 1.35 | m | E (`aerodynamics`) |
| `aerodynamics.panels.22.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.22.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.22.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.23.area` | 0.85 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.23.normalBody.x` | 0.12 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.23.normalBody.y` | -0.993 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.23.center.x` | 0.85 | m | E (`aerodynamics`) |
| `aerodynamics.panels.23.center.y` | -0.46 | m | E (`aerodynamics`) |
| `aerodynamics.panels.23.center.z` | 1.35 | m | E (`aerodynamics`) |
| `aerodynamics.panels.23.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.23.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.23.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.24.area` | 0.55 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.24.normalBody.x` | 0 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.24.normalBody.y` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.24.center.x` | -0.12 | m | E (`aerodynamics`) |
| `aerodynamics.panels.24.center.y` | 0.12 | m | E (`aerodynamics`) |
| `aerodynamics.panels.24.center.z` | 2.3 | m | E (`aerodynamics`) |
| `aerodynamics.panels.24.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.24.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.24.exposure` | 0.92 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.25.area` | 0.55 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.25.normalBody.x` | 0 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.25.normalBody.y` | -1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.25.center.x` | -0.12 | m | E (`aerodynamics`) |
| `aerodynamics.panels.25.center.y` | -0.12 | m | E (`aerodynamics`) |
| `aerodynamics.panels.25.center.z` | 2.3 | m | E (`aerodynamics`) |
| `aerodynamics.panels.25.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.25.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.25.exposure` | 0.92 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.26.area` | 1.15 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.26.normalBody.x` | 0 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.26.normalBody.y` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.26.center.x` | 0.2 | m | E (`aerodynamics`) |
| `aerodynamics.panels.26.center.y` | 0 | m | E (`aerodynamics`) |
| `aerodynamics.panels.26.center.z` | 3.9 | m | E (`aerodynamics`) |
| `aerodynamics.panels.26.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.26.cdTangential` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.26.exposure` | 0.95 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.27.area` | 1.2168 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.27.normalBody.x` | -1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.27.normalBody.y` | 0 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.27.center.x` | -3.5 | m | E (`aerodynamics`) |
| `aerodynamics.panels.27.center.y` | 0 | m | E (`aerodynamics`) |
| `aerodynamics.panels.27.center.z` | 0.39 | m | E (`aerodynamics`) |
| `aerodynamics.panels.27.cdNormal` | 1.02 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.27.cdTangential` | 0.04 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.27.exposure` | 0.96 | 1 | E (`aerodynamics`) |
| `contacts.fenderRadius` | 0.14 | m | E (`contacts`) |
| `contacts.hullRadius` | 0.15 | m | E (`contacts`) |
| `contacts.fenderStiffness` | 24000 | N/m | E (`contacts`) |
| `contacts.hullStiffness` | 48000 | N/m | E (`contacts`) |
| `contacts.dampingRatio` | 0.82 | 1 | E (`contacts`) |
| `contacts.friction` | 0.3 | 1 | E (`contacts`) |
| `contacts.hullFriction` | 0.3 | 1 | E (`contacts`) |
| `contacts.fenderFriction` | 0.03 | 1 | E (`contacts`) |
| `contacts.forceLimit` | 45000 | N | E (`contacts`) |
| `contacts.fenders.0.position.x` | 2.245468041514768 | m | E (`contacts`) |
| `contacts.fenders.0.position.y` | -0.8177893969145563 | m | E (`contacts`) |
| `contacts.fenders.0.position.z` | 0.30000000000000004 | m | E (`contacts`) |
| `contacts.fenders.0.attachment.x` | 2.2 | m | E (`contacts`) |
| `contacts.fenders.0.attachment.y` | -0.696 | m | E (`contacts`) |
| `contacts.fenders.0.attachment.z` | 0.842 | m | E (`contacts`) |
| `contacts.fenders.0.preload` | 0.01 | m | E (`contacts`) |
| `contacts.fenders.1.position.x` | 0.01232518204163942 | m | E (`contacts`) |
| `contacts.fenders.1.position.y` | -1.3213191733419756 | m | E (`contacts`) |
| `contacts.fenders.1.position.z` | 0.30000000000000004 | m | E (`contacts`) |
| `contacts.fenders.1.attachment.x` | 0 | m | E (`contacts`) |
| `contacts.fenders.1.attachment.y` | -1.1919047619047618 | m | E (`contacts`) |
| `contacts.fenders.1.attachment.z` | 0.7514285714285714 | m | E (`contacts`) |
| `contacts.fenders.1.preload` | 0.01 | m | E (`contacts`) |
| `contacts.fenders.2.position.x` | -2.423854624703375 | m | E (`contacts`) |
| `contacts.fenders.2.position.y` | -1.2984592990061763 | m | E (`contacts`) |
| `contacts.fenders.2.position.z` | 0.30000000000000004 | m | E (`contacts`) |
| `contacts.fenders.2.attachment.x` | -2.4 | m | E (`contacts`) |
| `contacts.fenders.2.attachment.y` | -1.1706666666666665 | m | E (`contacts`) |
| `contacts.fenders.2.attachment.z` | 0.7413333333333333 | m | E (`contacts`) |
| `contacts.fenders.2.preload` | 0.01 | m | E (`contacts`) |
| `contacts.fenders.3.position.x` | 2.245468041514768 | m | E (`contacts`) |
| `contacts.fenders.3.position.y` | 0.8177893969145563 | m | E (`contacts`) |
| `contacts.fenders.3.position.z` | 0.30000000000000004 | m | E (`contacts`) |
| `contacts.fenders.3.attachment.x` | 2.2 | m | E (`contacts`) |
| `contacts.fenders.3.attachment.y` | 0.696 | m | E (`contacts`) |
| `contacts.fenders.3.attachment.z` | 0.842 | m | E (`contacts`) |
| `contacts.fenders.3.preload` | 0.01 | m | E (`contacts`) |
| `contacts.fenders.4.position.x` | 0.01232518204163942 | m | E (`contacts`) |
| `contacts.fenders.4.position.y` | 1.3213191733419756 | m | E (`contacts`) |
| `contacts.fenders.4.position.z` | 0.30000000000000004 | m | E (`contacts`) |
| `contacts.fenders.4.attachment.x` | 0 | m | E (`contacts`) |
| `contacts.fenders.4.attachment.y` | 1.1919047619047618 | m | E (`contacts`) |
| `contacts.fenders.4.attachment.z` | 0.7514285714285714 | m | E (`contacts`) |
| `contacts.fenders.4.preload` | 0.01 | m | E (`contacts`) |
| `contacts.fenders.5.position.x` | -2.423854624703375 | m | E (`contacts`) |
| `contacts.fenders.5.position.y` | 1.2984592990061763 | m | E (`contacts`) |
| `contacts.fenders.5.position.z` | 0.30000000000000004 | m | E (`contacts`) |
| `contacts.fenders.5.attachment.x` | -2.4 | m | E (`contacts`) |
| `contacts.fenders.5.attachment.y` | 1.1706666666666665 | m | E (`contacts`) |
| `contacts.fenders.5.attachment.z` | 0.7413333333333333 | m | E (`contacts`) |
| `contacts.fenders.5.preload` | 0.01 | m | E (`contacts`) |
| `contacts.hullEnvelope.0.position.x` | -3.4182517474106877 | m | E (`contacts`) |
| `contacts.hullEnvelope.0.position.y` | -0.6542334575549045 | m | E (`contacts`) |
| `contacts.hullEnvelope.0.radius` | 0.15 | m | E (`contacts`) |
| `contacts.hullEnvelope.0.reference.x` | -3.5 | m | E (`contacts`) |
| `contacts.hullEnvelope.0.reference.y` | -0.78 | m | E (`contacts`) |
| `contacts.hullEnvelope.1.position.x` | -3.018251747410688 | m | E (`contacts`) |
| `contacts.hullEnvelope.1.position.y` | -0.9142334575549045 | m | E (`contacts`) |
| `contacts.hullEnvelope.1.radius` | 0.15 | m | E (`contacts`) |
| `contacts.hullEnvelope.1.reference.x` | -3.1 | m | E (`contacts`) |
| `contacts.hullEnvelope.1.reference.y` | -1.04 | m | E (`contacts`) |
| `contacts.hullEnvelope.2.position.x` | -2.322475433034567 | m | E (`contacts`) |
| `contacts.hullEnvelope.2.position.y` | -1.0325469626851809 | m | E (`contacts`) |
| `contacts.hullEnvelope.2.radius` | 0.15 | m | E (`contacts`) |
| `contacts.hullEnvelope.2.reference.x` | -2.35 | m | E (`contacts`) |
| `contacts.hullEnvelope.2.reference.y` | -1.18 | m | E (`contacts`) |
| `contacts.hullEnvelope.3.position.x` | -1.439194810216612 | m | E (`contacts`) |
| `contacts.hullEnvelope.3.position.y` | -1.095389679922323 | m | E (`contacts`) |
| `contacts.hullEnvelope.3.radius` | 0.15 | m | E (`contacts`) |
| `contacts.hullEnvelope.3.reference.x` | -1.45 | m | E (`contacts`) |
| `contacts.hullEnvelope.3.reference.y` | -1.245 | m | E (`contacts`) |
| `contacts.hullEnvelope.4.position.x` | -0.40214263851742754 | m | E (`contacts`) |
| `contacts.hullEnvelope.4.position.y` | -1.0800153037800735 | m | E (`contacts`) |
| `contacts.hullEnvelope.4.radius` | 0.15 | m | E (`contacts`) |
| `contacts.hullEnvelope.4.reference.x` | -0.4 | m | E (`contacts`) |
| `contacts.hullEnvelope.4.reference.y` | -1.23 | m | E (`contacts`) |
| `contacts.hullEnvelope.5.position.x` | 0.6357786361058007 | m | E (`contacts`) |
| `contacts.hullEnvelope.5.position.y` | -0.980675679110907 | m | E (`contacts`) |
| `contacts.hullEnvelope.5.radius` | 0.15 | m | E (`contacts`) |
| `contacts.hullEnvelope.5.reference.x` | 0.65 | m | E (`contacts`) |
| `contacts.hullEnvelope.5.reference.y` | -1.13 | m | E (`contacts`) |
| `contacts.hullEnvelope.6.position.x` | 1.5676236934297831 | m | E (`contacts`) |
| `contacts.hullEnvelope.6.position.y` | -0.7735357559918759 | m | E (`contacts`) |
| `contacts.hullEnvelope.6.radius` | 0.15 | m | E (`contacts`) |
| `contacts.hullEnvelope.6.reference.x` | 1.6 | m | E (`contacts`) |
| `contacts.hullEnvelope.6.reference.y` | -0.92 | m | E (`contacts`) |
| `contacts.hullEnvelope.7.position.x` | 2.2975368751752683 | m | E (`contacts`) |
| `contacts.hullEnvelope.7.position.y` | -0.49947377279089644 | m | E (`contacts`) |
| `contacts.hullEnvelope.7.radius` | 0.15 | m | E (`contacts`) |
| `contacts.hullEnvelope.7.reference.x` | 2.35 | m | E (`contacts`) |
| `contacts.hullEnvelope.7.reference.y` | -0.64 | m | E (`contacts`) |
| `contacts.hullEnvelope.8.position.x` | 2.8829179606750066 | m | E (`contacts`) |
| `contacts.hullEnvelope.8.position.y` | -0.20583592135001266 | m | E (`contacts`) |
| `contacts.hullEnvelope.8.radius` | 0.15 | m | E (`contacts`) |
| `contacts.hullEnvelope.8.reference.x` | 2.95 | m | E (`contacts`) |
| `contacts.hullEnvelope.8.reference.y` | -0.34 | m | E (`contacts`) |
| `contacts.hullEnvelope.9.position.x` | -3.4182517474106877 | m | E (`contacts`) |
| `contacts.hullEnvelope.9.position.y` | 0.6542334575549045 | m | E (`contacts`) |
| `contacts.hullEnvelope.9.radius` | 0.15 | m | E (`contacts`) |
| `contacts.hullEnvelope.9.reference.x` | -3.5 | m | E (`contacts`) |
| `contacts.hullEnvelope.9.reference.y` | 0.78 | m | E (`contacts`) |
| `contacts.hullEnvelope.10.position.x` | -3.018251747410688 | m | E (`contacts`) |
| `contacts.hullEnvelope.10.position.y` | 0.9142334575549045 | m | E (`contacts`) |
| `contacts.hullEnvelope.10.radius` | 0.15 | m | E (`contacts`) |
| `contacts.hullEnvelope.10.reference.x` | -3.1 | m | E (`contacts`) |
| `contacts.hullEnvelope.10.reference.y` | 1.04 | m | E (`contacts`) |
| `contacts.hullEnvelope.11.position.x` | -2.322475433034567 | m | E (`contacts`) |
| `contacts.hullEnvelope.11.position.y` | 1.0325469626851809 | m | E (`contacts`) |
| `contacts.hullEnvelope.11.radius` | 0.15 | m | E (`contacts`) |
| `contacts.hullEnvelope.11.reference.x` | -2.35 | m | E (`contacts`) |
| `contacts.hullEnvelope.11.reference.y` | 1.18 | m | E (`contacts`) |
| `contacts.hullEnvelope.12.position.x` | -1.439194810216612 | m | E (`contacts`) |
| `contacts.hullEnvelope.12.position.y` | 1.095389679922323 | m | E (`contacts`) |
| `contacts.hullEnvelope.12.radius` | 0.15 | m | E (`contacts`) |
| `contacts.hullEnvelope.12.reference.x` | -1.45 | m | E (`contacts`) |
| `contacts.hullEnvelope.12.reference.y` | 1.245 | m | E (`contacts`) |
| `contacts.hullEnvelope.13.position.x` | -0.40214263851742754 | m | E (`contacts`) |
| `contacts.hullEnvelope.13.position.y` | 1.0800153037800735 | m | E (`contacts`) |
| `contacts.hullEnvelope.13.radius` | 0.15 | m | E (`contacts`) |
| `contacts.hullEnvelope.13.reference.x` | -0.4 | m | E (`contacts`) |
| `contacts.hullEnvelope.13.reference.y` | 1.23 | m | E (`contacts`) |
| `contacts.hullEnvelope.14.position.x` | 0.6357786361058007 | m | E (`contacts`) |
| `contacts.hullEnvelope.14.position.y` | 0.980675679110907 | m | E (`contacts`) |
| `contacts.hullEnvelope.14.radius` | 0.15 | m | E (`contacts`) |
| `contacts.hullEnvelope.14.reference.x` | 0.65 | m | E (`contacts`) |
| `contacts.hullEnvelope.14.reference.y` | 1.13 | m | E (`contacts`) |
| `contacts.hullEnvelope.15.position.x` | 1.5676236934297831 | m | E (`contacts`) |
| `contacts.hullEnvelope.15.position.y` | 0.7735357559918759 | m | E (`contacts`) |
| `contacts.hullEnvelope.15.radius` | 0.15 | m | E (`contacts`) |
| `contacts.hullEnvelope.15.reference.x` | 1.6 | m | E (`contacts`) |
| `contacts.hullEnvelope.15.reference.y` | 0.92 | m | E (`contacts`) |
| `contacts.hullEnvelope.16.position.x` | 2.2975368751752683 | m | E (`contacts`) |
| `contacts.hullEnvelope.16.position.y` | 0.49947377279089644 | m | E (`contacts`) |
| `contacts.hullEnvelope.16.radius` | 0.15 | m | E (`contacts`) |
| `contacts.hullEnvelope.16.reference.x` | 2.35 | m | E (`contacts`) |
| `contacts.hullEnvelope.16.reference.y` | 0.64 | m | E (`contacts`) |
| `contacts.hullEnvelope.17.position.x` | 2.8829179606750066 | m | E (`contacts`) |
| `contacts.hullEnvelope.17.position.y` | 0.20583592135001266 | m | E (`contacts`) |
| `contacts.hullEnvelope.17.radius` | 0.15 | m | E (`contacts`) |
| `contacts.hullEnvelope.17.reference.x` | 2.95 | m | E (`contacts`) |
| `contacts.hullEnvelope.17.reference.y` | 0.34 | m | E (`contacts`) |
| `contacts.hullEnvelope.18.position.x` | -3.35 | m | E (`contacts`) |
| `contacts.hullEnvelope.18.position.y` | -0.63 | m | E (`contacts`) |
| `contacts.hullEnvelope.18.radius` | 0.15 | m | E (`contacts`) |
| `contacts.hullEnvelope.18.reference.x` | -3.5 | m | E (`contacts`) |
| `contacts.hullEnvelope.18.reference.y` | -0.63 | m | E (`contacts`) |
| `contacts.hullEnvelope.19.position.x` | -3.35 | m | E (`contacts`) |
| `contacts.hullEnvelope.19.position.y` | 0 | m | E (`contacts`) |
| `contacts.hullEnvelope.19.radius` | 0.15 | m | E (`contacts`) |
| `contacts.hullEnvelope.19.reference.x` | -3.5 | m | E (`contacts`) |
| `contacts.hullEnvelope.19.reference.y` | 0 | m | E (`contacts`) |
| `contacts.hullEnvelope.20.position.x` | -3.35 | m | E (`contacts`) |
| `contacts.hullEnvelope.20.position.y` | 0.63 | m | E (`contacts`) |
| `contacts.hullEnvelope.20.radius` | 0.15 | m | E (`contacts`) |
| `contacts.hullEnvelope.20.reference.x` | -3.5 | m | E (`contacts`) |
| `contacts.hullEnvelope.20.reference.y` | 0.63 | m | E (`contacts`) |
| `contacts.hullEnvelope.21.position.x` | 3.45 | m | E (`contacts`) |
| `contacts.hullEnvelope.21.position.y` | 0 | m | E (`contacts`) |
| `contacts.hullEnvelope.21.radius` | 0.15 | m | E (`contacts`) |
| `contacts.hullEnvelope.21.reference.x` | 3.6 | m | E (`contacts`) |
| `contacts.hullEnvelope.21.reference.y` | 0 | m | E (`contacts`) |
| `deckHardware.cleats.0.position.x` | 2.768695048315003 | m | E (`deckHardware`) |
| `deckHardware.cleats.0.position.y` | -0.35239009663000603 | m | E (`deckHardware`) |
| `deckHardware.cleats.0.position.z` | 0.9275 | m | E (`deckHardware`) |
| `deckHardware.cleats.0.attachment.x` | 2.8 | m | E (`deckHardware`) |
| `deckHardware.cleats.0.attachment.y` | -0.41500000000000015 | m | E (`deckHardware`) |
| `deckHardware.cleats.0.attachment.z` | 0.8875 | m | E (`deckHardware`) |
| `deckHardware.cleats.1.position.x` | -2.9371552020827982 | m | E (`deckHardware`) |
| `deckHardware.cleats.1.position.y` | -0.9991885825864179 | m | E (`deckHardware`) |
| `deckHardware.cleats.1.position.z` | 0.796 | m | E (`deckHardware`) |
| `deckHardware.cleats.1.attachment.x` | -2.95 | m | E (`deckHardware`) |
| `deckHardware.cleats.1.attachment.y` | -1.068 | m | E (`deckHardware`) |
| `deckHardware.cleats.1.attachment.z` | 0.756 | m | E (`deckHardware`) |
| `deckHardware.cleats.2.position.x` | 2.768695048315003 | m | E (`deckHardware`) |
| `deckHardware.cleats.2.position.y` | 0.35239009663000603 | m | E (`deckHardware`) |
| `deckHardware.cleats.2.position.z` | 0.9275 | m | E (`deckHardware`) |
| `deckHardware.cleats.2.attachment.x` | 2.8 | m | E (`deckHardware`) |
| `deckHardware.cleats.2.attachment.y` | 0.41500000000000015 | m | E (`deckHardware`) |
| `deckHardware.cleats.2.attachment.z` | 0.8875 | m | E (`deckHardware`) |
| `deckHardware.cleats.3.position.x` | -2.9371552020827982 | m | E (`deckHardware`) |
| `deckHardware.cleats.3.position.y` | 0.9991885825864179 | m | E (`deckHardware`) |
| `deckHardware.cleats.3.position.z` | 0.796 | m | E (`deckHardware`) |
| `deckHardware.cleats.3.attachment.x` | -2.95 | m | E (`deckHardware`) |
| `deckHardware.cleats.3.attachment.y` | 1.068 | m | E (`deckHardware`) |
| `deckHardware.cleats.3.attachment.z` | 0.756 | m | E (`deckHardware`) |
| `mooring.maxLength` | 15 | m | E (`mooring`) |
| `mooring.maximumLinesPerBoatCleat` | 2 | 1 | E (`mooring`) |
| `mooring.maximumHaulInducedSpeed` | 0.1028888 | m/s | E (`mooring`) |
| `mooring.humanPullForce` | 200 | N | E (`mooring`) |
| `mooring.haulInRate` | 1 | m/s | E (`mooring`) |
| `mooring.payOutRate` | 1.2 | m/s | E (`mooring`) |
| `mooring.tautTolerance` | 0.02 | m | E (`mooring`) |
| `mooring.solverTolerance` | 0.001 | m | E (`mooring`) |
| `mooring.solverIterations` | 8 | 1 | E (`mooring`) |
| `mooring.elasticity.workingStrain` | 0.15 | 1 | E (`mooring`) |
| `mooring.elasticity.workingLoadN` | 6000 | N | E (`mooring`) |
| `mooring.elasticity.dampingRatio` | 0.35 | 1 | E (`mooring`) |
| `mooring.elasticity.hardeningGain` | 8 | 1 | E (`mooring`) |
| `mooring.elasticity.maximumStrain` | 0.2 | 1 | E (`mooring`) |

## Qualification et essais utilisateur

Voir [le rapport commun](four-vessel-validation.md) et les résultats bruts associés. Les invariants et trajectoires vérifient la cohérence du modèle ; les références SO36i/Dufour ne constituent pas des mesures de ce bateau. Les paramètres estimés sont soumis à une sensibilité séparée à ±20 %, avec limites géométriques signalées.

Sélectionner le bateau dans « Profil du bateau ». Le changement réinitialise commandes et mouvement, conserve le port et mémorise le choix. Replacer le bateau si le scénario est incompatible avec son gabarit. La silhouette procédurale et les formes immergées affichées sont provisoires. La validation utilisateur porte sur les comportements ; le GLB spécifique appartient à la phase 2 encore non autorisée.
