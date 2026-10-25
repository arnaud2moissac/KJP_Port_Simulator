# Quatre nouveaux bateaux — livraison de phase 1

21 octobre 2026 · branche `codex/four-vessel-profiles` · base `5c9dbfc7a9647d2af10d91af761882293894ddab`. Route `physics-check`, avec contrôle UI ciblé. **Verdict des nouveaux profils : plausible mais non calibré ; validation utilisateur encore attendue.**

Le SO26 a été écarté parce que son inventaire constructeur décrit deux safrans. Conformément à votre choix de conserver un petit croiseur moderne monosafran, il est remplacé par le **Sun Odyssey 24.2 quillard inboard**. Les trois autres ajouts sont Contessa 26 britannique Maclan, Pogo 40 S4 2021 et Oceanis 48 Europe 2017 à quille longue. Tous sont sélectionnables, mémorisés et pilotables avec une silhouette procédurale provisoire.

## Contrat conservé

Moteur 6.0.0, profils schéma 5 et Three r186. Aucune équation, force commune, intégration, commande, interpolation ou collision commune n'est modifiée. `physics-core.js` conserve le SHA-256 `06032b6c3075061bd37a154d02720b3332728ce4ee65fcb19204733fc7f94251`. Les nouveaux objets sont complets et indépendants ; leur bloc `steering` décrit le type de commande et la vitesse maximale de safran. Aucun clonage d’un profil commercial et aucun appel à `scaledSyntheticProfile()` ne sert à les définir. Le SO36i reste le défaut.

Le 24 octobre 2026, les trois profils à barre franche passent en version 1.1.2 sur demande utilisateur : vitesse maximale de **100°/s** pour le SO24.2, le Contessa 26 et chaque safran du Pogo 40 S4. Cette valeur remplace les réglages précédents de 63, 58 et 60°/s. Les profils à roue restent inchangés. Ces réglages sont estimés ; les rapports de phase 1 ci-dessous restent les résultats historiques, avec leurs anciennes vitesses.

Les archives avant/après de 120 scénarios SO36i et 120 Dufour sont identiques octet pour octet, y compris états et diagnostics échantillonnés à 10 Hz. Une vérification supplémentaire couvre les B/B2 prolongés jusqu’au premier changement de signe de u. Les 24 signatures permanentes conservent leurs empreintes originales ; l’horizon réel de l’arrêt Dufour (7,508333 s) est explicité pour éviter de comparer deux durées différentes. Voir [preuve et empreintes](four-vessel-results/exact-regression.json) et [fixture permanente](../../tests/fixtures/vessel-reference-signatures.json).

## Configurations et données

- [Sun Odyssey 24.2](sun-odyssey-24-2-fixed-keel.md) : paramètres SI, sources/pages, méthodes, classes A–F, incertitudes, chargement, matrice et limites.
- [Contessa 26](contessa-26-long-keel.md) : paramètres SI, sources/pages, méthodes, classes A–F, incertitudes, chargement, matrice et limites.
- [Pogo 40 S4](pogo-40-s4-twin-rudder.md) : paramètres SI, sources/pages, méthodes, classes A–F, incertitudes, chargement, matrice et limites.
- [Oceanis 48](oceanis-48-fixed-keel.md) : paramètres SI, sources/pages, méthodes, classes A–F, incertitudes, chargement, matrice et limites.

Les documents utilisés et les refus d’archivage sont inscrits dans [la bibliographie](../../bibliographie/biblio.txt). Les PDF/HTML originaux sont dans `bibliographie/`. Les divergences de déplacement, de réservoir, de quille et de motorisation restent visibles dans les fiches. La lettre A d’une puissance moteur ne certifie pas son installation sur une unité particulière. Les coefficients numériques de masse ajoutée, résistance, polaires et hélice sont des estimations, même lorsque leur cadre de calcul est documenté dans la littérature.

Les chaînes SO24.2 et Pogo sont des **équivalents de manœuvre** : modèle/rapport exacts d’une unité, dimensions d’hélice et certaines rotations restent estimés. La brochure Pogo documente un Lombardini 30 cv sans désignation précise ; le LDW1003 SD actuel de 27 hp n’est pas assimilé à ce moteur. L’Oceanis retenu est le millésime 2017 80 cv, compatible 4JH80/SD60 ; le rapport et l’hélice d’une unité restent à confirmer. Aucun de ces montages n’est présenté comme une chaîne constructeur intégralement identifiée. Ces hypothèses doivent être acceptées ou corrigées lors de la validation utilisateur avant de figer les profils.

