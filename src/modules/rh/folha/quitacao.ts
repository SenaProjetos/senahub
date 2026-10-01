/**
 * Quitação da folha CLT contra o que já estava previsto (F6D do planejador financeiro).
 *
 * O compromisso recorrente de folha (F6A) projeta a folha de cada mês e, perto do vencimento, gera
 * uma conta a pagar PREVISTA. Fechar a folha criava um lançamento NOVO, então o mês ficava com dois:
 * o previsto que ninguém baixou e o confirmado do fechamento — caixa descontado duas vezes na
 * projeção. Aqui o fechamento QUITA o previsto da competência: mesmo lançamento, valor real, status
 * confirmado. Puro, sem I/O — a mesma decisão vale no teste e no servidor.
 *
 * Só a folha `mensal` quita: a de 13º é outra despesa, com folha própria no mesmo mês (ano, mes,
 * tipo), e tomar o previsto da mensal esconderia uma das duas.
 */
import type { Centavos } from "@/modules/financeiro/liquidez/tipos";
import { formatarCentavos } from "@/modules/financeiro/liquidez/dinheiro";
import type { TipoFolha } from "@/modules/rh/folha/tipo-folha";

export type StatusPendente = "previsto" | "aguardando_aprovacao";

/** Conta a pagar em aberto na categoria da folha CLT, candidata a ser quitada. */
export type PendenteDaFolha = {
  id: string;
  valor: Centavos;
  status: StatusPendente;
  /** `vencimento ?? data` (I4), em `YYYY-MM-DD`. */
  vencimento: string;
  /** Competência que a recorrência gravou, quando o lançamento veio dela. */
  recorrenciaCompetencia: string | null;
};

export type Quitacao = {
  /** `null` = nada a quitar (ou mais de um candidato sem vínculo: não se adivinha qual). */
  escolhido: PendenteDaFolha | null;
  /** Candidatos que FICAM em aberto — viram aviso, nunca desaparecem em silêncio. */
  outros: PendenteDaFolha[];
};

export function competenciaDaFolha(f: { ano: number; mes: number }): string {
  return `${f.ano}-${String(f.mes).padStart(2, "0")}`;
}

export function folhaQuitaPrevisto(tipo: TipoFolha): boolean {
  return tipo === "mensal";
}

/**
 * Qual conta a pagar em aberto o fechamento quita.
 *
 * 1. Só `previsto` é candidato: quitar um `aguardando_aprovacao` pagaria sem a aprovação que o
 *    fluxo exige. Ele fica em aberto e entra no aviso.
 * 2. Lançamento gerado pela recorrência para esta competência — é o vínculo explícito, vence
 *    qualquer outro candidato (se houver mais de um, o de vencimento mais antigo; empate pelo id,
 *    para a escolha não depender da ordem que o banco devolveu).
 * 3. Sem vínculo: um único candidato do mês é quitado.
 * 4. Mais de um candidato sem vínculo: nenhum é quitado — o fechamento cria o lançamento dele e
 *    todos entram no aviso, para uma pessoa decidir. Adivinhar baixaria a conta errada.
 */
export function escolherPendenteDaFolha(
  pendentes: readonly PendenteDaFolha[],
  competencia: string,
): Quitacao {
  const ordenado = [...pendentes].sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.id.localeCompare(b.id));
  const candidatos = ordenado.filter((p) => p.status === "previsto");
  const daRecorrencia = candidatos.filter((p) => p.recorrenciaCompetencia === competencia);
  const escolhido = daRecorrencia[0] ?? (daRecorrencia.length === 0 && candidatos.length === 1 ? candidatos[0] : null);
  return { escolhido, outros: ordenado.filter((p) => p.id !== escolhido?.id) };
}

/**
 * Frase para quem fechou a folha: diz que o previsto foi quitado, a diferença do valor e o que
 * ficou em aberto. `null` quando não havia nada previsto (caminho normal do primeiro fechamento).
 */
export function avisoDaQuitacao(q: Quitacao, liquido: Centavos): string | null {
  const partes: string[] = [];
  if (q.escolhido) {
    const d = liquido - q.escolhido.valor;
    partes.push(
      d === 0
        ? "A conta a pagar prevista da competência foi quitada com o valor real."
        : `A conta a pagar prevista da competência foi quitada: ${formatarCentavos(q.escolhido.valor)} previsto, ${formatarCentavos(liquido)} real (diferença de ${formatarCentavos(d)}).`,
    );
  }
  if (q.outros.length > 0) {
    partes.push(
      q.outros.length === 1
        ? "Ainda há outra conta a pagar em aberto nesta competência: confira se não é a mesma folha lançada duas vezes."
        : `Ainda há ${q.outros.length} contas a pagar em aberto nesta competência: confira se não são a mesma folha lançada mais de uma vez.`,
    );
  }
  return partes.length === 0 ? null : partes.join(" ");
}

/**
 * O que reabrir a folha faz com o lançamento do fechamento. Reaproveitado = o lançamento existia
 * ANTES (previsto da recorrência ou lançado à mão), então reabrir volta ele ao previsto com o valor
 * que tinha; apagar levaria embora a conta a pagar de outra pessoa. Criado pelo fechamento, apaga.
 */
export function desfazerQuitacao(f: {
  lancamentoId: string | null;
  lancamentoReaproveitado: boolean;
  lancamentoValorPrevisto: Centavos | null;
}): { acao: "nada" } | { acao: "apagar"; id: string } | { acao: "reverter"; id: string; valor: Centavos | null } {
  if (!f.lancamentoId) return { acao: "nada" };
  if (!f.lancamentoReaproveitado) return { acao: "apagar", id: f.lancamentoId };
  return { acao: "reverter", id: f.lancamentoId, valor: f.lancamentoValorPrevisto };
}
