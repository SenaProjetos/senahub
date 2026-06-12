"use server";

import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import {
  categoriaSchema,
  categoriaEditSchema,
  centroSchema,
  centroEditSchema,
  contaBancariaSchema,
  contaBancariaEditSchema,
  formaPagamentoSchema,
  formaPagamentoEditSchema,
  fornecedorSchema,
  fornecedorEditSchema,
  socioSchema,
  socioEditSchema,
  idSchema,
  toggleSchema,
} from "@/modules/financeiro/cadastros/schemas";

const PATH = "/financeiro/cadastros";
const base = { modulo: "financeiro", recurso: "financeiro", permissao: "gerir" } as const;
const rev = () => revalidatePath(PATH);

// ── Categorias (plano de contas) ──────────────────────────────
export const criarCategoria = defineAction(
  { ...base, acao: "criar-categoria", entidade: "CategoriaFinanceira", schema: categoriaSchema },
  async (i) => {
    const c = await prisma.categoriaFinanceira.create({
      data: { codigo: i.codigo, nome: i.nome, tipo: i.tipo, paiId: i.paiId || null },
    });
    rev();
    return { id: c.id };
  },
);
export const editarCategoria = defineAction(
  { ...base, acao: "editar-categoria", entidade: "CategoriaFinanceira", schema: categoriaEditSchema },
  async (i) => {
    await prisma.categoriaFinanceira.update({
      where: { id: i.id },
      data: { codigo: i.codigo, nome: i.nome, tipo: i.tipo, paiId: i.paiId || null },
    });
    rev();
    return { id: i.id };
  },
);

// ── Centros de custo ──────────────────────────────────────────
export const criarCentro = defineAction(
  { ...base, acao: "criar-centro", entidade: "CentroCusto", schema: centroSchema },
  async (i) => {
    const c = await prisma.centroCusto.create({ data: { nome: i.nome } });
    rev();
    return { id: c.id };
  },
);
export const editarCentro = defineAction(
  { ...base, acao: "editar-centro", entidade: "CentroCusto", schema: centroEditSchema },
  async (i) => {
    await prisma.centroCusto.update({ where: { id: i.id }, data: { nome: i.nome } });
    rev();
    return { id: i.id };
  },
);

// ── Contas bancárias ──────────────────────────────────────────
export const criarConta = defineAction(
  { ...base, acao: "criar-conta", entidade: "ContaBancaria", schema: contaBancariaSchema },
  async (i) => {
    if (i.padrao) await prisma.contaBancaria.updateMany({ data: { padrao: false } });
    const c = await prisma.contaBancaria.create({ data: i });
    rev();
    return { id: c.id };
  },
);
export const editarConta = defineAction(
  { ...base, acao: "editar-conta", entidade: "ContaBancaria", schema: contaBancariaEditSchema },
  async (i) => {
    const { id, ...rest } = i;
    if (rest.padrao) await prisma.contaBancaria.updateMany({ data: { padrao: false } });
    await prisma.contaBancaria.update({ where: { id }, data: rest });
    rev();
    return { id };
  },
);

// ── Formas de pagamento ───────────────────────────────────────
export const criarForma = defineAction(
  { ...base, acao: "criar-forma", entidade: "FormaPagamento", schema: formaPagamentoSchema },
  async (i) => {
    const c = await prisma.formaPagamento.create({ data: { nome: i.nome } });
    rev();
    return { id: c.id };
  },
);
export const editarForma = defineAction(
  { ...base, acao: "editar-forma", entidade: "FormaPagamento", schema: formaPagamentoEditSchema },
  async (i) => {
    await prisma.formaPagamento.update({ where: { id: i.id }, data: { nome: i.nome } });
    rev();
    return { id: i.id };
  },
);

// ── Fornecedores ──────────────────────────────────────────────
export const criarFornecedor = defineAction(
  { ...base, acao: "criar-fornecedor", entidade: "Fornecedor", schema: fornecedorSchema },
  async (i) => {
    const c = await prisma.fornecedor.create({ data: { ...i, email: i.email || null } });
    rev();
    return { id: c.id };
  },
);
export const editarFornecedor = defineAction(
  { ...base, acao: "editar-fornecedor", entidade: "Fornecedor", schema: fornecedorEditSchema },
  async (i) => {
    const { id, ...rest } = i;
    await prisma.fornecedor.update({ where: { id }, data: { ...rest, email: rest.email || null } });
    rev();
    return { id };
  },
);
export const alternarFornecedor = defineAction(
  { ...base, acao: "alternar-fornecedor", entidade: "Fornecedor", schema: toggleSchema },
  async (i) => {
    await prisma.fornecedor.update({ where: { id: i.id }, data: { ativo: i.ativo } });
    rev();
    return { id: i.id };
  },
);

// ── Sócios ────────────────────────────────────────────────────
export const criarSocio = defineAction(
  { ...base, acao: "criar-socio", entidade: "Socio", schema: socioSchema },
  async (i) => {
    const existe = await prisma.socio.findUnique({ where: { userId: i.userId } });
    if (existe) throw new ActionError("Usuário já é sócio.");
    const c = await prisma.socio.create({ data: { userId: i.userId, percentual: i.percentual } });
    rev();
    return { id: c.id };
  },
);
export const editarSocio = defineAction(
  { ...base, acao: "editar-socio", entidade: "Socio", schema: socioEditSchema },
  async (i) => {
    await prisma.socio.update({ where: { id: i.id }, data: { percentual: i.percentual } });
    rev();
    return { id: i.id };
  },
);
export const removerSocio = defineAction(
  { ...base, acao: "remover-socio", entidade: "Socio", schema: idSchema },
  async (i) => {
    await prisma.socio.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);
