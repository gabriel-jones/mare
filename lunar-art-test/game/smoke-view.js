import * as THREE from 'three';

const UP=THREE.Object3D.DEFAULT_UP;

/** Smoke tendrils: a wisp tears off the body on a curling path and leaves a ribbon behind it that rises, spreads and thins. */
export function createSmoke(parent,count=150,seg=32){
 const verts=count*seg*2,pos=new Float32Array(verts*3),alpha=new Float32Array(verts),side=new Float32Array(verts),index=[];
 for(let t=0;t<count;t++)for(let i=0;i<seg-1;i++){const a=(t*seg+i)*2;index.push(a,a+1,a+2,a+1,a+3,a+2);}
 for(let v=0;v<verts;v++)side[v]=v%2?1:-1;
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('aAlpha',new THREE.BufferAttribute(alpha,1));geo.setAttribute('aSide',new THREE.BufferAttribute(side,1));geo.setIndex(index);
 const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,uniforms:{uColor:{value:new THREE.Color('#030305')}},
  vertexShader:'attribute float aAlpha;attribute float aSide;varying float vAlpha;varying float vSide;void main(){vAlpha=aAlpha;vSide=aSide;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:'uniform vec3 uColor;varying float vAlpha;varying float vSide;void main(){float a=vAlpha*smoothstep(1.0,0.15,abs(vSide));if(a<.01)discard;gl_FragColor=vec4(uColor,a);}'});
 const mesh=new THREE.Mesh(geo,mat);mesh.frustumCulled=false;parent.add(mesh);
 const FADE=2.2,EMIT=1/26,list=Array.from({length:count},()=>({pts:Array.from({length:seg},()=>new THREE.Vector3()),age:new Float32Array(seg).fill(99),head:new THREE.Vector3(),vel:new THREE.Vector3(),flight:0,emitT:0,curl:0,lift:0,width:.1,live:false}));
 const tangent=new THREE.Vector3(),across=new THREE.Vector3(),swirl=new THREE.Vector3();
 return {
  /** Tear a wisp off at `from`, carried along by `carry` (the body's own velocity); `spread` scatters where it starts
   * and `fling` scales how hard it tears away sideways (a wisp seeping out of a hole hardly does). */
  emit(from,carry,spread=.15,fling=1){
   const w=list.find(w=>!w.live);if(!w)return;
   const a=Math.random()*Math.PI*2,r=spread*Math.random(),out=(1.4+Math.random()*2)*fling;
   w.head.set(from.x+Math.cos(a)*r,from.y+(Math.random()-.3)*.2,from.z+Math.sin(a)*r);
   w.vel.set(Math.cos(a)*out+carry.x*.3,(.2+Math.random()*.9)*Math.min(1,fling+.3)+carry.y*.3,Math.sin(a)*out+carry.z*.3);
   w.curl=(Math.random()<.5?-1:1)*(2+Math.random()*5);w.lift=.2+Math.random()*.45;w.width=.08+Math.random()*.1;
   w.flight=.7+Math.random()*.7;w.emitT=0;w.live=true;w.pts.forEach(p=>p.copy(w.head));w.age.fill(99);
  },
  update(dt,toCamera){
   for(let t=0;t<count;t++){
    const w=list[t];
    if(w.live){
     if(w.flight>0){
      // The head wanders: its heading curls, it slows, and it climbs as it loses speed.
      w.flight-=dt;w.vel.applyAxisAngle(UP,w.curl*dt);w.curl+=(Math.random()-.5)*20*dt;
      w.vel.multiplyScalar(Math.exp(-dt*1.2));w.vel.y+=(Math.random()-.4)*2*dt;w.head.addScaledVector(w.vel,dt);
      for(w.emitT+=dt;w.emitT>=EMIT;w.emitT-=EMIT){for(let i=seg-1;i>0;i--){w.pts[i].copy(w.pts[i-1]);w.age[i]=w.age[i-1];}w.pts[0].copy(w.head);w.age[0]=0;}
     }
     let alive=false;
     for(let i=0;i<seg;i++){w.age[i]+=dt;if(w.age[i]<FADE){alive=true;const p=w.pts[i];swirl.set(Math.sin(p.y*7+t+w.age[i]*3),0,Math.cos(p.x*6+t*1.7+w.age[i]*2.5));p.addScaledVector(swirl,.25*dt);p.y+=w.lift*dt;}}
     if(!alive&&w.flight<=0)w.live=false;
    }
    for(let i=0;i<seg;i++){
     const v=(t*seg+i)*2,p=w.pts[i],k=w.live?w.age[i]/FADE:1;
     tangent.copy(w.pts[Math.max(0,i-1)]).sub(w.pts[Math.min(seg-1,i+1)]);
     // Bunched points (a slow wisp) give no direction of their own: stand the ribbon up instead of letting it spin.
     const tl=tangent.length();if(tl<.03)tangent.lerp(UP,1-tl/.03);
     across.crossVectors(tangent,toCamera);const len=across.length();if(len>1e-5)across.multiplyScalar((w.width*(.5+2.2*Math.min(1,k)))/len);else across.set(0,0,0);
     pos.set([p.x-across.x,p.y-across.y,p.z-across.z],v*3);pos.set([p.x+across.x,p.y+across.y,p.z+across.z],v*3+3);
     // Faint at the fresh tip, thickest just behind it, gone at the tail.
     const a=k>=1?0:Math.min(1,i/2)*(1-k)*Math.pow(1-i/(seg-1),.5);alpha[v]=a;alpha[v+1]=a;
    }
   }
   geo.attributes.position.needsUpdate=true;geo.attributes.aAlpha.needsUpdate=true;
  },
  /** The space emit() positions are in. */
  get space(){return mesh.parent;},
  clear(){list.forEach(w=>{w.live=false;w.flight=0;w.age.fill(99);});alpha.fill(0);geo.attributes.aAlpha.needsUpdate=true;},
  dispose(){geo.dispose();mat.dispose();},
 };
}
