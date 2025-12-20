import * as THREE from 'three';
import type { BoostPad } from './TrackDefinitions';

// Create track path using curve
export const createTrackCurve = (points: THREE.Vector3[]): THREE.CatmullRomCurve3 => {
    // Close the loop
    // CatmullRomCurve3 is closed by default if 'true' is passed
    return new THREE.CatmullRomCurve3(points, true, 'centripetal');
};

export const getTrackFrame = (trackCurve: THREE.Curve<THREE.Vector3>, t: number) => {
    const point = trackCurve.getPoint(t);
    const tangent = trackCurve.getTangent(t).normalize();

    // Smooth curvature calculation
    // Sample multiple points over a wider window to average out jitter at track joints
    const sampleOffset = 0.04; // Wider sampling window (was 0.02)
    
    // Sample 7 points for smoother averaging
    const samples: THREE.Vector3[] = [];
    for (let i = -3; i <= 3; i++) {
        const sampleT = (t + i * sampleOffset + 1) % 1;
        const nextT = (sampleT + sampleOffset + 1) % 1;
        const tangentA = trackCurve.getTangent(sampleT).normalize();
        const tangentB = trackCurve.getTangent(nextT).normalize();
        samples.push(new THREE.Vector3().crossVectors(tangentA, tangentB));
    }

    // Weighted average - center samples have more influence
    const weights = [0.05, 0.1, 0.2, 0.3, 0.2, 0.1, 0.05]; // Gaussian-like
    const curvatureVector = new THREE.Vector3();
    samples.forEach((sample, i) => {
        curvatureVector.add(sample.multiplyScalar(weights[i]));
    });

    // Banking factor
    const bankingFactor = 4.0;

    // 1. Invert sign: Right Turn (Neg CurvY) -> Left Side Up (Pos Bank)
    let bankAngle = -curvatureVector.y * bankingFactor;

    // 2. Smooth deadzone: Use smoothstep to gradually reduce banking near zero
    // This prevents the hard jump that caused jitter
    const deadzone = 0.1;
    const smoothRange = 0.15; // Transition zone beyond deadzone
    const absBankAngle = Math.abs(bankAngle);
    
    if (absBankAngle < deadzone + smoothRange) {
        // Smoothstep function: 3x^2 - 2x^3 for smooth interpolation
        const t = Math.max(0, (absBankAngle - deadzone) / smoothRange);
        const smoothT = t * t * (3 - 2 * t); // Hermite smoothstep
        bankAngle = Math.sign(bankAngle) * absBankAngle * smoothT;
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

export const createBoostPadMeshes = (trackCurve: THREE.CatmullRomCurve3, pads: BoostPad[]): THREE.Mesh[] => {
    const meshes: THREE.Mesh[] = [];
    const material = new THREE.MeshBasicMaterial({
        color: 0xff00ff, // Magenta/Neon Pink
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending
    });

    pads.forEach((pad: BoostPad) => {
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
            const leftPos = position.clone().add(leftOffset).add(normal.clone().multiplyScalar(0.9)); // slightly higher (0.9)

            // Right Point
            const rightOffset = binormal.clone().multiplyScalar(padCenterLateral + width / 2);
            const rightPos = position.clone().add(rightOffset).add(normal.clone().multiplyScalar(0.9));

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
    const trackSegments = 1600; // Optimized resolution (was 2400)
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

export interface TrackAnalysisData {
    maxCurvature: number;
    avgCurvature: number;
    hotspots: { t: number, curvature: number }[];
}

export const getTrackAnalysis = (trackCurve: THREE.CatmullRomCurve3): TrackAnalysisData => {
    const samples = 2000; // High resolution
    let maxCurvature = 0;
    let totalCurvature = 0;
    const hotspots: { t: number, curvature: number }[] = [];

    for (let i = 0; i < samples; i++) {
        const t = i / samples;
        const tangent = trackCurve.getTangent(t).normalize();
        const nextTangent = trackCurve.getTangent((t + 0.005) % 1).normalize();

        const dot = tangent.dot(nextTangent);
        const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
        const degree = angle * 180 / Math.PI;

        if (degree > maxCurvature) maxCurvature = degree;
        totalCurvature += degree;

        if (degree > 0.5) { // Threshold for "hotspot" (approx 30 deg sharp turn / step)
            hotspots.push({ t, curvature: degree });
        }
    }

    return {
        maxCurvature,
        avgCurvature: totalCurvature / samples,
        hotspots
    };
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
