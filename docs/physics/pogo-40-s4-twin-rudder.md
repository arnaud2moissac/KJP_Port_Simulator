# Pogo 40 S4 — fiche de profil physique

Profil `pogo-40-s4-twin-rudder-experimental`, version `1.1.2`, schéma 5, moteur 6.0.0. **Plausible mais non calibré.**

## Configuration, sources et arbitrages

Pogo 40 S4 de première génération, brochure chantier 2021 : longueur de coque 12,19 m, largeur 4,42 m, tirant 3,00 m, poids publié 4500 kg, ballasts 750 L et moteur diesel Lombardini 30 cv. La page chantier confirme deux safrans relevables ; tous deux sont abaissés dans KJP. Les S4 V2 et le bateau de Vincent Riou à monosafran/quille à volet sont exclus.

Les 4500 kg sont aussi décrits comme poids de jauge dans la page chantier ; ils ne sont pas une masse de manœuvre mesurée. Charge hypothétique : 4500 + 150 kg personnes + 25 kg eau portable + 21 kg gazole + 180 kg effets/consommables supplémentaires = 4876 kg, arrondi à 4880 kg. Les équipements fixes/de jauge ne sont pas ajoutés une seconde fois. Ballasts vides, sans sous-système de remplissage.

La brochure documente **30 cv Lombardini**, mais ni référence exacte du moteur, ni réduction, ni hélice. La fiche actuelle LDW1003 SD annonce 19,5 kW/27 hp : elle n'est donc pas assimilée sans preuve au moteur du S4 2021. KJP conserve les 30 cv publiés (22,065 kW) et représente une chaîne centrale équivalente ; 3600 tr/min, réduction 2,40, rotation droite et bipale sont des hypothèses E. Aucun montage sail-drive précis n'est revendiqué. Pas de repli d'hélice simulé.

Safrans distincts à y=±1,74 m, chacun 0,49 m² / 1,10 m, géométrie E. Leur écart au jet central est supérieur au rayon du jet même avec la corde tournée à ±35° ; aucune source de jet n'est liée. Les forces propres, le recouvrement nul et les bandes sont vérifiés séparément. La quille est profonde, sans dérive ni foil supplémentaire. LOA de calcul prise égale à la longueur de coque hors bout-dehors : la longueur réelle avec espar reste une donnée visuelle à préciser en phase 2.

## Inventaire de charge additionnelle

Hypothèse E, masse en kg. Cet inventaire décrit une charge de simulation, sans prétendre reproduire le manifeste d’une unité réelle. Les personnes, l’eau et le gazole sont comptés séparément dans le calcul précédent ; les équipements fixes déjà compris dans le poids publié ne sont pas ajoutés. Pour le Pogo, les équipements réglementaires de jauge ne sont pas recomptés.

| Équipement mobile additionnel | Masse, kg |
|---|---:|
| Effets personnels et sacs de transport | 50 |
| Avitaillement hors eau portable | 50 |
| Consommables et rechanges mobiles supplémentaires | 30 |
| Outillage mobile supplémentaire | 20 |
| Amarrage de convoyage transporté | 30 |
| **Total** | **180** |

L’inclusion exacte des équipements dans le poids de référence reste incertaine ; cette limite est conservée dans l’incertitude de chargement. Aucun détail de cet inventaire n’est présenté comme une donnée constructeur.

## Repère, méthode et limites

Unités SI ; x positif vers l’avant, y positif vers tribord, z positif vers le haut, flottaison z=0. Origine au CG longitudinal supposé, transverse symétrique ; incertitude de position du CG ±0,20 m pour les petits et ±0,35 m pour les grands. `centerOfGravity` n’est pas consommé par la matrice : aucune compensation de forces n’est ajoutée.

Carène nue représentée par onze sections propres. Les profondeurs individuelles stockées sont documentaires : le moteur emploie `canoeDraft × (0,46 + 0,54 × shape)`. Les masses ajoutées sway/yaw ne sont pas réglables séparément et les appendices n’y contribuent pas directement. La géométrie de coque ne constitue pas une intégration hydrostatique validée du déplacement.

Le rayon de giration est un prior E propre à la répartition longitudinale supposée, pas une mesure ni une similitude dimensionnelle du SO36i. La résistance longitudinale est un prior E indépendant : `R(u)=a u+b u|u|+montée de vague`. À 1 m/s, hors montée de vague, le coefficient effectif rapporté à la surface mouillée vaut `2(a+b)/(1025 S) = 0.00900`. Ce calcul explicite l’ordre de grandeur du choix, sans en faire une valeur constructeur ou une mesure. Linéaire, quadratique et seuil de Froude restent à calibrer séparément contre des essais propres au bateau.

Les coefficients sans dimension de foil et de fardage sont des priors génériques estimés, non des coefficients mesurés de cette coque. Les tables quatre quadrants sont générées avec des entrées propres explicites ; les constantes du générateur représentent sa structure commune, pas une hélice certifiée. Inerties moteur/arbre, courbe de couple et délais d’embrayage sont des priors mécaniques ; la courbe de puissance ne remplace pas une courbe constructeur complète.

Fardage : franc-bord intégré sur le rail propre ; roof, bôme et gréement décomposés en panneaux estimés, voiles affalées/enroulées, sans capote/bimini. La hauteur influence le vent local, sans roulis. Contacts 2D : enveloppe tangentielle estimée, défenses cylindriques ; raideurs et charges de travail sont des choix d’équipements pédagogiques E. Une ligne polyester équivalente travaille à 15 % d’allongement ; effort humain 200 N commun, non proportionnel au déplacement. Aucun paramètre n’a été calibré sur une trajectoire réelle dans cette version.

Domaine : bateau à plat, eau profonde (hypothèse h/T ≥ 4), 0–4 nd surface. Hors modèle : vagues, gîte, émergence des safrans, faible profondeur, berge, squat, interaction entre appendices et repli d’hélice. Les cas de vent dont un panneau dépasse 20 nd apparents sont signalés hors plage de référence ; aucune mesure tronquée n’est interprétée comme zéro.

## Masse et inertie calculées

| Grandeur | Valeur | Unité |
|---|---:|---|
| surge | 4880.000 | kg |
| sway | 4880.000 | kg |
| yaw | 42468.200 | kg·m² |
| added.surge | 268.400 | kg |
| added.sway | 1645.179 | kg |
| added.swayYaw | -1672.170 | kg·m |
| added.yaw | 14502.757 | kg·m² |

Matrice effective : `[[5148.4,0,0],[0,6525.179231039793,-1672.1698046570527],[0,-1672.1698046570527,56970.956721756185]]`. Les valeurs sont issues du moteur inchangé.

## Provenance par famille

A constructeur/architecte ; B documentation technique ; C calcul ; D littérature applicable ; E estimation ; F calibration. Une famille couvre ses feuilles numériques sauf chemin plus précis. Les incertitudes sont relatives, sauf mention contraire.

