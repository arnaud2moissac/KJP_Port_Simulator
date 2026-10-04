import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { Script } from 'node:vm';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { build } from 'esbuild';

// Documents derived from the versioned profile. Nothing is fed back into physics.
const require = createRequire(import.meta.url);
const Physics = require('../src/simulateur-port/physics-core.js');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'output/modeles-physiques');
const pdfOutput = path.join(root, 'output/pdf');
const profile = Physics.DEFAULT_PROFILE;
if(process.argv.includes('--viewer-only')){
  const exported=Object.fromEntries(await Promise.all(['fardage','parties-immergees'].map(async name=>
    [name,await fs.readFile(path.join(output,`${name}.glb`))])));
  await writeStandaloneViewer(exported);
  console.log('Lecteur autonome reconstruit ; GLB, dessins, PDF et moteur inchangés.');
  process.exit(0);
}
const scratch = await fs.mkdtemp('/tmp/kjp-physics-illustrations-');
const raw = Physics.RAW_PROFILES[profile.id];
const W = 1680, H = 1188;
const C = {
  ink: '#192f45', muted: '#596c7d', line: '#cfdae2', ghost: '#aebcc8', water: '#338ec0',
  freeboard: '#da772e', coachroof: '#8255b7', boom: '#208c70', rig: '#b24783', transom: '#c69b25',
  hull: '#278eaa', hull2: '#73b7c9', keel: '#6958ae', rudder: '#19886b', propeller: '#cf782b',
  force: '#c34845', ground: '#f5f8fa'
};
const vec = p => Array.isArray(p) ? p : [p.x, p.y, p.z ?? 0];
const add = (a,b) => a.map((v,i) => v+b[i]);
const mul = (a,k) => a.map(v => v*k);
const sub = (a,b) => a.map((v,i) => v-b[i]);
const norm = a => Math.hypot(...a);
const unit = a => mul(a,1/norm(a));
const gltfPoint = ([x,y,z]) => [-y,z,x];
const format = (x,n=2) => Number(x).toFixed(n).replace('.',',');
const e = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');

// Three's exporter uses browser FileReader for its binary Blob.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result=result; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(result => { this.result=`data:${blob.type};base64,${Buffer.from(result).toString('base64')}`; this.onloadend?.(); }); }
};

function panelCategory(id) {
  if (id.startsWith('freeboard')) return 'freeboard';
  if (id.startsWith('coachroof')) return 'coachroof';
  if (id.startsWith('boom')) return 'boom';
  return id === 'mast-rigging' ? 'rig' : 'transom';
}
function polygonArea(points) {
  let area=0;
  for(let i=1;i<points.length-1;i++) area+=new THREE.Vector3(...sub(points[i],points[0]))
    .cross(new THREE.Vector3(...sub(points[i+1],points[0]))).length()/2;
  return area;
}
function rectangle(center,width,height,normal=[0,1,0]) {
  // Chord/tangent points forward; positive y is starboard in the boat frame.
  const t=unit([normal[1],-normal[0],0]);
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v]) =>
    add(add(center,mul(t,u*width/2)),[0,0,v*height/2]));
}
const panels=profile.aerodynamics.panels.map((p,index) => {
  const category=panelCategory(p.id), center=vec(p.center), normal=unit([p.normalBody.x,p.normalBody.y,0]);
  let polygon=null, geometryKind='equivalent-area-rectangle';
  if(category==='freeboard') {
    const i=Number(p.id.split('-')[1]), sign=p.id.endsWith('starboard')?1:-1;
    const a=profile.geometry.gunwale[i],b=profile.geometry.gunwale[i+1];
    polygon=[[a.x,sign*a.halfBeam,0],[b.x,sign*b.halfBeam,0],
      [b.x,sign*b.halfBeam,b.z],[a.x,sign*a.halfBeam,a.z]];
    geometryKind='exact-ruled-freeboard-surface';
  } else if(category==='transom') {
    const g=profile.geometry.gunwale[0];
    polygon=[[g.x,-g.halfBeam,0],[g.x,g.halfBeam,0],[g.x,g.halfBeam,g.z],[g.x,-g.halfBeam,g.z]];
    geometryKind='exact-transom-rectangle';
  } else if(category!=='rig') {
    const height=category==='boom'?.25:category==='coachroof'?(p.id.includes('aft')?1:.85):1;
    polygon=rectangle(center,p.area/height,height,normal);
  } else geometryKind='omnidirectional-center-symbol-not-surface';
  if(polygon) assert.ok(Math.abs(polygonArea(polygon)-p.area)<1e-10,`${p.id}: area`);
  return { ...p, code:`P${String(index+1).padStart(2,'0')}`,category,center: p.center,
    normalUnit:{x:normal[0],y:normal[1],z:0}, normal,polygon,geometryKind,
    angleDegrees:p.omnidirectional?null:Math.atan2(normal[1],normal[0])*180/Math.PI };
});
const sections=profile.geometry.hullSections.map((s,i) => {
  const area=profile.dimensions.canoeDraft*profile.resistance.crossFlowAreaFactor*s.dx*s.shape;
  const depth=area/s.dx;
  return {...s,code:`S${String(i+1).padStart(2,'0')}`,area,effectiveDepth:depth,
    center:[s.x,0,0],polygon:rectangle([s.x,0,-depth/2],s.dx,depth)};
});
const keel=profile.keel, rudder=profile.rudder, propeller=profile.propulsion;
const keelPolygon=rectangle([keel.x,keel.y,keel.z],keel.area/keel.span,keel.span);
const rudderBottom=rudder.z-rudder.span/2, rudderTop=rudder.z+rudder.span/2;
const stripHeight=rudder.span/rudder.slipstream.stripCount;
const strips=Array.from({length:rudder.slipstream.stripCount},(_,i) => {
  const z=rudder.z+(i+.5-rudder.slipstream.stripCount/2)*stripHeight;
  return {index:i,code:`R${i+1}`,area:rudder.area/rudder.slipstream.stripCount,z,
    center:[rudder.x,rudder.y,z],polygon:rectangle([rudder.x,rudder.y,z],rudder.area/rudder.span,stripHeight)};
});
assert.equal(panels.length,36); assert.equal(sections.length,11); assert.equal(strips.length,5);
assert.ok(Math.abs(polygonArea(keelPolygon)-keel.area)<1e-10);
const counts={};for(const p of panels){counts[p.category]??={count:0,area:0};counts[p.category].count++;counts[p.category].area+=p.area;}
const totalArea=panels.reduce((sum,p)=>sum+p.area,0), crossFlowArea=sections.reduce((sum,p)=>sum+p.area,0);

const sourceBytes=await fs.readFile(path.join(root,'kjp_sun_odyssey_36i.glb'));
const sourceGLTF=await new GLTFLoader().parseAsync(sourceBytes.buffer.slice(sourceBytes.byteOffset,sourceBytes.byteOffset+sourceBytes.byteLength),'');
const sourceMesh=sourceGLTF.scene.children[0];
// Same contiguous groups as the product's native-player-model.mjs; only context.
const spans=[['upper_sheer',58],['sheer_stripe',58],['hull_sides',118],['hull_underwater',148],['transom',6],
  ['waterline_stripe',60],['hull_portlights',24],['deck',40],['deck_edge',58],['cockpit',414],
  ['coachroof',56],['coachroof_windows',10],['deck_fittings',78],['wheel',248],['mast_and_rigging',204],
  ['railings',264],['keel_fin',12],['keel_bulb',76],['rudder',16]];
