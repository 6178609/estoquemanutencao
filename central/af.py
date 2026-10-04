"""Gerenciador de AF (análise de falha) — planos de AF e ações de AF.

Lê as duas abas do "Gerenciador de AF" (Excel mantido pelo PCM): "Análise de Falha"
(uma linha por AF) e "Plano de ação AF" (uma linha por ação de cada AF). Tudo aqui é
pandas puro (sem Streamlit) e testado em tests/test_af.py.

Convenções (legenda da aba Base_Dados do próprio gerenciador):
- Status da análise: AP = analisada no prazo, AFP = analisada fora do prazo, EA = em
  andamento, R = risco de atraso, NA = não analisada, CANCELADA.
- Nas ações o gerenciador usa os mesmos códigos (AP/AFP = concluída no/fora do prazo).
  Ação sem status e sem data realizada ainda não foi iniciada.
- O nº da AF é, em 98% dos casos, a ordem corretiva da quebra (Nº O.S Corretiva); o código SAP
  liga a AF ao equipamento (ficha, quebras e ordens do site).
- Os indicadores corporativos seguem a aba "RESUMO CORPORATIVO": taxa de análise de
  quebra crítica (A), execução de AFs e ações de AFs, com gerado × executado por data limite.
"""

from __future__ import annotations

import re

import numpy as np
import pandas as pd

from .util import achar_coluna, chave, para_data, para_numero, texto

# ----------------------------------------------------------------------------
# Situações
# ----------------------------------------------------------------------------
AF_NO_PRAZO, AF_FORA_PRAZO, AF_ATRASADA, AF_RISCO, AF_ANDAMENTO, AF_CANCELADA = (
    "Analisada no prazo", "Analisada fora do prazo", "Atrasada", "Risco de atraso", "Em andamento", "Cancelada")
SITUACOES_AF = [AF_NO_PRAZO, AF_FORA_PRAZO, AF_ATRASADA, AF_RISCO, AF_ANDAMENTO, AF_CANCELADA]
AF_CONCLUIDAS = (AF_NO_PRAZO, AF_FORA_PRAZO)
AF_ABERTAS = (AF_ATRASADA, AF_RISCO, AF_ANDAMENTO)

AC_NO_PRAZO, AC_FORA_PRAZO, AC_ATRASADA, AC_VENCE, AC_ANDAMENTO, AC_NAO_INICIADA, AC_CANCELADA = (
    "Concluída no prazo", "Concluída fora do prazo", "Atrasada", "Vence em até 7 dias", "Em andamento",
    "Não iniciada", "Cancelada")
SITUACOES_ACAO = [AC_NO_PRAZO, AC_FORA_PRAZO, AC_ATRASADA, AC_VENCE, AC_ANDAMENTO, AC_NAO_INICIADA, AC_CANCELADA]
AC_CONCLUIDAS = (AC_NO_PRAZO, AC_FORA_PRAZO)
AC_ABERTAS = (AC_ATRASADA, AC_VENCE, AC_ANDAMENTO, AC_NAO_INICIADA)

COR = {  # verde / laranja / vermelho do tema; amarelo de risco; azul e cinzas neutros
    AF_NO_PRAZO: "#0E9F46", AF_FORA_PRAZO: "#F7931E", AF_ATRASADA: "#E3262B", AF_RISCO: "#F2B705",
    AF_ANDAMENTO: "#0A6EBD", AF_CANCELADA: "#B0B6B3",
    AC_NO_PRAZO: "#0E9F46", AC_FORA_PRAZO: "#F7931E", AC_ATRASADA: "#E3262B", AC_VENCE: "#F2B705",
    AC_ANDAMENTO: "#0A6EBD", AC_NAO_INICIADA: "#8C9491", AC_CANCELADA: "#B0B6B3",
}

PILARES = {"MP": "Manutenção Profissional", "PR": "Projeto (fragilidade)", "PS": "Peças sobressalentes / suprimentos",
           "OA": "Operação / manutenção autônoma", "PE": "Pessoas / educação"}
