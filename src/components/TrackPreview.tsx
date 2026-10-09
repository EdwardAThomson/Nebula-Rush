import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createTrackCurve } from '../game/TrackFactory';

interface TrackPreviewProps {
    points: THREE.Vector3[];
    color?: string;
    className?: string;
}

// '#rrggbb' + alpha → rgba(); anything else passes through unchanged.
const withAlpha = (hex: string, a: number) => {
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

export default function TrackPreview({ points, color = '#22d3ee', className = '' }: TrackPreviewProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Match the canvas to its box (crisp on retina, no letterboxing).
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const W = Math.max(1, Math.round((canvas.clientWidth || 300) * dpr));
        const H = Math.max(1, Math.round((canvas.clientHeight || 200) * dpr));
        canvas.width = W;
        canvas.height = H;
        ctx.clearRect(0, 0, W, H);

        // Faint blueprint grid in the track colour.
        ctx.strokeStyle = withAlpha(color, 0.08);
        ctx.lineWidth = 1;
        const cell = 22 * dpr;
        for (let x = (W % cell) / 2; x < W; x += cell) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
        for (let y = (H % cell) / 2; y < H; y += cell) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

        // Sample the actual curve for bounds and drawing.
        const curve = createTrackCurve(points);
        const samples = 240;
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        const raw: { x: number, z: number }[] = [];
        for (let i = 0; i <= samples; i++) {
            const pt = curve.getPoint(i / samples);
            minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x);
            minZ = Math.min(minZ, pt.z); maxZ = Math.max(maxZ, pt.z);
            raw.push({ x: pt.x, z: pt.z });
        }

        // Fit with padding, centred.
        const padding = 22 * dpr;
        const width = maxX - minX;
        const height = maxZ - minZ;
        const scale = Math.min(
            width > 0 ? (W - padding * 2) / width : 1,
            height > 0 ? (H - padding * 2) / height : 1,
        );
        const offsetX = (W - width * scale) / 2 - minX * scale;
        const offsetZ = (H - height * scale) / 2 - minZ * scale;
        const pts = raw.map(p => ({ x: p.x * scale + offsetX, z: p.z * scale + offsetZ }));

        const trace = () => {
            ctx.beginPath();
            pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.z) : ctx.lineTo(p.x, p.z)));
            ctx.closePath();
        };
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Neon tube: wide soft glow, the coloured line, then a hot white core.
        trace();
        ctx.shadowColor = color;
        ctx.shadowBlur = 18 * dpr;
        ctx.strokeStyle = withAlpha(color, 0.35);
        ctx.lineWidth = 9 * dpr;
        ctx.stroke();
        ctx.shadowBlur = 8 * dpr;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3 * dpr;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 1 * dpr;
        ctx.stroke();

        // Start/finish: a short chequered bar across the track at t = 0.
        const a = pts[0], b = pts[2];
        const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        const nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len; // normal to the track
        const half = 9 * dpr, sq = 3 * dpr;
        for (let i = -3; i < 3; i++) {
            for (let j = 0; j < 2; j++) {
                ctx.fillStyle = (i + j) % 2 === 0 ? '#ffffff' : '#0b0f1a';
                const cx = a.x + nx * (i + 0.5) * (half / 3) + ((b.x - a.x) / len) * (j - 0.5) * sq;
                const cz = a.z + nz * (i + 0.5) * (half / 3) + ((b.z - a.z) / len) * (j - 0.5) * sq;
                ctx.fillRect(cx - sq / 2, cz - sq / 2, sq, sq);
            }
        }
    }, [points, color]);

    return (
        <canvas ref={canvasRef} className={`w-full h-full ${className}`} />
    );
}
