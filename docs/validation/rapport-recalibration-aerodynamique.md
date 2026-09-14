# Recalibration aérodynamique basse vitesse

État courant au 14 septembre 2026 : moteur physique `5.4.0`, profil
`sun-odyssey-36i-pedagogical` `5.5.0`. Les sections qui suivent conservent les
mesures intermédiaires `5.3.0/5.4.0`; le complément en fin de document consigne
leur réexamen après l'essai utilisateur à 30 nd.

Date : 14 septembre 2026. État de départ : branche `codex/threejs-v2`, commit
`82e1031`, moteur physique `5.2.0`, profil `sun-odyssey-36i-pedagogical`
`5.3.0`.

## Cause et évolution de loi

Le moteur calculait le vent apparent une seule fois au centre du bateau puis
multipliait ce vecteur complet par le facteur de hauteur de chaque panneau.
Cette formulation avait deux conséquences : la vitesse due au lacet du panneau
était absente et le gradient vertical réduisait aussi la vitesse propre du
bateau. La version physique `5.3.0` évalue désormais chaque panneau avec :

```text
airLocal = ventVraiÀLaHauteurDuPanneau
         - [u - r yPanneau, v + r xPanneau]
```

La force, son bras de levier et le moment `N = xY - yX` restent accumulés par le
même mécanisme. L'intégrateur, la matrice de masse, le courant relatif, la coque,
la quille, le safran, la propulsion, les contacts, les aussières et les commandes
ne sont pas modifiés. Les diagnostics exposent le vent vrai local, la vitesse du
panneau, le vent apparent local et la dissipation aérodynamique afin que la loi
reste testable sans recopier son calcul.

## Recalibration du profil

Le profil `5.4.0` retire la translation globale de `-0,30 m` qui était appliquée
à tous les centres aérodynamiques. Les coordonnées déclarées redeviennent les
centres propres des composants : franc-bord, rouf, bôme, mât et faces avant et
arrière. Pour les profils synthétiques, les positions longitudinales et
verticales suivent l'échelle de longueur, les positions transversales l'échelle
de largeur et les surfaces l'échelle quadratique. La validation rejette un
centre de panneau hors du gabarit émergé.

La géométrie des panneaux est classée `estimated` : elle provient des vues de
profil et de pont publiées pour le Sun Odyssey 36i, avec contrôle de cohérence
sur le GLB versionné. Ce GLB reste une référence visuelle approximative marquée
`noPhysicsData`; il n'est jamais lu par le moteur. Les coefficients restent une
calibration pédagogique de corps non profilés contrainte par l'enveloppe de
dérive USCG pour un voilier habitable moyen. L'incertitude déclarée reste 20 %.
Aucune mesure propre au Sun Odyssey 36i n'est revendiquée.

## Bilan avant/après

Cas commun : bateau libre initialement arrêté, cap nord, 12 nd de vent venant de
tribord, sans courant, moteur au neutre et barre au centre.

| Grandeur | Avant | Après |
|---|---:|---:|
| Force latérale initiale | -337,5 N | -337,5 N |
| Moment aérodynamique initial | +225,3 N·m | +124,1 N·m |
| Centre aérodynamique longitudinal `N/Y` | -0,6676 m | -0,3676 m |
| Centre de résistance à `v=-0,2 m/s` | -0,5234 m | -0,5234 m |
| Cap à 300 s | +8,11° au vent | -6,27° sous le vent |
| Dérive à 300 s | 0,425 nd | 0,429 nd |

Le centre aérodynamique final se trouve `0,1558 m` devant le centre de
résistance observé en dérive pure. La rotation résulte donc du bilan entre les
forces d'air et d'eau. Aucun couple correcteur, pivot fixe, seuil de cap ou
coefficient dépendant du scénario n'est introduit.

La matrice de validation réservée donne, après 300 s sous vent de travers :

| Vent | Tribord | Bâbord |
|---|---:|---:|
| 6 nd | -2,28° | +2,28° |
| 12 nd | -6,27° | +6,27° |
| 20 nd | -7,59° | +7,59° |

