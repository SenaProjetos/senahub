"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { HR_ADMIN_ROLES } from "@/lib/roles";
import { removerArquivo } from "@/lib/storage";
import { criarUsuarioComCredencial } from "@/lib/auth-admin";
import { buscarCep } from "@/lib/cep";
import { getSession } from "@/lib/session";

const base = { modulo: "rh", roles: HR_ADMIN_ROLES } as const;
const rev = () => revalidatePath("/rh/funcionarios");
const opt = (s: z.ZodString) => s.optional().or(z.literal(""));

/** Consulta CEP (autofill do endereço no wizard). Apenas para usuários logados. */
export async function consultarCep(cep: string) {
  const session = await getSession();
  if (!session) return null;
  return buscarCep(cep);
}

// Item 4 — papéis elegíveis ao cadastro completo (exclui freelancer e cliente).
const CADASTRO_ROLES = ["admin", "supervisor", "administrativo", "clt", "estagiario", "projetista_pj"] as const;

const cadastrarFuncionarioSchema = z.object({
  // Conta de acesso
  name: z.string().min(2, "Informe o nome."),
  email: z.string().email("E-mail de acesso inválido."),
  role: z.enum(CADASTRO_ROLES),
  // Dados pessoais
  cpf: opt(z.string()),
  rg: opt(z.string()),
  dataNascimento: opt(z.string()),
  sexo: opt(z.string()),
  estadoCivil: opt(z.string()),
  nacionalidade: opt(z.string()),
  // Endereço / contato
  enderecoCep: opt(z.string()),
  enderecoLogradouro: opt(z.string()),
  enderecoNumero: opt(z.string()),
  enderecoComplemento: opt(z.string()),
  enderecoBairro: opt(z.string()),
  enderecoCidade: opt(z.string()),
  enderecoUf: opt(z.string()),
  telefone: opt(z.string()),
  telefoneEmergencia: opt(z.string()),
  contatoEmergenciaNome: opt(z.string()),
  emailPessoal: opt(z.string()),
  // Dados bancários
  banco: opt(z.string()),
  agencia: opt(z.string()),
  conta: opt(z.string()),
  tipoContaBancaria: opt(z.string()),
  // Profissional
  cargo: opt(z.string()),
  departamento: opt(z.string()),
  dataAdmissao: opt(z.string()),
  salarioBase: z.number().min(0).optional().nullable(),
  pjId: opt(z.string()),
  // Onboarding (etapa final)
  iniciarOnboarding: z.boolean().default(false),
  templateId: opt(z.string()),
});

const dataOuNull = (s?: string | null) => (s ? new Date(s + "T00:00:00Z") : null);

/**
 * Item 4: cadastro completo de colaborador — cria a conta de acesso (better-auth),
 * grava os dados pessoais/endereço/bancários/contratuais e, opcionalmente, inicia o
 * onboarding a partir de um template. Não quebra o fluxo de Usuários (conta/role).
 */
export const cadastrarFuncionario = defineAction(
  { ...base, acao: "cadastrar-funcionario", entidade: "User", schema: cadastrarFuncionarioSchema },
  async (i) => {
    const email = i.email.toLowerCase().trim();
    if (await prisma.user.findUnique({ where: { email } })) {
      throw new ActionError("Já existe um usuário com esse e-mail de acesso.");
    }

    const { id, senhaTemporaria } = await criarUsuarioComCredencial({
      name: i.name,
      email,
      role: i.role,
      clienteId: "",
    });

    await prisma.user.update({
      where: { id },
      data: {
        cpf: i.cpf || null,
        rg: i.rg || null,
        dataNascimento: dataOuNull(i.dataNascimento),
        sexo: i.sexo || null,
        estadoCivil: i.estadoCivil || null,
        nacionalidade: i.nacionalidade || null,
        enderecoCep: i.enderecoCep || null,
        enderecoLogradouro: i.enderecoLogradouro || null,
        enderecoNumero: i.enderecoNumero || null,
        enderecoComplemento: i.enderecoComplemento || null,
        enderecoBairro: i.enderecoBairro || null,
        enderecoCidade: i.enderecoCidade || null,
        enderecoUf: i.enderecoUf || null,
        telefone: i.telefone || null,
        telefoneEmergencia: i.telefoneEmergencia || null,
        contatoEmergenciaNome: i.contatoEmergenciaNome || null,
        emailPessoal: i.emailPessoal || null,
        banco: i.banco || null,
        agencia: i.agencia || null,
        conta: i.conta || null,
        tipoContaBancaria: i.tipoContaBancaria || null,
        cargo: i.cargo || null,
        departamento: i.departamento || null,
        dataAdmissao: dataOuNull(i.dataAdmissao),
        salarioBase: i.salarioBase ?? null,
        pjId: i.pjId || null,
      },
    });

    // Item 4: integra o disparo de onboarding (copia os itens do template).
    if (i.iniciarOnboarding && i.templateId) {
      const tpl = await prisma.onboardingTemplate.findUnique({
        where: { id: i.templateId },
        include: { itens: { orderBy: { ordem: "asc" } } },
      });
      if (tpl) {
        await prisma.onboardingProcesso.create({
          data: {
            userId: id,
            templateId: tpl.id,
            itens: { create: tpl.itens.map((it) => ({ descricao: it.descricao, ordem: it.ordem })) },
          },
        });
      }
    }

    rev();
    revalidatePath("/configuracoes/usuarios");
    revalidatePath("/rh/admin");
    return { id, senhaTemporaria };
  },
);

