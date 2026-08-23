/**
 * Score de prospecção/negociação (F6.10) — heurística **pura, transparente e testada**.
 *
 * ── O que este arquivo NÃO é, e por decisão explícita do dono ───────────────────────────────
 * Não é machine learning, não é previsão, não é decisão automática. O veredito registrado no
 * roadmap (#16) rejeitou ML para lead scoring, e a razão continua valendo: com o volume de
 * negócios de um escritório de engenharia, um modelo aprenderia ruído e devolveria um número
 * impossível de contestar. Aqui, cada ponto tem um motivo escrito que o vendedor pode ler,
 * discordar e ignorar.
 *
 * **Consequências práticas dessa escolha, que o resto do sistema deve respeitar:**
 * 1. O score é exibido como **faixa** (fria/morna/quente), nunca como número seco de precisão
 *    falsa — "73 pontos" sugere uma exatidão que uma soma de heurísticas não tem.
 * 2. A tela mostra **quais regras pontuaram**. É o que separa "o sistema acha" de "o sistema
 *    ordena": sem o detalhamento, o número vira autoridade sem argumento.
 * 3. Nada no sistema **age** sozinho por causa do score. Ele ordena uma lista; quem decide é
 *    quem vende.
 *
 * Puro: sem Prisma, sem relógio (a data de referência entra por parâmetro), sem I/O — mesmo tier
 * de `caminho-critico.ts`, `health.ts` e `encargos.ts`.
 */

import { diasAteVencer } from "@/modules/comercial/validade";

// ── Entrada ──────────────────────────────────────────────────────────────────────────────────

/**
 * Os sinais que o score observa. Todos são **fatos registrados**, nunca inferências: se o dado
 * não existe, a regra simplesmente não pontua — não há imputação nem valor "provável".
 */
export type SinaisDoNegocio = {
  /** Temperatura marcada À MÃO por quem vende. O único sinal que já é um julgamento humano. */
  temperatura: "FRIO" | "MORNO" | "QUENTE" | null;
  /** Valor estimado/proposto, quando houver. `null` = ninguém dimensionou ainda. */
  valor: number | null;
  /** Última interação registrada. `null` = nenhuma desde que nasceu. */
  ultimaInteracaoEm: Date | null;
  /** Quantas interações no total — mede engajamento, não recência. */
  totalInteracoes: number;
  /** Existe próxima ação agendada e não concluída? Negócio com plano anda mais. */
  temProximaAcao: boolean;
  /** Algum contato vinculado tem papel de decisão registrado (F1.9). */
  temContatoDecisor: boolean;
  /** A empresa já fechou contrato antes — quem já comprou compra de novo. */
  clienteRecorrente: boolean;
  /** Veio de indicação/parceiro — o canal com melhor conversão histórica no setor. */
  veioDeIndicacao: boolean;
  /** Já existe proposta enviada neste negócio. */
  temPropostaEnviada: boolean;
};

/** Limiares do score. Configuráveis pelo mesmo motivo dos limiares das regras (F7.2). */
export type ParametrosScore = {
  /** Dias de silêncio a partir dos quais o negócio perde o ponto de recência. */
  diasParaEsfriar: number;
  /** Valor a partir do qual o negócio conta como "relevante" para a carteira. */
  valorRelevante: number;
  /** Nº de interações a partir do qual há engajamento real, não só um contato solto. */
  interacoesParaEngajamento: number;
};

export const PARAMETROS_SCORE_PADRAO: ParametrosScore = {
  diasParaEsfriar: 21,
  valorRelevante: 50000,
  interacoesParaEngajamento: 3,
};

// ── As regras ────────────────────────────────────────────────────────────────────────────────

export type RegraScore = {
  /** Chave estável — se virar filtro salvo ou coluna exportada, renomear quebra histórico. */
  chave: string;
  /** Texto que aparece NA TELA explicando por que pontuou. É o item 2 do docblock. */
  rotulo: string;
  /** Peso. Positivo soma, negativo subtrai — sim, há sinal que tira ponto. */
  pontos: number;
  aplica(s: SinaisDoNegocio, p: ParametrosScore, hoje: Date): boolean;
};

/**
 * Os pesos são **julgamento comercial declarado**, não resultado de otimização. Estão aqui em
 * ordem decrescente de peso justamente para poderem ser discutidos e ajustados por quem entende
 * do negócio — que é a única forma de calibração que esta abordagem admite.
 *
 * A soma dos positivos é 100 de propósito: torna o total legível como "de 100" sem que ninguém
 * precise normalizar nada, e faz a faixa (§`faixaDoScore`) ter fronteiras redondas.
 */
