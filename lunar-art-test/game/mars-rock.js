import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Martian cave rock: sedimentary, laid down in bands of rust, ochre, butterscotch and maroon with the odd hard basalt
 * cap, then carved by wind into hoodoos, fins and stepped mesas. Colours are linear, like the vertex colours they feed.
 */
const BANDS={rust:[.4,.1,.045],ochre:[.52,.2,.065],butter:[.6,.3,.11],maroon:[.22,.065,.04],pale:[.56,.3,.17],basalt:[.1,.06,.05]};
export const DUST=[.5,.2,.09];
/** Wall strata from the floor up, each [thickness, band, hard]: hard layers stand proud as ledges, soft ones are scooped out under them. */
const STRATA=[[.42,'maroon',0],[.38,'rust',1],[.55,'ochre',0],[.22,'basalt',1],[.5,'rust',0],[.36,'butter',1],[.62,'pale',0],[.28,'maroon',1],[.5,'ochre',0],[.3,'rust',1],[.6,'butter',0]];
export const STRATA_TOPS=STRATA.reduce((tops,[t])=>(tops.push((tops.at(-1)??0)+t),tops),[]);
const hash=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
const noise=(x,y)=>{const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
 return (hash(ix,iy)*(1-u)+hash(ix+1,iy)*u)*(1-v)+(hash(ix,iy+1)*(1-u)+hash(ix+1,iy+1)*u)*v;};
/** The beds tilt gently across the cave, so a band climbs or sinks along a long wall rather than running dead level. */
export const dip=(x,z)=>(noise(x*.045+3.1,z*.045+7.3)-.5)*.7;
export function stratumAt(y){let k=0;while(k<STRATA.length-1&&y>STRATA_TOPS[k])k++;
 const bottom=k?STRATA_TOPS[k-1]:0;return {k,f:Math.min(1,Math.max(0,(y-bottom)/STRATA[k][0])),band:BANDS[STRATA[k][1]],hard:STRATA[k][2]};}
/** How far a wall at height y (dip already taken off) sits back into the rock: proud for hard beds with an overhanging lip, scooped for soft ones. */
export function strataOffset(y){const s=stratumAt(y);return s.hard?-.12-.06*Math.max(0,(s.f-.6)/.4):.1+.1*Math.sin(Math.PI*s.f);}

/** Flat-shaded colour: `color(x, y, z)` lit from above and one side, like the rest of the cave rock. */
function paint(geometry,color){
 geometry=geometry.index?geometry.toNonIndexed():geometry;geometry.computeVertexNormals();
 const p=geometry.attributes.position,n=geometry.attributes.normal,out=[];
 for(let i=0;i<p.count;i++){const lit=.6+Math.max(0,n.getY(i))*.3+Math.max(0,n.getX(i))*.12,c=color(p.getX(i),p.getY(i),p.getZ(i),n.getY(i));out.push(c[0]*lit,c[1]*lit,c[2]*lit);}
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(out,3));return geometry;
}
/** Knock every vertex off true by a function of where it is, so shared corners move together and the facets stay closed. */
function weather(geometry,amount,seed=0){
 const p=geometry.attributes.position;
 for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),a=Math.atan2(z,x),k=1+amount*(noise(a*1.6+seed,y*7+seed)-.5)*2;
  p.setXYZ(i,x*k,y+(y>.02&&y<.98?(hash(x*31+seed,z*17+y*5)-.5)*amount*.25:0),z*k);}
 return geometry;
}
const tone=(band,x,y,z,v=.18)=>{const t=1-v/2+v*noise(x*3.1+z*2.3,y*9.5);return [band[0]*t,band[1]*t,band[2]*t];};
/** Bands up a formation in local height 0..1, wavering a little round it; the top gets a dusting where it faces up. */
const bands=(list,wobble=.03)=>(x,y,z,ny)=>{const at=y+(noise(Math.atan2(z,x)*1.3,y*3)-.5)*wobble*2,band=BANDS[list[Math.min(list.length-1,Math.max(0,Math.floor(at*list.length)))]];
 const c=tone(band,x,y,z),d=Math.max(0,ny-.75)*2.4;return [c[0]+(DUST[0]-c[0])*d,c[1]+(DUST[1]-c[1])*d,c[2]+(DUST[2]-c[2])*d];};
const lathe=(profile,sides)=>new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),sides);

