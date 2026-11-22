// WebGL2 のレンダラー。800 人のランナーを GPU インスタンシングで描く（LOD 3 段階・描画コール合計 約 7 回）。
// アニメーション（走り・転倒・ジャンプなど）は頂点シェーダー。テクスチャなし。外部ライブラリなし。
import { mat4, perspective, lookAt, multiply } from './math.js';
import { buildRunnerLOD, PIVOT } from './model.js';
import { buildWorld } from './world.js';

const ONLY = new URLSearchParams(location.search).get('only');   // 計測用：描画する要素を絞る（例 only=sky,ground）
const want = (k) => !ONLY || ONLY.split(',').includes(k);
const MAX_INST = 1024;
const FLOATS = 16;                       // インスタンス 1 体あたりの float 数
export const LOD_DIST = [18, 45];        // LOD0 〜18m・LOD1 〜45m・LOD2 それ以遠（遠くも 3D のモデルのまま）
const FOG = [0.98, 0.68, 0.48];

const v3 = (a) => `vec3(${a.map((n) => n.toFixed(3)).join(',')})`;
const COMMON = `
uniform vec3 u_eye;
const vec3 FOGC = vec3(${FOG.join(',')});
float fogAmount(float d) { return 1.0 - exp(-d * 0.0045); }
vec3 lightOf(vec3 n) {
  vec3 L = normalize(vec3(0.35, 0.85, -0.45));
  float hemi = n.y * 0.5 + 0.5;
  vec3 amb = mix(vec3(0.46, 0.38, 0.42), vec3(0.80, 0.76, 0.82), hemi);
  return amb + vec3(1.0, 0.9, 0.78) * max(dot(n, L), 0.0) * 0.55;
}
`;

