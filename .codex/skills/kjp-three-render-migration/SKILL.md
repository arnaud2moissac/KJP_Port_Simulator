---
name: kjp-three-render-migration
description: Maintenir, qualifier ou optimiser le renderer Three.js natif du simulateur KJP et son secours Canvas 2D tout en conservant strictement la physique, les fonctions et le livrable HTML autonome. Utiliser aussi pour consulter ou reproduire l'archive des anciens backends ; ne pas utiliser pour le générateur de ports ni pour modifier la physique nautique.
---

# Maintenance du renderer Three.js de KJP

## Référence du chantier

Lire d'abord [le cadrage de référence](../../../docs/threejs-renderer-migration.md).
Le statut prescriptif courant décrit le produit Three natif et son secours
Canvas 2D. Le retrait des anciens chemins, leurs consommateurs et le manifeste
de reproduction sont consignés dans
[l'inventaire de clôture](../../../docs/validation/threejs-migration-closure.md).
Les décisions N1 à N6 conservées plus bas dans le cadrage sont historiques.

## Préserver les frontières du simulateur

- Relever le répertoire réel, la branche/HEAD et le diff avant de travailler.
  Préserver les modifications préexistantes, sans changement de branche ni reset.
- Classer la demande selon `AGENTS.md`. Un changement de rendu ou d'interaction
  relève de `ui-check`; une qualification complète ne s'exécute que si elle est
  demandée.
- Ne modifier ni moteur, profil, collision, pas de temps, interpolation,
  commande, trajectoire, ancrage fonctionnel ou référence physique pour adapter
  le rendu. Three consomme la pose et la caméra KJP et ne devient jamais une
  autorité de simulation.
- Conserver le Canvas 2D supérieur, les overlays, le picking, les `hitTargets`,
  les aussières, les pare-battages et le secours Canvas. Ne pas remplacer les
  interactions par du raycasting dans une tâche de maintenance du renderer.
- Modifier les sources sous `src/simulateur-port/`, puis régénérer le HTML avec
  le build. Ne jamais éditer directement le livrable généré.

## Appliquer le contrat actuel

Le renderer de production est `native-world-renderer.mjs`. Ses ressources monde
statiques restent persistantes ; un mouvement de caméra peut actualiser matrices
et paramètres, mais ne reconstruit ni ne retransfère leurs attributs. Le bateau
joueur conserve le GLB chargé une fois, sa géométrie partagée et sa transformation
locale. Seules les données visuelles réellement variables peuvent être mises à
jour.

Le secours `?renderer=canvas` utilise le painter Canvas 2D et les projections
partagées. Un échec d'initialisation WebGL2, de chargement GLB, de reconstruction
ou une perte de contexte doit produire un diagnostic explicite puis activer ce
secours sans changer l'état physique. Les anciens renderers WebGL ne doivent pas
être réintroduits comme dépendances du produit ; utiliser le tag
`threejs-migration-legacy-final` pour une investigation historique.

La fidélité native porte sur la présence, les dimensions, l'occlusion, la
lisibilité, l'information et les interactions. Elle n'impose aucune identité de
pixels avec Legacy. Une référence raster native peut être exacte sur un
environnement déterministe et des contrôles tolérants doivent vérifier que les
mutations significatives restent détectées. Les comparaisons physiques,
fonctionnelles et de trajectoires restent exactes.

## Choisir le niveau de validation

- Ressource, palette ou caméra locale : `npm run test:rendering`, build concerné
  et inspection ciblée.
- Intégration native ou secours Canvas : `npm run test:renderer:quick`, page
  visible et interaction concernée.
- Qualification renderer explicitement demandée :
  `npm run test:renderer:qualification`, matrice
  `npm run qualify:renderer:native` et profil apparié
  `npm run profile:renderer:native`. La version de référence est le tag de
  clôture historique ou un HTML fourni par `--reference`.
- Release : `npm run verify:release` une seule fois selon `AGENTS.md`.

Les matrices multi-navigateurs, mutations visuelles, cycles de ressources, soak
et profils sont coûteux et couvrent des risques distincts. Ils restent séparés
de `test:e2e`; ne pas les ajouter à un contrôle local. Après un changement de
code, exécuter `graphify update .`.

Pour une adaptation d'API Three.js, charger `threejs-game-studio` et vérifier la
révision installée. Ses exemples génériques de boucle, éclairage ou raycasting ne
remplacent pas les propriétaires KJP. Ne pas modifier un skill global pour une
règle propre à ce dépôt.
