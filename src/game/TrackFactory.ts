import * as THREE from 'three';
import type { BoostPad, Hazard } from './TrackDefinitions';
import { HAZARD_BLOCK_DEPTH } from './TrackDefinitions';

// Create track path using curve
export const createTrackCurve = (points: THREE.Vector3[]): THREE.CatmullRomCurve3 => {
    // Close the loop
    // CatmullRomCurve3 is closed by default if 'true' is passed
    return new THREE.CatmullRomCurve3(points, true, 'centripetal');
};

// `bank` (default true) tilts the frame into curves. Pass false for flat tracks
// (e.g. desert canyons): the frame stays level so lateral motion is truly
// horizontal — which is what makes vertical canyon walls reachable/solid.
export const getTrackFrame = (trackCurve: THREE.Curve<THREE.Vector3>, t: number, bank: boolean = true) => {
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

    // Apply banking rotation (skipped on flat tracks → level, horizontal frame)
    if (!bank) bankAngle = 0;
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

// Forward-chevron arrow texture for boost pads: bright arrows on a faint dark
// field. Under additive blending the dark field stays near-invisible and the
// arrows glow, so a boost reads by its arrow shape regardless of the track's
// accent colour. Tiles along the pad length (V).
const createBoostArrowTexture = () => {
    const S = 64;
    const canvas = document.createElement('canvas');
    canvas.width = S; canvas.height = S;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#001515';             // faint base glow for the pad footprint
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = '#bbffff';           // icy white-cyan arrows
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();                       // one forward chevron per tile
    ctx.moveTo(8, 46);
    ctx.lineTo(S / 2, 20);
    ctx.lineTo(S - 8, 46);
    ctx.stroke();
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
};

export const createBoostPadMeshes = (trackCurve: THREE.CatmullRomCurve3, pads: BoostPad[], bank: boolean = true): THREE.Mesh[] => {
    const meshes: THREE.Mesh[] = [];
    // One shared animated material so every pad's arrows scroll in sync.
    const arrowTex = createBoostArrowTexture();
    const material = new THREE.MeshBasicMaterial({
        map: arrowTex,
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });

    pads.forEach((pad: BoostPad) => {
        // Generate a curved strip for each pad
        const geometry = new THREE.BufferGeometry();
        const vertices: number[] = [];
        const uvs: number[] = [];

        // Pad covers [progress - length/2, progress + length/2]
        // Scale segments with pad length so visual smoothness is preserved on enlarged tracks.
        const segments = Math.max(20, Math.ceil(pad.length * 2000));
        const startT = pad.trackProgress - pad.length / 2;
        const endT = pad.trackProgress + pad.length / 2;
        const width = pad.width;
        const arrowsPerPad = 6;

        for (let i = 0; i <= segments; i++) {
            // Interpolate t
            // Handle wrap-around t if needed (simplified: assuming pads aren't crossing 0/1 boundary for now)
            let t = startT + (i / segments) * (endT - startT);
            if (t < 0) t += 1;
            if (t > 1) t -= 1;

            const { position, normal, binormal } = getTrackFrame(trackCurve, t, bank);

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

            const v = (i / segments) * arrowsPerPad;
            uvs.push(0, v);
            uvs.push(1, v);
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
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        const mesh = new THREE.Mesh(geometry, material);
        // Scroll the arrows forward. Absolute-time based, so the shared texture
        // lands on the same offset however many pads write it in a frame.
        mesh.onBeforeRender = () => {
            arrowTex.offset.y = -(performance.now() * 0.0006) % 1;
        };
        meshes.push(mesh);
    });

    return meshes;
};

// Classic black/white checkered finish-line texture (2x2 repeating unit;
// nearest-filtered for crisp edges).
const createCheckerTexture = () => {
    const S = 64;
    const canvas = document.createElement('canvas');
    canvas.width = S; canvas.height = S;
    const ctx = canvas.getContext('2d')!;
    const c = S / 2;
    for (let y = 0; y < 2; y++) {
        for (let x = 0; x < 2; x++) {
            ctx.fillStyle = ((x + y) % 2 === 0) ? '#f5f5f5' : '#141414';
            ctx.fillRect(x * c, y * c, c, c);
        }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    return tex;
};

// Hazard visuals: raised warning-striped boxes for 'block', and a flat
// translucent oily/icy strip (hugging the track) for 'slick'.
export const createHazardMeshes = (trackCurve: THREE.CatmullRomCurve3, hazards: Hazard[], bank: boolean = true, terrain?: 'canyon'): THREE.Object3D[] => {
    const objects: THREE.Object3D[] = [];

    hazards.forEach((h) => {
        const frame = getTrackFrame(trackCurve, h.trackProgress, bank);

        if (h.type === 'slick') {
            // Curved strip that follows the track, like a boost pad but inert.
            const geometry = new THREE.BufferGeometry();
            const vertices: number[] = [];
            const segments = Math.max(16, Math.ceil(h.length * 2000));
            const startT = h.trackProgress - h.length / 2;
            const endT = h.trackProgress + h.length / 2;
            for (let i = 0; i <= segments; i++) {
                let t = startT + (i / segments) * (endT - startT);
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                const f = getTrackFrame(trackCurve, t, bank);
                const lift = f.normal.clone().multiplyScalar(0.4);
                const left = f.position.clone().add(f.binormal.clone().multiplyScalar(h.lateralPosition - h.width / 2)).add(lift);
                const right = f.position.clone().add(f.binormal.clone().multiplyScalar(h.lateralPosition + h.width / 2)).add(lift);
                vertices.push(left.x, left.y, left.z, right.x, right.y, right.z);
            }
            const indices: number[] = [];
            for (let i = 0; i < segments; i++) {
                const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
                indices.push(a, b, c, b, d, c);
            }
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
            geometry.setIndex(indices);
            geometry.computeVertexNormals();
            const material = new THREE.MeshStandardMaterial({
                color: 0xff3b3b,
                emissive: 0xaa1111,
                emissiveIntensity: 0.5,
                transparent: true,
                opacity: 0.45,
                roughness: 0.15,
                metalness: 0.0,
                side: THREE.DoubleSide,
                depthWrite: false,
            });
            objects.push(new THREE.Mesh(geometry, material));
        } else {
            // Block: a raised, warning-coloured box oriented to the track frame.
            const blockHeight = 8;
            const blockDepth = HAZARD_BLOCK_DEPTH; // footprint along the track (matches collision)
            const geo = new THREE.BoxGeometry(h.width, blockHeight, blockDepth);
            // Canyon: brown sandstone boulder (fits the gorge). Otherwise the
            // default dark block with a warning-orange glow.
            const mat = terrain === 'canyon'
                ? new THREE.MeshStandardMaterial({ color: 0x6e4a2c, emissive: 0x1c0f05, emissiveIntensity: 0.3, roughness: 0.95, metalness: 0.0, flatShading: true })
                : new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: 0xff3300, emissiveIntensity: 0.6, roughness: 0.5, metalness: 0.3 });
            const box = new THREE.Mesh(geo, mat);
            box.position.copy(frame.position)
                .add(frame.binormal.clone().multiplyScalar(h.lateralPosition))
                .add(frame.normal.clone().multiplyScalar(blockHeight / 2));
            // rotationMatrix basis = (binormal, normal, -tangent): local x→lateral,
            // y→up, z→along-track, which matches the box's (width, height, depth).
            box.quaternion.setFromRotationMatrix(frame.rotationMatrix);
            objects.push(box);
        }
    });

    return objects;
};

export const createStartLineMesh = (trackCurve: THREE.CatmullRomCurve3, bank: boolean = true): THREE.Mesh => {
    // Start line at 0.0 (The official loop start/end)
    const trackProgress = 0.0;
    const width = 140; // Wider to cover full track
    const length = 0.006; // Checkered band (a bit longer so the checks read)

    const geometry = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const uvs: number[] = [];
    const segments = 10;
    const startT = trackProgress - length / 2;
    const endT = trackProgress + length / 2;
    const checksAcross = 5; // x2 (2x2 tile) = 10 checks across the width
    const rowsAlong = 2;    // x2 = 4 rows along the band

    for (let i = 0; i <= segments; i++) {
        let t = startT + (i / segments) * (endT - startT);
        if (t < 0) t += 1.0;
        if (t > 1) t -= 1.0;

        const { position, normal, binormal } = getTrackFrame(trackCurve, t, bank);

        const leftOffset = binormal.clone().multiplyScalar(-width / 2);
        const leftPos = position.clone().add(leftOffset).add(normal.clone().multiplyScalar(0.1));

        const rightOffset = binormal.clone().multiplyScalar(width / 2);
        const rightPos = position.clone().add(rightOffset).add(normal.clone().multiplyScalar(0.1));

        vertices.push(leftPos.x, leftPos.y, leftPos.z);
        vertices.push(rightPos.x, rightPos.y, rightPos.z);

        const v = (i / segments) * rowsAlong;
        uvs.push(0, v);
        uvs.push(checksAcross, v);
    }

    const indices: number[] = [];
    for (let i = 0; i < segments; i++) {
        const base = i * 2;
        indices.push(base, base + 2, base + 1);
        indices.push(base + 1, base + 2, base + 3);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshBasicMaterial({
        map: createCheckerTexture(),
        side: THREE.DoubleSide,
    });

    return new THREE.Mesh(geometry, material);
};

// Procedurally paints the F-Zero-style road surface for a track palette: a flat
// base-tinted road with emissive accent rails at the two road↔wall seams and a
// dashed centre line. Returns an albedo `map` (base + accent) and an
// `emissiveMap` (accent on black) so only the rails/centre glow. The canvas X
// axis is the cross-section UV (road spans U≈0.379..0.586, matching the mesh's
// UVs); the Y axis is one length-tile, repeated along the track via wrapT.
const createTrackSurfaceTextures = (base: number, accent: number, centerLine = true, grain = false) => {
    const W = 256, H = 128;
    const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
    const baseHex = hex(base), accentHex = hex(accent);

    // Scale a colour toward black (for the dimmer centre-line glow).
    const dim = (c: number, f: number) => '#' + (
        (Math.round(((c >> 16) & 0xff) * f) << 16) |
        (Math.round(((c >> 8) & 0xff) * f) << 8) |
         Math.round((c & 0xff) * f)
    ).toString(16).padStart(6, '0');

    const px = (u: number) => Math.round(u * W);
    const roadL = px(0.379), roadR = px(0.586);   // road↔wall seams
    const railW = 6;
    const centerX = px(0.483);
    const leftWallTop = 0;                         // U≈0   (top edge of left wall)
    const rightWallTop = px(0.95);                 // U≈0.95 (top edge of right wall, max U≈0.966)

    // railHex: solid single-colour edge rails; wallHex frames the wall tops;
    // centerHex is the dashed centre line.
    const paint = (bg: string, railHex: string, centerHex: string, wallHex: string, withGrain = false) => {
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        // Packed-sand grain on the albedo (canyon): soft mottle + speckle over the
        // base, drawn UNDER the rails/centre so those stay crisp.
        if (withGrain) {
            for (let i = 0; i < 40; i++) {
                const x = Math.random() * W, y = Math.random() * H, r = 6 + Math.random() * 22;
                const g = ctx.createRadialGradient(x, y, 0, x, y, r);
                g.addColorStop(0, Math.random() > 0.5 ? 'rgba(110,90,55,0.5)' : 'rgba(60,48,28,0.5)');
                g.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
            }
            for (let i = 0; i < 2200; i++) {
                const x = Math.random() * W, y = Math.random() * H, v = Math.random();
                ctx.fillStyle = v > 0.6 ? 'rgba(30,24,12,0.45)' : 'rgba(150,124,80,0.3)';
                ctx.fillRect(x, y, 1, 1);
            }
        }

        // Wall top-edge accent lines (solid frame)
        ctx.fillStyle = wallHex;
        ctx.fillRect(leftWallTop, 0, 4, H);
        ctx.fillRect(rightWallTop, 0, 5, H);

        // Solid rails at both road edges
        ctx.fillStyle = railHex;
        ctx.fillRect(roadL, 0, railW, H);
        ctx.fillRect(roadR - railW, 0, railW, H);

        // Dashed centre line (optional)
        if (centerLine) {
            ctx.fillStyle = centerHex;
            for (let y = 0; y < H; y += 32) ctx.fillRect(centerX - 1, y, 3, 18);
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 8;
        return tex;
    };

    // Albedo carries full colour; the emissive map drives the glow (rails bright,
    // centre + walls dimmer) so the solid rails stay the hero element.
    return {
        map: paint(baseHex, accentHex, accentHex, accentHex, grain), // grain only on albedo
        emissiveMap: paint('#000000', accentHex, dim(accent, 0.4), dim(accent, 0.45)),
    };
};

// Subtle grain normal map for the canyon road (two octaves of smooth value
// noise) so the sun rakes a little surface texture. Linear (not sRGB).
const createRoadGrainNormal = (): THREE.Texture => {
    const S = 256, L = 64;
    const lattice = new Float32Array(L * L);
    for (let i = 0; i < L * L; i++) lattice[i] = Math.random();
    const sample = (fx: number, fy: number) => {
        const gx = fx / S * L, gy = fy / S * L;
        const x0 = ((Math.floor(gx) % L) + L) % L, y0 = ((Math.floor(gy) % L) + L) % L;
        const x1 = (x0 + 1) % L, y1 = (y0 + 1) % L;
        const tx = gx - Math.floor(gx), ty = gy - Math.floor(gy);
        const a = lattice[y0 * L + x0], b = lattice[y0 * L + x1], c = lattice[y1 * L + x0], d = lattice[y1 * L + x1];
        const top = a + (b - a) * tx, bot = c + (d - c) * tx;
        return top + (bot - top) * ty;
    };
    const H = (x: number, y: number) => sample(x, y) * 1.0 + sample(x * 2.3, y * 2.3) * 0.5;
    const canvas = document.createElement('canvas'); canvas.width = S; canvas.height = S;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(S, S);
    const strength = 2.0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const hL = H(x - 1, y), hR = H(x + 1, y), hD = H(x, y - 1), hU = H(x, y + 1);
        let nx = (hL - hR) * strength, ny = (hD - hU) * strength, nz = 1;
        const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len;
        const i = (y * S + x) * 4;
        img.data[i] = (nx * 0.5 + 0.5) * 255;
        img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
        img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
        img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.NoColorSpace;
    tex.repeat.set(3, 30);
    return tex;
};

export const createTrackMesh = (trackCurve: THREE.CatmullRomCurve3, surface?: { base: number; accent: number; centerLine?: boolean }, bank: boolean = true, terrain?: 'canyon'): THREE.Mesh => {
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
        const { position: point, normal, binormal } = getTrackFrame(trackCurve, t, bank);

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

    let material: THREE.Material;
    if (surface) {
        const isCanyon = terrain === 'canyon';
        const { map, emissiveMap } = createTrackSurfaceTextures(surface.base, surface.accent, surface.centerLine ?? true, isCanyon);
        const stdMat = new THREE.MeshStandardMaterial({
            map,
            emissive: 0xffffff,        // tinted by emissiveMap, so the rails/centre glow in the accent colour
            emissiveMap,
            emissiveIntensity: 1.4,
            roughness: isCanyon ? 0.95 : 0.7, // packed sand reads matte
            metalness: 0.0,
            side: THREE.DoubleSide,
        });
        if (isCanyon) {
            // Packed-sand grain relief on the road bed.
            stdMat.normalMap = createRoadGrainNormal();
            stdMat.normalScale.set(0.35, 0.35);
        }
        material = stdMat;
    } else {
        material = new THREE.MeshPhongMaterial({
            color: 0x555555, // Grey Track (fallback for tracks without a surface palette)
            side: THREE.DoubleSide,
            shininess: 30
        });
    }

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
