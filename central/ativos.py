"""Gestão de ativos: o inventário de equipamentos da planta num lugar só, no estilo dos EAM do mercado
(SAP EAM, IBM Maximo, Infor): cadastro, criticidade, situação, ciclo de vida, custo, confiabilidade e cobertura
de manutenção preventiva — e a recomendação do que fazer com cada ativo.

Universo: equipamentos do IH08 + os cadastrados no site + os que aparecem nas ordens do IW38.

Campos de ciclo de vida (cadastro do site, `cadastro_equipamentos.json`): situação, fabricante, modelo, nº de série,
ano de instalação, vida útil (anos), garantia até e valor de reposição (R$).

Recomendação (a primeira regra que vale):
1. Desativado → "—";
2. custo de manutenção em 12 meses ≥ 50% do valor de reposição, ou vida útil vencida com saúde crítica →
   "Avaliar substituição" (reparar ou substituir);
3. criticidade Alta/Média sem plano de manutenção preventiva → "Criar plano preventivo";
4. saúde crítica → "Atacar causa das falhas";
5. sem criticidade → "Classificar criticidade";
6. senão "Manter".

Pandas puro (testado em tests/test_ativos.py).
"""

from __future__ import annotations

import pandas as pd

SITUACOES = ["Em operação", "Parado", "Reserva", "Em reforma", "Desativado"]
OPERACAO, DESATIVADO = SITUACOES[0], SITUACOES[-1]
LIMITE_SUBSTITUICAO = 0.5        # custo de 12 meses ÷ valor de reposição que já pede a análise de substituição
AVISO_GARANTIA_DIAS = 90
JANELA_DIAS = 365

SUBSTITUIR, CRIAR_PLANO, ATACAR, CLASSIFICAR, MANTER = (
    "Avaliar substituição", "Criar plano preventivo", "Atacar causa das falhas", "Classificar criticidade", "Manter")
RECOMENDACOES = [SUBSTITUIR, CRIAR_PLANO, ATACAR, CLASSIFICAR, MANTER]
GARANTIAS = ["Vigente", f"Vence em {AVISO_GARANTIA_DIAS} dias", "Vencida", "Sem garantia cadastrada"]
ABC_PARA_CRITICIDADE = {"A": "Alta", "B": "Média", "C": "Baixa"}
PENDENTES = ("Aberta", "Liberada", "Encerrada sem confirmação")     # o mesmo de bases.PENDENTES

COLUNAS = ["Código", "Equipamento", "Situação", "Criticidade", "ABC", "Categoria", "Área", "Local de instalação",
           "Centro", "Origem", "Fabricante", "Modelo", "Nº de série", "Ano de instalação", "Idade (anos)",
           "Vida útil (anos)", "Vida restante (anos)", "Garantia até", "Garantia", "Valor de reposição",
           "Custo 12 meses", "Custo ÷ reposição %", "Custo total", "Ordens pendentes", "Quebras 12 meses",
           "MTBF (dias)", "Saúde", "Faixa", "Planos preventivos", "Coberto por plano", "Peças vinculadas",
           "Recomendação"]


def _num(v) -> float | None:
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return x if x == x and x > 0 else None


def _moda(df: pd.DataFrame, chave: str, col: str, idx: pd.Index) -> pd.Series:
    if df is None or not len(df) or col not in df:
        return pd.Series("", index=idx)
    v = df[[chave, col]].astype({col: str})
    v = v[(v[col] != "") & (v[col] != "nan")]
    if not len(v):
        return pd.Series("", index=idx)
    cont = v.groupby([chave, col]).size().reset_index(name="n").sort_values([chave, "n"], ascending=[True, False])
    return cont.drop_duplicates(chave).set_index(chave)[col].reindex(idx).fillna("")


def situacao_garantia(ate, hoje: pd.Timestamp) -> str:
    ate = pd.to_datetime(ate, errors="coerce")
    if pd.isna(ate):
        return GARANTIAS[3]
    if ate < hoje:
        return GARANTIAS[2]
    return GARANTIAS[1] if ate <= hoje + pd.Timedelta(days=AVISO_GARANTIA_DIAS) else GARANTIAS[0]


