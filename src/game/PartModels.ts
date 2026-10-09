import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createAerofoilGeometry, createLoftGeometry } from './ShipFactory';
import type { PartSlot } from './profile';

// Garage part models: small procedural showpieces for the shop cards, built
// from the same loft / aerofoil / lathe toolkit as the ships so they read as
// the same hardware. Each Mk level is visibly more serious than the last
// (longer, more nozzles, more fins, more cells, brighter glow); level 0 is the
// stock part, unlit gunmetal. Every model is centred on the origin and fits a
// ~2.6-unit box, so one camera framing works for all of them.

export interface PartScene {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    root: THREE.Group;      // turntable: spin this around Y
    dispose: () => void;
}

interface Mats {
    metal: THREE.MeshStandardMaterial;
    dark: THREE.MeshStandardMaterial;
    trim: THREE.MeshStandardMaterial;
    glow: THREE.Material;
    haze: THREE.Material;     // soft additive energy field (capacitor)
    cell: THREE.MeshStandardMaterial;
}

function makeMats(accent: THREE.Color, level: number): Mats {
    const lit = level > 0;
    return {
        metal: new THREE.MeshStandardMaterial({ color: 0x3a3f48, metalness: 0.9, roughness: 0.32 }),
        dark: new THREE.MeshStandardMaterial({ color: 0x0b0d10, metalness: 0.3, roughness: 0.85, side: THREE.DoubleSide }),
        trim: new THREE.MeshStandardMaterial({
            color: lit ? accent.clone().lerp(new THREE.Color(0xffffff), 0.15) : new THREE.Color(0x6b7280),
            metalness: 0.6, roughness: 0.35,
        }),
        glow: lit
            ? new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(1.6), toneMapped: false })
            : new THREE.MeshStandardMaterial({ color: 0x1f2329, metalness: 0.4, roughness: 0.7 }),
        haze: new THREE.MeshBasicMaterial({
            color: accent, transparent: true, opacity: lit ? 0.07 + 0.04 * level : 0,
            blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
        }),
        cell: new THREE.MeshStandardMaterial({
            color: lit ? accent : new THREE.Color(0x2a3a30),
            emissive: lit ? accent : new THREE.Color(0x000000),
            emissiveIntensity: lit ? 0.6 + 0.35 * level : 0,
            metalness: 0.1, roughness: 0.15, transparent: true, opacity: 0.88,
        }),
    };
}

const lathe = (pts: [number, number][], segs = 40) =>
    new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);

// --- Engine: a turbine pod. Longer and banded per level; Mk III adds tail
// stabilisers and a lit core in the intake. Lies along X.
function buildEngine(level: number, m: Mats): THREE.Group {
    const g = new THREE.Group();
    const len = 2.0 + 0.2 * level;
    const r = 0.5 + 0.03 * level;
    const rs = r / 0.74, ls = len / 4.05;
    const P = (pr: number, pa: number): [number, number] => [pr * rs, pa * ls];
    const turned = new THREE.Group();
    turned.add(new THREE.Mesh(lathe([
        P(0.52, 0.02), P(0.66, 0.0), P(0.72, 0.25), P(0.74, 1.1), P(0.72, 2.4), P(0.62, 3.4), P(0.5, 3.95), P(0.44, 4.05),
    ]), m.metal));
    turned.add(new THREE.Mesh(lathe([P(0.52, 0.02), P(0.26, 0.42)]), m.dark));
    turned.add(new THREE.Mesh(lathe([P(0.44, 4.05), P(0.36, 4.05), P(0.36, 3.6), P(0.0, 3.6)]), m.dark));
    const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.26 * rs, 0.55 * ls, 28), level >= 3 ? m.glow : m.metal);
    spinner.rotation.x = Math.PI;
    spinner.position.y = 0.2 * ls;
    turned.add(spinner);
    // Nozzle glow ring.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4 * rs, 0.035, 10, 40), m.glow);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 4.0 * ls;
    turned.add(ring);
    // Trim bands: one per level, spread along the barrel.
    for (let i = 0; i < level; i++) {
        const y = (1.0 + (i + 0.5) * (2.2 / level)) * ls;
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.735 * rs, 0.03, 8, 48), m.trim);
        band.rotation.x = Math.PI / 2;
        band.position.y = y;
        turned.add(band);
    }
    // Mk III: four swept stabilisers round the tail.
    if (level >= 3) {
        const fin = createAerofoilGeometry({ span: 0.32, rootChord: 0.7, tipChord: 0.3, sweep: 0.3, thickness: 0.1, tipRound: 0.4 });
        for (let k = 0; k < 4; k++) {
            const pivot = new THREE.Group();
            pivot.rotation.y = k * Math.PI / 2 + Math.PI / 4;
            const f = new THREE.Mesh(fin, m.trim);
            // Fin span (+X) radial, chord (+Z) along the lathe axis (+Y).
            f.rotation.x = -Math.PI / 2;
            f.position.set(0.66 * rs, 3.0 * ls, 0);
            pivot.add(f);
            turned.add(pivot);
        }
    }
    turned.position.y = -len / 2;
    const axis = new THREE.Group();
    axis.rotation.z = -Math.PI / 2;          // lathe +Y -> +X
    axis.add(turned);
    g.add(axis);
    return g;
}

