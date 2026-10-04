"""Planos de manutenção: chamadas da IP19 (programação dos planos) em calendário
de 52 semanas, cruzadas com as ordens do IW38 para saber o que foi executado.

Sem IP19 nas pastas, monta a mesma visão a partir das ordens do IW38 que têm
plano (só o que já virou ordem; as chamadas futuras exigem a IP19).
"""

from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd

from .util import achar_coluna, chave, para_data, texto

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
    "Grupo de planejamento": [r"GRUPO.*PLANEJ", r"GRP.*PLAN"],
    "Ciclo": [r"CICLO", r"ESTRATEGIA", r"PACOTE", r"PERIODICIDADE", r"FREQUENCIA", r"INTERVALO"],
    "Data planejada": [r"DATA PLAN", r"DT PLAN", r"PLANEJAD", r"DATA PROGRAM"],
    "Data chamada": [r"DATA (DE )?CHAMADA", r"DT CHAM", r"CHAMADA EM"],
    "Data conclusão": [r"DATA (DE )?CONCL", r"DATA (DE )?ENCERR", r"DT CONCL", r"CONCLUSAO"],
    "Tipo de programação": [r"TIPO (DE )?PROGRAM", r"STATUS", r"TIPO (DE )?CHAMADA", r"AGENDAMENTO", r"PROGRAMACAO"],
    "Ordem": [r"^ORDEM$", r"^ORDEM", r"ORDEM"],
}
_TEXTO = ["Plano", "Item", "Texto", "Equipamento", "Objeto técnico", "Local de instalação", "Centro de trabalho",
          "Grupo de planejamento", "Ciclo", "Tipo de programação", "Ordem"]


def preparar_ip19(cru: pd.DataFrame) -> pd.DataFrame:
    df = pd.DataFrame(index=cru.index)
    usadas: set[str] = set()
    for nome, padroes in _COLUNAS.items():
        excluir = {"Ordem": r"TIPO|STATUS", "Texto": r"OBJETO|EQUIP|LOC", "Data conclusão": r"PLAN|CHAMADA",
                   "Tipo de programação": r"USUARIO|SISTEMA"}.get(nome)
        col = achar_coluna([c for c in cru.columns if c not in usadas], *padroes, excluir=excluir)
        if col:
            usadas.add(col)
        df[nome] = cru[col] if col else ""
    for c in _TEXTO:
        df[c] = texto(df[c])
    for c in ["Data planejada", "Data chamada", "Data conclusão"]:
        df[c] = para_data(df[c])
    df = df[(df["Plano"] != "") & (df["Data planejada"].notna() | df["Data chamada"].notna())]
    return df.reset_index(drop=True)


def de_iw38(iw38: pd.DataFrame) -> pd.DataFrame:
    """Chamadas aproximadas a partir das ordens do IW38 que têm plano."""
    o = iw38[iw38["Com plano"]]
    return pd.DataFrame({
        "Plano": o["Plano"].values, "Item": "", "Texto": o["Texto"].values,
        "Equipamento": o["Equipamento"].values, "Objeto técnico": o["Objeto técnico"].values,
        "Local de instalação": o["Local de instalação"].values, "Centro de trabalho": o["Centro de trabalho"].values,
        "Grupo de planejamento": "", "Ciclo": "", "Data planejada": o["Início"].values,
        "Data chamada": o["Entrada"].values, "Data conclusão": pd.NaT, "Tipo de programação": "",
        "Ordem": o["Ordem"].values, "_do_iw38": True,
    })


