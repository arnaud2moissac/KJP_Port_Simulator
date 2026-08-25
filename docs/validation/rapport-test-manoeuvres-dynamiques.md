# Rapport — départ dynamique sur pointe arrière au vent

## Verdict

**Plausible mais non calibré.** L'audit qualifie un modèle pédagogique, sans mesures instrumentées propres au Sun Odyssey 36i. Les seuils de temps expriment l'utilité de la manœuvre pour un équipage, pas une homologation du bateau réel.

- Profil : `sun-odyssey-36i-pedagogical` 5.2.0, schéma 3, physique 5.1.0.
- Révision Git : `9b5d063`.
- Généré le : 2026-08-25T15:30:12.881Z.
- Commande : `npm run audit:dynamic-mooring`.

## Contrat et géométrie

- Repère monde nord-est ; cap nautique horaire ; axe longitudinal vers l'étrave et transversal vers tribord.
- Cap initial 000°, courant nul, barre à 0°, tableau arrière à 1,0 m du quai.
- Pointe sur `stern-starboard`, taquet de quai décalé de 6,0 m au vent (environ 0,55 LOA) ; longueur initiale 6,43 m. Cette ouverture empêche le quai de devenir un troisième appui permanent.
- Vent établi et marche avant commandés simultanément. La chaîne moteur–embrayage–hélice et l'élasticité de ligne ne sont pas contournées.
- Le cas « 60 Hz » est une cadence d'appel : le moteur le subdivise en deux pas internes de 1/120 s. Le passage 120/240 Hz constitue la comparaison d'intégration réellement plus fine.

## Matrice vent–puissance

| Vent | Avant | Cap d'équilibre | Stabilisation | Oscillation finale | Tension moy. | Allongement max. | Appui quai final | Verdict |
|---:|---:|---:|---:|---:|---:|---:|---:|:---|
| 15 nd | 20 % | -49,2° | 50,2 s | 0,07° | 0,80 kN | 1,62 % | 100 % | Amélioration nécessaire |
| 15 nd | 40 % | -35,3° | 46,3 s | 0,10° | 1,13 kN | 2,52 % | 0 % | Plausible, non calibré |
| 15 nd | 60 % | -1,0° | 93,6 s | 0,08° | 1,42 kN | 3,47 % | 0 % | Amélioration nécessaire |
| 15 nd | 80 % | 133,9° | 169,4 s | 0,62° | 2,99 kN | 5,97 % | 100 % | Amélioration nécessaire |
| 15 nd | 100 % | 135,3° | 136,1 s | 0,00° | 3,41 kN | 6,74 % | 100 % | Amélioration nécessaire |
| 20 nd | 20 % | -53,8° | 37,3 s | 0,04° | 1,04 kN | 2,30 % | 100 % | Amélioration nécessaire |
| 20 nd | 40 % | -49,8° | 45,0 s | 0,04° | 1,37 kN | 2,78 % | 100 % | Amélioration nécessaire |
| 20 nd | 60 % | -44,9° | 42,4 s | 0,12° | 1,74 kN | 3,73 % | 0 % | Plausible, non calibré |
| 20 nd | 80 % | -31,7° | 34,9 s | 0,05° | 2,12 kN | 4,71 % | 0 % | Plausible, non calibré |
| 20 nd | 100 % | -18,8° | 26,1 s | 0,02° | 2,37 kN | 5,55 % | 0 % | Conforme |
| 25 nd | 20 % | -55,5° | 22,0 s | 0,05° | 1,38 kN | 3,46 % | 100 % | Amélioration nécessaire |
| 25 nd | 40 % | -53,5° | 33,5 s | 0,07° | 1,68 kN | 3,46 % | 100 % | Amélioration nécessaire |
| 25 nd | 60 % | -50,7° | 35,8 s | 0,06° | 2,04 kN | 4,05 % | 100 % | Amélioration nécessaire |
| 25 nd | 80 % | -48,3° | 42,3 s | 0,01° | 2,44 kN | 5,03 % | 100 % | Amélioration nécessaire |
| 25 nd | 100 % | -44,7° | 50,5 s | 0,09° | 2,73 kN | 5,86 % | 0 % | Plausible, non calibré |