def inventario(hoje, *, equip: pd.DataFrame | None = None, ordens: pd.DataFrame | None = None,
               cad_eq: dict | None = None, quebras: pd.DataFrame | None = None,
               chamadas: pd.DataFrame | None = None, saude: pd.DataFrame | None = None) -> pd.DataFrame:
    """Uma linha por ativo com cadastro, ciclo de vida, custo, confiabilidade, plano e recomendação.

    equip: IH08 preparado · ordens: IW38 preparado (todas as datas) · cad_eq: cadastro do site ·
    quebras: indicadores.quebras · chamadas: IP19 classificada · saude: saude.calcular."""
    hoje = pd.Timestamp(hoje).normalize()
    desde = hoje - pd.Timedelta(days=JANELA_DIAS)
    cad_eq = {k: v for k, v in (cad_eq or {}).items() if isinstance(v, dict)}
    tem_eq = equip is not None and len(equip) > 0
    o = ordens if ordens is not None and len(ordens) else None
    if o is not None:
        o = o[(o["Equip. (chave)"] != "") & (o["Situação"] != "Cancelada")]

    sap = set(equip["Equipamento"]) if tem_eq else set()
    das_ordens = set(o["Equip. (chave)"]) if o is not None else set()
    universo = (sap | set(cad_eq) | das_ordens) - {""}
    if not universo:
        return pd.DataFrame(columns=COLUNAS)
    idx = pd.Index(sorted(universo), name="Código")
    t = pd.DataFrame(index=idx)
    info = pd.Series([cad_eq.get(k) or {} for k in idx], index=idx)

    def campo(nome: str) -> pd.Series:
        return info.map(lambda i: str(i.get(nome) or "").strip())

    ref = equip.drop_duplicates("Equipamento").set_index("Equipamento") if tem_eq else None

    def do_sap(col: str) -> pd.Series:
        if ref is None or col not in ref:
            return pd.Series("", index=idx)
        return ref[col].reindex(idx).fillna("").astype(str)

    # identificação: o nome digitado no site vale; sem ele, o do SAP (IH08, depois IW38)
    nome = campo("nome")
    nome = nome.where(nome != "", do_sap("Denominação"))
    if o is not None:
        nome = nome.where(nome != "", o.groupby("Equip. (chave)")["Objeto técnico"].first().reindex(idx).fillna(""))
    t["Equipamento"] = nome
    t["Origem"] = ["SAP + site" if k in sap and k in cad_eq else ("SAP" if k in sap or k in das_ordens else "Site")
                   for k in idx]

    # situação: a do cadastro do site; sem ela, desativado pelo IH08 ou em operação
    desat = (ref["Desativado"].reindex(idx).fillna(False).astype(bool) if ref is not None and "Desativado" in ref
             else pd.Series(False, index=idx))
    sit = campo("situacao")
    t["Situação"] = sit.where(sit.isin(SITUACOES), desat.map({True: DESATIVADO, False: OPERACAO}))

    t["ABC"] = do_sap("Código ABC").str.upper().str.strip()
    crit = campo("criticidade")
    t["Criticidade"] = crit.where(crit != "", t["ABC"].map(ABC_PARA_CRITICIDADE).fillna(""))
    t["Categoria"] = campo("categoria")
    area = do_sap("Localização")
    local = do_sap("Local de instalação")
    if o is not None:
        area = area.where(area != "", _moda(o, "Equip. (chave)", "Localização", idx))
        local = local.where(local != "", _moda(o, "Equip. (chave)", "Local de instalação", idx))
    t["Área"], t["Local de instalação"] = area, local
    t["Centro"] = _moda(o, "Equip. (chave)", "Centro de trabalho", idx) if o is not None else ""

    # ciclo de vida
    for col, nome_campo in (("Fabricante", "fabricante"), ("Modelo", "modelo"), ("Nº de série", "serie")):
        t[col] = campo(nome_campo)
    ano = info.map(lambda i: _num(i.get("ano_instalacao")))
    ano = ano.where(ano.between(1900, hoje.year))
    t["Ano de instalação"] = ano.astype("Int64")
    t["Idade (anos)"] = (hoje.year - ano).astype("Int64")
    t["Vida útil (anos)"] = info.map(lambda i: _num(i.get("vida_util"))).astype("Float64")
    t["Vida restante (anos)"] = (t["Vida útil (anos)"] - t["Idade (anos)"].astype("Float64"))
    t["Garantia até"] = pd.to_datetime(info.map(lambda i: i.get("garantia_ate") or None), errors="coerce")
    t["Garantia"] = t["Garantia até"].map(lambda d: situacao_garantia(d, hoje))
    t["Valor de reposição"] = info.map(lambda i: _num(i.get("valor_reposicao"))).astype("Float64")

    # custo e pendências (IW38)
    if o is not None:
        o12 = o[(o["Data"] >= desde) & (o["Data"] <= hoje)]
        t["Custo 12 meses"] = o12.groupby("Equip. (chave)")["Custo real"].sum().reindex(idx, fill_value=0.0)
        t["Custo total"] = o.groupby("Equip. (chave)")["Custo real"].sum().reindex(idx, fill_value=0.0)
        t["Ordens pendentes"] = o[o["Situação"].isin(PENDENTES)].groupby("Equip. (chave)").size().reindex(idx, fill_value=0)
    else:
        t["Custo 12 meses"], t["Custo total"], t["Ordens pendentes"] = 0.0, 0.0, 0
    t["Custo ÷ reposição %"] = (t["Custo 12 meses"] / t["Valor de reposição"] * 100).astype("Float64").round(0)

    # confiabilidade: quebras de 12 meses e MTBF (dias da janela ÷ quebras)
    if quebras is not None and len(quebras):
        q = quebras[(quebras["Data"] >= desde) & (quebras["Data"] <= hoje + pd.Timedelta(days=1))]
        t["Quebras 12 meses"] = q.groupby("Equip. (chave)").size().reindex(idx, fill_value=0)
    else:
        t["Quebras 12 meses"] = 0
    t["MTBF (dias)"] = (JANELA_DIAS / t["Quebras 12 meses"].where(t["Quebras 12 meses"] > 0)).round(0).astype("Float64")

    # saúde (índice 0–100 da Saúde dos ativos)
    if saude is not None and len(saude):
        s = saude.drop_duplicates("Código").set_index("Código")
        t["Saúde"] = s["Saúde"].reindex(idx).astype("Float64")
        t["Faixa"] = s["Faixa"].reindex(idx).fillna("")
    else:
        t["Saúde"], t["Faixa"] = pd.Series(pd.NA, index=idx, dtype="Float64"), ""

    # cobertura preventiva: planos de manutenção (IP19, ou as ordens de plano do IW38) do equipamento
    planos = pd.Series(0, index=idx)
    if chamadas is not None and len(chamadas) and "Equipamento" in chamadas:
        ch = chamadas[chamadas["Equipamento"] != ""]
        if "Situação" in ch:
            ch = ch[ch["Situação"] != "Saltada/cancelada"]
        planos = planos.add(ch.groupby("Equipamento")["Plano"].nunique().reindex(idx, fill_value=0), fill_value=0)
    if o is not None and "Com plano" in o and "Plano" in o:
        op = o[o["Com plano"] & (o["Plano"] != "") & (o["Data"] >= desde)]
        do_iw38 = op.groupby("Equip. (chave)")["Plano"].nunique().reindex(idx, fill_value=0)
        planos = planos.where(planos > 0, do_iw38)
    t["Planos preventivos"] = planos.astype(int)
    t["Coberto por plano"] = t["Planos preventivos"] > 0
    t["Peças vinculadas"] = info.map(lambda i: len(dict.fromkeys(i.get("materiais") or []))).astype(int)

    t["Recomendação"] = [recomendar(r) for r in t.to_dict("records")]
    t = t.reset_index()
    ordem_crit = t["Criticidade"].map({"Alta": 0, "Média": 1, "Baixa": 2}).fillna(3)
    return (t.assign(_o=ordem_crit).sort_values(["_o", "Custo 12 meses"], ascending=[True, False])
             .drop(columns="_o")[COLUNAS].reset_index(drop=True))