# ----------------------------------------------------------------------------
# Cruzamento com o IW38 e classificação
# ----------------------------------------------------------------------------
def classificar(ch: pd.DataFrame, iw38: pd.DataFrame | None, hoje: pd.Timestamp | None = None) -> pd.DataFrame:
    """Acrescenta Situação, Data (referência da semana), situação/custo da ordem no IW38."""
    hoje = (hoje or pd.Timestamp.now()).normalize()
    ch = ch.copy()
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
    chamada = (ch["Ordem"] != "") | tp.str.contains("CHAMAD")
    ch["Situação"] = np.select(
        [
            tp.str.contains("SALT|PULAD|SKIP") | (sit == "Cancelada"),
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
# Calendário 52 semanas
# ----------------------------------------------------------------------------
def semanas_do_ano(ano: int) -> int:
    return date(ano, 12, 28).isocalendar().week  # 52 ou 53


def segunda_da_semana(ano: int, semana: int) -> date:
    return date.fromisocalendar(ano, semana, 1)


def montar_calendario(ch: pd.DataFrame, ano: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Devolve (grade com o texto das células, grade com a situação de cada célula).

    Uma linha por plano (e item, quando a IP19 traz item); uma coluna por semana ISO."""
    n = semanas_do_ano(ano)
    cols_sem = [f"S{w:02d}" for w in range(1, n + 1)]
    doano = ch[ch["Ano"] == ano]
    todas = ch  # ciclo estimado olha o histórico inteiro do plano

    linhas, situ = [], []
    ordem_pri = {s: i for i, s in enumerate(PRIORIDADE)}
    for chave_plano, g in doano.groupby("Chave", sort=True):
        h = todas[todas["Chave"] == chave_plano]
        moda = lambda s: s[s != ""].mode().iat[0] if (s != "").any() else ""  # noqa: E731
        ciclo = moda(h["Ciclo"]) or _ciclo_estimado(h["Data"])
        info = {"Plano": chave_plano, "Descrição": moda(g["Texto"]), "Equipamento": moda(g["Objeto técnico"]) or moda(g["Equipamento"]),
                "Centro": moda(g["Centro de trabalho"]), "Ciclo": ciclo,
                "Chamadas": len(g), "Atrasadas": int((g["Situação"] == ATRASADA).sum())}
        txt = dict.fromkeys(cols_sem, "")
        st_ = dict.fromkeys(cols_sem, "")
        for w, gw in g.groupby("Semana"):
            pior = min(gw["Situação"], key=lambda s: ordem_pri[s])
            col = f"S{int(w):02d}"
            txt[col] = SIMBOLO[pior] + (f"{len(gw)}" if len(gw) > 1 else "")
            st_[col] = pior
        linhas.append({**info, **txt})
        situ.append({**dict.fromkeys(info, ""), **st_})
    grade = pd.DataFrame(linhas, columns=["Plano", "Descrição", "Equipamento", "Centro", "Ciclo", "Chamadas", "Atrasadas", *cols_sem])
    situacoes = pd.DataFrame(situ, columns=grade.columns)
    return grade, situacoes


def estilo(grade: pd.DataFrame, situacoes: pd.DataFrame, semana_atual: int | None):
    """Pinta as células das semanas pela situação (pandas Styler, que o st.dataframe respeita)."""
    def css(_):
        out = pd.DataFrame("", index=grade.index, columns=grade.columns)
        for c in grade.columns:
            if not c.startswith("S"):
                continue
            borda = "border-left:2px solid #0E9F46;border-right:2px solid #0E9F46;" if semana_atual and c == f"S{semana_atual:02d}" else ""
            out[c] = situacoes[c].map(lambda s: (f"background-color:{COR[s][0]};color:{COR[s][1]};font-weight:700;" if s else "") + borda)
        out["Atrasadas"] = np.where(grade["Atrasadas"] > 0, f"color:{COR[ATRASADA][1]};font-weight:700;", "")
        return out
    return grade.style.apply(css, axis=None)


def carga_semanal(ch: pd.DataFrame, ano: int) -> pd.DataFrame:
    d = ch[ch["Ano"] == ano].groupby(["Semana", "Situação"]).size().reset_index(name="Chamadas")
    d["Semana"] = d["Semana"].astype(int)
    return d


def celulas(ch: pd.DataFrame, ano: int, ordem_planos: list[str], descricoes: dict[str, str]) -> pd.DataFrame:
    """Formato longo para o mapa de calor: uma linha por plano × semana com chamada."""
    doano = ch[(ch["Ano"] == ano) & ch["Chave"].isin(ordem_planos)]
    pri = {s: i for i, s in enumerate(PRIORIDADE)}
    linhas = []
    for (chave_plano, semana), g in doano.groupby(["Chave", "Semana"], sort=False):
        pior = min(g["Situação"], key=lambda s: pri[s])
        seg = segunda_da_semana(ano, int(semana))
        linhas.append({
            "Chave": chave_plano, "Plano": f"{chave_plano} · {descricoes.get(chave_plano, '')[:34]}",
            "Semana": int(semana), "Situação": pior, "Chamadas": len(g),
            "Símbolo": SIMBOLO[pior] + (str(len(g)) if len(g) > 1 else ""),
            "Período": f"{seg:%d/%m} a {seg + pd.Timedelta(days=6):%d/%m}",
            "Datas": ", ".join(sorted({d.strftime("%d/%m") for d in g["Data"].dropna()})),
            "Ordens": ", ".join(o for o in g["Ordem"] if o) or "—",
        })
    return pd.DataFrame(linhas)


MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]


def semanas_dos_meses(ano: int) -> dict[int, str]:
    """{semana ISO em que cada mês começa: 'Jan', ...} para o eixo do calendário."""
    marcas = {}
    for m in range(1, 13):
        d = date(ano, m, 1)
        a, w, _ = d.isocalendar()
        if a != ano:  # 1º de janeiro na última semana do ano anterior
            w = 1
        marcas.setdefault(w, MESES_CURTOS[m - 1])
    return marcas
