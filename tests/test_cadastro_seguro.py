"""Uma falha de leitura nunca pode virar "cadastro vazio" e apagar os usuários na gravação seguinte."""

import json

import pytest

from central import bases, fontes


class FonteFalsa:
    def __init__(self, conteudo: dict | None, falhar: bool = False):
        self.arquivos = {} if conteudo is None else {"app/usuarios.json": json.dumps(conteudo).encode()}
        self.falhar = falhar

    def id_de(self, nome):
        return f"app/{nome}"

    def ler(self, id):
        if self.falhar:
            raise fontes.FonteErro("Erro 503 no GitHub")
        if id not in self.arquivos:
            raise fontes.NaoEncontrado(id)
        return self.arquivos[id]

    def gravar(self, nome, conteudo):
        self.arquivos[self.id_de(nome)] = conteudo
        return self.id_de(nome)


@pytest.fixture
def fonte_falsa(monkeypatch):
    def usar(conteudo, falhar=False):
        f = FonteFalsa(conteudo, falhar)
        monkeypatch.setattr(bases, "fonte", lambda: f)
        monkeypatch.setattr(bases, "recarregar", lambda: None)
        return f
    return usar


def test_falha_de_leitura_nao_apaga_os_usuarios(fonte_falsa):
    f = fonte_falsa({"ana": {"perfil": "admin"}, "bruno": {"perfil": "leitor"}}, falhar=True)
    with pytest.raises(fontes.FonteErro):
        bases.gravar_cadastro_lote("usuarios.json", {"carlos": {"perfil": "admin"}})
    f.falhar = False
    assert set(json.loads(f.arquivos["app/usuarios.json"])) == {"ana", "bruno"}   # nada foi sobrescrito


def test_grava_mesclando_e_faz_copia_do_dia(fonte_falsa):
    f = fonte_falsa({"ana": {"perfil": "admin"}})
    bases._backups_feitos().clear()
    bases.gravar_cadastro_lote("usuarios.json", {"bruno": {"perfil": "leitor"}})
    assert set(json.loads(f.arquivos["app/usuarios.json"])) == {"ana", "bruno"}
    copia = [k for k in f.arquivos if k.startswith("app/backup/usuarios-")]
    assert len(copia) == 1 and set(json.loads(f.arquivos[copia[0]])) == {"ana"}  # estado antes da gravação


def test_arquivo_inexistente_e_vazio(fonte_falsa):
    f = fonte_falsa(None)
    assert bases._ler_json_agora("usuarios.json") == {}
    bases.gravar_cadastro_lote("usuarios.json", {"ana": {"perfil": "admin"}})
    assert set(json.loads(f.arquivos["app/usuarios.json"])) == {"ana"}
