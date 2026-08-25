---
name: validate-nautical-physics
description: "Auditer et valider les changements réellement physiques d'un simulateur nautique en temps réel : équations ou coefficients du corps rigide 3-DOF, coque, appendices, propulsion, gouvernes, vent, courant, contacts, aussières, profils de bateau et étalons physiques. Utiliser pour diagnostiquer un comportement marin ou modifier le moteur et ses tests. Ne pas déclencher pour une demande limitée au rendu, à l'UX, aux commandes, à la topologie du port ou à la documentation sans effet sur la physique."
---

# Validation de physique nautique

Appliquer un workflow scientifique reproductible. Séparer les invariants
universels, les enveloppes d'une classe de navires et la calibration propre à
un bateau.

## Charger les références utiles

- Lire [model-contract.md](references/model-contract.md) pour modifier les
  équations, repères, forces, intégrateurs, contacts ou contraintes.
- Lire [vessel-profile-schema.md](references/vessel-profile-schema.md) pour
  ajouter un bateau, changer une géométrie ou migrer un profil.
- Lire [validation-matrix.md](references/validation-matrix.md) pour créer des
  tests, modifier une fixture ou décider une release.
- Lire [literature-routing.md](references/literature-routing.md) pour chercher
  ou qualifier des coefficients et des données de calibration.

Lire chaque fichier sélectionné entièrement avant de modifier le moteur. Ne pas
charger les autres références par précaution.

## Suivre le workflow

### 1. Classer la demande et son risque

Classer le travail : diagnostic, loi physique, calibration, nouveau bateau,
scénario, fixture ou régression.

Choisir un niveau de validation :

- `local` : un composant ou coefficient sans changement de repère, d'intégrateur
  ni d'interface partagée ;
- `transversal` : repères, masse ou Coriolis, intégrateur, accumulateur de
  forces, courant relatif, schéma de profil ou solveur de contraintes ;
- `release` : qualification explicite du livrable complet.

Respecter l'autorisation demandée. Ne pas implémenter une correction lors d'un
simple audit. Ne pas élargir silencieusement le domaine de validité.

### 2. Établir le contrat et le baseline

Relever avant toute modification :

- repères, signes et unités ;
- vitesse fond, vitesse surface, courant et vent apparent ;
- classe et domaine de validité du profil ;
- masse, appendices, propulsion, gouvernes et surfaces aérodynamiques ;
- intégrateur, fréquence et contraintes ;
- tests, trajectoires et rapports existants.

Exécuter seulement le baseline pertinent avant édition. Conserver les résultats
bruts nécessaires à la comparaison.

Utiliser les scripts du skill quand l'API du projet est compatible :

```bash
node scripts/audit-vessel-profile.js --module <physics-core>
node scripts/check-passivity.js --module <physics-core>
node scripts/run-physics-matrix.js --module <physics-core>
node scripts/compare-trajectories.js <avant.json> <apres.json>
```

Adapter les chemins au dépôt. Ne jamais recopier les équations dans les
scripts : appeler l'API sans DOM du moteur.

### 3. Qualifier chaque donnée

Classer toute valeur touchée comme `official`, `measured`, `literature`,
`estimated` ou `calibrated`. Associer source, unité, incertitude et domaine.

Ne pas transférer un coefficient dimensionnel entre bateaux. Ne pas compléter
un nouveau profil depuis un bateau par défaut.

### 4. Modifier un composant à la fois

Centraliser les efforts dans un accumulateur exposant au minimum :

```js
{ X, Y, N, applicationPoint, power, source, category }
```

Conserver les lois dans le cœur et les paramètres dans les profils. Utiliser
des listes pour appendices, propulseurs et gouvernes, même si le bateau de
référence n'en possède qu'un.

Refuser les pivots fixés, couples correctifs, changements de signe ponctuels,
plafonds arbitraires et réglages uniquement destinés à améliorer le ressenti.

### 5. Valider dans l'ordre et s'arrêter au niveau requis

1. Vérifier finitude, unités et masse définie positive.
2. Vérifier signes, symétries et causalité.
3. Vérifier passivité et absence d'énergie spontanée.
4. Vérifier continuité, monotonie ou décrochage documenté.
5. Pour un changement transversal, vérifier convergence à 60, 120 et 240 Hz.
6. Vérifier les trajectoires et enveloppes affectées.
7. Balayer à ±20 % uniquement les paramètres estimés qui ont changé.
8. Vérifier déterminisme et coût temps réel si le chemin d'exécution change.
9. Pour une release, exécuter le verrou complet une fois, puis répéter seulement
   les tests de déterminisme ou trajectoires concernés.

Une trajectoire plausible ne compense jamais une violation analytique.

Une modification locale s'arrête après les invariants et cas numériques du
composant si elle ne touche aucun couplage. L'audit vent-courant n'est requis que
si les forces aérodynamiques, le courant relatif ou leur couplage changent.

### 6. Protéger les étalons

N'accepter une modification de fixture qu'avec :

- l'algorithme ou le coefficient causal identifié ;
- une justification physique ;
- une comparaison avant/après ;
- `profileId`, `profileVersion` et `physicsVersion` ;
- la validation des autres profils.

Ne jamais régénérer une fixture uniquement pour faire passer les tests.

### 7. Rendre un verdict explicite

Classer chaque résultat :

- conforme ;
- plausible mais non calibré ;
- hors enveloppe ;
- non testable faute de données ;
- bloquant pour release.

Documenter hypothèses, incertitudes, commandes exécutées et résultats. Ne
présenter ni une estimation bibliographique ni un modèle pédagogique comme
une mesure propre au bateau.

## Garde-fous multi-bateaux

Exiger un profil complet et versionné. Tester au minimum un petit croiseur, le
profil de référence et un grand croiseur aux limites du domaine.

Exécuter les invariants universels sur tous les profils. Appliquer les
enveloppes de classe sans les transformer en constantes universelles. Conserver
des trajectoires propres à chaque bateau.

Signaler immédiatement :

- une constante du bateau de référence cachée dans le cœur ;
- une configuration multiple gérée par un composant unique ;
- un coefficient dimensionnel copié entre tailles ;
- une géométrie de rendu utilisée comme hydrodynamique ;
- un profil incomplet fusionné silencieusement avec le profil par défaut.

## Limites

Ne pas revendiquer une précision de CFD, bassin ou essai réel. Signaler les
effets hors périmètre : vagues, faible profondeur, interaction entre navires,
élasticité ou rupture des lignes, selon le moteur audité.
