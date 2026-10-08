"""De onde vêm os arquivos:

- Pastas: pastas do computador (as do SharePoint sincronizadas pelo OneDrive,
  uma pasta de rede ou a pasta dados/);
- SharePoint: as mesmas pastas lidas direto pela API do Microsoft Graph;
- GitHub: um repositório privado de dados, alimentado pelo sincronizador que
  roda no PC (sincronizador/sincronizar.py) — o caminho para o site na nuvem
  sem depender da TI.

Todas têm a mesma interface, então o resto do app não sabe (nem precisa
saber) onde os arquivos estão.
"""

from __future__ import annotations

import base64
import json
import os
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

import requests

from .config import Config, eh_downloads

EXTENSOES_DADOS = (".xlsx", ".xlsm", ".xls", ".csv", ".txt", ".htm", ".html", ".parquet", ".json")


@dataclass(frozen=True)
class Arquivo:
    id: str            # caminho completo (pasta) ou caminho na biblioteca (SharePoint)
    nome: str          # caminho amigável para mostrar na tela
    modificado: datetime  # UTC
    tamanho: int
    versao: str = ""   # hash do conteúdo, quando a fonte informa (GitHub)

    @property
    def assinatura(self) -> str:
        """Muda sempre que o arquivo muda — usada como chave de cache."""
        return f"{self.id}|{self.versao or f'{self.modificado.timestamp():.0f}'}|{self.tamanho}"

    @property
    def arquivo(self) -> str:
        return self.nome.replace("\\", "/").rsplit("/", 1)[-1]


class FonteErro(RuntimeError):
    pass


class NaoEncontrado(FonteErro):
    """O arquivo não existe (diferente de uma falha de leitura, que nunca deve virar "arquivo vazio")."""


