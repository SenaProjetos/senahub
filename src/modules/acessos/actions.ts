"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { defineAction } from "@/lib/with-action";
import { ActionError } from "@/lib/action-error";
import { criptografarSenha } from "@/lib/encryption";
import type { SessionUser } from "@/lib/session";
import { permissoesDoViewer, viewerDe } from "./queries";
import { normalizarCompartilhamentos, type PermissoesNaCredencial } from "./service";
import {
  criarCredencialSchema,
  atualizarCredencialSchema,
  gerenciarCompartilhamentoSchema,
  alternarFavoritoSchema,
  idSchema,
} from "./schemas";

const ROTA = "/acessos";

/**
 * Mutações do cofre de Acessos.
 *
 * Toda action aqui passa por DOIS gates, e os dois são obrigatórios:
 *
 *   1. `defineAction` com `recurso: "acessos"` — o gate de TELA (`recurso:acao`), que responde
 *      "esta pessoa mexe no módulo?";
 *   2. `exigir…()` abaixo — o gate POR REGISTRO, que responde "…nesta credencial específica?".
 *
 * O segundo não é opcional nem redundante: sem ele, quem tem `acessos:gerir` editaria qualquer
 * credencial trocando o id no payload, que é exatamente o IDOR da §83. `defineAction` não sabe
 * nada sobre compartilhamento — essa parte é sempre nossa.
 *
 * Revelar/copiar credencial NÃO mora aqui: é a Fase 2c, com auditoria própria.
 */

/**
 * Carrega as permissões do viewer sobre a credencial e exige uma delas.
 *
 * "Não existe" e "existe mas você não alcança" devolvem a MESMA mensagem, de propósito: uma
 * mensagem diferente para cada caso é um oráculo de existência — dá para varrer ids e descobrir
 * o que existe no cofre sem nunca ter acesso (§84 cenário D).
 */
async function exigir(
  user: SessionUser,
  credencialId: string,
  permissao: keyof PermissoesNaCredencial,
): Promise<void> {
  const permissoes = await permissoesDoViewer(viewerDe(user), credencialId);
  if (!permissoes || !permissoes[permissao]) {
    throw new ActionError("Acesso não encontrado ou sem permissão.");
  }
}

/** Cifra o texto em claro, ou devolve `undefined` quando o campo não foi preenchido. */
async function cifrar(valor: string | undefined): Promise<string | undefined> {
  if (!valor) return undefined;
  return JSON.stringify(await criptografarSenha(valor));
}

/** Campos escalares comuns a criar/atualizar. Os cifrados NÃO passam por aqui. */
function dadosEscalares(input: {
  nome: string;
  nomeCompleto?: string;
  categoriaId: string;
  estado?: string;
  descricao?: string;
  url?: string;
  responsavelId?: string;
  status: string;
  vencimentoEm?: Date;
  proximaRevisaoEm?: Date;
  renovacaoAutomatica: boolean;
  fornecedor?: string;
  tipoLicenca?: string;
  numeroLicenca?: string;
  assentos?: number;
  dataContratacao?: Date;
  dataRenovacao?: Date;
}) {
  return {
    nome: input.nome,
    nomeCompleto: input.nomeCompleto ?? null,
    categoriaId: input.categoriaId,
    estado: input.estado ?? null,
    descricao: input.descricao ?? null,
    url: input.url ?? null,
    responsavelId: input.responsavelId ?? null,
    status: input.status,
    vencimentoEm: input.vencimentoEm ?? null,
    proximaRevisaoEm: input.proximaRevisaoEm ?? null,
    renovacaoAutomatica: input.renovacaoAutomatica,
    fornecedor: input.fornecedor ?? null,
    tipoLicenca: input.tipoLicenca ?? null,
    numeroLicenca: input.numeroLicenca ?? null,
    assentos: input.assentos ?? null,
    dataContratacao: input.dataContratacao ?? null,
    dataRenovacao: input.dataRenovacao ?? null,
  };
}

