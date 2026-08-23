import type { EstagioNegociacao, StatusProposta } from "@/generated/prisma/client";
import { ActionError } from "@/lib/action-error";

/**
 * Regras da jornada de NEGOCIAÇÃO (F2.6, ADR-10/ADR-12). Puro: sem Prisma, sem I/O, sem relógio.
 * A tabela de probabilidade é **injetada**, nunca consultada aqui — é o que mantém o módulo
 * testável e ao mesmo tempo cumpre "nunca hardcode na UI" (ADR-12): o número vem do banco, mas
 * quem decide o que fazer com ele é esta função.
 *
 * O ponto desta tarefa, e a razão de ela vir ANTES da F2.7: hoje `atualizarOportunidade` troca o
 * estágio por `update` genérico, sem guarda nenhuma e sem rastro (ADR-10 registra isso como
 * conflito com o código atual). Com as regras isoladas aqui, a F2.7 consegue ter um ponto único
 * de escrita que recusa transição inválida ANTES de tocar o banco.
 */

/** Estágios do funil propriamente dito — a negociação está viva e andando. */
export const ESTAGIOS_ATIVOS: readonly EstagioNegociacao[] = [
  "LEVANTAMENTO",
  "ORCAMENTO",
  "PROPOSTA_ENVIADA",
  "NEGOCIACAO",
] as const;

/** Encerramentos sem contrato. Reabríveis (ADR-10). */
export const ESTAGIOS_ENCERRADOS: readonly EstagioNegociacao[] = ["PERDIDO", "CANCELADO"] as const;

const ehAtivo = (e: EstagioNegociacao) => (ESTAGIOS_ATIVOS as readonly string[]).includes(e);
const ehEncerrado = (e: EstagioNegociacao) => (ESTAGIOS_ENCERRADOS as readonly string[]).includes(e);

/**
 * `CONTRATADO` só é alcançável depois de ter havido proposta. Não é purismo: o aceite (F5.9) cria
 * um `Projeto` nessa transição, e deixar `LEVANTAMENTO → CONTRATADO` passar significaria projeto
 * nascendo sem nenhuma proposta por trás — exatamente o buraco que a reforma quer fechar.
 */
const PODEM_CONTRATAR: readonly EstagioNegociacao[] = ["PROPOSTA_ENVIADA", "NEGOCIACAO"] as const;

/**
 * A transição `de → para` é permitida?
 *
 * Regras, e o porquê de cada uma:
 * - **Mesmo estágio → false.** Não é transição; deixar passar faria a F2.7 gravar `Atividade` e
 *   `AuditLog` de um evento que não aconteceu.
 * - **Entre ativos, para frente E para trás.** Voltar é caso real (cliente pede revisão e a
 *   proposta enviada volta para orçamento). Bloquear empurraria o time a contornar por fora, que
 *   é o problema que este módulo existe para resolver.
 * - **Ativo → CONTRATADO** só a partir de `PROPOSTA_ENVIADA`/`NEGOCIACAO` (ver acima).
 * - **Ativo → PERDIDO/CANCELADO/EM_ESPERA:** sempre. Perde-se ou pausa-se em qualquer ponto.
 * - **EM_ESPERA → ativo:** retomar. Pausa é reversível por definição.
 * - **PERDIDO/CANCELADO → ativo:** reabrir, que é o ADR-10 ("vendas reais reabrem negociação
 *   depois de meses"). O ADR fala de "perdida"; `CANCELADO` recebe o mesmo tratamento porque a
 *   diferença entre os dois é o motivo, não a reversibilidade — negar só a um seria arbitrário.
 * - **CONTRATADO → nada.** Único terminal de verdade: ele criou um `Projeto` (F5.9). Desfazer
 *   isso não é mudança de estágio, é outra operação, com outras consequências.
 */
