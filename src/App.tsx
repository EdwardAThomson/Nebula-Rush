import { useState, useEffect } from 'react';
import Game from './components/Game';
import type { ShipConfig } from './game/Ship';
import { SHIP_STATS, type ShipType } from './game/ShipFactory';
import { audioManager } from './game/AudioManager';
import ShipPreview from './components/ShipPreview';
import ShipCarousel from './components/ShipCarousel';
import AttractBackground from './components/AttractBackground';
import TrackPreview from './components/TrackPreview';
import TrackAnalysis from './components/TrackAnalysis';
import EnvironmentTest from './components/EnvironmentTest';
import EnvironmentSelection from './components/EnvironmentSelection';
import LightingPlayground from './components/LightingPlayground';
import PilotSelection from './components/PilotSelection';
import CupSelection from './components/CupSelection';
import ShipDemo from './components/ShipDemo';
import PhysicsTest from './components/PhysicsTest';
import CaptureStudio from './components/CaptureStudio';
import SettingsMenu from './components/SettingsMenu';
import type { Pilot } from './game/PilotDefinitions';
import type { EnvironmentConfig } from './game/EnvironmentManager';
import { getUnlockedShipTypes, getSignatureShip, getUnlockHint } from './game/unlocks';
import { isEnvPickerEnabled } from './game/gameSettings';
import { TRACKS, TUTORIAL_TRACK, type TrackConfig } from './game/TrackDefinitions';
import { CUPS, resolveCupTracks, getCupForTrack, isCupReady, type Cup } from './game/CupDefinitions';
import { OpponentManager, type OpponentConfig } from './game/OpponentManager';
import { markCupCleared, isCupUnlocked } from './game/cupProgress';

