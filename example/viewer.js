// Clean three.js viewer for the AgriSmart web GLB. Reproduces the approved V4 "Studio" look from viewer-config.json.
// Used for verification and preview renders here, and as the reference setup for the website.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export async function createViewer(canvas, config) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(config.renderer.pixelRatioMax ? Math.min(devicePixelRatio, config.renderer.pixelRatioMax) : 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE[config.renderer.toneMapping];
  renderer.toneMappingExposure = config.renderer.toneMappingExposure;
  renderer.shadowMap.enabled = config.renderer.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const L = config.lights;
  scene.add(new THREE.HemisphereLight(L.hemisphere.skyColor, L.hemisphere.groundColor, L.hemisphere.intensity));
  const lights = {};
  for (const k of ['key', 'fill', 'rim']) {
    const d = L[k], l = new THREE.DirectionalLight(d.color, d.intensity);
    l.position.fromArray(d.position); l.target.position.fromArray(d.target); scene.add(l, l.target);
    if (d.castShadow) { l.castShadow = true; l.shadow.mapSize.set(d.shadowMapSize, d.shadowMapSize); l.shadow.bias = d.shadowBias;
      const s = d.shadowCameraHalfSize; Object.assign(l.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 0.5, far: 500 }); l.shadow.camera.updateProjectionMatrix(); }
    lights[k] = l;
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: config.ground.shadowOpacity }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = config.ground.y; ground.receiveShadow = true; scene.add(ground);

  const camera = new THREE.PerspectiveCamera(config.camera.fov, 1, config.camera.near, config.camera.far);
  const controls = new OrbitControls(camera, canvas); controls.enableDamping = true;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  let model = null;

  const api = {
    THREE, renderer, scene, camera, controls, lights, ground,
    async load(url, { position = [0, 0, 0] } = {}) {
      if (model) scene.remove(model);
      const gltf = await loader.loadAsync(url);
      model = gltf.scene; model.position.fromArray(position);
      // glTF cannot store anisotropy; the original set 8 on the logo and lid prints.
      const aniso = Math.min(config.renderer.textureAnisotropy || 1, renderer.capabilities.getMaxAnisotropy());
      model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; for (const m of [].concat(o.material)) if (m.map) { m.map.anisotropy = aniso; m.map.needsUpdate = true; } } });
      scene.add(model); model.updateMatrixWorld(true);
      return gltf;
    },
    get model() { return model; },
    setSize(w, h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); },
    view(name) {
      const v = config.views[name];
      camera.position.fromArray(v.position); controls.target.fromArray(v.target); camera.lookAt(controls.target); controls.update();
      return v;
    },
    render() { renderer.render(scene, camera); },
  };
  return api;
}
