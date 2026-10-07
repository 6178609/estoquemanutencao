"""Calendário de ordens: as ordens do IW38 em cada dia da data-base de início, por turno.

Pandas puro (testado em tests/test_calendario.py). Cada cartão é uma ordem:
- título = objeto técnico (ou local de instalação, ou texto da ordem);
- quem = pessoas que apontaram na ordem (IW47, nome/área/cargo da Gestão de HH); sem apontamento,
  o centro de trabalho e as pessoas previstas no IW38OP;
- duração = trabalho planejado das operações (IW38OP);
- turno = turma das pessoas que apontaram (1ª, 2ª, 3ª, G); sem apontamento, "Sem executante";
- cor = plano de manutenção (azul) ou backlog (amarelo); borda = concluída, atrasada ou programada.
"""

from __future__ import annotations

import html
from datetime import date, timedelta

import pandas as pd

TURNOS = {"1ª": "1º turno", "2ª": "2º turno", "3ª": "3º turno", "G": "Horário geral"}
SEM_EXECUTANTE = "Sem executante (IW47)"
ORDEM_TURNOS = ["1º turno", "2º turno", "3º turno", "Horário geral", SEM_EXECUTANTE]
CONCLUIDA, ATRASADA, PROGRAMADA, CANCELADA = "Concluída", "Atrasada", "Programada", "Cancelada"
SITUACOES = [PROGRAMADA, ATRASADA, CONCLUIDA, CANCELADA]
DIAS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"]
MESES = ["JAN.", "FEV.", "MAR.", "ABR.", "MAI.", "JUN.", "JUL.", "AGO.", "SET.", "OUT.", "NOV.", "DEZ."]
NOMES_MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro",
               "Novembro", "Dezembro"]
_MINUSCULAS = {"da", "de", "do", "das", "dos", "e"}


def nome_proprio(s: str) -> str:
    """JOSIVAN GILDO DA SILVA → Josivan Gildo da Silva."""
    partes = str(s or "").strip().split()
    return " ".join(p.lower() if p.lower() in _MINUSCULAS and i else p.capitalize() for i, p in enumerate(partes))


def duracao(horas) -> str:
    """Horas → "3h", "50 min", "1h 17min"."""
    if horas is None or pd.isna(horas) or horas <= 0:
        return ""
    minutos = int(round(float(horas) * 60))
    h, m = divmod(minutos, 60)
    if not h:
        return f"{m} min"
    return f"{h}h {m}min" if m else f"{h}h"


def inicio_semana(d: date) -> date:
    """Domingo da semana de d (o calendário começa no domingo)."""
    return d - timedelta(days=(d.weekday() + 1) % 7)


