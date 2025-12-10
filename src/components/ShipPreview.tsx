import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { createShip, type ShipType } from '../game/ShipFactory';

interface ShipPreviewProps {
    color: number;
    type: ShipType;
}

export default function ShipPreview({ color, type }: ShipPreviewProps) {
    const mountRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const frameIdRef = useRef<number>(0);

    useEffect(() => {
        if (!mountRef.current) return;

        // 1. Scene Setup
        const scene = new THREE.Scene();
        sceneRef.current = scene;

        // Camera
        // FOV 45, Aspect varies, Near 0.1, Far 100
        const camera = new THREE.PerspectiveCamera(45, mountRef.current.clientWidth / mountRef.current.clientHeight, 0.1, 100);
        camera.position.set(5, 4, 8); // Offset view
        camera.lookAt(0, 0, 0);

        // Renderer
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        mountRef.current.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(5, 10, 5);
        scene.add(dirLight);

        // Ship Mesh
        const { mesh } = createShip(color, type);
        scene.add(mesh);

        // Center the ship visually (factory might offset it)
        mesh.position.set(0, -0.5, 0);

        // Animation Loop
        const animate = () => {
            if (!rendererRef.current) return;

            // Rotate
            mesh.rotation.y += 0.01;
            // Wobble
            mesh.rotation.z = Math.sin(Date.now() * 0.002) * 0.05;

            renderer.render(scene, camera);
            frameIdRef.current = requestAnimationFrame(animate);
        };
        animate();

        // Handle Resize
        const handleResize = () => {
            if (!mountRef.current || !renderer) return;
            const width = mountRef.current.clientWidth;
            const height = mountRef.current.clientHeight;
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            renderer.setSize(width, height);
        };
        window.addEventListener('resize', handleResize);

        // Cleanup
        return () => {
            cancelAnimationFrame(frameIdRef.current);
            window.removeEventListener('resize', handleResize);
            if (mountRef.current && renderer.domElement) {
                mountRef.current.removeChild(renderer.domElement);
            }
            renderer.dispose();
            // Optional: Dispose geometries/materials if strictly needed, mostly okay for small preview
        };
    }, [color]);

    return (
        <div ref={mountRef} className="w-full h-full" />
    );
}
