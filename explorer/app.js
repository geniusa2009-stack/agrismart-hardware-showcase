// AgriSmart V4 hardware explorer. Uses only the public exterior GLB and the V4 component registry (explorer/components.json).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const $ = s => document.querySelector(s);
const MOBILE = matchMedia('(max-width: 820px)').matches;
const HOVER = matchMedia('(hover: hover)').matches;
const LITE = new URLSearchParams(location.search).has('lite');
// Default labels name each product, anchored on its front cover (or valve for the Drip module).
const KEY_IDS = { 'SN-ENC-02': 'AgriSmart Sense', 'CT-ENC-02': 'AgriSmart Control', 'DR-VLV-01': 'Drip Module', 'CN-ENC-02': 'AgriSmart Connect' };
const PANEL_W = 346;
const MAX_LABELS = MOBILE ? 3 : 8;

// ---------- renderer and scene ----------
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LITE, alpha: true, powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio, LITE ? 1 : MOBILE ? 1.5 : 2);
renderer.setPixelRatio(pixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = !LITE;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;
scene.add(new THREE.HemisphereLight(0xdff7ee, 0x0b2a26, 0.55));
const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.position.set(4, 7, 5); key.castShadow = !LITE; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0002;
Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 30 });
scene.add(key);
const rim = new THREE.DirectionalLight(0x7fe3c0, 1.1); rim.position.set(-4, 3, -5); scene.add(rim);
const fill = new THREE.DirectionalLight(0xfff4e6, 0.35); fill.position.set(-5, 2, 4); scene.add(fill);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.38 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
let grid = new THREE.GridHelper(12, 60, 0x2c8f6e, 0x1a5446);
grid.material.transparent = true; grid.material.opacity = 0.22; grid.material.depthWrite = false; grid.position.y = 0.001; scene.add(grid);

const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 200);
const controls = new OrbitControls(camera, canvas);
Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, maxPolarAngle: Math.PI * 0.495, minDistance: 0.15, maxDistance: 14, autoRotateSpeed: 0.8 });

// ---------- theme ----------
const hemi = scene.children.find(o => o.isHemisphereLight);
function applyTheme(t, save = true) {
  const light = t === 'light';
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  if (save) try { localStorage.setItem('agrismart-theme', light ? 'light' : 'dark'); } catch (e) {}
  scene.remove(grid); grid.geometry.dispose(); grid.material.dispose();
  grid = new THREE.GridHelper(12, 60, light ? 0xb9c3c9 : 0x2c8f6e, light ? 0xdde3e7 : 0x1a5446);
  grid.material.transparent = true; grid.material.opacity = light ? 0.55 : 0.22; grid.material.depthWrite = false; grid.position.y = 0.001; scene.add(grid);
  ground.material.opacity = light ? 0.16 : 0.38;
  hemi.color.set(light ? 0xffffff : 0xdff7ee); hemi.groundColor.set(light ? 0xd9dee2 : 0x0b2a26); hemi.intensity = light ? 0.9 : 0.55;
  rim.color.set(light ? 0xffffff : 0x7fe3c0); rim.intensity = light ? 0.6 : 1.1;
  scene.environmentIntensity = light ? 0.6 : 0.45;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#FAFBFC' : '#082422');
  dirty = true;
}

// ---------- state ----------
const comps = new Map();      // id -> { meta, group, meshes, base, off, hidden, row, box }
const meshes = [];
const matCache = new Map();
let selected = null, hovered = null, isolated = false, labelsOn = !MOBILE;
let explodeT = 0, explodeCur = 0, dirty = true, tween = null;
let homeView = null;

// On desktop the parts panel covers the right side, so the projection centre moves left by half its width.
applyTheme(document.documentElement.dataset.theme, false);
$('#theme').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));
const resize = () => { const w = innerWidth, h = innerHeight, mob = matchMedia('(max-width: 820px)').matches; if (!w || !h) return; // a tab loading in the background can report a zero-size window renderer.setSize(w, h, false); camera.aspect = w / h;
  if (mob) camera.clearViewOffset(); else camera.setViewOffset(w, h, PANEL_W / 2, 0, w, h); camera.updateProjectionMatrix(); dirty = true; };