export const REGRAS_SCORE: readonly RegraScore[] = [
  {
    chave: "temperatura_quente",
    rotulo: "Marcada como quente por quem vende",
    pontos: 25,
    aplica: (s) => s.temperatura === "QUENTE",
  },
  {
    chave: "proposta_enviada",
    rotulo: "Já tem proposta enviada",
    pontos: 20,
    aplica: (s) => s.temPropostaEnviada,
  },
  {
    chave: "cliente_recorrente",
    rotulo: "Empresa já é cliente da casa",
    pontos: 15,
    aplica: (s) => s.clienteRecorrente,
  },
  {
    chave: "contato_decisor",
    rotulo: "Tem contato com poder de decisão",
    pontos: 12,
    aplica: (s) => s.temContatoDecisor,
  },
  {
    chave: "valor_relevante",
    rotulo: "Valor acima do relevante para a carteira",
    pontos: 10,
    aplica: (s, p) => s.valor != null && s.valor >= p.valorRelevante,
  },
  {
    chave: "proxima_acao_agendada",
    rotulo: "Tem próxima ação agendada",
    pontos: 8,
    aplica: (s) => s.temProximaAcao,
  },
  {
    chave: "engajamento",
    rotulo: "Várias interações registradas",
    pontos: 6,
    aplica: (s, p) => s.totalInteracoes >= p.interacoesParaEngajamento,
  },
  {
    chave: "veio_de_indicacao",
    rotulo: "Chegou por indicação",
    pontos: 4,
    aplica: (s) => s.veioDeIndicacao,
  },
  {
    // O único negativo. Um negócio pode ter todos os sinais bons e estar morrendo de silêncio —
    // e é exatamente esse caso que o score precisa conseguir mostrar, senão vira só um retrato
    // do entusiasmo de quem cadastrou.
    chave: "silencio_prolongado",
    rotulo: "Sem interação há muito tempo",
    pontos: -20,
    aplica: (s, p, hoje) => {
      const marco = s.ultimaInteracaoEm;
      if (marco == null) return s.totalInteracoes === 0;
      const diasParados = -(diasAteVencer(marco, hoje) ?? 0);
      return diasParados >= p.diasParaEsfriar;
    },
  },
  {
    chave: "temperatura_fria",
    rotulo: "Marcada como fria por quem vende",
    pontos: -15,
    aplica: (s) => s.temperatura === "FRIO",
  },
] as const;

// ── Resultado ────────────────────────────────────────────────────────────────────────────────

export type FaixaScore = "frio" | "morno" | "quente";

export type Score = {
  /**
   * A soma, 0–100 (nunca negativa: um negócio ruim é "frio", não "−35", que não significa nada
   * para quem lê). Exposta para ordenar listas — **não** para ser exibida como precisão.
   */
  total: number;
  /** O que a tela mostra. */
  faixa: FaixaScore;
  /** Exatamente quais regras pontuaram, com rótulo e peso. É o item 2 do docblock do arquivo. */
  detalhes: { chave: string; rotulo: string; pontos: number }[];
};

/**
 * A faixa a partir do total. Fronteiras redondas porque a soma dos positivos é 100 (§`REGRAS_SCORE`).
 *
 * Três faixas, não cinco nem dez: a precisão que a heurística tem não sustenta mais granularidade,
 * e oferecer mais faixas sugeriria uma exatidão inexistente.
 */
export function faixaDoScore(total: number): FaixaScore {
  if (total >= 60) return "quente";
  if (total >= 30) return "morno";
  return "frio";
}

export const FAIXA_LABEL: Record<FaixaScore, string> = {
  frio: "Frio",
  morno: "Morno",
  quente: "Quente",
};

/**
 * Calcula o score de um negócio.
 *
 * Devolve **sempre** os detalhes junto do número. Não existe caminho neste módulo que produza um
 * score sem o "porquê" — foi feito assim de propósito: se a tela pudesse pedir só o número, uma
 * hora alguém pediria só o número, e o score viraria a autoridade sem argumento que o veredito
 * contra ML quis evitar.
 */
export function calcularScore(
  sinais: SinaisDoNegocio,
  hoje: Date,
  parametros: ParametrosScore = PARAMETROS_SCORE_PADRAO,
): Score {
  const detalhes: Score["detalhes"] = [];
  let bruto = 0;

  for (const regra of REGRAS_SCORE) {
    if (!regra.aplica(sinais, parametros, hoje)) continue;
    bruto += regra.pontos;
    detalhes.push({ chave: regra.chave, rotulo: regra.rotulo, pontos: regra.pontos });
  }

  // Trava em 0–100. Negativo não é informação para quem lê a lista: "−35" e "2" levam à mesma
  // ação (deixar para depois), e mostrar número negativo só gera pergunta sobre a escala.
  const total = Math.max(0, Math.min(100, bruto));

  return { total, faixa: faixaDoScore(total), detalhes };
}
