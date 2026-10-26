# Bibliothèques de ports

Le simulateur présente deux sources indépendantes :

| Source | Stockage | Catalogue |
| --- | --- | --- |
| KJP | Fichiers `.kjp` du dossier Git `ports/` | Aucun ; lecture directe des fichiers |
| Communauté | [Dossier public pCloud KJP_ports](https://e.pcloud.link/publink/show?code=kZoMfX7ZkRaGr4FE36R01ya4KkMBwh0xHkFy) | Un `catalog.json` accompagne chaque publication |

Le générateur ouvre et publie uniquement dans la bibliothèque Communauté. Les
fichiers locaux restent accessibles dans les deux produits. Une panne pCloud ne
bloque pas les ports KJP. Le simulateur liste directement le dossier Git `ports/`
et lit les métadonnées des fichiers `.kjp`, sans chercher de catalogue.

## Configuration pCloud

Les deux liens sont déjà renseignés dans
[`src/ports/library-config.json`](../src/ports/library-config.json) :

- `publicCode` : code du lien de consultation du dossier ;
- `uploadCode` : code de la [demande de fichiers](https://e.pcloud.com/#/puplink?code=6C37ZGcQ2DzNQw8kx9wIC4qfeGfv7sbgk) ciblant le même dossier.

**Aucun compte, connexion, clé API ou jeton n’est demandé aux visiteurs. Aucun
serveur intermédiaire ni script Google n’est nécessaire.** Les codes de partage
et de dépôt sont publics. L’enregistrement est disponible depuis un fichier HTML
local, un serveur local ou tout autre hébergement du générateur.

Pour remplacer le dossier, créer dans pCloud un lien de consultation public et
une **demande de fichiers** sans mot de passe pour le même dossier. Un simple
lien de partage avec permission de téléversement ne remplace pas cette demande.
Modifier les deux codes, puis reconstruire les livrables :

```sh
npm run build:port-generator
npm run build:simulator
```

La sauvegarde locale et l’enregistrement public sont proposés depuis toutes les
versions du générateur, y compris le HTML téléchargé. L’accès à pCloud nécessite
une connexion Internet.

## Publication et mise à jour

Chaque sauvegarde envoie en une requête multipart :

1. le port `.kjp` validé par le générateur ;
2. un `catalog.json` version 1 contenant son nom de fichier, sa taille UTF-8,
   son empreinte SHA-256, son identifiant stable, son nom, son auteur et ses dates.

Le client interroge `currentserver`, vérifie que le serveur retourné appartient
aux hôtes européens `eapi*.pcloud.com`, puis appelle `uploadtolink`. Le paramètre
`names` reprend l’auteur du port (ou « KJP »), nettoyé des caractères de chemin ;
`filescount=2`. pCloud crée un sous-dossier pour ce dépôt. Le catalogue est placé
dans ce même sous-dossier : il n’existe pas de catalogue central à écraser.

La lecture utilise `showpublink` pour parcourir les sous-dossiers et
`getpubtextfile` pour lire les catalogues et les ports JSON en UTF-8. Cet endpoint
est utilisable depuis GitHub Pages avec CORS ; `getpublinkdownload`, restreint aux
référents pCloud, n’est pas utilisé. Les catalogues décrivent uniquement les ports
de leur propre sous-dossier. Les fichiers `.kjp` déposés manuellement sans
catalogue sont également découverts en lisant leurs métadonnées.

Si l’identifiant du port ou son nom de fichier existe déjà, l’utilisateur doit
confirmer la **publication d’une mise à jour**. Les clients affichent la dernière
publication selon la date pCloud, puis l’identifiant du fichier en cas d’égalité.
L’ancien dépôt est conservé : le lien anonyme ne permet ni suppression ni
écrasement physique des fichiers. Une modification détectée pendant la
confirmation impose de relire la bibliothèque. Les écritures concurrentes ne
peuvent donc pas supprimer les fichiers des autres auteurs.

Le succès n’est affiché qu’après avoir retrouvé la nouvelle publication dans
le dossier public. En cas d’envoi accepté mais non visible, un message invite à
actualiser avant de réessayer. Un port arrivé sans son catalogue reste lisible.

Les réponses sont bornées : 10 Mo par port, 2 Mo par catalogue ou liste de
fichiers, 5 000 entrées et 32 niveaux de sous-dossiers. Les téléchargements
parallèles de métadonnées sont limités à trois. Le document complet est validé
par le codec KJP lors du chargement dans le générateur ou le simulateur. La
bibliothèque publique est ouverte aux contributions anonymes ; elle ne garantit
pas la propriété personnelle des ports.

## Ports éditeur dans le Git

Ajouter ou modifier le fichier `.kjp` dans `ports/`, puis le commiter et le publier
sur la branche `main`. Le simulateur le découvre à la prochaine ouverture ou
actualisation de la bibliothèque. Aucun fichier d’index ni commande de génération
de catalogue n’est nécessaire pour cette source.

## Contrôles ciblés

```sh
node --test tests/ports/port-library.test.js
npm run validate:ui -- --product generator --case library.01,library.02
npm run validate:ui -- --product simulator --case ports.library-list,ports.library-community,ports.library-git,ports.library-load,ports.library-errors
```

Les tests automatisés simulent le protocole pCloud et n’écrivent pas dans le
dossier réel. Ils couvrent la publication sans authentification, la confirmation
et l’annulation, la sélection des versions, les fichiers sans catalogue, les
bornes, les quotas, les erreurs de publication et l’indépendance des ports Git.

Références techniques pCloud : [régions API](https://docs.pcloud.com/general/),
[uploadtolink](https://docs.pcloud.com/methods/upload_links/uploadtolink.html),
[showpublink](https://docs.pcloud.com/methods/public_links/showpublink.html),
[getpubtextfile](https://docs.pcloud.com/methods/public_links/getpubtextfile.html).
