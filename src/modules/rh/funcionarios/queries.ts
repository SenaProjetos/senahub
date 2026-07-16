import "server-only";
import { prisma } from "@/lib/prisma";

/** Opções para o wizard de cadastro de funcionário: templates de onboarding + PJs ativas. */
export async function opcoesCadastroFuncionario() {
  const [templates, pjs] = await Promise.all([
    prisma.onboardingTemplate.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.pessoaJuridica.findMany({ where: { ativo: true }, orderBy: { razaoSocial: "asc" }, select: { id: true, cnpj: true, razaoSocial: true } }),
  ]);
  return {
    templates,
    pessoasJuridicas: pjs.map((p) => ({ id: p.id, label: `${p.razaoSocial} (${p.cnpj})` })),
  };
}

/** Nº de dependentes por usuário (p/ a folha). */
export async function dependentesPorUsuario(userIds: string[]): Promise<Record<string, number>> {
  const grupos = await prisma.dependente.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds } },
    _count: { _all: true },
  });
  const mapa: Record<string, number> = {};
  for (const g of grupos) mapa[g.userId] = g._count._all;
  return mapa;
}