// ---- ランナー（インスタンス）：関節のアニメーションを頂点シェーダーで行う ----
const RUNNER_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_nrm;
layout(location=2) in vec2 a_ps;
layout(location=3) in vec4 i_p;    // x, y(持ち上げ), z, yaw
layout(location=4) in vec4 i_a;    // 走りの位相, 前傾(pitch), 振りの大きさ, 腕上げ
layout(location=5) in vec4 i_b;    // 膝の曲げ(ジャンプ), シャツの色番号, 大きさ, 主人公フラグ
layout(location=6) in vec4 i_c;    // 横倒れ(roll)。転倒で、横向きに倒れる（後ろ上のカメラから見えやすい）
uniform mat4 u_vp;
uniform vec3 u_shirt[7];
${COMMON}
out vec3 v_col;
out float v_fog;
vec3 rotX(vec3 v, float a, vec3 pv) {
  v -= pv; float c = cos(a), s = sin(a);
  return vec3(v.x, c * v.y - s * v.z, s * v.y + c * v.z) + pv;
}
const vec3 HIP_L = ${v3(PIVOT.hipL)}; const vec3 HIP_R = ${v3(PIVOT.hipR)};
const vec3 KNEE_L = ${v3(PIVOT.kneeL)}; const vec3 KNEE_R = ${v3(PIVOT.kneeR)};
const vec3 SHO_L = ${v3(PIVOT.shoulderL)}; const vec3 SHO_R = ${v3(PIVOT.shoulderR)};
const vec3 ELB_L = ${v3(PIVOT.elbowL)}; const vec3 ELB_R = ${v3(PIVOT.elbowR)};
vec3 animate(vec3 p, int part, float w) {
  float ph = i_a.x, amp = i_a.z, up = i_a.w, tuck = i_b.x;
  float sL = sin(ph), sR = sin(ph + 3.14159265);
  float cL = cos(ph), cR = cos(ph + 3.14159265);
  float thL = amp * 0.85 * sL - tuck * 1.1, thR = amp * 0.85 * sR - tuck * 1.1;
  float knL = amp * 1.05 * max(-cL, 0.0) + amp * 0.12 + tuck * 1.6;
  float knR = amp * 1.05 * max(-cR, 0.0) + amp * 0.12 + tuck * 1.6;
  float arL = mix(-amp * 0.75 * sL, -2.6, up), arR = mix(-amp * 0.75 * sR, -2.6, up);
  float elb = mix(-(0.25 + 0.85 * amp), -0.3, up);
  if (part == 7)       p = rotX(p, thL, HIP_L * w);
  else if (part == 8)  p = rotX(p, thR, HIP_R * w);
  else if (part == 9)  { p = rotX(p, knL, KNEE_L * w); p = rotX(p, thL, HIP_L * w); }
  else if (part == 10) { p = rotX(p, knR, KNEE_R * w); p = rotX(p, thR, HIP_R * w); }
  else if (part == 3)  p = rotX(p, arL, SHO_L * w);
  else if (part == 4)  p = rotX(p, arR, SHO_R * w);
  else if (part == 5)  { p = rotX(p, elb, ELB_L * w); p = rotX(p, arL, SHO_L * w); }
  else if (part == 6)  { p = rotX(p, elb, ELB_R * w); p = rotX(p, arR, SHO_R * w); }
  p.y += w * amp * 0.04 * abs(sin(ph));
  p = rotX(p, i_a.y, vec3(0.0));
  p.y += w * 0.14 * sin(i_a.y);
  float cr = cos(i_c.x), sr = sin(i_c.x);                // 横倒れ：足元を軸に、体を横へ倒す
  p = vec3(cr * p.x - sr * p.y, sr * p.x + cr * p.y, p.z);
  p.y += w * 0.13 * abs(sin(i_c.x));
  return p;
}
void main() {
  int part = int(a_ps.x + 0.5);
  int slot = int(a_ps.y + 0.5);
  vec3 p = animate(a_pos, part, 1.0);
  vec3 n = animate(a_nrm, part, 0.0);
  float c = cos(i_p.w), s = sin(i_p.w);
  p = vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c) * i_b.z;
  n = vec3(n.x * c + n.z * s, n.y, -n.x * s + n.z * c);
  vec3 world = vec3(i_p.x, i_p.y, i_p.z) + p;
  vec3 shirt = u_shirt[int(i_b.y + 0.5)];
  bool hero = i_b.w > 0.5;
  vec3 col = vec3(0.95, 0.78, 0.60);                          // 肌
  if (slot == 1) col = shirt;
  else if (slot == 2) col = vec3(0.17, 0.14, 0.31);           // 短パン
  else if (slot == 3) col = vec3(0.93, 0.93, 0.95);           // 靴
  else if (slot == 4) col = vec3(0.17, 0.14, 0.31);           // 髪
  else if (slot == 5) col = hero ? vec3(0.90, 0.15, 0.44) : vec3(0.17, 0.14, 0.31);   // ハチマキ（主人公だけ色つき）
  else if (slot == 6) col = hero ? vec3(1.0) : shirt;         // 胸の帯（主人公だけ白）
  v_col = col * lightOf(normalize(n));
  v_fog = fogAmount(distance(world, u_eye));
  gl_Position = u_vp * vec4(world, 1.0);
}`;

const COLOR_FS = `#version 300 es
precision mediump float;
in vec3 v_col;
in float v_fog;
out vec4 o;
void main() { o = vec4(mix(v_col, vec3(${FOG.join(',')}), v_fog), 1.0); }`;

// ---- 静的な背景（頂点カラー）----
const PROP_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_nrm;
layout(location=2) in vec3 a_col;
uniform mat4 u_vp;
${COMMON}
out vec3 v_col;
out float v_fog;
void main() {
  v_col = a_col * lightOf(a_nrm);
  v_fog = fogAmount(distance(a_pos, u_eye));
  gl_Position = u_vp * vec4(a_pos, 1.0);
}`;

