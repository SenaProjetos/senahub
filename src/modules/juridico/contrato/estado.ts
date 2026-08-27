/**
 * Predicados de estado contratual — módulo PURO (spec
 * `docs/superpowers/specs/2026-08-26-gerenciador-contratos.md`, Fase B2).
 *
 * ## Por que existe
 *
 * A pergunta "isto é um contrato vivo?" estava sendo respondida em QUATRO lugares com regras
 * diferentes, e elas discordavam sobre aditivo:
 *
 * | Ponto                       | Regra antiga           | Aditivo…              |
 * |-----------------------------|------------------------|-----------------------|
 * | `criarDocJuridico`          | `tipo === "contrato"`  | nascia sem status     |
 * | Badge do projeto (Fase I)   | `tipo: "contrato"`     | não acendia           |
 * | Alerta de vencimento        | só `vinculoId != null` | **disparava**         |
 * | Flip no `registrarAceite`   | `tipo === "contrato"`  | não mudava status     |
 *
 * Resultado: um aditivo de equipe com vencimento **alertava mas não aparecia como pendente**.
 * Consolidar aqui é o que faz os quatro concordarem por construção.
 */

/** Tipos de `DocumentoJuridico` que participam do ciclo de vida contratual. */
export const TIPOS_CONTRATUAIS = ["contrato", "aditivo"] as const;
export type TipoContratual = (typeof TIPOS_CONTRATUAIS)[number];

export type StatusContratual = "rascunho" | "aguardando_assinatura" | "assinado" | "vencido" | "rescindido";

/**
 * O documento entra no ciclo contratual (nasce com status, conta no badge, é alertado)?
 *
 * Aditivo entra: é assinado, vence e obriga tanto quanto o contrato que ele altera. Procuração,
 * proposta e "outro" ficam de fora — são arquivo, não compromisso com prazo.
 */
export function ehDocumentoContratual(tipo: string): tipo is TipoContratual {
  return (TIPOS_CONTRATUAIS as readonly string[]).includes(tipo);
}

/**
 * Estados em que o documento ainda espera assinatura — é o que o badge sinaliza.
 *
 * Allowlist explícito, nunca "tudo que não é assinado": documento anterior a esta feature tem
 * `statusContrato` nulo e não pode acender alarme retroativo.
 */
export const STATUS_PENDENTES = ["rascunho", "aguardando_assinatura"] as const;

export function pendenteDeAssinatura(status: StatusContratual | null): boolean {
  return status !== null && (STATUS_PENDENTES as readonly string[]).includes(status);
}

/**
 * Assinar move para `assinado` — mas só a partir de um estado PRÉ-assinatura.
 *
 * Não reabre `rescindido` nem `vencido`: assinar uma versão antiga de um contrato já encerrado não
 * pode ressuscitá-lo. É também o gatilho do efeito no RH (Fase B2): a alteração contratual de um
 * aditivo se aplica na TRANSIÇÃO, não a cada aceite — senão dois signatários no mesmo aditivo
 * aplicariam o efeito duas vezes.
 */
export function devePassarParaAssinado(tipo: string, status: StatusContratual | null): boolean {
  return ehDocumentoContratual(tipo) && pendenteDeAssinatura(status);
}

export type DecisaoPrazoProjeto =
  | { define: true }
  | { define: false; motivo: "sem_prazo_no_contrato" | "projeto_ja_tem_prazo" | "disciplina_ultrapassa" };

/**
 * O prazo do contrato pode virar `Projeto.prazoFinal`? (Fase H3)
 *
 * Duas guardas, e nenhuma é excesso de zelo:
 *
 * 1. **Nunca sobrescreve prazo existente.** `Projeto.prazoFinal` é editável à mão em
 *    `projetos/actions.ts`; se alguém já definiu, essa pessoa sabe algo que o contrato não diz.
 *    Propagar por cima apagaria a decisão dela em silêncio.
 * 2. **Não define prazo ANTES de disciplina já agendada.** O mesmo `projetos/actions.ts` recusa
 *    prazo de disciplina que ultrapasse o do projeto. Escrever o prazo do contrato por aqui
 *    poderia criar exatamente o estado que aquela validação existe para impedir — inconsistente,
 *    e produzido por um caminho que não passa pela validação.
 */
export function decidirPrazoDoProjeto(
  prazoContrato: Date | null,
  prazoAtualDoProjeto: Date | null,
  prazosDasDisciplinas: (Date | null)[],
): DecisaoPrazoProjeto {
  if (!prazoContrato) return { define: false, motivo: "sem_prazo_no_contrato" };
  if (prazoAtualDoProjeto) return { define: false, motivo: "projeto_ja_tem_prazo" };
  const ultrapassa = prazosDasDisciplinas.some((p) => p !== null && p.getTime() > prazoContrato.getTime());
  if (ultrapassa) return { define: false, motivo: "disciplina_ultrapassa" };
  return { define: true };
}

export type PrazoAditivo = { vigenciaNova: Date | null; assinadoEm: Date | null };

/**
 * Vencimento que de fato vale: o do aditivo assinado mais recente que prorrogou prazo, ou o do
 * próprio contrato quando nenhum prorrogou.
 *
 * Mesmo problema e mesmo formato de `vigenciaEfetivaContrato` em `modules/licitacoes/alertas.ts` —
 * lá para contrato de licitação, aqui para contrato de equipe/cliente. Sem isto o alerta cobraria
 * o vencimento original de um contrato já prorrogado, que é ruído puro: a data que interessa é a
 * que está valendo.
 *
 * Aditivo NÃO assinado não conta — prorrogação só vale depois de assinada.
 */
export function vencimentoEfetivo(vencimentoBase: Date | null, aditivos: PrazoAditivo[]): Date | null {
  const prorrogacoes = aditivos
    .filter((a) => a.vigenciaNova !== null && a.assinadoEm !== null)
    .sort((a, b) => b.assinadoEm!.getTime() - a.assinadoEm!.getTime());
  return prorrogacoes[0]?.vigenciaNova ?? vencimentoBase;
}