Une stabilisation est dite conforme avant 30 s, marginale entre 30 et 60 s et insuffisante au-delà. Elle exige ensuite un cap dans ±3°, un lacet inférieur à 0.3°/s et une vitesse inférieure à 0.2 nd jusqu'à la fin du cas.

## Cas nominal — 20 nd, avant 60 %

- Cap d'équilibre : -44,89°.
- Stabilisation : 42,32 s.
- Plage de cap sur les 10 dernières secondes : 0,119° ; lacet RMS 0,012°/s.
- Vitesse de lacet maximale pendant l'établissement : 6,51°/s.
- Tension moyenne 1,741 kN, maximum 3,105 kN, allongement maximum 3,727 %.
- Résidu moyen de moment : 0,07 % du plus grand moment opposé.
- Moments moyens sur les 10 dernières secondes : vent 556 Nm, propulsion 0 Nm, aussière -641 Nm, somme -0 Nm.
- Pic de contact : 0,000 m/s ; garde d'allongement inactive.
- Présence d'un effort de contact dans la fenêtre finale : 0,0 % — équilibre sans appui permanent.
- Énergie spectrale au-dessus de 2 Hz : cap 0,0000 %, lacet 0,0000 %, tension 0,0000 %.
- Fréquence dominante du cap : 0,0220 Hz (45,5 s).
- Enveloppe des extrema : décroissante — conforme.
- Causalité : poussée avant oui, vent sous le vent oui, ligne vers le vent oui, ligne non poussante oui.

### Comparaison avant/après l'amortissement linéaire distribué

| Version | Fn linéaire | Cap | Stabilisation | Lacet max. | Tension moy. | Allongement max. |
|:---|---:|---:|---:|---:|---:|---:|
| Profil 5.1.0, physique 5.0.0 | 0 | -44,05° | 54,27 s | 6,74°/s | 1,739 kN | 3,775 % |
| Profil 5.2.0, physique 5.1.0 | 0,020 | -44,89° | 42,32 s | 6,51°/s | 1,741 kN | 3,727 % |

Le nouveau terme réduit le temps de stabilisation de 22,0 % sans changer la branche d'équilibre de plus de 0,84°.

Les trois trajectoires étalons de six secondes ont été réenregistrées pour les versions 5.2.0/5.1.0, après vérification de leur déterminisme. L'écart maximal imputable au nouveau terme reste de 3,4 mm en position, 0,067° en cap, 0,0025 m/s en vitesse latérale et 0,00027 m/s sur le pic de contact.

### Chronologie

| Temps | Cap | Lacet | Vitesse | Régime | Poussée | Tension | Allongement | N vent | N aussière |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 s | 0,0° | 0,00°/s | 0,00 nd | 860 tr/min | 0 N | 0,00 kN | 0,00 % | 626 Nm | -16 Nm |
| 5 s | -14,3° | -6,27°/s | 0,63 nd | 2466 tr/min | 1261 N | 2,59 kN | 2,75 % | 669 Nm | -4108 Nm |
| 10 s | -32,7° | -0,09°/s | 0,26 nd | 2476 tr/min | 1314 N | 1,32 kN | 1,55 % | 613 Nm | 998 Nm |
| 20 s | -30,2° | -1,46°/s | 0,23 nd | 2477 tr/min | 1318 N | 1,71 kN | 2,12 % | 628 Nm | -960 Nm |
| 30 s | -38,7° | -0,36°/s | 0,23 nd | 2477 tr/min | 1319 N | 1,70 kN | 2,13 % | 586 Nm | -536 Nm |
| 45 s | -45,5° | -0,24°/s | 0,11 nd | 2477 tr/min | 1316 N | 1,73 kN | 2,17 % | 548 Nm | -542 Nm |
| 60 s | -47,5° | 0,00°/s | 0,01 nd | 2477 tr/min | 1314 N | 1,74 kN | 2,18 % | 537 Nm | -593 Nm |
| 90 s | -44,7° | 0,09°/s | 0,03 nd | 2477 tr/min | 1313 N | 1,74 kN | 2,18 % | 559 Nm | -663 Nm |
| 120 s | -44,4° | -0,04°/s | 0,01 nd | 2477 tr/min | 1314 N | 1,74 kN | 2,17 % | 559 Nm | -636 Nm |
| 150 s | -45,1° | -0,00°/s | 0,00 nd | 2477 tr/min | 1314 N | 1,74 kN | 2,18 % | 554 Nm | -633 Nm |
| 180 s | -44,8° | 0,01°/s | 0,00 nd | 2477 tr/min | 1314 N | 1,74 kN | 2,18 % | 557 Nm | -641 Nm |