TIPOS_ACAO = ["Causa raiz", "TTR", "Padronização", "Expansão"]  # as 4 colunas de marcação da ação

# ----------------------------------------------------------------------------
# Leitura
# ----------------------------------------------------------------------------
_AF_COLUNAS = {
    "Nº AF": [r"^N DA ANALISE$"], "Tipo de análise": [r"^TIPO DE ANALISE$"], "Área": [r"^AREA$"],
    "Área da falha": [r"^AREA DA FALHA$"], "Código SAP": [r"^COD SAP$"], "Equipamento": [r"^EQUIPAMENTO$"],
    "Conjunto": [r"^CONJUNTO$"], "Subconjunto": [r"^SUBCONJUNTO$"], "Componente": [r"^COMPONENTE$"],
    "Pilar": [r"PILAR"], "Causa raiz": [r"^CAUSA RAIZ$"], "Especialidade": [r"ESPECIAL"],
    "Criticidade": [r"CRITICIDADE"], "OS corretiva": [r"O S CORRETIVA", r"OS CORRETIVA"],
    "Resumo": [r"RESUMO DA FALHA"], "Duração da parada (h)": [r"DURACAO DA PARADA"],
    "Supervisor": [r"SUPERVISOR"], "Turno": [r"^TURNO$"], "Status": [r"^STATUS DA ANALISE$"],
    "Data da falha": [r"^DATA DA FALHA$"], "Data limite": [r"DATA LIMITE"], "Ajuste": [r"^AJUSTE$|DATA AJUSTADA"],
    "Data da análise": [r"^DATA DA ANALISE$"], "% ações concluídas": [r"^STATUS DAS ACOES$"],
    "Link": [r"^LINK"], "Observações": [r"OBSERVAC"],
}
_ACAO_COLUNAS = {
    "Nº AF": [r"^N DA ANALISE$"], "Nº ação": [r"^N DA ACAO$"], "Tipo de análise": [r"^TIPO DE ANALISE$"],
    "Área": [r"^AREA$"], "Área da falha": [r"^AREA DA FALHA$"], "Código SAP": [r"^COD SAP$"],
    "Equipamento": [r"^EQUIPAMENTO$"], "Especialidade": [r"ESPECIALIDADE"], "OS de correção": [r"^O S DE CORRECAO"],
    "Link": [r"^LINK$"], "Ação": [r"^ACAO$"], "Causa raiz": [r"^CAUSA RAIZ$"], "TTR": [r"^TTR$"],
    "Padronização": [r"^PADRONIZACAO$"], "Expansão": [r"^EXPANSAO$"], "Supervisor": [r"SUPERVISOR"],
    "Responsável": [r"^RESPONSAVEL$"], "Status": [r"^STATUS$"], "Data de início": [r"DATA DE INICIO"],
    "Data limite": [r"DATA LIMITE"], "Data realizada": [r"DATA REALIZADA"], "Ordem da quebra": [r"ORDEM DA QUEBRA"],
    "Observações": [r"OBSERVAC"],
}
_TEXTOS_AF = ["Nº AF", "Tipo de análise", "Área", "Área da falha", "Código SAP", "Equipamento", "Conjunto",
              "Subconjunto", "Componente", "Pilar", "Causa raiz", "Especialidade", "Criticidade", "OS corretiva",
              "Resumo", "Supervisor", "Turno", "Status", "Ajuste", "Link", "Observações"]
_TEXTOS_ACAO = ["Nº AF", "Nº ação", "Tipo de análise", "Área", "Área da falha", "Código SAP", "Equipamento",
                "Especialidade", "OS de correção", "Link", "Ação", "Supervisor", "Responsável", "Status",
                "Ordem da quebra", "Observações"]
_SEM_VALOR = re.compile(r"^[\s*#.\-_]*$")  # "***", "###", ".", "########" que o gerenciador usa como vazio


