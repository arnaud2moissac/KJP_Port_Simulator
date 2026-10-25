# Contessa 26 — fiche de profil physique

Profil `contessa-26-long-keel-experimental`, version `1.1.2`, schéma 5, moteur 6.0.0. **Plausible mais non calibré.**

## Configuration, sources et arbitrages

Variante britannique Maclan Marine, brochure tamponnée London 1979. La brochure p.3 donne 7,77 m / LWL 6,08 m / largeur 2,28 m / tirant 1,21 m / déplacement 2250 kg ; p.5 décrit Yanmar **YS8**, réduction 2:1, marche arrière, hélice fixe bipale, réservoir de trois gallons, barre franche et quatre taquets. Ces données ne sont pas mélangées à celles de la version canadienne.

Le manuel Yanmar YS8/YS12, p.43 (page PDF 46), indique 3200 tr/min et hélice tournant à gauche. La réduction 2:1 publiée par Maclan est conservée comme valeur arrondie ; le rapport arrière identique reste une hypothèse E. Le tableau moteur affiche 8/10 ch : la puissance basse de 8 ch, cohérente avec la brochure du bateau, est retenue (5,884 kW). Ralenti, courbe de couple, embrayage, inerties, diamètre et pas d'hélice restent estimés.

Charge : 2250 + 150 kg personnes + 27,28 kg eau (moitié du réservoir optionnel de 12 gallons impériaux) + 5,73 kg gazole + 70 kg équipement = 2503 kg, arrondi à 2500 kg. La condition du déplacement publié n'étant pas complètement définie, l'addition des charges constitue une hypothèse et non une pesée.

La quille est séparée de la carène nue. Son contour équivalent sous z=-0,40 m, estimé visuellement sur la coupe Maclan p.5, est (x,z) : (-3,15;-0,40), (-3,15;-1,00), (-2,25;-1,21), (-0,65;-1,21), (0,60;-0,95), (1,65;-0,65), (2,20;-0,40). Les sept bandes sont obtenues par découpe géométrique exacte de ce **contour estimé**. Aire et premiers moments sont conservés. L'AR global de l'appendice continu est utilisé dans chaque bande, sans fabriquer sept ailerons à grand allongement. Le test reconstruit sept puis quatorze bandes sur ce même contour.

Le safran reste un composant séparé, à l'arrière de la quille. Axe vertical 3-DOF équivalent ; absence d'interaction quille–safran, d'effet de masquage et de masse ajoutée propre de quille. Ces limites empêchent de revendiquer une reproduction instrumentée de la marche arrière.

## Inventaire de charge additionnelle

Hypothèse E, masse en kg. Cet inventaire décrit une charge de simulation, sans prétendre reproduire le manifeste d’une unité réelle. Les personnes, l’eau et le gazole sont comptés séparément dans le calcul précédent ; les équipements fixes déjà compris dans le poids publié ne sont pas ajoutés. Pour le Pogo, les équipements réglementaires de jauge ne sont pas recomptés.

| Équipement mobile additionnel | Masse, kg |
|---|---:|
| Effets personnels | 20 |
| Avitaillement hors eau du réservoir | 15 |
| Sécurité portable additionnelle | 15 |
| Outillage et rechanges mobiles | 10 |
| Amarrage additionnel transporté | 10 |
| **Total** | **70** |

L’inclusion exacte des équipements dans le poids de référence reste incertaine ; cette limite est conservée dans l’incertitude de chargement. Aucun détail de cet inventaire n’est présenté comme une donnée constructeur.

## Repère, méthode et limites

Unités SI ; x positif vers l’avant, y positif vers tribord, z positif vers le haut, flottaison z=0. Origine au CG longitudinal supposé, transverse symétrique ; incertitude de position du CG ±0,20 m pour les petits et ±0,35 m pour les grands. `centerOfGravity` n’est pas consommé par la matrice : aucune compensation de forces n’est ajoutée.

Carène nue représentée par onze sections propres. Les profondeurs individuelles stockées sont documentaires : le moteur emploie `canoeDraft × (0,46 + 0,54 × shape)`. Les masses ajoutées sway/yaw ne sont pas réglables séparément et les appendices n’y contribuent pas directement. La géométrie de coque ne constitue pas une intégration hydrostatique validée du déplacement.

Le rayon de giration est un prior E propre à la répartition longitudinale supposée, pas une mesure ni une similitude dimensionnelle du SO36i. La résistance longitudinale est un prior E indépendant : `R(u)=a u+b u|u|+montée de vague`. À 1 m/s, hors montée de vague, le coefficient effectif rapporté à la surface mouillée vaut `2(a+b)/(1025 S) = 0.01331`. Ce calcul explicite l’ordre de grandeur du choix, sans en faire une valeur constructeur ou une mesure. Linéaire, quadratique et seuil de Froude restent à calibrer séparément contre des essais propres au bateau.

Les coefficients sans dimension de foil et de fardage sont des priors génériques estimés, non des coefficients mesurés de cette coque. Les tables quatre quadrants sont générées avec des entrées propres explicites ; les constantes du générateur représentent sa structure commune, pas une hélice certifiée. Inerties moteur/arbre, courbe de couple et délais d’embrayage sont des priors mécaniques ; la courbe de puissance ne remplace pas une courbe constructeur complète.

Fardage : franc-bord intégré sur le rail propre ; roof, bôme et gréement décomposés en panneaux estimés, voiles affalées/enroulées, sans capote/bimini. La hauteur influence le vent local, sans roulis. Contacts 2D : enveloppe tangentielle estimée, défenses cylindriques ; raideurs et charges de travail sont des choix d’équipements pédagogiques E. Une ligne polyester équivalente travaille à 15 % d’allongement ; effort humain 200 N commun, non proportionnel au déplacement. Aucun paramètre n’a été calibré sur une trajectoire réelle dans cette version.

Domaine : bateau à plat, eau profonde (hypothèse h/T ≥ 4), 0–4 nd surface. Hors modèle : vagues, gîte, émergence des safrans, faible profondeur, berge, squat, interaction entre appendices et repli d’hélice. Les cas de vent dont un panneau dépasse 20 nd apparents sont signalés hors plage de référence ; aucune mesure tronquée n’est interprétée comme zéro.

## Masse et inertie calculées

| Grandeur | Valeur | Unité |
|---|---:|---|
| surge | 2500.000 | kg |
| sway | 2500.000 | kg |
| yaw | 7744.000 | kg·m² |
| added.surge | 212.500 | kg |
| added.sway | 853.207 | kg |
| added.swayYaw | -9.251 | kg·m |
| added.yaw | 1822.195 | kg·m² |

Matrice effective : `[[2712.5,0,0],[0,3353.206872892924,-9.251296286988378],[0,-9.251296286988378,9566.195358916031]]`. Les valeurs sont issues du moteur inchangé.

## Provenance par famille

A constructeur/architecte ; B documentation technique ; C calcul ; D littérature applicable ; E estimation ; F calibration. Une famille couvre ses feuilles numériques sauf chemin plus précis. Les incertitudes sont relatives, sauf mention contraire.