/** The Martian formation kit, each piece about 1 tall and .75 round at the foot like the Moon's stalagmites, scaled the same way. */
export const MARS_FORMATIONS=['Hoodoo','Fin','Basalt','Mesa','Boulders'];
export function marsFormations(){
 // A hoodoo: soft beds pinched by the wind into a waisted pillar under a hard dark cap that overhangs it.
 const stem=bands(['maroon','rust','ochre','butter','rust','pale','ochre','rust']);
 const hoodoo=paint(weather(lathe([[.78,0],[.7,.07],[.5,.15],[.6,.22],[.58,.29],[.4,.38],[.5,.45],[.46,.52],[.3,.62],[.35,.68],[.23,.76],[.22,.81],[.6,.84],[.64,.89],[.52,.95],[.2,1],[0,1]],9),.13,1),
  (x,y,z,ny)=>y>.825?tone(BANDS.basalt,x,y,z,.3):stem(x,y/.83,z,ny));
 // A fin: a blade of layered rock left standing between wind scours, thinning and fraying toward the top.
 const fin=new THREE.BoxGeometry(1.8,1,.55,8,10,2).translate(0,.5,0),fp=fin.attributes.position;
 for(let i=0;i<fp.count;i++){const x=fp.getX(i),y=fp.getY(i),z=fp.getZ(i),w=(1-.5*y)*(1+.12*Math.sin(y*15+x*3))*(y>.9?.8:1);
  fp.setXYZ(i,x*w+.18*Math.sin(y*2.6),y*(1-.3*Math.max(0,Math.abs(x)-.25)),z*(1-.55*y)*(1+.35*Math.sin(x*4.5+y*6)));}
 const finGeo=paint(weather(fin,.06,2),bands(['rust','maroon','ochre','butter','rust','ochre','pale','rust','maroon'],.015));
 // Columnar basalt: a tight bundle of six-sided prisms snapped off at different heights.
 const columns=[[0,0,1],...[0,1,2,3,4,5].map(i=>[Math.cos(i*Math.PI/3+.3)*.56,Math.sin(i*Math.PI/3+.3)*.56,.3+.55*hash(i,3)])].map(([x,z,h],i)=>{
  const g=new THREE.CylinderGeometry(.3,.32,h,6).translate(x,h/2,z);
  const top=h-.03-.08*hash(i,9),tilt=(hash(i,5)-.5)*.16,p=g.attributes.position;for(let j=0;j<p.count;j++)if(p.getY(j)>h-.01)p.setY(j,top+tilt*(p.getX(j)-x));return g.toNonIndexed();});
 const basalt=paint(mergeGeometries(columns),(x,y,z,ny)=>ny>.7?tone([.3,.1,.05],x,y,z,.3):tone(y<.12?BANDS.maroon:BANDS.basalt,x,y,z,.35));
 columns.forEach(g=>g.dispose());
 // A stepped mesa in miniature: flat top, each hard bed a ledge, each soft one a slope of rubble.
 const mesa=paint(weather(lathe([[.88,0],[.82,.12],[.72,.2],[.74,.32],[.6,.38],[.58,.6],[.5,.66],[.48,.86],[.42,.92],[.36,.96],[0,.97]],8),.12,4),
  bands(['maroon','rust','rust','ochre','butter','butter','pale','basalt']));
 // Boulders fallen from the beds above, piled where they landed.
 const rocks=[[0,.3,0,.55,.62],[.42,.18,.3,.34,.55],[-.34,.16,.4,.3,.6],[-.1,.66,-.08,.33,.7]].map(([x,y,z,r,s],i)=>
  weather(new THREE.DodecahedronGeometry(r,0).scale(1,s,1).rotateY(i*1.7),.14,i*3).translate(x,y,z).toNonIndexed());
 const boulders=paint(mergeGeometries(rocks),bands(['maroon','rust','ochre','butter','rust'],.12));rocks.forEach(g=>g.dispose());
 return {Hoodoo:hoodoo,Fin:finGeo,Basalt:basalt,Mesa:mesa,Boulders:boulders};
}
/** One loose boulder, for the scree at the foot of the walls. */
export const scree=()=>paint(weather(new THREE.DodecahedronGeometry(1,0).scale(1,.62,1),.12,6),(x,y,z,ny)=>{
 const c=tone(BANDS[['rust','ochre','maroon','butter'][Math.floor(noise(x*2+5,z*2)*4)]],x,y,z,.25),d=Math.max(0,ny-.7)*2;return [c[0]+(DUST[0]-c[0])*d,c[1]+(DUST[1]-c[1])*d,c[2]+(DUST[2]-c[2])*d];});