## Banc commun et résultats

Les 120 protocoles par bateau couvrent A, B, B2, C, D, E, F, G, H, I, J et K, soit **720 cas commerciaux**. Le runner emploie exclusivement l’API physique sans DOM pour les efforts et l’intégration. L’énergie cinétique est un diagnostic calculé avec la matrice fournie, pas une nouvelle loi de force. Il utilise 1/120 s, origine/cap nord, courant nul, multiplicateurs à 1, masse nominale, effet de pas 0,6 sauf variantes à zéro. Enregistrement à 10 Hz et aux franchissements de vitesse/arrêt/inversion ; extrema suivis à chaque pas. Les commandes, états initiaux, composants, puissances et tensions sont conservés dans les JSON gzip.

B part d’une chaîne au neutre et d’une erre de 2 nd ; B2 conserve la chaîne en charge au changement de marche. Le runner poursuit l’arrêt motorisé après le seuil de 0,1 nd pour enregistrer séparément le premier u=0. Les contacts K sont placés à 5 cm de l’enveloppe du bateau ; les ancrages de lignes sont à 3 m du taquet correspondant, avec 3,5 m de longueur pour la ligne détendue et 3 m pour les lignes tendues. Les taquets de milieu sont exclus du gréement symétrique à quatre lignes. Les scénarios I ont exactement le même pilotage pour tous.

[JSON de métriques et empreintes](four-vessel-results/summary.json), [CSV avec attendu/résultat/écart/interprétation/confiance pour chaque cas](four-vessel-results/metrics.csv), [sensibilité et convergence](four-vessel-results/diagnostics.json). Les cellules vides et `null` signifient indisponible ou non applicable, jamais zéro. Les temps de seuil sont quantifiés au pas de simulation. La distance d’arrêt est la longueur du trajet jusqu’au seuil de 0,1 nd ; celle de B2 exclut la phase d’accélération.

| Bateau | Masse kg | Inertie rigide kg·m² | Masse ajoutée sway kg | Inertie ajoutée kg·m² |
|---|---:|---:|---:|---:|
| Sun Odyssey 36i | 6500 | 50235 | 3765 | 21630 |
| Dufour 310 Grand Large 2014 | 5400 | 25663 | 2518 | 13030 |
| Sun Odyssey 24.2 | 2100 | 5443 | 867 | 2484 |
| Contessa 26 | 2500 | 7744 | 853 | 1822 |
| Pogo 40 S4 | 4880 | 42468 | 1645 | 14503 |
| Oceanis 48 | 13200 | 175857 | 9046 | 117962 |

| Bateau | A gaz 0,30 à 30 s, nd | B neutre : m / s | B arrière 0,60 : m / s | Premier u=0 en arrière, s |
|---|---:|---:|---:|---:|
| Sun Odyssey 36i | 3.00 | 42.22 / 156.93 | 4.98 / 9.28 | 9.63 |
| Dufour 310 Grand Large 2014 | 3.01 | 41.20 / 152.66 | 4.16 / 7.51 | 7.78 |
| Sun Odyssey 24.2 | 2.18 | 26.65 / 99.47 | 5.12 / 9.80 | 10.29 |
| Contessa 26 | 2.10 | 22.51 / 85.67 | 4.18 / 7.75 | 8.03 |
| Pogo 40 S4 | 3.27 | 41.78 / 154.86 | 3.62 / 6.45 | 6.75 |
| Oceanis 48 | indisponible (>4 nd) | 52.94 / 197.47 | 3.08 / 5.48 | 5.68 |

| Bateau | Δcap D +25° à 120 s | Δcap J, r initial +2°/s, u=0 | Vent 12 nd : vitesse finale, nd | Pic tension sous 12 nd, N |
|---|---:|---:|---:|---:|
| Sun Odyssey 36i | -762.5° | 39.8° | 0.399 | 286.3 |
| Dufour 310 Grand Large 2014 | -749.2° | 36.8° | 0.439 | 274.5 |
| Sun Odyssey 24.2 | -754.7° | 34.0° | 0.587 | 144.6 |
| Contessa 26 | -412.0° | 24.7° | 0.461 | 112.0 |
| Pogo 40 S4 | -637.4° | 30.4° | 1.204 | 408.8 |
| Oceanis 48 | -779.9° | 35.1° | 0.429 | 494.1 |

