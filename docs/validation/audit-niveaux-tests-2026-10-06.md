# Audit du coût et des niveaux de validation

Audit du 6 octobre 2026 sur `main`, commit `ce9139a`.

## Conclusion

La hiérarchie `patch-local` / `ui-check` / `physics-check` / `release-check` est toujours présente dans `AGENTS.md`. La séparation des qualifications renderer lourdes est également conservée. En revanche, la sélection des tests locaux est difficile, plusieurs recommandations secondaires encouragent des validations larges et les pratiques récentes ont dépassé le niveau nécessaire.

L'inflation observée vient surtout de la répétition de suites complètes, du mélange entre tests fonctionnels et benchmarks, et du coût du navigateur/rendu. Le nombre de tests a augmenté, mais beaucoup moins que les durées constatées.

Cet audit ne change aucun test, seuil, moteur ou commande de validation. Les mesures nouvelles se limitent à l'inventaire, à des contrôles statiques et à de très petits essais du filtrage Node. Les durées de suites mentionnées ci-dessous proviennent des traces de cette conversation et du manifeste de clôture ; aucune qualification complète n'a été relancée pour cet audit.

## Taille et durées : distinguer les causes

| Indicateur | Référence | État actuel / observation |
| --- | --- | --- |
| Cas E2E depuis la release `v2.0.0` | 51 sous-tests, 2 734 lignes | 52 sous-tests, 2 843 lignes : +1 cas, +4 % de lignes |
| Cas E2E depuis la clôture `0eb10d0` | 46 sous-tests ; durée historique 78,5 s | 52 sous-tests ; dernière exécution 215,25 s |
| Variation sur la correction clavier | même suite de 53 résultats, parent compris | exécutions de 925,43 s, 236,14 s et 996,11 s ; environ 36 min cumulées |
| Localisation | nouvelle suite dédiée | 3 tests, dont 2 unités et 1 scénario navigateur ; environ 22 à 36 s observées |
| Physique centrale | 30 tests | environ 84 à 131 s observées ; 29 fonctionnels passent, le budget CPU a aussi échoué avec le moteur précédent |
| HTML autonome | 2 416 807 octets au commit clavier | 3 950 854 octets après localisation : +63,5 % |

Les durées historiques ne sont pas un comparatif à matériel et charge constants. En particulier, les exécutions longues du clavier précèdent la localisation : le grossissement récent du HTML ne peut pas les expliquer à lui seul.

L'inventaire actuel comprend 53 tests physiques autonomes (30 core, 16 environnement/profils, 7 contacts), 34 tests de ports, 52 sous-tests E2E simulateur, 23 sous-tests navigateur générateur, 14 tests dans la qualification renderer et 3 tests de localisation. Les compteurs Node incluent aussi le parent des deux suites E2E monolithiques.

## Constats prioritaires

### 1. Le ciblage E2E peut produire un faux succès

`tests/simulateur-port.test.js` contient un seul test parent qui ouvre Chromium et exécute 52 `await t.test(...)` sur une page partagée. Le générateur possède la même organisation avec 23 sous-tests.

Sur Node `v26.5.0`, la commande suivante a terminé avec code 0 et un résultat de fichier réussi, sans exécuter le cas demandé :

```bash
node --test --test-name-pattern='gaz et barre répondent simultanément' tests/simulateur-port.test.js
```

Un petit essai indépendant confirme le mécanisme : sélectionner uniquement un enfant ne lance pas le parent ; sélectionner aussi le parent lance les deux enfants de l'essai, même avec un motif ancré. Le filtrage naïf ne permet donc pas de garantir une validation ciblée. Le manifeste demande pourtant qu'une sélection vide soit consignée comme non exécutée.

La page partagée ajoute une dépendance d'état entre cas. Lors du correctif clavier, une assertion interrompue avant le relâchement d'une touche avait contaminé les cas suivants. Le nettoyage des touches a été corrigé, mais l'organisation générale reste couplée.

Priorité : rendre les fonctionnalités sélectionnables indépendamment (commandes/barre/moteur, amarres/pendilles, port/import, guide, affichage), avec préparation et nettoyage explicites. Toute sélection ciblée doit vérifier le nom et le nombre des cas réellement exécutés.

### 2. Les commandes dites ciblées peuvent être trop larges