| Chemin | Classe | Incertitude | Source et méthode |
|---|---|---:|---|
| `geometry` | E / estimated | 0.25 | docs/physics/contessa-26-long-keel.md ;  ; Contour propre estimé depuis les dessins publiés ; sections de carène nue sans quille ; cf. fiche et tableau intégral |
| `mass` | E / estimated | 0.2 | docs/physics/contessa-26-long-keel.md ;  ; Chargement inventorié ; rayon de giration propre ; masse ajoutée sectionnelle équivalente |
| `hull` | E / estimated | 0.3 | docs/physics/contessa-26-long-keel.md ;  ; Prior indépendant de coque à déplacement ; résistance déduite de surface mouillée/vitesse de Froude, non mesurée |
| `appendages` | E / estimated | 0.25 | docs/physics/contessa-26-long-keel.md ;  ; Géométrie plane estimée sur plan ; polarité générique, aucune interaction quille-safran |
| `propulsors` | E / estimated | 0.25 | docs/physics/contessa-26-long-keel.md ;  ; Géométrie hélice et transmission estimées sauf chemins officiels ci-dessous ; tables quatre quadrants et dynamique mécanique comme priors non calibrés |
| `rudders` | E / estimated | 0.25 | docs/physics/contessa-26-long-keel.md ;  ; Surfaces et centres équivalents à plat ; polaires de littérature et dynamique de barre estimée ; jet déterminé par géométrie |
| `steering` | E / estimated | 0.25 | Réglage KJP demandé : vitesse maximale de 100°/s ; estimation non calibrée sur essai réel |
| `aerodynamics` | E / estimated | 0.25 | docs/physics/contessa-26-long-keel.md ;  ; Franc-bord intégré sur contour versionné ; roof, bôme et gréement propres estimés ; coefficients de corps non profilés |
| `contacts` | E / estimated | 0.25 | docs/physics/contessa-26-long-keel.md ;  ; Enveloppe tangentielle propre ; raideurs de défenses correspondant au gabarit ; loi KJP inchangée |
| `deckHardware` | E / estimated | 0.15 | docs/physics/contessa-26-long-keel.md ;  ; Points fonctionnels estimés depuis plan de pont ; attaches 7 cm en dedans du rail |
| `mooring` | E / estimated | 0.25 | docs/physics/contessa-26-long-keel.md ;  ; Polyester équivalent dimensionné par charge de travail propre ; effort humain 200 N et solveur KJP communs |
| `geometry.loa` | A / official | 0.03 | https://contessazeilers.com/wp-content/uploads/2015/04/contessa_26.pdf ; Maclan p.3 dimensions, p.5 plan et YS8 ; Valeur constructeur ; définition et variante conservées dans la fiche |
| `geometry.beam` | A / official | 0.03 | https://contessazeilers.com/wp-content/uploads/2015/04/contessa_26.pdf ; Maclan p.3 dimensions, p.5 plan et YS8 ; Valeur constructeur ; définition et variante conservées dans la fiche |
| `geometry.draft` | A / official | 0.03 | https://contessazeilers.com/wp-content/uploads/2015/04/contessa_26.pdf ; Maclan p.3 dimensions, p.5 plan et YS8 ; Valeur constructeur ; définition et variante conservées dans la fiche |
| `mass.lightDisplacement` | E / estimated | 0.08 | https://contessazeilers.com/wp-content/uploads/2015/04/contessa_26.pdf ; Maclan p.3 dimensions, p.5 plan et YS8 ; Déplacement constructeur 2250 kg ; condition de pesée non précisée, employé comme référence de chargement avec incertitude |
| `mass.displacement` | C / estimated | 0.08 | docs/physics/contessa-26-long-keel.md ;  ; Somme explicite du déplacement de référence, personnes, liquides et charge additionnelle ; arrondi documenté |
| `mass.yawRadius` | E / estimated | 0.2 | docs/physics/contessa-26-long-keel.md ;  ; Prior de répartition longitudinale propre ; inertie rigide m*k², aucune copie dimensionnelle |
| `mass.addedMassModel` | E / estimated | 0.25 | https://fossen.biz/html/marineCraftModel.html ;  ; Coefficients numériques estimés ; cadre de masse ajoutée de Fossen et modèle sectionnel KJP ; surge indépendant, sway/yaw couplés depuis carène nue, sans masse ajoutée des appendices |
| `hull.crossFlow.linearDampingFroude` | E / estimated | 0.2 | https://fossen.biz/html/marineCraftModel.html ;  ; Valeur estimée de régularisation KJP, non issue du document Fossen ; vitesse équivalente Fr*sqrt(g*LWL) |
| `propulsors.0.engine.powerKw` | A / official | 0.03 | https://www.sextan.com/wp-content/uploads/2019/02/manuel-yanmar-ys.pdf ; Spécifications moteur ; Puissance publiée du moteur ; 30 cv Pogo et 8 cv YS8 convertis à 0,7355 kW/cv |
| `propulsors.0.engine.maxRpm` | A / official | 0.01 | https://www.sextan.com/wp-content/uploads/2019/02/manuel-yanmar-ys.pdf ; p.43 (page PDF 46) ; YS8 3200 tr/min |
| `propulsors.0.rotation` | A / official | 0 | https://www.sextan.com/wp-content/uploads/2019/02/manuel-yanmar-ys.pdf ; p.43 (page PDF 46) ; Rotation hélice à gauche explicitement indiquée |
| `propulsors.0.gearbox.ratioAhead` | A / official | 0.03 | https://contessazeilers.com/wp-content/uploads/2015/04/contessa_26.pdf ; p.5 ; Rapport standard 2:1 ; valeur arrondie publiée |

Les éventuels regroupements A d’unités converties conservent les valeurs publiées et la conversion dans la méthode. Les dimensions non indiquées dans une source principale restent des estimations ou des données techniques secondaires dans les arbitrages ci-dessus.

## Valeurs numériques effectivement compilées

Ce tableau décrit le profil source, avant aplatissement de compilation ; les valeurs 1 sont sans dimension ou des comptages. Il comprend les stations, équipements, hélice et coefficients dérivés. Il évite qu’une valeur cachée soit présentée comme une donnée constructeur.

