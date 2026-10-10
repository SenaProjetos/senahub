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
      ativo: true,
      mustChangePassword: true,
      clienteId: true,
      createdAt: true,
      socio: { select: { ativo: true } },
      perfilId: true,
      superUsuario: true,
      perfil: { select: { nome: true } },
      // Só exibição na edição: o vínculo nasce no cadastro, mas depois quem o troca é o RH
      // (`rh/contratacao`). Aparece aqui para o admin ver, sem sair da tela, se Setor/Contratação
      // estão preenchidos — a jornada resolve por `Contratacao`, então vínculo vazio é uma falha
      // silenciosa que nenhuma outra tela de configuração denuncia.
      tipo: true,
      setor: true,
      contratacao: true,
      // Permissões dadas pessoa a pessoa que a tela edita (Onda F): Gestão de RH e Moderar o chat.
      overrides: {
        where: { permitido: true, OR: [{ recurso: "rh", acao: "gerir" }, { recurso: "chat", acao: "moderar" }] },
        select: { recurso: true },
      },
    },
  });
}

export type UsuarioListItem = Awaited<ReturnType<typeof listarUsuarios>>[number];
