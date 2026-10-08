"""Caminho PC → GitHub → site na nuvem, com a API do GitHub simulada em memória."""

import base64
import hashlib
import io
import json
import os
import re
import time
from urllib.parse import unquote

import pandas as pd
import pytest

from central import bases, fontes, leitura
from central.leitura import IW38, MB52
from sincronizador import sincronizar
from tests.test_dados import iw38_cru

API = "https://api.github.com"


class Resp:
    def __init__(self, status, corpo=None, conteudo=b""):
        self.status_code, self._corpo, self.content = status, corpo, conteudo
        self.text = str(corpo)

    def json(self):
        return self._corpo


class GitHubFalso:
    """Repositório em memória: {caminho: bytes}, com sha por conteúdo e conflito de sha como no GitHub."""

    def __init__(self, repo="org/dados"):
        self.repo, self.arquivos, self.commits = repo, {}, 0
        self.headers = {}
        self.historico = 0  # commits no ramo (a compactação zera para 1)

    @staticmethod
    def sha(b):
        return hashlib.sha1(b"blob %d\0" % len(b) + b).hexdigest()

    def request(self, metodo, url, params=None, headers=None, json=None, timeout=None):
        assert self.headers["Authorization"].startswith("Bearer ")
        m = re.match(rf"{API}/repos/{self.repo}/git/trees/main$", url)
        if m:
            if not self.arquivos:
                return Resp(409, "Git Repository is empty.")
            return Resp(200, {"tree": [{"path": p, "type": "blob", "sha": self.sha(b), "size": len(b)}
                                       for p, b in self.arquivos.items()]})
        if url == f"{API}/repos/{self.repo}/git/ref/heads/main":
            return Resp(200, {"object": {"sha": "topo"}}) if self.arquivos else Resp(404, "")
        if url == f"{API}/repos/{self.repo}/git/commits/topo":
            return Resp(200, {"tree": {"sha": "arvore"}})
        if url == f"{API}/repos/{self.repo}/git/commits" and metodo == "POST":
            assert json["parents"] == [] and json["tree"] == "arvore"
            return Resp(201, {"sha": "novo"})
        if url == f"{API}/repos/{self.repo}/git/refs/heads/main" and metodo == "PATCH":
            assert json == {"sha": "novo", "force": True}
            self.historico = 1
            return Resp(200, {})
        m = re.match(rf"{API}/repos/{self.repo}/contents/(.+)$", url)
        assert m, url
        caminho = unquote(m.group(1))
        if metodo == "GET":
            if caminho not in self.arquivos:
                return Resp(404, "Not Found")
            b = self.arquivos[caminho]
            if headers and headers.get("Accept") == "application/vnd.github.raw":
                return Resp(200, conteudo=b)
            return Resp(200, {"sha": self.sha(b), "content": base64.b64encode(b).decode()})
        if metodo == "PUT":
            atual = self.arquivos.get(caminho)
            if (atual is None) != ("sha" not in json) or (atual is not None and json["sha"] != self.sha(atual)):
                return Resp(409, "sha does not match")
            self.arquivos[caminho] = base64.b64decode(json["content"])
            self.commits += 1
            self.historico += 1
            return Resp(201 if atual is None else 200, {})
        raise AssertionError((metodo, url))


def _xlsx_com_capa(df):
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as xw:
        pd.DataFrame({"x": [1]}).to_excel(xw, sheet_name="Resumo", index=False)
        pd.DataFrame([["Indicadores IW38"]]).to_excel(xw, sheet_name="Base", index=False, header=False)
        df.to_excel(xw, sheet_name="Base", index=False, startrow=2)
    return buf.getvalue()


@pytest.fixture
def ambiente(tmp_path, monkeypatch):
    gh = GitHubFalso()
    monkeypatch.setattr(fontes.requests, "Session", lambda: gh)
    monkeypatch.setattr(sincronizar, "ARQ_ESTADO", tmp_path / "estado.json")
    estoque = tmp_path / "1.3 - Controle de Estoque"
    ind = tmp_path / "0.1 - Indicadores" / "2026"
    estoque.mkdir()
    ind.mkdir(parents=True)
    cfg = {"repo": "org/dados", "token": "t", "pastas": [estoque, tmp_path / "0.1 - Indicadores"]}
    return gh, cfg, estoque, ind


def test_texto_para_parquet():
    df = pd.DataFrame({"a": [1.0, 2.5, None, pd.Timestamp(2026, 9, 21), 1e-7, "X "]})
    assert list(pd.read_parquet(io.BytesIO(sincronizar.para_parquet(df)))["a"]) == \
        ["1", "2.5", "", "21/09/2026", "0.0000001", "X"]