- `verify:simulator` lance toute la physique et tout l'E2E. Ce n'est pas un contrôle local d'interface.
- `test:physics:core` regroupe coque, hélice, gouverne, vent, courant, contacts, amarres, convergence, sensibilité et performance. Pour un composant local, le fichier reste beaucoup plus large que « quelques cas numériques du composant ».
- Le README présente `verify:release` dans la procédure normale de développement. `CONTRIBUTING.md` classe également `verify:simulator` parmi les « commandes ciblées utiles ».
- Le tableau de clôture renderer déclenche `test:e2e` pour un changement fonctionnel du simulateur, alors qu'`AGENTS.md` demande de tester seulement l'interaction modifiée.

Priorité : aligner ces indications sur `AGENTS.md`, afficher clairement le périmètre de chaque commande et réserver les agrégats complets aux changements transversaux ou qualifications explicites.

### 3. Les benchmarks sont mélangés aux tests fonctionnels

Le dernier test core réalise 10 000 pas sur 12 amarres et impose une moyenne et un p95 inférieurs à 1 ms/pas. Le test contacts du grand port impose aussi un p95 absolu de 1 ms, sur 3 000 obstacles. L'E2E du mode ×2 contient un budget mural inférieur à 250 ms.

Ces tests vérifient aussi des invariants utiles, mais leur verdict temporel dépend de la machine, de sa charge, du navigateur concurrent et de la chauffe. Le dépassement constaté aussi sur le moteur précédent a entraîné plusieurs relances sans régression numérique démontrée.

Priorité : conserver les invariants dans les suites fonctionnelles ; isoler les mesures de coût dans une qualification de performance explicite, exécutée seule et dans un environnement décrit. Garder les seuils et leur justification, sans les relever pour rendre une exécution verte. Les deux assertions ×2 du test core sont en outre des reformulations algébriques des limites de moyenne/p95, pas deux mesures indépendantes supplémentaires.

### 4. Le navigateur reste coûteux pendant des tests sans besoin graphique

L'E2E vérifie aussi dans Chromium des propriétés de masse, des signes de forces, les seuils de contact et des trajectoires numériques. Il réalise au moins huit captures sur un passage normal : cinq pour les thèmes et trois dans le contrôle final. Plusieurs de ces captures servent surtout à vérifier une taille PNG supérieure à 20 000 octets, ce qui constitue une preuve de présence faible, pas une comparaison visuelle précise.

Les 38 attentes numériques explicites totalisent 4,175 s si chaque site est parcouru une fois, avant répétitions de boucles. Elles ne suffisent pas à expliquer les minutes observées. Les interactions Playwright, captures, synchronisations de frames et le rendu continu constituent d'autres coûts. Leur contribution exacte reste à profiler séparément ; elle n'a pas été mesurée ici.

La qualification renderer possède déjà une horloge RAF contrôlée. Priorité : utiliser un pilotage déterministe pour les tests d'interface qui n'ont pas besoin d'un rendu continu, garder quelques preuves d'intégration HTML/moteur, et réserver les matrices visuelles détaillées à leur suite dédiée.

### 5. Il existe de vrais doublons de chargement et des recouvrements de couverture

- Le guide français et chacune de ses quatre images sont embarqués deux fois : dans le catalogue et dans le HTML de secours. Son HTML représente environ 750 ko. Le guide anglais représente environ 696 ko, avec ses images présentes une fois.
- Le build recrée le guide français déjà produit par `loadCatalogs()`. `projectAssets()` rend aussi le README, alors que le build simulateur ne consomme que son logo. Les contrôles de complétude et les tests unitaires chargent également les guides illustrés via `loadCatalogs()`.
- Import de port, démarrage natif, dispositions mobile/tablette et absence d'erreur sont revisités dans E2E, i18n, activation renderer et tests générateur. Certains passages physiques E2E recouvrent les suites autonomes.

Priorité : mutualiser le chargement des contenus, séparer la validation des catalogues de leur rendu illustré et éviter le double payload français. Pour les assertions, distinguer le contrat unitaire de la preuve d'intégration : un court smoke d'intégration reste utile ; répéter toutes les variantes à plusieurs niveaux ne l'est pas forcément.

Il n'y a pas d'import caché des suites renderer lourdes dans l'E2E actuel. `verify:release` ne lance pas deux fois les mêmes fichiers par son expansion. La qualification renderer contient légitimement le niveau rapide : la duplication apparaît lorsqu'on lance les deux commandes successivement sans raison de diagnostic.

### 6. La hiérarchie reste une convention, pas un routage exécuté

