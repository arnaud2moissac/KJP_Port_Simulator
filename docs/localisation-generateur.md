# Localisation du générateur de ports

Le générateur autonome embarque ses dictionnaires et ses guides en français
(`fr`, FR), anglais (`en`, EN) et breton (`br`, Bzh). Le code standard du breton
est `br`, comme dans le simulateur. Aucune requête réseau n’est nécessaire pour
les traductions. La préférence `kjp.generator.locale` est indépendante de
`kjp.simulator.locale` ; sinon, le navigateur détermine la langue, avec repli
français.

## Ajouter une langue

1. Copier `src/generateur-port/locales/fr.json` vers `<code>.json`. Renseigner
   `code` (BCP 47), `nativeName`, `shortLabel`, `direction` et `guide`.
2. Traduire toutes les valeurs de `messages`, en conservant les clés et les
   paramètres `{nom}`. Les pluriels requièrent `other` et acceptent les
   catégories reconnues par `Intl.PluralRules`. Les messages ne contiennent
   aucun HTML.
3. Traduire le guide Markdown et indiquer son chemin depuis la racine du dépôt
   dans `guide`. Les images locales éventuellement utilisées sont embarquées.
4. Lancer `npm run check:i18n`, puis `npm run build:port-generator` et
   `npm run check:generator`. Le sélecteur découvre le nouveau catalogue
   automatiquement, sans modification JavaScript.
5. Vérifier visuellement ses libellés sur les formats visés. `direction`
   prépare les langues de droite à gauche ; elles nécessitent une qualification
   visuelle complémentaire.

## Ajouter ou modifier un message

Utiliser une clé stable dans `ui`, `metric`, `count`, `toast`, `analysis`,
`candidate`, `decomposition`, `error`, `source`, `message` ou `validation`, et la renseigner
dans tous les catalogues. Les champs `validation.*` reprennent le vocabulaire
du codec KJP, également traduit dans le simulateur.

Le HTML emploie `data-i18n` sur un nœud textuel dédié et `data-i18n-attr` sur
les attributs accessibles. Préserver les icônes et les contrôles des conteneurs.
En JavaScript, `t(key, params)` traduit à l’instant de l’appel ;
`setText(element, msg(key, params))` et `showToast(msg(key, params))` conservent
le descripteur pour une traduction à chaque changement de langue. Utiliser
`num(value, digits)` pour les nombres des messages persistants.

Le changement de langue conserve la géométrie, les métadonnées, les noms saisis
ou importés, les champs en cours de saisie, la sélection, les séries, les
candidats, le polygone, la caméra et l’historique. Les noms proposés lors de la
création deviennent des données du document et ne sont ensuite plus traduits.

Les modules d’import OSM et de découpe ajoutent `reasonMessage` aux diagnostics
français existants. Le codec conserve `path`, `message`, `code`, `messageKey`
et `messageParams`. Aucun schéma KJP ni calcul de géométrie n’est modifié.

## Contrôles ciblés

- `npm run check:i18n` : parité des dictionnaires, paramètres, pluriels, guides,
  références des clés et liaisons HTML des deux produits.
- `node --test tests/generator-i18n-unit.test.js` : préférence indépendante,
  langue supplémentaire, nombres, pluriels, repli et diagnostics.
- `npm run validate:ui -- --product generator --group localization` : les
  trois langues hors ligne, l’état de l’éditeur, les messages dynamiques,
  l’import/export, les candidats et la négociation de langue.

Le breton reprend la terminologie déjà documentée pour le simulateur dans
`docs/localisation-simulateur.md` et `bibliographie/biblio.txt`, notamment Taked,
Babourzh, Tribourzh, Ponton bihan et Ere ar c’horf-marv. Une relecture linguistique
par un bretonnant connaissant la navigation reste recommandée.
