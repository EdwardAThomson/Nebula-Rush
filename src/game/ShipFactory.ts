import * as THREE from 'three';

export interface ShipParts {
    mesh: THREE.Group;
    glows: THREE.Mesh[];
    // Energy beams (e.g. the Rapier's binders): additive cylinders with a
    // bright core as children[0]; Ship.ts animates their flicker and colour.
    beams: THREE.Mesh[];
}

export type ShipType = 'lancer' | 'rapier' | 'sledge' | 'kestrel';

export const SHIP_STATS: Record<ShipType, { accelFactor: number, turnSpeed: number, friction: number, strafeSpeed: number, slideFactor: number, maxEnergy: number }> = {
    // Four hulls, four handling roles (top speed = accelFactor / (1 - friction)).
    lancer: {               // All-rounder: nothing to learn, nothing to exploit.
        accelFactor: 0.56,
        turnSpeed: 0.0011,
        friction: 0.9914,       // Top speed ~65.1
        strafeSpeed: 0.011,
        slideFactor: 0.95,
        maxEnergy: 100
    },
    rapier: {               // Podracer: launches hardest and turns sharpest, but the
        accelFactor: 0.72,  // towed pod hangs out wide in corners and the plating is thin.
        turnSpeed: 0.0014,
        friction: 0.9890,       // Top speed ~65.5
        strafeSpeed: 0.012,
        slideFactor: 0.985,     // Big drift
        maxEnergy: 80
    },
    sledge: {               // Landspeeder: grip and armour, slowest on the straights.
        accelFactor: 0.74,
        turnSpeed: 0.0011,
        friction: 0.9884,       // Top speed ~63.8
        strafeSpeed: 0.018,
        slideFactor: 0.92,      // Snappy
        maxEnergy: 140
    },
    kestrel: {              // Air racer: highest top speed, slow off the line, slippery.
        accelFactor: 0.46,
        turnSpeed: 0.0009,
        friction: 0.9931,       // Top speed ~66.7
        strafeSpeed: 0.009,
        slideFactor: 0.975,
        maxEnergy: 90
    }
};

// Caches
const geometryCache: Record<string, THREE.BufferGeometry> = {};
const materialCache: Record<string, THREE.Material> = {};

// --- Lofted hull helper -------------------------------------------------
// Sweeps a rounded cross-section through a list of stations along +Z, so a
// hull tapers like a real fuselage instead of being a constant-radius capsule
// with a bullet glued on the front. Each station gives the half-width (w),
// half-height (h) and centre height (y) at that z; the values are smoothed
// with a Catmull-Rom curve so the taper blends between stations.
//   n     — superellipse exponent: 2 = ellipse, higher squares the shoulders
//   belly — squashes the lower half (1 = round, 0.5 = flat-bottomed)
interface LoftStation { z: number; w: number; h: number; y: number }

const createLoftGeometry = (
    stations: LoftStation[],
    opts: { rings?: number; segments?: number; n?: number; belly?: number; capStart?: boolean; capEnd?: boolean } = {}
): THREE.BufferGeometry => {
    const { rings = 40, segments = 36, n = 2.6, belly = 0.6, capStart = false, capEnd = true } = opts;
    const sizeCurve = new THREE.CatmullRomCurve3(stations.map(s => new THREE.Vector3(s.z, s.w, s.h)), false, 'centripetal');
    const yCurve = new THREE.CatmullRomCurve3(stations.map(s => new THREE.Vector3(s.z, s.y, 0)), false, 'centripetal');
    const expo = 2 / n;
    const sp = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), expo);

    const positions: number[] = [];
    const indices: number[] = [];
    const ringAt = (u: number) => {
        const s = sizeCurve.getPoint(u);          // (z, w, h)
        const yc = yCurve.getPoint(u).y;
        const ring: [number, number, number][] = [];
        for (let j = 0; j <= segments; j++) {
            const th = (j / segments) * Math.PI * 2;
            const cx = sp(Math.cos(th)), cy = sp(Math.sin(th));
            // Belly squash eases in from the equator (zero slope there) so the
            // lower half flattens without a crease along the hull sides.
            const squash = cy < 0 ? 1 - (1 - belly) * cy * cy : 1;
            ring.push([s.y * cx, yc + s.z * cy * squash, s.x]);
        }
        return { ring, centre: [0, yc, s.x] as [number, number, number] };
    };

    for (let i = 0; i <= rings; i++) {
        ringAt(i / rings).ring.forEach(p => positions.push(...p));
    }
    for (let i = 0; i < rings; i++) {
        for (let j = 0; j < segments; j++) {
            const a = i * (segments + 1) + j;
            const b = a + segments + 1;
            indices.push(a, a + 1, b, a + 1, b + 1, b);   // outward-facing
        }
    }
    // Caps use their own copy of the rim so the flat face keeps a hard edge
    // instead of blending into the side normals.
    const addCap = (u: number, facing: 1 | -1) => {
        const { ring, centre } = ringAt(u);
        const c = positions.length / 3;
        positions.push(...centre);
        ring.forEach(p => positions.push(...p));
        for (let j = 0; j < segments; j++) {
            if (facing > 0) indices.push(c, c + 1 + j, c + 2 + j);
            else indices.push(c, c + 2 + j, c + 1 + j);
        }
    };
    if (capStart) addCap(0, -1);
    if (capEnd) addCap(1, 1);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    // Each ring's first and last vertex share a position but not faces, so
    // their normals come out one-sided; average them to hide the seam.
    const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
    const avg = new THREE.Vector3();
    for (let i = 0; i <= rings; i++) {
        const a = i * (segments + 1), b = a + segments;
        avg.set(nrm.getX(a) + nrm.getX(b), nrm.getY(a) + nrm.getY(b), nrm.getZ(a) + nrm.getZ(b)).normalize();
        nrm.setXYZ(a, avg.x, avg.y, avg.z);
        nrm.setXYZ(b, avg.x, avg.y, avg.z);
    }
    return geo;
};