// --- Thrusters: ONE vectoring thruster, refined per level rather than
// multiplied (a ship would only ever carry one). Stock / Mk I: a plain bell
// on a combustion chamber. Mk II: a bigger bell with cooling rings. Mk III:
// vectoring vanes round the lip and a brighter, double-ringed throat.
// The thrust axis runs along Z, nozzle exit at +Z.
function buildThrusters(level: number, m: Mats): THREE.Group {
    const g = new THREE.Group();
    const flare = level >= 2 ? 1.18 : 1;           // Mk II+ bell is wider at the exit
    const turned = new THREE.Group();              // lathe +Y -> +Z
    turned.rotation.x = Math.PI / 2;
    // Combustion chamber: rounded dome, cylinder, then the throat neck.
    turned.add(new THREE.Mesh(lathe([
        [0.0, -0.95], [0.18, -0.92], [0.3, -0.82], [0.36, -0.65], [0.37, -0.35], [0.34, -0.2], [0.22, -0.08], [0.17, 0.0],
    ]), m.metal));
    // Bell: outer skin and a dark inner wall, so the exit reads as hollow.
    const outer: [number, number][] = [[0.17, 0.0], [0.2, 0.12], [0.3 * flare, 0.42], [0.46 * flare, 0.78], [0.52 * flare, 0.92]];
    turned.add(new THREE.Mesh(lathe(outer), m.metal));
    turned.add(new THREE.Mesh(lathe([[0.49 * flare, 0.92], [0.43 * flare, 0.78], [0.27 * flare, 0.42], [0.17, 0.12], [0.0, 0.1]]), m.dark));
    // Lit throat deep in the bell; Mk III adds a second, wider ring.
    const throat = new THREE.Mesh(new THREE.CircleGeometry(level >= 3 ? 0.17 : 0.13, 28), m.glow);
    throat.rotation.x = -Math.PI / 2;
    throat.position.y = 0.12;
    turned.add(throat);
    if (level >= 3) {
        const halo = new THREE.Mesh(new THREE.TorusGeometry(0.25 * flare, 0.02, 8, 40), m.glow);
        halo.rotation.x = Math.PI / 2;
        halo.position.y = 0.36;
        turned.add(halo);
    }
    // Exit lip.
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.505 * flare, 0.028, 10, 48), level > 0 ? m.trim : m.metal);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.92;
    turned.add(lip);
    // Mk II+: cooling rings round the chamber and bell.
    if (level >= 2) {
        for (const [y, r] of [[-0.6, 0.375], [-0.4, 0.38], [0.55, 0.36 * flare]] as const) {
            const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.024, 8, 40), m.trim);
            ring.rotation.x = Math.PI / 2;
            ring.position.y = y;
            turned.add(ring);
        }
    }
    // Mount flange behind the chamber.
    const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 40), m.metal);
    flange.position.y = -0.7;
    turned.add(flange);
    g.add(turned);
    // Mk III: four vectoring vanes standing off the lip, angled into the exhaust.
    if (level >= 3) {
        const vane = createAerofoilGeometry({ span: 0.34, rootChord: 0.36, tipChord: 0.22, sweep: 0.08, thickness: 0.12, tipRound: 0.5 });
        for (let k = 0; k < 4; k++) {
            const pivot = new THREE.Group();
            pivot.rotation.z = k * Math.PI / 2 + Math.PI / 4;
            const v = new THREE.Mesh(vane, m.trim);
            // Span radial (+X) from just outside the lip, chord along the axis.
            v.position.set(0.5 * flare, 0, 1.02);
            v.rotation.y = -0.25;              // toe the trailing edge inward
            pivot.add(v);
            g.add(pivot);
        }
    }
    return g;
}

