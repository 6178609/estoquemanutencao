"""Funções pequenas de normalização usadas em todo o app."""

from __future__ import annotations

import re
import unicodedata
from datetime import date, datetime

import numpy as np
import pandas as pd


def sem_acento(texto) -> str:
    texto = "" if texto is None else str(texto)
    return "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")


def chave(texto) -> str:
    """Normaliza um cabeçalho para comparação: sem acento, maiúsculo, só letras/números.

    "Denominação do loc.instalação" -> "DENOMINACAO DO LOC INSTALACAO"
    """
    return re.sub(r"[^A-Z0-9]+", " ", sem_acento(texto).upper()).strip()


def achar_coluna(colunas, *padroes: str, excluir: str | None = None) -> str | None:
    """Primeira coluna cuja chave normalizada casa com algum dos padrões (regex), na ordem dada."""
    chaves = {c: chave(c) for c in colunas}
    for padrao in padroes:
        rx = re.compile(padrao)
        for col, k in chaves.items():
            if rx.search(k) and not (excluir and re.search(excluir, k)):
                return col
    return None


def para_numero(serie: pd.Series) -> pd.Series:
    """Converte números vindos do SAP/Excel: 1.234,56 · 1234.56 · 1234,56 · 12,00- (sinal no fim)."""
    if pd.api.types.is_numeric_dtype(serie):
        return serie.astype(float)

    def conv(v):
        if v is None or (isinstance(v, float) and np.isnan(v)):
            return np.nan
        if isinstance(v, (int, float, np.number)):
            return float(v)
        s = str(v).strip()
        if not s:
            return np.nan
        neg = s.endswith("-") or s.startswith("-")
        s = re.sub(r"[^0-9.,]", "", s)
        if not s:
            return np.nan
        if "," in s:
            s = s.replace(".", "").replace(",", ".")
        elif s.count(".") > 1:
            s = s.replace(".", "")
        try:
            n = float(s)
        except ValueError:
            return np.nan
        return -abs(n) if neg else n

    return serie.map(conv).astype(float)


def para_data(serie: pd.Series) -> pd.Series:
    """Datas em dd/mm/aaaa, dd.mm.aaaa, datetime do Excel ou número serial do Excel."""
    if pd.api.types.is_datetime64_any_dtype(serie):
        return serie.dt.tz_localize(None) if serie.dt.tz is not None else serie

    def conv(v):
        if v is None or v == "" or (isinstance(v, float) and np.isnan(v)):
            return pd.NaT
        if isinstance(v, (datetime, date, pd.Timestamp)):
            return pd.Timestamp(v)
        if isinstance(v, (int, float, np.number)):
            if 20000 < v < 80000:  # serial do Excel
                return pd.Timestamp("1899-12-30") + pd.Timedelta(days=float(v))
            return pd.NaT
        s = str(v).strip()
        m = re.match(r"^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})", s)
        if m:
            d, mes, a = m.groups()
            if len(a) == 2:
                a = "20" + a
            try:
                return pd.Timestamp(int(a), int(mes), int(d))
            except ValueError:
                return pd.NaT
        return pd.to_datetime(s, errors="coerce")

    # Muitas datas se repetem: converte só os valores distintos.
    distintos = pd.Series(serie.dropna().unique())
    mapa = dict(zip(distintos, distintos.map(conv)))
    return pd.to_datetime(serie.map(mapa), errors="coerce")


def texto(serie: pd.Series) -> pd.Series:
    """Coluna como texto limpo (sem 'nan', sem '.0' em códigos numéricos)."""
    def conv(v):
        if v is None or (isinstance(v, float) and np.isnan(v)):
            return ""
        if isinstance(v, float) and v.is_integer():
            return str(int(v))
        return str(v).strip()

    return serie.map(conv).astype(str)


def brl(valor) -> str:
    try:
        v = float(valor)
    except (TypeError, ValueError):
        v = 0.0
    if np.isnan(v):
        v = 0.0
    s = f"{abs(v):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"-R$ {s}" if v < 0 else f"R$ {s}"


def brl_curto(valor) -> str:
    """R$ 1,2 mi · R$ 350 mil — para cartões de indicador."""
    v = float(valor or 0)
    a = abs(v)
    if a >= 1_000_000:
        s = f"R$ {v / 1_000_000:,.1f} mi"
    elif a >= 10_000:
        s = f"R$ {v / 1_000:,.0f} mil"
    else:
        return brl(v)
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def inteiro(n) -> str:
    return f"{int(n or 0):,}".replace(",", ".")


def pct(parte, total, casas: int = 1) -> str:
    if not total:
        return "—"
    return f"{parte / total * 100:.{casas}f}%".replace(".", ",")


MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
