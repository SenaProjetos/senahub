/**
 * Retenções na nota (C4 da integração contábil, mock aprovado 2026-10-16) — PURO, sem I/O.
 * Spec: docs/superpowers/specs/2026-10-07-integracao-contabil.md §7.
 *
 * Quem PAGA a nota retém o imposto e recolhe ao governo; o fornecedor recebe o líquido. A retenção é digitada a partir
 * da nota (valor em reais, nunca alíquota) e mora no título (`RetencaoLancamento`). Ela só vira dinheiro na BAIXA:
 *  - conta a pagar (nós retemos): na conta do pagamento entra um acessório RECEITA por imposto (fora da DRE), então o
 *    banco perde só o líquido; e nasce UMA conta a pagar por imposto (fora da DRE), que vence no dia configurado do
 *    mês seguinte ao do pagamento (contador: ISS dia 10, os demais dia 15);
 *  - conta a receber (o cliente reteve): entra um acessório DESPESA por imposto (fora da DRE) — o banco recebe o
 *    líquido e o retido fica "a compensar" com o contador, que desconta no DAS. Não nasce conta nenhuma.
 * A DRE vê o valor cheio da nota pelo título; o caixa, o planejador e a conciliação veem o líquido.
 */

export const IMPOSTOS_RETIDOS = ["iss", "irrf", "inss", "pis", "cofins", "csll"] as const;
export type ImpostoRetido = (typeof IMPOSTOS_RETIDOS)[number];

export const ROTULO_IMPOSTO: Readonly<Record<ImpostoRetido, string>> = {
  iss: "ISS",
  irrf: "IRRF",
  inss: "INSS",
  pis: "PIS",
  cofins: "COFINS",
  csll: "CSLL",
};

/** Em centavos. */
export type Retencao = { imposto: ImpostoRetido; valorCentavos: number };

/** Dia do mês seguinte em que vence a conta de cada imposto retido (Configurações do Financeiro). */
export type DiasDeVencimento = Readonly<Record<ImpostoRetido, number>>;
/** Resposta do contador (2026-10-15): ISS dia 10, os demais dia 15 do mês subsequente. */
export const DIAS_PADRAO: DiasDeVencimento = { iss: 10, irrf: 15, inss: 15, pis: 15, cofins: 15, csll: 15 };

/** Categorias do sistema (criadas pela migração, achadas pela chave), todas `fora_do_resultado`. */
export const CHAVE_RETENCAO_FEITA = "receita_retencao_feita";
export const CHAVE_RETENCAO_SOFRIDA = "despesa_retencao_sofrida";
export const CHAVE_IMPOSTO_RETIDO_A_RECOLHER = "despesa_imposto_retido_a_recolher";

export const MOTIVO_RETENCAO_NEGATIVA = "Retenção não pode ser negativa.";
export const MOTIVO_RETENCAO_REPETIDA = "Cada imposto aparece uma vez só nas retenções.";
export const MOTIVO_RETENCAO_MAIOR = "As retenções não podem somar o valor da nota inteira, nem mais que ele.";
export const MOTIVO_RETENCAO_CARTAO = "Compra no cartão não tem retenção na nota.";
export const MOTIVO_RETENCAO_RECORRENCIA = "Retenção é de uma nota: lance a nota sem repetir nos meses seguintes.";
export const MOTIVO_RETENCAO_PAGA = "Conta já paga ou recebida: para mudar a retenção, estorne o pagamento antes.";
export const MOTIVO_RETENCAO_SEM_CONTA = "Conta com retenção precisa da conta bancária do pagamento: escolha a conta.";
export const MOTIVO_RETENCAO_DESCONTO = "Com esse desconto, o retido passa do que sai do banco: confira o desconto ou as retenções.";
export const MOTIVO_RETENCAO_LOTE =
  "Conta com retenção na nota não entra em pagamentos em lote: pague pela própria conta (Contas → Pagar), que gera as contas dos impostos.";