export function transicaoPermitida(
  de: EstagioNegociacao,
  para: EstagioNegociacao,
  opts: {
    /**
     * A transição vem do ACEITE de uma proposta (F5.9), não de um arrasto no board.
     *
     * Dispensa a exigência de vir de `PROPOSTA_ENVIADA`/`NEGOCIACAO` — e não é exceção
     * arbitrária: aquela regra existe porque `CONTRATADO` cria um `Projeto` e "deixar
     * LEVANTAMENTO → CONTRATADO passar significaria projeto nascendo sem nenhuma proposta por
     * trás". No aceite, a proposta É o gatilho: a premissa que a regra protege está satisfeita
     * por construção. Recusar aqui só obrigaria o time a arrastar o card antes de aceitar —
     * burocracia que empurra as pessoas para fora do sistema, que é o problema que este
     * módulo existe para resolver.
     *
     * O que continua valendo: não se aceita proposta de negociação PERDIDA, CANCELADA ou já
     * CONTRATADA. Essas três seguem recusadas, porque ali a inconsistência é real.
     */
    porAceiteDeProposta?: boolean;
  } = {},
): boolean {
  if (de === para) return false;
  if (de === "CONTRATADO") return false;

  if (para === "CONTRATADO") {
    if (opts.porAceiteDeProposta) return ehAtivo(de) || de === "EM_ESPERA";
    return (PODEM_CONTRATAR as readonly string[]).includes(de);
  }

  // Sair de um ativo: qualquer outro ativo, ou qualquer forma de encerrar/pausar.
  if (ehAtivo(de)) return ehAtivo(para) || ehEncerrado(para) || para === "EM_ESPERA";

  // Retomar (EM_ESPERA) ou reabrir (PERDIDO/CANCELADO): só de volta para o funil.
  if (de === "EM_ESPERA" || ehEncerrado(de)) return ehAtivo(para);

  return false;
}

/**
 * `PERDIDO` exige motivo do catálogo `MotivoPerda`. É o único que exige — sem motivo, o relatório
 * "por que perdemos" (Fase 6) nasce vazio e a Fase 5 não tem o que agrupar.
 *
 * `CANCELADO` **não** exige: cancelamento costuma ser decisão do cliente sem razão comercial
 * registrável ("adiou a obra"), e exigir preencheria o catálogo de "Outro" — pior que não ter.
 * O campo continua aceitando motivo quando houver.
 */
export function exigeMotivoPerda(estagio: EstagioNegociacao): boolean {
  return estagio === "PERDIDO";
}

/**
 * O nome do concorrente é exigido quando o motivo escolhido pede — a regra é DADO
 * (`MotivoPerda.exigeConcorrente`, hoje true só em "Perdemos para concorrente"), não constante de
 * código, para o catálogo poder crescer sem deploy.
 */
export function exigeConcorrente(motivo: { exigeConcorrente: boolean } | null | undefined): boolean {
  return motivo?.exigeConcorrente === true;
}

/** Mapa vindo de `ProbabilidadeEstagio` — passado de fora, nunca lido aqui. */
export type TabelaProbabilidade = Partial<Record<EstagioNegociacao, number>>;

/**
 * Probabilidade da negociação depois de ir para `estagio`.
 *
 * - **`override = true` congela o número** (ADR-12): assim que alguém digita a probabilidade à
 *   mão, nenhuma transição posterior a recalcula. É a diferença entre "o sistema estima" e "o
 *   vendedor sabe algo que o sistema não sabe", e a segunda ganha.
 * - `PERDIDO`/`CANCELADO` → **0**, sempre, mesmo com override: não existe negociação encerrada
 *   sem contrato com chance de fechar. É a única regra que passa por cima do override, e passa
 *   porque o contrário produziria forecast mentindo (Fase 6 soma probabilidade × valor).
 * - `EM_ESPERA` → mantém o valor atual: pausar não é perder. Zerar faria o forecast despencar e
 *   voltar sozinho quando retomasse, poluindo qualquer série histórica.
 * - Estágio sem linha na tabela → mantém o atual, **não inventa**. A tabela é seed (F1.6) e pode
 *   estar incompleta num banco novo; chutar um default aqui recriaria o "número mágico no código"
 *   que o ADR-12 rejeita.
 */
export function probabilidadeDe(
  estagio: EstagioNegociacao,
  opts: { tabela: TabelaProbabilidade; override: boolean; atual: number },
): number {
  if (estagio === "PERDIDO" || estagio === "CANCELADO") return 0;
  if (opts.override) return opts.atual;
  if (estagio === "EM_ESPERA") return opts.atual;
  return opts.tabela[estagio] ?? opts.atual;
}

/** Rótulos pt-BR dos estágios — usados nas mensagens de recusa e, depois, no board (F2.14). */
export const ESTAGIO_LABEL: Record<EstagioNegociacao, string> = {
  LEVANTAMENTO: "Levantamento",
  ORCAMENTO: "Orçamento",
  PROPOSTA_ENVIADA: "Proposta enviada",
  NEGOCIACAO: "Negociação",
  CONTRATADO: "Contratado",
  PERDIDO: "Perdido",
  EM_ESPERA: "Em espera",
  CANCELADO: "Cancelado",
};

