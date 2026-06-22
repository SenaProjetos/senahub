import "server-only";
import { prisma } from "@/lib/prisma";
import { DM_ROLES_EXCLUIDAS } from "@/modules/chat/roles";

export type ReacaoAgregada = {
  emoji: string;
  count: number;
  usuarios: { id: string; name: string }[];
};

/** Agrega reações brutas por emoji para exibição (contagem + nomes). */
export function agregarReacoes(
  reacoes: { emoji: string; userId: string; user: { name: string } }[],
): ReacaoAgregada[] {
  const map = new Map<string, { count: number; usuarios: { id: string; name: string }[] }>();
  for (const r of reacoes) {
    const existing = map.get(r.emoji) ?? { count: 0, usuarios: [] };
    existing.count++;
    existing.usuarios.push({ id: r.userId, name: r.user.name });
    map.set(r.emoji, existing);
  }
  return [...map.entries()].map(([emoji, v]) => ({ emoji, ...v }));
}

const SITUACOES_ARQUIVADAS = ["concluido", "arquivado", "cancelado"] as const;

/**
 * Não lidas por canal do usuário em UMA única consulta (elimina o N+1 — C4-1).
 * Conta mensagens de outros autores, não excluídas, posteriores ao `lastReadAt`
 * de cada membro. Canais sem mensagens novas vêm com 0 (LEFT JOIN).
 */
async function naoLidasPorCanal(userId: string): Promise<Map<string, number>> {
  const linhas = await prisma.$queryRaw<{ canalId: string; naoLidas: bigint }[]>`
    SELECT cm."canalId" AS "canalId", COUNT(m.id) AS "naoLidas"
    FROM "canal_membro" cm
    LEFT JOIN "mensagem" m
      ON m."canalId" = cm."canalId"
      AND m."autorId" <> cm."userId"
      AND m."excluidaEm" IS NULL
      AND (cm."lastReadAt" IS NULL OR m."createdAt" > cm."lastReadAt")
    WHERE cm."userId" = ${userId}
    GROUP BY cm."canalId"
  `;
  const map = new Map<string, number>();
  for (const l of linhas) map.set(l.canalId, Number(l.naoLidas));
  return map;
}

/** Canais do usuário com prévia da última mensagem e contagem de não lidas.
 *  Para `role` admin/supervisor, anexa os demais canais como observador (leitura). */
