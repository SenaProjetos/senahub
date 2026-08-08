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
import { PJ_ROLES, CADASTRO_ROLES, type Role } from "@/lib/roles";
import { aplicarVinculo } from "@/modules/usuarios/vinculo/service";
import { derivarEixos } from "@/modules/usuarios/vinculo/mapa";
import { resolverClassificacao } from "@/modules/rh/catalogos/service";
import { registrarAlteracaoContratual } from "@/modules/rh/contratual/service";
import { normalizarConta, garantirPrincipal } from "@/modules/rh/contas/service";

const base = { modulo: "rh", roles: HR_ADMIN_ROLES } as const;
const rev = () => revalidatePath("/rh/funcionarios");
const opt = (s: z.ZodString) => s.optional().or(z.literal(""));

/** Consulta CEP (autofill do endereço no wizard). Apenas para usuários logados. */
export async function consultarCep(cep: string) {
  const session = await getSession();
  if (!session) return null;
  return buscarCep(cep);
}

/// Espelha o enum Prisma `Setor` (docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md).
const SETOR_VALUES = ["diretoria", "administrativo", "juridico", "engenharia", "ti"] as const;

const cadastrarFuncionarioSchema = z.object({
  // Conta de acesso
  name: z.string().min(2, "Informe o nome."),
  /** Nome como consta em documentos formais (holerite/contrato/NF). Vazio = usa `name`. */
  nomeCompleto: opt(z.string()),
  email: z.string().email("E-mail de acesso inválido."),
  role: z.enum(CADASTRO_ROLES),
  /// Setor (Onda C) — opcional: sem escolha, cai no default de `derivarEixos` (§6.1 do plano).
  setor: z.enum(SETOR_VALUES).optional(),
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
  // Cargo/departamento vêm do CATÁLOGO (2.1). O texto livre saiu do contrato da action:
  // `User.cargo`/`User.departamento` viraram cache do rótulo, escrito só por `resolverClassificacao`.
  cargoId: opt(z.string()),
  departamentoId: opt(z.string()),
  conselho: opt(z.string()),
  registroProfissional: opt(z.string()),
  registroUf: opt(z.string()),
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
  async (i, ctx) => {
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

    // Só resolve o rótulo aqui (leitura) — quem GRAVA cargo/departamento/salário é
    // `registrarAlteracaoContratual`, mais abaixo, junto com a linha de histórico.
    const classificacao = await resolverClassificacao(prisma, {
      cargoId: i.cargoId || null,
      departamentoId: i.departamentoId || null,
    });

    await prisma.user.update({
      where: { id },
      data: {
        nomeCompleto: i.nomeCompleto || null,
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
        conselho: i.conselho || null,
        registroProfissional: i.registroProfissional || null,
        registroUf: i.registroUf || null,
        dataAdmissao: dataOuNull(i.dataAdmissao),
        pjId: i.pjId || null,
      },
    });

    // 2.2: a conta informada no wizard vira a PRIMEIRA conta da pessoa (e a principal), em vez
    // dos 4 escalares que existiam em `User`. Só cria se veio algo — conta vazia é ruído.
    if (i.banco || i.agencia || i.conta) {
      const dadosConta = normalizarConta({
        banco: i.banco,
        agencia: i.agencia,
        conta: i.conta,
        tipoConta: i.tipoContaBancaria,
      });
      await prisma.$transaction(async (tx) => {
        await tx.contaBancariaColaborador.create({ data: { userId: id, ...dadosConta } });
        await garantirPrincipal(tx, id);
      });
    }

    // Onda C: cria o Vínculo (Fase 0) já no cadastro — sem isso, quem contrata pelo wizard
    // desde a Fase 0 nunca ganhava Setor/Contratação (só o backfill retroativo cobria).
    // `admin` fica de fora (mesmo raciocínio do backfill: papel não é contratação).
    const eixos = derivarEixos(i.role);
    if (eixos.criaVinculo) {
      await aplicarVinculo(prisma, id, {
        contratacao: eixos.contratacao!,
        setor: i.setor ?? eixos.setor!,
        cargo: classificacao.cargo ?? null,
        remuneracao: i.salarioBase ?? null,
        pjId: i.pjId || null,
        dataInicio: dataOuNull(i.dataAdmissao) ?? new Date(),
      });
    }

    // 2.3: primeira linha do histórico contratual. Vem DEPOIS de `aplicarVinculo` de propósito,
    // para o registro já nascer amarrado ao vínculo recém-criado. É esta chamada — e só ela —
    // que grava `cargoId`/`departamentoId`/`salarioBase` no User.
    await prisma.$transaction((tx) =>
      registrarAlteracaoContratual(
        tx,
        id,
        {
          cargoId: i.cargoId || null,
          departamentoId: i.departamentoId || null,
          remuneracao: i.salarioBase ?? null,
          vigenciaEm: dataOuNull(i.dataAdmissao) ?? undefined,
          motivo: "admissao",
        },
        ctx.user.id,
      ),
    );

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

const editarCadastroSchema = z.object({
  id: z.string().min(1),
  // Nome de EXIBIÇÃO (`User.name`, chat/menções) não é editado aqui — é
  // `usuarios-view.tsx`/`editarUsuario`. Este dialog edita só `nomeCompleto` (documentos
  // formais). Antes os dois eram confundidos: o campo "Nome completo" gravava em `name`, e
  // salvar o cadastro sobrescrevia silenciosamente o nome de exibição da pessoa.
  nomeCompleto: opt(z.string()),
  cpf: opt(z.string()),
  rg: opt(z.string()),
  dataNascimento: opt(z.string()),
  sexo: opt(z.string()),
  estadoCivil: opt(z.string()),
  nacionalidade: opt(z.string()),
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
  conselho: opt(z.string()),
  registroProfissional: opt(z.string()),
  registroUf: opt(z.string()),
  dataAdmissao: opt(z.string()),
  pjId: opt(z.string()),
});

/**
 * Item 4: edita o cadastro de um colaborador existente — identidade, endereço, contato e
 * registro profissional (não altera conta/e-mail/role).
 *
 * Cargo, departamento e salário SAÍRAM daqui (2.4): formam um estado contratual com vigência e
 * motivo, editado só por `registrarAlteracaoContratualAction`
 * (`modules/rh/contratual/actions.ts`) — o único escritor de `HistoricoContratual`.
 */
export const editarCadastroFuncionario = defineAction(
  { ...base, acao: "editar-cadastro-funcionario", entidade: "User", schema: editarCadastroSchema },
  async (i) => {
    const u = await prisma.user.findUnique({ where: { id: i.id }, select: { role: true } });
    if (!u) throw new ActionError("Colaborador não encontrado.");
    await prisma.user.update({
      where: { id: i.id },
      data: {
        nomeCompleto: i.nomeCompleto || null,
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
        conselho: i.conselho || null,
        registroProfissional: i.registroProfissional || null,
        registroUf: i.registroUf || null,
        dataAdmissao: dataOuNull(i.dataAdmissao),
        // pjId só para projetistas PJ/freelancer.
        pjId: PJ_ROLES.includes(u.role as Role) ? i.pjId || null : null,
      },
    });

    rev();
    return { id: i.id };
  },
);

const docMeta = z.object({
  caminho: z.string().min(1),
  nomeArquivo: z.string().min(1),
  mime: z.string().min(1),
  tamanho: z.number().int().nonnegative(),
  hashSha256: z.string().min(1),
});

const dependenteCampos = {
  nome: z.string().min(1, "Informe o nome."),
  cpf: opt(z.string()),
  nascimento: opt(z.string()),
  parentesco: opt(z.string()),
  // Default false no schema é só para linha NOVA no banco — aqui o form decide sempre
  // explicitamente (checkbox), então o campo é obrigatório no payload, não opcional.
  dependenteIrrf: z.boolean(),
};

export const adicionarDependente = defineAction(
  {
    ...base,
    acao: "add-dependente",
    entidade: "Dependente",
    schema: z.object({ userId: z.string().min(1), ...dependenteCampos }),
  },
  async (i) => {
    const d = await prisma.dependente.create({
      data: {
        userId: i.userId,
        nome: i.nome,
        cpf: i.cpf || null,
        nascimento: i.nascimento ? new Date(i.nascimento + "T00:00:00Z") : null,
        parentesco: i.parentesco || null,
        dependenteIrrf: i.dependenteIrrf,
      },
    });
    rev();
    return { id: d.id };
  },
);

export const editarDependente = defineAction(
  {
    ...base,
    acao: "editar-dependente",
    entidade: "Dependente",
    schema: z.object({ id: z.string().min(1), ...dependenteCampos }),
    capturarAntes: async (i) => prisma.dependente.findUnique({ where: { id: i.id } }),
  },
  async (i) => {
    await prisma.dependente.update({
      where: { id: i.id },
      data: {
        nome: i.nome,
        cpf: i.cpf || null,
        nascimento: i.nascimento ? new Date(i.nascimento + "T00:00:00Z") : null,
        parentesco: i.parentesco || null,
        dependenteIrrf: i.dependenteIrrf,
      },
    });
    rev();
    return { id: i.id };
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

// `salvarSalario` foi removida em 2.4: `registrarAlteracaoContratualAction`
// (`modules/rh/contratual/actions.ts`) cobre o mesmo caso (mesmo service) e além disso edita
// cargo/departamento junto — era a única rota que só mexia em remuneração, sem chamador na UI.

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
