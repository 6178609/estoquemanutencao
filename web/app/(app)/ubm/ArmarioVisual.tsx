import Link from "next/link";

import * as R from "@/lib/ubm/regras";
import { enderecosQr, enderecoSite, qrSvg } from "@/lib/ubm/qr";

/**
 * O armário kanban desenhado como no infográfico da proposta (docs/propostas/UBM_infografico.png): cabeçalho com o id,
 * uma gaveta por família do kit (primeira palavra da descrição: RESISTENCIA, RELE, TERMOPAR…), etiqueta laranja "!" na
 * gaveta com item abaixo do mínimo, e a porta com o QR real de solicitação (o de retirada saiu: o líder confirma pela
 * IW13) e a faixa de segurança.
 * Cada gaveta abre (details/summary, sem JavaScript) e mostra os itens com o saldo.
 */

export interface LinhaVisual { codigo: string; descricao: string; um: string; saldo: number; minimo: number; maximo: number; repor: boolean }

const NOMES: Record<string, string> = {
  RESISTENCIA: "Resistências", RELE: "Relés", TERMOPAR: "Termopares", TERMORESISTENCIA: "Termorresistências", TUBING: "Tubos",
  DISJUNTOR: "Disjuntores", CONTROLADOR: "Controladores", ENCODER: "Encoders", MANOMETRO: "Manômetros", CORTINA: "Cortinas de luz",
  SENSOR: "Sensores", ROLAMENTO: "Rolamentos", CORREIA: "Correias", FUSIVEL: "Fusíveis", CONTATOR: "Contatores",
  VALVULA: "Válvulas", PARAFUSO: "Parafusos", RETENTOR: "Retentores", ANEL: "Anéis", FILTRO: "Filtros", MANGUEIRA: "Mangueiras",
  CONECTOR: "Conectores", LIMPA: "Limpeza", BOTAO: "Botões", MODULO: "Módulos", INVERSOR: "Inversores",
};

/** Família do item pela primeira palavra da descrição (sem acento); sem descrição, "Outros". */
export function familiaDe(descricao: string): string {
  const p = descricao.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().match(/[A-Z]+/)?.[0] ?? "";
  if (!p) return "Outros";
  return NOMES[p] ?? p.charAt(0) + p.slice(1).toLowerCase();
}

/** Agrupa as linhas do kit em gavetas (as de mais itens primeiro; as famílias de um item só vão para "Diversos" quando há muitas gavetas). */
export function gavetasDe(linhas: LinhaVisual[]): { nome: string; itens: LinhaVisual[]; alerta: boolean }[] {
  const m = new Map<string, LinhaVisual[]>();
  for (const l of linhas) {
    const f = familiaDe(l.descricao);
    m.set(f, [...(m.get(f) ?? []), l]);
  }
  let g = [...m.entries()].map(([nome, itens]) => ({ nome, itens }))
    .sort((a, b) => b.itens.length - a.itens.length || a.nome.localeCompare(b.nome, "pt-BR"));
  if (g.length > 9) {
    // até 8 gavetas próprias (as de mais itens); o resto vai para uma gaveta "Diversos" (juntando a que já existir)
    const proprias = g.filter((x) => x.nome !== "Diversos");
    const resto = [...g.filter((x) => x.nome === "Diversos"), ...proprias.slice(8)];
    g = [...proprias.slice(0, 8), { nome: "Diversos", itens: resto.flatMap((x) => x.itens) }];
  }
  return g.map((x) => ({ ...x, alerta: x.itens.some((i) => i.repor) }));
}

