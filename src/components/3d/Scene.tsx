import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Environment } from '@react-three/drei'
import * as THREE from 'three'

function FlyingStars({ count = 1000, speed = 5, size = 0.1, color = "#cbd5e1" }) {
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
                    args={[positions, 3]}
                />
            </bufferGeometry>
            {/* Additive blending makes the overlapping particles "glow" */}
            <pointsMaterial
                size={size}
                color={color}
                transparent
                opacity={0.8}
                sizeAttenuation
                blending={THREE.AdditiveBlending}
                depthWrite={false}
            />
        </points>
    )
}

export function Scene() {
    return (
        <div className="fixed inset-0 -z-10 bg-slate-950 pointer-events-none">
            <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
                {/* Slightly darker base color to make the additive stars pop more */}
                <color attach="background" args={['#020617']} />

                <ambientLight intensity={0.2} />

                {/* Layered flying stars for depth and forward movement effect */}

                {/* Far background layer - small, slow, light grayish */}
                <FlyingStars count={1200} speed={0.5} size={0.04} color="#64748b" />

                {/* Mid layer - medium speed, slightly warmer gray */}
                <FlyingStars count={600} speed={1.2} size={0.07} color="#94a3b8" />

                {/* Foreground layer - fast, large, pale yellow/white */}
                <FlyingStars count={300} speed={2} size={0.12} color="#fef3c7" />

                {/* Brightest/closest "hero" stars - very fast, prominent yellow */}
                <FlyingStars count={100} speed={4} size={0.18} color="#fde047" />

                <Environment preset="city" />
            </Canvas>
        </div>
    )
}