Les incidences 60° et 120°, les vents opposés, les courants alignés, opposés et
obliques, ainsi que les commandes moteur avant, neutre et arrière restent finis
et causaux. Ces résultats sont mécaniquement cohérents et qualitativement
plausibles ; ils ne constituent pas une calibration mesurée du modèle réel.

## Validation et étalons

- `npm run verify:physics` : réussi, 46/46 contrôles. Cela comprend les trois
  profils, la passivité, les couplages, la convergence 60/120/240 Hz, la
  sensibilité ±20 %, les contacts et les aussières.
- `npm run check:wind-current` : réussi. Toutes les gates de force, moment,
  dérive, courant, symétrie, abattée et causalité sous puissance sont vraies.
- `npm run test:e2e` : réussi, 48/48 contrôles sur le HTML autonome, dont
  l'abattée symétrique en eau libre et les trajectoires déterministes.
- `npm run build:simulator` et le contrôle de build inclus dans
  `verify:physics` : réussis.

Les trajectoires sans vent ont changé très légèrement parce que la traînée dans
l'air calme n'est plus réduite par le gradient vertical. Deux relectures dans le
test navigateur sont identiques. À six secondes, les écarts maximaux avec
l'étalon `5.3.0/5.2.0` sont `0,1083 mm` en x, `0,0783 mm` en y,
`0,0001515°` en cap, `0,0717 mm/s` en vitesse longitudinale et
`0,001175 m/s` sur le pic de contact. La fixture `5.4.0/5.3.0` enregistre ces
résultats causalement attribués à la nouvelle loi.

Une première tentative du contrôle navigateur utilisait `(0,0)`, position en
contact avec le port, et a été rejetée comme preuve de dérive libre. Le contrôle
final utilise l'eau libre autour de `(25,48)` pendant 60 s. Les limites restantes
sont l'absence d'essais réels, de soufflerie ou de CFD, ainsi que les exclusions
déjà déclarées du moteur : vagues, faible profondeur, squat et effet de berge.

## Complément : transitoire de lacet sous 30 nd

Le cas reproduit est celui de l'interface : cap initial 180°, vent vrai de 30 nd
venant du 089°, courant nul, barre au centre, moteur au neutre, aucun obstacle ni
aussière. Avec le profil `5.4.0`, le bateau lofait d'abord de 2,39° puis inversait
son lacet et atteignait un équilibre à 7,10° sous le vent. Cet équilibre était
mathématiquement fini, mais le lof initial n'était pas justifié par la géométrie
versionnée : les deux panneaux manuels attribuaient 7,0 m² au franc-bord arrière
et 4,4 m² à l'avant. L'intégration du rail de fargue donne respectivement
5,145 m² et 5,726 m², avec un centroïde de l'aire latérale à `x=+0,268 m`.

Le profil `5.5.0` construit donc tous les panneaux de franc-bord à partir des
segments du rail et de la flottaison. Chaque panneau possède l'aire, la normale
et le centroïde de la surface réglée correspondante. La fermeture du tableau
est elle aussi dérivée du premier segment. Les anciennes faces manuelles de
proue et de tableau sont retirées afin de ne pas compter deux fois leur aire
longitudinale. Le rouf, la bôme et le gréement restent des estimations explicites.
Cette construction est commune aux trois tailles de profil et ne dépend ni du
vent, ni d'un cap, ni d'une trajectoire cible.

L'audit a également montré que la pression normale d'un panneau utilisait
`Vnormal × |Vtotal|`, tandis que sa traînée tangentielle utilisait sa propre
composante au carré. La version physique `5.4.0` applique désormais la loi
quadratique cohérente :

```text
Fnormal = 1/2 rho Cd A Vnormal |Vnormal|
```

