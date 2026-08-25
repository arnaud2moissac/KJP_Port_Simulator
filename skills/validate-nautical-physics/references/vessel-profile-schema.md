# Profils physiques multi-bateaux

## Sommaire

1. Principes
2. Schéma recommandé
3. Compilation
4. Normalisation et mise à l'échelle
5. Provenance
6. Migration d'un profil par défaut
7. Validation multi-bateaux

## 1. Principes

Séparer :

- le cœur : lois et intégrateur ;
- le profil complet : géométrie et composants du bateau ;
- le patch de calibration : multiplicateurs utilisateur explicitement bornés ;
- l'état : pose, vitesses, actionneurs et contacts.

Ne jamais fusionner un nouveau bateau incomplet avec un bateau de référence.
Autoriser l'héritage seulement entre variantes explicitement déclarées et
validées d'une même coque.

Versionner le schéma et chaque profil.

## 2. Schéma recommandé

```js
{
  schemaVersion: 1,
  id: "builder-model-variant",
  version: "1.0.0",
  name: "Nom lisible",
  modelClass: "displacement-sailing-monohull",
  validity: {
    speedThroughWaterKn: [0, 4],
    minimumDepthToDraftRatio: 4,
    excludedEffects: ["waves", "shallow-water"]
  },
  geometry: {
    loa, lwl, lpp, beam, draft, canoeDraft, wettedArea,
    hullSections: [{ x, dx, breadth, immersedDepth, shape }]
  },
  mass: {
    displacement,
    centerOfGravity: { x, y },
    yawRadius,
    addedMassModel: { type, coefficients }
  },
  hull: {
    axialResistance: { type, coefficients },
    crossFlow: { type, coefficients }
  },
  appendages: [
    {
      id, type, position: { x, y, z },
      area, span, aspectRatio, coefficients
    }
  ],
  propulsors: [
    {
      id, type, position, axis, rotation,
      engine, gearbox, propeller
    }
  ],
  rudders: [
    {
      id, position, axis, area, span, aspectRatio,
      coefficients, slipstreamSources: ["propeller-id"]
    }
  ],
  aerodynamics: {
    referenceWindHeight,
    panels: [
      {
        id, area, normalBody, center, cdNormal,
        cdTangential, exposure
      }
    ]
  },
  contacts: {
    hullEnvelope: [{ x, y, radius }],
    fenders: [{ id, position, radius, stiffness, damping }]
  },
  deckHardware: {
    cleats: [{ id, position, side, station }]
  },
  provenance: {
    values: {
      "geometry.loa": {
        sourceType: "official",
        source: "URL ou référence",
        uncertainty: 0,
        note: ""
      }
    }
  }
}
```

Utiliser des listes pour les composants. Ne pas conserver un objet unique
`rudder` si `configuration.rudders` peut valoir deux.

## 3. Compilation

Exposer :

```js
validateVesselProfile(rawProfile)
compileVesselProfile(rawProfile)
applyCalibrationPatch(compiledProfile, patch)
```

`compileVesselProfile()` doit :

1. valider schéma, unités et identifiants ;
2. refuser les champs critiques absents ;
3. vérifier les positions par rapport à la coque ;
4. résoudre les références entre hélices et gouvernes ;
5. construire les sections et grandeurs dérivées ;
6. construire et vérifier la matrice de masse ;
7. vérifier provenance et incertitude ;
8. vérifier le domaine déclaré ;
9. retourner un objet immuable ;
10. produire erreurs et avertissements lisibles.

Inclure `profileId`, `profileVersion`, `schemaVersion` et `physicsVersion` dans
les snapshots et fixtures.

## 4. Normalisation et mise à l'échelle

Conserver dimensionnels :

- longueurs et surfaces ;
- masse et inertie ;
- puissance et régime ;
- diamètre et pas d'hélice ;
- positions ;
- forces humaines mesurées.

Privilégier sans dimension :

- coefficients de masse ajoutée ;
- `CX`, `CY`, `CN` ;
- coefficients d'appendices ;
- `Kt/Kq` quatre quadrants ;
- coefficients de cross-flow ;
- moments divisés par force de référence fois longueur.

Ne pas copier entre bateaux :

- damping exprimé en N/(m/s) ;
- coefficient quadratique exprimé en N/(m/s)² ;
- plafond de poussée en N ;
- raideur de pare-battage ;
- positions absolues ;
- surface ou diamètre d'un composant.

Si une donnée dimensionnelle est estimée par similitude, documenter la loi de
mise à l'échelle et son domaine.

## 5. Provenance

Utiliser :

- `official` : constructeur ou équipementier ;
- `measured` : essai réel, bassin ou soufflerie ;
- `literature` : méthode publiée applicable ;
- `estimated` : géométrie ou prior ;
- `calibrated` : ajustement contre une enveloppe documentée.

Associer à chaque donnée critique :

- valeur et unité ;
- source ;
- méthode ;
- incertitude ;
- domaine ;
- date si la source est évolutive.

Ne pas convertir une valeur calibrée en valeur « constructeur ».

## 6. Migration d'un profil par défaut

Lorsqu'un cœur contient `DEFAULT_PROFILE` et une fusion profonde :

1. déplacer le bateau de référence dans un module de catalogue ;
2. distinguer chargement complet et patch de sensibilité ;
3. rendre obligatoires les champs critiques ;
4. convertir quille, hélice et safran en listes ;
5. rechercher les constantes du bateau dans rendu, scénarios et tests ;
6. ajouter un audit qui échoue sur héritage implicite ;
7. conserver un adaptateur temporaire versionné si nécessaire.

## 7. Validation multi-bateaux

Avant un catalogue, créer :

- un profil synthétique petit à la limite basse ;
- le bateau de référence ;
- un profil synthétique grand à la limite haute.

Utiliser les profils synthétiques uniquement pour détecter les constantes
cachées et instabilités de mise à l'échelle. Ne pas les présenter comme des
modèles commerciaux réalistes.

Exécuter les invariants universels sur tous. Conserver les enveloppes de classe
et trajectoires propres à chaque profil.
