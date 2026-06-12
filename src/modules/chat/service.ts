import "server-only";
import { prisma } from "@/lib/prisma";

/** Perfis que entram no #geral (freelancer e cliente ficam de fora — regra de negócio). */
const ROLES_GERAL = ["admin", "supervisor", "administrativo", "clt", "estagiario", "projetista_pj"];
/** Perfis globais sempre nos canais de projeto/disciplina. */
const ROLES_GLOBAIS = ["admin", "supervisor"];

async function syncMembros(canalId: string, userIds: string[]) {
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
}

/** Garante o canal #geral com todos os perfis internos elegíveis. */
export async function ensureCanalGeral() {
  let canal = await prisma.canal.findFirst({ where: { tipo: "geral" } });
  if (!canal) {
    canal = await prisma.canal.create({ data: { tipo: "geral", nome: "#geral" } });
  }
  const internos = await prisma.user.findMany({
    where: { ativo: true, role: { in: ROLES_GERAL as never } },
    select: { id: true },
  });
  await syncMembros(canal.id, internos.map((u) => u.id));
  return canal;
}

/**
 * Garante o canal do projeto + um canal por disciplina, sincronizando membros:
 * membros do projeto + responsáveis das disciplinas + perfis globais.
 */
export async function ensureCanaisProjeto(projetoId: string) {
  const projeto = await prisma.projeto.findUnique({
    where: { id: projetoId },
    include: {
      membros: { select: { userId: true } },
      disciplinas: { include: { responsaveis: { select: { userId: true } } } },
    },
  });
  if (!projeto) return;

  const globais = (
    await prisma.user.findMany({ where: { role: { in: ROLES_GLOBAIS as never }, ativo: true }, select: { id: true } })
  ).map((u) => u.id);

  // Canal do projeto
  let canalProjeto = await prisma.canal.findFirst({ where: { tipo: "projeto", projetoId } });
  if (!canalProjeto) {
    canalProjeto = await prisma.canal.create({
      data: { tipo: "projeto", projetoId, nome: projeto.nome },
    });
  }
  const todosResp = projeto.disciplinas.flatMap((d) => d.responsaveis.map((r) => r.userId));
  await syncMembros(canalProjeto.id, [
    ...projeto.membros.map((m) => m.userId),
    ...todosResp,
    ...globais,
  ]);

  // Canal por disciplina
  for (const d of projeto.disciplinas) {
    let canalDisc = await prisma.canal.findFirst({ where: { tipo: "disciplina", disciplinaId: d.id } });
    if (!canalDisc) {
      canalDisc = await prisma.canal.create({
        data: { tipo: "disciplina", disciplinaId: d.id, projetoId, nome: d.nome },
      });
    }
    await syncMembros(canalDisc.id, [...d.responsaveis.map((r) => r.userId), ...globais]);
  }
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
  const projetos = await prisma.projeto.findMany({ select: { id: true } });
  for (const p of projetos) await ensureCanaisProjeto(p.id);
}
