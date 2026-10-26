import "server-only";

import { gravarCadastroLote, lerCadastro } from "../dados/cadastros";
import { conferirFotoExterna, falhaPassageira, fotoDoCadastro, type FotoCadastro } from "../dados/fotosExternas";
import { fonte } from "../dados/fonte";
import { ARQUIVO_REFERENCIA } from "../dados/fotosReferencia";

/**
 * Conferência das fotos do fabricante: o servidor tenta carregar cada foto do cadastro como a tela faria. A que carrega
 * fica gravada com o endereço direto da imagem (`url`) e a data (`conferido_em`); a que falha de vez (bloqueio, página
 * sem foto, imagem quebrada) ganha `falhas` e sai da tela na hora (fotoDoCadastro a ignora), mas continua no cadastro:
 * nova tentativa depois de 3 dias (1ª falha) ou 30 dias (as seguintes). Falha passageira (tempo, rede, 429/5xx) não
 * conta; e se nada carregou numa rodada grande, é a rede, não as fotos: nada é gravado.
 */

const DIA_MS = 86_400_000;
const NOVA_TENTATIVA_DIAS = 3;
const NOVA_TENTATIVA_DEPOIS_DIAS = 30;
const PARALELAS = 6;
/** Rodada com ao menos este tanto de falhas e nenhum ok: problema de rede, as falhas não são gravadas. */
const DISJUNTOR = 20;

type Cadastro = Record<string, Record<string, unknown>>;

export interface ResumoConferencia { conferidas: number; ok: number; falharam: number; passageiras: number; pendentes: number }

/** As chaves a conferir: nunca conferidas, ou que falharam há mais de 3 dias (30 da 2ª falha em diante). Função pura. */
export function aConferir(cad: Cadastro, agora: number): string[] {
  return Object.keys(cad).filter((k) => {
    const r = cad[k];
    if (!r || typeof r !== "object" || typeof r.arquivo === "string") return false; // já guardada: não depende da loja
    const quando = typeof r.conferido_em === "string" ? Date.parse(r.conferido_em) : NaN;
    if (!Number.isFinite(quando)) return true;
    if (typeof r.falhas !== "number" || r.falhas <= 0) return false;
    return agora - quando > (r.falhas >= 2 ? NOVA_TENTATIVA_DEPOIS_DIAS : NOVA_TENTATIVA_DIAS) * DIA_MS;
  });
}

export interface OpcoesConferencia {
  limite: number;
  prazoMs: number;
  /** Só para os testes: outra leitura do cadastro e outro teste da foto. */
  ler?: () => Promise<Cadastro>;
  conferir?: (f: FotoCadastro) => Promise<string>;
  agora?: number;
}

export async function conferirFotos(o: OpcoesConferencia): Promise<ResumoConferencia> {
  const inicio = Date.now();
  const agora = o.agora ?? Date.now();
  const cad = await (o.ler ?? (() => lerCadastro(ARQUIVO_REFERENCIA)))();
  const conferir = o.conferir ?? conferirFotoExterna;
  const fila = aConferir(cad, agora);
  const alvo = fila.slice(0, o.limite);
  const em = new Date(agora).toISOString();
  const resultado: Record<string, (atual: Record<string, unknown> | undefined) => Record<string, unknown> | null | undefined> = {};
  const falhasDaRodada: string[] = [];
  let ok = 0, falharam = 0, passageiras = 0, i = 0;

  async function trabalhar() {
    while (i < alvo.length && Date.now() - inicio < o.prazoMs) {
      const k = alvo[i++];
      const bruto = cad[k];
      // a conferência olha o item como se não tivesse falhado antes (fotoDoCadastro ignora os que têm falhas)
      const f = fotoDoCadastro({ ...bruto, falhas: 0 });
      const pagina = bruto.pagina, urlAntes = bruto.url;
      // só grava se o item não mudou no meio (uma busca ou importação nova vence)
      const igual = (atual?: Record<string, unknown>) => !!atual && atual.pagina === pagina && atual.url === urlAntes;
      try {
        if (!f) throw new Error("sem endereço válido");
        const url = await conferir(f);
        ok++;
        resultado[k] = (atual) => (igual(atual) ? { ...atual, url, conferido_em: em, falhas: undefined } : undefined);
      } catch (e) {
        if (falhaPassageira(e)) { passageiras++; continue; } // fica para a próxima rodada
        falharam++;
        falhasDaRodada.push(k);
        const n = (typeof bruto.falhas === "number" ? bruto.falhas : 0) + 1;
        resultado[k] = (atual) => (igual(atual) ? { ...atual, falhas: n, conferido_em: em } : undefined);
      }
    }
  }
  await Promise.all(Array.from({ length: PARALELAS }, trabalhar));
  if (ok === 0 && falharam >= DISJUNTOR) {
    console.warn(`conferência de fotos: ${falharam} falhas e nenhuma ok; parece problema de rede, nada gravado`);
    for (const k of falhasDaRodada) delete resultado[k];
  }
  if (Object.keys(resultado).length) await gravarCadastroLote(ARQUIVO_REFERENCIA, resultado, "conferência de fotos", false);
  const conferidas = ok + falharam + passageiras;
  console.info(`conferência de fotos: ${conferidas} conferidas, ${ok} ok, ${falharam} falharam, ${passageiras} passageiras`);
  return { conferidas, ok, falharam, passageiras, pendentes: fila.length - ok - falharam };
}

// conferência aos poucos, quando alguém abre o Estoque: não depende da rotina diária (que pode não rodar) e não pesa
const INTERVALO_AOS_POUCOS_MS = 10 * 60_000;
let ultimaAosPoucos = 0;
let rodandoAosPoucos = false;

/**
 * Confere até 30 fotos (25 s) depois de a página do Estoque responder, no máximo uma vez a cada 10 min por servidor.
 * Só com o repositório de dados ligado (na demonstração, não). Nunca lança: o erro vai para o log.
 */
export async function conferirAosPoucos(agora = Date.now()): Promise<ResumoConferencia | null> {
  if (!fonte() || rodandoAosPoucos || agora - ultimaAosPoucos < INTERVALO_AOS_POUCOS_MS) return null;
  rodandoAosPoucos = true;
  ultimaAosPoucos = agora;
  try {
    return await conferirFotos({ limite: 30, prazoMs: 25_000 });
  } catch (e) {
    console.error("conferência de fotos (aos poucos):", e);
    return null;
  } finally {
    rodandoAosPoucos = false;
  }
}