// --- Fins: aerofoil stabilisers on a pylon. One fin, a canted pair, then a
// pair with end plates and lit tips.
function buildFins(level: number, m: Mats): THREE.Group {
    const g = new THREE.Group();
    const chord = 1.1, height = 1.25 + 0.1 * level;
    const finGeo = createAerofoilGeometry({ span: height, rootChord: chord, tipChord: 0.45 * chord, sweep: 0.5 * chord, thickness: 0.09, tipRound: level >= 3 ? 0 : 0.4 });
    finGeo.rotateZ(Math.PI / 2);                 // span up
    const base = new THREE.Mesh(createLoftGeometry([
        { z: -0.9, w: 0.05, h: 0.05, y: -0.75 },
        { z: -0.6, w: 0.32, h: 0.16, y: -0.75 },
        { z: 0.5, w: 0.36, h: 0.18, y: -0.75 },
        { z: 0.95, w: 0.08, h: 0.06, y: -0.75 },
    ], { n: 2.4, belly: 0.5, capEnd: false }), m.metal);
    g.add(base);
    const cants = level <= 1 ? [0] : [0.42, -0.42];
    const tipY = height;
    for (const cant of cants) {
        const pivot = new THREE.Group();
        pivot.position.set(0, -0.7, 0);
        pivot.rotation.z = cant;
        pivot.add(new THREE.Mesh(finGeo, level > 0 ? m.trim : m.metal));
        // Lit strip along the root.
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, chord * 0.8), m.glow);
        strip.position.set(0, 0.06, 0);
        pivot.add(strip);
        if (level >= 3) {
            // End plate (a small horizontal aerofoil) with a lit tip light.
            const plate = createAerofoilGeometry({ span: 0.22, rootChord: 0.55, tipChord: 0.4, sweep: 0.1, thickness: 0.08, tipRound: 0.6 });
            const tipZ = -chord / 2 + 0.5 * chord + 0.45 * chord / 2;
            for (const dir of [1, -1] as const) {
                const p = new THREE.Mesh(dir > 0 ? plate : createAerofoilGeometry({ span: 0.22, rootChord: 0.55, tipChord: 0.4, sweep: 0.1, thickness: 0.08, tipRound: 0.6, dir: -1 }), m.metal);
                p.position.set(0, tipY, tipZ);
                pivot.add(p);
            }
            const light = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), m.glow);
            light.position.set(0, tipY + 0.02, tipZ + 0.3);
            pivot.add(light);
        }
        g.add(pivot);
    }
    g.position.y = -0.1;
    return g;
}

