# Coque, pare-battages et rebond : étude physique et sens marin

Date : 13 octobre 2026. Route : `physics-check`, diagnostic local, sans modification du moteur, des profils livrés, du rendu ou des étalons.

Baseline : `main`, HEAD `a87e6a3b80da3579d7db98371a14651038fbbb78`, physique `6.0.0`, profil `sun-odyssey-36i-pedagogical` `6.0.1`.

## 1. Verdict

**Approche ressort–amortisseur plausible comme modèle réduit de contact, mais restitution réelle de la coque et des pare-battages non validée.** Le partage du paramètre `dampingRatio = 0.82` n'est ni une preuve de réalisme, ni une impossibilité physique en soi. Il manque une identification séparée des réponses des deux contacts.

La bibliographie consultée apporte des éléments pertinents sur les pare-battages de plaisance, leur état de gonflage et les pratiques d'approche. Elle ne fournit pas de coefficient de restitution mesuré pour le pare-battage exact de KJP monté sur un Sun Odyssey 36i. Aucun chiffre « réaliste » n'est donc prescrit pour remplacer 0,82.

Les essais du moteur confirment l'amortissement relatif comparable du contact isolé, mais **pas une égalité du rebond du bateau complet**. Ma réponse précédente « en première approximation, oui » doit rester limitée à cette comparaison isolée : le nombre de contacts, leur bras de levier et l'eau changent fortement la réponse réelle du simulateur.

Le sens marin valide certains comportements qualitatifs : appui possible sous charge continue, glissement tangentiel, énergie d'approche à réduire avant le contact. Il ne permet pas de certifier les coefficients à partir du seul aspect d'une manœuvre.

## 2. Périmètre et niveaux de preuve

Le profil KJP représente un voilier de 10,94 m, déclaré à 5,7 t à lège et simulé par défaut à 6,5 t en charge. La masse en charge est une estimation du profil, pas une pesée du bateau de l'utilisateur. Les contacts sont horizontaux en 3-DOF ; roulis, pilonnement, déplacement vertical du pare-battage et dommages structuraux ne sont pas calculés.

Hiérarchie utilisée : mesure du composant et du bateau exacts > essai comparable > données fabricant > méthode physique générale > hypothèse pédagogique. Les essais ci-dessous sont des **mesures du logiciel**, jamais des mesures de mer.

Les défenses pneumatiques industrielles, les cargos et les essais de balles/plaques ne servent pas à donner un coefficient au SO36i. Les notices commerciales n'ont pas la valeur d'un essai dynamique de restitution. Une référence théorique peut servir à examiner une méthode, sans transférer ses matériaux ou ses coefficients.

## 3. Bibliographie applicable et limites

### Pare-battages de plaisance