Aucun sélecteur central par nature de modification ni budget de durée par route n'est présent. Les hooks Git inspectés lancent Graphify en arrière-plan, pas des qualifications de tests. Aucune configuration GitHub Actions n'est présente dans ce checkout.

Il existe aussi une lacune de couverture : `check:i18n` et `test:i18n` ne sont pas inclus dans les agrégats `verify:*`. Le build vérifie les catalogues, mais ne remplace pas les tests des interactions de langue. Réduire le coût doit donc s'accompagner d'un routage plus précis, pas d'une suppression générale des garanties.

## Respect des niveaux : décision d'audit

| Route | Règle à conserver | État constaté |
| --- | --- | --- |
| `patch-local` | diff et build du produit concerné | règle correcte ; les indications générales README peuvent faire dériver vers une release |
| `ui-check` | build, console et interaction modifiée | ciblage E2E non fiable et agrégat simulateur trop large pour cette route |
| `physics-check` local | unités, signes, finitude, invariants et cas du composant | fichiers physiques larges ; benchmarks mêlés aux verdicts fonctionnels |
| `physics-check` transversal | suites physiques et trajectoires concernées ; vent/courant seulement si concernés | couverture présente ; préserver la distinction avec une simple modification de métadonnées ou de texte |
| `release-check` | `verify:release` une fois | séparation renderer lourde correcte ; éviter les suites constituantes juste avant ; ajouter une couverture de localisation à cette qualification |

Dans cette conversation, mes trois relances complètes pour le correctif clavier ont dépassé le besoin d'un `ui-check`. J'ai contribué à cette inflation. Pour la localisation, le plan explicitement demandé prescrivait les suites étendues : leur première exécution était autorisée, mais les diagnostics des échecs et les reprises devaient rester plus ciblés.

## Ordre de correction recommandé

1. Sécuriser le ciblage et découpler les cas E2E par fonctionnalité ; conserver un smoke commun et un agrégat complet de release.
2. Aligner README, CONTRIBUTING, tableau de clôture et noms de commandes sur les quatre routes ; annoncer le niveau avant chaque validation.
3. Séparer performance et correction fonctionnelle ; ne pas relancer une qualification globale après un échec de mesure déjà reproduit sur la référence.
4. Réduire le rendu continu, les captures faibles et les chargements/embarquements redondants ; conserver les gates visuelles et physiques pertinentes dans leurs niveaux explicites.
5. Enregistrer par exécution le périmètre, les cas réellement lancés, la durée et les reprises ; intégrer la localisation dans le niveau de qualification adéquat.

Pas de suppression d'étalon, de seuil ou d'invariant physique proposée. Les gains de durée doivent être mesurés après ces changements ; aucun facteur d'accélération n'est affirmé par cet audit.

## Application des recommandations — 6 octobre 2026

Les recommandations ont ensuite été appliquées à la demande de l'utilisateur,
avec interdiction de modifier les moteurs physique et graphique de production.

- Les 52 cas simulateur et 23 cas générateur sont des tests autonomes, avec
  contexte neuf et fixtures explicites. Les groupes et identifiants stables sont
  dans `tests/browser-cases.json`. Le sélecteur exige que les noms et le nombre
  réellement exécutés correspondent exactement à la sélection ; une sélection
  inconnue ou vide échoue, même si Node renvoie un simple succès de fichier.
- `scripts/run-validation.js` matérialise les quatre routes. README,
  CONTRIBUTING, AGENTS et tableau de clôture renderer sont alignés sur
  [la politique actuelle](../validation-levels.md). Les agrégats complets restent
  disponibles, mais ne sont plus présentés comme des contrôles locaux.
- Les trois budgets temporels ont été déplacés dans `tests/performance/`, sous
  `qualify:performance`, sans relever leurs seuils. Les 10 000 pas, la sensibilité,
  les douze aussières, les 3 000 obstacles et les égalités ×1/×2 restent dans les
  tests fonctionnels. Les étalons et références raster n'ont pas changé.
- Le banc utilise le Canvas existant et un RAF contrôlé pour les cas sans besoin
  natif. Le smoke et les intégrations graphiques restent natifs ; les matrices
  visuelles, mutations et soak restent dans la qualification renderer dédiée.
  Les cinq captures PNG faibles des thèmes et deux captures finales redondantes
  sont remplacées par des contrats de ressources/GL ; une capture d'intégration
  native reste dans le smoke final.
- La validation des catalogues n'embarque plus les guides illustrés. Les unités
  i18n et leur contrôle navigateur sont sélectionnables séparément et inclus dans
  la qualification de release. Le guide français est réutilisé depuis le HTML de
  secours, sans deuxième copie ni nouvelle requête réseau.
