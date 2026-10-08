"""Planos de manutenção: chamadas da IP19 (programação dos planos) em calendário
de 52 semanas, cruzadas com as ordens do IW38 para saber o que foi executado.

Sem IP19 nas pastas, monta a mesma visão a partir das ordens do IW38 que têm
plano (só o que já virou ordem; as chamadas futuras exigem a IP19).
"""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd

from .util import achar_coluna, agora_local, chave, fora_da_visao, para_data, setores, texto

# ----------------------------------------------------------------------------
# Situação de cada chamada
# ----------------------------------------------------------------------------
CONCLUIDA, ABERTA, ATRASADA, PROGRAMADA, SALTADA, SEM_STATUS = (
    "Concluída", "Em aberto", "Atrasada", "Programada", "Saltada/cancelada", "Sem status")
SITUACOES = [CONCLUIDA, ABERTA, ATRASADA, PROGRAMADA, SALTADA, SEM_STATUS]
# o que aparece na célula quando há mais de uma chamada na mesma semana
PRIORIDADE = [ATRASADA, ABERTA, PROGRAMADA, CONCLUIDA, SALTADA, SEM_STATUS]
SIMBOLO = {CONCLUIDA: "✓", ABERTA: "●", ATRASADA: "!", PROGRAMADA: "○", SALTADA: "–", SEM_STATUS: "·"}
COR = {  # fundo, texto (verde/laranja/vermelho do tema; azul e cinzas neutros)
    CONCLUIDA: ("#D3F0DE", "#0B7A36"),
    ABERTA: ("#D6E8F7", "#0A5A9C"),
    ATRASADA: ("#F9D4D5", "#B3161B"),
    PROGRAMADA: ("#FFFFFF", "#6B7370"),
    SALTADA: ("#ECEEED", "#8C9491"),
    SEM_STATUS: ("#F4F6F5", "#8C9491"),
}


# ----------------------------------------------------------------------------
# Leitura da IP19
# ----------------------------------------------------------------------------
_COLUNAS = {
    "Plano": [r"^PLANO( DE)? MANUT", r"^PLANO MANUT", r"^PLANO$", r"PLANO DE MANUTENCAO"],
    "Item": [r"^ITEM( DE)? MANUT", r"^ITEM MANUT", r"^ITEM$"],
    "Texto": [r"TEXTO.*PLANO", r"DENOMINACAO.*PLANO", r"TEXTO.*ITEM", r"TEXTO BREVE", r"^TEXTO", r"DESCRICAO"],
    "Equipamento": [r"^EQUIPAMENTO$"],
    "Objeto técnico": [r"DENOMINACAO.*(OBJETO|EQUIP)", r"OBJETO TECNICO", r"DESCRICAO.*EQUIP"],
    "Local de instalação": [r"DENOMINACAO.*LOC", r"LOC.*INSTAL"],
    "Centro de trabalho": [r"CENTRO TRAB", r"CENTRO DE TRABALHO", r"CEN TRAB"],
    "Grupo de planejamento": [r"GRUPO.*PLANEJ", r"GRP.*PLAN", r"GRP PLNJ"],
    "Ciclo": [r"CICLO", r"PERIODICIDADE", r"FREQUENCIA", r"INTERVALO"],
    "Pacote": [r"PACOTES? VENCIDOS?", r"^PACOTE"],
    "Estratégia": [r"ESTRAT"],
    "Tipo de ordem": [r"TIPO DE ORDEM"],
    "Trabalho": [r"^TRABALHO$"],
    "Unidade do trabalho": [r"UNIDADE DO TRABALHO"],
    "Data planejada": [r"DATA PLAN", r"DT PLAN", r"PLANEJAD", r"DATA PROGRAM"],
    "Data chamada": [r"DATA (DE )?CHAMADA", r"DT CHAM", r"CHAMADA EM"],
    "Data conclusão": [r"DATA (DE )?CONCL", r"DATA (DE )?ENCERR", r"DT CONCL", r"CONCLUSAO"],
    "Tipo de programação": [r"TIPO (DE )?PROGRAM", r"^ST SOLICIT", r"SOLICITACAO", r"STATUS", r"TIPO (DE )?CHAMADA",
                            r"AGENDAMENTO", r"PROGRAMACAO"],
    "Ordem": [r"^ORDEM$", r"^ORDEM", r"ORDEM"],
}
_TEXTO = ["Plano", "Item", "Texto", "Equipamento", "Objeto técnico", "Local de instalação", "Centro de trabalho",
          "Grupo de planejamento", "Ciclo", "Pacote", "Estratégia", "Tipo de ordem", "Unidade do trabalho",
          "Tipo de programação", "Ordem"]


