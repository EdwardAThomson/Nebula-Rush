import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { buildPartScene, type PartScene } from '../game/PartModels';
import type { PartSlot } from '../game/profile';

// A slowly turning 3D part on a Garage card. Every card draws through ONE
// shared WebGL renderer: each frame it renders a card's scene and copies the
// pixels into that card's own 2D canvas, so four cards cost one GL context.
// With reduced motion the model is drawn once, standing still.

const TURN_SPEED = 0.5;          // rad/s
const MAX_PIXEL_RATIO = 2;

interface View {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    part: PartScene;
    phase: number;               // per-card start angle so they don't turn in lockstep
}

let renderer: THREE.WebGLRenderer | null | undefined;
const views = new Set<View>();
let frame = 0;
let start = 0;
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function getRenderer(): THREE.WebGLRenderer | null {
    if (renderer !== undefined) return renderer;
    try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.setClearColor(0x000000, 0);
    } catch {
        renderer = null;
    }
    return renderer;
}

function draw(view: View, t: number) {
    const r = renderer;
    if (!r) return;
    const { canvas, ctx, part } = view;
    if (canvas.width === 0 || canvas.height === 0) return;
    r.setPixelRatio(1);
    r.setSize(canvas.width, canvas.height, false);
    part.root.rotation.y = view.phase + TURN_SPEED * t;
    r.render(part.scene, part.camera);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(r.domElement, 0, 0);
}

function loop(now: number) {
    const t = (now - start) / 1000;
    views.forEach((v) => draw(v, t));
    frame = views.size > 0 ? requestAnimationFrame(loop) : 0;
}

function ensureLoop() {
    if (frame || reducedMotion()) return;
    start = performance.now();
    frame = requestAnimationFrame(loop);
}

interface PartModelCanvasProps {
    slot: PartSlot;
    level: number;
    accent: string;
    className?: string;
}

export default function PartModelCanvas({ slot, level, accent, className = '' }: PartModelCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const r = getRenderer();
        if (!canvas || !r) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
        canvas.width = Math.round(canvas.clientWidth * ratio);
        canvas.height = Math.round(canvas.clientHeight * ratio);
        const part = buildPartScene(r, slot, level, accent, canvas.width / Math.max(1, canvas.height));
        const view: View = { canvas, ctx, part, phase: ['engine', 'thrusters', 'fins', 'capacitor'].indexOf(slot) * 0.9 + 0.6 };
        views.add(view);
        if (reducedMotion()) draw(view, 0);
        else ensureLoop();
        return () => {
            views.delete(view);
            part.dispose();
        };
    }, [slot, level, accent]);

    return <canvas ref={canvasRef} aria-hidden="true" className={`block w-full h-full ${className}`} />;
}