## Décomposition du mécanisme

| Cas | Cap final | Vitesse finale | Tension | Stabilisation | Lecture |
|:---|---:|---:|---:|---:|:---|
| Vent + moteur, sans aussière | 27,0° | 4,15 nd | 0,00 kN | — | Témoin de dérive libre attendue |
| Vent + aussière, sans moteur | -60,9° | 0,00 nd | 0,59 kN | 28,0 s | Référence fardage–ligne |
| Moteur + aussière, sans vent | 130,7° | 0,00 nd | 2,10 kN | 115,0 s | Référence moteur–ligne |
| Système complet | -44,9° | 0,00 nd | 1,74 kN | 42,4 s | Cas à qualifier |

Cette décomposition empêche d'attribuer à l'aussière un équilibre qui proviendrait seulement de la coque, du moteur ou du vent.

## Symétrie, perturbations et largage

- Miroir sans effet de pas/tourbillon : erreur de cap 0,000°, écart de tension 0,000 % — **conforme**.
- Miroir avec réglages normaux : erreur de cap 0,112°, écart de tension 0,850 % ; cette différence est descriptive.
- Échelon moteur +20 % pendant 10 s : Conforme, retour en 29,3 s, puis 1,30° de plage.
- Rafale +5 nd pendant 10 s : Conforme, retour en 11,7 s, puis 0,25° de plage.
- Largage : saut 0,000000000 m, 0,000000000°, métrique vitesse 0,000000000 — **conforme**.

## Convergence, déterminisme et passivité

- 60/120 Hz : 0,0000° et 0,0000 % de tension.
- 120/240 Hz : 0,0012° et 0,0120 % de tension.
- Fréquence dominante : écart 0,00 % entre 60/120 et 0,00 % entre 120/240.
- Verdict convergence : **conforme**. À 60 Hz, l'API exécute deux sous-pas internes de 1/120 s.
- Déterminisme 120 Hz : **bit à bit conforme** (empreinte `8de9cfb8869a36db…`).
- Décroissance après suppression du vent et passage au neutre : **conforme**, de 36,9 J à 0,8 J.

## Sensibilité ±20 %

| Paramètre | Cap vs nominal | Tension vs nominal | Stabilisation | Verdict |
|:---|---:|---:|---:|:---|
| Cross-flow linéaire −20 % | 0,08° | -0,0 % | 62,1 s | Amélioration nécessaire |
| Cross-flow linéaire +20 % | -0,02° | -0,0 % | 42,4 s | Plausible, non calibré |
| Fardage −20 % | 9,86° | -6,6 % | 40,1 s | Plausible, non calibré |
| Fardage +20 % | -3,51° | 6,3 % | 47,6 s | Amélioration nécessaire |
| Amortissement ligne −20 % | -0,00° | 0,0 % | 42,4 s | Plausible, non calibré |
| Amortissement ligne +20 % | 0,00° | -0,0 % | 42,4 s | Plausible, non calibré |

Le fardage et le prior de cross-flow linéaire ont une incertitude annoncée de 20 %. L'aussière représente une amarre polyester générique, avec une incertitude annoncée de 25 % ; ces résultats ne sont donc pas des mesures du bateau réel.

## Régimes d'équilibre et rotation à 15 nd

