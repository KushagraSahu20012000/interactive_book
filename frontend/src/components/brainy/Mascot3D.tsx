import { Suspense, useRef } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useUiSound } from "@/audio/UiSoundProvider";
import * as THREE from "three";

type RobotProps = {
  onSpin: () => void;
};

const Robot = ({ onSpin }: RobotProps) => {
  const group = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const headSpin = useRef<THREE.Group>(null);
  const leftEye = useRef<THREE.Group>(null);
  const rightEye = useRef<THREE.Group>(null);
  const leftBrow = useRef<THREE.Mesh>(null);
  const rightBrow = useRef<THREE.Mesh>(null);
  const leftArm = useRef<THREE.Group>(null);
  const rightArm = useRef<THREE.Group>(null);
  const antennaOrb = useRef<THREE.Mesh>(null);
  const glowDisc = useRef<THREE.Mesh>(null);
  const sparkleOrbit = useRef<THREE.Group>(null);
  const screenBarLeft = useRef<THREE.Mesh>(null);
  const screenBarCenter = useRef<THREE.Mesh>(null);
  const screenBarRight = useRef<THREE.Mesh>(null);
  const headSpinRemaining = useRef(0);
  const mascotPressStart = useRef<{ x: number; y: number } | null>(null);
  const mascotPressMoved = useRef(false);
  const { mouse } = useThree();

  const handleMascotPointerDown = (event: ThreeEvent<PointerEvent>) => {
    mascotPressStart.current = { x: event.clientX, y: event.clientY };
    mascotPressMoved.current = false;
  };

  const handleMascotPointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!mascotPressStart.current || mascotPressMoved.current) {
      return;
    }

    const offsetX = event.clientX - mascotPressStart.current.x;
    const offsetY = event.clientY - mascotPressStart.current.y;

    if (Math.hypot(offsetX, offsetY) > 8) {
      mascotPressMoved.current = true;
    }
  };

  const handleMascotPointerUp = (event: ThreeEvent<PointerEvent>) => {
    if (!mascotPressStart.current) {
      return;
    }

    if (!mascotPressMoved.current) {
      event.stopPropagation();
      headSpinRemaining.current += Math.PI * 2;
      onSpin();
    }

    mascotPressStart.current = null;
    mascotPressMoved.current = false;
  };

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    if (group.current) {
      group.current.position.y = Math.sin(t * 1.6) * 0.12;
      group.current.rotation.z = Math.sin(t * 0.8) * 0.04;
      group.current.rotation.y = THREE.MathUtils.lerp(
        group.current.rotation.y,
        mouse.x * 0.18 + Math.sin(t * 0.45) * 0.06,
        0.06,
      );
    }
    if (head.current) {
      head.current.rotation.y = THREE.MathUtils.lerp(head.current.rotation.y, mouse.x * 0.7, 0.08);
      head.current.rotation.x = THREE.MathUtils.lerp(head.current.rotation.x, -mouse.y * 0.45, 0.08);
    }
    if (headSpin.current) {
      if (headSpinRemaining.current > 0) {
        const spinStep = Math.min(headSpinRemaining.current, delta * 13);
        headSpin.current.rotation.y += spinStep;
        headSpinRemaining.current -= spinStep;
      } else {
        headSpin.current.rotation.y = 0;
      }
    }

    const blinkPhase = t % 4.5;
    const blinkTarget = blinkPhase > 3.95 ? 0.16 : 1;

    [leftEye.current, rightEye.current].forEach((eye, index) => {
      if (!eye) {
        return;
      }

      eye.position.x = (index === 0 ? -0.28 : 0.28) + mouse.x * 0.05;
      eye.position.y = 0.15 + mouse.y * 0.05;
      eye.scale.y = THREE.MathUtils.lerp(eye.scale.y, blinkTarget, 0.28);
    });

    if (leftBrow.current) {
      leftBrow.current.rotation.z = THREE.MathUtils.lerp(leftBrow.current.rotation.z, 0.08 + mouse.x * 0.08, 0.08);
      leftBrow.current.position.y = THREE.MathUtils.lerp(leftBrow.current.position.y, 0.46 - mouse.y * 0.03, 0.08);
    }

    if (rightBrow.current) {
      rightBrow.current.rotation.z = THREE.MathUtils.lerp(rightBrow.current.rotation.z, -0.08 + mouse.x * 0.08, 0.08);
      rightBrow.current.position.y = THREE.MathUtils.lerp(rightBrow.current.position.y, 0.46 - mouse.y * 0.03, 0.08);
    }

    if (leftArm.current) {
      leftArm.current.rotation.z = THREE.MathUtils.lerp(
        leftArm.current.rotation.z,
        -0.34 - Math.sin(t * 1.8) * 0.12,
        0.08,
      );
    }

    if (rightArm.current) {
      rightArm.current.rotation.z = THREE.MathUtils.lerp(
        rightArm.current.rotation.z,
        0.34 + Math.sin(t * 1.8) * 0.12,
        0.08,
      );
    }

    if (antennaOrb.current) {
      const pulse = 0.92 + (Math.sin(t * 3.4) + 1) * 0.12;
      antennaOrb.current.scale.setScalar(pulse);
    }

    if (glowDisc.current) {
      const glowScale = 1 + Math.sin(t * 1.4) * 0.04;
      glowDisc.current.scale.set(glowScale, glowScale, glowScale);
    }

    if (sparkleOrbit.current) {
      sparkleOrbit.current.rotation.z = t * 0.65;
      sparkleOrbit.current.rotation.y = t * 0.4;
      sparkleOrbit.current.position.x = THREE.MathUtils.lerp(sparkleOrbit.current.position.x, mouse.x * 0.16, 0.06);
      sparkleOrbit.current.position.y = THREE.MathUtils.lerp(sparkleOrbit.current.position.y, 1.02 + mouse.y * 0.12, 0.06);
    }

    [screenBarLeft.current, screenBarCenter.current, screenBarRight.current].forEach((bar, index) => {
      if (!bar) {
        return;
      }

      const scaleY = 0.75 + Math.sin(t * 3.1 + index * 0.8) * 0.22;
      bar.scale.y = Math.max(0.45, scaleY);
    });
  });

  return (
    <group
      ref={group}
      onPointerDown={handleMascotPointerDown}
      onPointerMove={handleMascotPointerMove}
      onPointerUp={handleMascotPointerUp}
    >
      <mesh position={[0, 0.28, -0.42]} ref={glowDisc}>
        <circleGeometry args={[1.18, 40]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.12} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.28, 0]}>
        <circleGeometry args={[1.5, 32]} />
        <meshBasicMaterial color="#7ea829" transparent opacity={0.24} />
      </mesh>

      {/* Body */}
      <mesh position={[0, -0.9, 0]} castShadow>
        <boxGeometry args={[1.4, 1.3, 1.1]} />
        <meshStandardMaterial color="#ff3d8a" roughness={0.35} metalness={0.12} emissive="#9b1d57" emissiveIntensity={0.18} />
      </mesh>
      {/* Belly screen */}
      <mesh position={[0, -0.85, 0.56]}>
        <boxGeometry args={[0.78, 0.58, 0.08]} />
        <meshStandardMaterial color="#111827" roughness={0.35} emissive="#152338" emissiveIntensity={0.6} />
      </mesh>
      <mesh ref={screenBarLeft} position={[-0.18, -0.84, 0.62]}>
        <boxGeometry args={[0.1, 0.24, 0.04]} />
        <meshStandardMaterial color="#ffe24a" emissive="#ffe24a" emissiveIntensity={0.8} />
      </mesh>
      <mesh ref={screenBarCenter} position={[0, -0.84, 0.62]}>
        <boxGeometry args={[0.1, 0.32, 0.04]} />
        <meshStandardMaterial color="#5cc4ff" emissive="#5cc4ff" emissiveIntensity={0.9} />
      </mesh>
      <mesh ref={screenBarRight} position={[0.18, -0.84, 0.62]}>
        <boxGeometry args={[0.1, 0.2, 0.04]} />
        <meshStandardMaterial color="#a3e635" emissive="#a3e635" emissiveIntensity={0.8} />
      </mesh>
      {/* Arms */}
      <group ref={leftArm} position={[-0.82, -0.35, 0]} rotation={[0, 0, 0.2]}>
        <mesh position={[-0.18, -0.5, 0]}>
          <boxGeometry args={[0.35, 1, 0.35]} />
          <meshStandardMaterial color="#5cc4ff" metalness={0.1} roughness={0.4} />
        </mesh>
        <mesh position={[-0.33, -1.1, 0]}>
          <sphereGeometry args={[0.22, 16, 16]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      </group>
      <group ref={rightArm} position={[0.82, -0.35, 0]} rotation={[0, 0, -0.2]}>
        <mesh position={[0.18, -0.5, 0]}>
          <boxGeometry args={[0.35, 1, 0.35]} />
          <meshStandardMaterial color="#5cc4ff" metalness={0.1} roughness={0.4} />
        </mesh>
        <mesh position={[0.33, -1.1, 0]}>
          <sphereGeometry args={[0.22, 16, 16]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      </group>
      <mesh position={[-0.7, -0.35, 0.3]}>
        <sphereGeometry args={[0.14, 16, 16]} />
        <meshStandardMaterial color="#ffe24a" emissive="#ffe24a" emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[0.7, -0.35, 0.3]}>
        <sphereGeometry args={[0.14, 16, 16]} />
        <meshStandardMaterial color="#ffe24a" emissive="#ffe24a" emissiveIntensity={0.4} />
      </mesh>
      {/* Legs */}
      <mesh position={[-0.4, -1.9, 0]}>
        <boxGeometry args={[0.4, 0.6, 0.4]} />
        <meshStandardMaterial color="#5cc4ff" metalness={0.1} roughness={0.4} />
      </mesh>
      <mesh position={[0.4, -1.9, 0]}>
        <boxGeometry args={[0.4, 0.6, 0.4]} />
        <meshStandardMaterial color="#5cc4ff" metalness={0.1} roughness={0.4} />
      </mesh>
      <mesh position={[-0.4, -2.25, 0.12]}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[0.4, -2.25, 0.12]}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>

      <group ref={head} position={[0, 0.3, 0]}>
        <group ref={headSpin}>
          <mesh>
            <boxGeometry args={[1.3, 1.1, 1]} />
            <meshStandardMaterial
              color="#ffe24a"
              roughness={0.28}
              metalness={0.08}
              emissive="#d39a00"
              emissiveIntensity={0.18}
            />
          </mesh>

          <mesh position={[0, 0.05, 0.51]}>
            <boxGeometry args={[1, 0.7, 0.04]} />
            <meshStandardMaterial color="#111827" emissive="#18253b" emissiveIntensity={0.75} />
          </mesh>

          <mesh ref={leftBrow} position={[-0.28, 0.42, 0.56]}>
            <boxGeometry args={[0.24, 0.04, 0.04]} />
            <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.5} />
          </mesh>
          <mesh ref={rightBrow} position={[0.28, 0.42, 0.56]}>
            <boxGeometry args={[0.24, 0.04, 0.04]} />
            <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.5} />
          </mesh>

          <group ref={leftEye} position={[-0.28, 0.15, 0.55]}>
            <mesh>
              <sphereGeometry args={[0.13, 16, 16]} />
              <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.18} />
            </mesh>
            <mesh position={[0, 0, 0.11]}>
              <sphereGeometry args={[0.06, 12, 12]} />
              <meshStandardMaterial color="#111111" />
            </mesh>
          </group>
          <group ref={rightEye} position={[0.28, 0.15, 0.55]}>
            <mesh>
              <sphereGeometry args={[0.13, 16, 16]} />
              <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.18} />
            </mesh>
            <mesh position={[0, 0, 0.11]}>
              <sphereGeometry args={[0.06, 12, 12]} />
              <meshStandardMaterial color="#111111" />
            </mesh>
          </group>

          <mesh position={[0, -0.13, 0.58]} rotation={[0, 0, Math.PI]}>
            <torusGeometry args={[0.12, 0.018, 12, 24, Math.PI]} />
            <meshStandardMaterial color="#a3e635" emissive="#a3e635" emissiveIntensity={0.8} />
          </mesh>

          <mesh position={[0, 0.7, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.4, 8]} />
            <meshStandardMaterial color="#7c3aed" emissive="#7c3aed" emissiveIntensity={0.25} />
          </mesh>
          <mesh ref={antennaOrb} position={[0, 0.95, 0]}>
            <sphereGeometry args={[0.13, 16, 16]} />
            <meshStandardMaterial color="#f97316" emissive="#f97316" emissiveIntensity={0.8} />
          </mesh>

          <mesh position={[-0.7, 0.05, 0]}>
            <boxGeometry args={[0.12, 0.4, 0.4]} />
            <meshStandardMaterial color="#ff3d8a" />
          </mesh>
          <mesh position={[0.7, 0.05, 0]}>
            <boxGeometry args={[0.12, 0.4, 0.4]} />
            <meshStandardMaterial color="#ff3d8a" />
          </mesh>
        </group>
      </group>

      <group ref={sparkleOrbit} position={[0, 1.02, 0]}>
        <mesh position={[0.92, 0.12, 0.22]} rotation={[0.3, 0.1, 0.6]}>
          <boxGeometry args={[0.12, 0.12, 0.12]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.65} />
        </mesh>
        <mesh position={[-0.94, -0.04, -0.2]}>
          <octahedronGeometry args={[0.09, 0]} />
          <meshStandardMaterial color="#5cc4ff" emissive="#5cc4ff" emissiveIntensity={0.8} />
        </mesh>
        <mesh position={[0.16, 0.74, -0.24]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.09, 0.025, 10, 18]} />
          <meshStandardMaterial color="#ff3d8a" emissive="#ff3d8a" emissiveIntensity={0.75} />
        </mesh>
      </group>
    </group>
  );
};

export const Mascot3D = () => {
  const { play } = useUiSound();

  return (
    <div className="w-full h-full">
      <Canvas shadows camera={{ position: [0, 0.25, 4.8], fov: 45 }} dpr={[1, 2]}>
        <color attach="background" args={["#a3e635"]} />
        <ambientLight intensity={0.85} />
        <directionalLight position={[5, 5, 5]} intensity={1.35} castShadow />
        <directionalLight position={[-3, 2, -2]} intensity={0.55} color="#ff3d8a" />
        <pointLight position={[0, 1.6, 2.4]} intensity={0.85} color="#ffffff" />
        <Suspense fallback={null}>
          <Robot onSpin={() => play("mascot")} />
        </Suspense>
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          enableDamping
          dampingFactor={0.08}
          autoRotate
          autoRotateSpeed={0.8}
          rotateSpeed={0.85}
          minPolarAngle={Math.PI / 2.5}
          maxPolarAngle={Math.PI / 1.8}
        />
      </Canvas>
    </div>
  );
};