| Chemin | Classe | Incertitude | Source et méthode |
|---|---|---:|---|
| `geometry` | E / estimated | 0.25 | docs/physics/pogo-40-s4-twin-rudder.md ;  ; Contour propre estimé depuis les dessins publiés ; sections de carène nue sans quille ; cf. fiche et tableau intégral |
| `mass` | E / estimated | 0.2 | docs/physics/pogo-40-s4-twin-rudder.md ;  ; Chargement inventorié ; rayon de giration propre ; masse ajoutée sectionnelle équivalente |
| `hull` | E / estimated | 0.3 | docs/physics/pogo-40-s4-twin-rudder.md ;  ; Prior indépendant de coque à déplacement ; résistance déduite de surface mouillée/vitesse de Froude, non mesurée |
| `appendages` | E / estimated | 0.25 | docs/physics/pogo-40-s4-twin-rudder.md ;  ; Géométrie plane estimée sur plan ; polarité générique, aucune interaction quille-safran |
| `propulsors` | E / estimated | 0.25 | docs/physics/pogo-40-s4-twin-rudder.md ;  ; Géométrie hélice et transmission estimées sauf chemins officiels ci-dessous ; tables quatre quadrants et dynamique mécanique comme priors non calibrés |
| `rudders` | E / estimated | 0.25 | docs/physics/pogo-40-s4-twin-rudder.md ;  ; Surfaces et centres équivalents à plat ; polaires de littérature et dynamique de barre estimée ; jet déterminé par géométrie |
| `steering` | E / estimated | 0.25 | Réglage KJP demandé : vitesse maximale de 100°/s pour chaque safran ; estimation non calibrée sur essai réel |
| `aerodynamics` | E / estimated | 0.25 | docs/physics/pogo-40-s4-twin-rudder.md ;  ; Franc-bord intégré sur contour versionné ; roof, bôme et gréement propres estimés ; coefficients de corps non profilés |
| `contacts` | E / estimated | 0.25 | docs/physics/pogo-40-s4-twin-rudder.md ;  ; Enveloppe tangentielle propre ; raideurs de défenses correspondant au gabarit ; loi KJP inchangée |
| `deckHardware` | E / estimated | 0.15 | docs/physics/pogo-40-s4-twin-rudder.md ;  ; Points fonctionnels estimés depuis plan de pont ; attaches 7 cm en dedans du rail |
| `mooring` | E / estimated | 0.25 | docs/physics/pogo-40-s4-twin-rudder.md ;  ; Polyester équivalent dimensionné par charge de travail propre ; effort humain 200 N et solveur KJP communs |
| `geometry.loa` | A / official | 0.03 | https://www.pogostructures.com/wp-content/uploads/2021/01/01-POGO40s4-DOCUMENTATION.pdf ; Brochure 2021 p.1 : 12,19 m, 4,42 m, 3 m, 4500 kg, 30 cv Lombardini ; deux safrans ; Valeur constructeur ; définition et variante conservées dans la fiche |
| `geometry.beam` | A / official | 0.03 | https://www.pogostructures.com/wp-content/uploads/2021/01/01-POGO40s4-DOCUMENTATION.pdf ; Brochure 2021 p.1 : 12,19 m, 4,42 m, 3 m, 4500 kg, 30 cv Lombardini ; deux safrans ; Valeur constructeur ; définition et variante conservées dans la fiche |
| `geometry.draft` | A / official | 0.03 | https://www.pogostructures.com/wp-content/uploads/2021/01/01-POGO40s4-DOCUMENTATION.pdf ; Brochure 2021 p.1 : 12,19 m, 4,42 m, 3 m, 4500 kg, 30 cv Lombardini ; deux safrans ; Valeur constructeur ; définition et variante conservées dans la fiche |
| `mass.lightDisplacement` | E / estimated | 0.08 | https://www.pogostructures.com/wp-content/uploads/2021/01/01-POGO40s4-DOCUMENTATION.pdf ; Brochure 2021 p.1 : 12,19 m, 4,42 m, 3 m, 4500 kg, 30 cv Lombardini ; deux safrans ; Poids publié 4500 kg, également désigné poids de jauge ; emploi comme référence légère avec état exact incertain |
| `mass.displacement` | C / estimated | 0.08 | docs/physics/pogo-40-s4-twin-rudder.md ;  ; Somme explicite du déplacement de référence, personnes, liquides et charge additionnelle ; arrondi documenté |
| `mass.yawRadius` | E / estimated | 0.2 | docs/physics/pogo-40-s4-twin-rudder.md ;  ; Prior de répartition longitudinale propre ; inertie rigide m*k², aucune copie dimensionnelle |
| `mass.addedMassModel` | E / estimated | 0.25 | https://fossen.biz/html/marineCraftModel.html ;  ; Coefficients numériques estimés ; cadre de masse ajoutée de Fossen et modèle sectionnel KJP ; surge indépendant, sway/yaw couplés depuis carène nue, sans masse ajoutée des appendices |
| `hull.crossFlow.linearDampingFroude` | E / estimated | 0.2 | https://fossen.biz/html/marineCraftModel.html ;  ; Valeur estimée de régularisation KJP, non issue du document Fossen ; vitesse équivalente Fr*sqrt(g*LWL) |
| `propulsors.0.engine.powerKw` | A / official | 0.03 | https://www.pogostructures.com/wp-content/uploads/2021/01/01-POGO40s4-DOCUMENTATION.pdf ; Brochure 2021 p.1 : 12,19 m, 4,42 m, 3 m, 4500 kg, 30 cv Lombardini ; deux safrans ; Puissance publiée du moteur ; 30 cv Pogo et 8 cv YS8 convertis à 0,7355 kW/cv |

Les éventuels regroupements A d’unités converties conservent les valeurs publiées et la conversion dans la méthode. Les dimensions non indiquées dans une source principale restent des estimations ou des données techniques secondaires dans les arbitrages ci-dessus.

## Valeurs numériques effectivement compilées

Ce tableau décrit le profil source, avant aplatissement de compilation ; les valeurs 1 sont sans dimension ou des comptages. Il comprend les stations, équipements, hélice et coefficients dérivés. Il évite qu’une valeur cachée soit présentée comme une donnée constructeur.