addEventListener('resize', resize); resize();
controls.addEventListener('change', () => { dirty = true; });

function looks(m) {
  let c = matCache.get(m);
  if (!c) {
    const hi = m.clone(); if (hi.emissive) { hi.emissive = new THREE.Color(0x1b8a5a); hi.emissiveIntensity = 0.55; }
    const dim = m.clone(); dim.transparent = true; dim.opacity = Math.min(m.opacity, 0.14); dim.depthWrite = false;
    c = { hi, dim }; matCache.set(m, c);
  }
  return c;
}

function applyLook() {
  for (const mesh of meshes) {
    const c = comps.get(mesh.userData.cid), o = mesh.userData.orig;
    const active = c && (c === selected || c === hovered);
    mesh.material = active ? looks(o).hi : (selected && !isolated ? looks(o).dim : o);
    mesh.visible = !(c && c.hidden);
  }
  dirty = true;
}

// ---------- model ----------
const setProgress = p => $('#loading i').style.setProperty('--p', Math.round(p * 100) + '%');
const [registry, gltf] = await Promise.all([
  fetch('explorer/components.json').then(r => r.json()),
  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('agrismart-hardware-web.meshopt.glb', e => e.total && setProgress(e.loaded / e.total))
    .catch(() => new GLTFLoader().loadAsync('agrismart-hardware-web.glb')),
]);
const META = new Map(registry.components.map(c => [c.id, c]));
const model = gltf.scene; scene.add(model);
const RE = /^([A-Z]{2}-[A-Z]+-\d+)_/;
model.traverse(o => {
  const m = o.name && o.name.match(RE);
  if (m && !comps.has(m[1])) {
    const meta = META.get(m[1]) || { id: m[1], name: 'Unidentified object', fn: 'No public description available.', product: 'Unassigned', cat: '' };
    comps.set(m[1], { meta, group: o, meshes: [], base: o.position.clone(), off: new THREE.Vector3(...(meta.explodeOffset || [0, 0, 0])), hidden: false, box: new THREE.Box3() });
  }
});
let unidentified = 0;
model.traverse(o => {
  if (!o.isMesh) return;
  o.castShadow = o.receiveShadow = !LITE;
  if (o.material.map) o.material.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  o.userData.orig = o.material;
  let n = o, cid = null;
  while (n && !cid) { const m = n.name && n.name.match(RE); if (m) cid = m[1]; n = n.parent; }
  if (cid) { o.userData.cid = cid; comps.get(cid).meshes.push(o); } else unidentified++;
  meshes.push(o);
});
const updateBoxes = () => { model.updateMatrixWorld(true); for (const c of comps.values()) { c.box.makeEmpty(); for (const m of c.meshes) c.box.expandByObject(m); } };
updateBoxes();

// ---------- camera ----------
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function flyTo(box, dur = 900, dirOverride) {
  if (box.isEmpty()) return;
  const s = box.getBoundingSphere(new THREE.Sphere());
  const dir = dirOverride ? dirOverride.clone().normalize() : camera.position.clone().sub(controls.target).normalize();
  const fov = camera.fov * Math.PI / 180, fit = Math.max(s.radius / Math.sin(fov / 2), s.radius / Math.sin(Math.atan(Math.tan(fov / 2) * camera.aspect)));
  const margin = MOBILE ? 1 : innerWidth / (innerWidth - PANEL_W);
  const dist = Math.max(fit * 1.45 * margin, 0.18);
  if (!Number.isFinite(dist) || !Number.isFinite(s.radius)) return;
  tween = { t0: performance.now(), dur, p0: camera.position.clone(), t0v: controls.target.clone(), p1: s.center.clone().addScaledVector(dir, dist), t1: s.center.clone() };
}
const visibleBox = () => { const b = new THREE.Box3(); for (const c of comps.values()) if (!c.hidden) b.union(c.box); return b; };
function home(instant) {
  const b = visibleBox(), dir = new THREE.Vector3(Math.sin(.55) * Math.cos(.2), Math.sin(.2), Math.cos(.55) * Math.cos(.2));
  if (instant) { const s = b.getBoundingSphere(new THREE.Sphere()); controls.target.copy(s.center); camera.position.copy(s.center).addScaledVector(dir, 3); }
  flyTo(b, instant ? 1 : 1100, dir);
}