// ---- 地面（模様はシェーダーで描く）----
const GROUND_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_q;
uniform mat4 u_vp;
uniform vec3 u_eye;
out vec3 v_w;
void main() {
  vec3 w = vec3(a_q.x * 260.0, 0.0, u_eye.z - 50.0 + (a_q.y * 0.5 + 0.5) * 420.0);
  v_w = w;
  gl_Position = u_vp * vec4(w, 1.0);
}`;
const GROUND_FS = `#version 300 es
precision highp float;
in vec3 v_w;
uniform vec3 u_eye;
out vec4 o;
float line(float d, float half_) { float f = fwidth(d) * 1.2; return 1.0 - smoothstep(half_, half_ + f, d); }
void main() {
  float x = v_w.x, z = v_w.z, ax = abs(x);
  float band = mod(floor(z / 5.0), 2.0);
  vec3 track = mix(vec3(0.89, 0.55, 0.29), vec3(0.85, 0.48, 0.23), band);
  vec3 grass = mix(vec3(0.30, 0.64, 0.31), vec3(0.26, 0.58, 0.28), mod(floor(z / 8.0), 2.0));
  vec3 apron = vec3(0.70, 0.72, 0.80);
  vec3 col = ax < 15.0 ? track : (ax < 17.5 ? apron : grass);
  float lane = abs(fract((x + 15.0) / 3.75 + 0.5) - 0.5) * 3.75;
  col = mix(col, vec3(1.0), 0.6 * line(lane, 0.05) * step(ax, 14.9));
  col = mix(col, vec3(1.0), line(abs(ax - 15.0), 0.14));
  float startLine = line(abs(z - 0.18), 0.18) * step(ax, 15.0);
  col = mix(col, vec3(1.0), startLine);
  float inGoal = step(100.0, z) * step(z, 101.2) * step(ax, 15.0);
  float chk = mod(floor((x + 15.0) / 1.5) + floor((z - 100.0) / 0.6), 2.0);
  col = mix(col, mix(vec3(1.0), vec3(0.05, 0.1, 0.23), chk), inGoal);
  float d = distance(v_w, u_eye);
  float f = 1.0 - exp(-d * 0.0045);
  o = vec4(mix(col, vec3(${FOG.join(',')}), f), 1.0);
}`;

// ---- 空（全画面 1 枚）----
const SKY_VS = `#version 300 es
precision highp float;
out vec2 v_ndc;
void main() {
  vec2 p = vec2((gl_VertexID == 1) ? 3.0 : -1.0, (gl_VertexID == 2) ? 3.0 : -1.0);
  v_ndc = p;
  gl_Position = vec4(p, 1.0, 1.0);
}`;
const SKY_FS = `#version 300 es
precision highp float;
in vec2 v_ndc;
uniform vec3 u_f, u_r, u_u;
uniform vec2 u_k;   // tan(fov/2)*aspect, tan(fov/2)
out vec4 o;
void main() {
  vec3 ray = normalize(u_f + v_ndc.x * u_k.x * u_r + v_ndc.y * u_k.y * u_u);
  float h = clamp(ray.y, -0.2, 1.0);
  vec3 horizon = vec3(${FOG.join(',')});
  vec3 mid = vec3(0.90, 0.15, 0.44);
  vec3 top = vec3(0.05, 0.11, 0.23);
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, h));
  col = mix(col, top, smoothstep(0.18, 0.75, h));
  vec3 sunDir = normalize(vec3(0.0, 0.10, 1.0));
  float sd = dot(ray, sunDir);
  col += vec3(1.0, 0.85, 0.45) * smoothstep(0.9985, 0.9993, sd);
  col += vec3(1.0, 0.55, 0.25) * pow(max(sd, 0.0), 24.0) * 0.5;
  o = vec4(col, 1.0);
}`;

// ---- 影と足元の輪（インスタンスの四角）----
const SHADOW_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_q;
layout(location=1) in vec4 i_s;   // x, z, 半径, モード(0=影・1=主人公の輪)
uniform mat4 u_vp;
out vec2 v_q;
flat out float v_mode;
void main() {
  v_q = a_q; v_mode = i_s.w;
  gl_Position = u_vp * vec4(i_s.x + a_q.x * i_s.z, 0.03, i_s.y + a_q.y * i_s.z, 1.0);
}`;
const SHADOW_FS = `#version 300 es
precision mediump float;
in vec2 v_q;
flat in float v_mode;
out vec4 o;
void main() {
  float d = length(v_q);
  if (v_mode < 0.5) o = vec4(0.12, 0.08, 0.2, 0.36 * (1.0 - smoothstep(0.5, 1.0, d)));
  else if (v_mode < 1.5) o = vec4(0.15, 0.66, 1.0, smoothstep(0.62, 0.7, d) * (1.0 - smoothstep(0.86, 0.94, d)));
  else o = vec4(1.0, 0.22, 0.25, 0.55 * smoothstep(0.7, 0.78, d) * (1.0 - smoothstep(0.9, 0.97, d)) + 0.16 * (1.0 - smoothstep(0.0, 0.7, d)));
}`;

