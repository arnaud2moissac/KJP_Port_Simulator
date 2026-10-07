# Localisation du simulateur

Le fichier autonome embarque le moteur `KJPI18n`, tous les catalogues et tous les guides. La localisation ne nécessite aucune requête réseau. Le générateur et l'explorateur du modèle sont des produits distincts.

Les langues livrées sont le français (`fr`, `FR`), l'anglais (`en`, `EN`) et le breton (`br`, `Bzh`). `Bzh` est le libellé du sélecteur ; le code de langue standard reste `br`, notamment pour la détection de `br-FR` depuis le navigateur.

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

Les formateurs `Intl` reçoivent la langue active puis le français comme repli explicite. Leur support peut différer de celui des catalogues : Chromium reconnaît les pluriels bretons mais pas nécessairement les nombres et dates bretons. Ce repli évite un format anglais implicite sur un appareil anglophone, sans changer la langue des textes ni ajouter de cas particulier par langue.

Les scénarios intégrés utilisent `scenario.<id>.kicker`, `.title`, `.copy`, `.objective`, `.step.<n>` et `.levelTwo.<champ>`. Leur topologie conserve uniquement les données de simulation. Les textes éditoriaux des ports importés restent ceux de leur auteur.

## Contrats et contrôles

Les erreurs physiques conservent `reason` et ajoutent `reasonCode`/`reasonParams`. Les forces conservent `source` et ajoutent `sourceKey`/`sourceParams`. Les erreurs KJP conservent `path`, `message` et `code`, avec `messageKey`/`messageParams` supplémentaires. Le format des documents `.kjp` et les calculs physiques sont inchangés.

`npm run check:i18n` contrôle catalogues, paramètres, pluriels, guides, images, références HTML et points d'affichage JavaScript. Le build refuse les catalogues incomplets. En exécution, une clé absente revient au français avec un diagnostic console ; `localeReport()` dans l'API `?test=1` permet de vérifier qu'aucune clé n'a manqué.

`npm run test:i18n` vérifie la sélection depuis le navigateur, la préférence `kjp.simulator.locale`, le stockage indisponible, les formats, le repli, les scénarios, les messages, le guide, les métadonnées importées et la conservation de l'état pendant un changement de langue. Le français, l'anglais et le breton sont contrôlés de gauche à droite ; `direction` prépare les langues de droite à gauche, qui demanderont aussi leur qualification visuelle.

## Vocabulaire breton

Le [catalogue breton](../src/simulateur-port/locales/br.json) et le [guide breton](guide-utilisateur.br.md) reprennent en priorité le [Lexique maritime — 200 mots pour parler voile, Paimpol 2025](../bibliographie/lexique-maritime-v1-2025.pdf), fourni par l'utilisateur et archivé intégralement. Ce PDF remplace les photographies initiales comme source de référence. Ses huit pages ont été inspectées visuellement ; les termes nautiques utilisés par KJP ont été comparés aux pages 2 à 7. Le guide distingue les termes attestés dans le PDF des formulations descriptives proposées pour les notions absentes. Les compléments et leur rôle sont consignés dans [la bibliographie](../bibliographie/biblio.txt).

Cette vérification a corrigé **Osser → Oser** pour « aussière » (page 3). Elle a aussi identifié une confusion de sens : **Pontig** désigne un pontet (page 4), pas un catway. Les catways sont donc désignés dans KJP par **Ponton bihan**, formulation descriptive « petit ponton », sans la présenter comme une traduction attestée par le lexique. Catalogue, guide, messages et captures utilisent les termes corrigés.

Les cinq catégories de pluriel breton (`one`, `two`, `few`, `many`, `other`) sont renseignées. L'abréviation `sk` désigne Skoulm (nœud, unité de vitesse) et ne doit pas être confondue avec `kN` (kilonewton, unité de force). Les tests vérifient la couverture et le fonctionnement, pas la correction linguistique : une relecture par un bretonnant connaissant la navigation reste recommandée.