/**
 * Valida um movimento inteiro e **lança `ActionError`** com mensagem de negócio na primeira
 * violação. Pura de propósito: é ela que a F2.7 chama depois de carregar a negociação, e é ela
 * que o teste exercita sem banco nenhum (mesmo padrão de `custos/orcamento/service.test.ts`).
 *
 * Separar isto de `transicaoPermitida` não é cerimônia: a primeira responde "pode?" e serve à UI
 * para desabilitar opções; esta responde "por que não" e serve ao servidor para recusar. Fundir
 * as duas obrigaria a UI a capturar exceção só para pintar um botão.
 */
export function validarMovimento(args: {
  de: EstagioNegociacao;
  para: EstagioNegociacao;
  motivoPerdaId?: string | null;
  concorrente?: string | null;
  /** A linha de `MotivoPerda` escolhida, quando houver — para checar `exigeConcorrente`. */
  motivo?: { exigeConcorrente: boolean } | null;
  /** F5.9 — ver `transicaoPermitida`. */
  porAceiteDeProposta?: boolean;
}): void {
  const { de, para, motivoPerdaId, concorrente, motivo, porAceiteDeProposta } = args;

  if (de === para) {
    throw new ActionError(`A negociação já está em "${ESTAGIO_LABEL[para]}".`);
  }
  if (!transicaoPermitida(de, para, { porAceiteDeProposta })) {
    throw new ActionError(
      porAceiteDeProposta
        ? `Não é possível aceitar a proposta: a negociação está em "${ESTAGIO_LABEL[de]}".`
        : `Não é possível mover de "${ESTAGIO_LABEL[de]}" para "${ESTAGIO_LABEL[para]}".`,
    );
  }
  if (exigeMotivoPerda(para) && !motivoPerdaId) {
    throw new ActionError("Informe o motivo da perda.");
  }
  if (exigeConcorrente(motivo) && !concorrente?.trim()) {
    throw new ActionError("Este motivo exige informar o concorrente.");
  }
}

/**
 * Perda estruturada do lado de `Proposta` (F5.10) — mesma regra de `validarMovimento`, mas para
 * `status = recusada`, que não é um `EstagioNegociacao` e por isso não passa pelas funções acima.
 * Reusa `exigeConcorrente` (já status-agnóstica, olha só o `motivo`) — o único pedaço novo é
 * "recusar exige motivo", análogo a `exigeMotivoPerda`.
 */
export function validarMotivoRecusaProposta(args: {
  status: StatusProposta;
  motivoPerdaId?: string | null;
  concorrente?: string | null;
  motivo?: { exigeConcorrente: boolean } | null;
}): void {
  if (args.status !== "recusada") return;
  if (!args.motivoPerdaId) {
    throw new ActionError("Informe o motivo da recusa.");
  }
  if (exigeConcorrente(args.motivo) && !args.concorrente?.trim()) {
    throw new ActionError("Este motivo exige informar o concorrente.");
  }
}

/**
 * F5.11 — em que estágio a negociação estava ANTES de ser encerrada (`PERDIDO`/`CANCELADO`)?
 *
 * Pura de propósito, e SEM coluna nova: o dado já existe na timeline. `aplicarMovimentoEstagio`
 * grava `ESTAGIO_ALTERADO` com `de`/`para` CRUS toda vez que o estágio muda — o `para === estagioEncerrado`
 * mais recente tem o `de` que se procura. Uma coluna `estagioAntesDeEncerrar` seria uma SEGUNDA
 * fonte de verdade pro mesmo fato que a timeline já registra — o erro que o `DisciplinaCatalogo`
 * já ensinou a não repetir.
 *
 * As atividades precisam vir **mais recente primeiro** (`orderBy: createdAt desc`) — depois de um
 * ciclo reabrir→perder de novo, existe mais de um `ESTAGIO_ALTERADO` apontando para o mesmo
 * `estagioEncerrado`, e é o ÚLTIMO que descreve a perda atual.
 *
 * `null` quando não há registro (negociação de antes da F3.2, ou sintética da migração F5.2,
 * `needsReview: true`) — quem chama decide o fallback (hoje, `LEVANTAMENTO`).
 */
export function estagioAnteriorAoEncerramento(
  atividadesRecentePrimeiro: readonly { metadata: unknown }[],
  estagioEncerrado: EstagioNegociacao,
): EstagioNegociacao | null {
  for (const a of atividadesRecentePrimeiro) {
    const m = a.metadata as { evento?: string; de?: EstagioNegociacao; para?: EstagioNegociacao } | null;
    if (m?.evento === "ESTAGIO_ALTERADO" && m.para === estagioEncerrado && m.de) {
      return m.de;
    }
  }
  return null;
}
