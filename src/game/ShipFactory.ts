import * as THREE from 'three';

export interface ShipParts {
    mesh: THREE.Group;
    glows: THREE.Mesh[];
}

export type ShipType = 'fighter' | 'speedster' | 'tank';

export const SHIP_STATS: Record<ShipType, { accelFactor: number, turnSpeed: number, friction: number, strafeSpeed: number }> = {
    fighter: {
        accelFactor: 0.55,
        turnSpeed: 0.001,
        friction: 0.9911,
        strafeSpeed: 0.011
    },
    speedster: {
        accelFactor: 0.45,
        turnSpeed: 0.0009,
        friction: 0.993, // Tuned by user
        strafeSpeed: 0.009
    },
    tank: {
        accelFactor: 0.65,
        turnSpeed: 0.0011,
        friction: 0.988,
        strafeSpeed: 0.015
    }
};

// Caches
const geometryCache: Record<string, THREE.BufferGeometry> = {};
const materialCache: Record<string, THREE.Material> = {};

export const createShip = (color: number = 0xcc0000, type: ShipType = 'fighter'): ShipParts => {
    const ship = new THREE.Group();
    const glows: THREE.Mesh[] = [];

    // Helper: Get or Create Material
    const getMaterial = (name: string, params: THREE.MeshPhongMaterialParameters | THREE.MeshBasicMaterialParameters, Type: typeof THREE.MeshPhongMaterial | typeof THREE.MeshBasicMaterial = THREE.MeshPhongMaterial) => {
        const key = `${name}_${JSON.stringify(params)}`;
        if (!materialCache[key]) {
            materialCache[key] = new Type(params);
        }
        return materialCache[key];
    };

    // Shared Materials
    const bodyMaterial = getMaterial('body', { color: color, shininess: 80 }) as THREE.MeshPhongMaterial;
    const wingMaterial = getMaterial('wing', { color: 0xeeeeee, shininess: 80 }) as THREE.MeshPhongMaterial;
    const engineMaterial = getMaterial('engine', { color: 0x444444 }) as THREE.MeshPhongMaterial;
    const cockpitMaterial = getMaterial('cockpit', { color: 0xffee00, transparent: true, opacity: 0.8, emissive: 0xaa8800 }) as THREE.MeshPhongMaterial;
    const glowMaterial = getMaterial('glow', { color: 0x00ffff, transparent: true, opacity: 0.9 }, THREE.MeshBasicMaterial) as THREE.MeshBasicMaterial;

    // Helper: Get or Create Geometry
    const getGeometry = (name: string, factory: () => THREE.BufferGeometry) => {
        if (!geometryCache[name]) {
            geometryCache[name] = factory();
        }
        return geometryCache[name];
    };

    // --- GEOMETRY GENERATION ---
    let enginePositions: THREE.Vector3[] = [];

    if (type === 'speedster') {
        // --- BEVELED SPEEDSTER (Original Design + Smooth Edges) ---

        // Helper helper: Rounded Rect Shape
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
        const bodyGeo = getGeometry('tank_body', () => new THREE.BoxGeometry(2.5, 1.2, 4.5));
        const body = new THREE.Mesh(bodyGeo, bodyMaterial);
        body.position.set(0, 0.6, 0.5);
        ship.add(body);

        const plateGeo = getGeometry('tank_plate', () => new THREE.BoxGeometry(2.7, 0.5, 3.0));
        const plate = new THREE.Mesh(plateGeo, wingMaterial);
        plate.position.set(0, 1.0, 0.0);
        ship.add(plate);

        const cabinGeo = getGeometry('tank_cabin', () => new THREE.BoxGeometry(1.0, 0.6, 1.5));
        const cabin = new THREE.Mesh(cabinGeo, cockpitMaterial);
        cabin.position.set(0, 1.1, -0.5);
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

    } else {
        // FIGHTER
        const bodyGeometry = getGeometry('fighter_body', () => new THREE.BoxGeometry(1.4, 1.0, 5.0));
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.set(0, 0.4, 0.5);
        ship.add(body);

        const noseGeometry = getGeometry('fighter_nose', () => new THREE.ConeGeometry(0.7, 3.5, 4));
        const nose = new THREE.Mesh(noseGeometry, bodyMaterial);
        nose.rotation.x = -Math.PI / 2;
        nose.rotation.y = Math.PI / 4;
        nose.position.set(0, 0.4, -3.7);
        ship.add(nose);

        const wingGeometry = getGeometry('fighter_wing', () => new THREE.BoxGeometry(1.5, 0.4, 3.5));
        const leftWing = new THREE.Mesh(wingGeometry, wingMaterial);
        leftWing.position.set(-1.6, 0.2, 1.5);
        ship.add(leftWing);

        const rightWing = new THREE.Mesh(wingGeometry, wingMaterial);
        rightWing.position.set(1.6, 0.2, 1.5);
        ship.add(rightWing);

        const finGeometry = getGeometry('fighter_fin', () => new THREE.BoxGeometry(0.2, 1.2, 1.5));
        const rightFin = new THREE.Mesh(finGeometry, wingMaterial);
        rightFin.position.set(2.4, 0.8, 1.5);
        ship.add(rightFin);

        const leftFin = new THREE.Mesh(finGeometry, wingMaterial);
        leftFin.position.set(-2.4, 0.8, 1.5);
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
    }

    // --- SHARED VISUALS (Headlights, Glows) ---
    ship.position.y = 1;

    // Spotlight
    const spotLight = new THREE.SpotLight(0xffffff, 10);
    spotLight.angle = Math.PI / 6;
    spotLight.penumbra = 0.2;
    spotLight.decay = 2;
    spotLight.distance = 200;
    ship.add(spotLight);
    spotLight.position.set(0, 5, 0);

    const spotLightTarget = new THREE.Object3D();
    ship.add(spotLightTarget);
    spotLightTarget.position.set(0, 0, -50);
    spotLight.target = spotLightTarget;

    // Afterburner Spray
    const sprayGeometry = getGeometry('spray', () => {
        const geo = new THREE.ConeGeometry(0.3, 2.0, 16, 1, true);
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

    const addGlow = (pos: THREE.Vector3) => {
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        glow.position.copy(pos);
        ship.add(glow);

        const spray = new THREE.Mesh(sprayGeometry, sprayMaterial);
        spray.rotation.x = Math.PI / 2;
        glow.add(spray);

        glows.push(glow);
        return glow;
    };

    // Create glows for ALL engine positions
    enginePositions.forEach(pos => {
        addGlow(pos);
    });

    return { mesh: ship, glows: glows };
};
