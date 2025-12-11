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

export const createShip = (color: number = 0xcc0000, type: ShipType = 'fighter'): ShipParts => {
    const ship = new THREE.Group();
    const glows: THREE.Mesh[] = [];

    // Shared Materials
    const bodyMaterial = new THREE.MeshPhongMaterial({ color: color, shininess: 80 });
    const wingMaterial = new THREE.MeshPhongMaterial({ color: 0xeeeeee, shininess: 80 });
    const engineMaterial = new THREE.MeshPhongMaterial({ color: 0x444444 });
    const cockpitMaterial = new THREE.MeshPhongMaterial({ color: 0xffee00, transparent: true, opacity: 0.8, emissive: 0xaa8800 });
    const glowMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.9 });

    // --- GEOMETRY GENERATION ---
    let enginePositions: THREE.Vector3[] = [];

    if (type === 'speedster') {
        // --- SPEEDSTER: Long, thin, forward swept wings ---
        // Body
        const bodyGeo = new THREE.BoxGeometry(0.8, 0.8, 7.0);
        const body = new THREE.Mesh(bodyGeo, bodyMaterial);
        body.position.set(0, 0.4, 0);
        ship.add(body);

        // Nose Cone (Pointy)
        const noseGeo = new THREE.ConeGeometry(0.5, 3.0, 4);
        const nose = new THREE.Mesh(noseGeo, bodyMaterial);
        nose.rotation.x = -Math.PI / 2; // Point forward (-Z)
        nose.rotation.y = Math.PI / 4; // Diamond
        nose.position.set(0, 0.4, -5.0); // Attach to front
        ship.add(nose);

        // Cockpit (Further back)
        const cabinGeo = new THREE.SphereGeometry(0.4, 16, 16);
        const cabin = new THREE.Mesh(cabinGeo, cockpitMaterial);
        cabin.scale.z = 2.0;
        cabin.position.set(0, 0.7, 1.0);
        ship.add(cabin);

        // Wings (Swept Forward)
        const wingGeo = new THREE.BoxGeometry(2.0, 0.1, 4.0);
        const leftWing = new THREE.Mesh(wingGeo, wingMaterial);
        leftWing.position.set(-1.2, 0.3, 1.0);
        leftWing.rotation.y = Math.PI / 12; // Sweep forward
        ship.add(leftWing);

        const rightWing = new THREE.Mesh(wingGeo, wingMaterial);
        rightWing.position.set(1.2, 0.3, 1.0);
        rightWing.rotation.y = -Math.PI / 12;
        ship.add(rightWing);

        // Engines (Massive, on wings)
        const engineGeo = new THREE.CylinderGeometry(0.5, 0.5, 3.0, 12);
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

    } else if (type === 'tank') {
        // --- TANK: Wide, heavy, armored ---
        // Body (Wide)
        const bodyGeo = new THREE.BoxGeometry(2.5, 1.2, 4.5);
        const body = new THREE.Mesh(bodyGeo, bodyMaterial);
        body.position.set(0, 0.6, 0.5);
        ship.add(body);

        // Armor Plating
        const plateGeo = new THREE.BoxGeometry(2.7, 0.5, 3.0);
        const plate = new THREE.Mesh(plateGeo, wingMaterial); // White armor
        plate.position.set(0, 1.0, 0.0);
        ship.add(plate);

        // Cockpit (Small, protected)
        const cabinGeo = new THREE.BoxGeometry(1.0, 0.6, 1.5);
        const cabin = new THREE.Mesh(cabinGeo, cockpitMaterial);
        cabin.position.set(0, 1.1, -0.5);
        ship.add(cabin);

        // Engines (Quad)
        const engineGeo = new THREE.CylinderGeometry(0.6, 0.6, 1.0, 8);
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
        // --- FIGHTER (Original Design) ---
        // 1. Central Fuselage
        const bodyGeometry = new THREE.BoxGeometry(1.4, 1.0, 5.0);
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.set(0, 0.4, 0.5);
        ship.add(body);

        // 2. Nose Cone
        const noseGeometry = new THREE.ConeGeometry(0.7, 3.5, 4);
        const nose = new THREE.Mesh(noseGeometry, bodyMaterial);
        nose.rotation.x = -Math.PI / 2;
        nose.rotation.y = Math.PI / 4;
        nose.position.set(0, 0.4, -3.7);
        ship.add(nose);

        // 3. Side Wings
        const wingGeometry = new THREE.BoxGeometry(1.5, 0.4, 3.5);
        const leftWing = new THREE.Mesh(wingGeometry, wingMaterial);
        leftWing.position.set(-1.6, 0.2, 1.5);
        ship.add(leftWing);

        const rightWing = new THREE.Mesh(wingGeometry, wingMaterial);
        rightWing.position.set(1.6, 0.2, 1.5);
        ship.add(rightWing);

        // 3b. Fins
        const finGeometry = new THREE.BoxGeometry(0.2, 1.2, 1.5);
        const rightFin = new THREE.Mesh(finGeometry, wingMaterial);
        rightFin.position.set(2.4, 0.8, 1.5);
        ship.add(rightFin);

        const leftFin = new THREE.Mesh(finGeometry, wingMaterial);
        leftFin.position.set(-2.4, 0.8, 1.5);
        ship.add(leftFin);

        // 4. Engines
        const engineGeometry = new THREE.CylinderGeometry(0.4, 0.4, 1.5, 12);
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

        // 5. Cockpit
        const cockpitGeometry = new THREE.SphereGeometry(0.55, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
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
    const sprayGeometry = new THREE.ConeGeometry(0.3, 2.0, 16, 1, true);
    sprayGeometry.translate(0, 1.0, 0);
    const sprayMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });

    const addGlow = (pos: THREE.Vector3) => {
        const glow = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), glowMaterial);
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