class Conflito(FonteErro):
    """Outra pessoa gravou o mesmo arquivo entre a leitura e a gravação."""


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
            # uma pasta dentro de outra é varrida pelas duas regras (ex.: Downloads só no 1º nível,
            # Downloads/0.1 - Indicadores com subpastas); listar() descarta o arquivo repetido
            if r.exists() and r not in vistas:
                vistas.add(r)
                yield p, r

    def listar(self) -> list[Arquivo]:
        itens, vistos = [], set()
        for original, raiz in self._raizes():
            # Downloads: só a própria pasta (as subpastas costumam ser ZIPs extraídos e outras coisas)
            limite = 1 if eh_downloads(raiz) else self.profundidade
            for dirpath, dirnames, filenames in os.walk(raiz):
                nivel = len(Path(dirpath).relative_to(raiz).parts)
                if nivel + 1 >= limite:
                    dirnames[:] = []
                dirnames[:] = [d for d in dirnames if not d.startswith((".", "~"))]
                for f in filenames:
                    if _ignorar(f):
                        continue
                    p = Path(dirpath) / f
                    if p in vistos:  # pasta configurada dentro de outra: não lista duas vezes
                        continue
                    vistos.add(p)
                    try:
                        st = p.stat()
                    except OSError:  # arquivo sumiu ou está bloqueado no meio da sincronização
                        continue
                    nome = str(Path(original.name) / p.relative_to(raiz))
                    # versão em nanossegundos: duas gravações no mesmo segundo (e mesmo tamanho) ainda mudam a chave
                    itens.append(Arquivo(str(p), nome, datetime.fromtimestamp(st.st_mtime, timezone.utc), st.st_size,
                                         str(st.st_mtime_ns)))
        return itens

    def ler(self, id: str) -> bytes:
        try:
            return Path(id).read_bytes()
        except FileNotFoundError as e:
            raise NaoEncontrado(str(e)) from e

    def gravar(self, nome: str, conteudo: bytes) -> str:
        destino = self.pasta_app / nome  # nome pode ter subpasta (ex.: fotos_materiais/123.jpg)
        destino.parent.mkdir(parents=True, exist_ok=True)
        # grava num temporário e renomeia: quem estiver lendo nunca vê arquivo pela metade
        fd, tmp = tempfile.mkstemp(dir=destino.parent, prefix=".", suffix=".tmp")
        with os.fdopen(fd, "wb") as f:
            f.write(conteudo)
        os.replace(tmp, destino)
        return str(destino)

    def id_de(self, nome: str) -> str:
        # o mesmo caminho canônico da listagem (atalho, "..", maiúsculas no Windows)
        return str((self.pasta_app / nome).resolve())

    @staticmethod
    def _versao_arquivo(p: Path) -> str | None:
        try:
            st = p.stat()
        except FileNotFoundError:
            return None
        return f"{st.st_mtime_ns}|{st.st_size}"

    def ler_versionado(self, nome: str) -> tuple[bytes | None, str | None]:
        """(conteúdo, versão) do arquivo do app; (None, None) se não existe."""
        p = self.pasta_app / nome
        versao = self._versao_arquivo(p)
        if versao is None:
            return None, None
        return p.read_bytes(), versao

    def gravar_condicional(self, nome: str, conteudo: bytes, versao: str | None) -> bool:
        """Grava só se o arquivo ainda está na versão lida (senão alguém gravou no meio: False)."""
        if self._versao_arquivo(self.pasta_app / nome) != versao:
            return False
        self.gravar(nome, conteudo)
        return True


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
        r = self._pedir("GET", f"{self._url_item(id)}/content")
        if r.status_code == 404:
            raise NaoEncontrado(f"{id} não existe no SharePoint")
        if r.status_code >= 400:
            raise FonteErro(f"Erro {r.status_code} no SharePoint: {r.text[:300]}")
        return r.content

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

    def gravar(self, nome: str, conteudo: bytes, se_versao: str | None = None) -> str:
        caminho = self.id_de(nome)
        url = f"{self._url_item(caminho)}/content"
        cab = {"Content-Type": "application/octet-stream"}
        if se_versao:
            cab["If-Match"] = se_versao
        r = self._pedir("PUT", url, headers=cab, data=conteudo, timeout=300)
        if r.status_code == 404 and "/" in caminho:
            self._criar_pastas(caminho.rsplit("/", 1)[0])
            r = self._pedir("PUT", url, headers=cab, data=conteudo, timeout=300)
        if r.status_code == 412:
            raise Conflito(f"{nome} foi alterado por outra pessoa no meio da gravação")
        if r.status_code >= 400:
            raise FonteErro(f"Erro {r.status_code} ao gravar no SharePoint: {r.text[:300]}")
        return caminho

    def ler_versionado(self, nome: str) -> tuple[bytes | None, str | None]:
        caminho = self.id_de(nome)
        r = self._pedir("GET", f"{self._url_item(caminho)}?$select=eTag")
        if r.status_code == 404:
            return None, None
        if r.status_code >= 400:
            raise FonteErro(f"Erro {r.status_code} no SharePoint: {r.text[:300]}")
        etag = (r.json() or {}).get("eTag")
        try:
            return self.ler(caminho), etag
        except NaoEncontrado:
            return None, None

    def gravar_condicional(self, nome: str, conteudo: bytes, versao: str | None) -> bool:
        try:
            self.gravar(nome, conteudo, se_versao=versao)
        except Conflito:
            return False
        return True


MANIFESTO = "bases/manifesto.json"
EPOCA = datetime(2000, 1, 1, tzinfo=timezone.utc)


