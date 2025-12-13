import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createTrackCurve, createTrackMesh, getTrackFrame, createBoostPadMeshes, createStartLineMesh, createTrafficLightMesh } from '../game/TrackFactory';
import { InputManager } from '../game/InputManager';
import { Ship, type ShipConfig } from '../game/Ship';
import { OpponentManager, type OpponentConfig } from '../game/OpponentManager';
import { Leaderboard, type RaceResult } from './Leaderboard';
import { TRACKS } from '../game/TrackDefinitions';

interface GameProps {
  shipConfig: ShipConfig;
  initialTrackIndex?: number;
  isCampaign?: boolean;
  onExit?: () => void;
}

const POINTS_TABLE = [100, 93, 87, 82, 78, 75, 72, 69, 66, 63, 60, 58, 56, 54, 52, 50, 48, 46, 44, 42];

type RaceState = 'intro' | 'racing' | 'finished' | 'results';

export default function Game({ shipConfig, initialTrackIndex = 0, isCampaign = true, onExit }: GameProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  const [currentTrackIndex, setCurrentTrackIndex] = useState(initialTrackIndex);
  const currentTrack = TRACKS[currentTrackIndex];

  // Campaign State
  // Initialize roster once using a ref or state that doesn't reset on track change
  // Actually, we want it to persist across the entire session.
  const [roster] = useState<OpponentConfig[]>(() => OpponentManager.generateRoster(19));
  const [campaignScores, setCampaignScores] = useState<Record<string, number>>({});

  const [speed, setSpeed] = useState(0);
  const [lap, setLap] = useState(0); // Lap 0 = Before Start Line
  const [rank, setRank] = useState(1);
  const [hudVisible, setHudVisible] = useState(true);

  const [raceState, setRaceState] = useState<RaceState>('intro');
  const [countdown, setCountdown] = useState(5);
  const [debugInfo, setDebugInfo] = useState({ trackProgress: 0, lateralPosition: 0, verticalPosition: 0 });

  // Results State
  const [raceResults, setRaceResults] = useState<RaceResult[]>([]);

  const minimapRef = useRef<HTMLDivElement>(null);

  const raceStartedRef = useRef(false);
  const raceFinishedRef = useRef(false); // Player finished
  const allFinishedRef = useRef(false); // All ships finished

  const countdownRef = useRef(5);
  const countdownStartTime = useRef(0); // Will be set on mount
  const trafficLightRef = useRef<THREE.Group | null>(null);

  // Lap Timer State
  const [currentLapTime, setCurrentLapTime] = useState(0);
  const [lastLapTime, setLastLapTime] = useState(0); // Player's last lap
  const lapStartTime = useRef(Date.now());
  const raceStartTime = useRef(0);

  // Format time helper (MM:SS.ms)
  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = Math.floor((ms % 1000) / 10); // 2 digits
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
  };

  // Store the player ship instance
  const playerShip = useRef<Ship | null>(null);
  const opponentManager = useRef<OpponentManager | null>(null);

  const screenshotRequested = useRef<boolean>(false);

  const handleScreenshot = () => {
    screenshotRequested.current = true;
  };

  const restartRace = () => {
    // Ideally reload page or reset state
    window.location.reload();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'p' || e.key === 'P') {
        handleScreenshot();
      }
      // CHEAT: Force Finish
      if (e.key === 'f' || e.key === 'F') {
        if (playerShip.current) {
          playerShip.current.lap = 6;
          playerShip.current.finished = true;
          playerShip.current.finishTime = Date.now();
        }
      }
      // CHEAT: Force Finish All Opponents
      if (e.key === 'g' || e.key === 'G') {
        if (opponentManager.current) {
          opponentManager.current.opponents.forEach(o => {
            o.lap = 6;
            o.finished = true;
            o.finishTime = Date.now() + Math.random() * 10000;
          });
        }
      }
      // Toggle HUD
      if (e.key === 'h' || e.key === 'H') {
        setHudVisible(v => !v);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;

    // Reset timer on mount
    lapStartTime.current = Date.now();

    // Scene setup
    if (mountRef.current) {
      while (mountRef.current.firstChild) {
        mountRef.current.removeChild(mountRef.current.firstChild);
      }
    }
    if (minimapRef.current) {
      while (minimapRef.current.firstChild) {
        minimapRef.current.removeChild(minimapRef.current.firstChild);
      }
    }

    let animationId: number;
    const scene = new THREE.Scene();
    const skyColor = 0x87CEEB; // Sky Blue
    scene.fog = new THREE.Fog(skyColor, 1000, 5000); // Massive fog distance
    scene.background = new THREE.Color(skyColor);

    const camera = new THREE.PerspectiveCamera(
      75,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      6000 // Massive far clipping plane
    );

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      logarithmicDepthBuffer: true,
      preserveDrawingBuffer: true // Required for screenshots
    });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    mountRef.current.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 3.0);
    scene.add(hemisphereLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 4.0);
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Initialize    // Create Player Ship
    playerShip.current = new Ship(scene, true, shipConfig);

    // Create track path using curve
    // Create Track
    const points = TRACKS[currentTrackIndex].points;
    const trackCurve = createTrackCurve(points);
    const trackLength = trackCurve.getLength();

    // Create track mesh (U-shaped half pipe)
    const track = createTrackMesh(trackCurve);
    scene.add(track);

    // Create Boost Pads
    const boostPads = createBoostPadMeshes(trackCurve, currentTrack.pads);
    boostPads.forEach(mesh => scene.add(mesh));

    // Create Traffic Light
    const trafficLight = createTrafficLightMesh();
    trafficLightRef.current = trafficLight;

    const startFrame = getTrackFrame(trackCurve, 0.95);
    // Align to track
    trafficLight.position.copy(startFrame.position);
    trafficLight.position.add(startFrame.normal.clone().multiplyScalar(100)); // 100 units up (was 25)
    trafficLight.position.add(startFrame.tangent.clone().multiplyScalar(40)); // 40 units ahead

    trafficLight.lookAt(startFrame.position.clone().add(startFrame.normal.clone().multiplyScalar(100)));
    scene.add(trafficLight);

    // Initial State Timing
    countdownStartTime.current = Date.now();
    raceStartedRef.current = false;
    countdownRef.current = 5;
    setCountdown(5);

    // Create Start Line
    const startLine = createStartLineMesh(trackCurve);
    scene.add(startLine);

    // Create minimap
    const minimapCanvas = document.createElement('canvas');
    minimapCanvas.width = 200;
    minimapCanvas.height = 200;
    const minimapCtx = minimapCanvas.getContext('2d');

    // Draw track on minimap
    const drawMinimap = () => {
      if (!minimapCtx) return { minX: 0, maxX: 0, minZ: 0, maxZ: 0, scale: 1 };

      minimapCtx.fillStyle = '#000033';
      minimapCtx.fillRect(0, 0, 200, 200);

      // Find track bounds
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i <= 100; i++) {
        const point = trackCurve.getPoint(i / 100);
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minZ = Math.min(minZ, point.z);
        maxZ = Math.max(maxZ, point.z);
      }

      const scaleX = 180 / (maxX - minX);
      const scaleZ = 180 / (maxZ - minZ);
      const scale = Math.min(scaleX, scaleZ);

      // Draw track path
      minimapCtx.strokeStyle = '#2244aa';
      minimapCtx.lineWidth = 3;
      minimapCtx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const point = trackCurve.getPoint(i / 200);
        const x = 100 + (point.x - (minX + maxX) / 2) * scale;
        const z = 100 + (point.z - (minZ + maxZ) / 2) * scale;
        if (i === 0) minimapCtx.moveTo(x, z);
        else minimapCtx.lineTo(x, z);
      }
      minimapCtx.stroke();

      // Draw start line
      const startPoint = trackCurve.getPoint(0);
      const startX = 100 + (startPoint.x - (minX + maxX) / 2) * scale;
      const startZ = 100 + (startPoint.z - (minZ + maxZ) / 2) * scale;
      minimapCtx.fillStyle = '#ffff00';
      minimapCtx.fillRect(startX - 3, startZ - 3, 6, 6);

      return { minX, maxX, minZ, maxZ, scale };
    };

    const minimapBounds = drawMinimap();
    if (minimapRef.current) {
      minimapRef.current.appendChild(minimapCanvas);
    }

    const updateMinimapShip = () => {
      if (!minimapCtx || !playerShip.current) return;

      const progress = playerShip.current.state.trackProgress;
      const point = trackCurve.getPoint(progress);
      const x = 100 + (point.x - (minimapBounds.minX + minimapBounds.maxX) / 2) * minimapBounds.scale;
      const z = 100 + (point.z - (minimapBounds.minZ + minimapBounds.maxZ) / 2) * minimapBounds.scale;

      // Redraw minimap
      drawMinimap();

      // Draw ship position
      minimapCtx.fillStyle = '#ff00ff';
      minimapCtx.beginPath();
      minimapCtx.arc(x, z, 4, 0, Math.PI * 2);
      minimapCtx.fill();
    };



    // Input handling
    const inputManager = new InputManager();

    // Opponent Manager
    // Always create a new manager because 'scene' is new on every mount/effect run.
    opponentManager.current = new OpponentManager(scene, trackCurve, roster);



    // Animation loop
    let lastTime = performance.now();

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      if (!playerShip.current) return;

      const now = performance.now();
      const deltaMs = now - lastTime;
      lastTime = now;

      // Calculate dt (delta time) relative to 60 FPS (16.67ms)
      const dt = Math.min(deltaMs / 16.67, 4.0);

      const currentState = playerShip.current.state;
      const currentNow = Date.now();

      // --- RACE START LOGIC ---
      if (!raceStartedRef.current) {
        playerShip.current.state.velocity.set(0, 0);
        playerShip.current.state.throttle = 0;

        // Update Countdown Timer
        const timeRemaining = Math.max(0, 5000 - (Date.now() - countdownStartTime.current));
        const seconds = Math.ceil(timeRemaining / 1000);

        if (seconds !== countdownRef.current) {
          countdownRef.current = seconds;
          setCountdown(seconds);

          // Traffic Light Visuals
          if (trafficLightRef.current) {
            // Reset all to grey
            trafficLightRef.current.children.forEach((child) => {
              if (child instanceof THREE.Mesh && child.name.startsWith('light_')) {
                // 0=Box, 1=Light5(Top), 2=Light4, 3=Light3, 4=Light2, 5=Light1(Bottom)
                if (child.material instanceof THREE.MeshBasicMaterial) {
                  child.material.color.setHex(0x222222);
                }
              }
            });

            // Light Logic:
            // 5 Seconds: Top Red On (Light 5)
            // 4 Seconds: Top 2 Red On (Light 5, 4)
            // ...
            // 1 Second: All 5 Red On
            // 0 Seconds: All GREEN

            // The children order depends on addition order. 
            // Box is 0. Light5 is 1. Light4 is 2... Light1 is 5.

            if (seconds > 0) {
              const lightsToTurnOn = 6 - seconds; // 5s->1, 4s->2, 3s->3, 2s->4, 1s->5
              for (let i = 1; i <= lightsToTurnOn; i++) {
                const child = trafficLightRef.current.children[i] as THREE.Mesh;
                if (child && child.material instanceof THREE.MeshBasicMaterial) {
                  child.material.color.setHex(0xff0000); // RED
                }
              }
            } else {
              // GO! Green!
              trafficLightRef.current.children.forEach((child) => {
                if (child instanceof THREE.Mesh && child.name.startsWith('light_') && child.material instanceof THREE.MeshBasicMaterial) {
                  child.material.color.setHex(0x00ff00); // GREEN
                }
              });
            }
          }
        }

        if (timeRemaining <= 0) {
          raceStartedRef.current = true;
          setRaceState('racing');
          lapStartTime.current = Date.now();
          raceStartTime.current = Date.now();

          // Fly Away Animation
          const light = trafficLightRef.current;
          if (light) {
            const flyAway = () => {
              if (!mountRef.current) return;
              light.position.y += 0.5;
              light.position.z -= 1.0;
              if (light.position.y < 100) {
                requestAnimationFrame(flyAway);
              } else {
                light.visible = false;
              }
            };
            flyAway();
          }
        }
      }

      // --- PLAYER UPDATE ---
      // If player finished, they can still move? Or auto-pilot?
      // For now, let them drive but ignoring laps.
      playerShip.current.update(dt, inputManager, trackLength, currentTrack.pads, (msg: any) => {
        if (msg === "INCREMENT") {
          setLap(l => l + 1);
          // Record Lap Time
          if (raceStartedRef.current && !raceFinishedRef.current) {
            setLastLapTime(currentNow - lapStartTime.current);
            lapStartTime.current = currentNow;
          }
        } else if (typeof msg === 'number') {
          setLap(msg);
        }

        // Check for Player Finish
        if (!raceFinishedRef.current && playerShip.current?.finished) {
          raceFinishedRef.current = true;
          setRaceState('finished');
        }

      }, raceStartedRef.current);

      if (!raceFinishedRef.current) {
        setCurrentLapTime(currentNow - lapStartTime.current);
      }

      // --- OPPONENT UPDATE ---
      if (opponentManager.current) {
        if (raceStartedRef.current) {
          opponentManager.current.update(dt, trackLength, currentTrack.pads, raceStartedRef.current);
        }
      }

      // --- RANKING & FINISH LOGIC ---
      if (playerShip.current && opponentManager.current) {
        const allShips = [playerShip.current, ...opponentManager.current.opponents];

        // Sorting Logic:
        // 1. Finished ships first (sorted by finishTime ASC)
        // 2. Unfinished ships second(sorted by totalProgress DESC)

        allShips.sort((a, b) => {
          if (a.finished && b.finished) {
            return a.finishTime - b.finishTime;
          }
          if (a.finished) return -1; // a comes first
          if (b.finished) return 1;  // b comes first

          return b.getTotalProgress() - a.getTotalProgress();
        });

        // Update Rank Display
        const playerRank = allShips.findIndex(s => s === playerShip.current) + 1;
        setRank(playerRank);

        // Check if EVERYONE is finished
        // Optimization: allShips[totalShips-1].finished is enough check if sorted correctly?
        // Safe check:
        const allDone = allShips.every(s => s.finished);

        if (allDone && !allFinishedRef.current) {
          allFinishedRef.current = true;
          setRaceState('results');

          // GENERATE RESULTS
          const results: RaceResult[] = allShips.map((ship, index) => {
            const rank = index + 1;
            const points = POINTS_TABLE[rank - 1] || 0;

            // Calculate Time from RaceStart
            // finishTime is timestamp.
            const totalTime = ship.finishTime - raceStartTime.current;

            // Current Campaign Total (before this race)
            const currentTotal = campaignScores[ship.id] || 0;
            const newTotal = currentTotal + points;

            return {
              rank: rank,
              name: ship.name,
              isPlayer: ship.isPlayer,
              timeStr: formatTime(totalTime),
              points: points,
              totalPoints: newTotal
            };
          });

          // Update Campaign Scores Logic
          const updatedScores: Record<string, number> = { ...campaignScores };

          results.forEach((r, i) => {
            const ship = allShips[i]; // Determined by sort order, same as map above
            updatedScores[ship.id] = (updatedScores[ship.id] || 0) + r.points;
          });

          setCampaignScores(updatedScores);
          setRaceResults(results);
        }
      }

      // --- MESH UPDATE ---
      const { position: trackPos, tangent, normal, binormal: trackBinormal } = getTrackFrame(trackCurve, currentState.trackProgress);

      playerShip.current.updateMesh(trackCurve);

      // --- Camera Update ---
      const cameraFollowRatio = 0.0;
      const effectiveVerticalPos = currentState.verticalPosition * cameraFollowRatio;
      const visualLateralPos = currentState.cameraLateral;

      const shipForward = tangent.clone().applyAxisAngle(normal, currentState.yaw).normalize();
      const cameraDist = 12;
      const cameraHeightBase = 5;

      const targetCameraPos = trackPos.clone()
        .add(trackBinormal.clone().multiplyScalar(visualLateralPos))
        .add(normal.clone().multiplyScalar(effectiveVerticalPos + cameraHeightBase))
        .add(shipForward.clone().multiplyScalar(-cameraDist));

      if (!isNaN(targetCameraPos.x) && !isNaN(targetCameraPos.y) && !isNaN(targetCameraPos.z)) {
        // Lock camera rigidly to ship at high speeds to prevent "Ghosting" / Temporal Aliasing.
        // If the ship moves 100 pixels/frame across the screen, it appears as double vision.
        // By locking the camera, the ship is static on screen, and the world moves.
        camera.position.copy(targetCameraPos);

        // Old Smooth Follow (caused ghosting at >600km/h)
        // camera.position.lerp(targetCameraPos, 0.8);

        const lookAtTarget = playerShip.current.mesh.position.clone().add(shipForward.clone().multiplyScalar(20));
        camera.lookAt(lookAtTarget);
        camera.up.copy(normal);
      } else {
        camera.position.copy(trackPos.clone().add(normal.multiplyScalar(5)));
      }

      setSpeed(Math.round(currentState.velocity.y * 10));
      setDebugInfo({
        trackProgress: Math.round(currentState.trackProgress * 1000) / 10,
        lateralPosition: Math.round(currentState.lateralPosition * 10) / 10,
        verticalPosition: Math.round(currentState.verticalPosition * 10) / 10
      });

      directionalLight.position.copy(playerShip.current.mesh.position).add(new THREE.Vector3(10, 20, 10));
      directionalLight.target = playerShip.current.mesh;

      updateMinimapShip();
      renderer.render(scene, camera);

      if (screenshotRequested.current) {
        screenshotRequested.current = false;

        if (mountRef.current) {
          const glDataURL = renderer.domElement.toDataURL('image/png');
          const link = document.createElement('a');
          link.download = `nebula_rush_screenshot_${Date.now()}.png`;
          link.href = glDataURL;
          link.click();
        }
      }
    };

    animate();

    const handleResize = () => {
      if (!mountRef.current) return;
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      inputManager.cleanup();
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);

      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach(m => m.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
      renderer.dispose();

      if (mountRef.current && mountRef.current.contains(renderer.domElement)) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, [currentTrackIndex]);

  const handleNextRace = () => {
    if (currentTrackIndex < TRACKS.length - 1) {
      // Reset State
      setSpeed(0);
      setLap(0);
      setRank(1);
      setHudVisible(true);
      setRaceState('intro');
      setCountdown(5);
      setRaceResults([]);
      raceStartedRef.current = false;
      raceFinishedRef.current = false;
      allFinishedRef.current = false;

      setCurrentTrackIndex(prev => prev + 1);
    }
  };

  return (
    <div className="w-full h-screen bg-black relative overflow-hidden">
      <div ref={mountRef} className="w-full h-full" />

      {/* UI Overlay Container for Screenshots */}
      <div className="absolute inset-0 pointer-events-none">

        {/* HUD - Hide on Results or Toggle */}
        {raceState !== 'results' && hudVisible && (
          // Use style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} instead of bg-black bg-opacity-50 (which might use oklch in TW4)
          <div className="absolute top-4 left-4 font-mono z-10 p-4 rounded pointer-events-auto" style={{ backgroundColor: 'rgba(0,0,0,0.5)', color: '#ffffff' }}>
            <div className="text-4xl font-bold mb-2" style={{ color: '#22d3ee' }}>{speed} km/h</div>
            <div className="text-xl">LAP: {Math.min(lap, 5)} / 5</div>
            <div className="text-xl" style={{ color: '#facc15' }}>TIME: {formatTime(currentLapTime)}</div>
            {lastLapTime > 0 && <div className="text-lg" style={{ color: '#4ade80' }}>LAST: {formatTime(lastLapTime)}</div>}
            <div className="text-xl mt-2" style={{ color: '#c084fc' }}>RANK: {rank} / {opponentManager.current ? opponentManager.current.opponents.length + 1 : 20}</div>
            <div className="text-sm mt-4 border-t border-gray-600 pt-2">
              <div>↑/W: Accelerate</div>
              <div>←/→ or Q/E: Steer</div>
              <div>A/D: Side Thrusters</div>
              <div>SPACE/↓/S: Jump</div>
              <div className="mt-2 cursor-pointer hover:text-white" style={{ color: '#22d3ee' }} onClick={() => handleScreenshot()}>[P] Screenshot</div>
            </div>

            {/* DEBUG: Track Info */}
            <div className="mt-4 text-gray-400 text-xs">
              TRACK: {currentTrack.name}
            </div>
          </div>
        )}

        {/* Waiting Overlay */}
        {raceState === 'finished' && (
          <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-40">
            <div className="text-white px-8 py-4 rounded-lg border animate-pulse" style={{ backgroundColor: 'rgba(0,0,0,0.8)', borderColor: '#eab308' }}>
              <div className="text-3xl font-bold text-center" style={{ color: '#eab308' }}>FINISHED!</div>
              <div className="text-xl text-center mt-2">Waiting for opponents...</div>
              <div className="text-4xl font-bold text-center mt-2" style={{ color: '#22d3ee' }}>Rank: {rank}</div>
            </div>
          </div>
        )}

        {/* Leaderboard Overlay */}
        {raceState === 'results' && (
          <div className="pointer-events-auto">
            <Leaderboard
              results={raceResults}
              onRestart={restartRace}
              onNextRace={
                isCampaign && currentTrackIndex < TRACKS.length - 1
                  ? handleNextRace
                  : undefined
              }
              onExit={onExit}
              isCampaign={isCampaign}
            />
          </div>
        )}

        {/* Countdown Overlay (Only shows if > 0 and not started) */}
        {!raceStartedRef.current && countdown > 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-40">
            <div className="text-9xl font-bold animate-pulse drop-shadow-lg" style={{ color: '#ef4444' }}>
              {countdown}
            </div>
          </div>
        )}
        {!raceStartedRef.current && countdown === 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-40">
            <div className="text-9xl font-bold animate-pulse drop-shadow-lg" style={{ color: '#22c55e' }}>
              GO!
            </div>
          </div>
        )}

        {/* Debug Info & Minimap - Hide on results */}
        {raceState !== 'results' && (
          <>
            <div className="absolute top-4 right-4 text-white font-mono text-xs p-2 rounded z-10" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
              <div>Track Progress: {
                (lap === 0 && debugInfo.trackProgress > 50)
                  ? (debugInfo.trackProgress - 100).toFixed(1)
                  : debugInfo.trackProgress.toFixed(1)
              }%</div>
              <div>Position: ({debugInfo.lateralPosition.toFixed(1)}, {debugInfo.verticalPosition.toFixed(1)})</div>
            </div>
            <div className="absolute bottom-4 right-4 p-2 rounded z-10" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
              <div className="text-white text-xs mb-1">MINIMAP</div>
              <div ref={minimapRef} className="border-2" style={{ borderColor: '#22d3ee' }}></div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
