/**
 * Itens da navegação do Financeiro (pura, sem React): quem vê o quê, pelo MESMO gate da página
 * de destino. Link que o servidor responderia com "sem permissão" não aparece (spec/plano I11).
 *
 * `ver` é `podeVerFinanceiro` (financeiro:ver OU sócio ativo — piso de leitura); as demais flags
 * são `can()` de cada par. Rotas ainda não construídas (planejador, caixinhas…) entram aqui
 * quando a página existir — nunca antes, para não haver link que dá 404.
 */

export type FlagsNavFinanceiro = {
  ver: boolean;
  resultados: boolean;
  aprovar: boolean;
  conciliar: boolean;
  gerir: boolean;
  fechar: boolean;
};

export type Gate = keyof FlagsNavFinanceiro;

export type ItemNavFinanceiro = {
  id: string;
  href: string;
  rotulo: string;
  gate: Gate;
  /** Só a rota exata marca este item como atual (a raiz do Financeiro). */
  exato?: boolean;
  /** Query que distingue itens da mesma rota (A pagar × A receber). */
  query?: { chave: string; valor: string | null };
};

const PRINCIPAIS: readonly ItemNavFinanceiro[] = [
  { id: "visao", href: "/financeiro", rotulo: "Visão geral", gate: "ver", exato: true },
  { id: "planejador", href: "/financeiro/planejador", rotulo: "Planejador de caixa", gate: "ver" },
  { id: "fluxo", href: "/financeiro/fluxo-caixa", rotulo: "Fluxo de caixa", gate: "ver" },
  { id: "pagar", href: "/financeiro/contas", rotulo: "A pagar", gate: "ver", query: { chave: "tab", valor: null } },
  { id: "receber", href: "/financeiro/contas?tab=receita", rotulo: "A receber", gate: "ver", query: { chave: "tab", valor: "receita" } },
  { id: "lancamentos", href: "/financeiro/lancamentos", rotulo: "Lançamentos", gate: "ver" },
];

const RESULTADOS: readonly ItemNavFinanceiro[] = [
  { id: "dre", href: "/financeiro/relatorios", rotulo: "DRE e indicadores", gate: "resultados" },
  { id: "rentabilidade", href: "/financeiro/rentabilidade", rotulo: "Rentabilidade por projeto", gate: "resultados" },
  { id: "dfc", href: "/financeiro/dfc", rotulo: "DFC", gate: "resultados" },
  { id: "balanco", href: "/financeiro/balanco", rotulo: "Balanço gerencial", gate: "resultados" },
  { id: "orcamento", href: "/financeiro/orcamento", rotulo: "Orçamento anual", gate: "ver" },
];

const MAIS: readonly ItemNavFinanceiro[] = [
  { id: "aprovacoes", href: "/financeiro/aprovacoes", rotulo: "Aprovações", gate: "aprovar" },
  { id: "conciliacao", href: "/financeiro/conciliacao", rotulo: "Conciliação", gate: "conciliar" },
  { id: "importar", href: "/financeiro/importar", rotulo: "Importar extrato", gate: "conciliar" },
  { id: "planejamento", href: "/financeiro/planejamento", rotulo: "Planejamento de pagamentos", gate: "gerir" },
  { id: "fechamento", href: "/financeiro/fechamento", rotulo: "Fechamento mensal", gate: "fechar" },
  { id: "documentos", href: "/financeiro/documentos", rotulo: "Documentos", gate: "ver" },
  { id: "cadastros", href: "/financeiro/cadastros", rotulo: "Cadastros", gate: "gerir" },
  { id: "configuracoes", href: "/financeiro/configuracoes", rotulo: "Configurações", gate: "gerir" },
];

export type NavFinanceiro = {
  principais: ItemNavFinanceiro[];
  resultados: ItemNavFinanceiro[];
  mais: ItemNavFinanceiro[];
};

/** Itens que o usuário alcança. Grupo vazio some (quem só tem `ver` não vê "Mais" vazio). */
export function itensDaNavFinanceiro(f: FlagsNavFinanceiro): NavFinanceiro {
  const passa = (i: ItemNavFinanceiro) => f[i.gate];
  return { principais: PRINCIPAIS.filter(passa), resultados: RESULTADOS.filter(passa), mais: MAIS.filter(passa) };
}

/** O item é o da página atual? `tab` só importa nos itens que a distinguem por query. */
export function itemAtual(item: ItemNavFinanceiro, pathname: string, tab: string | null): boolean {
  if (item.query) {
    const base = item.href.split("?")[0];
    if (pathname !== base) return false;
    return (tab ?? null) === item.query.valor || (item.query.valor === null && tab !== "receita");
  }
  return item.exato ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
