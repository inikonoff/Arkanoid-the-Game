// Окружение локации: небо, свет, земля, рамка поля и декорации.
import * as THREE from 'three';
import { settings } from './settings.js';
import { mat, glow } from './mat.js';
import { groundTexture, floorTexture, floorEmissive, windowTexture, noise, fbm } from './textures.js';

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = /* glsl */`
uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 bottom;
uniform vec3 sunDir; uniform vec3 sunColor; uniform float stars; uniform float time; uniform float aurora;
varying vec3 vDir;
float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col;
  if (h > 0.22) col = mix(mid, top, smoothstep(0.22, 0.85, h));
  else if (h > 0.0) col = mix(horizon, mid, smoothstep(0.0, 0.22, h));
  else col = mix(horizon, bottom, smoothstep(0.0, -0.25, h));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  col += sunColor * (pow(s, 600.0) * 6.0 + pow(s, 24.0) * 0.35 + pow(s, 4.0) * 0.08);
  if (stars > 0.0) {
    vec3 p = floor(d * 260.0);
    float r = hash(p);
    float st = step(0.9965, r) * (0.55 + 0.45 * sin(time * 1.7 + r * 90.0));
    col += vec3(st) * stars * smoothstep(-0.05, 0.25, h) * (0.6 + 0.4 * hash(p + 3.0));
  }
  if (aurora > 0.0) {
    float a = sin(d.x * 6.0 + time * 0.3) * 0.5 + sin(d.x * 13.0 - time * 0.5 + d.z * 4.0) * 0.25;
    float band = smoothstep(0.25, 0.0, abs(h - 0.35 - a * 0.08));
    col += mix(vec3(0.2, 1.0, 0.55), vec3(0.8, 0.3, 1.0), smoothstep(-0.5, 0.5, a)) * band * aurora * (0.5 + 0.5 * sin(d.x * 30.0 + time));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function nebulaTexture(c1, c2) {
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const img = g.createImageData(S, S);
  const A = new THREE.Color(c1), B = new THREE.Color(c2);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const d = Math.hypot(u - 0.5, v - 0.5) * 2;
    const f = fbm(noise, u * 4 + 11, v * 4 + 3, 5);
    const a = Math.max(0, f - 0.35) * 1.8 * Math.max(0, 1 - d);
    const t = fbm(noise, u * 3, v * 3, 3);
    const i = (y * S + x) * 4;
    img.data[i] = (A.r + (B.r - A.r) * t) * 255;
    img.data[i + 1] = (A.g + (B.g - A.g) * t) * 255;
    img.data[i + 2] = (A.b + (B.b - A.b) * t) * 255;
    img.data[i + 3] = Math.min(255, a * 255);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Расставляет N инстансов по кольцу вокруг поля
function scatter(count, field, rMin, rMax, rnd, fn) {
  const cx = 0, cz = (field.zTop + field.zBottom) / 2;
  const hw = field.W / 2 + 2, hd = (field.zBottom - field.zTop) / 2 + 2;
  const out = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 20) {
    const a = rnd() * Math.PI * 2;
    const r = rMin + rnd() * (rMax - rMin);
    const x = cx + Math.cos(a) * r * (1 + hw / 20), z = cz + Math.sin(a) * r * (1 + hd / 30);
    if (Math.abs(x - cx) < hw + 1 && Math.abs(z - cz) < hd + 6) continue;
    out.push(fn(x, z, rnd));
  }
  return out;
}

function instanced(geo, material, items, { cast = false, colors = false } = {}) {
  const m = new THREE.InstancedMesh(geo, material, Math.max(1, items.length));
  const o = new THREE.Object3D();
  items.forEach((it, i) => {
    o.position.set(it.x, it.y ?? 0, it.z);
    o.rotation.set(it.rx ?? 0, it.ry ?? 0, it.rz ?? 0);
    const s = it.s ?? 1;
    o.scale.set(it.sx ?? s, it.sy ?? s, it.sz ?? s);
    o.updateMatrix();
    m.setMatrixAt(i, o.matrix);
    if (colors && it.color) m.setColorAt(i, it.color);
  });
  m.count = items.length;
  m.castShadow = cast && settings.shadows > 1;
  m.receiveShadow = false;
  return m;
}

export class Environment {
  constructor(scene, loc, field) {
    this.scene = scene;
    this.loc = loc;
    this.field = field;
    this.group = new THREE.Group();
    this.updaters = [];
    scene.add(this.group);
    this.buildSky();
    this.buildLights();
    this.buildGround();
    this.buildField();
    if (settings.envDetail > 0) this.buildProps();
  }

  buildSky() {
    const L = this.loc;
    const space = L.id === 'orbit' || L.id === 'void' || L.id === 'city';
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(L.sky.top) }, mid: { value: new THREE.Color(L.sky.mid) },
        horizon: { value: new THREE.Color(L.sky.horizon) }, bottom: { value: new THREE.Color(L.sky.bottom) },
        sunDir: { value: new THREE.Vector3(...L.sun.dir).multiplyScalar(-1).setY(Math.abs(L.sun.dir[1]) * 0.35 + 0.05) },
        sunColor: { value: new THREE.Color(L.sun.color).multiplyScalar(L.id === 'ocean' ? 0.4 : 1) },
        stars: { value: space ? (L.id === 'city' ? 0.35 : 1.2) : 0 },
        aurora: { value: L.id === 'void' ? 1 : L.id === 'arctic' ? 0.25 : 0 },
        time: { value: 0 },
      },
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), this.skyMat);
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    this.group.add(sky);
    this.updaters.push((t) => { this.skyMat.uniforms.time.value = t; });

    if (L.fog) {
      const k = Math.max(1, this.field.W / 18);
      this.scene.fog = new THREE.Fog(L.fog.color, L.fog.near * k, L.fog.far * k);
      this.baseFog = { near: L.fog.near * k, far: L.fog.far * k };
    } else {
      this.scene.fog = null;
    }

    if ((L.id === 'orbit' || L.id === 'void') && settings.envDetail > 0) {
      const cols = L.id === 'orbit' ? ['#3a1c71', '#d76d77'] : ['#0b6e4f', '#7b2cbf'];
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(260, 260),
          new THREE.MeshBasicMaterial({ map: nebulaTexture(cols[0], cols[1]), transparent: true, depthWrite: false,
            blending: THREE.AdditiveBlending, opacity: 0.55, fog: false }));
        const a = -Math.PI / 2 + (i - 1) * 0.9;
        m.position.set(Math.cos(a) * 380, 60 + i * 40, Math.sin(a) * 380);
        m.lookAt(0, 0, 0);
        m.rotation.z = i;
        this.group.add(m);
      }
    }
  }

  buildLights() {
    const L = this.loc, f = this.field;
    const hemi = new THREE.HemisphereLight(L.hemi.sky, L.hemi.ground, L.hemi.intensity * (settings.materials === 'pbr' ? 0.55 : 1.5));
    this.group.add(hemi);
    const sun = new THREE.DirectionalLight(L.sun.color, L.sun.intensity * (settings.materials === 'pbr' ? 0.8 : 1));
    const cz = (f.zTop + f.zBottom) / 2;
    const d = new THREE.Vector3(...L.sun.dir).normalize();
    const R = Math.max(f.W, f.zBottom - f.zTop) * 0.62 + 2;
    sun.position.set(-d.x * 60, Math.abs(d.y) * 60 + 20, cz - d.z * 60);
    sun.target.position.set(0, 0, cz);
    if (settings.shadows > 0) {
      sun.castShadow = true;
      const ms = [0, 512, 1024, 2048][settings.shadows];
      sun.shadow.mapSize.set(ms, ms);
      const c = sun.shadow.camera;
      c.left = -R; c.right = R; c.top = R; c.bottom = -R; c.near = 1; c.far = 200;
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.03;
    }
    this.group.add(sun, sun.target);
    this.sun = sun;
    this.hemi = hemi;
    this.sunBase = L.sun.intensity;
    this.hemiBase = hemi.intensity;
    // небольшой заполняющий свет со стороны камеры, чтобы кирпичи читались
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(0, 20, f.zBottom + 30);
    fill.target.position.set(0, 0, cz);
    this.group.add(fill, fill.target);
  }

  buildGround() {
    const L = this.loc, f = this.field;
    if (L.ground === 'none') {
      // планета под платформой
      const pg = new THREE.SphereGeometry(140, 48, 32);
      const pm = mat({ color: '#2d4a7a', roughness: 0.9, emissive: '#0a1430', emissiveIntensity: 0.6,
        map: groundTexture('seabed', ['#1d3b6a', '#c97b4a']) });
      pm.map.repeat.set(3, 2);
      const planet = new THREE.Mesh(pg, pm);
      planet.position.set(90, -190, -160);
      this.group.add(planet);
      const ring = new THREE.Mesh(new THREE.RingGeometry(170, 230, 96),
        new THREE.MeshBasicMaterial({ color: '#c9a77c', side: THREE.DoubleSide, transparent: true, opacity: 0.35, fog: false }));
      ring.position.copy(planet.position);
      ring.rotation.set(-1.2, 0.3, 0);
      this.group.add(ring);
      this.updaters.push((t) => { planet.rotation.y = t * 0.01; });
      return;
    }
    const palettes = {
      sand: ['#a8743f', '#c99a62'], grass: ['#1f3d18', '#3f6a26'], snow: ['#9fb2c0', '#d6e2ea'],
      basalt: ['#120c0b', '#ff6a1a'], seabed: ['#1b3a38', '#6f8f72'], asphalt: ['#0b0b0e', '#3a3a44'],
      void: ['#05030a', '#1a1030'],
    };
    const segs = settings.envDetail >= 2 ? 96 : 32;
    const geo = new THREE.PlaneGeometry(900, 900, segs, segs);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const hw = f.W / 2 + 6, cz = (f.zTop + f.zBottom) / 2, hd = (f.zBottom - f.zTop) / 2 + 8;
    const amp = { sand: 9, grass: 3, snow: 6, basalt: 5, seabed: 4, asphalt: 0, void: 0 }[L.ground] ?? 2;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const dx = Math.max(0, Math.abs(x) - hw), dz = Math.max(0, Math.abs(z - cz) - hd);
      const away = Math.min(1, Math.hypot(dx, dz) / 40);
      let h = 0;
      if (L.ground === 'sand') h = (Math.sin(x * 0.035 + Math.sin(z * 0.02) * 2) * 0.5 + 0.5) * amp + fbm(noise, x * 0.02, z * 0.02) * amp;
      else h = fbm(noise, x * 0.015 + 5, z * 0.015) * amp * 1.6;
      pos.setY(i, -0.7 + h * away * away);
    }
    geo.computeVertexNormals();
    const map = groundTexture(L.ground, palettes[L.ground] || ['#222', '#444']);
    const gm = mat({
      color: '#ffffff', map, roughness: L.ground === 'snow' ? 0.6 : 0.95, metalness: 0,
      emissive: L.ground === 'basalt' ? '#ff4a10' : L.ground === 'void' ? '#22104a' : '#000000',
      emissiveMap: L.ground === 'basalt' || L.ground === 'void' ? map : null,
      emissiveIntensity: L.ground === 'basalt' ? 0.75 : 0.4,
    });
    const ground = new THREE.Mesh(geo, gm);
    ground.receiveShadow = settings.shadows > 0;
    this.group.add(ground);
  }

  buildField() {
    const L = this.loc, f = this.field;
    const W = f.W, D = f.zBottom - f.zTop, cz = (f.zTop + f.zBottom) / 2;
    const floorD = D + 4;
    const map = floorTexture(L.accent);
    map.repeat.set(W / 6, floorD / 6);
    const em = floorEmissive(L.accent);
    em.repeat.set(W / 6, floorD / 6);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.6, floorD),
      mat({ color: L.floor, map, roughness: 0.38, metalness: 0.55, emissive: '#ffffff', emissiveMap: em, emissiveIntensity: 0.6 }));
    floor.position.set(0, -0.3, cz + 1.5);
    floor.receiveShadow = settings.shadows > 0;
    this.group.add(floor);

    // рамка
    const railMat = mat({ color: '#2a2b30', roughness: 0.35, metalness: 0.85 });
    const stripMat = glow(L.accent, 1.8);
    const railH = 0.9, railT = 0.5;
    const mk = (w, d, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, railH, d), railMat);
      m.position.set(x, railH / 2 - 0.05, z);
      m.castShadow = settings.shadows > 1;
      m.receiveShadow = settings.shadows > 0;
      this.group.add(m);
      return m;
    };
    mk(railT, floorD + 0.5, -W / 2 - railT / 2, cz + 1.5);
    mk(railT, floorD + 0.5, W / 2 + railT / 2, cz + 1.5);
    mk(W + railT * 2, railT, 0, f.zTop - railT / 2);
    const sGeoV = new THREE.BoxGeometry(0.08, 0.08, floorD + 0.3);
    const sl = new THREE.Mesh(sGeoV, stripMat); sl.position.set(-W / 2 + 0.02, railH - 0.1, cz + 1.5);
    const sr = sl.clone(); sr.position.x = W / 2 - 0.02;
    const st = new THREE.Mesh(new THREE.BoxGeometry(W, 0.08, 0.08), stripMat); st.position.set(0, railH - 0.1, f.zTop + 0.02);
    this.group.add(sl, sr, st);
    // опасная зона у нижнего края
    const danger = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.12), glow('#ff3b2f', 1.2, { transparent: true, opacity: 0.5 }));
    danger.rotation.x = -Math.PI / 2;
    danger.position.set(0, 0.02, f.zBottom + 0.6);
    this.group.add(danger);
    this.stripMat = stripMat;
  }

  buildProps() {
    const L = this.loc, f = this.field;
    const k = settings.envDetail >= 2 ? 1 : 0.45;
    let seed = 1234;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const add = (m) => { this.group.add(m); return m; };
    const n = (c) => Math.max(1, Math.round(c * k));

    switch (L.id) {
      case 'desert': {
        const pyr = scatter(n(5), f, 70, 140, rnd, (x, z) => ({ x, z, y: -1, s: 14 + rnd() * 18, ry: rnd() }));
        add(instanced(new THREE.ConeGeometry(1, 0.9, 4, 1), mat({ color: '#d9a35e', roughness: 0.9, flatShading: true }),
          pyr.map((p) => ({ ...p, sy: p.s * 0.9, y: p.s * 0.4 - 1 })), { cast: false }));
        const cac = scatter(n(40), f, 14, 60, rnd, (x, z) => ({ x, z, y: 0.8, s: 0.6 + rnd() * 0.7, ry: rnd() * 6 }));
        add(instanced(new THREE.CapsuleGeometry(0.35, 2.2, 3, 8), mat({ color: '#4f7a3a', roughness: 0.8 }),
          cac.map((c) => ({ ...c, y: c.s * 1.3 })), { cast: true }));
        const arms = cac.map((c, i) => ({ x: c.x + (i % 2 ? 0.5 : -0.5) * c.s, z: c.z, y: c.s * 1.8, s: c.s * 0.6, rz: (i % 2 ? -0.3 : 0.3) }));
        add(instanced(new THREE.CapsuleGeometry(0.28, 1.1, 3, 6), mat({ color: '#4f7a3a', roughness: 0.8 }), arms));
        const rocks = scatter(n(30), f, 12, 70, rnd, (x, z) => ({ x, z, y: 0, s: 0.6 + rnd() * 2.4, rx: rnd() * 3, ry: rnd() * 3 }));
        add(instanced(new THREE.DodecahedronGeometry(1, 0), mat({ color: '#a2643a', roughness: 1, flatShading: true }), rocks));
        break;
      }
      case 'jungle': {
        const trees = scatter(n(70), f, 12, 75, rnd, (x, z) => ({ x, z, s: 0.8 + rnd() * 1.4, ry: rnd() * 6 }));
        add(instanced(new THREE.CylinderGeometry(0.25, 0.45, 6, 6), mat({ color: '#4a3424', roughness: 1 }),
          trees.map((t) => ({ ...t, y: 3 * t.s, sy: t.s }))));
        const cols = ['#2f6b2a', '#3e8a35', '#25561f', '#5a9a3a'].map((c) => new THREE.Color(c));
        add(instanced(new THREE.IcosahedronGeometry(2.4, 0), mat({ color: '#ffffff', roughness: 0.9, flatShading: true }),
          trees.map((t, i) => ({ ...t, y: 6.2 * t.s, sy: t.s * 0.75, color: cols[i % 4] })), { cast: true, colors: true }));
        const ruins = scatter(n(12), f, 14, 40, rnd, (x, z) => ({ x, z, s: 1, sy: 1 + rnd() * 3, ry: rnd() }));
        add(instanced(new THREE.BoxGeometry(1.4, 3, 1.4), mat({ color: '#7d7b6a', roughness: 1 }), ruins.map((r) => ({ ...r, y: r.sy * 1.5 - 0.6 }))));
        break;
      }
      case 'arctic': {
        const ice = mat({ color: '#a9dcf5', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.85 });
        const sp = scatter(n(60), f, 12, 70, rnd, (x, z) => ({ x, z, s: 0.8 + rnd() * 2.2, rx: (rnd() - 0.5) * 0.4, rz: (rnd() - 0.5) * 0.4 }));
        add(instanced(new THREE.ConeGeometry(0.8, 5, 5), ice, sp.map((s) => ({ ...s, y: 2 * s.s, sy: s.s * (1 + rnd()) }))));
        const mts = scatter(n(8), f, 110, 170, rnd, (x, z) => ({ x, z, s: 30 + rnd() * 30, ry: rnd() }));
        add(instanced(new THREE.ConeGeometry(1, 1.1, 6), mat({ color: '#e8f1f6', roughness: 0.7, flatShading: true }),
          mts.map((m) => ({ ...m, y: m.s * 0.5 - 2 }))));
        break;
      }
      case 'volcano': {
        const rocks = scatter(n(50), f, 12, 70, rnd, (x, z) => ({ x, z, y: 0, s: 0.6 + rnd() * 2.5, rx: rnd() * 3, ry: rnd() * 3 }));
        add(instanced(new THREE.DodecahedronGeometry(1, 0), mat({ color: '#1e1614', roughness: 0.9, flatShading: true }), rocks, { cast: true }));
        const pools = scatter(n(14), f, 14, 50, rnd, (x, z) => ({ x, z, y: -0.55, s: 1.5 + rnd() * 3, rx: -Math.PI / 2 }));
        const lavaMat = glow('#ff5a14', 2.2);
        add(instanced(new THREE.CircleGeometry(1, 16), lavaMat, pools));
        const cone = new THREE.Mesh(new THREE.ConeGeometry(60, 50, 24, 1, true), mat({ color: '#1a1110', roughness: 1, flatShading: true }));
        cone.position.set(-40, 18, -180);
        add(cone);
        const crater = new THREE.Mesh(new THREE.CircleGeometry(9, 24), glow('#ff6a1a', 3));
        crater.rotation.x = -Math.PI / 2;
        crater.position.set(-40, 42.5, -180);
        add(crater);
        this.updaters.push((t) => { lavaMat.color.setRGB(2.2, 0.55 + Math.sin(t * 2) * 0.15, 0.12); });
        break;
      }
      case 'ocean': {
        const kelp = scatter(n(60), f, 11, 50, rnd, (x, z) => ({ x, z, s: 0.7 + rnd() * 1.5, ph: rnd() * 6 }));
        const km = instanced(new THREE.BoxGeometry(0.25, 8, 0.08).translate(0, 4, 0), mat({ color: '#2f7a46', roughness: 0.8, side: THREE.DoubleSide }),
          kelp.map((kk) => ({ ...kk, y: -0.6, sy: kk.s })));
        add(km);
        const o = new THREE.Object3D();
        this.updaters.push((t) => {
          kelp.forEach((kk, i) => {
            o.position.set(kk.x, -0.6, kk.z);
            o.rotation.set(Math.sin(t * 0.9 + kk.ph) * 0.18, kk.ph, Math.cos(t * 0.7 + kk.ph) * 0.12);
            o.scale.set(kk.s, kk.s, kk.s);
            o.updateMatrix();
            km.setMatrixAt(i, o.matrix);
          });
          km.instanceMatrix.needsUpdate = true;
        });
        const corals = ['#ff6f91', '#ffc75f', '#f9f871', '#ff9671', '#d65db1'].map((c) => new THREE.Color(c));
        const cr = scatter(n(50), f, 11, 45, rnd, (x, z) => ({ x, z, y: 0, s: 0.3 + rnd() * 0.8, ry: rnd() * 3, color: corals[Math.floor(rnd() * 5)] }));
        add(instanced(new THREE.IcosahedronGeometry(1, 0), mat({ color: '#ffffff', roughness: 0.6, flatShading: true }), cr, { colors: true }));
        // световые лучи
        const shaftMat = new THREE.MeshBasicMaterial({ color: '#7fe8ff', transparent: true, opacity: 0.025, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        for (let i = 0; i < n(8); i++) {
          const s = new THREE.Mesh(new THREE.PlaneGeometry(1.5 + rnd() * 3, 80), shaftMat);
          s.position.set((rnd() - 0.5) * f.W * 2.5, 30, (f.zTop + f.zBottom) / 2 + (rnd() - 0.5) * 50);
          s.rotation.set(0, rnd() * 3, 0.3);
          add(s);
        }
        break;
      }
      case 'city': {
        const lit = [['#ffd38a', '#ff2e63'], ['#9ad8ff', '#20e3b2']];
        const winTex = windowTexture(lit[0]);
        const bm = mat({ color: '#15151c', roughness: 0.5, metalness: 0.6, emissive: '#ffffff', emissiveMap: winTex, emissiveIntensity: 1.4, map: winTex });
        const blds = scatter(n(90), f, 18, 120, rnd, (x, z) => { const h = 8 + rnd() * 45; return { x, z, sx: 4 + rnd() * 6, sy: h, sz: 4 + rnd() * 6, y: h / 2 - 0.6 }; });
        add(instanced(new THREE.BoxGeometry(1, 1, 1), bm, blds));
        const beacons = blds.filter((_, i) => i % 3 === 0).map((b) => ({ x: b.x, z: b.z, y: b.sy - 0.4, s: 0.35 }));
        const bmat = glow('#ff2e63', 2.5);
        add(instanced(new THREE.SphereGeometry(1, 6, 4), bmat, beacons));
        this.updaters.push((t) => { const v = (Math.sin(t * 3) > 0.6) ? 2.5 : 0.4; bmat.color.setRGB(v, v * 0.18, v * 0.39); });
        break;
      }
      case 'orbit': {
        const ast = scatter(n(90), f, 20, 110, rnd, (x, z) => ({ x, z, y: (rnd() - 0.5) * 30 + 5, s: 0.4 + rnd() * 2.4, rx: rnd() * 3, ry: rnd() * 3 }));
        const am = instanced(new THREE.DodecahedronGeometry(1, 0), mat({ color: '#6b6560', roughness: 0.95, flatShading: true }), ast, { cast: true });
        const grp = new THREE.Group();
        grp.add(am);
        grp.position.z = (f.zTop + f.zBottom) / 2;
        am.position.z = -grp.position.z;
        add(grp);
        this.updaters.push((t) => { grp.rotation.y = t * 0.02; });
        break;
      }
      case 'void': {
        const cr = scatter(n(60), f, 14, 90, rnd, (x, z) => ({ x, z, y: 2 + rnd() * 20, s: 0.5 + rnd() * 2.5, rx: rnd() * 3, ry: rnd() * 3 }));
        const cm = instanced(new THREE.OctahedronGeometry(1, 0), mat({ color: '#c9b8ff', roughness: 0.15, metalness: 0.6, emissive: '#3a1a7a', emissiveIntensity: 0.6, flatShading: true }), cr);
        const grp = new THREE.Group();
        grp.add(cm);
        add(grp);
        this.updaters.push((t) => { grp.rotation.y = -t * 0.03; grp.position.y = Math.sin(t * 0.5) * 1.5; });
        break;
      }
    }
  }

  update(t, dt) {
    for (const u of this.updaters) u(t, dt);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => m.dispose());
      }
    });
    this.scene.fog = null;
  }
}