export const MOTIVO_IMPOSTO_RECOLHIDO = "O imposto retido já foi recolhido: estorne o recolhimento primeiro.";
export const MOTIVO_RETENCAO_ORIGEM = "Nasce da retenção de uma nota: para desfazer, estorne o pagamento da conta de origem.";
export const MOTIVO_RETENCAO_VALOR = "O valor é o retido na nota: corrija a retenção na conta de origem.";
/** A conta do imposto segue a nota: valor, categoria e datas são dela; aqui mudam vencimento, descrição e observação. */
export const MOTIVO_IMPOSTO_SEGUE_NOTA =
  "A conta do imposto retido segue a nota de origem: valor, categoria e datas não mudam aqui — só vencimento, descrição e observação.";
/** O formulário não tem a conta bancária: nota com retenção nasce em aberto e se paga pela baixa. */
export const MOTIVO_RETENCAO_JA_REALIZADO =
  "Nota com retenção: lance em aberto e pague pelo botão Pagar, que pede a conta bancária e gera as contas dos impostos.";
export const MOTIVO_RETENCAO_ORIGEM_FORA =
  "Retenção na nota só em lançamento do Financeiro: pagamento de produção, taxa de ART, transferência e conta de imposto não levam.";

/** Mesmas retenções (a ordem já vem fixa de `normalizarRetencoes`/`retencoesDoTitulo`). */
export const mesmasRetencoes = (a: readonly Retencao[], b: readonly Retencao[]) =>
  a.length === b.length && a.every((x, k) => x.imposto === b[k].imposto && x.valorCentavos === b[k].valorCentavos);

/** O pagamento parcial não leva retenção: o imposto é retido sobre a nota toda. */
export const motivoRetencaoParcial = (tipo: "receita" | "despesa") =>
  `Conta com retenção só se ${tipo === "receita" ? "recebe" : "paga"} inteira: o imposto é retido sobre a nota toda.`;

/** Do formulário (reais) para centavos; zero e vazio somem. A ordem sai sempre a de `IMPOSTOS_RETIDOS`. */
export function normalizarRetencoes(lista: readonly { imposto: ImpostoRetido; valor: number }[]): Retencao[] {
  const r = lista.map((x) => ({ imposto: x.imposto, valorCentavos: Math.round(x.valor * 100) })).filter((x) => x.valorCentavos !== 0);
  return r.sort((a, b) => IMPOSTOS_RETIDOS.indexOf(a.imposto) - IMPOSTOS_RETIDOS.indexOf(b.imposto));
}

export const totalRetido = (r: readonly Pick<Retencao, "valorCentavos">[]) => r.reduce((s, x) => s + x.valorCentavos, 0);

/** O que sai (ou entra) no banco: valor da nota menos o retido. */
export const liquidoDoTitulo = (valorCentavos: number, r: readonly Pick<Retencao, "valorCentavos">[]) => valorCentavos - totalRetido(r);

/** Por que essas retenções não valem para um título desse valor; `null` = valem. */
export function motivoRetencoesInvalidas(valorTituloCentavos: number, r: readonly Retencao[]): string | null {
  if (r.some((x) => x.valorCentavos < 0)) return MOTIVO_RETENCAO_NEGATIVA;
  if (new Set(r.map((x) => x.imposto)).size !== r.length) return MOTIVO_RETENCAO_REPETIDA;
  if (r.length > 0 && totalRetido(r) >= valorTituloCentavos) return MOTIVO_RETENCAO_MAIOR;
  return null;
}

const ultimoDiaDoMes = (ano: number, mes1a12: number) => new Date(Date.UTC(ano, mes1a12, 0)).getUTCDate();

/**
 * Vencimento da conta do imposto: o dia configurado do mês SEGUINTE ao do pagamento da nota (dia 31 em mês curto vira
 * o último dia). Cair em fim de semana ou feriado não move a data: a tela avisa (decisão do mock aprovado).
 */
