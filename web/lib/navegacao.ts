/**
 * Abas do sistema.
 * `rota`: endereço da aba. `oculta`: continua existindo (acesso e endereço), mas não aparece no menu lateral.
 */
interface Aba {
  id: string;
  titulo: string;
  icone: string; // nome do ícone (lucide)
  rota: string;
  oculta?: boolean;
}

export const GRUPOS: { titulo: string; abas: Aba[] }[] = [
  { titulo: "Visão geral", abas: [
    { id: "painel", titulo: "Painel Geral", icone: "LayoutDashboard", rota: "/painel" },
    { id: "busca", titulo: "Buscar", icone: "Search", rota: "/busca", oculta: true },
    { id: "suporte", titulo: "Suporte Técnico", icone: "LifeBuoy", rota: "/suporte" },
    { id: "indicadores_sim", titulo: "Indicadores SIM (MP)", icone: "Gauge", rota: "/indicadores_sim" },
  ] },
  { titulo: "Confiabilidade", abas: [
    { id: "confiabilidade", titulo: "Quebras, MTBF e MTTR", icone: "ShieldCheck", rota: "/confiabilidade" },
    { id: "saude", titulo: "Saúde dos ativos", icone: "HeartPulse", rota: "/saude", oculta: true },
    { id: "preditiva", titulo: "Preditiva (SEMEQ)", icone: "Radar", rota: "/preditiva" },
    { id: "equipamentos", titulo: "Equipamentos", icone: "Factory", rota: "/equipamentos" },
    { id: "manuais", titulo: "Manuais", icone: "BookOpen", rota: "/manuais" },
    { id: "notas", titulo: "Notas", icone: "BellRing", rota: "/notas" },
  ] },
  { titulo: "Análise de falhas", abas: [
    { id: "af_planos", titulo: "Planos de AF", icone: "Microscope", rota: "/af_planos" },
    { id: "af_acoes", titulo: "Ações de AF", icone: "ListChecks", rota: "/af_acoes" },
  ] },
  { titulo: "Planejamento", abas: [
    { id: "ordens", titulo: "Ordens", icone: "ClipboardList", rota: "/ordens" },
    { id: "planos", titulo: "Planos", icone: "CalendarRange", rota: "/planos" },
    { id: "execucao", titulo: "Execução das atividades", icone: "CircleCheckBig", rota: "/execucao" },
    { id: "mao_de_obra", titulo: "Mão de obra e backlog", icone: "HardHat", rota: "/mao_de_obra" },
    { id: "gestao_hh", titulo: "Gerenciador de HH", icone: "UsersRound", rota: "/gestao_hh" },
    { id: "programacao_paradas", titulo: "Programação de paradas", icone: "CalendarCog", rota: "/programacao_paradas" },
    { id: "treinamentos_ferias", titulo: "Treinamentos e férias", icone: "GraduationCap", rota: "/treinamentos_ferias" },
  ] },
  { titulo: "Custos e suprimentos", abas: [
    { id: "custos", titulo: "Custos", icone: "Wallet", rota: "/custos" },
    { id: "estoque", titulo: "Estoque", icone: "Boxes", rota: "/estoque" },
    { id: "mro", titulo: "Gestão de MRO", icone: "Wrench", rota: "/mro" },
    { id: "requisicoes", titulo: "Requisições", icone: "Receipt", rota: "/requisicoes" },
    { id: "cartao", titulo: "Cartão de crédito", icone: "CreditCard", rota: "/cartao" },
  ] },
  { titulo: "Configuração", abas: [
    { id: "metas", titulo: "Metas e parâmetros", icone: "SlidersHorizontal", rota: "/metas" },
    { id: "qualidade", titulo: "Qualidade dos dados", icone: "BadgeCheck", rota: "/qualidade", oculta: true },
    { id: "dados", titulo: "Fontes de dados", icone: "FolderOpen", rota: "/dados" },
  ] },
];

export const TODAS = GRUPOS.flatMap((g) => g.abas.map((a) => a.id));

