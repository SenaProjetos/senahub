import "server-only";
import { prisma } from "@/lib/prisma";

export async function listarUsuarios(opts?: { incluirInativos?: boolean }) {
  return prisma.user.findMany({
    where: opts?.incluirInativos ? undefined : { ativo: true },
    orderBy: [{ ativo: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      nomeCompleto: true,
      email: true,
      role: true,
      ativo: true,
      mustChangePassword: true,
      clienteId: true,
      createdAt: true,
      socio: { select: { ativo: true } },
      perfilId: true,
      superUsuario: true,
      perfil: { select: { nome: true } },
      // Só exibição: esta tela NÃO grava vínculo (quem grava é `rh/funcionarios/actions.ts`).
      // Aparece aqui para o admin ver, sem sair da tela, se Setor/Contratação estão preenchidos —
      // desde a Onda E a jornada resolve por `Contratacao`, então vínculo vazio ou errado é uma
      // falha silenciosa que nenhuma outra tela de configuração denuncia.
      setor: true,
      contratacao: true,
    },
  });
}

export type UsuarioListItem = Awaited<ReturnType<typeof listarUsuarios>>[number];
