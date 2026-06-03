import { useState, useEffect } from 'react';
import Game from './components/Game';
import type { ShipConfig } from './game/Ship';
import { SHIP_STATS, type ShipType } from './game/ShipFactory';
import { audioManager } from './game/AudioManager';
import ShipPreview from './components/ShipPreview';
import TrackPreview from './components/TrackPreview';
import TrackAnalysis from './components/TrackAnalysis';
import EnvironmentTest from './components/EnvironmentTest';
import EnvironmentSelection from './components/EnvironmentSelection';
import LightingPlayground from './components/LightingPlayground';
import PilotSelection from './components/PilotSelection';
import ShipDemo from './components/ShipDemo';
import SettingsMenu from './components/SettingsMenu';
import type { Pilot } from './game/PilotDefinitions';
import type { EnvironmentConfig } from './game/EnvironmentManager';
import { TRACKS } from './game/TrackDefinitions';

// Calculate display stats (0-100) dynamically from SHIP_STATS
const getDisplayStats = (type: ShipType) => {
  const stats = SHIP_STATS[type];

  // Calculate top speed from friction: topSpeed = accelFactor / (1 - friction)
  const topSpeed = stats.accelFactor / (1 - stats.friction);

  // Get min/max across all ships for normalization
  const allStats = Object.values(SHIP_STATS);
  const allTopSpeeds = allStats.map(s => s.accelFactor / (1 - s.friction));
  const allAccels = allStats.map(s => s.accelFactor);
  const allHandling = allStats.map(s => s.turnSpeed + (1 - s.slideFactor) * 0.5); // Combined turn + grip

  const minSpeed = Math.min(...allTopSpeeds);
  const maxSpeed = Math.max(...allTopSpeeds);
  const minAccel = Math.min(...allAccels);
  const maxAccel = Math.max(...allAccels);
  const handling = stats.turnSpeed + (1 - stats.slideFactor) * 0.5;
  const minHandling = Math.min(...allHandling);
  const maxHandling = Math.max(...allHandling);

  // Normalize to 50-100 range (so even the worst stat looks decent)
  const normalize = (val: number, min: number, max: number) =>
    Math.round(50 + ((val - min) / (max - min)) * 50);

  return {
    speed: normalize(topSpeed, minSpeed, maxSpeed),
    accel: normalize(stats.accelFactor, minAccel, maxAccel),
    handling: normalize(handling, minHandling, maxHandling),
    // For corsair, show drift instead of handling
    drift: Math.round(50 + (stats.slideFactor - 0.85) / (0.995 - 0.85) * 50)
  };
};

// Preset paint palette — keeps the customizer snappy vs. the native color picker
const PAINT_PALETTE: { name: string, value: number }[] = [
  { name: 'Red',    value: 0xcc0000 },
  { name: 'Orange', value: 0xff7700 },
  { name: 'Yellow', value: 0xffcc00 },
  { name: 'Green',  value: 0x00cc44 },
  { name: 'Cyan',   value: 0x00ccff },
  { name: 'Blue',   value: 0x2244cc },
  { name: 'Purple', value: 0x8822cc },
  { name: 'Pink',   value: 0xff44aa },
  { name: 'White',  value: 0xeeeeee },
  { name: 'Black',  value: 0x222222 },
];
const numToCss = (n: number) => '#' + n.toString(16).padStart(6, '0');

// Reusable button with audio feedback
const AudioButton = ({
  onClick,
  className,
  children
}: {
  onClick: () => void;
  className: string;
  children: React.ReactNode;
}) => (
  <button
    onClick={() => {
      audioManager.playClick();
      onClick();
    }}
    onMouseEnter={() => audioManager.playHover()}
    className={className}
  >
    {children}
  </button>
);