class GitHub:
    """Repositório privado de dados no GitHub (API REST).

    O sincronizador do PC grava em `bases/` uma cópia compacta (.parquet) de cada
    base e o `bases/manifesto.json` com a data original de cada export. O app
    grava uploads e cadastros em `app/`. O Git não guarda data de modificação
    por arquivo, então a data vem do manifesto (que o app também atualiza
    quando grava um export enviado pela tela).
    """

    API = "https://api.github.com"

    def __init__(self, cfg: Config):
        if not cfg.gh_repo or not cfg.gh_token:
            raise FonteErro("Configuração do GitHub incompleta: informe gh_repo e gh_token")
        self.repo, self.ramo = cfg.gh_repo.strip("/"), cfg.gh_branch
        self.pasta_app = "app"
        self.profundidade = cfg.profundidade
        self.descricao = f"Repositório de dados {self.repo}"
        self._sessao = requests.Session()
        self._sessao.headers.update({"Authorization": f"Bearer {cfg.gh_token}",
                                     "Accept": "application/vnd.github+json",
                                     "X-GitHub-Api-Version": "2022-11-28"})

    def _pedir(self, metodo: str, caminho: str, **kw) -> requests.Response:
        for tentativa in range(3):
            r = self._sessao.request(metodo, f"{self.API}{caminho}", timeout=kw.pop("timeout", 120), **kw)
            if r.status_code not in (502, 503) or tentativa == 2:
                return r
            time.sleep(2 ** tentativa)
        return r

    def _url(self, id: str) -> str:
        return f"/repos/{self.repo}/contents/{quote(id)}"

    def _manifesto(self) -> tuple[dict, str | None]:
        r = self._pedir("GET", self._url(MANIFESTO), params={"ref": self.ramo})
        if r.status_code == 404:
            return {}, None
        if r.status_code >= 400:
            raise FonteErro(f"Erro {r.status_code} ao ler o manifesto no GitHub: {r.text[:300]}")
        j = r.json()
        return json.loads(base64.b64decode(j["content"]).decode("utf-8")), j["sha"]

    def listar(self) -> list[Arquivo]:
        r = self._pedir("GET", f"/repos/{self.repo}/git/trees/{quote(self.ramo)}", params={"recursive": "1"})
        if r.status_code in (404, 409):  # repositório vazio ou ramo ainda não criado
            return []
        if r.status_code >= 400:
            raise FonteErro(f"Erro {r.status_code} ao listar o repositório de dados {self.repo}: {r.text[:300]}")
        manifesto = {}
        itens = []
        arvore = r.json().get("tree", [])
        if any(it.get("path") == MANIFESTO for it in arvore):
            manifesto, _ = self._manifesto()
        for it in arvore:
            caminho = it.get("path", "")
            if it.get("type") != "blob" or _ignorar(caminho.rsplit("/", 1)[-1]):
                continue
            if caminho.count("/") >= self.profundidade:
                continue
            info = manifesto.get(caminho, {})
            try:
                mod = datetime.fromisoformat(info["modificado"])
            except (KeyError, ValueError, TypeError):
                mod = EPOCA
            itens.append(Arquivo(caminho, caminho, mod, int(it.get("size", 0)), it.get("sha", "")))
        return itens

    def ler(self, id: str) -> bytes:
        r = self._pedir("GET", self._url(id), params={"ref": self.ramo},
                        headers={"Accept": "application/vnd.github.raw"})
        if r.status_code == 404:
            raise NaoEncontrado(f"{id} não existe no repositório de dados")
        if r.status_code >= 400:
            raise FonteErro(f"Erro {r.status_code} ao ler {id} no GitHub: {r.text[:300]}")
        return r.content

    def id_de(self, nome: str) -> str:
        return f"{self.pasta_app}/{nome}"

    def _put(self, caminho: str, conteudo: bytes, mensagem: str, sha: str | None) -> requests.Response:
        corpo = {"message": mensagem, "content": base64.b64encode(conteudo).decode(), "branch": self.ramo}
        if sha:
            corpo["sha"] = sha
        return self._pedir("PUT", self._url(caminho), json=corpo, timeout=300)

    def gravar_caminho(self, caminho: str, conteudo: bytes, mensagem: str) -> None:
        """Cria ou substitui um arquivo inteiro (bases do sincronizador, fotos): a versão nova vale, qualquer
        que seja a que está lá. Para cadastros, use gravar_condicional (não perde a gravação do outro)."""
        for _ in range(3):
            r = self._pedir("GET", self._url(caminho), params={"ref": self.ramo})
            sha = r.json().get("sha") if r.status_code == 200 else None
            r = self._put(caminho, conteudo, mensagem, sha)
            if r.status_code in (200, 201):
                return
            if r.status_code not in (409, 422):
                break
        raise FonteErro(f"Erro {r.status_code} ao gravar {caminho} no GitHub: {r.text[:300]}")

    def ler_versionado(self, nome: str) -> tuple[bytes | None, str | None]:
        """(conteúdo, sha) do arquivo do app; (None, None) se não existe."""
        caminho = self.id_de(nome)
        r = self._pedir("GET", self._url(caminho), params={"ref": self.ramo})
        if r.status_code == 404:
            return None, None
        if r.status_code >= 400:
            raise FonteErro(f"Erro {r.status_code} ao ler {caminho} no GitHub: {r.text[:300]}")
        j = r.json()
        conteudo = base64.b64decode(j["content"]) if j.get("content") else self.ler(caminho)  # > 1 MB: sem content
        return conteudo, j.get("sha")

    def gravar_condicional(self, nome: str, conteudo: bytes, versao: str | None) -> bool:
        """Grava com o sha lido: se outro gravou no meio, o GitHub recusa (409/422) e devolve False."""
        r = self._put(self.id_de(nome), conteudo, f"Central de Manutenção: {nome}", versao)
        if r.status_code in (200, 201):
            return True
        if r.status_code in (409, 422):
            return False
        raise FonteErro(f"Erro {r.status_code} ao gravar {nome} no GitHub: {r.text[:300]}")

    def compactar_historico(self) -> bool:
        """Troca o histórico do ramo por um único commit com o conteúdo atual.

        Cada envio de base vira um commit com uma cópia nova (o IW38 tem ~2 MB);
        sem isto o repositório cresceria centenas de MB por ano. Os arquivos atuais
        não mudam — só as versões antigas deixam de existir."""
        r = self._pedir("GET", f"/repos/{self.repo}/git/ref/heads/{quote(self.ramo)}")
        if r.status_code != 200:
            return False
        topo = r.json()["object"]["sha"]
        arvore = self._pedir("GET", f"/repos/{self.repo}/git/commits/{topo}").json()["tree"]["sha"]
        r = self._pedir("POST", f"/repos/{self.repo}/git/commits",
                        json={"message": "Compacta histórico (mantém só a versão atual das bases)",
                              "tree": arvore, "parents": []})
        if r.status_code != 201:
            raise FonteErro(f"Erro {r.status_code} ao compactar o histórico: {r.text[:300]}")
        novo = r.json()["sha"]
        r = self._pedir("GET", f"/repos/{self.repo}/git/ref/heads/{quote(self.ramo)}")
        if r.status_code != 200 or r.json()["object"]["sha"] != topo:
            return False  # o app gravou algo enquanto isso: compactar agora apagaria essa gravação
        r = self._pedir("PATCH", f"/repos/{self.repo}/git/refs/heads/{quote(self.ramo)}",
                        json={"sha": novo, "force": True})
        if r.status_code != 200:
            raise FonteErro(f"Erro {r.status_code} ao compactar o histórico: {r.text[:300]}")
        return True

    def registrar_no_manifesto(self, entradas: dict[str, dict]) -> None:
        """Junta as entradas ao manifesto lido e grava com o sha dele: o envio do site e o do sincronizador ao
        mesmo tempo não apagam a data um do outro (no conflito, relê e junta de novo)."""
        for tentativa in range(5):
            manifesto, sha = self._manifesto()
            manifesto.update(entradas)
            r = self._put(MANIFESTO, json.dumps(manifesto, ensure_ascii=False, indent=1).encode("utf-8"),
                          "Atualiza manifesto das bases", sha)
            if r.status_code in (200, 201):
                return
            if r.status_code not in (409, 422):
                break
            time.sleep(0.5 * (tentativa + 1))
        raise FonteErro("Não foi possível atualizar o manifesto no GitHub")

    def gravar(self, nome: str, conteudo: bytes) -> str:
        caminho = self.id_de(nome)
        self.gravar_caminho(caminho, conteudo, f"Central de Manutenção: {nome}")
        if not _ignorar(nome.rsplit("/", 1)[-1]) and not nome.lower().endswith(".json"):
            # export enviado pela tela: precisa de data no manifesto (cadastros e fotos, não)
            agora = datetime.now(timezone.utc).isoformat(timespec="seconds")
            self.registrar_no_manifesto({caminho: {"modificado": agora, "enviado_em": agora, "origem": "envio pelo site"}})
        return caminho


def criar(cfg: Config):
    if cfg.fonte == "sharepoint":
        return SharePoint(cfg)
    if cfg.fonte == "github":
        return GitHub(cfg)
    return Pastas(cfg.pastas, cfg.pasta_app, cfg.profundidade)
