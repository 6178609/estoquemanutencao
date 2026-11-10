import { Download, ImageIcon } from "lucide-react";
import type { Metadata } from "next";

import { Secao } from "@/components/PaginaWcm";
import { Cabecalho, Kpi, Pagina, Selo } from "@/components/ui";
import { exigir } from "@/lib/auth/sessao";
import { lerPedidos, papelDe, tagsEquipamentos } from "@/lib/cadastroMaterial/dados";
import * as R from "@/lib/cadastroMaterial/regras";
import { catalogo } from "@/lib/dados/bases";
import { inteiro } from "@/lib/formato";

import { Controles } from "../planos/_comum/Controles";
import { um, type Params } from "../planos/_comum/params";
import { AcoesPedido, LISTA_EQUIPAMENTOS, NovoPedido } from "./Formularios";

export const metadata: Metadata = { title: "Cadastro de material" };
export const dynamic = "force-dynamic";

const SELO: Record<R.Situacao, "azul" | "verde" | "vermelho"> = {
  [R.AG_ALMOX]: "azul", [R.AG_CHEGADA]: "azul", [R.AG_PCM]: "azul", [R.CONCLUIDO]: "verde", [R.RECUSADO]: "vermelho",
};
const ETAPA: Record<R.Evento["acao"], string> = {
  lancar: "Lançado", editar: "Editado", aprovar: "Aprovado pelo almoxarifado", recusar: "Recusado pelo almoxarifado",
  chegou: "Chegada registrada", validar: "Validado pelo PCM", recusar_chegada: "Chegada recusada pelo PCM",
};
const FUSO = "America/Sao_Paulo";
const quando = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso
    : new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, dateStyle: "short", timeStyle: "short" }).format(d);
};
const rotuloMes = (m: string) => {
  const t = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${m}-01T12:00:00Z`));
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const semZeros = (v: string) => v.replace(/^0+/, "");
const fotoUrl = (p: R.Pedido, f: "pedido" | "chegada") =>
  `/api/cadastro_material?${new URLSearchParams({ p: p.id, f, v: (f === "pedido" ? p.foto : p.fotoChegada)?.arquivo ?? "" })}`;

/** Descrição do catálogo só dos códigos SAP que aparecem nos pedidos (sem a base: mapa vazio). */
async function descricoesCatalogo(saps: Set<string>): Promise<Map<string, string>> {
  const itens = (await catalogo().catch(() => null))?.dados ?? [];
  const m = new Map<string, string>();
  for (const i of itens) {
    const cod = semZeros(String(i.material ?? ""));
    const d = (i.descricaoCurta || i.descrCompleta || "").trim();
    if (saps.has(cod) && d && !m.has(cod)) m.set(cod, d);
  }
  return m;
}

export default async function CadastroMaterial(props: { searchParams: Promise<Params> }) {
  const u = await exigir("cadastro_material");
  const params = await props.searchParams;
  const papel = papelDe(u, true); // exigir já conferiu a aba
  const mesAtual = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date()).slice(0, 7);
  const [todos, equipamentos] = await Promise.all([lerPedidos(), tagsEquipamentos()]);
  const catalogoSap = await descricoesCatalogo(new Set(todos.map((p) => semZeros(p.sap))));

  const situacao = (R.SITUACOES as readonly string[]).includes(um(params, "situacao")) ? um(params, "situacao") : "";
  const meses = [...new Set([mesAtual, ...todos.map((p) => p.criadoEm.slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m))])].sort().reverse();
  const mes = meses.includes(um(params, "mes")) ? um(params, "mes") : "";
  const q = um(params, "q").slice(0, 100);
  const lista = R.ordenarPara(papel, R.filtrarPedidos(todos, { situacao, mes, q }));
  const k = R.resumo(todos, mesAtual);
  const planilha = `/api/cadastro_material?${new URLSearchParams({ planilha: "1", situacao, mes, q })}`;
  const esperando = papel.almox || papel.pcm;

  return (
    <Pagina>
      <Cabecalho titulo="Cadastro de material," destaque="do pedido à validação na chegada." sobre="Custos e suprimentos"
        subtitulo="Quem tem a aba lança o pedido com a foto; o Almoxarifado aprova e marca a chegada com a foto do material recebido; o PCM compara as fotos e valida." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Aguardando almoxarifado" valor={inteiro(k.agAlmox)} detalhe="pedidos para aprovar" tom="azul" />
        <Kpi rotulo="Aguardando chegada" valor={inteiro(k.agChegada)} detalhe="aprovados, material a caminho" tom="azul" />
        <Kpi rotulo="Aguardando PCM" valor={inteiro(k.agPcm)} detalhe="chegada para comparar e validar" tom="azul" />
        <Kpi rotulo="Concluídos no mês" valor={inteiro(k.concluidosMes)} detalhe={`validados em ${rotuloMes(mesAtual).toLowerCase()}`} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Controles className="min-w-0 flex-1" controles={[
          { tipo: "busca", chave: "q", valor: q, placeholder: "Buscar por descrição, SAP ou equipamento" },
          { tipo: "escolha", chave: "situacao", rotulo: "Situação", valor: situacao,
            opcoes: [{ valor: "", rotulo: "Todas" }, ...R.SITUACOES.map((s) => ({ valor: s, rotulo: s }))] },
          { tipo: "escolha", chave: "mes", rotulo: "Mês", valor: mes,
            opcoes: [{ valor: "", rotulo: "Todos" }, ...meses.map((m) => ({ valor: m, rotulo: rotuloMes(m) }))] },
        ]} />
        <a href={planilha} className="inline-flex h-11 items-center gap-2 rounded-xl border border-borda bg-superficie px-4 text-[13.5px] hover:bg-superficie-2">
          <Download className="size-4" /> Planilha
        </a>
      </div>

      <datalist id={LISTA_EQUIPAMENTOS}>
        {[...equipamentos].sort((a, b) => a[0].localeCompare(b[0], "pt-BR")).map(([tag, nome]) => <option key={tag} value={tag}>{nome}</option>)}
      </datalist>

      <Secao titulo="Pedidos" destaque={`· ${inteiro(lista.length)}`} acoes={<NovoPedido />}
        sub={esperando ? "O que espera por você vem primeiro; depois, o mais novo." : "Do mais novo para o mais antigo."}>
        {!lista.length ? (
          <p className="rounded-cartao border border-dashed border-borda px-5 py-8 text-center text-[13.5px] text-texto-3">
            {todos.length ? "Nenhum pedido com esses filtros." : "Nenhum pedido ainda. Lance o primeiro em “Novo pedido”."}
          </p>
        ) : (
          <ul className="grid items-start gap-3 lg:grid-cols-2">
            {lista.map((p) => <CartaoPedido key={p.id} p={p} papel={papel} catalogo={catalogoSap.get(semZeros(p.sap))} />)}
          </ul>
        )}
      </Secao>
    </Pagina>
  );
}

function Foto({ p, f, alt, className }: { p: R.Pedido; f: "pedido" | "chegada"; alt: string; className: string }) {
  return (
    <a href={fotoUrl(p, f)} target="_blank" rel="noopener noreferrer" className="block shrink-0 self-start overflow-hidden rounded-xl border border-borda bg-superficie-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- foto da rota autenticada, sem otimização */}
      <img src={fotoUrl(p, f)} alt={alt} loading="lazy" className={className} />
      <span className="sr-only"> (abre em nova aba)</span>
    </a>
  );
}

function CartaoPedido({ p, papel, catalogo }: { p: R.Pedido; papel: R.Papel; catalogo?: string }) {
  const pode = (acao: R.Acao) => !R.bloqueioDeAcao(papel, p, acao, "motivo informado");
  const permissoes = { editar: R.podeEditar(papel, p), aprovar: pode("aprovar"), recusar: pode("recusar"), chegou: pode("chegou"),
    validar: pode("validar"), recusarChegada: pode("recusar_chegada") };
  const comparar = p.situacao === R.AG_PCM && p.foto && p.fotoChegada;
  return (
    <li className="min-w-0 rounded-cartao border border-borda bg-superficie p-4">
      <div className="flex gap-3">
        {p.foto ? <Foto p={p} f="pedido" alt={p.descricao} className="size-20 object-cover" />
          : <div className="grid size-20 shrink-0 place-items-center rounded-xl border border-dashed border-borda text-texto-4" aria-label="Sem foto" role="img"><ImageIcon className="size-6" /></div>}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><Selo cor={SELO[p.situacao]}>{p.situacao}</Selo></div>
          <div className="mt-1.5 break-words font-medium">{p.descricao}</div>
          <div className="mt-1 break-words text-[12.5px] text-texto-3">
            SAP <span className="num font-medium text-texto-2">{p.sap}</span>{catalogo ? ` · Catálogo: ${catalogo}` : ""}
          </div>
          <div className="mt-0.5 break-words text-[12.5px] text-texto-3">
            Equipamento <span className="font-medium text-texto-2">{p.equipamento.tag}</span>{p.equipamento.nome ? ` · ${p.equipamento.nome}` : ""}
          </div>
          <div className="mt-0.5 text-[12px] text-texto-3">Lançado por {p.criadoPor} em {quando(p.criadoEm)}</div>
          {p.observacao && <div className="mt-1 break-words text-[12.5px] text-texto-2">{p.observacao}</div>}
        </div>
      </div>

      {comparar && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(["pedido", "chegada"] as const).map((f) => (
            <figure key={f} className="min-w-0">
              <Foto p={p} f={f} alt={`${p.descricao} (${f})`} className="aspect-[4/3] w-full object-cover" />
              <figcaption className="mt-1 text-[12px] text-texto-3">{f === "pedido" ? "Foto do pedido" : "Foto da chegada"}</figcaption>
            </figure>
          ))}
        </div>
      )}
      {!comparar && p.fotoChegada && (
        <a href={fotoUrl(p, "chegada")} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex text-[12.5px] font-medium text-acao underline-offset-2 hover:underline">
          Ver a foto da chegada<span className="sr-only"> (abre em nova aba)</span>
        </a>
      )}

      {p.historico.length > 0 && (
        <ol className="mt-3 space-y-1 border-l-2 border-borda pl-3" aria-label="Linha do tempo do pedido">
          {p.historico.map((e, i) => (
            <li key={i} className="text-[12px] text-texto-3">
              <span className="font-medium text-texto-2">{ETAPA[e.acao]}</span> · {e.por} · {quando(e.em)}
              {e.motivo && <span className="block text-[var(--selo-critico-texto)]">Motivo: {e.motivo}</span>}
            </li>
          ))}
        </ol>
      )}

      <div className="mt-3 empty:hidden">
        <AcoesPedido pedido={{ id: p.id, descricao: p.descricao, sap: p.sap, tag: p.equipamento.tag, observacao: p.observacao }} pode={permissoes} />
      </div>
    </li>
  );
}