// --- Capacitor: glowing energy cells in a cradle. One cell, then two, then
// three round a lit core.
function buildCapacitor(level: number, m: Mats): THREE.Group {
    const g = new THREE.Group();
    const cells = Math.max(1, level);
    const h = 1.5;
    const makeCell = () => {
        const c = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, h * 0.62, 32, 1, true), m.cell);
        c.add(body);
        for (const s of [1, -1]) {
            const cap = new THREE.Mesh(lathe([[0.0, 0.0], [0.27, 0.0], [0.29, 0.06], [0.27, 0.2], [0.18, 0.28], [0.0, 0.3]], 32), m.metal);
            cap.position.y = s * h * 0.31;
            if (s < 0) cap.rotation.x = Math.PI;
            c.add(cap);
            const band = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.022, 8, 32), m.trim);
            band.rotation.x = Math.PI / 2;
            band.position.y = s * h * 0.12;
            c.add(band);
        }
        return c;
    };
    const radius = cells === 1 ? 0 : cells === 2 ? 0.36 : 0.46;
    for (let i = 0; i < cells; i++) {
        const a = (i / cells) * Math.PI * 2 + Math.PI / 2;
        const c = makeCell();
        c.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
        g.add(c);
    }
    // Cradle rings top and bottom.
    const ringR = radius + 0.3;
    for (const s of [1, -1]) {
        const cradle = new THREE.Mesh(new THREE.TorusGeometry(ringR, 0.045, 10, 48), m.metal);
        cradle.rotation.x = Math.PI / 2;
        cradle.position.y = s * h * 0.42;
        g.add(cradle);
    }
    if (level >= 3) {
        const core = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, h * 0.9, 16), m.glow);
        g.add(core);
        const field = new THREE.Mesh(new THREE.CylinderGeometry(ringR + 0.08, ringR + 0.08, h * 0.7, 48, 1, true), m.haze);
        g.add(field);
    }
    return g;
}

const BUILDERS: Record<PartSlot, (level: number, m: Mats) => THREE.Group> = {
    engine: buildEngine,
    thrusters: buildThrusters,
    fins: buildFins,
    capacitor: buildCapacitor,
};

// One PMREM studio environment per renderer, shared by every part scene.
const envCache = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();
function studioEnv(renderer: THREE.WebGLRenderer): THREE.Texture {
    let env = envCache.get(renderer);
    if (!env) {
        const pmrem = new THREE.PMREMGenerator(renderer);
        env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        pmrem.dispose();
        envCache.set(renderer, env);
    }
    return env;
}

export function buildPartScene(renderer: THREE.WebGLRenderer, slot: PartSlot, level: number, accentCss: string, aspect: number): PartScene {
    const accent = new THREE.Color(accentCss);
    const scene = new THREE.Scene();
    scene.environment = studioEnv(renderer);
    scene.environmentIntensity = 0.7;
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 4, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(accent, 2.5);
    rim.position.set(-4, 2, -4);
    scene.add(rim);

    const m = makeMats(accent, level);
    const root = new THREE.Group();
    const model = BUILDERS[slot](level, m);
    root.add(model);
    // Fit: scale the model's bounding sphere to a fixed size and centre it.
    // The additive energy field is a halo, not part of the silhouette.
    const box = new THREE.Box3();
    model.updateMatrixWorld(true);
    model.traverse((o) => {
        if (o instanceof THREE.Mesh && o.material !== m.haze) box.expandByObject(o);
    });
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    model.position.sub(sphere.center);
    const fit = 1.5 / sphere.radius;
    root.scale.setScalar(fit);
    scene.add(root);

    const camera = new THREE.PerspectiveCamera(30, aspect, 0.1, 50);
    camera.position.set(0, 1.1, 4.6);
    camera.lookAt(0, 0, 0);

    const dispose = () => {
        scene.traverse((o) => {
            if (o instanceof THREE.Mesh) o.geometry.dispose();
        });
        Object.values(m).forEach((mat) => mat.dispose());
    };
    return { scene, camera, root, dispose };
}
