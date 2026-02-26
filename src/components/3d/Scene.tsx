import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment, Float, Sparkles } from '@react-three/drei'
import * as THREE from 'three'

function FlyingStars({ count = 1000, speed = 5, size = 0.1, color = "#cbd5e1", opacity = 0.6 }) {
    const pointsRef = useRef<THREE.Points>(null)

    const positions = useMemo(() => {
        const pos = new Float32Array(count * 3)
        for (let i = 0; i < count; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 40
            pos[i * 3 + 1] = (Math.random() - 0.5) * 40
            pos[i * 3 + 2] = (Math.random() - 0.5) * 40
        }
        return pos
    }, [count])

    useFrame((_, delta) => {
        if (!pointsRef.current) return
        const posAttr = pointsRef.current.geometry.attributes.position
        const array = posAttr.array as Float32Array
        for (let i = 0; i < count; i++) {
            array[i * 3 + 2] += delta * speed
            if (array[i * 3 + 2] > 5) {
                array[i * 3 + 2] = -35
            }
        }
        posAttr.needsUpdate = true
    })

    return (
        <points ref={pointsRef}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    count={count}
                    array={positions}
                    itemSize={3}
                />
            </bufferGeometry>
            <pointsMaterial size={size} color={color} transparent opacity={opacity} sizeAttenuation />
        </points>
    )
}

export function Scene() {
    return (
        <div className="fixed inset-0 -z-10 bg-slate-900 pointer-events-none blur-[2px] opacity-80">
            <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
                <color attach="background" args={['#0f172a']} />

                <ambientLight intensity={0.6} />
                <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={0.8} />

                {/* Kid-friendly floating shapes with washed-out, pastel colors */}
                <Float speed={1} rotationIntensity={1.5} floatIntensity={1}>
                    <mesh position={[-2.5, 1.5, -3]}>
                        <torusGeometry args={[0.5, 0.2, 16, 32]} />
                        <meshStandardMaterial color="#fde68a" roughness={0.6} metalness={0.1} /> {/* Washed Amber */}
                    </mesh>
                </Float>

                <Float speed={1.5} rotationIntensity={0.5} floatIntensity={1.2}>
                    <mesh position={[2.5, -1, -4]}>
                        <sphereGeometry args={[0.6, 32, 32]} />
                        <meshStandardMaterial color="#fbcfe8" roughness={0.6} metalness={0.1} /> {/* Washed Pink */}
                    </mesh>
                </Float>

                <Float speed={1.2} rotationIntensity={1} floatIntensity={1.5}>
                    <mesh position={[-3, -1.5, -5]}>
                        <dodecahedronGeometry args={[0.8]} />
                        <meshStandardMaterial color="#a7f3d0" roughness={0.6} metalness={0.1} /> {/* Washed Emerald */}
                    </mesh>
                </Float>

                <Float speed={1.4} rotationIntensity={1.2} floatIntensity={1.5}>
                    <mesh position={[2, 2, -5]}>
                        <icosahedronGeometry args={[0.9]} />
                        <meshStandardMaterial color="#ddd6fe" roughness={0.6} metalness={0.1} /> {/* Washed Violet */}
                    </mesh>
                </Float>

                <directionalLight position={[-5, 5, 5]} intensity={0.4} color="#ffffff" />

                {/* Flying Space Stars with varying brightness/sizes to simulate forward movement */}
                <FlyingStars count={800} speed={2} size={0.05} color="#94a3b8" opacity={0.4} />
                <FlyingStars count={400} speed={4} size={0.08} color="#cbd5e1" opacity={0.6} />
                <FlyingStars count={150} speed={8} size={0.12} color="#f8fafc" opacity={0.8} />

                {/* Sparse washed-out sparkles drifting */}
                <Sparkles count={50} scale={15} size={3} speed={0.4} opacity={0.3} color="#fef3c7" />
                <Sparkles count={50} scale={15} size={4} speed={0.5} opacity={0.3} color="#e0e7ff" />

                <Environment preset="city" />
            </Canvas>
        </div>
    )
}