| Chemin | Valeur | Unité | Classe de provenance |
|---|---:|---|---|
| `geometry.loa` | 7.77 | m | A (`geometry.loa`) |
| `geometry.lwl` | 6.08 | m | E (`geometry`) |
| `geometry.lpp` | 5.95 | m | E (`geometry`) |
| `geometry.beam` | 2.28 | m | A (`geometry.beam`) |
| `geometry.draft` | 1.21 | m | A (`geometry.draft`) |
| `geometry.canoeDraft` | 0.4 | m | E (`geometry`) |
| `geometry.wettedArea` | 19.5 | m² | E (`geometry`) |
| `geometry.gunwale.0.x` | -3.75 | m | E (`geometry`) |
| `geometry.gunwale.0.halfBeam` | 0.32 | m | E (`geometry`) |
| `geometry.gunwale.0.z` | 0.72 | m | E (`geometry`) |
| `geometry.gunwale.1.x` | -3.2 | m | E (`geometry`) |
| `geometry.gunwale.1.halfBeam` | 0.62 | m | E (`geometry`) |
| `geometry.gunwale.1.z` | 0.68 | m | E (`geometry`) |
| `geometry.gunwale.2.x` | -2.5 | m | E (`geometry`) |
| `geometry.gunwale.2.halfBeam` | 0.88 | m | E (`geometry`) |
| `geometry.gunwale.2.z` | 0.64 | m | E (`geometry`) |
| `geometry.gunwale.3.x` | -1.6 | m | E (`geometry`) |
| `geometry.gunwale.3.halfBeam` | 1.08 | m | E (`geometry`) |
| `geometry.gunwale.3.z` | 0.61 | m | E (`geometry`) |
| `geometry.gunwale.4.x` | -0.6 | m | E (`geometry`) |
| `geometry.gunwale.4.halfBeam` | 1.14 | m | E (`geometry`) |
| `geometry.gunwale.4.z` | 0.6 | m | E (`geometry`) |
| `geometry.gunwale.5.x` | 0.4 | m | E (`geometry`) |
| `geometry.gunwale.5.halfBeam` | 1.1 | m | E (`geometry`) |
| `geometry.gunwale.5.z` | 0.62 | m | E (`geometry`) |
| `geometry.gunwale.6.x` | 1.4 | m | E (`geometry`) |
| `geometry.gunwale.6.halfBeam` | 0.94 | m | E (`geometry`) |
| `geometry.gunwale.6.z` | 0.67 | m | E (`geometry`) |
| `geometry.gunwale.7.x` | 2.25 | m | E (`geometry`) |
| `geometry.gunwale.7.halfBeam` | 0.69 | m | E (`geometry`) |
| `geometry.gunwale.7.z` | 0.74 | m | E (`geometry`) |
| `geometry.gunwale.8.x` | 2.95 | m | E (`geometry`) |
| `geometry.gunwale.8.halfBeam` | 0.41 | m | E (`geometry`) |
| `geometry.gunwale.8.z` | 0.83 | m | E (`geometry`) |
| `geometry.gunwale.9.x` | 3.55 | m | E (`geometry`) |
| `geometry.gunwale.9.halfBeam` | 0.13 | m | E (`geometry`) |
| `geometry.gunwale.9.z` | 0.91 | m | E (`geometry`) |
| `geometry.gunwale.10.x` | 4.02 | m | E (`geometry`) |
| `geometry.gunwale.10.halfBeam` | 0 | m | E (`geometry`) |
| `geometry.gunwale.10.z` | 0.96 | m | E (`geometry`) |
| `geometry.hullSections.0.x` | -2.7636363636363637 | m | E (`geometry`) |
| `geometry.hullSections.0.dx` | 0.5527272727272727 | m | E (`geometry`) |
| `geometry.hullSections.0.breadthFactor` | 0.23 | 1 | E (`geometry`) |
| `geometry.hullSections.0.immersedDepth` | 0.23368000000000003 | m | E (`geometry`) |
| `geometry.hullSections.0.shape` | 0.23 | 1 | E (`geometry`) |
| `geometry.hullSections.1.x` | -2.210909090909091 | m | E (`geometry`) |
| `geometry.hullSections.1.dx` | 0.5527272727272727 | m | E (`geometry`) |
| `geometry.hullSections.1.breadthFactor` | 0.46 | 1 | E (`geometry`) |
| `geometry.hullSections.1.immersedDepth` | 0.28336 | m | E (`geometry`) |
| `geometry.hullSections.1.shape` | 0.46 | 1 | E (`geometry`) |
| `geometry.hullSections.2.x` | -1.6581818181818182 | m | E (`geometry`) |
| `geometry.hullSections.2.dx` | 0.5527272727272727 | m | E (`geometry`) |
| `geometry.hullSections.2.breadthFactor` | 0.69 | 1 | E (`geometry`) |
| `geometry.hullSections.2.immersedDepth` | 0.33304 | m | E (`geometry`) |
| `geometry.hullSections.2.shape` | 0.69 | 1 | E (`geometry`) |
| `geometry.hullSections.3.x` | -1.1054545454545455 | m | E (`geometry`) |
| `geometry.hullSections.3.dx` | 0.5527272727272727 | m | E (`geometry`) |
| `geometry.hullSections.3.breadthFactor` | 0.86 | 1 | E (`geometry`) |
| `geometry.hullSections.3.immersedDepth` | 0.3697600000000001 | m | E (`geometry`) |
| `geometry.hullSections.3.shape` | 0.86 | 1 | E (`geometry`) |
| `geometry.hullSections.4.x` | -0.5527272727272727 | m | E (`geometry`) |
| `geometry.hullSections.4.dx` | 0.5527272727272727 | m | E (`geometry`) |
| `geometry.hullSections.4.breadthFactor` | 0.97 | 1 | E (`geometry`) |
| `geometry.hullSections.4.immersedDepth` | 0.39352000000000004 | m | E (`geometry`) |
| `geometry.hullSections.4.shape` | 0.97 | 1 | E (`geometry`) |
| `geometry.hullSections.5.x` | 0 | m | E (`geometry`) |
| `geometry.hullSections.5.dx` | 0.5527272727272727 | m | E (`geometry`) |
| `geometry.hullSections.5.breadthFactor` | 1 | 1 | E (`geometry`) |
| `geometry.hullSections.5.immersedDepth` | 0.4 | m | E (`geometry`) |
| `geometry.hullSections.5.shape` | 1 | 1 | E (`geometry`) |
| `geometry.hullSections.6.x` | 0.5527272727272727 | m | E (`geometry`) |
| `geometry.hullSections.6.dx` | 0.5527272727272727 | m | E (`geometry`) |
| `geometry.hullSections.6.breadthFactor` | 0.97 | 1 | E (`geometry`) |
| `geometry.hullSections.6.immersedDepth` | 0.39352000000000004 | m | E (`geometry`) |
| `geometry.hullSections.6.shape` | 0.97 | 1 | E (`geometry`) |
| `geometry.hullSections.7.x` | 1.1054545454545455 | m | E (`geometry`) |
| `geometry.hullSections.7.dx` | 0.5527272727272727 | m | E (`geometry`) |
| `geometry.hullSections.7.breadthFactor` | 0.86 | 1 | E (`geometry`) |
| `geometry.hullSections.7.immersedDepth` | 0.3697600000000001 | m | E (`geometry`) |
| `geometry.hullSections.7.shape` | 0.86 | 1 | E (`geometry`) |
| `geometry.hullSections.8.x` | 1.6581818181818182 | m | E (`geometry`) |
| `geometry.hullSections.8.dx` | 0.5527272727272727 | m | E (`geometry`) |
| `geometry.hullSections.8.breadthFactor` | 0.68 | 1 | E (`geometry`) |
| `geometry.hullSections.8.immersedDepth` | 0.33088000000000006 | m | E (`geometry`) |
| `geometry.hullSections.8.shape` | 0.68 | 1 | E (`geometry`) |
| `geometry.hullSections.9.x` | 2.210909090909091 | m | E (`geometry`) |
| `geometry.hullSections.9.dx` | 0.5527272727272727 | m | E (`geometry`) |
| `geometry.hullSections.9.breadthFactor` | 0.45 | 1 | E (`geometry`) |
| `geometry.hullSections.9.immersedDepth` | 0.28120000000000006 | m | E (`geometry`) |
| `geometry.hullSections.9.shape` | 0.45 | 1 | E (`geometry`) |
| `geometry.hullSections.10.x` | 2.7636363636363637 | m | E (`geometry`) |
| `geometry.hullSections.10.dx` | 0.5527272727272727 | m | E (`geometry`) |
| `geometry.hullSections.10.breadthFactor` | 0.2 | 1 | E (`geometry`) |
| `geometry.hullSections.10.immersedDepth` | 0.22720000000000004 | m | E (`geometry`) |
| `geometry.hullSections.10.shape` | 0.2 | 1 | E (`geometry`) |
| `mass.lightDisplacement` | 2250 | kg | E (`mass.lightDisplacement`) |
| `mass.displacement` | 2500 | kg | C (`mass.displacement`) |
| `mass.centerOfGravity.x` | 0 | m | E (`mass`) |
| `mass.centerOfGravity.y` | 0 | m | E (`mass`) |
| `mass.yawRadius` | 1.76 | m | E (`mass.yawRadius`) |
| `mass.addedMassModel.surgeMassRatio` | 0.085 | 1 | E (`mass.addedMassModel`) |
| `mass.addedMassModel.sectionalScale` | 0.39 | 1 | E (`mass.addedMassModel`) |
| `hull.axialResistance.surgeLinear` | 65 | N·s/m | E (`hull`) |
| `hull.axialResistance.surgeQuadratic` | 68 | N·s²/m² | E (`hull`) |
| `hull.axialResistance.waveRise` | 22 | N·s²/m² | E (`hull`) |
| `hull.axialResistance.waveOnset` | 1.67 | m/s | E (`hull`) |
| `hull.crossFlow.cd` | 1.1 | 1 | E (`hull`) |
| `hull.crossFlow.areaFactor` | 0.73 | 1 | E (`hull`) |
| `hull.crossFlow.linearDampingFroude` | 0.02 | 1 | E (`hull.crossFlow.linearDampingFroude`) |
| `appendages.0.position.x` | -2.7513761732020487 | m | E (`appendages`) |
| `appendages.0.position.y` | 0 | m | E (`appendages`) |
| `appendages.0.position.z` | -0.7465061131264273 | m | E (`appendages`) |
| `appendages.0.area` | 0.526720238095238 | m² | E (`appendages`) |
| `appendages.0.span` | 0.81 | m | E (`appendages`) |
| `appendages.0.aspectRatio` | 0.20068823124569868 | 1 | E (`appendages`) |
| `appendages.0.coefficients.efficiency` | 0.62 | 1 | E (`appendages`) |
| `appendages.0.coefficients.cd0` | 0.022 | 1 | E (`appendages`) |
| `appendages.0.coefficients.normalCd90` | 1.16 | 1 | E (`appendages`) |
| `appendages.0.coefficients.stallStartDeg` | 24 | ° | E (`appendages`) |
| `appendages.0.coefficients.stallEndDeg` | 52 | ° | E (`appendages`) |
| `appendages.1.position.x` | -2.0023979521277933 | m | E (`appendages`) |
| `appendages.1.position.y` | 0 | m | E (`appendages`) |
| `appendages.1.position.z` | -0.8036261064959095 | m | E (`appendages`) |
| `appendages.1.area` | 0.6169226190476191 | m² | E (`appendages`) |
| `appendages.1.span` | 0.81 | m | E (`appendages`) |
| `appendages.1.aspectRatio` | 0.20068823124569868 | 1 | E (`appendages`) |
| `appendages.1.coefficients.efficiency` | 0.62 | 1 | E (`appendages`) |
| `appendages.1.coefficients.cd0` | 0.022 | 1 | E (`appendages`) |
| `appendages.1.coefficients.normalCd90` | 1.16 | 1 | E (`appendages`) |
| `appendages.1.coefficients.stallStartDeg` | 24 | ° | E (`appendages`) |
| `appendages.1.coefficients.stallEndDeg` | 52 | ° | E (`appendages`) |
| `appendages.2.position.x` | -1.2392857142857148 | m | E (`appendages`) |
| `appendages.2.position.y` | 0 | m | E (`appendages`) |
| `appendages.2.position.z` | -0.8049999999999998 | m | E (`appendages`) |
| `appendages.2.area` | 0.6190714285714282 | m² | E (`appendages`) |
| `appendages.2.span` | 0.81 | m | E (`appendages`) |
| `appendages.2.aspectRatio` | 0.20068823124569868 | 1 | E (`appendages`) |
| `appendages.2.coefficients.efficiency` | 0.62 | 1 | E (`appendages`) |
| `appendages.2.coefficients.cd0` | 0.022 | 1 | E (`appendages`) |
| `appendages.2.coefficients.normalCd90` | 1.16 | 1 | E (`appendages`) |
| `appendages.2.coefficients.stallStartDeg` | 24 | ° | E (`appendages`) |
| `appendages.2.coefficients.stallEndDeg` | 52 | ° | E (`appendages`) |
| `appendages.3.position.x` | -0.48580660263880215 | m | E (`appendages`) |
| `appendages.3.position.y` | 0 | m | E (`appendages`) |
| `appendages.3.position.z` | -0.7848439177254757 | m | E (`appendages`) |
| `appendages.3.area` | 0.5867889795918371 | m² | E (`appendages`) |
| `appendages.3.span` | 0.81 | m | E (`appendages`) |
| `appendages.3.aspectRatio` | 0.20068823124569868 | 1 | E (`appendages`) |
| `appendages.3.coefficients.efficiency` | 0.62 | 1 | E (`appendages`) |
| `appendages.3.coefficients.cd0` | 0.022 | 1 | E (`appendages`) |
| `appendages.3.coefficients.normalCd90` | 1.16 | 1 | E (`appendages`) |
| `appendages.3.coefficients.stallStartDeg` | 24 | ° | E (`appendages`) |
| `appendages.3.coefficients.stallEndDeg` | 52 | ° | E (`appendages`) |
| `appendages.4.position.x` | 0.272654158403097 | m | E (`appendages`) |
| `appendages.4.position.y` | 0 | m | E (`appendages`) |
| `appendages.4.position.z` | -0.7089307316620402 | m | E (`appendages`) |
| `appendages.4.area` | 0.4695535860058312 | m² | E (`appendages`) |
| `appendages.4.span` | 0.81 | m | E (`appendages`) |
| `appendages.4.aspectRatio` | 0.20068823124569868 | 1 | E (`appendages`) |
| `appendages.4.coefficients.efficiency` | 0.62 | 1 | E (`appendages`) |
| `appendages.4.coefficients.cd0` | 0.022 | 1 | E (`appendages`) |
| `appendages.4.coefficients.normalCd90` | 1.16 | 1 | E (`appendages`) |
| `appendages.4.coefficients.stallStartDeg` | 24 | ° | E (`appendages`) |
| `appendages.4.coefficients.stallEndDeg` | 52 | ° | E (`appendages`) |
| `appendages.5.position.x` | 1.020489482200647 | m | E (`appendages`) |
| `appendages.5.position.y` | 0 | m | E (`appendages`) |
| `appendages.5.position.z` | -0.614930073971336 | m | E (`appendages`) |
| `appendages.5.area` | 0.32131195335276913 | m² | E (`appendages`) |
| `appendages.5.span` | 0.81 | m | E (`appendages`) |
| `appendages.5.aspectRatio` | 0.20068823124569868 | 1 | E (`appendages`) |
| `appendages.5.coefficients.efficiency` | 0.62 | 1 | E (`appendages`) |
| `appendages.5.coefficients.cd0` | 0.022 | 1 | E (`appendages`) |
| `appendages.5.coefficients.normalCd90` | 1.16 | 1 | E (`appendages`) |
| `appendages.5.coefficients.stallStartDeg` | 24 | ° | E (`appendages`) |
| `appendages.5.coefficients.stallEndDeg` | 52 | ° | E (`appendages`) |
| `appendages.6.position.x` | 1.695990116674409 | m | E (`appendages`) |
| `appendages.6.position.y` | 0 | m | E (`appendages`) |
| `appendages.6.position.z` | -0.5101744104965615 | m | E (`appendages`) |
| `appendages.6.area` | 0.1288811953352773 | m² | E (`appendages`) |
| `appendages.6.span` | 0.81 | m | E (`appendages`) |
| `appendages.6.aspectRatio` | 0.20068823124569868 | 1 | E (`appendages`) |
| `appendages.6.coefficients.efficiency` | 0.62 | 1 | E (`appendages`) |
| `appendages.6.coefficients.cd0` | 0.022 | 1 | E (`appendages`) |
| `appendages.6.coefficients.normalCd90` | 1.16 | 1 | E (`appendages`) |
| `appendages.6.coefficients.stallStartDeg` | 24 | ° | E (`appendages`) |
| `appendages.6.coefficients.stallEndDeg` | 52 | ° | E (`appendages`) |
| `propulsors.0.position.x` | -2.8 | m | E (`propulsors`) |
| `propulsors.0.position.y` | 0 | m | E (`propulsors`) |
| `propulsors.0.position.z` | -0.73 | m | E (`propulsors`) |
| `propulsors.0.axis.x` | 1 | 1 | E (`propulsors`) |
| `propulsors.0.axis.y` | 0 | 1 | E (`propulsors`) |
| `propulsors.0.engine.powerKw` | 5.884 | kW | A (`propulsors.0.engine.powerKw`) |
| `propulsors.0.engine.idleRpm` | 800 | tr/min | E (`propulsors`) |
| `propulsors.0.engine.maxRpm` | 3200 | tr/min | A (`propulsors.0.engine.maxRpm`) |
| `propulsors.0.engine.dynamics.inertiaKgM2` | 0.07 | kg·m² | E (`propulsors`) |
| `propulsors.0.engine.dynamics.frictionNm` | 1.8 | N·m | E (`propulsors`) |
| `propulsors.0.engine.dynamics.governorKpNmPerRadS` | 0.84 | N·m·s/rad | E (`propulsors`) |
| `propulsors.0.engine.dynamics.governorKiNmPerRad` | 0.64 | N·m/rad | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.0.rpm` | 800 | tr/min | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.0.torqueNm` | 12.642313749561614 | N·m | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.1.rpm` | 1500 | tr/min | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.1.torqueNm` | 16.85641833274882 | N·m | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.2.rpm` | 2200 | tr/min | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.2.torqueNm` | 19.31464600627469 | N·m | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.3.rpm` | 2800 | tr/min | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.3.torqueNm` | 18.612295242410156 | N·m | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.4.rpm` | 3200 | tr/min | E (`propulsors`) |
| `propulsors.0.engine.dynamics.torqueCurve.4.torqueNm` | 17.558769096613354 | N·m | E (`propulsors`) |
| `propulsors.0.gearbox.ratioAhead` | 2 | 1 | A (`propulsors.0.gearbox.ratioAhead`) |
| `propulsors.0.gearbox.ratioAstern` | 2 | 1 | E (`propulsors`) |
| `propulsors.0.gearbox.efficiency` | 0.94 | 1 | E (`propulsors`) |
| `propulsors.0.gearbox.clutch.capacityEngineNm` | 28.97196900941203 | N·m | E (`propulsors`) |
| `propulsors.0.gearbox.clutch.stiffnessNmPerRadS` | 0.82 | N·m·s/rad | E (`propulsors`) |
| `propulsors.0.gearbox.clutch.disengageTimeS` | 0.12 | s | E (`propulsors`) |
| `propulsors.0.gearbox.clutch.neutralDwellS` | 0.18 | s | E (`propulsors`) |
| `propulsors.0.gearbox.clutch.engageTimeS` | 0.36 | s | E (`propulsors`) |
| `propulsors.0.propeller.diameter` | 0.305 | m | E (`propulsors`) |
| `propulsors.0.propeller.pitch` | 0.229 | m | E (`propulsors`) |
| `propulsors.0.propeller.blades` | 2 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.expandedAreaRatio` | 0.34 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.shaft.inertiaKgM2` | 0.012 | kg·m² | E (`propulsors`) |
| `propulsors.0.propeller.shaft.viscousFrictionNmPerRadS` | 0.018 | N·m·s/rad | E (`propulsors`) |
| `propulsors.0.propeller.shaft.coulombFrictionNm` | 0.18 | N·m | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.sampleCount` | 32 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.betaOriginRad` | -3.141592653589793 | rad | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.0` | -0.04629120534535994 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.1` | -0.05137155371914659 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.2` | -0.04634067560820418 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.3` | -0.031964476599900066 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.4` | -0.010431602672679952 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.5` | 0.014979761314025078 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.6` | 0.040400965547827274 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.7` | 0.0619618621279206 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.8` | 0.07637999999999999 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.9` | 0.09490755670704082 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.10` | 0.11000204402454032 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.11` | 0.11936546309027747 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.12` | 0.121572318231099 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.13` | 0.11628663575700644 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.14` | 0.10431311290984954 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.15` | 0.08747461000285299 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.16` | 0.06833463646219799 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.17` | 0.04399299844836923 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.18` | 0.012341408384686153 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.19` | -0.021801466064033888 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.20` | -0.053237681768900987 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.21` | -0.07718135985885405 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.22` | -0.08998729239468001 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.23` | -0.08970589223386705 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.24` | -0.07637999999999999 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.25` | -0.06548557031942541 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.26` | -0.05395934568418422 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.27` | -0.04355608930950544 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.28` | -0.03585960267267997 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.29` | -0.03204160609533942 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.30` | -0.0326833549461587 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.thrust.31` | -0.037687148780068444 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.0` | -0.013813771873445808 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.1` | -0.013645445658134588 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.2` | -0.011826701139323305 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.3` | -0.008634425683040863 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.4` | -0.004554614289457177 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.5` | -0.00020838125966299715 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.6` | 0.0037425988262560312 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.7` | 0.0066968250659424165 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.8` | 0.00820454329453145 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.9` | 0.009023999926385778 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.10` | 0.010018222964863998 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.11` | 0.011035850965012079 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.12` | 0.011921959288628277 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.13` | 0.012541645976033978 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.14` | 0.012800569346545474 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.15` | 0.01265931066414859 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.16` | 0.012139375282725105 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.17` | 0.010695384979759654 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.18` | 0.007922640517962914 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.19` | 0.004243267106652305 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.20` | 0.00021741599409682926 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.21` | -0.003542013482248154 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.22` | -0.006462682263922168 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.23` | -0.008099945004843812 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.24` | -0.00820454329453145 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.25` | -0.007748335838731548 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.26` | -0.00778855893422431 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.27` | -0.008319088979344224 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.28` | -0.009259157583988627 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.29` | -0.01046564782484353 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.30` | -0.011754882499600027 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.torque.31` | -0.012930587315967895 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.fourQuadrant.uncertainty` | 0.25 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.safety.maximumThrustCoefficient` | 2.2 | 1 | E (`propulsors`) |
| `propulsors.0.propeller.safety.maximumTorqueCoefficient` | 0.12 | 1 | E (`propulsors`) |
| `propulsors.0.transverseWalk.base` | 0.045 | 1 | E (`propulsors`) |
| `propulsors.0.transverseWalk.gain` | 0.15 | 1 | E (`propulsors`) |
| `rudders.0.position.x` | -3.42 | m | E (`rudders`) |
| `rudders.0.position.y` | 0 | m | E (`rudders`) |
| `rudders.0.position.z` | -0.77 | m | E (`rudders`) |
| `rudders.0.area` | 0.43 | m² | E (`rudders`) |
| `rudders.0.span` | 0.82 | m | E (`rudders`) |
| `rudders.0.aspectRatio` | 1.56 | 1 | E (`rudders`) |
| `rudders.0.coefficients.efficiency` | 0.6 | 1 | E (`rudders`) |
| `rudders.0.coefficients.cd0` | 0.022 | 1 | E (`rudders`) |
| `rudders.0.coefficients.normalCd90` | 1.12 | 1 | E (`rudders`) |
| `rudders.0.coefficients.stallStartDeg` | 24 | ° | E (`rudders`) |
| `rudders.0.coefficients.stallEndDeg` | 52 | ° | E (`rudders`) |
| `rudders.0.axis.x` | 0 | 1 | E (`rudders`) |
| `rudders.0.axis.y` | 0 | 1 | E (`rudders`) |
| `rudders.0.axis.z` | 1 | 1 | E (`rudders`) |
| `rudders.0.stock.chordFraction` | 0.02 | 1 | E (`rudders`) |
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
| `aerodynamics.panels.0.area` | 0.4385487430149582 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.0.normalBody.x` | -0.4788521306805734 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.0.normalBody.y` | 0.8778955729143844 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.0.center.x` | -3.4776190476190476 | m | E (`aerodynamics`) |
| `aerodynamics.panels.0.center.y` | 0.4685714285714286 | m | E (`aerodynamics`) |
| `aerodynamics.panels.0.center.z` | 0.3500952380952381 | m | E (`aerodynamics`) |
| `aerodynamics.panels.0.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.0.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.0.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.1.area` | 0.4385487430149582 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.1.normalBody.x` | -0.4788521306805734 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.1.normalBody.y` | -0.8778955729143844 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.1.center.x` | -3.4776190476190476 | m | E (`aerodynamics`) |
| `aerodynamics.panels.1.center.y` | -0.4685714285714286 | m | E (`aerodynamics`) |
| `aerodynamics.panels.1.center.z` | 0.3500952380952381 | m | E (`aerodynamics`) |
| `aerodynamics.panels.1.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.1.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.1.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.2.area` | 0.4928392841484941 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.2.normalBody.x` | -0.34818652960362706 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.2.normalBody.y` | 0.9374252720097654 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.2.center.x` | -2.853535353535354 | m | E (`aerodynamics`) |
| `aerodynamics.panels.2.center.y` | 0.7486868686868687 | m | E (`aerodynamics`) |
| `aerodynamics.panels.2.center.z` | 0.3301010101010101 | m | E (`aerodynamics`) |
| `aerodynamics.panels.2.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.2.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.2.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.3.area` | 0.4928392841484941 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.3.normalBody.x` | -0.34818652960362706 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.3.normalBody.y` | -0.9374252720097654 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.3.center.x` | -2.853535353535354 | m | E (`aerodynamics`) |
| `aerodynamics.panels.3.center.y` | -0.7486868686868687 | m | E (`aerodynamics`) |
| `aerodynamics.panels.3.center.z` | 0.3301010101010101 | m | E (`aerodynamics`) |
| `aerodynamics.panels.3.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.3.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.3.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.4.area` | 0.5762215285808056 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.4.normalBody.x` | -0.21693045781865625 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.4.normalBody.y` | 0.9761870601839526 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.4.center.x` | -2.0536 | m | E (`aerodynamics`) |
| `aerodynamics.panels.4.center.y` | 0.9792 | m | E (`aerodynamics`) |
| `aerodynamics.panels.4.center.z` | 0.31255999999999995 | m | E (`aerodynamics`) |
| `aerodynamics.panels.4.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.4.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.4.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.5.area` | 0.5762215285808056 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.5.normalBody.x` | -0.21693045781865625 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.5.normalBody.y` | -0.9761870601839526 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.5.center.x` | -2.0536 | m | E (`aerodynamics`) |
| `aerodynamics.panels.5.center.y` | -0.9792 | m | E (`aerodynamics`) |
| `aerodynamics.panels.5.center.z` | 0.31255999999999995 | m | E (`aerodynamics`) |
| `aerodynamics.panels.5.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.5.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.5.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.6.area` | 0.6060880216602206 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.6.normalBody.x` | -0.05989229072794656 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.6.normalBody.y` | 0.9982048454657787 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.6.center.x` | -1.1013774104683196 | m | E (`aerodynamics`) |
| `aerodynamics.panels.6.center.y` | 1.1099173553719008 | m | E (`aerodynamics`) |
| `aerodynamics.panels.6.center.z` | 0.30250688705234163 | m | E (`aerodynamics`) |
| `aerodynamics.panels.6.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.6.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.6.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.7.area` | 0.6060880216602206 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.7.normalBody.x` | -0.05989229072794656 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.7.normalBody.y` | -0.9982048454657787 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.7.center.x` | -1.1013774104683196 | m | E (`aerodynamics`) |
| `aerodynamics.panels.7.center.y` | -1.1099173553719008 | m | E (`aerodynamics`) |
| `aerodynamics.panels.7.center.z` | 0.30250688705234163 | m | E (`aerodynamics`) |
| `aerodynamics.panels.7.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.7.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.7.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.8.area` | 0.6104878049560041 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.8.normalBody.x` | 0.03996803834887139 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.8.normalBody.y` | 0.9992009587217893 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.8.center.x` | -0.09726775956284149 | m | E (`aerodynamics`) |
| `aerodynamics.panels.8.center.y` | 1.1198907103825135 | m | E (`aerodynamics`) |
| `aerodynamics.panels.8.center.z` | 0.3050273224043716 | m | E (`aerodynamics`) |
| `aerodynamics.panels.8.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.8.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.8.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.9.area` | 0.6104878049560041 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.9.normalBody.x` | 0.03996803834887139 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.9.normalBody.y` | -0.9992009587217893 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.9.center.x` | -0.09726775956284149 | m | E (`aerodynamics`) |
| `aerodynamics.panels.9.center.y` | -1.1198907103825135 | m | E (`aerodynamics`) |
| `aerodynamics.panels.9.center.z` | 0.3050273224043716 | m | E (`aerodynamics`) |
| `aerodynamics.panels.9.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.9.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.9.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.10.area` | 0.6532038273004835 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.10.normalBody.x` | 0.157990501106673 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.10.normalBody.y` | 0.9874406319167053 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.10.center.x` | 0.9064599483204135 | m | E (`aerodynamics`) |
| `aerodynamics.panels.10.center.y` | 1.0189664082687337 | m | E (`aerodynamics`) |
| `aerodynamics.panels.10.center.z` | 0.32266149870801036 | m | E (`aerodynamics`) |
| `aerodynamics.panels.10.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.10.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.10.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.11.area` | 0.6532038273004835 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.11.normalBody.x` | 0.157990501106673 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.11.normalBody.y` | -0.9874406319167053 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.11.center.x` | 0.9064599483204135 | m | E (`aerodynamics`) |
| `aerodynamics.panels.11.center.y` | -1.0189664082687337 | m | E (`aerodynamics`) |
| `aerodynamics.panels.11.center.z` | 0.32266149870801036 | m | E (`aerodynamics`) |
| `aerodynamics.panels.11.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.11.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.11.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.12.area` | 0.6246315914200948 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.12.normalBody.x` | 0.2821663239915501 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.12.normalBody.y` | 0.9593655015712705 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.12.center.x` | 1.8320330969267138 | m | E (`aerodynamics`) |
| `aerodynamics.panels.12.center.y` | 0.8129314420803779 | m | E (`aerodynamics`) |
| `aerodynamics.panels.12.center.z` | 0.352789598108747 | m | E (`aerodynamics`) |
| `aerodynamics.panels.12.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.12.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.12.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.13.area` | 0.6246315914200948 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.13.normalBody.x` | 0.2821663239915501 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.13.normalBody.y` | -0.9593655015712705 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.13.center.x` | 1.8320330969267138 | m | E (`aerodynamics`) |
| `aerodynamics.panels.13.center.y` | -0.8129314420803779 | m | E (`aerodynamics`) |
| `aerodynamics.panels.13.center.z` | 0.352789598108747 | m | E (`aerodynamics`) |
| `aerodynamics.panels.13.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.13.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.13.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.14.area` | 0.591829612304082 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.14.normalBody.x` | 0.3713906763541036 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.14.normalBody.y` | 0.9284766908852594 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.14.center.x` | 2.6066878980891723 | m | E (`aerodynamics`) |
| `aerodynamics.panels.14.center.y` | 0.5473248407643312 | m | E (`aerodynamics`) |
| `aerodynamics.panels.14.center.z` | 0.3929299363057325 | m | E (`aerodynamics`) |
| `aerodynamics.panels.14.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.14.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.14.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.15.area` | 0.591829612304082 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.15.normalBody.x` | 0.3713906763541036 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.15.normalBody.y` | -0.9284766908852594 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.15.center.x` | 2.6066878980891723 | m | E (`aerodynamics`) |
| `aerodynamics.panels.15.center.y` | -0.5473248407643312 | m | E (`aerodynamics`) |
| `aerodynamics.panels.15.center.z` | 0.3929299363057325 | m | E (`aerodynamics`) |
| `aerodynamics.panels.15.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.15.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.15.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.16.area` | 0.57604249843219 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.16.normalBody.x` | 0.42288546533112403 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.16.normalBody.y` | 0.9061831399952653 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.16.center.x` | 3.2545977011494247 | m | E (`aerodynamics`) |
| `aerodynamics.panels.16.center.y` | 0.2678544061302682 | m | E (`aerodynamics`) |
| `aerodynamics.panels.16.center.z` | 0.4353065134099617 | m | E (`aerodynamics`) |
| `aerodynamics.panels.16.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.16.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.16.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.17.area` | 0.57604249843219 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.17.normalBody.x` | 0.42288546533112403 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.17.normalBody.y` | -0.9061831399952653 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.17.center.x` | 3.2545977011494247 | m | E (`aerodynamics`) |
| `aerodynamics.panels.17.center.y` | -0.2678544061302682 | m | E (`aerodynamics`) |
| `aerodynamics.panels.17.center.z` | 0.4353065134099617 | m | E (`aerodynamics`) |
| `aerodynamics.panels.17.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.17.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.17.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.18.area` | 0.455950331724849 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.18.normalBody.x` | 0.2665860545383953 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.18.normalBody.y` | 0.9638111202541978 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.18.center.x` | 3.7870944741532977 | m | E (`aerodynamics`) |
| `aerodynamics.panels.18.center.y` | 0.06442067736185383 | m | E (`aerodynamics`) |
| `aerodynamics.panels.18.center.z` | 0.4676114081996436 | m | E (`aerodynamics`) |
| `aerodynamics.panels.18.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.18.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.18.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.19.area` | 0.455950331724849 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.19.normalBody.x` | 0.2665860545383953 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.19.normalBody.y` | -0.9638111202541978 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.19.center.x` | 3.7870944741532977 | m | E (`aerodynamics`) |
| `aerodynamics.panels.19.center.y` | -0.06442067736185383 | m | E (`aerodynamics`) |
| `aerodynamics.panels.19.center.z` | 0.4676114081996436 | m | E (`aerodynamics`) |
| `aerodynamics.panels.19.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.19.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.19.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.20.area` | 0.95 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.20.normalBody.x` | -0.06 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.20.normalBody.y` | 0.998 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.20.center.x` | -0.65 | m | E (`aerodynamics`) |
| `aerodynamics.panels.20.center.y` | 0.46 | m | E (`aerodynamics`) |
| `aerodynamics.panels.20.center.z` | 1.13 | m | E (`aerodynamics`) |
| `aerodynamics.panels.20.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.20.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.20.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.21.area` | 0.95 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.21.normalBody.x` | -0.06 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.21.normalBody.y` | -0.998 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.21.center.x` | -0.65 | m | E (`aerodynamics`) |
| `aerodynamics.panels.21.center.y` | -0.46 | m | E (`aerodynamics`) |
| `aerodynamics.panels.21.center.z` | 1.13 | m | E (`aerodynamics`) |
| `aerodynamics.panels.21.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.21.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.21.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.22.area` | 0.7 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.22.normalBody.x` | 0.1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.22.normalBody.y` | 0.995 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.22.center.x` | 0.7 | m | E (`aerodynamics`) |
| `aerodynamics.panels.22.center.y` | 0.4 | m | E (`aerodynamics`) |
| `aerodynamics.panels.22.center.z` | 1.18 | m | E (`aerodynamics`) |
| `aerodynamics.panels.22.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.22.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.22.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.23.area` | 0.7 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.23.normalBody.x` | 0.1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.23.normalBody.y` | -0.995 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.23.center.x` | 0.7 | m | E (`aerodynamics`) |
| `aerodynamics.panels.23.center.y` | -0.4 | m | E (`aerodynamics`) |
| `aerodynamics.panels.23.center.z` | 1.18 | m | E (`aerodynamics`) |
| `aerodynamics.panels.23.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.23.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.23.exposure` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.24.area` | 0.52 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.24.normalBody.x` | 0 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.24.normalBody.y` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.24.center.x` | -0.1 | m | E (`aerodynamics`) |
| `aerodynamics.panels.24.center.y` | 0.11 | m | E (`aerodynamics`) |
| `aerodynamics.panels.24.center.z` | 2.1 | m | E (`aerodynamics`) |
| `aerodynamics.panels.24.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.24.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.24.exposure` | 0.92 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.25.area` | 0.52 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.25.normalBody.x` | 0 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.25.normalBody.y` | -1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.25.center.x` | -0.1 | m | E (`aerodynamics`) |
| `aerodynamics.panels.25.center.y` | -0.11 | m | E (`aerodynamics`) |
| `aerodynamics.panels.25.center.z` | 2.1 | m | E (`aerodynamics`) |
| `aerodynamics.panels.25.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.25.cdTangential` | 0.055 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.25.exposure` | 0.92 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.26.area` | 1.1 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.26.normalBody.x` | 0 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.26.normalBody.y` | 1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.26.center.x` | 0.12 | m | E (`aerodynamics`) |
| `aerodynamics.panels.26.center.y` | 0 | m | E (`aerodynamics`) |
| `aerodynamics.panels.26.center.z` | 3.7 | m | E (`aerodynamics`) |
| `aerodynamics.panels.26.cdNormal` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.26.cdTangential` | 1.08 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.26.exposure` | 0.95 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.27.area` | 0.4608 | m² | E (`aerodynamics`) |
| `aerodynamics.panels.27.normalBody.x` | -1 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.27.normalBody.y` | 0 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.27.center.x` | -3.75 | m | E (`aerodynamics`) |
| `aerodynamics.panels.27.center.y` | 0 | m | E (`aerodynamics`) |
| `aerodynamics.panels.27.center.z` | 0.36 | m | E (`aerodynamics`) |
| `aerodynamics.panels.27.cdNormal` | 1.02 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.27.cdTangential` | 0.04 | 1 | E (`aerodynamics`) |
| `aerodynamics.panels.27.exposure` | 0.96 | 1 | E (`aerodynamics`) |
| `contacts.fenderRadius` | 0.14 | m | E (`contacts`) |
| `contacts.hullRadius` | 0.14 | m | E (`contacts`) |
| `contacts.fenderStiffness` | 26000 | N/m | E (`contacts`) |
| `contacts.hullStiffness` | 52000 | N/m | E (`contacts`) |
| `contacts.dampingRatio` | 0.82 | 1 | E (`contacts`) |
| `contacts.friction` | 0.3 | 1 | E (`contacts`) |
| `contacts.hullFriction` | 0.3 | 1 | E (`contacts`) |
| `contacts.fenderFriction` | 0.03 | 1 | E (`contacts`) |
| `contacts.forceLimit` | 48000 | N | E (`contacts`) |
| `contacts.fenders.0.position.x` | 2.2866816221189015 | m | E (`contacts`) |
| `contacts.fenders.0.position.y` | -0.8147175152042652 | m | E (`contacts`) |
| `contacts.fenders.0.position.z` | 0.30000000000000004 | m | E (`contacts`) |
| `contacts.fenders.0.attachment.x` | 2.25 | m | E (`contacts`) |
| `contacts.fenders.0.attachment.y` | -0.69 | m | E (`contacts`) |
| `contacts.fenders.0.attachment.z` | 0.74 | m | E (`contacts`) |
| `contacts.fenders.0.preload` | 0.01 | m | E (`contacts`) |
| `contacts.fenders.1.position.x` | -0.09480415501464673 | m | E (`contacts`) |
| `contacts.fenders.1.position.y` | -1.2498961246338327 | m | E (`contacts`) |
| `contacts.fenders.1.position.z` | 0.30000000000000004 | m | E (`contacts`) |
| `contacts.fenders.1.attachment.x` | -0.1 | m | E (`contacts`) |
| `contacts.fenders.1.attachment.y` | -1.12 | m | E (`contacts`) |
| `contacts.fenders.1.attachment.z` | 0.61 | m | E (`contacts`) |
| `contacts.fenders.1.preload` | 0.01 | m | E (`contacts`) |
| `contacts.fenders.2.position.x` | -2.3282009595164253 | m | E (`contacts`) |
| `contacts.fenders.2.position.y` | -1.0513487622683584 | m | E (`contacts`) |
| `contacts.fenders.2.position.z` | 0.30000000000000004 | m | E (`contacts`) |
| `contacts.fenders.2.attachment.x` | -2.3 | m | E (`contacts`) |
| `contacts.fenders.2.attachment.y` | -0.9244444444444445 | m | E (`contacts`) |
| `contacts.fenders.2.attachment.z` | 0.6333333333333333 | m | E (`contacts`) |
| `contacts.fenders.2.preload` | 0.01 | m | E (`contacts`) |
| `contacts.fenders.3.position.x` | 2.2866816221189015 | m | E (`contacts`) |
| `contacts.fenders.3.position.y` | 0.8147175152042652 | m | E (`contacts`) |
| `contacts.fenders.3.position.z` | 0.30000000000000004 | m | E (`contacts`) |
| `contacts.fenders.3.attachment.x` | 2.25 | m | E (`contacts`) |
| `contacts.fenders.3.attachment.y` | 0.69 | m | E (`contacts`) |
| `contacts.fenders.3.attachment.z` | 0.74 | m | E (`contacts`) |
| `contacts.fenders.3.preload` | 0.01 | m | E (`contacts`) |
| `contacts.fenders.4.position.x` | -0.09480415501464673 | m | E (`contacts`) |
| `contacts.fenders.4.position.y` | 1.2498961246338327 | m | E (`contacts`) |
| `contacts.fenders.4.position.z` | 0.30000000000000004 | m | E (`contacts`) |
| `contacts.fenders.4.attachment.x` | -0.1 | m | E (`contacts`) |
| `contacts.fenders.4.attachment.y` | 1.12 | m | E (`contacts`) |
| `contacts.fenders.4.attachment.z` | 0.61 | m | E (`contacts`) |
| `contacts.fenders.4.preload` | 0.01 | m | E (`contacts`) |
| `contacts.fenders.5.position.x` | -2.3282009595164253 | m | E (`contacts`) |
| `contacts.fenders.5.position.y` | 1.0513487622683584 | m | E (`contacts`) |
| `contacts.fenders.5.position.z` | 0.30000000000000004 | m | E (`contacts`) |
| `contacts.fenders.5.attachment.x` | -2.3 | m | E (`contacts`) |
| `contacts.fenders.5.attachment.y` | 0.9244444444444445 | m | E (`contacts`) |
| `contacts.fenders.5.attachment.z` | 0.6333333333333333 | m | E (`contacts`) |
| `contacts.fenders.5.preload` | 0.01 | m | E (`contacts`) |
| `contacts.hullEnvelope.0.position.x` | -3.6829607017047197 | m | E (`contacts`) |
| `contacts.hullEnvelope.0.position.y` | -0.19709461979198617 | m | E (`contacts`) |
| `contacts.hullEnvelope.0.radius` | 0.14 | m | E (`contacts`) |
| `contacts.hullEnvelope.0.reference.x` | -3.75 | m | E (`contacts`) |
| `contacts.hullEnvelope.0.reference.y` | -0.32 | m | E (`contacts`) |
| `contacts.hullEnvelope.1.position.x` | -3.13296070170472 | m | E (`contacts`) |
| `contacts.hullEnvelope.1.position.y` | -0.49709461979198616 | m | E (`contacts`) |
| `contacts.hullEnvelope.1.radius` | 0.14 | m | E (`contacts`) |
| `contacts.hullEnvelope.1.reference.x` | -3.2 | m | E (`contacts`) |
| `contacts.hullEnvelope.1.reference.y` | -0.62 | m | E (`contacts`) |
| `contacts.hullEnvelope.2.position.x` | -2.4512538858554924 | m | E (`contacts`) |
| `contacts.hullEnvelope.2.position.y` | -0.7487604619186328 | m | E (`contacts`) |
| `contacts.hullEnvelope.2.radius` | 0.14 | m | E (`contacts`) |
| `contacts.hullEnvelope.2.reference.x` | -2.5 | m | E (`contacts`) |
| `contacts.hullEnvelope.2.reference.y` | -0.88 | m | E (`contacts`) |
| `contacts.hullEnvelope.3.position.x` | -1.5696297359053881 | m | E (`contacts`) |
| `contacts.hullEnvelope.3.position.y` | -0.9433338115742467 | m | E (`contacts`) |
| `contacts.hullEnvelope.3.radius` | 0.14 | m | E (`contacts`) |
| `contacts.hullEnvelope.3.reference.x` | -1.6 | m | E (`contacts`) |
| `contacts.hullEnvelope.3.reference.y` | -1.08 | m | E (`contacts`) |
| `contacts.hullEnvelope.4.position.x` | -0.5916150792980874 | m | E (`contacts`) |
| `contacts.hullEnvelope.4.position.y` | -1.0002513216347908 | m | E (`contacts`) |
| `contacts.hullEnvelope.4.radius` | 0.14 | m | E (`contacts`) |
| `contacts.hullEnvelope.4.reference.x` | -0.6 | m | E (`contacts`) |
| `contacts.hullEnvelope.4.reference.y` | -1.14 | m | E (`contacts`) |
| `contacts.hullEnvelope.5.position.x` | 0.394404474631158 | m | E (`contacts`) |
| `contacts.hullEnvelope.5.position.y` | -0.9601118657789496 | m | E (`contacts`) |
| `contacts.hullEnvelope.5.radius` | 0.14 | m | E (`contacts`) |
| `contacts.hullEnvelope.5.reference.x` | 0.4 | m | E (`contacts`) |
| `contacts.hullEnvelope.5.reference.y` | -1.1 | m | E (`contacts`) |
| `contacts.hullEnvelope.6.position.x` | 1.3778813298450656 | m | E (`contacts`) |
| `contacts.hullEnvelope.6.position.y` | -0.8017583115316612 | m | E (`contacts`) |
| `contacts.hullEnvelope.6.radius` | 0.14 | m | E (`contacts`) |
| `contacts.hullEnvelope.6.reference.x` | 1.4 | m | E (`contacts`) |
| `contacts.hullEnvelope.6.reference.y` | -0.94 | m | E (`contacts`) |
| `contacts.hullEnvelope.7.position.x` | 2.210496714641183 | m | E (`contacts`) |
| `contacts.hullEnvelope.7.position.y` | -0.5556888297800221 | m | E (`contacts`) |
| `contacts.hullEnvelope.7.radius` | 0.14 | m | E (`contacts`) |
| `contacts.hullEnvelope.7.reference.x` | 2.25 | m | E (`contacts`) |
| `contacts.hullEnvelope.7.reference.y` | -0.69 | m | E (`contacts`) |
| `contacts.hullEnvelope.8.position.x` | 2.8980053053104258 | m | E (`contacts`) |
| `contacts.hullEnvelope.8.position.y` | -0.2800132632760637 | m | E (`contacts`) |
| `contacts.hullEnvelope.8.radius` | 0.14 | m | E (`contacts`) |
| `contacts.hullEnvelope.8.reference.x` | 2.95 | m | E (`contacts`) |
| `contacts.hullEnvelope.8.reference.y` | -0.41 | m | E (`contacts`) |
| `contacts.hullEnvelope.9.position.x` | -3.6829607017047197 | m | E (`contacts`) |
| `contacts.hullEnvelope.9.position.y` | 0.19709461979198617 | m | E (`contacts`) |
| `contacts.hullEnvelope.9.radius` | 0.14 | m | E (`contacts`) |
| `contacts.hullEnvelope.9.reference.x` | -3.75 | m | E (`contacts`) |
| `contacts.hullEnvelope.9.reference.y` | 0.32 | m | E (`contacts`) |
| `contacts.hullEnvelope.10.position.x` | -3.13296070170472 | m | E (`contacts`) |
| `contacts.hullEnvelope.10.position.y` | 0.49709461979198616 | m | E (`contacts`) |
| `contacts.hullEnvelope.10.radius` | 0.14 | m | E (`contacts`) |
| `contacts.hullEnvelope.10.reference.x` | -3.2 | m | E (`contacts`) |
| `contacts.hullEnvelope.10.reference.y` | 0.62 | m | E (`contacts`) |
| `contacts.hullEnvelope.11.position.x` | -2.4512538858554924 | m | E (`contacts`) |
| `contacts.hullEnvelope.11.position.y` | 0.7487604619186328 | m | E (`contacts`) |
| `contacts.hullEnvelope.11.radius` | 0.14 | m | E (`contacts`) |
| `contacts.hullEnvelope.11.reference.x` | -2.5 | m | E (`contacts`) |
| `contacts.hullEnvelope.11.reference.y` | 0.88 | m | E (`contacts`) |
| `contacts.hullEnvelope.12.position.x` | -1.5696297359053881 | m | E (`contacts`) |
| `contacts.hullEnvelope.12.position.y` | 0.9433338115742467 | m | E (`contacts`) |
| `contacts.hullEnvelope.12.radius` | 0.14 | m | E (`contacts`) |
| `contacts.hullEnvelope.12.reference.x` | -1.6 | m | E (`contacts`) |
| `contacts.hullEnvelope.12.reference.y` | 1.08 | m | E (`contacts`) |
| `contacts.hullEnvelope.13.position.x` | -0.5916150792980874 | m | E (`contacts`) |
| `contacts.hullEnvelope.13.position.y` | 1.0002513216347908 | m | E (`contacts`) |
| `contacts.hullEnvelope.13.radius` | 0.14 | m | E (`contacts`) |
| `contacts.hullEnvelope.13.reference.x` | -0.6 | m | E (`contacts`) |
| `contacts.hullEnvelope.13.reference.y` | 1.14 | m | E (`contacts`) |
| `contacts.hullEnvelope.14.position.x` | 0.394404474631158 | m | E (`contacts`) |
| `contacts.hullEnvelope.14.position.y` | 0.9601118657789496 | m | E (`contacts`) |
| `contacts.hullEnvelope.14.radius` | 0.14 | m | E (`contacts`) |
| `contacts.hullEnvelope.14.reference.x` | 0.4 | m | E (`contacts`) |
| `contacts.hullEnvelope.14.reference.y` | 1.1 | m | E (`contacts`) |
| `contacts.hullEnvelope.15.position.x` | 1.3778813298450656 | m | E (`contacts`) |
| `contacts.hullEnvelope.15.position.y` | 0.8017583115316612 | m | E (`contacts`) |
| `contacts.hullEnvelope.15.radius` | 0.14 | m | E (`contacts`) |
| `contacts.hullEnvelope.15.reference.x` | 1.4 | m | E (`contacts`) |
| `contacts.hullEnvelope.15.reference.y` | 0.94 | m | E (`contacts`) |
| `contacts.hullEnvelope.16.position.x` | 2.210496714641183 | m | E (`contacts`) |
| `contacts.hullEnvelope.16.position.y` | 0.5556888297800221 | m | E (`contacts`) |
| `contacts.hullEnvelope.16.radius` | 0.14 | m | E (`contacts`) |
| `contacts.hullEnvelope.16.reference.x` | 2.25 | m | E (`contacts`) |
| `contacts.hullEnvelope.16.reference.y` | 0.69 | m | E (`contacts`) |
| `contacts.hullEnvelope.17.position.x` | 2.8980053053104258 | m | E (`contacts`) |
| `contacts.hullEnvelope.17.position.y` | 0.2800132632760637 | m | E (`contacts`) |
| `contacts.hullEnvelope.17.radius` | 0.14 | m | E (`contacts`) |
| `contacts.hullEnvelope.17.reference.x` | 2.95 | m | E (`contacts`) |
| `contacts.hullEnvelope.17.reference.y` | 0.41 | m | E (`contacts`) |
| `contacts.hullEnvelope.18.position.x` | -3.61 | m | E (`contacts`) |
| `contacts.hullEnvelope.18.position.y` | -0.18 | m | E (`contacts`) |
| `contacts.hullEnvelope.18.radius` | 0.14 | m | E (`contacts`) |
| `contacts.hullEnvelope.18.reference.x` | -3.75 | m | E (`contacts`) |
| `contacts.hullEnvelope.18.reference.y` | -0.18 | m | E (`contacts`) |
| `contacts.hullEnvelope.19.position.x` | -3.61 | m | E (`contacts`) |
| `contacts.hullEnvelope.19.position.y` | 0 | m | E (`contacts`) |
| `contacts.hullEnvelope.19.radius` | 0.14 | m | E (`contacts`) |
| `contacts.hullEnvelope.19.reference.x` | -3.75 | m | E (`contacts`) |
| `contacts.hullEnvelope.19.reference.y` | 0 | m | E (`contacts`) |
| `contacts.hullEnvelope.20.position.x` | -3.61 | m | E (`contacts`) |
| `contacts.hullEnvelope.20.position.y` | 0.18 | m | E (`contacts`) |
| `contacts.hullEnvelope.20.radius` | 0.14 | m | E (`contacts`) |
| `contacts.hullEnvelope.20.reference.x` | -3.75 | m | E (`contacts`) |
| `contacts.hullEnvelope.20.reference.y` | 0.18 | m | E (`contacts`) |
| `contacts.hullEnvelope.21.position.x` | 3.8799999999999994 | m | E (`contacts`) |
| `contacts.hullEnvelope.21.position.y` | 0 | m | E (`contacts`) |
| `contacts.hullEnvelope.21.radius` | 0.14 | m | E (`contacts`) |
| `contacts.hullEnvelope.21.reference.x` | 4.02 | m | E (`contacts`) |
| `contacts.hullEnvelope.21.reference.y` | 0 | m | E (`contacts`) |
| `deckHardware.cleats.0.position.x` | 3.0703980174268213 | m | E (`deckHardware`) |
| `deckHardware.cleats.0.position.y` | -0.2765671802003314 | m | E (`deckHardware`) |
| `deckHardware.cleats.0.position.z` | 0.89 | m | E (`deckHardware`) |
| `deckHardware.cleats.0.attachment.x` | 3.1 | m | E (`deckHardware`) |
| `deckHardware.cleats.0.attachment.y` | -0.33999999999999997 | m | E (`deckHardware`) |
| `deckHardware.cleats.0.attachment.z` | 0.85 | m | E (`deckHardware`) |
| `deckHardware.cleats.1.position.x` | -3.0756269429277463 | m | E (`deckHardware`) |
| `deckHardware.cleats.1.position.y` | -0.5915230881021736 | m | E (`deckHardware`) |
| `deckHardware.cleats.1.position.z` | 0.7142857142857144 | m | E (`deckHardware`) |
| `deckHardware.cleats.1.attachment.x` | -3.1 | m | E (`deckHardware`) |
| `deckHardware.cleats.1.attachment.y` | -0.6571428571428571 | m | E (`deckHardware`) |
| `deckHardware.cleats.1.attachment.z` | 0.6742857142857144 | m | E (`deckHardware`) |
| `deckHardware.cleats.2.position.x` | 3.0703980174268213 | m | E (`deckHardware`) |
| `deckHardware.cleats.2.position.y` | 0.2765671802003314 | m | E (`deckHardware`) |
| `deckHardware.cleats.2.position.z` | 0.89 | m | E (`deckHardware`) |
| `deckHardware.cleats.2.attachment.x` | 3.1 | m | E (`deckHardware`) |
| `deckHardware.cleats.2.attachment.y` | 0.33999999999999997 | m | E (`deckHardware`) |
| `deckHardware.cleats.2.attachment.z` | 0.85 | m | E (`deckHardware`) |
| `deckHardware.cleats.3.position.x` | -3.0756269429277463 | m | E (`deckHardware`) |
| `deckHardware.cleats.3.position.y` | 0.5915230881021736 | m | E (`deckHardware`) |
| `deckHardware.cleats.3.position.z` | 0.7142857142857144 | m | E (`deckHardware`) |
| `deckHardware.cleats.3.attachment.x` | -3.1 | m | E (`deckHardware`) |
| `deckHardware.cleats.3.attachment.y` | 0.6571428571428571 | m | E (`deckHardware`) |
| `deckHardware.cleats.3.attachment.z` | 0.6742857142857144 | m | E (`deckHardware`) |
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
| `mooring.elasticity.workingLoadN` | 7000 | N | E (`mooring`) |
| `mooring.elasticity.dampingRatio` | 0.35 | 1 | E (`mooring`) |
| `mooring.elasticity.hardeningGain` | 8 | 1 | E (`mooring`) |
| `mooring.elasticity.maximumStrain` | 0.2 | 1 | E (`mooring`) |

## Qualification et essais utilisateur

Voir [le rapport commun](four-vessel-validation.md) et les résultats bruts associés. Les invariants et trajectoires vérifient la cohérence du modèle ; les références SO36i/Dufour ne constituent pas des mesures de ce bateau. Les paramètres estimés sont soumis à une sensibilité séparée à ±20 %, avec limites géométriques signalées.

Sélectionner le bateau dans « Profil du bateau ». Le changement réinitialise commandes et mouvement, conserve le port et mémorise le choix. Replacer le bateau si le scénario est incompatible avec son gabarit. La silhouette procédurale et les formes immergées affichées sont provisoires. La validation utilisateur porte sur les comportements ; le GLB spécifique appartient à la phase 2 encore non autorisée.