// Calculate display stats (0-100) dynamically from SHIP_STATS
const getDisplayStats = (type: ShipType) => {
  const stats = SHIP_STATS[type];

  // Calculate top speed from friction: topSpeed = accelFactor / (1 - friction)
  const topSpeed = stats.accelFactor / (1 - stats.friction);

  // Get min/max across the roster (the ship cards) for normalization; the
  // retired ships still in SHIP_STATS must not stretch the bars.
  const allStats = SHIP_CARDS.map(c => SHIP_STATS[c.type]);
  const allTopSpeeds = allStats.map(s => s.accelFactor / (1 - s.friction));
  const allAccels = allStats.map(s => s.accelFactor);
  // Handling blends the two things a player can feel: how fast the nose comes
  // round under Q/E (turnSpeed) and how quickly a sideways slide dies once the
  // key is released (1 - slideFactor, the grip). Each is put on a 0..1 scale
  // over the roster first; the raw grip term is tens of times larger than the
  // turn rate, so summing them made a sharp-steering, loose-tailed ship read as
  // the worst handler on the grid.
  const unit = (val: number, arr: number[]) => {
    const lo = Math.min(...arr), hi = Math.max(...arr);
    return hi > lo ? (val - lo) / (hi - lo) : 0.5;
  };
  const allTurn = allStats.map(s => s.turnSpeed);
  const allGrip = allStats.map(s => 1 - s.slideFactor);
  const handlingOf = (s: typeof stats) => 0.5 * unit(s.turnSpeed, allTurn) + 0.5 * unit(1 - s.slideFactor, allGrip);
  const allHandling = allStats.map(handlingOf);

  const minSpeed = Math.min(...allTopSpeeds);
  const maxSpeed = Math.max(...allTopSpeeds);
  const minAccel = Math.min(...allAccels);
  const maxAccel = Math.max(...allAccels);
  const handling = handlingOf(stats);
  const minHandling = Math.min(...allHandling);
  const maxHandling = Math.max(...allHandling);

  // Normalize to 50-100 range (so even the worst stat looks decent)
  const normalize = (val: number, min: number, max: number) =>
    Math.round(50 + ((val - min) / (max - min)) * 50);

  const allEnergy = allStats.map(s => s.maxEnergy);

  return {
    speed: normalize(topSpeed, minSpeed, maxSpeed),
    accel: normalize(stats.accelFactor, minAccel, maxAccel),
    handling: normalize(handling, minHandling, maxHandling),
    energy: normalize(stats.maxEnergy, Math.min(...allEnergy), Math.max(...allEnergy))
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

// Ship-select cards, data-driven so lock state / recommended badge are handled
// once. Class strings stay literal (Tailwind needs them scannable).
const SHIP_CARDS: {
  type: ShipType; title: string; color: number; info: string;
  titleClass: string;
  stats: { label: string; key: 'speed' | 'accel' | 'handling' | 'energy'; barClass: string }[];
}[] = [
  {
    type: 'lancer', title: 'LANCER', color: 0xd9531e,
    info: 'The all-rounder. One lofted hull, twin outboard nacelles, a V-tail. Nothing to learn, nothing to exploit.',
    titleClass: 'text-orange-400',
    stats: [
      { label: 'Speed', key: 'speed', barClass: 'bg-cyan-500' },
      { label: 'Accel', key: 'accel', barClass: 'bg-yellow-500' },
      { label: 'Handling', key: 'handling', barClass: 'bg-green-500' },
      { label: 'Energy', key: 'energy', barClass: 'bg-emerald-400' },
    ],
  },
  {
    type: 'rapier', title: 'RAPIER', color: 0x2e7bd6,
    info: 'Podracer. Two huge engines towing a tiny pod: brutal launch, sharp turn-in, keeps sliding after you let go, thin plating.',
    titleClass: 'text-blue-400',
    stats: [
      { label: 'Speed', key: 'speed', barClass: 'bg-cyan-500' },
      { label: 'Accel', key: 'accel', barClass: 'bg-yellow-500' },
      { label: 'Handling', key: 'handling', barClass: 'bg-green-500' },
      { label: 'Energy', key: 'energy', barClass: 'bg-emerald-400' },
    ],
  },
  {
    type: 'sledge', title: 'SLEDGEHAMMER', color: 0xc8a34a,
    info: 'Landspeeder. A low, wide slab on three turbines: grip and armour over top speed.',
    titleClass: 'text-amber-400',
    stats: [
      { label: 'Speed', key: 'speed', barClass: 'bg-cyan-500' },
      { label: 'Accel', key: 'accel', barClass: 'bg-yellow-500' },
      { label: 'Handling', key: 'handling', barClass: 'bg-green-500' },
      { label: 'Energy', key: 'energy', barClass: 'bg-emerald-400' },
    ],
  },
  {
    type: 'kestrel', title: 'KESTREL', color: 0x9b1b3c,
    info: 'Air racer. Slim fuselage and a big wing: the highest top speed, slow off the line, slippery in the corners.',
    titleClass: 'text-rose-400',
    stats: [
      { label: 'Speed', key: 'speed', barClass: 'bg-cyan-500' },
      { label: 'Accel', key: 'accel', barClass: 'bg-yellow-500' },
      { label: 'Handling', key: 'handling', barClass: 'bg-green-500' },
      { label: 'Energy', key: 'energy', barClass: 'bg-emerald-400' },
    ],
  },
];

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
  const [screen, setScreen] = useState<'start' | 'pilot_selection' | 'selection' | 'track_selection' | 'cup_selection' | 'game' | 'analysis' | 'env_test' | 'lighting_debug' | 'env_selection' | 'night_test' | 'ship_demo' | 'capture' | 'tutorial' | 'physics_test'>('start');
  const [gameMode, setGameMode] = useState<'campaign' | 'single_race'>('campaign');
  const [isLoading, setIsLoading] = useState(false); // NEW: Loading state
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // First-visit nudge: pulse the TUTORIAL button until the player has raced or
  // done the tutorial. Persisted so it doesn't reappear on return visits.
  const [showTutorialPulse, setShowTutorialPulse] = useState(() => {
    try { return !localStorage.getItem('nebula-rush-onboarded'); } catch { return false; }
  });
  const markOnboarded = () => {
    try { localStorage.setItem('nebula-rush-onboarded', '1'); } catch { /* ignore */ }
    setShowTutorialPulse(false);
  };
  const [selectedTrackIndex, setSelectedTrackIndex] = useState(0);
  const [selectedCup, setSelectedCup] = useState<Cup | null>(null);
  // "Race All": chain every ready cup back-to-back. The final results of each cup
  // then offers "Next Cup →" instead of dropping straight back to the menu.
  const [raceAllMode, setRaceAllMode] = useState(false);
  // Race All aggregates points across cups: one persistent roster of rivals and a
  // running score map, carried from each cup into the next.
  const [raceAllRoster, setRaceAllRoster] = useState<OpponentConfig[] | null>(null);
  const [raceAllScores, setRaceAllScores] = useState<Record<string, number>>({});
  const [selectedEnvConfig, setSelectedEnvConfig] = useState<EnvironmentConfig | null>(null);
  const [selectedPilot, setSelectedPilot] = useState<Pilot | null>(null);
  const [selectedShipConfig, setSelectedShipConfig] = useState<ShipConfig>({
    color: 0xcc0000,
    accelFactor: 0.5,
    turnSpeed: 0.001,
    friction: 0.99,
    strafeSpeed: 0.01,
    slideFactor: 0.95,
    type: 'lancer'
  });

  // Roster gating: recomputed each render (cheap) so a just-cleared cup's
  // unlocks show up as soon as the player returns to the menus.
  const unlockedShips = getUnlockedShipTypes();
  const signatureShip = selectedPilot ? getSignatureShip(selectedPilot.id, unlockedShips) : 'lancer';

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
    markOnboarded();
    setGameMode('campaign');
    setScreen('cup_selection');
  };

  // Chose a cup → race its tracks in order, accumulating points.
  const handleCupSelect = (cup: Cup) => {
    setSelectedCup(cup);
    setRaceAllMode(false);
    navigateTo('pilot_selection', () => {
      setGameMode('campaign');
      setSelectedTrackIndex(0);
      setSelectedEnvConfig(null);
    });
  };

  // "Race All": start a gauntlet through every ready cup, beginning at the first.
  // One roster of rivals persists across all cups; scores start fresh and aggregate.
  const handleRaceAll = () => {
    const first = CUPS.find(isCupReady);
    if (!first) return;
    setSelectedCup(first);
    setRaceAllMode(true);
    setRaceAllRoster(OpponentManager.generateRoster(19));
    setRaceAllScores({});
    navigateTo('pilot_selection', () => {
      setGameMode('campaign');
      setSelectedTrackIndex(0);
      setSelectedEnvConfig(null);
    });
  };

  // "Race All": from a cup's final results, jump straight into the next ready cup
  // (same pilot/ship). The Game key change remounts at track 0 with a fresh roster.
  const handleNextCup = () => {
    const ready = CUPS.filter(isCupReady);
    const idx = selectedCup ? ready.findIndex((c) => c.id === selectedCup.id) : -1;
    const next = ready[idx + 1];
    if (!next) { setRaceAllMode(false); setScreen('start'); return; }
    navigateTo('game', () => setSelectedCup(next), true);
  };

  // Called when the final race of a cup ends. Clearing it (top 3 in that cup)
  // unlocks the next cup. In Race All, carry the cumulative totals into the next cup.
  const handleCupComplete = (clearedTop3: boolean, finalScores: Record<string, number>) => {
    if (clearedTop3 && selectedCup) markCupCleared(selectedCup.id);
    if (raceAllMode) setRaceAllScores(finalScores);
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
      setScreen(isEnvPickerEnabled() ? 'env_selection' : 'track_selection');
    } else {
      setScreen('cup_selection');
    }
  };

  const handleTrackSelectMode = () => {
    markOnboarded();
    setGameMode('single_race');
    setScreen('track_selection');
  };

  const handleTutorial = () => {
    markOnboarded();
    setShowHelp(false);
    navigateTo('tutorial', undefined, true);
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

  // Track picked → straight to pilots with a random environment, unless the
  // player opted into the full environment screen in Settings.
  const handleTrackSelect = (index: number) => {
    setSelectedTrackIndex(index);
    if (isEnvPickerEnabled()) {
      setScreen('env_selection');
    } else {
      setSelectedEnvConfig(null); // race rolls its own env, same as campaign
      setScreen('pilot_selection');
    }
  };

  const handleEnvSelect = (config: EnvironmentConfig) => {
    setSelectedEnvConfig(config);
    setScreen('pilot_selection');
  };

  const handleBackFromShipSelect = () => {
    setScreen('pilot_selection');
  };

  const handleGameExit = () => {
    setRaceAllMode(false);
    setScreen('start');
  };

  return (
    <div className="w-full h-screen bg-black text-white font-mono overflow-hidden relative">

      {/* BACKGROUND: nebula backdrop shared by every menu (see .screen-bg) */}
      <div className="screen-bg absolute inset-0 z-0 overflow-hidden"></div>

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
          {/* Live attract-mode race, dimmed so the menu stays readable. */}
          <AttractBackground className="z-0" />
          <div className="absolute inset-0 z-0 pointer-events-none menu-scrim" />

          <div className="relative z-10 flex flex-col items-center">
          <h1 className="menu-title mb-14" aria-label="Nebula Rush">
            <span className="menu-title-word menu-title-nebula" data-text="NEBULA">NEBULA</span>
            <span className="menu-title-word menu-title-rush" data-text="RUSH">RUSH</span>
          </h1>

          <div className="flex flex-col gap-4 w-[22rem] max-w-[86vw]">
            <AudioButton
              onClick={handleNewGame}
              className="menu-btn menu-btn-primary"
            >
              NEW CAMPAIGN
            </AudioButton>
            <AudioButton
              onClick={handleTutorial}
              className={`menu-btn menu-btn-indigo ${showTutorialPulse ? 'tutorial-pulse' : ''}`}
            >
              TUTORIAL
            </AudioButton>
            <AudioButton
              onClick={handleTrackSelectMode}
              className="menu-btn menu-btn-fuchsia"
            >
              SINGLE RACE
            </AudioButton>
            {/* Capture Studio (dev/vlog tool) — delinked from the menu; re-enable
                this button or call setScreen('capture') to reach it.
            <button
              onClick={() => setScreen('capture')}
              className="px-6 py-3 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded shadow-lg transform hover:scale-105 transition-all"
            >
              CAPTURE STUDIO
            </button>
            */}
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
            <div className="grid grid-cols-2 gap-4 mt-2">
              <AudioButton
                onClick={() => setShowHelp(true)}
                className="menu-btn menu-btn-ghost"
              >
                HELP
              </AudioButton>
              <AudioButton
                onClick={() => setShowSettings(true)}
                className="menu-btn menu-btn-ghost"
              >
                ⚙ SETTINGS
              </AudioButton>
            </div>
            {/* Physics Test (dev tool for A/B-ing pilot-stat physics mappings) —
                delinked from the menu; re-enable this button or call
                setScreen('physics_test') to reach it.
            <AudioButton
              onClick={() => setScreen('physics_test')}
              className="px-6 py-3 bg-gray-900 hover:bg-gray-800 text-yellow-500 font-bold rounded shadow-lg transform hover:scale-105 transition-all border border-yellow-900"
            >
              ⚗ PHYSICS TEST
            </AudioButton>
            */}
          </div>
          </div>

          <div className="absolute bottom-8 z-10 text-gray-400 text-sm">
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
            backLabel={gameMode === 'single_race' ? (isEnvPickerEnabled() ? 'BACK TO ENVIRONMENT' : 'BACK TO TRACKS') : 'BACK TO MENU'}
            onMainMenu={gameMode === 'single_race' ? () => setScreen('start') : undefined}
          />
        )
      }

      {/* SHIP SELECTION SCREEN */}
      {
        screen === 'selection' && (
          <div className="relative z-10 flex flex-col items-center h-full p-8">
            <div className="mb-6"><h2 className="screen-title">SELECT YOUR SHIP</h2><div className="screen-rule" /></div>

            <ShipCarousel
              ships={SHIP_CARDS.map(card => ({
                type: card.type,
                title: card.title,
                color: card.color,
                info: card.info,
                locked: !unlockedShips.includes(card.type),
                unlockHint: getUnlockHint('ship', card.type),
                stats: card.stats.map(st => ({ label: st.label, value: getDisplayStats(card.type)[st.key], barClass: st.barClass })),
              }))}
              initialType={signatureShip}
              recommendedType={signatureShip}
              pilotName={selectedPilot?.name}
              paused={customizeType !== null}
              onSelect={selectShipAndRace}
              onPaint={openShipCustomizer}
            />

            <div className="flex space-x-6 mt-8">
              <button
                onClick={() => { audioManager.playClick(); handleBackFromShipSelect(); }}
                onMouseEnter={() => audioManager.playHover()}
                className="menu-btn menu-btn-back"
              >
                BACK TO PILOT
              </button>
              <button
                onClick={() => { audioManager.playClick(); setScreen('start'); }}
                onMouseEnter={() => audioManager.playHover()}
                className="menu-btn menu-btn-back"
              >
                MAIN MENU
              </button>
            </div>
          </div>
        )
      }

      {/* CUP SELECTION SCREEN (campaign entry) */}
      {
        screen === 'cup_selection' && (
          <CupSelection onSelect={handleCupSelect} onRaceAll={handleRaceAll} onBack={() => setScreen('start')} />
        )
      }

      {/* TRACK SELECTION SCREEN */}
      {
        screen === 'track_selection' && (
          <div className="relative z-10 flex flex-col items-center h-full p-8">
            <div className="mb-8"><h2 className="screen-title">SELECT TRACK</h2><div className="screen-rule" /></div>

            <div className="w-full max-w-6xl overflow-y-auto flex-1 min-h-0 p-4 scrollbar-hide space-y-10">
              {[
                // Single race shares the campaign's cup gating: a cup's tracks
                // open here once the cup itself is unlocked (previous cleared).
                ...CUPS.map((cup, i) => ({
                  id: cup.id, label: cup.name, sub: cup.theme, accent: cup.accent,
                  tracks: resolveCupTracks(cup),
                  locked: !isCupUnlocked(cup),
                  unlockHint: i > 0 ? `Clear the ${CUPS[i - 1].name} to unlock` : '',
                })),
                // Any track not yet assigned to a cup (work-in-progress tracks).
                { id: '_dev', label: 'In Development', sub: 'Unassigned', accent: 0x9ca3af, tracks: TRACKS.filter(t => !getCupForTrack(t.id)), locked: false, unlockHint: '' },
              ].filter(group => group.tracks.length > 0).map(group => (
                <div key={group.id}>
                  {/* Cup divider */}
                  <div className="flex items-center gap-4 mb-5">
                    <div className="h-0.5 flex-1 rounded" style={{ backgroundColor: numToCss(group.accent), opacity: 0.4 }} />
                    <div className="text-center px-2">
                      <div className="neon-card-title text-xl font-extrabold" style={{ color: numToCss(group.accent), opacity: group.locked ? 0.5 : 1 }}>{group.label}</div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500">{group.sub}</div>
                      {group.locked && (
                        <div className="text-xs font-bold text-amber-300 mt-1">🔒 {group.unlockHint}</div>
                      )}
                    </div>
                    <div className="h-0.5 flex-1 rounded" style={{ backgroundColor: numToCss(group.accent), opacity: 0.4 }} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {group.tracks.map((track, i) => {
                      const index = TRACKS.indexOf(track);
                      return group.locked ? (
                        <div
                          key={track.id}
                          className="neon-card neon-card-locked"
                        >
                          <div className="track-map" style={{ filter: 'grayscale(1) brightness(0.6)' }}>
                            <TrackPreview points={track.points} color="#64748b" />
                          </div>
                          <div className="px-5 py-4 flex items-center justify-between gap-3">
                            <h3 className="neon-card-title text-lg text-gray-500">{track.name}</h3>
                            <TrackStats track={track} />
                          </div>
                        </div>
                      ) : (
                        <div
                          key={track.id}
                          onClick={() => { audioManager.playClick(); handleTrackSelect(index); }}
                          onMouseEnter={() => audioManager.playHover()}
                          className="neon-card neon-card-live group"
                          style={{ '--card-accent': numToCss(group.accent) } as React.CSSProperties}
                          title={track.description}
                        >
                          <div className="track-map">
                            <TrackPreview points={track.points} color={numToCss(group.accent)} />
                            <span className="card-tag">{String(i + 1).padStart(2, '0')}</span>
                          </div>
                          <div className="px-5 py-4 flex items-center justify-between gap-3">
                            <h3 className="neon-card-title text-lg text-white">{track.name}</h3>
                            <TrackStats track={track} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex space-x-6 mt-8">
              <button
                onClick={() => { audioManager.playClick(); setScreen('start'); }}
                onMouseEnter={() => audioManager.playHover()}
                className="menu-btn menu-btn-back"
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

      {/* ENVIRONMENT SELECTION SCREEN (opt-in via Settings; off by default) */}
      {
        screen === 'env_selection' && (
          <EnvironmentSelection
            onSelect={handleEnvSelect}
            onBack={() => setScreen('track_selection')}
            onMainMenu={() => setScreen('start')}
            isSpaceTrack={!!getCupForTrack(TRACKS[selectedTrackIndex]?.id ?? '')?.envBias?.space}
            isStormTrack={!!TRACKS[selectedTrackIndex]?.wind}
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
            // Remount on cup change (Race All) so the next cup starts at track 0
            // with a fresh roster; per-track in single race.
            key={gameMode === 'campaign' ? `cup-${selectedCup?.id ?? 'none'}` : `single-${selectedTrackIndex}`}
            // Apply Pilot Modifiers to Ship Config
            shipConfig={selectedShipConfig}
            initialTrackIndex={selectedTrackIndex}
            isCampaign={gameMode === 'campaign'}
            trackList={gameMode === 'campaign' && selectedCup ? resolveCupTracks(selectedCup) : undefined}
            // Theme dressing: the cup's bias in campaign, or the selected track's
            // own cup's bias in single race — so Select Track shows it too.
            envBias={gameMode === 'campaign'
              ? selectedCup?.envBias
              : getCupForTrack(TRACKS[selectedTrackIndex]?.id ?? '')?.envBias}
            onCupComplete={handleCupComplete}
            // Race All: offer "Next Cup" on the final results while ready cups remain.
            onNextCup={
              raceAllMode && selectedCup &&
              CUPS.filter(isCupReady).findIndex((c) => c.id === selectedCup.id) < CUPS.filter(isCupReady).length - 1
                ? handleNextCup
                : undefined
            }
            // Race All: same rivals + carried scores across cups, so standings aggregate.
            initialRoster={raceAllMode ? (raceAllRoster ?? undefined) : undefined}
            initialScores={raceAllMode ? raceAllScores : undefined}
            // Single race uses the player's env pick; campaign always rolls a fresh
            // random env per track (never inherits the last single-race selection).
            forcedEnvironment={gameMode === 'single_race' ? (selectedEnvConfig || undefined) : undefined}
            pilot={selectedPilot}
            onExit={handleGameExit}
            onTutorial={handleTutorial}
            onReady={() => setIsLoading(false)}
          />
        )
      }

      {/* TUTORIAL (guided first race: simple loop, no opponents) */}
      {
        screen === 'tutorial' && (
          <Game
            tutorial
            trackOverride={TUTORIAL_TRACK}
            opponentCount={0}
            isCampaign={false}
            shipConfig={{ color: 0xd9531e, accentColor: 0xeeeeee, ...SHIP_STATS.lancer, type: 'lancer' }}
            forcedEnvironment={{ timeOfDay: 'day', weather: 'clear' }}
            onExit={() => setScreen('start')}
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

      {/* PHYSICS TEST (dev tool: A/B pilot-stat mappings by driving them) */}
      {
        screen === 'physics_test' && (
          <PhysicsTest onBack={() => setScreen('start')} />
        )
      }

      {/* CAPTURE STUDIO (dev / vlog image capture) */}
      {
        screen === 'capture' && (
          <CaptureStudio onBack={() => setScreen('start')} />
        )
      }

      {/* HELP MODAL */}
      {
        showHelp && (
          <div className="neon-modal-backdrop absolute inset-0 z-50 flex items-center justify-center">
            <div className="neon-modal p-8 max-w-lg w-full max-h-[85vh] overflow-y-auto">
              <h2 className="screen-title mb-6">HOW TO PLAY</h2>

              <div className="space-y-5 text-gray-300">
                <div>
                  <strong className="neon-label text-cyan-400 block mb-2">Controls</strong>
                  <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                    <span className="text-white font-mono">W&nbsp;/&nbsp;↑</span><span>Accelerate</span>
                    <span className="text-white font-mono">Q&nbsp;/&nbsp;E&nbsp;·&nbsp;←&nbsp;/&nbsp;→</span><span>Steer left / right</span>
                    <span className="text-white font-mono">A&nbsp;/&nbsp;D</span><span>Strafe (side thrust)</span>
                    <span className="text-white font-mono">B</span><span>Brake</span>
                    <span className="text-white font-mono">P</span><span>Screenshot</span>
                    <span className="text-white font-mono">H</span><span>Toggle HUD</span>
                  </div>
                </div>

                <div>
                  <strong className="neon-label text-purple-400 block mb-2">Tips</strong>
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    <li>Launch the instant the start lights turn <span className="text-green-400">green</span>.</li>
                    <li>Drive through the glowing <span className="text-cyan-300">boost arrows</span> for a speed burst.</li>
                    <li>Tap <span className="text-white">A / D</span> to strafe — slide sideways without turning.</li>
                    <li>Keep off the walls — scraping kills your momentum.</li>
                    <li>Dodge the <span className="text-red-400">red obstacle blocks</span> and <span className="text-red-300">slick patches</span> — both bleed your speed.</li>
                  </ul>
                </div>

                <div>
                  <strong className="neon-label text-yellow-400 block mb-2">Goal</strong>
                  <p className="text-sm">Finish 5 laps and beat the rival pilots to top the leaderboard.</p>
                </div>

                <div className="pt-4 border-t border-white/10 text-xs text-gray-500">
                  <p>© 2026 Edward Thomson (<a href="https://octonion.io" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-white underline">Octonion Software</a>)</p>
                  <p>Website: <a href="https://edthomson.com" className="text-blue-400 hover:underline">edthomson.com</a></p>
                </div>
              </div>

              <button
                onClick={handleTutorial}
                className="menu-btn menu-btn-indigo mt-8 w-full uppercase"
              >
                ▶ Start the interactive tutorial
              </button>
              <button
                onClick={() => setShowHelp(false)}
                className="menu-btn menu-btn-back mt-3 w-full"
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
        <div className="neon-modal-backdrop absolute inset-0 z-50 flex items-center justify-center p-4">
          <div className="neon-modal p-8 max-w-lg w-full">
            <h2 className="screen-title mb-2">CUSTOMIZE PAINT</h2>
            <p className="screen-subtitle mb-4">{customizeType} — drag to rotate</p>

            <div className="h-64 bg-black bg-opacity-50 rounded mb-6 flex items-center justify-center overflow-hidden border border-gray-700">
              <ShipPreview color={primaryColor} accentColor={accentColor} type={customizeType} interactive />
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <div className="neon-label text-gray-300 mb-2">Primary (Body)</div>
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
                <div className="neon-label text-gray-300 mb-2">Secondary (Wings / Trim)</div>
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
                className="menu-btn menu-btn-back flex-1 min-w-0"
              >
                CANCEL
              </AudioButton>
              <AudioButton
                onClick={confirmShipCustomization}
                className="menu-btn menu-btn-primary flex-1"
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

// Track card stats: boost pads and hazards counted from the track data.
function TrackStats({ track }: { track: TrackConfig }) {
  const hazards = track.hazards?.length ?? 0;
  return (
    <div className="track-stats">
      <span className="track-stat track-stat-boost" title={`${track.pads.length} boost pad${track.pads.length === 1 ? '' : 's'}`}>
        {track.pads.length}<span className="stat-label">{track.pads.length === 1 ? 'BOOST' : 'BOOSTS'}</span>
      </span>
      <span className={`track-stat ${hazards ? 'track-stat-hazard' : 'text-gray-500'}`} title={`${hazards} hazard${hazards === 1 ? '' : 's'}`}>
        {hazards}<span className="stat-label">{hazards === 1 ? 'HAZARD' : 'HAZARDS'}</span>
      </span>
    </div>
  );
}

export default App