| Chemin | Valeur | Unité | Classe de provenance |
|---|---:|---|---|
| `geometry.loa` | 12.19 | m | A (`geometry.loa`) |
| `geometry.lwl` | 10.9 | m | E (`geometry`) |
| `geometry.lpp` | 10.65 | m | E (`geometry`) |
| `geometry.beam` | 4.42 | m | A (`geometry.beam`) |
| `geometry.draft` | 3 | m | A (`geometry.draft`) |
| `geometry.canoeDraft` | 0.46 | m | E (`geometry`) |
| `geometry.wettedArea` | 29.5 | m² | E (`geometry`) |
| `geometry.gunwale.0.x` | -6 | m | E (`geometry`) |
| `geometry.gunwale.0.halfBeam` | 1.83 | m | E (`geometry`) |
| `geometry.gunwale.0.z` | 0.97 | m | E (`geometry`) |
| `geometry.gunwale.1.x` | -5 | m | E (`geometry`) |
| `geometry.gunwale.1.halfBeam` | 2.08 | m | E (`geometry`) |
| `geometry.gunwale.1.z` | 0.93 | m | E (`geometry`) |
| `geometry.gunwale.2.x` | -3.8 | m | E (`geometry`) |
| `geometry.gunwale.2.halfBeam` | 2.2 | m | E (`geometry`) |
| `geometry.gunwale.2.z` | 0.9 | m | E (`geometry`) |
| `geometry.gunwale.3.x` | -2.5 | m | E (`geometry`) |
| `geometry.gunwale.3.halfBeam` | 2.21 | m | E (`geometry`) |
| `geometry.gunwale.3.z` | 0.91 | m | E (`geometry`) |
| `geometry.gunwale.4.x` | -1 | m | E (`geometry`) |
| `geometry.gunwale.4.halfBeam` | 2.16 | m | E (`geometry`) |
| `geometry.gunwale.4.z` | 0.96 | m | E (`geometry`) |
| `geometry.gunwale.5.x` | 0.5 | m | E (`geometry`) |
| `geometry.gunwale.5.halfBeam` | 2.05 | m | E (`geometry`) |
| `geometry.gunwale.5.z` | 1.05 | m | E (`geometry`) |
| `geometry.gunwale.6.x` | 2 | m | E (`geometry`) |
| `geometry.gunwale.6.halfBeam` | 1.9 | m | E (`geometry`) |
| `geometry.gunwale.6.z` | 1.18 | m | E (`geometry`) |
| `geometry.gunwale.7.x` | 3.2 | m | E (`geometry`) |
| `geometry.gunwale.7.halfBeam` | 1.7 | m | E (`geometry`) |
| `geometry.gunwale.7.z` | 1.3 | m | E (`geometry`) |
| `geometry.gunwale.8.x` | 4.2 | m | E (`geometry`) |
| `geometry.gunwale.8.halfBeam` | 1.36 | m | E (`geometry`) |
| `geometry.gunwale.8.z` | 1.42 | m | E (`geometry`) |
| `geometry.gunwale.9.x` | 5 | m | E (`geometry`) |
| `geometry.gunwale.9.halfBeam` | 0.94 | m | E (`geometry`) |
| `geometry.gunwale.9.z` | 1.52 | m | E (`geometry`) |
| `geometry.gunwale.10.x` | 5.65 | m | E (`geometry`) |
| `geometry.gunwale.10.halfBeam` | 0.48 | m | E (`geometry`) |
| `geometry.gunwale.10.z` | 1.6 | m | E (`geometry`) |
| `geometry.gunwale.11.x` | 6.19 | m | E (`geometry`) |
| `geometry.gunwale.11.halfBeam` | 0 | m | E (`geometry`) |
| `geometry.gunwale.11.z` | 1.65 | m | E (`geometry`) |
| `geometry.hullSections.0.x` | -4.954545454545455 | m | E (`geometry`) |
| `geometry.hullSections.0.dx` | 0.990909090909091 | m | E (`geometry`) |
| `geometry.hullSections.0.breadthFactor` | 0.94 | 1 | E (`geometry`) |
| `geometry.hullSections.0.immersedDepth` | 0.44509600000000005 | m | E (`geometry`) |
| `geometry.hullSections.0.shape` | 0.94 | 1 | E (`geometry`) |
| `geometry.hullSections.1.x` | -3.963636363636364 | m | E (`geometry`) |
| `geometry.hullSections.1.dx` | 0.990909090909091 | m | E (`geometry`) |
| `geometry.hullSections.1.breadthFactor` | 1 | 1 | E (`geometry`) |
| `geometry.hullSections.1.immersedDepth` | 0.46 | m | E (`geometry`) |
| `geometry.hullSections.1.shape` | 1 | 1 | E (`geometry`) |
| `geometry.hullSections.2.x` | -2.9727272727272727 | m | E (`geometry`) |
| `geometry.hullSections.2.dx` | 0.990909090909091 | m | E (`geometry`) |
| `geometry.hullSections.2.breadthFactor` | 0.99 | 1 | E (`geometry`) |
| `geometry.hullSections.2.immersedDepth` | 0.4575160000000001 | m | E (`geometry`) |
| `geometry.hullSections.2.shape` | 0.99 | 1 | E (`geometry`) |
| `geometry.hullSections.3.x` | -1.981818181818182 | m | E (`geometry`) |
| `geometry.hullSections.3.dx` | 0.990909090909091 | m | E (`geometry`) |
| `geometry.hullSections.3.breadthFactor` | 0.97 | 1 | E (`geometry`) |
| `geometry.hullSections.3.immersedDepth` | 0.452548 | m | E (`geometry`) |
| `geometry.hullSections.3.shape` | 0.97 | 1 | E (`geometry`) |
| `geometry.hullSections.4.x` | -0.9909090909090912 | m | E (`geometry`) |
| `geometry.hullSections.4.dx` | 0.990909090909091 | m | E (`geometry`) |
| `geometry.hullSections.4.breadthFactor` | 0.92 | 1 | E (`geometry`) |
| `geometry.hullSections.4.immersedDepth` | 0.4401280000000001 | m | E (`geometry`) |
| `geometry.hullSections.4.shape` | 0.92 | 1 | E (`geometry`) |
| `geometry.hullSections.5.x` | 0 | m | E (`geometry`) |
| `geometry.hullSections.5.dx` | 0.990909090909091 | m | E (`geometry`) |
| `geometry.hullSections.5.breadthFactor` | 0.85 | 1 | E (`geometry`) |
| `geometry.hullSections.5.immersedDepth` | 0.42274000000000006 | m | E (`geometry`) |
| `geometry.hullSections.5.shape` | 0.85 | 1 | E (`geometry`) |
| `geometry.hullSections.6.x` | 0.9909090909090912 | m | E (`geometry`) |
| `geometry.hullSections.6.dx` | 0.990909090909091 | m | E (`geometry`) |
| `geometry.hullSections.6.breadthFactor` | 0.75 | 1 | E (`geometry`) |
| `geometry.hullSections.6.immersedDepth` | 0.39790000000000003 | m | E (`geometry`) |
| `geometry.hullSections.6.shape` | 0.75 | 1 | E (`geometry`) |
| `geometry.hullSections.7.x` | 1.9818181818181824 | m | E (`geometry`) |
| `geometry.hullSections.7.dx` | 0.990909090909091 | m | E (`geometry`) |
| `geometry.hullSections.7.breadthFactor` | 0.61 | 1 | E (`geometry`) |
| `geometry.hullSections.7.immersedDepth` | 0.36312400000000006 | m | E (`geometry`) |
| `geometry.hullSections.7.shape` | 0.61 | 1 | E (`geometry`) |
| `geometry.hullSections.8.x` | 2.9727272727272736 | m | E (`geometry`) |
| `geometry.hullSections.8.dx` | 0.990909090909091 | m | E (`geometry`) |
| `geometry.hullSections.8.breadthFactor` | 0.43 | 1 | E (`geometry`) |
| `geometry.hullSections.8.immersedDepth` | 0.31841200000000003 | m | E (`geometry`) |
| `geometry.hullSections.8.shape` | 0.43 | 1 | E (`geometry`) |
| `geometry.hullSections.9.x` | 3.963636363636364 | m | E (`geometry`) |
| `geometry.hullSections.9.dx` | 0.990909090909091 | m | E (`geometry`) |
| `geometry.hullSections.9.breadthFactor` | 0.25 | 1 | E (`geometry`) |
| `geometry.hullSections.9.immersedDepth` | 0.2737 | m | E (`geometry`) |
| `geometry.hullSections.9.shape` | 0.25 | 1 | E (`geometry`) |
| `geometry.hullSections.10.x` | 4.954545454545454 | m | E (`geometry`) |
| `geometry.hullSections.10.dx` | 0.990909090909091 | m | E (`geometry`) |
| `geometry.hullSections.10.breadthFactor` | 0.1 | 1 | E (`geometry`) |
| `geometry.hullSections.10.immersedDepth` | 0.23644 | m | E (`geometry`) |
| `geometry.hullSections.10.shape` | 0.1 | 1 | E (`geometry`) |
| `mass.lightDisplacement` | 4500 | kg | E (`mass.lightDisplacement`) |
| `mass.displacement` | 4880 | kg | C (`mass.displacement`) |
| `mass.centerOfGravity.x` | 0 | m | E (`mass`) |
| `mass.centerOfGravity.y` | 0 | m | E (`mass`) |
| `mass.yawRadius` | 2.95 | m | E (`mass.yawRadius`) |
| `mass.addedMassModel.surgeMassRatio` | 0.055 | 1 | E (`mass.addedMassModel`) |
| `mass.addedMassModel.sectionalScale` | 0.3 | 1 | E (`mass.addedMassModel`) |
| `hull.axialResistance.surgeLinear` | 72 | N·s/m | E (`hull`) |
| `hull.axialResistance.surgeQuadratic` | 64 | N·s²/m² | E (`hull`) |
| `hull.axialResistance.waveRise` | 27 | N·s²/m² | E (`hull`) |
| `hull.axialResistance.waveOnset` | 2.2 | m/s | E (`hull`) |
| `hull.crossFlow.cd` | 1.05 | 1 | E (`hull`) |
| `hull.crossFlow.areaFactor` | 0.66 | 1 | E (`hull`) |
| `hull.crossFlow.linearDampingFroude` | 0.018 | 1 | E (`hull.crossFlow.linearDampingFroude`) |
| `appendages.0.position.x` | -0.3 | m | E (`appendages`) |
| `appendages.0.position.y` | 0 | m | E (`appendages`) |
| `appendages.0.position.z` | -1.68 | m | E (`appendages`) |
| `appendages.0.area` | 2.45 | m² | E (`appendages`) |
| `appendages.0.span` | 2.54 | m | E (`appendages`) |
| `appendages.0.aspectRatio` | 2.63 | 1 | E (`appendages`) |
| `appendages.0.coefficients.efficiency` | 0.8 | 1 | E (`appendages`) |
| `appendages.0.coefficients.cd0` | 0.015 | 1 | E (`appendages`) |
| `appendages.0.coefficients.normalCd90` | 1.14 | 1 | E (`appendages`) |
| `appendages.0.coefficients.stallStartDeg` | 24 | ° | E (`appendages`) |
| `appendages.0.coefficients.stallEndDeg` | 52 | ° | E (`appendages`) |
| `propulsors.0.position.x` | -3.6 | m | E (`propulsors`) |
| `propulsors.0.position.y` | 0 | m | E (`propulsors`) |
| `propulsors.0.position.z` | -0.69 | m | E (`propulsors`) |
| `propulsors.0.axis.x` | 1 | 1 | E (`propulsors`) |
| `propulsors.0.axis.y` | 0 | 1 | E (`propulsors`) |
| `propulsors.0.engine.powerKw` | 22.065 | kW | A (`propulsors.0.engine.powerKw`) |
| `propulsors.0.engine.idleRpm` | 850 | tr/min | E (`propulsors`) |
| `propulsors.0.engine.maxRpm` | 3600 | tr/min | E (`propulsors`) |
| `propulsors.0.engine.dynamics.inertiaKgM2` | 0.136803 | kg·m² | E (`propulsors`) |
| `propulsors.0.engine.dynamics.frictionNm` | 3.2191076677124486 | N·m | E (`propulsors`) |
| `propulsors.0.engine.dynamics.governorKpNmPerRadS` | 1.463230758051113 | N·m·s/rad | E (`propulsors`) |
| `propulsors.0.engine.dynamics.governorKiNmPerRad` | 0.9004496972622233 | N·m/rad | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.0.rpm` | 850 | tr/min | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.0.torqueNm` | 42.141045831872056 | N·m | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.1.rpm` | 1500 | tr/min | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.1.torqueNm` | 56.18806110916274 | N·m | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.2.rpm` | 2200 | tr/min | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.2.torqueNm` | 64.38215335424897 | N·m | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.3.rpm` | 2800 | tr/min | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.3.torqueNm` | 62.04098414136719 | N·m | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.4.rpm` | 3600 | tr/min | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.4.torqueNm` | 58.52923032204452 | N·m | E (`propulsors`) |
| `propulsors.0.gearbox.ratioAhead` | 2.4 | 1 | E (`propulsors`) |
| `propulsors.0.gearbox.ratioAstern` | 2.4 | 1 | E (`propulsors`) |
| `propulsors.0.gearbox.efficiency` | 0.94 | 1 | E (`propulsors`) |
| `propulsors.0.gearbox.clutch.capacityEngineNm` | 96.57323003137346 | N·m | E (`propulsors`) |
| `propulsors.0.gearbox.clutch.stiffnessNmPerRadS` | 0.82 | N·m·s/rad | E (`propulsors`) |
| `propulsors.0.gearbox.clutch.disengageTimeS` | 0.12 | s | E (`propulsors`) |
| `propulsors.0.gearbox.clutch.neutralDwellS` | 0.18 | s | E (`propulsors`) |
| `propulsors.0.gearbox.clutch.engageTimeS` | 0.36 | s | E (`propulsors`) |
| `propulsors.0.propeller.diameter` | 0.38 | m | E (`propulsors`) |
| `propulsors.0.propeller.pitch` | 0.28 | m | E (`propulsors`) |
| `propulsors.0.propeller.blades` | 2 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.expandedAreaRatio` | 0.38 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.shaft.inertiaKgM2` | 0.012 | kg·m² | E (`propulsors`) |
| `propulsors.0.propeller.shaft.viscousFrictionNmPerRadS` | 0.018 | N·m·s/rad | E (`propulsors`) |
| `propulsors.0.propeller.shaft.coulombFrictionNm` | 0.18 | N·m | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.sampleCount` | 32 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.betaOriginRad` | -3.141592653589793 | rad | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.0` | -0.05453342760219228 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.1` | -0.060435714604121005 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.2` | -0.05508663518428979 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.3` | -0.039300538194842236 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.4` | -0.015480713801096127 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.5` | 0.012746485660246484 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.6` | 0.041083724951396415 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.7` | 0.06521691626799005 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.8` | 0.081472 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.9` | 0.1023610284189671 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.10` | 0.11974894406411125 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.11` | 0.13098859440030708 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.12` | 0.13436884455155285 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.13` | 0.12937508207436527 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.14` | 0.11676756203732658 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.15` | 0.09846566507862219 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.16` | 0.07725568910310572 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.17` | 0.05016497395689816 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.18` | 0.015116148715824874 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.19` | -0.02255492069555275 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.20` | -0.057113155448447125 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.21` | -0.08329737757290817 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.22` | -0.09712127661105122 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.23` | -0.09648028924827601 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.24` | -0.081472 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.25` | -0.06936802627083082 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.26` | -0.057056196094732864 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.27` | -0.046410874008998654 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.28` | -0.03905271380109614 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.29` | -0.03610192866079012 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.30` | -0.03800774887675827 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.31` | -0.04448003059742274 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.0` | -0.01510214873778904 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.1` | -0.014852178646824279 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.2` | -0.012800932041017057 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.3` | -0.009260692621504737 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.4` | -0.004770429747557805 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.5` | -0.000013745237400379423 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.6` | 0.004285198811748526 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.7` | 0.007471927138430848 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.8` | 0.009061289242673423 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.9` | 0.009905064903501595 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.10` | 0.010968542677192623 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.11` | 0.012089817713152066 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.12` | 0.01309818605153862 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.13` | 0.013840132753714677 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.14` | 0.014202703160037532 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.15` | 0.014130699212853459 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.16` | 0.013635082860403817 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.17` | 0.012101557626372895 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.18` | 0.00907383925299829 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.19` | 0.005012870416290885 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.20` | 0.0005368968088651988 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.21` | -0.003672655162349993 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.22` | -0.006974919369420804 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.23` | -0.008867156021920312 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.24` | -0.009061289242673423 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.25` | -0.008621509760435431 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.26` | -0.008708515766559075 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.27` | -0.009309061385323433 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.28` | -0.01033171899023123 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.29` | -0.011620798231349526 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.30` | -0.012980048479750466 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.31` | -0.014202536206749213 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.uncertainty` | 0.25 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.safety.maximumThrustCoefficient` | 2.2 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.safety.maximumTorqueCoefficient` | 0.12 | 1 | E (`propulsors`) |
| `propulsors.0.transverseWalk.base` | 0.025 | 1 | E (`propulsors`) |
| `propulsors.0.transverseWalk.gain` | 0.105 | 1 | E (`propulsors`) |
| `rudders.0.position.x` | -5.85 | m | E (`rudders`) |
| `rudders.0.position.y` | -1.74 | m | E (`rudders`) |
| `rudders.0.position.z` | -0.77 | m | E (`rudders`) |
| `rudders.0.area` | 0.49 | m² | E (`rudders`) |
| `rudders.0.span` | 1.1 | m | E (`rudders`) |
| `rudders.0.aspectRatio` | 2.47 | 1 | E (`rudders`) |
| `rudders.0.coefficients.efficiency` | 0.77 | 1 | E (`rudders`) |
| `rudders.0.coefficients.cd0` | 0.022 | 1 | E (`rudders`) |
| `rudders.0.coefficients.normalCd90` | 1.12 | 1 | E (`rudders`) |
| `rudders.0.coefficients.stallStartDeg` | 24 | ° | E (`rudders`) |
| `rudders.0.coefficients.stallEndDeg` | 52 | ° | E (`rudders`) |
| `rudders.0.axis.x` | 0 | 1 | E (`rudders`) |
| `rudders.0.axis.y` | 0 | 1 | E (`rudders`) |
| `rudders.0.axis.z` | 1 | 1 | E (`rudders`) |
| `rudders.0.stock.chordFraction` | 0.2 | 1 | E (`rudders`) |
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
| `rudders.1.position.x` | -5.85 | m | E (`rudders`) |
| `rudders.1.position.y` | 1.74 | m | E (`rudders`) |
| `rudders.1.position.z` | -0.77 | m | E (`rudders`) |
| `rudders.1.area` | 0.49 | m² | E (`rudders`) |
| `rudders.1.span` | 1.1 | m | E (`rudders`) |
| `rudders.1.aspectRatio` | 2.47 | 1 | E (`rudders`) |
| `rudders.1.coefficients.efficiency` | 0.77 | 1 | E (`rudders`) |
| `rudders.1.coefficients.cd0` | 0.022 | 1 | E (`rudders`) |
| `rudders.1.coefficients.normalCd90` | 1.12 | 1 | E (`rudders`) |
| `rudders.1.coefficients.stallStartDeg` | 24 | ° | E (`rudders`) |
| `rudders.1.coefficients.stallEndDeg` | 52 | ° | E (`rudders`) |
| `rudders.1.axis.x` | 0 | 1 | E (`rudders`) |
| `rudders.1.axis.y` | 0 | 1 | E (`rudders`) |
| `rudders.1.axis.z` | 1 | 1 | E (`rudders`) |
| `rudders.1.stock.chordFraction` | 0.2 | 1 | E (`rudders`) |
| `rudders.1.maxAngleDeg` | 35 | ° | E (`rudders`) |
| `rudders.1.slipstream.stripCount` | 5 | 1 | E (`rudders`) |
| `rudders.1.slipstream.contractionRatio` | 0.86 | 1 | E (`rudders`) |
| `rudders.1.slipstream.downstreamVelocityFactor` | 0.55 | 1 | E (`rudders`) |
| `rudders.1.slipstream.upstreamVelocityFactor` | 0.24 | 1 | E (`rudders`) |
| `rudders.1.slipstream.swirlFraction` | 0.055 | 1 | E (`rudders`) |
| `rudders.1.slipstream.convectionTimeBoundsS.0` | 0.05 | s | E (`rudders`) |
| `rudders.1.slipstream.convectionTimeBoundsS.1` | 0.55 | s | E (`rudders`) |
| `rudders.1.slipstream.flowStraightening` | 0.92 | 1 | E (`rudders`) |
| `rudders.1.slipstream.momentumSafetyFactor` | 1.18 | 1 | E (`rudders`) |
| `aerodynamics.referenceWindHeight` | 10 | m | E (`aerodynamics`) |
| `aerodynamics.verticalProfile.exponent` | 0.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.verticalProfile.minimumVelocityFactor` | 0.82 | 1 | E (`aerodynamics`) |
| `aerodynamics.verticalProfile.maximumVelocityFactor` | 1.05 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.0.area` | 0.9792375860841943 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.0.normalBody.x` | -0.24253562503633297 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.0.normalBody.y` | 0.9701425001453319 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.0.center.x` | -5.503508771929825 | m | E (`aerodynamics`) |
| `aerodynamics.panels.0.center.y` | 1.9541228070175443 | m | E (`aerodynamics`) |
| `aerodynamics.panels.0.center.z` | 0.47507017543859653 | m | E (`aerodynamics`) |
| `aerodynamics.panels.0.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.0.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.0.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.1.area` | 0.9792375860841943 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.1.normalBody.x` | -0.24253562503633297 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.1.normalBody.y` | -0.9701425001453319 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.1.center.x` | -5.503508771929825 | m | E (`aerodynamics`) |
| `aerodynamics.panels.1.center.y` | -1.9541228070175443 | m | E (`aerodynamics`) |
| `aerodynamics.panels.1.center.z` | 0.47507017543859653 | m | E (`aerodynamics`) |
| `aerodynamics.panels.1.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.1.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.1.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.2.area` | 1.103476343199074 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.2.normalBody.x` | -0.099503719020999 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.2.normalBody.y` | 0.9950371902099893 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.2.center.x` | -4.40327868852459 | m | E (`aerodynamics`) |
| `aerodynamics.panels.2.center.y` | 2.139672131147541 | m | E (`aerodynamics`) |
| `aerodynamics.panels.2.center.z` | 0.45754098360655737 | m | E (`aerodynamics`) |
| `aerodynamics.panels.2.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.2.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.2.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.3.area` | 1.103476343199074 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.3.normalBody.x` | -0.099503719020999 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.3.normalBody.y` | -0.9950371902099893 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.3.center.x` | -4.40327868852459 | m | E (`aerodynamics`) |
| `aerodynamics.panels.3.center.y` | -2.139672131147541 | m | E (`aerodynamics`) |
| `aerodynamics.panels.3.center.z` | 0.45754098360655737 | m | E (`aerodynamics`) |
| `aerodynamics.panels.3.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.3.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.3.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.4.area` | 1.1765348071774162 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.4.normalBody.x` | -0.007692080119339052 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.4.normalBody.y` | 0.9999704155140979 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.4.center.x` | -3.1488029465930016 | m | E (`aerodynamics`) |
| `aerodynamics.panels.4.center.y` | 2.2050092081031307 | m | E (`aerodynamics`) |
| `aerodynamics.panels.4.center.z` | 0.4525046040515654 | m | E (`aerodynamics`) |
| `aerodynamics.panels.4.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.4.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.4.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.5.area` | 1.1765348071774162 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.5.normalBody.x` | -0.007692080119339052 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.5.normalBody.y` | -0.9999704155140979 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.5.center.x` | -3.1488029465930016 | m | E (`aerodynamics`) |
| `aerodynamics.panels.5.center.y` | -2.2050092081031307 | m | E (`aerodynamics`) |
| `aerodynamics.panels.5.center.z` | 0.4525046040515654 | m | E (`aerodynamics`) |
| `aerodynamics.panels.5.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.5.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.5.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.6.area` | 1.4032789503516399 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.6.normalBody.x` | 0.033314830232638364 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.6.normalBody.y` | 0.9994449069791544 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.6.center.x` | -1.7433155080213905 | m | E (`aerodynamics`) |
| `aerodynamics.panels.6.center.y` | 2.184777183600713 | m | E (`aerodynamics`) |
| `aerodynamics.panels.6.center.z` | 0.46761140819964353 | m | E (`aerodynamics`) |
| `aerodynamics.panels.6.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.6.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.6.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.7.area` | 1.4032789503516399 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.7.normalBody.x` | 0.033314830232638364 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.7.normalBody.y` | -0.9994449069791544 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.7.center.x` | -1.7433155080213905 | m | E (`aerodynamics`) |
| `aerodynamics.panels.7.center.y` | -2.184777183600713 | m | E (`aerodynamics`) |
| `aerodynamics.panels.7.center.z` | 0.46761140819964353 | m | E (`aerodynamics`) |
| `aerodynamics.panels.7.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.7.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.7.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.8.area` | 1.511548064899029 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.8.normalBody.x` | 0.07313693991423621 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.8.normalBody.y` | 0.9973219079214001 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.8.center.x` | -0.23880597014925378 | m | E (`aerodynamics`) |
| `aerodynamics.panels.8.center.y` | 2.104179104477612 | m | E (`aerodynamics`) |
| `aerodynamics.panels.8.center.z` | 0.5028358208955225 | m | E (`aerodynamics`) |
| `aerodynamics.panels.8.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.8.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.8.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.9.area` | 1.511548064899029 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.9.normalBody.x` | 0.07313693991423621 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.9.normalBody.y` | -0.9973219079214001 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.9.center.x` | -0.23880597014925378 | m | E (`aerodynamics`) |
| `aerodynamics.panels.9.center.y` | -2.104179104477612 | m | E (`aerodynamics`) |
| `aerodynamics.panels.9.center.z` | 0.5028358208955225 | m | E (`aerodynamics`) |
| `aerodynamics.panels.9.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.9.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.9.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.10.area` | 1.6808416976324687 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.10.normalBody.x` | 0.09950371902099886 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.10.normalBody.y` | 0.9950371902099893 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.10.center.x` | 1.2645739910313902 | m | E (`aerodynamics`) |
| `aerodynamics.panels.10.center.y` | 1.9735426008968606 | m | E (`aerodynamics`) |
| `aerodynamics.panels.10.center.z` | 0.5581315396113602 | m | E (`aerodynamics`) |
| `aerodynamics.panels.10.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.10.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.10.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.11.area` | 1.6808416976324687 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.11.normalBody.x` | 0.09950371902099886 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.11.normalBody.y` | -0.9950371902099893 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.11.center.x` | 1.2645739910313902 | m | E (`aerodynamics`) |
| `aerodynamics.panels.11.center.y` | -1.9735426008968606 | m | E (`aerodynamics`) |
| `aerodynamics.panels.11.center.z` | 0.5581315396113602 | m | E (`aerodynamics`) |
| `aerodynamics.panels.11.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.11.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.11.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.12.area` | 1.5085251075139585 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.12.normalBody.x` | 0.16439898730535724 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.12.normalBody.y` | 0.9863939238321439 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.12.center.x` | 2.6096774193548398 | m | E (`aerodynamics`) |
| `aerodynamics.panels.12.center.y` | 1.7983870967741935 | m | E (`aerodynamics`) |
| `aerodynamics.panels.12.center.z` | 0.620483870967742 | m | E (`aerodynamics`) |
| `aerodynamics.panels.12.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.12.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.12.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.13.area` | 1.5085251075139585 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.13.normalBody.x` | 0.16439898730535724 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.13.normalBody.y` | -0.9863939238321439 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.13.center.x` | 2.6096774193548398 | m | E (`aerodynamics`) |
| `aerodynamics.panels.13.center.y` | -1.7983870967741935 | m | E (`aerodynamics`) |
| `aerodynamics.panels.13.center.z` | 0.620483870967742 | m | E (`aerodynamics`) |
| `aerodynamics.panels.13.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.13.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.13.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.14.area` | 1.436458756804385 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.14.normalBody.x` | 0.3219027332387022 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.14.normalBody.y` | 0.9467727448197129 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.14.center.x` | 3.7073529411764707 | m | E (`aerodynamics`) |
| `aerodynamics.panels.14.center.y` | 1.5275 | m | E (`aerodynamics`) |
| `aerodynamics.panels.14.center.z` | 0.6804411764705883 | m | E (`aerodynamics`) |
| `aerodynamics.panels.14.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.14.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.14.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.15.area` | 1.436458756804385 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.15.normalBody.x` | 0.3219027332387022 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.15.normalBody.y` | -0.9467727448197129 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.15.center.x` | 3.7073529411764707 | m | E (`aerodynamics`) |
| `aerodynamics.panels.15.center.y` | -1.5275 | m | E (`aerodynamics`) |
| `aerodynamics.panels.15.center.z` | 0.6804411764705883 | m | E (`aerodynamics`) |
| `aerodynamics.panels.15.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.15.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.15.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.16.area` | 1.3282163829737985 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.16.normalBody.x` | 0.46483389898992056 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.16.normalBody.y` | 0.8853979028379433 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.16.center.x` | 4.60453514739229 | m | E (`aerodynamics`) |
| `aerodynamics.panels.16.center.y` | 1.1476190476190475 | m | E (`aerodynamics`) |
| `aerodynamics.panels.16.center.z` | 0.7352834467120181 | m | E (`aerodynamics`) |
| `aerodynamics.panels.16.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.16.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.16.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.17.area` | 1.3282163829737985 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.17.normalBody.x` | 0.46483389898992056 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.17.normalBody.y` | -0.8853979028379433 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.17.center.x` | 4.60453514739229 | m | E (`aerodynamics`) |
| `aerodynamics.panels.17.center.y` | -1.1476190476190475 | m | E (`aerodynamics`) |
| `aerodynamics.panels.17.center.z` | 0.7352834467120181 | m | E (`aerodynamics`) |
| `aerodynamics.panels.17.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.17.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.17.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.18.area` | 1.2422341808209922 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.18.normalBody.x` | 0.5776688575142398 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.18.normalBody.y` | 0.8162712117049045 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.18.center.x` | 5.3277777777777775 | m | E (`aerodynamics`) |
| `aerodynamics.panels.18.center.y` | 0.7080341880341877 | m | E (`aerodynamics`) |
| `aerodynamics.panels.18.center.z` | 0.7801709401709401 | m | E (`aerodynamics`) |
| `aerodynamics.panels.18.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.18.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.18.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.19.area` | 1.2422341808209922 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.19.normalBody.x` | 0.5776688575142398 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.19.normalBody.y` | -0.8162712117049045 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.19.center.x` | 5.3277777777777775 | m | E (`aerodynamics`) |
| `aerodynamics.panels.19.center.y` | -0.7080341880341877 | m | E (`aerodynamics`) |
| `aerodynamics.panels.19.center.z` | 0.7801709401709401 | m | E (`aerodynamics`) |
| `aerodynamics.panels.19.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.19.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.19.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.20.area` | 1.1740554714322489 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.20.normalBody.x` | 0.6643638388299197 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.20.normalBody.y` | 0.7474093186836597 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.20.center.x` | 5.921384615384616 | m | E (`aerodynamics`) |
| `aerodynamics.panels.20.center.y` | 0.23876923076923073 | m | E (`aerodynamics`) |
| `aerodynamics.panels.20.center.z` | 0.8125641025641027 | m | E (`aerodynamics`) |
| `aerodynamics.panels.20.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.20.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.20.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.21.area` | 1.1740554714322489 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.21.normalBody.x` | 0.6643638388299197 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.21.normalBody.y` | -0.7474093186836597 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.21.center.x` | 5.921384615384616 | m | E (`aerodynamics`) |
| `aerodynamics.panels.21.center.y` | -0.23876923076923073 | m | E (`aerodynamics`) |
| `aerodynamics.panels.21.center.z` | 0.8125641025641027 | m | E (`aerodynamics`) |
| `aerodynamics.panels.21.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.21.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.21.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.22.area` | 2.1 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.22.normalBody.x` | -0.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.22.normalBody.y` | 0.997 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.22.center.x` | -1.3 | m | E (`aerodynamics`) |
| `aerodynamics.panels.22.center.y` | 0.86 | m | E (`aerodynamics`) |
| `aerodynamics.panels.22.center.z` | 1.55 | m | E (`aerodynamics`) |
| `aerodynamics.panels.22.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.22.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.22.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.23.area` | 2.1 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.23.normalBody.x` | -0.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.23.normalBody.y` | -0.997 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.23.center.x` | -1.3 | m | E (`aerodynamics`) |
| `aerodynamics.panels.23.center.y` | -0.86 | m | E (`aerodynamics`) |
| `aerodynamics.panels.23.center.z` | 1.55 | m | E (`aerodynamics`) |
| `aerodynamics.panels.23.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.23.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.23.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.24.area` | 1.45 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.24.normalBody.x` | 0.14 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.24.normalBody.y` | 0.99 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.24.center.x` | 0.9 | m | E (`aerodynamics`) |
| `aerodynamics.panels.24.center.y` | 0.7 | m | E (`aerodynamics`) |
| `aerodynamics.panels.24.center.z` | 1.62 | m | E (`aerodynamics`) |
| `aerodynamics.panels.24.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.24.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.24.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.25.area` | 1.45 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.25.normalBody.x` | 0.14 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.25.normalBody.y` | -0.99 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.25.center.x` | 0.9 | m | E (`aerodynamics`) |
| `aerodynamics.panels.25.center.y` | -0.7 | m | E (`aerodynamics`) |
| `aerodynamics.panels.25.center.z` | 1.62 | m | E (`aerodynamics`) |
| `aerodynamics.panels.25.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.25.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.25.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.26.area` | 1.22 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.26.normalBody.x` | 0 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.26.normalBody.y` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.26.center.x` | -0.9 | m | E (`aerodynamics`) |
| `aerodynamics.panels.26.center.y` | 0.16 | m | E (`aerodynamics`) |
| `aerodynamics.panels.26.center.z` | 2.8 | m | E (`aerodynamics`) |
| `aerodynamics.panels.26.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.26.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.26.exposure` | 0.92 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.27.area` | 1.22 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.27.normalBody.x` | 0 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.27.normalBody.y` | -1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.27.center.x` | -0.9 | m | E (`aerodynamics`) |
| `aerodynamics.panels.27.center.y` | -0.16 | m | E (`aerodynamics`) |
| `aerodynamics.panels.27.center.z` | 2.8 | m | E (`aerodynamics`) |
| `aerodynamics.panels.27.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.27.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.27.exposure` | 0.92 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.28.area` | 2.8 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.28.normalBody.x` | 0 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.28.normalBody.y` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.28.center.x` | -0.3 | m | E (`aerodynamics`) |
| `aerodynamics.panels.28.center.y` | 0 | m | E (`aerodynamics`) |
| `aerodynamics.panels.28.center.z` | 7.1 | m | E (`aerodynamics`) |
| `aerodynamics.panels.28.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.28.cdTangential` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.28.exposure` | 0.95 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.29.area` | 3.5502000000000002 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.29.normalBody.x` | -1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.29.normalBody.y` | 0 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.29.center.x` | -6 | m | E (`aerodynamics`) |
| `aerodynamics.panels.29.center.y` | 0 | m | E (`aerodynamics`) |
| `aerodynamics.panels.29.center.z` | 0.485 | m | E (`aerodynamics`) |
| `aerodynamics.panels.29.cdNormal` | 1.02 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.29.cdTangential` | 0.04 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.29.exposure` | 0.96 | 1 | E (`aerodynamics`) |
| `contacts.fenderRadius` | 0.18 | m | E (`contacts`) |
| `contacts.hullRadius` | 0.22 | m | E (`contacts`) |
| `contacts.fenderStiffness` | 42000 | N/m | E (`contacts`) |
| `contacts.hullStiffness` | 86000 | N/m | E (`contacts`) |
| `contacts.dampingRatio` | 0.82 | 1 | E (`contacts`) |
| `contacts.friction` | 0.3 | 1 | E (`contacts`) |
| `contacts.hullFriction` | 0.3 | 1 | E (`contacts`) |
| `contacts.fenderFriction` | 0.03 | 1 | E (`contacts`) |
| `contacts.forceLimit` | 85000 | N | E (`contacts`) |
| `contacts.fenders.0.position.x` | 3.9047234646505795 | m | E (`contacts`) |
| `contacts.fenders.0.position.y` | -1.6399513666193513 | m | E (`contacts`) |
| `contacts.fenders.0.position.z` | 0.33999999999999997 | m | E (`contacts`) |
| `contacts.fenders.0.attachment.x` | 3.85 | m | E (`contacts`) |
| `contacts.fenders.0.attachment.y` | -1.479 | m | E (`contacts`) |
| `contacts.fenders.0.attachment.z` | 1.378 | m | E (`contacts`) |
| `contacts.fenders.0.preload` | 0.01 | m | E (`contacts`) |
| `contacts.fenders.1.position.x` | -0.3875667202145799 | m | E (`contacts`) |
| `contacts.fenders.1.position.y` | -2.285544724346638 | m | E (`contacts`) |
| `contacts.fenders.1.position.z` | 0.33999999999999997 | m | E (`contacts`) |
| `contacts.fenders.1.attachment.x` | -0.4 | m | E (`contacts`) |
| `contacts.fenders.1.attachment.y` | -2.116 | m | E (`contacts`) |
| `contacts.fenders.1.attachment.z` | 0.996 | m | E (`contacts`) |
| `contacts.fenders.1.preload` | 0.01 | m | E (`contacts`) |
| `contacts.fenders.2.position.x` | -4.566915632233569 | m | E (`contacts`) |
| `contacts.fenders.2.position.y` | -2.294156322335698 | m | E (`contacts`) |
| `contacts.fenders.2.position.z` | 0.33999999999999997 | m | E (`contacts`) |
| `contacts.fenders.2.attachment.x` | -4.55 | m | E (`contacts`) |
| `contacts.fenders.2.attachment.y` | -2.125 | m | E (`contacts`) |
| `contacts.fenders.2.attachment.z` | 0.9187500000000001 | m | E (`contacts`) |
| `contacts.fenders.2.preload` | 0.01 | m | E (`contacts`) |
| `contacts.fenders.3.position.x` | 3.9047234646505795 | m | E (`contacts`) |
| `contacts.fenders.3.position.y` | 1.6399513666193513 | m | E (`contacts`) |
| `contacts.fenders.3.position.z` | 0.33999999999999997 | m | E (`contacts`) |
| `contacts.fenders.3.attachment.x` | 3.85 | m | E (`contacts`) |
| `contacts.fenders.3.attachment.y` | 1.479 | m | E (`contacts`) |
| `contacts.fenders.3.attachment.z` | 1.378 | m | E (`contacts`) |
| `contacts.fenders.3.preload` | 0.01 | m | E (`contacts`) |
| `contacts.fenders.4.position.x` | -0.3875667202145799 | m | E (`contacts`) |
| `contacts.fenders.4.position.y` | 2.285544724346638 | m | E (`contacts`) |
| `contacts.fenders.4.position.z` | 0.33999999999999997 | m | E (`contacts`) |
| `contacts.fenders.4.attachment.x` | -0.4 | m | E (`contacts`) |
| `contacts.fenders.4.attachment.y` | 2.116 | m | E (`contacts`) |
| `contacts.fenders.4.attachment.z` | 0.996 | m | E (`contacts`) |
| `contacts.fenders.4.preload` | 0.01 | m | E (`contacts`) |
| `contacts.fenders.5.position.x` | -4.566915632233569 | m | E (`contacts`) |
| `contacts.fenders.5.position.y` | 2.294156322335698 | m | E (`contacts`) |
| `contacts.fenders.5.position.z` | 0.33999999999999997 | m | E (`contacts`) |
| `contacts.fenders.5.attachment.x` | -4.55 | m | E (`contacts`) |
| `contacts.fenders.5.attachment.y` | 2.125 | m | E (`contacts`) |
| `contacts.fenders.5.attachment.z` | 0.9187500000000001 | m | E (`contacts`) |
| `contacts.fenders.5.preload` | 0.01 | m | E (`contacts`) |
| `contacts.hullEnvelope.0.position.x` | -5.946642162492007 | m | E (`contacts`) |
| `contacts.hullEnvelope.0.position.y` | -1.616568649968027 | m | E (`contacts`) |
| `contacts.hullEnvelope.0.radius` | 0.22 | m | E (`contacts`) |
| `contacts.hullEnvelope.0.reference.x` | -6 | m | E (`contacts`) |
| `contacts.hullEnvelope.0.reference.y` | -1.83 | m | E (`contacts`) |
| `contacts.hullEnvelope.1.position.x` | -4.946642162492007 | m | E (`contacts`) |
| `contacts.hullEnvelope.1.position.y` | -1.866568649968027 | m | E (`contacts`) |
| `contacts.hullEnvelope.1.radius` | 0.22 | m | E (`contacts`) |
| `contacts.hullEnvelope.1.reference.x` | -5 | m | E (`contacts`) |
| `contacts.hullEnvelope.1.reference.y` | -2.08 | m | E (`contacts`) |
| `contacts.hullEnvelope.2.position.x` | -3.7781091818153802 | m | E (`contacts`) |
| `contacts.hullEnvelope.2.position.y` | -1.9810918181538026 | m | E (`contacts`) |
| `contacts.hullEnvelope.2.radius` | 0.22 | m | E (`contacts`) |
| `contacts.hullEnvelope.2.reference.x` | -3.8 | m | E (`contacts`) |
| `contacts.hullEnvelope.2.reference.y` | -2.2 | m | E (`contacts`) |
| `contacts.hullEnvelope.3.position.x` | -2.498307742373745 | m | E (`contacts`) |
| `contacts.hullEnvelope.3.position.y` | -1.9900065085868985 | m | E (`contacts`) |
| `contacts.hullEnvelope.3.radius` | 0.22 | m | E (`contacts`) |
| `contacts.hullEnvelope.3.reference.x` | -2.5 | m | E (`contacts`) |
| `contacts.hullEnvelope.3.reference.y` | -2.21 | m | E (`contacts`) |
| `contacts.hullEnvelope.4.position.x` | -1.0073292626511805 | m | E (`contacts`) |
| `contacts.hullEnvelope.4.position.y` | -1.9401221204645862 | m | E (`contacts`) |
| `contacts.hullEnvelope.4.radius` | 0.22 | m | E (`contacts`) |
| `contacts.hullEnvelope.4.reference.x` | -1 | m | E (`contacts`) |
| `contacts.hullEnvelope.4.reference.y` | -2.16 | m | E (`contacts`) |
| `contacts.hullEnvelope.5.position.x` | 0.483909873218868 | m | E (`contacts`) |
| `contacts.hullEnvelope.5.position.y` | -1.8305891802572918 | m | E (`contacts`) |
| `contacts.hullEnvelope.5.radius` | 0.22 | m | E (`contacts`) |
| `contacts.hullEnvelope.5.reference.x` | 0.5 | m | E (`contacts`) |
| `contacts.hullEnvelope.5.reference.y` | -2.05 | m | E (`contacts`) |
| `contacts.hullEnvelope.6.position.x` | 1.9781091818153802 | m | E (`contacts`) |
| `contacts.hullEnvelope.6.position.y` | -1.6810918181538024 | m | E (`contacts`) |
| `contacts.hullEnvelope.6.radius` | 0.22 | m | E (`contacts`) |
| `contacts.hullEnvelope.6.reference.x` | 2 | m | E (`contacts`) |
| `contacts.hullEnvelope.6.reference.y` | -1.9 | m | E (`contacts`) |
| `contacts.hullEnvelope.7.position.x` | 3.1638322227928217 | m | E (`contacts`) |
| `contacts.hullEnvelope.7.position.y` | -1.4829933367569283 | m | E (`contacts`) |
| `contacts.hullEnvelope.7.radius` | 0.22 | m | E (`contacts`) |
| `contacts.hullEnvelope.7.reference.x` | 3.2 | m | E (`contacts`) |
| `contacts.hullEnvelope.7.reference.y` | -1.7 | m | E (`contacts`) |
| `contacts.hullEnvelope.8.position.x` | 4.129181398687486 | m | E (`contacts`) |
| `contacts.hullEnvelope.8.position.y` | -1.1517099961396633 | m | E (`contacts`) |
| `contacts.hullEnvelope.8.radius` | 0.22 | m | E (`contacts`) |
| `contacts.hullEnvelope.8.reference.x` | 4.2 | m | E (`contacts`) |
| `contacts.hullEnvelope.8.reference.y` | -1.36 | m | E (`contacts`) |
| `contacts.hullEnvelope.9.position.x` | 4.897736542222217 | m | E (`contacts`) |
| `contacts.hullEnvelope.9.position.y` | -0.7452124613756523 | m | E (`contacts`) |
| `contacts.hullEnvelope.9.radius` | 0.22 | m | E (`contacts`) |
| `contacts.hullEnvelope.9.reference.x` | 5 | m | E (`contacts`) |
| `contacts.hullEnvelope.9.reference.y` | -0.94 | m | E (`contacts`) |
| `contacts.hullEnvelope.10.position.x` | -5.946642162492007 | m | E (`contacts`) |
| `contacts.hullEnvelope.10.position.y` | 1.616568649968027 | m | E (`contacts`) |
| `contacts.hullEnvelope.10.radius` | 0.22 | m | E (`contacts`) |
| `contacts.hullEnvelope.10.reference.x` | -6 | m | E (`contacts`) |
| `contacts.hullEnvelope.10.reference.y` | 1.83 | m | E (`contacts`) |
| `contacts.hullEnvelope.11.position.x` | -4.946642162492007 | m | E (`contacts`) |
| `contacts.hullEnvelope.11.position.y` | 1.866568649968027 | m | E (`contacts`) |
| `contacts.hullEnvelope.11.radius` | 0.22 | m | E (`contacts`) |
| `contacts.hullEnvelope.11.reference.x` | -5 | m | E (`contacts`) |
| `contacts.hullEnvelope.11.reference.y` | 2.08 | m | E (`contacts`) |
| `contacts.hullEnvelope.12.position.x` | -3.7781091818153802 | m | E (`contacts`) |
| `contacts.hullEnvelope.12.position.y` | 1.9810918181538026 | m | E (`contacts`) |
| `contacts.hullEnvelope.12.radius` | 0.22 | m | E (`contacts`) |
| `contacts.hullEnvelope.12.reference.x` | -3.8 | m | E (`contacts`) |
| `contacts.hullEnvelope.12.reference.y` | 2.2 | m | E (`contacts`) |
| `contacts.hullEnvelope.13.position.x` | -2.498307742373745 | m | E (`contacts`) |
| `contacts.hullEnvelope.13.position.y` | 1.9900065085868985 | m | E (`contacts`) |
| `contacts.hullEnvelope.13.radius` | 0.22 | m | E (`contacts`) |
| `contacts.hullEnvelope.13.reference.x` | -2.5 | m | E (`contacts`) |
| `contacts.hullEnvelope.13.reference.y` | 2.21 | m | E (`contacts`) |
| `contacts.hullEnvelope.14.position.x` | -1.0073292626511805 | m | E (`contacts`) |
| `contacts.hullEnvelope.14.position.y` | 1.9401221204645862 | m | E (`contacts`) |
| `contacts.hullEnvelope.14.radius` | 0.22 | m | E (`contacts`) |
| `contacts.hullEnvelope.14.reference.x` | -1 | m | E (`contacts`) |
| `contacts.hullEnvelope.14.reference.y` | 2.16 | m | E (`contacts`) |
| `contacts.hullEnvelope.15.position.x` | 0.483909873218868 | m | E (`contacts`) |
| `contacts.hullEnvelope.15.position.y` | 1.8305891802572918 | m | E (`contacts`) |
| `contacts.hullEnvelope.15.radius` | 0.22 | m | E (`contacts`) |
| `contacts.hullEnvelope.15.reference.x` | 0.5 | m | E (`contacts`) |
| `contacts.hullEnvelope.15.reference.y` | 2.05 | m | E (`contacts`) |
| `contacts.hullEnvelope.16.position.x` | 1.9781091818153802 | m | E (`contacts`) |
| `contacts.hullEnvelope.16.position.y` | 1.6810918181538024 | m | E (`contacts`) |
| `contacts.hullEnvelope.16.radius` | 0.22 | m | E (`contacts`) |
| `contacts.hullEnvelope.16.reference.x` | 2 | m | E (`contacts`) |
| `contacts.hullEnvelope.16.reference.y` | 1.9 | m | E (`contacts`) |
| `contacts.hullEnvelope.17.position.x` | 3.1638322227928217 | m | E (`contacts`) |
| `contacts.hullEnvelope.17.position.y` | 1.4829933367569283 | m | E (`contacts`) |
| `contacts.hullEnvelope.17.radius` | 0.22 | m | E (`contacts`) |
| `contacts.hullEnvelope.17.reference.x` | 3.2 | m | E (`contacts`) |
| `contacts.hullEnvelope.17.reference.y` | 1.7 | m | E (`contacts`) |
| `contacts.hullEnvelope.18.position.x` | 4.129181398687486 | m | E (`contacts`) |
| `contacts.hullEnvelope.18.position.y` | 1.1517099961396633 | m | E (`contacts`) |
| `contacts.hullEnvelope.18.radius` | 0.22 | m | E (`contacts`) |
| `contacts.hullEnvelope.18.reference.x` | 4.2 | m | E (`contacts`) |
| `contacts.hullEnvelope.18.reference.y` | 1.36 | m | E (`contacts`) |
| `contacts.hullEnvelope.19.position.x` | 4.897736542222217 | m | E (`contacts`) |
| `contacts.hullEnvelope.19.position.y` | 0.7452124613756523 | m | E (`contacts`) |
| `contacts.hullEnvelope.19.radius` | 0.22 | m | E (`contacts`) |
| `contacts.hullEnvelope.19.reference.x` | 5 | m | E (`contacts`) |
| `contacts.hullEnvelope.19.reference.y` | 0.94 | m | E (`contacts`) |
| `contacts.hullEnvelope.20.position.x` | -5.78 | m | E (`contacts`) |
| `contacts.hullEnvelope.20.position.y` | -1.61 | m | E (`contacts`) |
| `contacts.hullEnvelope.20.radius` | 0.22 | m | E (`contacts`) |
| `contacts.hullEnvelope.20.reference.x` | -6 | m | E (`contacts`) |
| `contacts.hullEnvelope.20.reference.y` | -1.61 | m | E (`contacts`) |
| `contacts.hullEnvelope.21.position.x` | -5.78 | m | E (`contacts`) |
| `contacts.hullEnvelope.21.position.y` | 0 | m | E (`contacts`) |
| `contacts.hullEnvelope.21.radius` | 0.22 | m | E (`contacts`) |
| `contacts.hullEnvelope.21.reference.x` | -6 | m | E (`contacts`) |
| `contacts.hullEnvelope.21.reference.y` | 0 | m | E (`contacts`) |
| `contacts.hullEnvelope.22.position.x` | -5.78 | m | E (`contacts`) |
| `contacts.hullEnvelope.22.position.y` | 1.61 | m | E (`contacts`) |
| `contacts.hullEnvelope.22.radius` | 0.22 | m | E (`contacts`) |
| `contacts.hullEnvelope.22.reference.x` | -6 | m | E (`contacts`) |
| `contacts.hullEnvelope.22.reference.y` | 1.61 | m | E (`contacts`) |
| `contacts.hullEnvelope.23.position.x` | 5.970000000000001 | m | E (`contacts`) |
| `contacts.hullEnvelope.23.position.y` | 0 | m | E (`contacts`) |
| `contacts.hullEnvelope.23.radius` | 0.22 | m | E (`contacts`) |
| `contacts.hullEnvelope.23.reference.x` | 6.19 | m | E (`contacts`) |
| `contacts.hullEnvelope.23.reference.y` | 0 | m | E (`contacts`) |
| `deckHardware.cleats.0.position.x` | 4.717461627070706 | m | E (`deckHardware`) |
| `deckHardware.cleats.0.position.y` | -1.009272146801344 | m | E (`deckHardware`) |
| `deckHardware.cleats.0.position.z` | 1.52875 | m | E (`deckHardware`) |
| `deckHardware.cleats.0.attachment.x` | 4.75 | m | E (`deckHardware`) |
| `deckHardware.cleats.0.attachment.y` | -1.07125 | m | E (`deckHardware`) |
| `deckHardware.cleats.0.attachment.z` | 1.48875 | m | E (`deckHardware`) |
| `deckHardware.cleats.1.position.x` | -0.2551195857939965 | m | E (`deckHardware`) |
| `deckHardware.cleats.1.position.y` | -2.035187466445502 | m | E (`deckHardware`) |
| `deckHardware.cleats.1.position.z` | 1.045 | m | E (`deckHardware`) |
| `deckHardware.cleats.1.attachment.x` | -0.25 | m | E (`deckHardware`) |
| `deckHardware.cleats.1.attachment.y` | -2.105 | m | E (`deckHardware`) |
| `deckHardware.cleats.1.attachment.z` | 1.005 | m | E (`deckHardware`) |
| `deckHardware.cleats.2.position.x` | -5.133022506247457 | m | E (`deckHardware`) |
| `deckHardware.cleats.2.position.y` | -1.9745900249898267 | m | E (`deckHardware`) |
| `deckHardware.cleats.2.position.z` | 0.9760000000000001 | m | E (`deckHardware`) |
| `deckHardware.cleats.2.attachment.x` | -5.15 | m | E (`deckHardware`) |
| `deckHardware.cleats.2.attachment.y` | -2.0425 | m | E (`deckHardware`) |
| `deckHardware.cleats.2.attachment.z` | 0.936 | m | E (`deckHardware`) |
| `deckHardware.cleats.3.position.x` | 4.717461627070706 | m | E (`deckHardware`) |
| `deckHardware.cleats.3.position.y` | 1.009272146801344 | m | E (`deckHardware`) |
| `deckHardware.cleats.3.position.z` | 1.52875 | m | E (`deckHardware`) |
| `deckHardware.cleats.3.attachment.x` | 4.75 | m | E (`deckHardware`) |
| `deckHardware.cleats.3.attachment.y` | 1.07125 | m | E (`deckHardware`) |
| `deckHardware.cleats.3.attachment.z` | 1.48875 | m | E (`deckHardware`) |
| `deckHardware.cleats.4.position.x` | -0.2551195857939965 | m | E (`deckHardware`) |
| `deckHardware.cleats.4.position.y` | 2.035187466445502 | m | E (`deckHardware`) |
| `deckHardware.cleats.4.position.z` | 1.045 | m | E (`deckHardware`) |
| `deckHardware.cleats.4.attachment.x` | -0.25 | m | E (`deckHardware`) |
| `deckHardware.cleats.4.attachment.y` | 2.105 | m | E (`deckHardware`) |
| `deckHardware.cleats.4.attachment.z` | 1.005 | m | E (`deckHardware`) |
| `deckHardware.cleats.5.position.x` | -5.133022506247457 | m | E (`deckHardware`) |
| `deckHardware.cleats.5.position.y` | 1.9745900249898267 | m | E (`deckHardware`) |
| `deckHardware.cleats.5.position.z` | 0.9760000000000001 | m | E (`deckHardware`) |
| `deckHardware.cleats.5.attachment.x` | -5.15 | m | E (`deckHardware`) |
| `deckHardware.cleats.5.attachment.y` | 2.0425 | m | E (`deckHardware`) |
| `deckHardware.cleats.5.attachment.z` | 0.936 | m | E (`deckHardware`) |
| `mooring.maxLength` | 22 | m | E (`mooring`) |
| `mooring.maximumLinesPerBoatCleat` | 2 | 1 | E (`mooring`) |
| `mooring.maximumHaulInducedSpeed` | 0.1028888 | m/s | E (`mooring`) |
| `mooring.humanPullForce` | 200 | N | E (`mooring`) |
| `mooring.haulInRate` | 1 | m/s | E (`mooring`) |
| `mooring.payOutRate` | 1.2 | m/s | E (`mooring`) |
| `mooring.tautTolerance` | 0.02 | m | E (`mooring`) |
| `mooring.solverTolerance` | 0.001 | m | E (`mooring`) |
| `mooring.solverIterations` | 8 | 1 | E (`mooring`) |
| `mooring.elasticity.workingStrain` | 0.15 | 1 | E (`mooring`) |
| `mooring.elasticity.workingLoadN` | 12000 | N | E (`mooring`) |
| `mooring.elasticity.dampingRatio` | 0.35 | 1 | E (`mooring`) |
| `mooring.elasticity.hardeningGain` | 8 | 1 | E (`mooring`) |
| `mooring.elasticity.maximumStrain` | 0.2 | 1 | E (`mooring`) |

## Qualification et essais utilisateur

Voir [le rapport commun](four-vessel-validation.md) et les résultats bruts associés. Les invariants et trajectoires vérifient la cohérence du modèle ; les références SO36i/Dufour ne constituent pas des mesures de ce bateau. Les paramètres estimés sont soumis à une sensibilité séparée à ±20 %, avec limites géométriques signalées.

Sélectionner le bateau dans « Profil du bateau ». Le changement réinitialise commandes et mouvement, conserve le port et mémorise le choix. Replacer le bateau si le scénario est incompatible avec son gabarit. La silhouette procédurale et les formes immergées affichées sont provisoires. La validation utilisateur porte sur les comportements ; le GLB spécifique appartient à la phase 2 encore non autorisée.