def test_pc_envia_e_site_le(ambiente, monkeypatch):
    gh, cfg, estoque, ind = ambiente
    velho = ind / "IW38 agosto.xlsx"
    velho.write_bytes(_xlsx_com_capa(iw38_cru()))
    os.utime(velho, (time.time() - 3600, time.time() - 3600))
    (ind / "Indicadores.xlsx").write_bytes(_xlsx_com_capa(iw38_cru().head(3)))  # mais novo, IW38 numa aba
    mb = pd.DataFrame({"Material": [100200.0], "Texto breve material": ["ROLAMENTO"], "Utilização livre": [4.0]})
    mb.to_excel(estoque / "MB52.XLSX", index=False)

    monkeypatch.setattr(sincronizar, "_ULTIMO_SINAL", [None])
    assert sorted(sincronizar.rodada(cfg)) == [IW38, MB52]
    assert set(gh.arquivos) == {"bases/IW38.parquet", "bases/MB52.parquet", "bases/manifesto.json", "app/robo_pc.json"}
    # sinal de vida para o site: versão do robô e recursos (o site avisa quando o PC está com código antigo)
    sinal = json.loads(gh.arquivos["app/robo_pc.json"])
    (pc, info), = sinal.items()
    assert {"mudar_datas_iw38", "diagnostico"} <= set(info["recursos"]) and info["visto_em"]
    man = json.loads(gh.arquivos["bases/manifesto.json"])
    # vale só o export mais recente do IW38
    assert man["bases/IW38.parquet"]["origem"] == "0.1 - Indicadores/2026/Indicadores.xlsx › aba Base"
    assert man["bases/IW38.parquet"]["linhas"] == 3

    # 1ª rodada já compacta (e só volta a compactar daqui a 7 dias)
    assert gh.historico == 1
    estado = json.loads(sincronizar.ARQ_ESTADO.read_text())
    assert "compactado_em" in estado

    # nada mudou: não envia de novo (não enche o histórico do repositório)
    commits = gh.commits
    assert sincronizar.rodada(cfg) == []
    assert gh.commits == commits

    # o site na nuvem lendo o repositório
    for k, v in {"GH_REPO": "org/dados", "GH_TOKEN": "t", "EXIGIR_LOGIN": "nao"}.items():
        monkeypatch.setenv(f"CENTRAL_{k}", v)
    monkeypatch.delenv("CENTRAL_PASTAS", raising=False)
    bases._fonte_cacheada.clear()
    bases.recarregar()
    try:
        from central import config
        assert config.carregar().fonte == "github"
        df = bases.iw38().df
        assert len(df) == 3 and df["Custo real"].sum() == pytest.approx(1800.0)
        assert bases.mb52().df.set_index("Material").loc["100200", "Estoque"] == 4.0  # código sem ".0"
        assert bases.iw38().atualizado.isoformat().startswith(man["bases/IW38.parquet"]["modificado"][:16])

        # cadastro feito no site vai para app/ no repositório
        bases.gravar_cadastro(bases.ARQ_CAD_EQUIP, "41001404", {"criticidade": "Alta"}, "ana")
        assert json.loads(gh.arquivos["app/cadastro_equipamentos.json"])["41001404"]["criticidade"] == "Alta"
        assert bases.ler_cadastro(bases.ARQ_CAD_EQUIP)["41001404"]["atualizado_por"] == "ana"

        # export novo no PC → nova rodada → site enxerga
        (ind / "IW38 hoje.xlsx").write_bytes(_xlsx_com_capa(iw38_cru()))  # 5 ordens, 1 da Fábrica Piloto
        assert sincronizar.rodada(cfg) == [IW38]
        bases.recarregar()
        assert len(bases.iw38().df) == 4
    finally:
        bases._fonte_cacheada.clear()
        bases.recarregar()


def test_envio_pela_tela_entra_no_manifesto(ambiente, monkeypatch):
    gh, *_ = ambiente
    for k, v in {"GH_REPO": "org/dados", "GH_TOKEN": "t"}.items():
        monkeypatch.setenv(f"CENTRAL_{k}", v)
    bases._fonte_cacheada.clear()
    bases.recarregar()
    try:
        buf = io.BytesIO()
        iw38_cru().to_excel(buf, index=False)
        nome = bases.enviar_arquivo(IW38, "export.xlsx", buf.getvalue())
        man = json.loads(gh.arquivos["bases/manifesto.json"])
        assert f"app/{nome}" in man
        assert bases.inventario().ativos[IW38].arquivo.id == f"app/{nome}"
    finally:
        bases._fonte_cacheada.clear()
        bases.recarregar()


