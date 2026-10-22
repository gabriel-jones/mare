// Shared, deterministic open lunar plains: geometry, walking and construction.
const cache=new Map();
const smooth=(a,b,t)=>{t=Math.max(0,Math.min(1,(t-a)/(b-a)));return t*t*(3-2*t);};
export function randomStream(seed){let n=seed>>>0;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
function noise(seed,x,z){const ix=Math.floor(x),iz=Math.floor(z),fx=smooth(0,1,x-ix),fz=smooth(0,1,z-iz),hash=(a,b)=>{let n=Math.imul(a,374761393)^Math.imul(b,668265263)^seed;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};return (hash(ix,iz)*(1-fx)+hash(ix+1,iz)*fx)*(1-fz)+(hash(ix,iz+1)*(1-fx)+hash(ix+1,iz+1)*fx)*fz;}
function local(c,x,z){const dx=x-c.x,dz=z-c.z;return {side:dx*Math.cos(c.angle)-dz*Math.sin(c.angle),depth:dx*Math.sin(c.angle)+dz*Math.cos(c.angle)};}
export function terrainData(seed){
 if(cache.has(seed))return cache.get(seed);
 const random=randomStream(seed),hills=[],craters=[],boulders=[];
 // Keep established entrance positions so existing cave saves remain aligned.
 const caves=[-2.25,-.72,2.5].map(angle=>{const r=68+Math.sin(angle*3+seed*.01)*5+Math.sin(angle*7+1)*2;return {x:Math.sin(angle)*r,z:Math.cos(angle)*r,angle,width:5,height:5.5};});
 for(let i=0;i<caves.length;i++){const c=caves[i];hills.push({x:c.x+Math.sin(c.angle)*15,z:c.z+Math.cos(c.angle)*15,rx:19+i*2,rz:26+i*2,height:11+i*1.5,angle:c.angle,cave:i});}
 for(const [x,z,rx,rz,h] of [[36,22,17,22,7],[-31,25,14,18,5.5],[8,-60,18,23,8],[80,52,21,25,9],[-94,-12,19,28,8],[30,100,25,20,6]])hills.push({x:x+(random()-.5)*6,z:z+(random()-.5)*6,rx,rz,height:h,angle:random()*6.28});
 const addCrater=(x,z,radius,depth)=>{if(caves.some(c=>Math.hypot(x-c.x,z-c.z)<radius+13)||hills.some(h=>Math.hypot(x-h.x,z-h.z)<Math.min(h.rx,h.rz)*.7))return;craters.push({x,z,radius,depth,aspect:.83+random()*.27,angle:random()*6.28});};
 addCrater(18,23,6.4,1.25);addCrater(-23,5,4.3,.8);addCrater(19,-27,5.2,.95);
 for(let i=0;i<35;i++){const x=(random()-.5)*244,z=(random()-.5)*244;if(Math.hypot(x,z)<26)continue;const r=2.6+random()*7;addCrater(x,z,r,.45+r*.14);}
 for(let i=0;i<55;i++){
  let x,z;if(i<36){const h=hills[i%hills.length],a=random()*6.28,dist=.8+random()*.65;x=h.x+Math.sin(a)*h.rx*dist;z=h.z+Math.cos(a)*h.rz*dist;}else{x=(random()-.5)*180;z=(random()-.5)*180;}
  if(Math.hypot(x,z)<19||caves.some(c=>{const p=local(c,x,z);return Math.abs(p.side)<7&&p.depth>-16&&p.depth<7;}))continue;
  const shelf=i<27;boulders.push({x,z,radius:shelf?1.6+random()*1.7:.45+random()*1.25,height:shelf?2.8+random()*3.5:.55+random()*1.7,angle:random()*6.28,variant:i%3});
 }
 const data={hills,craters,caves,boulders};cache.set(seed,data);return data;
}
export function heightAt(seed,x,z){
 const data=terrainData(seed),clearing=smooth(17,25,Math.hypot(x,z)),pad=smooth(9,14,Math.hypot(x,z+10));
 let h=((noise(seed,x*.035,z*.035)-.5)*2.5+(noise(seed+13,x*.115,z*.115)-.5)*.65+Math.sin(x*.26+z*.13)*.055)*clearing*pad;
 let relief=0;
 for(const hill of data.hills){const p=local(hill,x,z),q=Math.hypot(p.side/hill.rx,p.depth/hill.rz);if(q>1.2)continue;const edge=1-smooth(.22,1.15,q),ridge=1+Math.sin(p.side*.35+p.depth*.16)*.055;relief+=hill.height*edge*edge*ridge;}
 // Reserve a gently graded approach at every cave mouth, including player width.
 let opening=0;for(const c of data.caves){const p=local(c,x,z);opening=Math.max(opening,(1-smooth(2.8,5,Math.abs(p.side)))*smooth(-12,-8,p.depth)*(1-smooth(1.5,4,p.depth)));}
 // Broad level shelves with a short slanted bevel between tiers.
 const tier=.9,level=Math.floor(relief/tier),fraction=relief/tier-level;
 const terraced=(level+smooth(.72,1,fraction))*tier;
 h+=terraced*(1-opening);
 for(const c of data.craters){const p=local(c,x,z),d=Math.hypot(p.side/c.radius,p.depth/(c.radius*c.aspect));if(d>1.8)continue;const bowl=-c.depth*(1-smooth(.08,.98,d)),rim=Math.exp(-(((d-1.04)/.18)**2))*c.depth*.42,ejecta=Math.exp(-(((d-1.25)/.42)**2))*c.depth*.13;h+=(bowl+rim+ejecta)*clearing*pad;}
 return h;
}
export function slopeAt(seed,x,z){return Math.hypot((heightAt(seed,x+.3,z)-heightAt(seed,x-.3,z))/.6,(heightAt(seed,x,z+.3)-heightAt(seed,x,z-.3))/.6);}
export function terrainReason(seed,cells){
 if(cells.some(c=>Math.abs(c.x*2)>116||Math.abs(c.z*2)>116))return 'Outside the construction area.';
 const heights=[];
 for(const c of cells){const x=c.x*2,z=c.z*2;
  if(terrainData(seed).boulders.some(b=>Math.hypot(Math.max(Math.abs(b.x-x)-1,0),Math.max(Math.abs(b.z-z)-1,0))<b.radius))return 'A large rock blocks this footprint.';
  for(const dx of [-1,0,1])for(const dz of [-1,0,1]){heights.push(heightAt(seed,x+dx,z+dz));if(slopeAt(seed,x+dx,z+dz)>.2)return 'Ground is too steep. Choose a flatter patch.';}
 }
 if(Math.max(...heights)-Math.min(...heights)>.38)return 'Ground is too uneven for this foundation.';return null;
}
export function terrainBlocked(seed,x,z,buildings=[],defs={}){
 if(buildings.some(b=>{const d=defs[b.type];if(!d)return false;return x>=b.x*2-2&&x<=(b.x+(b.rotation?d.d:d.w))*2&&z>=b.z*2-2&&z<=(b.z+(b.rotation?d.w:d.d))*2;}))return false;
 return slopeAt(seed,x,z)>.65||terrainData(seed).boulders.some(b=>Math.hypot(x-b.x,z-b.z)<b.radius+.3);
}

// Visual voxel shelves use broad four-metre cells. Physics retains the continuous
// field above for stable slope checks; character grounding uses the shelf height.
export function surfaceHeightAt(seed,x,z){const cx=Math.floor(x/4)*4+2,cz=Math.floor(z/4)*4+2,h=heightAt(seed,cx,cz),step=h>2?.75:.25;return Math.round(h/step)*step;}
