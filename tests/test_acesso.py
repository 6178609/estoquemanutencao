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


def test_manutentor_administrador_ainda_gerencia_usuarios(app, monkeypatch):
    at = app("edu")
    assert _titulo(at).startswith("Estoque")
    assert _titulo(app("edu", "paginas/painel.py")).startswith("Estoque")
    monkeypatch.setenv("CENTRAL_EXIGIR_LOGIN", "sim")
    assert auth.paginas_conta(USUARIOS["edu"]) == ["conta", "usuarios", "sair"]      # o perfil admin manda aqui
    assert auth.paginas_conta(USUARIOS["joao"]) == ["conta", "sair"]


@pytest.mark.parametrize("login", ["ana", "leo", "chefe"])
def test_lider_analista_e_admin_antigo_veem_tudo(app, login):
    assert _titulo(app(login)).startswith("Painel")
    for pagina, titulo in (("paginas/custos.py", "Custos"), ("paginas/dados.py", "Fontes"),
                           ("paginas/estoque.py", "Estoque")):
        assert _titulo(app(login, pagina)).startswith(titulo), (login, pagina)


def test_conta_antiga_sem_funcao_fica_so_no_estoque(app):
    assert _titulo(app("velho")).startswith("Estoque")
    assert _titulo(app("velho", "paginas/ordens.py")).startswith("Estoque")


def _por_endereco(monkeypatch, login: str, endereco: str):
    """Abre o app como se a pessoa digitasse /<endereco>; devolve (app, apareceu "Page not found")."""
    from streamlit.commands import navigation as nav
    from streamlit.runtime.scriptrunner import RerunData
    from streamlit.testing.v1 import AppTest
    from streamlit.testing.v1 import local_script_runner as lsr

    nao_achou = []
    original = nav.send_page_not_found
    monkeypatch.setattr(nav, "send_page_not_found", lambda ctx: (nao_achou.append(1), original(ctx)))
    monkeypatch.setattr(lsr, "RerunData", lambda **kw: RerunData(page_name=endereco, **kw))
    at = AppTest.from_file(str(RAIZ / "streamlit_app.py"), default_timeout=120)
    at.session_state["auth_login"] = login
    at.run()
    assert not at.exception, [e.value for e in at.exception]
    return at, bool(nao_achou)


@pytest.mark.parametrize("login", ["joao", "ana"])
def test_endereco_do_estoque_vale_para_todas_as_funcoes(app, monkeypatch, login):
    at, nao_achou = _por_endereco(monkeypatch, login, "estoque")
    assert _titulo(at).startswith("Estoque") and not nao_achou          # sem o aviso "Page not found"


def test_manutentor_pelo_endereco_de_aba_proibida(app, monkeypatch):
    at, nao_achou = _por_endereco(monkeypatch, "joao", "custos")
    assert _titulo(at).startswith("Estoque") and nao_achou
    at, nao_achou = _por_endereco(monkeypatch, "joao", "")                 # raiz do site: entra no Estoque
    assert _titulo(at).startswith("Estoque") and not nao_achou


def test_quem_perde_a_funcao_com_a_tela_aberta_nao_grava(app, tmp_path):
    at = app("leo", "paginas/programacao.py")
    assert _titulo(at).startswith("Programação")
    caixa = next(t for t in at.text_input if t.key and t.key.startswith("pm_2"))
    us = {**USUARIOS, "leo": {**USUARIOS["leo"], "funcao": "manutentor"}}  # o administrador rebaixa o Leo agora
    (tmp_path / "app" / auth.ARQ_USUARIOS).write_text(json.dumps(us), encoding="utf-8")
    bases.recarregar()
    caixa.input("MAQ-123").run()
    assert _titulo(at).startswith("Estoque")
    assert not list((tmp_path / "app").glob("programacao*"))                # nada foi gravado na aba proibida


def test_regras_de_edicao_da_propria_funcao():
    # rebaixar a si mesmo é barrado só quando de fato tira o acesso
    assert auth.acesso_total({"funcao": "analista"}) and not auth.acesso_total({"funcao": "manutentor"})
    assert not auth.acesso_total({**USUARIOS["edu"]})                      # já era manutentor: nada a tirar
