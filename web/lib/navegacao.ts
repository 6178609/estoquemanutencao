/**
 * Abas do sistema.
 * `rota`: endereço da aba.
 */
export interface Aba {
  id: string;
  titulo: string;
  icone: string; // nome do ícone (lucide)
  rota: string;
}

export const GRUPOS: { titulo: string; abas: Aba[] }[] = [
  { titulo: "Visão geral", abas: [
    { id: "painel", titulo: "Painel WCM", icone: "LayoutDashboard", rota: "/painel" },
    { id: "busca", titulo: "Buscar", icone: "Search", rota: "/busca" },
    { id: "suporte", titulo: "Suporte Técnico", icone: "LifeBuoy", rota: "/suporte" },
    { id: "indicadores_sim", titulo: "Indicadores SIM (MP)", icone: "Gauge", rota: "/indicadores_sim" },
  ] },
  { titulo: "Confiabilidade", abas: [
    { id: "confiabilidade", titulo: "Quebras, MTBF e MTTR", icone: "ShieldCheck", rota: "/confiabilidade" },
    { id: "confiabilidade_tipos", titulo: "MTBF e MTTR por tipo de ordem", icone: "Timer", rota: "/confiabilidade_tipos" },
    { id: "saude", titulo: "Saúde dos ativos", icone: "HeartPulse", rota: "/saude" },
    { id: "preditiva", titulo: "Preditiva (SEMEQ)", icone: "Radar", rota: "/preditiva" },
    { id: "equipamentos", titulo: "Equipamentos", icone: "Factory", rota: "/equipamentos" },
    { id: "notas", titulo: "Notas", icone: "BellRing", rota: "/notas" },
  ] },
  { titulo: "Análise de falhas", abas: [
    { id: "af_planos", titulo: "Planos de AF", icone: "Microscope", rota: "/af_planos" },
    { id: "af_acoes", titulo: "Ações de AF", icone: "ListChecks", rota: "/af_acoes" },
  ] },
  { titulo: "Planejamento", abas: [
    { id: "ordens", titulo: "Ordens", icone: "ClipboardList", rota: "/ordens" },
    { id: "planos", titulo: "Planos", icone: "CalendarRange", rota: "/planos" },
    { id: "semanal", titulo: "Programação semanal", icone: "CalendarClock", rota: "/semanal" },
    { id: "execucao", titulo: "Execução das atividades", icone: "CircleCheckBig", rota: "/execucao" },
    { id: "mao_de_obra", titulo: "Mão de obra e backlog", icone: "HardHat", rota: "/mao_de_obra" },
    { id: "gestao_hh", titulo: "Gerenciador de HH", icone: "UsersRound", rota: "/gestao_hh" },
    { id: "treinamentos_ferias", titulo: "Treinamentos e férias", icone: "GraduationCap", rota: "/treinamentos_ferias" },
  ] },
  { titulo: "Custos e suprimentos", abas: [
    { id: "custos", titulo: "Custos", icone: "Wallet", rota: "/custos" },
    { id: "estoque", titulo: "Estoque", icone: "Boxes", rota: "/estoque" },
    { id: "mro", titulo: "Gestão de MRO", icone: "Wrench", rota: "/mro" },
    { id: "requisicoes", titulo: "Requisições", icone: "Receipt", rota: "/requisicoes" },
  ] },
  { titulo: "Configuração", abas: [
    { id: "metas", titulo: "Metas e parâmetros", icone: "SlidersHorizontal", rota: "/metas" },
    { id: "qualidade", titulo: "Qualidade dos dados", icone: "BadgeCheck", rota: "/qualidade" },
    { id: "dados", titulo: "Fontes de dados", icone: "FolderOpen", rota: "/dados" },
  ] },
];

export const TODAS = GRUPOS.flatMap((g) => g.abas.map((a) => a.id));

