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
    // `seen` accumulates which directions were pressed this step, so steps that
    // ask the player to "try both" keys only complete once both are done.
    // `baselineLap` is the player's lap when this step started (used by the
    // finish step to require a fresh crossing rather than a lap already done).
    done: (s: Ship, seen: Set<string>, baselineLap: number) => boolean;
    readMs?: number;  // override the read-gate for this step
    dwellMs?: number; // override the confirmation dwell for this step
}

// Pause (ms) on the "nice!" confirmation between actions, so prompts don't flash by.
const DWELL_MS = 3200;
// Minimum time a prompt stays on screen before its action can complete it —
// guarantees time to read, and stops steps chaining instantly.
const MIN_READ_MS = 3000;

// Tutorial slick patch lives at trackProgress 0.45 (see TUTORIAL_TRACK). Warn a
// little before it and keep the warning up until just past it.
const SLICK_WARN_FROM = 0.36;
const SLICK_WARN_TO = 0.48;
// Tutorial boost pad sits at trackProgress 0.7 (centred) — a friendly heads-up.
const BOOST_WARN_FROM = 0.61;
const BOOST_WARN_TO = 0.73;

// Action-gated steps — each advances once the player actually does the thing.
// Matches the current mechanics (no jump / tight-corner drift yet).
const STEPS: Step[] = [
    {
        text: 'Hold  W  (or ↑) to accelerate',
        praise: 'Nice — you\'re moving!',
        done: (s) => s.state.velocity.y > 5,
    },
    {
        text: 'Steer with  Q  and  E  — try both to swing your nose left and right',
        praise: 'Good — that\'s your heading.',
        done: (s, seen) => {
            if (s.state.yaw > 0.006) seen.add('q');
            if (s.state.yaw < -0.006) seen.add('e');
            return seen.has('q') && seen.has('e');
        },
        // Requires both keys, so it doesn't need a long read-gate to feel deliberate.
        readMs: 1500,
    },
    {
        text: 'Strafe with  A  and  D  — try both to slide sideways without turning',
        praise: 'Perfect — strafing is how you dodge hazards.',
        done: (s, seen) => {
            if (s.state.targetRotation < -0.1) seen.add('a');
            if (s.state.targetRotation > 0.1) seen.add('d');
            return seen.has('a') && seen.has('d');
        },
        readMs: 1500,
    },
    {
        text: 'Drive through the glowing boost arrows for a speed burst',
        praise: 'Boost! Feel the kick.',
        done: (s) => s.state.boostTimer > 0,
    },
    {
        text: 'Now cross the finish line!',
        praise: 'You crossed the line!',
        // Require a crossing AFTER the boost step started — not a lap we may have
        // already completed (e.g. if the boost pad was missed and re-attempted).
        done: (s, _seen, baselineLap) => s.lap > baselineLap,
        // Snappier than the rest — you've already driven a lap to get here.
        readMs: 800,
        dwellMs: 1200,
    },
];

export default function TutorialOverlay({ shipRef, raceStartedRef, onDone }: TutorialOverlayProps) {
    const [step, setStep] = useState(0);
    const [phase, setPhase] = useState<'prompt' | 'success'>('prompt');
    const [complete, setComplete] = useState(false);
    const [nearSlick, setNearSlick] = useState(false);
    const [nearBoost, setNearBoost] = useState(false);

    const stepRef = useRef(0);
    const phaseRef = useRef<'prompt' | 'success'>('prompt');
    const rafRef = useRef(0);
    const timerRef = useRef<number | null>(null);
    const promptShownAtRef = useRef<number | null>(null);
    const seenRef = useRef<Set<string>>(new Set());
    const nearSlickRef = useRef(false);
    const nearBoostRef = useRef(false);
    const baselineLapRef = useRef(0); // player's lap when the current step began

    useEffect(() => {
        const tick = () => {
            const ship = shipRef.current;
            if (ship) {
                // Slick-patch proximity warning — independent of the step sequence,
                // so it shows whenever the player is approaching the slick.
                const tp = ship.state.trackProgress;
                const nearNow = raceStartedRef.current && tp > SLICK_WARN_FROM && tp < SLICK_WARN_TO;
                if (nearNow !== nearSlickRef.current) {
                    nearSlickRef.current = nearNow;
                    setNearSlick(nearNow);
                }
                const nearBoostNow = raceStartedRef.current && tp > BOOST_WARN_FROM && tp < BOOST_WARN_TO;
                if (nearBoostNow !== nearBoostRef.current) {
                    nearBoostRef.current = nearBoostNow;
                    setNearBoost(nearBoostNow);
                }

                if (raceStartedRef.current && phaseRef.current === 'prompt' && stepRef.current < STEPS.length) {
                    const cur = STEPS[stepRef.current];
                    const now = performance.now();
                    // Start the read timer once the prompt is live (race underway).
                    if (promptShownAtRef.current === null) promptShownAtRef.current = now;
                    const lingered = now - promptShownAtRef.current >= (cur.readMs ?? MIN_READ_MS);

                    if (lingered && cur.done(ship, seenRef.current, baselineLapRef.current)) {
                        // Action done — show a confirmation, then advance after a dwell.
                        phaseRef.current = 'success';
                        setPhase('success');
                        timerRef.current = window.setTimeout(() => {
                            stepRef.current += 1;
                            promptShownAtRef.current = null; // restart read timer for the next prompt
                            seenRef.current = new Set();      // reset "try both" tracking
                            baselineLapRef.current = ship.lap; // lap baseline for the new step
                            if (stepRef.current >= STEPS.length) {
                                setComplete(true);
                            } else {
                                phaseRef.current = 'prompt';
                                setStep(stepRef.current);
                                setPhase('prompt');
                            }
                        }, cur.dwellMs ?? DWELL_MS);
                    }
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

            {/* Hazard warning: a dangling, flashing arrow + box as you near the slick. */}
            {nearSlick && !complete && (
                <div
                    className="absolute -translate-x-1/2 z-30 flex flex-col items-center pointer-events-none"
                    style={{ top: '40%', left: '63%' }}
                >
                    <div className="text-6xl animate-bounce" style={{ color: '#ff3b3b' }}>▼</div>
                    <div
                        className="px-5 py-2 rounded-lg border-2 border-red-500 animate-pulse text-center"
                        style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
                    >
                        <div className="text-red-400 font-bold text-xl tracking-wide">⚠ SLICK PATCH AHEAD</div>
                        <div className="text-white text-sm">Strafe (A / D) around it — it caps your speed</div>
                    </div>
                </div>
            )}

            {/* Boost pad: a friendly dangling arrow + box as you near it (centred). */}
            {nearBoost && !complete && (
                <div
                    className="absolute left-1/2 -translate-x-1/2 z-30 flex flex-col items-center pointer-events-none"
                    style={{ top: '40%' }}
                >
                    <div className="text-6xl animate-bounce" style={{ color: '#39ff7a' }}>▼</div>
                    <div
                        className="px-5 py-2 rounded-lg border-2 border-green-400 animate-pulse text-center"
                        style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
                    >
                        <div className="text-green-300 font-bold text-xl tracking-wide">⚡ BOOST PAD</div>
                        <div className="text-white text-sm">Drive straight through for a speed burst</div>
                    </div>
                </div>
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