// ---------- list and info ----------
const PRODUCT_ORDER = ['AgriSmart Sense', 'AgriSmart Control', 'Drip Module', 'AgriSmart Connect', 'Unassigned'];
function buildList() {
  const list = $('#list'); list.innerHTML = '';
  const byP = new Map();
  for (const c of comps.values()) { const p = c.meta.product || 'Unassigned'; if (!byP.has(p)) byP.set(p, []); byP.get(p).push(c); }
  for (const p of [...byP.keys()].sort((a, b) => PRODUCT_ORDER.indexOf(a) - PRODUCT_ORDER.indexOf(b))) {
    const g = document.createElement('div'); g.className = 'grp'; g.innerHTML = `<span>${p}</span><span>${byP.get(p).length}</span>`; list.append(g); byP.get(p)[0].grpEl = g;
    for (const c of byP.get(p)) {
      const r = document.createElement('div'); r.className = 'row'; r.setAttribute('role', 'option'); r.tabIndex = 0;
      r.innerHTML = `<span class="id"></span><span class="nm"></span><button class="vis" type="button" title="Show / hide part" aria-label="Show or hide part"><svg class="i on" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/></svg><svg class="i off" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c4.97 0 8.27 3.6 9.94 6.65a1 1 0 0 1 0 .7 13.16 13.16 0 0 1-1.67 2.68M14.08 14.16a3 3 0 0 1-4.24-4.24M17.48 17.5A10.75 10.75 0 0 1 2.06 12.35a1 1 0 0 1 0-.7 10.76 10.76 0 0 1 4.45-5.14M2 2l20 20"/></svg></button>`;
      r.querySelector('.id').textContent = c.meta.id; r.querySelector('.nm').textContent = c.meta.name; r.title = c.meta.name;
      r.addEventListener('click', e => { if (e.target.closest('.vis')) { setHidden(c, !c.hidden); return; } select(c, true); });
      r.addEventListener('keydown', e => { if (e.key === 'Enter') select(c, true); });
      c.row = r; c.grp = p; list.append(r);
    }
  }
  $('#count').textContent = `${comps.size} parts`;
}
function filterList(q) {
  q = q.trim().toLowerCase(); const shownByGroup = new Map();
  for (const c of comps.values()) {
    const hit = !q || `${c.meta.id} ${c.meta.name} ${c.meta.fn} ${c.meta.cat} ${c.meta.product}`.toLowerCase().includes(q);
    c.row.style.display = hit ? '' : 'none'; shownByGroup.set(c.grp, (shownByGroup.get(c.grp) || 0) + (hit ? 1 : 0));
  }
  for (const c of comps.values()) if (c.grpEl) c.grpEl.style.display = shownByGroup.get(c.grp) ? '' : 'none';
  const matches = [...comps.values()].filter(c => c.row.style.display !== 'none');
  hovered = q && matches.length === 1 ? matches[0] : null; applyLook();
}
function setHidden(c, h) { c.hidden = h; c.row.classList.toggle('off', h); if (c === selected && h) select(null); applyLook(); }
function select(c, focus) {
  selected = c; isolated = false; $('#aIso').classList.remove('on');
  for (const x of comps.values()) x.row.classList.toggle('on', x === c);
  $('#info').classList.toggle('show', !!c); $('#panel').classList.toggle('has-sel', !!c);
  if (c) {
    if (c.hidden) setHidden(c, false);
    $('#iMeta').textContent = [c.meta.product, c.meta.cat].filter(Boolean).join(' · ');
    $('#iName').textContent = c.meta.name; $('#iId').textContent = `${c.meta.id} · ${c.meshes.length} mesh${c.meshes.length > 1 ? 'es' : ''}`;
    $('#iFn').textContent = c.meta.fn || 'No public description available.';
    c.row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (focus) flyTo(c.box);
  }
  applyLook();
}
buildList();
$('#search').addEventListener('input', e => filterList(e.target.value));
$('#aFocus').onclick = () => selected && flyTo(selected.box);
$('#aIso').onclick = () => {
  if (!selected) return; isolated = !isolated; $('#aIso').classList.toggle('on', isolated);
  for (const c of comps.values()) { c.hidden = isolated && c !== selected; c.row.classList.toggle('off', c.hidden); }
  applyLook(); flyTo(isolated ? selected.box : visibleBox());
};
$('#aHide').onclick = () => selected && setHidden(selected, true);
$('#aClose').onclick = () => select(null);
$('#bShow').onclick = () => { isolated = false; $('#aIso').classList.remove('on'); for (const c of comps.values()) { c.hidden = false; c.row.classList.remove('off'); } applyLook(); };
$('#bFit').onclick = () => flyTo(selected ? selected.box : visibleBox());
$('#bReset').onclick = () => { $('#search').value = ''; filterList(''); $('#bShow').onclick(); select(null); explodeT = 0; $('#explode').value = 0; controls.autoRotate = false; $('#bRotate').classList.remove('on'); home(); };
$('#bRotate').onclick = () => { controls.autoRotate = !controls.autoRotate; $('#bRotate').classList.toggle('on', controls.autoRotate); };
$('#bLabels').onclick = () => { labelsOn = !labelsOn; $('#bLabels').classList.toggle('on', labelsOn); dirty = true; };
$('#toggleList').onclick = () => $('#panel').classList.toggle('open');
$('#explode').addEventListener('input', e => { explodeT = +e.target.value; });

