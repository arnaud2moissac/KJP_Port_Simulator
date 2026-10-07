# Audit de sécurité de l’import KJP — 7 octobre 2026

## Verdict et état du correctif

L’audit a confirmé deux familles de défauts dans le simulateur et le générateur :
blocage du chargement par une géométrie trop complexe, et données acceptées par le
codec provoquant des erreurs d’interface ou un état partiellement installé.
Les reproductions testées sont maintenant rejetées avant installation.

Aucune exécution de JavaScript injecté, pollution des prototypes ou fuite
automatique vers les destinations du fichier n’a été observée dans le corpus
testé. Ce résultat n’est pas une certification d’absence de vulnérabilité.
Une compromission de l’ordinateur n’a pas été démontrée ; les défauts confirmés
concernent la page et son état local, après import volontaire d’un fichier.

À la demande de l’utilisateur, le diagnostic a été suivi de correctifs limités
au codec commun et à ses messages. Les sources du moteur physique, du renderer,
des interactions de simulation et du moteur d’édition n’ont pas été modifiées.
Les deux HTML ont été régénérés à partir des sources.

## Référence, environnement et parcours

- Référence Git : `ca627ef64edbe6b1e4f6abc59e624684b4ab956b`.
- Environnement : macOS ARM64, Node `26.5.0`, npm `11.17.0`, Playwright `1.61.1`,
  Chromium `149.0.7827.55`, Three `0.186.0`, OpenLayers `10.10.0`.
- Arbre initial : bibliographie et étude de faisabilité déjà modifiées/non
  suivies ; ces travaux préexistants ont été conservés.
- Contextes dynamiques : HTML local `file://`, serveur HTTP sur `127.0.0.1`,
  contextes Chromium neufs pour chaque fichier, sans `?test` ni API de test.
  Les destinations distantes sont interceptées et ne reçoivent aucune donnée.
- Renderer natif vérifié par `document.body.dataset.worldRenderer`; le secours
  Canvas fait l’objet des reproductions ciblées décrites plus bas.

Le simulateur lit le fichier avec `FileReader`, appelle `KJPCodec.parse`, puis
`toRuntimeTopology`, installe la topologie et actualise l’interface. Le générateur
utilise le même codec, installe le document d’édition, actualise la carte et
enregistre le brouillon dans IndexedDB. La restauration du brouillon appelle
`normalizeDocument`, et l’export appelle `serialize` : les protections ajoutées
s’appliquent donc aussi à ces entrées.

Les données passent par `JSON.parse`, jamais par `eval`. Les informations du port,
options et messages inspectés utilisent du texte DOM ou des propriétés de
formulaire. Les rares usages `innerHTML` du simulateur proviennent du markup
intégré ou des catalogues embarqués, sans chemin identifié depuis le fichier KJP.
Le fichier ne fournit ni script, GLB, texture, module ou ressource au chargeur
Three ; son modèle est embarqué. Les URL du fichier ne sont pas automatiquement
téléchargées par ce chargeur.

## Constats confirmés

### KJP-01 — blocage par une polyligne disproportionnée — gravité moyenne

**Précondition :** l’utilisateur importe un fichier contenant un seul obstacle
avec 10 000 points répétés, de coordonnées finies et dans l’emprise autorisée.
Le fichier de reproduction mesure **221 462 octets**, largement sous 10 Mio,
et respecte le plafond du nombre de structures.

**Avant :** le codec accepte le document. Le chargement dépasse le délai externe
de 10 secondes dans les deux produits, en fichier et HTTP, avec quatre
reproductions indépendantes. Les cas à 1 000 points terminent. Sur le secours
Canvas, le cas à 10 000 points termine en environ 1,24 s dans les deux contextes :
le blocage du simulateur est donc propre au parcours natif pour cette charge.
La protection commune refuse désormais cette charge avant l’appel des moteurs.
Ce résultat
démontre un blocage prolongé de la page dans cet environnement ; il ne prouve pas
un blocage permanent sur toutes les machines.

**Cause :** aucune borne du nombre de sommets par géométrie ou dans le port.
Des traitements géométriques et de carte peuvent donc recevoir une entrée très
coûteuse malgré une petite taille de fichier. Le correctif agit à la frontière
d’import et n’adapte aucun de ces moteurs.

