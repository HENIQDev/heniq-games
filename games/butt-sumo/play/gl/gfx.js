// BUTT SUMO の 3D 描画（WebGL2 を直接使う。外部ライブラリなし）。
// カメラ・土俵・観客・キャラクターの動き・エフェクト（粒子）・影・輪郭線を担当する。
import { m4, hex } from './mat.js';
import * as mesh from './mesh.js';
import { MODELS } from './models.js';
import { buildWorld, PALETTES } from './world.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

const LIT_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm;
uniform mat4 uVP, uM; uniform mat3 uN; uniform float uOut;
out vec3 vN, vW;
void main(){ vec4 w=uM*vec4(aPos,1.0); vec3 n=normalize(uN*aNrm); if(uOut>0.0){ w.xyz+=n*uOut; } vW=w.xyz; vN=n; gl_Position=uVP*w; }`;
const LIT_FS = `#version 300 es
precision highp float;
in vec3 vN, vW; out vec4 o;
uniform vec3 uCol, uEmis, uLight, uLCol, uSky, uGnd, uCam, uFogC, uOutCol, uTint; uniform float uFogD, uGloss, uOutMode, uTintA, uAlpha;
void main(){
  if(uOutMode>0.5){ float d=length(uCam-vW); o=vec4(mix(uOutCol,uFogC,1.0-exp(-d*uFogD)),1.0); return; }
  vec3 n=normalize(vN); if(!gl_FrontFacing) n=-n;
  float ndl=dot(n,uLight);
  float band=smoothstep(-0.15,0.2,ndl)*0.5+smoothstep(0.3,0.62,ndl)*0.5;
  vec3 amb=mix(uGnd,uSky,n.y*0.5+0.5);
  vec3 c=uCol*(amb*0.78+uLCol*band*0.85);
  vec3 v=normalize(uCam-vW); vec3 h=normalize(uLight+v);
  float sp=pow(max(dot(n,h),0.0),40.0);
  c+=vec3(1.0)*smoothstep(0.55,0.7,sp)*uGloss*0.7;
  float rim=pow(1.0-max(dot(n,v),0.0),3.0); c+=rim*0.22*uSky;
  c+=uEmis; c=mix(c,uTint,uTintA);
  float d=length(uCam-vW); c=mix(c,uFogC,1.0-exp(-d*uFogD));
  o=vec4(c,uAlpha);
}`;
const GROUND_FS = `#version 300 es
precision highp float;
in vec3 vN, vW; out vec4 o;
uniform vec3 uClay, uLine, uOuter, uDanger, uCam, uFogC; uniform float uRing, uR0, uFogD, uTop, uTime;
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
void main(){
  vec2 q=vW.xz; float r=length(q);
  vec3 c=uClay;
  c*=0.95+0.05*hash(floor(q*16.0));
    float ring=smoothstep(0.1,0.04,abs(r-uR0)); c=mix(c,uLine,ring*0.9);
  float cur=smoothstep(0.07,0.02,abs(r-uRing)); 
  if(r>uRing){ c=mix(c,uDanger,0.55*smoothstep(0.0,0.4,r-uRing)+0.15); }
  c=mix(c,uLine,cur*0.95*step(0.001,abs(uR0-uRing)));
  float sx=abs(abs(q.x)-1.8); float st=smoothstep(0.07,0.03,sx)*step(abs(q.y),0.75); c=mix(c,uLine,st*0.8);
  if(r>uR0+0.25) c=mix(c,uOuter,0.7);
  float d=length(uCam-vW); c=mix(c,uFogC,1.0-exp(-d*uFogD));
  o=vec4(c,1.0);
}`;
const SKY_VS = `#version 300 es
out vec2 vUv; void main(){ vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2)); vUv=p; gl_Position=vec4(p*2.0-1.0,0.9999,1.0); }`;
const SKY_FS = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform vec3 uTop,uBot,uSun; uniform float uAsp,uStars,uTime;
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
void main(){ vec3 c=mix(uBot,uTop,smoothstep(0.1,0.95,vUv.y));
 vec2 sp=(vUv-vec2(0.5,0.62))*vec2(uAsp,1.0); float d=length(sp); c+=uSun*(0.5*exp(-d*7.0)+0.9*smoothstep(0.1,0.07,d));
 if(uStars>0.5){ vec2 g=floor(vUv*vec2(uAsp*70.0,70.0)); float h=hash(g); float tw=0.6+0.4*sin(uTime*2.0+h*40.0); c+=vec3(1.0)*step(0.985,h)*tw*smoothstep(0.35,0.6,vUv.y); }
 o=vec4(c,1.0); }`;
