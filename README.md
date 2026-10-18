# Central de Manutenção · PCM F26

Site de gestão da manutenção de nível WCM (pilar **Manutenção Profissional**) da SIM Manutenção Profissional ·
Alpargatas F26: ordens (IW38/IW38OP), apontamentos (IW47), notas (IW28), planos (IP19), equipamentos (IH08),
estoque (MB52), catálogo do Sysmat, requisições, Gerenciador de AF, equipe e disponibilidade (Gestão de HH),
treinamentos e férias — com indicadores, metas, farol e tendência, login e acesso por função.

## O site: [`web/`](web/README.md)

Next.js publicado na **Vercel** (cada push no `main` vai para produção). Lê e grava os dados num repositório
**privado** no GitHub. Os exports do SAP entram pela aba **Fontes de dados** do site (anexar os arquivos). Tudo sobre
telas, dados, login e desenvolvimento está no [`web/README.md`](web/README.md).

## Dados da empresa e este repositório

O repositório é **público**: nenhuma planilha, base ou cadastro vai para o Git (`.gitignore` bloqueia `.xlsx`,
`.xls`, `.csv`, `.parquet` e a pasta `dados/`). Os dados ficam só no repositório privado de dados.

## Desenvolvimento

```bash
cd web && npm ci && npx tsc --noEmit && npx vitest run
```
