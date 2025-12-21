import { useState } from 'react';
import type { EnvironmentConfig, TimeOfDay, Weather } from '../game/EnvironmentManager';
import { audioManager } from '../game/AudioManager';

interface EnvironmentSelectionProps {
    onSelect: (config: EnvironmentConfig) => void;
    onBack: () => void;
}

const TIMES: TimeOfDay[] = ['morning', 'day', 'evening', 'night'];
const WEATHERS: Weather[] = ['clear', 'fog', 'rain'];

export default function EnvironmentSelection({ onSelect, onBack }: EnvironmentSelectionProps) {
    const [selectedTime, setSelectedTime] = useState<TimeOfDay>('day');
    const [selectedWeather, setSelectedWeather] = useState<Weather>('clear');

    const handleConfirm = () => {
        onSelect({
            timeOfDay: selectedTime,
            weather: selectedWeather
        });
    };

    return (
        <div className="flex flex-col items-center justify-center h-full relative z-10">
            <h1 className="text-4xl md:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500 mb-12">
                ENVIRONMENT
            </h1>

            <div className="flex space-x-12 mb-12">

                {/* TIME SELECTION */}
                <div className="flex flex-col space-y-4">
                    <h2 className="text-2xl font-bold text-gray-400 text-center mb-4">TIME OF DAY</h2>
                    <div className="grid grid-cols-1 gap-4 w-64">
                        {TIMES.map((time) => (
                            <button
                                key={time}
                                onClick={() => { audioManager.playClick(); setSelectedTime(time); }}
                                onMouseEnter={() => audioManager.playHover()}
                                className={`px-6 py-4 rounded-lg font-bold uppercase transition-all transform hover:scale-105 ${selectedTime === time
                                        ? 'bg-cyan-600 text-white shadow-[0_0_15px_rgba(8,145,178,0.5)] border-2 border-cyan-400'
                                        : 'bg-gray-800 text-gray-400 border-2 border-transparent hover:bg-gray-700'
                                    }`}
                            >
                                {time}
                            </button>
                        ))}
                    </div>
                </div>

                {/* WEATHER SELECTION */}
                <div className="flex flex-col space-y-4">
                    <h2 className="text-2xl font-bold text-gray-400 text-center mb-4">WEATHER</h2>
                    <div className="grid grid-cols-1 gap-4 w-64">
                        {WEATHERS.map((weather) => (
                            <button
                                key={weather}
                                onClick={() => { audioManager.playClick(); setSelectedWeather(weather); }}
                                onMouseEnter={() => audioManager.playHover()}
                                className={`px-6 py-4 rounded-lg font-bold uppercase transition-all transform hover:scale-105 ${selectedWeather === weather
                                        ? 'bg-purple-600 text-white shadow-[0_0_15px_rgba(147,51,234,0.5)] border-2 border-purple-400'
                                        : 'bg-gray-800 text-gray-400 border-2 border-transparent hover:bg-gray-700'
                                    }`}
                            >
                                {weather}
                            </button>
                        ))}
                    </div>
                </div>

            </div>

            {/* FOOTER ACTIONS */}
            <div className="flex space-x-6">
                <button
                    onClick={() => { audioManager.playClick(); onBack(); }}
                    onMouseEnter={() => audioManager.playHover()}
                    className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold rounded shadow-lg transition-all"
                >
                    BACK
                </button>
                <button
                    onClick={() => { audioManager.playClick(); handleConfirm(); }}
                    onMouseEnter={() => audioManager.playHover()}
                    className="px-8 py-3 bg-gradient-to-r from-cyan-500 to-cyan-700 hover:from-cyan-400 hover:to-cyan-600 text-white font-bold rounded shadow-lg transform hover:scale-105 transition-all border border-cyan-400"
                >
                    CONFIRM
                </button>
            </div>
        </div>
    );
}