[Polyform US — gonflage](https://polyformus.com/pages/boat-fender-buoy-inflation-guide) : le fabricant donne une limite de 2 psi, environ 0,14 bar, et demande de garder une paroi que l'on peut enfoncer au pouce. Cela renseigne l'état du produit ; cela ne donne ni courbe force–compression, ni travail de déchargement, ni vitesse de rebond. Archive existante : `bibliographie/polyform-fender-inflation.html`.

[Polyform US — tableau F-Series](https://polyformus.com/products/f-series-boat-fender-f-1-standard-blue-ropehold) : F-5 est indiqué pour 30–40 pieds et F-6 pour 35–50 pieds, tous deux de 11 pouces, environ 28 cm de diamètre. Le diamètre de 35 cm retenu dans KJP n'identifie donc pas un produit exact à partir de ce tableau. Il peut correspondre à un choix de protection différent, mais ne constitue pas une calibration mécanique. Archive : `bibliographie/polyform-us-f-series-size-chart.html`.

[DAN-FENDER — catalogue 2016](https://danfender.com/f/pdfer/dan-fender-catalogue.pdf), pages PDF 3, 13 et 14, tableaux inspectés visuellement : dimensions, sélection indicative pour 31–45 pieds, PVC flexible, valeurs annoncées à 0,15 bar vers 20 °C et avertissement contre le surgonflage. Les valeurs de flottabilité en kg ne sont **pas** une force de choc admissible ou une énergie absorbée. Il n'y a pas de boucle chargement–déchargement ni de restitution exploitable dans ces pages. Archive : `bibliographie/dan-fender-catalogue-2016.pdf`.

[DAN-FENDER — Heavy Duty](https://danfender.com/c/products/heavy-duty-fenders) précise que le contrôle de chaque produit est un essai d'étanchéité en bassin. Il ne faut pas le lire comme une validation de rebond ou d'hystérésis. Archive : `bibliographie/dan-fender-heavy-duty.html`.

### Manœuvre et cadre physique

[RYA — Coaching from a Powerboat](https://www.rya.org.uk/media/cz4lagjp/a2a_coaching_from_a_powerboat.pdf), pages imprimées 10–12 : approches lentes, usage du neutre, prise en compte du vent/courant et maîtrise de l'approche. C'est une source de pratique pédagogique pour petites embarcations, non un essai de collision d'un croiseur de 6,5 t. Elle sert uniquement à cadrer les situations de sens marin, pas les paramètres de contact. Archive : `bibliographie/rya-coaching-from-a-powerboat.pdf`.

[Fossen — Marine Craft Model](https://www.fossen.biz/html/marineCraftModel.html) fournit le cadre dynamique avec inertie rigide, masse ajoutée, mouvements couplés et dissipation hydrodynamique. Le calcul de masse normale au contact présenté plus loin est notre dérivation à partir de la matrice KJP, pas une mesure de pare-battage publiée par Fossen. Archive existante : `bibliographie/fossen-marine-craft-model.html`.

Hunt et Crossley, *Coefficient of Restitution Interpreted as Damping in Vibroimpact*, 1975, [DOI 10.1115/1.3423596](https://doi.org/10.1115/1.3423596), a été identifié comme repère théorique dans la recherche. Le texte intégral éditeur est inaccessible lors de l'archivage (HTTP 403) ; seules ses notices et son résumé indexé ont été disponibles pour orienter la recherche. Il n'est **pas retenu comme preuve de calibration ni comme justification d'une nouvelle loi KJP**. En particulier, aucune donnée de sphère/plaque n'est transposée au pare-battage.

**Lacune principale :** aucune paire de courbes dynamiques de charge/décharge, ni de vitesses avant/après, n'a été trouvée dans ce corpus pour le pare-battage exact, son gonflage, son montage et une coque/quai comparables. Cette absence dans le corpus n'affirme pas que de telles données n'existent nulle part. Les essais cités doivent être demandés aux fabricants ou obtenus sur un montage représentatif.

## 4. Ce que calcule réellement KJP

Sources internes : [profil](../../src/simulateur-port/vessel-profiles.js), [contacts](../../src/simulateur-port/physics-core.js), fonction `addContactForces()`.

| Grandeur | Pare-battage | Coque |
|---|---:|---:|
| Raideur par échantillon | 48 000 N/m | 98 000 N/m |
| Paramètre d'amortissement | 0,82 | 0,82 |
| Frottement tangentiel effectif | 0,03 | 0,30 |
| Limite de force par contact | 90 kN | 90 kN |

Le cœur utilise, avec `δ` la pénétration et `v_n < 0` à l'approche :

```text
m_proxy = 0,24 × masse en charge
c = 2 ζ √(k m_proxy)
F_n = borne(k δ − c min(0, v_n), 0, forceLimit)
```

L'amortissement n'agit donc que pendant la **compression**. Pendant la détente, le ressort reste actif, sans ce terme dissipatif de contact ; les efforts de l'eau restent présents. Le contact ne tire jamais le bateau vers le quai.

Au-delà de 45 mm de pénétration, une correction de position est également appliquée, avec une constante de temps de 0,08 s. C'est une garde numérique, pas un mécanisme de dissipation identifié dans un pare-battage réel.

La pénétration de coque est une variable de contact pénalisé ; elle ne décrit pas une déformation structurale mesurée de la coque. De même, le modèle ne contient pas explicitement l'air, sa pression, le PVC, la température, une courbe d'écrasement/durcissement ou une histoire d'hystérésis mesurée. Des réponses effectives pourraient être identifiées sans tout modéliser en détail, mais cette identification manque ici.

### Pourquoi 0,82 ne signifie pas un faible rebond déterminé

La masse proxy vaut 1 560 kg pour 6 500 kg en charge. La matrice KJP donne 6 987,5 kg pour une translation longitudinale ; l'amortissement réduit du cas longitudinal isolé correspond donc à environ `0,82 √(1560/6987,5) = 0,387`, et non 0,82.

**Calcul analytique dérivé**, pour un seul degré de liberté, sans traînée, limite de force ni correction : avec la dissipation limitée à la compression, le rapport de vitesses vaut

```text
e = exp[−ζ_eff arccos(ζ_eff) / √(1−ζ_eff²)]  (0 ≤ ζ_eff < 1)
```

Il est d'environ 0,611 ici. Ce calcul explique le moteur ; ce n'est pas une proposition de coefficient réel. La formule usuelle du ressort-amortisseur dissipant sur tout le cycle n'est pas applicable telle quelle à cette loi.

Au milieu du bateau, pour une normale latérale et sans moment direct, la masse effective issue de `1/(J M⁻¹ Jᵀ)` est d'environ **10 265 kg**, avec masse ajoutée et couplage. Elle varie avec le point et la normale ; 1 560 kg n'est pas cette masse locale. Le cadre utilise `J = [n_x, n_y, x n_y − y n_x]`.

Le facteur fixe 0,24 est ainsi un raccourci de calibration du contact, non un calcul de masse effective au point d'application. Aucune source quantitative du profil n'a été trouvée pour justifier son association avec `ζ = 0,82` et ces raideurs pour la restitution du bateau réel.

## 5. Essais reproductibles du moteur

Commande :

```bash
node scripts/audit-contact-response.js --out docs/validation/contacts-rebond-2026-10-13.json
```

[Script](../../scripts/audit-contact-response.js) et [résultats bruts](contacts-rebond-2026-10-13.json).

Le script appelle le cœur existant ; aucune équation de force n'est substituée. Il réalise **72 impacts isolés** : trois profils complets existants (2 500, 6 500 et 18 200 kg), deux types de contact, quatre vitesses et trois pas réels 120/240/480 Hz. Une copie du profil compilé est dotée d'une géométrie diagnostique à un seul point, avec même point et même rayon pour les deux matériaux. Ce montage fictif n'est pas un nouveau profil de bateau validé ni un étalon de release.

Il ajoute **cinq approches latérales** avec l'enveloppe du SO36i : avec/sans pare-battages à 0,05 et 0,15 m/s, puis appui sous 15 nd de vent. Eau et traînée conservées, moteurs au neutre, quai fixe, pas de courant, vagues ou amarres.

`e_app` désigne le rapport des vitesses normales du **centre du bateau** juste avant le contact et après la première séparation. Dans le montage isolé, sans rotation, il décrit une restitution apparente du système bateau/eau/contact. Avec plusieurs contacts et du lacet, il n'est plus un coefficient de restitution local du matériau. Les vitesses de contact et la vitesse initiale sont enregistrées séparément.

### Contact isolé : l'intuition de départ est confirmée dans ce cadre

SO36i, 240 Hz, arrivée initiale 0,15 m/s :

| Résultat logiciel | Pare-battage | Coque |
|---|---:|---:|
| `e_app` | 0,6060 | 0,6074 |
| Durée de contact | 1,083 s | 0,758 s |
| Force maximale | 2,337 kN | 3,341 kN |
| Pénétration maximale | 34,8 mm | 24,4 mm |
| Énergie cinétique après/avant | environ 36,7 % | environ 36,9 % |

La raideur double environ, mais la restitution reste comparable. La coque donne un contact plus bref et plus sec, pas automatiquement une restitution plus faible. Les trois masses synthétiques/référence donnent également des rapports proches de 0,60–0,61 pour ce cas ; elles ne sont pas des essais de trois bateaux réels.

À 0,30 m/s, le même montage donne environ 0,401 pour le pare-battage et 0,573 pour la coque ; à 0,60 m/s, environ 0,201 et 0,297. Dans ces cas, la correction à 45 mm est active. **La baisse du rebond ne valide pas une hystérésis réelle dépendante de la vitesse** : elle est aussi produite par la garde numérique. Aucun essai du lot n'atteint la limite de force.

### Bateau complet : pas d'égalité simple du rebond

À 120 Hz, sans vent ni amarres :

| Arrivée initiale | Contact | `e_app` à la première séparation | Plus grand écart libre au quai sur 40 s |
|---|---|---:|---:|
| 0,05 m/s | Avec pare-battages | 0,634 | 0,542 m |
| 0,15 m/s | Avec pare-battages | 0,604 | 1,309 m |
| 0,05 m/s | Coque, pare-battages retirés du diagnostic | 0,319 | 0,231 m |
| 0,15 m/s | Coque, pare-battages retirés du diagnostic | 0,190 | 0,117 m |

L'écart est calculé sur les surfaces de contact effectivement projetées, pas uniquement sur la position du centre : le lacet compte. Dans le dernier cas, quatre épisodes de contact et environ 24° de lacet apparaissent. Les distributions des points, le frottement et les bras de levier changent donc la comparaison. Ce test contredit une lecture générale de « la coque rebondit autant » ; il n'identifie toutefois pas les lois réelles des matériaux.

Sous 15 nd de vent transversal vers le quai, départ sans vitesse et sans amarres : le premier recul ne libère le bateau que d'environ **2,2 mm** ; il reste en contact durant les dix dernières secondes. La vitesse normale finale est environ **0,000002 m/s**, tandis qu'il glisse tangentiellement à environ **0,057 m/s**. L'appui est stable dans la normale ; cela ne signifie pas que le bateau est amarré ou immobile.

### Contrôles numériques

- 72/72 impacts : valeurs finies, contact puis séparation détectés ; énergie cinétique et énergie cinétique + ressort ne dépassant pas l'énergie initiale, tolérance de contrôle 0,2 % ; maximum observé du rapport : 1.
- Écart maximal de `e_app` entre 120 et 480 Hz : inférieur à **0,00024** dans ce lot.
- Les appels à 60 Hz sont subdivisés à 120 Hz dans le cœur : ils ne constituent pas ici un essai d'intégration réelle à 60 Hz.
- Six tests existants ciblés dans `tests/physics/port-obstacles.test.js` passent : géométrie, contacts analytiques, roulement, embout, bras de levier et non-traversée/convergence.

Ces résultats qualifient ce lot numérique, pas l'ensemble du moteur ni sa restitution réelle. Aucune fixture n'a été régénérée et aucune suite de release n'a été exécutée.

## 6. Lecture de sens marin

La [RYA](https://www.rya.org.uk/media/cz4lagjp/a2a_coaching_from_a_powerboat.pdf) aide à choisir les situations : vitesse maîtrisée, neutre, vent/courant et plan d'approche. Les critères suivants sont une **grille d'analyse KJP**, non une validation expérimentale RYA du simulateur.

| Situation | Lecture physique et marine | Verdict KJP |
|---|---|---|
| Bateau libre, bref contact doux, aucune force qui le tient | Un élément comprimé peut rendre de l'énergie et écarter le bateau ; supprimer tout recul n'est pas justifié a priori | Recul présent, causal et sans énergie spontanée dans les cas isolés ; amplitude réelle à identifier |
| Vent continu vers le quai | Une réaction de contact doit pouvoir équilibrer la poussée normale ; la détente initiale n'interdit pas un appui final | Appui normal stable observé dans le cas choisi |
| Glissement le long du quai | Déplacement tangent et compression normale sont deux mécanismes distincts | Distinction présente, tests de roulement existants réussis ; coefficient de frottement réel non mesuré |
| Contact direct de coque | Ce n'est pas une défense conçue pour fournir une protection sacrifiable ; ne pas utiliser le choc comme manœuvre | Réaction plus dure modélisée, mais pas de dommage, de déformation permanente ni d'identification structurale |
| Écart d'environ 1,3 m après un contact sans vent ni ligne | C'est sensible pour une place de port, mais l'absence d'amarre et de force de maintien compte ; l'inertie et l'eau déterminent la distance après le contact | Point prioritaire à comparer au réel, pas preuve suffisante d'impossibilité physique |

Le bon sens marin ne permet pas de conclure « le pare-battage rebondit, la coque non » comme règle universelle. Il permet en revanche de demander des lois séparément justifiées, de réduire l'erre avant l'appui et de ne pas présenter une collision de coque sans dommage comme une opération anodine.

## 7. Échelle d'énergie adaptée au SO36i

Calcul dérivé `E = ½ m v_n²`, sans masse ajoutée ni rotation, pour expliquer l'ordre de grandeur, pas dimensionner un équipement :

| Vitesse normale | À 5,7 t | À 6,5 t |
|---|---:|---:|
| 0,05 m/s | 7,1 J | 8,1 J |
| 0,15 m/s | 64,1 J | 73,1 J |
| 0,30 m/s | 256,5 J | 292,5 J |

Dans le profil KJP, la masse effective latérale centrale évoquée plus haut donnerait environ 115,5 J à 0,15 m/s. Les vitesses locales, le lacet et les contacts multiples doivent être pris en compte pour un cas réel. La masse de 5,7 t n'autorise donc pas à transposer un coefficient d'une balle légère ou une performance d'une défense de navire marchand.

Le travail de compression `∫F_charge dδ`, le travail rendu `∫F_décharge dδ` et leur différence doivent être distingués. Le mot commercial « absorption » peut désigner le travail accepté, sans prouver que tout ce travail est dissipé et que le rebond est nul.

## 8. Recommandations, sans implémentation

1. **Conserver la distinction coque/pare-battage dans le modèle générique**, avec paramètres indépendants et provenance explicite. Ne pas régler ces deux contacts par un même curseur tant qu'on n'a pas justifié ce choix. Ne pas imposer non plus une hiérarchie de restitution sans données.
2. **Calculer ou justifier la masse effective au point de contact** avec la matrice 3-DOF et la normale, plutôt que traiter 0,24 de la masse totale comme une masse locale universelle. Modifier ce chemin demanderait ses validations propres ; ce n'est pas fait dans cette étude.
3. **Identifier une réponse effective de charge/décharge** pour le pare-battage exact et son gonflage. Une loi réduite peut rester simple, mais doit reproduire force, compression, durée et énergie rendue, pas uniquement une trajectoire visuellement agréable. La coque demande une justification distincte, même si sa compliance est utilisée principalement comme pénalité numérique.
4. **Séparer les propriétés physiques des gardes numériques.** Les cas retenus pour calibration doivent normalement garder inactive la correction à 45 mm. Ne pas ajuster une raideur ou une restitution pour compenser cette correction.
5. **Exposer ensuite le bon réglage avancé.** Un curseur d'amortissement est une petite extension de l'API, mais n'est pas un « pourcentage de rebond mesuré ». Un coefficient de restitution souhaité exige une identification/validation de la loi et des conditions, pas une simple inversion linéaire du curseur.

Pour les mesures : relever le modèle exact, le gonflage et sa température, les dimensions, le montage, la surface de quai et le nombre de défenses en prise. Préférer un banc instrumenté sûr pour les cycles de compression, puis des données non destructives d'appui et de détente. Un essai volontaire de choc de coque n'est pas nécessaire ni proposé. Mesurer les vitesses/angles au point de contact et l'énergie, distinguer les efforts du vent, de l'eau, des lignes et des intervenants. Fournir les incertitudes ; garder les données hors-calibration pour un contrôle indépendant.

## 9. Décision de validation

| Élément | Qualification |
|---|---|
| Famille de loi ressort–amortisseur unilatérale | Plausible comme modèle réduit, non identifiée matériellement |
| Absence d'énergie spontanée et convergence dans le lot étudié | Conforme aux contrôles effectués |
| Rebond identique du bateau complet avec/sans pare-battages | Non confirmé ; comparaison isolée uniquement |
| Même `ζ` comme représentation physique des deux matériaux | Non validé faute de données pertinentes |
| Valeurs 48/98 kN/m, facteur 0,24, `ζ = 0,82` comme calibration de restitution réelle | Non validés quantitativement par le corpus consulté |
| Appui sous vent et glissement | Plausibles dans les cas numériques choisis, pas mesurés en mer |
| Chocs sévères, coque endommagée, réponses verticales | Non qualifiés par cette étude |

**Décision : ne pas qualifier l'approche actuelle de restitution réaliste validée pour le SO36i. Ne pas la remplacer non plus par « coque sans rebond / pare-battage avec rebond » sur intuition seule.** La prochaine étape justifiée est une identification distincte des contacts et de leur masse effective, suivie de validations locales et de manœuvres comparables. Le moteur utilisateur reste strictement inchangé à l'issue de l'étude.
