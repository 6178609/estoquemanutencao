# Pedido à TI — acesso do app "Central de Manutenção" ao SharePoint PCMF26

**Solicitante:** PCM F26 (Manutenção) · **Site:** https://alpargatascombr.sharepoint.com/sites/PCMF26

## O que é

A Central de Manutenção é um painel web do PCM F26 (ordens IW38, estoque MB52, equipamentos e
requisições). Ele vai ficar hospedado na nuvem (Streamlit Community Cloud) e precisa **ler e gravar
arquivos em duas pastas** da biblioteca *Documentos* do site PCMF26:

| Pasta | Uso |
|---|---|
| `1.3 - Controle de Estoque` | leitura dos exports do SAP (MB52) e, na subpasta `Central de Manutenção (app)`, gravação dos cadastros do app (JSON) |
| `0.1 - Indicadores` | leitura dos exports do SAP (IW38) |

Nenhum outro site, caixa de e-mail ou dado do tenant é acessado.

## O que precisamos

Um **registro de aplicativo no Microsoft Entra ID (Azure AD)** com acesso de aplicativo
(*client credentials*) restrito ao site PCMF26:

1. **Entra ID › Registros de aplicativo › Novo registro**
   - Nome: `Central de Manutencao PCM F26`
   - Tipo de conta: somente este diretório. Sem URI de redirecionamento.
2. **Permissões de API › Adicionar › Microsoft Graph › Permissões de aplicativo › `Sites.Selected`**
   e **Conceder consentimento do administrador**.
3. **Dar ao aplicativo permissão de escrita só no site PCMF26** (o `Sites.Selected` sozinho não
   libera nenhum site). Com PnP PowerShell, por um administrador do SharePoint:

   ```powershell
   Connect-PnPOnline -Url https://alpargatascombr.sharepoint.com/sites/PCMF26 -Interactive -ClientId <app-de-admin-PnP>
   Grant-PnPEntraIDAppSitePermission -AppId <ID do aplicativo criado no passo 1> `
       -DisplayName "Central de Manutencao PCM F26" `
       -Site https://alpargatascombr.sharepoint.com/sites/PCMF26 -Permissions Write
   ```

   (Em versões antigas do PnP o comando se chama `Grant-PnPAzureADAppSitePermission`.)
   Alternativa via Graph: `POST https://graph.microsoft.com/v1.0/sites/{site-id}/permissions`
   com `{"roles": ["write"], "grantedToIdentities": [{"application": {"id": "<app-id>", "displayName": "Central de Manutencao PCM F26"}}]}`.
4. **Certificados e segredos › Novo segredo do cliente** (validade sugerida: 12 ou 24 meses).

## O que devolver para o PCM

- ID do diretório (**tenant id**)
- ID do aplicativo (**client id**)
- **Valor** do segredo do cliente e a data de expiração

O segredo é colado só nas configurações privadas do app no Streamlit Cloud (campo *Secrets*). Ele não
fica no código nem no repositório.

## Segurança

- Acesso limitado ao site PCMF26 (`Sites.Selected`), sem acesso ao restante do SharePoint/OneDrive.
- O app tem login próprio (perfis administrador/editor/leitor, senhas com hash PBKDF2, bloqueio após
  tentativas erradas).
- O código é aberto e não contém dados da empresa. Os dados ficam só no SharePoint.
- Para revogar, basta excluir o segredo ou o registro do aplicativo.
