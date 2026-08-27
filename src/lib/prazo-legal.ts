/**
 * Prazos legais de contratação — puro, mesmo tier de `lib/aquisitivo.ts` (férias) e
 * `lib/encargos.ts` (INSS/IRRF): regra de lei que precisa ser calculada, não digitada.
 *
 * Spec: `docs/superpowers/specs/2026-08-26-gerenciador-contratos.md`, Fase H1.
 *
 * ## Por que calcular em vez de guardar uma data
 *
 * O teto do estágio e o fim da experiência são DERIVADOS da data de início. Guardar a data-limite
 * à mão significa alguém somar dois anos de cabeça em cada admissão — e errar em silêncio, num
 * prazo cujo estouro tem consequência trabalhista real (estágio que passa de 2 anos com a mesma
 * parte concedente descaracteriza-se e vira vínculo empregatício, Lei 11.788/2008 art. 11).
 */

/** Adiciona meses preservando o fim de mês: 31/01 + 1 mês = 28/02, não 03/03. */
function somarMeses(base: Date, meses: number): Date {
  const ano = base.getUTCFullYear();
  const mes = base.getUTCMonth();
  const dia = base.getUTCDate();
  const alvo = new Date(Date.UTC(ano, mes + meses, 1));
  const ultimoDiaDoMesAlvo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth(), Math.min(dia, ultimoDiaDoMesAlvo)));
}

function somarDias(base: Date, dias: number): Date {
  return new Date(base.getTime() + dias * 86_400_000);
}

// ── Estágio (Lei 11.788/2008) ────────────────────────────────────────────────────────────────

/** Teto legal do estágio na mesma parte concedente: 24 meses (art. 11). */
export const MESES_TETO_ESTAGIO = 24;

export type TetoEstagio = {
  /** Último dia em que o estágio pode durar. */
  limite: Date;
  /** Estágio de pessoa com deficiência não tem o teto de 2 anos (art. 11, parágrafo único). */
  isento: boolean;
};

/**
 * Data-limite do estágio a partir do início.
 *
 * `pcd = true` isenta do teto — a lei excepciona expressamente o estagiário com deficiência.
 * Nesse caso `limite` é devolvido mesmo assim (para exibição), mas `isento` avisa que ele não
 * obriga; quem consome deve deixar de alertar.
 */
export function tetoEstagio(dataInicio: Date, opts: { pcd?: boolean } = {}): TetoEstagio {
  return {
    limite: somarMeses(dataInicio, MESES_TETO_ESTAGIO),
    isento: opts.pcd === true,
  };
}

// ── Contrato de experiência CLT (CLT art. 445, parágrafo único / art. 451) ────────────────────

/** Máximo legal do contrato de experiência: 90 dias, prorrogável UMA vez dentro desse total. */
export const DIAS_MAX_EXPERIENCIA = 90;

export type JanelaExperiencia = {
  /** Fim do primeiro período. */
  fimPrimeiroPeriodo: Date;
  /** Teto absoluto: 90 dias do início, mesmo com prorrogação. */
  limiteLegal: Date;
  /** Dias restantes até o teto, na data de referência. */
  diasRestantes: number;
  /** Passou dos 90 dias — a partir daqui o contrato vira por prazo indeterminado (art. 451). */
  excedido: boolean;
};

/**
 * Janela do contrato de experiência.
 *
 * `diasPrimeiroPeriodo` default 45 porque 45+45 é o desenho usual, mas a lei só fixa o TETO de 90
 * — 30+60 e 60+30 são igualmente válidos. Por isso o parâmetro existe em vez de ser constante.
 *
 * Prorrogar além dos 90 dias não é "quase legal": converte automaticamente o contrato em prazo
 * indeterminado (CLT art. 451). Daí `excedido` ser um fato a sinalizar, não um erro a esconder.
 */
export function janelaExperienciaClt(
  dataInicio: Date,
  hoje: Date = new Date(),
  diasPrimeiroPeriodo = 45,
): JanelaExperiencia {
  const limiteLegal = somarDias(dataInicio, DIAS_MAX_EXPERIENCIA);
  const fimPrimeiroPeriodo = somarDias(dataInicio, Math.min(diasPrimeiroPeriodo, DIAS_MAX_EXPERIENCIA));
  const diasRestantes = Math.round(
    (Date.UTC(limiteLegal.getUTCFullYear(), limiteLegal.getUTCMonth(), limiteLegal.getUTCDate())
      - Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate())) / 86_400_000,
  );
  return { fimPrimeiroPeriodo, limiteLegal, diasRestantes, excedido: diasRestantes < 0 };
}

// ── Aplicação ao vínculo ─────────────────────────────────────────────────────────────────────

export type PrazoLegal = {
  /** Rótulo pt-BR do que é este prazo. */
  rotulo: string;
  limite: Date;
  /** `false` quando a lei isenta (ex.: estagiário PCD) — não deve gerar alerta. */
  obriga: boolean;
};

/**
 * Prazo legal aplicável a um vínculo, ou `null` quando não há nenhum.
 *
 * Só estágio tem teto próprio. CLT por prazo indeterminado — o caso normal — não tem data-limite
 * nenhuma; a experiência é um contrato à parte, e o sistema não modela "estou em experiência",
 * então quem quiser essa janela chama `janelaExperienciaClt` direto com a data do contrato de
 * experiência. Devolver um prazo falso para todo CLT seria pior que não devolver nada.
 */
export function prazoLegalDoVinculo(
  contratacao: string,
  dataInicio: Date,
  opts: { pcd?: boolean } = {},
): PrazoLegal | null {
  if (contratacao === "estagiario") {
    const teto = tetoEstagio(dataInicio, opts);
    return {
      rotulo: `Teto legal do estágio (${MESES_TETO_ESTAGIO} meses)`,
      limite: teto.limite,
      obriga: !teto.isento,
    };
  }
  return null;
}
