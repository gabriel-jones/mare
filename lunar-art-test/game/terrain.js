// Shared, deterministic open plains, lunar or Martian: geometry, walking and construction.
import {planetOf} from './planets.js';
const cache=new Map();
/**
 * Martian mineral deposits: ore at the surface in a flattened patch, each with a finite `amount` a drill can take. Iron
 * lies close in, titanium further out, gold furthest; frozen ground (ice) is scattered between.
 */
export const DEPOSIT=Object.freeze({
 iron:Object.freeze({name:'Iron',count:4,ring:[26,62],radius:4.6,amount:900}),
 titanium:Object.freeze({name:'Titanium',count:3,ring:[38,84],radius:4.2,amount:520}),
 gold:Object.freeze({name:'Gold',count:2,ring:[56,100],radius:3.6,amount:260}),
 ice:Object.freeze({name:'Ice',count:2,ring:[34,90],radius:4.4,amount:700}),
});
// Moon: broad terraced hills. Mars: taller mesas with sheer, stepped sides.
const HILLS={moon:[[36,22,17,22,7],[-31,25,14,18,5.5],[8,-60,18,23,8],[80,52,21,25,9],[-94,-12,19,28,8],[30,100,25,20,6]],
 mars:[[46,30,15,19,9],[-42,34,13,17,7.5],[14,-66,17,21,10],[86,58,19,22,11],[-96,-20,17,25,10],[34,104,22,18,8],[-70,-76,14,16,8.5],[102,-48,15,18,9]]};