**Correctif :** maximum 1 024 sommets par obstacle/zone terrestre et 8 192 au total,
contrôlés avant migration, copies et traitement détaillé. Les fichiers de
La Trinité du dépôt comportent respectivement 87/472 points au total et 74/389
au maximum par géométrie. Les ports dépassant les nouvelles limites doivent être
simplifiés avant import ; le format reste KJP v3 et les migrations v1/v2 restent
prises en charge.

### KJP-02 — champs non typés et installation partielle — gravité moyenne

**Reproductions minimales :** `metadata.createdAt = {"toString":"bad"}` ou
`berths[0].name = {"toString":"bad"}` dans un port valide d’environ 1,3 Ko.

**Avant, simulateur :** validation et conversion acceptées, puis message
« Port refusé · Erreur inattendue ». Le sélecteur et le nom affiché désignent
pourtant déjà le nouveau port. Pour la date, les détails peuvent encore décrire
le précédent. L’exception survient après remplacement de la topologie, avant la
fin de l’installation. Un rechargement restaure le port pédagogique ; le fichier
n’est pas persisté par le simulateur.

**Avant, générateur :** document importé, sauvegardé, restauré et réexporté. La
sélection réelle de la place dont le nom est un objet provoque une erreur de
conversion dans un champ de formulaire, y compris après rechargement. Un groupe
de catways sans `parameters` produit également des erreurs lors de la sélection
du ponton, puis après restauration. Ce défaut peut contaminer un fichier partagé
par le réexport du générateur.

**Correctif :** validation textuelle des dates et noms de places, rejet des clés
de coercition `toString`/`valueOf`, validation de l’objet `parameters`, du mode,
du nombre et de l’espacement des groupes de catways. Les entrées concernées
échouent désormais dans le codec, avant toute modification de l’application.
Le brouillon précédemment valide est conservé lors d’un import refusé. Un ancien
brouillon malformé est refusé à la restauration ; un nouvel import valide permet
de reprendre le travail et de remplacer ce brouillon.

### KJP-03 — amplification des diagnostics et parcours non bornés — gravité faible

**Avant :** 50 000 obstacles `null` dans 251 311 octets génèrent 350 001 erreurs et
un message de 20 472 291 caractères. Le processus Node monte à environ 302 Mio de
RSS et prend 218 ms. Des groupes avec 500 000 références invalides atteignent
500 000 erreurs et environ 406 Mio. Ces mesures démontrent une amplification
mémoire, pas un crash navigateur confirmé pour ces deux fichiers.

Une extension avec 5 000 niveaux de tableaux provoque une `RangeError` ; un type
de collection invalide dans un fichier v1 provoque une `TypeError` pendant la
migration. Les interfaces les interceptent et conservent le port courant dans
les cas observés.

**Correctif :** vérification des types et cardinalités avant migration,
profondeur maximale 64, 250 000 valeurs inspectées, clés limitées à 240 caractères,
20 000 références de groupes au total et 64 diagnostics au maximum. La recherche
des références de catways/pendilles utilise des `Set` au lieu de recherches
linéaires répétées. Le cas des 50 000 obstacles est rejeté dès le plafond de
collection, avant création des diagnostics détaillés.

## Autres familles et limites du verdict

| Famille | Résultat de l’audit |
| --- | --- |
| Injection DOM | Balises de script, gestionnaires d’événements et SVG dangereux rejetés. Markup HTML ordinaire, entités et variantes Unicode acceptés dans certains textes, mais affichés littéralement : aucun élément de charge ni exécution observés. Le filtre textuel n’est pas une preuve suffisante à lui seul. |
| Prototypes | `__proto__`, `constructor`, `prototype` rejetés à la racine et imbriqués. Aucun changement du prototype témoin dans Node ou Chromium. |
| URL | `javascript:`, `data:`, `file:`, `blob:`, URL relative et protocole coupé par un contrôle rejetés. HTTP/HTTPS acceptés ; aucune requête vers ces URL pendant l’import. |
| Clic capitainerie | Une navigation vers l’URL est déclenchée après clic volontaire ; `window.opener` est nul. Le lien possède `noopener noreferrer`. Une URL avec identifiants comme `trusted.invalid@audit.invalid` reste acceptée : risque de tromperie à traiter comme durcissement du lien. |
| Schéma et JSON | JSON tronqué, références absentes, identifiants dupliqués, version inconnue et nombres infinis refusés. Les clés JSON dupliquées suivent la règle de `JSON.parse` : dernière valeur conservée ; aucun contournement démontré. |
| Géométries dégénérées | Polygones ponctuels et auto-croisés acceptés sans erreur console dans les cas testés ; une absence de surface visible n’est pas une exécution de code. Les limites de complexité s’appliquent désormais aussi à ces données. |
| Persistance | Brouillon malformé confirmé dans le générateur avant correction ; réimport, restauration et sélection vérifiés après correction. Aucun stockage automatique du port communautaire dans le simulateur observé. |

