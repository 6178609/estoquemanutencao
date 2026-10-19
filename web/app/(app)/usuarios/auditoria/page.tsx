import { ArrowLeft, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, Cabecalho, Pagina } from "@/components/ui";
import { ACOES, eventos, RETENCAO_DIAS, type Evento } from "@/lib/auditoria";
import { ehAdmin } from "@/lib/auth/acesso";
import { exigir } from "@/lib/auth/sessao";
import { usuarios } from "@/lib/auth/usuarios";

export const metadata: Metadata = { title: "Auditoria" };
export const dynamic = "force-dynamic";

const LIMITE = 500;
const CAMPO = "min-h-10 rounded-lg border border-borda-forte bg-superficie px-3 text-[13.5px] focus:border-marca-500 focus:outline-none";
const quando = (s: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" }).format(new Date(s));
const valor = (v: unknown) => (Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "sim" : "não") : String(v ?? ""));

/** Trilha de auditoria (só administradores): quem fez o quê e quando, com filtro por pessoa, ação e período. */
export default async function Auditoria(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const eu = await exigir();
  if (!ehAdmin(eu) || eu.demo) redirect("/");
  const sp = await props.searchParams;
  const um = (k: string) => String((Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "").trim();
  const f = { quem: um("quem"), acao: Object.hasOwn(ACOES, um("acao")) ? um("acao") : "", desde: um("desde"), ate: um("ate") };
  const [us, lidos] = await Promise.all([usuarios(), eventos({ ...f, limite: LIMITE }).then((l) => ({ l, erro: "" }), (e: Error) => ({ l: [] as Evento[], erro: e.message }))]);
  const nomes = new Map(Object.entries(us).map(([login, v]) => [login, v.nome || ""]));

  return (
    <Pagina>
      <Cabecalho titulo="Auditoria," destaque="quem fez o quê e quando."
        subtitulo={`Entradas, senhas, usuários e permissões, bases enviadas, planilhas baixadas e alocações do MRO. Fica guardado por ${Math.round(RETENCAO_DIAS / 30)} meses.`}
        acoes={<Link href="/usuarios" className={BOTAO_SECUNDARIO}><ArrowLeft className="size-4" /> Usuários</Link>} />

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-cartao border border-borda bg-superficie p-4">
        <label className="flex flex-col gap-1 text-[12.5px] text-texto-3">Pessoa (NP)
          <select name="quem" defaultValue={f.quem} className={CAMPO}>
            <option value="">Todas</option>
            {[...nomes].sort(([a], [b]) => a.localeCompare(b)).map(([l, n]) => <option key={l} value={l}>{l}{n ? ` · ${n}` : ""}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] text-texto-3">Ação
          <select name="acao" defaultValue={f.acao} className={CAMPO}>
            <option value="">Todas</option>
            {Object.entries(ACOES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] text-texto-3">De
          <input type="date" name="desde" defaultValue={f.desde} className={CAMPO} />
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] text-texto-3">Até
          <input type="date" name="ate" defaultValue={f.ate} className={CAMPO} />
        </label>
        <button className={BOTAO_PRIMARIO}>Filtrar</button>
        {(f.quem || f.acao || f.desde || f.ate) && <Link href="/usuarios/auditoria" className="min-h-10 content-center text-[13px] text-texto-3 hover:text-texto">Limpar</Link>}
      </form>

      {lidos.erro ? (
        <p role="alert" className="rounded-cartao border border-perigo-500/30 bg-perigo-500/10 px-4 py-3 text-[13.5px] text-perigo-500">{lidos.erro}</p>
      ) : (
        <div className="overflow-x-auto rounded-cartao border border-borda bg-superficie">
          <table className="w-full min-w-[760px] text-left text-[13.5px]">
            <thead className="border-b border-borda bg-superficie-2 text-[12px] text-texto-3">
              <tr>{["Quando", "Quem", "O quê", "Alvo", "Detalhes"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-borda divide-y">
              {lidos.l.map((e, i) => (
                <tr key={`${e.em}-${i}`}>
                  <td className="num whitespace-nowrap px-4 py-2.5 text-texto-3">{quando(e.em)}</td>
                  <td className="px-4 py-2.5"><span className="num font-mono">{e.quem}</span>{nomes.get(e.quem) ? <span className="text-texto-3"> · {nomes.get(e.quem)}</span> : null}</td>
                  <td className="px-4 py-2.5">{ACOES[e.acao] ?? e.acao}</td>
                  <td className="px-4 py-2.5 text-texto-2">{e.alvo || "—"}</td>
                  <td className="px-4 py-2.5 text-[12.5px] text-texto-3">
                    {Object.entries(e.detalhe ?? {}).map(([k, v]) => <span key={k} className="mr-3 inline-block">{k.replaceAll("_", " ")}: <b className="font-medium text-texto-2">{valor(v)}</b></span>)}
                  </td>
                </tr>
              ))}
              {!lidos.l.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-texto-3">Nenhum registro com estes filtros.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <p className="flex items-start gap-2 text-[12.5px] text-texto-3">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        Mostra os {LIMITE} registros mais novos com os filtros. Nunca guarda senha, token ou o conteúdo das planilhas — só o nome do arquivo e o número de linhas.
        Veja o que o site guarda de cada pessoa em <Link href="/privacidade" className="underline">Privacidade</Link>.
      </p>
    </Pagina>
  );
}
