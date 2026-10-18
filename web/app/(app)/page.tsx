import { ChevronRight, CircleCheck, ClipboardList, Database, GraduationCap, Package, Search } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Icone } from "@/components/Icone";
import { Cartao, IconeQuadro, Pilula, Selo, Titulo, type Tom } from "@/components/ui";
import { podeVer, soEstoque, type Usuario } from "@/lib/auth/acesso";
import { exigir } from "@/lib/auth/sessao";
import { almoxarifado } from "@/lib/dados/bases";
import { modo } from "@/lib/dados/fonte";
import { inteiro, saudacao } from "@/lib/formato";
import { GRUPOS } from "@/lib/navegacao";
import { contexto, dados as dadosDo, type Contexto } from "@/lib/wcm/contexto";
import * as hh from "@/lib/wcm/hh";
import * as ind from "@/lib/wcm/indicadores";
import { alertasInicio, type Alerta, type EntradaInicio, type NivelAlerta } from "@/lib/wcm/inicio";
import * as tr from "@/lib/wcm/treinamentos";
import { dataBr, partes } from "@/lib/wcm/util";

import { doRecorte, noPeriodo } from "./ordens/dados";

export const dynamic = "force-dynamic";

/** Cor do alerta: a borda esquerda (sombra inset) e o ícone seguem o token do nível. */
const TOM: Record<NivelAlerta, Tom> = { critico: "vermelho", serio: "laranja", atencao: "amarelo" };
const ICONE_ALERTA: Record<Alerta["id"], typeof Package> = { ordens: ClipboardList, estoque: Package, reciclagens: GraduationCap };
/** Prioridade alta no IW38 (valor "1", o mesmo que a tela Ordens mostra na coluna Prioridade). */
const PRIORIDADE_ALTA = "1";

/** Um bloco que falhar (base ausente, erro de leitura) vira null: a página segue sem ele. */
async function seguro<T>(fn: () => T | Promise<T>): Promise<T | null> {
  try { return await fn(); } catch { return null; }
}

/** Equipe da Gestão de HH e as ausências dela (mesmas chamadas da aba Treinamentos e férias). */
type EquipeInicio = { aus: hh.Ausencia[] };
function equipeDoInicio(c: Contexto): EquipeInicio {
  const pes = hh.pessoas(c.b.equipe.dados ?? [], c.cad.hh, ind.horasSemanaDe(c.cad.metas));
  const np = new Set(pes.map((p) => p.np));
  const aus = hh.ausencias(c.cad.hh).filter((a) => np.has(a.np));
  return { aus };
}

/** Reciclagens vencidas e as que vencem em até 60 dias (mesma regra da aba Treinamentos e férias). */
function reciclagensDoInicio(c: Contexto, { aus }: EquipeInicio): EntradaInicio["reciclagens"] {
  const rec = tr.reciclagens(aus.filter((a) => a.tipo === tr.TREINAMENTO), c.b.hoje);
  const vencidas = rec.filter((r) => r.situacao === "Vencido"), vencendo = rec.filter((r) => r.situacao === "Vence em breve");
  return { vencidas: vencidas.length, vencendo: vencendo.length, titulos: [...new Set([...vencidas, ...vencendo].map((r) => r.titulo))] };
}

