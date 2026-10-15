# Dufour 310 Grand Large 2014 — dossier du profil bi-safran

## Statut et domaine

Le profil `dufour-310-gl-2014-deep-keel-experimental` représente le Dufour 310
Grand Large de 2014 avec quille fixe profonde de 1,90 m, moteur Volvo Penta
D1-20 sur sail-drive et hélice bipale fixe. Il est destiné aux manœuvres de port
en eau profonde, bateau à plat, entre 0 et 4 nœuds de vitesse surface.

**Verdict attendu : plausible mais non calibré.** Il n'existe dans les sources
consultées ni essai de giration instrumenté, ni polaire de safran, ni cotes
complètes des appendices. Le profil ne revendique donc pas la précision d'un
essai réel, d'un bassin ou d'une CFD. La gîte, l'émersion du safran au vent, les
vagues, le squat, les effets de berge et de faible profondeur sont exclus.

Le profil du Sun Odyssey 36i reste inchangé. Aucune valeur dimensionnelle de ce
profil n'est utilisée comme valeur par défaut du Dufour.

## Sources et arbitrages

| Source | Ce qu'elle établit | Limites d'emploi |
| --- | --- | --- |
| Manuel propriétaire Dufour, 5 mars 2014, p. 11 | LOA 9,67 m, coque 9,36 m, largeur 3,31 m, tirant d'eau 1,90 m, lest 1 300 kg, déplacement lège 4 917 kg, condition minimale 5 154 kg | La ligne moteur porte « 20 CV / 28 kW », incohérente avec le D1-20 et les essais ; les 28 kW sont écartés. |
| Manuel, p. 23 et 60 | Double barre à roue, système à drosses/chaînes, organes de gouverne | Le dessin ne cote pas les safrans. |
| Manuel, p. 72 | Implantation d'une hélice, d'un sail-drive et du moteur | Le plan n'est pas coté. |
| Voile Magazine, juin 2014 | LWL 8,70 m, déplacement 4 940 kg, Volvo D1-20 sail-drive 18 ch, 6 nd à 2 000 tr/min et 7,5 nd à 3 200 tr/min ; absence du « coup de fouet » au bi-safran | Le bateau essayé portait une bipale repliable optionnelle ; ses performances ne calibrent pas l'hélice fixe retenue. |
| YACHT, no 7/2014 | 4,9 t, moteur Volvo 13,8 kW / 19 PS, doubles safrans jugés manœuvrants | Pas de mesures de manœuvre portuaire publiées. |
| YACHT, spécial bi-safran 2024 | Absence de soufflage direct au point fixe ; bonne efficacité dès que l'écoulement sur les safrans est établi ; essais qualitatifs sur le Dufour 310 | Source de mécanisme et d'enveloppe qualitative, pas de coefficient propre au Dufour. |
| Volvo Penta, D1-20/130S | Puissance vilebrequin 13,8 kW / 18,8 hp | Documentation courante ; la configuration exacte de l'inverseur du bateau essayé n'est pas publiée. |
| Plan SailboatLab | Forme en plan, tableau large, implantation relative de la quille et des deux safrans | Image non cotée ; toute mesure dérivée est une estimation recalée sur LOA et largeur. |
| Témoignages 1A Yachtcharter | Difficulté initiale sous moteur car l'hélice ne souffle pas les safrans ; gouverne retrouvée avec de l'erre | Témoignages non instrumentés, utilisés seulement comme contrôle qualitatif. |

Les essais donnent parfois 3,20 m de largeur et 4 940 kg de déplacement. Le
profil retient les 3,31 m et 4 917 kg du manuel constructeur, tout en conservant
ces divergences dans l'incertitude. Les PDF Dufour ont été consultés par leur
texte indexé lorsque le serveur refusait le téléchargement direct ; cette limite
est consignée dans `bibliographie/biblio.txt`.

## Chargement de référence

La masse de croisière légère est calculée sans repartir de la « condition
minimale » du manuel, afin de ne pas compter deux fois personnes et liquides :

