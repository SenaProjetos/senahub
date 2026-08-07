import "server-only";
import { prisma } from "@/lib/prisma";
import { catalogoCargos, catalogoDepartamentos } from "@/modules/rh/catalogos/queries";

/**
 * Opções dos formulários de cadastro: templates de onboarding, PJs ativas e os catálogos de
 * cargo/departamento (2.1). Os catálogos vêm daqui, e não de cada página, para wizard, ficha e
 * a tela de usuários exibirem exatamente a mesma lista.
 */
export async function opcoesCadastroFuncionario() {
  const [templates, pjs, cargos, departamentos] = await Promise.all([
    prisma.onboardingTemplate.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.pessoaJuridica.findMany({ where: { ativo: true }, orderBy: { razaoSocial: "asc" }, select: { id: true, cnpj: true, razaoSocial: true } }),
    catalogoCargos(),
    catalogoDepartamentos(),
  ]);
  return {
    templates,
    pessoasJuridicas: pjs.map((p) => ({ id: p.id, label: `${p.razaoSocial} (${p.cnpj})` })),
    cargos,
    departamentos: departamentos.map((d) => ({ id: d.id, nome: d.nome })),
  };
}

/**
 * Nº de dependentes DEDUTÍVEIS de IRRF por usuário (p/ a folha). Filtra `dependenteIrrf: true`
 * desde 2.5 — antes contava todos; o backfill da migration marcou os já existentes como `true`
 * para este número não mudar em produção no dia em que o campo entrou.
 */
export async function dependentesPorUsuario(userIds: string[]): Promise<Record<string, number>> {
  const grupos = await prisma.dependente.groupBy({
    by: ["userId"],
    where: { userId: { in: userIds }, dependenteIrrf: true },
    _count: { _all: true },
  });
  const mapa: Record<string, number> = {};
  for (const g of grupos) mapa[g.userId] = g._count._all;
  return mapa;
}
