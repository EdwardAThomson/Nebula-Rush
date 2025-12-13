import * as THREE from 'three';

export interface ShipParts {
    mesh: THREE.Group;
    glows: THREE.Mesh[];
}

export type ShipType = 'fighter' | 'speedster' | 'tank' | 'interceptor' | 'corsair';

export const SHIP_STATS: Record<ShipType, { accelFactor: number, turnSpeed: number, friction: number, strafeSpeed: number, slideFactor: number }> = {
    fighter: {
        accelFactor: 0.55,
        turnSpeed: 0.001,
        friction: 0.9911,
        strafeSpeed: 0.011,
        slideFactor: 0.95 // Balanced
    },
    speedster: {
        accelFactor: 0.45,
        turnSpeed: 0.0009,
        friction: 0.993, // Fast Top Speed
        strafeSpeed: 0.009,
        slideFactor: 0.98 // Slippery
    },
    tank: {
        accelFactor: 0.65,
        turnSpeed: 0.0011,
        friction: 0.988,
        strafeSpeed: 0.015,
        slideFactor: 0.92 // Grippy/Snappy
    },
    interceptor: {
        accelFactor: 0.75, // Zoom!
        turnSpeed: 0.0015, // Snap turn
        friction: 0.990,
        strafeSpeed: 0.013,
        slideFactor: 0.85 // Super Snappy
    },
    corsair: {
        accelFactor: 0.50,
        turnSpeed: 0.0012,
        friction: 0.992,
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

    let enginePositions: THREE.Vector3[] = [];

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

    } else if (type === 'interceptor') {
        // --- INTERCEPTOR (Bi-Plane) ---
        // Compact body, double wings

        const bodyGeo = getGeometry('interceptor_body', () => new THREE.BoxGeometry(1.0, 1.2, 4.0));
        const body = new THREE.Mesh(bodyGeo, bodyMaterial);
        body.position.set(0, 0.6, 0);
        ship.add(body);

        const noseGeo = getGeometry('interceptor_nose', () => new THREE.ConeGeometry(0.5, 2.0, 4));
        const nose = new THREE.Mesh(noseGeo, bodyMaterial);
        nose.rotation.x = -Math.PI / 2;
        nose.rotation.y = Math.PI / 4;
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

        const strutGeo = getGeometry('interceptor_strut', () => new THREE.CylinderGeometry(0.05, 0.05, 1.2));
        const leftStrut = new THREE.Mesh(strutGeo, engineMaterial);
        leftStrut.position.set(-1.8, 0.6, 0.5); // Adjusted X position
        ship.add(leftStrut);

        const rightStrut = new THREE.Mesh(strutGeo, engineMaterial);
        rightStrut.position.set(1.8, 0.6, 0.5); // Adjusted X position
        ship.add(rightStrut);

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

    } else if (type === 'corsair') {
        // --- CORSAIR (Anhedral Wings - Bad Guy Look) ---

        //Sharp, angular body
        const bodyGeo = getGeometry('corsair_body', () => new THREE.ConeGeometry(0.6, 6.0, 3)); // Triangular body
        const body = new THREE.Mesh(bodyGeo, bodyMaterial);
        body.rotation.x = -Math.PI / 2; // Point forward
        body.rotation.z = Math.PI; // Flat side down? 3 sides -> flat top usually. Let's rotate to have flat bottom.
        // Cone orientation: Y is up. Rotated X-90 -> Z is forward (tip). 
        // 3 segments: 0deg is usually +X. 
        // Let's just use a custom simple shape or manipulated boxes if Cone is tricky.
        // Actually, a cylinder with 3 segments is a prism.
        // Let's stick to Box + Scaling for control.

        const mainHullGeo = getGeometry('corsair_hull', () => new THREE.BoxGeometry(0.8, 0.6, 5.0));
        const hull = new THREE.Mesh(mainHullGeo, bodyMaterial);
        hull.position.set(0, 0.5, 0);
        ship.add(hull);

        // Nose Cone
        const noseGeo = getGeometry('corsair_nose', () => new THREE.ConeGeometry(0.5, 3.0, 4));
        const nose = new THREE.Mesh(noseGeo, bodyMaterial);
        nose.rotation.x = -Math.PI / 2;
        nose.rotation.y = Math.PI / 4;
        nose.position.set(0, 0.5, -4.0); // hull front (-2.5) - half len (1.5)
        ship.add(nose);

        // Anhedral Wings (Angled Down) - Fixed Connection
        const wingGeo = getGeometry('corsair_wing', () => new THREE.BoxGeometry(2.5, 0.1, 1.5));

        // Left Wing
        // We want Anhedral: Root High (near body), Tip Low (outer).
        // Left Wing: Inner side is +X local. We want +X to be High? 
        // No, left wing is at -X. Inner side is Right side (+X local).
        // To make Inner High, we rotate +Z (Up-Right).
        const leftWing = new THREE.Mesh(wingGeo, wingMaterial);
        // Pivot math: We want Inner Tip roughly at (-0.4, 0.7).
        // Wing half-width ~ 1.25.
        // Rot +30 deg.
        // Center offset from Inner: dx = -1.25*cos(30) = -1.08. dy = -1.25*sin(30) = -0.625.
        // Center = (-0.4 - 1.08, 0.7 - 0.625) = (-1.48, 0.075).
        leftWing.position.set(-1.5, 0.1, 0.5);
        leftWing.rotation.z = Math.PI / 6; // +30 degrees
        ship.add(leftWing);

        // Right Wing
        const rightWing = new THREE.Mesh(wingGeo, wingMaterial);
        // Symmetry: X = 1.5, Y = 0.1.
        // Rotation: -30 degrees (Down-Right). Inner (Left side, -X) is High.
        rightWing.position.set(1.5, 0.1, 0.5);
        rightWing.rotation.z = -Math.PI / 6;
        ship.add(rightWing);

        // Connecting Wings/Struts (The "missing" wings)
        // Add robust connector blocks nicely blending body to wing root
        const connectorGeo = getGeometry('corsair_connector', () => new THREE.BoxGeometry(1.0, 0.2, 1.0));

        const leftConn = new THREE.Mesh(connectorGeo, engineMaterial);
        leftConn.position.set(-0.6, 0.6, 0.5);
        leftConn.rotation.z = Math.PI / 8; // Slight angle
        ship.add(leftConn);

        const rightConn = new THREE.Mesh(connectorGeo, engineMaterial);
        rightConn.position.set(0.6, 0.6, 0.5);
        rightConn.rotation.z = -Math.PI / 8;
        ship.add(rightConn);

        // Twin Boom Engines (Connected to Wings)
        const engineGeo = getGeometry('corsair_engine', () => new THREE.BoxGeometry(0.6, 0.6, 2.5));

        // Attach engines to the TIPS or MID? 
        // Let's attach them mid-wing for stability look.
        // Wing Center is at (-1.5, 0.1).
        // Engine at same pos, matching rotation?

        const leftEng = new THREE.Mesh(engineGeo, engineMaterial);
        leftEng.position.set(-1.8, 0.0, 1.5); // Slightly outer and lower
        leftEng.rotation.z = Math.PI / 6; // Match wing angle
        ship.add(leftEng);

        const rightEng = new THREE.Mesh(engineGeo, engineMaterial);
        rightEng.position.set(1.8, 0.0, 1.5);
        rightEng.rotation.z = -Math.PI / 6;
        ship.add(rightEng);

        enginePositions.push(new THREE.Vector3(-1.8, 0.0, 2.8));
        enginePositions.push(new THREE.Vector3(1.8, 0.0, 2.8));

        // Cockpit - Aggressive slit
        const cabinGeo = getGeometry('corsair_cabin', () => new THREE.BoxGeometry(0.5, 0.3, 1.5));
        const cabin = new THREE.Mesh(cabinGeo, cockpitMaterial);
        cabin.position.set(0, 0.85, -0.5);
        ship.add(cabin);

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