def recomendar(g: dict) -> str:
    """Recomendação de um ativo (uma linha do inventário como dicionário)."""
    if g.get("Situação") == DESATIVADO:
        return "—"
    pct = g.get("Custo ÷ reposição %")
    resto = g.get("Vida restante (anos)")
    critica = g.get("Faixa") == "Crítica"
    if (pd.notna(pct) and pct >= LIMITE_SUBSTITUICAO * 100) or (pd.notna(resto) and resto <= 0 and critica):
        return SUBSTITUIR
    if g.get("Criticidade") in ("Alta", "Média") and not g.get("Coberto por plano"):
        return CRIAR_PLANO
    if critica:
        return ATACAR
    if not g.get("Criticidade"):
        return CLASSIFICAR
    return MANTER


def resumo(t: pd.DataFrame) -> dict:
    """Números do topo da Gestão de ativos (desativados ficam fora, exceto na própria contagem)."""
    ativos = t[t["Situação"] != DESATIVADO] if len(t) else t
    crit = ativos[ativos["Criticidade"].isin(("Alta", "Média"))] if len(ativos) else ativos
    alta = ativos[ativos["Criticidade"] == "Alta"] if len(ativos) else ativos
    return {
        "ativos": len(ativos), "desativados": len(t) - len(ativos),
        "alta": len(alta), "sem_criticidade": int((ativos["Criticidade"] == "").sum()) if len(ativos) else 0,
        "parados": int((ativos["Situação"] == "Parado").sum()) if len(ativos) else 0,
        "cobertura_criticos": float(crit["Coberto por plano"].mean() * 100) if len(crit) else None,
        "cobertura_alta": float(alta["Coberto por plano"].mean() * 100) if len(alta) else None,
        "custo_12m": float(ativos["Custo 12 meses"].sum()) if len(ativos) else 0.0,
        "substituir": int((ativos["Recomendação"] == SUBSTITUIR).sum()) if len(ativos) else 0,
        "garantia_vencendo": int((ativos["Garantia"] == GARANTIAS[1]).sum()) if len(ativos) else 0,
    }