Chaque cellule donne le cap nautique final et la durée nécessaire avant stabilisation. « Rotation » indique qu'aucun équilibre n'est atteint pendant les 180 s du palier. Les paliers sont chaînés sans réinitialiser le bateau, l'aussière, la propulsion ou les vitesses. Le quai est retiré de cette analyse afin d'exclure tout troisième appui.

| Puissance | Aller 120 Hz | Aller 240 Hz | Retour 120 Hz | Retour 240 Hz |
|---:|---:|---:|---:|---:|
| 0 % | -82,1° / 77 s | -82,1° / 77 s | -82,8° / 49 s | -82,8° / 49 s |
| 5 % | -66,3° / 49 s | -66,3° / 49 s | -64,2° / 20 s | -64,2° / 20 s |
| 10 % | -63,4° / 20 s | -63,4° / 20 s | -60,2° / 20 s | -60,2° / 20 s |
| 15 % | -60,6° / 20 s | -60,6° / 20 s | -56,1° / 20 s | -56,1° / 20 s |
| 20 % | -57,1° / 20 s | -57,1° / 20 s | -52,2° / 20 s | -52,2° / 20 s |
| 25 % | -52,9° / 20 s | -52,9° / 20 s | -48,3° / 25 s | -48,3° / 25 s |
| 30 % | -48,6° / 20 s | -48,6° / 20 s | -42,3° / 20 s | -42,3° / 20 s |
| 35 % | -44,1° / 20 s | -44,2° / 20 s | -37,7° / 24 s | -37,7° / 24 s |
| 40 % | -39,5° / 20 s | -39,5° / 20 s | -31,5° / 27 s | -31,5° / 27 s |
| 45 % | -33,6° / 24 s | -33,6° / 24 s | -24,1° / 27 s | -24,2° / 27 s |
| 50 % | -28,8° / 20 s | -28,8° / 20 s | -16,8° / 59 s | -16,8° / 59 s |
| 55 % | -21,8° / 25 s | -21,8° / 25 s | 2,5° / 20 s | 2,5° / 20 s |
| 60 % | -14,0° / 27 s | -14,0° / 27 s | 3,5° / 20 s | 3,5° / 20 s |
| 65 % | -1,5° / 40 s | -1,5° / 40 s | -0,4° / 72 s | -0,4° / 73 s |
| 70 % | rotation / 180 s | rotation / 180 s | rotation / 180 s | rotation / 180 s |
| 75 % | rotation / 180 s | rotation / 180 s | rotation / 180 s | rotation / 180 s |
| 80 % | rotation / 180 s | rotation / 180 s | rotation / 180 s | rotation / 180 s |
| 85 % | rotation / 180 s | rotation / 180 s | rotation / 180 s | rotation / 180 s |
| 90 % | rotation / 180 s | rotation / 180 s | rotation / 180 s | rotation / 180 s |
| 95 % | rotation / 180 s | rotation / 180 s | rotation / 180 s | rotation / 180 s |
| 100 % | rotation / 180 s | rotation / 180 s | rotation / 180 s | rotation / 180 s |

- Premier palier sans équilibre à l'aller : 70 % à 120 Hz et 70 % à 240 Hz, écart 0 points.
- Premier palier sans équilibre au retour : 70 % à 120 Hz et 70 % à 240 Hz, écart 0 points.
- Verdict de stabilité numérique des branches : **conforme**.

## Spécifications correctives conditionnelles

- **P2 — limite d'équilibre documentée.** Le saut de la matrice grossière (15 nd, 60→80 % : 134,9°) correspond, sans appui du quai, à l'entrée dans une rotation continue au-dessus de 65 % de puissance. La limite est identique à 120/240 Hz : ne pas créer artificiellement un équilibre ni lisser la trajectoire.

## Limites

Le test exclut courant, vagues, faible profondeur, interaction hydrodynamique avec le quai, rafales spatiales, rupture et ragage. Il valide la causalité, la stabilité numérique et la plausibilité opérationnelle du couplage actuel ; il ne revendique ni CFD ni jumeau numérique certifié.