export async function listarCanais(userId: string, role?: string) {
  const [membros, contagem] = await Promise.all([
    prisma.canalMembro.findMany({
      where: { userId },
      include: {
        canal: {
          include: {
            mensagens: { orderBy: { createdAt: "desc" }, take: 1, include: { autor: { select: { name: true } } } },
            membros: {
              where: { userId: { not: userId } },
              include: { user: { select: { id: true, name: true, chatStatus: true } } },
            },
            projeto: { select: { codigo: true, situacao: true } },
            disciplina: {
              select: { projetoId: true, projeto: { select: { codigo: true, situacao: true } } },
            },
          },
        },
      },
    }),
    naoLidasPorCanal(userId),
  ]);

  // Batch-fetch dos membros de canais do tipo "grupo" (evita N+1) — C5-2.
  const grupoIds = membros.filter((m) => m.canal.tipo === "grupo").map((m) => m.canalId);
  const grupoMembrosMap = new Map<string, { id: string; name: string }[]>();
  if (grupoIds.length > 0) {
    const gm = await prisma.canalMembro.findMany({
      where: { canalId: { in: grupoIds } },
      select: { canalId: true, user: { select: { id: true, name: true } } },
    });
    for (const entry of gm) {
      const arr = grupoMembrosMap.get(entry.canalId) ?? [];
      arr.push({ id: entry.user.id, name: entry.user.name });
      grupoMembrosMap.set(entry.canalId, arr);
    }
  }

  const resultado = membros.map((m) => {
    const naoLidas = contagem.get(m.canalId) ?? 0;
    const ultima = m.canal.mensagens[0];
    const outro = m.canal.membros[0]?.user;
    const nome =
      m.canal.tipo === "dm" ? (outro?.name ?? "Conversa") : (m.canal.nome ?? m.canal.tipo);
    const projetoId = m.canal.projetoId ?? m.canal.disciplina?.projetoId ?? null;
    const projetoCodigo = m.canal.projeto?.codigo ?? m.canal.disciplina?.projeto?.codigo ?? null;
    const projetoSituacao =
      m.canal.projeto?.situacao ?? m.canal.disciplina?.projeto?.situacao ?? null;
    return {
      id: m.canal.id,
      tipo: m.canal.tipo,
      nome,
      icone: m.canal.icone ?? null,
      imagemCapa: m.canal.imagemCapa ?? null,
      criadoPorId: m.canal.criadoPorId ?? null,
      grupoMembros: m.canal.tipo === "grupo" ? (grupoMembrosMap.get(m.canalId) ?? []) : null,
      projetoId,
      projetoCodigo,
      projetoSituacao,
      disciplinaId: m.canal.disciplinaId,
      outroUserId: m.canal.tipo === "dm" ? (outro?.id ?? null) : null,
      outroUserStatus: m.canal.tipo === "dm" ? (outro?.chatStatus ?? null) : null,
      ultima: ultima
        ? { conteudo: ultima.conteudo, autor: ultima.autor.name, createdAt: ultima.createdAt }
        : null,
      naoLidas,
      silenciado: m.silenciado,
      observador: false as boolean,
    };
  });

  const ordenado = resultado.sort((a, b) => {
    const aArq = SITUACOES_ARQUIVADAS.includes(a.projetoSituacao as never);
    const bArq = SITUACOES_ARQUIVADAS.includes(b.projetoSituacao as never);
    if (aArq !== bArq) return aArq ? 1 : -1;
    if (a.naoLidas !== b.naoLidas) return b.naoLidas - a.naoLidas;
    const ta = a.ultima?.createdAt.getTime() ?? 0;
    const tb = b.ultima?.createdAt.getTime() ?? 0;
    return tb - ta;
  });

  // Admin/supervisor: anexa os canais de que NÃO participa (grupos + DMs + sócios)
  // como OBSERVADOR — acesso de moderação, somente leitura. naoLidas=0 (não entra no
  // badge). O envio segue barrado no servidor (exigirMembro em enviarMensagem).
  if (role !== "admin" && role !== "supervisor") return ordenado;

  const meusIds = new Set(membros.map((m) => m.canalId));
  const observaveis = await prisma.canal.findMany({
    where: { tipo: { in: ["grupo", "dm", "socios"] }, id: { notIn: [...meusIds] } },
    include: {
      mensagens: { orderBy: { createdAt: "desc" }, take: 1, include: { autor: { select: { name: true } } } },
      membros: { include: { user: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
  const observadorItens: typeof resultado = observaveis.map((c) => {
    const ultima = c.mensagens[0];
    const nome =
      c.tipo === "dm" ? c.membros.map((m) => m.user.name).join(" ↔ ") : (c.nome ?? c.tipo);
    return {
      id: c.id,
      tipo: c.tipo,
      nome,
      icone: c.icone ?? null,
      imagemCapa: c.imagemCapa ?? null,
      criadoPorId: c.criadoPorId ?? null,
      grupoMembros: c.tipo === "grupo" ? c.membros.map((m) => ({ id: m.user.id, name: m.user.name })) : null,
      projetoId: null,
      projetoCodigo: null,
      projetoSituacao: null,
      disciplinaId: null,
      outroUserId: null,
      outroUserStatus: null,
      ultima: ultima
        ? { conteudo: ultima.conteudo, autor: ultima.autor.name, createdAt: ultima.createdAt }
        : null,
      naoLidas: 0,
      silenciado: false,
      observador: true,
    };
  });
  return [...ordenado, ...observadorItens];
}

/**
 * Total de mensagens não lidas do usuário em todos os canais (para o badge global).
 * Uma única consulta agregada (C4-1) — roda em toda navegação do dashboard.
 */
export async function contarNaoLidasTotal(userId: string) {
  const contagem = await naoLidasPorCanal(userId);
  let soma = 0;
  for (const n of contagem.values()) soma += n;
  return soma;
}

/** Lista os canalIds que o usuário silenciou (para suprimir som/push). */
export async function listarCanaisSilenciados(userId: string): Promise<string[]> {
  const membros = await prisma.canalMembro.findMany({
    where: { userId, silenciado: true },
    select: { canalId: true },
  });
  return membros.map((m) => m.canalId);
}

/** Verifica se o usuário é membro do canal. */
export async function ehMembro(canalId: string, userId: string) {
  const m = await prisma.canalMembro.findUnique({
    where: { canalId_userId: { canalId, userId } },
  });
  return !!m;
}

/**
 * Página de mensagens do canal (mais recentes ao fim). Exige ser membro.
 * Paginação por cursor (C4-3): sem `antesDe`, devolve as últimas `limite`; com `antesDe`
 * (id da mensagem mais antiga já carregada), devolve as `limite` imediatamente anteriores.
 * `temMais` indica se há histórico ainda mais antigo. Recibos (`leituras`) são carregados
 * SÓ para as mensagens do próprio usuário — as únicas que exibem ✓✓ (C4-2, achado #32).
 */
export async function mensagensCanal(
  canalId: string,
  userId: string,
  opts: { limite?: number; antesDe?: string } = {},
  role?: string,
) {
  const ehGlobal = role === "admin" || role === "supervisor";
  if (!ehGlobal && !(await ehMembro(canalId, userId))) return null;
  const limite = opts.limite ?? 100;
  const msgs = await prisma.mensagem.findMany({
    where: { canalId },
    // Tiebreaker por id: createdAt pode empatar (mesmo ms) e a paginação por cursor exige
    // ordem total e estável para não pular/duplicar nas fronteiras de página (C4-3).
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limite + 1, // +1 sentinela: se vier a mais, existe página anterior
    ...(opts.antesDe ? { cursor: { id: opts.antesDe }, skip: 1 } : {}),
    include: {
      autor: { select: { id: true, name: true } },
      reacoes: { select: { emoji: true, userId: true, user: { select: { name: true } } } },
      respostaA: {
        select: {
          id: true,
          conteudo: true,
          excluidaEm: true,
          autor: { select: { name: true } },
        },
      },
    },
  });
  const temMais = msgs.length > limite;
  const pagina = temMais ? msgs.slice(0, limite) : msgs;
  const ordenadas = pagina.reverse();

  const idsProprias = ordenadas.filter((m) => m.autorId === userId).map((m) => m.id);
  const leiturasPorMsg = new Map<string, { userId: string; user: { name: string } }[]>();
  if (idsProprias.length > 0) {
    const leituras = await prisma.mensagemLeitura.findMany({
      where: { mensagemId: { in: idsProprias } },
      select: { mensagemId: true, userId: true, user: { select: { name: true } } },
    });
    for (const l of leituras) {
      const arr = leiturasPorMsg.get(l.mensagemId) ?? [];
      arr.push({ userId: l.userId, user: { name: l.user.name } });
      leiturasPorMsg.set(l.mensagemId, arr);
    }
  }

  const itens = ordenadas.map((m) => ({ ...m, leituras: leiturasPorMsg.get(m.id) ?? [] }));
  return { itens, temMais };
}

/** Mensagens fixadas do canal (não excluídas). */
export async function mensagensFixadas(canalId: string) {
  return prisma.mensagem.findMany({
    where: { canalId, fixada: true, excluidaEm: null },
    include: { autor: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

/** Membros do canal (para presença e menções). */
export async function membrosCanal(canalId: string) {
  const m = await prisma.canalMembro.findMany({
    where: { canalId },
    include: { user: { select: { id: true, name: true, role: true, chatStatus: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return m.map((x) => x.user);
}

/** Usuários para abrir DM (internos, exceto o próprio e clientes/freelancers). */
export async function usuariosParaDM(userId: string) {
  return prisma.user.findMany({
    where: { ativo: true, id: { not: userId }, role: { notIn: DM_ROLES_EXCLUIDAS as never } },
    select: { id: true, name: true, role: true, chatStatus: true },
    orderBy: { name: "asc" },
  });
}

/** Canal do tipo "projeto" associado a um projetoId (para link bidirecional). */
export async function canalDoProjeto(projetoId: string) {
  return prisma.canal.findFirst({
    where: { tipo: "projeto", projetoId },
    select: { id: true },
  });
}

/** Mapa disciplinaId → canalId para todos os canais de disciplina do projeto. */
export async function canaisDasDisciplinas(projetoId: string): Promise<Map<string, string>> {
  const canais = await prisma.canal.findMany({
    where: { tipo: "disciplina", projetoId, disciplinaId: { not: null } },
    select: { disciplinaId: true, id: true },
  });
  return new Map(canais.filter((c) => c.disciplinaId).map((c) => [c.disciplinaId!, c.id]));
}

export type CanalListItem = Awaited<ReturnType<typeof listarCanais>>[number];
export type MensagemItem = NonNullable<Awaited<ReturnType<typeof mensagensCanal>>>["itens"][number];
