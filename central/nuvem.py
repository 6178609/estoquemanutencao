"""Formato das bases no repositório de dados (modo nuvem/GitHub): um parquet por base, tudo como texto.

Quem grava: o sincronizador do PC (export mais novo de cada base) e o próprio site, quando alguém envia um export
pela tela (Fontes de dados). Quem lê: este site (modo GitHub) e o site novo (web/, Next.js na Vercel), que lê só
estes parquets.
"""

from __future__ import annotations

import io
import math
from datetime import date, datetime

import pandas as pd

from .leitura import ACAO_AF, AF, CATMAT, CONF, EQUIP, EQUIPE, IP19, IW38, MB52, NOTAS, OPER, REQ

DESTINO = {IW38: "bases/IW38.parquet", MB52: "bases/MB52.parquet", REQ: "bases/REQUISICOES.parquet",
           IP19: "bases/IP19.parquet", OPER: "bases/IW38OP.parquet", NOTAS: "bases/IW28.parquet",
           EQUIP: "bases/IH08.parquet", CONF: "bases/IW47.parquet", EQUIPE: "bases/EQUIPE.parquet",
           AF: "bases/AF.parquet", ACAO_AF: "bases/AF_ACOES.parquet", CATMAT: "bases/CATALOGO_MATERIAIS.parquet"}


def _texto(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float):
        if math.isnan(v):
            return ""
        if v.is_integer():
            return str(int(v))
        s = repr(v)
        return f"{v:.10f}".rstrip("0") if "e" in s else s
    if isinstance(v, (datetime, pd.Timestamp)):
        if pd.isna(v):
            return ""
        return v.strftime("%d/%m/%Y %H:%M") if (v.hour or v.minute) else v.strftime("%d/%m/%Y")
    if isinstance(v, date):
        return v.strftime("%d/%m/%Y")
    return str(v).strip()


def para_parquet(df: pd.DataFrame) -> bytes:
    """Tabela crua → parquet (zstd) com todas as colunas como texto, no formato que os dois sites já entendem."""
    saida = pd.DataFrame({c: df[c].map(_texto).astype(str) for c in df.columns})
    buf = io.BytesIO()
    saida.to_parquet(buf, index=False, compression="zstd")
    return buf.getvalue()