export const criarCredencial = defineAction(
  {
    modulo: "acessos",
    acao: "criar-credencial",
    recurso: "acessos",
    permissao: "gerir",
    entidade: "Credencial",
    schema: criarCredencialSchema,
    entidadeId: (d) => (d as { id: string }).id,
    // §26/§33: o AuditLog nunca vê o texto em claro.
    redact: ["usuario", "senha"],
  },
  async (input, ctx) => {
    const compartilhamentos = normalizarCompartilhamentos(input.compartilhamentos);
    const [usuarioEncriptado, senhaEncriptada] = await Promise.all([
      cifrar(input.usuario),
      cifrar(input.senha),
    ]);

    const cred = await prisma.credencial.create({
      data: {
        ...dadosEscalares(input),
        usuarioEncriptado,
        senhaEncriptada,
        criadoPorId: ctx.user.id,
        atualizadoPorId: ctx.user.id,
        tags: { create: input.tags.map((tag) => ({ tag })) },
        projetos: { create: input.projetoIds.map((projetoId) => ({ projetoId })) },
        compartilhamentos: { create: compartilhamentos },
      },
      select: { id: true },
    });

    revalidatePath(ROTA);
    return cred;
  },
);

export const atualizarCredencial = defineAction(
  {
    modulo: "acessos",
    acao: "atualizar-credencial",
    recurso: "acessos",
    permissao: "gerir",
    entidade: "Credencial",
    schema: atualizarCredencialSchema,
    entidadeId: (_d, i) => i.id,
    redact: ["usuario", "senha"],
    // Só os campos não sensíveis: o "antes" do AuditLog não pode carregar o blob cifrado
    // (não é plaintext, mas também não tem por que ficar duplicado no log).
    capturarAntes: async (input) =>
      prisma.credencial.findUnique({
        where: { id: input.id },
        select: {
          nome: true,
          nomeCompleto: true,
          categoriaId: true,
          estado: true,
          status: true,
          url: true,
          responsavelId: true,
          vencimentoEm: true,
          proximaRevisaoEm: true,
          renovacaoAutomatica: true,
        },
      }),
  },
  async (input, ctx) => {
    await exigir(ctx.user, input.id, "editar");

    // Campo em branco = "não mexer". Trocar a senha é ato deliberado; apagá-la por salvar o
    // cadastro com o campo vazio seria perda silenciosa de credencial.
    const [usuarioEncriptado, senhaEncriptada] = await Promise.all([
      cifrar(input.usuario),
      cifrar(input.senha),
    ]);

    await prisma.$transaction([
      prisma.credencialTag.deleteMany({ where: { credencialId: input.id } }),
      prisma.credencialProjeto.deleteMany({ where: { credencialId: input.id } }),
      prisma.credencial.update({
        where: { id: input.id },
        data: {
          ...dadosEscalares(input),
          ...(usuarioEncriptado ? { usuarioEncriptado } : {}),
          ...(senhaEncriptada ? { senhaEncriptada } : {}),
          atualizadoPorId: ctx.user.id,
          atualizadoEm: new Date(),
          tags: { create: input.tags.map((tag) => ({ tag })) },
          projetos: { create: input.projetoIds.map((projetoId) => ({ projetoId })) },
        },
      }),
    ]);

    revalidatePath(ROTA);
    revalidatePath(`${ROTA}/${input.id}`);
    return { id: input.id, senhaAlterada: senhaEncriptada !== undefined };
  },
);

/**
 * Substitui a política de compartilhamento inteira.
 *
 * Exige `acessos:permissoes` na tela E `gerenciarPermissoes` no registro — quem gere o cadastro
 * não redistribui acesso a ele por consequência (§29/§91). Ação separada de `atualizar` porque
 * §50 pede um evento de auditoria próprio (`credential_permissions_changed`): mudança de quem
 * alcança o cofre é a que alguém vai querer reconstituir depois.
 */
export const gerenciarCompartilhamento = defineAction(
  {
    modulo: "acessos",
    acao: "alterar-compartilhamento",
    recurso: "acessos",
    permissao: "permissoes",
    entidade: "Credencial",
    schema: gerenciarCompartilhamentoSchema,
    entidadeId: (_d, i) => i.id,
    capturarAntes: async (input) =>
      prisma.credencialCompartilhamento.findMany({
        where: { credencialId: input.id },
        select: {
          tipoAlvo: true,
          alvoId: true,
          podeVerCadastro: true,
          podeVerCredencial: true,
          podeEditar: true,
          podeGerenciarPermissoes: true,
        },
      }),
  },
  async (input, ctx) => {
    await exigir(ctx.user, input.id, "gerenciarPermissoes");
    const linhas = normalizarCompartilhamentos(input.compartilhamentos);

    await prisma.$transaction([
      prisma.credencialCompartilhamento.deleteMany({ where: { credencialId: input.id } }),
      ...(linhas.length
        ? [
            prisma.credencialCompartilhamento.createMany({
              data: linhas.map((l) => ({ ...l, credencialId: input.id })),
            }),
          ]
        : []),
      prisma.credencial.update({
        where: { id: input.id },
        data: { atualizadoPorId: ctx.user.id, atualizadoEm: new Date() },
      }),
    ]);

    revalidatePath(ROTA);
    revalidatePath(`${ROTA}/${input.id}`);
    return { id: input.id, total: linhas.length };
  },
);

