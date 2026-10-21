import type { ReactNode } from "react";

import { Colunas, Grafico, Legenda, type Cor } from "@/components/graficos";
import { brl, brlCurto } from "@/lib/formato";
import type { ResultadoOrcamento } from "@/lib/wcm/orcamento";
import { MESES } from "@/lib/wcm/util";

import { Nota, Numeros } from "../../confiabilidade/_comum/Numeros";

/**
 * Orçamento do mês: valor disponível (cadastro) × ordens (IW38) e requisições aprovadas, com as requisições
 * aguardando aprovação (a entrar). Contas em lib/wcm/orcamento.ts; o editor do disponível vai no rodapé.
 */
export function Orcamento({ linhas, totais, semData, semTipo, editor }: ResultadoOrcamento & { editor?: ReactNode }) {
  const temReq = linhas.some((l) => l.requisicoes != null);
  const ordensTotal = linhas.reduce((s, l) => s + l.ordens, 0);
  const reqTotal = linhas.reduce((s, l) => s + (l.requisicoes ?? 0), 0);
  const nulBrl = (v: number | null) => (v == null ? "—" : brlCurto(v));
  const nulBr = (v: number | null) => (v == null ? "—" : brl(v));
  const saldoNeg = totais.saldo != null && totais.saldo < 0;
  const rotulo = (mes: string) => {
    const [ano, m] = mes.split("-").map(Number);
    return `${MESES[m - 1]}/${String(ano).slice(2)}`;
  };

  const series: { nome: string; cor: Cor; valores: (number | null)[] }[] = [
    { nome: "Ordens (IW38)", cor: "serie-1", valores: linhas.map((l) => l.ordens) },
    ...(temReq ? [{ nome: "Requisições aprovadas", cor: "serie-3" as Cor, valores: linhas.map((l) => l.requisicoes) }] : []),
  ];
  const colunas = ["Mês", "Disponível", "Ordens", ...(temReq ? ["Requisições", "Saldo", "A entrar"] : ["Saldo"])];
  const tabela = linhas.map((l) => [rotulo(l.mes), nulBr(l.disponivel), brl(l.ordens),
    ...(temReq ? [brl(l.requisicoes ?? 0)] : []), nulBr(l.saldo), ...(temReq ? [nulBr(l.aEntrar)] : [])]);

  const notas: string[] = [
    "Requisições valem para a fábrica inteira; as ordens seguem o recorte do filtro.",
    "Requisição entra no mês 30 dias após o envio (material) ou 15 dias (serviço); sem data de envio, conta a partir do último envio.",
    "Possível duplicidade: a mesma despesa pode aparecer como ordem e como requisição; o gasto soma as duas bases.",
    "A entrar = requisições aguardando aprovação. 'Ação de comprador pendente' já é aprovada e entra no valor (no cartão Travado ela aparece como pendente).",
    "Mês sem valor disponível cadastrado fica com saldo “—”, nunca como zero.",
  ];
  if (!temReq) notas.unshift("Sem base de requisições: só as ordens entram no gasto.");
  if (totais.disponivel == null) notas.push("Nenhum mês do período tem valor disponível cadastrado.");
  if (semTipo) notas.push("A base de requisições não tem a coluna de tipo: todas foram tratadas como material (prazo de 30 dias).");
  if (semData > 0) notas.push(semData === 1 ? "1 requisição sem data de envio ficou fora." : `${semData} requisições sem data de envio ficaram fora.`);

  return (
    <div className="space-y-5">
      <Numeros itens={[
        { rotulo: "Disponível", valor: nulBrl(totais.disponivel), detalhe: "soma dos meses com valor cadastrado", dica: "Valor disponível mensal lançado no cadastro (rodapé)" },
        { rotulo: "Gasto", valor: brlCurto(totais.gasto), detalhe: `ordens ${brlCurto(ordensTotal)}${temReq ? ` · requisições aprovadas ${brlCurto(reqTotal)}` : ""}`,
          dica: "Ordens (IW38) mais requisições aprovadas, somadas em todos os meses da tabela" },
        { rotulo: "Saldo", valor: nulBrl(totais.saldo), cor: saldoNeg ? "var(--st-critico)" : undefined,
          detalhe: saldoNeg ? "gasto acima do disponível" : "disponível menos gasto, meses com valor", dica: "Disponível − ordens − requisições aprovadas" },
        { rotulo: "A entrar", valor: temReq ? nulBrl(totais.aEntrar) : "—", detalhe: "requisições aguardando aprovação", dica: "Requisições pendentes de aprovação, no mês em que entram" },
      ]} />

      <Grafico titulo="Orçamento × gasto por mês" subtitulo="Barras empilhadas: ordens e requisições aprovadas · traço verde = valor disponível do mês"
        legenda={<Legenda series={series} />} tabela={{ colunas, linhas: tabela }}>
        <Colunas rotulos={linhas.map((l) => rotulo(l.mes))} series={series} empilhar metaPorRotulo={linhas.map((l) => l.disponivel)}
          formato="R$" altura={260} rotular="ultimo" />
      </Grafico>

      <div className="space-y-2">
        {notas.map((t) => <Nota key={t}>{t}</Nota>)}
      </div>

      {editor && (
        <details className="rounded-cartao border border-borda bg-superficie">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-display text-[16px] font-medium [&::-webkit-details-marker]:hidden">
            Lançar valor disponível
          </summary>
          <div className="border-t border-borda p-5">{editor}</div>
        </details>
      )}
    </div>
  );
}
