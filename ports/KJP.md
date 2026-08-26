# KJP 3 — format communautaire de port

KJP est un document JSON UTF-8 non exécutable. Il ne contient ni JavaScript,
ni HTML, ni tuile, ni orthophoto. Les cartes restent des aides visuelles du
générateur et les sources sont consignées uniquement sous forme d’attribution,
de licence, de date, d’emprise et d’identifiants OSM.

## Enveloppe

```json
{
  "format": "KJP",
  "schemaVersion": 3,
  "generatorVersion": "1.1.0",
  "metadata": {},
  "georeference": {},
  "sources": [],
  "bounds": {},
  "structures": {},
  "berths": [],
  "staticBoats": [],
  "navigation": {},
  "editor": {}
}
```

Le repère est local est–nord, en mètres, autour d’une origine WGS84. Les caps
sont exprimés en radians, depuis l’est, positifs dans le sens trigonométrique.
La projection locale azimutale équidistante est réversible et testée sur une
zone de 4 km.

## Géométries

- `structures.pontoons` et `structures.catways` sont des rectangles orientés :
  `center`, `length`, `width`, `heading`, `height` et un bloc vertical explicite
  `vertical`.
- `vertical.datum` vaut `waterline`. Une structure flottante utilise
  `mode: "floating"`, `baseZ`, `topZ` et `deckZ`; une structure fixe utilise
  `mode: "fixed"` avec les mêmes altitudes métriques. `height` reste la
  différence `topZ - baseZ`, et non une altitude absolue.
- Un catway raccordé possède `parentId` et `attachment`. Le raccord indique le
  bord du ponton parent (`port` ou `starboard`), la station locale, un
  recouvrement compris entre 0,10 et 0,25 m et un connecteur `flush`, `hinge`
  ou `ramp`. Les ponts d'un raccord `flush` restent au même niveau à 8 cm près.
  Le recouvrement rend la géométrie continue sans créer de face terminale
  visible entre les deux objets.
- `structures.cleats` stocke `parentId` et une `localPosition` longitudinale /
  transversale. Le taquet suit ainsi la transformation de son parent.
- `structures.pendilles` décrit une prise au quai, un corps-mort immergé et le
  profil mécanique de la ligne porteuse. La prise est liée au bord d’un
  rectangle ou à une station d’un quai en polyligne ; le corps-mort est défini
  par sa distance normale et sa profondeur. La longueur maximale peut atteindre
  200 m, indépendamment de la limite de 20 m des aussières embarquées.
- `structures.obstacles` contient des polylignes métriques avec `width`,
  `height`, un bloc `vertical` en mode fixe et un type `breakwater`, `groyne`,
  `quay` ou `obstacle`.
- `structures.landAreas` contient les polygones non navigables.
- `berths` contient les places calculées et leur éventuel statut visiteurs.
- `staticBoats` contient la géométrie finale des bateaux génériques, jamais une
  image satellite.
- `navigation.entries` contient exactement un point d’entrée avec position et
  cap.
- `editor.catwayGroups` et `editor.pendilleGroups` conservent les paramètres de
  séries automatiques ;
  `occupancyRate` et `occupancySeed` rendent le remplissage reproductible.

## Sécurité et limites

Le codec partagé `src/ports/kjp-codec.js` valide intégralement le document avant
toute mutation du simulateur :

- 10 Mo maximum ;
- 5 000 structures, 20 000 taquets et 2 000 bateaux ;
- toutes les coordonnées à moins de 20 km de l’origine ;
- nombres finis, identifiants uniques et références parent–enfant valides ;
- URL HTTP/HTTPS uniquement ;
- scripts, balises HTML, gestionnaires d’événements et clés dangereuses
  refusés ;
- un nom de port et un point d’entrée unique obligatoires.

Une erreur indique un chemin JSON précis. Le simulateur charge un document
valide en une seule opération, au neutre, sans vent ni courant, et ne le garde
qu’en mémoire. Exporter, importer puis réexporter sans modification produit le
même texte canonique.

Les documents KJP 1 et 2 sont migrés en mémoire avant validation. La migration
explicite leurs altitudes, restaure les raccords des catways appartenant à un
groupe paramétrique et initialise une liste de pendilles vide. Une
réexportation produit toujours un document KJP 3.

## Données OpenStreetMap / OpenSeaMap

OpenSeaMap fournit le calque visuel de signalisation. Les géométries viennent
des objets OpenStreetMap interrogés par Overpass après l’action explicite
« Analyser cette zone ». Chaque requête est limitée à 2 × 2 km ; plusieurs
réponses peuvent être fusionnées et dédupliquées.

L’orthophoto IGN, disponible comme calque optionnel en France, n’est jamais
utilisée pour détecter automatiquement l’occupation et n’est jamais embarquée
dans KJP. Google Satellite est volontairement absent : ses conditions
interdisent l’analyse d’image et l’extraction de géodonnées prévues par ce
workflow.
