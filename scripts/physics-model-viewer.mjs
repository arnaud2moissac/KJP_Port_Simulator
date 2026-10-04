import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

async function startViewer() {
const viewport=document.getElementById('viewport');
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor('#eef3f7');viewport.prepend(renderer.domElement);
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,1,.01,200);
scene.add(new THREE.HemisphereLight(0xffffff,0x667788,2.6));const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(-3,8,7);scene.add(sun);
const orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=true;orbit.dampingFactor=.12;
const loader=new GLTFLoader(),models={},raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
let model=null,kind='fardage',highlight=null,dragStart=null;
let heightPanel=null,heightTrial=null;
const heightProfile=window.KJP_WIND_HEIGHT_PROFILE;
const heightInput=document.getElementById('wind-height');
const defaults='Cliquez sur une surface colorée. Les points noirs sont les centres. Les flèches donnent une direction, pas une intensité.';
const rgba={freeboard:'#da772e',coachroof:'#8255b7',boom:'#208c70',rig:'#b24783',transom:'#c69b25',hull:'#278eaa',keel:'#6958ae',rudder:'#19886b',propeller:'#cf782b'};
const legends={fardage:[['freeboard','28 panneaux de flanc'],['coachroof','4 panneaux de rouf'],['boom','2 panneaux de bôme'],['rig','1 mât / gréement isotrope'],['transom','1 tableau arrière']],
  'parties-immergees':[['hull','11 aires de cross-flow'],['keel','1 quille'],['rudder','5 bandes de safran'],['propeller','1 disque d’hélice + jet']]};