function program(gl, vs, fs, label) {
  const mk = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(label + ' シェーダーのコンパイルに失敗：' + gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(label + ' のリンクに失敗：' + gl.getProgramInfoLog(p));
  return p;
}

export function createRenderer(gl) {
  let gpuBytes = 0;
  const buf = (target, data, usage) => {
    const b = gl.createBuffer();
    gl.bindBuffer(target, b);
    gl.bufferData(target, data, usage);
    gpuBytes += data.byteLength;
    return b;
  };
  const progRunner = program(gl, RUNNER_VS, COLOR_FS, 'ランナー');
  const progProp = program(gl, PROP_VS, COLOR_FS, '背景');
  const progGround = program(gl, GROUND_VS, GROUND_FS, '地面');
  const progSky = program(gl, SKY_VS, SKY_FS, '空');
  const progShadow = program(gl, SHADOW_VS, SHADOW_FS, '影');
  const loc = (p, n) => gl.getUniformLocation(p, n);
  const U = {
    rVP: loc(progRunner, 'u_vp'), rEye: loc(progRunner, 'u_eye'), rShirt: loc(progRunner, 'u_shirt'),
    pVP: loc(progProp, 'u_vp'), pEye: loc(progProp, 'u_eye'),
    gVP: loc(progGround, 'u_vp'), gEye: loc(progGround, 'u_eye'),
    sF: loc(progSky, 'u_f'), sR: loc(progSky, 'u_r'), sU: loc(progSky, 'u_u'), sK: loc(progSky, 'u_k'),
    shVP: loc(progShadow, 'u_vp'),
  };

  // ランナーのメッシュ（LOD 別）とインスタンスのバッファ（起動時に 1 度だけ確保して、毎フレーム再利用）
  const lods = [0, 1, 2].map((level) => {
    const mesh = buildRunnerLOD(level);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    buf(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
    buf(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    const arr = new Float32Array(MAX_INST * FLOATS);
    const ib = buf(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW);
    for (let k = 0; k < 4; k++) {
      gl.enableVertexAttribArray(3 + k);
      gl.vertexAttribPointer(3 + k, 4, gl.FLOAT, false, FLOATS * 4, k * 16);
      gl.vertexAttribDivisor(3 + k, 1);
    }
    return { vao, ib, arr, n: 0, count: mesh.indices.length, tris: mesh.triangles };
  });

  // 影・輪
  const shVAO = gl.createVertexArray();
  gl.bindVertexArray(shVAO);
  buf(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
  const shArr = new Float32Array((MAX_INST + 64) * 4);
  const shBuf = buf(gl.ARRAY_BUFFER, shArr, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 16, 0); gl.vertexAttribDivisor(1, 1);
  let shN = 0;

  // 静的な背景
  const world = buildWorld();
  const propVAO = gl.createVertexArray();
  gl.bindVertexArray(propVAO);
  buf(gl.ARRAY_BUFFER, world.vertices, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 36, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 36, 24);
  buf(gl.ELEMENT_ARRAY_BUFFER, world.indices, gl.STATIC_DRAW);

  // 地面
  const gVAO = gl.createVertexArray();
  gl.bindVertexArray(gVAO);
  buf(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
  const emptyVAO = gl.createVertexArray();
  gl.bindVertexArray(null);

  // GPU 時間（Chrome の拡張。iOS Safari には無いので、iPhone では null）
  const timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const queries = [];
  const gpuTimes = [];

  const proj = mat4(), view = mat4(), vp = mat4();
  const cam = { x: 0, y: 0, z: 0, f: [0, 0, 1], r: [1, 0, 0], u: [0, 1, 0], tan: 0.6, aspect: 1 };
  const shirts = new Float32Array([
    1.0, 0.42, 0.42, 0.30, 0.67, 0.97, 1.0, 0.83, 0.23, 0.32, 0.81, 0.40, 0.80, 0.36, 0.91, 1.0, 0.57, 0.17, 1.0, 0.48, 0.18,
  ]);

  const stats = { drawCalls: 0, triangles: 0, instances: [0, 0, 0], culled: 0, submitted: 0, gpuBytes: () => gpuBytes, gpuMs: null, worldTriangles: world.triangles, lodTriangles: lods.map((l) => l.tris) };

  const api = {
    stats,
    gpuTimerSupported: !!timerExt,
    resize(w, h) { gl.viewport(0, 0, w, h); },
    setCamera(ex, ey, ez, tx, ty, tz, fovDeg, aspect) {
      const fov = (fovDeg * Math.PI) / 180;
      perspective(proj, fov, aspect, 0.3, 420);
      lookAt(view, ex, ey, ez, tx, ty, tz);
      multiply(vp, proj, view);
      cam.x = ex; cam.y = ey; cam.z = ez; cam.tan = Math.tan(fov / 2); cam.aspect = aspect;
      let fx = tx - ex, fy = ty - ey, fz = tz - ez;
      const l = Math.hypot(fx, fy, fz) || 1; fx /= l; fy /= l; fz /= l;
      let rx = fz, rz = -fx;                       // right = up × forward（左手系）
      const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
      cam.f = [fx, fy, fz]; cam.r = [rx, 0, rz];
      cam.u = [fy * rz, fz * rx - fx * rz, -fy * rx];
    },
    // ワールドの点を、論理座標（480×720）へ。HUD の目印用。画面の外・カメラの後ろは null
    project(x, y, z, W, H) {
      const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12], cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13], cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
      if (cw < 0.2) return null;
      return [(cx / cw * 0.5 + 0.5) * W, (1 - (cy / cw * 0.5 + 0.5)) * H];
    },
    begin() {
      for (const l of lods) l.n = 0;
      shN = 0;
      stats.culled = 0; stats.submitted = 0;
    },
    // ランナー 1 人を登録：視錐台の外は除外し、距離で LOD を決めて、その LOD のバッファへ書く
    runner(x, y, z, yaw, phase, pitch, amp, up, tuck, shirt, scale, hero, roll = 0) {
      const cx = vp[0] * x + vp[4] * (y + 0.9) + vp[8] * z + vp[12];
      const cy = vp[1] * x + vp[5] * (y + 0.9) + vp[9] * z + vp[13];
      const cw = vp[3] * x + vp[7] * (y + 0.9) + vp[11] * z + vp[15];
      const mx = 1.3 * Math.abs(vp[0]), my = 1.3 * Math.abs(vp[5]);
      if (cw < 0.25 || cx > cw + mx || cx < -cw - mx || cy > cw + my || cy < -cw - my) { stats.culled += 1; return; }
      const dx = x - cam.x, dz = z - cam.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      const l = d < LOD_DIST[0] ? lods[0] : d < LOD_DIST[1] ? lods[1] : lods[2];
      if (l.n >= MAX_INST) return;
      const o = l.n * FLOATS, a = l.arr;
      a[o] = x; a[o + 1] = y; a[o + 2] = z; a[o + 3] = yaw;
      a[o + 4] = phase; a[o + 5] = pitch; a[o + 6] = amp; a[o + 7] = up;
      a[o + 8] = tuck; a[o + 9] = shirt; a[o + 10] = scale; a[o + 11] = hero;
      a[o + 12] = roll; a[o + 13] = 0; a[o + 14] = 0; a[o + 15] = 0;
      l.n += 1;
      stats.submitted += 1;
      if (shN < MAX_INST) { const s = shN * 4; shArr[s] = x; shArr[s + 1] = z; shArr[s + 2] = 0.5 * scale; shArr[s + 3] = 0; shN += 1; }
    },
    // 輪：mode 1＝主人公の青い輪、mode 2＝転んだ人の危険ゾーン（赤）
    ring(x, z, r, mode = 1) { if (shN < MAX_INST + 64) { const s = shN * 4; shArr[s] = x; shArr[s + 1] = z; shArr[s + 2] = r; shArr[s + 3] = mode; shN += 1; } },
    draw() {
      collectGpu();
      let q = null;
      if (timerExt && queries.filter((e) => !e.done).length < 3) {
        q = gl.createQuery();
        gl.beginQuery(timerExt.TIME_ELAPSED_EXT, q);
      }
      stats.drawCalls = 0; stats.triangles = 0;
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
      gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.frontFace(gl.CW);
      gl.disable(gl.BLEND);
      gl.clearColor(FOG[0], FOG[1], FOG[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      // 空（奥）
      gl.disable(gl.CULL_FACE); gl.depthMask(false);
      gl.useProgram(progSky); gl.bindVertexArray(emptyVAO);
      gl.uniform3fv(U.sF, cam.f); gl.uniform3fv(U.sR, cam.r); gl.uniform3fv(U.sU, cam.u); gl.uniform2f(U.sK, cam.tan * cam.aspect, cam.tan);
      if (want('sky')) { gl.drawArrays(gl.TRIANGLES, 0, 3); stats.drawCalls += 1; stats.triangles += 1; }
      gl.depthMask(true);
      // 地面
      gl.useProgram(progGround); gl.bindVertexArray(gVAO);
      gl.uniformMatrix4fv(U.gVP, false, vp); gl.uniform3f(U.gEye, cam.x, cam.y, cam.z);
      if (want('ground')) { gl.drawArrays(gl.TRIANGLES, 0, 6); stats.drawCalls += 1; stats.triangles += 2; }
      // 背景（柵・観客席・ゴール・ビル）
      gl.enable(gl.CULL_FACE);
      gl.useProgram(progProp); gl.bindVertexArray(propVAO);
      gl.uniformMatrix4fv(U.pVP, false, vp); gl.uniform3f(U.pEye, cam.x, cam.y, cam.z);
      if (want('props')) { gl.drawElements(gl.TRIANGLES, world.indices.length, gl.UNSIGNED_INT, 0); stats.drawCalls += 1; stats.triangles += world.triangles; }
      // 影と輪（地面の上。奥行きは書かない）
      if (shN > 0 && want('shadow')) {
        gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
        gl.useProgram(progShadow); gl.bindVertexArray(shVAO);
        gl.uniformMatrix4fv(U.shVP, false, vp);
        gl.bindBuffer(gl.ARRAY_BUFFER, shBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, shArr, 0, shN * 4);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, shN); stats.drawCalls += 1; stats.triangles += 2 * shN;
        gl.disable(gl.BLEND); gl.depthMask(true); gl.enable(gl.CULL_FACE);
      }
      // ランナー（LOD ごとに 1 回）
      gl.useProgram(progRunner);
      gl.uniformMatrix4fv(U.rVP, false, vp); gl.uniform3f(U.rEye, cam.x, cam.y, cam.z); gl.uniform3fv(U.rShirt, shirts);
      for (let k = 0; k < 3; k++) {
        const l = lods[k];
        stats.instances[k] = l.n;
        if (!l.n || !want('runner')) continue;
        gl.bindVertexArray(l.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, l.ib);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, l.arr, 0, l.n * FLOATS);
        gl.drawElementsInstanced(gl.TRIANGLES, l.count, gl.UNSIGNED_SHORT, 0, l.n);
        stats.drawCalls += 1; stats.triangles += l.tris * l.n;
      }
      gl.bindVertexArray(null);
      if (q) { gl.endQuery(timerExt.TIME_ELAPSED_EXT); queries.push({ q, done: false }); }
    },
  };

  function collectGpu() {
    if (!timerExt) return;
    const disjoint = gl.getParameter(timerExt.GPU_DISJOINT_EXT);
    for (const e of queries) {
      if (e.done) continue;
      if (gl.getQueryParameter(e.q, gl.QUERY_RESULT_AVAILABLE)) {
        if (!disjoint) { const ms = gl.getQueryParameter(e.q, gl.QUERY_RESULT) / 1e6; gpuTimes.push(ms); if (gpuTimes.length > 300) gpuTimes.shift(); stats.gpuMs = gpuTimes.reduce((a, b) => a + b, 0) / gpuTimes.length; }
        gl.deleteQuery(e.q); e.done = true;
      }
    }
    while (queries.length && queries[0].done) queries.shift();
  }
  api.gpuTimes = gpuTimes;
  return api;
}
