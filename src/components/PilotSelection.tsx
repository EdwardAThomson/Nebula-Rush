import { useState } from 'react';
import { PILOTS, type Pilot } from '../game/PilotDefinitions';

interface PilotSelectionProps {
    onSelect: (pilot: Pilot) => void;
    onBack: () => void;
}

export default function PilotSelection({ onSelect, onBack }: PilotSelectionProps) {
    const [selectedPilot, setSelectedPilot] = useState<Pilot | null>(null);

    return (
        <div className="relative z-10 flex flex-col items-center justify-center h-full p-8">
            <h2 className="text-4xl font-bold text-white mb-8 animate-pulse text-center">CHOOSE YOUR PILOT</h2>

            <div className="flex flex-wrap justify-center gap-6 w-full max-w-7xl overflow-y-auto max-h-[70vh] p-4 scrollbar-hide">
                {PILOTS.map((pilot) => (
                    <div
                        key={pilot.id}
                        onClick={() => setSelectedPilot(pilot)}
                        className={`
                            relative bg-gray-900 bg-opacity-80 rounded-xl overflow-hidden cursor-pointer transition-all transform hover:scale-105
                            w-64 border-2 flex flex-col
                            ${selectedPilot?.id === pilot.id ? 'border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.5)] scale-105' : 'border-gray-700 hover:border-gray-500'}
                        `}
                    >
                        {/* Image */}
                        <div className="h-64 w-full overflow-hidden">
                            <img
                                src={pilot.imagePath}
                                alt={pilot.name}
                                className="w-full h-full object-cover transition-transform duration-500 hover:scale-110"
                            />
                        </div>

                        {/* Info */}
                        <div className="p-4 flex-1 flex flex-col">
                            <h3 className={`text-xl font-bold mb-2 ${selectedPilot?.id === pilot.id ? 'text-cyan-400' : 'text-white'}`}>
                                {pilot.name}
                            </h3>
                            <p className="text-gray-400 text-sm italic mb-4">{pilot.bio}</p>

                            {/* Stats */}
                            <div className="space-y-2 mt-auto">
                                <StatRow label="VEL" value={pilot.stats.velocity} color="bg-cyan-500" />
                                <StatRow label="ACC" value={pilot.stats.acceleration} color="bg-yellow-500" />
                                <StatRow label="HND" value={pilot.stats.handling} color="bg-purple-500" />
                            </div>
                        </div>

                        {/* Selected Indicator */}
                        {selectedPilot?.id === pilot.id && (
                            <div className="absolute top-2 right-2 bg-cyan-500 text-black font-bold px-2 py-1 rounded text-xs">
                                SELECTED
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div className="flex space-x-6 mt-8">
                <button
                    onClick={onBack}
                    className="px-8 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold rounded shadow-lg border border-gray-600 transition-all"
                >
                    BACK
                </button>
                <button
                    onClick={() => selectedPilot && onSelect(selectedPilot)}
                    disabled={!selectedPilot}
                    className={`
                        px-8 py-3 font-bold rounded shadow-lg transition-all
                        ${selectedPilot
                            ? 'bg-cyan-600 hover:bg-cyan-500 text-white transform hover:scale-105'
                            : 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700'}
                    `}
                >
                    CONFIRM PILOT
                </button>
            </div>
        </div>
    );
}

function StatRow({ label, value, color }: { label: string, value: number, color: string }) {
    // Map -2..+2 to 1..5 for visual width (20% to 100%)
    // -2 -> 20%, -1 -> 40%, 0 -> 60%, 1 -> 80%, 2 -> 100%
    // actually, let's just show relative bars. 
    // Normalized: (value + 3) / 6 * 100 ? No.
    // Let's do a simple 5-pip system. 3 pips is average (0).
    // -2: [ ][ ][ ][ ][ ] (1 filled)
    // -1: [x][ ][ ][ ][ ] (2 filled)
    //  0: [x][x][ ][ ][ ] (3 filled)
    // +1: [x][x][x][ ][ ] (4 filled)
    // +2: [x][x][x][x][ ] (5 filled)
    const filledCount = value + 3;

    return (
        <div className="flex items-center text-xs">
            <span className="w-8 font-bold text-gray-500">{label}</span>
            <div className="flex-1 flex space-x-1">
                {[...Array(5)].map((_, i) => (
                    <div
                        key={i}
                        className={`h-2 flex-1 rounded-sm ${i < filledCount ? color : 'bg-gray-800'}`}
                    />
                ))}
            </div>
        </div>
    );
}
