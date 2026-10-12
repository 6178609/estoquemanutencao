/**
 * Abas do sistema — a MESMA lista de central/navegacao.py (o teste tests/test_web_navegacao.py confere).
 * `rota`: a aba já existe aqui; as demais aparecem como "em breve" no menu.
 */
export interface Aba {
  id: string;
  titulo: string;
  icone: string; // nome do ícone (lucide)
  rota?: string; // rota no site novo, quando já migrada
}

export const GRUPOS: { titulo: string; abas: Aba[] }[] = [
  { titulo: "Visão geral", abas: [
    { id: "painel", titulo: "Painel WCM", icone: "LayoutDashboard", rota: "/painel" },
    { id: "busca", titulo: "Buscar", icone: "Search" },
  ] },
  { titulo: "Confiabilidade", abas: [
    { id: "confiabilidade", titulo: "Quebras, MTBF e MTTR", icone: "ShieldCheck" },
    { id: "saude", titulo: "Saúde dos ativos", icone: "HeartPulse" },
    { id: "preditiva", titulo: "Preditiva (SEMEQ)", icone: "Radar" },
    { id: "equipamentos", titulo: "Equipamentos", icone: "Factory" },
    { id: "notas", titulo: "Notas", icone: "BellRing" },
  ] },
  { titulo: "Análise de falhas", abas: [
    { id: "af_planos", titulo: "Planos de AF", icone: "Microscope" },
    { id: "af_acoes", titulo: "Ações de AF", icone: "ListChecks" },
  ] },
  { titulo: "Planejamento", abas: [
    { id: "ordens", titulo: "Ordens", icone: "ClipboardList" },
    { id: "planos", titulo: "Planos", icone: "CalendarRange" },
    { id: "calendario", titulo: "Calendário de ordens", icone: "CalendarDays" },
    { id: "semanal", titulo: "Programação semanal", icone: "CalendarClock" },
    { id: "execucao", titulo: "Execução das atividades", icone: "CircleCheckBig" },
    { id: "programacao", titulo: "Programação do mês", icone: "CalendarCog" },
    { id: "mao_de_obra", titulo: "Mão de obra e backlog", icone: "HardHat" },
    { id: "gestao_hh", titulo: "Gerenciador de HH", icone: "UsersRound" },
  ] },
  { titulo: "Custos e suprimentos", abas: [
    { id: "custos", titulo: "Custos", icone: "Wallet" },
    { id: "estoque", titulo: "Estoque", icone: "Boxes", rota: "/estoque" },
    { id: "requisicoes", titulo: "Requisições", icone: "Receipt" },
  ] },
  { titulo: "Configuração", abas: [
    { id: "metas", titulo: "Metas e parâmetros", icone: "SlidersHorizontal" },
    { id: "qualidade", titulo: "Qualidade dos dados", icone: "BadgeCheck" },
    { id: "dados", titulo: "Fontes de dados", icone: "FolderOpen", rota: "/dados" },
  ] },
];

export const TODAS = GRUPOS.flatMap((g) => g.abas.map((a) => a.id));

