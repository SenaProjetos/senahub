import "server-only";
import { prisma } from "@/lib/prisma";
import { CHAT_ROLES, ROLES_GLOBAIS_CHAT } from "@/modules/chat/roles";

/** Par (canal, usuário) de um vínculo de membro recém-criado — para join ao vivo no socket. */
export type NovoMembroCanal = { canalId: string; userId: string };

/**
 * Garante que `userIds` sejam membros do canal (append-only — nunca remove).
 * Retorna os userIds que **acabaram** de ser inseridos, para o chamador
 * notificar o socket de cada um (C3-2).
 */
async function syncMembros(canalId: string, userIds: string[]): Promise<string[]> {
  const unicos = [...new Set(userIds)];
  const atuais = await prisma.canalMembro.findMany({
    where: { canalId },
    select: { userId: true },
  });
  const setAtual = new Set(atuais.map((m) => m.userId));
  const novos = unicos.filter((id) => !setAtual.has(id));
  if (novos.length > 0) {
    await prisma.canalMembro.createMany({
      data: novos.map((userId) => ({ canalId, userId })),
      skipDuplicates: true,
    });
  }
  return novos;
}

/**
 * Resultado de uma sincronização de membros que precisa refletir ao vivo:
 * quem entrou (para `entrar-canal-novo`) e quem saiu (para `sair-canal`).
 */
export type SincroniaCanal = {
  canalId: string;
  adicionados: NovoMembroCanal[];
  removidos: NovoMembroCanal[];
};

/**
 * Garante o canal de sistema "Sócios" (tipo `socios`, singleton) e RECONCILIA
 * seus membros com os sócios ativos: adiciona novos sócios e remove quem deixou
 * de ser sócio. Retorna as diferenças para o chamador emitir os eventos de
 * socket (entrar/sair) ao vivo. Diferente do `#geral`, aqui a saída importa.
 */
export async function ensureCanalSocios(): Promise<SincroniaCanal> {
  let canal = await prisma.canal.findFirst({ where: { tipo: "socios" } });
  if (!canal) {
    canal = await prisma.canal.create({ data: { tipo: "socios", nome: "Sócios" } });
  }
  const socios = await prisma.socio.findMany({
    where: { ativo: true },
    select: { userId: true },
  });
  const desejados = new Set(socios.map((s) => s.userId));
  const atuais = await prisma.canalMembro.findMany({
    where: { canalId: canal.id },
    select: { userId: true },
  });
  const setAtual = new Set(atuais.map((m) => m.userId));

  const aAdicionar = [...desejados].filter((id) => !setAtual.has(id));
  const aRemover = [...setAtual].filter((id) => !desejados.has(id));

  if (aAdicionar.length > 0) {
    await prisma.canalMembro.createMany({
      data: aAdicionar.map((userId) => ({ canalId: canal!.id, userId })),
      skipDuplicates: true,
    });
  }
  if (aRemover.length > 0) {
    await prisma.canalMembro.deleteMany({
      where: { canalId: canal.id, userId: { in: aRemover } },
    });
  }
  return {
    canalId: canal.id,
    adicionados: aAdicionar.map((userId) => ({ canalId: canal!.id, userId })),
    removidos: aRemover.map((userId) => ({ canalId: canal!.id, userId })),
  };
}

/** Garante o canal #geral com todos os perfis internos elegíveis. */
export async function ensureCanalGeral() {
  let canal = await prisma.canal.findFirst({ where: { tipo: "geral" } });
  if (!canal) {
    canal = await prisma.canal.create({ data: { tipo: "geral", nome: "#geral" } });
  }
  const internos = await prisma.user.findMany({
    where: { ativo: true, role: { in: CHAT_ROLES as never } },
    select: { id: true },
  });
  await syncMembros(canal.id, internos.map((u) => u.id));
  return canal;
}

/**
 * Garante o canal do projeto + um canal por disciplina, sincronizando membros:
 * membros do projeto + responsáveis das disciplinas + perfis globais.
 * Retorna as membresias recém-criadas (canal, usuário) para o chamador
 * emitir `entrar-canal-novo` no socket de cada um (C3-2).
 */
export async function ensureCanaisProjeto(projetoId: string): Promise<NovoMembroCanal[]> {
  const projeto = await prisma.projeto.findUnique({
    where: { id: projetoId },
    include: {
      membros: { select: { userId: true } },
      disciplinas: { include: { responsaveis: { select: { userId: true } } } },
    },
  });
  if (!projeto) return [];

  const globais = (
    await prisma.user.findMany({ where: { role: { in: ROLES_GLOBAIS_CHAT as never }, ativo: true }, select: { id: true } })
  ).map((u) => u.id);

  const adicionados: NovoMembroCanal[] = [];

  // Canal do projeto
  let canalProjeto = await prisma.canal.findFirst({ where: { tipo: "projeto", projetoId } });
  if (!canalProjeto) {
    canalProjeto = await prisma.canal.create({
      data: { tipo: "projeto", projetoId, nome: projeto.nome },
    });
  }
  const todosResp = projeto.disciplinas.flatMap((d) => d.responsaveis.map((r) => r.userId));
  const novosProjeto = await syncMembros(canalProjeto.id, [
    ...projeto.membros.map((m) => m.userId),
    ...todosResp,
    ...globais,
  ]);
  for (const userId of novosProjeto) adicionados.push({ canalId: canalProjeto.id, userId });

  // Canal por disciplina
  for (const d of projeto.disciplinas) {
    let canalDisc = await prisma.canal.findFirst({ where: { tipo: "disciplina", disciplinaId: d.id } });
    if (!canalDisc) {
      canalDisc = await prisma.canal.create({
        data: { tipo: "disciplina", disciplinaId: d.id, projetoId, nome: d.nome },
      });
    }
    const novosDisc = await syncMembros(canalDisc.id, [...d.responsaveis.map((r) => r.userId), ...globais]);
    for (const userId of novosDisc) adicionados.push({ canalId: canalDisc.id, userId });
  }

  return adicionados;
}

/** Acha ou cria um canal DM entre dois usuários. */
export async function getOrCreateDM(userA: string, userB: string) {
  const existentes = await prisma.canal.findMany({
    where: { tipo: "dm", membros: { some: { userId: userA } } },
    include: { membros: { select: { userId: true } } },
  });
  const achado = existentes.find(
    (c) => c.membros.length === 2 && c.membros.some((m) => m.userId === userB),
  );
  if (achado) return achado;

  return prisma.canal.create({
    data: {
      tipo: "dm",
      membros: { create: [{ userId: userA }, { userId: userB }] },
    },
    include: { membros: { select: { userId: true } } },
  });
}

/** Sincroniza todos os canais relevantes ao usuário (lazy, idempotente). */
export async function sincronizarCanaisDoUsuario() {
  await ensureCanalGeral();
  await ensureCanalSocios();
  const projetos = await prisma.projeto.findMany({ select: { id: true } });
  for (const p of projetos) await ensureCanaisProjeto(p.id);
}
