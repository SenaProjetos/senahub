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
  /** `financeiro:folha_pj` — a Produção (pagamento de projetistas por entrega). */
  folhaPj: boolean;
};

export type Gate = keyof FlagsNavFinanceiro;

export type ItemNavFinanceiro = {
  id: string;
  href: string;
  rotulo: string;
  /** Uma linha sob o rótulo, nos menus que abrem. */
  desc?: string;
  gate: Gate;
  /** Só a rota exata marca este item como atual (a raiz do Financeiro). */
  exato?: boolean;
  /** Outras rotas que pertencem a este item. */
  tambemEm?: readonly string[];
  /** Tela nova: ganha o selo "novo" no menu. */
  novo?: boolean;
};

// Mock aprovado em 2026-10-02 (canvas "Financeiro — menu e novas telas"): 3 links diretos e 4 menus.
const PRINCIPAIS: readonly ItemNavFinanceiro[] = [
  { id: "visao", href: "/financeiro", rotulo: "Visão geral", gate: "ver", exato: true },
  { id: "lancamentos", href: "/financeiro/lancamentos", rotulo: "Lançamentos", gate: "ver" },
  { id: "contas", href: "/financeiro/contas", rotulo: "Contas", gate: "ver", tambemEm: ["/financeiro/contas-a-pagar", "/financeiro/contas-a-receber"] },
];

const MOVIMENTACOES: readonly ItemNavFinanceiro[] = [
  { id: "fluxo", href: "/financeiro/fluxo-caixa", rotulo: "Fluxo de caixa", desc: "Dia a dia, realizado e previsto", gate: "ver" },
  { id: "extrato", href: "/financeiro/extrato", rotulo: "Extrato por conta", desc: "Saldo corrido e conciliação", gate: "ver", novo: true },
  { id: "conciliacao", href: "/financeiro/conciliacao", rotulo: "Conciliação", desc: "Extrato do banco × lançamentos", gate: "conciliar" },
  { id: "planejamento", href: "/financeiro/planejamento", rotulo: "Pagamentos em lote", desc: "Quais contas cabem no saldo", gate: "gerir" },
];

const PLANEJAMENTO: readonly ItemNavFinanceiro[] = [
  { id: "planejador", href: "/financeiro/planejador", rotulo: "Planejador de caixa", desc: "Simular antes de decidir", gate: "ver" },
  { id: "cenarios", href: "/financeiro/cenarios", rotulo: "Cenários salvos", desc: "Simulações guardadas", gate: "ver" },
  { id: "caixinhas", href: "/financeiro/caixinhas", rotulo: "Caixinhas", desc: "Reservas para o que já tem destino", gate: "ver" },
  { id: "distribuicao", href: "/financeiro/distribuicao", rotulo: "Regras de distribuição", desc: "Como dividir cada recebimento", gate: "ver" },
  { id: "orcamento", href: "/financeiro/orcamento", rotulo: "Orçamento anual", desc: "Planejado × realizado", gate: "ver" },
];

const RESULTADOS: readonly ItemNavFinanceiro[] = [
  { id: "dre", href: "/financeiro/relatorios", rotulo: "DRE e indicadores", desc: "Caixa ou competência", gate: "resultados" },
  { id: "dfc", href: "/financeiro/dfc", rotulo: "DFC", desc: "Por atividade", gate: "resultados" },
  { id: "balanco", href: "/financeiro/balanco", rotulo: "Balanço gerencial", desc: "Caixa, a receber, a pagar", gate: "resultados" },
  { id: "rentabilidade", href: "/financeiro/rentabilidade", rotulo: "Rentabilidade por projeto", desc: "Receita, custo e margem", gate: "resultados" },
];

const MAIS: readonly ItemNavFinanceiro[] = [
  { id: "producao", href: "/financeiro/folha-projetistas", rotulo: "Produção", desc: "Pagamento de projetistas", gate: "folhaPj" },
  { id: "aprovacoes", href: "/financeiro/aprovacoes", rotulo: "Aprovações", desc: "Despesas na alçada", gate: "aprovar" },
  { id: "documentos", href: "/financeiro/documentos", rotulo: "Documentos", desc: "NF, contratos, medições", gate: "ver" },
  { id: "importar", href: "/financeiro/importar", rotulo: "Importar planilha", desc: "Meu Dinheiro e outras", gate: "conciliar" },
  { id: "fechamento", href: "/financeiro/fechamento", rotulo: "Fechamento mensal", desc: "Trava o mês fechado", gate: "fechar" },
  { id: "cadastros", href: "/financeiro/cadastros", rotulo: "Cadastros", desc: "Plano de contas, contas, centros", gate: "gerir" },
  { id: "configuracoes", href: "/financeiro/configuracoes", rotulo: "Configurações", desc: "Alçadas, campos obrigatórios", gate: "gerir" },
];

export type NavFinanceiro = {
  principais: ItemNavFinanceiro[];
  movimentacoes: ItemNavFinanceiro[];
  planejamento: ItemNavFinanceiro[];
  resultados: ItemNavFinanceiro[];
  mais: ItemNavFinanceiro[];
};

/** Itens que o usuário alcança. Grupo vazio some (quem só tem `ver` não vê "Mais" vazio). */
export function itensDaNavFinanceiro(f: FlagsNavFinanceiro): NavFinanceiro {
  const passa = (i: ItemNavFinanceiro) => f[i.gate];
  return {
    principais: PRINCIPAIS.filter(passa),
    movimentacoes: MOVIMENTACOES.filter(passa),
    planejamento: PLANEJAMENTO.filter(passa),
    resultados: RESULTADOS.filter(passa),
    mais: MAIS.filter(passa),
  };
}

/** Todos os itens de todos os grupos. */
export function todosOsItens(n: NavFinanceiro): ItemNavFinanceiro[] {
  return [...n.principais, ...n.movimentacoes, ...n.planejamento, ...n.resultados, ...n.mais];
}

/** O item é o da página atual? */
export function itemAtual(item: ItemNavFinanceiro, pathname: string): boolean {
  const casa = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  if (item.tambemEm?.some(casa)) return true;
  return item.exato ? pathname === item.href : casa(item.href);
}
