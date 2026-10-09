import { useState } from 'react';
import type { EnvironmentConfig, TimeOfDay, Weather } from '../game/EnvironmentManager';
import { audioManager } from '../game/AudioManager';

interface EnvironmentSelectionProps {
    onSelect: (config: EnvironmentConfig) => void;
    onBack: () => void;
    onMainMenu?: () => void;
    // Space tracks (Nebula Cup) force clear vacuum skies, so weather is a no-op
    // there. Hide the picker rather than offer a choice that gets silently ignored.
    isSpaceTrack?: boolean;
    // Sandstorm tracks already supply their own dust weather. Offer clear/fog
    // (fog = a thicker dust haze) but block rain, which clashes with the storm.
    isStormTrack?: boolean;
}

const TIMES: TimeOfDay[] = ['morning', 'day', 'evening', 'night'];
const WEATHERS: Weather[] = ['clear', 'fog', 'rain'];

export default function EnvironmentSelection({ onSelect, onBack, onMainMenu, isSpaceTrack, isStormTrack }: EnvironmentSelectionProps) {
    const [selectedTime, setSelectedTime] = useState<TimeOfDay>('day');
    const [selectedWeather, setSelectedWeather] = useState<Weather>('clear');

    // Which weather buttons this track allows. Storm tracks drop rain.
    const availableWeathers: Weather[] = isStormTrack
        ? WEATHERS.filter((w) => w !== 'rain')
        : WEATHERS;
    // If the current selection isn't valid for this track, fall back to clear.
    const effectiveWeather: Weather = availableWeathers.includes(selectedWeather) ? selectedWeather : 'clear';

    const handleConfirm = () => {
        onSelect({
            timeOfDay: selectedTime,
            // Weather has no effect in the vacuum of space — always send 'clear'.
            weather: isSpaceTrack ? 'clear' : effectiveWeather
        });
    };

    return (
        <div className="flex flex-col items-center justify-center h-full relative z-10">
<div className="mb-12"><h2 className="screen-title">ENVIRONMENT</h2><div className="screen-rule" /></div>

            <div className="flex space-x-12 mb-12">

                {/* TIME SELECTION */}
                <div className="flex flex-col space-y-4">
                    <h2 className="screen-section mb-4">TIME OF DAY</h2>
                    <div className="grid grid-cols-1 gap-4 w-64">
                        {TIMES.map((time) => (
                            <button
                                key={time}
                                onClick={() => { audioManager.playClick(); setSelectedTime(time); }}
                                onMouseEnter={() => audioManager.playHover()}
                                className={`menu-btn menu-btn-option menu-btn-cyan uppercase ${selectedTime === time ? 'is-selected' : ''}`}
                            >
                                {time}
                            </button>
                        ))}
                    </div>
                </div>

                {/* WEATHER SELECTION — hidden on space tracks, where it has no effect */}
                <div className="flex flex-col space-y-4">
                    <h2 className="screen-section mb-4">WEATHER</h2>
                    {isSpaceTrack ? (
                        <div className="grid grid-cols-1 gap-4 w-64">
                            <div className="menu-btn menu-btn-option menu-btn-fuchsia uppercase text-center cursor-default">
                                Clear (vacuum)
                            </div>
                            <p className="text-sm text-gray-500 text-center px-2">
                                Space tracks race under clear skies — no weather here.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4 w-64">
                            {availableWeathers.map((weather) => (
                                <button
                                    key={weather}
                                    onClick={() => { audioManager.playClick(); setSelectedWeather(weather); }}
                                    onMouseEnter={() => audioManager.playHover()}
                                    className={`menu-btn menu-btn-option menu-btn-fuchsia uppercase ${effectiveWeather === weather ? 'is-selected' : ''}`}
                                >
                                    {weather}
                                </button>
                            ))}
                            {isStormTrack && (
                                <p className="text-sm text-gray-500 text-center px-2">
                                    Sandstorm track — rain blocked; fog adds a grey haze.
                                </p>
                            )}
                        </div>
                    )}
                </div>

            </div>

            {/* FOOTER ACTIONS */}
            <div className="flex space-x-6">
                <button
                    onClick={() => { audioManager.playClick(); onBack(); }}
                    onMouseEnter={() => audioManager.playHover()}
                    className="menu-btn menu-btn-back"
                >
                    BACK TO TRACK
                </button>
                {onMainMenu && (
                    <button
                        onClick={() => { audioManager.playClick(); onMainMenu(); }}
                        onMouseEnter={() => audioManager.playHover()}
                        className="menu-btn menu-btn-back"
                    >
                        MAIN MENU
                    </button>
                )}
                <button
                    onClick={() => { audioManager.playClick(); handleConfirm(); }}
                    onMouseEnter={() => audioManager.playHover()}
                    className="menu-btn menu-btn-primary min-w-[13rem]"
                >
                    CONFIRM
                </button>
            </div>
        </div>
    );
}