const fmt=(x,n=3)=>Number(x).toLocaleString('fr-FR',{minimumFractionDigits:n,maximumFractionDigits:n});
// Read-only explanation of addWindForces' height law; never fed to the simulator.
function windHeightFactor(z){
  if(heightProfile.type!=='bounded-power-law')return 1;
  return THREE.MathUtils.clamp(Math.pow(Math.max(.5,z)/heightProfile.referenceHeight,heightProfile.exponent),
    heightProfile.minimumVelocityFactor,heightProfile.maximumVelocityFactor);
}
function updateHeightExplanation(){
  if(!heightPanel)return;
  const z=heightTrial??heightPanel.center.z,factor=windHeightFactor(z),forceRatio=factor*factor;
  const actualZ=heightPanel.center.z,reference=heightProfile.referenceHeight;
  const categories={freeboard:'panneau de flanc',coachroof:'rouf',boom:'bôme',rig:'mât / gréement',transom:'tableau arrière'};
  document.getElementById('wind-selected-panel').textContent=`${heightPanel.code} — ${categories[heightPanel.category]} · z du profil : ${fmt(actualZ,3)} m`;
  document.getElementById('wind-reference').textContent=`Exemple : vent réel de 10 nd à ${fmt(reference,0)} m, bateau immobile.`;
  document.getElementById('wind-height-value').textContent=`${fmt(z,3)} m`;
  document.getElementById('wind-local-speed').textContent=`${fmt(10*factor,2)} nd`;
  document.getElementById('wind-speed-ratio').textContent=`${fmt(100*factor,1)} % du vent de référence`;
  document.getElementById('wind-force-ratio').textContent=`${fmt(100*forceRatio,1)} %`;
  document.getElementById('wind-force-fill').style.width=`${100*forceRatio/1.2}%`;
  const isActual=heightTrial===null||Math.abs(z-actualZ)<1e-10;
  document.getElementById('wind-height-mode').textContent=isActual?'Hauteur du panneau sélectionné.':
    `Essai pédagogique uniquement : ${heightPanel.code} reste à z = ${fmt(actualZ,3)} m dans le modèle.`;
  document.getElementById('wind-height-reset').disabled=isActual;
  document.querySelectorAll('[data-reference-height]').forEach(n=>{n.textContent=fmt(reference,0);});
  document.getElementById('wind-height-formula').textContent=heightProfile.type==='bounded-power-law'?
    `V(z) = V(réf.) × k ; k = borne[(max(0,5 m ; z) / ${fmt(reference,0)} m)^${fmt(heightProfile.exponent,2)} ; ${fmt(heightProfile.minimumVelocityFactor,2)} ; ${fmt(heightProfile.maximumVelocityFactor,2)}].`:'V(z) = V(réf.) : profil uniforme.';
  const x=v=>42+v/12*248,y=h=>153-h/20*128;
  let graph='<title>La hauteur modifie le vent reçu et donc la force horizontale</title>';
  graph+='<desc>Courbe du vent réel en fonction de la hauteur. Le point noir est la hauteur du panneau ; le point orange est l’essai. Le trait pointillé indique la référence.</desc>';
  for(const h of [0,5,10,15,20])graph+=`<line x1="42" x2="290" y1="${y(h)}" y2="${y(h)}" stroke="#dbe4eb"/><text x="34" y="${y(h)+4}" text-anchor="end" fill="#526a7f" font-size="11">${h}</text>`;
  for(const v of [0,5,10])graph+=`<text x="${x(v)}" y="169" text-anchor="middle" fill="#526a7f" font-size="11">${v}</text>`;
  graph+='<text x="8" y="13" fill="#193148" font-size="11">z (m)</text><text x="288" y="185" text-anchor="end" fill="#193148" font-size="11">Vent réel local (nd)</text>';
  graph+=`<line x1="42" x2="42" y1="25" y2="153" stroke="#8298a9"/><line x1="42" x2="290" y1="153" y2="153" stroke="#8298a9"/><line x1="42" x2="290" y1="${y(reference)}" y2="${y(reference)}" stroke="#8298a9" stroke-dasharray="4 3"/>`;
  const points=Array.from({length:81},(_,i)=>{const h=i/4;return `${x(10*windHeightFactor(h))},${y(h)}`;}).join(' ');
  graph+=`<polyline points="${points}" fill="none" stroke="#277eaf" stroke-width="2.3"/><circle cx="${x(10)}" cy="${y(reference)}" r="3.5" fill="#fff" stroke="#8298a9"/>`;
  graph+=`<circle cx="${x(10*windHeightFactor(actualZ))}" cy="${y(actualZ)}" r="4.5" fill="#193148"/><line x1="42" x2="${x(10*factor)}" y1="${y(z)}" y2="${y(z)}" stroke="#da772e" stroke-dasharray="3 3"/><circle cx="${x(10*factor)}" cy="${y(z)}" r="5.5" fill="#fff" stroke="#da772e" stroke-width="2.3"/>`;
  graph+='<text x="48" y="40" fill="#193148" font-size="10">● Panneau</text><text x="48" y="54" fill="#a7541c" font-size="10">○ Essai de hauteur</text>';
  document.getElementById('wind-height-chart').innerHTML=graph;
}
function fitCamera(){
  if(!model)return;
  model.updateWorldMatrix(true,true);camera.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(model),inverse=camera.quaternion.clone().invert();
  const tanV=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),tanH=tanV*camera.aspect;
  let distance=1;
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
    const p=new THREE.Vector3(x,y,z).sub(orbit.target).applyQuaternion(inverse);
    distance=Math.max(distance,p.z+1.10*Math.max(Math.abs(p.x)/tanH,Math.abs(p.y)/tanV));
  }
  const direction=camera.position.clone().sub(orbit.target).normalize();
  camera.position.copy(orbit.target).addScaledVector(direction,distance);orbit.update();
}
function setView(view){
  const target=kind==='fardage'?new THREE.Vector3(0,2.5,0):new THREE.Vector3(0,-.75,0);orbit.target.copy(target);camera.up.set(0,1,0);
  const poses={iso:[-15,10,16],side:[-21,2.5,0],top:[0,24,.001],front:[0,2.5,23]};
  const p=new THREE.Vector3(...poses[view]);if(kind!=='fardage'&&view!=='top')p.y-=3;
  camera.position.copy(target).add(p);if(view==='top')camera.up.set(0,0,1);camera.lookAt(target);orbit.update();fitCamera();
}
function syncVisibility(){if(!model)return;model.traverse(n=>{
  const r=n.userData.role;
  if(r==='context')n.visible=document.getElementById('context').checked;
  if(r==='normals'||r==='jet')n.visible=document.getElementById('normals').checked;
  if(r==='annotations')n.visible=document.getElementById('annotations').checked;
  if(r==='waterline'||r==='axes')n.visible=document.getElementById('waterline').checked;
});}
function clearHighlight(){if(highlight){scene.remove(highlight);highlight.traverse(n=>{n.geometry?.dispose();n.material?.dispose();});highlight=null;}}
function select(element){
  clearHighlight();if(!element)return;highlight=new THREE.Group();
  element.updateWorldMatrix(true,true);element.traverse(n=>{if(n.isMesh){const edges=new THREE.LineSegments(new THREE.EdgesGeometry(n.geometry),new THREE.LineBasicMaterial({color:0x122f4f,depthTest:false}));edges.applyMatrix4(n.matrixWorld);edges.renderOrder=10;highlight.add(edges);}});scene.add(highlight);
  const d=element.userData;let rows='';const row=(k,v)=>{rows+=`<dt>${k}</dt><dd>${v}</dd>`;};
  if(d.quantity==='aerodynamic-panel'){
    heightPanel=d;heightTrial=null;heightInput.value=d.center.z;updateHeightExplanation();
    row('Aire',`${fmt(d.area)} m²`);row('Centre C (x ; y ; z)',`${fmt(d.center.x)} ; ${fmt(d.center.y)} ; ${fmt(d.center.z)} m`);
    row('Orientation',d.omnidirectional?'Omnidirectionnelle ; la normale stockée est ignorée':`n = (${fmt(d.normalUnit.x)} ; ${fmt(d.normalUnit.y)})`);
    if(!d.omnidirectional)row('Angle de normale',`${fmt(d.angleDegrees,1)}° de +x vers +y`);
    row('Coefficient normal / tangent',`${fmt(d.cdNormal,3)} / ${fmt(d.cdTangential,3)}`);row('Exposition',fmt(d.exposure,2));
  }else if(d.quantity==='cross-flow-effective-area'){
    row('Position x',`${fmt(d.x,6)} m`);row('Aire résistante',`${fmt(d.area,6)} m²`);row('Longueur Δx',`${fmt(d.dx,6)} m`);
    row('Facteur de forme',fmt(d.shape,2));row('Vitesse locale','v relatif + r × x');row('Axe représenté','±y ; la force s’oppose au mouvement local');row('Application 3-DOF',`(x ; y) = (${fmt(d.x)} ; 0)`);
  }else if(d.quantity==='rudder-strip'){
    row('Aire de bande',`${fmt(d.area)} m²`);row('Centre de bande',`${fmt(d.center[0])} ; ${fmt(d.center[1])} ; ${fmt(d.z)} m`);
    row('Corde moyenne',`${fmt(d.meanChord)} m`);row('Position de mèche',`${fmt(100*d.stockChordFraction,1)} % depuis le bord d’attaque ; x = ${fmt(d.stockPosition.x)} m`);
    row('Axes représentés','Corde +x et normale ±y à 0° de barre');row('Écoulement','Translation + lacet + jet axial / tourbillon de l’hélice, intégré sur corde × hauteur');
  }else if(d.quantity==='propeller-disk'){
    row('Centre',`${fmt(d.position.x)} ; ${fmt(d.position.y)} ; ${fmt(d.position.z)} m`);row('Diamètre',`${fmt(d.propeller.diameter)} m`);row('Directions','Poussée +x ; jet d’eau -x vers le safran');row('Loi','Hélice quatre quadrants');
  }else{
    row('Aire',`${fmt(d.area)} m²`);row('Envergure',`${fmt(d.span)} m`);row('Centre',`${fmt(d.position.x)} ; ${fmt(d.position.y)} ; ${fmt(d.position.z)} m`);row('Axes représentés','Corde +x et normale bidirectionnelle ±y');row('Loi','Profil portant : portance, traînée, décrochage progressif');
  }
  const note=d.geometryKind==='exact-ruled-freeboard-surface'||d.geometryKind==='exact-transom-rectangle'?'Contour, aire, centre et orientation exacts.':
    d.quantity==='aerodynamic-panel'&&d.omnidirectional?'Le symbole sphérique situe le centre ; son rayon ne représente pas l’aire aérodynamique.':'Contour équivalent de présentation ; positions et quantités de calcul exactes.';
  document.getElementById('detail').innerHTML=`<h3>${d.displayName??element.name}</h3><dl>${rows}</dl><small>${note}</small>`;
}
function changeModel(){clearHighlight();if(model)scene.remove(model);kind=document.getElementById('model').value;model=models[kind];scene.add(model);
  let rudderStockPercent=null;model.traverse(n=>{if(n.userData.quantity==='rudder-strip')rudderStockPercent=100*n.userData.stockChordFraction;});
  heightPanel=null;heightTrial=null;document.getElementById('wind-height-card').hidden=kind!=='fardage';
  document.getElementById('legend').innerHTML=legends[kind].map(([k,label])=>`<span style="--swatch:${rgba[k]}">${label}</span>`).join('');
  document.getElementById('detail').textContent=defaults;
  document.getElementById('geometry-note').textContent=kind==='fardage'?'Flancs et tableau : contours exacts. Rouf / bôme : rectangles équivalents. Mât / gréement : centre isotrope.':
    `Flèches doubles : axes latéraux ±y, pas des forces imposées. Trait rouge : mèche fixe du safran à ${fmt(rudderStockPercent,0)} % de corde. Orange : poussée +x et jet d’eau -x.`;
  document.getElementById('glb-link').href=kind+'.glb';document.getElementById('drawing-link').href=kind+'.svg';syncVisibility();setView('iso');
  if(kind==='fardage'){let rig;model.traverse(n=>{if(n.userData.code==='P35'&&n.userData.selectable)rig=n;});select(rig);}
}
renderer.domElement.addEventListener('pointerdown',event=>{dragStart=[event.clientX,event.clientY];});
renderer.domElement.addEventListener('pointerup',event=>{
  if(!dragStart||Math.hypot(event.clientX-dragStart[0],event.clientY-dragStart[1])>6)return;
  const box=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-box.left)/box.width*2-1,-(event.clientY-box.top)/box.height*2+1);
  raycaster.setFromCamera(pointer,camera);for(const hit of raycaster.intersectObject(model,true)){
    let n=hit.object;while(n&&!n.userData.selectable)n=n.parent;if(n){select(n);break;}
  }
});
document.getElementById('model').addEventListener('change',changeModel);
heightInput.addEventListener('input',()=>{heightTrial=Number(heightInput.value);updateHeightExplanation();});
document.getElementById('wind-height-reset').addEventListener('click',()=>{if(heightPanel){heightTrial=null;heightInput.value=heightPanel.center.z;updateHeightExplanation();}});
for(const id of ['context','normals','annotations','waterline'])document.getElementById(id).addEventListener('change',syncVisibility);
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
const resize=new ResizeObserver(()=>{const box=viewport.getBoundingClientRect();camera.aspect=box.width/box.height;camera.updateProjectionMatrix();renderer.setSize(box.width,box.height,false);fitCamera();});resize.observe(viewport);
for(const [key,value] of Object.entries(window.KJP_PHYSICAL_MODELS)){
  const b=Uint8Array.from(atob(value),c=>c.charCodeAt(0));models[key]=(await loader.parseAsync(b.buffer,'')).scene;
}
changeModel();document.getElementById('loading').hidden=true;
renderer.setAnimationLoop(()=>{orbit.update();if(model)model.traverse(n=>{if(n.userData.billboard)n.quaternion.copy(camera.quaternion);});renderer.render(scene,camera);});
window.__KJP_MODEL_VIEWER__={models,get model(){return model;},camera,renderer,select,changeModel,setView};
}
startViewer().catch(error => {
  document.getElementById('loading').textContent='Impossible de charger le modèle : '+error.message;
  console.error(error);
});