// Lofted aerofoil panel: a wing, fin, strut or spoiler with a real section
// (rounded leading edge, sharp trailing edge) instead of an extruded slab
// with a blunt face all the way round. Built in ship space: span runs along
// +X from the root at x = 0, chord along +Z with the root chord centred on
// z = 0 (leading edge forward, at lower Z), thickness along Y, symmetric
// about y = 0. Mirror with dir = -1.
//   sweep        — how far aft the tip's leading edge sits from the root's
//   thickness    — root max thickness as a fraction of chord (NACA 00xx)
//   tipRound     — fraction of span over which the leading edge curves aft
//                  to meet the trailing edge in a rounded tip (0 = square
//                  tip, capped, for a panel that buries its tip in something)
interface AerofoilOpts {
    span: number; rootChord: number; tipChord: number; sweep?: number;
    thickness?: number; tipThickness?: number; tipRound?: number; dir?: 1 | -1;
    spanSegments?: number; chordSegments?: number;
}
const createAerofoilGeometry = (o: AerofoilOpts): THREE.BufferGeometry => {
    const {
        span, rootChord, tipChord, sweep = 0, thickness = 0.1, tipThickness = thickness * 0.75,
        tipRound = 0.3, dir = 1, spanSegments = 14, chordSegments = 14,
    } = o;
    const M = chordSegments * 2;          // points around one section: TE -> upper -> LE -> lower -> TE
    // NACA 00xx half-thickness as a fraction of chord (closed trailing edge).
    const half = (x: number, t: number) =>
        5 * t * (0.2969 * Math.sqrt(x) - 0.1260 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    const rootTE = rootChord / 2;
    const tipTE = -rootChord / 2 + sweep + tipChord;
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= spanSegments; i++) {
        const u = i / spanSegments;
        let chord = rootChord + (tipChord - rootChord) * u;
        if (tipRound > 0 && u > 1 - tipRound) {
            const k = (u - (1 - tipRound)) / tipRound;
            chord *= Math.sqrt(Math.max(0, 1 - k * k));   // elliptical fall-off into the tip
        }
        chord = Math.max(chord, 0.01);
        const te = rootTE + (tipTE - rootTE) * u;
        const le = te - chord;
        const t = thickness + (tipThickness - thickness) * u;
        for (let k = 0; k <= M; k++) {
            const xc = (1 + Math.cos((k / M) * Math.PI * 2)) / 2;      // cosine spacing: dense at LE and TE
            const y = (k <= M / 2 ? 1 : -1) * half(xc, t) * chord;
            positions.push(dir * u * span, y, le + xc * chord);
        }
    }
    const tri = (a: number, b: number, c: number) => (dir > 0 ? indices.push(a, b, c) : indices.push(a, c, b));
    for (let i = 0; i < spanSegments; i++) {
        for (let k = 0; k < M; k++) {
            const a = i * (M + 1) + k, b = a + 1, c = a + M + 1, d = c + 1;
            tri(a, c, b);
            tri(b, c, d);
        }
    }
    // Flat caps: always at the root (buried in whatever carries the panel),
    // and at the tip when it is square rather than rounded.
    const cap = (ring: number, flip: boolean) => {
        const base = positions.length / 3;
        let cz = 0, cy = 0;
        for (let k = 0; k < M; k++) { cy += positions[(ring + k) * 3 + 1]; cz += positions[(ring + k) * 3 + 2]; }
        positions.push(positions[ring * 3], cy / M, cz / M);
        for (let k = 0; k <= M; k++) positions.push(positions[(ring + k) * 3], positions[(ring + k) * 3 + 1], positions[(ring + k) * 3 + 2]);
        for (let k = 0; k < M; k++) {
            if (flip) tri(base, base + 2 + k, base + 1 + k);
            else tri(base, base + 1 + k, base + 2 + k);
        }
    };
    cap(0, false);
    if (tipRound <= 0) cap(spanSegments * (M + 1), true);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
};