// ---------- picking ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let down = null, pendingHover = null;
function pick(x, y) {
  ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(meshes.filter(m => m.visible), false)[0];
  return hit ? comps.get(hit.object.userData.cid) || null : null;
}
canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; controls.autoRotate = false; $('#bRotate').classList.remove('on'); });
canvas.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return; down = null;
  const c = pick(e.clientX, e.clientY); select(c, !!c);
});
if (HOVER) canvas.addEventListener('pointermove', e => { pendingHover = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerleave', () => { if (hovered) { hovered = null; canvas.classList.remove('hovering'); applyLook(); } });

// ---------- labels ----------
const labelsEl = $('#labels'), linesEl = $('#lines');
const labelEls = new Map();
const occl = new Map();
const v = new THREE.Vector3(), anchorW = new THREE.Vector3();
function labelEl(c, text) {
  const k = text ? 'p:' + c.meta.id : c;
  let el = labelEls.get(k);
  if (!el) { el = document.createElement('div'); el.className = text ? 'lbl prod' : 'lbl'; el.innerHTML = text ? `<span></span>` : `<small></small><span></span>`;
    if (!text) el.querySelector('small').textContent = c.meta.id; el.querySelector('span').textContent = text || c.meta.name;
    el.onclick = () => text ? flyTo(productBox(c)) : select(c, true); labelEls.set(k, el); labelsEl.append(el); }
  return el;
}
const productBox = c => { const b = new THREE.Box3(); for (const x of comps.values()) if (x.meta.product === c.meta.product && !x.hidden) b.union(x.box); return b; };
function occluded(c, now) {
  const o = occl.get(c); if (o && now - o.t < 180) return o.v;
  c.box.getCenter(anchorW); const d = anchorW.distanceTo(camera.position);
  ray.set(camera.position, anchorW.clone().sub(camera.position).normalize()); ray.far = d;
  const h = ray.intersectObjects(meshes.filter(m => m.visible && m.material.opacity > 0.5), false)[0];
  const hc = h && comps.get(h.object.userData.cid);
  const val = !!(hc && hc.meta.product !== c.meta.product && h.distance < d - 0.02); ray.far = Infinity;
  occl.set(c, { t: now, v: val }); return val;
}
function drawLabels(now) {
  const want = [];
  if (selected && !selected.hidden) want.push({ c: selected, pri: 0 });
  if (hovered && hovered !== selected) want.push({ c: hovered, pri: 1 });
  if (labelsOn && !selected && explodeCur < 0.02) for (const id of Object.keys(KEY_IDS)) { const c = comps.get(id); if (c && !c.hidden && c !== hovered) want.push({ c, pri: 2, text: KEY_IDS[id] }); }
  const W = innerWidth, H = innerHeight, rightLimit = MOBILE ? W - 8 : W - PANEL_W - 8, top = MOBILE ? 60 : 70, bottom = H - (MOBILE ? 130 : 80);
  const placed = [];
  for (const w of want) {
    if (placed.length >= MAX_LABELS) break;
    w.c.box.getCenter(v); v.project(camera);
    if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) continue;
    const ax = (v.x + 1) / 2 * W, ay = (1 - v.y) / 2 * H;
    if (w.pri === 2 && occluded(w.c, now)) continue;
    const el = labelEl(w.c, w.text); el.classList.toggle('sel', w.pri === 0);
    const lw = el.offsetWidth || 160, lh = el.offsetHeight || 28, left = ax < rightLimit / 2;
    let lx = left ? ax - 70 - lw : ax + 70; lx = Math.max(8, Math.min(rightLimit - lw, lx));
    let ly = Math.max(top, Math.min(bottom - lh, ay - 46));
    for (let k = 0; k < 12; k++) { const clash = placed.find(p => Math.abs(p.ly - ly) < lh + 6 && lx < p.lx + p.lw + 6 && p.lx < lx + lw + 6); if (!clash) break; ly = clash.ly + lh + 8; if (ly > bottom - lh) ly = clash.ly - lh - 8; }
    placed.push({ c: w.c, el, ax, ay, lx, ly, lw, lh, sel: w.pri === 0 });
  }
  const keep = new Set(placed.map(p => p.el));
  for (const el of labelEls.values()) if (!keep.has(el)) el.style.opacity = 0, el.style.pointerEvents = 'none';
  let svg = '';
  for (const p of placed) {
    p.el.style.opacity = 1; p.el.style.pointerEvents = 'auto'; p.el.style.transform = `translate(${p.lx}px, ${p.ly}px)`;
    const ex = p.lx + (p.ax < p.lx ? 0 : p.lw), ey = p.ly + p.lh / 2, mx = ex + (p.ax < p.lx ? -18 : 18);
    svg += `<path class="${p.sel ? 'sel' : ''}" d="M${p.ax},${p.ay} L${mx},${ey} L${ex},${ey}"/><circle cx="${p.ax}" cy="${p.ay}" r="${p.sel ? 3.5 : 2.5}"/>`;
  }
  linesEl.innerHTML = svg;
}

// ---------- loop ----------
let frames = 0, slow = 0, last = performance.now();
renderer.setAnimationLoop(now => {
  if (tween) {
    const u = Math.min(1, (now - tween.t0) / tween.dur), k = ease(u);
    camera.position.lerpVectors(tween.p0, tween.p1, k); controls.target.lerpVectors(tween.t0v, tween.t1, k);
    if (u >= 1) tween = null; dirty = true;
  }
  if (Math.abs(explodeT - explodeCur) > 1e-4) {
    explodeCur += (explodeT - explodeCur) * 0.14; if (Math.abs(explodeT - explodeCur) < 1e-3) explodeCur = explodeT;
    for (const c of comps.values()) c.group.position.copy(c.base).addScaledVector(c.off, ease(explodeCur));
    updateBoxes(); dirty = true;
  }
  if (pendingHover && !tween) {
    const c = pick(pendingHover.x, pendingHover.y); pendingHover = null;
    if (c !== hovered) { hovered = c; canvas.classList.toggle('hovering', !!c); applyLook(); }
  }
  if (controls.update()) dirty = true;
  if (controls.autoRotate) dirty = true;
  if (dirty) { renderer.render(scene, camera); drawLabels(now); dirty = false; }
  // Low-performance fallback: drop resolution and shadows if frames stay slow.
  const dt = now - last; last = now;
  if (++frames > 30 && frames < 240 && dt > 34) { if (++slow > 40 && pixelRatio > 1) { pixelRatio = 1; renderer.setPixelRatio(1); renderer.shadowMap.enabled = false; key.castShadow = false; resize(); } }
});

home(true);
setTimeout(() => { const l = $('#loading'); l.style.opacity = 0; setTimeout(() => l.remove(), 500); }, 250);
window.EXPLORER = { comps, select: id => select(comps.get(id), true), unidentified, meshes: meshes.length, camera, controls, renderer };
