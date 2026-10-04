"""Fotos dos materiais do estoque.

Cada foto vira um JPEG de no máximo 1024 px na subpasta `fotos_materiais` da pasta
do app (compartilhada como os cadastros); o cadastro de materiais guarda qual
arquivo é de cada material. Nada disso vai para o repositório do código.
"""

from __future__ import annotations

import base64
import hashlib
import io
import re

from PIL import Image, ImageOps, UnidentifiedImageError

PASTA = "fotos_materiais"
TIPOS = ["jpg", "jpeg", "png", "webp", "bmp"]
MAX_LADO = 1024
# GIF transparente de 1 px: célula "sem foto" na coluna de imagem da tabela
VAZIA = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"


class FotoErro(ValueError):
    pass


def caminho(codigo: str) -> str:
    return f"{PASTA}/{re.sub(r'[^0-9A-Za-z_-]', '_', codigo.strip())}.jpg"


def preparar(conteudo: bytes, max_lado: int = MAX_LADO) -> bytes:
    """Foto do celular/PC → JPEG leve, na orientação certa (EXIF) e sem metadados."""
    try:
        img = Image.open(io.BytesIO(conteudo))
        img = ImageOps.exif_transpose(img)
    except (UnidentifiedImageError, OSError) as e:
        raise FotoErro("o arquivo não é uma imagem válida (use JPG, PNG ou WEBP)") from e
    if img.mode not in ("RGB", "L"):
        fundo = Image.new("RGB", img.size, "white")
        img = img.convert("RGBA")
        fundo.paste(img, mask=img.getchannel("A"))
        img = fundo
    img.thumbnail((max_lado, max_lado))
    saida = io.BytesIO()
    img.convert("RGB").save(saida, "JPEG", quality=85, optimize=True)
    return saida.getvalue()


def versao(conteudo: bytes) -> str:
    return hashlib.sha1(conteudo).hexdigest()[:12]


def miniatura(conteudo: bytes, lado: int = 96) -> str:
    """Miniatura em data URI, para a coluna de foto da tabela."""
    return "data:image/jpeg;base64," + base64.b64encode(preparar(conteudo, lado)).decode()
