# Contrat d'un moteur nautique 3-DOF

## Sommaire

1. Domaine et repères
2. Équations de mouvement
3. Forces modulaires
4. Vent et courant
5. Propulsion et gouvernes
6. Contacts et aussières
7. Intégration et temps réel
8. Invariants

## 1. Domaine et repères

Déclarer le domaine avant de sélectionner un modèle : classe de coque, taille,
vitesse surface, profondeur relative, appendices et propulseurs.

Convention recommandée :

- monde nord-est ;
- cap nautique positif horaire ;
- axe bateau `x` vers l'étrave ;
- axe bateau `y` vers tribord ;
- lacet positif horaire ;
- mètres, secondes, kilogrammes, newtons et radians en interne.

Isoler toute conversion destinée au rendu ou à l'interface. Tester que
`bodyToWorld` et `worldToBody` sont inverses.

Ne pas confondre :

- vitesse fond : dérivée de la pose dans le repère monde ;
- vitesse surface : vitesse relative à l'eau ;
- vent vrai : vitesse de l'air dans le repère monde ;
- vent apparent : air moins vitesse fond ;
- courant : vitesse de l'eau dans le repère monde.

## 2. Équations de mouvement

Employer en 3-DOF :

```text
M ν̇r + C(νr) νr + D(νr) νr = τprop + τwind + τcontacts + τconstraints
νr = ν - νcurrent
```

Conserver explicitement :

- masse rigide ;
- masse ajoutée ;
- couplages dérive–lacet ;
- Coriolis rigide et ajouté ;
- rotation du courant constant lorsqu'il est exprimé dans le repère bateau.

Exiger une matrice de masse symétrique définie positive. Tester sa propriété,
pas seulement la finitude de ses coefficients.

La puissance des efforts passifs doit satisfaire :

```text
νr · τpassif <= ε
```

Le terme de Coriolis ne doit produire aucune puissance.

## 3. Forces modulaires

Faire retourner à chaque composant :

```js
{
  X,
  Y,
  N,
  applicationPoint: { x, y },
  power,
  source,
  category
}
```

Calculer le moment d'une force appliquée en `(x, y)` :

```text
N = x Y - y X + Nextra
```

Évaluer la puissance avec la vitesse locale, incluant le lacet.

Séparer au minimum :

- coque axiale ;
- cross-flow distribué ;
- appendices ;
- hélices ;
- gouvernes ;
- aérodynamique ;
- contacts ;
- aussières et actions humaines.

Ne pas fixer le point de pivot. Le calculer depuis le champ de vitesses :

```text
xpivot,eau = -vr / r
```

et distinguer le centre instantané fond.

## 4. Vent et courant

### Courant

Évaluer les forces hydrodynamiques avec la vitesse relative à l'eau. Un courant
uniforme ne crée plus de force lorsque le bateau suit la masse d'eau, hors
traînée dans l'air immobile.

Tester l'invariance galiléenne en translatant bateau et courant de la même
vitesse.

### Vent

Évaluer le vent apparent par rapport au fond. Utiliser des panneaux physiques
ou des polaires directionnelles `CX(β)`, `CY(β)` et `CN(β)`.

Éviter deux traînées indépendantes en `u|u|` et `v|v|` lorsque le moment et le
centre de pression doivent varier avec l'incidence.

Définir la hauteur de référence du vent. Si un profil vertical est appliqué,
le faire par panneau sans compter deux fois la réduction d'exposition.

## 5. Propulsion et gouvernes

### Hélice

Employer une loi quatre quadrants fonction de :

- régime signé ;
- diamètre ;
- pas ou `P/D` ;
- rapport de surface ;
- vitesse d'avance ;
- sens de rotation ;
- rapport de réduction.

Vérifier continuité aux axes régime/vitesse, crash-ahead, crash-back et
windmilling. Ne pas remplacer la poussée par `gaz²`.

### Gouverne

Évaluer l'écoulement local complet :

- translation ;
- dérive ;
- lacet ;
- courant ;
- jet de chaque propulseur amont.

Une gouverne sans écoulement ne produit rien. Une gouverne dans un jet peut
agir au point fixe. Conserver portance progressive, traînée et décrochage.

### Effet de pas

Traiter l'effet de pas comme un terme empirique identifiable, principalement
en marche arrière sous charge, décroissant avec l'erre. Tester son signe selon
le sens de l'hélice.

## 6. Contacts et aussières

### Contacts

Lier raideur et amortissement à la masse effective au point de contact.
Détecter le contact continûment ou corriger la position indépendamment du pas.
Vérifier absence de traversée à 60, 120 et 240 Hz.

### Aussières

Une aussière simple est une contrainte unilatérale :

- elle tire ;
- elle ne pousse pas ;
- elle peut prendre du mou ;
- sa loi constitutive doit être explicite dans le profil.

Pour une aussière viscoélastique, utiliser la masse effective `J M⁻¹ Jᵀ`, une
impulsion positive projetée et une loi passive raideur-amortissement. Vérifier
la charge au taux d'allongement de travail, la continuité, le durcissement et
l'énergie élastique. La correction de position ne doit être qu'une garde
numérique normalement inactive. Séparer force humaine, tension de ligne et
réglage de longueur.

## 7. Intégration et temps réel

Employer un pas physique fixe. Pour un mode accéléré, exécuter davantage de
pas complets ; ne pas agrandir le pas et ne pas réduire les itérations.

Comparer 60, 120 et 240 Hz. Mesurer moyenne et 95e percentile sur une matrice
représentative incluant contacts et contraintes.

Maintenir une complexité :

```text
O(Nsections + Nappendages + Ncontacts + Nlines)
```

avec des tailles bornées et documentées.

## 8. Invariants

Bloquer une release en cas de :

- NaN ou infini ;
- masse non positive ;
- énergie hydrodynamique spontanée ;
- force de gouverne sans écoulement ;
- inversion causale sous propulsion ;
- asymétrie inexpliquée ;
- courant agissant comme force permanente ;
- contact traversant ;
- aussière poussante, énergisante ou contraire à sa loi constitutive ;
- divergence avec le pas ;
- différence entre simulation normale et accélérée.