```text
4 917 kg  déplacement lège constructeur
  150 kg  deux personnes de 75 kg
  160 kg  160 litres d'eau douce
   76 kg  90 litres de gazole à 0,84 kg/l
  100 kg  armement et équipement courant
---------
5 403 kg  calcul, arrondi à 5 400 kg dans le profil
```

L'incertitude de 8 % couvre les définitions de pesée, les options et la charge
réelle. Le réglage utilisateur reste une calibration bornée autour de cette
masse ; il ne modifie pas les autres paramètres du profil.

## Paramètres numériques

Les incertitudes sont relatives, sauf lorsque l'unité est explicitement donnée.
Les valeurs `estimated` doivent être balayées au minimum à ±20 % pendant la
validation. Les surfaces et positions des appendices sont des équivalents 3-DOF.

| Chemin / famille | Valeur du profil | Unité | Classe | Incertitude et méthode |
| --- | ---: | --- | --- | --- |
| `geometry.loa` | 9,67 | m | official | ±0,01 m, manuel |
| `geometry.lwl` | 8,70 | m | measured | ±0,05 m, essais de 2014 |
| `geometry.lpp` | 8,45 | m | estimated | ±5 %, déduite du plan |
| `geometry.beam` | 3,31 | m | official | ±0,01 m, manuel prioritaire |
| `geometry.draft` | 1,90 | m | official | ±0,02 m, quille profonde |
| `geometry.canoeDraft` | 0,58 | m | estimated | ±20 %, plan latéral |
| `geometry.wettedArea` | 24,5 | m² | estimated | ±20 %, coque de 9,36 m, largeur 3,31 m |
| sections immergées, poupe vers étrave | 0,72 / 0,88 / 0,97 / 1,00 / 0,98 / 0,94 / 0,86 / 0,73 / 0,57 / 0,38 / 0,17 | fraction de largeur | estimated | ±20 %, forme propre au Dufour numérisée sur le plan ; aucun coefficient du Sun Odyssey |
| `mass.lightDisplacement` | 4 917 | kg | official | ±3 %, définition constructeur |
| `mass.displacement` | 5 400 | kg | estimated | ±8 %, calcul de chargement ci-dessus |
| `mass.centerOfGravity` | (0,00 ; 0,00) | m | estimated | ±0,25 m longitudinal ; symétrie transversale |
| `mass.yawRadius` | 2,18 | m | estimated | ±15 %, 0,25 LWL |
| masse ajoutée surge / section | 0,070 / 0,35 | sans dimension | literature | ±20 %, modèle sectionnel basse vitesse |
| résistance surge linéaire / quadratique | 82 / 78 | N/(m/s), N/(m/s)² | estimated | ±25 %, prior indépendant pour déplacement et LWL |
| montée de vague / seuil | 30 / 1,95 | N/(m/s)², m/s | estimated | ±25 %, seuil de Froude basse vitesse |
| cross-flow `cd` / aire | 1,08 / 0,70 | sans dimension | literature | ±20 %, sections de coque distribuées |
| amortissement linéaire cross-flow | 0,020 | Froude | literature | ±20 %, régularisation basse vitesse |
| quille : position | (-0,05 ; 0 ; -1,16) | m | estimated | ±0,20 m, plan latéral |
| quille : aire / envergure / AR | 2,65 / 1,32 / 1,55 | m², m, sans dimension | estimated | ±25 %, équivalent de quille profonde |
| moteur | D1-20, 13,8 kW, 850–3 200 tr/min | mixte | official | puissance Volvo ; ralenti ±100 tr/min |
| sail-drive | 130S, rapports 2,19 / 2,19 | sans dimension | official | ±2 %, documentation de famille D1-20/130S |
| hélice : position | (-2,82 ; 0 ; -0,68) | m | estimated | ±0,20 m, plan d'implantation |
| hélice : diamètre / pas | 0,38 / 0,27 | m | estimated | ±15 %, bipale fixe compatible D1-20/130S |
| hélice : nombre de pales / AE/A0 | 2 / 0,38 | — | estimated | ±20 % sur AE/A0 |
| hélice : table quatre quadrants | prior bipale `Kt/Kq` périodique | sans dimension | literature | ±25 %, non calibré sur l'hélice du bateau |
| effet de pas : base / gain | 0,035 / 0,13 | sans dimension | estimated | ±30 %, hélice droite supposée |
| safrans : positions | x -3,92 ; y ±1,03 ; z -0,76 | m | estimated | ±0,15 m, plan recalé |
| chaque safran : aire / envergure / AR | 0,31 / 0,82 / 2,17 | m², m, sans dimension | estimated | ±25 %, deux surfaces identiques |
| chaque safran : mèche | 24 % de corde | fraction | estimated | ±0,08, profil compensé équivalent |
| safrans : angle / vitesse | 35 / 50 | degrés, degrés/s | estimated | ±10 %, commande commune |
| safrans : jet d'hélice | aucune source | — | official + literature | mécanisme attesté ; `slipstreamSources: []` |
| fardage | rail propre au Dufour ; rouf arrière 2 × 2,05 m² ; rouf avant 2 × 1,25 m² ; bôme 2 × 0,80 m² ; mât et gréement 1,75 m² | m², m | estimated | ±25 %, panneaux explicitement cotés sur le plan recalé, sans mise à l'échelle des panneaux du Sun Odyssey |
| enveloppe de contact | rail recalé, rayon 0,20 | m | estimated | ±0,03 m, contact 2D |
| pare-battages | diamètre 0,32, trois par bord | m | estimated | ±0,05 m |
| taquets | avant, milieu, arrière par bord | m | estimated | ±0,10 m, points fonctionnels |
| aussière de référence | 10 kN à 15 % d'allongement | N, fraction | calibrated | ±25 %, profil pédagogique pour bateau de 5,4 t |

