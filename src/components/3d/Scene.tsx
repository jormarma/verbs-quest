import { Canvas } from '@react-three/fiber'
import { Environment, Float, Sparkles } from '@react-three/drei'

export function Scene() {
    return (
        <div className="fixed inset-0 -z-10 bg-slate-900 pointer-events-none">
            <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
                <color attach="background" args={['#0f172a']} />

                <ambientLight intensity={0.5} />
                <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} />

                {/* Kid-friendly floating shapes */}
                <Float speed={1.2} rotationIntensity={2} floatIntensity={1.2}>
                    <mesh position={[-2.5, 1.5, -2]}>
                        <torusGeometry args={[0.5, 0.2, 16, 32]} />
                        <meshStandardMaterial color="#f59e0b" roughness={0.4} metalness={0.1} />
                    </mesh>
                </Float>

                <Float speed={2} rotationIntensity={0.5} floatIntensity={1.5}>
                    <mesh position={[2.5, -1, -2]}>
                        <sphereGeometry args={[0.6, 32, 32]} />
                        <meshStandardMaterial color="#f43f5e" roughness={0.2} metalness={0.2} />
                    </mesh>
                </Float>

                <Float speed={1.5} rotationIntensity={1} floatIntensity={2}>
                    <mesh position={[-3, -1.5, -3]}>
                        <dodecahedronGeometry args={[0.8]} />
                        <meshStandardMaterial color="#10b981" roughness={0.3} metalness={0.1} />
                    </mesh>
                </Float>

                <Float speed={1.8} rotationIntensity={1.5} floatIntensity={2}>
                    <mesh position={[2, 2, -3]}>
                        <icosahedronGeometry args={[0.9]} />
                        <meshStandardMaterial color="#8b5cf6" roughness={0.3} metalness={0.2} />
                    </mesh>
                </Float>

                <directionalLight position={[-5, 5, 5]} intensity={0.5} color="#ffffff" />

                <Sparkles count={100} scale={12} size={2} speed={0.4} opacity={0.3} color="#60a5fa" />

                <Environment preset="city" />
            </Canvas>
        </div>
    )
}