def preparar_ip19(cru: pd.DataFrame, excluir_piloto_matriz: bool = True) -> pd.DataFrame:
    """Uma linha por chamada (plano + item + data planejada).

    A IP19 costuma vir com uma linha por operação da lista de tarefas; elas são
    juntadas na chamada, somando o trabalho (horas) e contando as operações."""
    df = pd.DataFrame(index=cru.index)
    usadas: set[str] = set()
    for nome, padroes in _COLUNAS.items():
        excluir = {"Ordem": r"TIPO|STATUS", "Texto": r"OBJETO|EQUIP|LOC|OPERACAO", "Data conclusão": r"PLAN|CHAMADA",
                   "Tipo de programação": r"USUARIO|SISTEMA|ROTEIRO|ATIVIDAD", "Item": r"GRUPO"}.get(nome)
        col = achar_coluna([c for c in cru.columns if c not in usadas], *padroes, excluir=excluir)
        if col:
            usadas.add(col)
        df[nome] = cru[col] if col else ""
    for c in _TEXTO:
        df[c] = texto(df[c])
    for c in ["Data planejada", "Data chamada", "Data conclusão"]:
        df[c] = para_data(df[c])
    df = df[(df["Plano"] != "") & (df["Data planejada"].notna() | df["Data chamada"].notna())]
    if excluir_piloto_matriz:  # mesma regra das ordens (util.fora_da_visao), também pelo texto do plano
        df = df[~(fora_da_visao(df, textos=("Texto",)) | df["Texto"].map(chave).str.contains("MATRIZARIA"))]

    fator = df["Unidade do trabalho"].str.upper().map({"MIN": 1 / 60, "H": 1, "HR": 1, "STD": 1}).fillna(1.0)
    df["Horas"] = from_num(df["Trabalho"]) * fator
    # "Programado,espera (Inspeção)" → atividade "Inspeção"
    df["Atividade"] = df["Tipo de programação"].str.extract(r"\(([^)]+)\)\s*$", expand=False).fillna("")
    df.loc[df["Atividade"].map(chave).str.contains("SIMULA"), "Atividade"] = ""

    chave_chamada = ["Plano", "Item", "Data planejada"]
    df["_n"] = 1
    primeiro = {c: "first" for c in df.columns if c not in chave_chamada + ["Horas", "_n"]}
    df = (df.sort_values(chave_chamada)
            .groupby(chave_chamada, dropna=False, sort=False)
            .agg({**primeiro, "Horas": "sum", "_n": "sum"})
            .reset_index()
            .rename(columns={"_n": "Operações"}))
    df["Setor"] = setores(df["Centro de trabalho"])
    return df.drop(columns=["Trabalho", "Unidade do trabalho"])


def from_num(serie: pd.Series) -> pd.Series:
    from .util import para_numero

    return para_numero(serie).fillna(0.0)


