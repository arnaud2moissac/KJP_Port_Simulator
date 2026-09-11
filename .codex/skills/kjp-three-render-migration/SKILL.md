---
name: kjp-three-render-migration
description: Migrer ou optimiser le renderer du simulateur KJP avec Three.js tout en conservant strictement la physique, les fonctions et le livrable HTML autonome. Utiliser pour les backends Legacy, Three de compatibilité et Three natif, ainsi que leurs validations visuelles ou de performance ; ne pas utiliser pour le générateur de ports ni pour modifier la physique nautique.
---

# Migration du renderer KJP vers Three.js

## Référence du chantier

Lire d'abord [le cadrage de référence](../../../docs/threejs-renderer-migration.md).
Ses sections prescriptives définissent les invariants, les critères par backend,
la cartographie du code, les acquis et les écarts d'application des références
externes. La section « Tranches natives planifiées » définit N1 à N6, leurs
tests, critères de sortie, dépendances et retours arrière. Les anciennes décisions
du journal sont un historique dont la portée est explicitée dans ce cadrage.

## Choisir le périmètre autorisé

- Relever le répertoire réel, la branche/HEAD et le diff avant de travailler.
  Préserver les modifications préexistantes, sans changement de branche ni reset.
- Une demande documentaire relève de `patch-local` : modifier uniquement les
  documents autorisés et contrôler le diff. Ne pas en déduire une autorisation
  de toucher au code, aux tests, références, dépendances ou scripts, de régénérer
  le HTML ou de changer le renderer actif.
- Une tranche de rendu autorisée relève de `ui-check`. Les modifications du
  moteur physique, des profils, collisions, commandes, du temps ou de
  l'interpolation sont hors de ce chantier ; leur diagnostic physique éventuel
  exige un périmètre distinct selon `AGENTS.md`.
- Une qualification de release n'est engagée que si elle est demandée.

## Appliquer le contrat du bon backend

Conserver les validations exactes existantes de Legacy et de Three de
compatibilité, y compris leurs intermédiaires projetés et références raster.
Le futur Three natif reçoit des ressources monde persistantes et un état de
présentation compact ; le `RenderFrame` projeté commun et l'identité des pixels,
tableaux ou compteurs entre backends ne sont pas ses critères d'acceptation.
Sa fidélité visuelle ne relâche aucune comparaison physique ou fonctionnelle.

Appliquer l'architecture, les invariants et la stratégie de validation du
document de référence sans les recopier dans un plan divergent. Réutiliser les
acquis validés. N1 commence par les protections, puis le prototype isolé ; sa
preuve porte sur l'absence de reconstruction **et de transfert effectif** des
attributs statiques après initialisation lors des mouvements de caméra.

## Exécuter seulement la tranche demandée

Pour une tranche de code autorisée, modifier les sources concernées sous
`src/simulateur-port/` et les points d'ancrage prévus par N1–N6. Le HTML est
généré par le build existant, jamais édité directement. Utiliser les suites et
hooks KJP existants ; préserver les références exactes. Exécuter les contrôles
proportionnels de la tranche, documenter leurs limites, puis actualiser Graphify
après une modification de code. Pour une modification documentaire seule,
aucun build, test d'exécution ni mise à jour du graphe n'est nécessaire.

Pour une adaptation d'API Three.js, charger `threejs-game-studio` et vérifier la
révision installée et ses API. Ses exemples génériques ne remplacent pas les
propriétaires de boucle, caméra, physique, interactions ou fond d'eau KJP.
Consulter les écarts signalés dans la section « Instructions externes au dépôt »
du cadrage ; ne pas modifier un skill générique ou global pour une règle KJP.