function Gaveta({ nome, itens, alerta, larga }: { nome: string; itens: LinhaVisual[]; alerta: boolean; larga?: boolean }) {
  return (
    <details className={`group rounded-md border border-black/15 bg-[linear-gradient(180deg,#f7f9f7,#dfe6e1)] shadow-[inset_0_1px_0_#fff] ${larga ? "col-span-full" : ""} open:col-span-full`}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-2 p-2.5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="inline-block max-w-full rounded-sm border border-[#c7d1cb] bg-white px-1.5 py-0.5 font-mono text-[10.5px] uppercase leading-tight tracking-[0.06em] break-words text-[#0f2a1c]">{nome}</span>
          <span className="mt-1.5 block text-[11px] text-[#5b6b62]">{itens.length} {itens.length === 1 ? "item" : "itens"}</span>
        </span>
        {alerta && <span title="Item abaixo do mínimo" role="img" aria-label="Item abaixo do mínimo" className="grid size-5 shrink-0 place-items-center rounded-sm bg-alp-laranja text-[11px] font-bold text-white">!</span>}
      </summary>
      <span aria-hidden className="mx-auto mb-2 block h-1.5 w-12 rounded-full bg-[#0f2a1c]/55 group-open:hidden" />
      <ul className="space-y-1 border-t border-black/10 bg-white/80 p-2 text-[11.5px]">
        {itens.map((i) => (
          <li key={i.codigo} className="flex items-baseline justify-between gap-3 border-b border-black/5 pb-1 last:border-0 last:pb-0">
            <span className="min-w-0"><span className="num mr-1 text-texto-3">{i.codigo}</span>{i.descricao}</span>
            <span className={`num shrink-0 font-semibold ${i.repor ? "text-[#b45309]" : "text-[#0f2a1c]"}`}>{R.fmtQtd(i.saldo)}/{R.fmtQtd(i.maximo)} {i.um}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

async function EtiquetaQr({ titulo, cor, url, rota, texto }: { titulo: string; cor: string; url: string; rota: string; texto: string }) {
  const svg = await qrSvg(url);
  return (
    <Link href={rota} className="block w-full max-w-[150px] overflow-hidden rounded-md bg-white text-center shadow-sm hover:ring-2 hover:ring-white/70" title={`Abrir o formulário de ${titulo.toLowerCase()}`}>
      <span className="block py-1.5 font-mono text-[11px] font-bold tracking-[0.18em] text-white" style={{ background: cor }}>{titulo}</span>
      {/* SVG gerado pelo pacote qrcode (só retângulos/caminhos), sem texto do usuário */}
      <span className="block p-2 [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      <span className="block px-1 pb-2 font-mono text-[9.5px] uppercase tracking-[0.08em] text-[#0f2a1c]">{texto}</span>
    </Link>
  );
}

export async function ArmarioVisual({ armario, linhas }: { armario: R.Armario; linhas: LinhaVisual[] }) {
  const gavetas = gavetasDe(linhas);
  const urls = enderecosQr(await enderecoSite(), armario.id);
  const u = encodeURIComponent(armario.id);
  return (
    <figure className="mx-auto w-full max-w-[420px]" aria-label={`Armário ${armario.id}`}>
      <div className="overflow-hidden rounded-xl bg-[linear-gradient(90deg,#0b6d36,#009c48_50%,#0a6a34)] shadow-[0_10px_24px_rgba(9,9,11,0.18)]">
        <div className="flex items-center justify-between bg-[#0f2a1c] px-4 py-3">
          <span className="font-mono text-[15px] font-bold tracking-[0.2em] text-white">{armario.id}</span>
          <span className="truncate pl-3 font-mono text-[10.5px] uppercase tracking-[0.16em] text-[#8fd7ad]">{armario.local || armario.nome}</span>
        </div>
        <div className="grid grid-flow-dense grid-cols-2 gap-2 p-3">
          {gavetas.length ? gavetas.map((g, i) => <Gaveta key={g.nome} {...g} larga={gavetas.length % 2 === 1 && i === gavetas.length - 1} />)
            : <p className="col-span-full rounded-md bg-white/90 p-3 text-[12.5px] text-texto-3">Kit vazio: cadastre os itens em “Armários”.</p>}
        </div>
        <div className="mx-3 mb-3 rounded-md border border-black/20 bg-[#0a5f2f] p-3">
          <div className="flex justify-center">
            <EtiquetaQr titulo="SOLICITAÇÃO" cor="#006cb4" url={urls.solicitacao} rota={`/ubm/solicitacao?u=${u}`} texto="Faltou · acabando" />
          </div>
          <div aria-hidden className="mt-3 h-4 rounded-sm bg-[repeating-linear-gradient(135deg,#fcb40c_0_14px,#0f2a1c_14px_24px)]" />
          <p className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-[#e8f7ef]">Uso exclusivo da manutenção</p>
        </div>
      </div>
      <div aria-hidden className="flex justify-between px-4"><span className="h-3 w-8 bg-[#0f2a1c]" /><span className="h-3 w-8 bg-[#0f2a1c]" /></div>
      <figcaption className="mt-2 text-center text-[11.5px] text-texto-3">
        <span className="mr-1 inline-block size-2 rounded-sm bg-alp-laranja align-middle" /> gaveta com item abaixo do mínimo · clique na gaveta para ver os itens
      </figcaption>
    </figure>
  );
}