def de_iw38(iw38: pd.DataFrame) -> pd.DataFrame:
    """Chamadas aproximadas a partir das ordens do IW38 que têm plano."""
    o = iw38[iw38["Com plano"]]
    return pd.DataFrame({
        "Plano": o["Plano"].values, "Item": "", "Texto": o["Texto"].values,
        "Equipamento": o["Equipamento"].values, "Objeto técnico": o["Objeto técnico"].values,
        "Local de instalação": o["Local de instalação"].values, "Centro de trabalho": o["Centro de trabalho"].values,
        "Grupo de planejamento": "", "Ciclo": "", "Data planejada": o["Início"].values,
        "Data chamada": o["Entrada"].values, "Data conclusão": pd.NaT, "Tipo de programação": "",
        "Ordem": o["Ordem"].values, "_do_iw38": True, "Pacote": "", "Estratégia": "",
        "Tipo de ordem": o["Tipo"].values, "Atividade": "", "Horas": 0.0, "Operações": 0,
    })


# ----------------------------------------------------------------------------
# Cruzamento com o IW38 e classificação
# ----------------------------------------------------------------------------
def classificar(ch: pd.DataFrame, iw38: pd.DataFrame | None, hoje: pd.Timestamp | None = None) -> pd.DataFrame:
    """Acrescenta Situação, Data (referência da semana), situação/custo da ordem no IW38."""
    hoje = (hoje or agora_local()).normalize()
    ch = ch.copy()
    if iw38 is not None and len(iw38) and "_do_iw38" not in ch and (ch["Ordem"] == "").all():
        ch = _ordem_por_plano_e_data(ch, iw38)
    if iw38 is not None and len(iw38):
        ref = iw38[iw38["Ordem"] != ""].drop_duplicates("Ordem").set_index("Ordem")
        ordem = ch["Ordem"].where(ch["Ordem"] != "")  # chamada sem ordem não cruza com nada
        ch["Situação IW38"] = ordem.map(ref["Situação"].astype(str)).fillna("")
        ch["Custo real"] = ordem.map(ref["Custo real"]).fillna(0.0)
        # centro de trabalho / equipamento vazios na IP19 → completa pela ordem
        for c in ("Centro de trabalho", "Equipamento", "Objeto técnico"):
            vazio = ch[c] == ""
            ch.loc[vazio, c] = ordem[vazio].map(ref[c]).fillna("")
    else:
        ch["Situação IW38"] = ""
        ch["Custo real"] = 0.0

    tp = ch["Tipo de programação"].map(chave)
    sit = ch["Situação IW38"]
    ch["Data"] = ch["Data planejada"].fillna(ch["Data chamada"])
    vencida = ch["Data"] < hoje
    # "solicitado"/"chamado" = a ordem já foi gerada; "espera" = ainda não
    chamada = (ch["Ordem"] != "") | tp.str.contains("CHAMAD|SOLICITAD")
    ch["Situação"] = np.select(
        [
            tp.str.contains("SALT|PULAD|SKIP|IGNORAD") | (sit == "Cancelada"),
            ch["Data conclusão"].notna() | tp.str.contains("CONCLU|ENCERR") | (sit == "Concluída"),
            # ordem antiga sem status no export do IW38: só vale quando o calendário vem do próprio IW38;
            # com a IP19, quem decide é a programação do plano
            (sit == "Sem status") & ch.get("_do_iw38", pd.Series(False, index=ch.index)).astype(bool),
            chamada & vencida,
            chamada,
            vencida,
        ],
        [SALTADA, CONCLUIDA, SEM_STATUS, ATRASADA, ABERTA, ATRASADA],
        default=PROGRAMADA,
    )
    iso = ch["Data"].dt.isocalendar()
    ch["Ano"] = iso["year"].astype("Int64")
    ch["Semana"] = iso["week"].astype("Int64")
    ch["Chave"] = np.where(ch["Item"] != "", ch["Plano"] + " / " + ch["Item"], ch["Plano"])
    return ch


JANELA_DIAS = 10


