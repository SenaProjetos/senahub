/**
 * A folha CLT fechada × a conta a pagar dela no Financeiro (N0 do núcleo do Financeiro). Puro, sem I/O —
 * a mesma decisão vale no teste e no servidor.
 *
 * Regras (decisões do dono, 2026-10-02):
 * - **Fechar não é pagar.** Fechar a folha da competência M grava o LÍQUIDO REAL na conta a pagar dela,
 *   que continua EM ABERTO até o pagamento (5º dia útil de M+1), registrado na baixa ou na conciliação.
 * - **Competência ≠ mês do vencimento.** A folha de setembro vence em outubro; o vínculo da recorrência
 *   é `recorrenciaCompetencia = M`. Sem vínculo, a conta a pagar de outubro (dias 1–15) é a candidata.
 * - **Adiantamento de salário é outra conta da mesma competência**, paga antes; o holerite já o
 *   desconta do líquido. A folha nunca o toca.
 * - **Folha já paga** (a conta da competência já está paga quando o RH fecha): não nasce outra; o
 *   fechamento aponta a diferença, para quem paga resolver.
 *
 * Só a folha `mensal` mexe nessa conta: a de 13º é outra despesa, com folha própria no mesmo mês.
 */
import type { Centavos } from "@/modules/financeiro/liquidez/tipos";
import { formatarCentavos } from "@/modules/financeiro/liquidez/dinheiro";
import type { TipoFolha } from "@/modules/rh/folha/tipo-folha";

export type SituacaoDaConta = "previsto" | "aguardando_aprovacao" | "confirmado";

/** Conta a pagar de folha CLT candidata a receber o valor da folha fechada. */
export type ContaDaFolha = {
  id: string;
  valor: Centavos;
  status: SituacaoDaConta;
  /** `vencimento ?? data`, em `YYYY-MM-DD`. */
  vencimento: string;
  /** Competência que a recorrência gravou, quando o lançamento veio dela (ou foi vinculado). */
  recorrenciaCompetencia: string | null;
  /** O compromisso de origem é um adiantamento de salário: a folha nunca o usa. */
  adiantamento: boolean;
};

export type DecisaoDaFolha = {
  /** Conta em aberto que recebe o valor real. `null` = nenhuma (nasce uma, ou já está paga). */
  escolhida: ContaDaFolha | null;
  /** A conta da competência JÁ PAGA: nada nasce, e a diferença vira aviso. */
  jaPaga: ContaDaFolha | null;
  /** Candidatas que ficam como estão — viram aviso, nunca somem em silêncio. */
  outras: ContaDaFolha[];
};

export function competenciaDaFolha(f: { ano: number; mes: number }): string {
  return `${f.ano}-${String(f.mes).padStart(2, "0")}`;
}

export function folhaUsaContaDaCompetencia(tipo: TipoFolha): boolean {
  return tipo === "mensal";
}

/**
 * Qual conta recebe o valor da folha da competência `comp`.
 *
 * 1. Adiantamento nunca entra.
 * 2. Conta VINCULADA à competência e já paga → `jaPaga` (nada nasce; diferença vira aviso).
 * 3. Só conta `previsto` recebe o valor: `aguardando_aprovacao` passaria por cima da aprovação.
 * 4. A vinculada à competência ganha; se houver mais de uma, a de vencimento mais antigo (empate pelo
 *    id — a escolha não depende da ordem que o banco devolveu).
 * 5. Sem vínculo, uma candidata sozinha é usada; duas sem vínculo, nenhuma — não se adivinha.
 */
export function decidirContaDaFolha(contas: readonly ContaDaFolha[], comp: string): DecisaoDaFolha {
  const ordenadas = contas
    .filter((c) => !c.adiantamento)
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.id.localeCompare(b.id));
  const vinculadas = ordenadas.filter((c) => c.recorrenciaCompetencia === comp);

  const jaPaga = vinculadas.find((c) => c.status === "confirmado") ?? null;
  if (jaPaga) return { escolhida: null, jaPaga, outras: ordenadas.filter((c) => c.id !== jaPaga.id && c.status !== "confirmado") };

  const abertas = ordenadas.filter((c) => c.status === "previsto");
  const abertasVinculadas = abertas.filter((c) => c.recorrenciaCompetencia === comp);
  const escolhida = abertasVinculadas[0] ?? (abertasVinculadas.length === 0 && abertas.length === 1 ? abertas[0] : null);
  return { escolhida, jaPaga: null, outras: ordenadas.filter((c) => c.id !== escolhida?.id && c.status !== "confirmado") };
}

/**
 * Frase para quem fechou a folha: o que aconteceu com a conta a pagar, a diferença entre o previsto e o
 * real, e o que ficou em aberto. `null` quando nasceu a conta e não sobrou nada a dizer.
 */
export function avisoDoFechamento(d: DecisaoDaFolha, liquido: Centavos): string | null {
  const partes: string[] = [];
  if (d.jaPaga) {
    const dif = liquido - d.jaPaga.valor;
    partes.push(
      dif === 0
        ? `A folha desta competência já tinha sido paga (${formatarCentavos(d.jaPaga.valor)}), com o mesmo valor.`
        : `A folha desta competência já tinha sido paga (${formatarCentavos(d.jaPaga.valor)}); o líquido real é ${formatarCentavos(liquido)} — diferença de ${formatarCentavos(dif)} a acertar no Financeiro.`,
    );
  } else if (d.escolhida) {
    const dif = liquido - d.escolhida.valor;
    partes.push(
      dif === 0
        ? "A conta a pagar da competência já tinha o valor real."
        : `A conta a pagar da competência passou de ${formatarCentavos(d.escolhida.valor)} para ${formatarCentavos(liquido)} (diferença de ${formatarCentavos(dif)}).`,
    );
  }
  if (d.outras.length > 0) {
    partes.push(
      d.outras.length === 1
        ? "Ainda há outra conta a pagar de folha em aberto nesta competência: confira se não é a mesma folha lançada duas vezes."
        : `Ainda há ${d.outras.length} contas a pagar de folha em aberto nesta competência: confira se não são a mesma folha lançada mais de uma vez.`,
    );
  }
  return partes.length === 0 ? null : partes.join(" ");
}

/**
 * Pode reabrir a folha? Reabrir não mexe na conta a pagar (ela continua sendo a da competência, com o
 * último valor), MAS se ela já foi paga, reabrir para editar os holerites descasaria a folha do que saiu
 * do caixa. Devolve a frase da recusa, ou `null`.
 */
export function motivoParaNaoReabrir(conta: { status: string } | null): string | null {
  if (conta?.status === "confirmado") {
    return "A folha já foi paga no Financeiro: estorne o pagamento antes de reabrir.";
  }
  return null;
}