Les Δcaps sont déroulés. Le vent vient de 90°, sans erre initiale. La vitesse finale combine dérive et rotation ; elle ne mesure pas un coefficient de vent isolé. Aucun rayon instantané n’est présenté comme un cercle stabilisé. La comparaison de stabilité directionnelle repose ici sur le retour de lacet/dérive au neutre, pas sur un critère expérimental de stabilité en route.

### Lecture des comparaisons

- **SO24.2 / Contessa** : sous r initial +2°/s au neutre, le Contessa accumule 24,69° contre 33,98° pour le SO24.2. La distribution de quille accroît l’amortissement du lacet. Sous vent traversier de 12 nd, les vitesses finales sont 0,461 et 0,587 nd ; à gaz 0,30, leurs accélérations restent proches. Les réponses arrière dépendent aussi de la rotation gauche documentée du YS8, de la géométrie et du jet : elles ne doivent pas être attribuées seulement à la quille longue.
- **SO36i / Oceanis** : la masse augmente de 6500 à 13200 kg et l’inertie rigide de 50235 à 175857 kg·m². L’arrêt au neutre passe de 42,22 à 52,94 m. En arrière à 0,60, il passe de 4,98 à 3,08 m avec la propulsion 80 cv estimée : la masse ne suffit pas à classer un freinage. La tension de ligne sous vent 12 nd passe de 286 à 494 N, mais la vitesse de dérive ne suit pas ce rapport.
- **Dufour / Pogo** : deux safrans écartés sans jet central direct dans les deux cas. Le Pogo est plus large (4,42 contre 3,31 m), plus léger (4880 contre 5400 kg), mais son inertie rigide est plus élevée (42468 contre 25663 kg·m²). Le rapport masse/largeur passe de 1631 à 1104 kg/m. Son comportement ne s’obtient pas en amplifiant un coefficient de bi-safran.
- **SO36i / Pogo** : le Pogo est plus long mais moins massif ; à gaz 0,30 il atteint 3,27 nd contre 3,00 nd à 30 s. Sous 12 nd traversiers, sa vitesse finale de dérive est environ 1,20 nd contre 0,40 nd. Ce résultat combine fardage estimé, masse, inertie et résistance latérale ; il n’est pas une mesure de ces bateaux.

### Domaine et valeurs manquantes

| Bateau | Cas complets | Cas interrompus >4 nd | G avec un panneau >20 nd apparents | Garde aussière, pas | Pénétration maximale K, m |
|---|---:|---:|---:|---:|---:|
| Sun Odyssey 36i | 119 | 1 | 0 | 0 | 0.0517 |
| Dufour 310 Grand Large 2014 | 119 | 1 | 0 | 0 | 0.0451 |
| Sun Odyssey 24.2 | 120 | 0 | 0 | 0 | 0.0463 |
| Contessa 26 | 120 | 0 | 0 | 0 | 0.0481 |
| Pogo 40 S4 | 117 | 3 | 0 | 0 | 0.0425 |
| Oceanis 48 | 110 | 10 | 0 | 0 | 0.0513 |

Le seuil de 4 nd arrête le segment qualifié au premier pas qui le franchit ; le moteur n’est pas plafonné. La plage de vent apparent 0–20 nd est une plage d’estimation du fardage, pas une limite constructeur ni une validation de soufflerie. Aucun des cas G exécutés ne la dépasse sur les panneaux du modèle ; les vitesses par panneau restent dans les enregistrements. Les résultats suivants sont indisponibles à leur échéance prévue :

- Sun Odyssey 36i : `A.0.5` à 29.90 s.
- Dufour 310 Grand Large 2014 : `A.0.5` à 29.46 s.
- Pogo 40 S4 : `A.0.5` à 20.36 s, `C.0.5.walk0.6` à 24.17 s, `C.0.5.walk0` à 24.15 s.
- Oceanis 48 : `A.0.3` à 20.32 s, `A.0.5` à 11.35 s, `C.0.3.walk0.6` à 24.37 s, `C.0.5.walk0.6` à 14.04 s, `C.0.3.walk0` à 24.32 s, `C.0.5.walk0` à 14.03 s, `D.-15` à 25.89 s, `D.15` à 26.06 s, `H.0.25.1.0.3.0.6` à 19.55 s, `H.0.25.1.0.3.0` à 19.55 s.

## Invariants, discrétisation et sensibilité