def _padronizar(cru: pd.DataFrame, mapa: dict, textos: list[str], marcacoes: tuple = ()) -> pd.DataFrame:
    df = pd.DataFrame(index=cru.index)
    usadas: set = set()
    for nome, padroes in mapa.items():
        col = achar_coluna([c for c in cru.columns if c not in usadas], *padroes)
        if col is not None:
            usadas.add(col)
        df[nome] = cru[col] if col is not None else (False if nome in marcacoes else "")
    for c in textos:
        df[c] = texto(df[c]).str.replace(r"\s+", " ", regex=True).str.strip()
        df[c] = df[c].where(~df[c].str.fullmatch(_SEM_VALOR.pattern), "")
    return df


def _nome(serie: pd.Series) -> pd.Series:
    """Supervisor/responsável: 'Diego Santos', 'DIEGO SANTOS ' e 'diego santos' viram o mesmo nome."""
    return serie.map(lambda s: re.sub(r"\s+", " ", chave(s)).strip())


def _marcado(serie: pd.Series) -> pd.Series:
    """Colunas de marcação (caixa de seleção do Excel): True/'x'/'X'/'sim' = marcado."""
    return serie.map(lambda v: v is True or (isinstance(v, (int, float)) and not isinstance(v, bool) and v == 1)
                     or (isinstance(v, str) and chave(v) in {"TRUE", "X", "SIM", "S", "VERDADEIRO", "1"}))


def preparar_afs(cru: pd.DataFrame, hoje: pd.Timestamp | None = None) -> pd.DataFrame:
    """Uma linha por análise de falha, com a situação calculada e os prazos."""
    hoje = (hoje or pd.Timestamp.now()).normalize()
    df = _padronizar(cru, _AF_COLUNAS, _TEXTOS_AF)
    df = df[df["Nº AF"] != ""].copy()
    for c in ["Data da falha", "Data limite", "Data da análise"]:
        df[c] = para_data(df[c])
    df["Duração da parada (h)"] = para_numero(df["Duração da parada (h)"])
    pct = para_numero(df["% ações concluídas"])
    df["% ações concluídas"] = (pct * 100).where(pct <= 1, pct)  # o gerenciador guarda 0–1
    df["Pilar"] = df["Pilar"].str.upper()
    df["Criticidade"] = df["Criticidade"].str.upper().str[:1].where(df["Criticidade"] != "", "")
    df["Supervisor"] = _nome(df["Supervisor"])
    df["Status"] = df["Status"].str.upper()
    df["Situação"] = situacao_af(df, hoje)
    df["Dias para análise"] = (df["Data da análise"] - df["Data da falha"]).dt.days
    aberta = df["Situação"].isin(AF_ABERTAS)
    df["Dias de atraso"] = np.where(aberta & (df["Data limite"] < hoje), (hoje - df["Data limite"]).dt.days,
                                    np.where(df["Situação"] == AF_FORA_PRAZO,
                                             (df["Data da análise"] - df["Data limite"]).dt.days, 0))
    df["Dias de atraso"] = df["Dias de atraso"].clip(lower=0)
    return df.reset_index(drop=True)


def situacao_af(df: pd.DataFrame, hoje: pd.Timestamp) -> pd.Series:
    st, analise, limite = df["Status"], df["Data da análise"], df["Data limite"]
    cancelada = (st == "CANCELADA") | df["Ajuste"].str.upper().str.startswith("CANCEL")
    por_data = np.where(analise <= limite, AF_NO_PRAZO, AF_FORA_PRAZO)
    return pd.Series(np.select(
        [cancelada,
         st == "AP", st == "AFP",
         analise.notna() & limite.notna(),          # analisada, mas sem o código: decide pela data
         analise.notna(),
         limite.notna() & (limite < hoje),          # sem análise e com o prazo vencido
         st == "R"],
        [AF_CANCELADA, AF_NO_PRAZO, AF_FORA_PRAZO, por_data, AF_NO_PRAZO, AF_ATRASADA, AF_RISCO],
        default=AF_ANDAMENTO), index=df.index)


