import "server-only";
import { prisma } from "@/lib/prisma";

/** Quadro completo: colunas + tarefas com bloqueio por dependência. */
export async function quadroTarefas() {
  const colunas = await prisma.tarefaStatus.findMany({
    where: { ativo: true },
    orderBy: { ordem: "asc" },
    include: {
      tarefas: {
        where: { arquivada: false },
        orderBy: { updatedAt: "desc" },
        include: {
          projeto: { select: { codigo: true } },
          responsaveis: { include: { user: { select: { id: true, name: true } } } },
          itens: { orderBy: { ordem: "asc" } },
          dependeDe: {
            include: {
              dependeDe: { select: { id: true, titulo: true, status: { select: { concluido: true } } } },
            },
          },
        },
      },
    },
  });
  return colunas;
}

export async function opcoesTarefa() {
  const [internos, projetos, tarefas] = await Promise.all([
    prisma.user.findMany({
      where: { ativo: true, role: { not: "cliente" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.projeto.findMany({
      where: { situacao: "em_andamento" },
      orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
      select: { id: true, codigo: true, nome: true },
    }),
    prisma.tarefa.findMany({
      where: { arquivada: false },
      select: { id: true, titulo: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
  ]);
  return { internos, projetos, tarefas };
}

export type ColunaTarefas = Awaited<ReturnType<typeof quadroTarefas>>[number];
export type TarefaItemBoard = ColunaTarefas["tarefas"][number];

/** Tarefa bloqueada = alguma dependência ainda não concluída. */
export function tarefaBloqueada(t: TarefaItemBoard): boolean {
  return t.dependeDe.some((d) => !d.dependeDe.status.concluido);
}
