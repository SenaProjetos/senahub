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
    ],
  },
  {
    recurso: "uploads",
    label: "Uploads & Validação",
    acoes: [{ acao: "validar", label: "Validar entregas (libera pagamento)" }],
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
    recurso: "permissoes",
    label: "Permissões",
    acoes: [{ acao: "gerir", label: "Editar matriz de permissões" }],
  },
];
