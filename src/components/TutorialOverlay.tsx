import { useEffect, useRef, useState } from 'react';
import type { Ship } from '../game/Ship';

interface TutorialOverlayProps {
    shipRef: React.RefObject<Ship | null>;
    raceStartedRef: React.RefObject<boolean>;
    onDone: () => void;
}

interface Step {
    text: string;
    done: (s: Ship) => boolean;
}

// Action-gated steps — each advances once the player actually does the thing.
// Matches the current mechanics (no jump / tight-corner drift yet).
const STEPS: Step[] = [
    { text: 'Hold  W  (or ↑) to accelerate', done: (s) => s.state.velocity.y > 5 },
    { text: 'Tap  A / D  to shift across the track (it steers itself through bends)', done: (s) => Math.abs(s.state.velocity.x) > 0.05 },
    { text: 'Drive through the cyan boost arrows for a speed burst', done: (s) => s.state.boostTimer > 0 },
    { text: 'Now cross the finish line!', done: (s) => s.lap >= 2 },
];

export default function TutorialOverlay({ shipRef, raceStartedRef, onDone }: TutorialOverlayProps) {
    const [step, setStep] = useState(0);
    const [complete, setComplete] = useState(false);
    const stepRef = useRef(0);
    const rafRef = useRef(0);

    useEffect(() => {
        const tick = () => {
            const ship = shipRef.current;
            if (ship && raceStartedRef.current && stepRef.current < STEPS.length) {
                if (STEPS[stepRef.current].done(ship)) {
                    stepRef.current += 1;
                    if (stepRef.current >= STEPS.length) setComplete(true);
                    else setStep(stepRef.current);
                }
            }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafRef.current);
    }, [shipRef, raceStartedRef]);

    return (
        <>
            {!complete && (
                <>
                    {/* Prompt (below the track name) */}
                    <div
                        className="absolute top-28 left-1/2 -translate-x-1/2 z-30 px-6 py-3 rounded-lg text-center pointer-events-none"
                        style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}
                    >
                        <div className="text-cyan-300 text-xs font-bold tracking-widest mb-1">
                            TUTORIAL · STEP {step + 1} / {STEPS.length}
                        </div>
                        <div className="text-white text-2xl font-bold drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                            {STEPS[step].text}
                        </div>
                    </div>
                    {/* Skip (top-left is free now that lap/time moved to the bottom cluster) */}
                    <button
                        onClick={onDone}
                        className="absolute top-6 left-6 z-30 pointer-events-auto px-4 py-2 bg-gray-800/80 hover:bg-gray-700 text-gray-300 text-sm font-bold rounded"
                    >
                        Skip tutorial
                    </button>
                </>
            )}

            {complete && (
                <div
                    className="absolute inset-0 z-40 flex items-center justify-center pointer-events-auto"
                    style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
                >
                    <div className="text-center p-8 rounded-xl border-2 border-cyan-500 bg-gray-900 shadow-[0_0_40px_rgba(0,255,255,0.3)]">
                        <div className="text-4xl font-black italic text-cyan-400 mb-2">TUTORIAL COMPLETE 🏁</div>
                        <div className="text-gray-300 mb-6">You've got the basics — ready to race.</div>
                        <button
                            onClick={onDone}
                            className="px-8 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded uppercase tracking-widest transition-all"
                        >
                            Back to Menu
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
