# Audit des paramètres de « Calibration experte »

- Date de l'audit : 2 octobre 2026
- Livrable testé : `simulateur-port.html?test=1`
- Moteur physique : `5.5.0`
Profil : `sun-odyssey-36i-pedagogical` `5.6.0`, schéma `3`

## Verdict

Cinq curseurs sur six produisent aux bornes l'effet annoncé et restent cohérents
avec le contrat physique du simulateur. Le curseur **Effet de pas · hélice
droitière** augmente bien l'effet entre 0 et 100 %, mais son minimum affiché à
`0 %` ne le supprime pas : une force transversale et un moment de lacet résiduels
restent actifs. Le bilan global est donc **5 conformes, 1 partiellement conforme**.

| Paramètre | Minimum | Maximum | Effet attendu | Résultat | Verdict |
| --- | ---: | ---: | --- | --- | --- |
| Masse en charge | 5 700 kg | 7 800 kg | Une masse plus élevée réduit l'accélération sous un même effort | La masse et la matrice d'inertie augmentent ; l'accélération latérale sous le même vent diminue de 18,2 % | Conforme |
| Fardage | 60 % | 140 % | Les efforts aérodynamiques suivent le multiplicateur | Force multipliée par 2,333, exactement comme `140 / 60` | Conforme |
| Efficacité du safran | 60 % | 140 % | Le safran produit davantage de force et de moment | Force instantanée multipliée par 2,333 ; réponse de giration plus forte mais non linéaire | Conforme |
| Résistance latérale | 60 % | 140 % | La dérive est davantage freinée | Effort latéral multiplié par 2,333 ; vitesse de dérive résiduelle réduite de 61,4 % après 20 s | Conforme |
| Effet de pas | 0 % | 100 % | Le maximum renforce l'effet ; `0 %` devrait l'annuler | Le maximum renforce bien l'effet, mais le minimum conserve 35,4 N et 122,1 N·m dans le cas testé | Partiellement conforme |
| Frapper une aussière sous | 0,1 nd | 1,0 nd | Le seuil d'autorisation suit strictement le curseur | Juste sous la borne : autorisé ; à la borne et au-dessus : refusé | Conforme |

## Méthode

Chaque curseur a été déplacé par événement `input` à sa borne minimale puis à
sa borne maximale dans le livrable HTML généré. La valeur de l'élément, son
readout et sa propagation vers le moteur ou la règle d'amarrage ont été relevés.

Les effets ont ensuite été isolés avec le même moteur physique, sans obstacle,
au pas nominal de `1/120 s` :

- masse et fardage : bateau immobile, vent de travers de 12 nd ;
- safran : vitesse initiale de 1 m/s, barre à 25°, puis trajectoire de 8 s ;
- résistance latérale : dérive initiale de 0,6 m/s, puis décroissance libre de 20 s ;
- effet de pas : marche arrière à 70 % pendant 5 s, barre au centre ;
- aussière : règle d'autorisation évaluée juste sous, exactement à et juste au-dessus du seuil.

Tous les autres réglages ont été remis à leur valeur nominale entre deux essais.
Les forces comparées sont celles exposées par l'accumulateur du moteur, sans
reproduction externe des équations.

## Résultats détaillés

### Masse en charge — conforme

Le curseur affiche correctement `5 700 kg` et `7 800 kg`. La masse rigide reçue
par le moteur vaut exactement 5 700 puis 7 800 kg.

| Mesure | 5 700 kg | 7 800 kg |
| --- | ---: | ---: |
| Diagonale de masse en avance | 6 127,5 kg | 8 385,0 kg |
| Diagonale de masse en dérive | 9 465,5 kg | 11 565,5 kg |
| Diagonale de masse en lacet | 65 682,3 kg·m² | 81 912,0 kg·m² |
| Force de vent latérale | -311,72 N | -311,72 N |
| Accélération latérale | -0,03294 m/s² | -0,02696 m/s² |

La force extérieure reste identique tandis que l'accélération diminue avec la
masse. Les matrices aux deux bornes restent finies, symétriques et définies
positives.

### Fardage — conforme

Les readouts affichent correctement `60 %` et `140 %`. Sous le même vent de
travers de 12 nd, la résultante passe approximativement de 187,4 N à 437,3 N.
Chaque composante de force et le moment sont multipliés par `2,333333`, rapport
exact des deux positions du curseur. L'accélération varie dans le même sens.

### Efficacité du safran — conforme

Les readouts affichent correctement `60 %` et `140 %`. À état et angle de barre
quasi identiques, le moment instantané du safran passe de `-1 245,2 N·m` à
`-2 906,1 N·m` dans le moteur intégré, soit un rapport exact de `2,333333`.

