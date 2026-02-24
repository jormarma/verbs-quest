import { Canvas } from '@react-three/fiber'
import { Environment, Float, Sparkles } from '@react-three/drei'

export function Scene() {
    return (
        <div className="fixed inset-0 -z-10 bg-slate-900 pointer-events-none">
            <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
                <color attach="background" args={['#0f172a']} />

                <ambientLight intensity={0.5} />
                <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} />

                {/* Placeholder decorative background */}
                <Float
                    speed={1}
                    rotationIntensity={0.5}
                    floatIntensity={0.5}
                >
                    <mesh position={[0, 0, -2]}>
                        <octahedronGeometry args={[1.5, 0]} />
                        <meshStandardMaterial color="#3b82f6" wireframe opacity={0.2} transparent />
                    </mesh>
                </Float>

                <Sparkles count={100} scale={12} size={2} speed={0.4} opacity={0.3} color="#60a5fa" />

                <Environment preset="city" />
            </Canvas>
        </div>
    )
}
