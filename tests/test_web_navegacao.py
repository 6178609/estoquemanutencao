"""O site novo (web/, Next.js na Vercel) usa a mesma lista de abas: uma aba nova aqui precisa existir lá também,
senão escaparia do controle de acesso (ou sumiria do menu) no site novo."""

import re
from pathlib import Path

from central import auth, navegacao

WEB = Path(__file__).resolve().parent.parent / "web" / "lib"


def test_mesmas_abas_na_mesma_ordem():
    ts = (WEB / "navegacao.ts").read_text(encoding="utf-8")
    assert re.findall(r'\{ id: "([a-z_]+)"', ts) == [pid for _, pid, _ in navegacao.abas()]


def test_mesmas_regras_de_acesso():
    ts = (WEB / "auth" / "acesso.ts").read_text(encoding="utf-8")
    assert set(re.findall(r'"([a-z_]+)"', re.search(r"PAGINAS_LIVRES = new Set\(\[(.*?)\]\)", ts).group(1))) == \
        auth.PAGINAS_LIVRES
    assert dict(re.findall(r'(\w+): "([^"]+)"', re.search(r"PAGINAS_PARCIAIS[^=]*= \{(.*?)\}", ts).group(1))) == \
        auth.PAGINAS_PARCIAIS
    assert re.search(r"ITERACOES = 260_000", (WEB / "auth" / "senha.ts").read_text(encoding="utf-8"))
    assert auth.ITERACOES == 260_000
