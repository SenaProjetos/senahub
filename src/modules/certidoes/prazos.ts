/**
 * Prazos configuráveis das certidões — puro (sem I/O), usado pelo servidor, pela tela e pelo job.
 *
 * Dois números que respondem a perguntas diferentes, por isso ficam separados:
 *   - `diasEmBreve`: a partir de quantos dias antes da validade a certidão aparece como
 *     "Vence em breve" (tag da tela, badge do menu, card do Início, exportação, link público);
 *   - `diasAvisos`: em quais dias antes da validade sai a notificação (job `alertaCertidoes`).
 *
 * Mora em `ConfigSistema` (chave `certidoes.prazos`). A chave não é semeada: sem linha, vale o
 * padrão daqui — o mesmo comportamento que o sistema sempre teve (30 dias; avisos em 30/15/7).
 */

export const CHAVE_CONFIG_PRAZOS_CERTIDOES = "certidoes.prazos";

export type PrazosCertidoes = {
  diasEmBreve: number;
  /** Ordem decrescente, sem repetição. Vazio = nenhuma notificação de vencimento. */
  diasAvisos: number[];
};

/** Teto dos dois campos — um ano de antecedência já cobre qualquer certidão. */
export const DIAS_MAXIMO = 365;
/** Quantos dias de aviso cabem na lista (uma notificação por dia escolhido). */
export const MAX_AVISOS = 10;

export const PRAZOS_CERTIDOES_PADRAO: PrazosCertidoes = { diasEmBreve: 30, diasAvisos: [30, 15, 7] };

function clonarPadrao(): PrazosCertidoes {
  return { diasEmBreve: PRAZOS_CERTIDOES_PADRAO.diasEmBreve, diasAvisos: [...PRAZOS_CERTIDOES_PADRAO.diasAvisos] };
}

/** Inteiros entre 0 e `DIAS_MAXIMO`, sem repetição, do maior para o menor. */
export function normalizarDiasAvisos(dias: readonly unknown[]): number[] {
  const validos = dias.filter(
    (d): d is number => typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= DIAS_MAXIMO,
  );
  return [...new Set(validos)].sort((a, b) => b - a).slice(0, MAX_AVISOS);
}

/**
 * Lê o valor gravado em `ConfigSistema`. Nunca lança: campo ausente ou inválido cai no padrão
 * daquele campo (não do objeto inteiro), para um campo estragado não apagar o outro.
 */
export function parsePrazosCertidoes(valor: unknown): PrazosCertidoes {
  const padrao = clonarPadrao();
  if (valor === null || typeof valor !== "object" || Array.isArray(valor)) return padrao;
  const v = valor as Record<string, unknown>;

  const emBreve = v.diasEmBreve;
  const diasEmBreve =
    typeof emBreve === "number" && Number.isInteger(emBreve) && emBreve >= 1 && emBreve <= DIAS_MAXIMO
      ? emBreve
      : padrao.diasEmBreve;

  // Lista vazia é escolha válida (desligar os avisos); só um valor que não é lista cai no padrão.
  const diasAvisos = Array.isArray(v.diasAvisos) ? normalizarDiasAvisos(v.diasAvisos) : padrao.diasAvisos;

  return { diasEmBreve, diasAvisos };
}

/**
 * Avisos que chegam ANTES de a certidão virar "Vence em breve" na tela. Não é erro — a pessoa
 * pode querer ser avisada cedo —, mas a tela mostra, porque a notificação leva para uma lista
 * onde a certidão ainda aparece como regular.
 */
export function avisosAntesDaFaixa(p: PrazosCertidoes): number[] {
  return p.diasAvisos.filter((d) => d > p.diasEmBreve);
}

/** Título da notificação de vencimento. */
export function tituloAvisoCertidao(dias: number): string {
  if (dias === 0) return "Certidão vence hoje";
  if (dias === 1) return "Certidão vence amanhã";
  return `Certidão vence em ${dias} dias`;
}