assert.equal(spans.reduce((s,p)=>s+p[1]*3,0),sourceMesh.geometry.index.count);
const sourceTriangles=[];
let offset=0;
for(const [part,count] of spans){
  for(let t=0;t<count;t++){
    const triangle=[];
    for(let j=0;j<3;j++){
      const k=sourceMesh.geometry.index.getX(offset+t*3+j),a=sourceMesh.geometry.attributes.position;
      triangle.push([a.getZ(k),-a.getX(k),a.getY(k)]);
    }
    sourceTriangles.push({part,triangle});
  }
  offset+=count*3;
}
function clipPoly(poly,axis,bound,greater){
  const out=[];const inside=p=>greater?p[axis]>=bound:p[axis]<=bound;
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],ia=inside(a),ib=inside(b);
    if(ia)out.push(a);
    if(ia!==ib){const t=(bound-a[axis])/(b[axis]-a[axis]);out.push(a.map((v,j)=>v+t*(b[j]-v)));}
  }
  return out;
}
function contextPolys(kind){
  const included=kind==='wind'?new Set(['upper_sheer','hull_sides','transom','deck','deck_edge','coachroof','mast_and_rigging']):
    new Set(['hull_underwater','waterline_stripe','keel_fin','keel_bulb','rudder']);
  return sourceTriangles.filter(t=>included.has(t.part)).map(t=>
    clipPoly(clipPoly(t.triangle,2,kind==='wind'?0:-2,true),2,kind==='wind'?5.6:0.06,false)).filter(p=>p.length>=3);
}

