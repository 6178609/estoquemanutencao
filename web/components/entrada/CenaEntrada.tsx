"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer } from "@react-three/drei";
import { AdditiveBlending, BufferAttribute, BufferGeometry, ExtrudeGeometry, MathUtils, Path, Shape } from "three";
import type { Group, Mesh } from "three";

/**
 * A cena 3D da tela de entrada: engrenagens metálicas engrenando de verdade (mesmo módulo, razão de dentes e fase
 * certas), anéis de órbita como o anel da logo SIM e partículas de "dados" circulando em volta. Luz de estúdio montada
 * na própria cena (Lightformer, sem baixar nada), sombra de contato e a cena inclina seguindo o mouse.
 * Só roda no cliente: o `HeroEntrada` carrega este arquivo sob demanda e cai na logo quando não há WebGL.
 */

const MODULO = 0.12;
const VERDE = "#008a40";
const VERDE_CLARO = "#57c58c";
const AZUL = "#006cb4";
const LARANJA = "#f07818";

interface Engrenagem { dentes: number; raio: number }
const raioPrimitivo = (dentes: number) => (MODULO * dentes) / 2;

/** Perfil da engrenagem: dentes trapezoidais em volta, furo central e furos de alívio. */
function geometriaEngrenagem(dentes: number, espessura: number, furosAlivio: number): ExtrudeGeometry {
  const rp = raioPrimitivo(dentes);
  const ra = rp + MODULO;          // cabeça do dente
  const rr = rp - 1.25 * MODULO;   // pé do dente
  const passo = (Math.PI * 2) / dentes;
  const forma = new Shape();
  const ponto = (r: number, a: number) => [Math.cos(a) * r, Math.sin(a) * r] as const;
  for (let i = 0; i < dentes; i++) {
    const c = i * passo; // o dente fica centrado no ângulo c
    const perfil: [number, number][] = [[rr, -0.5], [rr, -0.29], [rp, -0.22], [ra, -0.14], [ra, 0.14], [rp, 0.22], [rr, 0.29]];
    perfil.forEach(([r, f], j) => {
      const [x, y] = ponto(r, c + f * passo);
      if (i === 0 && j === 0) forma.moveTo(x, y); else forma.lineTo(x, y);
    });
  }
  forma.closePath();
  const furo = (r: number, cx = 0, cy = 0) => { const p = new Path(); p.absarc(cx, cy, r, 0, Math.PI * 2, true); return p; };
  forma.holes.push(furo(rp * 0.16));
  for (let i = 0; i < furosAlivio; i++) {
    const a = (i / furosAlivio) * Math.PI * 2 + passo / 2;
    forma.holes.push(furo(rp * 0.17, Math.cos(a) * rp * 0.56, Math.sin(a) * rp * 0.56));
  }
  const g = new ExtrudeGeometry(forma, {
    depth: espessura, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.025, bevelSegments: 3, curveSegments: 24,
  });
  g.center();
  return g;
}

function Peca({ dentes, espessura, furos, cor, metal, aspereza, giro, posicao, z = 0, reflexo = 0.7 }: {
  dentes: number; espessura: number; furos: number; cor: string; metal: number; aspereza: number; reflexo?: number;
  giro: (t: number) => number; posicao: [number, number]; z?: number;
}) {
  const ref = useRef<Mesh>(null);
  const geo = useMemo(() => geometriaEngrenagem(dentes, espessura, furos), [dentes, espessura, furos]);
  useFrame(({ clock }) => { if (ref.current) ref.current.rotation.z = giro(clock.elapsedTime); });
  return (
    <group position={[posicao[0], posicao[1], z]}>
      <mesh ref={ref} geometry={geo} castShadow>
        <meshPhysicalMaterial color={cor} metalness={metal} roughness={aspereza} clearcoat={0.6} clearcoatRoughness={0.25} envMapIntensity={reflexo} />
      </mesh>
      {/* cubo do eixo, em aço */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[raioPrimitivo(dentes) * 0.22, raioPrimitivo(dentes) * 0.22, espessura + 0.28, 32]} />
        <meshPhysicalMaterial color="#c9d0d4" metalness={1} roughness={0.22} />
      </mesh>
    </group>
  );
}

