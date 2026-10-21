# Visualizador 3D de falhas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visualizador 3D esquemático dos 8 equipamentos, com zoom e destaque na peça de cada causa do diagnóstico.

**Architecture:** Dados puros e testados em `lib/suporte/modelos3d.ts`; cena React Three Fiber carregada só no cliente.

**Tech Stack:** Next.js 16, React 19.3, three 0.186, @react-three/fiber 9, @react-three/drei 10, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-21-visualizador-3d-design.md`

## Global Constraints
- pt-BR; cores pelos tokens do site (ler `var(--…)` com `getComputedStyle` para passar ao three.js); destaque `--st-critico`.
- Sem arquivos 3D externos; só geometrias primitivas. Nada da empresa no código.
- three só no cliente (`next/dynamic` `ssr:false`), carregado quando o bloco entra na tela.
- Verificação: `cd web && npx tsc --noEmit && npx vitest run && npx eslint . && npx next build &&
  PW_CHROMIUM=$(ls /opt/pw-browsers/chromium-1194/chrome-linux*/chrome | head -1) npx playwright test`.
- Servidor só pelo PID; nada de `pkill -f`; nunca usar ferramenta de mensagem entre sessões.

## Review Focus
1. Navegador sem WebGL → mensagem e lista de marcadores continuam (Task 1).
2. Tipo do diagnóstico sem modelo → bloco não aparece, nada quebra (Task 3).
3. Celular 390 px: canvas não estoura a largura; toque gira e pinça dá zoom (Task 3).
4. `prefers-reduced-motion` → sem giro automático (Task 1).
5. Marcador apontando para peça inexistente → pego no teste de dados (Task 1).

---

### Task 1: Dados, infraestrutura da cena e Rolamento + Motor
**Files:** Create `web/lib/suporte/modelos3d.ts`, `web/testes/modelos3d.test.ts`, `web/app/(app)/suporte/_ui/3d/Visualizador3D.tsx`,
`.../3d/Cena.tsx`, `.../3d/Rolamento.tsx`, `.../3d/Motor.tsx`; Modify `web/package.json` (deps).
**Produces:** `MODELOS: Record<IdModelo, { titulo: string; pecas: { id: string; nome: string }[] }>` com os 8 modelos e peças
da spec; `MODELO_DO_TIPO: Partial<Record<string, IdModelo>>` (ids de `TIPOS_EQUIPAMENTO`); `MARCADORES: Record<string,
Record<string, { peca: string; titulo: string; explicacao: string }[]>>` (todos os sintomas dos 8 tipos com modelo);
`marcadoresDe(tipo, sintoma)`. Componente `<Visualizador3D modelo tipo sintoma />` (cliente) com lista de marcadores
HTML, foco/zoom animado na peça, destaque vermelho, demais peças com opacidade 0.25, explodir, recentrar, pausar giro,
fallback sem WebGL. Cada modelo é um componente `({ destaque?: string; explodir: boolean }) => JSX` com peças `name={id}`.
- [ ] Instalar `three @react-three/fiber @react-three/drei` e `@types/three` (dev) com versões exatas.
- [ ] Testes dos dados (spec "Testes") primeiro; implementar; Rolamento e Motor completos.
- [ ] Commit `feat(suporte): visualizador 3D (base, rolamento e motor)`.

### Task 2: Redutor, Correia e polias, Bomba, Cilindro, Válvula, Esteira
**Files:** Create `.../3d/Redutor.tsx`, `Correia.tsx`, `Bomba.tsx`, `Cilindro.tsx`, `Valvula.tsx`, `Esteira.tsx`; registrar no
`Visualizador3D`.
- [ ] Cada modelo com todas as peças nomeadas de `MODELOS`, posições de vista explodida e escala coerente (cabe na câmera
  padrão). Commit `feat(suporte): modelos 3D dos demais equipamentos`.

### Task 3: Integração, E2E e verificação
**Files:** Modify `web/app/(app)/suporte/` (diagnóstico e guia), `web/e2e/telas.spec.ts`.
- [ ] Diagnóstico: bloco "Visualização 3D" abaixo das causas quando `MODELO_DO_TIPO[tipo]` existe; o marcador inicial é o
  da 1ª causa com peça. Guia: bloco quando o guia é de um equipamento com modelo (mapa simples guia→modelo nos dados).
- [ ] E2E (spec "Testes"); capturas 1280/390 em `/tmp/claude-0/-home-user/5db15329-dc38-575b-a133-cb274cfe7ed3/scratchpad/3d-*.png`.
- [ ] Verificação completa; commit `feat(suporte): visualização 3D no diagnóstico e nos guias`.