/** A semana (segunda a domingo de hoje): aderência, ordens concluídas, HH disponível e quem está fora hoje. */
async function semanaDoInicio(c: Contexto, u: Usuario, eq: EquipeInicio | null) {
  const hoje = c.b.hoje;
  const seg = hoje - ((partes(hoje).semana + 6) % 7), dom = seg + 6;
  const d = await dadosDo(c);
  const r = ind.calcular(d, seg, dom);
  const itens: { rotulo: string; valor: string }[] = [];
  if (podeVer(u, "planos") && r.aderencia != null) itens.push({ rotulo: "Aderência ao plano", valor: ind.formatar(ind.POR_ID.aderencia, r.aderencia) });
  if (podeVer(u, "ordens") && c.b.ordens.dados) {
    const concluidas = doRecorte(c).filter((o) => o.situacao === "Concluída" && o.fimReal != null && o.fimReal >= seg && o.fimReal <= dom).length;
    itens.push({ rotulo: "Ordens concluídas", valor: inteiro(concluidas) });
  }
  if (podeVer(u, "mao_de_obra")) {
    const h = ind.hhDisponiveis(d, seg, dom);
    if (h != null) itens.push({ rotulo: "HH disponível", valor: `${inteiro(Math.round(h))} h` });
  }
  if (podeVer(u, "treinamentos_ferias") && c.b.equipe.dados && eq) {
    itens.push({ rotulo: "Pessoas fora hoje", valor: inteiro(new Set(tr.foraEm(eq.aus, hoje).map((a) => a.np)).size) });
  }
  return { seg, dom, itens };
}