La force reste calculée avec le vent apparent local du panneau et accumulée à
son centre réel. Cette évolution ne change ni la matrice de masse, ni la coque,
ni les appendices, ni le courant, ni la propulsion, ni les commandes. Elle suit
la structure générale des efforts extérieurs du
[modèle de Fossen](https://www.fossen.biz/html/marineCraftModel.html). La
recommandation [ITTC 2024](https://ittc.info/media/11806/75-02-03-019.pdf)
confirme que forces latérales et moments de lacet doivent participer ensemble
à l'équilibre ; ses coefficients de navires marchands ne sont pas transférés au
yacht.

### Mesures du cas reproduit

| Grandeur | Avant `5.3.0/5.4.0` | Après `5.4.0/5.5.0` |
|---|---:|---:|
| Moment aérodynamique initial | -789,9 N·m, au lof | +55,7 N·m, à l'abattée |
| Centre aérodynamique initial `N/Y` | -0,3740 m | +0,0286 m |
| Accélération angulaire initiale | -0,600°/s² | +0,0716°/s² |
| Écart de cap à 5 s | -2,39° | +2,75° |
| Pic de lacet sur 300 s | non relevé | 1,87°/s |
| Écart de cap à 25 s | +7,74° | +24,55° |
| Équilibre à 300 s | +7,10° | +22,51° |
| Vitesse surface à l'équilibre | 1,196 nd | 1,130 nd |

Le lof parasite a disparu : l'écart de cap reste du côté de l'abattée à chaque
pas contrôlé. Le léger dépassement à 24,62° puis le retour amorti à 22,51°
résultent du bilan air-eau, sans pivot ni couple imposé. À 12 nd de travers, la
force initiale vaut 312,3 N, le rapport de dérive terminale 3,33 %, et les caps
terminaux sont symétriques à ±23,40°. Le contrôle USCG de 4 % demeure une
enveloppe de catégorie, pas une mesure du Sun Odyssey 36i.

Une branche longitudinale stable existe lorsque le bateau est déjà presque
exactement vent arrière. Elle atteint 0,987 nd sous 12 nd, car la résistance
axiale est plus faible que la résistance latérale. Elle est testée séparément et
reste classée plausible mais non calibrée. L'absence d'essais réels empêche de
présenter comme mesurés le cap d'équilibre, le pic de lacet ou cette branche.

### Validation du complément

- `npm run check:wind-current` : réussi. Les quatre intensités 6, 12, 20 et
  30 nd abattent dès la première seconde des deux bords ; symétrie, finitude,
  couplages sous courant et causalité moteur sont vérifiés.
- `npm run verify:physics` : 48 contrôles réussis sur 49 au premier passage. Le
  seul échec était l'ancienne assertion qui limitait à 2 % la composante
  longitudinale sous vent de travers et attendait au moins 330 N. La surface
  intégrée produit 6,27 % et 312,3 N ; la borne de direction est passée à 8 %
  et l'enveloppe de force a été resserrée à 300–420 N. Le rerun ciblé
  `npm run test:physics:core` réussit 29/29. Les 4 contrôles de contacts et les
  16 contrôles d'environnement avaient réussi dans le passage transversal.
- `npm run test:e2e` : le premier passage a identifié deux écarts expliqués. Le
  défi d'aussières atteint 20° après 25,25 s ; sa fenêtre de test passe de 25 à
  26 s sans modifier le scénario. Les trajectoires ont ensuite été reproduites
  deux fois bit à bit avant actualisation de la fixture `5.5.0/5.4.0`. Par
  rapport à `5.4.0/5.3.0`, les écarts maximaux à six secondes sont inférieurs à
  0,20 mm en position, 0,00016° en cap et 0,13 mm/s en vitesse. Le second
  passage réussit 48/48.
- `npm run build:simulator` puis le contrôle de build inclus dans
  `verify:physics` : réussis ; le HTML autonome contient les versions courantes.

Les vérifications navigateur sont automatisées et exécutées avec Chromium sans
affichage. Aucun essai en mer, bassin, soufflerie ou CFD n'a été réalisé.
