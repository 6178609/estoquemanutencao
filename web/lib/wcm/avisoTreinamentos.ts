/**
 * Aviso semanal aos líderes: os treinamentos da equipe vencidos ou que vencem em até 60 dias (a mesma regra da aba
 * Treinamentos e férias), para pedirem a reciclagem. Quem já tem a próxima turma lançada fica de fora — já está
 * encaminhado. Só montagem do texto (sem envio): testado em testes/avisoTreinamentos.test.ts.
 */
import type { Reciclagem } from "./treinamentos";
import { dataBr, type Dia } from "./util";

interface PessoaAviso { nome: string; cargo?: string; turma?: string }
export interface ItemAviso {
  np: string; nome: string; cargo: string; turma: string; titulo: string; validade: Dia; dias: number; vencido: boolean;
}

export function itensAviso(rec: Reciclagem[], pessoas: Map<string, PessoaAviso>): ItemAviso[] {
  return rec
    .filter((r) => (r.situacao === "Vencido" || r.situacao === "Vence em breve") && r.agendado == null && r.validade != null && r.dias != null)
    .map((r) => {
      const p = pessoas.get(r.np);
      return { np: r.np, nome: p?.nome || r.np, cargo: p?.cargo || "", turma: p?.turma || "", titulo: r.titulo,
        validade: r.validade!, dias: r.dias!, vencido: r.situacao === "Vencido" };
    })
    .sort((a, b) => a.dias - b.dias || a.nome.localeCompare(b.nome, "pt-BR"));
}

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const prazo = (i: ItemAviso) => (i.vencido ? `vencido há ${-i.dias} dia(s)` : i.dias === 0 ? "vence hoje" : `vence em ${i.dias} dia(s)`);

interface Email { assunto: string; texto: string; html: string }

/** O e-mail (texto puro e HTML) com a lista; `site` é o endereço da aba para o líder abrir. */
export function montarEmail(itens: ItemAviso[], hoje: Dia, site: string): Email {
  const vencidos = itens.filter((i) => i.vencido).length, vencendo = itens.length - vencidos;
  const assunto = `Treinamentos da manutenção: ${vencidos} vencido(s) e ${vencendo} vencendo em até 60 dias`;
  const intro = `Aviso semanal da Central de Manutenção (${dataBr(hoje)}): estes treinamentos da equipe de manutenção estão vencidos ou vencem em até `
    + "60 dias e ainda não têm turma lançada. Solicite a reciclagem e, quando a turma estiver marcada, lance na aba Treinamentos e férias.";
  const linhas = itens.map((i) => `- ${i.nome}${i.cargo ? ` (${i.cargo})` : ""} · ${i.titulo} · validade ${dataBr(i.validade)} · ${prazo(i)}`);
  const texto = [intro, "", ...linhas, "", `Abrir: ${site}`, "", "Você recebe este aviso por ser líder com e-mail no cadastro de usuários."].join("\n");
  const celula = "padding:6px 10px;border-bottom:1px solid #E2E7E3;text-align:left;vertical-align:top";
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111311;line-height:1.5">
<p style="margin:0 0 4px;color:#007A38;font-weight:bold;letter-spacing:.04em;font-size:12px">SIM · CENTRAL DE MANUTENÇÃO</p>
<h2 style="margin:0 0 12px;font-size:20px">${esc(assunto)}</h2>
<p>${esc(intro)}</p>
<table style="border-collapse:collapse;width:100%;font-size:13px">
<thead><tr style="background:#F4F6F4">${["Pessoa", "Treinamento", "Validade", "Prazo"].map((h) => `<th style="${celula}">${h}</th>`).join("")}</tr></thead>
<tbody>${itens.map((i) => `<tr><td style="${celula}">${esc(i.nome)}${i.cargo ? `<br><span style="color:#45494B">${esc(i.cargo)}${i.turma ? ` · turma ${esc(i.turma)}` : ""}</span>` : ""}</td>`
    + `<td style="${celula}">${esc(i.titulo)}</td><td style="${celula}">${dataBr(i.validade)}</td>`
    + `<td style="${celula};color:${i.vencido ? "#A4111A" : "#9A4705"};font-weight:bold">${prazo(i)}</td></tr>`).join("")}</tbody>
</table>
<p style="margin-top:16px"><a href="${esc(site)}" style="background:#007A38;color:#FFFFFF;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block">Abrir Treinamentos e férias</a></p>
<p style="color:#6B6D70;font-size:12px">Você recebe este aviso por ser líder com e-mail no cadastro de usuários.</p>
</div>`;
  return { assunto, texto, html };
}

/** Semana ISO no formato "2026-S42" (segunda a domingo): evita mandar o aviso duas vezes na mesma semana. */
export function semanaDoAno(d: Dia): string {
  const quinta = d - ((new Date(d * 86_400_000).getUTCDay() + 6) % 7) + 3; // a quinta-feira da semana define o ano
  const ano = new Date(quinta * 86_400_000).getUTCFullYear();
  const n = Math.floor((quinta - Math.round(Date.UTC(ano, 0, 1) / 86_400_000)) / 7) + 1;
  return `${ano}-S${String(n).padStart(2, "0")}`;
}