const docMeta = z.object({
  caminho: z.string().min(1),
  nomeArquivo: z.string().min(1),
  mime: z.string().min(1),
  tamanho: z.number().int().nonnegative(),
  hashSha256: z.string().min(1),
});

export const adicionarDependente = defineAction(
  {
    ...base,
    acao: "add-dependente",
    entidade: "Dependente",
    schema: z.object({
      userId: z.string().min(1),
      nome: z.string().min(1, "Informe o nome."),
      nascimento: opt(z.string()),
      parentesco: opt(z.string()),
    }),
  },
  async (i) => {
    const d = await prisma.dependente.create({
      data: {
        userId: i.userId,
        nome: i.nome,
        nascimento: i.nascimento ? new Date(i.nascimento + "T00:00:00Z") : null,
        parentesco: i.parentesco || null,
      },
    });
    rev();
    return { id: d.id };
  },
);

export const removerDependente = defineAction(
  { ...base, acao: "rm-dependente", entidade: "Dependente", schema: z.object({ id: z.string().min(1) }) },
  async (i) => {
    await prisma.dependente.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);

/** Define o salário base do colaborador (p/ geração automática de holerite). */
export const salvarSalario = defineAction(
  { ...base, acao: "salvar-salario", entidade: "User", schema: z.object({ userId: z.string().min(1), salarioBase: z.number().min(0) }) },
  async (i) => {
    await prisma.user.update({ where: { id: i.userId }, data: { salarioBase: i.salarioBase } });
    rev();
    return { id: i.userId };
  },
);

/** Define a data de admissão do colaborador (base do período aquisitivo de férias). */
export const salvarDataAdmissao = defineAction(
  { ...base, acao: "salvar-admissao", entidade: "User", schema: z.object({ userId: z.string().min(1), dataAdmissao: opt(z.string()) }) },
  async (i) => {
    await prisma.user.update({
      where: { id: i.userId },
      data: { dataAdmissao: i.dataAdmissao ? new Date(i.dataAdmissao + "T00:00:00Z") : null },
    });
    rev();
    return { id: i.userId };
  },
);

const TIPOS_DOC = ["contrato", "rg", "cpf", "aso", "diploma", "comprovante", "outro"] as const;

export const adicionarDocumentoFuncionario = defineAction(
  {
    ...base,
    acao: "add-doc-funcionario",
    entidade: "FuncionarioDocumento",
    schema: z.object({
      userId: z.string().min(1),
      tipo: z.enum(TIPOS_DOC),
      nome: z.string().min(1, "Informe o nome."),
      meta: docMeta,
    }),
  },
  async (i, ctx) => {
    const d = await prisma.funcionarioDocumento.create({
      data: {
        userId: i.userId,
        tipo: i.tipo,
        nome: i.nome,
        caminho: i.meta.caminho,
        nomeArquivo: i.meta.nomeArquivo,
        mime: i.meta.mime,
        tamanho: i.meta.tamanho,
        hashSha256: i.meta.hashSha256,
        autorId: ctx.user.id,
      },
    });
    rev();
    return { id: d.id };
  },
);

export const removerDocumentoFuncionario = defineAction(
  { ...base, acao: "rm-doc-funcionario", entidade: "FuncionarioDocumento", schema: z.object({ id: z.string().min(1) }) },
  async (i) => {
    const d = await prisma.funcionarioDocumento.findUnique({ where: { id: i.id }, select: { caminho: true } });
    if (!d) throw new ActionError("Documento não encontrado.");
    await prisma.funcionarioDocumento.delete({ where: { id: i.id } });
    await removerArquivo(d.caminho);
    rev();
    return { id: i.id };
  },
);
