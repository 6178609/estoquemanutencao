"""Bloqueio de abas pela função: Líder de manutenção e Analista veem tudo; Manutentor só o Estoque."""

import json
from pathlib import Path

import pytest

from central import auth, bases, navegacao

RAIZ = Path(__file__).resolve().parent.parent
TODAS = [pid for _, pid, _ in navegacao.abas()]


def test_regras_por_funcao():
    for funcao in ("lider", "analista"):
        u = {"funcao": funcao, "perfil": "leitor"}
        assert auth.acesso_total(u) and all(auth.pode_ver(u, p) for p in TODAS)
    manutentor = {"funcao": "manutentor", "perfil": "admin"}          # a função manda nas abas, não o perfil
    assert [p for p in TODAS if auth.pode_ver(manutentor, p)] == ["estoque"]
    assert auth.pode_ver(manutentor, "paginas/estoque.py") and not auth.pode_ver(manutentor, "paginas/painel.py")
    assert auth.pode_ver(manutentor, "paginas\\estoque.py")
    # conta antiga sem função: administrador continua vendo tudo; os demais, só as abas livres
    assert auth.acesso_total({"perfil": "admin"})
    assert [p for p in TODAS if auth.pode_ver({"perfil": "editor"}, p)] == ["estoque"]
    assert [p for p in TODAS if auth.pode_ver({"funcao": "chefe", "perfil": "leitor"}, p)] == ["estoque"]
    assert not auth.pode_ver(None, "estoque") and not auth.pode_ver({}, "estoque")


def test_toda_pagina_esta_na_lista_de_abas():
    """Uma tela nova fora de navegacao.GRUPOS escaparia do controle de acesso."""
    arquivos = sorted(p.stem for p in (RAIZ / "paginas").glob("*.py"))
    assert sorted(TODAS) == arquivos
    assert len(set(TODAS)) == len(TODAS)


def test_navegacao_por_funcao():
    so_estoque = navegacao.visiveis(lambda pid: auth.pode_ver({"funcao": "manutentor"}, pid))
    assert so_estoque == {"Custos e suprimentos": [("estoque", "Estoque", ":material/inventory_2:")]}
    assert navegacao.inicial(so_estoque) == "estoque"
    tudo = navegacao.visiveis(lambda pid: auth.pode_ver({"funcao": "analista"}, pid))
    assert list(tudo) == list(navegacao.GRUPOS) and navegacao.inicial(tudo) == "painel"
    assert navegacao.inicial({}) is None


# ----------------------------------------------------------------------------
# O app inteiro rodando com cada função (sem dados: as telas mostram o aviso de base faltando)
# ----------------------------------------------------------------------------
USUARIOS = {
    "ana": {"nome": "Ana", "funcao": "analista", "perfil": "leitor", "ativo": True},
    "leo": {"nome": "Leo", "funcao": "lider", "perfil": "editor", "ativo": True},
    "joao": {"nome": "João", "funcao": "manutentor", "perfil": "leitor", "ativo": True},
    "edu": {"nome": "Edu", "funcao": "manutentor", "perfil": "admin", "ativo": True},
    "velho": {"nome": "Velho", "perfil": "editor", "ativo": True},
    "chefe": {"nome": "Chefe", "perfil": "admin", "ativo": True},
}


@pytest.fixture
def app(tmp_path, monkeypatch):
    from streamlit.testing.v1 import AppTest

    pasta_app = tmp_path / "app"
    pasta_app.mkdir()
    (pasta_app / auth.ARQ_USUARIOS).write_text(json.dumps(USUARIOS), encoding="utf-8")
    vazia = tmp_path / "dados"
    vazia.mkdir()
    for k, v in {"PASTAS": str(vazia), "PASTA_APP": str(pasta_app), "EXIGIR_LOGIN": "sim", "FONTE": "pasta"}.items():
        monkeypatch.setenv(f"CENTRAL_{k}", v)
    monkeypatch.chdir(RAIZ)
    bases._fonte_cacheada.clear()
    bases.recarregar()

    def abrir(login: str, pagina: str | None = None):
        at = AppTest.from_file(str(RAIZ / "streamlit_app.py"), default_timeout=120)
        at.session_state["auth_login"] = login
        at.run()
        if pagina:
            at.switch_page(pagina).run()
        assert not at.exception, [e.value for e in at.exception]
        return at

    yield abrir
    bases._fonte_cacheada.clear()
    bases.recarregar()


def _titulo(at) -> str:
    return at.title[0].value if len(at.title) else ""


def test_manutentor_so_ve_o_estoque(app):
    at = app("joao")
    assert _titulo(at).startswith("Estoque")                          # entra direto no Estoque
    assert not [t for t in at.sidebar.text_input if t.placeholder.startswith("ordem")]   # sem a busca geral
    for pagina in ("paginas/painel.py", "paginas/custos.py", "paginas/dados.py", "paginas/busca.py"):
        at = app("joao", pagina)                                       # endereço digitado: cai no Estoque
        assert _titulo(at).startswith("Estoque"), pagina


def test_manutentor_administrador_ainda_gerencia_usuarios(app):
    at = app("edu")
    assert _titulo(at).startswith("Estoque")
    assert _titulo(app("edu", "paginas/painel.py")).startswith("Estoque")


@pytest.mark.parametrize("login", ["ana", "leo", "chefe"])
def test_lider_analista_e_admin_antigo_veem_tudo(app, login):
    assert _titulo(app(login)).startswith("Painel")
    for pagina, titulo in (("paginas/custos.py", "Custos"), ("paginas/dados.py", "Fontes"),
                           ("paginas/estoque.py", "Estoque")):
        assert _titulo(app(login, pagina)).startswith(titulo), (login, pagina)


def test_conta_antiga_sem_funcao_fica_so_no_estoque(app):
    assert _titulo(app("velho")).startswith("Estoque")
    assert _titulo(app("velho", "paginas/ordens.py")).startswith("Estoque")