def preparar_acoes(cru: pd.DataFrame, hoje: pd.Timestamp | None = None, afs: pd.DataFrame | None = None) -> pd.DataFrame:
    """Uma linha por ação, com a situação calculada; `afs` completa área, criticidade e causa da AF."""
    hoje = (hoje or pd.Timestamp.now()).normalize()
    df = _padronizar(cru, _ACAO_COLUNAS, _TEXTOS_ACAO, marcacoes=tuple(TIPOS_ACAO))
    df = df[(df["Nº AF"] != "") & (df["Ação"] != "")].copy()
    for c in TIPOS_ACAO:
        df[c] = _marcado(df[c])
    for c in ["Data de início", "Data limite", "Data realizada"]:
        df[c] = para_data(df[c])
    df["Supervisor"] = _nome(df["Supervisor"])
    df["Responsável"] = _nome(df["Responsável"])
    df["Status"] = df["Status"].str.upper()
    df["ID"] = df["Nº AF"] + "-" + df["Nº ação"]
    df["Situação"] = situacao_acao(df, hoje)
    aberta = df["Situação"].isin(AC_ABERTAS)
    df["Dias de atraso"] = np.where(
        aberta & (df["Data limite"] < hoje), (hoje - df["Data limite"]).dt.days,
        np.where(df["Situação"] == AC_FORA_PRAZO, (df["Data realizada"] - df["Data limite"]).dt.days, 0))
    df["Dias de atraso"] = pd.to_numeric(df["Dias de atraso"], errors="coerce").clip(lower=0)
    df["Dias para concluir"] = (df["Data realizada"] - df["Data de início"]).dt.days
    df["Tipo da ação"] = df[TIPOS_ACAO].apply(lambda r: ", ".join(t for t in TIPOS_ACAO if r[t]), axis=1)
    if afs is not None and len(afs):
        ref = afs.drop_duplicates("Nº AF").set_index("Nº AF")
        df["AF cadastrada"] = df["Nº AF"].isin(ref.index)
        for c in ["Criticidade", "Pilar", "Causa raiz da AF", "Data da falha"]:
            origem = "Causa raiz" if c == "Causa raiz da AF" else c
            df[c] = df["Nº AF"].map(ref[origem])
        for c in ["Área", "Equipamento", "Código SAP"]:
            vazio = df[c] == ""
            df.loc[vazio, c] = df.loc[vazio, "Nº AF"].map(ref[c]).fillna("")
        df[["Criticidade", "Pilar", "Causa raiz da AF"]] = df[["Criticidade", "Pilar", "Causa raiz da AF"]].fillna("")
    else:
        df["AF cadastrada"] = False
        df["Criticidade"] = df["Pilar"] = df["Causa raiz da AF"] = ""
        df["Data da falha"] = pd.NaT
    return df.reset_index(drop=True)


def situacao_acao(df: pd.DataFrame, hoje: pd.Timestamp) -> pd.Series:
    st, feita, limite = df["Status"], df["Data realizada"], df["Data limite"]
    por_data = np.where(feita <= limite, AC_NO_PRAZO, AC_FORA_PRAZO)
    return pd.Series(np.select(
        [st.str.startswith("CANCEL"),
         feita.notna() & (st == "AP"), feita.notna() & (st == "AFP"),
         feita.notna() & limite.notna(), feita.notna(),
         limite.notna() & (limite < hoje),
         limite.notna() & (limite <= hoje + pd.Timedelta(days=7)),
         st.isin(["EA", "R", "A"])],
        [AC_CANCELADA, AC_NO_PRAZO, AC_FORA_PRAZO, por_data, AC_NO_PRAZO, AC_ATRASADA, AC_VENCE, AC_ANDAMENTO],
        default=AC_NAO_INICIADA), index=df.index)


# ----------------------------------------------------------------------------
# Indicadores (aba RESUMO CORPORATIVO)
# ----------------------------------------------------------------------------
def _entre(serie: pd.Series, ini, fim) -> pd.Series:
    return (serie >= pd.Timestamp(ini)) & (serie < pd.Timestamp(fim) + pd.Timedelta(days=1))


