// Procedural trophy art for the Cup Selection cards. Each cup gets a distinct
// futuristic trophy styled after its theme, rendered over a themed backdrop and
// exported as a JPEG to public/assets/cups/cup_<id>.jpg. See
// render-cup-trophies.html for how to run it.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const WIDTH = 960;
const HEIGHT = 600;

type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number, rand: () => number) => void;

interface TrophySpec {
    id: string;
    background: Painter;
    build: (root: THREE.Group, scene: THREE.Scene) => void;
}

// Deterministic RNG so re-renders produce identical art.
function mulberry32(seed: number) {
    return () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ---------------------------------------------------------------- helpers

// Slightly below full metalness so a diffuse light-to-shadow gradient shows across
// the body; pure mirror chrome under a soft env map reads as a flat cut-out.
const metal = (color: number, roughness = 0.3, extra: THREE.MeshPhysicalMaterialParameters = {}) =>
    new THREE.MeshPhysicalMaterial({ color, metalness: 0.85, roughness, clearcoat: 0.5, clearcoatRoughness: 0.15, ...extra });

const glow = (color: number, intensity = 3) =>
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity });

function lathe(profile: [number, number][], segments: number, material: THREE.Material) {
    const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
    const mesh = new THREE.Mesh(new THREE.LatheGeometry(pts, segments), material);
    return mesh;
}

function ring(radius: number, tube: number, y: number, material: THREE.Material) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 16, 96), material);
    m.rotation.x = Math.PI / 2;
    m.position.y = y;
    return m;
}

function cylinder(rTop: number, rBottom: number, h: number, y: number, material: THREE.Material, segments = 64) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material);
    m.position.y = y + h / 2;
    return m;
}

// A swept blade used for handles: extruded 2D outline, centred on its depth.
function fin(outline: [number, number][], depth: number, material: THREE.Material) {
    const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
    const geo = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelThickness: 0.02,
        bevelSize: 0.02,
        bevelSegments: 3,
    });
    geo.translate(0, 0, -depth / 2);
    return new THREE.Mesh(geo, material);
}

// Mirror a handle onto both sides of the trophy.
function pair(make: () => THREE.Object3D, x: number, y: number, root: THREE.Group) {
    const right = make();
    right.position.set(x, y, 0);
    const left = make();
    left.position.set(-x, y, 0);
    left.rotation.y = Math.PI;
    root.add(right, left);
}