export function vencimentoDoImposto(diaPagamentoIso: string, diaDoMes: number): string {
  const [a, m] = diaPagamentoIso.split("-").map(Number);
  const ano = m === 12 ? a + 1 : a;
  const mes = m === 12 ? 1 : m + 1;
  const d = Math.min(Math.max(1, Math.trunc(diaDoMes)), ultimoDiaDoMes(ano, mes));
  return `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export type AcessorioDeRetencao = {
  imposto: ImpostoRetido;
  /** Inverso do título: a conta a pagar ganha uma receita (o banco sai menos), a a receber ganha uma despesa. */
  tipo: "receita" | "despesa";
  chaveCategoria: string;
  valorCentavos: number;
  rotulo: string;
};

export type ImpostoARecolher = { imposto: ImpostoRetido; valorCentavos: number; vencimento: string; rotulo: string };

export type PlanoDaRetencao = { acessorios: AcessorioDeRetencao[]; aRecolher: ImpostoARecolher[]; retidoCentavos: number };

/** O que a baixa de um título com retenção grava além do principal. */
export function planejarRetencoesNaBaixa(p: {
  tipo: "receita" | "despesa";
  retencoes: readonly Retencao[];
  diaPagamento: string;
  dias: DiasDeVencimento;
}): PlanoDaRetencao {
  const r = p.retencoes.filter((x) => x.valorCentavos > 0);
  if (p.tipo === "despesa") {
    return {
      acessorios: r.map((x) => ({ imposto: x.imposto, tipo: "receita", chaveCategoria: CHAVE_RETENCAO_FEITA, valorCentavos: x.valorCentavos, rotulo: `${ROTULO_IMPOSTO[x.imposto]} retido` })),
      aRecolher: r.map((x) => ({ imposto: x.imposto, valorCentavos: x.valorCentavos, vencimento: vencimentoDoImposto(p.diaPagamento, p.dias[x.imposto]), rotulo: `${ROTULO_IMPOSTO[x.imposto]} retido` })),
      retidoCentavos: totalRetido(r),
    };
  }
  return {
    acessorios: r.map((x) => ({ imposto: x.imposto, tipo: "despesa", chaveCategoria: CHAVE_RETENCAO_SOFRIDA, valorCentavos: x.valorCentavos, rotulo: `${ROTULO_IMPOSTO[x.imposto]} retido pelo cliente` })),
    aRecolher: [],
    retidoCentavos: totalRetido(r),
  };
}

export const MOTIVO_IMPOSTO_ESTIMADO =
  "Imposto retido estimado: vira conta a pagar quando a nota for paga, e o vencimento sai do dia do pagamento.";

/**
 * Planejador: a nota com retenção ainda em aberto pesa o líquido no dia dela, e cada imposto retido entra como saída
 * ESTIMADA no dia configurado do mês seguinte (supondo o pagamento no vencimento da nota). Só conta a pagar: na conta a
 * receber o imposto é do cliente. Id `ret:<título>:<imposto>`, nunca reprogramável (ainda não é lançamento).
 */
export function impostosEstimados(
  titulo: { id: string; tipo: "receita" | "despesa"; data: string; descricao: string },
  retencoes: readonly Retencao[],
  dias: DiasDeVencimento,
): { id: string; imposto: ImpostoRetido; data: string; valorCentavos: number; descricao: string }[] {
  if (titulo.tipo !== "despesa") return [];
  return retencoes
    .filter((r) => r.valorCentavos > 0)
    .map((r) => ({
      id: `ret:${titulo.id}:${r.imposto}`,
      imposto: r.imposto,
      data: vencimentoDoImposto(titulo.data, dias[r.imposto]),
      valorCentavos: r.valorCentavos,
      descricao: `${ROTULO_IMPOSTO[r.imposto]} retido (estimado) — ${titulo.descricao}`,
    }));
}

/** Lê a configuração gravada; o que faltar ou vier fora de 1–31 cai no padrão do contador. */
export function diasDaConfig(valor: unknown): DiasDeVencimento {
  const v = (valor ?? {}) as Partial<Record<ImpostoRetido, unknown>>;
  const dias = { ...DIAS_PADRAO } as Record<ImpostoRetido, number>;
  for (const k of IMPOSTOS_RETIDOS) {
    const n = Number(v[k]);
    if (Number.isInteger(n) && n >= 1 && n <= 31) dias[k] = n;
  }
  return dias;
}
