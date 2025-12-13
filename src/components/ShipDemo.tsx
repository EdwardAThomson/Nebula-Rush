import { useState } from 'react';
import ShipPreview from './ShipPreview';
import { type ShipType } from '../game/ShipFactory';

interface ShipDemoProps {
    onBack: () => void;
}

export default function ShipDemo({ onBack }: ShipDemoProps) {
    const shipTypes: ShipType[] = ['speedster', 'fighter', 'tank'];
    const [currentIndex, setCurrentIndex] = useState(0);

    const currentType = shipTypes[currentIndex];

    // Default colors for each type for the demo
    const shipColors: Record<ShipType, number> = {
        speedster: 0x00ccff, // Cyan
        fighter: 0xcc0000,   // Red
        tank: 0xcccc00       // Yellow
    };

    const handleNext = () => {
        setCurrentIndex((prev) => (prev + 1) % shipTypes.length);
    };

    const handlePrev = () => {
        setCurrentIndex((prev) => (prev - 1 + shipTypes.length) % shipTypes.length);
    };

    return (
        <div className="relative w-full h-full bg-gray-900 flex flex-col items-center justify-center">

            {/* Header */}
            <div className="absolute top-8 z-10 text-center">
                <h2 className="text-4xl font-bold text-white mb-2">SHIP DEMO</h2>
                <p className="text-gray-400">Review ship models and geometry</p>
            </div>

            {/* Main Viewer */}
            <div className="w-full h-3/4 max-w-5xl bg-black bg-opacity-50 rounded-xl overflow-hidden border border-gray-700 shadow-2xl relative">
                <ShipPreview
                    key={currentType} // Force re-mount on change to ensure clean scene
                    type={currentType}
                    color={shipColors[currentType]}
                    interactive={true} // Enable Drag-to-Rotate
                />

                <div className="absolute top-4 right-4 bg-black bg-opacity-50 px-3 py-1 rounded text-cyan-400 text-sm pointer-events-none">
                    CLICK & DRAG TO SPIN
                </div>

                {/* Navigation Overlays */}
                <button
                    onClick={handlePrev}
                    className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-gray-800 bg-opacity-50 hover:bg-opacity-80 p-4 rounded-full text-white font-bold text-2xl transition-all"
                >
                    &lt;
                </button>
                <button
                    onClick={handleNext}
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-gray-800 bg-opacity-50 hover:bg-opacity-80 p-4 rounded-full text-white font-bold text-2xl transition-all"
                >
                    &gt;
                </button>

                {/* Info Label */}
                <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none">
                    <h3 className="text-3xl font-bold text-white uppercase tracking-wider drop-shadow-md">
                        {currentType}
                    </h3>
                </div>
            </div>

            {/* Footer Controls */}
            <div className="mt-8 z-10">
                <button
                    onClick={onBack}
                    className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded shadow-lg transition-all"
                >
                    BACK TO MENU
                </button>
            </div>
        </div>
    );
}