// Small technical block font for portable, baked-in GLB identifiers.
// The PDFs/SVGs use a full Unicode typeface; 3D labels are ASCII and self contained.
const glyphRows={
  A:['01110','10001','10001','11111','10001','10001','10001'],B:['11110','10001','10001','11110','10001','10001','11110'],
  C:['01111','10000','10000','10000','10000','10000','01111'],D:['11110','10001','10001','10001','10001','10001','11110'],
  E:['11111','10000','10000','11110','10000','10000','11111'],F:['11111','10000','10000','11110','10000','10000','10000'],
  G:['01111','10000','10000','10111','10001','10001','01110'],H:['10001','10001','10001','11111','10001','10001','10001'],
  I:['11111','00100','00100','00100','00100','00100','11111'],J:['00111','00010','00010','00010','10010','10010','01100'],
  K:['10001','10010','10100','11000','10100','10010','10001'],L:['10000','10000','10000','10000','10000','10000','11111'],
  M:['10001','11011','10101','10101','10001','10001','10001'],N:['10001','11001','10101','10011','10001','10001','10001'],
  O:['01110','10001','10001','10001','10001','10001','01110'],P:['11110','10001','10001','11110','10000','10000','10000'],
  Q:['01110','10001','10001','10001','10101','10010','01101'],R:['11110','10001','10001','11110','10100','10010','10001'],
  S:['01111','10000','10000','01110','00001','00001','11110'],T:['11111','00100','00100','00100','00100','00100','00100'],
  U:['10001','10001','10001','10001','10001','10001','01110'],V:['10001','10001','10001','10001','10001','01010','00100'],
  W:['10001','10001','10001','10101','10101','10101','01010'],X:['10001','10001','01010','00100','01010','10001','10001'],
  Y:['10001','10001','01010','00100','00100','00100','00100'],Z:['11111','00001','00010','00100','01000','10000','11111'],
  '0':['01110','10001','10011','10101','11001','10001','01110'],'1':['00100','01100','00100','00100','00100','00100','01110'],
  '2':['01110','10001','00001','00010','00100','01000','11111'],'3':['11110','00001','00001','01110','00001','00001','11110'],
  '4':['00010','00110','01010','10010','11111','00010','00010'],'5':['11111','10000','10000','11110','00001','00001','11110'],
  '6':['01110','10000','10000','11110','10001','10001','01110'],'7':['11111','00001','00010','00100','01000','01000','01000'],
  '8':['01110','10001','10001','01110','10001','10001','01110'],'9':['01110','10001','10001','01111','00001','00001','01110'],
  '+':['00000','00100','00100','11111','00100','00100','00000'],'=':['00000','00000','11111','00000','11111','00000','00000'],
  '.':['00000','00000','00000','00000','00000','00100','00100'],' ':Array(7).fill('00000'),
  '?':['01110','10001','00001','00010','00100','00000','00100']
};
const fontGlyphs={};
for(const [char,rows] of Object.entries(glyphRows)){
  const commands=[];
  rows.forEach((row,y)=>[...row].forEach((v,x)=>{if(v==='1'){
    const xx=x*100,yy=(6-y)*100;
    commands.push(`m ${xx} ${yy} l ${xx} ${yy+92} l ${xx+92} ${yy+92} l ${xx+92} ${yy} l ${xx} ${yy}`);
  }}));fontGlyphs[char]={ha:600,o:commands.join(' ')};
  if(/[A-Z]/.test(char))fontGlyphs[char.toLowerCase()]=fontGlyphs[char];
}
const font=new FontLoader().parse({glyphs:fontGlyphs,familyName:'KJP Technical Blocks',resolution:700,boundingBox:{yMin:0,yMax:700},underlineThickness:40});
function material(color,alpha=1){return new THREE.MeshStandardMaterial({color,roughness:1,metalness:0,side:THREE.DoubleSide,transparent:alpha<1,opacity:alpha,depthWrite:alpha===1});}
function meshPolys(polys,color,alpha=1){
  const vertices=[];
  for(const p of polys)for(let i=1;i<p.length-1;i++)for(const v of [p[0],p[i],p[i+1]])vertices.push(...gltfPoint(v));
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();
  return new THREE.Mesh(g,material(color,alpha));
}
function linePath(points,color,radius=.008){
  const group=new THREE.Group();
  for(let i=1;i<points.length;i++){
    const a=new THREE.Vector3(...gltfPoint(points[i-1])),b=new THREE.Vector3(...gltfPoint(points[i]));
    const d=b.clone().sub(a);if(d.length()<1e-8)continue;
    const cylinder=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,d.length(),6),material(color));
    cylinder.position.copy(a.add(b).multiplyScalar(.5));cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());group.add(cylinder);
  }
  return group;
}
function arrow3(a,b,color,radius=.016){
  const group=linePath([a,b],color,radius);const v=new THREE.Vector3(...gltfPoint(sub(b,a)));
  const h=Math.min(.14,norm(sub(b,a))*.25),cone=new THREE.Mesh(new THREE.ConeGeometry(radius*3.4,h,10),material(color));
  cone.position.fromArray(gltfPoint(b)).addScaledVector(v.clone().normalize(),-h/2);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());group.add(cone);return group;
}
function bidirectionalAxis3(center,delta,color,radius=.016){
  const group=new THREE.Group();
  group.add(arrow3(center,add(center,delta),color,radius));
  group.add(arrow3(center,sub(center,delta),color,radius));
  return group;
}
function point3(p,color,size=.035){const m=new THREE.Mesh(new THREE.SphereGeometry(size,10,8),material(color));m.position.fromArray(gltfPoint(p));return m;}
function label3(text,p,color=C.ink,size=.15){
  const g=new TextGeometry(text,{font,size,depth:.004,curveSegments:2,bevelEnabled:false});g.computeBoundingBox();
  g.translate(-(g.boundingBox.max.x-g.boundingBox.min.x)/2,0,0);
  const m=new THREE.Mesh(g,material(color));m.position.fromArray(gltfPoint(p));m.userData={role:'annotation',billboard:true};return m;
}
function metadataGroup(name,role){const g=new THREE.Group();g.name=name;g.userData={role};return g;}
function sceneBase(kind){
  const scene=new THREE.Scene();scene.name=kind==='wind'?'Fardage - modele de calcul KJP':'Eau - parties immergees du modele KJP';
  scene.userData={artifactRole:'technical-explanation-only',units:'meters',physicsVersion:Physics.VERSION,
    profileId:profile.id,profileVersion:profile.version,boatFrame:'x forward; y starboard; z up; origin is physics x=0,y=0,z=0',
    gltfFrame:'X=-boat.y (port); Y=boat.z (up); Z=boat.x (bow)',
    contourPolicy:'exact freeboard/transom; equivalent appendix/superstructure contours; wire hull is visual reference only',
    sourceFiles:['src/simulateur-port/vessel-profiles.js','src/simulateur-port/physics-core.js','kjp_sun_odyssey_36i.glb']};
  const context=metadataGroup('Silhouette visuelle - non physique','context');
  const m=meshPolys(contextPolys(kind),C.ghost,.12);m.name='GLB visuel existant - contexte uniquement';m.userData={noPhysicsData:true};context.add(m);
  scene.add(context);
  const water=metadataGroup('Flottaison z=0','waterline');
  water.add(linePath([[-5.6,-2.2,0],[5.7,-2.2,0],[5.7,2.2,0],[-5.6,2.2,0],[-5.6,-2.2,0]],C.water));
  scene.add(water);
  const axes=metadataGroup('Repere bateau en metres','axes');
  for(const [label,end,color] of [['+x AVANT',[2.1,0,0],C.force],['+y TRIBORD',[0,1.65,0],C.hull],['+z HAUT',[0,0,1.6],C.boom]]){
    const origin=[6.1,-2.2,kind==='wind'?0:-1.8];axes.add(arrow3(origin,add(origin,end),color));axes.add(label3(label,add(add(origin,end),[0,0,.16]),color,.16));
  }
  scene.add(axes);return scene;
}
function buildWindScene(){
  const scene=sceneBase('wind'),normals=metadataGroup('Normales - fleches de direction, pas de force','normals'),
    annotations=metadataGroup('Codes des panneaux','annotations'), centers=metadataGroup('Centres application','centers');
  for(const category of Object.keys(counts)){
    const group=metadataGroup(`Panneaux ${category}`,category);
    for(const p of panels.filter(p=>p.category===category)){
      const c=vec(p.center);const g=metadataGroup(`${p.code} - ${p.id}`,'physical-element');
      g.userData={...p,normal:p.normal,role:'physical-element',selectable:true,quantity:'aerodynamic-panel'};
      if(p.polygon){g.add(meshPolys([p.polygon],C[category],.63));g.add(linePath([...p.polygon,p.polygon[0]],C[category],.01));}
      else{
        // Isotropic symbol at the exact center: radius is illustrative, not area.
        const sphere=new THREE.Mesh(new THREE.SphereGeometry(.24,18,12),material(C.rig,.42));sphere.position.fromArray(gltfPoint(c));g.add(sphere);
        for(const d of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0]])normals.add(arrow3(c,add(c,mul(d,.65)),C.rig));
      }
      if(!p.omnidirectional)normals.add(arrow3(c,add(c,mul(p.normal,.6)),C[category]));
      centers.add(point3(c,C.ink));
      annotations.add(label3(p.code,add(add(c,mul(p.omnidirectional?[1,0,0]:p.normal,.73)),[0,0,.11]),C[category],.13));
      group.add(g);
    }
    scene.add(group);
  }
  scene.add(normals,centers,annotations);return scene;
}
function buildWaterScene(){
  const scene=sceneBase('water'),hull=metadataGroup('11 rubans de resistance laterale','hull'),
    centers=metadataGroup('Centres application 3 DOF','centers'),annotations=metadataGroup('Codes des organes','annotations'),
    directions=metadataGroup('Axes bidirectionnels et sens de flux - jamais des forces imposees','normals');
  for(const [i,s] of sections.entries()){
    const g=metadataGroup(`${s.code} - coque cross-flow`,'physical-element');
    g.userData={...s,role:'physical-element',selectable:true,quantity:'cross-flow-effective-area',
      applicationPoint:{x:s.x,y:0},zDisplayOnly:0,areaMeaning:'T_canoe * areaFactor * dx * shape; not wetted hull area'};
    g.add(meshPolys([s.polygon],i%2?C.hull2:C.hull,.77));g.add(linePath([...s.polygon,s.polygon[0]],C.hull));hull.add(g);
    centers.add(point3(s.center,C.ink));
    const axis=bidirectionalAxis3(s.center,[0,.36,0],C.hull,.013);
    axis.name=`${s.code} - axe lateral bidirectionnel`;
    axis.userData={directionKind:'bidirectional-lateral-axis',elementId:s.code,axes:['+y','-y'],forceDirection:'dynamic-opposes-local-cross-flow'};
    directions.add(axis);
    annotations.add(label3(s.code,[s.x,.55,.09],C.hull,.13));
  }
  const k=metadataGroup('Quille - aire equivalente','keel');k.userData={...raw.appendages[0],role:'physical-element',selectable:true,quantity:'foil',contour:'rectangle preserving area and span, not CAD'};
  k.add(meshPolys([keelPolygon],C.keel,.72));k.add(linePath([...keelPolygon,keelPolygon[0]],C.keel));
  const keelCenter=[keel.x,keel.y,keel.z];
  centers.add(point3(keelCenter,C.ink));
  const keelAxis=bidirectionalAxis3(keelCenter,[0,.52,0],C.keel);
  keelAxis.name='Quille - normale hydrodynamique bidirectionnelle';
  keelAxis.userData={directionKind:'bidirectional-lateral-axis',elementId:'fin-keel',axes:['+y','-y'],forceDirection:'dynamic-from-relative-flow'};
  directions.add(keelAxis);
  annotations.add(label3('QUILLE 3.15 m2',[-.18,-.62,-1.9],C.keel,.17));
  const r=metadataGroup('Safran - cinq bandes','rudder');
  const stockLine=linePath([[rudder.stock.x,rudder.stock.y,rudderBottom],[rudder.stock.x,rudder.stock.y,rudderTop]],C.force);
  stockLine.name='Mèche de safran - axe fixe';
  stockLine.userData={role:'rudder-stock',chordFraction:rudder.stockChordFraction,
    position:{x:rudder.stock.x,y:rudder.stock.y},axis:rudder.axis,meanChord:rudder.meanChord};
  r.add(stockLine);
  for(const [i,s] of strips.entries()){
    const g=metadataGroup(`${s.code} - bande safran`,'physical-element');
    g.userData={...s,role:'physical-element',selectable:true,quantity:'rudder-strip',rudderProfile:raw.rudders[0],
      stockPosition:{x:rudder.stock.x,y:rudder.stock.y},stockChordFraction:rudder.stockChordFraction,meanChord:rudder.meanChord,
      contour:'rectangle preserving area and span; strip center z is exact'};
    g.add(meshPolys([s.polygon],i%2?'#68b9a3':C.rudder,.82));g.add(linePath([...s.polygon,s.polygon[0]],C.rudder));r.add(g);
    centers.add(point3(s.center,C.ink,.025));
    const axis=bidirectionalAxis3(s.center,[0,.28,0],C.rudder,.012);
    axis.name=`${s.code} - normale de safran bidirectionnelle`;
    axis.userData={directionKind:'bidirectional-lateral-axis',elementId:s.code,axes:['+y','-y'],rudderAngle:'zero-in-static-view',forceDirection:'dynamic-from-flow-angle-and-slipstream'};
    directions.add(axis);
    annotations.add(label3(s.code,[rudder.x-.58,-.4,s.z],C.rudder,.12));
  }
  annotations.add(label3(`MECHE ${format(100*rudder.stockChordFraction,0)}% CORDE`,[rudder.stock.x,-.42,rudderTop+.12],C.force,.115));
  const prop=metadataGroup('Helice - disque de diametre 0.406 m','propeller');
  prop.userData={...raw.propulsors[0],role:'physical-element',selectable:true,quantity:'propeller-disk',contour:'disk, not blade shape'};
  const disc=new THREE.Mesh(new THREE.CircleGeometry(propeller.diameter/2,40),material(C.propeller,.72));
  disc.position.fromArray(gltfPoint([propeller.x,propeller.y,propeller.z]));prop.add(disc);
  const rim=Array.from({length:49},(_,i)=>[propeller.x,propeller.y+Math.cos(i*Math.PI/24)*propeller.diameter/2,propeller.z+Math.sin(i*Math.PI/24)*propeller.diameter/2]);
  const propellerCenter=[propeller.x,propeller.y,propeller.z];
  prop.add(linePath(rim,C.propeller));
  const thrustAxis=arrow3(propellerCenter,add(propellerCenter,[.62,0,0]),C.propeller);
  thrustAxis.name='Helice - axe de poussee +x';
  thrustAxis.userData={directionKind:'propeller-thrust-axis',elementId:'shaft-propeller',direction:'+x'};
  directions.add(thrustAxis);
  annotations.add(label3('AXE POUSSEE +x',add(propellerCenter,[.82,0,.08]),C.propeller,.12));
  annotations.add(label3('HELICE D=0.406 m',[propeller.x,.55,propeller.z],C.propeller,.13));
  // Jet envelope is a geometry aid, not a CFD wake or a force vector.
  const jet=metadataGroup('Enveloppe geometrique du jet vers le safran','jet');
  for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
    const delta=Math.abs(rudder.x-propeller.x),t=THREE.MathUtils.smoothstep(delta,0,4*propeller.diameter);
    const radius=propeller.diameter/2*(1-(1-rudder.slipstream.contractionRatio)*t);
    const flow=arrow3([propeller.x,Math.cos(a)*propeller.diameter/2,propeller.z+Math.sin(a)*propeller.diameter/2],
      [rudder.x,Math.cos(a)*radius,propeller.z+Math.sin(a)*radius],C.propeller,.009);
    flow.name='Jet helice - ecoulement vers -x';
    flow.userData={directionKind:'propeller-jet-flow',elementId:'shaft-propeller',direction:'-x',illustrative:true};
    jet.add(flow);
  }
  jet.userData={illustrative:true,applies:'forward thrust, jet convected downstream',notCFD:true};
  scene.add(hull,k,r,prop,jet,centers,annotations,directions);return scene;
}

