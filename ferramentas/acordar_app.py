"""Abre o app publicado no Streamlit Cloud para ele não entrar em modo de espera.

O Streamlit Community Cloud coloca o app para "dormir" depois de 12 horas sem
visitas; quem abre depois precisa clicar em "Yes, get this app back up!" e
esperar. Este script (rodado pelo GitHub Actions a cada 6 h) faz uma visita e,
se o app estiver dormindo, aperta o botão.

Uso: python ferramentas/acordar_app.py https://central-manutencao-f26.streamlit.app
"""

import sys
import time

from playwright.sync_api import sync_playwright

url = sys.argv[1] if len(sys.argv) > 1 else ""
if not url.startswith("http"):
    raise SystemExit("Informe o endereço do app (variável APP_URL do repositório).")

with sync_playwright() as p:
    navegador = p.chromium.launch()
    pagina = navegador.new_page()
    pagina.goto(url, timeout=120_000)
    time.sleep(10)
    botao = pagina.get_by_role("button", name="Yes, get this app back up!")
    if botao.count():
        print("App estava dormindo — acordando…")
        botao.first.click()
        time.sleep(90)
    else:
        time.sleep(20)  # a visita em si já conta como uso e reinicia o prazo de 12 h
    print("App visitado:", url)
    navegador.close()