def _ordem_por_plano_e_data(ch: pd.DataFrame, iw38: pd.DataFrame) -> pd.DataFrame:
    """A IP19 sem coluna de ordem: liga cada chamada à ordem do IW38 do mesmo plano com
    data-base de início mais próxima da data planejada (até JANELA_DIAS de diferença).
    Cada ordem fica com uma chamada só (a mais próxima)."""
    o = iw38[iw38["Com plano"] & iw38["Início"].notna()][["Plano", "Início", "Ordem"]].rename(columns={"Ordem": "_ordem"})
    c = ch.reset_index().rename(columns={"index": "_i"})
    # só chamadas que já geraram ordem ("solicitado", "chamado", "concluído") ou sem status nenhum;
    # "espera" e "ignorado" ainda não têm ordem e não podem roubar a de outra chamada
    tp = c["Tipo de programação"].map(chave)
    c = c[c["Data planejada"].notna() & (tp.str.contains("SOLICITAD|CHAMAD|CONCLU") | (tp == ""))]
    if o.empty or c.empty:
        return ch
    par = pd.merge_asof(c.sort_values("Data planejada")[["_i", "Plano", "Data planejada"]],
                        o.sort_values("Início"), left_on="Data planejada", right_on="Início", by="Plano",
                        direction="nearest", tolerance=pd.Timedelta(days=JANELA_DIAS))
    par = par.dropna(subset=["_ordem"])
    par["_dist"] = (par["Data planejada"] - par["Início"]).abs()
    par = par.sort_values("_dist").drop_duplicates("_ordem")
    ch = ch.copy()
    ch.loc[par["_i"].values, "Ordem"] = par["_ordem"].values
    return ch


# ----------------------------------------------------------------------------
# Calendário semanal entre duas datas (52 colunas para um ano)
# ----------------------------------------------------------------------------
MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]


def segunda(d) -> date:
    d = pd.Timestamp(d).date()
    return d - timedelta(days=d.weekday())


def semanas_entre(inicio: date, fim: date) -> list[date]:
    """Segundas-feiras de todas as semanas que tocam o intervalo."""
    s, ult = segunda(inicio), segunda(fim)
    out = []
    while s <= ult:
        out.append(s)
        s += timedelta(days=7)
    return out


def rotulos_semanas(segundas: list[date]) -> list[str]:
    """S01, S02… (semana ISO); quando o intervalo passa de um ano, S01/27 etc."""
    anos = {d.isocalendar().year for d in segundas}
    if len(anos) <= 1:
        return [f"S{d.isocalendar().week:02d}" for d in segundas]
    return [f"S{d.isocalendar().week:02d}/{d.isocalendar().year % 100:02d}" for d in segundas]


def marcas_dos_meses(segundas: list[date]) -> dict[str, str]:
    """{rótulo da 1ª semana de cada mês: 'Jan' (ou 'Jan/27' se o intervalo passa de ano)}.
    A semana pertence ao mês da sua quinta-feira, como na numeração ISO."""
    quintas = [d + timedelta(days=3) for d in segundas]
    varios_anos = len({q.year for q in quintas}) > 1
    marcas, vistos = {}, set()
    for r, q in zip(rotulos_semanas(segundas), quintas):
        if (q.year, q.month) not in vistos:
            vistos.add((q.year, q.month))
            marcas[r] = MESES_CURTOS[q.month - 1] + (f"/{q.year % 100:02d}" if varios_anos else "")
    return marcas


def _no_intervalo(ch: pd.DataFrame, inicio: date, fim: date) -> pd.DataFrame:
    d = ch[(ch["Data"] >= pd.Timestamp(inicio)) & (ch["Data"] < pd.Timestamp(fim) + pd.Timedelta(days=1))].copy()
    d["Segunda"] = (d["Data"] - pd.to_timedelta(d["Data"].dt.weekday, unit="D")).dt.date
    return d


def _moda_por(df: pd.DataFrame, por: str, col: str) -> pd.Series:
    """Valor (não vazio) mais frequente de `col` em cada grupo; no empate, o menor — como Series.mode().iat[0]."""
    if col not in df:
        return pd.Series(dtype=object)
    v = df[[por, col]]
    v = v[v[col].notna() & (v[col].astype(str) != "")]
    if not len(v):
        return pd.Series(dtype=object)
    n = v.groupby([por, col], sort=False, observed=True).size().reset_index(name="_n")
    n = n.sort_values([por, "_n", col], ascending=[True, False, True], kind="stable")
    return n.drop_duplicates(por).set_index(por)[col]


