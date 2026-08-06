"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import {
  certidaoSchema,
  editarCertidaoSchema,
  idSchema,
  criarTipoCertidaoSchema,
  editarTipoCertidaoSchema,
  criarLinkCertidoesSchema,
  atualizarLinkCertidoesSchema,
} from "./schemas";

const base = { modulo: "certidoes", recurso: "certidoes", permissao: "gerir" } as const;
const rev = () => revalidatePath("/certidoes");

export const criarCertidao = defineAction(
  { ...base, acao: "criar-certidao", entidade: "Certidao", schema: certidaoSchema },
  async (i) => {
    const c = await prisma.certidao.create({
      data: { tipoId: i.tipoId, descricao: i.descricao || null, validade: new Date(i.validade) },
    });
    rev();
    return { id: c.id };
  },
);

export const editarCertidao = defineAction(
  {
    ...base,
    acao: "editar-certidao",
    entidade: "Certidao",
    schema: editarCertidaoSchema,
    capturarAntes: (i) => prisma.certidao.findUnique({ where: { id: i.id } }),
  },
  async (i) => {
    await prisma.certidao.update({
      where: { id: i.id },
      data: { descricao: i.descricao || null, responsavelId: i.responsavelId || null },
    });
    rev();
    return { id: i.id };
  },
);

export const excluirCertidao = defineAction(
  { ...base, acao: "excluir-certidao", entidade: "Certidao", schema: idSchema },
  async (i) => {
    const c = await prisma.certidao.findUnique({ where: { id: i.id } });
    if (!c) throw new ActionError("Certidão não encontrada.");

    const referencias = await prisma.licitacaoHabilitacaoItem.count({ where: { certidaoId: i.id } });
    if (referencias > 0) {
      throw new ActionError(
        `Esta certidão está vinculada a ${referencias} item(ns) de habilitação de licitação — remova o vínculo antes de excluir.`,
      );
    }

    await prisma.certidao.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);

// ── Tipos de certidão (catálogo) ──────────────────────────────
export const criarTipoCertidao = defineAction(
  { ...base, acao: "criar-tipo-certidao", entidade: "CertidaoTipo", schema: criarTipoCertidaoSchema },
  async (i) => {
    const existente = await prisma.certidaoTipo.findUnique({ where: { nome: i.nome } });
    if (existente) throw new ActionError("Já existe um tipo com esse nome.");
    const t = await prisma.certidaoTipo.create({ data: { nome: i.nome, obrigatoria: i.obrigatoria } });
    rev();
    return { id: t.id };
  },
);

export const editarTipoCertidao = defineAction(
  {
    ...base,
    acao: "editar-tipo-certidao",
    entidade: "CertidaoTipo",
    schema: editarTipoCertidaoSchema,
    capturarAntes: (i) => prisma.certidaoTipo.findUnique({ where: { id: i.id } }),
  },
  async (i) => {
    const duplicado = await prisma.certidaoTipo.findFirst({ where: { nome: i.nome, NOT: { id: i.id } } });
    if (duplicado) throw new ActionError("Já existe um tipo com esse nome.");
    await prisma.certidaoTipo.update({ where: { id: i.id }, data: { nome: i.nome, obrigatoria: i.obrigatoria } });
    rev();
    return { id: i.id };
  },
);

export const excluirTipoCertidao = defineAction(
  { ...base, acao: "excluir-tipo-certidao", entidade: "CertidaoTipo", schema: idSchema },
  async (i) => {
    const referencias = await prisma.certidao.count({ where: { tipoId: i.id } });
    if (referencias > 0) {
      throw new ActionError(`Este tipo tem ${referencias} certidão(ões) cadastrada(s) — não é possível excluir.`);
    }
    await prisma.certidaoTipo.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);

/** Gera um link público (sem login) somente-leitura para o conjunto de certidões informado. */
export const criarLinkCertidoes = defineAction(
  { ...base, acao: "criar-link-certidoes", entidade: "LinkPublicoCertidoes", schema: criarLinkCertidoesSchema },
  async (i, { user }) => {
    const token = randomBytes(18).toString("hex");
    const link = await prisma.linkPublicoCertidoes.create({
      data: {
        token,
        certidaoIds: i.certidaoIds,
        expiraEm: i.expiraEm ? new Date(i.expiraEm) : null,
        criadoPorId: user.id,
      },
    });
    rev();
    return { id: link.id, token: link.token };
  },
);

/** Atualiza a whitelist/validade/estado de um link já existente. */
export const atualizarLinkCertidoes = defineAction(
  {
    ...base,
    acao: "atualizar-link-certidoes",
    entidade: "LinkPublicoCertidoes",
    schema: atualizarLinkCertidoesSchema,
    capturarAntes: (i) => prisma.linkPublicoCertidoes.findUnique({ where: { id: i.id } }),
  },
  async (i) => {
    await prisma.linkPublicoCertidoes.update({
      where: { id: i.id },
      data: {
        certidaoIds: i.certidaoIds,
        ativo: i.ativo,
        expiraEm: i.expiraEm ? new Date(i.expiraEm) : null,
      },
    });
    rev();
    return { id: i.id };
  },
);

/** Revoga (desativa) um link público na hora. */
export const revogarLinkCertidoes = defineAction(
  { ...base, acao: "revogar-link-certidoes", entidade: "LinkPublicoCertidoes", schema: idSchema },
  async (i) => {
    await prisma.linkPublicoCertidoes.update({ where: { id: i.id }, data: { ativo: false } });
    rev();
    return { id: i.id };
  },
);
