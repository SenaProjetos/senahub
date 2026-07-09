import "server-only";
import { prisma } from "@/lib/prisma";
import { CADASTRO_ROLES, type Role } from "@/lib/roles";
import { espelhoMes } from "@/modules/ponto/queries";

const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Um cadastro é "incompleto" quando faltam campos-base do colaborador (só p/ perfis com cadastro). */
function cadastroIncompleto(role: Role, cpf: string | null, dataAdmissao: Date | null): boolean {
  if (!CADASTRO_ROLES.includes(role)) return false;
  return !cpf || !dataAdmissao;
}

/** Lista de pessoas (mestre) — base da tela /rh/pessoas. Reusa o que já existe no User. */
export async function listarPessoas() {
  const us = await prisma.user.findMany({
    orderBy: [{ ativo: "desc" }, { name: "asc" }],
    select: {
      id: true, name: true, email: true, role: true, ativo: true,
      clienteId: true, pjId: true, cpf: true, dataAdmissao: true,
      socio: { select: { ativo: true } },
    },
  });
  return us.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    ativo: u.ativo,
    clienteId: u.clienteId,
    pjId: u.pjId,
    socioAtivo: u.socio?.ativo === true,
    incompleto: cadastroIncompleto(u.role, u.cpf, u.dataAdmissao),
  }));
}
export type PessoaListItem = Awaited<ReturnType<typeof listarPessoas>>[number];

/** Cabeçalho/resumo da ficha (dados-núcleo + vínculos). `salarioBase` só deve ser exposto a quem pode ver folha. */
export async function fichaPessoa(userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, nomeCompleto: true, email: true, role: true, ativo: true,
      mustChangePassword: true, createdAt: true,
      salarioBase: true, dataAdmissao: true, cpf: true, cargo: true, departamento: true,
      clienteId: true,
      cliente: { select: { id: true, nome: true, tipo: true, documento: true } },
      pj: { select: { id: true, razaoSocial: true, cnpj: true } },
      socio: { select: { ativo: true } },
      _count: { select: { projetosMembro: true } },
    },
  });
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    nomeCompleto: u.nomeCompleto,
    email: u.email,
    role: u.role,
    ativo: u.ativo,
    mustChangePassword: u.mustChangePassword,
    criadoEm: u.createdAt.toISOString(),
    salarioBase: u.salarioBase != null ? Number(u.salarioBase) : null,
    dataAdmissao: ymd(u.dataAdmissao),
    cargo: u.cargo,
    departamento: u.departamento,
    socioAtivo: u.socio?.ativo === true,
    incompleto: cadastroIncompleto(u.role, u.cpf, u.dataAdmissao),
    projetosCount: u._count.projetosMembro,
    cliente: u.cliente ? { id: u.cliente.id, nome: u.cliente.nome, tipo: u.cliente.tipo, documento: u.cliente.documento } : null,
    pj: u.pj ? { id: u.pj.id, razaoSocial: u.pj.razaoSocial, cnpj: u.pj.cnpj } : null,
  };
}
export type FichaPessoa = NonNullable<Awaited<ReturnType<typeof fichaPessoa>>>;

