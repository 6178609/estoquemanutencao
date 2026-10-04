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
    """Pastas de uma biblioteca do SharePoint via Microsoft Graph (credencial de aplicativo).

    Usado quando o app roda na nuvem e não enxerga o OneDrive de ninguém. Lê as
    mesmas pastas e grava cadastros/usuários na mesma subpasta do app que o modo
    local usa — então os dois modos compartilham usuários e cadastros.
    """

    GRAPH = "https://graph.microsoft.com/v1.0"

    def __init__(self, cfg: Config):
        faltando = [n for n in ("sp_tenant_id", "sp_client_id", "sp_client_secret", "sp_site") if not getattr(cfg, n)]
        if faltando:
            raise FonteErro("Configuração do SharePoint incompleta: " + ", ".join(faltando))
        self.cfg = cfg
        self.profundidade = cfg.profundidade
        self.pastas = list(cfg.sp_pastas)
        self.pasta_app = cfg.sp_pasta_app
        self.descricao = f"SharePoint {cfg.sp_site} › " + " · ".join(self.pastas)
        self._token = ("", 0.0)
        self._site_id = ""
        self._sessao = requests.Session()

    def _cabecalhos(self) -> dict:
        token, expira = self._token
        if time.time() > expira - 120:
            r = self._sessao.post(
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

    def _pedir(self, metodo: str, url: str, **kw) -> requests.Response:
        """Requisição com nova tentativa quando o SharePoint pede para esperar (429/503)."""
        extras, prazo = kw.pop("headers", {}), kw.pop("timeout", 120)
        for tentativa in range(4):
            r = self._sessao.request(metodo, url, headers={**self._cabecalhos(), **extras}, timeout=prazo, **kw)
            if r.status_code not in (429, 503) or tentativa == 3:
                return r
            time.sleep(min(30, int(r.headers.get("Retry-After", 2 ** tentativa))))
        return r

    def _get(self, url: str) -> requests.Response:
        r = self._pedir("GET", url)
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
        itens, vistos = [], set()
        raizes = list(dict.fromkeys([*self.pastas, self.pasta_app]))
        # a pasta do app normalmente fica dentro da primeira pasta: não lista duas vezes
        raizes = [r for r in raizes if not any(r != o and r.startswith(o + "/") for o in raizes)]
        for raiz in raizes:
            fila = [(raiz, 0)]
            while fila:
                pasta, nivel = fila.pop()
                url = f"{self._url_item(pasta)}/children?$select=name,lastModifiedDateTime,size,file,folder&$top=999"
                while url:
                    r = self._pedir("GET", url)
                    if r.status_code == 404:  # pasta ainda não existe (ex.: pasta do app antes do 1º cadastro)
                        break
                    if r.status_code >= 400:
                        raise FonteErro(f"Erro {r.status_code} ao listar '{pasta}' no SharePoint: {r.text[:300]}")
                    j = r.json()
                    for it in j.get("value", []):
                        caminho = f"{pasta}/{it['name']}" if pasta else it["name"]
                        if "folder" in it:
                            if nivel + 1 < self.profundidade and not it["name"].startswith((".", "~")):
                                fila.append((caminho, nivel + 1))
                        elif "file" in it and not _ignorar(it["name"]) and caminho not in vistos:
                            vistos.add(caminho)
                            mod = datetime.fromisoformat(it["lastModifiedDateTime"].replace("Z", "+00:00"))
                            itens.append(Arquivo(caminho, caminho, mod, int(it.get("size", 0))))
                    url = j.get("@odata.nextLink")
        return itens

    def ler(self, id: str) -> bytes:
        return self._get(f"{self._url_item(id)}/content").content

    def id_de(self, nome: str) -> str:
        return f"{self.pasta_app}/{nome}" if self.pasta_app else nome

    def _criar_pastas(self, caminho: str) -> None:
        atual = ""
        for parte in [p for p in caminho.split("/") if p]:
            pai = atual
            atual = f"{atual}/{parte}" if atual else parte
            if self._pedir("GET", self._url_item(atual)).status_code == 404:
                r = self._pedir("POST", f"{self._url_item(pai)}/children",
                                json={"name": parte, "folder": {}, "@microsoft.graph.conflictBehavior": "fail"})
                if r.status_code >= 400 and r.status_code != 409:
                    raise FonteErro(f"Erro {r.status_code} ao criar a pasta '{atual}' no SharePoint: {r.text[:300]}")

    def gravar(self, nome: str, conteudo: bytes) -> str:
        caminho = self.id_de(nome)
        url = f"{self._url_item(caminho)}/content"
        cab = {"Content-Type": "application/octet-stream"}
        r = self._pedir("PUT", url, headers=cab, data=conteudo, timeout=300)
        if r.status_code == 404 and self.pasta_app:
            self._criar_pastas(self.pasta_app)
            r = self._pedir("PUT", url, headers=cab, data=conteudo, timeout=300)
        if r.status_code >= 400:
            raise FonteErro(f"Erro {r.status_code} ao gravar no SharePoint: {r.text[:300]}")
        return caminho


def criar(cfg: Config):
    if cfg.fonte == "sharepoint":
        return SharePoint(cfg)
    return Pastas(cfg.pastas, cfg.pasta_app, cfg.profundidade)
