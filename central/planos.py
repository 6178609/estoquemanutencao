"""Planos de manutenção: chamadas da IP19 (programação dos planos) em calendário
de 52 semanas, cruzadas com as ordens do IW38 para saber o que foi executado.

Sem IP19 nas pastas, monta a mesma visão a partir das ordens do IW38 que têm
plano (só o que já virou ordem; as chamadas futuras exigem a IP19).
"""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd

from .util import achar_coluna, chave, fora_da_visao, para_data, setores, texto

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
    hoje = (hoje or pd.Timestamp.now()).normalize()
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


def _ciclo_estimado(datas: pd.Series) -> str:
    d = datas.dropna().drop_duplicates().sort_values()
    if len(d) < 2:
        return ""
    dias = float(d.diff().dt.days.median())
    for limite, nome in [(2, "Diário"), (10, "Semanal"), (20, "Quinzenal"), (45, "Mensal"), (75, "Bimestral"),
                         (120, "Trimestral"), (270, "Semestral"), (500, "Anual")]:
        if dias <= limite:
            return nome + "*"
    return f"{dias / 365:.0f} anos*"


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


def montar_calendario(ch: pd.DataFrame, inicio: date, fim: date) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Devolve (grade com o texto das células, grade com a situação de cada célula).

    Uma linha por plano (e item, quando a IP19 traz item); uma coluna por semana entre
    `inicio` e `fim`."""
    segundas = semanas_entre(inicio, fim)
    cols_sem = rotulos_semanas(segundas)
    coluna_de = dict(zip(segundas, cols_sem))
    no_periodo = _no_intervalo(ch, inicio, fim)
    todas = ch  # ciclo estimado olha o histórico inteiro do plano

    linhas, situ = [], []
    ordem_pri = {s: i for i, s in enumerate(PRIORIDADE)}
    for chave_plano, g in no_periodo.groupby("Chave", sort=True):
        h = todas[todas["Chave"] == chave_plano]
        moda = lambda s: s[s != ""].mode().iat[0] if (s != "").any() else ""  # noqa: E731
        ciclo = moda(h["Ciclo"]) if "Ciclo" in h else ""
        ciclo = ciclo or _ciclo_estimado(h["Data"])
        if not ciclo and "Pacote" in h and moda(h["Pacote"]):
            ciclo = f"pacote {moda(h['Pacote'])}"
        info = {"Plano": chave_plano, "Descrição": moda(g["Texto"]), "Equipamento": moda(g["Objeto técnico"]) or moda(g["Equipamento"]),
                "Centro": moda(g["Centro de trabalho"]), "Ciclo": ciclo,
                "Chamadas": len(g), "Atrasadas": int((g["Situação"] == ATRASADA).sum())}
        txt = dict.fromkeys(cols_sem, "")
        st_ = dict.fromkeys(cols_sem, "")
        for seg_, gw in g.groupby("Segunda"):
            pior = min(gw["Situação"], key=lambda s: ordem_pri[s])
            col = coluna_de[seg_]
            txt[col] = SIMBOLO[pior] + (f"{len(gw)}" if len(gw) > 1 else "")
            st_[col] = pior
        linhas.append({**info, **txt})
        situ.append({**dict.fromkeys(info, ""), **st_})
    grade = pd.DataFrame(linhas, columns=["Plano", "Descrição", "Equipamento", "Centro", "Ciclo", "Chamadas", "Atrasadas", *cols_sem])
    situacoes = pd.DataFrame(situ, columns=grade.columns)
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