const AUD_VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec4 aPh; layout(location=3) in vec3 aCol;
uniform mat4 uVP; uniform float uTime, uCheer; out vec3 vN, vC, vW;
void main(){ float bob=abs(sin(uTime*(3.0+aPh.w*3.0)+aPh.w*20.0))*(0.04+0.34*uCheer); vec3 p=aPos*0.34+aPh.xyz+vec3(0.0,bob,0.0); vW=p; vN=aNrm; vC=aCol; gl_Position=uVP*vec4(p,1.0); }`;
const AUD_FS = `#version 300 es
precision highp float; in vec3 vN,vC,vW; out vec4 o; uniform vec3 uLight,uSky,uGnd,uCam,uFogC; uniform float uFogD;
void main(){ vec3 n=normalize(vN); float ndl=dot(n,uLight); float b=smoothstep(-0.1,0.5,ndl); vec3 c=vC*(mix(uGnd,uSky,n.y*0.5+0.5)*0.8+b*0.6); float d=length(uCam-vW); c=mix(c,uFogC,1.0-exp(-d*uFogD)); o=vec4(c,1.0); }`;
const PART_VS = `#version 300 es
layout(location=0) in vec4 aPS; layout(location=1) in vec4 aC; uniform mat4 uVP; uniform float uH; out vec4 vC;
void main(){ vec4 p=uVP*vec4(aPS.xyz,1.0); gl_Position=p; gl_PointSize=clamp(aPS.w*uH/max(p.w,0.1),1.0,160.0); vC=aC; }`;
const PART_FS = `#version 300 es
precision highp float; in vec4 vC; out vec4 o;
void main(){ vec2 q=gl_PointCoord*2.0-1.0; float r=length(q);
 float kind=floor(vC.a*0.5+0.0); float a=fract(vC.a*0.5)*2.0;
 float alpha; if(kind>=2.0){ float an=atan(q.y,q.x); float star=0.55+0.45*cos(an*5.0); alpha=smoothstep(star,star-0.15,r); } else alpha=smoothstep(1.0,0.4,r);
 if(alpha<0.02) discard; o=vec4(vC.rgb,alpha*a); }`;
const SH_FS = `#version 300 es
precision highp float; in vec3 vN,vW; out vec4 o; uniform vec3 uCenter; uniform float uRad,uA;
void main(){ float r=length(vW.xz-uCenter.xz)/uRad; o=vec4(0.0,0.0,0.0,smoothstep(1.0,0.15,r)*uA); }`;

function compile(gl, vs, fs) {
  const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}

export function createGfx(canvas) {
  let gl;
  try { gl = canvas.getContext('webgl2', { antialias: true, alpha: false, depth: true, powerPreference: 'high-performance', preserveDrawingBuffer: false }); } catch (e) { gl = null; }
  if (!gl) return null;
  const progs = {
    lit: compile(gl, LIT_VS, LIT_FS), ground: compile(gl, LIT_VS, GROUND_FS), sky: compile(gl, SKY_VS, SKY_FS),
    aud: compile(gl, AUD_VS, AUD_FS), part: compile(gl, PART_VS, PART_FS), shadow: compile(gl, LIT_VS, SH_FS),
  };
  function vao(m, extra) {
    const a = gl.createVertexArray(); gl.bindVertexArray(a);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, m.v, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.i, gl.STATIC_DRAW);
    if (extra) extra();
    gl.bindVertexArray(null);
    return { a, n: m.i.length };
  }
  const meshes = { s: vao(mesh.sphere(18, 12)), b: vao(mesh.box()), y: vao(mesh.cyl(20)), f: vao(mesh.cyl(36, 0.94, 1)), k: vao(mesh.cyl(18, 0, 1)), d: vao(mesh.disc(64)) };

  // 観客（インスタンス）
  const audMesh = mesh.sphere(8, 6);
  let audVao = null, audBuf = null, audN = 0;
  function setAudience(list) {
    if (audVao) { gl.deleteVertexArray(audVao.a); if (audBuf) gl.deleteBuffer(audBuf); }
    const data = new Float32Array(list.length * 7);
    list.forEach((q, i) => { const c = hex(q.col); data.set([q.p[0], q.p[1], q.p[2], q.ph, c[0], c[1], c[2]], i * 7); });
    audVao = vao(audMesh, () => {
      audBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, audBuf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 28, 0); gl.vertexAttribDivisor(2, 1);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 28, 16); gl.vertexAttribDivisor(3, 1);
    });
    audN = list.length;
  }

  // 粒子
  const MAXP = 600;
  const parts = [];
  const pdata = new Float32Array(MAXP * 8);
  const pvao = gl.createVertexArray(); gl.bindVertexArray(pvao);
  const pbuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pbuf); gl.bufferData(gl.ARRAY_BUFFER, pdata.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16);
  gl.bindVertexArray(null);

  const st = { world: null, theme: '', R0: 5, pal: PALETTES.park, W: 1, H: 1, scale: 1, cam: { tx: 0, tz: 0, d: 16, ready: false }, shake: 0, flash: 0, cheer: 0, anim: [{ phase: 0, outT: 0 }, { phase: 0, outT: 0 }], fx: [], msAvg: 16, frames: 0, maxScale: 1, minScale: 0.7, glitch: 0 };
  const lightDir = (() => { const v = [-0.4, 0.85, 0.5]; const m = Math.hypot(...v); return v.map((x) => x / m); })();

  function setTheme(theme, R0) {
    if (st.theme === theme && st.R0 === R0) return;
    st.theme = theme; st.R0 = R0;
    st.world = buildWorld(theme, R0);
    st.pal = st.world.pal;
    setAudience(st.world.aud);
  }

  function resize(maxDpr = 2) {
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    st.maxScale = dpr;
    const cw = canvas.clientWidth || 1, ch = canvas.clientHeight || 1;
    const sc = st.scale || dpr;
    canvas.width = Math.max(2, Math.round(cw * sc)); canvas.height = Math.max(2, Math.round(ch * sc));
    st.W = canvas.width; st.H = canvas.height;
  }

  // ---- 部品の描画 ----
  const tmpN = new Float32Array(9);
  const col = [0, 0, 0];
  function drawMesh(prog, key, M) {
    const m = meshes[key];
    gl.uniformMatrix4fv(prog.u.uM, false, M);
    gl.uniformMatrix3fv(prog.u.uN, false, m4.normal(M, tmpN));
    gl.bindVertexArray(m.a);
    gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_SHORT, 0);
  }
  function partMatrix(root, part, extra) {
    let M = extra ? m4.mul(root, extra) : root;
    M = m4.mul(M, m4.T(part.p[0], part.p[1], part.p[2]));
    if (part.rot) { if (part.rot[1]) M = m4.mul(M, m4.RY(part.rot[1])); if (part.rot[0]) M = m4.mul(M, m4.RX(part.rot[0])); if (part.rot[2]) M = m4.mul(M, m4.RZ(part.rot[2])); }
    return m4.mul(M, m4.S(part.sc[0], part.sc[1], part.sc[2]));
  }
  function aboutPivot(piv, R) { return m4.mul(m4.mul(m4.T(piv[0], piv[1], piv[2]), R), m4.T(-piv[0], -piv[1], -piv[2])); }

  function toWorld(x, y, flip) { return flip ? [y, -x] : [-y, x]; }
  const dirToWorld = (dx, dy, flip) => (flip ? [dy, -dx] : [-dy, dx]);

  // ---- カメラ ----
  function updateCamera(view, scene, dt) {
    const c = st.cam;
    const asp = st.W / st.H;
    const portrait = asp < 1;
    const fovy = portrait ? 0.9 : 0.66;
    const pitch = portrait ? 0.95 : 0.6;
    let tx = 0, tz = 0, ext = st.R0 + 0.5;
    if (view && scene.mode !== 'menu') {
      const [ax, az] = toWorld(view.f[0].x, view.f[0].y, scene.flip), [bx, bz] = toWorld(view.f[1].x, view.f[1].y, scene.flip);
      tx = (ax + bx) / 2 * 0.35; tz = (az + bz) / 2 * 0.35;
      if (view.phase === 'ko' || view.phase === 'over') {
        const wi = view.winner >= 0 ? view.winner : 0;
        const [wx, wz] = toWorld(view.f[wi].x, view.f[wi].y, scene.flip);
        tx = lerp(tx, wx, 0.55); tz = lerp(tz, wz, 0.55); ext *= 0.78;
      }
    }
    if (scene.preview) ext = portrait ? 4.2 : 3.2;
    const dH = ext / (Math.tan(fovy / 2) * asp);
    const dV = scene.preview ? (ext * 0.55 + 0.6) / Math.tan(fovy / 2) : (ext * Math.sin(pitch) + 2.3) / Math.tan(fovy / 2);
    const d = (scene.preview ? Math.max(dH, dV, 4) : Math.max(dH, dV, 9)) * (scene.zoom || 1);
    tx -= scene.shift || 0;
    if (!c.ready) { c.tx = tx; c.tz = tz; c.d = d; c.ready = true; }
    const k = 1 - Math.exp(-dt * 3.5);
    c.tx += (tx - c.tx) * k; c.tz += (tz - c.tz) * k; c.d += (d - c.d) * k;
    const sh = st.shake;
    const jx = (Math.random() - 0.5) * sh * 0.5, jy = (Math.random() - 0.5) * sh * 0.5;
    const ty = (scene.preview ? 1.0 : 0.5) - (portrait && scene.lift ? (scene.preview ? 6.0 : 3.2) : 0);
    const eye = [c.tx + jx, Math.sin(pitch) * c.d + ty + jy, c.tz + Math.cos(pitch) * c.d];
    const target = [c.tx, ty, c.tz];
    return { eye, VP: m4.mul(m4.persp(fovy, asp, 0.5, 180), m4.look(eye, target, [0, 1, 0])), fovy };
  }

  // ---- キャラクターの動き ----
  function fighterDraw(prog, f, idx, scene, time, dt, camEye, view) {
    const model = MODELS[f.id];
    if (!model) return;
    const a = st.anim[idx];
    const flip = scene.flip;
    const [X, Z] = toWorld(f.x, f.y, flip);
    const vx = f.vx + f.kx, vy = f.vy + f.ky;
    const sp = Math.hypot(vx, vy), own = Math.hypot(f.vx, f.vy);
    a.phase += dt * (2.5 + sp * 1.7);
    const walk = clamp(own / 3.5, 0, 1);
    const dashing = f.dashT > 0, charging = f.chargeT > 0, bracing = !!f.brace, stunned = f.stunT > 0, spec = f.specT > 0, out = !!f.out;
    const ended = view && (view.phase === 'ko' || view.phase === 'over');
    const won = ended && view.winner === idx && !out, lost = ended && view.winner !== idx && view.winner >= 0 && !out;
    const bt = scene.time || time;
    // 向き：お尻を相手へ向ける（体の前は反対側）
    let ang = f.ang;
    if (scene.preview) ang = scene.preview.yaw;
    const [bdx, bdz] = scene.preview ? [0, 0] : dirToWorld(Math.cos(ang), Math.sin(ang), flip);
    let yaw = scene.preview ? scene.preview.yaw : Math.atan2(-bdx, -bdz);
    // 姿勢
    let sx = 1, sy = 1, sz = 1, pitch = 0, roll = 0, lift = Math.max(f.z, 0), hop = 0;
    const idleT = bt * 5 + idx * 2;
    sy += Math.sin(idleT) * 0.015;
    if (model.gait === 'hop') hop = Math.abs(Math.sin(a.phase * 0.5)) * model.hop * 6 * walk;
    else if (model.gait === 'waddle') { roll += Math.sin(a.phase) * 0.12 * walk; hop = Math.abs(Math.sin(a.phase)) * model.hop * walk; }
    else if (model.gait === 'slide') { pitch += clamp(sp * 0.02, 0, 0.2); sy += Math.sin(bt * 9) * 0.04 * (1 + walk); }
    else hop = Math.abs(Math.sin(a.phase)) * (model.hop || 0.03) * walk;
    if (model.jiggle) { sy += Math.sin(bt * 11 + idx) * 0.03 * model.jiggle * (1 + sp * 0.3); sx -= Math.sin(bt * 11 + idx) * 0.02 * model.jiggle; }
    let tintA = 0, tint = [1, 1, 1];
    let thrust = 0, headYaw = Math.PI * 0.8, headPitch = 0, armUp = 0, armSwing = 0.8, legSpread = 0;
    if (dashing) { pitch -= 0.4; sz *= 1.12; sy *= 0.92; thrust = 0.25; hop = 0; legSpread = 0.5; }
    if (charging) { const k = clamp(f.chargeT / 1.1, 0, 1); sy *= 1 - 0.18 * k; sx *= 1 + 0.08 * k; sz *= 1 + 0.08 * k; roll += Math.sin(bt * 60) * 0.05 * k; tintA = 0.15 + 0.4 * k * (0.6 + 0.4 * Math.sin(bt * 25)); tint = [1, 0.45, 0.2]; thrust = -0.1 * k; }
    if (bracing) { sy *= 0.82; sx *= 1.12; sz *= 1.1; legSpread = 0.4; tintA = Math.max(tintA, f.braceT < 0.3 ? 0.35 : 0); tint = [0.7, 0.9, 1]; }
    if (stunned && !out) { roll += Math.sin(bt * 28) * 0.28 * clamp(f.stunT * 2.5, 0, 1); sy *= 0.94; headYaw = Math.PI * 0.8 + Math.sin(bt * 18) * 0.5; armUp = 0.6; }
    if (spec) { tintA = Math.max(tintA, 0.18 + 0.14 * Math.sin(bt * 30)); tint = [1, 0.85, 0.2]; if (f.spin) yaw += bt * 14; }
    if (f.specKind === 'heavy' && spec) { sx *= 1.25; sz *= 1.25; sy *= 0.9; }
    if (f.air) { sy *= 1.12; armUp = 1.4; pitch += 0.2; }
    if (f.flash > 0) { tintA = Math.max(tintA, clamp(f.flash * 3, 0, 0.8)); tint = [1, 1, 1]; }
    if (f.exhaust > 0) { sy *= 0.92; roll += Math.sin(bt * 8) * 0.05; }
    if (scene.preview) {
      const pv = scene.preview;
      hop = pv.pose === 'win' ? Math.abs(Math.sin(bt * 6)) * 0.45 : Math.abs(Math.sin(bt * 3)) * 0.04;
      headYaw = pv.look !== undefined ? pv.look : 0.15 * Math.sin(bt * 2);
      if (pv.pose === 'win') armUp = 2.4;
      thrust = Math.sin(bt * 5) * 0.1;
    }
    if (won) { hop = Math.abs(Math.sin(bt * 7)) * 0.55; armUp = 2.5; headYaw = 0.2 * Math.sin(bt * 3); yaw += Math.sin(bt * 3) * 0.6 + Math.PI * 0.0; tintA = 0.0; }
    if (lost) { sy *= 0.72; sx *= 1.12; pitch += 0.35; headYaw = Math.PI * 0.8; armUp = -0.4; hop = 0; }
    let tumbleX = 0, tumbleZ = 0;
    if (out) {
      a.outT += dt; tumbleX = a.outT * 9; tumbleZ = a.outT * 5; headYaw = Math.sin(bt * 20) * 0.6; armUp = 2.2; sx = sy = sz = 1;
      const [ox, oz] = dirToWorld(f.kx, f.ky, flip); if (Math.hypot(ox, oz) > 0.1) { tumbleX *= Math.sign(oz || 1); }
    } else a.outT = 0;
    const wig = (scene.mode === 'menu' || (view && view.phase === 'ready')) ? Math.sin(bt * 9 + idx) * 0.22 : Math.sin(bt * 6 + idx) * 0.05 * (1 - walk) + (dashing ? 0 : Math.sin(a.phase * 2) * 0.05 * walk);
    const baseY = (scene.preview ? 0 : 0) + lift + hop;
    let root = m4.T(X, baseY, Z);
    root = m4.mul(root, m4.RY(yaw));
    if (out) { root = m4.mul(root, m4.T(0, 0.8, 0)); root = m4.mul(root, m4.RX(tumbleX)); root = m4.mul(root, m4.RZ(tumbleZ)); root = m4.mul(root, m4.T(0, -0.8, 0)); }
    else { if (pitch) root = m4.mul(root, m4.RX(pitch)); if (roll) root = m4.mul(root, m4.RZ(roll)); }
    root = m4.mul(root, m4.S(sx, sy, sz));
    // 影（ぼかした丸）
    if (!out || f.z > -0.3) {
      gl.useProgram(progs.shadow.p);
      const Su = progs.shadow.u;
      gl.uniformMatrix4fv(Su.uVP, false, st.VP);
      gl.uniform3f(Su.uCenter, X, 0, Z);
      const rad = (MODELS[f.id] ? 1 : 1) * (view ? 0.95 : 1.0) * (0.75 + 0.35 * (f.big || 1));
      gl.uniform1f(Su.uRad, rad * 1.1);
      gl.uniform1f(Su.uA, clamp(0.5 - lift * 0.18, 0.1, 0.5) * (out ? 0.4 : 1));
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      drawMesh(progs.shadow, 'd', m4.mul(m4.T(X, 0.02, Z), m4.S(rad * 1.1, 1, rad * 1.1)));
      gl.depthMask(true); gl.disable(gl.BLEND);
    }
    // 本体
    const L = progs.lit.u;
    gl.useProgram(progs.lit.p);
    gl.uniform3f(L.uTint, tint[0], tint[1], tint[2]); gl.uniform1f(L.uTintA, tintA);
    const swing = Math.sin(a.phase) * (0.75 * walk + (dashing ? 0.9 : 0)) ;
    for (let pass = 0; pass < 2; pass++) {
      if (pass === 0) { gl.uniform1f(L.uOutMode, 1); gl.uniform1f(L.uOut, 0.028 * (f.big || 1)); gl.cullFace(gl.FRONT); gl.enable(gl.CULL_FACE); gl.uniform3f(L.uOutCol, 0.09, 0.06, 0.13); }
      else { gl.uniform1f(L.uOutMode, 0); gl.uniform1f(L.uOut, 0); gl.disable(gl.CULL_FACE); }
      for (const part of model.parts) {
        let ex = null;
        const r = part.role;
        if (r === 'legL' || r === 'legR') { const sgn = r === 'legL' ? 1 : -1; ex = aboutPivot(part.piv, m4.mul(m4.RX(swing * sgn), m4.RZ((r === 'legL' ? 1 : -1) * legSpread * 0.5))); }
        else if (r === 'armL' || r === 'armR') { const sgn = r === 'armL' ? -1 : 1; const raise = armUp ? armUp * (r === 'armL' ? 1 : -1) : 0; ex = aboutPivot(part.piv, m4.mul(m4.RZ(raise), m4.RX(-swing * sgn * armSwing * 0.7 + (bracing ? -0.6 : 0)))); }
        else if (r === 'wingL' || r === 'wingR') { const flap = Math.sin(bt * (dashing || charging ? 40 : 8) + idx) * (dashing ? 0.9 : 0.25) + armUp * 0.5; ex = aboutPivot(part.piv, m4.RZ((r === 'wingL' ? 1 : -1) * flap)); }
        else if (r === 'head') { const pv = model.headPiv; ex = aboutPivot(pv, m4.mul(m4.RY(headYaw), m4.RX(headPitch + Math.sin(bt * 4 + idx) * 0.04))); }
        else if (r === 'butt') { const pv = [0, 0.8, -0.2]; ex = m4.mul(m4.T(0, 0, thrust), aboutPivot(pv, m4.mul(m4.RY(wig), m4.S(1, 1 + Math.sin(bt * 12) * 0.03 * (1 + (charging ? 3 : 0)), 1)))); }
        else if (r === 'tail') ex = aboutPivot(part.p, m4.RZ(Math.sin(bt * 5 + idx) * 0.15));
        const M = partMatrix(root, part, ex);
        if (pass === 1) {
          const c = hex(part.c);
          gl.uniform3f(L.uCol, c[0], c[1], c[2]);
          gl.uniform3f(L.uEmis, (part.emis || 0) * c[0], (part.emis || 0) * c[1], (part.emis || 0) * c[2]);
          gl.uniform1f(L.uGloss, part.gloss || 0.15);
        }
        drawMesh(progs.lit, part.m === 'y' && part.top ? 'f' : part.m, M);
      }
    }
    gl.uniform1f(L.uTintA, 0);
    // 状態の演出：スタンの星
    if (stunned && !out) {
      for (let i = 0; i < 3; i++) { const t = bt * 7 + i * 2.1; pushPart(X + Math.cos(t) * 0.5, 2.3 * (f.big || 1) + baseY, Z + Math.sin(t) * 0.5, 0.2, 1, 0.9, 0.2, 2 * 2 + 1 * 0.9, 0.1); }
    }
    a.pos = [X, baseY, Z];
  }

  // ---- 粒子 ----
  function pushPart(x, y, z, size, r, g, b, kindAlpha, life, vx = 0, vy = 0, vz = 0, grav = 0) {
    if (parts.length >= MAXP) parts.shift();
    parts.push({ x, y, z, size, r, g, b, kind: Math.floor(kindAlpha / 2), a: (kindAlpha % 2) || 1, life, max: life, vx, vy, vz, grav });
  }
  function emit(n, x, y, z, o) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, s = (o.speed || 2) * (0.4 + Math.random() * 0.8), up = (o.up || 1.5) * Math.random();
      const col2 = o.cols ? o.cols[(Math.random() * o.cols.length) | 0] : [1, 1, 1];
      parts.push({ x, y, z, size: (o.size || 0.3) * (0.7 + Math.random() * 0.6), r: col2[0], g: col2[1], b: col2[2], kind: o.kind || 0, a: o.alpha || 0.9, life: (o.life || 0.6) * (0.7 + Math.random() * 0.6), max: o.life || 0.6, vx: Math.cos(a) * s, vy: up, vz: Math.sin(a) * s, grav: o.grav === undefined ? -4 : o.grav, grow: o.grow || 0 });
      if (parts.length > MAXP) parts.shift();
    }
  }
  function updateParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy += (p.grav || 0) * dt; p.size += (p.grow || 0) * dt;
      const d = Math.exp(-1.5 * dt); p.vx *= d; p.vz *= d;
    }
  }
  function drawParts(prog) {
    const n = parts.length;
    if (!n) return;
    for (let i = 0; i < n; i++) {
      const p = parts[i], k = clamp(p.life / p.max, 0, 1);
      pdata.set([p.x, p.y, p.z, p.size, p.r, p.g, p.b, (p.kind * 2 + 1) * 0 + (p.kind * 2 + clamp(p.a * (k < 0.5 ? k * 2 : 1), 0.02, 0.98))], i * 8);
    }
    gl.useProgram(progs.part.p);
    gl.uniformMatrix4fv(progs.part.u.uVP, false, st.VP);
    gl.uniform1f(progs.part.u.uH, st.H * 0.9);
    gl.bindBuffer(gl.ARRAY_BUFFER, pbuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, pdata.subarray(0, n * 8));
    gl.bindVertexArray(pvao);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.drawArrays(gl.POINTS, 0, n);
    gl.depthMask(true); gl.disable(gl.BLEND);
  }

  // ---- イベント（衝突・突進など）から演出を作る ----
  function worldAt(x, y, flip) { const w = toWorld(x, y, flip); return w; }
  function consume(events, scene) {
    const flip = scene.flip;
    for (const e of events || []) {
      if (e.t === 'hit' || e.t === 'counter') {
        const [X, Z] = worldAt(e.x, e.y, flip);
        const p = e.p || 0.5;
        emit(10 + p * 18, X, 1.0, Z, { cols: [[1, 0.95, 0.5], [1, 0.6, 0.25], [1, 1, 1]], kind: 2, size: 0.45 + p * 0.5, speed: 3 + p * 4, up: 2.5, life: 0.45, grav: -3 });
        emit(8, X, 0.2, Z, { cols: [[0.85, 0.75, 0.6]], kind: 0, size: 0.6, speed: 2.5, up: 0.8, life: 0.7, grow: 1.2, alpha: 0.7, grav: 0.4 });
        st.shake = Math.max(st.shake, 0.25 + p * 0.7);
        st.flash = Math.max(st.flash, e.t === 'counter' ? 0.5 : 0.25 + p * 0.2);
        st.cheer = Math.min(1, st.cheer + 0.4);
      } else if (e.t === 'bump') {
        const [X, Z] = worldAt(e.x, e.y, flip);
        emit(4, X, 0.3, Z, { cols: [[0.85, 0.75, 0.6]], size: 0.45, speed: 1.6, up: 0.6, life: 0.5, grow: 0.8, alpha: 0.6, grav: 0.3 });
        st.shake = Math.max(st.shake, 0.08);
      } else if (e.t === 'quake') {
        const [X, Z] = worldAt(e.x, e.y, flip);
        for (let i = 0; i < 28; i++) { const a = (i / 28) * 6.283; parts.push({ x: X + Math.cos(a) * 0.4, y: 0.15, z: Z + Math.sin(a) * 0.4, size: 0.5, r: 0.9, g: 0.8, b: 0.65, kind: 0, a: 0.8, life: 0.7, max: 0.7, vx: Math.cos(a) * (e.r || 3) * 1.8, vy: 0.5, vz: Math.sin(a) * (e.r || 3) * 1.8, grav: 0, grow: 1.5 }); }
        st.shake = Math.max(st.shake, 0.9);
      } else if (e.t === 'dash') {
        const a = st.anim[e.i]; if (a && a.pos) emit(7, a.pos[0], 0.25, a.pos[2], { cols: [[0.9, 0.82, 0.68]], size: 0.5, speed: 1.4, up: 0.8, life: 0.6, grow: 1, alpha: 0.65, grav: 0.3 });
      } else if (e.t === 'out') {
        const [X, Z] = worldAt(e.x, e.y, flip);
        emit(18, X, 0.6, Z, { cols: [[1, 1, 1], [1, 0.9, 0.4]], kind: 2, size: 0.5, speed: 4, up: 3, life: 0.8 });
        st.shake = Math.max(st.shake, 0.6); st.cheer = 1;
      } else if (e.t === 'ko') { st.cheer = 1; st.flash = 0.6; }
      else if (e.t === 'special') {
        const [X, Z] = worldAt(e.x, e.y, flip);
        emit(22, X, 1.0, Z, { cols: [[1, 0.9, 0.3], [1, 0.5, 0.8], [0.5, 0.9, 1]], kind: 2, size: 0.5, speed: 3.5, up: 2.5, life: 0.8, grav: -1 });
      } else if (e.t === 'pull') { const [X, Z] = worldAt(e.x, e.y, flip); emit(10, X, 1, Z, { cols: [[1, 0.5, 0.7]], size: 0.3, speed: 2, up: 0.5, life: 0.5 }); }
    }
  }

  // ---- 1 フレーム ----
  const clearCol = [0, 0, 0];
  function render(scene) {
    const t0 = performance.now();
    const dt = Math.min(scene.dt || 0.016, 0.1);
    const time = scene.time || 0;
    const view = scene.view || null;
    if (!st.world) setTheme('park', 5);
    st.shake = Math.max(0, st.shake - dt * 2.2); st.flash = Math.max(0, st.flash - dt * 2); st.cheer = Math.max(0, st.cheer - dt * 0.35);
    updateParts(dt);
    // 連続の演出：突進の土煙・チャージの火花・ふんばりの汗
    if (view && scene.mode !== 'menu') {
      for (let i = 0; i < 2; i++) {
        const f = view.f[i], a = st.anim[i];
        if (!a.pos) continue;
        if (f.dashT > 0 && Math.random() < 0.9) emit(1, a.pos[0], 0.2, a.pos[2], { cols: [[0.9, 0.82, 0.68]], size: 0.45, speed: 0.6, up: 0.5, life: 0.5, grow: 0.9, alpha: 0.55, grav: 0.3 });
        if (f.chargeT > 0.2 && Math.random() < 0.5) emit(1, a.pos[0], 0.9, a.pos[2], { cols: [[1, 0.6, 0.2], [1, 0.9, 0.4]], kind: 2, size: 0.25, speed: 1.6, up: 1.2, life: 0.4, grav: -2 });
        if (!f.out && Math.hypot(f.kx, f.ky) > 5 && Math.random() < 0.5) emit(1, a.pos[0], 0.15, a.pos[2], { cols: [[0.9, 0.82, 0.68]], size: 0.4, speed: 0.4, up: 0.3, life: 0.5, grow: 0.8, alpha: 0.5, grav: 0.2 });
      }
    }
    if (view && st.theme && !scene.mode) { /* 将来：テーマ別の環境粒子 */ }
    const ambient = { snow: st.theme === 'ice', embers: st.theme === 'volcano', steam: st.theme === 'bath' };
    if (ambient.snow && Math.random() < 0.5) parts.push({ x: (Math.random() - 0.5) * 30, y: 9, z: (Math.random() - 0.5) * 20 - 4, size: 0.18, r: 1, g: 1, b: 1, kind: 0, a: 0.9, life: 3.5, max: 3.5, vx: 0.2, vy: -2, vz: 0, grav: 0 });
    if (ambient.embers && Math.random() < 0.6) parts.push({ x: (Math.random() - 0.5) * 30, y: 0, z: (Math.random() - 0.5) * 20 - 6, size: 0.16, r: 1, g: 0.55, b: 0.2, kind: 0, a: 0.9, life: 3, max: 3, vx: 0.3, vy: 2.2, vz: 0, grav: 0 });
    if (ambient.steam && Math.random() < 0.3) parts.push({ x: (Math.random() - 0.5) * 24, y: -0.5, z: -10 - Math.random() * 6, size: 1.6, r: 1, g: 1, b: 1, kind: 0, a: 0.3, life: 3, max: 3, vx: 0, vy: 1.2, vz: 0, grav: 0, grow: 0.5 });

    const cam = updateCamera(view, scene, dt);
    st.VP = cam.VP;
    gl.viewport(0, 0, st.W, st.H);
    const pal = st.pal;
    const bg = hex(pal.skyBot);
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);

    // 空
    gl.useProgram(progs.sky.p);
    const sk = progs.sky.u, top = hex(pal.skyTop), bot = hex(pal.skyBot), sun = hex(pal.sun);
    gl.uniform3f(sk.uTop, top[0], top[1], top[2]); gl.uniform3f(sk.uBot, bot[0], bot[1], bot[2]); gl.uniform3f(sk.uSun, sun[0] * 0.5, sun[1] * 0.5, sun[2] * 0.5);
    gl.uniform1f(sk.uAsp, st.W / st.H); gl.uniform1f(sk.uStars, pal.stars ? 1 : 0); gl.uniform1f(sk.uTime, time);
    gl.disable(gl.DEPTH_TEST); gl.bindVertexArray(null); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.enable(gl.DEPTH_TEST);

    // 共通のライト・霧
    const lc = hex(pal.light), sky = hex(pal.ambS), gnd = hex(pal.ambG), fog = hex(pal.fog);
    const setLit = (P) => {
      const u = P.u;
      gl.useProgram(P.p);
      gl.uniformMatrix4fv(u.uVP, false, st.VP);
      gl.uniform3f(u.uCam, cam.eye[0], cam.eye[1], cam.eye[2]); gl.uniform3f(u.uFogC, fog[0], fog[1], fog[2]); gl.uniform1f(u.uFogD, pal.fd);
      if (u.uLight) gl.uniform3f(u.uLight, lightDir[0], lightDir[1], lightDir[2]);
      if (u.uLCol) gl.uniform3f(u.uLCol, lc[0], lc[1], lc[2]);
      if (u.uSky) gl.uniform3f(u.uSky, sky[0], sky[1], sky[2]);
      if (u.uGnd) gl.uniform3f(u.uGnd, gnd[0], gnd[1], gnd[2]);
    };
    setLit(progs.lit);
    const L = progs.lit.u;
    gl.uniform1f(L.uOutMode, 0); gl.uniform1f(L.uOut, 0); gl.uniform1f(L.uTintA, 0); gl.uniform3f(L.uTint, 1, 1, 1); gl.uniform1f(L.uAlpha, 1); gl.disable(gl.CULL_FACE);
    for (const o of st.world.statics) {
      const c = hex(o.c);
      gl.uniform3f(L.uCol, c[0], c[1], c[2]);
      const e = o.emis || 0; gl.uniform3f(L.uEmis, c[0] * e, c[1] * e, c[2] * e); gl.uniform1f(L.uGloss, o.gloss || 0.1);
      let M = m4.T(o.p[0], o.p[1], o.p[2]);
      if (o.rot) { if (o.rot[1]) M = m4.mul(M, m4.RY(o.rot[1])); if (o.rot[0]) M = m4.mul(M, m4.RX(o.rot[0])); if (o.rot[2]) M = m4.mul(M, m4.RZ(o.rot[2])); }
      drawMesh(progs.lit, o.m, m4.mul(M, m4.S(o.sc[0], o.sc[1], o.sc[2])));
    }
    // 土俵の上面
    setLit(progs.ground);
    const G = progs.ground.u;
    const clay = hex(pal.clay), line = hex(pal.line), outer = hex(pal.side);
    const ringNow = view ? view.ringR : st.R0;
    gl.uniform3f(G.uClay, clay[0], clay[1], clay[2]); gl.uniform3f(G.uLine, line[0], line[1], line[2]); gl.uniform3f(G.uOuter, outer[0], outer[1], outer[2]); gl.uniform3f(G.uDanger, 0.85, 0.25, 0.2);
    gl.uniform1f(G.uRing, ringNow); gl.uniform1f(G.uR0, st.R0); gl.uniform1f(G.uTime, time);
    const topR = st.R0 + 1.6 * 0.94;
    drawMesh(progs.ground, 'd', m4.mul(m4.T(0, 0.012, 0), m4.S(topR, 1, topR)));
    // 観客
    setLit(progs.aud);
    gl.uniformMatrix4fv(progs.aud.u.uVP, false, st.VP);
    gl.uniform1f(progs.aud.u.uTime, time); gl.uniform1f(progs.aud.u.uCheer, clamp(st.cheer + (scene.cheer || 0), 0, 1));
    gl.bindVertexArray(audVao.a); gl.drawElementsInstanced(gl.TRIANGLES, audVao.n, gl.UNSIGNED_SHORT, 0, audN);
    // キャラクター
    if (scene.preview) {
      const pv = scene.preview;
      fighterDraw(progs.lit, { id: pv.id, x: 0, y: 0, vx: 0, vy: 0, kx: 0, ky: 0, ang: 0, z: 0, dashT: 0, chargeT: 0, brace: 0, braceT: 0, stunT: 0, specT: 0, out: 0, big: 1 }, 0, scene, time, dt, cam.eye, null);
    } else if (view) {
      for (let i = 0; i < 2; i++) fighterDraw(progs.lit, view.f[i], i, scene, time, dt, cam.eye, view);
    }
    // 粒子
    drawParts();
    // 全体のフラッシュ（衝突の瞬間）は呼び出し側の HUD で重ねる
    scene.flashLevel = st.flash;
    // 解像度の自動調整（遅い端末では下げる）
    const ms = performance.now() - t0;
    st.msAvg = st.msAvg * 0.95 + ms * 0.05; st.frames++;
    return cam;
  }

  function adapt(frameMs) {
    // フレーム間隔が長い状態が続いたら、描画の解像度を下げる（実測値は stats に出す）
    st.dtAvg = (st.dtAvg || 16) * 0.97 + frameMs * 0.03;
    if (st.frames % 90 === 0 && st.frames > 120) {
      if (st.dtAvg > 24 && st.scale > st.minScale * st.maxScale) { st.scale = Math.max(st.minScale * st.maxScale, st.scale * 0.85); resize(); }
      else if (st.dtAvg < 14 && st.scale < st.maxScale) { st.scale = Math.min(st.maxScale, st.scale * 1.1); resize(); }
    }
  }

  function project(wx, wy, wz) {
    const v = st.VP;
    const x = v[0] * wx + v[4] * wy + v[8] * wz + v[12], y = v[1] * wx + v[5] * wy + v[9] * wz + v[13], w = v[3] * wx + v[7] * wy + v[11] * wz + v[15];
    return { x: (x / w * 0.5 + 0.5), y: (1 - (y / w * 0.5 + 0.5)), w };
  }

  st.scale = 0;
  resize();
  st.scale = st.maxScale;
  resize();
  const api = {
    gl, canvas, st, setTheme, resize, render, consume, adapt, project, toWorld,
    get lost() { return gl.isContextLost(); },
    shake(v) { st.shake = Math.max(st.shake, v); },
    resetAnim() { st.anim = [{ phase: 0, outT: 0 }, { phase: 0, outT: 0 }]; parts.length = 0; st.cam.ready = false; st.flash = 0; },
    stats() { return { scale: st.scale, cpuMs: st.msAvg, dtAvg: st.dtAvg || 0, particles: parts.length, statics: st.world ? st.world.statics.length : 0 }; },
    confetti(n = 60) { for (let i = 0; i < n; i++) emit(1, (Math.random() - 0.5) * 8, 6 + Math.random() * 3, (Math.random() - 0.5) * 5, { cols: [[1, 0.3, 0.4], [1, 0.9, 0.2], [0.3, 0.8, 1], [0.5, 1, 0.4]], kind: 0, size: 0.3, speed: 0.5, up: -1, life: 2.5, grav: -1.5 }); },
  };
  return api;
}