def test_mudanca_de_datas_pedida_na_nuvem_roda_no_pc(ambiente, monkeypatch, tmp_path):
    from central import mudanca_datas as md

    gh_falso, cfg, _, _ = ambiente
    gh = fontes.GitHub(sincronizar._Cfg(cfg["repo"], cfg["token"], "main"))
    consultas = [{"dia": "2026-10-07", "campos": ["M1"], "de": "2026-10-01", "ate": "2026-10-31"}]
    lote = {"status": md.SOLICITADA, "simular": False, "criado_por": "ANA", "consultas": consultas, "itens": []}
    gh.gravar(md.ARQ_LOTES, json.dumps({"L1": lote, "L0": {**lote, "status": md.CONCLUIDA}}).encode())
    # sem o robô configurado neste PC, nada acontece
    monkeypatch.setattr(sincronizar, "ROBO_CONFIGURADO", tmp_path / "nao_existe.toml")
    assert sincronizar.executar_mudancas(gh) == []
    pedidos = []

    def robo_falso(pedido, progresso=None):
        pedidos.append(pedido)
        salvo = json.loads(gh_falso.arquivos["app/" + md.ARQ_LOTES])
        assert salvo["L1"]["status"] == md.EM_EXECUCAO          # o site vê que o robô pegou o pedido
        return {"lote": "L1", "consultas": [{"dia": "2026-10-07", "campos": ["M1"], "encontradas": 1, "erro": ""}],
                "itens": [{"ordem": "100", "dia": "2026-10-07", "campo": "M1", "ok": True, "mensagem": "gravada",
                           "inicio_sap": "2026-09-30"}]}

    assert sincronizar.executar_mudancas(gh, rodar=robo_falso) == ["L1"]
    assert pedidos == [{"lote": "L1", "simular": False, "consultas": consultas, "itens": []}]
    salvo = json.loads(gh_falso.arquivos["app/" + md.ARQ_LOTES])
    assert salvo["L1"]["status"] == md.CONCLUIDA and salvo["L1"]["itens"][0]["de_inicio"] == "2026-09-30"
    assert salvo["L0"]["status"] == md.CONCLUIDA                # os outros lotes ficam como estavam
    assert sincronizar.executar_mudancas(gh, rodar=robo_falso) == []   # nada pendente na rodada seguinte


def test_robo_nao_apaga_pedido_feito_no_site_enquanto_grava(ambiente, monkeypatch):
    from central import mudanca_datas as md

    gh_falso, cfg, _, _ = ambiente
    gh = fontes.GitHub(sincronizar._Cfg(cfg["repo"], cfg["token"], "main"))
    lote = {"status": md.SOLICITADA, "consultas": [], "itens": []}
    gh.gravar(md.ARQ_LOTES, json.dumps({"L1": lote}).encode())
    ler, vez = gh.ler_versionado, []

    def ler_e_o_site_grava_no_meio(nome):
        r = ler(nome)
        if nome == md.ARQ_LOTES and not vez:          # entre a leitura e a gravação do robô, alguém pede outro lote
            vez.append(1)
            atual = json.loads(gh_falso.arquivos["app/" + md.ARQ_LOTES])
            gh_falso.arquivos["app/" + md.ARQ_LOTES] = json.dumps({**atual, "L2": lote}).encode()
        return r

    monkeypatch.setattr(gh, "ler_versionado", ler_e_o_site_grava_no_meio)
    monkeypatch.setattr(sincronizar.time, "sleep", lambda s: None)
    sincronizar._gravar_lote(gh, "L1", {**lote, "status": md.EM_EXECUCAO})
    salvo = json.loads(gh_falso.arquivos["app/" + md.ARQ_LOTES])
    assert salvo["L1"]["status"] == md.EM_EXECUCAO and salvo["L2"]["status"] == md.SOLICITADA


def test_arquivo_ilegivel_nao_segura_as_outras_bases(ambiente, monkeypatch):
    gh, cfg, estoque, ind = ambiente
    (ind / "IW38.xlsx").write_bytes(_xlsx_com_capa(iw38_cru()))
    pd.DataFrame({"Material": [100200.0], "Texto breve material": ["ROLAMENTO"], "Utilização livre": [4.0]}).to_excel(
        estoque / "MB52.XLSX", index=False)
    ler = leitura.ler_arquivo

    def iw38_aberto_no_excel(nome, *a, **kw):
        if "IW38" in nome:
            raise PermissionError("arquivo aberto em outro programa")
        return ler(nome, *a, **kw)

    monkeypatch.setattr(sincronizar.leitura, "ler_arquivo", iw38_aberto_no_excel)
    monkeypatch.setattr(sincronizar, "_ULTIMO_SINAL", [None])
    assert sincronizar.rodada(cfg) == [MB52]
    monkeypatch.setattr(sincronizar.leitura, "ler_arquivo", ler)          # fechou o Excel: vai na rodada seguinte
    assert sincronizar.rodada(cfg) == [IW38]
