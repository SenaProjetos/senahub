import { createHash } from "node:crypto";

/**
 * Cadeia de evidência de assinatura eletrônica — motor puro (spec
 * `docs/superpowers/specs/2026-08-26-gerenciador-contratos.md`, Fase D).
 *
 * ## O que isto prova, e o que NÃO prova
 *
 * Cada evento carrega o hash do evento anterior. Alterar um registro do meio invalida o elo de
 * todos os seguintes, então `verificarCadeia()` aponta exatamente ONDE a trilha divergiu.
 *
 * Isso é **detecção de adulteração parcial**, não impossibilidade: quem tiver acesso de escrita ao
 * banco pode recalcular a cadeia inteira a partir de qualquer ponto. O que a cadeia entrega é (a)
 * pegar edição pontual — o caso realista de disputa — e (b) elevar o custo de forjar histórico de
 * "um UPDATE" para "reescrever tudo depois daquele ponto". Vender isso como prova infalsificável
 * seria exatamente a "falsa sensação de prova" que o §5 do spec lista como risco.
 *
 * O valor jurídico vem do CONJUNTO (MP 2.200-2/2001 art. 10 §2º): autenticação do signatário +
 * consentimento específico + hash do documento + esta trilha datada com IP/UA.
 *
 * ## Puro, mas server-side
 *
 * Sem Prisma, sem I/O, sem `server-only` — testável direto. Usa `node:crypto` (builtin), então não
 * vai para client component; o encadeamento é sempre server-side de qualquer forma.
 */

export type TipoEventoAssinatura = "visualizado" | "autenticado" | "assinado";

export type EventoAssinaturaBase = {
  /** Posição na cadeia, começando em 1. Ordena e detecta remoção de evento. */
  sequencia: number;
  tipo: TipoEventoAssinatura;
  ocorridoEm: Date;
  /**
   * Quem gerou o evento: `userId` (assinatura interna) ou identificação do signatário externo
   * (Fase F). Texto livre de propósito — os dois mundos não compartilham um id.
   */
  ator: string;
  ip: string | null;
  userAgent: string | null;
  /** Hash SHA-256 do arquivo assinado. Só faz sentido no evento `assinado`. */
  hashArquivo: string | null;
};

export type EventoAssinaturaEncadeado = EventoAssinaturaBase & {
  hashAnterior: string;
  hash: string;
};

/** `hashAnterior` do primeiro evento — não existe elo antes dele. */
export const HASH_GENESE = "0".repeat(64);

/**
 * Teto do user-agent gravado e hasheado. Mesmo limite de
 * `app/api/p/aceite/[token]/route.ts` — aplicar ANTES de hashear, senão o valor guardado e o valor
 * que entrou no hash divergem e a verificação acusa adulteração num dado que ninguém tocou.
 */
export const LIMITE_USER_AGENT = 500;

export function normalizarUserAgent(ua: string | null): string | null {
  if (ua === null) return null;
  return ua.slice(0, LIMITE_USER_AGENT);
}

/**
 * Serialização canônica com PREFIXO DE TAMANHO, nunca delimitador.
 *
 * `a|b` com separador deixaria um user-agent contendo `|` forjar outro evento com o mesmo hash — e
 * user-agent é controlado por quem assina, justamente no caminho externo (Fase F) onde a prova
 * precisa valer. Com `3:abc` o tamanho manda, e nenhum conteúdo consegue simular a fronteira.
 *
 * `null` vira `~`, que a outra ramificação nunca produz (ela sempre tem `:`) — nulo e string vazia
 * são fatos diferentes e não podem colidir.
 */
function campo(valor: string | null): string {
  if (valor === null) return "~";
  return `${valor.length}:${valor}`;
}

/** Hash de um evento, já amarrado ao anterior. Determinístico: mesma entrada, mesmo hash. */
export function hashEvento(evento: EventoAssinaturaBase, hashAnterior: string): string {
  // Array com ORDEM FIXA, nunca objeto — ordem de chave de objeto não é garantida entre engines,
  // e o hash tem que ser reproduzível daqui a anos para valer como prova.
  const payload = [
    campo(String(evento.sequencia)),
    campo(evento.tipo),
    campo(evento.ocorridoEm.toISOString()),
    campo(evento.ator),
    campo(evento.ip),
    campo(normalizarUserAgent(evento.userAgent)),
    campo(evento.hashArquivo),
    campo(hashAnterior),
  ].join("");
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

/** Encadeia um evento novo no fim de uma cadeia existente (vazia = evento gênese). */
export function encadear(
  evento: EventoAssinaturaBase,
  ultimo: EventoAssinaturaEncadeado | null,
): EventoAssinaturaEncadeado {
  const hashAnterior = ultimo ? ultimo.hash : HASH_GENESE;
  return { ...evento, hashAnterior, hash: hashEvento(evento, hashAnterior) };
}

export type MotivoQuebra =
  /** Recalcular o hash do evento deu outro valor — algum campo dele foi alterado. */
  | "hash_invalido"
  /** `hashAnterior` não bate com o hash do evento anterior — elo rompido ou evento reordenado. */
  | "elo_quebrado"
  /** Buraco na numeração — evento removido do meio da cadeia. */
  | "sequencia_faltando"
  /** Mesma sequência duas vezes — cadeia bifurcada (corrida sem a unique do banco). */
  | "sequencia_duplicada";

export type ResultadoVerificacao =
  | { integra: true }
  | { integra: false; sequencia: number; motivo: MotivoQuebra };

/**
 * Percorre a cadeia e diz se ela é íntegra — e, se não for, EM QUAL evento quebrou.
 *
 * Verifica as quatro coisas que podem dar errado, porque nenhuma delas sozinha pega tudo: o hash
 * recalculado (conteúdo alterado), o elo com o anterior (reordenação), e a continuidade da
 * numeração — sem esta última, apagar o último evento passaria batido, já que os que sobraram
 * continuam encadeados entre si.
 */
export function verificarCadeia(eventos: EventoAssinaturaEncadeado[]): ResultadoVerificacao {
  if (eventos.length === 0) return { integra: true }; // nada assinado ainda — não há o que quebrar

  const ordenados = [...eventos].sort((a, b) => a.sequencia - b.sequencia);
  let anterior: EventoAssinaturaEncadeado | null = null;

  for (const [indice, evento] of ordenados.entries()) {
    const esperada = indice + 1;
    if (anterior && evento.sequencia === anterior.sequencia) {
      return { integra: false, sequencia: evento.sequencia, motivo: "sequencia_duplicada" };
    }
    if (evento.sequencia !== esperada) {
      return { integra: false, sequencia: esperada, motivo: "sequencia_faltando" };
    }

    const hashAnteriorEsperado = anterior ? anterior.hash : HASH_GENESE;
    if (evento.hashAnterior !== hashAnteriorEsperado) {
      return { integra: false, sequencia: evento.sequencia, motivo: "elo_quebrado" };
    }
    if (evento.hash !== hashEvento(evento, evento.hashAnterior)) {
      return { integra: false, sequencia: evento.sequencia, motivo: "hash_invalido" };
    }

    anterior = evento;
  }

  return { integra: true };
}