def agenda(ordens: pd.DataFrame | None, oper: pd.DataFrame | None = None, conf: pd.DataFrame | None = None,
           equipe: pd.DataFrame | None = None, hoje: pd.Timestamp | None = None) -> pd.DataFrame:
    """Uma linha por ordem e turno, com o dia (data-base de início), título, quem, duração e situação."""
    hoje = (hoje or pd.Timestamp.now()).normalize()
    cols = ["Dia", "Ordem", "Título", "Texto", "Tipo", "Natureza", "Situação", "Situação da ordem", "Turno",
            "Quem", "Duração (h)", "Centro de trabalho", "Executantes"]
    if ordens is None or not len(ordens):
        return pd.DataFrame(columns=cols)
    o = ordens.copy()
    for c in ["Objeto técnico", "Local de instalação", "Texto", "Tipo", "Natureza", "Centro de trabalho", "Situação"]:
        o[c] = o[c].astype(object).where(o[c].notna(), "").astype(str) if c in o else ""
    o["Dia"] = pd.to_datetime(o["Data"] if "Data" in o else o["Início"]).dt.normalize()
    o = o[o["Dia"].notna()]
    o["Título"] = o["Objeto técnico"].where(o["Objeto técnico"] != "", o["Local de instalação"])
    o["Título"] = o["Título"].where(o["Título"] != "", o["Texto"])

    if oper is not None and len(oper):
        op = oper[oper["Ordem"].isin(set(o["Ordem"]))]
        if "Cancelada" in op:
            op = op[~op["Cancelada"].fillna(False).astype(bool)]
        o["Duração (h)"] = o["Ordem"].map(op.groupby("Ordem")["Horas"].sum())
        o["Pessoas previstas"] = (o["Ordem"].map(op.groupby("Ordem")["Pessoas"].max())
                                  if "Pessoas" in op else 0)
    else:
        o["Duração (h)"], o["Pessoas previstas"] = float("nan"), 0
    o["Pessoas previstas"] = pd.to_numeric(o["Pessoas previstas"], errors="coerce").fillna(0).astype(int)

    # quem apontou (IW47) e em que turma
    concluida_iw47 = pd.Series(False, index=o.index)
    pessoas = pd.DataFrame(columns=["Ordem", "Pessoa", "Turno", "Rótulo"])
    if conf is not None and len(conf):
        c = conf[conf["Ordem"].isin(set(o["Ordem"]))].copy()
        if len(c):
            info = (equipe.drop_duplicates("Nº pessoal").set_index("Nº pessoal")
                    if equipe is not None and len(equipe) else pd.DataFrame())
            nome = c["Nº pessoal"].map(info["Nome"]) if "Nome" in info else pd.Series(pd.NA, index=c.index)
            proprio = c["Nome"] if "Nome" in c else pd.Series("", index=c.index)
            c["Pessoa"] = nome.where(nome.fillna("") != "", proprio.where(proprio.fillna("") != "", c["Nº pessoal"]))
            c["Pessoa"] = c["Pessoa"].map(nome_proprio)
            turma = c["Nº pessoal"].map(info["Turma"]) if "Turma" in info else pd.Series("", index=c.index)
            c["Turno"] = turma.map(TURNOS).fillna(SEM_EXECUTANTE)
            area = c["Nº pessoal"].map(info["Área"]).fillna("") if "Área" in info else ""
            cargo = c["Nº pessoal"].map(info["Cargo"]).fillna("") if "Cargo" in info else ""
            extra = (pd.Series(area, index=c.index).astype(str).str[:3] + " · "
                     + pd.Series(cargo, index=c.index).astype(str).str.split().str[0].fillna("").map(nome_proprio))
            extra = extra.where(extra.str.strip(" ·") != "", "")
            c["Rótulo"] = c["Pessoa"] + extra.map(lambda e: f" ({e.strip(' ·')})" if e.strip(" ·") else "")
            pessoas = c.drop_duplicates(["Ordem", "Pessoa"])[["Ordem", "Pessoa", "Turno", "Rótulo"]]
            if "Status sistema" in c:
                st = c["Status sistema"].fillna("").astype(str).groupby(c["Ordem"]).agg(
                    lambda s: {"CONF", "ENTE"} <= set(" ".join(s).split()))
                concluida_iw47 = o["Ordem"].map(st).fillna(False).astype(bool)

    sit = o["Situação"]
    o["Situação da ordem"] = sit
    pendente = sit.isin(["Aberta", "Liberada", "Sem status"]) & ~concluida_iw47
    o["Situação"] = CANCELADA
    o.loc[sit != "Cancelada", "Situação"] = PROGRAMADA
    o.loc[(sit != "Cancelada") & pendente & (o["Dia"] < hoje), "Situação"] = ATRASADA
    o.loc[(sit != "Cancelada") & ~pendente, "Situação"] = CONCLUIDA

    # uma linha por ordem × turno (a ordem aparece no turno de cada turma que apontou nela)
    if len(pessoas):
        por_turno = (pessoas.groupby(["Ordem", "Turno"])
                     .agg(Quem=("Rótulo", ", ".join), Executantes=("Pessoa", "nunique")).reset_index())
        a = o.merge(por_turno, on="Ordem", how="left")
    else:
        a = o.assign(Turno=pd.NA, Quem=pd.NA, Executantes=0)
    sem = a["Turno"].isna()
    a["Turno"] = a["Turno"].fillna(SEM_EXECUTANTE)
    previstas = a["Pessoas previstas"].map(lambda n: f" · {n} pessoa(s) prevista(s)" if n else "")
    a["Quem"] = a["Quem"].where(~sem, a["Centro de trabalho"] + previstas)
    a["Executantes"] = pd.to_numeric(a["Executantes"], errors="coerce").fillna(0).astype(int)
    a["_ordem_turno"] = a["Turno"].map({t: i for i, t in enumerate(ORDEM_TURNOS)}).fillna(len(ORDEM_TURNOS))
    a = a.sort_values(["Dia", "_ordem_turno", "Natureza", "Título", "Ordem"]).reset_index(drop=True)
    return a[cols]


