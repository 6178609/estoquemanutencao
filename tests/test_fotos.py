"""Fotos dos materiais: conversão, gravação na pasta do app e convivência com o mínimo."""

import io

import pytest
from PIL import Image

from central import bases, fotos


def _png(tamanho=(3000, 1500), modo="RGBA"):
    buf = io.BytesIO()
    Image.new(modo, tamanho, (200, 30, 30, 128) if modo == "RGBA" else (200, 30, 30)).save(buf, "PNG")
    return buf.getvalue()


def test_preparar_reduz_e_converte_para_jpeg():
    jpeg = fotos.preparar(_png())
    img = Image.open(io.BytesIO(jpeg))
    assert img.format == "JPEG" and max(img.size) == fotos.MAX_LADO and img.size == (1024, 512)
    assert fotos.miniatura(_png()).startswith("data:image/jpeg;base64,")


def test_arquivo_que_nao_e_imagem():
    with pytest.raises(fotos.FotoErro, match="não é uma imagem"):
        fotos.preparar(b"%PDF-1.4 nada de foto")


def test_caminho_seguro():
    assert fotos.caminho(" 48737 ") == "fotos_materiais/48737.jpg"
    assert fotos.caminho("../x/y") == "fotos_materiais/___x_y.jpg"


@pytest.fixture
def pasta(tmp_path, monkeypatch):
    monkeypatch.setenv("CENTRAL_PASTAS", str(tmp_path))
    monkeypatch.setenv("CENTRAL_PASTA_APP", str(tmp_path / "app"))
    monkeypatch.setenv("CENTRAL_EXIGIR_LOGIN", "nao")
    bases._fonte_cacheada.clear()
    bases.recarregar()
    yield tmp_path
    bases._fonte_cacheada.clear()
    bases.recarregar()


def test_foto_na_pasta_do_app_sem_apagar_o_minimo(pasta):
    bases.gravar_cadastro_lote(bases.ARQ_CAD_MAT, {"48737": {"minimo": 5.0}}, "ana", mesclar=True)
    bases.gravar_foto_material("48737", _png(), "joao")
    assert (pasta / "app" / "fotos_materiais" / "48737.jpg").exists()
    info = bases.ler_cadastro(bases.ARQ_CAD_MAT)["48737"]
    assert info["minimo"] == 5.0 and info["foto"] == "fotos_materiais/48737.jpg" and info["atualizado_por"] == "joao"
    assert Image.open(io.BytesIO(bases.foto_material(info))).format == "JPEG"
    assert bases.miniatura_material(info["foto"], info["foto_versao"]).startswith("data:image/jpeg")

    # apagar o mínimo (célula vazia na tabela) mantém a foto
    bases.gravar_cadastro_lote(bases.ARQ_CAD_MAT, {"48737": {"minimo": None}}, "ana", mesclar=True)
    info = bases.ler_cadastro(bases.ARQ_CAD_MAT)["48737"]
    assert "minimo" not in info and info["foto"]

    # foto nova troca a versão (o cache de imagem não mostra a antiga)
    versao = info["foto_versao"]
    bases.gravar_foto_material("48737", _png((800, 800), "RGB"), "joao")
    assert bases.ler_cadastro(bases.ARQ_CAD_MAT)["48737"]["foto_versao"] != versao

    # sem foto e sem mínimo o item sai do cadastro
    bases.remover_foto_material("48737", "ana")
    assert "48737" not in bases.ler_cadastro(bases.ARQ_CAD_MAT)
    assert bases.foto_material(None) is None
