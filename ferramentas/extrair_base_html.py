"""Extrai a base IW38 que vinha embutida no site antigo (ESTOQUE MANUTENÇÃO.html)
e grava como arquivo que o app novo lê sozinho.

Uso:
    uv run python ferramentas/extrair_base_html.py "ESTOQUE MANUTENÇÃO.html" [pasta_destino]

Sem pasta de destino, grava em dados/. Só é útil se o IW38BK.XLSX original não
estiver mais nas pastas — normalmente o app já encontra o export do SAP direto.
"""

import base64
import gzip
import json
import re
import sys
from pathlib import Path

import pandas as pd


def extrair(html: Path) -> pd.DataFrame:
    txt = html.read_text(encoding="utf-8", errors="replace")
    m = re.search(r'<script[^>]*id="iw38-embed"[^>]*>(.*?)</script>', txt, re.S)
    if not m:
        raise SystemExit("Base IW38 embutida não encontrada nesse HTML.")
    pacote = json.loads(gzip.decompress(base64.b64decode(m.group(1).strip())))
    colunas = {}
    for h in pacote["h"]:
        c = pacote["c"][h]
        colunas[h] = [c["d"][i] for i in c["i"]] if isinstance(c, dict) else c
    return pd.DataFrame(colunas, columns=pacote["h"])


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    destino = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent / "dados"
    destino.mkdir(parents=True, exist_ok=True)
    df = extrair(Path(sys.argv[1]))
    saida = destino / "IW38_base_site_antigo.parquet"
    df.to_parquet(saida, index=False)
    print(f"{len(df)} ordens gravadas em {saida}")