export default async function Inicio() {
  const u = await exigir();
  if (soEstoque(u)) redirect("/estoque");
  const verEstoque = podeVer(u, "estoque"), verOrdens = podeVer(u, "ordens"), verTreinos = podeVer(u, "treinamentos_ferias");
  const verSemana = ["planos", "ordens", "mao_de_obra", "treinamentos_ferias"].some((p) => podeVer(u, p));
  const verBusca = podeVer(u, "busca");

  const [almox, c] = await Promise.all([
    verEstoque ? seguro(() => almoxarifado()) : null,
    verOrdens || verTreinos || verSemana ? seguro(() => contexto({})) : null,
  ]);

  const eq = c && (verTreinos || verSemana) ? await seguro(() => equipeDoInicio(c)) : null;
  const [ordens, reciclagens, semana] = await Promise.all([
    verOrdens && c ? seguro(() => {
      if (!c.b.ordens.dados) return null;
      const xs = noPeriodo(c, doRecorte(c)).filter((o) => o.atrasada);
      return { atrasadas: xs.length, altaPrioridade: xs.filter((o) => o.prioridade.trim() === PRIORIDADE_ALTA).length };
    }) : null,
    verTreinos && c && eq ? seguro(() => (c.b.equipe.dados ? reciclagensDoInicio(c, eq) : null)) : null,
    verSemana && c ? seguro(() => semanaDoInicio(c, u, eq)) : null,
  ]);

  const estoque = almox?.estoque.dados ? { zerados: almox.itens.filter((i) => i.situacao === "Zerado").length,
    abaixo: almox.itens.filter((i) => i.situacao === "Abaixo do mínimo").length } : null;
  const alertas = alertasInicio({ ordens, estoque, reciclagens });
  const algumBloco = [ordens, estoque, reciclagens].some((b) => b != null);

  const abas = GRUPOS.flatMap((g) => g.abas.map((a) => ({ ...a, grupo: g.titulo }))).filter((a) => podeVer(u, a.id));
  const primeiroNome = (u.nome || u.login).split(" ")[0];
  const data = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const hoje = data.charAt(0).toUpperCase() + data.slice(1);

  return (
    <>
      <section className="border-b border-borda">
        <div className="mx-auto max-w-[1240px] space-y-6 px-4 py-10 sm:px-8 lg:py-14">
          <Pilula>{hoje}</Pilula>
          <Titulo titulo={`${saudacao()}, ${primeiroNome}.`} destaque="Isto pede atenção agora." />
          {verBusca && (
            <form role="search" action="/busca" method="get" className="flex max-w-3xl flex-col gap-3 sm:flex-row">
              <label htmlFor="busca-inicio" className="sr-only">Buscar na Central de Manutenção</label>
              <input id="busca-inicio" name="q" type="search" enterKeyHint="search"
                placeholder="Ordem, nota, equipamento, material, plano, AF, texto…"
                className="h-12 min-w-0 flex-1 rounded-xl border border-borda-forte bg-superficie px-4 text-[15px] text-texto placeholder:text-texto-3" />
              <button type="submit" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-tinta px-6 font-display text-[15px] font-medium text-tinta-texto transition hover:bg-[var(--acao-forte)]">
                <Search className="size-4" /> Buscar
              </button>
            </form>
          )}
        </div>
      </section>

      <div className="mx-auto w-full max-w-[1240px] space-y-12 px-4 py-10 sm:px-8">
        {alertas.length > 0 && (
          <section aria-label="Alertas" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {alertas.map((a) => (
              <Link prefetch={false} key={a.id} href={a.href}
                className="group flex min-h-11 items-start gap-4 rounded-cartao border border-borda bg-superficie p-5 transition hover:border-borda-forte"
                style={{ boxShadow: `inset 4px 0 0 var(--selo-${a.nivel}-texto)` }}>
                <IconeQuadro icone={ICONE_ALERTA[a.id]} tom={TOM[a.nivel]} />
                <div className="min-w-0 flex-1">
                  <div className="num font-display text-[32px] font-medium leading-none tracking-[-0.03em]">{inteiro(a.numero)}</div>
                  <div className="mt-2 text-[15px] font-medium text-texto">{a.titulo}</div>
                  <div className="mt-1 text-[13px] leading-snug text-texto-3">{a.detalhe}</div>
                </div>
                <ChevronRight className="mt-1 size-4 shrink-0 text-texto-3 transition group-hover:text-texto" />
              </Link>
            ))}
          </section>
        )}
        {alertas.length === 0 && algumBloco && (
          <Cartao className="flex items-center gap-4 p-5">
            <IconeQuadro icone={CircleCheck} tom="verde" />
            <div>
              <div className="font-display text-[15px] font-medium">Tudo em dia</div>
              <p className="mt-1 text-[13.5px] text-texto-3">Nenhuma ordem atrasada, material faltando nem reciclagem vencida no seu acesso.</p>
            </div>
            <Selo cor="verde" className="ml-auto">Em dia</Selo>
          </Cartao>
        )}

        <section className="space-y-5">
          <Titulo nivel={2} titulo="Suas abas," destaque="num lugar só." />
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
            {abas.map((a) => (
              <Link prefetch={false} key={a.id} href={a.rota}
                className="group flex min-h-11 items-center gap-3 rounded-cartao border border-borda bg-superficie p-4 transition hover:border-borda-forte hover:bg-superficie-2">
                <span className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-borda bg-superficie-2">
                  <Icone nome={a.icone} className="size-5 text-texto-2" strokeWidth={1.75} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium text-texto-2 group-hover:text-texto">{a.titulo}</span>
                  <span className="block truncate text-[12px] text-texto-3">{a.grupo}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        {semana && semana.itens.length > 0 && (
          <section className="rounded-cartao bg-menu p-6 text-menu-texto sm:p-8">
            <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-menu-apoio">
              {dataBr(semana.seg)} a {dataBr(semana.dom)}
            </div>
            <h2 className="mt-1 font-display text-[26px] font-semibold tracking-[-0.02em]">A semana em números</h2>
            <dl className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {semana.itens.map((i) => (
                <div key={i.rotulo} className="rounded-cartao bg-menu-2 p-4">
                  <dt className="text-[12.5px] text-menu-apoio">{i.rotulo}</dt>
                  <dd className="num mt-2 font-display text-[30px] font-medium leading-none">{i.valor}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section>
          <div className="flex items-start gap-4 rounded-cartao border border-borda bg-superficie-2 p-6">
            <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-borda bg-superficie text-alp-azul">
              <Database className="size-[17px]" strokeWidth={1.75} />
            </span>
            <div>
              <div className="font-display text-[15px] font-medium">Fonte de dados</div>
              <p className="mt-1 text-[13.5px] text-texto-3">
                {modo() === "demo" ? "Demonstração (dados fictícios). Para os dados reais, preencha DADOS_GH_REPO e DADOS_GH_TOKEN nas variáveis do projeto na Vercel."
                  : modo() === "github" ? "Repositório privado de dados — atualizado em Fontes de dados." : "Pasta local."}
              </p>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
