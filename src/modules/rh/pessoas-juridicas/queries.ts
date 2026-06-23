import "server-only";
import { prisma } from "@/lib/prisma";
import { PJ_ROLES } from "@/lib/roles";

export type PessoaJuridicaItem = {
  id: string;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  email: string | null;
  telefone: string | null;
  ativo: boolean;
  membros: { id: string; name: string; role: string }[];
};

/** Lista as PJs com seus membros (perfis de projetista vinculados). */
export async function listarPessoasJuridicas(): Promise<PessoaJuridicaItem[]> {
  const pjs = await prisma.pessoaJuridica.findMany({
    orderBy: [{ ativo: "desc" }, { razaoSocial: "asc" }],
    select: {
      id: true,
      cnpj: true,
      razaoSocial: true,
      nomeFantasia: true,
      email: true,
      telefone: true,
      ativo: true,
      membros: { where: { ativo: true }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } },
    },
  });
  return pjs;
}

/** Projetistas PJ/freelancer ativos — candidatos a vincular a uma PJ (com o vínculo atual). */
export async function projetistasParaPJ() {
  const users = await prisma.user.findMany({
    where: { ativo: true, role: { in: PJ_ROLES } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true, pjId: true },
  });
  return users;
}
