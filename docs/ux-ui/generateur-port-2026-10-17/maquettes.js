(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const screens = ['accueil','localiser','candidats','edition','serie','places','verifier'];
  const icons = {
    select:'<path d="m5 3 13 9-7 1-3 7Z"/>',
    hand:'<path d="M6 12V7a1.5 1.5 0 0 1 3 0v4-7a1.5 1.5 0 0 1 3 0v7-6a1.5 1.5 0 0 1 3 0v6-4a1.5 1.5 0 0 1 3 0v8c0 5-9 8-12 1l-2-4c-1-3 2-3 3-1"/>',
    pontoon:'<rect x="3" y="9" width="18" height="6" rx="1"/><path d="M8 9v6m8-6v6"/>',
    land:'<path d="m3 17 4-10 7-3 7 7-3 9-9 1Z"/><path d="m8 16 3-5 6 2"/>',
    mooring:'<path d="M3 7h18M12 7v13M6 16l6 4 6-4"/><circle cx="12" cy="4" r="2"/>',
    berth:'<path d="M4 4h16v16H4Z"/><path d="M8 8h8v8H8Z"/>',
    entry:'<path d="m4 20 14-14m-9 0h9v9"/>',
    objects:'<rect x="4" y="4" width="5" height="5" rx="1"/><path d="M13 5h7m-7 3h5"/><rect x="4" y="15" width="5" height="5" rx="1"/><path d="M13 16h7m-7 3h5"/>',
    search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>'
  };
  const svgIcon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.select}</svg>`;
  const rawScreen = new URLSearchParams(location.search).get('ecran');
  const state = {screen:screens.includes(rawScreen)?rawScreen:'edition', selected:'pontoon', inspectorTab:'objet', filter:'tous', seriesCount:3, seriesSide:'both', occupancy:35, entryPresent:false, analyzing:false, projectName:'Port Tudy — exercice', drawingVisible:true, boatsVisible:true, selectedTool:'select'};
  let noticeTimer;
  let analyzeTimer;
  const candidates = [
    ['Ponton 01','61,5 m','way/230915998','pontoon',true],
    ['Ponton 02','72,2 m','way/230915999','pontoon',true],
    ['Ponton 03','59,2 m','way/230916001','pontoon',true],
    ['Ponton 04','79,7 m','way/453044121','pontoon',true],
    ['Ponton 05','59,6 m','way/453044122','pontoon',true],
    ['Ponton 06','46,9 m','way/453044123','pontoon',true],
    ['Petit ouvrage','8 m','way/739630581','pontoon',false],
    ['Catway proposé','21 m','way/230916000','catway',false],
    ['Petit élément','1 m','way/739630582','catway',false],
    ['Ligne de côte','Déborde de la zone','way/176427684','obstacle',false],
    ['Surface terrestre','Contour à examiner','way/117578513','land',false],
    ['Grande surface terrestre','Déborde de la zone','way/23606562','land',false]
  ].map((r,i)=>({id:i,title:r[0],dimension:r[1],source:r[2],type:r[3],included:r[4]}));

  function notice(message) {
    clearTimeout(noticeTimer);
    $('#notice').textContent=message;
    $('#notice').hidden=false;
    noticeTimer=setTimeout(()=>$('#notice').hidden=true,5000);
  }
  function dialog(content) {
    $('#dialogContent').innerHTML=`<div class="dialog-head"><span class="panel-eyebrow">KJP · proposition d’interface</span><button type="button" data-action="close-dialog" aria-label="Fermer la fenêtre">×</button></div>${content}`;
    $('#prototypeDialog').showModal();
  }
  function panelHead(eyebrow,title,subtitle='',badge='') {
    return `<div class="panel-header"><div><span class="panel-eyebrow">${eyebrow}</span><h1>${title}</h1>${subtitle?`<p>${subtitle}</p>`:''}${badge?`<span class="badge" style="margin-top:6px">${badge}</span>`:''}</div><button type="button" class="panel-close" data-action="close-panel" aria-label="Fermer le panneau">×</button></div>`;
  }
  function field(label,value,id,unit='',extra='') {
    return `<label class="field" for="${id}">${label}<span class="input-unit"><input id="${id}" value="${esc(value)}" ${extra}>${unit?`<span>${unit}</span>`:''}</span></label>`;
  }
  function commonMap(asset,overlay='',options={}) {
    return `<img class="port-drawing ${options.muted?'muted-map':''}" src="assets/port-${asset}.svg" alt="Géométrie pédagogique du port du guide, utilisée pour illustrer l’interface">
      <div class="map-topbar"><label class="map-search">${svgIcon('search')}<input aria-label="Rechercher un lieu sur la carte" value="Port Tudy, Groix"></label><button type="button" class="map-chip" data-action="layers"><span class="save-dot"></span>Fonds et objets <span>⌄</span></button></div>
      ${overlay}
      <div class="map-actions"><button type="button" class="map-chip" data-action="overview">⌖ <span>Vue d’ensemble</span></button><div class="zoom-controls"><button type="button" data-action="zoom-in" aria-label="Agrandir la carte">+</button><button type="button" data-action="zoom-out" aria-label="Réduire la carte">−</button></div></div>
      <div class="map-scale"><span class="scale-line"></span>${['serie','places'].includes(asset)?'10 m':'50 m'} <span>· Repère local métrique</span></div>
      <div class="map-attribution">Géométrie d’exercice KJP · © les contributeurs OpenStreetMap · ODbL · OpenSeaMap · aucun fond en ligne chargé dans la maquette</div>`;
  }
  function welcome() {
    return `<img class="port-drawing welcome-map" src="assets/port-reference.svg" alt="Fond illustratif du port pédagogique"><div class="welcome-shade"></div>
    <div class="welcome-content"><div class="welcome-overline"><span class="save-dot"></span>Votre prochain terrain de navigation</div><h1>Quel port souhaitez-vous<br>créer ?</h1><p>Partez d’un lieu, reprenez un fichier KJP ou dessinez votre port librement.</p>
    <form class="welcome-search" id="welcomeSearch"><input aria-label="Nom du port ou de la commune" placeholder="Nom du port ou de la commune" value="Port Tudy, Groix"><button type="submit" class="control primary">Localiser le port →</button></form>
    <div class="welcome-other"><button type="button" data-action="open-file">Ouvrir un fichier KJP</button><span class="welcome-divider"></span><button type="button" data-action="blank">Dessiner sans fond</button></div>
    <div class="resume-card"><div><small>BROUILLON SUR CET APPAREIL · EXEMPLE</small><strong>Port Tudy — exercice du guide</strong></div><button type="button" data-go="edition">Reprendre <span>→</span></button></div>
    <div class="welcome-note">Le brouillon reste dans ce navigateur. Exportez un KJP pour le conserver.</div></div>
    <div class="welcome-coordinate">47,6442° N · 3,4468° O<br>Fond d’illustration · aucun objet créé</div>`;
  }
  function locatePanel() {
    return panelHead('Localiser','Importer des ouvrages','À partir des données OpenStreetMap.')+`<div class="panel-body">
      <div class="scope-step"><span>✓</span><div><strong>Port Tudy, Groix</strong><p>Le lieu est trouvé. Les cartes servent de référence.</p><button class="text-link" type="button" data-action="change-location">Changer de lieu</button></div></div>
      <div class="scope-step"><span>2</span><div><strong>Délimiter la zone</strong><p>Gardez les bassins, les ouvrages et une marge autour du port.</p></div></div>
      <div class="scope-summary"><span>Zone choisie</span><strong>310 × 180 m</strong></div>
      <button type="button" class="control full" data-action="redraw">Redessiner la zone</button>
      <p class="fine-print">Maximum : 2 km par côté. Les géométries trouvées peuvent dépasser cette zone.</p>
      <div class="panel-section" style="margin-top:24px"><h2>Ce que l’import va faire</h2><p>Vous recevrez des propositions à examiner. Aucun objet ne sera ajouté sans votre choix.</p><div class="advice"><span>Le fond de carte et les ouvrages KJP sont deux couches distinctes.</span></div></div>
      ${state.analyzing?`<div class="async-state" role="status" aria-live="polite"><strong>Recherche des ouvrages…</strong><div class="async-track"></div><p>État d’attente illustratif · nouvelle tentative automatique si le service est occupé.</p><button type="button" class="text-link" data-action="cancel-analysis">Annuler l’analyse</button></div>`:`<details><summary>Coordonnées et détails des sources</summary><p>Centre de la vue : 47,644200 / −3,446750.<br>Les références seraient conservées avec les objets importés.</p></details>`}
    </div><div class="panel-footer"><p>L’analyse peut prendre plusieurs minutes.</p><button type="button" class="control primary full" data-action="analyze" ${state.analyzing?'disabled':''}>${state.analyzing?'Analyse en cours…':'Analyser cette zone →'}</button></div>`;
  }
  function candidatePanel() {
    const included=candidates.filter(x=>x.included).length;
    const filtered=candidates.filter(x=>state.filter==='tous'||x.type===state.filter);
    return panelHead('Revue OpenStreetMap','Examiner les propositions','12 propositions · vérifiez les formes et les catégories.')+`<div class="panel-body">
    <div class="advice warning" style="margin-bottom:15px"><span><strong>2 objets dépassent la zone.</strong><br>Le cadrage du port est conservé.</span></div><div class="filter-chips" aria-label="Filtrer les propositions">${[['tous','Tout · 12'],['pontoon','Pontons · 7'],['land','Terres · 2']].map(([key,label])=>`<button type="button" class="filter-chip ${key===state.filter?'active':''}" data-filter="${key}" aria-pressed="${key===state.filter}">${label}</button>`).join('')}</div>
    <div class="candidate-summary"><span>${filtered.length} proposition${filtered.length>1?'s':''} affichée${filtered.length>1?'s':''}</span><button type="button" data-action="include-visible">Inclure les objets affichés</button></div>
    <div class="candidate-list">${filtered.map(c=>`<article class="candidate-row ${c.included?'selected':''}"><input type="checkbox" id="candidate-${c.id}" data-candidate="${c.id}" ${c.included?'checked':''} aria-label="Inclure ${esc(c.title)}"><div><strong><label for="candidate-${c.id}">${c.title}</label></strong><small>${c.dimension} · ${c.included?'Retenu':'À examiner'}</small><select data-category="${c.id}" aria-label="Catégorie de ${esc(c.title)}">${[['pontoon','Ponton'],['catway','Catway'],['obstacle','Digue / quai'],['land','Terre non navigable'],['ignore','Ignorer']].map(([k,l])=>`<option value="${k}" ${k===c.type?'selected':''}>${l}</option>`).join('')}</select><button type="button" class="text-link" data-source="${c.id}">Source et classification</button></div></article>`).join('')}</div>

    </div><div class="panel-footer"><p><strong>${included} objet${included>1?'s':''} retenu${included>1?'s':''}</strong> · la classification ne certifie pas les dimensions.</p><button type="button" class="control primary full" data-action="integrate" ${included===0?'disabled':''}>Intégrer ${included} objet${included>1?'s':''} →</button></div>`;
  }
  function objectsPanel() {
    return panelHead('Objets du port','Retrouver un objet','Sélection synchronisée avec la carte.')+`<div class="panel-body"><div class="advice" style="margin-bottom:14px"><span>Choisissez un type pour éviter les objets superposés.</span></div><div class="filter-chips"><button type="button" class="filter-chip active" data-action="object-filter">Tous</button><button type="button" class="filter-chip" data-action="object-filter">Ouvrages</button><button type="button" class="filter-chip" data-action="object-filter">Places</button></div><div class="objects-list"><div class="object-group-label">Ouvrages · 16</div>${['Ponton 01','Ponton 02','Ponton 03','Ponton 04','Ponton 05','Ponton 06','Ponton 07'].map((name,i)=>`<button type="button" class="object-row ${i===6?'active':''}" data-object="pontoon"><span>${name}<small>${i===6?'Manuel · 40,0 × 2,0 m':'Importé depuis OSM'}</small></span><span>›</span></button>`).join('')}<button type="button" class="object-row" data-go="serie"><span>Série de catways<small>Ponton 07 · 6 membres</small></span>›</button><div class="object-group-label">Navigation</div><button type="button" class="object-row" data-object="entry"><span>Entrée principale<small>Cap nautique · 225°</small></span>›</button><button type="button" class="object-row" data-go="places"><span>Visiteurs du guide<small>Place réservée aux visiteurs</small></span>›</button></div></div>`;
  }
  function entryPanel() {
    return panelHead('Navigation','Entrée du bateau','Position et orientation au démarrage du simulateur.')+`<div class="panel-body"><span class="badge">Point d’entrée unique</span><div class="entry-compass" aria-label="Cap nautique de 225 degrés"><span class="n">N · 0°</span><span class="e">90°</span><span class="s">180°</span><span class="w">270°</span><i class="arrow"></i></div><div class="field-grid">${field('Cap nautique',225,'entry-heading','°','type="number" min="0" max="359"')}<label class="field">Direction<select aria-label="Direction de l’entrée"><option>Sud-ouest</option><option>Nord</option><option>Est</option></select></label></div><p class="fine-print">0° = Nord · 90° = Est. Le cap de l’entrée utilise une convention différente de l’angle des ouvrages.</p><div class="panel-section" style="padding-top:15px"><button type="button" class="control full" data-action="place-entry">Replacer sur la carte</button><p>Choisissez le départ dans l’eau puis définissez son orientation.</p></div><div class="advice warning"><span>Contrôlez l’espace pour tout le bateau, à distance des ouvrages. Ce point reste une vérification visuelle.</span></div></div><div class="panel-footer"><button type="button" class="control primary full" data-action="confirm-entry">Confirmer ce point d’entrée →</button></div>`;
  }
  function editPanel() {
    if(state.selected==='objects')return objectsPanel();
    if(state.selected==='entry')return entryPanel();
    const tab=state.inspectorTab;
    return panelHead('Objet sélectionné','Ponton 07','Identifiant : pontoon-7', 'Ajout manuel · exercice')+`<div class="panel-tabs" aria-label="Rubriques de l’objet">${[['objet','Dimensions'],['equipements','Équipements'],['avance','Avancé']].map(([k,l])=>`<button type="button" class="${tab===k?'active':''}" data-inspector="${k}" aria-pressed="${tab===k}">${l}</button>`).join('')}</div><div class="panel-body">
    ${tab==='objet'?`<div class="panel-section"><div class="section-line"><h2>Dimensions</h2><span class="badge neutral">En mètres</span></div><div class="field-grid">${field('Longueur','40,0','pontoon-length','m')}${field('Largeur','2,0','pontoon-width','m')}${field('Angle du plan','0','pontoon-heading','°')}<div class="field"><span>Orientation</span><div class="angle-hint" style="margin-top:5px"><span class="axis-mark">↗</span><span>0° Est<br>90° Nord</span></div></div></div><p class="fine-print">Entrée pour appliquer · Échap pour abandonner une saisie.</p></div>
    <div class="panel-section"><div class="section-line"><h2>Aménagements du ponton</h2></div><div class="equipment-item"><span class="equipment-symbol">╫</span><div><strong>6 catways</strong><small>3 de chaque côté · 1 série</small></div><button type="button" data-go="serie" aria-label="Modifier la série de catways">Modifier</button></div><div class="equipment-item"><span class="equipment-symbol">⊥</span><div><strong>6 taquets sur le ponton</strong><small>3 par bord</small></div><button type="button" data-inspector="equipements">Régler</button></div><div class="equipment-item"><span class="equipment-symbol">▤</span><div><strong>12 places associées</strong><small>Dont 1 place visiteurs</small></div><button type="button" data-go="places">Voir</button></div></div><div class="source-note"><span>Origine<br><strong>Tracé manuel pédagogique</strong></span><button type="button" class="text-link" data-action="source-manual">Détails</button></div>`:''}
    ${tab==='equipements'?`<div class="panel-section"><h2>Taquets du ponton</h2><div class="field-grid"><label class="field">Répartition<select id="cleat-mode"><option>Nombre par bord</option><option>Espacement</option></select></label>${field('Taquets par bord',3,'cleat-count','','type="number" min="1" max="30"')}</div><p>6 taquets sur le ponton. Les taquets des catways sont gérés avec leur série.</p><button type="button" class="control full" data-action="cleats">Mettre à jour les taquets</button></div><div class="panel-section"><h2>Catways</h2><p>Une série de 6 catways est rattachée à ce ponton.</p><button type="button" class="control primary full" data-go="serie">Modifier la série →</button></div><div class="panel-section"><h2>Places sur pendille</h2><p>Créez une série dédiée avec un côté de l’eau explicite.</p><button type="button" class="control full" data-action="pendilles">Configurer des pendilles</button></div>`:''}
    ${tab==='avance'?`<div class="panel-section"><h2>Position dans le repère local</h2><div class="field-grid">${field('Est','−92,4','pontoon-east','m')}${field('Nord','27,3','pontoon-north','m')}</div><p class="fine-print">Ces coordonnées sont locales au port. Elles ne sont pas des latitudes et longitudes.</p></div><div class="panel-section"><h2>Dimensions verticales</h2><div class="field-grid">${field('Épaisseur','0,5','pontoon-thickness','m')}${field('Niveau du pont','0,5','pontoon-deck','m')}</div><p class="fine-print">Le niveau du pont est mesuré au-dessus de l’eau. Ce champ ne décrit pas la profondeur du bassin.</p></div><div class="source-note"><span>Identifiant technique<br><strong>pontoon-7</strong></span><span>Lecture seule</span></div>`:''}
    </div><div class="panel-footer"><div class="footer-actions"><button type="button" class="control" data-action="duplicate">Dupliquer</button><button type="button" class="control subtle" data-action="delete">Supprimer</button><button type="button" class="control subtle" data-action="focus-object" aria-label="Centrer sur le ponton">⌖</button></div></div>`;
  }
  function seriesPanel() {
    const sides=state.seriesSide==='both'?2:1, count=state.seriesCount*sides;
    return panelHead('Ponton 07 / Série de catways','Modifier la série','Les réglages de cette série sont chargés.', 'Série existante · 6 catways')+`<div class="panel-body"><div class="panel-section"><div class="field-grid"><label class="field">Répartition<select id="series-mode"><option value="count">Nombre</option><option value="spacing">Entraxe</option></select></label>${field('Nombre par côté',state.seriesCount,'series-count','','type="number" min="1" max="12"')}</div><label class="field" style="margin-top:16px">Côté du ponton</label><div class="side-toggle" style="margin-top:7px">${[['both','Deux côtés'],['port','Bâbord'],['starboard','Tribord']].map(([k,l])=>`<button type="button" data-side="${k}" class="${k===state.seriesSide?'active':''}" aria-pressed="${k===state.seriesSide}">${l}</button>`).join('')}</div><div class="series-result" aria-live="polite"><strong id="seriesTotal">${count} catways au total</strong><p id="seriesEquation">${state.seriesCount} par côté × ${sides} côté${sides>1?'s':''} · aperçu temporaire</p></div></div><div class="panel-section"><h2>Dimensions et marges</h2><div class="field-grid">${field('Longueur','8,0','series-length','m')}${field('Largeur','0,6','series-width','m')}${field('Marge au début','4,0','series-start','m')}${field('Marge à la fin','4,0','series-end','m')}</div><p class="fine-print">Les marges sont mesurées le long du ponton parent.</p></div><div class="advice"><span>La mise à jour remplace les réglages de cette série. Elle ne crée pas de second groupe.</span></div><details><summary>Taquets et objets associés</summary><p>La réalisation devra annoncer les effets sur les taquets, les places et les bateaux associés. L’aperçu de cette maquette ne recalcule pas leurs géométries.</p></details></div><div class="panel-footer"><p>Le dessin pointillé est un aperçu. Rien n’est engagé avant votre validation.</p><div class="footer-actions"><button type="button" class="control" data-go="edition">Annuler</button><button type="button" class="control primary" data-action="apply-series">Mettre à jour la série</button></div></div>`;
  }
  function placesPanel() {
    return panelHead('Préparer la navigation','Places et bateaux','Réservez les visiteurs avant de régler le décor.')+`<div class="panel-body"><div class="places-counter"><div><strong>12</strong><span>places</span></div><div><strong>1</strong><span>visiteur</span></div><div><strong>8</strong><span>bateaux</span></div></div><div class="panel-section"><div class="section-line"><h2>Places visiteurs</h2><button type="button" class="text-link" data-action="berth-list">Voir les 12 places</button></div><div class="berth-row active"><div><strong>V · Visiteurs du guide</strong><small>Libre · Ponton 07 · 7,2 × 4,0 m</small></div><button type="button" data-action="visitor-detail">›</button></div><p class="fine-print">Les places visiteurs sont exclues du peuplement automatique.</p><button type="button" class="text-link" data-action="add-visitor">Marquer une autre place visiteurs</button></div><div class="panel-section"><h2>Bateaux de décor</h2><label class="range-label" for="occupancy">Consigne d’occupation <output id="occupancyOutput">${state.occupancy} %</output></label><input id="occupancy" class="occupancy-control" type="range" min="0" max="100" value="${state.occupancy}"><p>Le nombre final dépend des places disponibles et de leurs dimensions.</p><button type="button" class="control primary full" data-action="populate">Régénérer le peuplement</button><p class="fine-print">Remplace les bateaux de décor actuels ; ne remplit pas les places visiteurs.</p></div><details><summary>Recalculer les places depuis les catways</summary><p>Cette opération reconstruit les places. Vérifiez ses conséquences sur les places ajoutées autrement.</p>${field('Largeur des places','4,0','berth-width','m')}<button type="button" class="control danger full" data-action="recompute" style="margin-top:12px">Examiner le recalcul</button></details></div><div class="panel-footer"><button type="button" class="control full" data-action="open-entry">Définir l’entrée du bateau →</button></div>`;
  }
  function reviewPanel() {
    return panelHead('Vérifier et exporter',state.entryPresent?'Le fichier peut être exporté':'1 point à corriger',state.entryPresent?'Le format est prêt ; gardez un contrôle visuel du port.':'Corrigez l’entrée avant le téléchargement.')+`<div class="panel-body"><div class="panel-section"><h2>Contrôles du fichier</h2><div class="validation-item"><span>✓</span><div><strong>Document KJP lisible</strong><p>Structure du document et valeurs requises.</p></div></div><div class="validation-item"><span>✓</span><div><strong>Nom du port renseigné</strong><p>${esc(state.projectName)}</p></div></div><div class="validation-item ${state.entryPresent?'':'error'}"><span>${state.entryPresent?'✓':'!'}</span><div><strong>${state.entryPresent?'Entrée définie · cap 225°':'Le bateau n’a pas de point d’entrée'}</strong><p>${state.entryPresent?'Le départ sera placé au point choisi.':'Placez un départ dans l’eau, puis définissez son cap.'}</p>${state.entryPresent?'':`<button type="button" class="control small" data-action="open-entry">Placer l’entrée →</button>`}</div></div></div><div class="panel-section manual-checks"><div class="section-line"><h2>À contrôler vous-même</h2><span class="badge neutral">Visuel</span></div><label class="check-row"><input type="checkbox">Les raccords terre / ouvrages et les passages</label><label class="check-row"><input type="checkbox">Les dimensions et équipements importés</label><label class="check-row"><input type="checkbox">L’accès à la place visiteurs et le départ du bateau</label><p class="fine-print">Le contrôle du format ne certifie pas la fidélité de la reconstitution.</p></div><div class="file-summary"><span>▤</span><div><strong>port-tudy-exercice.kjp</strong><small>Les fonds de carte ne sont pas inclus.</small></div></div><button type="button" class="text-link" data-action="project" style="margin-top:15px">Nom, auteur et sources du port</button></div><div class="panel-footer"><p>Le brouillon local et le fichier téléchargé sont deux sauvegardes différentes.</p><button type="button" class="control primary full" data-action="export" ${state.entryPresent?'':'disabled'}>Télécharger le fichier .kjp ↓</button></div>`;
  }
  function buildRail() {
    const tools=[['select','select','Choisir','Sélectionner un objet'],['hand','hand','Vue','Déplacer la vue'],['pontoon','pontoon','Ponton','Ajouter un ponton'],['land','land','Ouvrage','Ajouter une digue ou une terre'],['mooring','mooring','Amarrer','Équipements d’amarrage'],['berth','berth','Places','Voir les places et bateaux'],['entry','entry','Entrée','Placer et orienter l’entrée'],['objects','objects','Objets','Afficher la liste des objets']];
    $('#toolRail').innerHTML=tools.map(([key,icon,label,accessible],i)=>`${[2,5,7].includes(i)?'<div class="rail-divider"></div>':''}<button type="button" class="rail-tool ${key===state.selectedTool?'active':''} ${i===7?'rail-bottom':''}" data-tool="${key}" aria-label="${accessible}" aria-pressed="${key===state.selectedTool}">${svgIcon(icon)}<span>${label}</span></button>`).join('');
  }
  function render() {
    $('#prototype').dataset.screen=state.screen;
    $('#screenPicker').value=state.screen;
    $('#projectMenu').innerHTML=`${state.screen==='accueil'?'Nouveau projet':esc(state.projectName)} <span>⌄</span>`;
    $('.save-indicator').innerHTML=`<span class="save-dot"></span><span>${state.screen==='accueil'?'Brouillon disponible':'Brouillon enregistré'} <small>sur cet appareil</small></span>`;
    const stage=state.screen==='accueil'||state.screen==='localiser'||state.screen==='candidats'?1:state.screen==='edition'||state.screen==='serie'?2:state.screen==='places'?3:4;
    document.querySelectorAll('[data-stage]').forEach(el=>{if(Number(el.dataset.stage)===stage)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});
    buildRail();
    $('#contextPanel').classList.toggle('closed',state.screen==='accueil');
    $('#contextPanel').classList.toggle('wide',['candidats','verifier'].includes(state.screen));
    $('#mapStage').classList.toggle('has-panel',state.screen!=='accueil');
    $('#mapStage').style.cursor=state.selectedTool==='hand'?'grab':'';
    if(state.screen==='accueil'){$('#mapStage').innerHTML=welcome();$('#contextPanel').innerHTML='';}
    if(state.screen==='localiser'){
      $('#mapStage').innerHTML=commonMap('reference',`<div class="scope-box"><span class="scope-corner"></span><span class="scope-corner"></span><span class="scope-corner"></span><span class="scope-corner"></span><span class="scope-label">Zone d’analyse · 310 × 180 m</span></div><div class="map-instruction">Zone prête à analyser <span>·</span> aucune géométrie intégrée</div>`,{muted:true});$('#contextPanel').innerHTML=locatePanel();
    }
    if(state.screen==='candidats'){
      $('#mapStage').innerHTML=commonMap('propositions',`<div class="selection-card" style="top:28%;left:26%"><strong>Ponton proposé · 61,5 m</strong><small>OSM · à confirmer avant intégration</small></div><div class="map-instruction"><span class="mini-dash"></span> Propositions à examiner <span>·</span> cadrage conservé</div>`);$('#contextPanel').innerHTML=candidatePanel();
    }
    if(state.screen==='edition'){
      $('#mapStage').innerHTML=commonMap('exercice',`<div class="selection-card"><strong>${state.selected==='entry'?'Entrée principale · 225°':'Ponton 07 · 40,0 × 2,0 m'}</strong><small>${state.selected==='entry'?'Cap nautique · 0° au Nord':'Objet KJP · ajout manuel'}</small></div><div class="map-instruction">${state.selectedTool==='hand'?'Faites glisser pour déplacer la vue':'Sélectionner un objet'} <kbd>${state.selectedTool==='hand'?'Vue':'V'}</kbd><span>·</span><button type="button" class="text-link" data-action="objects">Liste des objets</button></div>`);$('#contextPanel').innerHTML=editPanel();
    }
    if(state.screen==='serie'){
      $('#mapStage').innerHTML=commonMap('serie',`<div class="series-map-card"><span></span><strong>Aperçu de la série</strong><span id="mapSeriesCount" style="border:0;background:none;width:auto;height:auto">${state.seriesCount*(state.seriesSide==='both'?2:1)} catways</span></div><div class="series-overlay" id="seriesOverlay" aria-hidden="true"></div><div class="map-instruction">Série existante <span>→</span> aperçu avant mise à jour</div>`);$('#contextPanel').innerHTML=seriesPanel();updateSeries();
    }
    if(state.screen==='places'){
      $('#mapStage').innerHTML=commonMap('places',`<div class="selection-card" style="left:14%;top:14%"><strong>V · Visiteurs du guide</strong><small>Place libre · exclue du peuplement</small></div><div class="map-instruction"><button type="button" class="text-link" data-action="berth-list">Sélectionner une place dans la liste</button></div>`);$('#contextPanel').innerHTML=placesPanel();
    }
    if(state.screen==='verifier'){
      $('#mapStage').innerHTML=commonMap(state.entryPresent?'exercice':'sans-entree',`<div class="review-card"><div class="review-icon">${state.entryPresent?'✓':'↗'}</div><span class="panel-eyebrow">Avant de naviguer</span><h2>${state.entryPresent?'Votre fichier est prêt.<br>Essayez maintenant le port.':'Un dernier point<br>avant le départ.'}</h2><p>${state.entryPresent?'Exportez le KJP, chargez-le dans le simulateur et contrôlez les passages, le départ et les visiteurs.':'Le fichier a besoin d’une entrée pour placer le bateau. Les contrôles du format vous guident vers la correction.'}</p><div class="review-item"><span>✓</span>Le projet reste dans votre brouillon local.</div><div class="review-item"><span>○</span>La qualité des tracés reste à vérifier.</div></div>`,{muted:true});$('#contextPanel').innerHTML=reviewPanel();
    }
    $('#statusCount').innerHTML=state.screen==='accueil'||state.screen==='localiser'?'0 structure <span>·</span> 0 bateau <span>·</span> 0 place':state.screen==='candidats'?`${candidates.filter(x=>x.included).length} propositions retenues <span>·</span> en attente d’intégration`:'16 structures <span>·</span> 8 bateaux <span>·</span> 12 places';
    const image=$('#mapStage .port-drawing');if(image)image.style.visibility=state.drawingVisible?'visible':'hidden';
    updateScale();
    positionSelection();
  }
  function positionSelection(){
    const card=$('#mapStage .selection-card'),map=$('#mapStage');
    const point=state.screen==='candidats'?[497.3,369.8]:state.screen==='places'?[649,356.8]:null;
    if(!card||!point)return;
    const cover=Math.max(map.clientWidth/1000,map.clientHeight/720);
    card.style.left=`${Math.max(15,Math.min(map.clientWidth-card.offsetWidth-15,point[0]*cover+(map.clientWidth-1000*cover)/2-30))}px`;
    card.style.top=`${Math.max(75,point[1]*cover+(map.clientHeight-720*cover)/2-90)}px`;
  }
  function updateScale(){
    const map=$('#mapStage'),image=$('#mapStage .port-drawing'),line=$('#mapStage .scale-line');
    if(!line||!image)return;
    const detail=['serie','places'].includes(state.screen);
    const cover=Math.max(map.clientWidth/1000,map.clientHeight/720);
    line.style.width=`${(detail?10*1000/120:50*1000/545)*cover*Number(image.dataset.zoom||1)}px`;
  }
  function go(screen,options={}) {
    clearTimeout(analyzeTimer);state.analyzing=false;
    state.screen=screen;
    if(['accueil','localiser','candidats','verifier'].includes(screen))state.selectedTool='select';
    if(screen==='edition'&&!options.keepSelection){state.selected='pontoon';state.selectedTool='select';}
    if(screen==='places')state.selectedTool='berth';
    if(screen==='serie')state.selectedTool='select';
    $('#layerPopover').hidden=true;
    $('#notice').hidden=true;
    history.replaceState(null,'',`${location.pathname}?ecran=${screen}`);
    render();
  }
  function updateSeries() {
    const count=state.seriesCount*(state.seriesSide==='both'?2:1);
    if($('#seriesTotal'))$('#seriesTotal').textContent=`${count} catways au total`;
    if($('#seriesEquation'))$('#seriesEquation').textContent=`${state.seriesCount} par côté × ${state.seriesSide==='both'?2:1} côté${state.seriesSide==='both'?'s':''} · aperçu temporaire`;
    if($('#mapSeriesCount'))$('#mapSeriesCount').textContent=`${count} catways`;
    if($('#seriesOverlay')){
      const marks=[];
      for(let i=0;i<state.seriesCount;i++){
        const x=state.seriesCount===1?496.4:363.1+i*266.7/(state.seriesCount-1);
        if(state.seriesSide==='both'||state.seriesSide==='port')marks.push(`<rect x="${x-3}" y="323.5" width="6" height="66.7" rx="2"/>`);
        if(state.seriesSide==='both'||state.seriesSide==='starboard')marks.push(`<rect x="${x-3}" y="404.3" width="6" height="66.7" rx="2"/>`);
      }
      $('#seriesOverlay').innerHTML=`<svg viewBox="0 0 1000 720" preserveAspectRatio="xMidYMid slice"><g fill="#fcf1df" fill-opacity=".65" stroke="#a76514" stroke-width="2" stroke-dasharray="5 3">${marks.join('')}</g></svg>`;
    }
  }
  function layers() {
    const p=$('#layerPopover');p.hidden=!p.hidden;
    if(!p.hidden)p.innerHTML=`<h2>Fonds et objets</h2><div class="layer-title">FONDS DE RÉFÉRENCE</div><label class="check-row"><input type="checkbox" checked data-layer="reference">Carte de référence</label><div class="layer-sub">Ne crée pas d’objet KJP.</div><label class="check-row"><input type="checkbox" data-layer="satellite">Satellite</label><div class="layer-sub">Illustration uniquement, aucune image chargée.</div><div class="layer-divider"></div><div class="layer-title">OBJETS DE TRAVAIL</div><label class="check-row"><input type="checkbox" ${state.drawingVisible?'checked':''} data-layer="objects">Objets du port KJP</label><label class="check-row"><input type="checkbox" checked data-layer="candidates">Propositions OSM · pointillés</label><div class="layer-divider"></div><button type="button" class="control full" data-action="only-port">Voir seulement le port</button>`;
  }
  function openProject() {
    dialog(`<h2>Informations du port</h2><p>Les textes de l’auteur sont conservés tels qu’ils sont saisis.</p><div class="field-grid"><label class="field span-2">Nom du port<input id="projectNameInput" value="${esc(state.projectName)}"></label><label class="field span-2">Auteur<input value="Exemple du guide KJP"></label><label class="field span-2">Sources<textarea rows="2">OpenStreetMap / OpenSeaMap ; tracés pédagogiques.</textarea></label><label class="field span-2">Limites et approximations<textarea rows="3">Exercice du guide. Les contours sont simplifiés et le ponton à catways est un ajout pédagogique.</textarea></label></div><div class="dialog-actions"><button type="button" class="control" data-action="close-dialog">Annuler</button><button type="button" class="control primary" data-action="save-project">Appliquer dans la maquette</button></div>`);
  }
  function openEntry() {
    state.selected='entry';state.selectedTool='entry';go('edition',{keepSelection:true});
  }
  document.addEventListener('submit',e=>{if(e.target.id==='welcomeSearch'){e.preventDefault();go('localiser');}});
  document.addEventListener('click',e=>{
    const el=e.target.closest('button');if(!el)return;
    if(el.dataset.go){go(el.dataset.go);return;}
    if(el.dataset.inspector){state.inspectorTab=el.dataset.inspector;render();return;}
    if(el.dataset.filter){state.filter=el.dataset.filter;render();return;}
    if(el.dataset.side){state.seriesSide=el.dataset.side;render();return;}
    if(el.dataset.source){const c=candidates[Number(el.dataset.source)];dialog(`<h2>${c.title}</h2><p>Source : OpenStreetMap · ${c.source}.</p><p>La classification est une proposition à contrôler sur le fond. Elle ne certifie ni la largeur ni le niveau de l’ouvrage.</p><label class="field">Catégorie proposée<input value="${c.type==='pontoon'?'Ponton':c.type}" readonly></label><div class="dialog-actions"><button type="button" class="control primary" data-action="close-dialog">Revenir à la revue</button></div>`);return;}
    if(el.dataset.object){state.selected=el.dataset.object;state.inspectorTab='objet';render();return;}
    if(el.dataset.tool){
      state.selectedTool=el.dataset.tool;
      if(el.dataset.tool==='entry'){openEntry();return;}
      if(el.dataset.tool==='berth'){go('places');return;}
      if(el.dataset.tool==='objects'){state.selected='objects';go('edition',{keepSelection:true});return;}
      if(el.dataset.tool==='mooring'){state.inspectorTab='equipements';go('edition');return;}
      buildRail();$('#mapStage').style.cursor=state.selectedTool==='hand'?'grab':'';
      if(state.selectedTool==='pontoon')notice('Maquette : un clic sur l’eau ouvrirait l’ajout d’un ponton.');
      if(state.selectedTool==='land')dialog(`<h2>Dessiner un ouvrage</h2><p>L’outil choisi donnerait ses instructions directement sur la carte.</p><div class="dialog-actions"><button type="button" class="control" data-action="choose-land">Surface terrestre</button><button type="button" class="control primary" data-action="choose-wall">Digue / quai</button></div>`);
      if(state.selectedTool==='hand')notice('Mode Vue : déplacer la carte sans déplacer les objets.');
      return;
    }
    const action=el.dataset.action;
    if(el.id==='projectMenu'||action==='project'){openProject();return;}
    if(action==='close-dialog'){$('#prototypeDialog').close();return;}
    if(action==='save-project'){state.projectName=$('#projectNameInput').value||state.projectName;$('#prototypeDialog').close();render();notice('Informations mises à jour dans cette maquette uniquement.');return;}
    if(action==='layers'){layers();return;}
    if(action==='close-panel'){$('#contextPanel').classList.add('closed');$('#mapStage').classList.remove('has-panel');notice('Panneau fermé · utilisez Objets ou une étape pour le retrouver.');return;}
    if(action==='objects'){state.selected='objects';go('edition',{keepSelection:true});return;}
    if(action==='help')dialog(`<h2>Un atelier, quatre espaces</h2><p><strong>Localiser</strong> votre zone, <strong>Construire</strong> ses ouvrages, <strong>Préparer</strong> les places et l’entrée, puis <strong>Vérifier</strong> le fichier.</p><p>Les étapes restent accessibles librement. Cette présentation simule les interactions sans modifier le générateur ni créer de port réel.</p><a class="control" href="../../guide-generateur.fr.md" target="_blank" rel="noopener">Lire le guide utilisateur</a><div class="dialog-actions"><button type="button" class="control primary" data-action="close-dialog">Revenir au port</button></div>`);
    if(action==='blank'){go('edition');notice('Vue d’édition illustrée · le dessin libre utiliserait les mêmes outils.');}
    if(action==='open-file')dialog(`<h2>Ouvrir un fichier KJP</h2><p>L’interface réalisée proposerait ici le choix d’un fichier. Si le brouillon a des modifications à conserver, le remplacement serait explicite.</p><div class="advice warning"><span>Ouvrir un fichier remplace le port courant et l’historique de la session.</span></div><div class="dialog-actions"><button type="button" class="control" data-action="close-dialog">Annuler</button><button type="button" class="control primary" data-action="open-example">Ouvrir l’exemple illustré</button></div>`);
    if(action==='open-example'){$('#prototypeDialog').close();go('edition');}
    if(action==='change-location'){go('accueil');}
    if(action==='redraw')notice('Outil Emprise : ajouter des sommets, fermer sur le premier point, ou choisir Terminer.');
    if(action==='analyze'){state.analyzing=true;render();analyzeTimer=setTimeout(()=>{if(state.analyzing)go('candidats');},4500);}
    if(action==='cancel-analysis'){clearTimeout(analyzeTimer);state.analyzing=false;render();notice('Analyse simulée annulée. Votre travail serait conservé.');}
    if(action==='include-visible'){candidates.forEach(c=>{if(state.filter==='tous'||c.type===state.filter)c.included=true;});render();}
    if(action==='integrate'){const n=candidates.filter(c=>c.included).length;go('edition');notice(`Simulation : ${n} objets seraient intégrés. La vue suivante illustre le port ensuite aménagé.`);}
    if(action==='apply-series'){go('edition');notice('Simulation : la série existante serait mise à jour, sans créer de second groupe.');}
    if(action==='populate')dialog(`<h2>Régénérer les bateaux de décor ?</h2><p>La consigne sera de <strong>${state.occupancy} %</strong>. Les 8 bateaux de décor actuels seront remplacés. Les places visiteurs resteront exclues du peuplement.</p><p class="fine-print">Cette maquette ne calcule pas de nouveau nombre de bateaux.</p><div class="dialog-actions"><button type="button" class="control" data-action="close-dialog">Annuler</button><button type="button" class="control primary" data-action="confirm-populate">Régénérer le décor</button></div>`);
    if(action==='confirm-populate'){$('#prototypeDialog').close();notice('Simulation du peuplement confirmée · aucun fichier réel modifié.');}
    if(action==='recompute')dialog(`<h2>Recalculer les places</h2><p>Cette opération reconstruit les places depuis les catways. Des places créées autrement peuvent être retirées.</p><div class="advice warning"><span>La version réalisée devra indiquer les objets affectés avant d’engager le recalcul. La conservation des places manuelles ne peut pas être promise sans adaptation fonctionnelle.</span></div><div class="dialog-actions"><button type="button" class="control primary" data-action="close-dialog">Conserver les places actuelles</button></div>`);
    if(action==='open-entry')openEntry();
    if(action==='place-entry')notice('Choisissez un point dans l’eau, puis définissez le cap. Alternative : saisie numérique dans le panneau.');
    if(action==='confirm-entry'){state.entryPresent=true;go('verifier');notice('Entrée définie dans l’état illustratif · les contrôles du fichier sont prêts.');}
    if(action==='export')dialog(`<h2>Après le téléchargement</h2><p><strong>1.</strong> Conservez le fichier KJP dans vos documents.<br><strong>2.</strong> Ouvrez le simulateur et choisissez « Charger un port KJP ».<br><strong>3.</strong> Vérifiez le départ, les passages et votre place visiteurs.</p><div class="advice"><span>Maquette de présentation : aucun fichier KJP n’est généré ni téléchargé ici.</span></div><div class="dialog-actions"><button type="button" class="control primary" data-action="close-dialog">Revenir au projet</button></div>`);
    if(action==='berth-list'||action==='add-visitor')dialog(`<h2>Choisir une place</h2><p>Sélectionnez une place dans la liste pour la retrouver sur la carte.</p>${['Visiteurs du guide','Place 02 · libre','Place 03 · occupée','Place 04 · libre'].map((s,i)=>`<button type="button" class="object-row ${i===0?'active':''}" data-action="select-berth">${s}<span>›</span></button>`).join('')}<div class="dialog-actions"><button type="button" class="control" data-action="close-dialog">Fermer</button></div>`);
    if(action==='select-berth'){$('#prototypeDialog').close();notice('Place sélectionnée dans la maquette · elle serait surlignée sur la carte.');}
    if(action==='visitor-detail')dialog(`<h2>Place visiteurs</h2><label class="check-row"><input type="checkbox" checked>Réserver aux visiteurs</label><label class="field" style="margin-top:16px">Nom de la place<input value="Visiteurs du guide"></label><p>Cette place est exclue du peuplement automatique.</p><div class="dialog-actions"><button type="button" class="control primary" data-action="close-dialog">Terminer</button></div>`);
    if(action==='pendilles')dialog(`<h2>Créer des places sur pendille</h2><p>Ponton 07 · préparez une série distincte des places sur catways.</p><div class="field-grid">${field('Nombre de places',3,'pendille-number','','type="number" min="1" max="20"')}<label class="field">Côté de l’eau<select><option>À gauche de l’axe</option><option>À droite de l’axe</option></select></label>${field('Marge au début','2,0','pendille-margin','m')}${field('Largeur de place','4,0','pendille-width','m')}</div><details style="margin-top:16px"><summary>Réglages avancés</summary><p>Distance du corps-mort, profondeur et longueur disponible seraient précisés ici avec leurs unités.</p></details><div class="dialog-actions"><button type="button" class="control" data-action="close-dialog">Annuler</button><button type="button" class="control primary" data-action="preview-pendille">Prévisualiser la série</button></div>`);
    if(action==='preview-pendille'){$('#prototypeDialog').close();notice('Intention de design : un aperçu précéderait la création des places sur pendille.');}
    if(action==='only-port'){state.drawingVisible=true;$('#layerPopover').hidden=true;$('#mapStage .port-drawing')?.classList.remove('muted-map');notice('Le mode Port seul serait disponible sans modifier les objets.');}
    if(action==='zoom-in'||action==='zoom-out'){const image=$('#mapStage .port-drawing');if(image){const current=Number(image.dataset.zoom||1);const next=Math.max(.7,Math.min(2,current+(action==='zoom-in' ? .15 : -.15)));image.dataset.zoom=next;image.style.transform=`scale(${next})`;updateScale();}}
    if(action==='overview'){const image=$('#mapStage .port-drawing');if(image){image.style.transform='';image.dataset.zoom=1;updateScale();}notice('Vue d’ensemble rétablie.');}
    if(action==='focus-object')notice('Le cadrage se centrerait sur le ponton sélectionné.');
    if(action==='source-manual')dialog(`<h2>Origine du ponton 07</h2><p>Ajout manuel du guide français. Les dimensions de 40 × 2 m et les catways sont pédagogiques ; ils ne décrivent pas un aménagement réel vérifié.</p><div class="dialog-actions"><button type="button" class="control primary" data-action="close-dialog">Fermer</button></div>`);
    if(action==='cleats')notice('Simulation : 3 taquets par bord, soit 6 sur ce ponton.');
    if(action==='duplicate')notice('La duplication créerait un nouvel objet, sélectionné pour son placement.');
    if(action==='delete')notice('La suppression serait réversible par Annuler. Aucun objet réel n’est modifié ici.');
    if(action==='undo'||action==='redo')notice('L’historique du générateur serait conservé. Cette maquette ne modifie aucun document réel.');
    if(action==='choose-land'||action==='choose-wall'){$('#prototypeDialog').close();notice('Dessiner : cliquez pour ajouter un sommet · Terminer ou Annuler restent visibles.');}
    if(action==='object-filter'){el.parentElement.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===el));notice('Le filtre de type limiterait les objets sélectionnables sur la carte et dans la liste.');}
  });
  document.addEventListener('change',e=>{
    const el=e.target;
    if(el.id==='screenPicker'){go(el.value);return;}
    if(el.dataset.candidate!==undefined){candidates[Number(el.dataset.candidate)].included=el.checked;render();return;}
    if(el.dataset.category!==undefined){candidates[Number(el.dataset.category)].type=el.value;notice('Catégorie modifiée. Le choix d’inclusion est conservé.');return;}
    if(el.dataset.layer==='objects'){state.drawingVisible=el.checked;const image=$('#mapStage .port-drawing');if(image)image.style.visibility=el.checked?'visible':'hidden';}
    else if(el.dataset.layer)notice('Contrôle de couche illustratif · aucun fond distant n’est chargé.');
  });
  document.addEventListener('input',e=>{
    if(e.target.id==='series-count'){state.seriesCount=Math.min(12,Math.max(1,Number(e.target.value)||1));updateSeries();}
    if(e.target.id==='occupancy'){state.occupancy=Number(e.target.value);$('#occupancyOutput').textContent=`${state.occupancy} %`;}
  });
  document.addEventListener('keydown',e=>{
    if(e.target.matches('.field input')&&e.key==='Enter'){e.preventDefault();e.target.dataset.original=e.target.value;e.target.blur();notice('Saisie appliquée dans la maquette · aucune géométrie réelle modifiée.');}
    if(e.target.matches('.field input')&&e.key==='Escape'){e.target.value=e.target.dataset.original||e.target.defaultValue;e.target.blur();}
  });
  $('#previousScreen').addEventListener('click',()=>go(screens[(screens.indexOf(state.screen)+screens.length-1)%screens.length]));
  $('#nextScreen').addEventListener('click',()=>go(screens[(screens.indexOf(state.screen)+1)%screens.length]));
  $('#prototypeDialog').addEventListener('click',e=>{if(e.target===$('#prototypeDialog'))$('#prototypeDialog').close();});
  addEventListener('resize',updateScale);
  addEventListener('resize',positionSelection);
  render();
})();