/** Três engrenagens em trem: a grande puxa a média, que puxa a pequena. */
function TremDeEngrenagens() {
  const a: Engrenagem = { dentes: 26, raio: raioPrimitivo(26) };
  const b: Engrenagem = { dentes: 16, raio: raioPrimitivo(16) };
  const c: Engrenagem = { dentes: 11, raio: raioPrimitivo(11) };
  const t1 = -0.55; // direção de A para B
  const t2 = 0.75;  // direção de B para C
  const pb: [number, number] = [Math.cos(t1) * (a.raio + b.raio), Math.sin(t1) * (a.raio + b.raio)];
  const pc: [number, number] = [pb[0] + Math.cos(t2) * (b.raio + c.raio), pb[1] + Math.sin(t2) * (b.raio + c.raio)];
  // fase do engrenamento: quando um dente da motora aponta para a movida, a movida mostra o vão
  const movida = (motora: number, nMotora: number, nMovida: number, dir: number) =>
    -(nMotora / nMovida) * (motora - dir) + dir + Math.PI + Math.PI / nMovida;
  const giroA = (t: number) => t * 0.32;
  const giroB = (t: number) => movida(giroA(t), a.dentes, b.dentes, t1);
  const giroC = (t: number) => movida(giroB(t), b.dentes, c.dentes, t2);
  // centraliza o conjunto
  const cx = (0 + pb[0] + pc[0]) / 3, cy = (0 + pb[1] + pc[1]) / 3;
  return (
    <group position={[-cx, -cy, 0]}>
      <Peca dentes={a.dentes} espessura={0.34} furos={6} cor={VERDE} metal={0.55} aspereza={0.28} giro={giroA} posicao={[0, 0]} />
      <Peca dentes={b.dentes} espessura={0.3} furos={5} cor="#c3cbd0" metal={0.7} aspereza={0.26} reflexo={1.3} giro={giroB} posicao={pb} />
      <Peca dentes={c.dentes} espessura={0.26} furos={0} cor={LARANJA} metal={0.4} aspereza={0.32} giro={giroC} posicao={pc} />
    </group>
  );
}

/** Anel de órbita (como o anel da logo SIM), girando e brilhando. */
function Anel({ raio, cor, inclinacao, velocidade, espessura = 0.018 }: { raio: number; cor: string; inclinacao: [number, number]; velocidade: number; espessura?: number }) {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.z += dt * velocidade; });
  return (
    <group rotation={[inclinacao[0], inclinacao[1], 0]}>
      <group ref={ref}>
        <mesh>
          <torusGeometry args={[raio, espessura, 16, 160]} />
          <meshStandardMaterial color={cor} emissive={cor} emissiveIntensity={1.4} toneMapped={false} />
        </mesh>
        {/* um "satélite" correndo no anel */}
        <mesh position={[raio, 0, 0]}>
          <sphereGeometry args={[espessura * 4, 24, 24]} />
          <meshStandardMaterial color="#ffffff" emissive={cor} emissiveIntensity={2.2} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/** Partículas de "dados" numa faixa em volta do conjunto. */
function Particulas({ quantidade = 650 }: { quantidade?: number }) {
  const ref = useRef<Group>(null);
  const geo = useMemo(() => {
    const pos = new Float32Array(quantidade * 3);
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < quantidade; i++) {
      const a = rnd() * Math.PI * 2, r = 2.6 + rnd() * 1.3, h = (rnd() - 0.5) * 1.6;
      pos.set([Math.cos(a) * r, h, Math.sin(a) * r], i * 3);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(pos, 3));
    return g;
  }, [quantidade]);
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * 0.08; });
  return (
    <group ref={ref} rotation={[0.35, 0, 0]}>
      <points geometry={geo}>
        <pointsMaterial size={0.06} color={VERDE_CLARO} transparent opacity={1} depthWrite={false} blending={AdditiveBlending} sizeAttenuation />
      </points>
    </group>
  );
}

/** Inclina o conjunto na direção do mouse e balança de leve. */
function Palco({ children }: { children: React.ReactNode }) {
  const ref = useRef<Group>(null);
  useFrame(({ pointer, clock }) => {
    const g = ref.current;
    if (!g) return;
    const t = clock.elapsedTime;
    g.rotation.y = MathUtils.lerp(g.rotation.y, 0.42 + pointer.x * 0.35, 0.05);
    g.rotation.x = MathUtils.lerp(g.rotation.x, -0.32 - pointer.y * 0.22, 0.05);
    g.position.y = 0.55 + Math.sin(t * 0.9) * 0.08;
  });
  return <group ref={ref}>{children}</group>;
}

export function CenaEntrada({ aoFalhar }: { aoFalhar: () => void }) {
  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 0.2, 10.8], fov: 38 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ position: "absolute", inset: 0 }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", (e) => { e.preventDefault(); aoFalhar(); });
      }}
    >
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 6, 5]} intensity={1.6} />
      <pointLight position={[-4, -2, 3]} intensity={18} color={AZUL} distance={12} />
      <pointLight position={[3, 3, -2]} intensity={14} color={VERDE_CLARO} distance={10} />
      <Palco>
        <TremDeEngrenagens />
        <Anel raio={2.75} cor={VERDE} inclinacao={[1.15, 0.25]} velocidade={0.5} />
        <Anel raio={3.15} cor={AZUL} inclinacao={[1.35, -0.4]} velocidade={-0.32} espessura={0.012} />
        <Particulas />
      </Palco>
      <ContactShadows position={[0, -2.35, 0]} opacity={0.32} scale={9} blur={2.6} far={4} />
      <Environment resolution={256}>
        <Lightformer intensity={2.2} position={[0, 5, -3]} scale={[10, 2, 1]} />
        <Lightformer intensity={1.2} position={[-6, 1, 2]} scale={[2, 6, 1]} rotation-y={Math.PI / 2} />
        <Lightformer intensity={1.2} position={[6, 1, 2]} scale={[2, 6, 1]} rotation-y={-Math.PI / 2} />
        <Lightformer intensity={0.8} color={VERDE_CLARO} position={[0, -4, 3]} scale={[8, 1, 1]} />
      </Environment>
    </Canvas>
  );
}
