import * as THREE from 'three';

export interface ShipParts {
    mesh: THREE.Group;
    glows: THREE.Mesh[];
}

export type ShipType = 'fighter' | 'speedster' | 'tank' | 'interceptor' | 'corsair';

export const SHIP_STATS: Record<ShipType, { accelFactor: number, turnSpeed: number, friction: number, strafeSpeed: number, slideFactor: number }> = {
    fighter: {
        accelFactor: 0.56,
        turnSpeed: 0.001,
        friction: 0.9914,       // Top speed ~62.5
        strafeSpeed: 0.011,
        slideFactor: 0.95 // Balanced
    },
    speedster: {
        accelFactor: 0.45,
        turnSpeed: 0.0009,
        friction: 0.9932,       // Top speed ~66.2 (fastest)
        strafeSpeed: 0.009,
        slideFactor: 0.98 // Slippery
    },
    tank: {
        accelFactor: 0.75,      // Faster accel (was 0.65)
        turnSpeed: 0.0011,
        friction: 0.9883,       // Top speed ~60.9 (slowest, but close to pack)
        strafeSpeed: 0.018,     // Strong strafe (was 0.015)
        slideFactor: 0.92 // Grippy/Snappy
    },
    interceptor: {
        accelFactor: 0.72,
        turnSpeed: 0.0015, // Snap turn
        friction: 0.9889,       // Top speed ~63.6
        strafeSpeed: 0.013,
        slideFactor: 0.92 // Snappy but can hold a line (was 0.85)
    },
    corsair: {
        accelFactor: 0.53,
        turnSpeed: 0.0012,
        friction: 0.9919,       // Top speed ~61.0
        strafeSpeed: 0.010,
        slideFactor: 0.995 // Ice Skater (Extreme Drift)
    }
};

// Caches
const geometryCache: Record<string, THREE.BufferGeometry> = {};
const materialCache: Record<string, THREE.Material> = {};