def _pct(a, b):
    return a / b * 100 if b else None


def quebras_a_iw28(notas: pd.DataFrame | None) -> pd.DataFrame:
    """Quebras de equipamento classe A registradas na IW28 (notas com parada) — só como referência:
    nem toda parada vira AF (o gatilho depende da duração) e a nota quase nunca traz a ordem da AF."""
    if notas is None or not len(notas):
        return pd.DataFrame(columns=["Nota", "Data", "Equip. (chave)"])
    return notas[notas["Com parada"] & (notas["Código ABC"] == "A") & notas["Data"].notna()]


def indicadores(afs: pd.DataFrame, acoes: pd.DataFrame, ini, fim, hoje: pd.Timestamp | None = None,
                notas: pd.DataFrame | None = None) -> dict[str, float | None]:
    """Indicadores de AF no período [ini, fim] (os de "hoje" valem para a data atual), com as
    definições da aba RESUMO CORPORATIVO do gerenciador (canceladas nunca contam):

    - taxa_quebra_a ("Taxa de Análise de Quebra Crít. (A)"): AFs de criticidade A com data da
      falha no período que já foram analisadas ÷ AFs A com data da falha no período.
    - af_execucao ("Execução de AF's"): AFs com data limite no período (até hoje) analisadas ÷
      AFs com data limite no período; af_no_prazo: só as analisadas até a data limite.
    - acoes_execucao ("Ações de AF's"): ações com data limite no período (até hoje) realizadas ÷
      ações com data limite no período; acoes_no_prazo: só as realizadas até a data limite.
    """
    hoje = (hoje or pd.Timestamp.now()).normalize()
    r: dict[str, float | None] = {}
    vivas = afs[afs["Situação"] != AF_CANCELADA]
    geradas = vivas[_entre(vivas["Data da falha"], ini, fim)]
    r["af_geradas"] = float(len(geradas))
    r["af_geradas_a"] = float((geradas["Criticidade"] == "A").sum())
    venc = vivas[_entre(vivas["Data limite"], ini, fim) & (vivas["Data limite"] <= hoje)]
    r["af_no_prazo"] = _pct(int((venc["Situação"] == AF_NO_PRAZO).sum()), len(venc))
    r["af_realizadas"] = float(venc["Situação"].isin(AF_CONCLUIDAS).sum())
    r["af_execucao"] = _pct(int(venc["Situação"].isin(AF_CONCLUIDAS).sum()), len(venc))
    r["af_atrasadas"] = float((vivas["Situação"] == AF_ATRASADA).sum())
    r["af_abertas"] = float(vivas["Situação"].isin(AF_ABERTAS).sum())
    analisadas = geradas[geradas["Dias para análise"].notna() & (geradas["Dias para análise"] >= 0)]
    r["dias_para_analise"] = float(analisadas["Dias para análise"].mean()) if len(analisadas) else None

    geradas_a = geradas[geradas["Criticidade"] == "A"]
    r["taxa_quebra_a"] = _pct(int(geradas_a["Situação"].isin(AF_CONCLUIDAS).sum()), len(geradas_a))
    r["af_a_no_prazo"] = _pct(int((geradas_a["Situação"] == AF_NO_PRAZO).sum()), len(geradas_a))
    if notas is not None:
        q = quebras_a_iw28(notas)
        r["quebras_a_iw28"] = float(_entre(q["Data"], ini, fim).sum())
    else:
        r["quebras_a_iw28"] = None

    vivas_ac = acoes[acoes["Situação"] != AC_CANCELADA]
    r["acoes_geradas"] = float(_entre(vivas_ac["Data de início"], ini, fim).sum())
    venc_ac = vivas_ac[_entre(vivas_ac["Data limite"], ini, fim) & (vivas_ac["Data limite"] <= hoje)]
    r["acoes_no_prazo"] = _pct(int((venc_ac["Situação"] == AC_NO_PRAZO).sum()), len(venc_ac))
    r["acoes_execucao"] = _pct(int(venc_ac["Situação"].isin(AC_CONCLUIDAS).sum()), len(venc_ac))
    r["acoes_realizadas"] = float(_entre(vivas_ac["Data realizada"], ini, fim).sum())
    r["acoes_atrasadas"] = float((vivas_ac["Situação"] == AC_ATRASADA).sum())
    r["acoes_abertas"] = float(vivas_ac["Situação"].isin(AC_ABERTAS).sum())
    r["acoes_por_af"] = (float(len(vivas_ac[_entre(vivas_ac["Data de início"], ini, fim)])) / len(geradas)
                         if len(geradas) else None)
    return r


