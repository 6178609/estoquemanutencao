import pandas as pd
import streamlit as st

from central import auth, bases, config, leitura, ui
from central.leitura import IW38, MB52, NOMES_BASE, REQ
from central.util import inteiro

ui.cabecalho("Fontes de dados", "De onde o app lê cada base e como mantê-las sempre atualizadas")

cfg = config.carregar()
eu = auth.usuario_atual()
edita = auth.pode_editar(eu)
inv = bases.inventario()

with st.container(border=True):
    st.markdown("**Pastas monitoradas** (com subpastas)")
    if cfg.fonte == "github":
        st.markdown(f"Site na nuvem lendo o repositório privado de dados `{cfg.gh_repo}`, alimentado pelo "
                    "**sincronizador** que roda no PC com as pastas do OneDrive "
                    "(`1.3 - Controle de Estoque` e `0.1 - Indicadores`).")
        man = bases.manifesto()
        if man:
            linhas = [{"Base": k.rsplit("/", 1)[-1], "Arquivo de origem": v.get("origem", ""),
                       "Export de": pd.to_datetime(v.get("modificado"), utc=True).tz_convert(ui.FUSO).tz_localize(None)
                       if v.get("modificado") else None,
                       "Enviado em": pd.to_datetime(v.get("enviado_em"), utc=True).tz_convert(ui.FUSO).tz_localize(None)
                       if v.get("enviado_em") else None,
                       "Por": v.get("pc", "")} for k, v in man.items()]
            st.dataframe(pd.DataFrame(linhas), hide_index=True, width="stretch",
                         column_config={c: st.column_config.DatetimeColumn(format="DD/MM/YYYY HH:mm")
                                        for c in ("Export de", "Enviado em")})
        else:
            st.warning("O sincronizador ainda não enviou nenhuma base. Rode `sincronizador\\configurar.bat` no PC.")
    elif cfg.fonte == "sharepoint":
        st.markdown(f"Lendo direto do SharePoint `{cfg.sp_site}`:")
        for p in cfg.sp_pastas:
            st.markdown(f"- `{p}`")
        st.markdown(f"- Uploads, cadastros e usuários do app: `{cfg.sp_pasta_app}`")
    else:
        for p in cfg.pastas:
            st.markdown(f"- {':material/check_circle:' if p.exists() else ':material/error:'} `{p}`"
                        + ("" if p.exists() else " — **não encontrada neste computador**"))
        st.markdown(f"- Uploads e cadastros do app: `{cfg.pasta_app}`")
    st.caption(f"O app verifica a fonte a cada {cfg.intervalo_verificacao} s. Quando aparece um arquivo mais novo "
               "(ou um arquivo é sobrescrito), todas as telas abertas se atualizam sozinhas. "
               f"{inteiro(inv.verificados)} arquivo(s) analisado(s) nesta varredura.")
    if inv.erro:
        st.error(inv.erro)

carregadas = {IW38: bases.iw38(), MB52: bases.mb52(), REQ: bases.requisicoes()}

for tipo in (IW38, MB52, REQ):
    b = carregadas[tipo]
    with st.container(border=True):
        st.markdown(f"#### {NOMES_BASE[tipo]}")
        if b.origem:
            c = st.columns([4, 2, 2])
            c[0].markdown(f"**Em uso:** `{b.origem.rotulo}`")
            c[1].markdown(f"**Arquivo de:** {ui.local(b.atualizado)}  \n({ui.idade(b.atualizado)})")
            if b.df is not None:
                extra = f"  \n{inteiro(b.extra)} da Fábrica Piloto/Matrizaria fora" if tipo == IW38 and b.extra else ""
                c[2].markdown(f"**Linhas:** {inteiro(len(b.df))}{extra}")
            if b.erro:
                st.error(b.erro)
        else:
            st.warning("Nenhum arquivo desta base encontrado nas pastas.")

        cands = inv.candidatos.get(tipo, [])
        if cands:
            opcoes = ["__auto__"] + [o.arquivo.id for o in cands]
            rotulos = {"__auto__": "Automático — sempre o arquivo mais recente"}
            rotulos.update({o.arquivo.id: f"{o.rotulo}  ({ui.local(o.arquivo.modificado)})" for o in cands})
            atual = inv.fixados.get(tipo, "__auto__")
            if atual not in opcoes:
                opcoes.append(atual)
                rotulos[atual] = f"{atual} (fixado, mas não encontrado)"
            escolha = st.selectbox("Qual arquivo usar", opcoes, index=opcoes.index(atual), format_func=rotulos.get,
                                   key=f"fixo_{tipo}", disabled=not edita,
                                   help="Fixe um arquivo se o app estiver pegando a planilha errada. Um arquivo fixado "
                                        "continua sendo relido sempre que for sobrescrito.")
            if escolha != atual:
                bases.fixar_origem(tipo, None if escolha == "__auto__" else escolha)
                st.rerun()

        if not edita:
            continue
        up = st.file_uploader(f"Enviar novo export de {NOMES_BASE[tipo]}", type=[e.strip(".") for e in leitura.EXTENSOES],
                              key=f"up_{tipo}", help="O arquivo é gravado na pasta do app e passa a valer para todo mundo.")
        if up is not None and st.button("Gravar e usar este arquivo", key=f"gravar_{tipo}", icon=":material/upload:"):
            try:
                nome = bases.enviar_arquivo(tipo, up.name, up.getvalue())
                st.success(f"Gravado como `{nome}`.")
                st.rerun()
            except Exception as e:  # noqa: BLE001
                st.error(f"Arquivo não aceito: {e}")

with st.expander("Como deixar tudo automático (sem ninguém importar nada)", icon=":material/bolt:", expanded=False):
    st.markdown(
        """
1. **Salve os exports do SAP sempre no mesmo lugar** — em qualquer pasta monitorada acima (ou subpasta).
   Pode sobrescrever o mesmo arquivo (ex.: `IW38BK.XLSX`) ou criar um por dia: o app usa o mais recente.
2. **O OneDrive sincroniza** a pasta com o SharePoint; o app percebe a mudança em até um minuto e
   atualiza todas as telas abertas.
3. **Para tirar até o export manual**, use o script `automacao/exportar_sap.vbs` (SAP GUI Scripting)
   agendado no Agendador de Tarefas do Windows — ele abre a IW38/MB52 com uma variante salva e grava o
   arquivo na pasta. Instruções no `README.md` do projeto.
4. **Cadastros** (criticidade, peças por equipamento, estoque mínimo) ficam em arquivos `.json` na pasta
   do app, também sincronizada — todos que abrem o app veem as mesmas informações.
"""
    )

with st.expander("Todos os arquivos reconhecidos"):
    linhas = [{"Base": NOMES_BASE[o.tipo], "Arquivo": o.rotulo, "Modificado": o.arquivo.modificado.astimezone(ui.FUSO).replace(tzinfo=None),
               "Tamanho (KB)": round(o.arquivo.tamanho / 1024), "Em uso": inv.ativos.get(o.tipo) == o}
              for lst in inv.candidatos.values() for o in lst]
    if linhas:
        st.dataframe(pd.DataFrame(linhas).sort_values("Modificado", ascending=False), hide_index=True, width="stretch",
                     column_config={"Modificado": st.column_config.DatetimeColumn(format="DD/MM/YYYY HH:mm")})
    else:
        st.caption("Nenhum arquivo reconhecido ainda.")
