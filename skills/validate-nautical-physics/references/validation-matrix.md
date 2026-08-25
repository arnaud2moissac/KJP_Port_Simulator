# Matrice de validation physique

## Sommaire

1. Pyramide de validation
2. Analytique
3. Composants
4. Trajectoires
5. Vent et courant
6. Contacts et aussières
7. Multi-bateaux
8. Sensibilité, performance et release
9. Politique des étalons

## 1. Pyramide de validation

Valider dans cet ordre :

1. invariants mathématiques ;
2. composants isolés ;
3. couplages ;
4. trajectoires ;
5. enveloppes empiriques ;
6. sensibilité ;
7. performance et intégration navigateur.

Ne pas utiliser une trajectoire étalon pour cacher une erreur analytique.

## 2. Analytique

Tester pour chaque profil :

- matrice de masse symétrique définie positive ;
- transformations de repères inverses ;
- immobilité sans force ;
- finitude sur une grille d'états ;
- puissance passive non positive ;
- énergie décroissante au neutre ;
- Coriolis sans puissance ;
- invariance sous courant uniforme ;
- déterminisme bit à bit à entrée identique.

Échantillonner au minimum :

- surge positif, nul et négatif ;
- dérive positive, nulle et négative ;
- lacet positif, nul et négatif ;
- combinaisons aux limites du domaine.

## 3. Composants

### Propulsion

- quatre quadrants ;
- continuité aux axes ;
- poussée et régime croissants avec la commande ;
- marche avant causant une avance ;
- marche arrière causant une erre arrière ;
- windmilling opposé à l'erre ;
- effet de pas du bon côté ;
- symétrie sans effet de pas.

### Gouverne

- zéro sans écoulement ;
- effet au point fixe dans le jet avant ;
- réponse progressive 0°, 5°, 15°, 25° ;
- saturation ou décrochage documenté ;
- pas de rotation sur place sans propulseur transversal ;
- pivot avant en marche avant et arrière en marche arrière stabilisée.

### Coque et appendices

- traînée opposée au mouvement ;
- coast-down monotone ;
- cross-flow distribué ;
- polarité continue à grande dérive ;
- pas de double comptage coque/quille.

## 4. Trajectoires

Tester :

- accélérations droites par cran de gaz ;
- coast-down ;
- crash-stop depuis plusieurs erres ;
- inversion arrière–avant ;
- girations avant et arrière ;
- barre maximale sans rotation sur place ;
- scénarios portuaires sans obstacle puis avec obstacles.

Comparer 60, 120 et 240 Hz. Mesurer positions, cap, vitesses, lacet, forces et
contacts à des temps fixes.

Normaliser les comparaisons entre bateaux par longueur, déplacement et temps
caractéristique lorsque cela a un sens. Ne pas exiger des trajectoires
absolues identiques.

## 5. Vent et courant

### Vent statique

Balayer 0–360° par pas de 5° à plusieurs vitesses :

- zéro à vent nul ;
- loi quadratique à coefficients constants ;
- symétrie bâbord/tribord ;
- dissymétrie avant/arrière documentée ;
- centre de pression fini et directionnel ;
- continuité des polaires.

### Courant

Balayer directions et vitesses :

- hydrodynamique évaluée avec `νr` ;
- absence de force à `νr = 0` ;
- invariance galiléenne ;
- entraînement progressif ;
- aucune énergie spontanée.

### Couplage

Combiner vent et courant :

- même sens ;
- opposés ;
- perpendiculaires ;
- angle de 45°.

Tester que le courant change la vitesse fond et que celle-ci modifie le vent
apparent. Ne pas additionner simplement deux dérives terminales.

## 6. Contacts et aussières

### Contacts

- seuils d'impact ;
- force opposée à la pénétration ;
- friction bornée ;
- absence de traversée ;
- convergence temporelle ;
- stabilité avec plusieurs contacts.

### Aussières

- ligne détendue inactive ;
- tension positive uniquement ;
- charge de travail atteinte au taux d'allongement spécifié ;
- tension continue, monotone et durcissante au-delà de l'allongement de travail ;
- énergie cinétique plus énergie élastique non croissante sans force extérieure ;
- oscillations amorties et garde d'allongement normalement inactive ;
- bras de levier ;
- paire symétrique ;
- stabilité au nombre maximal de lignes ;
- force humaine séparée de la contrainte ;
- convergence de la longueur actuelle vers la consigne sans saut instantané ;
- aucune victoire artificielle contre une propulsion supérieure.

## 7. Multi-bateaux

Exécuter la suite sur :

- petite limite synthétique ;
- référence calibrée ;
- grande limite synthétique ;
- chaque profil commercial ajouté.

Vérifier :

- aucun héritage implicite ;
- composants multiples réellement itérés ;
- positions cohérentes avec `L` et `B` ;
- masse et contact stables ;
- caméra, port et rendu sans constante physique cachée ;
- coût indépendant de la taille géométrique à nombre de composants égal.

## 8. Sensibilité, performance et release

Balayer ±20 % sur les paramètres estimés. Les signes, symétries, causalité et
passivité doivent rester invariants.

Mesurer moyenne et 95e percentile par pas sur :

- navigation libre ;
- barre et propulsion ;
- vent et courant ;
- contacts ;
- nombre maximal d'aussières ;
- mode accéléré.

Le mode accéléré exécute les mêmes pas complets.

Pour un changement local, exécuter les invariants et scénarios du composant.
Pour un changement transversal, ajouter convergence, trajectoires affectées et
performance. Pour une release, exécuter le verrou complet une fois. Répéter
uniquement les tests de déterminisme et les trajectoires concernées ; réserver
une seconde suite complète à une qualification qui l'exige explicitement.

Exiger :

- mêmes trajectoires ;
- aucune erreur navigateur ;
- build livré identique aux sources ;
- absence de réseau si le livrable est hors ligne.

## 9. Politique des étalons

Stocker dans chaque fixture :

```json
{
  "profileId": "...",
  "profileVersion": "...",
  "physicsVersion": "...",
  "dt": 0.008333333333333333,
  "scenario": "...",
  "samples": []
}
```

Exiger dans le rapport de modification :

- cause ;
- source ou justification ;
- métriques avant/après ;
- effets sur les autres profils ;
- tests de convergence ;
- auteur de l'acceptation si le projet le suit.

Ne jamais offrir une commande de mise à jour silencieuse des fixtures.
