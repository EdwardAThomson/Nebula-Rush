// Ship viewer sandbox — renders one ship from ShipFactory under the same IBL +
// lights as the in-game ship preview, with the exhaust lit as if cruising, so
// a design can be judged (and screenshotted) from fixed camera angles.
//
// Run: with `npm run dev`, open http://localhost:5173/sandbox/ship.html
// Query params:
//   type=lancer|fighter|...   ship type (default lancer)
//   color=d9531e              primary paint (hex, no #)
//   accent=eeeeee             trim paint (hex, no #)
//   view=front3q|rear3q|side|top|front|orbit   camera preset (default orbit)
//   hud=0                     hide the label
// Controls (orbit view): click & drag to spin.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createShip, type ShipType } from '../src/game/ShipFactory';

const params = new URLSearchParams(location.search);
const type = (params.get('type') || 'lancer') as ShipType;
const color = parseInt(params.get('color') || 'd9531e', 16);
const accent = parseInt(params.get('accent') || 'eeeeee', 16);
const view = params.get('view') || 'orbit';

const hud = document.getElementById('hud')!;
if (params.get('hud') === '0') hud.style.display = 'none';
hud.innerHTML = `<b>${type.toUpperCase()}</b>  view=${view}\n#${color.toString(16).padStart(6, '0')} / #${accent.toString(16).padStart(6, '0')}`;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1117);

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

// IBL + lights mirror ShipPreview.tsx so the sandbox judges the same look.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const key = new THREE.DirectionalLight(0xffffff, 1.0);
key.position.set(5, 10, 5);
scene.add(key);

// Faint ground disc for a sense of scale and a shadow-ish anchor.
const ground = new THREE.Mesh(
    new THREE.CircleGeometry(9, 64),
    new THREE.MeshStandardMaterial({ color: 0x151b24, roughness: 1, metalness: 0 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1.0;
scene.add(ground);

const { mesh, glows } = createShip(color, type, accent);
mesh.position.y = -0.5;
scene.add(mesh);

// Light the exhaust as the game does at cruise (Ship.ts drives these per
// frame in-game; the factory leaves the cones short).
glows.forEach(g => {
    const outer = g.children[0] as THREE.Mesh | undefined;
    const core = g.children[1] as THREE.Mesh | undefined;
    if (outer) outer.scale.set(outer.scale.x, 2.0, outer.scale.z);
    if (core) core.scale.set(core.scale.x, 1.8, core.scale.z);
});

// Camera presets: ship forward is -Z, so "front" views sit at negative Z.
const presets: Record<string, [THREE.Vector3, THREE.Vector3]> = {
    front3q: [new THREE.Vector3(-7.5, 4.0, -9.5), new THREE.Vector3(0, 0, 0)],
    rear3q: [new THREE.Vector3(7.5, 4.0, 9.5), new THREE.Vector3(0, 0, 0)],
    side: [new THREE.Vector3(13, 1.5, 0), new THREE.Vector3(0, 0, 0)],
    top: [new THREE.Vector3(0, 14, 0.01), new THREE.Vector3(0, 0, 0)],
    front: [new THREE.Vector3(0, 2.5, -13), new THREE.Vector3(0, 0, 0)],
    orbit: [new THREE.Vector3(-7.5, 4.0, -9.5), new THREE.Vector3(0, 0, 0)],
};
const [camPos, camTarget] = presets[view] || presets.orbit;
camera.position.copy(camPos);
camera.lookAt(camTarget);

// Drag to spin (orbit view only).
let dragging = false, lastX = 0, lastY = 0;
if (view === 'orbit') {
    addEventListener('mousedown', e => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
    addEventListener('mouseup', () => { dragging = false; });
    addEventListener('mousemove', e => {
        if (!dragging) return;
        mesh.rotation.y += (e.clientX - lastX) * 0.01;
        mesh.rotation.x += (e.clientY - lastY) * 0.01;
        lastX = e.clientX; lastY = e.clientY;
    });
}

addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});

let frames = 0;
const animate = () => {
    renderer.render(scene, camera);
    frames++;
    if (frames === 3) (window as unknown as { __shipReady: boolean }).__shipReady = true; // screenshot hook
    requestAnimationFrame(animate);
};
animate();
