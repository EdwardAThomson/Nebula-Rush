import * as THREE from 'three';

// Create track path using curve
export const createTrackCurve = (): THREE.CatmullRomCurve3 => {
    // Define control points for a MASSIVE circuit (scaled up)
    // Deformed Oval with 2 massive straights
    const scale = 12.0;
    const points = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -400),
        new THREE.Vector3(100, 20, -600), // Slight elevation
        new THREE.Vector3(300, 40, -800),
        new THREE.Vector3(500, 20, -600), // Curve right
        new THREE.Vector3(600, 0, -300),
        new THREE.Vector3(500, -20, 0),   // Dip down
        new THREE.Vector3(300, 0, 200),
        new THREE.Vector3(0, 50, 400),    // Big jump/hill
        new THREE.Vector3(-300, 30, 600),
        new THREE.Vector3(-600, 0, 400),  // Wide left turn
        new THREE.Vector3(-400, 0, 200),  // Smoother transition
        new THREE.Vector3(0, 0, 200)      // Straight approach to start line (0,0,0) -> (0,0,-400)

    ].map(p => p.multiplyScalar(scale));



    /* --- new track suggestion
    new THREE.Vector3(0, 0, 400),       // Finish Line approach
    new THREE.Vector3(0, 0, 0),         // Start Line
    new THREE.Vector3(0, 0, -2000),     // Mid-Straight 1
    new THREE.Vector3(0, 0, -4000),     // End Straight 1
    new THREE.Vector3(400, 50, -4800),  // Turn 1 Entry (Banking)
    new THREE.Vector3(1200, 20, -4800), // Turn 1 Apex (Wide)
    new THREE.Vector3(1600, 0, -4000),  // Turn 1 Exit
    new THREE.Vector3(1600, 0, -2000),  // Mid-Straight 2
    new THREE.Vector3(1600, 0, 400),    // End Straight 2
    new THREE.Vector3(1200, 50, 1000),  // Turn 2 High
    new THREE.Vector3(600, 20, 800),    // Turn 2 Dive
    new THREE.Vector3(0, 0, 400)        // Loop Close
    */


    // Close the loop
    // CatmullRomCurve3 is closed by default if 'true' is passed
    return new THREE.CatmullRomCurve3(points, true, 'centripetal');
};

export const getTrackFrame = (trackCurve: THREE.Curve<THREE.Vector3>, t: number) => {
    const point = trackCurve.getPoint(t);
    const tangent = trackCurve.getTangent(t).normalize();

    // Smooth curvature calculation
    // Sample multiple points to average out jitter
    const sampleOffset = 0.02; // Increased sampling window
    const tPrev = (t - sampleOffset + 1) % 1;
    const tNext = (t + sampleOffset) % 1;
    const tPrev2 = (t - sampleOffset * 2 + 1) % 1;
    const tNext2 = (t + sampleOffset * 2) % 1;

    // Average 5 points (roughly)
    const curve0 = new THREE.Vector3().crossVectors(trackCurve.getTangent(t).normalize(), trackCurve.getTangent(tNext).normalize());
    const curve1 = new THREE.Vector3().crossVectors(trackCurve.getTangent(tPrev).normalize(), trackCurve.getTangent(t).normalize());
    const curve2 = new THREE.Vector3().crossVectors(trackCurve.getTangent(tPrev2).normalize(), trackCurve.getTangent(tPrev).normalize());
    const curve3 = new THREE.Vector3().crossVectors(trackCurve.getTangent(tNext).normalize(), trackCurve.getTangent(tNext2).normalize());

    const curvatureVector = new THREE.Vector3()
        .add(curve0).add(curve1).add(curve2).add(curve3)
        .multiplyScalar(0.25);

    // Banking factor
    const bankingFactor = 4.0;

    // 1. Invert sign: Right Turn (Neg CurvY) -> Left Side Up (Pos Bank)
    let bankAngle = -curvatureVector.y * bankingFactor;

    // 2. Deadzone: Keep straights flat
    if (Math.abs(bankAngle) < 0.1) {
        bankAngle = 0;
    }

    // 3. Smooth Step / Clamp
    // Avoid extreme flipping
    const maxBank = Math.PI / 3; // 60 degrees max
    bankAngle = Math.max(-maxBank, Math.min(maxBank, bankAngle));

    // Calculate basis vectors
    const up = new THREE.Vector3(0, 1, 0);
    // Initial flat binormal (Leftward if looking Forward -Z)
    // T=(0,0,-1), Up=(0,1,0) -> B=(-1,0,0) (Left)
    // We want Right for consistency. T x U = (-Z) x (Y) = (+X) (Right)
    let binormal = new THREE.Vector3().crossVectors(tangent, up).normalize();

    if (binormal.length() < 0.01) binormal.set(1, 0, 0);

    // Apply banking rotation
    binormal.applyAxisAngle(tangent, bankAngle);

    // N = B x T (Right x Forward = Up)
    const normal = new THREE.Vector3().crossVectors(binormal, tangent).normalize();

    return {
        position: point,
        tangent,
        normal,
        binormal,
        rotationMatrix: new THREE.Matrix4().makeBasis(binormal, normal, tangent.clone().negate())
    };
};