Sur la trajectoire de 8 s, la valeur absolue de la vitesse de lacet passe de
`0,1382 rad/s` à `0,1479 rad/s`, et celle du changement de cap de `0,647 rad` à
`0,833 rad`. La réponse globale n'est pas proportionnelle au multiplicateur :
la coque, la quille, le décrochage progressif et le changement d'état du bateau
réagissent à leur tour. Cette non-linéarité est attendue ; le signe et la
causalité restent corrects.

### Résistance latérale — conforme

Les readouts affichent correctement `60 %` et `140 %`. Pour une dérive initiale
de 0,6 m/s, la résultante hydrodynamique latérale opposée au mouvement passe de
`1 095,7 N` à `2 556,6 N`, soit le rapport exact `2,333333`.

Après 20 s de décroissance libre, la vitesse de dérive résiduelle vaut :

- `0,0982 m/s` à 60 % ;
- `0,0379 m/s` à 140 %.

Le réglage maximal amortit donc nettement plus la dérive, sans inversion du
sens résistant ni état non fini.

### Effet de pas · hélice droitière — partiellement conforme

Le curseur et son readout passent correctement de `0 %` à `100 %`, et la valeur
transmise à l'environnement passe de `0` à `1`. En marche arrière, le maximum
renforce bien le mouvement attendu : la poupe part du même côté et le lacet
garde le même signe.

| Mesure après 5 s de marche arrière | 0 % | 100 % |
| --- | ---: | ---: |
| Force transversale « Effet de pas » | -35,4 N | -161,5 N |
| Moment de lacet | 122,1 N·m | 557,0 N·m |
| Vitesse de dérive | -0,00526 m/s | -0,02272 m/s |
| Vitesse de lacet | 0,00467 rad/s | 0,01991 rad/s |

Le minimum n'est toutefois pas un arrêt de l'effet. La loi utilise
`walkBase + walkGain × réglage`, avec `walkBase = 0,045` et `walkGain = 0,16`.
À `0 %`, la composante tourbillonnaire liée au réglage disparaît, mais la
composante transversale de base subsiste. L'affichage `0 %` suggère au contraire
une annulation complète. Deux corrections seraient cohérentes, à arbitrer dans
un changement distinct :

1. faire de `0 %` une annulation réelle de toutes les composantes réglables ;
2. conserver la loi physique actuelle, mais renommer et documenter le curseur
   comme une variation autour d'un effet minimal non nul.

Cet audit ne modifie pas le moteur.

### Frapper une aussière sous — conforme

Le readout affiche correctement `0,1 nd` puis `1,0 nd`. La règle correspond au
libellé « sous » et utilise une comparaison stricte :

| Seuil | Juste dessous | À la limite | Juste au-dessus |
| --- | --- | --- | --- |
| 0,1 nd | Autorisé à 0,0999 nd | Refusé à 0,1 nd | Refusé à 0,1001 nd |
| 1,0 nd | Autorisé à 0,9999 nd | Refusé à 1,0 nd | Refusé à 1,0001 nd |

Ce réglage est une règle d'interaction, pas un coefficient du solveur physique.

## Contrôles exécutés

- `npm run check:build` : réussi ; livrable autonome et topologie validés.
- Audit navigateur ciblé : six curseurs testés aux deux bornes ; aucune erreur
  console ou page ; renderer natif actif, `glError = 0`.
- `npm run test:physics:environment` : réussi, 16/16 contrôles.
- `npm run test:physics:core` : 28/29 contrôles réussis. Les contrôles
  fonctionnels, de sensibilité et de finitude passent ; seul le budget de
  performance échoue (`1,077 ms/pas` de moyenne lors de l'exécution concurrente).
- Relance isolée du seul test de budget : échec marginal du 95e percentile à
  `1,014 ms/pas` pour une limite stricte de `< 1 ms/pas`.

Le dépassement de performance est reproductible mais très faible et indépendant
des positions de curseur : aucun code n'a été changé pendant l'audit. Il doit
être suivi séparément si le budget temps réel constitue une gate de release.

## Périmètre et limites

L'audit porte sur le bateau réellement exposé par l'interface. Il vérifie la
causalité, les signes, la finitude et la monotonie entre les deux bornes ; il ne
revendique pas une calibration mesurée du Sun Odyssey 36i. Les scénarios
existants rappellent que les coefficients aérodynamiques, hydrodynamiques et
d'effet de pas restent des calibrations pédagogiques dans leur domaine de basse
vitesse.

Les sources consultées pour cet audit sont uniquement internes au dépôt :
`src/simulateur-port/template.html`, `src/simulateur-port/physics-core.js`,
`src/simulateur-port/vessel-profiles.js` et les suites `tests/physics/`. Aucune
source externe n'a été ajoutée à la bibliographie.
