"""Abas do app num lugar só: a navegação do topo (montada por pessoa, só com as abas que a função dela
permite) e a tabela "Quem vê cada aba" da tela de Usuários leem esta lista."""

from __future__ import annotations

from pathlib import Path

# grupo do menu → [(id = arquivo em paginas/ sem .py, título, ícone)]
GRUPOS: dict[str, list[tuple[str, str, str]]] = {
    "Visão geral": [
        ("painel", "Painel WCM", ":material/dashboard:"),
        ("busca", "Buscar", ":material/search:"),
    ],
    "Confiabilidade": [
        ("confiabilidade", "Quebras, MTBF e MTTR", ":material/health_and_safety:"),
        ("saude", "Saúde dos ativos", ":material/monitor_heart:"),
        ("preditiva", "Preditiva (SEMEQ)", ":material/sensors:"),
        ("equipamentos", "Equipamentos", ":material/precision_manufacturing:"),
        ("notas", "Notas", ":material/notification_important:"),
    ],
    "Análise de falhas": [
        ("af_planos", "Planos de AF", ":material/troubleshoot:"),
        ("af_acoes", "Ações de AF", ":material/task_alt:"),
    ],
    "Planejamento": [
        ("ordens", "Ordens", ":material/assignment:"),
        ("planos", "Planos", ":material/calendar_month:"),
        ("calendario", "Calendário de ordens", ":material/event_note:"),
        ("semanal", "Programação semanal", ":material/view_week:"),
        ("execucao", "Execução das atividades", ":material/task_alt:"),
        ("programacao", "Programação do mês", ":material/edit_calendar:"),
        ("mao_de_obra", "Mão de obra e backlog", ":material/engineering:"),
        ("gestao_hh", "Gerenciador de HH", ":material/manage_accounts:"),
    ],
    "Custos e suprimentos": [
        ("custos", "Custos", ":material/payments:"),
        ("estoque", "Estoque", ":material/inventory_2:"),
        ("requisicoes", "Requisições", ":material/request_quote:"),
    ],
    "Configuração": [
        ("metas", "Metas e parâmetros", ":material/tune:"),
        ("qualidade", "Qualidade dos dados", ":material/rule:"),
        ("dados", "Fontes de dados", ":material/folder_open:"),
    ],
}
INICIAL = "painel"   # página de entrada; quem não vê o Painel entra na primeira aba que pode ver


def abas() -> list[tuple[str, str, str]]:
    """[(grupo, id, título)] na ordem do menu."""
    return [(g, pid, titulo) for g, itens in GRUPOS.items() for pid, titulo, _ in itens]


def caminho(pid: str) -> str:
    return f"paginas/{pid}.py"


def visiveis(pode_ver) -> dict[str, list[tuple[str, str, str]]]:
    """Os grupos só com as abas que `pode_ver(id)` permite (grupo vazio some do menu)."""
    saida = {}
    for g, itens in GRUPOS.items():
        ok = [item for item in itens if pode_ver(item[0])]
        if ok:
            saida[g] = ok
    return saida


def inicial(visiveis_: dict[str, list[tuple[str, str, str]]]) -> str | None:
    ids = [pid for itens in visiveis_.values() for pid, _, _ in itens]
    if INICIAL in ids:
        return INICIAL
    return ids[0] if ids else None


def id_da_pagina(pagina) -> str | None:
    """Id (arquivo em paginas/) da página que o st.navigation vai rodar; None para as da conta e a de entrada."""
    origem = getattr(pagina, "_page", None)
    if isinstance(origem, (str, Path)):
        return Path(origem).stem
    return None