Le modèle d’attaque suppose un fichier non fiable importé volontairement. Il
n’inclut pas un navigateur déjà compromis, une extension malveillante ou une
vulnérabilité native du navigateur/GPU. Les dépendances n’ont pas fait l’objet
d’un audit général de leurs CVE ni d’une qualification complète de version.

## Version publiée et protections d’hébergement

Lecture seule des deux URL GitHub Pages, réponse HTTP 200 le 7 octobre 2026,
`Last-Modified: Tue, 06 Oct 2026 14:40:50 GMT`. Aucune CSP ni politique de referrer
n’apparaît dans les en-têtes reçus ou le début du HTML ; les liens externes du
simulateur utilisent néanmoins les attributs précités. Une CSP adaptée au HTML
autonome serait une défense supplémentaire à qualifier séparément.

| Livrable | SHA-256 local avant correction | SHA-256 publié |
| --- | --- | --- |
| Simulateur | `861a19acfdc57e967ae93334033ec160973116ab85c877f27f8f96cf8e500438` | `9a6218d8582f4b23ce2a35f6b93403c0915f7afbe719c3faebcb36f9a7054e5f` |
| Générateur | `f4b7432126ff1c47818a560d89a62e481060d66f03b6ca16ab74a5ea70e5c41a` | `5379b9947ba181987919b6b7327f5525d085cdaf660921d3584a5bb6f277908b` |

Les empreintes diffèrent : les reproductions actives et les correctifs portent
sur les livrables locaux de la référence Git, pas sur une version publiée dont
le commit est inconnu. Aucun fichier adverse n’a été envoyé à GitHub Pages.
Les URL KJP, livrables et références Git sont des preuves internes, exclues de
la bibliographie externe. La publication des correctifs reste à effectuer.

## Validation et performances

- Avant correction : 29 tests codec réussis ; 4 cas UI ports et 1 cas UI import
  réussis ; 58 cas adverses/contrôles codec ; 100 scénarios navigateur isolés
  (25 fichiers × 2 produits × fichier/HTTP).
- Après correction : 34 tests codec, contrôle i18n, builds et mêmes groupes UI.
  Les reproductions adverses, la restauration d’un ancien brouillon et Canvas
  sont vérifiés par le banc décrit ci-dessous.
- Une exécution des tests UI a été refusée par le sandbox au lancement de
  Chromium ; la reprise hors sandbox des deux groupes ciblés a réussi. Le
  premier essai navigateur réutilisait un contexte devenu problématique après
  une géométrie lourde ; il a été remplacé par des contextes neufs par fichier.
  Le délai artificiel du banc sur le fichier surdimensionné a été corrigé pour
  reconnaître son refus immédiat, indépendamment du reset du champ fichier.

Les mesures finales et les nombres de scénarios après correction sont consignés
à la clôture ci-dessous. Le bench compare `parse` +
`toRuntimeTopology` sur les deux vrais ports La Trinité, avec chauffe puis
alternance référence/correctif, sur la même machine. Le moteur physique et le
renderer sont absents de ce bench ; aucun traitement ajouté ne s’exécute dans
leurs boucles par image ou pas de simulation. Les durées du banc navigateur
incluent volontairement 800 ms d’attente pour l’autosauvegarde et ne sont pas un
profil de performance du produit.

## Reproduction et preuves conservées

Le script `scripts/audit-kjp-import.js` génère les fichiers à partir d’un port
témoin déterministe, exécute chaque cas codec dans un processus arrêté après
10 secondes et contrôle les imports par les vrais champs fichier. Il capture
console, requêtes, navigations, dialogues, téléchargements, stockage et captures
ciblées. Les profils sont temporaires et les sorties distantes interceptées.

```sh
node scripts/audit-kjp-import.js --emit many-points-10000 /tmp/points.kjp
node scripts/audit-kjp-import.js --emit date-object /tmp/date.kjp
node scripts/audit-kjp-import.js --emit berth-name-object /tmp/nom.kjp
node scripts/audit-kjp-import.js --emit group-parameters-missing /tmp/groupe.kjp
node scripts/audit-kjp-import.js --codec
node scripts/audit-kjp-import.js --browser --expect-fixed
```

