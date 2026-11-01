import "server-only";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";
import { can, podeAtuarEmDisciplinaAlheia } from "@/lib/permissions";
import type { PapeisPendencia } from "@/modules/projetos/pendencias/helpers";

/** Descobre os papéis do usuário SOBRE ESTA pendência, na forma que a máquina entende. */
export async function papeisSobre(p: { disciplinaId: string }, user: SessionUser): Promise<PapeisPendencia> {
  // `ehGlobal` na máquina = quem atua em disciplina alheia (`projetos:atuar_disciplina_alheia`);
  // até 2026-09-15 era o papel admin/supervisor.
  const global = await podeAtuarEmDisciplinaAlheia(user);
  const [validador, resp] = await Promise.all([
    can(user, "uploads", "validar"),
    global
      ? Promise.resolve(true)
      : prisma.disciplinaResponsavel
          .findFirst({ where: { disciplinaId: p.disciplinaId, userId: user.id }, select: { id: true } })
          .then((r) => r !== null),
  ]);
  return { ehValidador: validador, ehResponsavel: resp, ehGlobal: global };
}

/**
 * Mesma semântica de `papeisSobre`, para várias disciplinas de uma vez: as permissões do usuário
 * são calculadas uma só vez e os vínculos de responsável vêm numa única consulta.
 */
export async function papeisPorDisciplina(
  disciplinaIds: string[],
  user: SessionUser,
): Promise<Map<string, PapeisPendencia>> {
  const ids = [...new Set(disciplinaIds)];
  const resultado = new Map<string, PapeisPendencia>();
  if (ids.length === 0) return resultado;

  const global = await podeAtuarEmDisciplinaAlheia(user);
  const [validador, vinculos] = await Promise.all([
    can(user, "uploads", "validar"),
    global
      ? Promise.resolve([] as { disciplinaId: string }[])
      : prisma.disciplinaResponsavel.findMany({
          where: { userId: user.id, disciplinaId: { in: ids } },
          select: { disciplinaId: true },
        }),
  ]);
  const minhas = new Set(vinculos.map((v) => v.disciplinaId));
  for (const id of ids) {
    resultado.set(id, { ehValidador: validador, ehResponsavel: global || minhas.has(id), ehGlobal: global });
  }
  return resultado;
}
