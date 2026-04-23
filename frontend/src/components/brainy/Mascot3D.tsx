import { Suspense, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

const Robot = () => {
  const group = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const leftEye = useRef<THREE.Mesh>(null);
  const rightEye = useRef<THREE.Mesh>(null);
  const { mouse } = useThree();

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (group.current) {
      group.current.position.y = Math.sin(t * 1.6) * 0.12;
      group.current.rotation.z = Math.sin(t * 0.8) * 0.04;
    }
    if (head.current) {
      head.current.rotation.y = THREE.MathUtils.lerp(head.current.rotation.y, mouse.x * 0.6, 0.08);
      head.current.rotation.x = THREE.MathUtils.lerp(head.current.rotation.x, -mouse.y * 0.4, 0.08);
    }
    [leftEye, rightEye].forEach((e) => {
      if (e.current) {
        e.current.position.x = (e === leftEye ? -0.28 : 0.28) + mouse.x * 0.05;
        e.current.position.y = 0.15 + mouse.y * 0.05;
      }
    });
  });

  return (
    <group ref={group}>
      {/* Body */}
      <mesh position={[0, -0.9, 0]} castShadow>
        <boxGeometry args={[1.4, 1.3, 1.1]} />
        <meshStandardMaterial color="#ff3d8a" roughness={0.6} />
      </mesh>
      {/* Belly screen */}
      <mesh position={[0, -0.85, 0.56]}>
        <boxGeometry args={[0.7, 0.55, 0.04]} />
        <meshStandardMaterial color="#ffe24a" roughness={0.5} emissive="#ffe24a" emissiveIntensity={0.3} />
      </mesh>
      {/* Arms */}
      <mesh position={[-1, -0.85, 0]} rotation={[0, 0, 0.2]}>
        <boxGeometry args={[0.35, 1, 0.35]} />
        <meshStandardMaterial color="#5cc4ff" />
      </mesh>
      <mesh position={[1, -0.85, 0]} rotation={[0, 0, -0.2]}>
        <boxGeometry args={[0.35, 1, 0.35]} />
        <meshStandardMaterial color="#5cc4ff" />
      </mesh>
      {/* Hands */}
      <mesh position={[-1.15, -1.45, 0]}>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <mesh position={[1.15, -1.45, 0]}>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      {/* Legs */}
      <mesh position={[-0.4, -1.9, 0]}>
        <boxGeometry args={[0.4, 0.6, 0.4]} />
        <meshStandardMaterial color="#5cc4ff" />
      </mesh>
      <mesh position={[0.4, -1.9, 0]}>
        <boxGeometry args={[0.4, 0.6, 0.4]} />
        <meshStandardMaterial color="#5cc4ff" />
      </mesh>

      {/* Head group (follows mouse) */}
      <group ref={head} position={[0, 0.3, 0]}>
        <mesh>
          <boxGeometry args={[1.3, 1.1, 1]} />
          <meshStandardMaterial color="#ffe24a" roughness={0.5} />
        </mesh>
        {/* Face plate */}
        <mesh position={[0, 0.05, 0.51]}>
          <boxGeometry args={[1, 0.7, 0.04]} />
          <meshStandardMaterial color="#111111" />
        </mesh>
        {/* Eyes (whites) */}
        <mesh ref={leftEye} position={[-0.28, 0.15, 0.55]}>
          <sphereGeometry args={[0.13, 16, 16]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
        <mesh ref={rightEye} position={[0.28, 0.15, 0.55]}>
          <sphereGeometry args={[0.13, 16, 16]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
        {/* Pupils */}
        <mesh position={[-0.28, 0.15, 0.66]}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshStandardMaterial color="#000000" />
        </mesh>
        <mesh position={[0.28, 0.15, 0.66]}>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshStandardMaterial color="#000000" />
        </mesh>
        {/* Smile */}
        <mesh position={[0, -0.2, 0.55]}>
          <boxGeometry args={[0.5, 0.06, 0.04]} />
          <meshStandardMaterial color="#ff3d8a" />
        </mesh>
        {/* Antenna */}
        <mesh position={[0, 0.7, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.4, 8]} />
          <meshStandardMaterial color="#222222" />
        </mesh>
        <mesh position={[0, 0.95, 0]}>
          <sphereGeometry args={[0.13, 16, 16]} />
          <meshStandardMaterial color="#a3e635" emissive="#a3e635" emissiveIntensity={0.6} />
        </mesh>
        {/* Ears */}
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
  );
};

export const Mascot3D = () => {
  return (
    <div className="w-full h-full">
      <Canvas camera={{ position: [0, 0.3, 5], fov: 45 }} dpr={[1, 2]}>
        <color attach="background" args={["#a3e635"]} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 5, 5]} intensity={1.2} />
        <directionalLight position={[-3, 2, -2]} intensity={0.5} color="#ff3d8a" />
        <Suspense fallback={null}>
          <Robot />
        </Suspense>
        <OrbitControls
          enablePan={false}
          enableZoom={false}
          minPolarAngle={Math.PI / 2.5}
          maxPolarAngle={Math.PI / 1.8}
        />
      </Canvas>
    </div>
  );
};