Les reproductions devraient être acceptées sur la référence Git et rejetées sur
le correctif. Le banc utilise l’HTML courant : régénérer les deux livrables après
un changement du codec. `KJP_AUDIT_CASES`, `KJP_AUDIT_MODES` et `KJP_AUDIT_OUTPUT`
permettent une reprise ciblée, sans relancer toute la matrice. Le benchmark
`--performance` exige `KJP_AUDIT_REFERENCE` pointant sur le codec de la référence.

Preuves locales sous `.validation-runs/` (ignorées par Git) : `kjp-security/`
pour le codec initial et ses copies de référence ; `kjp-security-matrix/` pour
la matrice initiale ; `kjp-security-fixed/` pour le correctif. Les fichiers
adverses peuvent être recréés par le script, sans versionner de fixtures lourdes.

Références de méthode archivées dans `bibliographie/` et ajoutées à `biblio.txt` :
[OWASP DOM XSS](https://cheatsheetseries.owasp.org/cheatsheets/DOM_based_XSS_Prevention_Cheat_Sheet.html),
[OWASP Prototype Pollution](https://cheatsheetseries.owasp.org/cheatsheets/Prototype_Pollution_Prevention_Cheat_Sheet.html),
[OWASP Denial of Service](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html).
Ces références guident les vérifications ; elles ne remplacent pas les preuves
locales.

## Clôture

**Après correction :** 60 cas codec, 104 scénarios navigateur isolés en natif/
générateur (26 fichiers × quatre contextes), puis six scénarios Canvas ciblés.
Les 104 résultats ont été vérifiés : absence d’erreur console, de charge DOM,
d’exécution et de pollution du prototype ; conservation du nom du port et de
l’identifiant du brouillon pour les fichiers refusés. Les six scénarios Canvas
ont également passé `--expect-fixed`. Les restaurations de brouillons empoisonnés
en fichier et HTTP restent sur « Nouveau port » avec « Brouillon non disponible »
avant reprise par un import valide.

Un processus codec du cas surdimensionné a atteint une fois son garde-fou de
10 secondes sans fournir de résultat ; la reprise ciblée termine en **2,42 ms**
avec le refus attendu. Le même refus est vérifié dans les quatre contextes
navigateur. Le timeout original est conservé dans les preuves ; il n’est pas
classé comme une faille reproduite du correctif.

La vérification finale donne 34/34 tests codec, 4/4 cas UI ports et 1/1 cas UI
import réussis, catalogues FR/EN valides et builds synchronisés. `git diff --check`
réussit. Graphify a été actualisé sans LLM. Aucun moteur, profil, collision,
trajectoire ou source du renderer n’a été modifié.

### Comparaison de performance au repos

100 mesures par version après cinq tours de chauffe, ordre alterné pour chaque
paire, sans autre banc ni extraction du graphe en parallèle. Les topologies
complètes obtenues sont comparées exactement et identiques.

| Port | Médiane référence → correctif | p95 référence → correctif |
| --- | --- | --- |
| `la_Trinite.kjp` | 29,05 → 28,62 ms | 35,20 → 35,74 ms |
| `examples/la-trinite-sur-mer.kjp` | 52,20 → 50,83 ms | 57,52 → 55,72 ms |

Pas de ralentissement médian observé. L’écart p95 de +0,54 ms (+1,5 %) du premier
port est faible ; ces mesures ne garantissent pas un temps identique à chaque
exécution. Un premier bench de 30 paires donnait davantage de variabilité en
queue de distribution ; il est conservé, ainsi qu’un essai de 100 paires pendant
une extraction de graphe, et ne remplace pas la mesure au repos présentée ici.
La boucle physique et le rendu par image ne reçoivent aucun contrôle nouveau.

Pour le fichier de 50 000 obstacles invalides, le contrôle initial passe de
218 ms / environ 302 Mio de RSS à **1,16 ms / environ 47 Mio**, processus complet
compris. Les 500 000 références invalides sont refusées en environ 37 ms sans
constituer 500 000 diagnostics. Les géométries à 10 000 points sont rejetées dans
le codec en environ 2 ms. Les deux ports La Trinité et le grand port de 3 000
objets passent les tests de compatibilité.

Preuves complémentaires : `.validation-runs/kjp-security-canvas-before/`,
`kjp-security-canvas-fixed/`, `kjp-security-oversize-recheck/` et
`kjp-security-performance-idle/`. Les résultats sont locaux ; les corrections
n’ont pas été publiées.
