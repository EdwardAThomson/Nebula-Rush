import { useEffect, useRef, useState } from 'react';
import type { Ship } from '../game/Ship';

interface TutorialOverlayProps {
    shipRef: React.RefObject<Ship | null>;
    raceStartedRef: React.RefObject<boolean>;
    onDone: () => void;
}

interface Step {
    text: string;
    praise: string; // shown briefly after the action, before the next prompt
    done: (s: Ship) => boolean;
}

// Pause (ms) on the "nice!" confirmation between actions, so prompts don't flash by.
const DWELL_MS = 2000;
// Minimum time a prompt stays on screen before its action can complete it —
// guarantees time to read, and stops steps chaining instantly.
const MIN_READ_MS = 3500;

// Action-gated steps — each advances once the player actually does the thing.
// Matches the current mechanics (no jump / tight-corner drift yet).
const STEPS: Step[] = [
    {
        text: 'Hold  W  (or ↑) to accelerate',
        praise: 'Nice — you\'re moving!',
        done: (s) => s.state.velocity.y > 5,
    },
    {
        text: 'Use  Q / E  (or  A / D) to shift across the track — it follows the bends on its own',
        praise: 'Good — that\'s how you pick your line.',
        done: (s) => Math.abs(s.state.velocity.x) > 0.05,
    },
    {
        text: 'Drive through the cyan boost arrows for a speed burst',
        praise: 'Boost! Feel the kick.',
        done: (s) => s.state.boostTimer > 0,
    },
    {
        text: 'Now cross the finish line!',
        praise: 'You crossed the line!',
        done: (s) => s.lap >= 2,
    },
];

export default function TutorialOverlay({ shipRef, raceStartedRef, onDone }: TutorialOverlayProps) {
    const [step, setStep] = useState(0);
    const [phase, setPhase] = useState<'prompt' | 'success'>('prompt');
    const [complete, setComplete] = useState(false);

    const stepRef = useRef(0);
    const phaseRef = useRef<'prompt' | 'success'>('prompt');
    const rafRef = useRef(0);
    const timerRef = useRef<number | null>(null);
    const promptShownAtRef = useRef<number | null>(null);

    useEffect(() => {
        const tick = () => {
            const ship = shipRef.current;
            if (ship && raceStartedRef.current && phaseRef.current === 'prompt' && stepRef.current < STEPS.length) {
                const now = performance.now();
                // Start the read timer once the prompt is live (race underway).
                if (promptShownAtRef.current === null) promptShownAtRef.current = now;
                const lingered = now - promptShownAtRef.current >= MIN_READ_MS;

                if (lingered && STEPS[stepRef.current].done(ship)) {
                    // Action done — show a confirmation, then advance after a dwell.
                    phaseRef.current = 'success';
                    setPhase('success');
                    timerRef.current = window.setTimeout(() => {
                        stepRef.current += 1;
                        promptShownAtRef.current = null; // restart read timer for the next prompt
                        if (stepRef.current >= STEPS.length) {
                            setComplete(true);
                        } else {
                            phaseRef.current = 'prompt';
                            setStep(stepRef.current);
                            setPhase('prompt');
                        }
                    }, DWELL_MS);
                }
            }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => {
            cancelAnimationFrame(rafRef.current);
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [shipRef, raceStartedRef]);

    return (
        <>
            {!complete && (
                <>
                    {/* Prompt / confirmation (below the track name) */}
                    <div
                        className="absolute top-28 left-1/2 -translate-x-1/2 z-30 px-6 py-3 rounded-lg text-center pointer-events-none"
                        style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}
                    >
                        <div className="text-cyan-300 text-xs font-bold tracking-widest mb-1">
                            TUTORIAL · STEP {step + 1} / {STEPS.length}
                        </div>
                        {phase === 'prompt' ? (
                            <div className="text-white text-2xl font-bold drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                                {STEPS[step].text}
                            </div>
                        ) : (
                            <div className="text-green-400 text-2xl font-bold drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                                ✓ {STEPS[step].praise}
                            </div>
                        )}
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