def pareto_custo(t: pd.DataFrame, n: int = 15) -> pd.DataFrame:
    """Os `n` ativos que mais custaram em 12 meses (bad actors) com o % acumulado do custo da planta."""
    a = t[(t["Situação"] != DESATIVADO) & (t["Custo 12 meses"] > 0)].sort_values("Custo 12 meses", ascending=False)
    total = float(a["Custo 12 meses"].sum())
    if not total:
        return pd.DataFrame(columns=["Código", "Equipamento", "Criticidade", "Custo 12 meses", "% acumulado"])
    a = a.assign(**{"% acumulado": a["Custo 12 meses"].cumsum() / total * 100})
    return a.head(n)[["Código", "Equipamento", "Criticidade", "Custo 12 meses", "% acumulado"]].reset_index(drop=True)


def completude(t: pd.DataFrame) -> pd.DataFrame:
    """% dos ativos (não desativados) com cada informação preenchida — as lacunas do cadastro."""
    a = t[t["Situação"] != DESATIVADO]
    if not len(a):
        return pd.DataFrame(columns=["Informação", "Preenchido %", "Faltando"])
    campos = {
        "Criticidade": a["Criticidade"] != "",
        "Plano preventivo (Alta/Média)": a.loc[a["Criticidade"].isin(("Alta", "Média")), "Coberto por plano"],
        "Local de instalação": a["Local de instalação"] != "",
        "Fabricante / modelo": (a["Fabricante"] != "") | (a["Modelo"] != ""),
        "Ano de instalação": a["Ano de instalação"].notna(),
        "Valor de reposição": a["Valor de reposição"].notna(),
        "Peças vinculadas": a["Peças vinculadas"] > 0,
    }
    linhas = [{"Informação": k, "Preenchido %": float(v.mean() * 100) if len(v) else 100.0,
               "Faltando": int((~v.astype(bool)).sum())} for k, v in campos.items()]
    return pd.DataFrame(linhas)