/** Aba Cadastro (PF) — mesmos campos do /rh/funcionarios, para uma pessoa. */
export async function cadastroDaPessoa(userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      cpf: true, rg: true, dataNascimento: true, sexo: true, estadoCivil: true, nacionalidade: true,
      enderecoCep: true, enderecoLogradouro: true, enderecoNumero: true, enderecoComplemento: true,
      enderecoBairro: true, enderecoCidade: true, enderecoUf: true,
      telefone: true, telefoneEmergencia: true, contatoEmergenciaNome: true, emailPessoal: true,
      banco: true, agencia: true, conta: true, tipoContaBancaria: true,
      cargo: true, departamento: true,
      dependentes: { orderBy: { createdAt: "asc" }, select: { id: true, nome: true, nascimento: true, parentesco: true } },
      funcDocumentos: {
        orderBy: { createdAt: "desc" },
        select: { id: true, tipo: true, nome: true, nomeArquivo: true, tamanho: true, createdAt: true },
      },
    },
  });
  if (!u) return null;
  return {
    cpf: u.cpf, rg: u.rg, dataNascimento: ymd(u.dataNascimento), sexo: u.sexo, estadoCivil: u.estadoCivil, nacionalidade: u.nacionalidade,
    enderecoCep: u.enderecoCep, enderecoLogradouro: u.enderecoLogradouro, enderecoNumero: u.enderecoNumero,
    enderecoComplemento: u.enderecoComplemento, enderecoBairro: u.enderecoBairro, enderecoCidade: u.enderecoCidade, enderecoUf: u.enderecoUf,
    telefone: u.telefone, telefoneEmergencia: u.telefoneEmergencia, contatoEmergenciaNome: u.contatoEmergenciaNome, emailPessoal: u.emailPessoal,
    banco: u.banco, agencia: u.agencia, conta: u.conta, tipoContaBancaria: u.tipoContaBancaria,
    cargo: u.cargo, departamento: u.departamento,
    dependentes: u.dependentes.map((d) => ({ id: d.id, nome: d.nome, nascimento: ymd(d.nascimento), parentesco: d.parentesco })),
    documentos: u.funcDocumentos.map((d) => ({
      id: d.id, tipo: d.tipo, nome: d.nome, nomeArquivo: d.nomeArquivo, tamanho: d.tamanho, criadoEm: d.createdAt.toISOString(),
    })),
  };
}
export type CadastroPessoa = NonNullable<Awaited<ReturnType<typeof cadastroDaPessoa>>>;

/**
 * Aba Ausências — abonos de falta + solicitações de férias de UMA pessoa.
 * Preenche o buraco: hoje só existia a fila global de pendências e a self-service do próprio.
 */
export async function solicitacoesDoUsuario(userId: string) {
  const [abonos, ferias] = await Promise.all([
    prisma.abonoFalta.findMany({
      where: { userId },
      orderBy: { dataInicio: "desc" },
      select: { id: true, dataInicio: true, dataFim: true, motivo: true, atestadoNome: true, status: true, validadoEm: true, createdAt: true },
    }),
    prisma.ferias.findMany({
      where: { userId },
      orderBy: { inicio: "desc" },
      select: { id: true, inicio: true, fim: true, observacao: true, status: true, createdAt: true },
    }),
  ]);
  return {
    abonos: abonos.map((a) => ({
      id: a.id, dataInicio: ymd(a.dataInicio)!, dataFim: ymd(a.dataFim)!, motivo: a.motivo,
      atestadoNome: a.atestadoNome, status: a.status, validadoEm: a.validadoEm ? a.validadoEm.toISOString() : null,
      criadoEm: a.createdAt.toISOString(),
    })),
    ferias: ferias.map((f) => ({
      id: f.id, inicio: ymd(f.inicio)!, fim: ymd(f.fim)!, observacao: f.observacao, status: f.status,
      criadoEm: f.createdAt.toISOString(),
    })),
  };
}
export type SolicitacoesUsuario = Awaited<ReturnType<typeof solicitacoesDoUsuario>>;

/** Aba Ponto — resumo do espelho do MÊS ATUAL (totais + minutos por dia), serializável. */
export async function pontoDoMes(userId: string) {
  const now = new Date();
  const ano = now.getFullYear();
  const mes = now.getMonth() + 1;
  const e = await espelhoMes(userId, ano, mes);
  return {
    ano,
    mes,
    totalMinutos: e.totalMinutos,
    esperadoMinutos: e.esperadoMinutos,
    saldoMinutos: e.saldoMinutos,
    dias: e.dias.map((d) => ({ dia: d.dia, minutos: d.minutos })),
  };
}
export type PontoMes = Awaited<ReturnType<typeof pontoDoMes>>;

/** Aba NF — notas fiscais enviadas por uma pessoa PJ/freelancer. */
export async function notasDoUsuario(userId: string) {
  const ns = await prisma.notaFiscalPJ.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 36,
    select: { id: true, numero: true, valor: true, status: true, observacao: true, arquivoNome: true, validadoEm: true, createdAt: true },
  });
  return ns.map((n) => ({
    id: n.id,
    numero: n.numero,
    valor: Number(n.valor),
    status: n.status,
    observacao: n.observacao,
    arquivoNome: n.arquivoNome,
    validadoEm: n.validadoEm ? n.validadoEm.toISOString() : null,
    criadoEm: n.createdAt.toISOString(),
  }));
}
export type NotasUsuario = Awaited<ReturnType<typeof notasDoUsuario>>;
