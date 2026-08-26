# Manœuvrer au port avec KJP Port Simulator

Le simulateur est conçu pour essayer, observer et recommencer. Il aide à construire des réflexes, mais ne remplace ni un moniteur, ni la pratique sur votre bateau.

![Vue générale et choix de la situation](images/01-navigation-generale.jpg)

## Une première manœuvre en cinq minutes

1. Ouvrez `simulateur-port.html` par double-clic.
2. Gardez le port pédagogique et choisissez **Ponton · sortie en marche avant**.
3. Cliquez sur les deux aussières pour les larguer.
4. Utilisez `↑` ou `Q` pour la marche avant, `↓` ou `W` pour la marche arrière. La commande s'arrête au neutre : relâchez puis appuyez de nouveau pour inverser.
5. Déplacez la barre avec `←` et `→`. Elle ne revient pas seule au milieu ; `Espace` la recentre.
6. Recommencez avec un peu de vent, puis avec du courant. Ne changez qu'un paramètre à la fois.

Les mêmes commandes sont disponibles sur écran tactile. La barre se règle en faisant glisser son curseur, comme un volant qui garde sa position.

![Commandes et vues du bateau](images/02-commandes-et-vues.jpg)

## Lire ce que fait le bateau

- **Vitesse fond** : mouvement par rapport au quai. Elle est positive en marche avant et négative en marche arrière.
- **Vitesse surface** : mouvement longitudinal par rapport à l'eau. Dans un courant qui emporte le bateau avec lui, elle peut rester proche de zéro alors que la vitesse fond est non nulle.
- **Dérive** : angle entre l'axe du bateau et sa vitesse relative à l'eau.
- **Régime** : vitesse réelle du moteur, qui peut chuter quand l'hélice est fortement chargée.

La vue **Dessus** est la plus précise pour manœuvrer. **Anatomie** révèle quille, safran et hélice. **Skipper** conserve le regard orienté avec le bateau tout en laissant la caméra libre.

Le mode **Comprendre** superpose les efforts, le jet d'hélice, l'axe du safran et le point de pivot calculé. Les flèches indiquent des directions et des rapports de force ; elles ne constituent pas une mesure instrumentale.

![Forces et point de pivot dans le mode Comprendre](images/03-mode-comprendre.jpg)

## Pare-battages, aussières et pendilles

Pour frapper une aussière, cliquez un taquet du bateau puis un taquet du ponton — ou dans l'ordre inverse. La vitesse fond doit rester sous la limite indiquée dans la calibration experte.

Une ligne peut rester molle, se tendre et s'allonger sous charge. Cliquez-glissez son tracé ou sa jauge pour régler sa longueur. Le triangle droit montre la consigne ; le triangle gauche montre la longueur réellement atteinte. Une ligne tendue prend une couleur chaude. Cliquez sans glisser pour la larguer.

Les pare-battages représentent un appui d'urgence, pas une permission de heurter le quai. Le diagnostic distingue contact doux, avertissement et choc sévère.

Pour les ports méditerranéens, les défis 5 et 6 reproduisent un amarrage cul au quai. Cliquez la petite boucle de pendille au quai puis un taquet d’étrave : la ligne légère est menée vers l’avant avant que la ligne porteuse, reliée au corps-mort, ne travaille comme une amarre. Au largage, la pendille tombe immédiatement dans l’eau et ne retient plus le bateau. Après un défi réussi, vous pouvez le rejouer avec 15 nd de vent.

![Taquets, aussières et jauges de longueur](images/04-aussieres-et-taquets.jpg)

## Charger un port communautaire

Le bouton de chargement accepte un fichier `.kjp` produit par le générateur. Le port est validé avant de remplacer la scène, puis le bateau apparaît au point d'entrée défini par son auteur, au neutre, sans vent ni courant. Le bouton `?` affiche les informations du port.

Le fichier reste uniquement en mémoire. Revenez au port pédagogique avec le sélecteur **Port actif**.

## Pourquoi le comportement est crédible

Le modèle vise la cohérence nautique à basse vitesse plutôt qu'une reproduction spectaculaire. Il ne déplace pas le bateau selon une trajectoire pré-écrite : à chaque instant, il additionne les forces et les moments, puis calcule la réponse du bateau.

