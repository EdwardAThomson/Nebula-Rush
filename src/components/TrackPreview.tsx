import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { createTrackCurve } from '../game/TrackFactory';

interface TrackPreviewProps {
    points: THREE.Vector3[];
    color?: string;
    className?: string;
}

export default function TrackPreview({ points, color = '#22d3ee', className = '' }: TrackPreviewProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set resolution (2x for retina)
        const size = 300;
        canvas.width = size;
        canvas.height = size;

        // Clear
        ctx.clearRect(0, 0, size, size);

        // Calculate bounds using the actual curve to ensure it fits
        const curve = createTrackCurve(points);
        const samples = 200; // Resolution for drawing
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;

        // Sample points for bounds and drawing
        const drawnPoints: { x: number, z: number }[] = [];
        for (let i = 0; i <= samples; i++) {
            const pt = curve.getPoint(i / samples);
            minX = Math.min(minX, pt.x);
            maxX = Math.max(maxX, pt.x);
            minZ = Math.min(minZ, pt.z);
            maxZ = Math.max(maxZ, pt.z);
            drawnPoints.push({ x: pt.x, z: pt.z });
        }

        // Add padding
        const padding = 20;
        const width = maxX - minX;
        const height = maxZ - minZ;

        // Determine scale to fit
        // Prevent divide by zero
        const scaleX = width > 0 ? (size - padding * 2) / width : 1;
        const scaleZ = height > 0 ? (size - padding * 2) / height : 1;
        const scale = Math.min(scaleX, scaleZ);

        const offsetX = (size - width * scale) / 2 - minX * scale;
        const offsetZ = (size - height * scale) / 2 - minZ * scale;

        // Draw Track
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        drawnPoints.forEach((p, i) => {
            const x = p.x * scale + offsetX;
            const z = p.z * scale + offsetZ;
            if (i === 0) ctx.moveTo(x, z);
            else ctx.lineTo(x, z);
        });

        // Close loop
        const first = points[0];
        const firstX = first.x * scale + offsetX;
        const firstZ = first.z * scale + offsetZ;
        ctx.lineTo(firstX, firstZ);

        ctx.stroke();

        // Draw Start Dot
        ctx.fillStyle = '#ffff00';
        ctx.beginPath();
        ctx.arc(firstX, firstZ, 6, 0, Math.PI * 2);
        ctx.fill();

    }, [points, color]);

    return (
        <canvas ref={canvasRef} className={`w-full h-full object-contain ${className}`} />
    );
}
