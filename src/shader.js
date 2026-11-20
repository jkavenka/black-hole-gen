(function (name, runtime, fn) {
  var BH = (globalThis.BH = globalThis.BH || { modules: [] });
  BH.modules.push({ name: name, fn: fn, runtime: runtime });
  fn(BH);
  if (typeof module !== 'undefined') module.exports = BH;
})('shader', true, function (BH) {
  // Which pieces the shader needs. Changing any of these recompiles; slider values never do.
  BH.features = function (cfg) {
    var u = cfg.universe, mode = u.mode === 'photo' && !u.photo ? 'stars' : u.mode;
    return {
      disc: cfg.disc.amount > 0,
      universe: mode,
      photoKind: mode === 'photo' ? u.photoKind : null,
      objects: cfg.toys.objects.map(function (o) { return { shape: o.shape, skin: o.skin }; }),
      teddy: !!cfg.toys.teddy,
      quality: cfg.quality,
    };
  };

  var STEPS = { lighter: [110, 0.05], auto: [160, 0.04], sharper: [230, 0.03] };

  BH.VERTEX_SHADER = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}';

  var HEADER = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH', 'precision highp float;', '#else', 'precision mediump float;', '#endif',
    'uniform vec2 uRes; uniform vec2 uHole; uniform vec3 uCam; uniform vec3 uRight; uniform vec3 uUp; uniform vec3 uFwd;',
    'uniform float uTan; uniform float uPix; uniform float uTime; uniform vec3 uPlain;',
  ].join('\n');

  var UTIL = [
    'float hash(vec3 p){p=fract(p*0.3183099+0.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}',
    'float noise(vec3 x){vec3 i=floor(x);vec3 f=fract(x);f=f*f*(3.0-2.0*f);',
    ' return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),',
    '  mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}',
    'float fbm(vec3 p){float v=0.0,a=0.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=0.5;}return v;}',
    'vec3 aces(vec3 x){return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0);}',
  ].join('\n');

  // ---------- universes ----------
  var STARS = [
    'uniform float uStars; uniform float uGalaxy; uniform float uNebula; uniform vec3 uNebA; uniform vec3 uNebB;',
    'const vec3 GAL_N=vec3(0.0,0.906,0.423);', // galaxy band: a great circle tilted 25 degrees from the disc plane
    'vec3 starLayer(vec3 d,float sc,float dens,float seed){',
    ' vec3 c=floor(d*sc);',
    ' if(hash(c+seed)>dens) return vec3(0.0);',
    ' vec3 sd=normalize(c+0.25+0.5*vec3(hash(c+seed+1.3),hash(c+seed+2.7),hash(c+seed+4.1)));',
    ' float a=length(sd-d)/(uPix*0.85);',
    ' float b=exp(-a*a)*pow(hash(c+seed+7.7),2.5);',
    ' float tc=hash(c+seed+9.1);',
    ' vec3 col=mix(vec3(1.0,0.82,0.62),vec3(0.75,0.85,1.0),tc);',
    ' return col*b;}',
    'vec3 universe(vec3 d){',
    ' float band=dot(d,GAL_N);',
    ' float inBand=exp(-band*band/0.03);',
    ' vec3 s=starLayer(d,40.0,0.18,0.0)*1.6+starLayer(d,90.0,0.08+0.3*inBand*uGalaxy,11.0)+starLayer(d,190.0,0.03+0.25*inBand*uGalaxy,23.0)*0.6;',
    ' vec3 col=s*uStars*1.4;',
    ' float dust=fbm(d*5.0+3.0);',
    ' float lanes=smoothstep(0.35,0.65,fbm(d*9.0+7.0));',
    ' col+=uGalaxy*inBand*(0.09+0.24*dust)*mix(vec3(0.95,0.85,0.72),vec3(0.75,0.8,0.95),dust)*(0.35+0.65*lanes);',
    ' float n1=fbm(d*2.2+vec3(4.0,1.0,7.0)),n2=fbm(d*3.1+vec3(9.0,2.0,5.0));',
    ' col+=uNebula*0.34*(uNebA*smoothstep(0.45,0.85,n1)+uNebB*smoothstep(0.5,0.9,n2));',
    ' return col;}',
  ].join('\n');
  var PLAIN = 'vec3 universe(vec3 d){return uPlain;}';
  var PHOTO = [
    'uniform sampler2D uPhoto; uniform vec3 uPhotoFwd; uniform vec3 uPhotoRight; uniform vec3 uPhotoUp; uniform vec2 uPhotoSize;',
    'vec3 universe(vec3 d){',
    '#ifdef PHOTO_PANO',
    ' vec2 uv=vec2(atan(d.x,-d.z)/6.2831853+0.5, acos(clamp(d.y,-1.0,1.0))/3.1415927);',
    '#else',
    ' float f=dot(d,uPhotoFwd);',
    ' vec2 q=vec2(dot(d,uPhotoRight),dot(d,uPhotoUp))/max(abs(f),0.05);', // gnomonic plate; behind you it mirrors back
    ' vec2 uv=q/uPhotoSize+0.5;',
    ' uv=1.0-abs(1.0-mod(uv,2.0));', // mirrored repeat: never an empty sky
    ' uv.y=1.0-uv.y;',
    '#endif',
    ' return texture2D(uPhoto,uv).rgb*0.85;}',
  ].join('\n');

  // ---------- accretion disc ----------
  var DISC = [
    'uniform float uDiscAmount; uniform float uDiscBright; uniform float uDiscOuter; uniform float uTurb; uniform float uGlow;',
    'uniform vec3 uColA; uniform vec3 uColB; uniform float uColorMode; uniform float uDiscTime;',
    'vec3 bb(float x){x=clamp(x,0.0,1.6);',
    ' vec3 c=mix(vec3(0.3,0.04,0.01),vec3(1.0,0.42,0.1),smoothstep(0.0,0.45,x));',
    ' c=mix(c,vec3(1.0,0.78,0.52),smoothstep(0.4,0.85,x));',
    ' c=mix(c,vec3(1.0,0.96,0.9),smoothstep(0.8,1.15,x));',
    ' return mix(c,vec3(0.82,0.9,1.0),smoothstep(1.15,1.6,x));}',
    'float discField(float r,float a,float seed){',
    ' vec3 q=vec3(cos(a)*2.2,sin(a)*2.2,log(r)*7.0+seed);',
    ' return fbm(q+vec3(seed*1.7,0.0,0.0));}',
    'float discTurb(float r,float a){',
    ' float om=1.2*pow(r,-1.5);',
    ' float P=30.0; float t1=mod(uDiscTime,P); float t2=mod(uDiscTime+0.5*P,P);',
    ' float w1=1.0-abs(2.0*t1/P-1.0);',  // swap between two copies so the swirl never winds up too tight
    ' return mix(discField(r,a-om*t2,5.0),discField(r,a-om*t1,0.0),w1);}',
    'vec4 discSample(vec3 hit,vec3 segDir){',
    ' float r=length(hit.xz);',
    ' if(r<3.0||r>uDiscOuter) return vec4(0.0);',
    ' float edge=smoothstep(3.0,3.5,r)*(1.0-smoothstep(uDiscOuter*0.55,uDiscOuter,r));',
    ' float T=pow(r,-0.75)*pow(max(1.0-sqrt(3.0/r),0.0),0.25)/0.214;',
    ' vec3 vdir=normalize(vec3(hit.z,0.0,-hit.x));',
    ' float beta=sqrt(0.5/(r-1.0)); float gam=1.0/sqrt(1.0-beta*beta);',
    ' float g=sqrt(1.0-1.5/r)/(gam*(1.0-beta*dot(vdir,-segDir)));',
    ' float ge=mix(1.0,g,uGlow);',
    ' float n=discTurb(r,atan(hit.z,hit.x));',
    ' float tn=mix(1.0,0.25+1.5*n*n,uTurb);',
    ' vec3 c;',
    ' if(uColorMode<0.5){ c=bb(T*ge*1.05); }',
    ' else { c=mix(uColA,uColB,smoothstep(3.0,uDiscOuter,r));',
    '  if(ge>1.0) c=mix(c,vec3(dot(c,vec3(0.3333)))*1.1+vec3(0.0,0.04,0.12),clamp((ge-1.0)*0.7,0.0,0.5));',
    '  else c*=vec3(1.0,0.7+0.3*ge,0.5+0.5*ge); }',
    ' float I=pow(T,2.2)*pow(ge,4.0)*tn*uDiscBright*2.6;',
    ' float a=clamp(uDiscAmount*edge*(0.35+0.65*min(tn,1.0)),0.0,0.95);',
    ' return vec4(c*I*edge,a);}',
  ].join('\n');

  function main(f) {
    return [
      // remaining angle an outgoing ray turns from u to infinity: integral of du/sqrt(1/b^2 - u^2 + u^3), Simpson rule
      'float escAngle(float u,float w){',
      ' float B=w*w+u*u-u*u*u, s=0.0;',
      ' for(int k=0;k<=4;k++){ float x=u*float(k)/4.0; float f=inversesqrt(max(B-x*x+x*x*x,1e-12));',
      '  s+=f*((k==0||k==4)?1.0:(k==2?2.0:4.0)); }',
      ' return s*u/12.0;}',
      'void main(){',
      ' vec2 p=(gl_FragCoord.xy-uHole)/uRes.y;',
      ' vec3 d=normalize(uFwd+(p.x*uRight+p.y*uUp)*2.0*uTan);',
      ' float D=length(uCam); vec3 e1=uCam/D;',
      ' vec3 perp=d-dot(d,e1)*e1; float sl=length(perp);',
      ' vec3 e2=sl>1e-6?perp/sl:normalize(cross(e1,abs(e1.y)<0.9?vec3(0.0,1.0,0.0):vec3(1.0,0.0,0.0)));',
      ' float cosA=dot(d,e1), sinA=max(sl,1e-6);',
      ' float u=1.0/D, w=-u*cosA/sinA, phi=0.0;',  // u=1/r and its slope along the ray's own plane
      ' float uEsc=1.0/max(60.0,2.0*D);',
      ' vec3 col=vec3(0.0); float alpha=0.0; int state=0; vec3 esc=d; vec3 prev=uCam;',
      ' const float h=STEP_H;',
      ' for(int i=0;i<MAX_STEPS;i++){',
      '  float k1u=w, k1w=-u+1.5*u*u;',
      '  float u2=u+0.5*h*k1u, k2u=w+0.5*h*k1w, k2w=-u2+1.5*u2*u2;',
      '  float u3=u+0.5*h*k2u, k3u=w+0.5*h*k2w, k3w=-u3+1.5*u3*u3;',
      '  float u4=u+h*k3u, k4u=w+h*k3w, k4w=-u4+1.5*u4*u4;',
      '  float un=u+h/6.0*(k1u+2.0*k2u+2.0*k3u+k4u);',
      '  float wn=w+h/6.0*(k1w+2.0*k2w+2.0*k3w+k4w);',
      // far away gravity barely bends light: finish the ray analytically (u'' = -u) so the sky has no step bands
      '  if(un<=0.0){ float ph=phi+escAngle(u,w); esc=cos(ph)*e1+sin(ph)*e2; state=2; break; }',
      '  if(un<uEsc&&wn<0.0){ float ph=phi+h+escAngle(un,wn); esc=cos(ph)*e1+sin(ph)*e2; state=2; break; }',
      '  phi+=h; u=un; w=wn;',
      '  vec3 pos=(cos(phi)*e1+sin(phi)*e2)/u;',
      f.disc ? [
        '  if(prev.y*pos.y<=0.0&&prev.y!=pos.y){',
        '   vec3 hit=mix(prev,pos,prev.y/(prev.y-pos.y));',
        '   vec4 e=discSample(hit,normalize(pos-prev));',
        '   col+=(1.0-alpha)*e.rgb*e.a; alpha+=(1.0-alpha)*e.a;',
        '  }'].join('\n') : '',
      f.objects.length || f.teddy ? '  vec4 tv=toys(prev,pos); if(tv.a>0.0){ col+=(1.0-alpha)*tv.rgb*tv.a; alpha+=(1.0-alpha)*tv.a; }' : '',
      '  if(u>=1.0){ state=1; break; }',
      '  if(alpha>0.985) break;',
      '  prev=pos;',
      ' }',
      ' if(state==2) col+=(1.0-alpha)*universe(esc);',
      ' gl_FragColor=vec4(pow(aces(col),vec3(1.0/1.1)),1.0);',
      '}',
    ].join('\n');
  }

  // Toys are filled in by the toys chunk builder (orbiting objects, teddy).
  BH.SKIN_ID = { rocky: 0, fluffy: 1, cereal: 2, metal: 3 };
  BH.SHAPE_ID = { orb: 0, star: 1, torus: 2 };
  BH.OBJECT_RADIUS = 0.9;
  var OBJ_HEAD = [
    'uniform vec4 uObj[OBJ_COUNT]; uniform vec4 uObjInfo[OBJ_COUNT];', // xyz + bounding radius; skin, shape, spin, seed
    'vec3 rotY(vec3 p,float a){float c=cos(a),s=sin(a);return vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);}',
    'vec4 shade(vec3 hp,vec3 n,vec3 rd,vec3 q,float skin){',
    ' vec3 L=normalize(-hp);',                                   // lit by the glow around the hole
    ' float dif=max(dot(n,L),0.0)*0.9+abs(n.y)*0.25;',          // plus the disc above/below
    ' vec3 lit=uLightCol*dif+uFillCol; vec3 col=vec3(0.5); float a=1.0;',
  ].join('\n');
  var SKINS = {
    rocky: [
    ' if(skin<0.5){ float f=fbm(q*3.0); col=mix(vec3(0.36,0.31,0.27),vec3(0.66,0.58,0.48),f);',
    '  col*=0.85+0.15*sin(q.y*14.0+f*5.0); float cr=noise(q*7.0);',
    '  col*=1.0-0.35*smoothstep(0.62,0.72,cr)*(1.0-smoothstep(0.74,0.8,cr)); col*=lit; }'
    ].join('\n'),
    fluffy: [
    ' if(skin>0.5&&skin<1.5){ float f=fbm(q*7.0); col=mix(vec3(0.98,0.78,0.86),vec3(1.0,0.96,0.9),f);',
    '  float rim=1.0-abs(dot(n,-rd)); a=1.0-smoothstep(0.55,1.0,rim+(fbm(q*16.0)-0.5)*0.6);',
    '  col=col*(lit*0.9+0.1)+uLightCol*rim*rim*0.9; }'
    ].join('\n'),
    cereal: [
    ' if(skin>1.5&&skin<2.5){ float f=fbm(q*5.0); float b=noise(q*16.0);',
    '  vec3 nn=normalize(n+(vec3(noise(q*16.0+3.1),noise(q*16.0+7.7),b)-0.5)*0.6);',
    '  float d2=max(dot(nn,L),0.0)*0.9+abs(nn.y)*0.25;',
    '  col=mix(vec3(0.85,0.52,0.16),vec3(0.96,0.76,0.4),f)*(0.8+0.3*b)*(uLightCol*d2+uFillCol);',
    '  if(hash(floor(q*38.0))>0.965) col=vec3(1.0)*(0.6*d2+0.4)*max(uLightCol,vec3(0.6)); }'
    ].join('\n'),
    metal: [
    ' if(skin>2.5){ vec3 r=reflect(rd,n); float fr=0.6+0.4*pow(1.0-max(dot(n,-rd),0.0),3.0);',
    '  vec3 env=mix(uFillCol*1.5,uLightCol*0.8,smoothstep(-0.3,0.6,dot(r,L)))+uLightCol*pow(max(dot(r,L),0.0),24.0)*2.5',
    '   +uLightCol*0.4*smoothstep(0.7,1.0,abs(r.y));',
    '  col=vec3(0.85,0.87,0.9)*env*fr; }'
    ].join('\n')
  };
  var OBJ_TAIL = [    ' return vec4(col,a);}',
    'vec4 objects(vec3 a,vec3 b){',
    ' vec3 ab=b-a; float L=length(ab); vec3 rd=ab/L; float best=1e9; vec4 res=vec4(0.0);',
    ' for(int i=0;i<OBJ_COUNT;i++){',
    '  vec3 c=uObj[i].xyz; float R=uObj[i].w;',
    '  vec3 oc=a-c; float bq=dot(oc,rd); float cq=dot(oc,oc)-R*R; float dd=bq*bq-cq;',
    '  if(dd<0.0) continue;',
    '  float t=-bq-sqrt(dd);',
    '  if(t<0.0||t>L||t>best) continue;',
    '  vec3 hp=a+rd*t; vec3 n=normalize(hp-c);',
    '  vec3 q=rotY(n,uObjInfo[i].z)+uObjInfo[i].w;',
    '  best=t; res=shade(hp,n,rd,q,uObjInfo[i].x);',
    '  res.a*=smoothstep(1.0,3.0,length(hp-uCam));',            // fade out rather than hit the camera
    ' }',
    ' return res;}',
  ].join('\n');

  // Toys: orbiting objects and the teddy. Code for what isn't used is never emitted.
  BH.toyChunks = function (f) {
    if (!f.objects.length && !f.teddy) return '';
    var out = ['uniform vec3 uLightCol; uniform vec3 uFillCol;'];
    if (f.objects.length) {
      var used = {};
      f.objects.forEach(function (o) { used[o.skin] = 1; });
      out.push(OBJ_HEAD, Object.keys(SKINS).filter(function (k) { return used[k]; }).map(function (k) { return SKINS[k]; }).join('\n'), OBJ_TAIL);
    }
    if (f.teddy && BH.TEDDY_CHUNK) out.push(BH.TEDDY_CHUNK);
    out.push('vec4 toys(vec3 a,vec3 b){ vec4 r=vec4(0.0);');
    if (f.objects.length) out.push(' r=objects(a,b);');
    if (f.teddy && BH.TEDDY_CHUNK) out.push(' vec4 td=teddy(a,b); if(td.a>r.a) r=td;');
    out.push(' return r;}');
    return out.join('\n');
  };

  BH.buildFragmentShader = function (f) {
    var s = STEPS[f.quality] || STEPS.auto, defs = [];
    defs.push('#define MAX_STEPS ' + s[0], '#define STEP_H ' + s[1].toFixed(3));
    if (f.disc) defs.push('#define HAS_DISC');
    defs.push('#define UNIVERSE_' + f.universe.toUpperCase());
    if (f.photoKind === 'pano') defs.push('#define PHOTO_PANO');
    if (f.objects.length) {
      defs.push('#define OBJ_COUNT ' + f.objects.length);
      var seen = {};
      f.objects.forEach(function (o) {
        if (!seen['S' + o.shape] && o.shape !== 'orb') { seen['S' + o.shape] = 1; defs.push('#define HAS_SHAPE_' + o.shape.toUpperCase()); }
        if (!seen['K' + o.skin]) { seen['K' + o.skin] = 1; defs.push('#define SKIN_' + o.skin.toUpperCase()); }
      });
    }
    if (f.teddy) defs.push('#define HAS_TEDDY');
    var uni = f.universe === 'stars' ? STARS : f.universe === 'plain' ? PLAIN : PHOTO;
    return [HEADER, defs.join('\n'), UTIL, uni, f.disc ? DISC : '', BH.toyChunks(f), main(f)].join('\n');
  };
});
