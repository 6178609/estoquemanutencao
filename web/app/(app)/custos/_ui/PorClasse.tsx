import { Grafico } from "@/components/graficos";
import { brl, brlCurto } from "@/lib/formato";
import type { porCriticidade } from "@/lib/wcm/custo360";

type Criticidade = ReturnType<typeof porCriticidade>;

const ROTULO: Record<string, string> = { A: "A", B: "B", C: "C", "Sem classe": "Sem classe" };
const TITULO = "Custo por ativo, por classe";
const SUBTITULO = "Médio por equipamento de cada classe de criticidade (IH08)";

/**
 * Custo médio por ativo em cada classe A/B/C (e "Sem classe"). Colunas acima da média geral em laranja, abaixo em azul;
 * a linha tracejada é a média geral. Sem IH08, ou com filtro de centro/tipo (o número de ativos não bate), mostra "—".
 */
export function PorClasse({ dados, semIh08, comFiltroCentroTipo }: { dados: Criticidade; semIh08: boolean; comFiltroCentroTipo: boolean }) {
  if (semIh08 || comFiltroCentroTipo) {
    return (
      <Grafico titulo={TITULO} subtitulo={SUBTITULO}>
        <div className="font-display text-[26px] font-medium leading-none text-texto-3">—</div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-texto-3">
          {semIh08
            ? "IH08 (equipamentos) ausente: sem ele não dá para medir o custo por ativo de cada classe."
            : "Com filtro de centro ou tipo, o número de ativos não bate com o recorte: o custo por ativo não se aplica."}
        </p>
      </Grafico>
    );
  }

  const linhas = dados.linhas.flatMap((l) => (l.medio == null ? [] : [{ ...l, medio: l.medio }]));
  if (!linhas.length) {
    return (
      <Grafico titulo={TITULO} subtitulo={SUBTITULO}>
        <p className="text-[13px] text-texto-3">Sem ordens de equipamento com classe no recorte.</p>
      </Grafico>
    );
  }

  const max = Math.max(...linhas.map((l) => l.medio), dados.mediaGeral ?? 0);
  // 80% da altura: sobra espaço para o valor escrito em cima da coluna
  const alt = (v: number) => `${max > 0 ? (v / max) * 80 : 0}%`;

  return (
    <Grafico titulo={TITULO} subtitulo={SUBTITULO}
      tabela={{ colunas: ["Classe", "Ativos", "Custo médio por ativo"], linhas: linhas.map((l) => [ROTULO[l.classe], l.ativos, brl(l.medio)]) }}>
      <div className="relative flex h-44 items-end gap-3">
        {dados.mediaGeral != null && (
          <div aria-hidden className="pointer-events-none absolute inset-x-0 border-t border-dashed border-texto-2" style={{ bottom: alt(dados.mediaGeral) }} />
        )}
        {linhas.map((l) => (
          <div key={l.classe} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
            <span className="num mb-1 text-[12px] text-texto-2">{brlCurto(l.medio)}</span>
            <div className="w-full max-w-[56px] rounded-t-md" style={{ height: alt(l.medio), background: l.acimaDaMedia ? "var(--st-serio)" : "var(--serie-1)" }} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-3">
        {linhas.map((l) => (
          <div key={l.classe} className="flex min-w-0 flex-1 justify-center">
            <span className="rounded-full border border-borda bg-superficie-2 px-2.5 py-0.5 text-[12px] font-medium">{ROTULO[l.classe]}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-texto-3">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm" style={{ background: "var(--st-serio)" }} />acima da média</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm" style={{ background: "var(--serie-1)" }} />abaixo da média</span>
        {dados.mediaGeral != null && <span>tracejado: média geral {brl(dados.mediaGeral)} por ativo</span>}
      </div>
      {dados.semCodigo > 0 && (
        <p className="mt-3 text-[12.5px] leading-relaxed text-texto-3">{brlCurto(dados.semCodigo)} em ordens sem equipamento ficam fora da média.</p>
      )}
    </Grafico>
  );
}