export const createShip = (color: number = 0xd9531e, type: ShipType = 'lancer', accentColor: number = 0xeeeeee): ShipParts => {
    const ship = new THREE.Group();
    const glows: THREE.Mesh[] = [];
    const beams: THREE.Mesh[] = [];

    // Helper: Get or Create Material
    const getMaterial = (
        name: string,
        params: THREE.MeshPhongMaterialParameters | THREE.MeshBasicMaterialParameters | THREE.MeshStandardMaterialParameters,
        Type: typeof THREE.MeshPhongMaterial | typeof THREE.MeshBasicMaterial | typeof THREE.MeshStandardMaterial = THREE.MeshPhongMaterial
    ) => {
        const key = `${name}_${JSON.stringify(params)}`;
        if (!materialCache[key]) {
            materialCache[key] = new Type(params as any);
        }
        return materialCache[key];
    };

    // envMapIntensity boosts how much the IBL contributes vs direct lights.
    // In-game the directional light is intentionally bright (4.0 at day) so
    // without this boost the PBR reflections get washed out.
    const envBoost = 2.5;
    const glowMaterial = getMaterial('glow', { color: 0x00ffff, transparent: true, opacity: 0.9 }, THREE.MeshBasicMaterial) as THREE.MeshBasicMaterial;

    // Helper: Get or Create Geometry
    const getGeometry = (name: string, factory: () => THREE.BufferGeometry) => {
        if (!geometryCache[name]) {
            geometryCache[name] = factory();
        }
        return geometryCache[name];
    };

    // --- SHARED VISUALS (Moved to top for usage during ship construction) ---
    // Afterburner Spray
    const sprayGeometry = getGeometry('spray', () => {
        const geo = new THREE.ConeGeometry(0.35, 2.0, 20, 1, true);
        geo.translate(0, 1.0, 0);
        return geo;
    });

    const sprayMaterial = getMaterial('spray', {
        color: 0x00ffff,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    }, THREE.MeshBasicMaterial);

    // Bright inner core cone — narrower and hotter (near-white), nested inside
    // the outer spray so the flame has a hot centre instead of a flat wash.
    const coreGeometry = getGeometry('spray_core', () => {
        const geo = new THREE.ConeGeometry(0.18, 1.6, 16, 1, true);
        geo.translate(0, 0.8, 0);
        return geo;
    });

    const coreMaterial = getMaterial('spray_core', {
        color: 0xeaf6ff,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    }, THREE.MeshBasicMaterial);

    const glowGeometry = getGeometry('glow_sphere', () => new THREE.SphereGeometry(0.3, 8, 8));

    const addGlow = (pos: THREE.Vector3, parent: THREE.Object3D = ship) => {
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.position.copy(pos);
        parent.add(glow);

        const spray = new THREE.Mesh(sprayGeometry, sprayMaterial); // children[0]: outer flame
        spray.rotation.x = Math.PI / 2;
        spray.scale.set(exhaustScale, 1, exhaustScale);
        glow.add(spray);

        const core = new THREE.Mesh(coreGeometry, coreMaterial);   // children[1]: hot inner core
        core.rotation.x = Math.PI / 2;
        core.scale.set(exhaustScale, 1, exhaustScale);
        glow.add(core);

        glows.push(glow);
        return glow;
    };

    const enginePositions: THREE.Vector3[] = [];
    let exhaustScale = 1.0;

    // --- Prototype toolkit (design mockups: lancer, rapier, sledge, kestrel) ---
    // Materials: painted-metal hull (lower metalness than the chrome of the
    // original five, so paint reads as paint), accent trim, gunmetal engine
    // pods, matte-black intake/nozzle interiors (double-sided because those
    // lathe profiles run "backwards"), and a smoked-glass canopy. Built
    // lazily so the original ships never allocate them.
    const protoMats = () => ({
        hullMat: getMaterial('proto_hull', { color, metalness: 0.55, roughness: 0.42, envMapIntensity: envBoost }, THREE.MeshStandardMaterial),
        trimMat: getMaterial('proto_trim', { color: accentColor, metalness: 0.5, roughness: 0.45, envMapIntensity: envBoost }, THREE.MeshStandardMaterial),
        nacelleMat: getMaterial('proto_nacelle', { color: 0x2b2f36, metalness: 0.9, roughness: 0.38, envMapIntensity: envBoost }, THREE.MeshStandardMaterial),
        intakeMat: getMaterial('proto_intake', { color: 0x0b0d10, metalness: 0.3, roughness: 0.9, side: THREE.DoubleSide }, THREE.MeshStandardMaterial),
        canopyMat: getMaterial('proto_canopy', { color: 0x16323a, metalness: 0.2, roughness: 0.08, transparent: true, opacity: 0.82, envMapIntensity: envBoost }, THREE.MeshStandardMaterial),
    });
    type ProtoMats = ReturnType<typeof protoMats>;

    // Engine pod: a lathe-turned nacelle with an intake lip and spinner cone,
    // a gentle boat-tail and a recessed nozzle with a lit ring. The profile is
    // the Lancer's (radius 0.74, length 4.05) scaled to r / len. Pod-local +Z
    // is aft with the intake lip at z = 0; glowZ is where the exhaust belongs.
    const makeNacelle = (key: string, r: number, len: number, mats: ProtoMats) => {
        const rs = r / 0.74, ls = len / 4.05;
        const P = (pr: number, pa: number) => new THREE.Vector2(pr * rs, pa * ls);
        const outerGeo = getGeometry(`${key}_outer`, () => new THREE.LatheGeometry([
            P(0.52, 0.02), P(0.66, 0.00), P(0.72, 0.25), P(0.74, 1.10), P(0.72, 2.40), P(0.62, 3.40), P(0.50, 3.95), P(0.44, 4.05),
        ], 36));
        const intakeGeo = getGeometry(`${key}_intake`, () => new THREE.LatheGeometry([P(0.52, 0.02), P(0.26, 0.42)], 36));
        const nozzleGeo = getGeometry(`${key}_nozzle`, () => new THREE.LatheGeometry([P(0.44, 4.05), P(0.36, 4.05), P(0.36, 3.60), P(0.0, 3.60)], 36));
        const spinnerGeo = getGeometry(`${key}_spinner`, () => new THREE.ConeGeometry(0.26 * rs, 0.55 * ls, 24));
        const ringGeo = getGeometry(`${key}_ring`, () => new THREE.TorusGeometry(0.40 * rs, 0.03, 8, 36));

        const pod = new THREE.Group();
        const turned = new THREE.Group();              // lathe axis (+Y) -> pod +Z
        turned.rotation.x = Math.PI / 2;
        turned.add(new THREE.Mesh(outerGeo, mats.nacelleMat));
        turned.add(new THREE.Mesh(intakeGeo, mats.intakeMat));
        turned.add(new THREE.Mesh(nozzleGeo, mats.intakeMat));
        const spinner = new THREE.Mesh(spinnerGeo, mats.nacelleMat);
        spinner.rotation.x = Math.PI;                  // cone tip -> forward
        spinner.position.y = 0.2 * ls;
        turned.add(spinner);
        pod.add(turned);
        const ring = new THREE.Mesh(ringGeo, glowMaterial);
        ring.position.z = 4.0 * ls;
        pod.add(ring);
        return { pod, glowZ: 3.9 * ls };
    };

    // Swept fin with an aerofoil section and a rounded tip, standing in the
    // YZ plane: root leading edge at the origin, chord running aft along +Z,
    // height along +Y. `thickness` is the root's max thickness in world
    // units. Cant it with a parent pivot's rotation.z.
    const makeFinGeometry = (key: string, chord: number, height: number, thickness = 0.12) =>
        getGeometry(key, () => {
            const geo = createAerofoilGeometry({
                span: height, rootChord: chord, tipChord: 0.5 * chord, sweep: 0.45 * chord,
                thickness: thickness / chord, tipRound: 0.4,
            });
            geo.rotateZ(Math.PI / 2);                  // span +X -> +Y (up)
            geo.translate(0, 0, chord / 2);            // root leading edge at z = 0
            return geo;
        });
    const addFin = (geo: THREE.BufferGeometry, material: THREE.Material, pos: THREE.Vector3, cant: number) => {
        const pivot = new THREE.Group();
        pivot.position.copy(pos);
        pivot.rotation.z = cant;
        pivot.add(new THREE.Mesh(geo, material));
        ship.add(pivot);
        return pivot;
    };

    // Thin strut between two points (cylinder along its local Y, re-aimed).
    const addStrut = (geo: THREE.BufferGeometry, material: THREE.Material, from: THREE.Vector3, to: THREE.Vector3) => {
        const strut = new THREE.Mesh(geo, material);
        strut.scale.y = from.distanceTo(to);
        strut.position.copy(from).lerp(to, 0.5);
        strut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
        ship.add(strut);
    };

    if (type === 'lancer') {
        exhaustScale = 1.4;
        // --- LANCER (design mockup 1: "reads as one ship") ---
        // Built around a single lofted fuselage that tapers nose-to-tail, with
        // two big outboard engine nacelles carried on short swept wing stubs,
        // a bubble canopy that blends into a dorsal spine, and a V-tail. The
        // goal is a strong, legible silhouette (long low hull, wide stance,
        // obvious engines) with a few deliberate details instead of greebles.
        // Forward is -Z; the hull spans Z -4.2 (nose tip) .. +3.4 (tail cap).
        // The nacelles sit low and forward (Z -1.5 .. +2.5) so the hull and
        // V-tail stay visible above and behind them.
        const mats = protoMats();
        const { hullMat, trimMat, nacelleMat, intakeMat, canopyMat } = mats;

        // 1. Fuselage: flat-bellied loft, widest around the cockpit, with the
        //    centreline rising slightly toward the tail for a racing rake.
        const hullGeo = getGeometry('lancer_hull', () => createLoftGeometry([
            { z: -4.2, w: 0.04, h: 0.03, y: 0.34 },
            { z: -3.5, w: 0.28, h: 0.19, y: 0.36 },
            { z: -2.5, w: 0.66, h: 0.40, y: 0.41 },
            { z: -1.3, w: 0.98, h: 0.58, y: 0.48 },
            { z: 0.0, w: 1.04, h: 0.62, y: 0.52 },
            { z: 1.4, w: 0.92, h: 0.56, y: 0.56 },
            { z: 2.7, w: 0.66, h: 0.42, y: 0.60 },
            { z: 3.4, w: 0.48, h: 0.30, y: 0.62 },
        ], { n: 2.6, belly: 0.55, capEnd: true }));
        ship.add(new THREE.Mesh(hullGeo, hullMat));

        // 2. Canopy: a bubble loft sitting on the hull top, with a dark sill
        //    plate under it so the glass has a frame.
        const canopyStations: LoftStation[] = [
            { z: -2.0, w: 0.04, h: 0.03, y: 0.96 },
            { z: -1.4, w: 0.30, h: 0.22, y: 0.99 },
            { z: -0.6, w: 0.40, h: 0.36, y: 1.03 },
            { z: 0.3, w: 0.36, h: 0.30, y: 1.07 },
            { z: 0.9, w: 0.22, h: 0.12, y: 1.09 },
        ];
        const canopyGeo = getGeometry('lancer_canopy', () => createLoftGeometry(canopyStations, { n: 2.2, belly: 0.15, capEnd: true }));
        ship.add(new THREE.Mesh(canopyGeo, canopyMat));
        const sillGeo = getGeometry('lancer_canopy_sill', () => createLoftGeometry(
            canopyStations.map(s => ({ z: s.z, w: s.w + 0.06, h: Math.max(0.03, s.h * 0.3), y: s.y - 0.03 })),
            { n: 2.2, belly: 0.2, capEnd: true }
        ));
        ship.add(new THREE.Mesh(sillGeo, nacelleMat));

        // 3. Dorsal spine: fairing from the back of the canopy down to the tail.
        const spineGeo = getGeometry('lancer_spine', () => createLoftGeometry([
            { z: 0.2, w: 0.30, h: 0.30, y: 1.05 },
            { z: 1.4, w: 0.26, h: 0.26, y: 1.02 },
            { z: 2.6, w: 0.16, h: 0.16, y: 0.98 },
            { z: 3.4, w: 0.08, h: 0.06, y: 0.94 },
        ], { n: 2.2, belly: 0.2, capEnd: true }));
        ship.add(new THREE.Mesh(spineGeo, hullMat));

        // 4. Wing stubs: short swept panels that carry the nacelles. Root is
        //    buried in the hull side, tip buried in the nacelle, so the engines
        //    are visibly attached rather than floating alongside.
        const nacelleX = 2.1, nacelleY = 0.06, nacelleFront = -1.5;
        ([1, -1] as const).forEach(dir => {
            const geo = getGeometry(`lancer_stub_${dir}`, () => createAerofoilGeometry({
                span: 1.6, rootChord: 2.6, tipChord: 1.6, sweep: 0.8, thickness: 0.09, tipRound: 0, dir,
            }));
            const stub = new THREE.Mesh(geo, hullMat);
            stub.position.set(dir * 0.75, nacelleY, 0.0);
            ship.add(stub);
        });

        // 5. Engine nacelles, with one accent band forward and a dark groove aft.
        const bandGeo = getGeometry('lancer_nacelle_band', () => new THREE.TorusGeometry(0.75, 0.03, 8, 36));
        const grooveGeo = getGeometry('lancer_nacelle_groove', () => new THREE.TorusGeometry(0.72, 0.035, 8, 36));
        [-nacelleX, nacelleX].forEach(ex => {
            const { pod, glowZ } = makeNacelle('lancer_pod', 0.74, 4.05, mats);
            pod.position.set(ex, nacelleY, nacelleFront);
            const band = new THREE.Mesh(bandGeo, trimMat);
            band.position.z = 0.8;
            pod.add(band);
            const groove = new THREE.Mesh(grooveGeo, intakeMat);
            groove.position.z = 2.7;
            pod.add(groove);
            ship.add(pod);
            enginePositions.push(new THREE.Vector3(ex, nacelleY, nacelleFront + glowZ));
        });

        // 6. V-tail: two fins canted 38° outward from the spine.
        const vFinGeo = makeFinGeometry('lancer_vfin', 1.4, 1.05);
        ([1, -1] as const).forEach(dir => {
            addFin(vFinGeo, trimMat, new THREE.Vector3(dir * 0.16, 0.92, 1.9), -dir * 0.66);
        });

        // 7. Nose canards: small swept foreplanes.
        ([1, -1] as const).forEach(dir => {
            const geo = getGeometry(`lancer_canard_${dir}`, () => createAerofoilGeometry({
                span: 0.75, rootChord: 0.7, tipChord: 0.4, sweep: 0.28, thickness: 0.1, tipRound: 0.35, dir,
            }));
            const canard = new THREE.Mesh(geo, trimMat);
            canard.position.set(dir * 0.45, 0.45, -2.6);
            ship.add(canard);
        });

        // 8. Side vents behind the canopy: the one panel detail.
        const ventGeo = getGeometry('lancer_vent', () => new THREE.BoxGeometry(0.06, 0.16, 0.5));
        [-0.99, 0.99].forEach(vx => {
            const vent = new THREE.Mesh(ventGeo, nacelleMat);
            vent.position.set(vx, 0.6, 0.6);
            ship.add(vent);
        });

    } else if (type === 'rapier') {
        exhaustScale = 1.6;
        // --- RAPIER (design mockup 2: podracer layout) ---
        // Two oversized engines out front carrying the paint, a glowing energy
        // binder between them, and a small open-cockpit pod trailing behind on
        // a pair of tow struts. Almost all the mass is engine, by design.
        // Forward is -Z. Engines Z -4.0 .. +0.4, pod Z +0.9 .. +3.8.
        const mats = protoMats();
        const { hullMat, trimMat, nacelleMat, intakeMat, canopyMat } = mats;
        const engX = 1.75, engY = 0.35, engFront = -4.0, engLen = 4.4, engR = 0.82;

        // 1. Engines: painted pods (the engines ARE the ship), each with a dark
        //    cooling groove and a swept control vane on top.
        const grooveGeo = getGeometry('rapier_groove', () => new THREE.TorusGeometry(engR - 0.02, 0.04, 8, 36));
        const vaneGeo = makeFinGeometry('rapier_vane', 1.1, 0.6);
        [-engX, engX].forEach(ex => {
            const { pod, glowZ } = makeNacelle('rapier_pod', engR, engLen, { ...mats, nacelleMat: hullMat });
            pod.position.set(ex, engY, engFront);
            [1.6, 3.0].forEach(gz => {
                const groove = new THREE.Mesh(grooveGeo, intakeMat);
                groove.position.z = gz;
                pod.add(groove);
            });
            ship.add(pod);
            enginePositions.push(new THREE.Vector3(ex, engY, engFront + glowZ));
            addFin(vaneGeo, trimMat, new THREE.Vector3(ex, engY + engR - 0.06, engFront + 1.9), 0);
        });

        // 2. Energy binders: two violet beams spanning the engines (one near
        //    the intakes, one further back), each with a bright core and dark
        //    emitter nubs at both ends. Ship.ts animates their flicker/colour.
        const beamGeo = getGeometry('rapier_beam', () => new THREE.CylinderGeometry(0.09, 0.09, 1, 12, 1, true));
        const beamCoreGeo = getGeometry('rapier_beam_core', () => new THREE.CylinderGeometry(0.032, 0.032, 1, 8));
        const beamMat = getMaterial('rapier_beam', { color: 0x8a5cff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }, THREE.MeshBasicMaterial);
        const beamCoreMat = getMaterial('rapier_beam_core', { color: 0xeef4ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }, THREE.MeshBasicMaterial);
        const nubGeo = getGeometry('rapier_nub', () => new THREE.BoxGeometry(0.22, 0.22, 0.3));
        ([[engFront + 1.0, engY + 0.15], [engFront + 3.1, engY - 0.1]] as [number, number][]).forEach(([bz, by]) => {
            const beam = new THREE.Mesh(beamGeo, beamMat);
            beam.rotation.z = Math.PI / 2;
            beam.scale.y = 2 * (engX - engR) + 0.2;        // the core child inherits the length
            beam.position.set(0, by, bz);
            beam.add(new THREE.Mesh(beamCoreGeo, beamCoreMat));
            ship.add(beam);
            beams.push(beam);
            [-1, 1].forEach(dir => {
                const nub = new THREE.Mesh(nubGeo, nacelleMat);
                nub.position.set(dir * (engX - engR + 0.02), by, bz);
                ship.add(nub);
            });
        });

        // 3. Pod: a small lofted cockpit tub, low and behind the engines, under
        //    an enclosed bubble canopy with a dark sill.
        const tubGeo = getGeometry('rapier_tub', () => createLoftGeometry([
            { z: 0.9, w: 0.08, h: 0.06, y: 0.30 },
            { z: 1.4, w: 0.42, h: 0.30, y: 0.34 },
            { z: 2.2, w: 0.55, h: 0.40, y: 0.38 },
            { z: 3.0, w: 0.50, h: 0.42, y: 0.42 },
            { z: 3.8, w: 0.30, h: 0.28, y: 0.46 },
        ], { n: 2.6, belly: 0.5, capEnd: true }));
        ship.add(new THREE.Mesh(tubGeo, hullMat));
        const podCanopy: LoftStation[] = [
            { z: 1.5, w: 0.05, h: 0.04, y: 0.66 },
            { z: 2.0, w: 0.34, h: 0.26, y: 0.72 },
            { z: 2.6, w: 0.40, h: 0.32, y: 0.76 },
            { z: 3.2, w: 0.32, h: 0.24, y: 0.78 },
            { z: 3.7, w: 0.10, h: 0.06, y: 0.76 },
        ];
        const podCanopyGeo = getGeometry('rapier_canopy', () => createLoftGeometry(podCanopy, { n: 2.2, belly: 0.6, capEnd: true }));
        ship.add(new THREE.Mesh(podCanopyGeo, canopyMat));
        const podSillGeo = getGeometry('rapier_canopy_sill', () => createLoftGeometry(
            podCanopy.map(s => ({ z: s.z, w: s.w + 0.05, h: Math.max(0.03, s.h * 0.3), y: s.y - 0.02 })),
            { n: 2.2, belly: 0.6, capEnd: true }
        ));
        ship.add(new THREE.Mesh(podSillGeo, nacelleMat));

        // 4. Tow struts: from each engine's rear to the pod's nose.
        const strutGeo = getGeometry('rapier_strut', () => new THREE.CylinderGeometry(0.05, 0.05, 1, 8));
        [-1, 1].forEach(dir => {
            addStrut(strutGeo, nacelleMat,
                new THREE.Vector3(dir * (engX - 0.3), engY, engFront + engLen - 0.3),
                new THREE.Vector3(dir * 0.25, 0.36, 1.5));
        });

    } else if (type === 'sledge') {
        exhaustScale = 1.0;
        // --- SLEDGE (design mockup 3: landspeeder) ---
        // One low, wide slab of a hull with an open cockpit and three turbines
        // across the tail. Reads as a hover car rather than a plane.
        // Forward is -Z; hull Z -3.6 .. +2.6, turbines out to +4.0.
        const mats = protoMats();
        const { hullMat, trimMat, nacelleMat, canopyMat } = mats;

        // 1. Hull: squared-shoulder slab, flat belly, rounded nose.
        const hullGeo = getGeometry('sledge_hull', () => createLoftGeometry([
            { z: -3.7, w: 0.08, h: 0.04, y: 0.31 },
            { z: -3.4, w: 0.55, h: 0.14, y: 0.31 },
            { z: -3.0, w: 0.95, h: 0.22, y: 0.32 },
            { z: -2.0, w: 1.55, h: 0.32, y: 0.36 },
            { z: -0.8, w: 1.85, h: 0.40, y: 0.40 },
            { z: 0.6, w: 1.85, h: 0.42, y: 0.42 },
            { z: 1.8, w: 1.65, h: 0.40, y: 0.44 },
            { z: 2.6, w: 1.30, h: 0.34, y: 0.46 },
        ], { n: 3.2, belly: 0.55, capStart: true, capEnd: true }));
        ship.add(new THREE.Mesh(hullGeo, hullMat));

        // 2. Bonnet stripe (trim ribbon riding just above the hull top) and
        //    twin light bars at the nose.
        const stripeGeo = getGeometry('sledge_stripe', () => createLoftGeometry([
            { z: -3.3, w: 0.10, h: 0.025, y: 0.50 },
            { z: -3.0, w: 0.18, h: 0.025, y: 0.575 },
            { z: -2.0, w: 0.22, h: 0.025, y: 0.715 },
            { z: -1.0, w: 0.22, h: 0.025, y: 0.825 },
        ], { n: 3.0, belly: 1.0, capStart: true, capEnd: true }));
        ship.add(new THREE.Mesh(stripeGeo, trimMat));
        const lightGeo = getGeometry('sledge_light', () => new THREE.BoxGeometry(0.34, 0.06, 0.06));
        [-0.55, 0.55].forEach(lx => {
            const light = new THREE.Mesh(lightGeo, glowMaterial);
            light.position.set(lx, 0.52, -3.08);
            ship.add(light);
        });

        // 3. Enclosed cockpit: a wide, low bubble canopy on a dark sill, its
        //    lower half buried in the slab so there is no exposed pane.
        const canopyStations: LoftStation[] = [
            { z: -1.3, w: 0.06, h: 0.04, y: 0.70 },
            { z: -0.7, w: 0.50, h: 0.30, y: 0.76 },
            { z: 0.1, w: 0.62, h: 0.40, y: 0.80 },
            { z: 0.9, w: 0.56, h: 0.34, y: 0.82 },
            { z: 1.7, w: 0.30, h: 0.14, y: 0.82 },
            { z: 2.1, w: 0.08, h: 0.04, y: 0.80 },
        ];
        const canopyGeo = getGeometry('sledge_canopy', () => createLoftGeometry(canopyStations, { n: 2.4, belly: 0.6, capEnd: true }));
        ship.add(new THREE.Mesh(canopyGeo, canopyMat));
        const sillGeo = getGeometry('sledge_canopy_sill', () => createLoftGeometry(
            canopyStations.map(s => ({ z: s.z, w: s.w + 0.06, h: Math.max(0.03, s.h * 0.25), y: s.y - 0.02 })),
            { n: 2.4, belly: 0.6, capEnd: true }
        ));
        ship.add(new THREE.Mesh(sillGeo, nacelleMat));

        // 4. Three turbines across the tail: a big outer pair and a smaller,
        //    higher centre unit.
        [-1.15, 1.15].forEach(ex => {
            const { pod, glowZ } = makeNacelle('sledge_turbine', 0.5, 2.0, mats);
            pod.position.set(ex, 0.42, 2.0);
            ship.add(pod);
            enginePositions.push(new THREE.Vector3(ex, 0.42, 2.0 + glowZ));
        });
        {
            const { pod, glowZ } = makeNacelle('sledge_turbine_c', 0.4, 1.8, mats);
            pod.position.set(0, 0.72, 2.2);
            ship.add(pod);
            enginePositions.push(new THREE.Vector3(0, 0.72, 2.2 + glowZ));
        }

        // 5. Rear spoiler: an aerofoil (two halves meeting at the centre, with
        //    rounded ends) on two aerofoil-section posts. It rides high, just
        //    ahead of the turbines, so it sits over the hull rather than
        //    across the engine mouths.
        ([1, -1] as const).forEach(dir => {
            const geo = getGeometry(`sledge_spoiler_${dir}`, () => createAerofoilGeometry({
                span: 1.15, rootChord: 0.44, tipChord: 0.40, thickness: 0.14, tipThickness: 0.12, tipRound: 0.25, dir,
            }));
            const half = new THREE.Mesh(geo, trimMat);
            half.position.set(0, 1.3, 1.6);
            half.rotation.x = -0.15;
            ship.add(half);
        });
        const postGeo = getGeometry('sledge_post', () => {
            const geo = createAerofoilGeometry({ span: 0.5, rootChord: 0.3, tipChord: 0.3, thickness: 0.25, tipThickness: 0.25, tipRound: 0 });
            geo.rotateZ(Math.PI / 2);                  // stand it up
            return geo;
        });
        [-0.9, 0.9].forEach(px => {
            const post = new THREE.Mesh(postGeo, nacelleMat);
            post.position.set(px, 0.81, 1.6);
            ship.add(post);
        });

    } else {
        exhaustScale = 1.3;
        // --- KESTREL (design mockup 4: racing plane) ---
        // Slim round fuselage with a long bubble canopy, a big swept main wing,
        // canards, twin canted tails, and one engine buried in the tail fed by
        // side intakes. The air-racer option.
        // Forward is -Z; fuselage Z -4.4 .. +3.6, engine nozzle to +4.6.
        const mats = protoMats();
        const { hullMat, trimMat, nacelleMat, intakeMat, canopyMat } = mats;

        // 1. Fuselage: round section, long nose, slight taper to the tail.
        const hullGeo = getGeometry('kestrel_hull', () => createLoftGeometry([
            { z: -4.4, w: 0.05, h: 0.05, y: 0.45 },
            { z: -3.6, w: 0.30, h: 0.28, y: 0.46 },
            { z: -2.4, w: 0.55, h: 0.52, y: 0.48 },
            { z: -1.0, w: 0.66, h: 0.62, y: 0.50 },
            { z: 0.6, w: 0.68, h: 0.64, y: 0.52 },
            { z: 2.0, w: 0.64, h: 0.60, y: 0.54 },
            { z: 3.2, w: 0.50, h: 0.48, y: 0.56 },
            { z: 3.6, w: 0.44, h: 0.42, y: 0.56 },
        ], { n: 2.2, belly: 0.85, capEnd: true }));
        ship.add(new THREE.Mesh(hullGeo, hullMat));
        const noseGeo = getGeometry('kestrel_nose_cone', () => new THREE.ConeGeometry(0.11, 0.5, 20));
        const noseCone = new THREE.Mesh(noseGeo, nacelleMat);
        noseCone.rotation.x = -Math.PI / 2;
        noseCone.position.set(0, 0.45, -4.5);
        ship.add(noseCone);

        // 2. Canopy: a long bubble whose lower half is buried in the fuselage.
        const canopyGeo = getGeometry('kestrel_canopy', () => createLoftGeometry([
            { z: -2.9, w: 0.05, h: 0.05, y: 0.74 },
            { z: -2.2, w: 0.34, h: 0.30, y: 0.80 },
            { z: -1.2, w: 0.46, h: 0.44, y: 0.96 },
            { z: -0.2, w: 0.44, h: 0.40, y: 1.00 },
            { z: 0.8, w: 0.30, h: 0.22, y: 1.00 },
            { z: 1.4, w: 0.08, h: 0.06, y: 1.00 },
        ], { n: 2.2, belly: 0.6, capEnd: true }));
        ship.add(new THREE.Mesh(canopyGeo, canopyMat));

        // 3. Main wing (hull colour, so the mass reads as one) and canards (trim).
        //    The wing is a proper aerofoil: moderate sweep, tapered, rounded
        //    tips and a little dihedral, like an air racer's.
        ([1, -1] as const).forEach(dir => {
            const wingGeo = getGeometry(`kestrel_wing_${dir}`, () => createAerofoilGeometry({
                span: 2.5, rootChord: 2.8, tipChord: 1.1, sweep: 1.2, thickness: 0.085, tipThickness: 0.06, tipRound: 0.3, dir,
            }));
            const wing = new THREE.Mesh(wingGeo, hullMat);
            wing.position.set(dir * 0.45, 0.36, 0.9);
            wing.rotation.z = dir * 0.08;              // dihedral
            ship.add(wing);
            const canardGeo = getGeometry(`kestrel_canard_${dir}`, () => createAerofoilGeometry({
                span: 0.9, rootChord: 0.8, tipChord: 0.45, sweep: 0.35, thickness: 0.1, tipRound: 0.35, dir,
            }));
            const canard = new THREE.Mesh(canardGeo, trimMat);
            canard.position.set(dir * 0.45, 0.55, -2.6);
            ship.add(canard);
        });

        // 4. Side scoops feeding the buried engine: a rounded mouth that
        //    narrows and sinks into the fuselage aft, with a dark throat.
        const scoopGeo = getGeometry('kestrel_scoop', () => createLoftGeometry([
            { z: 0.30, w: 0.19, h: 0.26, y: 0 },
            { z: 0.60, w: 0.20, h: 0.27, y: 0 },
            { z: 1.20, w: 0.17, h: 0.22, y: 0.02 },
            { z: 1.90, w: 0.08, h: 0.10, y: 0.06 },
            { z: 2.30, w: 0.02, h: 0.02, y: 0.08 },
        ], { n: 2.4, belly: 0.9, capStart: true, capEnd: true }));
        const throatGeo = getGeometry('kestrel_scoop_throat', () => createLoftGeometry([
            { z: 0.26, w: 0.15, h: 0.21, y: 0 },
            { z: 0.60, w: 0.12, h: 0.17, y: 0 },
        ], { n: 2.4, belly: 0.9, capStart: true, capEnd: false }));
        [-0.84, 0.84].forEach(ix => {
            const scoop = new THREE.Mesh(scoopGeo, nacelleMat);
            scoop.position.set(ix, 0.48, 0);
            ship.add(scoop);
            const throat = new THREE.Mesh(throatGeo, intakeMat);
            throat.position.set(ix, 0.48, 0);
            ship.add(throat);
        });
        {
            const { pod, glowZ } = makeNacelle('kestrel_engine', 0.48, 2.2, mats);
            pod.position.set(0, 0.52, 2.4);
            ship.add(pod);
            enginePositions.push(new THREE.Vector3(0, 0.52, 2.4 + glowZ));
        }

        // 5. Twin tails canted outward on the wing, plus a small ventral fin.
        const tailGeo = makeFinGeometry('kestrel_tail', 1.3, 1.0);
        ([1, -1] as const).forEach(dir => {
            addFin(tailGeo, trimMat, new THREE.Vector3(dir * 1.35, 0.44, 1.2), -dir * 0.35);
        });
        const ventralGeo = makeFinGeometry('kestrel_ventral', 0.8, 0.45);
        addFin(ventralGeo, trimMat, new THREE.Vector3(0, 0.1, 2.3), Math.PI);
    }

    // --- SHARED VISUALS (Headlights, Glows) ---
    // Create glows for deferred engine positions (Standard Ships)
    enginePositions.forEach(pos => {
        addGlow(pos);
    });

    return { mesh: ship, glows, beams };
};