- Les journaux locaux `.validation-runs/` enregistrent environnement, périmètre,
  cas, durées et reprises liées par `--retry-of`. Ils sont ignorés par Git. Aucune
  relance n'est automatique.

### Résultats réellement observés

Environnement : Node `v26.5.0`, macOS arm64 ; Chromium `149.0.7827.55`.
Ces durées ne constituent pas un comparatif à machine/charge constantes avec les
exécutions historiques.

| Contrôle | Résultat |
| --- | --- |
| Protection des moteurs | 11 fichiers de production, dont template, profils, physique et renderer : identiques à `HEAD` ; bundle Three embarqué et sources physiques embarquées également identiques |
| HTML simulateur | 3 950 854 → 3 197 415 octets : −753 439 octets (−19,1 %), sans suppression de contenu du guide |
| Ciblage clavier `controls.48` | 1 cas réellement exécuté, 2,62 s ; route avec build et lancement Node : 3,49 s |
| Sélection inconnue | code 1, zéro test lancé, erreur consignée dans le journal |
| Banc simulateur, une exécution complète | 52 cas exécutés en 134,86 s ; 48 passent initialement, puis les 4 cas corrigés passent en reprises ciblées |
| Banc générateur, une exécution complète | 23 cas exécutés en 35,11 s ; 22 passent initialement, puis le cas cartographique corrigé passe seul |
| Localisation | 2 unités passent ; contrôle navigateur FR/EN, langues de premier lancement, persistance, scénarios, état préservé, guide et imports auteur : réussi en 6,40 s |
| Routage | 4 tests de sélection, complétude, absence d'escalade et faux succès : réussis |
| Catalogues et builds | 2 langues / 445 messages validés ; builds simulateur et générateur synchronisés |
| Ports | 34/34 tests réussis |
| Invariants déplacés hors des budgets | stress core 10 000 pas + sensibilité et grand port 3 000 obstacles : réussis, en deux sélections numériques ciblées |
| Performance déplacée, une exécution | 3/3 ; core moyenne 0,212 ms/pas, p95 0,235 ms/pas ; grand port p95 0,134 ms ; avance ×2 32,8 ms, limites originales conservées |
| Diff et graphe | `git diff --check` réussi ; `graphify update .` effectué, sans extraction sémantique payante |

Les premiers échecs ne sont pas masqués : Chromium a d'abord été refusé par la
sandbox macOS, puis autorisé hors sandbox pour le seul cas concerné. L'isolation
a révélé le geste d'activation audio fourni auparavant par le guide, une lecture
de compteur dans le mauvais rapport de test et une fixture cartographique fournie
par un cas précédent. Le dernier clic du levier tactile a été observé par
hit-testing et coordonnées réelles : sa capture de pointeur sur le parent et le
déplacement de la poignée perturbaient l'heuristique de clic stationnaire de
Playwright. Ni clic forcé, ni événement synthétique de substitution, ni code
utilisateur n'ont été utilisés pour contourner ces vérifications.

Après correction, les 75 cas navigateur sont tous couverts par des résultats
réussis ; il ne s'agit pas d'une seconde suite complète verte. La qualification
globale `verify:release`, la matrice multibrowser et le soak renderer n'ont pas
été relancés pour cette évolution du banc et du packaging documentaire.

## Sources internes principales

- [Politique de validation](../../AGENTS.md), section « Valider proportionnellement au risque ».
- [Commandes npm](../../package.json), [README](../../README.md), [CONTRIBUTING](../../CONTRIBUTING.md).
- [E2E simulateur](../../tests/simulateur-port.test.js), [E2E générateur](../../tests/port-generator.test.js), [localisation](../../tests/simulator-i18n.test.js).
- [Physique centrale](../../tests/physics/port-physics.test.js), [environnement](../../tests/physics/wind-current-profiles.test.js), [contacts](../../tests/physics/port-obstacles.test.js).
- [Manifeste renderer historique](https://github.com/arnaud2moissac/KJP_Port_Simulator/blob/b93f3da0f20b4e2f18f337d4f77936da9bf2a0e1/docs/validation/threejs-migration-closure.md), [qualification renderer](../../tests/native-renderer-qualification.test.js).
- [Chargement des catalogues](../../scripts/localization-assets.js), [build simulateur](../../scripts/build-simulateur-port.js), [rendu des documents](../../scripts/embed-project-readme.js).
