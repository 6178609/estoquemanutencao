import type { Tabela } from "./leitura";

/**
 * Lista de tarefas exportada do SAP em texto (impressão da IA03/IA06 de várias listas): blocos "LTa <grupo> <numerador>
 * <título>", com as operações ("Operação 0010 <texto>", texto longo, centro de trabalho, chave de controle, pessoas,
 * trabalho, duração, pacotes de manutenção), as suboperações e os componentes ("Comp.mat.", quantidade). Vira uma tabela
 * com uma linha por operação, suboperação ou componente (coluna Registro). Testado em testes/listasTarefas.test.ts.
 */
export const COLUNAS_LISTAS = ["Grupo lista tarefas", "Numerador", "Título da lista", "Estratégia", "Status", "Centro", "Registro",
  "Operação", "Suboperação", "Texto da operação", "Texto longo", "Centro de trabalho", "Chave de controle", "Pessoas", "Trabalho",
  "Unid. trabalho", "Duração", "Unid. duração", "Pacotes", "Ciclos", "Material", "Texto do material", "Quantidade", "UM"] as const;

/** O texto é desse tipo? (linhas que começam com "LTa <grupo> <numerador>") */
export function ehTextoListasTarefas(txt: string): boolean {
  return /^LTa\s+\S+\s+\d+/m.test(txt.slice(0, 20_000));
}

type Reg = Record<(typeof COLUNAS_LISTAS)[number], string>;
const vazio = (): Reg => Object.fromEntries(COLUNAS_LISTAS.map((c) => [c, ""])) as Reg;

