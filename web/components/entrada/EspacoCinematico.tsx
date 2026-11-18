"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerformanceMonitor, Sparkles, Stars, Trail } from "@react-three/drei";
import { Bloom, ChromaticAberration, DepthOfField, EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import {
  AdditiveBlending, BackSide, BufferGeometry, CanvasTexture, Color, DoubleSide, Line, LineBasicMaterial, MathUtils,
  Object3D, Quaternion, ShaderMaterial, Shape, SRGBColorSpace, Vector2, Vector3,
} from "three";
import type { Group, InstancedMesh, Mesh, MeshBasicMaterial, PerspectiveCamera } from "three";

/**
 * Fundo da tela de entrada: a logo SIM ganhando vida no espaço. O globo verde com a malha de linhas, o anel de órbita
 * em volta e os foguetes — os pilares da manutenção — circulando com rastro de luz; de tempos em tempos um foguete
 * decola do planeta, com chama e fumaça. Estrelas, nebulosas, lua e a luz do sol; câmera de cinema com tomada de
 * aproximação, seguindo o mouse de leve; brilho (bloom), profundidade de campo, aberração cromática, vinheta e grão.
 * Só no cliente: o `FundoEntrada` carrega este arquivo sob demanda, só em tela grande com placa de vídeo.
 */

export type Qualidade = "alta" | "media" | "baixa";

const VERDE = "#008a40";
const VERDE_CLARO = "#57c58c";
const AZUL = "#006cb4";
const LARANJA = "#f07818";
const AMARELO = "#fcb40c";
const VERMELHO = "#e41824";
const CINZA_SIM = "#6d6e71";

const PLANETA = { pos: new Vector3(5.5, -2.2, -4), raio: 4.2 };
const EIXO_Y = new Vector3(0, 1, 0);

// números aleatórios repetíveis (a cena é sempre a mesma)
function sorteio(semente: number) {
  let s = semente;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

// ---------- texturas geradas no navegador (nada é baixado) ----------

function texturaPlaneta(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 512;
  const g = c.getContext("2d")!;
  const oceano = g.createLinearGradient(0, 0, 0, 512);
  oceano.addColorStop(0, "#04452a"); oceano.addColorStop(0.5, "#06603a"); oceano.addColorStop(1, "#04452a");
  g.fillStyle = oceano; g.fillRect(0, 0, 1024, 512);
  const r = sorteio(11);
  // continentes: aglomerados de manchas claras
  for (let k = 0; k < 9; k++) {
    const cx = r() * 1024, cy = 90 + r() * 330, n = 40 + Math.floor(r() * 60);
    for (let i = 0; i < n; i++) {
      const x = cx + (r() - 0.5) * 220, y = cy + (r() - 0.5) * 120, raio = 6 + r() * 26;
      g.fillStyle = `rgba(${70 + r() * 50}, ${170 + r() * 50}, ${110 + r() * 40}, ${0.55 + r() * 0.35})`;
      g.beginPath(); g.arc(((x % 1024) + 1024) % 1024, y, raio, 0, Math.PI * 2); g.fill();
    }
  }
  // luzes das cidades / pontos de dados
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(220, 255, 230, ${0.4 + r() * 0.5})`;
    g.fillRect(r() * 1024, 80 + r() * 350, 1.6, 1.6);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function texturaNuvens(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 512;
  const g = c.getContext("2d")!;
  const r = sorteio(29);
  for (let i = 0; i < 520; i++) {
    const x = r() * 1024, y = 40 + r() * 430, w = 20 + r() * 90, h = 4 + r() * 12;
    const grad = g.createRadialGradient(x, y, 0, x, y, w);
    grad.addColorStop(0, `rgba(255,255,255,${0.18 + r() * 0.25})`); grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.beginPath(); g.ellipse(x, y, w, h, 0, 0, Math.PI * 2); g.fill();
  }
  return new CanvasTexture(c);
}

function texturaBrilho(cor: string): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, cor); grad.addColorStop(0.35, cor.replace(/[\d.]+\)$/, "0.35)")); grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  return new CanvasTexture(c);
}

function texturaLua(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#9aa1a6"; g.fillRect(0, 0, 512, 256);
  const r = sorteio(5);
  for (let i = 0; i < 160; i++) {
    const x = r() * 512, y = r() * 256, raio = 2 + r() * 14;
    g.fillStyle = `rgba(${90 + r() * 40}, ${95 + r() * 40}, ${100 + r() * 40}, 0.7)`;
    g.beginPath(); g.arc(x, y, raio, 0, Math.PI * 2); g.fill();
  }
  return new CanvasTexture(c);
}

// ---------- planeta (o globo da logo) ----------

const atmosferaShader = {
  uniforms: { cor: { value: new Color(VERDE_CLARO) }, forca: { value: 1.25 } },
  vertexShader: `varying vec3 vN; varying vec3 vV;
    void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform vec3 cor; uniform float forca; varying vec3 vN; varying vec3 vV;
    void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.6) * forca; gl_FragColor = vec4(cor * f, f); }`,
};

function Planeta() {
  const corpo = useRef<Mesh>(null);
  const nuvens = useRef<Mesh>(null);
  const malha = useRef<Group>(null);
  const tex = useMemo(() => ({ planeta: texturaPlaneta(), nuvens: texturaNuvens() }), []);
  const atmosfera = useMemo(() => new ShaderMaterial({
    ...atmosferaShader, uniforms: { cor: { value: new Color(VERDE_CLARO) }, forca: { value: 0.9 } },
    side: BackSide, blending: AdditiveBlending, transparent: true, depthWrite: false,
  }), []);
  // a malha de linhas da logo: meridianos e paralelos
  const linhas = useMemo(() => {
    const pts: Vector3[][] = [];
    const R = PLANETA.raio * 1.006;
    for (let m = 0; m < 12; m++) {
      const a = (m / 12) * Math.PI;
      pts.push(Array.from({ length: 97 }, (_, i) => {
        const t = (i / 96) * Math.PI * 2;
        return new Vector3(Math.cos(t) * Math.cos(a) * R, Math.sin(t) * R, Math.cos(t) * Math.sin(a) * R);
      }));
    }
    for (let p = 1; p < 8; p++) {
      const lat = -Math.PI / 2 + (p / 8) * Math.PI, y = Math.sin(lat) * R, rr = Math.cos(lat) * R;
      pts.push(Array.from({ length: 97 }, (_, i) => {
        const t = (i / 96) * Math.PI * 2;
        return new Vector3(Math.cos(t) * rr, y, Math.sin(t) * rr);
      }));
    }
    return pts;
  }, []);
  useFrame((_, dt) => {
    if (corpo.current) corpo.current.rotation.y += dt * 0.04;
    if (nuvens.current) nuvens.current.rotation.y += dt * 0.055;
    if (malha.current) malha.current.rotation.y += dt * 0.04;
  });
  return (
    <group position={PLANETA.pos} rotation={[0.25, 0, -0.2]}>
      <mesh ref={corpo}>
        <sphereGeometry args={[PLANETA.raio, 96, 96]} />
        <meshStandardMaterial map={tex.planeta} roughness={0.75} metalness={0.05} emissive="#0b3"
          emissiveIntensity={0.05} />
      </mesh>
      <mesh ref={nuvens} scale={1.012}>
        <sphereGeometry args={[PLANETA.raio, 72, 72]} />
        <meshStandardMaterial map={tex.nuvens} transparent depthWrite={false} opacity={0.32} />
      </mesh>
      <group ref={malha}>
        {linhas.map((l, i) => <Linha key={i} pontos={l} />)}
      </group>
      <mesh scale={1.16} material={atmosfera}>
        <sphereGeometry args={[PLANETA.raio, 64, 64]} />
      </mesh>
    </group>
  );
}

function Linha({ pontos }: { pontos: Vector3[] }) {
  const linha = useMemo(() => {
    const l = new Line(new BufferGeometry().setFromPoints(pontos),
      new LineBasicMaterial({ color: VERDE_CLARO, transparent: true, opacity: 0.28, depthWrite: false }));
    return l;
  }, [pontos]);
  return <primitive object={linha} />;
}

/** O anel cinza da logo SIM em volta do globo, com um fio de luz por dentro. */
function AnelDaLogo() {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.z += dt * 0.05; });
  return (
    <group position={PLANETA.pos} rotation={[1.22, 0.18, 0.3]}>
      <group ref={ref}>
        <mesh>
          <torusGeometry args={[PLANETA.raio * 1.55, 0.11, 24, 260]} />
          <meshPhysicalMaterial color={CINZA_SIM} metalness={0.85} roughness={0.28} clearcoat={0.6} />
        </mesh>
        <mesh>
          <torusGeometry args={[PLANETA.raio * 1.5, 0.015, 8, 260]} />
          <meshBasicMaterial color={VERDE_CLARO} toneMapped={false} />
        </mesh>
        <mesh>
          <ringGeometry args={[PLANETA.raio * 1.62, PLANETA.raio * 2.05, 180]} />
          <meshBasicMaterial color={VERDE_CLARO} transparent opacity={0.05} side={DoubleSide} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

// ---------- foguete (o da logo) ----------

const PERFIL_FOGUETE = [
  [0, 0], [0.26, 0.02], [0.33, 0.25], [0.36, 0.6], [0.36, 1.55], [0.32, 1.95], [0.24, 2.3], [0.13, 2.58], [0.04, 2.74], [0, 2.78],
].map(([x, y]) => new Vector2(x, y));

function Aleta({ cor, angulo }: { cor: string; angulo: number }) {
  const forma = useMemo(() => {
    const s = new Shape();
    s.moveTo(0, 0); s.lineTo(0.42, -0.18); s.lineTo(0.46, -0.02); s.lineTo(0, 0.85); s.closePath();
    return s;
  }, []);
  return (
    <group rotation={[0, angulo, 0]}>
      <mesh position={[0.3, 0.12, -0.03]}>
        <extrudeGeometry args={[forma, { depth: 0.06, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 }]} />
        <meshPhysicalMaterial color={cor} metalness={0.3} roughness={0.35} clearcoat={0.8} />
      </mesh>
    </group>
  );
}

function Chama({ forca = 1, qualidade }: { forca?: number; qualidade: Qualidade }) {
  const fora = useRef<Mesh>(null);
  const dentro = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const f = forca * (1 + Math.sin(t * 41) * 0.08 + Math.sin(t * 23) * 0.06);
    if (fora.current) fora.current.scale.set(1, f, 1);
    if (dentro.current) dentro.current.scale.set(1, f * 0.95, 1);
  });
  return (
    <group position={[0, -0.05, 0]} rotation={[Math.PI, 0, 0]}>
      <mesh ref={fora} position={[0, 0, 0]}>
        <coneGeometry args={[0.24, 1.6, 24, 1, true]} />
        <meshBasicMaterial color={LARANJA} transparent opacity={0.85} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={dentro}>
        <coneGeometry args={[0.12, 1.0, 24, 1, true]} />
        <meshBasicMaterial color="#fff6d8" transparent opacity={0.95} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      {qualidade !== "baixa" && <pointLight color={LARANJA} intensity={6 * forca} distance={6} />}
    </group>
  );
}

function Foguete({ cor, qualidade, chama = 1 }: { cor: string; qualidade: Qualidade; chama?: number }) {
  return (
    <group>
      <mesh castShadow>
        <latheGeometry args={[PERFIL_FOGUETE, 48]} />
        <meshPhysicalMaterial color="#f4f6f5" metalness={0.15} roughness={0.25} clearcoat={1} clearcoatRoughness={0.12} />
      </mesh>
      {/* faixa na cor do pilar */}
      <mesh position={[0, 1.05, 0]}>
        <cylinderGeometry args={[0.365, 0.365, 0.16, 48, 1, true]} />
        <meshPhysicalMaterial color={cor} metalness={0.3} roughness={0.3} clearcoat={0.8} />
      </mesh>
      {/* janela */}
      <group position={[0, 1.72, 0.33]} rotation={[0.08, 0, 0]}>
        <mesh><torusGeometry args={[0.13, 0.035, 16, 40]} /><meshPhysicalMaterial color={CINZA_SIM} metalness={0.9} roughness={0.2} /></mesh>
        <mesh><circleGeometry args={[0.12, 32]} /><meshPhysicalMaterial color="#123a5c" metalness={0.2} roughness={0.05} clearcoat={1} emissive="#3fa9ff" emissiveIntensity={0.35} /></mesh>
      </group>
      {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((a) => <Aleta key={a} cor={cor} angulo={a} />)}
      <mesh position={[0, -0.02, 0]}>
        <cylinderGeometry args={[0.2, 0.26, 0.16, 24]} />
        <meshPhysicalMaterial color="#3b4045" metalness={0.9} roughness={0.35} />
      </mesh>
      {chama > 0 && <Chama forca={chama} qualidade={qualidade} />}
    </group>
  );
}

// ---------- foguetes em órbita: os pilares ----------

interface Orbita { raio: number; inclinacao: [number, number]; velocidade: number; fase: number; cor: string }
const PILARES: Orbita[] = [
  { raio: 7.4, inclinacao: [1.22, 0.18], velocidade: 0.16, fase: 0.3, cor: VERDE },
  { raio: 8.6, inclinacao: [1.0, -0.5], velocidade: 0.12, fase: 2.1, cor: AZUL },
  { raio: 9.6, inclinacao: [1.45, 0.6], velocidade: 0.1, fase: 4.0, cor: LARANJA },
  { raio: 10.8, inclinacao: [0.85, 0.15], velocidade: 0.085, fase: 1.2, cor: AMARELO },
  { raio: 12.2, inclinacao: [1.3, -0.25], velocidade: 0.07, fase: 5.1, cor: VERMELHO },
];

const _a = new Vector3(), _b = new Vector3(), _dir = new Vector3(), _q = new Quaternion();

function posOrbita(o: Orbita, t: number, alvo: Vector3) {
  const ang = o.fase + t * o.velocidade;
  alvo.set(Math.cos(ang) * o.raio, Math.sin(ang) * o.raio, 0);
  alvo.applyAxisAngle(new Vector3(1, 0, 0), o.inclinacao[0] - Math.PI / 2);
  alvo.applyAxisAngle(EIXO_Y, o.inclinacao[1]);
  return alvo.add(PLANETA.pos);
}

function FogueteEmOrbita({ o, qualidade }: { o: Orbita; qualidade: Qualidade }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    const t = clock.elapsedTime;
    posOrbita(o, t, _a);
    posOrbita(o, t + 0.05, _b);
    _dir.subVectors(_b, _a).normalize();
    g.position.copy(_a);
    _q.setFromUnitVectors(EIXO_Y, _dir);
    g.quaternion.slerp(_q, 0.2);
  });
  const corpo = (
    <group ref={ref} scale={0.6}>
      <Foguete cor={o.cor} qualidade={qualidade} chama={0.8} />
    </group>
  );
  if (qualidade === "baixa") return corpo;
  return (
    <Trail width={1.6} length={qualidade === "alta" ? 9 : 6} color={o.cor} attenuation={(w) => w * w} decay={1.2}>
      {corpo}
    </Trail>
  );
}

// ---------- decolagem com fumaça ----------

const CICLO_DECOLAGEM = 16;
const N_FUMACA = 140;
const PONTO_LANCAMENTO = new Vector3(-0.55, 0.78, 0.3).normalize(); // direção da base, a partir do centro do planeta

function Decolagem({ qualidade }: { qualidade: Qualidade }) {
  const foguete = useRef<Group>(null);
  const fumaca = useRef<InstancedMesh>(null);
  const tmp = useMemo(() => new Object3D(), []);
  const nascidasRef = useRef(Array.from({ length: N_FUMACA }, () => ({ t: -99, p: new Vector3(), v: new Vector3() })));
  const prox = useRef(0);
  const ultimo = useRef(0);
  const cor = useMemo(() => new Color(), []);
  useFrame(({ clock }) => {
    const nascidas = nascidasRef.current;
    const t = clock.elapsedTime;
    const f = (t % CICLO_DECOLAGEM) / CICLO_DECOLAGEM;
    const g = foguete.current;
    if (!g) return;
    // sobe acelerando, curvando para a órbita
    const voo = Math.max(0, (f - 0.08) / 0.62);
    const sobe = voo * voo * 22;
    const base = _a.copy(PONTO_LANCAMENTO).multiplyScalar(PLANETA.raio + 0.55 + sobe);
    base.addScaledVector(_b.set(1, 0.15, 0.2).normalize(), voo * voo * voo * 9).add(PLANETA.pos);
    const proxPos = _dir.copy(PONTO_LANCAMENTO).multiplyScalar(PLANETA.raio + 0.55 + (voo + 0.02) ** 2 * 22)
      .addScaledVector(_b, (voo + 0.02) ** 3 * 9).add(PLANETA.pos);
    _dir.subVectors(proxPos, base).normalize();
    if (voo === 0) _dir.copy(PONTO_LANCAMENTO);
    g.position.copy(base);
    g.quaternion.setFromUnitVectors(EIXO_Y, _dir);
    g.visible = f < 0.72;
    const s = 0.55 * (f > 0.62 ? Math.max(0.001, 1 - (f - 0.62) / 0.1) : 1);
    g.scale.setScalar(s);
    // fumaça: nasce no bocal enquanto o motor está ligado
    if (f > 0.03 && f < 0.7 && t - ultimo.current > (qualidade === "baixa" ? 0.08 : 0.035)) {
      ultimo.current = t;
      const n = nascidas[prox.current];
      prox.current = (prox.current + 1) % N_FUMACA;
      n.t = t;
      n.p.copy(base).addScaledVector(_dir, -0.4);
      n.v.copy(_dir).multiplyScalar(-0.6 - Math.random() * 0.4).add(_b.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.5));
    }
    const m = fumaca.current;
    if (!m) return;
    for (let i = 0; i < N_FUMACA; i++) {
      const n = nascidas[i];
      const idade = t - n.t;
      const vivo = idade >= 0 && idade < 5;
      tmp.position.copy(n.p).addScaledVector(n.v, idade);
      tmp.scale.setScalar(vivo ? 0.18 + idade * 0.55 : 0.0001);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
      const brilho = vivo ? Math.max(0, 1 - idade / 5) * (idade < 0.4 ? 1.4 : 0.55) : 0;
      cor.setRGB(brilho * (idade < 0.4 ? 1 : 0.75), brilho * (idade < 0.4 ? 0.62 : 0.8), brilho * (idade < 0.4 ? 0.28 : 0.82));
      m.setColorAt(i, cor);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return (
    <group>
      <group ref={foguete}><Foguete cor={VERDE} qualidade={qualidade} chama={1.2} /></group>
      <instancedMesh ref={fumaca} args={[undefined, undefined, N_FUMACA]}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial transparent opacity={0.35} blending={AdditiveBlending} depthWrite={false} />
      </instancedMesh>
    </group>
  );
}

// ---------- cenário ----------

function Nebulosas() {
  const ref = useRef<Group>(null);
  const tex = useMemo(() => [
    texturaBrilho("rgba(0,170,90,0.55)"), texturaBrilho("rgba(0,108,180,0.55)"), texturaBrilho("rgba(120,60,200,0.4)"),
  ], []);
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.z += dt * 0.004; });
  const nuvens: [number, number, number, number, number][] = [
    [-30, 12, -60, 60, 0], [25, -10, -70, 70, 1], [-5, 25, -80, 55, 2], [40, 20, -65, 45, 0], [-45, -15, -75, 50, 1],
  ];
  return (
    <group ref={ref}>
      {nuvens.map(([x, y, z, s, i], k) => (
        <mesh key={k} position={[x, y, z]} scale={s}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={tex[i]} transparent blending={AdditiveBlending} depthWrite={false} opacity={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function Lua() {
  const ref = useRef<Group>(null);
  const tex = useMemo(() => texturaLua(), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.03;
    if (ref.current) ref.current.position.set(-16 + Math.cos(t) * 3, 9 + Math.sin(t) * 1.2, -26);
  });
  return (
    <group ref={ref}>
      <mesh><sphereGeometry args={[1.6, 48, 48]} /><meshStandardMaterial map={tex} roughness={1} /></mesh>
    </group>
  );
}

function Sol() {
  const tex = useMemo(() => texturaBrilho("rgba(255,244,214,1)"), []);
  const mat = useRef<MeshBasicMaterial>(null);
  return (
    <group position={[-40, 22, -50]}>
      <mesh><sphereGeometry args={[2.2, 32, 32]} /><meshBasicMaterial color="#fff8e6" toneMapped={false} /></mesh>
      <sprite scale={38}><spriteMaterial ref={mat as never} map={tex} blending={AdditiveBlending} depthWrite={false} transparent /></sprite>
    </group>
  );
}

// ---------- câmera e efeitos ----------

const ABERTURA = new Vector3(-6, 9, 70);
const _cam = new Vector3();
const _olho = new Vector3();

function Camera({ focoRef }: { focoRef: { current: number } }) {
  const { camera, size } = useThree();
  useFrame(({ clock, pointer }) => {
    const t = clock.elapsedTime + ((window as { __cenaT0?: number }).__cenaT0 ?? 0);
    // deriva lenta em volta do planeta, subindo e descendo
    const a = Math.sin(t * 0.035) * 0.55;
    _cam.set(Math.sin(a) * 19 + 1, 2.2 + Math.sin(t * 0.05) * 2.2, Math.cos(a) * 19 + 1);
    const k = MathUtils.smootherstep(Math.min(1, t / 7), 0, 1);
    _cam.lerpVectors(ABERTURA, _cam, k);
    _cam.x += pointer.x * 1.1;
    _cam.y += pointer.y * 0.7;
    camera.position.copy(_cam);
    _olho.copy(PLANETA.pos).add(_b.set(-2.5, 2.4, 0));
    camera.lookAt(_olho);
    focoRef.current = camera.position.distanceTo(PLANETA.pos);
    const desvio = size.width >= 1024 ? -size.width * 0.16 : 0;
    (camera as PerspectiveCamera).setViewOffset(size.width, size.height, desvio, 0, size.width, size.height);
  });
  return null;
}

const OFFSET_CROMATICO = new Vector2(0.0006, 0.0006);

function Efeitos({ focoRef, qualidade }: { focoRef: { current: number }; qualidade: Qualidade }) {
  const dof = useRef<unknown>(null);
  useFrame(({ camera }) => {
    const d = dof.current as { circleOfConfusionMaterial?: { uniforms: { focusDistance: { value: number } } } } | null;
    const u = d?.circleOfConfusionMaterial?.uniforms?.focusDistance;
    if (u) {
      const c = camera as PerspectiveCamera;
      u.value = MathUtils.clamp((focoRef.current - c.near) / (c.far - c.near), 0, 1);
    }
  });
  if (qualidade === "baixa") return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur luminanceThreshold={0.6} intensity={0.8} radius={0.6} />
    </EffectComposer>
  );
  if (qualidade === "media") return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur luminanceThreshold={0.55} intensity={1.1} radius={0.75} />
      <Vignette eskil={false} offset={0.2} darkness={0.6} />
    </EffectComposer>
  );
  return (
    <EffectComposer multisampling={4}>
      <DepthOfField ref={dof as never} focusDistance={0.2} focalLength={0.08} bokehScale={1.6} />
      <Bloom mipmapBlur luminanceThreshold={0.5} intensity={1.25} radius={0.8} />
      <ChromaticAberration offset={OFFSET_CROMATICO} radialModulation={false} modulationOffset={0} />
      <Noise opacity={0.03} premultiply />
      <Vignette eskil={false} offset={0.2} darkness={0.65} />
    </EffectComposer>
  );
}

function Pausa({ children }: { children: ReactNode }) {
  // aba escondida: para de desenhar (economiza bateria e placa de vídeo)
  const set = useThree((st) => st.setFrameloop);
  useEffect(() => {
    const mudar = () => set(document.hidden ? "never" : "always");
    document.addEventListener("visibilitychange", mudar);
    return () => document.removeEventListener("visibilitychange", mudar);
  }, [set]);
  return <>{children}</>;
}

/**
 * Qualidade automática pelo desempenho do computador: começa na média, sobe para a alta se sobra fôlego e desce para
 * a baixa (sem rastros, desfoque e sombras de luz) se os quadros caem; se nem a baixa aguenta, a cena sai.
 */
export function EspacoCinematico({ aoFalhar }: { aoFalhar: () => void }) {
  const focoRef = useRef(19);
  // qualidade fixa só para conferência (captura de tela em máquina sem placa de vídeo)
  const [fixa] = useState(() => (window as { __cenaQualidade?: Qualidade }).__cenaQualidade);
  const [qualidade, setQualidade] = useState<Qualidade>(fixa ?? "media");
  return (
    <Canvas
      dpr={qualidade === "alta" ? [1, 1.5] : 1}
      camera={{ position: ABERTURA.toArray(), fov: 36, near: 0.3, far: 400 }}
      gl={{ antialias: false, powerPreference: "high-performance", stencil: false }}
      style={{ position: "absolute", inset: 0 }}
      // o fundo não recebe cliques (o formulário fica por cima); o mouse é lido na página inteira
      eventSource={document.body}
      eventPrefix="client"
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", (e) => { e.preventDefault(); aoFalhar(); });
      }}
    >
      {!fixa && <PerformanceMonitor bounds={() => [32, 55]} flipflops={4}
        onIncline={() => setQualidade((q) => (q === "baixa" ? "media" : "alta"))}
        onDecline={() => setQualidade((q) => (q === "alta" ? "media" : "baixa"))}
        onFallback={aoFalhar} />}
      <Pausa>
        <color attach="background" args={["#02060a"]} />
        <Camera focoRef={focoRef} />
        <ambientLight intensity={0.12} />
        <directionalLight position={[-40, 22, -10]} intensity={2.6} color="#fff4e0" />
        <directionalLight position={[20, -6, 12]} intensity={0.35} color={AZUL} />

        <Stars radius={140} depth={70} count={qualidade === "baixa" ? 2500 : 7000} factor={4.5} saturation={0.15} fade speed={0.6} />
        <Nebulosas />
        <Sol />
        <Lua />
        <Planeta />
        <AnelDaLogo />
        {PILARES.map((o) => <FogueteEmOrbita key={o.cor} o={o} qualidade={qualidade} />)}
        <Decolagem qualidade={qualidade} />
        {qualidade !== "baixa" && (
          <Sparkles count={180} scale={[40, 20, 30]} position={[2, 0, -4]} size={2} speed={0.2} opacity={0.35} color={VERDE_CLARO} />
        )}
        <Efeitos focoRef={focoRef} qualidade={qualidade} />
      </Pausa>
    </Canvas>
  );
}
