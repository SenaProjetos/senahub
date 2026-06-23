import "server-only";
import { prisma } from "@/lib/prisma";
import { CLT_ROLES, CADASTRO_ROLES, type Role } from "@/lib/roles";
import { periodosAquisitivos, resumoAquisitivo } from "@/lib/aquisitivo";

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

/** Funcionários (CLT/estagiário) com seus dependentes — base p/ folha e dedução de IRRF. */
export async function listarFuncionarios() {
  const us = await prisma.user.findMany({
    where: { ativo: true, role: { in: CADASTRO_ROLES } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      role: true,
      email: true,
      salarioBase: true,
      dataAdmissao: true,
      // Item 4 — cadastro completo
      cpf: true, rg: true, dataNascimento: true, sexo: true, estadoCivil: true, nacionalidade: true,
      enderecoCep: true, enderecoLogradouro: true, enderecoNumero: true, enderecoComplemento: true,
      enderecoBairro: true, enderecoCidade: true, enderecoUf: true,
      telefone: true, telefoneEmergencia: true, contatoEmergenciaNome: true, emailPessoal: true,
      banco: true, agencia: true, conta: true, tipoContaBancaria: true,
      cargo: true, departamento: true,
      pjId: true,
      pj: { select: { id: true, razaoSocial: true, cnpj: true } },
      dependentes: {
        orderBy: { createdAt: "asc" },
        select: { id: true, nome: true, nascimento: true, parentesco: true },
      },
      funcDocumentos: {
        orderBy: { createdAt: "desc" },
        select: { id: true, tipo: true, nome: true, nomeArquivo: true, tamanho: true, createdAt: true },
      },
    },
  });

  // Férias aprovadas de todos (1 query) p/ calcular dias gozados por período aquisitivo.
  const feriasAprovadas = await prisma.ferias.findMany({
    where: { userId: { in: us.map((u) => u.id) }, status: "aprovado" },
    select: { userId: true, inicio: true, fim: true },
  });
  const feriasPorUser = new Map<string, { inicio: Date; fim: Date }[]>();
  for (const f of feriasAprovadas) {
    const arr = feriasPorUser.get(f.userId) ?? [];
    arr.push({ inicio: f.inicio, fim: f.fim });
    feriasPorUser.set(f.userId, arr);
  }

  const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  return us.map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role,
    email: u.email,
    salarioBase: u.salarioBase != null ? Number(u.salarioBase) : null,
    dataAdmissao: ymd(u.dataAdmissao),
    // Aquisitivo de férias só faz sentido para CLT/estagiário.
    aquisitivo:
      u.dataAdmissao && CLT_ROLES.includes(u.role as Role)
        ? resumoAquisitivo(periodosAquisitivos(u.dataAdmissao, feriasPorUser.get(u.id) ?? []))
        : null,
    cadastro: {
      cpf: u.cpf, rg: u.rg, dataNascimento: ymd(u.dataNascimento), sexo: u.sexo, estadoCivil: u.estadoCivil, nacionalidade: u.nacionalidade,
      enderecoCep: u.enderecoCep, enderecoLogradouro: u.enderecoLogradouro, enderecoNumero: u.enderecoNumero,
      enderecoComplemento: u.enderecoComplemento, enderecoBairro: u.enderecoBairro, enderecoCidade: u.enderecoCidade, enderecoUf: u.enderecoUf,
      telefone: u.telefone, telefoneEmergencia: u.telefoneEmergencia, contatoEmergenciaNome: u.contatoEmergenciaNome, emailPessoal: u.emailPessoal,
      banco: u.banco, agencia: u.agencia, conta: u.conta, tipoContaBancaria: u.tipoContaBancaria,
      cargo: u.cargo, departamento: u.departamento,
      pjId: u.pjId, pjLabel: u.pj ? `${u.pj.razaoSocial} (${u.pj.cnpj})` : null,
    },
    dependentes: u.dependentes.map((d) => ({
      id: d.id,
      nome: d.nome,
      nascimento: d.nascimento ? d.nascimento.toISOString().slice(0, 10) : null,
      parentesco: d.parentesco,
    })),
    documentos: u.funcDocumentos.map((d) => ({
      id: d.id,
      tipo: d.tipo,
      nome: d.nome,
      nomeArquivo: d.nomeArquivo,
      tamanho: d.tamanho,
      criadoEm: d.createdAt.toISOString(),
    })),
  }));
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
