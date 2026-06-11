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