function App() {
  const [screen, setScreen] = useState<'start' | 'pilot_selection' | 'selection' | 'track_selection' | 'game' | 'analysis' | 'env_test' | 'lighting_debug' | 'env_selection' | 'night_test' | 'ship_demo'>('start');
  const [gameMode, setGameMode] = useState<'campaign' | 'single_race'>('campaign');
  const [isLoading, setIsLoading] = useState(false); // NEW: Loading state
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState(0);
  const [selectedEnvConfig, setSelectedEnvConfig] = useState<EnvironmentConfig | null>(null);
  const [selectedPilot, setSelectedPilot] = useState<Pilot | null>(null);
  const [selectedShipConfig, setSelectedShipConfig] = useState<ShipConfig>({
    color: 0xcc0000,
    accelFactor: 0.5,
    turnSpeed: 0.001,
    friction: 0.99,
    strafeSpeed: 0.01,
    slideFactor: 0.95,
    type: 'fighter'
  });

  // Paint customizer state (modal on the ship-select screen)
  const [customizeType, setCustomizeType] = useState<ShipType | null>(null);
  const [primaryColor, setPrimaryColor] = useState(0xcc0000);
  const [accentColor, setAccentColor] = useState(0xeeeeee);

  // Preload audio assets in background on app start
  useEffect(() => {
    audioManager.preloadAll();
    audioManager.preloadMusic();
  }, []);

  // Helper to show loading screen before heavy computations
  const navigateTo = (newScreen: typeof screen, callback?: () => void, manualDismiss = false) => {
    setIsLoading(true);
    // Allow UI to render the loading screen
    setTimeout(() => {
      if (callback) callback();
      setScreen(newScreen);

      if (!manualDismiss) {
        setTimeout(() => setIsLoading(false), 100);
      }
    }, 50);
  };

  const handleNewGame = () => {
    navigateTo('pilot_selection', () => {
      setGameMode('campaign');
      setSelectedTrackIndex(0);
      setSelectedEnvConfig(null);
    });
  };

  /*
  const handleNightTest = () => {
    navigateTo('night_test', () => {
      setGameMode('single_race');
      setSelectedTrackIndex(0);
      setSelectedEnvConfig({ timeOfDay: 'night', weather: 'clear' });
    });
  };
*/

  const handlePilotSelect = (pilot: Pilot) => {
    setSelectedPilot(pilot);
    setScreen('selection');
  };

  const handleBackFromPilotSelect = () => {
    if (gameMode === 'single_race') {
      setScreen('env_selection');
    } else {
      setScreen('start');
    }
  };

  const handleTrackSelectMode = () => {
    setGameMode('single_race');
    setScreen('track_selection');
  };

  const handleShipSelect = (config: ShipConfig) => {
    setSelectedShipConfig(config);
    navigateTo('game', undefined, true);
  };

  // Open the paint customizer for a ship type, seeded with its signature color
  const openShipCustomizer = (type: ShipType, defaultColor: number) => {
    audioManager.playClick();
    setCustomizeType(type);
    setPrimaryColor(defaultColor);
    setAccentColor(0xeeeeee);
  };

  // Skip the paint modal: pick the ship with its default livery and race.
  const selectShipAndRace = (type: ShipType, defaultColor: number) => {
    audioManager.playClick();
    handleShipSelect({
      color: defaultColor,
      accentColor: 0xeeeeee,
      ...SHIP_STATS[type],
      type,
    });
  };

  // Small "PAINT" chip overlaid on each ship card. Clicking it opens the paint
  // customizer for that ship instead of racing immediately.
  const PaintChip = ({ type, defaultColor }: { type: ShipType, defaultColor: number }) => (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); openShipCustomizer(type, defaultColor); }}
      onMouseEnter={(e) => { e.stopPropagation(); audioManager.playHover(); }}
      title="Customize paint"
      className="absolute top-3 right-3 px-3 py-1 bg-gray-900 bg-opacity-80 hover:bg-gray-700 text-xs text-gray-200 font-bold rounded border border-gray-600 transition-colors z-10"
    >
      <span aria-hidden="true" className="mr-1">🎨</span>PAINT
    </button>
  );

  const confirmShipCustomization = () => {
    if (!customizeType) return;
    handleShipSelect({
      color: primaryColor,
      accentColor: accentColor,
      ...SHIP_STATS[customizeType],
      type: customizeType,
    });
    setCustomizeType(null);
  };

  const handleTrackSelect = (index: number) => {
    setSelectedTrackIndex(index);
    setScreen('env_selection');
  };

  const handleEnvSelect = (config: EnvironmentConfig) => {
    setSelectedEnvConfig(config);
    setScreen('pilot_selection');
  };

  const handleBackFromEnvSelect = () => {
    setScreen('track_selection');
  };

  const handleBackFromShipSelect = () => {
    setScreen('pilot_selection');
  };

  const handleGameExit = () => {
    setScreen('start');
  };

  return (
    <div className="w-full h-screen bg-black text-white font-mono overflow-hidden relative">

      {/* BACKGROUND (Simple for now) */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-black to-slate-900 z-0"></div>

      {/* LOADING OVERLAY */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black bg-opacity-90">
          <h2 className="text-4xl font-bold text-cyan-400 animate-pulse">LOADING...</h2>
          <div className="mt-4 w-64 h-2 bg-gray-800 rounded overflow-hidden">
            <div className="h-full bg-cyan-500 animate-ping" style={{ width: '100%', transformOrigin: 'left' }}></div>
          </div>
        </div>
      )}

      {/* START SCREEN */}
      {screen === 'start' && (
        <div className="relative z-10 flex flex-col items-center justify-center h-full">
          <h1 className="text-6xl md:text-8xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-600 mb-12 animate-pulse">
            NEBULA RUSH
          </h1>

          <div className="flex flex-col space-y-4 w-64">
            <AudioButton
              onClick={handleNewGame}
              className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded shadow-lg transform hover:scale-105 transition-all"
            >
              NEW GAME
            </AudioButton>
            <AudioButton
              onClick={handleTrackSelectMode}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded shadow-lg transform hover:scale-105 transition-all"
            >
              SELECT TRACK
            </AudioButton>
            {/*
            <button
              onClick={() => setScreen('ship_demo')}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded shadow-lg transform hover:scale-105 transition-all"
            >
              SHIP DEMO
            </button>
            */}
            {/* 
            <button
              onClick={handleNightTest}
              className="px-6 py-3 bg-blue-900 hover:bg-blue-800 text-white font-bold rounded shadow-lg transform hover:scale-105 transition-all border border-blue-600"
            >
              NIGHT TEST (QUICK)
            </button>
            <button
              onClick={() => setScreen('env_test')}
              className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-yellow-400 font-bold rounded shadow-lg transform hover:scale-105 transition-all border border-yellow-800"
            >
              WEATHER TEST
            </button>
            <button
              onClick={() => setScreen('lighting_debug')}
              className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-purple-400 font-bold rounded shadow-lg transform hover:scale-105 transition-all border border-purple-800"
            >
              LIGHTING DEBUG
            </button>
            */}
            {/* Track Analysis button hidden - uncomment for debugging
            <AudioButton
              onClick={() => setScreen('analysis')}
              className="px-6 py-3 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded shadow-lg transform hover:scale-105 transition-all"
            >
              TRACK ANALYSIS
            </AudioButton>
*/}
            <AudioButton
              onClick={() => setShowHelp(true)}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-gray-200 font-bold rounded shadow-lg transform hover:scale-105 transition-all"
            >
              HELP
            </AudioButton>
            <AudioButton
              onClick={() => setShowSettings(true)}
              className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold rounded shadow-lg transform hover:scale-105 transition-all border border-gray-600"
            >
              ⚙ SETTINGS
            </AudioButton>
          </div>

          <div className="absolute bottom-8 text-gray-500 text-sm">
            © 2026 Edward Thomson (<a href="https://octonion.io" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white underline">Octonion Software</a>)
          </div>

        </div>
      )}

      {/* ... (Previous Logic) ... */}

      {/* NIGHT TEST SCREEN - Special Case of Game */}
      {screen === 'night_test' && (
        <Game
          shipConfig={selectedShipConfig}
          initialTrackIndex={0} // The Awakening
          isCampaign={false}
          forcedEnvironment={{ timeOfDay: 'night', weather: 'clear' }}
          pilot={null}
          opponentCount={0}
          onExit={handleGameExit}
          debugLighting={true}
          onReady={() => setIsLoading(false)}
        />
      )}

      {/* PILOT SELECTION SCREEN */}
      {
        screen === 'pilot_selection' && (
          <PilotSelection
            onSelect={handlePilotSelect}
            onBack={handleBackFromPilotSelect}
            backLabel={gameMode === 'single_race' ? 'BACK TO ENVIRONMENT' : 'BACK TO MENU'}
            onMainMenu={gameMode === 'single_race' ? () => setScreen('start') : undefined}
          />
        )
      }

      {/* SHIP SELECTION SCREEN */}
      {
        screen === 'selection' && (
          <div className="relative z-10 flex flex-col items-center h-full p-8">
            <h2 className="text-4xl font-bold text-white mb-8">SELECT YOUR SHIP</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-6xl overflow-y-auto flex-1 min-h-0 p-4 scrollbar-hide">
              {/* SHIP 1: FIGHTER (Balanced) */}
              <div
                onClick={() => selectShipAndRace('fighter', 0xcc0000)}
                onMouseEnter={() => audioManager.playHover()}
                className="relative bg-gray-800 bg-opacity-80 p-6 rounded-xl border-2 border-red-500 hover:bg-gray-700 cursor-pointer transition-all transform hover:-translate-y-2 hover:z-50 group"
              >
                <PaintChip type="fighter" defaultColor={0xcc0000} />
                <div className="h-48 bg-red-900 bg-opacity-30 rounded mb-4 flex items-center justify-center overflow-hidden">
                  <ShipPreview color={0xcc0000} type="fighter" />
                </div>
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-2xl font-bold text-red-500">FIGHTER</h3>
                  <InfoTip text="Perfectly balanced stats. Good for beginners and pros alike." />
                </div>

                <div className="space-y-2">
                  <StatBar label="Speed" value={getDisplayStats('fighter').speed} color="bg-cyan-500" />
                  <StatBar label="Accel" value={getDisplayStats('fighter').accel} color="bg-yellow-500" />
                  <StatBar label="Handling" value={getDisplayStats('fighter').handling} color="bg-green-500" />
                </div>
              </div>

              {/* SHIP 2: INTERCEPTOR (Bi-Plane) */}
              <div
                onClick={() => selectShipAndRace('interceptor', 0x00ff00)}
                onMouseEnter={() => audioManager.playHover()}
                className="relative bg-gray-800 bg-opacity-80 p-6 rounded-xl border-2 border-green-500 hover:bg-gray-700 cursor-pointer transition-all transform hover:-translate-y-2 hover:z-50 group"
              >
                <PaintChip type="interceptor" defaultColor={0x00ff00} />
                <div className="h-48 bg-green-900 bg-opacity-30 rounded mb-4 flex items-center justify-center overflow-hidden">
                  <ShipPreview color={0x00ff00} type="interceptor" />
                </div>
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-2xl font-bold text-green-500">INTERCEPTOR</h3>
                  <InfoTip text="Bi-plane design. Best-in-class acceleration and turning." />
                </div>

                <div className="space-y-2">
                  <StatBar label="Speed" value={getDisplayStats('interceptor').speed} color="bg-cyan-500" />
                  <StatBar label="Accel" value={getDisplayStats('interceptor').accel} color="bg-yellow-500" />
                  <StatBar label="Handling" value={getDisplayStats('interceptor').handling} color="bg-green-500" />
                </div>
              </div>

              {/* SHIP 3: TANK (Heavy) */}
              <div
                onClick={() => selectShipAndRace('tank', 0xcccc00)}
                onMouseEnter={() => audioManager.playHover()}
                className="relative bg-gray-800 bg-opacity-80 p-6 rounded-xl border-2 border-yellow-500 hover:bg-gray-700 cursor-pointer transition-all transform hover:-translate-y-2 hover:z-50 group"
              >
                <PaintChip type="tank" defaultColor={0xcccc00} />
                <div className="h-48 bg-yellow-900 bg-opacity-30 rounded mb-4 flex items-center justify-center overflow-hidden">
                  <ShipPreview color={0xcccc00} type="tank" />
                </div>
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-2xl font-bold text-yellow-500">TANK</h3>
                  <InfoTip text="Incredible acceleration and grip, but lower top speed." />
                </div>

                <div className="space-y-2">
                  <StatBar label="Speed" value={getDisplayStats('tank').speed} color="bg-cyan-500" />
                  <StatBar label="Accel" value={getDisplayStats('tank').accel} color="bg-yellow-500" />
                  <StatBar label="Handling" value={getDisplayStats('tank').handling} color="bg-green-500" />
                </div>
              </div>

              {/* SHIP 4: CORSAIR (Drifter) */}
              <div
                onClick={() => selectShipAndRace('corsair', 0x5500aa)}
                onMouseEnter={() => audioManager.playHover()}
                className="relative bg-gray-800 bg-opacity-80 p-6 rounded-xl border-2 border-purple-500 hover:bg-gray-700 cursor-pointer transition-all transform hover:-translate-y-2 hover:z-50 group"
              >
                <PaintChip type="corsair" defaultColor={0x5500aa} />
                <div className="h-48 bg-purple-900 bg-opacity-30 rounded mb-4 flex items-center justify-center overflow-hidden">
                  <ShipPreview color={0x5500aa} type="corsair" />
                </div>
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-2xl font-bold text-purple-500">CORSAIR</h3>
                  <InfoTip text="Aggressive styling. High speed and extreme drift capabilities." />
                </div>

                <div className="space-y-2">
                  <StatBar label="Speed" value={getDisplayStats('corsair').speed} color="bg-cyan-500" />
                  <StatBar label="Accel" value={getDisplayStats('corsair').accel} color="bg-yellow-500" />
                  <StatBar label="Drift" value={getDisplayStats('corsair').drift} color="bg-pink-500" />
                </div>
              </div>

              {/* SHIP 5: SPEEDSTER */}
              <div
                onClick={() => selectShipAndRace('speedster', 0x00ccff)}
                onMouseEnter={() => audioManager.playHover()}
                className="relative bg-gray-800 bg-opacity-80 p-6 rounded-xl border-2 border-cyan-500 hover:bg-gray-700 cursor-pointer transition-all transform hover:-translate-y-2 hover:z-50 group"
              >
                <PaintChip type="speedster" defaultColor={0x00ccff} />
                <div className="h-48 bg-cyan-900 bg-opacity-30 rounded mb-4 flex items-center justify-center overflow-hidden">
                  <ShipPreview color={0x00ccff} type="speedster" />
                </div>
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-2xl font-bold text-cyan-400">SPEEDSTER</h3>
                  <InfoTip text="High top speed, but slower acceleration. Built for long straights." />
                </div>

                <div className="space-y-2">
                  <StatBar label="Speed" value={getDisplayStats('speedster').speed} color="bg-cyan-500" />
                  <StatBar label="Accel" value={getDisplayStats('speedster').accel} color="bg-yellow-500" />
                  <StatBar label="Handling" value={getDisplayStats('speedster').handling} color="bg-green-500" />
                </div>
              </div>
            </div>

            <div className="flex space-x-6 mt-8">
              <button
                onClick={() => { audioManager.playClick(); handleBackFromShipSelect(); }}
                onMouseEnter={() => audioManager.playHover()}
                className="px-8 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold rounded shadow-lg border border-gray-600 transition-all"
              >
                BACK TO PILOT
              </button>
              <button
                onClick={() => { audioManager.playClick(); setScreen('start'); }}
                onMouseEnter={() => audioManager.playHover()}
                className="px-8 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold rounded shadow-lg border border-gray-600 transition-all"
              >
                MAIN MENU
              </button>
            </div>
          </div>
        )
      }

      {/* TRACK SELECTION SCREEN */}
      {
        screen === 'track_selection' && (
          <div className="relative z-10 flex flex-col items-center h-full p-8">
            <h2 className="text-4xl font-bold text-white mb-8">SELECT TRACK</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-6xl overflow-y-auto flex-1 min-h-0 p-4 scrollbar-hide">
              {TRACKS.map((track, index) => (
                <div
                  key={track.id}
                  onClick={() => { audioManager.playClick(); handleTrackSelect(index); }}
                  onMouseEnter={() => audioManager.playHover()}
                  className="bg-gray-800 bg-opacity-80 p-6 rounded-xl border-2 border-purple-500 hover:bg-gray-700 cursor-pointer transition-all transform hover:-translate-y-2 group"
                >
                  <div className="h-48 bg-black bg-opacity-50 rounded mb-4 flex items-center justify-center overflow-hidden border border-gray-700">
                    <TrackPreview points={track.points} />
                  </div>
                  <h3 className="text-2xl font-bold text-purple-400 mb-2">{track.name}</h3>
                  <p className="text-gray-400 text-sm mb-4 h-12">{track.description}</p>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-500 uppercase">Difficulty:</span>
                    <div className="flex space-x-1">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className={`w-2 h-2 rounded-full ${i < track.difficulty ? 'bg-purple-500' : 'bg-gray-700'}`} />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex space-x-6 mt-8">
              <button
                onClick={() => { audioManager.playClick(); setScreen('start'); }}
                onMouseEnter={() => audioManager.playHover()}
                className="px-8 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold rounded shadow-lg border border-gray-600 transition-all"
              >
                BACK TO MENU
              </button>
            </div>
          </div>
        )
      }

      {/* ANALYSIS SCREEN */}
      {
        screen === 'analysis' && (
          <div className="relative z-10 h-full w-full">
            <TrackAnalysis onBack={() => setScreen('start')} />
          </div>
        )
      }

      {/* ENVIRONMENT SELECTION SCREEN */}
      {
        screen === 'env_selection' && (
          <EnvironmentSelection
            onSelect={handleEnvSelect}
            onBack={handleBackFromEnvSelect}
            onMainMenu={() => setScreen('start')}
          />
        )
      }

      {/* ENVIRONMENT TEST SCREEN */}
      {
        screen === 'env_test' && (
          <EnvironmentTest onBack={() => setScreen('start')} />
        )
      }

      {/* LIGHTING DEBUG SCREEN */}
      {
        screen === 'lighting_debug' && (
          <LightingPlayground onBack={() => setScreen('start')} />
        )
      }

      {/* GAME SCREEN */}
      {
        screen === 'game' && selectedShipConfig && (
          <Game
            // Apply Pilot Modifiers to Ship Config
            shipConfig={selectedShipConfig}
            initialTrackIndex={selectedTrackIndex}
            isCampaign={gameMode === 'campaign'}
            forcedEnvironment={selectedEnvConfig || undefined}
            pilot={selectedPilot}
            onExit={handleGameExit}
            onReady={() => setIsLoading(false)}
          />
        )
      }

      {/* SHIP DEMO SCREEN */}
      {
        screen === 'ship_demo' && (
          <ShipDemo onBack={() => setScreen('start')} />
        )
      }

      {/* HELP MODAL */}
      {
        showHelp && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90">
            <div className="bg-gray-800 p-8 rounded-lg max-w-md w-full border border-gray-600">
              <h2 className="text-3xl font-bold text-white mb-6">HOW TO PLAY</h2>

              <div className="space-y-4 text-gray-300">
                <div>
                  <strong className="text-cyan-400 block">CONTROLS</strong>
                  <ul className="list-disc pl-5 mt-1 space-y-1">
                    <li><span className="text-white">W / Up</span> : Accelerate</li>
                    <li><span className="text-white">A / D</span> : Lean Left / Right (Strafe)</li>
                    <li><span className="text-white">Q / E</span> or <span className="text-white">Left/Right</span> : Steer</li>
                    <li><span className="text-white">A / D</span> : Side Strafe</li>
                    <li><span className="text-white">SPACE</span> : Jump</li>
                    <li><span className="text-white">P</span> : Screenshot</li>
                  </ul>
                </div>

                <div>
                  <strong className="text-purple-400 block">TIPS</strong>
                  <p className="text-sm">
                    Watch out for the traffic light start!
                    Hit the glowing boost arrows for a speed burst.
                    Avoid walls to maintain momentum.
                  </p>
                </div>

                <div className="pt-4 border-t border-gray-700 text-xs text-gray-500">
                  <p>© 2026 Edward Thomson (<a href="https://octonion.io" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white underline">Octonion Software</a>)</p>
                  <p>Website: <a href="https://edthomson.com" className="text-blue-400 hover:underline">edthomson.com</a></p>
                </div>
              </div>

              <button
                onClick={() => setShowHelp(false)}
                className="mt-8 w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded"
              >
                CLOSE
              </button>
            </div>
          </div>
        )
      }

      {/* SETTINGS MENU */}
      {showSettings && (
        <SettingsMenu onClose={() => setShowSettings(false)} />
      )}

      {/* PAINT CUSTOMIZER */}
      {customizeType && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black bg-opacity-90 p-4">
          <div className="bg-gray-800 p-8 rounded-lg max-w-lg w-full border border-gray-600">
            <h2 className="text-3xl font-bold text-white mb-2">CUSTOMIZE PAINT</h2>
            <p className="text-gray-400 text-sm mb-4">{customizeType.toUpperCase()} — drag to rotate</p>

            <div className="h-64 bg-black bg-opacity-50 rounded mb-6 flex items-center justify-center overflow-hidden border border-gray-700">
              <ShipPreview color={primaryColor} accentColor={accentColor} type={customizeType} interactive />
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <div className="text-gray-300 mb-2">Primary (Body)</div>
                <div className="flex flex-wrap gap-2">
                  {PAINT_PALETTE.map(({ name, value }) => (
                    <button
                      key={`p-${value}`}
                      type="button"
                      title={name}
                      onClick={() => setPrimaryColor(value)}
                      style={{ backgroundColor: numToCss(value) }}
                      className={`w-8 h-8 rounded border-2 transition ${primaryColor === value ? 'border-cyan-400 scale-110' : 'border-gray-600 hover:border-gray-400'}`}
                    />
                  ))}
                </div>
              </div>
              <div>
                <div className="text-gray-300 mb-2">Secondary (Wings / Trim)</div>
                <div className="flex flex-wrap gap-2">
                  {PAINT_PALETTE.map(({ name, value }) => (
                    <button
                      key={`s-${value}`}
                      type="button"
                      title={name}
                      onClick={() => setAccentColor(value)}
                      style={{ backgroundColor: numToCss(value) }}
                      className={`w-8 h-8 rounded border-2 transition ${accentColor === value ? 'border-cyan-400 scale-110' : 'border-gray-600 hover:border-gray-400'}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <AudioButton
                onClick={() => setCustomizeType(null)}
                className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded"
              >
                CANCEL
              </AudioButton>
              <AudioButton
                onClick={confirmShipCustomization}
                className="flex-1 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded"
              >
                RACE
              </AudioButton>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

// Small "i" badge that reveals descriptive text on hover. stopPropagation so
// clicking the badge doesn't trigger the parent card's onClick (ship select).
function InfoTip({ text }: { text: string }) {
  return (
    <span className="group/tip relative inline-flex" onClick={(e) => e.stopPropagation()}>
      <span className="w-5 h-5 flex items-center justify-center rounded-full bg-black/60 border border-gray-500 text-gray-300 text-[10px] font-bold cursor-help select-none">i</span>
      <span className="pointer-events-none absolute left-0 top-7 w-56 p-3 rounded-lg bg-gray-950 bg-opacity-95 border border-cyan-700 text-gray-300 text-xs leading-snug shadow-xl z-30 opacity-0 invisible transition-opacity duration-150 group-hover/tip:opacity-100 group-hover/tip:visible">
        {text}
      </span>
    </span>
  );
}

function StatBar({ label, value, color }: { label: string, value: number, color: string }) {
  return (
    <div className="flex items-center text-xs">
      <span className="w-16 text-gray-400">{label}</span>
      <div className="flex-1 h-2 bg-gray-900 rounded overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${value}%` }}></div>
      </div>
    </div>
  );
}

export default App
