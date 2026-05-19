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

export const createShip = (color: number = 0xcc0000, type: ShipType = 'fighter'): ShipParts => {
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
        ? getMaterial('wing_pbr', { color: 0xeeeeee, metalness: 0.6, roughness: 0.5, envMapIntensity: envBoost }, THREE.MeshStandardMaterial) as THREE.MeshStandardMaterial
        : getMaterial('wing', { color: 0xeeeeee, shininess: 80 }) as THREE.MeshPhongMaterial;
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

    const glowGeometry = getGeometry('glow_sphere', () => new THREE.SphereGeometry(0.3, 8, 8));

    const addGlow = (pos: THREE.Vector3, parent: THREE.Object3D = ship) => {
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.position.copy(pos);
        parent.add(glow);

        const spray = new THREE.Mesh(sprayGeometry, sprayMaterial);
        spray.rotation.x = Math.PI / 2;
        spray.scale.set(exhaustScale, 1, exhaustScale);
        glow.add(spray);

        glows.push(glow);
        return glow;
    };

    let enginePositions: THREE.Vector3[] = [];
    let exhaustScale = 1.0;

    if (type === 'speedster') {
        // --- BEVELED SPEEDSTER (Original Design + Smooth Edges) ---

        // 1. Body: Long Rounded Box
        // Original: 0.8 x 0.8 x 7.0
        const bodyWidth = 0.8;
        const bodyHeight = 0.8;
        const bodyLength = 7.0;
        const bodyBevel = 0.1;

        // Create shape slightly smaller to account for bevel
        const bodyShape = createRoundedRect(bodyWidth - bodyBevel, bodyHeight - bodyBevel, bodyBevel);

        const bodyExtrudeSettings = {
            steps: 2,
            depth: bodyLength,
            bevelEnabled: true,
            bevelThickness: bodyBevel,
            bevelSize: bodyBevel,
            bevelSegments: 5,
            bevelOffset: 0
        };

        const fuselageGeo = getGeometry('speedster_beveled_body', () => new THREE.ExtrudeGeometry(bodyShape, bodyExtrudeSettings));
        const body = new THREE.Mesh(fuselageGeo, bodyMaterial);

        // Extrude starts at Z=0 and goes to +Length. Center needs to be adjusted.
        // We probably want it centered around Z=0 for easy nose/engine attachment.
        body.position.set(0, 0.4, -bodyLength / 2);
        ship.add(body);

        // 2. Nose: Smooth Cone (instead of 4-sided)
        // Original: 0.5 radius, 3.0 length.
        const noseGeo = getGeometry('speedster_smooth_nose', () => new THREE.ConeGeometry(0.45, 3.0, 32));
        const nose = new THREE.Mesh(noseGeo, bodyMaterial);
        nose.rotation.x = -Math.PI / 2;
        // Positioned at the front of the body
        // Body (centered) ends at -bodyLength/2? No, let's check coordinate.
        // Body Pos: 0, 0.4, -3.5. Extrude goes 0 to 7. Local Z goes 0 to 7.
        // Global Z: -3.5 to 3.5.
        // Front is at Z = -3.5.
        nose.position.set(0, 0.4, -5.0); // -3.5 (front) - 1.5 (half cone height)
        ship.add(nose);

        // 3. Wings: Rounded Plates
        // Original: 2.0 x 0.1 x 4.0
        const wingShape = createRoundedRect(2.0, 0.1, 0.02);
        const wingSettings = {
            steps: 1,
            depth: 4.0,
            bevelEnabled: true,
            bevelThickness: 0.05,
            bevelSize: 0.05,
            bevelSegments: 3
        };
        const wingGeo = getGeometry('speedster_beveled_wing', () => new THREE.ExtrudeGeometry(wingShape, wingSettings));

        const leftWing = new THREE.Mesh(wingGeo, wingMaterial);
        // Wing is drawn 2.0 wide (X), 0.1 high (Y), extruded 4.0 (Z).
        // Rotate to match.
        // Original wings were at +/- 1.2, 0.3, 1.0. and Rotated Y +/- PI/12.
        leftWing.position.set(-1.2, 0.3, -1.0); // Adjustment for extrude offset
        leftWing.rotation.y = Math.PI / 12;
        ship.add(leftWing);

        const rightWing = new THREE.Mesh(wingGeo, wingMaterial);
        rightWing.position.set(1.2, 0.3, -1.0);
        rightWing.rotation.y = -Math.PI / 12;
        ship.add(rightWing);

        // 4. Cabin
        const cabinGeo = getGeometry('speedster_cabin_sphere', () => new THREE.SphereGeometry(0.5, 32, 16));
        const cabin = new THREE.Mesh(cabinGeo, cockpitMaterial);
        cabin.scale.set(0.8, 1.0, 2.0);
        cabin.position.set(0, 0.8, 1.0);
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
        // Leading edge swept back: low at front, tall at trailing edge.
        const dorsalShape = new THREE.Shape();
        dorsalShape.moveTo(0, 0);            // front-bottom
        dorsalShape.lineTo(1.0, 0);          // bottom-back
        dorsalShape.lineTo(1.0, 0.5);        // back-top (tall trailing edge)
        dorsalShape.lineTo(0, 0);            // swept leading edge back to front-bottom
        const dorsalGeo = getGeometry('speedster_dorsal', () => new THREE.ExtrudeGeometry(dorsalShape, { depth: 0.06, bevelEnabled: false }));
        const dorsal = new THREE.Mesh(dorsalGeo, engineMaterial);
        dorsal.rotation.y = -Math.PI / 2;
        dorsal.position.set(0.03, 0.8, 2.5);
        ship.add(dorsal);

        // 2. Nose-top air scoop
        const scoopGeo = getGeometry('speedster_scoop', () => new THREE.BoxGeometry(0.2, 0.08, 0.6));
        const scoop = new THREE.Mesh(scoopGeo, engineMaterial);
        scoop.position.set(0, 0.85, -4.2);
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

        // 4. Wing-mounted aerial probes
        const probeGeo = getGeometry('speedster_probe', () => new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8));
        [-2.0, 2.0].forEach(px => {
            const probe = new THREE.Mesh(probeGeo, engineMaterial);
            probe.rotation.x = Math.PI / 2;
            probe.position.set(px, 0.45, -2.0);
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

        const bodyW = 1.0;
        const bodyH = 1.2;
        const bodyL = 4.0;
        const bevel = 0.1;

        const bodyShape = createRoundedRect(bodyW - bevel, bodyH - bevel, bevel);
        const bodySettings = {
            steps: 2,
            depth: bodyL,
            bevelEnabled: true,
            bevelThickness: bevel,
            bevelSize: bevel,
            bevelSegments: 3
        };

        const bodyGeo = getGeometry('interceptor_body_rounded', () => new THREE.ExtrudeGeometry(bodyShape, bodySettings));
        const body = new THREE.Mesh(bodyGeo, bodyMaterial);
        // Original Pos: 0, 0.6, 0. Center Z=0.
        // Extrunde 0 to 4.0.
        // Start at -2.0.
        body.position.set(0, 0.6, -2.0);
        ship.add(body);

        // Smooth Nose
        const noseGeo = getGeometry('interceptor_nose_smooth', () => new THREE.ConeGeometry(0.5, 2.0, 32));
        const nose = new THREE.Mesh(noseGeo, bodyMaterial);
        nose.rotation.x = -Math.PI / 2;
        // nose.rotation.y = Math.PI / 4; // Check if 4-sided rotation is still needed? No, it's round now.
        nose.position.set(0, 0.6, -3.0);
        ship.add(nose);

        // Bi-Plane Delta Wings
        const createDeltaShape = () => {
            const s = new THREE.Shape();
            const wingSpan = 5.0;
            const wingChord = 4.5; // Increased from 2.5 to 4.5
            // Tip is at +Chord/2 (Y+). Back is at -Chord/2 (Y-).
            // We want tip to be narrower? No, simple triangle.
            s.moveTo(0, wingChord / 2);
            s.lineTo(wingSpan / 2, -wingChord / 2);
            s.lineTo(-wingSpan / 2, -wingChord / 2);
            s.lineTo(0, wingChord / 2);
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

        const deltaGeo = getGeometry('interceptor_delta_wing_long', () => {
            return new THREE.ExtrudeGeometry(createDeltaShape(), deltaSettings);
        });

        const topWing = new THREE.Mesh(deltaGeo, wingMaterial);
        topWing.rotation.x = -Math.PI / 2; // Y+ becomes Z- (Forward)
        topWing.position.set(0, 1.2, 0.0); // Shifted Z position
        ship.add(topWing);

        const bottomWing = new THREE.Mesh(deltaGeo, wingMaterial);
        bottomWing.rotation.x = -Math.PI / 2;
        bottomWing.position.set(0, 0.0, 0.0); // Shifted Z position
        ship.add(bottomWing);

        // Bi-plane struts connecting the top and bottom wings. The delta wing
        // at Z=0.5 is only ±1.53 wide, so the previous X=±1.8 placed them
        // outside the wing entirely. Pull them inboard to where the wings
        // are widest (centered) and thicken them so they read clearly.
        const strutGeo = getGeometry('interceptor_strut', () => new THREE.CylinderGeometry(0.08, 0.08, 1.25, 12));
        const strutOffsets: [number, number][] = [[-1.0, -0.3], [1.0, -0.3], [-1.0, 0.6], [1.0, 0.6]];
        strutOffsets.forEach(([sx, sz]) => {
            const strut = new THREE.Mesh(strutGeo, engineMaterial);
            strut.position.set(sx, 0.6, sz);
            ship.add(strut);
        });

        // Engines (4 small ones)
        const engineGeo = getGeometry('interceptor_engine', () => new THREE.CylinderGeometry(0.25, 0.25, 1.0, 8));
        const engOffsets = [
            { x: -0.8, y: 0.2 }, { x: 0.8, y: 0.2 },
            { x: -0.8, y: 1.0 }, { x: 0.8, y: 1.0 }
        ];
        engOffsets.forEach(off => {
            const eng = new THREE.Mesh(engineGeo, engineMaterial);
            eng.rotation.x = Math.PI / 2;
            eng.position.set(off.x, off.y, 2.0);
            ship.add(eng);
            enginePositions.push(new THREE.Vector3(off.x, off.y, 2.5));
        });

        // Cockpit
        const cabinGeo = getGeometry('interceptor_cabin', () => new THREE.SphereGeometry(0.45, 16, 16));
        const cabin = new THREE.Mesh(cabinGeo, cockpitMaterial);
        cabin.scale.z = 1.5;
        cabin.position.set(0, 1.3, -0.5);
        ship.add(cabin);

        // --- GREEBLES ---
        // Body: X ±0.5, Y 0 to 1.2, Z -2.0 to 2.0.
        // Small engines (0.25r) at (±0.8, 0.2 or 1.0, 2.0).

        // 1. Antenna mast on top of the cabin
        const intMastGeo = getGeometry('interceptor_mast', () => new THREE.CylinderGeometry(0.03, 0.04, 0.5, 8));
        const intMast = new THREE.Mesh(intMastGeo, engineMaterial);
        intMast.position.set(0, 1.9, -0.5);
        ship.add(intMast);

        const intSensorGeo = getGeometry('interceptor_sensor', () => new THREE.SphereGeometry(0.07, 10, 8));
        const intSensor = new THREE.Mesh(intSensorGeo, engineMaterial);
        intSensor.position.set(0, 2.18, -0.5);
        ship.add(intSensor);

        // 2. Engine cooling rings - one per engine
        const intRingGeo = getGeometry('interceptor_ring', () => new THREE.TorusGeometry(0.30, 0.04, 8, 20));
        const intRingOffsets: [number, number][] = [[-0.8, 0.2], [0.8, 0.2], [-0.8, 1.0], [0.8, 1.0]];
        intRingOffsets.forEach(([rx, ry]) => {
            const ring = new THREE.Mesh(intRingGeo, engineMaterial);
            ring.position.set(rx, ry, 2.0);
            ship.add(ring);
        });

        // 3. Wing-tip strobes - small light pods at the trailing corners
        const strobeGeo = getGeometry('interceptor_strobe', () => new THREE.SphereGeometry(0.1, 10, 8));
        const strobePositions: [number, number, number][] = [
            [-2.45, 1.2, 2.2], [2.45, 1.2, 2.2],
            [-2.45, 0.0, 2.2], [2.45, 0.0, 2.2]
        ];
        strobePositions.forEach(([px, py, pz]) => {
            const strobe = new THREE.Mesh(strobeGeo, engineMaterial);
            strobe.position.set(px, py, pz);
            ship.add(strobe);
        });

        // 4. Nose-top air scoop
        const intScoopGeo = getGeometry('interceptor_scoop', () => new THREE.BoxGeometry(0.2, 0.1, 0.5));
        const intScoop = new THREE.Mesh(intScoopGeo, engineMaterial);
        intScoop.position.set(0, 0.95, -2.8);
        ship.add(intScoop);

        // 5. Belly fairing - small mechanical bump under the body
        const bellyGeo = getGeometry('interceptor_belly', () => new THREE.BoxGeometry(0.5, 0.15, 1.4));
        const belly = new THREE.Mesh(bellyGeo, engineMaterial);
        belly.position.set(0, -0.05, 0.3);
        ship.add(belly);

    } else if (type === 'corsair') {
        exhaustScale = 1.6;
        // --- CORSAIR (Anhedral Wings - Bad Guy Look) ---
        // Rounded Edges Update

        // Hull
        const hullW = 1.2;
        const hullH = 0.9;
        const hullL = 5.0;
        const bevel = 0.1;

        const hullShape = createRoundedRect(hullW - bevel, hullH - bevel, bevel);
        const hullSettings = {
            steps: 2,
            depth: hullL,
            bevelEnabled: true,
            bevelThickness: bevel,
            bevelSize: bevel,
            bevelSegments: 3
        };
        const mainHullGeo = getGeometry('corsair_hull_rounded', () => new THREE.ExtrudeGeometry(hullShape, hullSettings));
        const hull = new THREE.Mesh(mainHullGeo, bodyMaterial);
        // Original Box center 0.5. Box range -2.5 + 0.5 (-2.0) to 2.5 + 0.5 (3.0)? 
        // No, BoxGeometry(0.8, 0.6, 5.0). Center is 0,0,0. Pos is 0, 0.5, 0.
        // Range Z: -2.5 to 2.5.
        // Extrude (0 to 5.0).
        // Start at -2.5.
        hull.position.set(0, 0.5, -2.5);
        ship.add(hull);

        // Nose Cone (Smooth)
        const noseGeo = getGeometry('corsair_nose_smooth', () => new THREE.ConeGeometry(0.52, 3.0, 32));
        const nose = new THREE.Mesh(noseGeo, bodyMaterial);
        nose.rotation.x = -Math.PI / 2;
        // nose.rotation.y = Math.PI / 4; // Not needed for smooth
        nose.position.set(0, 0.5, -4.0); // hull front (-2.5) - half len (1.5)
        ship.add(nose);

        // Anhedral Wings (Angled Down) - Rounded
        const wingW = 2.5;
        const wingH = 0.1;
        const wingL = 1.5; // Depth
        const wingBevel = 0.02;

        const wingShape = createRoundedRect(wingW - wingBevel, wingH - wingBevel, wingBevel);
        const wingSettings = {
            steps: 1,
            depth: wingL,
            bevelEnabled: true,
            bevelThickness: 0.05,
            bevelSize: 0.05,
            bevelSegments: 3
        };
        const wingGeo = getGeometry('corsair_wing_rounded', () => new THREE.ExtrudeGeometry(wingShape, wingSettings));

        // Left Wing
        const leftWing = new THREE.Mesh(wingGeo, wingMaterial);
        // Original Pos: -1.5, 0.1, 0.5.
        // Rot Z: PI/6.
        // Extrude is Z (0 to 1.5). Center at 0.75.
        // Box Range: -0.75 to 0.75 relative to center.
        // We want Center at 0.5 world Z.
        // Start at 0.5 - 0.75 = -0.25.
        leftWing.position.set(-1.5, 0.1, -0.25);
        leftWing.rotation.z = Math.PI / 6; // +30 degrees
        ship.add(leftWing);

        // Right Wing
        const rightWing = new THREE.Mesh(wingGeo, wingMaterial);
        rightWing.position.set(1.5, 0.1, -0.25);
        rightWing.rotation.z = -Math.PI / 6;
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
        leftEng.position.set(-1.8, 0.0, 1.5); // Slightly outer and lower
        leftEng.rotation.z = Math.PI / 6; // Match wing angle
        ship.add(leftEng);
        // Attach glow directly to engine (local position at back of engine)
        addGlow(new THREE.Vector3(0, 0, engL), leftEng);

        const rightEng = new THREE.Mesh(engineGeo, engineMaterial);
        rightEng.position.set(1.8, 0.0, 1.5);
        rightEng.rotation.z = -Math.PI / 6;
        ship.add(rightEng);
        addGlow(new THREE.Vector3(0, 0, engL), rightEng);

        // Cockpit - Aggressive slit
        const cabinGeo = getGeometry('corsair_cabin', () => new THREE.BoxGeometry(0.5, 0.3, 1.5));
        const cabin = new THREE.Mesh(cabinGeo, cockpitMaterial);
        cabin.position.set(0, 1.0, -0.5);
        ship.add(cabin);

        // --- GREEBLES ---
        // Hull: X ±0.6, Y 0 to 0.9, Z -2.5 to 2.5.
        // Anhedral wings at (±1.5, 0.1, -0.25), rotated Z by ±π/6.

        // 1. Dorsal spike - aggressive blade behind the cockpit.
        // Leading edge swept back, with a hooked recurve at the back-top tip.
        const corsairSpikeShape = new THREE.Shape();
        corsairSpikeShape.moveTo(0, 0);          // front-bottom
        corsairSpikeShape.lineTo(1.2, 0);        // bottom-back
        corsairSpikeShape.lineTo(1.2, 0.7);      // back-top (tall trailing edge)
        corsairSpikeShape.lineTo(0.9, 0.45);     // forward sweep along the top
        corsairSpikeShape.lineTo(0, 0);          // swept leading edge back to front-bottom
        const corsairSpikeGeo = getGeometry('corsair_spike', () => new THREE.ExtrudeGeometry(corsairSpikeShape, { depth: 0.07, bevelEnabled: false }));
        const corsairSpike = new THREE.Mesh(corsairSpikeGeo, engineMaterial);
        corsairSpike.rotation.y = -Math.PI / 2;
        corsairSpike.position.set(0.035, 0.9, 0.5);
        ship.add(corsairSpike);

        // 2. Forward-facing weapon barrels on the hull sides
        const barrelGeo = getGeometry('corsair_barrel', () => new THREE.CylinderGeometry(0.06, 0.08, 1.2, 12));
        [-0.55, 0.55].forEach(bx => {
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
        // Wing local +/-X tip after Z-rotation lands at roughly (±2.58, -0.53, -0.25).
        const dartGeo = getGeometry('corsair_dart', () => new THREE.ConeGeometry(0.09, 0.6, 12));
        ([[-2.58, -0.53, -0.4], [2.58, -0.53, -0.4]] as [number, number, number][]).forEach(([dx, dy, dz]) => {
            const dart = new THREE.Mesh(dartGeo, engineMaterial);
            dart.rotation.x = -Math.PI / 2;
            dart.position.set(dx, dy, dz);
            ship.add(dart);
        });

        // 5. Rear airbrake fin - small perpendicular spoiler behind the cockpit
        const airbrakeGeo = getGeometry('corsair_airbrake', () => new THREE.BoxGeometry(1.0, 0.06, 0.3));
        const airbrake = new THREE.Mesh(airbrakeGeo, engineMaterial);
        airbrake.position.set(0, 0.95, 1.7);
        ship.add(airbrake);

        // 6. Engine top fins - swept-back wedge blades running along each twin boom.
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
        // Modified to use Rounded Edges
        const bodyW = 1.4;
        const bodyH = 1.0;
        const bodyL = 5.0;
        const bevel = 0.1;

        const bodyShape = createRoundedRect(bodyW - bevel, bodyH - bevel, bevel);
        const bodySettings = {
            steps: 2,
            depth: bodyL,
            bevelEnabled: true,
            bevelThickness: bevel,
            bevelSize: bevel,
            bevelSegments: 4
        };
        const bodyGeometry = getGeometry('fighter_body_rounded', () => new THREE.ExtrudeGeometry(bodyShape, bodySettings));
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        // Extrude is Z 0 to L. Center at L/2.
        // Original Pos: 0, 0.4, 0.5. (Center Z=0.5).
        // Box len 5.0. Center at 0 local. Global Z range: -2.0 to 3.0.
        // Extrude starts at 0. Send to -2.0.
        body.position.set(0, 0.4, -2.0);
        ship.add(body);

        // Nose: Smooth Cone (32 segments)
        const noseGeometry = getGeometry('fighter_nose_smooth', () => new THREE.ConeGeometry(0.55, 3.5, 32));
        const nose = new THREE.Mesh(noseGeometry, bodyMaterial);
        nose.rotation.x = -Math.PI / 2;
        nose.position.set(0, 0.4, -3.7);
        ship.add(nose);

        // Wings: Tapered and Rounded
        const createTaperedWing = (rootChord: number, tipChord: number, span: number) => {
            const s = new THREE.Shape();
            // Root at X=0
            s.moveTo(0, rootChord / 2);
            s.lineTo(span, tipChord / 2); // Tip Leading Edge
            s.lineTo(span, -tipChord / 2); // Tip Trailing Edge
            s.lineTo(0, -rootChord / 2); // Root Trailing
            s.lineTo(0, rootChord / 2); // Close
            return s;
        };

        const wingShape = createTaperedWing(3.5, 2.0, 1.8);
        const wingSettings = {
            steps: 1,
            depth: 0.2, // Thickness (Y)
            bevelEnabled: true,
            bevelThickness: 0.05,
            bevelSize: 0.05,
            bevelSegments: 3
        };

        const wingGeometry = getGeometry('fighter_wing_tapered', () => new THREE.ExtrudeGeometry(wingShape, wingSettings));

        // Left Wing
        const leftWing = new THREE.Mesh(wingGeometry, wingMaterial);
        // Shape: X=0 to 1.8. Y= -Chord/2 to +Chord/2. Z (Extrude) = 0 to 0.2.
        // Orientation: 
        // We drew it as X = Span, Y = Chord.
        // We want: X = Span (Lateral), Z = Chord (Longitudinal), Y = Thickness.
        // So rotate X -90 to put Shape-Y into World-Z? 
        // Shape X (Span) is fine. Shape Y (Chord) -> Z. Extrude Z (Thickness) -> Y (Up).
        leftWing.rotation.x = -Math.PI / 2; // Flat
        leftWing.rotation.z = Math.PI; // Point Left

        // Position: 
        // Rot Z 180 means shape extends from 0 to -1.8 in X (World).
        // We want Start at -0.65.
        // So Position X = -0.65.
        // Shape goes from PosX to PosX - 1.8. 
        // -0.65 to -2.45. Correct.
        leftWing.position.set(-0.65, 0.3, 0.5);
        ship.add(leftWing);

        // Right Wing
        const rightWing = new THREE.Mesh(wingGeometry, wingMaterial);
        rightWing.rotation.x = -Math.PI / 2;
        // Shape 0 to +1.8 in X.
        // Root at 0.65.
        rightWing.position.set(0.65, 0.3, 0.5);
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
        leftEngine.position.set(-0.9, 0.4, 3.5);
        ship.add(leftEngine);

        const rightEngine = new THREE.Mesh(engineGeometry, engineMaterial);
        rightEngine.rotation.x = Math.PI / 2;
        rightEngine.position.set(0.9, 0.4, 3.5);
        ship.add(rightEngine);

        enginePositions.push(new THREE.Vector3(-0.9, 0.4, 4.25));
        enginePositions.push(new THREE.Vector3(0.9, 0.4, 4.25));

        const cockpitGeometry = getGeometry('fighter_cockpit', () => new THREE.SphereGeometry(0.55, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2));
        const cockpit = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
        cockpit.rotation.x = -0.5;
        cockpit.scale.z = 1.6;
        cockpit.position.set(0, 0.6, -0.5);
        ship.add(cockpit);

        // --- GREEBLES ---
        // Body bounds: X ±0.7, Y -0.1 to 0.9, Z -2.0 to 3.0.
        // Engines at (±0.9, 0.4, 3.5), length 1.5 → Z 2.75 to 4.25.

        // 1. Top spine - structural reinforcement plate
        const spineGeo = getGeometry('fighter_spine', () => new THREE.BoxGeometry(0.18, 0.1, 3.2));
        const spine = new THREE.Mesh(spineGeo, engineMaterial);
        spine.position.set(0, 0.92, 1.0);
        ship.add(spine);

        // 2. Side air intakes - angled boxes suggesting engine intakes
        const intakeGeo = getGeometry('fighter_intake', () => new THREE.BoxGeometry(0.22, 0.32, 0.55));
        const leftIntake = new THREE.Mesh(intakeGeo, engineMaterial);
        leftIntake.position.set(-0.76, 0.45, -1.0);
        leftIntake.rotation.y = -0.12;
        ship.add(leftIntake);

        const rightIntake = new THREE.Mesh(intakeGeo, engineMaterial);
        rightIntake.position.set(0.76, 0.45, -1.0);
        rightIntake.rotation.y = 0.12;
        ship.add(rightIntake);

        // 3. Engine cooling rings - three thin torus rings around each engine.
        // Torus default lies in XY plane (hole-axis on Z), which already
        // matches the engine cylinder's Z-aligned long axis, so no rotation.
        const ringGeo = getGeometry('fighter_engine_ring', () => new THREE.TorusGeometry(0.46, 0.05, 8, 24));
        const ringZ = [2.9, 3.5, 4.1];
        [-0.9, 0.9].forEach(ex => {
            ringZ.forEach(rz => {
                const ring = new THREE.Mesh(ringGeo, engineMaterial);
                ring.position.set(ex, 0.4, rz);
                ship.add(ring);
            });
        });

        // 4. Sensor mast + dome behind the cockpit
        const mastGeo = getGeometry('fighter_mast', () => new THREE.CylinderGeometry(0.04, 0.05, 0.45, 8));
        const mast = new THREE.Mesh(mastGeo, engineMaterial);
        mast.position.set(0, 1.15, 0.5);
        ship.add(mast);

        const sensorGeo = getGeometry('fighter_sensor', () => new THREE.SphereGeometry(0.09, 12, 8));
        const sensor = new THREE.Mesh(sensorGeo, engineMaterial);
        sensor.position.set(0, 1.4, 0.5);
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
            s.moveTo(0, 0);
            s.lineTo(0.9, 0);
            s.lineTo(0.4, -0.45);
            s.lineTo(0, 0);
            return new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: false });
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
