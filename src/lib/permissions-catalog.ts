/**
 * Catálogo de recursos:ações sujeitos à permissão fina.
 * Cresce a cada onda conforme novos módulos entram. A matriz de permissões
 * (Configurações → Permissões) é montada a partir daqui.
 */
export type RecursoCatalogo = {
  recurso: string;
  label: string;
  acoes: { acao: string; label: string }[];
};

export const PERMISSOES_CATALOGO: RecursoCatalogo[] = [
  {
    recurso: "clientes",
    label: "Clientes",
    acoes: [
      { acao: "ver", label: "Ver clientes" },
      { acao: "gerir", label: "Criar/editar clientes" },
    ],
  },
  {
    recurso: "projetos",
    label: "Projetos",
    acoes: [
      { acao: "ver", label: "Ver projetos" },
      { acao: "gerir", label: "Criar/editar projetos e disciplinas" },
      { acao: "historico", label: "Ver o histórico (CDE) de documentos do projeto" },
    ],
  },
  {
    recurso: "uploads",
    label: "Uploads & Validação",
    acoes: [{ acao: "validar", label: "Validar entregas (libera pagamento)" }],
  },
  {
    recurso: "arquivos_gerais",
    label: "Arquivos gerais do projeto",
    acoes: [
      { acao: "ver", label: 'Ver a pasta "Geral" do projeto' },
      { acao: "gerir", label: 'Adicionar/editar/excluir arquivos gerais' },
    ],
  },
  {
    recurso: "arquivos",
    label: "Arquivos do projeto (Diretório)",
    acoes: [
      { acao: "ver", label: "Ver o Diretório de arquivos" },
      { acao: "baixar", label: "Baixar/abrir arquivos" },
      {
        acao: "ver_todas_disciplinas",
        label: "Ver arquivos de todas as disciplinas do projeto (senão, só as próprias)",
      },
      { acao: "enviar", label: "Enviar arquivos (pelo projeto)" },
    ],
  },
  {
    recurso: "financeiro",
    label: "Financeiro",
    acoes: [
      { acao: "ver", label: "Ver financeiro (cadastros, lançamentos, relatórios)" },
      { acao: "gerir", label: "Lançar e gerir financeiro" },
      { acao: "extrato", label: "Ver apenas o próprio extrato" },
    ],
  },
  {
    recurso: "comercial",
    label: "Comercial (CRM)",
    acoes: [
      { acao: "ver", label: "Ver funil e propostas" },
      { acao: "gerir", label: "Gerir leads, propostas e tabelas de preço" },
    ],
  },
  {
    recurso: "juridico",
    label: "Jurídico",
    acoes: [
      { acao: "ver", label: "Ver documentos e certidões" },
      { acao: "gerir", label: "Gerir documentos jurídicos" },
    ],
  },
  {
    recurso: "licitacoes",
    label: "Licitações",
    acoes: [
      { acao: "ver", label: "Ver licitações" },
      { acao: "gerir", label: "Gerir licitações e medições" },
    ],
  },
  {
    recurso: "qualidade",
    label: "Qualidade",
    acoes: [{ acao: "ver", label: "Ver índice de qualidade" }],
  },
  {
    recurso: "planejamento",
    label: "Planejamento",
    acoes: [
      { acao: "ver", label: "Ver EAP e cronograma dos projetos" },
      { acao: "gerir", label: "Editar EAP, linha de base e aplicar plano" },
    ],
  },
  {
    recurso: "coordenacao",
    label: "Coordenação BIM",
    acoes: [
      { acao: "ver", label: "Ver maquete federada e apontamentos" },
      { acao: "gerir", label: "Criar apontamentos, converter modelos e exportar BCF" },
    ],
  },
  {
    recurso: "recursos",
    label: "Recursos",
    acoes: [
      { acao: "ver", label: "Ver matriz de recursos" },
      { acao: "gerir", label: "Gerir capacidade e alocações" },
    ],
  },
  {
    recurso: "documentos",
    label: "Estúdio de Documentos",
    acoes: [
      { acao: "ver", label: "Ver e gerar documentos" },
      { acao: "gerir", label: "Criar/editar modelos de documento" },
    ],
  },
  {
    recurso: "usuarios",
    label: "Usuários",
    acoes: [{ acao: "gerir", label: "Gerir usuários" }],
  },
  {
    recurso: "configuracoes",
    label: "Configurações",
    acoes: [{ acao: "gerir", label: "Gerir configurações" }],
  },
  {
    recurso: "avisos",
    label: "Avisos gerais",
    acoes: [{ acao: "enviar", label: "Enviar avisos e ver confirmações de leitura" }],
  },
  {
    recurso: "permissoes",
    label: "Permissões",
    acoes: [{ acao: "gerir", label: "Editar matriz de permissões" }],
  },
  {
    recurso: "ferramentas",
    label: "Ferramentas de Engenharia",
    acoes: [
      { acao: "usar", label: "Usar ferramentas e salvar cálculos" },
      { acao: "gerir", label: "Ver cálculos de todos / administrar" },
    ],
  },
  {
    recurso: "biblioteca_tecnica",
    label: "Biblioteca técnica (Padrões e Normas)",
    acoes: [
      { acao: "ver", label: "Ver padrões técnicos e normas catalogadas" },
      { acao: "incluir", label: "Incluir novos padrões e normas" },
      { acao: "gerir", label: "Editar/excluir padrões e normas de qualquer autor" },
    ],
  },
  {
    recurso: "patrimonio",
    label: "Patrimônio / Ativos",
    acoes: [
      { acao: "ver", label: "Ver inventário de ativos" },
      { acao: "gerir", label: "Criar/editar ativos do inventário" },
      { acao: "ti", label: "Gerenciar TI (máquinas, peças, manutenção)" },
    ],
  },
  {
    recurso: "ponto",
    label: "Ponto",
    acoes: [
      { acao: "rateio", label: "Ver rateio de horas da equipe por projeto" },
      { acao: "espelho_equipe", label: "Ver espelho de ponto de outros usuários" },
      { acao: "gerir_escalas", label: "Configurar escalas de trabalho (por perfil e por usuário)" },
      { acao: "ajustar", label: "Editar batidas de ponto de outros usuários (com ciência)" },
    ],
  },
  {
    recurso: "rh",
    label: "RH — Pessoas",
    acoes: [
      { acao: "cadastro", label: "Ver a ficha de pessoas (cadastro, ausências, escala)" },
      { acao: "folha", label: "Ver dados de folha/salário na ficha da pessoa" },
    ],
  },
];
