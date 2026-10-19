import "server-only";

import { lerCadastro } from "./dados/cadastros";
import { almoxarifado } from "./dados/bases";
import { indicadoresSim, roadmapSim } from "./dados/indicadoresSim";
import { contexto, resultados, serieMensal } from "./wcm/contexto";
import { bases } from "./wcm/dados";
import { ARQ_METAS } from "./wcm/indicadores";

/**
 * Pré-aquecimento: deixa este servidor com tudo na memória — as bases do SAP baixadas do repositório de dados e
 * preparadas, os cadastros, o estoque e os indicadores do mês — para a primeira pessoa que abrir o site não esperar o
 * download e o preparo. Chamado pelo agendamento (a cada 5 min, .github/workflows/aquecer.yml), depois de um envio em
 * Fontes de dados e por /api/aquecer. Cada etapa usa os mesmos caches das telas; com nada novo, volta em milissegundos.
 */
const g = globalThis as unknown as { __cmAquecimento?: { em: number; p: Promise<Etapas> } };
export type Etapas = Record<string, number | string>;
const INTERVALO_MS = 45_000; // pedidos seguidos no mesmo servidor reaproveitam o último aquecimento

async function medir(etapas: Etapas, nome: string, f: () => Promise<unknown>) {
  const t = Date.now();
  try {
    await f();
    etapas[nome] = Date.now() - t;
  } catch (e) {
    // a rota é pública: o detalhe fica só no log
    console.warn(`[aquecer] ${nome}: ${(e as Error).message}`);
    etapas[nome] = "erro";
  }
}

async function executar(): Promise<Etapas> {
  const etapas: Etapas = {};
  const t0 = Date.now();
  // primeiro as bases do SAP (o grosso), junto com o estoque, os cadastros e as planilhas do SIM
  await Promise.all([
    medir(etapas, "bases_sap", () => bases()),
    medir(etapas, "estoque", () => almoxarifado()),
    medir(etapas, "cadastros", () => Promise.all(["usuarios.json", "cadastro_equipamentos.json", "cadastro_materiais.json", ARQ_METAS]
      .map((n) => lerCadastro(n)))),
    medir(etapas, "sim", () => Promise.all([indicadoresSim(), roadmapSim()])),
  ]);
  // depois os indicadores do recorte padrão (mês atual, fábrica inteira), os mesmos do Início e do Painel
  await medir(etapas, "indicadores", async () => {
    const c = await contexto({});
    await Promise.all([resultados(c), serieMensal(c)]);
  });
  etapas.total = Date.now() - t0;
  return etapas;
}

/** Aquece (ou reaproveita o aquecimento dos últimos 45 s neste servidor). Nunca rejeita. */
export function aquecer(forcar = false): Promise<Etapas> {
  const a = g.__cmAquecimento;
  if (a && !forcar && Date.now() - a.em < INTERVALO_MS) return a.p;
  const p = executar().catch((e): Etapas => {
    console.warn(`[aquecer] ${(e as Error).message}`);
    return { total: "erro" };
  });
  g.__cmAquecimento = { em: Date.now(), p };
  return p;
}
