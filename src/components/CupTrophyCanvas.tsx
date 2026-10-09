import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { getTrophy, CARD_VIEW, configureTrophyRenderer, buildTrophyScene, createTrophyComposer } from '../game/CupTrophies';

// Live, slowly turning render of a cup's trophy, shown over the card's still
// image while the card is hovered. The scene starts from CARD_VIEW, the exact
// framing of the still, so the swap is invisible; the still stays underneath
// and shows again the moment the hover ends. One WebGL renderer is shared by
// every card (only one is ever active) and created lazily on first hover. If
// WebGL is unavailable, or the user prefers reduced motion, nothing is shown.

const TURN_SPEED = 0.3;          // rad/s once up to speed
const SPIN_UP = 1.2;             // seconds to ease from still to full speed
const MAX_PIXEL_RATIO = 1.5;     // cap for the hover canvas; bloom is per pixel

let shared: THREE.WebGLRenderer | null | undefined;
function getRenderer(): THREE.WebGLRenderer | null {
    if (shared !== undefined) return shared;
    try {
        shared = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        configureTrophyRenderer(shared);
    } catch {
        shared = null;
    }
    return shared;
}

interface CupTrophyCanvasProps {
    cupId: string;
    active: boolean;
    className?: string;
}

export default function CupTrophyCanvas({ cupId, active, className = '' }: CupTrophyCanvasProps) {
    const hostRef = useRef<HTMLDivElement>(null);
    // Flipped once the first frame is drawn, so the canvas fades in over the still
    // instead of flashing black while the scene builds.
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const host = hostRef.current;
        const spec = getTrophy(cupId);
        if (!active || !host || !spec) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const renderer = getRenderer();
        if (!renderer) return;

        const width = host.clientWidth;
        const height = host.clientHeight;
        if (width === 0 || height === 0) return;
        const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
        renderer.setPixelRatio(ratio);
        renderer.setSize(width, height, false);
        const canvas = renderer.domElement;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.display = 'block';
        host.appendChild(canvas);

        const ts = buildTrophyScene(spec, renderer, CARD_VIEW, { aspect: width / height, shadowMapSize: 1024 });
        const composer = createTrophyComposer(renderer, ts, width * ratio, height * ratio);
        const baseYaw = CARD_VIEW.yaw ?? 0;

        let frame = 0;
        let first = true;
        const start = performance.now();
        const tick = (now: number) => {
            const t = (now - start) / 1000;
            // Ease into the turn: angle = speed * (t - spinUp * (1 - e^(-t/spinUp))).
            const eased = t - SPIN_UP * (1 - Math.exp(-t / SPIN_UP));
            ts.root.rotation.y = baseYaw + TURN_SPEED * eased;
            composer.render();
            if (first) {
                first = false;
                setReady(true);
            }
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(frame);
            setReady(false);
            composer.dispose();
            ts.dispose();
            if (canvas.parentNode === host) host.removeChild(canvas);
        };
    }, [cupId, active]);

    return (
        <div
            ref={hostRef}
            aria-hidden="true"
            className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${ready ? 'opacity-100' : 'opacity-0'} ${className}`}
        />
    );
}
