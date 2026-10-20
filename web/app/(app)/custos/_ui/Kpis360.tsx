import type { ReactNode } from "react";

import { SeloFarol } from "@/components/Indicador";
import { brl, brlCurto } from "@/lib/formato";
import type { Farol } from "@/lib/wcm/indicadores";

/** Cinco cartões do topo da aba Custos. Valores já calculados pela página; null = sem dado (mostra "—"). */
export interface Kpis360Props {
  total: number;
  /** variação % do total contra o período anterior de mesma duração; null esconde (sem ordens lá) */
  variacao: number | null;
  porAtivoMes: number | null;
  nAtivos: number;
  /** false com filtro de centro ou tipo: custo por ativo não se aplica */
  ativoAplica: boolean;
  medioOrdem: number | null;
  ordensComCusto: number;
  backlog: { pct: number | null; meta: number | null; farol: Farol; comPlanoPct: number | null; dica: string };
  travado: number | null;
}

const nf0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const pctTxt = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? "—" : `${nf1.format(v)}%`);
const limita = (v: number) => Math.min(100, Math.max(0, v));
const FILETE_FAROL: Record<Farol, string> = { verde: "var(--st-bom)", amarelo: "var(--st-atencao)", vermelho: "var(--st-critico)", neutro: "var(--grade)" };

function Cartao({ filete, rotulo, dica, valor, children }: { filete: string; rotulo: string; dica?: string; valor: ReactNode; children?: ReactNode }) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-cartao border border-borda bg-superficie p-4">
      <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: filete }} />
      <div className="text-[12.5px] font-medium leading-snug text-texto-2" title={dica}>{rotulo}</div>
      <div className="num mt-2 font-display text-[21px] font-medium leading-none tracking-[-0.02em] sm:text-[26px]">{valor}</div>
      {children && <div className="mt-2 text-[12px] leading-snug text-texto-3">{children}</div>}
    </div>
  );
}

export function Kpis360(p: Kpis360Props) {
  const { backlog } = p;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Cartao filete="var(--serie-1)" rotulo="Custo total" valor={brlCurto(p.total)}>
        <span className="block">{brl(p.total)}</span>
        {p.variacao != null && (
          <span className="mt-1 block text-texto-2" title="vs período anterior de mesma duração">
            {p.variacao >= 0 ? "▲" : "▼"} {nf0.format(Math.abs(p.variacao))}% vs período anterior
          </span>
        )}
      </Cartao>

      <Cartao filete="var(--serie-1)" rotulo="Custo por ativo / mês" valor={p.ativoAplica ? brlCurto(p.porAtivoMes) : "—"}>
        {p.ativoAplica ? (
          <span>{nf0.format(p.nAtivos)} equipamentos ativos no recorte</span>
        ) : (
          <span>não se aplica com filtro de centro/tipo</span>
        )}
      </Cartao>

      <Cartao filete="var(--serie-1)" rotulo="Custo médio por ordem" valor={brlCurto(p.medioOrdem)}>
        <span>{nf0.format(p.ordensComCusto)} ordens com custo</span>
      </Cartao>

      <Cartao filete={FILETE_FAROL[backlog.farol]} rotulo="Custo sem plano (backlog)" dica={backlog.dica} valor={pctTxt(backlog.pct)}>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <SeloFarol farol={backlog.farol} compacto />
          <span>meta {backlog.meta != null ? pctTxt(backlog.meta) : "—"}</span>
        </span>
        <span className="mt-1 block">com plano hoje {pctTxt(backlog.comPlanoPct)}</span>
        <span aria-hidden className="relative mt-2 block h-1.5 rounded-full bg-superficie-3">
          <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${limita(backlog.pct ?? 0)}%`, background: "var(--st-serio)" }} />
          {backlog.meta != null && (
            <span className="absolute -top-1 h-3.5 w-0.5" style={{ left: `${limita(backlog.meta)}%`, background: "var(--texto)" }} />
          )}
        </span>
      </Cartao>

      <Cartao filete="var(--st-serio)" rotulo="Total travado" valor={brlCurto(p.travado)}>
        <span>pendente de aprovação, aberto ou sem confirmação; inclui requisições da fábrica inteira</span>
      </Cartao>
    </div>
  );
}
