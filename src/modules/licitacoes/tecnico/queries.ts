import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * RTs cadastrados. Quando o RT está vinculado a um usuário do sistema (`userId`), o cadastro
 * da pessoa é a fonte de verdade de nome/registro/conselho — a linha aqui só guarda o vínculo.
 * RT sem `userId` é responsável externo (sem login), e aí os campos locais valem.
 */
export async function listarResponsaveisTecnicos(incluirInativos = false) {
  const rts = await prisma.responsavelTecnico.findMany({
    where: incluirInativos ? {} : { ativo: true },
    orderBy: { nome: "asc" },
    include: {
      user: {
        select: { name: true, nomeCompleto: true, conselho: true, registroProfissional: true, registroUf: true },
      },
    },
  });

  return rts.map(({ user, ...rt }) => ({
    ...rt,
    nome: user ? user.nomeCompleto || user.name : rt.nome,
    registro: user?.registroProfissional ?? rt.registro,
    conselho: user?.conselho ?? rt.conselho,
    /** true = dados vêm do cadastro da pessoa; a UI trava a edição local. */
    vinculadoAUsuario: user != null,
  }));
}