# ----------------------------------------------------------------------------
# HTML do calendário
# ----------------------------------------------------------------------------
_CSS = """
<style>
.cmc{font-family:inherit;background:#fff;border:1px solid #DDE3E0;border-radius:14px;padding:10px;color:#2F3336}
.cmc-grade{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}
.cmc-cab{background:#EEF2F7;border-radius:8px;text-align:center;font-size:11px;font-weight:700;color:#5B6B7F;
  padding:7px 0;letter-spacing:.04em}
.cmc-dia{border:1px solid #E1E6EE;border-radius:8px;padding:5px;min-height:120px;background:#FBFCFE;min-width:0}
.cmc-dia.vazio{background:transparent;border:none}
.cmc-dia.fora{opacity:.45}
.cmc-dia.hoje{border:2px solid #0A6EBD;background:#F5F9FF}
.cmc-topo{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px}
.cmc-num{font-size:17px;font-weight:800;color:#1E2A36}
.cmc-mes{font-size:10px;font-weight:700;color:#7A8796}
.cmc-tot{font-size:10px;color:#7A8796;margin-bottom:4px}
.cmc-turno{font-size:11px;font-weight:800;color:#1E2A36;margin:6px 0 4px}
.cmc-sep{border-top:1px dashed #C9D2DD;margin:6px 0}
.cmc-sem{font-size:11px;color:#8A97A6}
.cmc-card{border:1px solid #B9D3F0;background:#E8F1FC;border-left:4px solid #9DBFE6;border-radius:7px;
  padding:5px 7px;margin-bottom:5px;overflow:hidden}
.cmc-card.backlog{background:#FFF4D6;border-color:#F3D27A;border-left-color:#F0C24B}
.cmc-card.concluida{border-left-color:#0E9F46}
.cmc-card.atrasada{border-left-color:#E3262B}
.cmc-card.cancelada{opacity:.5;text-decoration:line-through}
.cmc-t{font-size:11.5px;font-weight:800;color:#1E2A36;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmc-q{font-size:10.5px;color:#5B6B7F;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmc-ico{color:#0A6EBD;margin-right:4px}
.cmc-card.backlog .cmc-ico{color:#B7860B}
.cmc details summary{font-size:11px;font-weight:700;color:#0A6EBD;cursor:pointer;margin:2px 0 4px}
.cmc-leg{display:flex;flex-wrap:wrap;gap:14px;font-size:11px;color:#5B6B7F;margin:2px 4px 8px}
.cmc-leg span::before{content:"";display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;
  vertical-align:-1px;background:var(--c);border:1px solid var(--b)}
.cmc-rol{overflow-x:auto}
.cmc-rol .cmc-grade{min-width:760px}
</style>
"""

_ICONE = ('<svg class="cmc-ico" width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
          '<path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 '
          '12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>')


def _cartao(r) -> str:
    classes = ["cmc-card"]
    if r["Natureza"] == "Backlog":
        classes.append("backlog")
    classes.append({CONCLUIDA: "concluida", ATRASADA: "atrasada", CANCELADA: "cancelada"}.get(r["Situação"], ""))
    dur = duracao(r["Duração (h)"])
    quem = " • ".join(x for x in [str(r["Quem"] or ""), dur] if x)
    dica = (f"Ordem {r['Ordem']} · {r['Tipo']} · {r['Natureza']}\n{r['Texto']}\n{r['Título']}\n"
            f"Situação: {r['Situação']} ({r['Situação da ordem']}) · {r['Centro de trabalho']}\n{quem}")
    e = html.escape
    return (f'<div class="{" ".join(c for c in classes if c)}" title="{e(dica, quote=True)}">'
            f'<div class="cmc-t">{_ICONE}{e(str(r["Título"]))}</div><div class="cmc-q">{e(quem)}</div></div>')