function stars(ctx: CanvasRenderingContext2D, w: number, h: number, rand: () => number, count: number, maxY = 1) {
    for (let i = 0; i < count; i++) {
        const x = rand() * w;
        const y = rand() * h * maxY;
        const r = rand() < 0.95 ? rand() * 1.2 + 0.3 : rand() * 1.5 + 1.2;
        ctx.fillStyle = `rgba(255,255,255,${0.3 + rand() * 0.7})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
}

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function verticalGradient(ctx: CanvasRenderingContext2D, w: number, h: number, stops: [number, string][]) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
}

// Soft spotlight pool behind the trophy so it separates from the backdrop.
function halo(ctx: CanvasRenderingContext2D, w: number, h: number, color: string) {
    blob(ctx, w / 2, h * 0.48, h * 0.55, color);
}

function canvasTexture(w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    paint(c.getContext('2d')!);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

// Common two-tier plinth with a glowing accent band.
function plinth(root: THREE.Group, body: THREE.Material, accent: THREE.Material, segments = 64) {
    root.add(cylinder(1.0, 1.08, 0.28, 0, body, segments));
    root.add(cylinder(0.78, 0.92, 0.24, 0.3, body, segments));
    const band = cylinder(0.93, 0.93, 0.03, 0.27, accent, segments);
    root.add(band);
}

// ---------------------------------------------------------------- cups

const NEBULA: TrophySpec = {
    id: 'nebula',
    background: (ctx, w, h, rand) => {
        verticalGradient(ctx, w, h, [[0, '#04050f'], [0.6, '#0a0a26'], [1, '#05040f']]);
        blob(ctx, w * 0.22, h * 0.35, h * 0.6, 'rgba(123,44,255,0.35)');
        blob(ctx, w * 0.8, h * 0.6, h * 0.65, 'rgba(0,229,255,0.22)');
        blob(ctx, w * 0.65, h * 0.15, h * 0.4, 'rgba(255,61,240,0.15)');
        stars(ctx, w, h, rand, 380);
        halo(ctx, w, h, 'rgba(0,229,255,0.12)');
    },
    build: (root, scene) => {
        const chrome = metal(0x9fb2c8, 0.1);
        const gun = metal(0x2a3140, 0.35);
        const cyan = glow(0x00e5ff, 2.4);
        plinth(root, gun, cyan);

        // Slim stem flaring into a tall tulip bowl.
        root.add(lathe([[0.32, 0.54], [0.22, 0.62], [0.09, 0.85], [0.07, 1.25], [0.14, 1.45], [0.2, 1.5]], 96, chrome));
        const bowl = lathe([[0.2, 1.5], [0.48, 1.62], [0.7, 1.9], [0.78, 2.25], [0.74, 2.5], [0.7, 2.5]], 96, chrome);
        (bowl.material as THREE.Material).side = THREE.DoubleSide;
        root.add(bowl);
        root.add(ring(0.73, 0.025, 2.5, cyan));
        root.add(ring(0.765, 0.018, 2.05, cyan));

        // Swept-back wing handles.
        pair(() => fin([[0, 0], [0.35, 0.15], [0.62, 0.75], [0.5, 0.95], [0.25, 0.45], [0, 0.35]], 0.05, chrome), 0.66, 1.65, root);

        // Floating nebula orb with a tilted orbit ring.
        const orbTex = canvasTexture(256, 128, (c) => {
            const r = mulberry32(7);
            c.fillStyle = '#1a0640';
            c.fillRect(0, 0, 256, 128);
            for (let i = 0; i < 40; i++) {
                blob(c, r() * 256, r() * 128, 20 + r() * 40, r() < 0.5 ? 'rgba(160,80,255,0.5)' : 'rgba(0,229,255,0.45)');
            }
        });
        const orb = new THREE.Mesh(
            new THREE.SphereGeometry(0.3, 64, 32),
            new THREE.MeshStandardMaterial({ map: orbTex, emissive: 0xffffff, emissiveMap: orbTex, emissiveIntensity: 1.6, roughness: 0.3 }),
        );
        orb.position.y = 3.05;
        root.add(orb);
        const orbit = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.016, 16, 128), cyan);
        orbit.position.y = 3.05;
        orbit.rotation.set(Math.PI / 2 - 0.35, 0.3, 0);
        root.add(orbit);

        const l1 = new THREE.PointLight(0x00e5ff, 6, 10);
        l1.position.set(2, 2.5, 2);
        const l2 = new THREE.PointLight(0xa050ff, 6, 10);
        l2.position.set(-2, 1.5, 2);
        scene.add(l1, l2);
    },
};

const SUNSCORCH: TrophySpec = {
    id: 'sunscorch',
    background: (ctx, w, h, rand) => {
        verticalGradient(ctx, w, h, [[0, '#1a0703'], [0.45, '#5a1d06'], [0.72, '#d9601a'], [0.78, '#ffb04a'], [1, '#2a1004']]);
        blob(ctx, w * 0.5, h * 0.74, h * 0.5, 'rgba(255,190,90,0.45)');
        // Layered dune silhouettes.
        const dunes: [string, number, number][] = [['#7a3410', 0.76, 0.05], ['#4a1e08', 0.83, 0.07], ['#2a1004', 0.9, 0.06]];
        dunes.forEach(([col, base, amp], k) => {
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.moveTo(0, h);
            for (let x = 0; x <= w; x += 8) {
                const y = h * (base - amp * Math.sin(x / w * Math.PI * (1.6 + k) + k * 1.7) * Math.cos(x / w * 2.3 + k));
                ctx.lineTo(x, y);
            }
            ctx.lineTo(w, h);
            ctx.fill();
        });
        // Rock spires on the horizon.
        ctx.fillStyle = '#3a1606';
        [[0.08, 0.42], [0.15, 0.55], [0.86, 0.48], [0.93, 0.38]].forEach(([x, top]) => {
            ctx.beginPath();
            ctx.moveTo(w * (x - 0.035), h * 0.85);
            ctx.lineTo(w * (x - 0.012), h * top);
            ctx.lineTo(w * (x + 0.015), h * (top + 0.02));
            ctx.lineTo(w * (x + 0.035), h * 0.85);
            ctx.fill();
        });
        // Blowing dust.
        for (let i = 0; i < 260; i++) {
            ctx.fillStyle = `rgba(255,${170 + rand() * 60},${100 + rand() * 60},${rand() * 0.35})`;
            ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 6, 1);
        }
    },
    build: (root, scene) => {
        const gold = metal(0xf2a93b, 0.22, { flatShading: true });
        const sandstone = new THREE.MeshStandardMaterial({ color: 0x7a3a14, roughness: 0.9, flatShading: true });
        const orange = glow(0xff8c1a, 2.4);

        // Hexagonal sandstone plinth ringed by rock spires.
        plinth(root, sandstone, orange, 6);
        const rand = mulberry32(11);
        for (let i = 0; i < 9; i++) {
            const a = (i / 9) * Math.PI * 2 + 0.2;
            const hgt = 0.45 + rand() * 0.7;
            const spire = new THREE.Mesh(new THREE.ConeGeometry(0.16 + rand() * 0.08, hgt, 5), sandstone);
            const r = 1.05 + rand() * 0.15;
            spire.position.set(Math.cos(a) * r, hgt / 2, Math.sin(a) * r);
            spire.rotation.set((rand() - 0.5) * 0.25, rand() * 3, (rand() - 0.5) * 0.25);
            root.add(spire);
        }

        // Faceted gold chalice.
        root.add(lathe([[0.3, 0.54], [0.12, 0.7], [0.1, 1.3], [0.22, 1.5]], 8, gold));
        const bowl = lathe([[0.22, 1.5], [0.62, 1.7], [0.82, 2.1], [0.8, 2.42], [0.74, 2.42]], 8, gold);
        (bowl.material as THREE.Material).side = THREE.DoubleSide;
        bowl.rotation.y = Math.PI / 8;
        root.add(bowl);
        root.add(ring(0.79, 0.025, 2.42, orange));

        // Angular blade handles.
        pair(() => fin([[0, 0], [0.3, 0.02], [0.55, 0.35], [0.62, 0.95], [0.45, 0.6], [0.2, 0.32], [0, 0.3]], 0.06, gold), 0.75, 1.65, root);

        // Sun disk crown: glowing core with radiating spikes.
        const sun = new THREE.Group();
        sun.position.y = 2.95;
        sun.add(new THREE.Mesh(new THREE.SphereGeometry(0.24, 48, 24), glow(0xffb340, 3.0)));
        const spikeMat = glow(0xff7a10, 2.1);
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            const len = i % 2 ? 0.22 : 0.36;
            const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, len, 4), spikeMat);
            spike.position.set(Math.cos(a) * (0.3 + len / 2), Math.sin(a) * (0.3 + len / 2), 0);
            spike.rotation.z = a - Math.PI / 2;
            sun.add(spike);
        }
        root.add(sun);

        const l1 = new THREE.PointLight(0xffa040, 9, 10);
        l1.position.set(1.5, 3.5, 2.5);
        const l2 = new THREE.PointLight(0xff5010, 5, 10);
        l2.position.set(-2, 1, 2);
        scene.add(l1, l2);
    },
};

const SKYLINE: TrophySpec = {
    id: 'skyline',
    background: (ctx, w, h, rand) => {
        verticalGradient(ctx, w, h, [[0, '#06020f'], [0.6, '#1c0630'], [0.85, '#3a0a4a'], [1, '#0a0212']]);
        blob(ctx, w * 0.5, h * 0.8, h * 0.6, 'rgba(255,61,240,0.25)');
        // Two layers of tower silhouettes with lit windows.
        [['#160624', 0.35, 0.55], ['#0b0314', 0.5, 0.7]].forEach(([col, minTop, maxTop]) => {
            let x = 0;
            while (x < w) {
                const bw = 30 + rand() * 60;
                const top = h * ((minTop as number) + rand() * ((maxTop as number) - (minTop as number)));
                ctx.fillStyle = col as string;
                ctx.fillRect(x, top, bw - 4, h - top);
                for (let wy = top + 8; wy < h; wy += 10) {
                    for (let wx = x + 5; wx < x + bw - 10; wx += 8) {
                        if (rand() < 0.18) {
                            ctx.fillStyle = rand() < 0.5 ? 'rgba(255,61,240,0.55)' : 'rgba(0,229,255,0.5)';
                            ctx.fillRect(wx, wy, 3, 4);
                        }
                    }
                }
                x += bw;
            }
        });
        // Rain.
        ctx.strokeStyle = 'rgba(180,200,255,0.18)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 300; i++) {
            const x = rand() * w;
            const y = rand() * h;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - 4, y + 18 + rand() * 14);
            ctx.stroke();
        }
        halo(ctx, w, h, 'rgba(255,61,240,0.12)');
    },
    build: (root, scene) => {
        const chrome = metal(0xb0a4c8, 0.1);
        const glass = new THREE.MeshPhysicalMaterial({ color: 0x2a2240, metalness: 0.4, roughness: 0.3, clearcoat: 0.6 });
        const magenta = glow(0xff3df0, 2.4);
        const cyan = glow(0x00e5ff, 1.8);

        // Square-cut plinth, then a mini city of glass towers around the base.
        plinth(root, glass, magenta, 4);
        root.children.forEach((c) => (c.rotation.y = Math.PI / 4));
        const rand = mulberry32(3);
        for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2;
            const hgt = 0.35 + rand() * 0.8;
            const bw = 0.16 + rand() * 0.12;
            const tower = new THREE.Group();
            tower.add(new THREE.Mesh(new THREE.BoxGeometry(bw, hgt, bw), glass));
            const strip = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.01, 0.025, bw + 0.01), rand() < 0.5 ? magenta : cyan);
            strip.position.y = hgt / 2 - 0.06;
            tower.add(strip);
            const r = 0.9 + rand() * 0.25;
            tower.position.set(Math.cos(a) * r, hgt / 2, Math.sin(a) * r);
            tower.rotation.y = rand() * Math.PI;
            root.add(tower);
        }

        // Twisting chrome spire: a square-section lathe, stacked and rotated.
        const spire = new THREE.Group();
        const profile: [number, number][] = [[0.42, 0.54], [0.26, 0.9], [0.34, 1.3], [0.2, 1.8], [0.27, 2.2], [0.1, 2.75], [0.0, 3.0]];
        for (let i = 0; i < profile.length - 1; i++) {
            const seg = lathe([profile[i], profile[i + 1]], 4, chrome);
            seg.rotation.y = i * 0.22;
            spire.add(seg);
        }
        root.add(spire);
        [0.9, 1.8, 2.45].forEach((y, i) => root.add(ring(0.4 - i * 0.07, 0.018, y, i % 2 ? cyan : magenta)));

        // Neon "wings" that read as skyline handles.
        pair(() => fin([[0, 0], [0.5, 0.25], [0.5, 1.0], [0.38, 1.0], [0.38, 0.35], [0, 0.18]], 0.04, chrome), 0.28, 1.25, root);
        pair(() => {
            const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.62, 0.06), magenta);
            return bar;
        }, 0.75, 1.88, root);

        const top = new THREE.Mesh(new THREE.OctahedronGeometry(0.17), glow(0xff3df0, 3.0));
        top.position.y = 3.22;
        top.scale.y = 1.5;
        root.add(top);

        const l1 = new THREE.PointLight(0xff3df0, 8, 10);
        l1.position.set(-2, 2.2, 2);
        const l2 = new THREE.PointLight(0x00e5ff, 6, 10);
        l2.position.set(2, 1.4, 2);
        scene.add(l1, l2);
    },
};

const CRYO: TrophySpec = {
    id: 'cryo',
    background: (ctx, w, h, rand) => {
        verticalGradient(ctx, w, h, [[0, '#010812'], [0.6, '#04182a'], [1, '#020a14']]);
        stars(ctx, w, h, rand, 160, 0.6);
        // Aurora curtains.
        ctx.globalCompositeOperation = 'lighter';
        const bands: [string, number, number][] = [['61,255,176', 0.28, 0.0], ['0,229,255', 0.36, 1.3], ['160,120,255', 0.22, 2.6]];
        bands.forEach(([rgb, yBase, phase]) => {
            for (let x = 0; x < w; x += 3) {
                const y = h * (yBase + 0.08 * Math.sin(x / w * Math.PI * 2.2 + phase));
                const len = h * (0.18 + 0.1 * Math.sin(x / 37 + phase));
                const g = ctx.createLinearGradient(0, y - len, 0, y);
                g.addColorStop(0, `rgba(${rgb},0)`);
                g.addColorStop(1, `rgba(${rgb},0.09)`);
                ctx.fillStyle = g;
                ctx.fillRect(x, y - len, 3, len);
            }
        });
        ctx.globalCompositeOperation = 'source-over';
        // Glacier ridge.
        ctx.fillStyle = '#0a2236';
        ctx.beginPath();
        ctx.moveTo(0, h);
        let y = h * 0.75;
        for (let x = 0; x <= w; x += 40) {
            y = Math.min(h * 0.86, Math.max(h * 0.62, y + (rand() - 0.5) * 70));
            ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.fill();
        // Snow.
        for (let i = 0; i < 220; i++) {
            ctx.fillStyle = `rgba(230,250,255,${0.2 + rand() * 0.6})`;
            ctx.beginPath();
            ctx.arc(rand() * w, rand() * h, rand() * 2 + 0.5, 0, Math.PI * 2);
            ctx.fill();
        }
        halo(ctx, w, h, 'rgba(159,232,255,0.12)');
    },
    build: (root, scene) => {
        const silver = metal(0xb8c8d8, 0.15);
        const ice = new THREE.MeshPhysicalMaterial({
            color: 0xbff4ff, metalness: 0, roughness: 0.05, transmission: 0.85, thickness: 0.6, ior: 1.31,
            emissive: 0x2a8cff, emissiveIntensity: 0.25, flatShading: true,
        });
        const iceBlue = glow(0x9fe8ff, 2.1);

        plinth(root, silver, iceBlue);
        // Frost chunks scattered round the base.
        const rand = mulberry32(5);
        for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2 + rand() * 0.3;
            const chunk = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1 + rand() * 0.1, 0), ice);
            chunk.position.set(Math.cos(a) * 1.08, 0.08, Math.sin(a) * 1.08);
            chunk.rotation.set(rand() * 3, rand() * 3, rand() * 3);
            root.add(chunk);
        }

        // Silver stem cradling a crown of hexagonal ice crystals.
        root.add(lathe([[0.3, 0.54], [0.1, 0.75], [0.08, 1.3], [0.3, 1.55], [0.55, 1.7], [0.5, 1.72]], 96, silver));
        root.add(ring(0.53, 0.02, 1.71, iceBlue));
        const crystal = (radius: number, len: number) => {
            const g = new THREE.Group();
            const prism = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.85, len, 6), ice);
            prism.position.y = len / 2;
            const tip = new THREE.Mesh(new THREE.ConeGeometry(radius, radius * 1.8, 6), ice);
            tip.position.y = len + radius * 0.9;
            g.add(prism, tip);
            return g;
        };
        const specs: [number, number, number, number][] = [
            // [radius, length, tilt, yaw]
            [0.2, 1.2, 0, 0], [0.14, 0.85, 0.35, 0.3], [0.14, 0.8, 0.38, 2.4], [0.13, 0.7, 0.42, 4.3],
            [0.11, 0.6, 0.6, 1.3], [0.1, 0.55, 0.62, 3.4], [0.1, 0.5, 0.65, 5.3],
        ];
        specs.forEach(([r, len, tilt, yaw]) => {
            const c = crystal(r, len);
            c.position.y = 1.62;
            c.rotation.set(0, yaw, 0);
            c.rotateX(tilt);
            root.add(c);
        });
        // Inner glow so the ice reads lit from within.
        const core = new THREE.PointLight(0x9fe8ff, 6, 3);
        core.position.y = 2.2;
        root.add(core);

        const l1 = new THREE.PointLight(0x3dffb0, 5, 10);
        l1.position.set(-2, 3, 1.5);
        const l2 = new THREE.PointLight(0x9fe8ff, 7, 10);
        l2.position.set(2, 1.5, 2.5);
        scene.add(l1, l2);
    },
};

const INFERNO: TrophySpec = {
    id: 'inferno',
    background: (ctx, w, h, rand) => {
        verticalGradient(ctx, w, h, [[0, '#080101'], [0.55, '#260404'], [0.8, '#6a0f06'], [1, '#120202']]);
        blob(ctx, w * 0.5, h * 0.9, h * 0.6, 'rgba(255,80,20,0.4)');
        // Jagged volcanic ridge with a lava glow along the crest.
        ctx.fillStyle = '#0c0202';
        ctx.beginPath();
        ctx.moveTo(0, h);
        const pts: [number, number][] = [];
        let y = h * 0.8;
        for (let x = 0; x <= w; x += 30) {
            y = Math.min(h * 0.9, Math.max(h * 0.66, y + (rand() - 0.5) * 60));
            pts.push([x, y]);
            ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,90,20,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        pts.forEach(([x, py], i) => (i ? ctx.lineTo(x, py) : ctx.moveTo(x, py)));
        ctx.stroke();
        // Smoke.
        for (let i = 0; i < 14; i++) blob(ctx, rand() * w, rand() * h * 0.5, 80 + rand() * 120, 'rgba(40,20,20,0.35)');
        // Embers.
        for (let i = 0; i < 200; i++) {
            ctx.fillStyle = `rgba(255,${80 + rand() * 120},20,${0.3 + rand() * 0.7})`;
            ctx.beginPath();
            ctx.arc(rand() * w, rand() * h, rand() * 1.8 + 0.4, 0, Math.PI * 2);
            ctx.fill();
        }
        halo(ctx, w, h, 'rgba(255,42,77,0.12)');
    },
    build: (root, scene) => {
        const obsidian = new THREE.MeshPhysicalMaterial({ color: 0x0a0809, metalness: 0.1, roughness: 0.3, clearcoat: 0.6, flatShading: true });
        const iron = metal(0x3a2a2a, 0.35, { flatShading: true });
        const lava = glow(0xff4a10, 2.4);
        const red = glow(0xff2a4d, 1.8);

        // Obsidian plinth on a bed of volcanic rock.
        plinth(root, obsidian, lava, 7);
        const rand = mulberry32(9);
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2 + rand() * 0.3;
            const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12 + rand() * 0.1, 0), obsidian);
            rock.position.set(Math.cos(a) * 1.1, 0.08, Math.sin(a) * 1.1);
            rock.rotation.set(rand() * 3, rand() * 3, rand() * 3);
            root.add(rock);
        }

        // Dark iron cauldron-cup brimming with magma.
        root.add(lathe([[0.32, 0.54], [0.14, 0.72], [0.12, 1.2], [0.24, 1.42]], 9, iron));
        const bowl = lathe([[0.24, 1.42], [0.66, 1.58], [0.86, 1.9], [0.82, 2.25], [0.76, 2.25]], 9, iron);
        (bowl.material as THREE.Material).side = THREE.DoubleSide;
        root.add(bowl);
        // Glowing crack lines down the bowl.
        for (let i = 0; i < 9; i++) {
            const a = (i / 9) * Math.PI * 2 + 0.17;
            const crack = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.55, 0.02), lava);
            crack.position.set(Math.cos(a) * 0.83, 1.92, Math.sin(a) * 0.83);
            crack.rotation.y = -a;
            crack.rotation.z = (rand() - 0.5) * 0.4;
            root.add(crack);
        }
        const magma = new THREE.Mesh(new THREE.CircleGeometry(0.76, 48), glow(0xff6a10, 3.0));
        magma.rotation.x = -Math.PI / 2;
        magma.position.y = 2.15;
        root.add(magma);

        // A crown of flames rising from the rim.
        const flame = (h: number, mat: THREE.Material) => {
            const m = new THREE.Mesh(new THREE.ConeGeometry(0.09, h, 6), mat);
            m.position.y = h / 2;
            return m;
        };
        const flames = 9;
        for (let i = 0; i < flames; i++) {
            const a = (i / flames) * Math.PI * 2;
            const g = new THREE.Group();
            g.add(flame(0.35 + rand() * 0.45, i % 2 ? red : lava));
            g.position.set(Math.cos(a) * 0.55, 2.15, Math.sin(a) * 0.55);
            g.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
            root.add(g);
        }
        const centre = new THREE.Group();
        centre.add(flame(1.0, glow(0xffa030, 3.0)));
        centre.position.y = 2.15;
        root.add(centre);

        // Horn-like handles.
        pair(() => fin([[0, 0], [0.3, 0.1], [0.5, 0.5], [0.55, 1.05], [0.38, 0.6], [0.1, 0.3], [0, 0.28]], 0.06, iron), 0.78, 1.6, root);

        const l1 = new THREE.PointLight(0xff5020, 9, 10);
        l1.position.set(0, 3.2, 1.5);
        const l2 = new THREE.PointLight(0xff2a4d, 5, 10);
        l2.position.set(-2, 1, 2);
        scene.add(l1, l2);
    },
};

export const TROPHIES: TrophySpec[] = [NEBULA, SUNSCORCH, SKYLINE, CRYO, INFERNO];

// ---------------------------------------------------------------- render

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(WIDTH, HEIGHT);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const pmrem = new THREE.PMREMGenerator(renderer);
const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

function renderTrophy(spec: TrophySpec): string {
    const scene = new THREE.Scene();
    scene.environment = envMap;
    scene.environmentIntensity = 0.25;
    scene.background = canvasTexture(WIDTH, HEIGHT, (ctx) => spec.background(ctx, WIDTH, HEIGHT, mulberry32(42)));

    // Key from upper-left, rim from behind-right, so every surface gets a lit
    // side, a shadow side and a highlight edge. Key casts shadows onto the plinth.
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(-3.5, 6, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = key.shadow.camera.bottom = -2.5;
    key.shadow.camera.right = key.shadow.camera.top = 2.5;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 20;
    key.shadow.bias = -0.0005;
    const rim = new THREE.DirectionalLight(0xffffff, 1.2);
    rim.position.set(3, 4, -5);
    scene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.08));

    const root = new THREE.Group();
    spec.build(root, scene);
    // Slight turn so the trophy reads as 3D rather than a flat elevation.
    root.rotation.y = -0.35;
    root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
            o.castShadow = true;
            o.receiveShadow = true;
        }
    });
    scene.add(root);

    const camera = new THREE.PerspectiveCamera(30, WIDTH / HEIGHT, 0.1, 100);
    // Looking slightly down into the bowl shows its opening as an ellipse,
    // the strongest cue that the cup has depth.
    camera.position.set(0, 3.6, 8.4);
    camera.lookAt(0, 1.55, 0);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(WIDTH, HEIGHT), 0.35, 0.4, 1.0));
    composer.addPass(new OutputPass());
    composer.render();
    const url = renderer.domElement.toDataURL('image/jpeg', 0.9);
    composer.dispose();
    return url;
}

const grid = document.getElementById('grid')!;
const results: { id: string; url: string }[] = [];

function download(id: string, url: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = `cup_${id}.jpg`;
    a.click();
}

for (const spec of TROPHIES) {
    const url = renderTrophy(spec);
    results.push({ id: spec.id, url });
    const fig = document.createElement('figure');
    const img = document.createElement('img');
    img.src = url;
    img.title = `cup_${spec.id}.jpg`;
    img.onclick = () => download(spec.id, url);
    const cap = document.createElement('figcaption');
    cap.textContent = `cup_${spec.id}.jpg`;
    fig.append(img, cap);
    grid.append(fig);
}

document.getElementById('download-all')!.onclick = () => results.forEach((r) => download(r.id, r.url));

// Exposed for headless capture (e.g. a Playwright script reading the data URLs).
(window as unknown as { cupTrophies: typeof results }).cupTrophies = results;
