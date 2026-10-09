"""Pedido de acesso na tela de login → aprovação com função, perfil e abas escolhidas → a pessoa entra."""

import json
from pathlib import Path

import pytest

from central import auth, bases

RAIZ = Path(__file__).resolve().parent.parent


def test_abas_escolhidas_mandam_no_acesso():
    u = {"funcao": "manutentor", "perfil": "leitor", "abas": ["ordens", "paginas/planos.py"]}
    assert auth.pode_ver(u, "ordens") and auth.pode_ver(u, "planos") and auth.pode_ver(u, "estoque")
    assert not auth.pode_ver(u, "painel") and not auth.acesso_total(u)
    assert auth.descrever_acesso(u) == "3 aba(s) escolhidas"
    analista_restrito = {"funcao": "analista", "abas": []}                  # a lista vale mais que a função
    assert [p for p in auth.todas_as_abas() if auth.pode_ver(analista_restrito, p)] == ["equipamentos", "estoque"]
    assert [p for p in auth.todas_as_abas() if auth.ve_inteira(analista_restrito, p)] == ["estoque"]
    tudo = {"funcao": "manutentor", "abas": auth.todas_as_abas()}
    assert auth.acesso_total(tudo) and auth.descrever_acesso(tudo) == "todas"
    assert auth.descrever_acesso({"funcao": "lider"}) == "todas"
    assert auth.descrever_acesso({"funcao": "manutentor"}) == "Estoque e Gestão de ativos"


@pytest.fixture
def ambiente(tmp_path, monkeypatch):
    pasta_app = tmp_path / "app"
    pasta_app.mkdir()
    adm = {"nome": "Chefe", "perfil": "admin", "funcao": "analista", "ativo": True, **auth.gerar_hash("chefe1234")}
    (pasta_app / auth.ARQ_USUARIOS).write_text(json.dumps({"6000001": adm}), encoding="utf-8")
    vazia = tmp_path / "dados"
    vazia.mkdir()
    for k, v in {"PASTAS": str(vazia), "PASTA_APP": str(pasta_app), "EXIGIR_LOGIN": "sim", "FONTE": "pasta"}.items():
        monkeypatch.setenv(f"CENTRAL_{k}", v)
    monkeypatch.chdir(RAIZ)
    bases._fonte_cacheada.clear()
    bases.recarregar()
    yield pasta_app
    bases._fonte_cacheada.clear()
    bases.recarregar()


def _app():
    from streamlit.testing.v1 import AppTest

    return AppTest.from_file(str(RAIZ / "streamlit_app.py"), default_timeout=120)


def test_pedido_aprovacao_e_entrada(ambiente):
    at = _app()
    at.run()
    campos = {t.label: t for t in at.text_input}
    campos["Nome completo"].input("Maria Teste")
    campos["Número Pessoal (NP)"].input("7.001.234")      # com pontos: vira só os números
    campos["Senha"].input("segredo123")
    campos["Repita a senha"].input("segredo123")
    next(b for b in at.button if "Enviar pedido" in str(b.label)).click().run()
    assert not at.exception and not at.error, [e.value for e in at.error]
    ped = json.loads((ambiente / auth.ARQ_SOLICITACOES).read_text(encoding="utf-8"))["7001234"]
    assert ped["status"] == "pendente" and "segredo123" not in json.dumps(ped) and ped["senha_hash"]
    assert any("Pedido enviado" in s.value for s in at.success)

    # o mesmo login de novo: recusado (já há pedido pendente, e o navegador acabou de pedir)
    assert auth.solicitar("Maria", "7001234", "segredo123", "segredo123")

    # administrador aprova como manutentor, liberando Ordens e Planos além do Estoque
    bases.recarregar()
    assert auth.aprovar("7001234", "manutentor", "leitor", ["ordens", "planos"], "chefe") == ""
    u = auth.usuarios(fresco=True)["7001234"]
    assert u["abas"] == ["ordens", "planos"] and u["funcao"] == "manutentor" and not u["trocar_senha"]
    assert auth.confere(u, "segredo123")                                    # entra com a senha que escolheu
    final = json.loads((ambiente / auth.ARQ_SOLICITACOES).read_text(encoding="utf-8"))["7001234"]
    assert final["status"] == "aprovada" and "senha_hash" not in final      # a senha não fica no pedido
    assert auth.aprovar("7001234", "manutentor", "leitor", None, "chefe")  # já decidido

    # logada, ela vê só as abas liberadas
    at = _app()
    at.session_state["auth_login"] = "7001234"
    at.run()
    at.switch_page("paginas/ordens.py").run()
    assert at.title[0].value.startswith("Ordens")
    at.switch_page("paginas/painel.py").run()                # não liberado: cai na 1ª aba dela (Ordens)
    assert at.title[0].value.startswith("Ordens")
    at.switch_page("paginas/custos.py").run()
    assert not at.title[0].value.startswith("Custos")


def test_pedido_recusado_e_validacoes(ambiente):
    assert "senhas" in auth.solicitar("Ana Silva", "7005678", "segredo123", "outra1234")
    assert "já tem usuário" in auth.solicitar("Chefe", "6000001", "segredo123", "segredo123")
    assert "Número Pessoal" in auth.solicitar("Ana", "ana.silva", "segredo123", "segredo123")    # login fora do NP
    bases.gravar_cadastro_lote(auth.ARQ_SOLICITACOES, {"7005678": {"nome": "Ana", "status": "pendente",
                                                                     **auth.gerar_hash("segredo123")}})
    assert auth.recusar("7005678", "não é da manutenção", "chefe") == ""
    assert auth.pendentes(fresco=True) == {}
    assert "7005678" not in auth.usuarios(fresco=True)


def test_login_e_o_numero_pessoal():
    assert auth.validar_login("6178609") == "" and auth.validar_login("12345") == ""
    for ruim in ("jeferson.silva", "617", "61786091234", "6178609a", ""):
        assert auth.validar_login(ruim), ruim
    assert auth.normalizar_login(" 6.178-609 ") == "6178609"
    assert auth.normalizar_login("Jeferson.Silva") == "jeferson.silva"       # conta antiga continua entrando