def _dia(d: date, linhas: pd.DataFrame, hoje: date, fora: bool, max_cartoes: int) -> str:
    classes = ["cmc-dia"] + (["hoje"] if d == hoje else []) + (["fora"] if fora else [])
    partes = [f'<div class="{" ".join(classes)}"><div class="cmc-topo"><span class="cmc-num">{d.day}</span>'
              f'<span class="cmc-mes">{MESES[d.month - 1]}</span></div>']
    if not len(linhas):
        partes.append('<div class="cmc-sem">Sem programação</div></div>')
        return "".join(partes)
    n_ordens = linhas["Ordem"].nunique()
    h = linhas.drop_duplicates("Ordem")["Duração (h)"].sum()
    partes.append(f'<div class="cmc-tot">{n_ordens} ordem(ns){" · " + duracao(h) if h > 0 else ""}</div>')
    mostrados = 0
    escondidos: list[str] = []
    primeiro = True
    for turno, g in linhas.groupby("Turno", sort=False):
        bloco = [] if primeiro else ['<div class="cmc-sep"></div>']
        primeiro = False
        bloco.append(f'<div class="cmc-turno">{html.escape(str(turno))}</div>')
        cartoes = [_cartao(r) for _, r in g.iterrows()]
        livres = max(max_cartoes - mostrados, 0)
        bloco.extend(cartoes[:livres])
        mostrados += min(livres, len(cartoes))
        if livres >= 1 or not cartoes:
            partes.extend(bloco)
            escondidos.extend(cartoes[livres:])
        else:
            escondidos.append(f'<div class="cmc-turno">{html.escape(str(turno))}</div>')
            escondidos.extend(cartoes)
    if escondidos:
        n = sum(1 for x in escondidos if x.startswith('<div class="cmc-card'))
        partes.append(f"<details><summary>+{n} ordem(ns)</summary>{''.join(escondidos)}</details>")
    partes.append("</div>")
    return "".join(partes)


def html_calendario(ag: pd.DataFrame, ini: date, fim: date, hoje: date, mes_ref: int | None = None,
                    max_cartoes: int = 12) -> str:
    """Grade domingo→sábado de ini a fim (completa as semanas). mes_ref: dias de outro mês ficam esmaecidos."""
    ini_g = inicio_semana(ini)
    fim_g = inicio_semana(fim) + timedelta(days=6)
    por_dia = {k: g for k, g in ag.groupby(ag["Dia"].dt.date)} if len(ag) else {}
    vazio = ag.iloc[0:0]
    celulas = [f'<div class="cmc-cab">{d}</div>' for d in DIAS]
    d = ini_g
    while d <= fim_g:
        if d < ini or d > fim:
            if mes_ref is None:
                celulas.append('<div class="cmc-dia vazio"></div>')
            else:
                celulas.append(_dia(d, por_dia.get(d, vazio), hoje, True, max_cartoes))
        else:
            celulas.append(_dia(d, por_dia.get(d, vazio), hoje, mes_ref is not None and d.month != mes_ref,
                                max_cartoes))
        d += timedelta(days=1)
    legenda = ('<div class="cmc-leg"><span style="--c:#E8F1FC;--b:#9DBFE6">Plano de manutenção</span>'
               '<span style="--c:#FFF4D6;--b:#F0C24B">Backlog</span>'
               '<span style="--c:#0E9F46;--b:#0E9F46">Concluída (borda)</span>'
               '<span style="--c:#E3262B;--b:#E3262B">Atrasada (borda)</span>'
               '<span style="--c:#0A6EBD;--b:#0A6EBD">Hoje</span></div>')
    return (_CSS + f'<div class="cmc">{legenda}<div class="cmc-rol"><div class="cmc-grade">{"".join(celulas)}'
            "</div></div></div>")