def _ciclos_estimados(ch: pd.DataFrame) -> pd.Series:
    """Ciclo estimado de cada plano (sem ciclo na IP19): mediana do intervalo entre as datas distintas dele;
    o "*" marca que foi estimado."""
    d = ch[["Chave", "Data"]].dropna().drop_duplicates().sort_values(["Chave", "Data"])
    d["_dif"] = d.groupby("Chave")["Data"].diff().dt.days
    med = d.groupby("Chave")["_dif"].median().dropna()

    def nome(dias: float) -> str:
        for limite, rot in [(2, "Diário"), (10, "Semanal"), (20, "Quinzenal"), (45, "Mensal"), (75, "Bimestral"),
                            (120, "Trimestral"), (270, "Semestral"), (500, "Anual")]:
            if dias <= limite:
                return rot + "*"
        return f"{dias / 365:.0f} anos*"

    return med.map(nome)


def montar_calendario(ch: pd.DataFrame, inicio: date, fim: date) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Devolve (grade com o texto das células, grade com a situação de cada célula).

    Uma linha por plano (e item, quando a IP19 traz item); uma coluna por semana entre
    `inicio` e `fim`. Tudo agrupado de uma vez (o laço por plano levava ~3 s a cada clique)."""
    segundas = semanas_entre(inicio, fim)
    cols_sem = rotulos_semanas(segundas)
    colunas = ["Plano", "Descrição", "Equipamento", "Centro", "Ciclo", "Chamadas", "Atrasadas", *cols_sem]
    g = _no_intervalo(ch, inicio, fim)
    if not len(g):
        vazio = pd.DataFrame(columns=colunas)
        return vazio, vazio.copy()
    planos_ = pd.Index(sorted(g["Chave"].unique()), name="Chave")

    # ciclo olha o histórico inteiro do plano (todas as chamadas recebidas), o resto só o período
    ciclo = _moda_por(ch, "Chave", "Ciclo").reindex(planos_).fillna("")
    falta = ciclo == ""
    if falta.any():
        ciclo[falta] = _ciclos_estimados(ch[ch["Chave"].isin(planos_[falta])]).reindex(planos_[falta]).fillna("")
        falta = ciclo == ""
        if falta.any() and "Pacote" in ch:
            pac = _moda_por(ch, "Chave", "Pacote").reindex(planos_[falta])
            ciclo[falta] = ("pacote " + pac.astype(str)).where(pac.notna(), "")
    equip = _moda_por(g, "Chave", "Objeto técnico").reindex(planos_)
    equip = equip.where(equip.notna(), _moda_por(g, "Chave", "Equipamento").reindex(planos_)).fillna("")
    cont = g.groupby("Chave").agg(Chamadas=("Situação", "size"),
                                  Atrasadas=("Situação", lambda x: int((x == ATRASADA).sum()))).reindex(planos_)
    info = pd.DataFrame({"Plano": planos_, "Descrição": _moda_por(g, "Chave", "Texto").reindex(planos_).fillna(""),
                         "Equipamento": equip, "Centro": _moda_por(g, "Chave", "Centro de trabalho").reindex(planos_)
                         .fillna(""), "Ciclo": ciclo, "Chamadas": cont["Chamadas"].astype(int),
                         "Atrasadas": cont["Atrasadas"].astype(int)}, index=planos_)

    # a pior situação de cada semana (e quantas chamadas caíram nela)
    ordem_pri = {s_: i for i, s_ in enumerate(PRIORIDADE)}
    w = g.assign(_pri=g["Situação"].map(ordem_pri), _col=g["Segunda"].map(dict(zip(segundas, cols_sem))))
    sem = w.groupby(["Chave", "_col"]).agg(_pri=("_pri", "min"), _n=("_pri", "size")).reset_index()
    sem["_sit"] = sem["_pri"].map(dict(enumerate(PRIORIDADE)))
    sem["_txt"] = sem["_sit"].map(SIMBOLO) + sem["_n"].map(lambda n: f"{n}" if n > 1 else "")
    txt = sem.pivot(index="Chave", columns="_col", values="_txt").reindex(index=planos_, columns=cols_sem).fillna("")
    sit = sem.pivot(index="Chave", columns="_col", values="_sit").reindex(index=planos_, columns=cols_sem).fillna("")
    grade = pd.concat([info, txt], axis=1).reset_index(drop=True)[colunas]
    vazio_info = pd.DataFrame("", index=planos_, columns=info.columns)
    situacoes = pd.concat([vazio_info, sit], axis=1).reset_index(drop=True)[colunas]
    grade.columns.name = situacoes.columns.name = None
    return grade, situacoes


def coluna_da_semana(dia: date, inicio: date, fim: date) -> str | None:
    """Rótulo da coluna da semana de `dia`, se ela estiver no calendário."""
    segundas = semanas_entre(inicio, fim)
    return dict(zip(segundas, rotulos_semanas(segundas))).get(segunda(dia))


def estilo(grade: pd.DataFrame, situacoes: pd.DataFrame, coluna_atual: str | None):
    """Pinta as células das semanas pela situação (pandas Styler, que o st.dataframe respeita)."""
    semanas = [c for c in grade.columns if c.startswith("S") and c[1:3].isdigit()]

    def css(_):
        out = pd.DataFrame("", index=grade.index, columns=grade.columns)
        for c in semanas:
            borda = "border-left:2px solid #0E9F46;border-right:2px solid #0E9F46;" if c == coluna_atual else ""
            out[c] = situacoes[c].map(lambda s: (f"background-color:{COR[s][0]};color:{COR[s][1]};font-weight:700;" if s else "") + borda)
        out["Atrasadas"] = np.where(grade["Atrasadas"] > 0, f"color:{COR[ATRASADA][1]};font-weight:700;", "")
        return out
    return grade.style.apply(css, axis=None)


def carga_semanal(ch: pd.DataFrame, inicio: date, fim: date) -> pd.DataFrame:
    segundas = semanas_entre(inicio, fim)
    coluna_de = dict(zip(segundas, rotulos_semanas(segundas)))
    d = _no_intervalo(ch, inicio, fim).groupby(["Segunda", "Situação"]).size().reset_index(name="Chamadas")
    d["Semana"] = d["Segunda"].map(coluna_de)
    return d


def celulas(ch: pd.DataFrame, inicio: date, fim: date, ordem_planos: list[str], descricoes: dict[str, str]) -> pd.DataFrame:
    """Formato longo para o mapa de calor: uma linha por plano × semana com chamada."""
    segundas = semanas_entre(inicio, fim)
    coluna_de = dict(zip(segundas, rotulos_semanas(segundas)))
    d = _no_intervalo(ch, inicio, fim)
    d = d[d["Chave"].isin(ordem_planos)]
    pri = {s: i for i, s in enumerate(PRIORIDADE)}
    linhas = []
    for (chave_plano, seg_), g in d.groupby(["Chave", "Segunda"], sort=False):
        pior = min(g["Situação"], key=lambda s: pri[s])
        linhas.append({
            "Chave": chave_plano, "Plano": f"{chave_plano} · {descricoes.get(chave_plano, '')[:34]}",
            "Semana": coluna_de[seg_], "Situação": pior, "Chamadas": len(g),
            "Símbolo": SIMBOLO[pior] + (str(len(g)) if len(g) > 1 else ""),
            "Período": f"{seg_:%d/%m} a {seg_ + timedelta(days=6):%d/%m/%Y}",
            "Datas": ", ".join(sorted({x.strftime("%d/%m") for x in g["Data"].dropna()})),
            "Ordens": ", ".join(o for o in g["Ordem"] if o) or "—",
        })
    return pd.DataFrame(linhas)