Les huit profils, y compris les deux synthétiques, passent validation/compilation, finitude, immutabilité, matrice définie positive, immobilité, passivité, symétries et courant uniforme. Les cas nouveaux vérifient causalité avant/arrière, puissance moteur bornée, géométrie des organes, capacités de taquets et absence de garde systématique. Ces contrôles établissent une cohérence du modèle et de son domaine ; ils ne remplacent pas des essais réels.

**Contessa** : aire du contour équivalent 3.26925 m², centre x=-0.93670 m. La découpe conserve aire et premiers moments. Sur 18 états combinant u=0/0,5/1 m/s, v=−0,2/0/+0,2 m/s et r=±0,03 rad/s, les maxima 7/14 bandes sont 0.788 % en force latérale et 2.984 % en moment significatif (>1 N ou N·m), sous les 5 % prévus. La variante concentrée conserve la force en translation pure mais réduit nettement l’amortissement en rotation ; les chiffres sont dans [le diagnostic](four-vessel-results/contessa-bands.json). Le contour lui-même reste estimé visuellement et non numérisé sur un plan coté.

**Pogo** : deux gouvernes distinctes et symétriques, sans source de jet. Pour 0°, ±15°, ±25° et jusqu’à ±35°, le bord de corde le plus proche reste à au moins 1.612 m de l’axe, contre un rayon de disque central de 0.190 m avant contraction. Voir [la borne géométrique](four-vessel-results/pogo-jet.json). Les diagnostics F gardent recouvrement et lavage nuls pour chacun des deux safrans ; aucune force artificielle n’est ajoutée à l’arrêt.

La sensibilité comprend **100 familles, deux variantes ±20 % par profil**, soit 800 variantes. Les composants symétriques et les bandes d’un même contour sont variés ensemble. Elle couvre masse/inertie, sections de carène, résistances, polaires, gouvernes, chaîne moteur/inverseur/arbre/hélice, coefficients des tables quatre quadrants, panneaux de vent et équipements. Les bornes d’immersion, de position, d’efficacité et d’élasticité sont appliquées et leurs valeurs effectives consignées. Les coordonnées nulles de symétrie, axes imposés et comptages de discrétisation ne sont pas des degrés de liberté continus ; les contours complets ne sont pas redessinés aléatoirement. Cette étude locale ne fournit ni distribution probabiliste ni intervalle de prédiction réel.

| Bateau | Variantes | Variantes bornées | Finitude / passivité / matrice |
|---|---:|---:|---|
| Sun Odyssey 24.2 | 200 | 8 | OK |
| Contessa 26 | 200 | 9 | OK |
| Pogo 40 S4 | 200 | 7 | OK |
| Oceanis 48 | 200 | 7 | OK |

Les trajectoires de sensibilité durent 8 s et sont associées à D, G ou K selon le paramètre ; elles ne prétendent pas caractériser tous les régimes sur 120 s. Les valeurs documentaires non consommées peuvent produire exactement zéro écart dynamique ; cela est cohérent avec leur statut. Aucune calibration F sur bateau réel n’a été réalisée.

## Convergence effective

Le regroupement 60 Hz = deux sous-pas de 120 Hz est vérifié exactement. La convergence effective compare 120/240/480 Hz sur tous les 57 protocoles B2, D, F et K de chacun des quatre nouveaux profils (228 triplets). Seuils inchangés : position ≤1 % de LOA, cap ≤0,5°, vitesse ≤0,01 m/s, lacet ≤0,001 rad/s. B2 fixe l’instant d’inversion mesuré à 120 Hz et compare la même durée de chaîne en charge, jusqu’à 5 s après inversion ; D/F/K utilisent respectivement 120/10/60 s. Pour les D de l’Oceanis qui dépassent 4 nd, l’horizon commun est arrêté deux pas avant le franchissement mesuré à 120 Hz ; la durée retenue et la limitation de domaine sont enregistrées. Les trois fréquences sont comparées à cet instant identique. Les critères portent sur les deux couples 120/240 et 240/480, pas sur un regroupement 60/120 artificiellement identique.

| Bateau | Écart max position, m | Cap, ° | Vitesse, m/s | Lacet, rad/s | Verdict |
|---|---:|---:|---:|---:|---|
| Sun Odyssey 24.2 | 0.008192 | 0.09787 | 0.000131 | 0.0000134 | OK |
| Contessa 26 | 0.003204 | 0.03465 | 0.000318 | 0.0000137 | OK |
| Pogo 40 S4 | 0.006542 | 0.08460 | 0.000178 | 0.0000143 | OK |
| Oceanis 48 | 0.011067 | 0.05055 | 0.000247 | 0.0000134 | OK |