def semanal(afs: pd.DataFrame, acoes: pd.DataFrame, ini, fim, hoje: pd.Timestamp | None = None,
            notas: pd.DataFrame | None = None) -> pd.DataFrame:
    """Acompanhamento semanal no formato do RESUMO CORPORATIVO: para cada semana (segunda a
    domingo) e indicador, Gerado × Executado × Percentual (taxa de quebra A pela data da falha;
    execução de AFs e ações pela data limite). `notas` não é usada (mantida por compatibilidade)."""
    hoje = (hoje or pd.Timestamp.now()).normalize()
    ini = pd.Timestamp(ini) - pd.Timedelta(days=pd.Timestamp(ini).dayofweek)
    semanas = pd.date_range(ini, pd.Timestamp(fim), freq="7D")
    vivas = afs[afs["Situação"] != AF_CANCELADA]
    vivas_a = vivas[vivas["Criticidade"] == "A"]
    vivas_ac = acoes[acoes["Situação"] != AC_CANCELADA]
    linhas = []
    for s in semanas:
        e = s + pd.Timedelta(days=6)
        w = vivas_a[_entre(vivas_a["Data da falha"], s, e)]
        linhas.append({"Semana": s, "Indicador": "Taxa de análise de quebra crítica (A)", "Gerado": len(w),
                       "Executado": int(w["Situação"].isin(AF_CONCLUIDAS).sum())})
        w = vivas[_entre(vivas["Data limite"], s, e)]
        linhas.append({"Semana": s, "Indicador": "Execução de AFs", "Gerado": len(w),
                       "Executado": int(w["Situação"].isin(AF_CONCLUIDAS).sum())})
        w = vivas_ac[_entre(vivas_ac["Data limite"], s, e)]
        linhas.append({"Semana": s, "Indicador": "Ações de AFs", "Gerado": len(w),
                       "Executado": int(w["Situação"].isin(AC_CONCLUIDAS).sum())})
    df = pd.DataFrame(linhas, columns=["Semana", "Indicador", "Gerado", "Executado"])
    df["Percentual"] = np.where(df["Gerado"] > 0, df["Executado"] / df["Gerado"].where(df["Gerado"] > 0) * 100, np.nan)
    df["Futura"] = df["Semana"] > hoje
    return df


def mensal(afs: pd.DataFrame, acoes: pd.DataFrame, ini, fim, hoje: pd.Timestamp | None = None,
           notas: pd.DataFrame | None = None) -> pd.DataFrame:
    """Série mês a mês dos indicadores de AF (linhas = 1º dia do mês)."""
    meses = pd.date_range(pd.Timestamp(ini).to_period("M").start_time, pd.Timestamp(fim), freq="MS")
    linhas = []
    for m in meses:
        a = max(m, pd.Timestamp(ini))
        b = min(m + pd.offsets.MonthEnd(0), pd.Timestamp(fim))
        linhas.append({"Mês": m, **indicadores(afs, acoes, a, b, hoje, notas)})
    return pd.DataFrame(linhas)


def acoes_da_af(acoes: pd.DataFrame, numero: str) -> pd.DataFrame:
    return acoes[acoes["Nº AF"] == numero].sort_values(["Data limite", "Nº ação"])
