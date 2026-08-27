import {
  encadear,
  normalizarUserAgent,
  type EventoAssinaturaEncadeado,
  type TipoEventoAssinatura,
} from "./cadeia";

/**
 * Anexa eventos à trilha de assinatura (spec `2026-08-26-gerenciador-contratos.md`, Fase D).
 *
 * NÃO importa `prisma` de propósito — recebe a transação por parâmetro, mesmo motivo de
 * `modules/licitacoes/alertas-dedup.ts`: o encadeamento é a parte que precisa de teste, e teste
 * não deve subir client de banco. O call-site real (`modules/juridico/actions.ts`) injeta o
 * `tx` do `prisma.$transaction`.
 */

/** Só o pedaço do Prisma que este módulo usa — o `tx` real satisfaz este formato. */
export type EventoAssinaturaTx = {
  eventoAssinatura: {
    findFirst(args: {
      where: { versaoId: string };
      orderBy: { sequencia: "desc" };
    }): Promise<EventoAssinaturaEncadeado | null>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
};

export type EntradaEvento = {
  versaoId: string;
  tipo: TipoEventoAssinatura;
  /** Quem: `userId` (interno) ou identificação do signatário externo (Fase F). */
  ator: string;
  atorNome: string;
  ip: string | null;
  userAgent: string | null;
  hashArquivo?: string | null;
  /** Injetável para teste; em produção é sempre o relógio do servidor. */
  ocorridoEm?: Date;
};

/**
 * Anexa UM evento no fim da cadeia daquela versão.
 *
 * Deve rodar dentro de uma transação junto com o fato que ele testemunha (o `AceiteDocumento`, por
 * exemplo): aceite gravado sem evento é assinatura sem trilha de prova, e evento sem aceite é
 * trilha que aponta para nada. Numa corrida, a unique `(versaoId, sequencia)` derruba o segundo
 * com P2002 — quem chama reexecuta a transação inteira via `comRetentativaDeConflito`.
 */
export async function registrarEventoAssinatura(
  tx: EventoAssinaturaTx,
  entrada: EntradaEvento,
): Promise<{ id: string; sequencia: number; hash: string }> {
  const ultimo = await tx.eventoAssinatura.findFirst({
    where: { versaoId: entrada.versaoId },
    orderBy: { sequencia: "desc" },
  });

  const evento = encadear(
    {
      sequencia: (ultimo?.sequencia ?? 0) + 1,
      tipo: entrada.tipo,
      ocorridoEm: entrada.ocorridoEm ?? new Date(),
      ator: entrada.ator,
      ip: entrada.ip,
      // Trunca ANTES de gravar, não só antes de hashear: se o banco guardasse o user-agent inteiro
      // e o hash usasse o cortado, a verificação acusaria adulteração num dado íntegro.
      userAgent: normalizarUserAgent(entrada.userAgent),
      hashArquivo: entrada.hashArquivo ?? null,
    },
    ultimo,
  );

  const criado = await tx.eventoAssinatura.create({
    data: { versaoId: entrada.versaoId, atorNome: entrada.atorNome, ...evento },
  });

  return { id: criado.id, sequencia: evento.sequencia, hash: evento.hash };
}

/** Conflito de unique do Postgres via Prisma. */
export function ehConflitoUnico(erro: unknown): boolean {
  return typeof erro === "object" && erro !== null && "code" in erro && erro.code === "P2002";
}

/**
 * Reexecuta a operação quando dois appends concorrentes disputam a mesma sequência.
 *
 * A transação inteira é refeita (não só o evento): o `findFirst` que calculou a sequência agora
 * enxerga o vencedor da corrida e o perdedor entra na posição seguinte.
 */
export async function comRetentativaDeConflito<T>(operacao: () => Promise<T>, tentativas = 3): Promise<T> {
  let ultimoErro: unknown;
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      return await operacao();
    } catch (erro) {
      if (!ehConflitoUnico(erro)) throw erro;
      ultimoErro = erro;
    }
  }
  throw ultimoErro;
}