## Contrôles exécutés

- Build et `check:simulator` ; schéma et moteur inchangés.
- `test:physics:profiles` : 11/11 ; `test:physics:core` : 37/37 ; `test:physics:environment` : 20/20 ; `test:physics:contacts` : 7/7.
- `check:wind-current` ; tests de routage 4/4 ; localisation unitaire 4/4 et contrôle des 3 catalogues (518 messages chacun).
- Matrice commune 720 cas, 800 variantes de sensibilité, convergence et preuves de régression décrites ci-dessus.
- `validate:ui -- --product simulator --case controls.60` : les six choix, persistance, changements, commandes remises à zéro, port conservé, navigation effective des quatre ajouts avec barre/gaz et états physiques identiques sur les chemins natif/Canvas, absence de GLB pour les nouveaux profils.
- `validate:ui -- --product simulator --case trajectories.51` : trois trajectoires étalons exactement conservées.
- Inspection de Navigation, Comprendre/Translation et Comprendre/Rotation pour les quatre silhouettes ; aucune erreur console/page constatée dans le navigateur instrumenté.

Aucune qualification globale de release n’a été exécutée. Les artefacts bruts et captures sont référencés par [le manifeste](four-vessel-results/artifacts.json) ; ils sont conservés hors Git pour éviter d’ajouter plusieurs centaines de Mo d’enregistrements au dépôt. Les métriques, preuves et diagnostics compacts restent dans ce dossier.

## Essai manuel et décision attendue

1. Ouvrir `simulateur-port.html` construit, cliquer le descriptif du bateau en en-tête puis choisir un des quatre profils expérimentaux dans « Profil du bateau ». Le choix persiste au rechargement.
2. Choisir une zone libre adaptée au gabarit, météo calme, courant nul, masse nominale et réglages experts à 1. En cas de demande de placement, placer le bateau avant de démarrer.
3. Comparer SO24.2/Contessa à faible erre, arrêt au neutre, marche arrière et barre ±25°. Comparer le départ du Pogo sans erre puis avec erre ; les deux safrans ne reçoivent pas de jet central.
4. Comparer SO36i/Oceanis : inertie, arrêt au neutre puis freinage arrière, dérive sous 12 nd et quatre lignes symétriques. Ne pas attendre le même classement sur tous les critères.
5. Vérifier les lectures Translation/Rotation, puis recharger et changer à nouveau de profil ; le port doit rester le même et les commandes repartir au neutre.
6. Rapporter bateau, scénario, conditions, commandes et comportement observé. Valider explicitement les comportements et les approximations de chaîne propulsive, ou demander leur correction.

La silhouette immergée, particulièrement la quille longue du Contessa, est non contractuelle et ne prouve pas la géométrie physique. Les limites importantes restent : absence d’essais instrumentés, coefficients hydrodynamiques estimés, chaînes partiellement identifiées, contour de quille estimé, absence d’interaction quille–safran et de masses ajoutées propres aux appendices, bateau à plat et eau profonde.

**Arrêt de phase 1 : aucun GLB spécifique n’est créé et aucun module du renderer n’est modifié. La phase 2 reste interdite sans votre validation explicite.** Aucune publication, fusion ou release GitHub n’est incluse.

## Fichiers de cette évolution

`src/simulateur-port/vessel-profiles.js`, `template.html`, les trois catalogues `locales/`, `simulateur-port.html` généré ; `scripts/qualify-vessel-profiles.js`, `scripts/run-validation.js`, `package.json` ; `tests/physics/vessel-catalogue.test.js`, `port-physics.test.js`, `wind-current-profiles.test.js`, `tests/fixtures/vessel-reference-signatures.json`, `tests/simulateur-port.test.js`, `tests/validation-routing.test.js` ; les quatre fiches, ce rapport et `four-vessel-results/` ; `bibliographie/biblio.txt` et les archives nautiques ajoutées. Les modifications antérieures du générateur et de sa localisation sont préservées. `graphify update .` exécuté avec graphify 0.9.79+kjp.1 : extraction AST sans API ; PDF non indexés par cet environnement graphify sans extra pypdf, archives nautiques conservées.