/** Soft delete (§53) — o registro some das leituras, mas continua restaurável. */
export const desativarCredencial = defineAction(
  {
    modulo: "acessos",
    acao: "desativar-credencial",
    recurso: "acessos",
    permissao: "gerir",
    entidade: "Credencial",
    schema: idSchema,
    entidadeId: (_d, i) => i.id,
  },
  async (input, ctx) => {
    await exigir(ctx.user, input.id, "editar");
    await prisma.credencial.update({
      where: { id: input.id },
      data: { deletadoEm: new Date(), atualizadoPorId: ctx.user.id },
    });
    revalidatePath(ROTA);
    return { id: input.id };
  },
);

/**
 * Restaura um registro desativado. Exige `superUsuario`: uma vez soft-deletada, a credencial
 * sai do escopo de todo mundo (`escopoCredencial` filtra `deletadoEm: null`), então `exigir()`
 * responderia "não encontrado" mesmo para quem a criou — e afrouxar o escopo para permitir a
 * restauração abriria justamente a porta que o soft delete fechou.
 */
export const reativarCredencial = defineAction(
  {
    modulo: "acessos",
    acao: "reativar-credencial",
    recurso: "acessos",
    permissao: "gerir",
    entidade: "Credencial",
    schema: idSchema,
    entidadeId: (_d, i) => i.id,
  },
  async (input, ctx) => {
    if (!ctx.user.superUsuario) {
      throw new ActionError("Apenas um administrador pode restaurar um acesso desativado.");
    }
    await prisma.credencial.update({
      where: { id: input.id },
      data: { deletadoEm: null, atualizadoPorId: ctx.user.id },
    });
    revalidatePath(ROTA);
    return { id: input.id };
  },
);

/**
 * §44 — "marcar como revisada" NÃO troca a senha: declara que o portal ainda funciona, o
 * usuário está correto e o responsável está atualizado. Por isso exige `editar` e não
 * `verCredencial`: é uma afirmação sobre o cadastro, não leitura do segredo.
 */
export const marcarComoRevisada = defineAction(
  {
    modulo: "acessos",
    acao: "marcar-revisada",
    recurso: "acessos",
    permissao: "gerir",
    entidade: "Credencial",
    schema: idSchema,
    entidadeId: (_d, i) => i.id,
  },
  async (input, ctx) => {
    await exigir(ctx.user, input.id, "editar");
    const agora = new Date();
    await prisma.credencial.update({
      where: { id: input.id },
      data: { ultimaRevisaoEm: agora, atualizadoPorId: ctx.user.id },
    });
    revalidatePath(ROTA);
    revalidatePath(`${ROTA}/${input.id}`);
    return { id: input.id, revisadaEm: agora };
  },
);

/**
 * §41 — favorito é preferência individual: escreve só a linha do próprio usuário e não altera
 * nada compartilhado. Exige apenas `verCadastro` (não faz sentido favoritar o que não se vê),
 * e **não é auditado**: marcar uma estrela não é evento de segurança, e registrar cada clique
 * poluiria a trilha que §87 quer legível.
 */
export const alternarFavorito = defineAction(
  {
    modulo: "acessos",
    acao: "alternar-favorito",
    recurso: "acessos",
    permissao: "ver",
    schema: alternarFavoritoSchema,
    audit: false,
  },
  async (input, ctx) => {
    await exigir(ctx.user, input.id, "verCadastro");

    if (input.favorito) {
      await prisma.credencialFavorito.upsert({
        where: { userId_credencialId: { userId: ctx.user.id, credencialId: input.id } },
        create: { userId: ctx.user.id, credencialId: input.id },
        update: {},
      });
    } else {
      await prisma.credencialFavorito.deleteMany({
        where: { userId: ctx.user.id, credencialId: input.id },
      });
    }

    revalidatePath(ROTA);
    return { id: input.id, favorito: input.favorito };
  },
);