// Create boost pad mesh
// We need to import BOOST_PADS but to avoid circular deps with PhysicsEngine if we imported it there?
// PhysicsEngine imports InputManager. TrackFactory imports THREE.
// Let's pass the pads list or duplicate the locations? 
// Better: define the interface here or shared file. 
// For now, I'll copy the logic effectively by re-importing if I can.
// But PhysicsEngine updates physics. TrackFactory builds mesh.
// Let's import BOOST_PADS from PhysicsEngine.
import { BOOST_PADS, type BoostPad } from './PhysicsEngine';

export const createBoostPadMeshes = (trackCurve: THREE.CatmullRomCurve3): THREE.Mesh[] => {
    const meshes: THREE.Mesh[] = [];
    const material = new THREE.MeshBasicMaterial({
        color: 0xff00ff, // Magenta/Neon Pink
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending
    });

    BOOST_PADS.forEach((pad: BoostPad) => {
        // Generate a curved strip for each pad
        const geometry = new THREE.BufferGeometry();
        const vertices: number[] = [];

        // Pad covers [progress - length/2, progress + length/2]
        const segments = 20; // 20 segments for smoothness roughly
        const startT = pad.trackProgress - pad.length / 2;
        const endT = pad.trackProgress + pad.length / 2;
        const width = pad.width;

        for (let i = 0; i <= segments; i++) {
            // Interpolate t
            // Handle wrap-around t if needed (simplified: assuming pads aren't crossing 0/1 boundary for now)
            let t = startT + (i / segments) * (endT - startT);
            if (t < 0) t += 1;
            if (t > 1) t -= 1;

            const { position, normal, binormal } = getTrackFrame(trackCurve, t);

            // Left and Right vertices of the strip
            // Calculate lateral offset for the pad center + width
            const padCenterLateral = pad.lateralPosition;

            // Left Point
            const leftOffset = binormal.clone().multiplyScalar(padCenterLateral - width / 2);
            const leftPos = position.clone().add(leftOffset).add(normal.clone().multiplyScalar(0.3)); // slightly higher (0.3)

            // Right Point
            const rightOffset = binormal.clone().multiplyScalar(padCenterLateral + width / 2);
            const rightPos = position.clone().add(rightOffset).add(normal.clone().multiplyScalar(0.3));

            vertices.push(leftPos.x, leftPos.y, leftPos.z);
            vertices.push(rightPos.x, rightPos.y, rightPos.z);
        }

        // Indices
        const indices: number[] = [];
        for (let i = 0; i < segments; i++) {
            const base = i * 2;
            // distinct vertices (0,1) and (2,3)
            // Triangle 1: 0, 2, 1
            // Triangle 2: 1, 2, 3
            indices.push(base, base + 2, base + 1);
            indices.push(base + 1, base + 2, base + 3);
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        const mesh = new THREE.Mesh(geometry, material.clone());
        meshes.push(mesh);
    });

    return meshes;
};

export const createStartLineMesh = (trackCurve: THREE.CatmullRomCurve3): THREE.Mesh => {
    // Start line at 0.0 (The official loop start/end)
    const trackProgress = 0.0;
    const width = 140; // Wider to cover full track
    const length = 0.002; // Thicker line

    const geometry = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const segments = 10;
    const startT = trackProgress - length / 2;
    const endT = trackProgress + length / 2;

    for (let i = 0; i <= segments; i++) {
        let t = startT + (i / segments) * (endT - startT);
        if (t < 0) t += 1.0;
        if (t > 1) t -= 1.0;

        const { position, normal, binormal } = getTrackFrame(trackCurve, t);

        const leftOffset = binormal.clone().multiplyScalar(-width / 2);
        const leftPos = position.clone().add(leftOffset).add(normal.clone().multiplyScalar(0.1));

        const rightOffset = binormal.clone().multiplyScalar(width / 2);
        const rightPos = position.clone().add(rightOffset).add(normal.clone().multiplyScalar(0.1));

        vertices.push(leftPos.x, leftPos.y, leftPos.z);
        vertices.push(rightPos.x, rightPos.y, rightPos.z);
    }

    const indices: number[] = [];
    for (let i = 0; i < segments; i++) {
        const base = i * 2;
        indices.push(base, base + 2, base + 1);
        indices.push(base + 1, base + 2, base + 3);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshBasicMaterial({
        color: 0xffff00, // Bright Yellow
        side: THREE.DoubleSide
    });

    return new THREE.Mesh(geometry, material);
};

export const createTrackMesh = (trackCurve: THREE.CatmullRomCurve3): THREE.Mesh => {
    const trackSegments = 2400; // Increased resolution for massive track (was 800)
    // const trackWidth = 20;
    const trackDepth = 10; // Deeper walls for wider track
    const flatBottomWidth = 120; // Double track width (was 60)

    const geometry = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];

    for (let i = 0; i <= trackSegments; i++) {
        const t = i / trackSegments;
        // Use the consistent frame generator
        const { position: point, normal, binormal } = getTrackFrame(trackCurve, t);

        // Create flat-bottomed U-shaped cross-section like \___/
        const crossSectionPoints = [];

        // Left wall (angled up from bottom)
        const wallPoints = 10;
        for (let j = 0; j <= wallPoints; j++) {
            const x = -flatBottomWidth / 2 - (wallPoints - j) * (trackDepth / wallPoints);
            const y = (wallPoints - j) * (trackDepth / wallPoints);
            crossSectionPoints.push({ x, y });
        }

        // Flat bottom (left to right)
        const bottomPoints = 8;
        for (let j = 1; j < bottomPoints; j++) {
            const x = -flatBottomWidth / 2 + (j / bottomPoints) * flatBottomWidth;
            crossSectionPoints.push({ x, y: 0 });
        }

        // Right wall (angled up from bottom)
        for (let j = 0; j <= wallPoints; j++) {
            const x = flatBottomWidth / 2 + j * (trackDepth / wallPoints);
            const y = j * (trackDepth / wallPoints);
            crossSectionPoints.push({ x, y });
        }

        // Add vertices
        crossSectionPoints.forEach((pt, j) => {
            const offset = binormal.clone().multiplyScalar(pt.x)
                .add(normal.clone().multiplyScalar(pt.y));
            const vertex = point.clone().add(offset);

            vertices.push(vertex.x, vertex.y, vertex.z);
            uvs.push(j / crossSectionPoints.length, t * 10);
        });
    }

    // Create indices
    const pointsPerSegment = 29;
    for (let i = 0; i < trackSegments; i++) {
        for (let j = 0; j < pointsPerSegment - 1; j++) {
            const a = i * pointsPerSegment + j;
            const b = a + pointsPerSegment;
            const c = a + 1;
            const d = b + 1;

            indices.push(a, b, c);
            indices.push(b, d, c);
        }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshPhongMaterial({
        color: 0x555555, // Grey Track
        side: THREE.DoubleSide,
        shininess: 30
    });

    return new THREE.Mesh(geometry, material);
};
// Create 3D Traffic Light
export const createTrafficLightMesh = (): THREE.Group => {
    const group = new THREE.Group();

    // Box - Scale 5x Current (was 6,18,6 -> 30, 90, 30) -> Wider and Taller
    const boxGeo = new THREE.BoxGeometry(50, 120, 30);
    const boxMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
    const box = new THREE.Mesh(boxGeo, boxMat);
    group.add(box);

    // Lights
    // Scale 5x Current (was 1.8 -> 9) -> Reduced to 8 to prevent touching
    const lightGeo = new THREE.CylinderGeometry(8, 8, 3, 32);
    lightGeo.rotateX(Math.PI / 2); // Face forward

    for (let i = 0; i < 5; i++) {
        // Default grey/off
        const mat = new THREE.MeshBasicMaterial({ color: 0x222222 });
        const light = new THREE.Mesh(lightGeo, mat);
        // Spacing: Increased to 22 to prevent overlap (Diameter 16 vs Spacing 22)
        // Y Position: centered around 0. Range approx +/- 44
        light.position.set(0, 44 - i * 22, 16.5);
        light.name = `light_${5 - i}`;
        group.add(light);
    }

    return group;
};
