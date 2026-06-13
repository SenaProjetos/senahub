import "server-only";
import { prisma } from "@/lib/prisma";

export async function listarUsuarios(opts?: { incluirInativos?: boolean }) {
  return prisma.user.findMany({
    where: opts?.incluirInativos ? undefined : { ativo: true },
    orderBy: [{ ativo: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      ativo: true,
      mustChangePassword: true,
      clienteId: true,
      createdAt: true,
    },
  });
}

export type UsuarioListItem = Awaited<ReturnType<typeof listarUsuarios>>[number];
