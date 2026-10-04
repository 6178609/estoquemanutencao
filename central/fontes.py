"""De onde vêm os arquivos: pastas do computador (as pastas do SharePoint
sincronizadas pelo OneDrive, uma pasta de rede ou a pasta dados/) ou uma pasta
do SharePoint lida direto pela API do Microsoft Graph.

As duas fontes têm a mesma interface, então o resto do app não sabe (nem
precisa saber) onde os arquivos estão.
"""

from __future__ import annotations

import os
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

import requests

from .config import Config

EXTENSOES_DADOS = (".xlsx", ".xlsm", ".xls", ".csv", ".txt", ".htm", ".html", ".parquet", ".json")


@dataclass(frozen=True)
class Arquivo:
    id: str            # caminho completo (pasta) ou caminho na biblioteca (SharePoint)
    nome: str          # caminho amigável para mostrar na tela
    modificado: datetime  # UTC
    tamanho: int

    @property
    def assinatura(self) -> str:
        """Muda sempre que o arquivo muda — usada como chave de cache."""
        return f"{self.id}|{self.modificado.timestamp():.0f}|{self.tamanho}"

    @property
    def arquivo(self) -> str:
        return self.nome.replace("\\", "/").rsplit("/", 1)[-1]


class FonteErro(RuntimeError):
    pass


def _ignorar(nome: str) -> bool:
    return nome.startswith((".", "~$")) or not nome.lower().endswith(EXTENSOES_DADOS)


class Pastas:
    """Uma ou mais pastas locais, varridas com subpastas."""

    def __init__(self, pastas, pasta_app: Path, profundidade: int = 4):
        self.pastas = [Path(p) for p in pastas]
        self.pasta_app = Path(pasta_app)
        self.profundidade = profundidade
        self.descricao = " · ".join(str(p) for p in self.pastas)

    def _raizes(self):
        vistas = set()
        for p in [*self.pastas, self.pasta_app]:
            try:
                r = p.resolve()
            except OSError:
                continue
            if r.exists() and r not in vistas and not any(v in r.parents for v in vistas):
                vistas.add(r)
                yield p, r

    def listar(self) -> list[Arquivo]:
        itens = []
        for original, raiz in self._raizes():
            for dirpath, dirnames, filenames in os.walk(raiz):
                nivel = len(Path(dirpath).relative_to(raiz).parts)
                if nivel >= self.profundidade:
                    dirnames[:] = []
                dirnames[:] = [d for d in dirnames if not d.startswith((".", "~"))]
                for f in filenames:
                    if _ignorar(f):
                        continue
                    p = Path(dirpath) / f
                    try:
                        st = p.stat()
                    except OSError:  # arquivo sumiu ou está bloqueado no meio da sincronização
                        continue
                    nome = str(Path(original.name) / p.relative_to(raiz))
                    itens.append(Arquivo(str(p), nome, datetime.fromtimestamp(st.st_mtime, timezone.utc), st.st_size))
        return itens

    def ler(self, id: str) -> bytes:
        return Path(id).read_bytes()

    def gravar(self, nome: str, conteudo: bytes) -> str:
        self.pasta_app.mkdir(parents=True, exist_ok=True)
        # grava num temporário e renomeia: quem estiver lendo nunca vê arquivo pela metade
        fd, tmp = tempfile.mkstemp(dir=self.pasta_app, prefix=".", suffix=".tmp")
        with os.fdopen(fd, "wb") as f:
            f.write(conteudo)
        destino = self.pasta_app / nome
        os.replace(tmp, destino)
        return str(destino)

    def id_de(self, nome: str) -> str:
        return str(self.pasta_app / nome)


class SharePoint:
    """Pasta de uma biblioteca do SharePoint via Microsoft Graph (credencial de aplicativo)."""

    GRAPH = "https://graph.microsoft.com/v1.0"

    def __init__(self, cfg: Config):
        faltando = [n for n in ("sp_tenant_id", "sp_client_id", "sp_client_secret", "sp_site") if not getattr(cfg, n)]
        if faltando:
            raise FonteErro("Configuração do SharePoint incompleta: " + ", ".join(faltando))
        self.cfg = cfg
        self.profundidade = cfg.profundidade
        self.descricao = f"SharePoint {cfg.sp_site}/{cfg.sp_pasta}"
        self._token = ("", 0.0)
        self._site_id = ""

    def _cabecalhos(self) -> dict:
        token, expira = self._token
        if time.time() > expira - 120:
            r = requests.post(
                f"https://login.microsoftonline.com/{self.cfg.sp_tenant_id}/oauth2/v2.0/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": self.cfg.sp_client_id,
                    "client_secret": self.cfg.sp_client_secret,
                    "scope": "https://graph.microsoft.com/.default",
                },
                timeout=30,
            )
            if r.status_code != 200:
                raise FonteErro(f"Falha ao autenticar no Microsoft Graph ({r.status_code}): {r.text[:300]}")
            j = r.json()
            token, expira = j["access_token"], time.time() + int(j.get("expires_in", 3600))
            self._token = (token, expira)
        return {"Authorization": f"Bearer {token}"}

    def _get(self, url: str) -> requests.Response:
        r = requests.get(url, headers=self._cabecalhos(), timeout=120)
        if r.status_code >= 400:
            raise FonteErro(f"Erro {r.status_code} no SharePoint: {r.text[:300]}")
        return r

    def _site(self) -> str:
        if not self._site_id:
            self._site_id = self._get(f"{self.GRAPH}/sites/{self.cfg.sp_site}").json()["id"]
        return self._site_id

    def _url_item(self, caminho: str) -> str:
        base = f"{self.GRAPH}/sites/{self._site()}/drive/root"
        return f"{base}:/{quote(caminho)}:" if caminho else base

    def listar(self) -> list[Arquivo]:
        itens = []
        fila = [(self.cfg.sp_pasta, 0)]
        while fila:
            pasta, nivel = fila.pop()
            url = f"{self._url_item(pasta)}/children?$select=name,lastModifiedDateTime,size,file,folder&$top=500"
            while url:
                j = self._get(url).json()
                for it in j.get("value", []):
                    caminho = f"{pasta}/{it['name']}" if pasta else it["name"]
                    if "folder" in it and nivel + 1 < self.profundidade and not it["name"].startswith((".", "~")):
                        fila.append((caminho, nivel + 1))
                    elif "file" in it and not _ignorar(it["name"]):
                        mod = datetime.fromisoformat(it["lastModifiedDateTime"].replace("Z", "+00:00"))
                        itens.append(Arquivo(caminho, caminho, mod, int(it.get("size", 0))))
                url = j.get("@odata.nextLink")
        return itens

    def ler(self, id: str) -> bytes:
        return self._get(f"{self._url_item(id)}/content").content

    def id_de(self, nome: str) -> str:
        return f"{self.cfg.sp_pasta}/{nome}" if self.cfg.sp_pasta else nome

    def gravar(self, nome: str, conteudo: bytes) -> str:
        caminho = self.id_de(nome)
        r = requests.put(
            f"{self._url_item(caminho)}/content",
            headers={**self._cabecalhos(), "Content-Type": "application/octet-stream"},
            data=conteudo,
            timeout=300,
        )
        if r.status_code >= 400:
            raise FonteErro(f"Erro {r.status_code} ao enviar para o SharePoint: {r.text[:300]}")
        return caminho


def criar(cfg: Config):
    if cfg.fonte == "sharepoint":
        return SharePoint(cfg)
    return Pastas(cfg.pastas, cfg.pasta_app, cfg.profundidade)