export const createShip = (color: number = 0xcc0000, type: ShipType = 'fighter', accentColor: number = 0xeeeeee, buggyWing: boolean = false): ShipParts => {
    const ship = new THREE.Group();
    const glows: THREE.Mesh[] = [];

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

    // PBR materials apply to all ship types now that the visual pass is complete.
    const usePBR = true;

    // envMapIntensity boosts how much the IBL contributes vs direct lights.
    // In-game the directional light is intentionally bright (4.0 at day) so
    // without this boost the PBR reflections get washed out.
    const envBoost = 2.5;

    const bodyMaterial = usePBR
        ? getMaterial('body_pbr', { color, metalness: 0.85, roughness: 0.35, envMapIntensity: envBoost }, THREE.MeshStandardMaterial) as THREE.MeshStandardMaterial
        : getMaterial('body', { color, shininess: 80 }) as THREE.MeshPhongMaterial;
    const wingMaterial = usePBR
        ? getMaterial('wing_pbr', { color: accentColor, metalness: 0.6, roughness: 0.5, envMapIntensity: envBoost }, THREE.MeshStandardMaterial) as THREE.MeshStandardMaterial
        : getMaterial('wing', { color: accentColor, shininess: 80 }) as THREE.MeshPhongMaterial;
    const engineMaterial = usePBR
        ? getMaterial('engine_pbr', { color: 0x444444, metalness: 0.95, roughness: 0.25, envMapIntensity: envBoost }, THREE.MeshStandardMaterial) as THREE.MeshStandardMaterial
        : getMaterial('engine', { color: 0x444444 }) as THREE.MeshPhongMaterial;
    const cockpitMaterial = usePBR
        ? getMaterial('cockpit_pbr', { color: 0xffee00, metalness: 0.0, roughness: 0.1, transparent: true, opacity: 0.55, emissive: 0x221a00, envMapIntensity: envBoost }, THREE.MeshStandardMaterial) as THREE.MeshStandardMaterial
        : getMaterial('cockpit', { color: 0xffee00, transparent: true, opacity: 0.8, emissive: 0xaa8800 }) as THREE.MeshPhongMaterial;
    const glowMaterial = getMaterial('glow', { color: 0x00ffff, transparent: true, opacity: 0.9 }, THREE.MeshBasicMaterial) as THREE.MeshBasicMaterial;

    // Helper: Get or Create Geometry
    const getGeometry = (name: string, factory: () => THREE.BufferGeometry) => {
        if (!geometryCache[name]) {
            geometryCache[name] = factory();
        }
        return geometryCache[name];
    };

    // --- GEOMETRY GENERATION ---
    // Helper: Rounded Rect Shape
    const createRoundedRect = (w: number, h: number, r: number) => {
        const shape = new THREE.Shape();
        const x = -w / 2;
        const y = -h / 2;
        shape.moveTo(x + r, y);
        shape.lineTo(x + w - r, y);
        shape.quadraticCurveTo(x + w, y, x + w, y + r);
        shape.lineTo(x + w, y + h - r);
        shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        shape.lineTo(x + r, y + h);
        shape.quadraticCurveTo(x, y + h, x, y + h - r);
        shape.lineTo(x, y + r);
        shape.quadraticCurveTo(x, y, x + r, y);
        return shape;
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

    let enginePositions: THREE.Vector3[] = [];
    let exhaustScale = 1.0;

    if (type === 'speedster') {
        // --- BEVELED SPEEDSTER (Original Design + Smooth Edges) ---

        // 1. Body: capsule (cylinder + hemispherical end caps). Radius 0.45,
        //    total length 7 so it occupies the same Z range as the previous
        //    rounded-box body. The bullet nose merges into the front of the
        //    cylinder section so the two share an identical circular
        //    cross-section.
        const bodyRadius = 0.45;
        const bodyLength = 7.0;
        const bodyCylinderLength = bodyLength - 2 * bodyRadius;   // straight section between caps

        const fuselageGeo = getGeometry('speedster_capsule_body', () => new THREE.CapsuleGeometry(bodyRadius, bodyCylinderLength, 12, 32));
        const body = new THREE.Mesh(fuselageGeo, bodyMaterial);
        body.rotation.x = Math.PI / 2;                            // align capsule axis (local +Y) with world +Z
        body.position.set(0, 0.4, 0);                             // body spans world Z = -3.5 to +3.5
        ship.add(body);

        // 2. Nose: elongated bullet (stretched sphere) projecting forward from
        //    the cylindrical section. Same circular cross-section as the body
        //    so the join is invisible; the back half of the ellipsoid sits
        //    inside the cylinder (and fully encloses the capsule's front
        //    hemispherical cap, hiding it).
        const noseGeo = getGeometry('speedster_bullet_nose', () => new THREE.SphereGeometry(1, 32, 24));
        const nose = new THREE.Mesh(noseGeo, bodyMaterial);
        nose.scale.set(bodyRadius, bodyRadius, 2.6);              // cross-section radius matches body; tip 2.6 forward of centre
        nose.position.set(0, 0.4, -(bodyLength / 2 - bodyRadius));// centre at the front of the cylinder section (Z = -3.05)
        ship.add(nose);

        // 3. Wings: planform with curved leading edge and rounded wingtip.
        // Each wing has its own shape (mirrored across X) so the silhouette
        // curves outward on both sides without flipping face normals via
        // negative scaling. Shape coords: X = outward span (root at X=0,
        // tip at X=±wingSpan), Y = chord (+Y = leading edge). The mesh is
        // laid flat by rotation.x = -PI/2 so local +Y maps to world -Z
        // (forward). Sweep is baked into the shape, not applied via
        // rotation.y, and the root sits flush against the body side.
        const wingSpan = 1.8;
        const wingHalfRootChord = 2.0;   // root chord = 4.0 (Y = -2 .. +2)
        const wingHalfTipChord = 1.25;   // tip chord = 2.5, set back for sweep
        const bodyHalfWidth = 0.4;       // body is 0.8 wide, root attaches at edge

        const rightWingShape = new THREE.Shape();
        rightWingShape.moveTo(0, -wingHalfRootChord);                                                                                          // root trailing
        rightWingShape.lineTo(wingSpan, -wingHalfRootChord);                                                                                   // tip trailing (straight, jet-style)
        rightWingShape.quadraticCurveTo(wingSpan + 0.4, (wingHalfTipChord - wingHalfRootChord) * 0.5, wingSpan - 0.1, wingHalfTipChord);       // rounded wingtip bulging outward
        rightWingShape.quadraticCurveTo(wingSpan * 0.5, wingHalfRootChord + 0.5, 0, wingHalfRootChord);                                        // curved leading edge bowing forward
        rightWingShape.lineTo(0, -wingHalfRootChord);                                                                                          // close along root edge

        const leftWingShape = new THREE.Shape();
        leftWingShape.moveTo(0, -wingHalfRootChord);                                                                                           // root trailing
        leftWingShape.lineTo(0, wingHalfRootChord);                                                                                            // root edge up to root leading
        leftWingShape.quadraticCurveTo(-wingSpan * 0.5, wingHalfRootChord + 0.5, -wingSpan + 0.1, wingHalfTipChord);                           // curved leading edge bowing forward
        leftWingShape.quadraticCurveTo(-wingSpan - 0.4, (wingHalfTipChord - wingHalfRootChord) * 0.5, -wingSpan, -wingHalfRootChord);          // rounded wingtip bulging outward
        leftWingShape.lineTo(0, -wingHalfRootChord);                                                                                           // trailing edge back to root

        const wingSettings = {
            steps: 1,
            depth: 0.1,
            bevelEnabled: true,
            bevelThickness: 0.04,
            bevelSize: 0.04,
            bevelSegments: 3
        };
        const rightWingGeo = getGeometry('speedster_curved_wing_right', () => new THREE.ExtrudeGeometry(rightWingShape, wingSettings));
        const leftWingGeo = getGeometry('speedster_curved_wing_left', () => new THREE.ExtrudeGeometry(leftWingShape, wingSettings));

        const rightWing = new THREE.Mesh(rightWingGeo, wingMaterial);
        rightWing.rotation.x = -Math.PI / 2;
        rightWing.position.set(bodyHalfWidth, 0.25, 1.0);
        ship.add(rightWing);

        const leftWing = new THREE.Mesh(leftWingGeo, wingMaterial);
        leftWing.rotation.x = -Math.PI / 2;
        leftWing.position.set(-bodyHalfWidth, 0.25, 1.0);
        ship.add(leftWing);

        // 4. Cabin
        const cabinGeo = getGeometry('speedster_cabin_sphere', () => new THREE.SphereGeometry(0.5, 32, 16));
        const cabin = new THREE.Mesh(cabinGeo, cockpitMaterial);
        cabin.scale.set(0.7, 0.7, 1.7);
        cabin.position.set(0, 0.75, 1.0);
        ship.add(cabin);

        // 5. Engines
        const engineGeo = getGeometry('speedster_smooth_engine_cyl', () => new THREE.CylinderGeometry(0.5, 0.5, 3.0, 32));

        const leftEng = new THREE.Mesh(engineGeo, engineMaterial);
        leftEng.rotation.x = Math.PI / 2;
        leftEng.position.set(-2.0, 0.3, 2.0);
        ship.add(leftEng);

        const rightEng = new THREE.Mesh(engineGeo, engineMaterial);
        rightEng.rotation.x = Math.PI / 2;
        rightEng.position.set(2.0, 0.3, 2.0);
        ship.add(rightEng);

        enginePositions.push(new THREE.Vector3(-2.0, 0.3, 3.5));
        enginePositions.push(new THREE.Vector3(2.0, 0.3, 3.5));

        // --- GREEBLES ---
        // Body: X ±0.4, Y 0 to 0.8, Z -3.5 to 3.5.
        // Engines at (±2.0, 0.3, 2.0), 0.5 radius, 3.0 length → Z 0.5 to 3.5.

        // 1. Dorsal fin - aerodynamic blade behind the cockpit.
        // Leading edge swept back and curving, top-back corner rounded into
        // a shark-fin silhouette instead of a hard right-angle wedge.
        const dorsalShape = new THREE.Shape();
        dorsalShape.moveTo(0, 0);                                    // front-bottom (attachment apex)
        dorsalShape.lineTo(1.0, 0);                                  // bottom-back along body
        dorsalShape.lineTo(1.0, 0.20);                               // straight trailing edge
        dorsalShape.quadraticCurveTo(1.0, 0.30, 0.85, 0.30);         // rounded top-back corner
        dorsalShape.quadraticCurveTo(0.45, 0.28, 0, 0);              // curved leading edge swept back down to the apex
        const dorsalGeo = getGeometry('speedster_dorsal_rounded', () => new THREE.ExtrudeGeometry(dorsalShape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2 }));
        const dorsal = new THREE.Mesh(dorsalGeo, engineMaterial);
        dorsal.rotation.y = -Math.PI / 2;
        dorsal.position.set(0.03, 0.8, 2.5);
        ship.add(dorsal);

        // 2. Body-top air scoop (just aft of the nose joint)
        const scoopGeo = getGeometry('speedster_scoop', () => new THREE.BoxGeometry(0.2, 0.08, 0.6));
        const scoop = new THREE.Mesh(scoopGeo, engineMaterial);
        scoop.position.set(0, 0.84, -3.0);
        ship.add(scoop);

        // 3. Engine cooling rings - three concentric rings around each engine
        const speedsterRingGeo = getGeometry('speedster_ring', () => new THREE.TorusGeometry(0.56, 0.06, 8, 24));
        const speedsterRingZ = [0.8, 1.7, 2.6];
        [-2.0, 2.0].forEach(ex => {
            speedsterRingZ.forEach(rz => {
                const ring = new THREE.Mesh(speedsterRingGeo, engineMaterial);
                ring.position.set(ex, 0.3, rz);
                ship.add(ring);
            });
        });

        // 4. Wing-mounted aerial probes (pitot tubes on the wing leading edge)
        const probeGeo = getGeometry('speedster_probe', () => new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8));
        [-2.0, 2.0].forEach(px => {
            const probe = new THREE.Mesh(probeGeo, engineMaterial);
            probe.rotation.x = Math.PI / 2;
            probe.position.set(px, 0.32, -0.65);
            ship.add(probe);
        });

        // 5. Side strakes - small fins along the body sides
        const strakeGeo = getGeometry('speedster_strake', () => new THREE.BoxGeometry(0.05, 0.18, 0.8));
        [-0.42, 0.42].forEach(sx => {
            const strake = new THREE.Mesh(strakeGeo, engineMaterial);
            strake.position.set(sx, 0.4, 0.0);
            ship.add(strake);
        });

        /*
        // --- OLD BLOCKY SPEEDSTER (Deprecating) ---
        const bodyGeo = getGeometry('speedster_body', () => new THREE.BoxGeometry(0.8, 0.8, 7.0));
        const body = new THREE.Mesh(bodyGeo, bodyMaterial);
        body.position.set(0, 0.4, 0);
        ship.add(body);

        const noseGeo = getGeometry('speedster_nose', () => new THREE.ConeGeometry(0.5, 3.0, 4));
        const nose = new THREE.Mesh(noseGeo, bodyMaterial);
        nose.rotation.x = -Math.PI / 2;
        nose.rotation.y = Math.PI / 4;
        nose.position.set(0, 0.4, -5.0);
        ship.add(nose);
        
        const cabinGeo = getGeometry('speedster_cabin', () => new THREE.SphereGeometry(0.4, 16, 16));
        const cabin = new THREE.Mesh(cabinGeo, cockpitMaterial);
        cabin.scale.z = 2.0;
        cabin.position.set(0, 0.7, 1.0);
        ship.add(cabin);

        const wingGeo = getGeometry('speedster_wing', () => new THREE.BoxGeometry(2.0, 0.1, 4.0));
        const leftWing = new THREE.Mesh(wingGeo, wingMaterial);
        leftWing.position.set(-1.2, 0.3, 1.0);
        leftWing.rotation.y = Math.PI / 12;
        ship.add(leftWing);

        const rightWing = new THREE.Mesh(wingGeo, wingMaterial);
        rightWing.position.set(1.2, 0.3, 1.0);
        rightWing.rotation.y = -Math.PI / 12;
        ship.add(rightWing);

        const engineGeo = getGeometry('speedster_engine', () => new THREE.CylinderGeometry(0.5, 0.5, 3.0, 12));
        const leftEng = new THREE.Mesh(engineGeo, engineMaterial);
        leftEng.rotation.x = Math.PI / 2;
        leftEng.position.set(-2.0, 0.3, 2.0);
        ship.add(leftEng);

        const rightEng = new THREE.Mesh(engineGeo, engineMaterial);
        rightEng.rotation.x = Math.PI / 2;
        rightEng.position.set(2.0, 0.3, 2.0);
        ship.add(rightEng);

        enginePositions.push(new THREE.Vector3(-2.0, 0.3, 3.5));
        enginePositions.push(new THREE.Vector3(2.0, 0.3, 3.5));

        // ... (rest of old code simplified out for diff readability)
        */



    } else if (type === 'tank') {
        // --- TANK (Heavy) ---
        // Rounded Edges Update

        const bodyW = 2.5;
        const bodyH = 1.2;
        const bodyL = 4.5;
        const bevel = 0.2; // Larger bevel for tank

        const bodyShape = createRoundedRect(bodyW - bevel, bodyH - bevel, bevel);
        const bodySettings = {
            steps: 2,
            depth: bodyL,
            bevelEnabled: true,
            bevelThickness: bevel,
            bevelSize: bevel,
            bevelSegments: 4
        };

        const bodyGeo = getGeometry('tank_body_rounded', () => new THREE.ExtrudeGeometry(bodyShape, bodySettings));
        const body = new THREE.Mesh(bodyGeo, bodyMaterial);
        // Original Box center (0.5). Box range -1.75 to 2.75.
        // Extrude (0 to 4.5).
        // Set Z to start at -1.75.
        body.position.set(0, 0.6, -1.75);
        ship.add(body);

        // Nose Cone
        const noseGeo = getGeometry('tank_nose', () => new THREE.ConeGeometry(bodyW / 2 * 0.57, 2.0, 32));
        const nose = new THREE.Mesh(noseGeo, bodyMaterial);
        nose.rotation.x = -Math.PI / 2;
        nose.position.set(0, 0.6, -2.75); // protrude from front (-1.75)
        ship.add(nose);

        // Armor Plate (Rounded)
        const plateW = 2.7;
        const plateH = 0.57;
        const plateL = 3.0;
        const plateBevel = 0.1;

        const plateShape = createRoundedRect(plateW - plateBevel, plateH - plateBevel, plateBevel);
        const plateSettings = {
            steps: 1,
            depth: plateL,
            bevelEnabled: true,
            bevelThickness: plateBevel,
            bevelSize: plateBevel,
            bevelSegments: 3
        };
        const plateGeo = getGeometry('tank_plate_rounded', () => new THREE.ExtrudeGeometry(plateShape, plateSettings));
        const plate = new THREE.Mesh(plateGeo, wingMaterial);
        // Original Pos: 0, 1.0, 0.0. (Center).
        // Extrude 0 to 3.0. 
        // Start at -1.5.
        plate.position.set(0, 1.0, -1.5);
        ship.add(plate);

        // Dome canopy - reads as a cockpit rather than a flat panel
        const cabinGeo = getGeometry('tank_cabin_dome', () => new THREE.SphereGeometry(0.6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2));
        const cabin = new THREE.Mesh(cabinGeo, cockpitMaterial);
        cabin.scale.set(1.0, 0.9, 1.35);
        cabin.position.set(0, 1.29, -0.4);
        ship.add(cabin);

        const engineGeo = getGeometry('tank_engine', () => new THREE.CylinderGeometry(0.6, 0.6, 1.0, 8));
        const posOffsets = [
            { x: -1.5, y: 0.5 }, { x: 1.5, y: 0.5 },
            { x: -1.0, y: 1.0 }, { x: 1.0, y: 1.0 }
        ];

        posOffsets.forEach(pos => {
            const eng = new THREE.Mesh(engineGeo, engineMaterial);
            eng.rotation.x = Math.PI / 2;
            eng.position.set(pos.x, pos.y, 2.5);
            ship.add(eng);
            enginePositions.push(new THREE.Vector3(pos.x, pos.y, 3.0));
        });

        // --- GREEBLES ---
        // Body: X ±1.25, Y 0 to 1.2, Z -1.75 to 2.75.
        // Armor plate top: Y ~1.285 (1.0 + 0.57/2 + bevel), spans Z -1.5 to 1.5.
        // Engines at (±1.5, 0.5, 2.5) and (±1.0, 1.0, 2.5), 0.6r × 1.0L → Z 2.0 to 3.0.

        // 1. Armor plate bolts - chunky rivets at the corners and midpoints
        const boltGeo = getGeometry('tank_bolt', () => new THREE.SphereGeometry(0.09, 10, 8));
        const boltPositions: [number, number, number][] = [
            [-1.15, 1.34, -1.3], [1.15, 1.34, -1.3],
            [-1.15, 1.34, 1.3],  [1.15, 1.34, 1.3],
            [-1.15, 1.34, 0.0],  [1.15, 1.34, 0.0]
        ];
        boltPositions.forEach(([bx, by, bz]) => {
            const bolt = new THREE.Mesh(boltGeo, engineMaterial);
            bolt.position.set(bx, by, bz);
            ship.add(bolt);
        });

        // 2. Side armor protrusion panels - chunky reinforcements
        const sideArmorGeo = getGeometry('tank_side_armor', () => new THREE.BoxGeometry(0.22, 0.95, 3.6));
        [-1.36, 1.36].forEach(sx => {
            const armor = new THREE.Mesh(sideArmorGeo, engineMaterial);
            armor.position.set(sx, 0.55, 0.3);
            ship.add(armor);
        });

        // 3. Engine cooling rings - two per engine, four engines = eight rings
        const tankRingGeo = getGeometry('tank_ring', () => new THREE.TorusGeometry(0.66, 0.07, 8, 20));
        const tankEnginePos = [
            { x: -1.5, y: 0.5 }, { x: 1.5, y: 0.5 },
            { x: -1.0, y: 1.0 }, { x: 1.0, y: 1.0 }
        ];
        tankEnginePos.forEach(pos => {
            [2.2, 2.8].forEach(rz => {
                const ring = new THREE.Mesh(tankRingGeo, engineMaterial);
                ring.position.set(pos.x, pos.y, rz);
                ship.add(ring);
            });
        });

        // 4. Antenna mast + sensor pod behind the canopy
        const tankMastGeo = getGeometry('tank_mast', () => new THREE.CylinderGeometry(0.05, 0.06, 0.55, 8));
        const tankMast = new THREE.Mesh(tankMastGeo, engineMaterial);
        tankMast.position.set(0, 1.55, 0.65);
        ship.add(tankMast);

        const tankSensorGeo = getGeometry('tank_sensor_pod', () => new THREE.SphereGeometry(0.12, 12, 8));
        const tankSensor = new THREE.Mesh(tankSensorGeo, engineMaterial);
        tankSensor.position.set(0, 1.85, 0.65);
        ship.add(tankSensor);

        // 5. Exhaust stack behind the cabin
        const stackGeo = getGeometry('tank_stack', () => new THREE.CylinderGeometry(0.14, 0.16, 0.7, 12));
        const stack = new THREE.Mesh(stackGeo, engineMaterial);
        stack.position.set(0, 1.65, 1.2);
        ship.add(stack);

    } else if (type === 'interceptor') {
        exhaustScale = 0.7;
        // --- INTERCEPTOR (Bi-Plane) ---
        // Compact body, double wings, Rounded Edges

        // 1. Body: round capsule (cylinder + hemispherical caps). It touches the
        //    top wing (y=1.2) and the raised bottom wing (y=-0.2); the radius is
        //    half that 1.4 gap (0.7), centred at y=0.5. Length 4 → Z -2.0..2.0.
        const bodyRadius = 0.7;
        const bodyLength = 4.0;
        const bodyCenterY = 0.5;
        const bodyCenterZ = 0.0;
        const bodyCylinderLength = bodyLength - 2 * bodyRadius;   // straight section between caps
        const bodyGeo = getGeometry('interceptor_round_body_r07', () => new THREE.CapsuleGeometry(bodyRadius, bodyCylinderLength, 12, 32));
        const body = new THREE.Mesh(bodyGeo, bodyMaterial);
        body.rotation.x = Math.PI / 2;                            // align capsule axis (local +Y) with world +Z
        body.position.set(0, bodyCenterY, bodyCenterZ);           // spans world Y -0.2..1.2, Z -2.0..2.0
        ship.add(body);

        // 2. Nose: bullet ellipsoid sharing the body's circular cross-section so
        //    the join is invisible (back half hidden inside the body).
        const noseGeo = getGeometry('interceptor_bullet_nose', () => new THREE.SphereGeometry(1, 32, 24));
        const nose = new THREE.Mesh(noseGeo, bodyMaterial);
        nose.scale.set(bodyRadius, bodyRadius, 2.2);                                     // cross-section matches body; tip 2.2 forward of centre
        nose.position.set(0, bodyCenterY, bodyCenterZ - (bodyLength / 2 - bodyRadius));  // centre at front of cylinder section (Z = -1.3)
        ship.add(nose);

        // Bi-Plane Delta Wings
        const createDeltaShape = () => {
            const s = new THREE.Shape();
            const hs = 5.0 / 2;   // half span (2.5)
            const hc = 4.5 / 2;   // half chord (2.25)
            // Delta pointing forward (+Y = leading edge). Curved leading edges
            // bowing forward, rounded wingtips, straight trailing edge.
            s.moveTo(0, hc);                                          // front apex
            s.quadraticCurveTo(hs * 0.55, hc * 0.5, hs, -hc + 0.5);   // right leading edge bowing forward
            s.quadraticCurveTo(hs + 0.2, -hc, hs - 0.55, -hc);        // rounded right wingtip
            s.lineTo(-(hs - 0.55), -hc);                              // straight trailing edge
            s.quadraticCurveTo(-(hs + 0.2), -hc, -hs, -hc + 0.5);     // rounded left wingtip
            s.quadraticCurveTo(-hs * 0.55, hc * 0.5, 0, hc);          // left leading edge bowing forward
            return s;
        };

        const deltaSettings = {
            steps: 2,
            depth: 0.1,
            bevelEnabled: true,
            bevelThickness: 0.05,
            bevelSize: 0.05,
            bevelSegments: 2
        };

        const deltaGeo = getGeometry('interceptor_delta_wing_rounded', () => {
            return new THREE.ExtrudeGeometry(createDeltaShape(), deltaSettings);
        });

        const topWing = new THREE.Mesh(deltaGeo, wingMaterial);
        topWing.rotation.x = -Math.PI / 2; // Y+ becomes Z- (Forward)
        topWing.position.set(0, 1.2, 0.0); // Shifted Z position
        ship.add(topWing);

        const bottomWing = new THREE.Mesh(deltaGeo, wingMaterial);
        bottomWing.rotation.x = -Math.PI / 2;
        bottomWing.position.set(0, -0.2, 0.0); // raised so the slimmer round body still touches it
        ship.add(bottomWing);

        // Bi-plane struts ("pylons") connecting the top wing (y=1.2) and the
        // bottom wing (y=-0.2). Length 1.5 centred at y=0.5 spans the 1.4 gap and
        // embeds into both wings; X=±1.0 keeps them outboard of the body.
        const strutGeo = getGeometry('interceptor_strut_mid', () => new THREE.CylinderGeometry(0.08, 0.08, 1.5, 12));
        const strutOffsets: [number, number][] = [[-1.0, -0.3], [1.0, -0.3], [-1.0, 0.6], [1.0, 0.6]];
        strutOffsets.forEach(([sx, sz]) => {
            const strut = new THREE.Mesh(strutGeo, engineMaterial);
            strut.position.set(sx, 0.5, sz);
            ship.add(strut);
        });

        // Engines (4 small ones)
        const engineGeo = getGeometry('interceptor_engine', () => new THREE.CylinderGeometry(0.25, 0.25, 1.0, 8));
        const engOffsets = [
            { x: -0.9, y: 0.2 }, { x: 0.9, y: 0.2 },     // lower pair: against the body
            { x: -0.9, y: 0.95 }, { x: 0.9, y: 0.95 }    // upper pair: flush under the top wing (y=1.2)
        ];
        engOffsets.forEach(off => {
            const eng = new THREE.Mesh(engineGeo, engineMaterial);
            eng.rotation.x = Math.PI / 2;
            eng.position.set(off.x, off.y, 1.6);
            ship.add(eng);
            enginePositions.push(new THREE.Vector3(off.x, off.y, 2.1));
        });

        // Cockpit
        const cabinGeo = getGeometry('interceptor_cabin', () => new THREE.SphereGeometry(0.45, 16, 16));
        const cabin = new THREE.Mesh(cabinGeo, cockpitMaterial);
        cabin.scale.z = 1.5;
        cabin.position.set(0, 1.3, -0.5);
        ship.add(cabin);

        // --- GREEBLES ---
        // Body (round capsule r=0.7): X ±0.7, Y -0.2 to 1.2, Z -2.0 to 2.0.
        // Small engines (0.25r) at (±0.9, 0.2 or 0.95, 1.6).

        // 1. Antenna mast on the fuselage spine, behind the cockpit canopy
        const intMastGeo = getGeometry('interceptor_mast', () => new THREE.CylinderGeometry(0.03, 0.04, 0.5, 8));
        const intMast = new THREE.Mesh(intMastGeo, engineMaterial);
        intMast.position.set(0, 1.45, 0.4);   // base on the body top (y=1.2), aft of the canopy
        ship.add(intMast);

        const intSensorGeo = getGeometry('interceptor_sensor', () => new THREE.SphereGeometry(0.07, 10, 8));
        const intSensor = new THREE.Mesh(intSensorGeo, engineMaterial);
        intSensor.position.set(0, 1.75, 0.4);  // dome at the top of the mast
        ship.add(intSensor);

        // 2. Engine cooling rings - one per engine
        const intRingGeo = getGeometry('interceptor_ring', () => new THREE.TorusGeometry(0.30, 0.04, 8, 20));
        const intRingOffsets: [number, number][] = [[-0.9, 0.2], [0.9, 0.2], [-0.9, 0.95], [0.9, 0.95]];
        intRingOffsets.forEach(([rx, ry]) => {
            const ring = new THREE.Mesh(intRingGeo, engineMaterial);
            ring.position.set(rx, ry, 1.6);
            ship.add(ring);
        });

        // 3. Wing-tip strobes - small light pods at the rear-outer wingtip
        //    corners, where the rounded tip meets the straight trailing edge
        //    (x≈±1.95 at world z≈2.25), poking aft.
        const strobeGeo = getGeometry('interceptor_strobe', () => new THREE.SphereGeometry(0.1, 10, 8));
        const strobePositions: [number, number, number][] = [
            [-2.0, 1.2, 2.3], [2.0, 1.2, 2.3],
            [-2.0, -0.2, 2.3], [2.0, -0.2, 2.3]
        ];
        strobePositions.forEach(([px, py, pz]) => {
            const strobe = new THREE.Mesh(strobeGeo, engineMaterial);
            strobe.position.set(px, py, pz);
            ship.add(strobe);
        });

        // 4. Nose-top air scoop
        const intScoopGeo = getGeometry('interceptor_scoop', () => new THREE.BoxGeometry(0.2, 0.1, 0.5));
        const intScoop = new THREE.Mesh(intScoopGeo, engineMaterial);
        intScoop.position.set(0, 1.05, -2.6);
        ship.add(intScoop);

        // 5. Keel fairing - small mechanical bump along the bottom of the body
        //    where it meets the lowered bottom wing.
        const bellyGeo = getGeometry('interceptor_belly', () => new THREE.BoxGeometry(0.5, 0.15, 1.4));
        const belly = new THREE.Mesh(bellyGeo, engineMaterial);
        belly.position.set(0, -0.2, 0.3);
        ship.add(belly);

    } else if (type === 'corsair') {
        exhaustScale = 1.6;
        // --- CORSAIR (Anhedral Wings - Bad Guy Look) ---
        // Rounded Edges Update

        // 1. Hull: round capsule (cylinder + hemispherical caps), matching the
        //    Speedster/Fighter/Interceptor treatment. Radius 0.6, length 5 so it
        //    keeps the same Z range (-2.5 .. 2.5) as the old rounded-box hull.
        //    Width is unchanged (±0.6) but the round hull is taller: top y=1.1,
        //    bottom y=-0.1 (was 0.95 / 0.05), so the top greebles are lifted.
        const hullRadius = 0.6;
        const hullLength = 5.0;
        const hullCenterY = 0.5;
        const hullCylinderLength = hullLength - 2 * hullRadius;   // straight section between caps
        const mainHullGeo = getGeometry('corsair_capsule_hull', () => new THREE.CapsuleGeometry(hullRadius, hullCylinderLength, 12, 32));
        const hull = new THREE.Mesh(mainHullGeo, bodyMaterial);
        hull.rotation.x = Math.PI / 2;                            // align capsule axis (local +Y) with world +Z
        hull.position.set(0, hullCenterY, 0);                     // hull spans world Z = -2.5 to +2.5
        ship.add(hull);

        // 2. Nose: elongated bullet (stretched sphere) sharing the hull's
        //    circular cross-section so the join is invisible (back half hidden
        //    inside the hull).
        const noseGeo = getGeometry('corsair_bullet_nose', () => new THREE.SphereGeometry(1, 32, 24));
        const nose = new THREE.Mesh(noseGeo, bodyMaterial);
        nose.scale.set(hullRadius, hullRadius, 2.8);                          // cross-section matches hull; tip 2.8 forward of centre
        nose.position.set(0, hullCenterY, -(hullLength / 2 - hullRadius));    // centre at front of cylinder section (Z = -1.9)
        ship.add(nose);

        // Anhedral wings (angled down) - tapered planform with a curved leading
        // edge and rounded wingtip, like the other ships. Built per side (dir +1
        // right, -1 left) as a proper X-mirror so the curve stays on the
        // leading/outboard edge. Shape is span(X) × chord(Y, +Y = leading);
        // rotation.order 'ZYX' makes the flatten (rotation.x) apply first and the
        // anhedral (rotation.z) second in the world frame. Root anchored at the
        // old inner end (±0.42, 0.73), span/angle unchanged, so the tip lands on
        // the same anhedral line and the engines + wing-tip darts stay connected.
        const createCorsairWing = (rootChord: number, tipChord: number, span: number, dir: number) => {
            const s = new THREE.Shape();
            if (dir > 0) {
                s.moveTo(0, rootChord / 2);
                s.quadraticCurveTo(span * 0.5, rootChord / 2 + 0.25, span, tipChord / 2);   // curved leading edge
                s.quadraticCurveTo(span + 0.25, 0, span, -tipChord / 2);                    // rounded wingtip
                s.lineTo(0, -rootChord / 2);                                                // straight trailing edge
                s.lineTo(0, rootChord / 2);                                                 // close along root
            } else {
                s.moveTo(0, rootChord / 2);
                s.lineTo(0, -rootChord / 2);
                s.lineTo(-span, -tipChord / 2);
                s.quadraticCurveTo(-(span + 0.25), 0, -span, tipChord / 2);
                s.quadraticCurveTo(-span * 0.5, rootChord / 2 + 0.25, 0, rootChord / 2);
            }
            return s;
        };
        const corsairWingSettings = {
            steps: 1,
            depth: 0.12,        // thickness
            bevelEnabled: true,
            bevelThickness: 0.04,
            bevelSize: 0.04,
            bevelSegments: 3
        };
        const rightWingGeo = getGeometry('corsair_wing_right', () => new THREE.ExtrudeGeometry(createCorsairWing(1.5, 1.0, 2.5, 1), corsairWingSettings));
        const leftWingGeo = getGeometry('corsair_wing_left', () => new THREE.ExtrudeGeometry(createCorsairWing(1.5, 1.0, 2.5, -1), corsairWingSettings));

        const leftWing = new THREE.Mesh(leftWingGeo, wingMaterial);
        leftWing.rotation.order = 'ZYX';
        leftWing.rotation.x = -Math.PI / 2;     // lay flat (chord -> world Z)
        leftWing.rotation.z = Math.PI / 6;      // anhedral (tip down)
        leftWing.position.set(-0.42, 0.73, 0.5);
        ship.add(leftWing);

        const rightWing = new THREE.Mesh(rightWingGeo, wingMaterial);
        rightWing.rotation.order = 'ZYX';
        rightWing.rotation.x = -Math.PI / 2;
        rightWing.rotation.z = -Math.PI / 6;
        rightWing.position.set(0.42, 0.73, 0.5);
        ship.add(rightWing);

        // Connecting Wings/Struts (Rounded)
        const connW = 1.0;
        const connH = 0.2;
        const connL = 1.0;
        const connShape = createRoundedRect(connW - 0.05, connH - 0.05, 0.05);
        const connSettings = {
            steps: 1,
            depth: connL,
            bevelEnabled: true,
            bevelThickness: 0.05,
            bevelSize: 0.05,
            bevelSegments: 2
        };
        const connectorGeo = getGeometry('corsair_connector_rounded', () => new THREE.ExtrudeGeometry(connShape, connSettings));

        const leftConn = new THREE.Mesh(connectorGeo, engineMaterial);
        // Original Pos: -0.6, 0.6, 0.5.
        // Box Depth 1.0. Extrude 1.0.
        // Start Z = 0.5 - 0.5 = 0.0.
        leftConn.position.set(-0.6, 0.6, 0.0);
        leftConn.rotation.z = Math.PI / 8; // Slight angle
        ship.add(leftConn);

        const rightConn = new THREE.Mesh(connectorGeo, engineMaterial);
        rightConn.position.set(0.6, 0.6, 0.0);
        rightConn.rotation.z = -Math.PI / 8;
        ship.add(rightConn);

        // Twin Boom Engines (Connected to Wings) - Rounded
        const engW = 0.8;
        const engH = 0.8;
        const engL = 2.5;
        const engShape = createRoundedRect(engW - 0.1, engH - 0.1, 0.1);
        const engSettings = {
            steps: 2,
            depth: engL,
            bevelEnabled: true,
            bevelThickness: 0.1,
            bevelSize: 0.1,
            bevelSegments: 3
        };
        const engineGeo = getGeometry('corsair_engine_rounded', () => new THREE.ExtrudeGeometry(engShape, engSettings));

        // Attach engines to the TIPS or MID? 
        // Let's attach them mid-wing for stability look.
        // Wing Center is at (-1.5, 0.1).
        // Engine at same pos, matching rotation?

        const leftEng = new THREE.Mesh(engineGeo, engineMaterial);
        leftEng.position.set(-1.8, 0.0, 1.0); // outer/lower; front embeds into the wing
        leftEng.rotation.z = Math.PI / 6; // Match wing angle
        ship.add(leftEng);
        // Attach glow directly to engine (local position at back of engine)
        addGlow(new THREE.Vector3(0, 0, engL), leftEng);

        const rightEng = new THREE.Mesh(engineGeo, engineMaterial);
        rightEng.position.set(1.8, 0.0, 1.0);
        rightEng.rotation.z = -Math.PI / 6;
        ship.add(rightEng);
        addGlow(new THREE.Vector3(0, 0, engL), rightEng);

        // Cockpit - rounded canopy bubble (low, long ellipsoid)
        const cabinGeo = getGeometry('corsair_cabin_rounded', () => new THREE.SphereGeometry(1, 24, 16));
        const cabin = new THREE.Mesh(cabinGeo, cockpitMaterial);
        cabin.scale.set(0.28, 0.26, 0.8);     // ~0.56 wide × 0.52 tall × 1.6 long
        cabin.position.set(0, 1.0, -0.5);     // lower half embedded in the hull (top y=1.1)
        ship.add(cabin);

        // --- GREEBLES ---
        // Hull (round capsule r=0.6): X ±0.6, Y -0.1 to 1.1, Z -2.5 to 2.5.
        // Anhedral wings at (±1.5, 0.1, -0.25), rotated Z by ±π/6.

        // 1. Dorsal fin - a curved, swept-back shark-fin blade behind the
        //    cockpit: straight base, curved trailing edge up to a hooked top,
        //    and a curved leading edge sweeping back down to the apex.
        const corsairSpikeShape = new THREE.Shape();
        corsairSpikeShape.moveTo(0, 0);                                  // front-bottom (leading apex)
        corsairSpikeShape.lineTo(1.2, 0);                                // bottom edge along the hull
        corsairSpikeShape.quadraticCurveTo(1.3, 0.26, 1.05, 0.46);       // curved trailing edge up to a hooked top
        corsairSpikeShape.quadraticCurveTo(0.55, 0.5, 0, 0);             // curved leading edge swept back to the apex
        const corsairSpikeGeo = getGeometry('corsair_fin_curved', () => new THREE.ExtrudeGeometry(corsairSpikeShape, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2 }));
        const corsairSpike = new THREE.Mesh(corsairSpikeGeo, engineMaterial);
        corsairSpike.rotation.y = -Math.PI / 2;
        corsairSpike.position.set(0.035, 1.1, 0.5);
        ship.add(corsairSpike);

        // 2. Forward-facing weapon barrels on the hull sides
        const barrelGeo = getGeometry('corsair_barrel', () => new THREE.CylinderGeometry(0.06, 0.08, 1.2, 12));
        [-0.62, 0.62].forEach(bx => {
            const barrel = new THREE.Mesh(barrelGeo, engineMaterial);
            barrel.rotation.x = Math.PI / 2;
            barrel.position.set(bx, 0.35, -2.4);
            ship.add(barrel);
        });

        // 3. Hull side vents - small dark slats between cockpit and engines
        const ventGeo = getGeometry('corsair_vent', () => new THREE.BoxGeometry(0.07, 0.2, 0.6));
        [-0.62, 0.62].forEach(vx => {
            const vent = new THREE.Mesh(ventGeo, engineMaterial);
            vent.position.set(vx, 0.55, 0.4);
            ship.add(vent);
        });

        // 4. Wing-tip pointed darts - sharp spikes anchored at each anhedral wing tip.
        // The tapered wing tip lands at ~(±2.58, -0.52) with its leading edge at
        // world z≈0.0, so the darts poke forward from just ahead of it.
        const dartGeo = getGeometry('corsair_dart', () => new THREE.ConeGeometry(0.09, 0.6, 12));
        ([[-2.58, -0.53, -0.1], [2.58, -0.53, -0.1]] as [number, number, number][]).forEach(([dx, dy, dz]) => {
            const dart = new THREE.Mesh(dartGeo, engineMaterial);
            dart.rotation.x = -Math.PI / 2;
            dart.position.set(dx, dy, dz);
            ship.add(dart);
        });

        // 5. Engine top fins - swept-back wedge blades running along each twin boom.
        // Same aero profile as the dorsal fins: low leading edge, tall trailing edge.
        // Added as children of each engine mesh so they inherit the wing-angle Z rotation.
        const corsairFinShape = new THREE.Shape();
        corsairFinShape.moveTo(0, 0);            // front-bottom
        corsairFinShape.lineTo(0.5, 0);          // bottom-back
        corsairFinShape.lineTo(0.5, 0.11);       // back-top (tall trailing edge)
        corsairFinShape.lineTo(0, 0);            // swept leading edge
        const corsairFinGeo = getGeometry('corsair_engine_fin', () => new THREE.ExtrudeGeometry(corsairFinShape, { depth: 0.5, bevelEnabled: false }));
        const corsairFinZ = [0.2, 0.8, 1.4, 2.0];
        [leftEng, rightEng].forEach(eng => {
            corsairFinZ.forEach(fz => {
                const fin = new THREE.Mesh(corsairFinGeo, engineMaterial);
                fin.rotation.y = -Math.PI / 2;
                fin.position.set(0.25, 0.4, fz);
                eng.add(fin);
            });
        });

    } else {
        // FIGHTER
        // --- SMOOTHED FIGHTER (capsule body + bullet nose, matching the
        //     Speedster treatment) ---

        // 1. Body: round capsule (cylinder + hemispherical end caps). Radius
        //    0.6, total length 5 so it occupies the same Z range (-2.0 .. 3.0)
        //    as the previous rounded-box body. Top now sits at y = 1.0, sides
        //    at x = ±0.6 (the round body is narrower at the shoulders than the
        //    old 1.4-wide box, so side-mounted greebles are tucked in below).
        const bodyRadius = 0.6;
        const bodyLength = 5.0;
        const bodyCenterZ = 0.5;
        const bodyCylinderLength = bodyLength - 2 * bodyRadius;   // straight section between caps
        const bodyGeometry = getGeometry('fighter_capsule_body', () => new THREE.CapsuleGeometry(bodyRadius, bodyCylinderLength, 12, 32));
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.rotation.x = Math.PI / 2;                            // align capsule axis (local +Y) with world +Z
        body.position.set(0, 0.4, bodyCenterZ);                   // body spans world Z = -2.0 to +3.0
        ship.add(body);

        // 2. Nose: elongated bullet (stretched sphere) projecting forward from
        //    the cylinder section, sharing the body's circular cross-section so
        //    the join is invisible (back half hidden inside the body, enclosing
        //    the capsule's front hemispherical cap).
        const noseGeometry = getGeometry('fighter_bullet_nose', () => new THREE.SphereGeometry(1, 32, 24));
        const nose = new THREE.Mesh(noseGeometry, bodyMaterial);
        nose.scale.set(bodyRadius, bodyRadius, 3.0);                          // cross-section matches body; tip 3.0 forward of centre
        nose.position.set(0, 0.4, bodyCenterZ - (bodyLength / 2 - bodyRadius)); // centre at front of cylinder section (Z = -1.4)
        ship.add(nose);

        // Wings: tapered planform with a forward-bowed curved leading edge and
        // a rounded wingtip. Built per-side (dir = +1 right, -1 left) as a
        // mirror across X so the curve stays on the leading/outboard edge for
        // both wings — mirroring via rotation.z would flip the chord and throw
        // the round edge to the rear. The point order is wound consistently
        // (CW) for both directions so the extruded faces share normals.
        const createTaperedWing = (rootChord: number, tipChord: number, span: number, dir: number) => {
            const s = new THREE.Shape();
            if (dir > 0) {
                s.moveTo(0, rootChord / 2);                                              // root leading
                s.quadraticCurveTo(span * 0.5, rootChord / 2 + 0.4, span, tipChord / 2); // curved leading edge bowing forward
                s.quadraticCurveTo(span + 0.3, 0, span, -tipChord / 2);                  // rounded wingtip bulging outward
                s.lineTo(0, -rootChord / 2);                                             // straight trailing edge to root
                s.lineTo(0, rootChord / 2);                                              // close along root edge
            } else {
                s.moveTo(0, rootChord / 2);                                                  // root leading
                s.lineTo(0, -rootChord / 2);                                                 // down the root edge
                s.lineTo(-span, -tipChord / 2);                                              // straight trailing edge to tip
                s.quadraticCurveTo(-(span + 0.3), 0, -span, tipChord / 2);                   // rounded wingtip bulging outward
                s.quadraticCurveTo(-span * 0.5, rootChord / 2 + 0.4, 0, rootChord / 2);      // curved leading edge back to root
            }
            return s;
        };

        const wingSettings = {
            steps: 1,
            depth: 0.2, // Thickness (Y)
            bevelEnabled: true,
            bevelThickness: 0.05,
            bevelSize: 0.05,
            bevelSegments: 3
        };

        const rightWingGeometry = getGeometry('fighter_wing_right', () => new THREE.ExtrudeGeometry(createTaperedWing(3.5, 2.0, 1.8, 1), wingSettings));
        const leftWingGeometry = getGeometry('fighter_wing_left', () => new THREE.ExtrudeGeometry(createTaperedWing(3.5, 2.0, 1.8, -1), wingSettings));

        // Shape X (span) -> world X, shape Y (chord, +Y = leading) -> world -Z
        // (forward), extrude thickness -> world +Y. Flat rotation only; the side
        // is baked into each shape so no chord-flipping rotation is needed.
        // buggyWing reproduces the original mirror bug: reuse the RIGHT geometry
        // and mirror via a 180° rotation, which flips the chord too so the curved
        // leading edge ends up at the back. (Debug/vlog only.)
        const leftWing = new THREE.Mesh(buggyWing ? rightWingGeometry : leftWingGeometry, wingMaterial);
        leftWing.rotation.x = -Math.PI / 2;
        if (buggyWing) leftWing.rotation.z = Math.PI;
        leftWing.position.set(-0.55, 0.3, 0.5);
        ship.add(leftWing);

        const rightWing = new THREE.Mesh(rightWingGeometry, wingMaterial);
        rightWing.rotation.x = -Math.PI / 2;
        rightWing.position.set(0.55, 0.3, 0.5);
        ship.add(rightWing);



        // Fins: Triangle Shape (Sharp Front)
        const createFinShape = () => {
            const s = new THREE.Shape();
            const len = 1.5;
            const height = 1.2;
            // Tip at 0,0 (Front)
            s.moveTo(0, 0);
            s.lineTo(len, height / 2); // Back Top
            s.lineTo(len, -height / 2); // Back Bottom
            s.lineTo(0, 0); // Close
            return s;
        };

        const finSettings = {
            steps: 1,
            depth: 0.2, // Thickness
            bevelEnabled: true,
            bevelThickness: 0.05,
            bevelSize: 0.05,
            bevelSegments: 2
        };

        const finGeometry = getGeometry('fighter_fin_triangle', () => new THREE.ExtrudeGeometry(createFinShape(), finSettings));

        const rightFin = new THREE.Mesh(finGeometry, wingMaterial);
        // Shape X (Length) -> World Z. Shape Y (Height) -> World Y. Shape Z (Thickness) -> World X/Side.
        // Rotate Y -90: X->Z, Z->-X.
        rightFin.rotation.y = -Math.PI / 2;
        // Pos: 
        // We want Front at Z ~ -0.25 (Previous box front).
        // My shape 0 is Front.
        // So Z = -0.25.
        // X = 2.3.
        rightFin.position.set(2.3, 0.6, -0.25);
        ship.add(rightFin);

        const leftFin = new THREE.Mesh(finGeometry, wingMaterial);
        leftFin.rotation.y = -Math.PI / 2;
        leftFin.position.set(-2.3, 0.6, -0.25);
        // But wait, left fin thickness should probably be mirrored? 
        // Extrude is 0 to 0.2. With Rot -90, it goes 0 to -0.2 in X.
        // Right Fin at 2.3 -> 2.1. (Inner).
        // Left Fin at -2.3 -> -2.5. (Outer).
        // We might want to adjust Left Fin X slightly to center thickness or flip it.
        // If we want thickness inwards: 
        // Left Fin: Rot Y +90? X->-Z. Z->X.
        // Shape X (Length) -> -Z (Forward). Shape Z (Thick) -> +X (Inward).
        // If we use Rot +90:
        // Shape X (0 to 1.5) points -Z.
        // So Front is 0. Back is -1.5. 
        // For +Z back, we need to Translate Z or rethink.
        // Let's just adjust Position X for Left Fin.
        // Right Fin: 2.3 is outer surface (since Z->-X means thickness goes Negative X).
        // So Right Fin occupies X: 2.3 to 2.1.
        // Left Fin: at -2.3. Thickness goes -0.2 (to -2.5).
        // So Box was centered at 2.3. Width 0.2. Range 2.2 to 2.4.
        // My Right Fin (2.3 to 2.1). Slightly inward.
        // Let's set Right Fin at 2.4. (Range 2.4 to 2.2).
        // Left Fin at -2.2. (Range -2.2 to -2.4).

        rightFin.position.set(2.4, 0.6, -0.25);
        leftFin.position.set(-2.2, 0.6, -0.25);

        ship.add(leftFin);

        const engineGeometry = getGeometry('fighter_engine', () => new THREE.CylinderGeometry(0.4, 0.4, 1.5, 12));
        const leftEngine = new THREE.Mesh(engineGeometry, engineMaterial);
        leftEngine.rotation.x = Math.PI / 2;
        leftEngine.position.set(-0.75, 0.4, 3.2);
        ship.add(leftEngine);

        const rightEngine = new THREE.Mesh(engineGeometry, engineMaterial);
        rightEngine.rotation.x = Math.PI / 2;
        rightEngine.position.set(0.75, 0.4, 3.2);
        ship.add(rightEngine);

        enginePositions.push(new THREE.Vector3(-0.75, 0.4, 3.95));
        enginePositions.push(new THREE.Vector3(0.75, 0.4, 3.95));

        const cockpitGeometry = getGeometry('fighter_cockpit', () => new THREE.SphereGeometry(0.48, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2));
        const cockpit = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
        cockpit.rotation.x = -0.5;
        cockpit.scale.z = 1.6;
        cockpit.position.set(0, 0.6, -0.5);
        ship.add(cockpit);

        // --- GREEBLES ---
        // Body bounds (round capsule r=0.6): X ±0.6, Y -0.2 to 1.0, Z -2.0 to 3.0.
        // Engines at (±0.75, 0.4, 3.2), length 1.5 → Z 2.45 to 3.95.

        // 1. Top spine - structural reinforcement plate
        const spineGeo = getGeometry('fighter_spine', () => new THREE.BoxGeometry(0.18, 0.1, 3.2));
        const spine = new THREE.Mesh(spineGeo, engineMaterial);
        spine.position.set(0, 1.0, 1.0);
        ship.add(spine);

        // 2. Side air intakes - angled boxes suggesting engine intakes
        const intakeGeo = getGeometry('fighter_intake', () => new THREE.BoxGeometry(0.22, 0.32, 0.55));
        const leftIntake = new THREE.Mesh(intakeGeo, engineMaterial);
        leftIntake.position.set(-0.6, 0.45, -1.0);
        leftIntake.rotation.y = -0.12;
        ship.add(leftIntake);

        const rightIntake = new THREE.Mesh(intakeGeo, engineMaterial);
        rightIntake.position.set(0.6, 0.45, -1.0);
        rightIntake.rotation.y = 0.12;
        ship.add(rightIntake);

        // 3. Engine cooling rings - three thin torus rings around each engine.
        // Torus default lies in XY plane (hole-axis on Z), which already
        // matches the engine cylinder's Z-aligned long axis, so no rotation.
        const ringGeo = getGeometry('fighter_engine_ring', () => new THREE.TorusGeometry(0.46, 0.05, 8, 24));
        const ringZ = [2.7, 3.2, 3.7];
        [-0.75, 0.75].forEach(ex => {
            ringZ.forEach(rz => {
                const ring = new THREE.Mesh(ringGeo, engineMaterial);
                ring.position.set(ex, 0.4, rz);
                ship.add(ring);
            });
        });

        // 4. Sensor mast + dome behind the cockpit
        const mastGeo = getGeometry('fighter_mast', () => new THREE.CylinderGeometry(0.04, 0.05, 0.45, 8));
        const mast = new THREE.Mesh(mastGeo, engineMaterial);
        mast.position.set(0, 1.2, 0.5);
        ship.add(mast);

        const sensorGeo = getGeometry('fighter_sensor', () => new THREE.SphereGeometry(0.09, 12, 8));
        const sensor = new THREE.Mesh(sensorGeo, engineMaterial);
        sensor.position.set(0, 1.45, 0.5);
        ship.add(sensor);

        // 5. Wing-tip pylons - small mechanical bumps under the wings
        const pylonGeo = getGeometry('fighter_pylon', () => new THREE.BoxGeometry(0.18, 0.18, 0.6));
        const leftPylon = new THREE.Mesh(pylonGeo, engineMaterial);
        leftPylon.position.set(-1.9, 0.18, 0.5);
        ship.add(leftPylon);

        const rightPylon = new THREE.Mesh(pylonGeo, engineMaterial);
        rightPylon.position.set(1.9, 0.18, 0.5);
        ship.add(rightPylon);

        // 6. Underbelly stabilizer fin (small ventral fin)
        const bellyGeo = getGeometry('fighter_belly_fin', () => {
            const s = new THREE.Shape();
            s.moveTo(0, 0);                                   // leading root (front-top)
            s.lineTo(0.9, 0);                                 // trailing root (back-top)
            s.quadraticCurveTo(0.75, -0.5, 0.45, -0.45);      // curved trailing edge sweeping to the tip
            s.quadraticCurveTo(0.12, -0.4, 0, 0);             // curved leading edge back up to the front
            return new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 });
        });
        const belly = new THREE.Mesh(bellyGeo, engineMaterial);
        belly.rotation.y = -Math.PI / 2;
        belly.position.set(0.04, -0.1, 1.8);
        ship.add(belly);
    }

    // --- SHARED VISUALS (Headlights, Glows) ---
    // Create glows for deferred engine positions (Standard Ships)
    enginePositions.forEach(pos => {
        addGlow(pos);
    });

    return { mesh: ship, glows: glows };
};