const smooth=(a,b,t)=>{t=Math.max(0,Math.min(1,(t-a)/(b-a)));return t*t*(3-2*t);};
export function randomStream(seed){let n=seed>>>0;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
function noise(seed,x,z){const ix=Math.floor(x),iz=Math.floor(z),fx=smooth(0,1,x-ix),fz=smooth(0,1,z-iz),hash=(a,b)=>{let n=Math.imul(a,374761393)^Math.imul(b,668265263)^seed;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};return (hash(ix,iz)*(1-fx)+hash(ix+1,iz)*fx)*(1-fz)+(hash(ix,iz+1)*(1-fx)+hash(ix+1,iz+1)*fx)*fz;}
function local(c,x,z){const dx=x-c.x,dz=z-c.z;return {side:dx*Math.cos(c.angle)-dz*Math.sin(c.angle),depth:dx*Math.sin(c.angle)+dz*Math.cos(c.angle)};}
export function terrainData(seed){
 if(cache.has(seed))return cache.get(seed);
 const mars=planetOf(seed)==='mars';
 const random=randomStream(seed),hills=[],craters=[],boulders=[],deposits=[];
 // Keep established entrance positions so existing cave saves remain aligned.
 const caves=[-2.25,-.72,2.5].map(angle=>{const r=68+Math.sin(angle*3+seed*.01)*5+Math.sin(angle*7+1)*2;return {x:Math.sin(angle)*r,z:Math.cos(angle)*r,angle,width:5,height:5.5};});
 for(let i=0;i<caves.length;i++){const c=caves[i];hills.push({x:c.x+Math.sin(c.angle)*15,z:c.z+Math.cos(c.angle)*15,rx:19+i*2,rz:26+i*2,height:11+i*1.5,angle:c.angle,cave:i});}
 for(const [x,z,rx,rz,h] of HILLS[mars?'mars':'moon'])hills.push({x:x+(random()-.5)*6,z:z+(random()-.5)*6,rx,rz,height:h,angle:random()*6.28});
 if(mars)for(const [kind,d] of Object.entries(DEPOSIT))for(let placed=0,tries=0;placed<d.count&&tries<300;tries++){
  const a=random()*Math.PI*2,r=d.ring[0]+random()*(d.ring[1]-d.ring[0]),x=Math.sin(a)*r,z=Math.cos(a)*r;
  if(Math.abs(x)>104||Math.abs(z)>104||Math.hypot(x,z+10)<22||caves.some(c=>Math.hypot(x-c.x,z-c.z)<24)||hills.some(h=>Math.hypot(x-h.x,z-h.z)<Math.max(h.rx,h.rz)+d.radius+3)||deposits.some(o=>Math.hypot(x-o.x,z-o.z)<o.radius+d.radius+12))continue;
  deposits.push({id:deposits.length,kind,x,z,radius:d.radius,amount:d.amount});placed++;
 }
 const addCrater=(x,z,radius,depth)=>{if(caves.some(c=>Math.hypot(x-c.x,z-c.z)<radius+13)||hills.some(h=>Math.hypot(x-h.x,z-h.z)<Math.min(h.rx,h.rz)*.7)||deposits.some(d=>Math.hypot(x-d.x,z-d.z)<d.radius+radius+5))return;craters.push({x,z,radius,depth,aspect:.83+random()*.27,angle:random()*6.28});};
 // Mars has fewer craters, worn shallow by wind and old water.
 if(!mars){addCrater(18,23,6.4,1.25);addCrater(-23,5,4.3,.8);addCrater(19,-27,5.2,.95);}
 for(let i=0;i<(mars?14:35);i++){const x=(random()-.5)*244,z=(random()-.5)*244;if(Math.hypot(x,z)<26)continue;const r=2.6+random()*7;addCrater(x,z,r,(.45+r*.14)*(mars?.6:1));}
 for(let i=0;i<(mars?80:55);i++){
  let x,z;if(i<36){const h=hills[i%hills.length],a=random()*6.28,dist=.8+random()*.65;x=h.x+Math.sin(a)*h.rx*dist;z=h.z+Math.cos(a)*h.rz*dist;}else{x=(random()-.5)*180;z=(random()-.5)*180;}
  if(Math.hypot(x,z)<19||caves.some(c=>{const p=local(c,x,z);return Math.abs(p.side)<7&&p.depth>-16&&p.depth<7;}))continue;
  const shelf=i<27;boulders.push({x,z,radius:shelf?1.6+random()*1.7:.45+random()*1.25,height:shelf?2.8+random()*3.5:.55+random()*1.7,angle:random()*6.28,variant:i%3});
 }
 // The ice craters replace whatever random craters and rocks fell where they sit. Filtering
 // afterwards keeps the random stream, and so the rest of the landscape, unchanged.
 const site=mars?null:missionSite(),ice=mars?[]:iceDeposits();
 const clear=(x,z,r)=>ice.every(d=>Math.hypot(x-d.x,z-d.z)>d.radius+r)&&deposits.every(d=>Math.hypot(x-d.x,z-d.z)>d.radius+r);
 // Small pocks are drawn after the boulders so those keep their places, and stay out past the ring where
 // colonies have usually built.
 for(let i=0;i<(mars?24:70);i++){const x=(random()-.5)*236,z=(random()-.5)*236,r=2.6+random()**2*3.4;if(Math.hypot(x,z)>36&&clear(x,z,r+4))addCrater(x,z,r,(.35+r*.16)*(mars?.6:1));}
 const data={mars,hills,craters:[...craters.filter(c=>clear(c.x,c.z,c.radius+4)),...ice.map(d=>({...d,aspect:1,angle:0}))],caves,boulders:boulders.filter(b=>clear(b.x,b.z,b.radius+3)),site,deposits};
 cache.set(seed,data);return data;
}
/** The first expedition: a shadowed crater east of the landing site, holding an old robotic lander and water ice. */
export function missionSite(){return {x:62,z:-14,radius:13,depth:2.2,lander:{x:58.5,z:-17,radius:1.7,angle:.6}};}
// Further shadowed craters out on the plains, well past where colonies build, each holding its own ice.
const DEPOSITS=Object.freeze([{x:-58,z:8,radius:8,depth:1.9},{x:10,z:64,radius:9,depth:2},{x:-22,z:-76,radius:8,depth:1.8},{x:96,z:12,radius:9.5,depth:2.1}]);
/** Every ice-bearing crater, the mission crater first. */
let deposits=null;
export function iceDeposits(){if(!deposits){const s=missionSite();deposits=Object.freeze([{x:s.x,z:s.z,radius:s.radius,depth:s.depth},...DEPOSITS]);}return deposits;}
/** Grid cells (2 m) whose floor holds ice: the permanently shadowed middle of each deposit crater. */
export function iceAt(x,z){const l=missionSite().lander;return iceDeposits().some(d=>Math.hypot(x*2-d.x,z*2-d.z)<d.radius*.55)&&Math.hypot(x*2-l.x,z*2-l.z)>l.radius+1.2;}
const CRATER_DEPTH=1.7;
export function heightAt(seed,x,z){
 const data=terrainData(seed),clearing=smooth(17,25,Math.hypot(x,z)),pad=smooth(9,14,Math.hypot(x,z+10));
 let h=((noise(seed,x*.035,z*.035)-.5)*2.5+(noise(seed+13,x*.115,z*.115)-.5)*.65+Math.sin(x*.26+z*.13)*.055)*clearing*pad;
 let relief=0;
 for(const hill of data.hills){const p=local(hill,x,z),q=Math.hypot(p.side/hill.rx,p.depth/hill.rz);if(q>1.2)continue;const edge=1-smooth(.22,1.15,q),ridge=1+Math.sin(p.side*.35+p.depth*.16)*.055;relief+=hill.height*edge*edge*ridge;}
 // Reserve a gently graded approach at every cave mouth, including player width.
 let opening=0;for(const c of data.caves){const p=local(c,x,z);opening=Math.max(opening,(1-smooth(2.8,5,Math.abs(p.side)))*smooth(-12,-8,p.depth)*(1-smooth(1.5,4,p.depth)));}
 // Broad level shelves with a short slanted bevel between tiers. Martian mesas step up in fewer, taller, sheerer tiers.
 const tier=data.mars?1.7:.9,level=Math.floor(relief/tier),fraction=relief/tier-level;
 const terraced=(level+smooth(data.mars?.84:.72,1,fraction))*tier;
 h+=terraced*(1-opening);
 for(const c of data.craters){const p=local(c,x,z),d=Math.hypot(p.side/c.radius,p.depth/(c.radius*c.aspect));if(d>1.8)continue;const depth=c.depth*CRATER_DEPTH,bowl=-depth*(1-smooth(.08,.98,d)),rim=Math.exp(-(((d-1.04)/.18)**2))*depth*.5,ejecta=Math.exp(-(((d-1.25)/.42)**2))*depth*.15;h+=(bowl+rim+ejecta)*clearing*pad;}
 if(data.mars){
  // Long wind-laid dunes across the open plain, and a level patch over every deposit so a drill can stand on it.
  const dune=Math.sin(x*.17+z*.11+Math.sin(z*.05+x*.02)*2.4),crest=Math.max(0,dune)**1.6;
  h+=(crest*.7-.2)*clearing*pad*(1-smooth(4,9,relief));
  for(const d of data.deposits){const r=Math.hypot(x-d.x,z-d.z);if(r<d.radius+8)h*=1-.9*(1-smooth(d.radius+1,d.radius+8,r));}
 }
 return h;
}
/** The Martian deposit under world (x, z), or null. Always null on the Moon. */
export function depositAt(seed,x,z){return terrainData(seed).deposits.find(d=>Math.hypot(x-d.x,z-d.z)<=d.radius)??null;}
export function slopeAt(seed,x,z){return Math.hypot((heightAt(seed,x+.3,z)-heightAt(seed,x-.3,z))/.6,(heightAt(seed,x,z+.3)-heightAt(seed,x,z-.3))/.6);}
export function terrainReason(seed,cells){
 if(cells.some(c=>Math.abs(c.x*2)>116||Math.abs(c.z*2)>116))return 'Outside the construction area.';
 const heights=[];
 for(const c of cells){const x=c.x*2,z=c.z*2;
  if(terrainData(seed).boulders.some(b=>Math.hypot(Math.max(Math.abs(b.x-x)-1,0),Math.max(Math.abs(b.z-z)-1,0))<b.radius))return 'A large rock blocks this footprint.';
  const lander=terrainData(seed).site?.lander;if(lander&&Math.hypot(Math.max(Math.abs(lander.x-x)-1,0),Math.max(Math.abs(lander.z-z)-1,0))<lander.radius+.5)return 'The old lander is in the way.';
  for(const dx of [-1,0,1])for(const dz of [-1,0,1]){heights.push(heightAt(seed,x+dx,z+dz));if(slopeAt(seed,x+dx,z+dz)>.2)return 'Ground is too steep. Choose a flatter patch.';}
 }
 if(Math.max(...heights)-Math.min(...heights)>.38)return 'Ground is too uneven for this foundation.';return null;
}
// Walking is judged on the faceted ground you can see: crater walls and hill ramps are fine, only real cliffs stop you.
// The field must agree, since the coarse facets can't follow the flattened approaches carved to cave mouths.
const CLIFF=1.2;
export function surfaceSlopeAt(seed,x,z,e=.35){return Math.hypot(surfaceHeightAt(seed,x+e,z)-surfaceHeightAt(seed,x-e,z),surfaceHeightAt(seed,x,z+e)-surfaceHeightAt(seed,x,z-e))/(2*e);}
export function terrainBlocked(seed,x,z,buildings=[],defs={}){
 if(buildings.some(b=>{const d=defs[b.type];if(!d)return false;return x>=b.x*2-2&&x<=(b.x+(b.rotation%2?d.d:d.w))*2&&z>=b.z*2-2&&z<=(b.z+(b.rotation%2?d.w:d.d))*2;}))return false;
 const data=terrainData(seed),lander=data.site?.lander;
 // Crater bowls and rims are always walkable, however steep, even where one is punched into a hill's terraces.
 const inCrater=data.craters.some(c=>{const p=local(c,x,z);return Math.hypot(p.side/c.radius,p.depth/(c.radius*c.aspect))<1.45;});
 return (!inCrater&&surfaceSlopeAt(seed,x,z)>CLIFF&&slopeAt(seed,x,z)>.65)||(!!lander&&Math.hypot(x-lander.x,z-lander.z)<lander.radius)||data.boulders.some(b=>Math.hypot(x-b.x,z-b.z)<b.radius+.3);
}

// The visible ground is a faceted triangle lattice sampled from the continuous field above; placement checks keep
// using the field, while everything that stands on the ground uses the lattice so it sits exactly on the facets.
// The spacing deliberately misses the 2 m build grid so facets rarely line up into squares.
export const FACET=1.8;
const lattices=new Map();
const latticeHash=(seed,i,j)=>{let n=Math.imul(i,73856093)^Math.imul(j,19349663)^Math.imul(seed,83492791);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
/** Height of lattice vertex (i, j): the field plus a little deterministic jitter, none in the level starting clearing. */
export function latticeHeight(seed,i,j){
 let grid=lattices.get(seed);if(!grid)lattices.set(seed,grid=new Map());
 const k=i*100003+j;let h=grid.get(k);
 if(h===undefined){const x=i*FACET,z=j*FACET,calm=smooth(17,25,Math.hypot(x,z))*smooth(9,14,Math.hypot(x,z+10));h=heightAt(seed,x,z)+(latticeHash(seed,i,j)-.5)*.16*calm;grid.set(k,h);}
 return h;
}
/** Which diagonal splits lattice square (i, j): alternating at random so the facets don't read as a grid. */
export const facetFlip=(seed,i,j)=>latticeHash(seed+911,i,j)<.5;
export function surfaceHeightAt(seed,x,z){
 const fx=x/FACET,fz=z/FACET,i=Math.floor(fx),j=Math.floor(fz),u=fx-i,v=fz-j;
 const h00=latticeHeight(seed,i,j),h10=latticeHeight(seed,i+1,j),h01=latticeHeight(seed,i,j+1),h11=latticeHeight(seed,i+1,j+1);
 if(!facetFlip(seed,i,j))return u>=v?h00+u*(h10-h00)+v*(h11-h10):h00+v*(h01-h00)+u*(h11-h01);
 return u+v<=1?h00+u*(h10-h00)+v*(h01-h00):h11+(1-u)*(h01-h11)+(1-v)*(h10-h11);
}