- **Masse et inertie.** Le bateau est un corps rigide plan à trois degrés de liberté : avance, dérive et lacet. Sa masse, son inertie en rotation et les masses d'eau qu'il entraîne expliquent pourquoi il continue sur son erre après le passage au neutre et pourquoi une rotation ne s'arrête pas instantanément.
- **Coque, quille et point de pivot.** La résistance de coque est répartie sur onze sections et combine l'amortissement des petits mouvements avec une traînée croissante aux dérives plus fortes. La quille et le safran sont calculés séparément. Le point de pivot résulte donc du mouvement et de toutes les forces appliquées ; il n'est pas fixé artificiellement à un endroit du bateau.
- **Moteur et hélice.** Le régime affiché provient d'une chaîne moteur–embrayage–arbre–hélice comportant ses propres inerties. Lors d'une inversion, l'embrayage passe réellement par une phase de désengagement avant que l'arbre et l'hélice changent de sens. Le modèle quatre quadrants traite la propulsion normale, le crash-stop et l'hélice entraînée en moulinet par l'eau. L'effet de pas d'une hélice droitière est ajouté séparément et devient surtout sensible en marche arrière sous charge.
- **Safran et jet d'hélice.** Le safran est découpé en bandes recevant chacune l'écoulement local dû à l'erre, à la dérive, au lacet et au jet de l'hélice. Sa force augmente avec le carré de la vitesse d'eau et décroît progressivement au décrochage. Au point fixe, la barre peut agir dans le jet en marche avant ; sans erre ni jet, elle ne peut pas magiquement faire tourner le bateau.
- **Vent et courant.** Le vent apparent agit sur plusieurs surfaces — coque, rouf et mât — placées à des positions différentes : selon l'orientation, il produit donc de la dérive mais aussi un couple sur l'étrave ou la poupe. Le courant n'est pas une poussée constante : les efforts hydrodynamiques dépendent de la vitesse du bateau par rapport à l'eau. Une coque finalement entraînée à la vitesse du courant n'a presque plus de vitesse surface, même si elle continue de se déplacer par rapport au quai.
- **Pare-battages et contacts.** Chaque pare-battage est un appui amorti qui ne réagit qu'en compression. La masse effective au point de contact et la vitesse d'impact déterminent le rappel ; les seuils pédagogiques distinguent l'appui acceptable, l'avertissement et le choc sévère. Le solveur empêche également le bateau de traverser un ponton entre deux images.
- **Aussières.** Une aussière est un lien unilatéral : elle peut prendre du mou et tirer, mais jamais pousser. Elle s'allonge progressivement jusqu'à environ 15 % sous sa charge de travail de référence, dissipe les oscillations et se raidit si cette plage est dépassée. Sa tension agit au taquet choisi : une garde ou une pointe crée ainsi le bon bras de levier et le bon moment de rotation.
- **Action humaine sur une aussière.** Régler une ligne ne revient pas à téléporter le bateau ni à appliquer une force illimitée. La reprise est bornée à 1 m/s, le filage à 1,2 m/s et l'effort humain total à 200 N. La vitesse que l'équipage peut communiquer au bateau uniquement en reprenant les lignes est limitée à 0,2 nd. Une pendille frappée reçoit seulement une légère pré-tension d'environ 100 N ; elle devient porteuse sans secousse.
- **Temps réel sans mode dégradé.** Le calcul est déterministe et intégré à 120 pas physiques par seconde. Le mode ×2 exécute deux fois plus de pas complets : il n'agrandit pas le pas de temps et ne simplifie ni les contacts, ni les aussières, ni les efforts hydrodynamiques.

Le profil du Sun Odyssey 36i utilise les dimensions constructeur et un déplacement chargé d'environ 6,5 t. Les coefficients impossibles à connaître sans essais instrumentés sont identifiés comme estimations et testés par sensibilité. L'approche s'appuie notamment sur le [modèle marin 3-DOF de Fossen](https://www.fossen.biz/html/marineCraftModel.html), le [standard MMG](https://doi.org/10.1007/s00773-014-0293-y) et les procédures de validation de l'[ITTC](https://www.ittc.info/media/11868/75-02-06-03.pdf).

Ce n'est ni une CFD, ni un jumeau numérique certifié. Le chargement réel, les fonds, les vagues, l'état de l'hélice, les rafales et les gestes de l'équipage peuvent modifier fortement une manœuvre. Utilisez le simulateur pour préparer des hypothèses, puis validez-les lentement et prudemment à bord.