## Adaptations architecturales

Le moteur sait déjà itérer `profile.rudders` et calculer, pour chaque gouverne,
l'écoulement local dû à la translation, la dérive, le lacet, le courant et les
jets explicitement reliés. Le Dufour utilise donc deux composants complets avec
une liste de jets vide. Il n'ajoute ni coefficient « bi-safran », ni seuil de
vitesse, ni couple correctif.

Le profil actif doit devenir la source des dimensions du bateau joueur, des
contacts, taquets, pare-battages, limites de masse et repères pédagogiques. La
géométrie de référence d'un port reste celle du Sun Odyssey et ne change pas
lors de la sélection. Le renderer consomme une présentation reconstruite lors
du changement de profil ; il ne fournit aucune donnée au moteur.

La représentation des mèches reste verticale dans le modèle 3-DOF. Leur
inclinaison réelle est absorbée dans les positions et surfaces planes
équivalentes. Cette approximation est adaptée au bateau à plat mais ne modélise
pas la variation d'immersion à la gîte.

## Validation requise

1. Vérifier schéma complet, provenance, finitude et matrice de masse définie
   positive pour les quatre profils du catalogue de validation.
2. Vérifier les deux contributions de gouverne, leur symétrie et l'absence de
   supplément d'hélice au point fixe.
3. Vérifier un effort nul sans écoulement et une réponse continue avec l'erre
   avant et arrière, sans zone morte.
4. Vérifier accélération, coast-down, inversion, girations et manœuvres avec
   aussières aux pas 60, 120 et 240 Hz.
5. Balayer à ±20 % les surfaces, positions, inertie, résistance et coefficients
   estimés ; étendre à ±30 % l'effet de pas.
6. Comparer exactement les résultats existants du Sun Odyssey avant/après sans
   régénérer ses fixtures.
7. Vérifier le changement de profil, la persistance, le placement, les
   scénarios et les deux chemins de rendu.

L'acceptation de cette première version signifie seulement que les invariants,
les mécanismes et l'enveloppe qualitative sont respectés. Une calibration de
giration ou d'arrêt exigera ultérieurement des essais spécifiques au Dufour 310.
