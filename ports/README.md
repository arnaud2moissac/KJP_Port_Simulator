# Topologies de port

Deux formats coexistent :

- la topologie pédagogique historique `schemaVersion: 2`, chargée comme module
  local par le port intégré ;
- le format communautaire JSON non exécutable `.kjp`, décrit dans
  [`KJP.md`](KJP.md), créé avec `generateur-port.html` et importable en mémoire
  dans le simulateur.

Le modèle source référence sa topologie avant le moteur avec une balise locale :

```html
<script data-port-topology src="ports/la-trinite-pedagogique.js"></script>
```

Pour changer de port, créez un autre fichier dans ce dossier et remplacez
uniquement cette valeur `src` dans `src/simulateur-port/template.html`. Le build
valide puis intègre son contenu dans `simulateur-port.html` : le livrable final
ne dépend d'aucun fichier de topologie externe. Relancez ensuite :

```sh
npm run build:simulator
npm run check:simulator
```

Pour une modification qui touche aussi le moteur physique, utilisez
`npm run verify:physics`. Le contrôle complet du simulateur reste disponible
avec `npm run verify:simulator`.

## Contrat `schemaVersion: 2`

Le fichier doit affecter un objet immuable à `globalThis.PORT_TOPOLOGY`.
Il contient :

- `units` : obligatoirement `m`, `m/s` et `rad` ;
- `coordinateSystem` et `referenceBoat` ;
- `bounds` et `flowField` ;
- `layout`, `structures.docks`, `structures.catways`,
  `structures.mooringCleats` et `berthLanes` ;
- `staticBoats` et `scenarios` ;
- `navigation` : chenaux, place pédagogique et routes de sortie à valider ;
- `terrain` et `lights`.

Une unité de coordonnées vaut toujours exactement un mètre. Les positions sont
exprimées avec `x` vers l’est et `y` vers le nord. Le cap de scène vaut zéro
vers l’est et augmente dans le sens anti-horaire.

Le build et les tests refusent une topologie dont les unités, les dimensions du
bateau de référence ou les trois situations de départ obligatoires sont
incohérentes.

Chaque entrée de `structures.mooringCleats` possède un identifiant stable, un
`parentId`, un type `catway` ou `ponton`, une position `x/y/z` et une
`orientation`. Les taquets doivent rester dans l'emprise métrique de leur
structure parente. Une situation peut déclarer `initialMoorings` en référençant
un taquet du bateau et un de ces identifiants à terre.

Le simulateur adapte cette topologie v2 à la même représentation interne que
les ports KJP. Les rectangles v2 sans angle restent alignés sur les axes ; les
ports KJP peuvent employer des rectangles orientés, des obstacles polylignes
et des polygones terrestres.

Dans KJP 2, chaque ponton, catway et obstacle porte aussi un bloc `vertical`
explicite (`datum`, `mode`, `baseZ`, `topZ`, `deckZ`). Un catway rattaché porte
`parentId` et `attachment`; sa racine recouvre le ponton de 0,10 à 0,25 m et le
type de connecteur décrit un raccord affleurant, articulé ou en rampe. Ces
informations sont des données de topologie : le moteur de rendu ne doit jamais
deviner l'altitude ou masquer un mauvais raccord par un décalage de profondeur.

## Commandes communautaires

```sh
npm run build:port-generator
npm run verify:port-generator
```

Le verrou global `npm run verify:release` vérifie une fois les deux builds, le
codec KJP, le générateur, la physique, l'import atomique et les deux interfaces.
Les commandes `verify:simulator` et `verify:port-generator` restent séparées
pour permettre aux deux outils d'évoluer indépendamment.
