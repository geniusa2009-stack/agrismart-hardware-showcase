# AgriSmart hardware: public web model

This is the approved AgriSmart V4 hardware design, exported from the original V4 Three.js viewer with its own scene objects and GLTFExporter. The geometry, materials, colours, logo and lid prints come from that design. Nothing has been redrawn or approximated.

This package is **exterior only**. Parts inside the enclosures (boards, modules, batteries, internal wiring, internal fixings) were removed. They are not hidden in the file. The model is safe to publish.

## Files

| File | Use |
| --- | --- |
| `agrismart-hardware-web.glb` | **Default.** Full system: Sense, Control, Drip module, Connect. Loads in a plain `GLTFLoader` with no decoders. 1.2 MB. |
| `agrismart-hardware-web.meshopt.glb` | Same model, Meshopt-compressed, 0.7 MB. Needs `setMeshoptDecoder` (see below). |
| `viewer-config.json` | Camera, scale, rotation, lights, ground shadow, tone mapping and exposure for the approved look |
| `preview-front.png`, `preview-side.png`, `preview-back.png`, `preview-three-quarter.png`, `preview-top.png` | 2000 x 1250 renders of the web GLB with `viewer-config.json` |
| `products/` | One GLB per product (each with a Meshopt version and its own `*-viewer-config.json`), plus previews |
| `example/` | A working viewer: `index.html` and `viewer.js` |
| `CHECKSUMS.txt` | SHA-256 of every file |

## Model facts

- **Units, axes and front:** metres, +Y up, front faces +Z. The full system measures 2.80 m wide (x), 2.85 m tall (y) and 0.55 m deep (z). Scale is 1, with no rotation needed.
- **Origin:** ground contact at y = 0, plan centre at x = z = 0. Each product file is centred the same way on its own footprint.
- **Size:** 221 meshes and 33,352 triangles. There is no mesh simplification.
- **Materials:** 23 PBR metallic-roughness materials. The only extension is `KHR_materials_emissive_strength`, for the status LEDs. The optimised files add `KHR_mesh_quantization`, which three.js supports natively.
- **Textures:** the AgriSmart logo at 384 x 419, which is the source asset's resolution, and three lid prints at 2048 x 640.
- **Intentional transparency:**
  - The LED bezel glass is at 55% opacity, as in the original design.
  - The logo and lid prints are alpha-blended decals.
  - Nothing else is transparent.
- **Node names:** each part is a named node, so you can hover, highlight or animate parts. All metadata (`extras`) has been removed.

## Using it in Replit (or any Vite or plain Three.js site)

```bash
npm install three@0.184.0
```

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'; // only for *.meshopt.glb

const cfg = await (await fetch('/models/viewer-config.json')).json();
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = cfg.renderer.toneMappingExposure;  // 1.05
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const L = cfg.lights;
scene.add(new THREE.HemisphereLight(L.hemisphere.skyColor, L.hemisphere.groundColor, L.hemisphere.intensity));
for (const k of ['key', 'fill', 'rim']) {
  const d = L[k], light = new THREE.DirectionalLight(d.color, d.intensity);
  light.position.fromArray(d.position); light.target.position.fromArray(d.target);
  if (d.castShadow) {
    light.castShadow = true; light.shadow.mapSize.set(d.shadowMapSize, d.shadowMapSize); light.shadow.bias = d.shadowBias;
    const s = d.shadowCameraHalfSize; Object.assign(light.shadow.camera, { left: -s, right: s, top: s, bottom: -s });
  }
  scene.add(light, light.target);
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: cfg.ground.shadowOpacity }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const gltf = await loader.loadAsync('/models/agrismart-hardware-web.glb');
gltf.scene.traverse(o => {
  if (o.isMesh) { o.castShadow = o.receiveShadow = true; if (o.material.map) o.material.map.anisotropy = cfg.renderer.textureAnisotropy; }
});
scene.add(gltf.scene);

const camera = new THREE.PerspectiveCamera(cfg.camera.fov, innerWidth / innerHeight, cfg.camera.near, cfg.camera.far);
const view = cfg.views.threeQuarter;   // also: front, side, back, top
camera.position.fromArray(view.position);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.fromArray(view.target); controls.enableDamping = true; controls.update();
```

Put the GLB, `viewer-config.json` and, if used, `products/` in your site's public folder (`/public/models/` in a Vite or Replit project). The CSS background behind the transparent canvas is in `cfg.background.css`. `example/` runs the same setup as a complete page. Serve the package folder and open `example/index.html`.

## The approved look, exactly

- **Tone mapping:** ACES Filmic at exposure 1.05, sRGB output.
- **Lights:** one hemisphere light, a shadow-casting key light, a fill light and a rim light, with the values in `viewer-config.json`. They were read from the running original viewer's Studio scene.
- **Environment:** no HDRI and no environment map. The original uses none, so adding one will change the look, metals in particular.
- **Ground:** a `ShadowMaterial` plane at 12% opacity.
- **Post-processing:** none. The GLB contains no lights, camera, background or post effects; set those up in the website renderer as shown.
- **Anisotropy:** glTF cannot store texture anisotropy. Set it to 8 on the logo and print textures, as above, for the original sharpness at grazing angles.

## What was verified

- **Against the original:** the web GLB was rendered against the original V4 viewer from the same five cameras, with the same lights and tone mapping. At most 0.8% of model pixels differ. The same residual appears with an unedited export, so it comes from the glTF round trip, not the public edits. It sits on the logo: at very small on-screen sizes the original's logo fades more than the export's. Close-ups match.
- **Exterior completeness:** every product was compared with its full, interior-included version from 26 directions. No view differs by more than 51 pixels out of 640,000, and the Drip module, which had nothing removed, shows the same level.
- **Structure:**
  - No missing or broken normals.
  - No missing textures or empty meshes.
  - No metadata extras.
  - No removed internal part names remain.
  - Bounding boxes match the stated sizes.
- **Lid prints:** redrawn from the original drawing code at 4x resolution, with the same text, fonts, colours and layout, so they stay readable up close.

## Notes before publishing

- **Lid prints name modules:** the lid prints are part of the approved exterior design, and they name the radio and processor modules ("RAK3172 · LoRaWAN · V4", "ESP32-C3 · LoRa · V4", "LoRaWAN GATEWAY · LTE · V4"). Decide whether you are happy publishing them. Removing them would be a change to the approved design.
- **Not engineering data:** this is a visual design model. It is not CAD and it is not manufacturing data. Do not present its dimensions as specifications.
