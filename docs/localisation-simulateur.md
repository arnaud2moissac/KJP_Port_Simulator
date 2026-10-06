# Localisation du simulateur

Le fichier autonome embarque le moteur `KJPI18n`, tous les catalogues et tous les guides. La localisation ne nécessite aucune requête réseau. Le générateur et l'explorateur du modèle sont des produits distincts.

## Ajouter une langue

1. Copier `src/simulateur-port/locales/fr.json` vers `<code>.json`. Renseigner `code` (BCP 47), `nativeName`, `shortLabel`, `direction` et `guide` (chemin relatif à la racine du dépôt).
2. Traduire toutes les valeurs de `messages`, sans modifier les clés ni les paramètres entre accolades. Les valeurs plurielles exigent `other` ; elles peuvent aussi définir les catégories de la langue (`one`, `two`, `few`, `many`, `zero`) reconnues par `Intl.PluralRules`. Ne pas introduire de HTML.
3. Traduire le guide Markdown et ses textes alternatifs. Fournir quatre captures localisées, dans l'ordre : ordinateur, tablette tactile, Comprendre/Rotation et appareillage sur pendille. Les liens vers les autres produits indiquent leur langue lorsque nécessaire.
4. Exécuter `npm run check:i18n`, puis `npm run build:simulator`. Le sélecteur découvre automatiquement la nouvelle langue. Aucun changement du code applicatif n'est nécessaire.
5. Pour refaire les captures, lancer `node scripts/capture-simulator-localized-guide.js <code>`, puis reconstruire. Les images utilisent le suffixe `.<code>.jpg`.

La première construction nécessite que les images référencées existent. Pour créer les premières captures, le guide peut temporairement référencer les images françaises ; après la capture, remplacer ces références par les fichiers localisés et reconstruire avant livraison.

## Ajouter un texte

Utiliser une clé stable et descriptive, dans le domaine concerné (`ui`, `scenario`, `diagnostic`, `toast`, `force`, `interaction`, `validation`). Ajouter la même clé et les mêmes paramètres à tous les catalogues.

Le HTML utilise `data-i18n="ui.neutral"` pour un nœud textuel et `data-i18n-attr="aria-label:language.label;title:language.label"` pour les attributs. Ne pas lier un conteneur qui contient aussi des boutons, icônes ou valeurs dynamiques : lier son nœud textuel dédié.

Le JavaScript utilise `t(key, params)` pour l'affichage immédiat. Les notifications et diagnostics utilisent `msg(key, params)` et sont résolus au moment de l'affichage. Les paramètres numériques persistants utilisent `num(number, digits)` pour se reformater lorsqu'on change de langue. Un paramètre peut lui-même être un descripteur traduit, notamment pour une cause de refus.

Les scénarios intégrés utilisent `scenario.<id>.kicker`, `.title`, `.copy`, `.objective`, `.step.<n>` et `.levelTwo.<champ>`. Leur topologie conserve uniquement les données de simulation. Les textes éditoriaux des ports importés restent ceux de leur auteur.

## Contrats et contrôles

Les erreurs physiques conservent `reason` et ajoutent `reasonCode`/`reasonParams`. Les forces conservent `source` et ajoutent `sourceKey`/`sourceParams`. Les erreurs KJP conservent `path`, `message` et `code`, avec `messageKey`/`messageParams` supplémentaires. Le format des documents `.kjp` et les calculs physiques sont inchangés.

`npm run check:i18n` contrôle catalogues, paramètres, pluriels, guides, images, références HTML et points d'affichage JavaScript. Le build refuse les catalogues incomplets. En exécution, une clé absente revient au français avec un diagnostic console ; `localeReport()` dans l'API `?test=1` permet de vérifier qu'aucune clé n'a manqué.

`npm run test:i18n` vérifie la sélection depuis le navigateur, la préférence `kjp.simulator.locale`, le stockage indisponible, les formats, le repli, les scénarios, les messages, le guide, les métadonnées importées et la conservation de l'état pendant un changement de langue. Le français et l'anglais sont qualifiés de gauche à droite ; `direction` prépare les langues de droite à gauche, qui demanderont aussi leur qualification visuelle.
