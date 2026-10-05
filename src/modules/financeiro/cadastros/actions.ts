"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { exigirCamposValidos } from "@/lib/campos/exigir";
import { motivoCategoriaInvalida } from "@/modules/financeiro/categorias-regras";
import { ensureCanalSocios, type SincroniaCanal } from "@/modules/chat/service";
import { notificarNovosMembros, emitParaUsuario } from "@/lib/socket";
import {
  categoriaSchema,
  tipoCustoCategoriaSchema,
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
/** Árvore inteira, para a regra pura achar ciclo e pai de outro tipo (N6). */
async function arvoreDoPlano() {
  const todas = await prisma.categoriaFinanceira.findMany({ select: { id: true, paiId: true, tipo: true } });
  return new Map(todas.map((c) => [c.id, c]));
}

export const criarCategoria = defineAction(
  { ...base, acao: "criar-categoria", entidade: "CategoriaFinanceira", schema: categoriaSchema },
  async (i) => {
    const motivo = motivoCategoriaInvalida({ tipo: i.tipo, paiId: i.paiId || null, porId: await arvoreDoPlano() });
    if (motivo) throw new ActionError(motivo);
    const c = await prisma.categoriaFinanceira.create({
      data: { codigo: i.codigo, nome: i.nome, tipo: i.tipo, paiId: i.paiId || null },
    });
    rev();
    return { id: c.id };
  },
);
export const editarCategoria = defineAction(
  {
    ...base,
    acao: "editar-categoria",
    entidade: "CategoriaFinanceira",
    schema: categoriaEditSchema,
    capturarAntes: (i) => prisma.categoriaFinanceira.findUnique({ where: { id: i.id }, select: { codigo: true, nome: true, tipo: true, paiId: true, chave: true } }),
  },
  async (i) => {
    const atual = await prisma.categoriaFinanceira.findUnique({
      where: { id: i.id },
      select: { tipo: true, chave: true, _count: { select: { lancamentos: true } } },
    });
    if (!atual) throw new ActionError("Categoria não encontrada.");
    // Tipo de categoria em uso não muda; pai não pode ser ela mesma, descendente nem de outro tipo (N6).
    const motivo = motivoCategoriaInvalida({
      id: i.id,
      tipo: i.tipo,
      tipoAtual: atual.tipo,
      paiId: i.paiId || null,
      porId: await arvoreDoPlano(),
      lancamentos: atual._count.lancamentos,
      doSistema: atual.chave != null,
    });
    if (motivo) throw new ActionError(motivo);
    await prisma.categoriaFinanceira.update({
      where: { id: i.id },
      data: { codigo: i.codigo, nome: i.nome, tipo: i.tipo, paiId: i.paiId || null },
    });
    rev();
    return { id: i.id };
  },
);

/** Marca a despesa como custo fixo ou variável (ponto de equilíbrio em Indicadores); `null` volta a herdar da mãe. */
export const definirTipoCustoCategoria = defineAction(
  {
    ...base,
    acao: "definir-tipo-custo-categoria",
    entidade: "CategoriaFinanceira",
    schema: tipoCustoCategoriaSchema,
    capturarAntes: (i) => prisma.categoriaFinanceira.findUnique({ where: { id: i.id }, select: { codigo: true, nome: true, tipoCusto: true } }),
  },
  async (i) => {
    const c = await prisma.categoriaFinanceira.findUnique({ where: { id: i.id }, select: { tipo: true } });
    if (!c) throw new ActionError("Categoria não encontrada.");
    if (c.tipo !== "despesa") throw new ActionError("Custo fixo ou variável só vale para categoria de despesa.");
    await prisma.categoriaFinanceira.update({ where: { id: i.id }, data: { tipoCusto: i.tipoCusto } });
    rev();
    revalidatePath("/financeiro/indicadores");
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
const diaOuNulo = (d: string | undefined) => (d ? new Date(`${d}T00:00:00.000Z`) : null);

export const criarConta = defineAction(
  { ...base, acao: "criar-conta", entidade: "ContaBancaria", schema: contaBancariaSchema },
  async (i) => {
    if (i.padrao) await prisma.contaBancaria.updateMany({ data: { padrao: false } });
    const c = await prisma.contaBancaria.create({ data: { ...i, saldoInicialEm: diaOuNulo(i.saldoInicialEm) } });
    rev();
    return { id: c.id };
  },
);
export const editarConta = defineAction(
  {
    ...base,
    acao: "editar-conta",
    entidade: "ContaBancaria",
    schema: contaBancariaEditSchema,
    // N6: o saldo inicial mexe no caixa de todos os meses.
    capturarAntes: async (i) => {
      const c = await prisma.contaBancaria.findUnique({ where: { id: i.id }, select: { nome: true, tipo: true, saldoInicial: true, saldoInicialEm: true, padrao: true, ativo: true } });
      return c ? { ...c, saldoInicial: Number(c.saldoInicial) } : null;
    },
  },
  async (i) => {
    // Antes de qualquer escrita: só a agência que MUDOU é validada; a inválida já gravada segue salvando (D4).
    const antes = await prisma.contaBancaria.findUnique({ where: { id: i.id }, select: { agencia: true } });
    exigirCamposValidos(i, antes, { agencia: "agencia" });
    const { id, ...rest } = i;
    if (rest.padrao) await prisma.contaBancaria.updateMany({ data: { padrao: false } });
    await prisma.contaBancaria.update({ where: { id }, data: { ...rest, saldoInicialEm: diaOuNulo(rest.saldoInicialEm) } });
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
    // Antes de qualquer escrita: só o valor que MUDOU é validado; o inválido já gravado segue salvando (D4).
    const antes = await prisma.fornecedor.findUnique({
      where: { id: i.id },
      select: { documento: true, email: true, telefone: true },
    });
    exigirCamposValidos(i, antes, { documento: "cpfCnpj", email: "email", telefone: "telefone" });
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

/** Reflete ao vivo no chat as entradas/saídas do grupo "Sócios" (C: grupo de sócios). */
function propagarGrupoSocios(s: SincroniaCanal) {
  notificarNovosMembros(s.adicionados);
  for (const r of s.removidos) emitParaUsuario(r.userId, "sair-canal", { canalId: r.canalId });
}

export const criarSocio = defineAction(
  { ...base, acao: "criar-socio", entidade: "Socio", schema: socioSchema },
  async (i) => {
    const existe = await prisma.socio.findUnique({ where: { userId: i.userId } });
    if (existe?.ativo) throw new ActionError("Usuário já é sócio.");
    // Registro inativo (desativado no cadastro de usuários): reativa preservando retiradas.
    const c = existe
      ? await prisma.socio.update({ where: { id: existe.id }, data: { ativo: true, percentual: i.percentual } })
      : await prisma.socio.create({ data: { userId: i.userId, percentual: i.percentual } });
    rev();
    propagarGrupoSocios(await ensureCanalSocios());
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
    propagarGrupoSocios(await ensureCanalSocios());
    return { id: i.id };
  },
);

// ── Retiradas de sócio (A5) ───────────────────────────────────
/**
 * CONGELADA como histórico (F6D do planejador financeiro). `RetiradaSocio` era um registro paralelo:
 * não virava `Lancamento`, então não entrava no caixa, na projeção nem na DRE. Hoje toda retirada é
 * dinheiro de verdade: pró-labore é compromisso recorrente (Cadastros → Recorrentes) e lucros saem
 * pelos botões Distribuir/Adiantar, que criam conta a pagar por sócio.
 *
 * A ação fica no lugar, recusando: o formulário saiu da tela, mas uma aba aberta de antes ainda
 * poderia chamá-la — e o certo é dizer onde se faz agora, não gravar no registro congelado.
 * Remover continua liberado: o histórico é corrigível.
 */
export const criarRetiradaSocio = defineAction(
  {
    ...base,
    acao: "criar-retirada-socio",
    entidade: "RetiradaSocio",
    schema: z.object({
      socioId: z.string().min(1),
      data: z.string().min(1, "Informe a data."),
      valor: z.number().positive("Informe o valor."),
      tipo: z.enum(["pro_labore", "distribuicao", "adiantamento"]),
      observacao: z.string().optional().or(z.literal("")),
    }),
  },
  async () => {
    throw new ActionError(
      "Esta lista virou só histórico. Pró-labore se cadastra em Compromissos recorrentes e os lucros saem por " +
        "“Distribuir lucros” ou “Adiantar lucros” — os três criam conta a pagar e entram no caixa.",
    );
  },
);

export const removerRetiradaSocio = defineAction(
  { ...base, acao: "remover-retirada-socio", entidade: "RetiradaSocio", schema: idSchema },
  async (i) => {
    await prisma.retiradaSocio.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);

// ── Catálogo de serviços de fornecedor (A7) ───────────────────
export const criarFornecedorServico = defineAction(
  {
    ...base,
    acao: "criar-forn-servico",
    entidade: "FornecedorServico",
    schema: z.object({
      fornecedorId: z.string().min(1),
      descricao: z.string().min(1, "Informe a descrição."),
      valorReferencia: z.number().min(0).optional(),
    }),
  },
  async (i) => {
    await prisma.fornecedorServico.create({
      data: { fornecedorId: i.fornecedorId, descricao: i.descricao, valorReferencia: i.valorReferencia ?? null },
    });
    rev();
    return { ok: true };
  },
);

export const removerFornecedorServico = defineAction(
  { ...base, acao: "remover-forn-servico", entidade: "FornecedorServico", schema: idSchema },
  async (i) => {
    await prisma.fornecedorServico.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);