class Drawing {
  constructor(title,subtitle,number){this.ops=[];this.title=title;this.number=number;this.text(36,49,title,30,C.ink,'bold');this.text(36,81,subtitle,17,C.muted);this.line([36,102],[1644,102],C.ink,1.8);}
  line(a,b,color=C.line,width=1,dash=null){this.ops.push({type:'line',points:[a,b],color,width,dash});}
  poly(points,fill=null,stroke=C.ink,width=1,alpha=1,dash=null){this.ops.push({type:'poly',points,fill,stroke,width,alpha,dash});}
  circle(x,y,r,fill=C.ink,stroke=null){this.ops.push({type:'circle',x,y,r,fill,stroke});}
  text(x,y,text,size=16,color=C.ink,weight='normal',anchor='start'){this.ops.push({type:'text',x,y,text,size,color,weight,anchor});}
  lines(x,y,texts,size=16,color=C.ink,leading=25){texts.forEach((t,i)=>this.text(x,y+i*leading,t,size,color));}
  arrow(a,b,color=C.ink,width=1.8){this.line(a,b,color,width);const t=unit(sub(b,a));const n=[-t[1],t[0]],l=8;this.poly([b,add(add(b,mul(t,-l)),mul(n,3.5)),add(add(b,mul(t,-l)),mul(n,-3.5))],color,color,.3);}
  view(x,y,w,h,title,caption=''){this.line([x,y+h],[x+w,y+h],C.line);this.text(x,y+21,title,19,C.ink,'bold');if(caption)this.text(x,y+44,caption,13,C.muted);}
  leader(point,x,y,text,color=C.ink){this.circle(...point,3,color);const elbow=[x-13,y-5];this.line(point,elbow,color,1);this.line(elbow,[x-4,y-5],color,1);this.text(x,y,text,15,color);}
  dim(a,b,offset,label){const aa=[a[0],a[1]+offset],bb=[b[0],b[1]+offset];this.line(a,[aa[0],aa[1]+6],C.muted,.7);this.line(b,[bb[0],bb[1]+6],C.muted,.7);this.line(aa,bb,C.muted,.8);for(const p of [aa,bb])this.line([p[0]-4,p[1]+4],[p[0]+4,p[1]-4],C.muted,.8);this.text((aa[0]+bb[0])/2,aa[1]-8,label,13,C.muted,'normal','middle');}
  footer(){this.line([36,1123],[1644,1123],C.line);this.lines(36,1147,[`KJP | ${profile.name} | profil ${profile.version} | moteur ${Physics.VERSION} | 04.10.2026`,
    'Origine : x=0 du moteur, axe du bateau et flottaison. Les coordonnées et aires de calcul sont reprises du profil versionné.'],13,C.muted,22);this.text(1644,1147,this.number,13,C.muted,'normal','end');}
  svg(){return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img"><title>${e(this.title)}</title><rect width="${W}" height="${H}" fill="#fff"/>${this.ops.map(o=>{
    if(o.type==='text')return `<text x="${o.x}" y="${o.y}" fill="${o.color}" font-family="DejaVu Sans,Arial,sans-serif" font-size="${o.size}" font-weight="${o.weight==='bold'?600:400}" text-anchor="${o.anchor}">${e(o.text)}</text>`;
    if(o.type==='circle')return `<circle cx="${o.x}" cy="${o.y}" r="${o.r}" fill="${o.fill??'none'}" stroke="${o.stroke??'none'}"/>`;
    const points=o.points.map(p=>p.join(',')).join(' '),dash=o.dash?` stroke-dasharray="${o.dash.join(' ')}"`:'';
    return o.type==='line'?`<polyline points="${points}" fill="none" stroke="${o.color}" stroke-width="${o.width}"${dash}/>`:
      `<polygon points="${points}" fill="${o.fill??'none'}" fill-opacity="${o.alpha}" stroke="${o.stroke??'none'}" stroke-width="${o.width}"${dash}/>`;
  }).join('')}</svg>`;}
}
function projection(kind,cx,cy,scale){return p=>{
  const [x,y,z]=p;
  if(kind==='side')return [cx+x*scale,cy-z*scale];
  if(kind==='top')return [cx+x*scale,cy+y*scale];
  if(kind==='front')return [cx+y*scale,cy-z*scale];
  return [cx+scale*(.84*x+.54*y),cy+scale*(.22*x-.35*y-.88*z)];
};}
function drawContext(d,project,kind){for(const p of contextPolys(kind))d.poly(p.map(project),C.ghost,null,0,.065);}
function drawPanels(d,project,{arrows=false,codes=false,centers=true}={}){
  for(const p of [...panels].sort((a,b)=>a.center.y-b.center.y)){
    const c=project(vec(p.center));
    if(p.polygon)d.poly(p.polygon.map(project),C[p.category],C[p.category],1.2,.24);
    else {d.circle(...c,12,C.rig);d.circle(...c,17,null,C.rig);}
    if(centers){d.circle(...c,2.4,C.ink);}
    if(arrows&&!p.omnidirectional)d.arrow(c,project(add(vec(p.center),mul(p.normal,.54))),C[p.category],1.3);
    if(codes)d.text(c[0],c[1]-7,p.code,11,C.ink,'normal','middle');
  }
}
function drawWater(d,project,{codes=false,arrows=false}={}){
  sections.forEach((s,i)=>{d.poly(s.polygon.map(project),i%2?C.hull2:C.hull,C.hull,1,.45);d.circle(...project(s.center),2.8,C.ink);
    if(codes){const p=project(s.center);d.text(p[0],p[1]-9,s.code,12,C.hull,'normal','middle');}
    if(arrows)drawBidirectionalAxis(d,project,s.center,[0,.36,0],C.hull,1.25);});
  d.poly(keelPolygon.map(project),C.keel,C.keel,1.5,.4);d.circle(...project([keel.x,0,keel.z]),3.4,C.ink);
  d.line(project([rudder.stock.x,rudder.stock.y,rudderBottom]),project([rudder.stock.x,rudder.stock.y,rudderTop]),C.force,2.6);
  strips.forEach((s,i)=>{d.poly(s.polygon.map(project),i%2?'#77baa6':C.rudder,C.rudder,1,.55);d.circle(...project(s.center),2,C.ink);});
  const ring=Array.from({length:41},(_,i)=>[propeller.x,Math.cos(i*Math.PI/20)*propeller.diameter/2,propeller.z+Math.sin(i*Math.PI/20)*propeller.diameter/2]);
  d.poly(ring.map(project),C.propeller,C.propeller,1.6,.4);d.circle(...project([propeller.x,0,propeller.z]),3,C.propeller);
  if(arrows){
    drawBidirectionalAxis(d,project,[keel.x,keel.y,keel.z],[0,.52,0],C.keel,1.5);
    strips.forEach(s=>drawBidirectionalAxis(d,project,s.center,[0,.28,0],C.rudder,1.15));
    d.arrow(project([propeller.x,propeller.y,propeller.z]),project([propeller.x+.62,propeller.y,propeller.z]),C.propeller,1.6);
  }
}
function drawBidirectionalAxis(d,project,center,delta,color,width){
  const c=project(center);
  d.arrow(c,project(add(center,delta)),color,width);
  d.arrow(c,project(sub(center,delta)),color,width);
}
function windSheet(){
  const d=new Drawing('FARDAGE | Où le vent agit sur le bateau','36 éléments de calcul : aire A, centre C, normale n et coefficients. Les points noirs repèrent les centres.', '01 / 02');
  d.view(36,122,752,370,'A. Élévation longitudinale (x,z)','Coupe de lecture au plan médian : les deux bords se superposent. Mât visuel tronqué à z=5,60 m.');
  const side=projection('side',415,445,42);drawContext(d,side,'wind');drawPanels(d,side);
  d.line(side([-5.7,0,0]),side([5.6,0,0]),C.water,1.6,[7,4]);d.text(43,451,'z=0',13,C.water);
  d.dim(side([-4.8,0,0]),side([5.297,0,0]),37,'Contour de fardage : 10,097 m');
  d.leader(side([.35,0,5.1]),477,226,'P35 | mât + gréement | C : z=5,10 m',C.rig);
  d.leader(side([-.2,.18,3.05]),470,300,'P33/34 | bôme | C : z=3,05 m',C.boom);
  d.leader(side([1.2,.7,1.88]),525,363,'P31/32 | rouf avant',C.coachroof);
  d.text(177,418,'P36',13,C.transom);d.text(265,352,'P29/30',13,C.coachroof);
  d.view(828,122,816,370,'B. Projection axonométrique','Surfaces colorées et centres ; silhouette grise = repère visuel, jamais une donnée de force.');
  const iso=projection('iso',1240,400,44);drawContext(d,iso,'wind');drawPanels(d,iso,{arrows:true});
  d.leader(iso([5.05,.135,.6]),1500,448,'Étrave : +x',C.ink);
  d.text(846,474,'Flèches = normales extérieures, de longueur graphique constante.',14,C.muted);
  d.view(36,515,752,308,'C. Plan horizontal (x,y)','Chaque flanc est découpé en 14 panneaux. La normale suit la pente du contour.');
  const top=projection('top',415,680,44);drawPanels(d,top,{arrows:true});
  d.line(top([-5.5,0,0]),top([5.5,0,0]),C.muted,.8,[5,4]);
  d.text(742,670,'+x',14,C.ink);d.text(777,783,'Tribord +y',14,C.freeboard,'normal','end');
  d.text(777,637,'Bâbord -y',14,C.freeboard,'normal','end');
  for(const p of panels.filter(p=>p.category==='freeboard'&&p.id.endsWith('starboard')&&Number(p.id.split('-')[1])%2===0)){const q=top(vec(p.center));d.text(q[0],q[1]-10,p.code,11,C.ink,'normal','middle');}
  d.text(46,803,'Impairs P01...P27 = tribord ; pairs P02...P28 = bâbord.',14,C.muted);
  d.view(828,515,365,308,'D. Coupe transversale (y,z)','Projection des centres, sans effet de gîte.');
  const front=projection('front',1005,775,38);drawPanels(d,front);
  d.line(front([0,-3,0]),front([0,3,0]),C.water,1.5,[6,4]);
  d.text(846,801,'Bâbord',13,C.muted);d.text(1168,801,'Tribord',13,C.muted,'normal','end');
  d.view(1224,515,420,308,'E. Un panneau de flanc','Exemple : P21 = segment 10, tribord.');
  const p=panels[20],localProjection=projection('iso',1451,711,105),q=a=>localProjection(sub(a,vec(p.center)));d.poly(p.polygon.map(q),C.freeboard,C.freeboard,1.5,.35);
  const c=q(vec(p.center));d.circle(...c,4,C.ink);d.arrow(c,q(add(vec(p.center),mul(p.normal,.65))),C.freeboard,2);
  d.text(1240,595,`A = ${format(p.area,3)} m²`,15);d.text(1240,620,`n = (${format(p.normal[0],3)} ; ${format(p.normal[1],3)})`,15);
  d.text(1240,645,`C = (${format(p.center.x,3)} ; ${format(p.center.y,3)} ; ${format(p.center.z,3)}) m`,14);
  d.text(1240,801,'n est une direction ; elle ne donne pas la force.',14,C.muted);
  const columns=[36,442,848,1254];
  const notes=[['28 FLANCS + 1 TABLEAU',C.freeboard,['Flancs : 22,732 m² au total.','Tableau : 2,774 m².','Contours calculés entre le rail','de fargue et la flottaison.']],
    ['4 ROUF + 2 BÔME',C.coachroof,['Rouf : 8,000 m² ; bôme : 2,000 m².','Aires, centres et normales exacts.','Rectangles équivalents : le contour','local n’est pas fourni par le moteur.']],
    ['1 MÂT + GRÉEMENT',C.rig,['Aire équivalente : 2,150 m².','Symbole au centre C, pas une coque.','Omnidirectionnel : sa normale stockée','n’est pas utilisée dans la loi.']],
    ['COMMENT NAÎT LA FORCE',C.ink,['Vent apparent local = air - bateau.','Face au vent : pression normale.','Frottement selon la tangente.','Moment de lacet : N = x·Y - y·X.']]];
  notes.forEach(([t,c,lines],i)=>{d.text(columns[i],865,t,16,c,'bold');d.lines(columns[i],897,lines,15,C.ink,26);});
  d.text(36,1046,`Somme des aires : ${format(totalArea,3)} m². Ce total additionne les deux faces ; il ne représente pas une aire projetée dans une direction de vent.`,16);
  d.text(36,1082,'Repère commun : +x vers l’étrave, +y vers tribord, +z vers le haut. Le calcul est horizontal (avance, dérive, lacet) ; z règle l’exposition au vent.',15,C.muted);
  d.footer();return d;
}
function windInventory(){
  const d=new Drawing('FARDAGE | Catalogue des 36 panneaux','Valeurs du profil. Normales unitaires dans le plan horizontal ; angle mesuré de +x vers +y (tribord).','02 / 02');
  const cols=[45,122,556,659,783,907,1046,1162,1289,1422];
  const heads=['Code','Élément / identifiant moteur','A (m²)','Cx (m)','Cy (m)','Cz (m)','nx','ny','Angle','Loi'];
  d.poly([[36,117],[1644,117],[1644,153],[36,153]],C.ground,null);heads.forEach((t,i)=>d.text(cols[i],141,t,14,C.ink,'bold'));
  const french=id=>id.replace('freeboard-','Flanc ').replace('-starboard',' / tribord').replace('-port',' / bâbord').replace('coachroof-aft','Rouf arrière').replace('coachroof-fore','Rouf avant').replace('boom','Bôme').replace('mast-rigging','Mât + gréement').replace('transom-closure','Tableau arrière');
  for(const [i,p] of panels.entries()){
    const y=177+i*23.2;if(i%2===0)d.poly([[36,y-16],[1644,y-16],[1644,y+6],[36,y+6]],'#f8fafb',null);
    const values=[p.code,french(p.id),format(p.area,3),format(p.center.x,3),format(p.center.y,3),format(p.center.z,3),format(p.normal[0],3),format(p.normal[1],3),p.omnidirectional?'sans objet':`${format(p.angleDegrees,1)}°`,p.omnidirectional?'isotrope':'face au vent'];
    values.forEach((t,j)=>d.text(cols[j],y,t,j===1?13:14,j===0?C[p.category]:C.ink,j===0?'bold':'normal'));
  }
  d.lines(36,1043,['n = normale extérieure. Un panneau unilatéral agit si le vent apparent entre dans la face : Vapp·n < 0.',
    'Pour rouf et bôme, le rectangle préserve exactement A, C et n ; ses proportions sont choisies pour lire le modèle.',
    'Le mât + gréement utilise A=2,15 m² et C=(0,35 ; 0 ; 5,10) m ; aucune surface directionnelle n’est imposée.'],15,C.muted,25);
  d.footer();return d;
}
function waterSheet(){
  const d=new Drawing('PARTIES IMMERGÉES | Où l’eau agit','11 sections de coque + quille + safran en 5 bandes + disque d’hélice. Les aires colorées sont celles du modèle.','01 / 02');
  d.view(36,122,752,354,'A. Coupe longitudinale de calcul (x,z)','Rubans bleus : aire efficace de cross-flow. Appendices : rectangles conservant aire et envergure.');
  const side=projection('side',421,265,60);drawContext(d,side,'water');drawWater(d,side,{codes:true});
  d.line(side([-5.8,0,0]),side([5.6,0,0]),C.water,1.7,[6,4]);d.text(43,252,'z=0',13,C.water);
  d.dim(side([-4.92,0,0]),side([4.92,0,0]),-54,'11 sections sur LWL = 9,84 m ; Δx = 0,894545 m');
  d.leader(side([-.18,0,-1.08]),474,362,'Quille : C=(-0,18 ; 0 ; -1,08) m',C.keel);
  d.leader(side([rudder.x,0,rudder.z]),43,410,`Safran : centre à 0° x=${format(rudder.x)} m ; z=${format(rudder.z)} m`,C.rudder);
  d.leader(side([propeller.x,0,propeller.z]),247,438,`Hélice : x=${format(propeller.x)} m ; z=${format(propeller.z)} m`,C.propeller);
  d.view(828,122,816,354,'B. Projection axonométrique en coupe','La silhouette immergée grise sert à situer les surfaces équivalentes et les organes.');
  const iso=projection('iso',1250,271,66);drawContext(d,iso,'water');drawWater(d,iso,{arrows:true});
  d.text(845,450,'Flèches doubles = axes latéraux ±y, jamais un effort imposé ; orange = axe propulsif +x.',13,C.muted);
  d.view(36,499,752,324,'C. Plan horizontal (x,y)','Positions longitudinales exactes ; safran représenté à 0° de barre.');
  const top=projection('top',420,660,58);drawContext(d,top,'water');drawWater(d,top,{codes:true,arrows:true});
  d.line(top([-5.5,0,0]),top([5.5,0,0]),C.muted,1,[5,4]);
  d.leader(top([-.18,0,-1.08]),436,769,'Quille : plan médian y=0',C.keel);
  d.text(758,643,'+x / étrave',14,C.ink,'normal','end');d.text(758,801,'+y / tribord',14,C.hull,'normal','end');
  d.view(828,499,365,324,'D. Coupe médiane (y,z)','S06 à x=0 ; largeur = repère visuel.');
  const front=projection('front',1006,635,73);
  const s=sections[5],ellipse=[];for(let i=0;i<=32;i++){const theta=i*Math.PI/32;ellipse.push([0,1.795*Math.cos(theta),-.68*Math.sin(theta)]);}
  for(let i=1;i<ellipse.length;i++)d.line(front(ellipse[i-1]),front(ellipse[i]),C.ghost,1.6);
  d.line(front([0,-2,0]),front([0,2,0]),C.water,1.5,[5,3]);
  d.line(front([0,0,0]),front([0,0,-s.effectiveDepth]),C.hull,6);
  d.line(front([0,-1.2,-s.effectiveDepth]),front([0,1.2,-s.effectiveDepth]),C.hull,.7,[3,3]);
  d.lines(844,748,['h efficace S06 = 0,4896 m','Profondeur carène = 0,68 m','Profil transversal gris : illustratif.'],14,C.muted,23);
  d.view(1224,499,420,324,'E. Safran : cinq bandes (x,z)','Le jet aval en marche avant ne couvre pas tout le safran.');
  const localRudderProjection=projection('side',1410,700,125),rp=a=>localRudderProjection(sub(a,[rudder.x,0,rudder.z]));
  for(const [i,t] of strips.entries()){
    d.poly(t.polygon.map(rp),i%2?'#77baa6':C.rudder,C.rudder,1,.4);
    const a=rp(t.center);d.circle(...a,3,C.ink);d.text(a[0]+65,a[1]+5,t.code,14,C.rudder);
  }
  d.line(rp([rudder.stock.x,0,rudderBottom]),rp([rudder.stock.x,0,rudderTop]),C.force,3);
  d.text(1250,586,`Mèche à ${format(100*rudder.stockChordFraction,0)} % de corde`,13,C.force);
  const p=rp([propeller.x,0,propeller.z]),rx=rp([rudder.x,0,propeller.z]);
  d.line([p[0],p[1]-25.4],[p[0],p[1]+25.4],C.propeller,3);
  d.arrow([p[0]-5,p[1]],[rx[0],rx[1]],C.propeller,2);d.text(1555,631,'jet',13,C.propeller);
  d.text(1238,792,'R5 est la bande supérieure ; le disque d’hélice la recouvre presque entièrement.',14,C.muted);
  const x=[36,572,1108];
  const notes=[['COQUE : FREINAGE LATÉRAL',C.hull,['Aᵢ = 0,68 × 0,72 × Δx × shapeᵢ','Vlat,i = v relatif + r × xi','La force s’oppose au mouvement local.','Flèches doubles : axe ±y, pas une force.']],
    ['QUILLE / SAFRAN : PROFILS PORTANTS',C.keel,['Quille : 3,15 m² ; envergure 1,26 m.','Safran : 0,82 m² ; envergure 1,18 m.',`Trait rouge : mèche fixe à ${format(100*rudder.stockChordFraction,0)} % de corde.`,'Le centre tourne autour de la mèche avec la barre.']],
    ['HÉLICE ET ACTION GLOBALE',C.propeller,['Disque : diamètre exact 0,406 m.','Flèche avant +x : axe de poussée.','Flèches arrière -x : jet vers le safran.','La longueur des flèches est illustrative.']]];
  notes.forEach(([t,c,lines],i)=>{d.text(x[i],861,t,17,c,'bold');d.lines(x[i],894,lines,16,C.ink,28);});
  d.text(36,1046,`Somme des aires de cross-flow : ${format(crossFlowArea,3)} m². Surface mouillée globale du profil : 28,5 m². Ces deux grandeurs sont différentes.`,16);
  d.text(36,1082,'Forces horizontales X,Y et moment N = x·Y - y·X. Les profondeurs situent les appendices et le jet ; le modèle ne calcule ni roulis ni pilonnement.',15,C.muted);
  d.footer();return d;
}
function waterInventory(){
  const d=new Drawing('PARTIES IMMERGÉES | Sections et écoulements locaux','Répartition exacte du cross-flow ; distinction entre aires résistantes, masse ajoutée et géométrie de présentation.','02 / 02');
  const x=[46,151,326,508,726,998,1268];
  const headings=['Section','x (m)','Δx (m)','shape','Profondeur (m)','A efficace (m²)','h efficace (m)'];
  d.poly([[36,121],[1644,121],[1644,158],[36,158]],C.ground,null);headings.forEach((t,i)=>d.text(x[i],147,t,16,C.ink,'bold'));
  sections.forEach((s,i)=>{const y=187+i*32;if(i%2===0)d.poly([[36,y-21],[1644,y-21],[1644,y+10],[36,y+10]],'#f8fafb',null);
    [s.code,format(s.x,6),format(s.dx,6),format(s.shape,2),format(s.immersedDepth,6),format(s.area,6),format(s.effectiveDepth,6)].forEach((t,j)=>d.text(x[j],y,t,16,j===0?C.hull:C.ink));});
  d.lines(36,573,['A efficace = T carène × areaFactor × Δx × shape = 0,68 × 0,72 × Δx × shape.',
    'h efficace = A / Δx : hauteur choisie pour dessiner le ruban, pas la profondeur de la coque.',
    'Profondeur de section = 0,68 × (0,46 + 0,54 × shape). Le moteur l’utilise dans la masse ajoutée.',
    'La coque axiale est une résistance globale X(u relatif) ; les 11 efforts latéraux sont évalués séparément.'],16,C.ink,30);
  d.line([36,696],[1644,696],C.line);
  d.text(36,731,'CENTRES ET AIRES DES ORGANES',19,C.ink,'bold');
  d.lines(36,764,[`Quille : C=(${format(keel.x)} ; ${format(keel.y)} ; ${format(keel.z)}) m ; A=${format(keel.area)} m² ; span=${format(keel.span)} m.`,
    `Safran à 0° : C=(${format(rudder.x)} ; ${format(rudder.y)} ; ${format(rudder.z)}) m ; A=${format(rudder.area)} m² ; span=${format(rudder.span)} m.`,
    `Corde moyenne=${format(rudder.meanChord,3)} m ; mèche à ${format(100*rudder.stockChordFraction,0)} % depuis le bord d’attaque, x=${format(rudder.stock.x,3)} m.`,
    `Hélice : C=(${format(propeller.x)} ; ${format(propeller.y)} ; ${format(propeller.z)}) m ; diamètre=${format(propeller.diameter,3)} m.`,
    'Chaque bande R1...R5 : A=0,164 m², hauteur=0,236 m ; centres z exacts ci-dessous.',
    ...strips.map(s=>`${s.code} : z=${format(s.z,3)} m ; centre longitudinal x=-4,350 m.`)],16,C.ink,29);
  d.text(848,731,'VITESSE DU BATEAU RELATIVE À L’EAU',19,C.ink,'bold');
  d.lines(848,768,['u relatif = vitesse bateau - courant, axe avant.','v relatif = vitesse bateau - courant, axe tribord.','À un élément (x,y) :','u local = u relatif - r × y','v local = v relatif + r × x','Le safran ajoute le jet axial et le tourbillon','de chaque hélice reliée, bande par bande.','Sans écoulement ni jet, il ne produit pas de force.'],16,C.ink,29);
  d.text(36,1063,'Contours quille / safran : rectangles équivalents. Le moteur fait tourner le safran autour de sa mèche fixe et intègre le jet sur corde × hauteur.',16,C.muted);
  d.text(36,1093,'Le tirant d’eau nominal est 1,94 m ; il ne se confond ni avec le centre de quille z=-1,08 m, ni avec l’envergure de son modèle.',15,C.muted);
  d.footer();return d;
}

await fs.mkdir(output,{recursive:true});await fs.mkdir(pdfOutput,{recursive:true});
const scenes={fardage:buildWindScene(),'parties-immergees':buildWaterScene()};
const exported={};
for(const [name,scene] of Object.entries(scenes)){
  scene.traverse(n=>{if(n.userData.selectable)n.userData.displayName=n.name;});
  const array=await new GLTFExporter().parseAsync(scene,{binary:true,onlyVisible:false});
  const bytes=Buffer.from(array);exported[name]=bytes;
  await fs.writeFile(path.join(output,`${name}.glb`),bytes);
  const parsed=await new GLTFLoader().parseAsync(array,'');let count=0,stockCount=0;
  parsed.scene.traverse(n=>{
    if(n.userData.selectable)count++;
    if(n.userData.role==='rudder-stock'){
      stockCount++;
      assert.equal(n.userData.chordFraction,rudder.stockChordFraction);
      assert.equal(n.userData.position.x,rudder.stock.x);
    }
  });
  assert.equal(count,name==='fardage'?36:18,`${name}: selectable elements roundtrip`);
  assert.equal(stockCount,name==='parties-immergees'?1:0,`${name}: rudder stock roundtrip`);
  assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(8),bytes.length);
}
const drawings={fardage:[windSheet(),windInventory()],'parties-immergees':[waterSheet(),waterInventory()]};
for(const [name,sheets] of Object.entries(drawings)){
  for(const [i,d] of sheets.entries())await fs.writeFile(path.join(output,`${name}${i?'-catalogue':''}.svg`),d.svg());
}
const data={schemaVersion:1,generatedAt:new Date().toISOString(),profile:{id:profile.id,version:profile.version,physicsVersion:Physics.VERSION},
  frames:{boat:'x avant, y tribord, z haut',gltf:'X=-y bateau, Y=z bateau, Z=x bateau'},counts,totalArea,crossFlowArea,
  panels,sections,keel:raw.appendages[0],rudder:raw.rudders[0],strips,propeller:raw.propulsors[0],
  geometryPolicy:{exact:['freeboard','transom','centers','normalized-normals','areas','section-x','rudder-strip-z','rudder-stock-chord-fraction','propeller-position','propeller-diameter'],
    equivalent:['coachroof-and-boom-rectangles','keel-and-rudder-rectangles','cross-flow-ribbons'],
    illustrative:['omnidirectional-rig-symbol','reference-hull','direction-arrow-lengths']}};
await fs.writeFile(path.join(output,'donnees-modele.json'),JSON.stringify(data,null,2)+'\n');
const operationsPath=path.join(scratch,'drawing-operations.json');
await fs.writeFile(operationsPath,JSON.stringify(Object.fromEntries(Object.entries(drawings).map(([name,ds])=>[name,ds.map(d=>({title:d.title,ops:d.ops}))]))));
const pythonFlag=process.argv.indexOf('--python');const python=pythonFlag>=0?process.argv[pythonFlag+1]:'python3';
execFileSync(python,[path.join(root,'scripts/render-physics-model-pdfs.py'),operationsPath,pdfOutput],{stdio:'inherit'});
await writeStandaloneViewer(exported);
await fs.writeFile(path.join(output,'lire-les-modeles.md'),`# Lire les modèles de fardage et d’eau\n\nLes deux GLB et les planches SVG sont générés depuis le profil ${profile.id} ${profile.version}, moteur ${Physics.VERSION}. Les PDF comportent chacun une planche multi-axe et un catalogue des valeurs exactes.\n\nOuvrir **explorer-les-modeles.html** pour tourner les modèles, sélectionner un panneau, lire ses coordonnées et afficher les normales. Ce lecteur est autonome et fonctionne sans réseau. Les dessins **fardage.svg** et **parties-immergees.svg** utilisent les mêmes coordonnées que les GLB.\n\nRepère bateau : x vers l’étrave, y vers tribord, z vers le haut. Repère GLB : X=-y, Y=z, Z=x. Les points noirs sont les centres. Pour l’eau, les flèches doubles montrent les axes latéraux ±y : elles ne fixent pas le sens de la force. La flèche orange avant montre l’axe propulsif +x et les flèches orange arrière le jet -x. Toutes les longueurs de flèche sont illustratives.\n\n## Exactitude\n\n- Fardage : les 28 flancs et le tableau reprennent leurs contours exacts. Les 4 panneaux de rouf et les 2 de bôme sont des rectangles équivalents conservant exactement aire, centre et normale. Le mât/gréement est omnidirectionnel : son symbole représente le centre et son aire est une valeur de calcul, pas celle de la sphère.\n- Eau : les 11 rubans bleus représentent l’aire efficace de résistance latérale, pas des morceaux de carène. Quilles et bandes de safran préservent aire, centre et envergure sous une forme rectangulaire équivalente. Le disque d’hélice conserve son diamètre.\n- Gris : silhouette extraite du GLB visuel versionné ; elle ne sert à aucun calcul physique.\n- Les surfaces aérodynamiques totalisent ${format(totalArea,3)} m² en additionnant les deux bords. Ce total n’est pas une aire de fardage projetée sous un vent donné.\n- Les aires de cross-flow totalisent ${format(crossFlowArea,3)} m² ; les 28,5 m² de surface mouillée globale désignent une autre grandeur.\n\n## Reproduire\n\n\`node scripts/export-physics-model-illustrations.mjs --python <python-avec-reportlab>\`\n\nSources internes : \`src/simulateur-port/vessel-profiles.js\`, \`src/simulateur-port/physics-core.js\`, \`kjp_sun_odyssey_36i.glb\`. Les sources et dépendances locales sont exclues de la bibliographie externe. Le fichier \`donnees-modele.json\` conserve les valeurs et le classement exact/équivalent/illustratif.\n`);
await fs.appendFile(path.join(output,'lire-les-modeles.md'),`
## Mèche du safran

La ligne rouge représente l’axe fixe de la mèche. Pour le profil ${profile.name} ${profile.version}, elle se situe à ${format(100*rudder.stockChordFraction,0)} % de la corde moyenne depuis le bord d’attaque, soit x=${format(rudder.stock.x,3)} m dans le repère bateau. Quand la barre tourne, le rectangle équivalent du safran et son centre d’application pivotent autour de cette ligne ; le recouvrement du jet est intégré sur la corde et la hauteur.
`);
console.log(JSON.stringify({output,pdfOutput,panels:panels.length,sections:sections.length,rudderStrips:strips.length,totalArea,crossFlowArea,
  glbSizes:Object.fromEntries(Object.entries(exported).map(([k,v])=>[k,v.length])),checks:'areas, element counts, GLB roundtrip and lengths passed'}));

async function writeStandaloneViewer(exported){
  const bundle=await build({entryPoints:[path.join(root,'scripts/physics-model-viewer.mjs')],bundle:true,write:false,format:'iife',target:'es2020',minify:true});
  const boot=`window.KJP_PHYSICAL_MODELS=${JSON.stringify(Object.fromEntries(Object.entries(exported).map(([k,v])=>[k,v.toString('base64')])))};\nwindow.KJP_WIND_HEIGHT_PROFILE=${JSON.stringify({referenceHeight:profile.aerodynamics.referenceWindHeight,...profile.aerodynamics.verticalProfile})};`;
  const html=await fs.readFile(path.join(root,'scripts/physics-model-viewer.html'),'utf8');
  const inlineScript=(boot+'\n'+bundle.outputFiles[0].text).replace(/<\/script/gi,'<\\/script');
  new Script(inlineScript,{filename:'explorer-les-modeles-inline.js'});
  // A callback prevents $&, $` and $' in bundled source from being substitutions.
  await fs.writeFile(path.join(output,'explorer-les-modeles.html'),html.replace('/*__MODELS_AND_VIEWER__*/',()=>inlineScript));
}