export function lerListasTarefas(txt: string): Tabela {
  const linhas = txt.split(/\r?\n|\r/);
  const regs: Reg[] = [];
  let lista: Reg | null = null;   // cabeçalho da lista atual
  let atual: Reg | null = null;   // operação/suboperação atual (recebe centro, trabalho, pacotes…)
  let longo: string[] | null = null;
  let opAtual = "";
  let comp: Reg | null = null;
  const cabecalhos = new Map<string, Reg>(); // cada lista (a sem operação também sai, com estratégia, status e centro)

  const fechaTexto = () => {
    if (atual && longo) {
      // a impressão do SAP repete linhas do texto longo (a mesma linha ou o mesmo par várias vezes): fica a 1ª de cada
      const vistas = new Set<string>();
      const l = longo.map((s) => s.trimEnd()).filter((s, i) => !(i === 0 && s.trim() === atual!["Texto da operação"].trim()))
        .filter((s) => { const k = s.trim(); if (!k) return true; if (vistas.has(k)) return false; vistas.add(k); return true; });
      atual["Texto longo"] = l.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    }
    longo = null;
  };
  const novo = (tipo: string): Reg => {
    const r = vazio();
    for (const k of ["Grupo lista tarefas", "Numerador", "Título da lista", "Estratégia", "Status", "Centro"] as const) r[k] = lista?.[k] ?? "";
    r.Registro = tipo;
    regs.push(r);
    return r;
  };

  for (const bruta of linhas) {
    const ln = bruta.replace(/ /g, " ");
    const t = ln.trim();
    let m: RegExpMatchArray | null;
    if ((m = /^LTa\s+(\S+)\s+(\S+)\s*(.*)$/.exec(t))) {
      fechaTexto();
      atual = null; comp = null; opAtual = "";
      lista = vazio();
      lista["Grupo lista tarefas"] = m[1]; lista.Numerador = m[2]; lista["Título da lista"] = m[3].trim();
      if (!cabecalhos.has(`${m[1]}|${m[2]}`)) cabecalhos.set(`${m[1]}|${m[2]}`, lista);
      continue;
    }
    if (!lista) continue;
    if ((m = /^Estratégia\s+(\S+)/.exec(t))) { lista["Estratégia"] = m[1]; continue; }
    if ((m = /^Utilização\s+\S+\s+Status\s+(\S+)/.exec(t))) { lista.Status = m[1]; continue; }
    if (!atual && (m = /^Centro\s+(\S+)/.exec(t))) { lista.Centro = m[1]; continue; }
    if ((m = /^Operação\s+(\S+)\s*(.*)$/.exec(t))) {
      fechaTexto(); comp = null;
      atual = novo("Operação");
      opAtual = m[1];
      atual["Operação"] = m[1]; atual["Texto da operação"] = m[2].trim();
      longo = [];
      continue;
    }
    if ((m = /^Suboperaç\S*\s+(\S+)\s*(.*)$/.exec(t))) {
      fechaTexto(); comp = null;
      atual = novo("Suboperação");
      atual["Operação"] = opAtual; atual["Suboperação"] = m[1]; atual["Texto da operação"] = m[2].trim();
      continue;
    }
    if ((m = /^Comp\.mat\.\s+(\S+)\s*(.*)$/.exec(t))) {
      fechaTexto();
      comp = novo("Componente");
      comp["Operação"] = opAtual; comp.Material = m[1]; comp["Texto do material"] = m[2].trim();
      continue;
    }
    if (comp && (m = /^Quantidade\s+(\S+)\s*(\S*)/.exec(t))) { comp.Quantidade = m[1]; comp.UM = m[2]; continue; }
    if (comp && /^(Lista técnica|Categoria do item)\b/.test(t)) continue;
    if (!atual) continue;
    if ((m = /^Cen\.trabalho\s+(\S+)/.exec(t))) { fechaTexto(); atual["Centro de trabalho"] = m[1]; continue; }
    if ((m = /^Chave de controle\s+(\S+)$/.exec(t))) { fechaTexto(); atual["Chave de controle"] = m[1]; continue; }
    if ((m = /^Núm\.de pessoas\s+(\d+)$/.exec(t))) { fechaTexto(); atual.Pessoas = m[1]; continue; }
    // dentro do texto longo, só a linha no formato exato do campo ("Trabalho  30,0  MIN") fecha o texto
    const campoTempo = /^(Trabalho|Duração)\s+([\d.,]+)\s*([A-Za-zÀ-ú]{0,4})$/.exec(t);
    if (campoTempo) {
      fechaTexto();
      if (campoTempo[1] === "Trabalho") { atual.Trabalho = campoTempo[2]; atual["Unid. trabalho"] = campoTempo[3]; }
      else { atual["Duração"] = campoTempo[2]; atual["Unid. duração"] = campoTempo[3]; }
      continue;
    }
    if ((m = /^Pac\.manuten\d+\s+(\S+)\s+(.+)$/.exec(t))) {
      fechaTexto();
      const pac = m[1], ciclo = m[2].trim();
      atual.Pacotes = [atual.Pacotes, pac].filter(Boolean).join(" + ");
      atual.Ciclos = [atual.Ciclos, ciclo].filter(Boolean).join(" + ");
      continue;
    }
    if (longo) longo.push(ln);
  }
  fechaTexto();
  // lista sem operação também entra (uma linha só com o cabeçalho)
  const comOp = new Set(regs.map((r) => `${r["Grupo lista tarefas"]}|${r.Numerador}`));
  const out: Reg[] = [];
  const vistos = new Set<string>();
  for (const bruta of linhas) {
    const m = /^LTa\s+(\S+)\s+(\S+)\s*(.*)$/.exec(bruta.trim());
    if (!m) continue;
    const k = `${m[1]}|${m[2]}`;
    if (comOp.has(k) || vistos.has(k)) continue;
    vistos.add(k);
    out.push({ ...(cabecalhos.get(k) ?? vazio()), Registro: "Lista" });
  }
  const todas = [...regs, ...out];
  return { colunas: [...COLUNAS_LISTAS], linhas: todas.map((r) => COLUNAS_LISTAS.map((c) => r[c])) };
}
