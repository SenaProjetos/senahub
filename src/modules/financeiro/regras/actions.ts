"use server";

import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import {
  ativarRegraSchema,
  idRegraSchema,
  moverRegraSchema,
  regraDeLancamentoSchema,
  regraSchema,
  simularRegraSchema,
  sugestaoAoLancarSchema,
} from "@/modules/financeiro/regras/schemas";
import { casamentosDoHistorico, sugerirParaEntrada } from "@/modules/financeiro/regras/service";
import { rotuloDosCampos } from "@/modules/financeiro/regras/motor";

const base = { modulo: "financeiro", recurso: "financeiro", permissao: "gerir" } as const;
const rev = () => revalidatePath("/financeiro/regras");

const vazioParaNulo = (v: string | null | undefined) => (v ? v : null);

/** Cria ou edita uma regra. Regra nova entra no FIM da lista (a ordem é de quem a edita depois). */
export const salvarRegra = defineAction(
  {
    ...base,
    acao: "salvar-regra-preenchimento",
    entidade: "RegraCategorizacao",
    schema: regraSchema,
    entidadeId: (d, i) => ((d ?? i) as { id?: string }).id ?? "nova",
    capturarAntes: (i) => (i.id ? prisma.regraCategorizacao.findUnique({ where: { id: i.id } }) : Promise.resolve(null)),
  },
  async (i) => {
    const dados = {
      condicoes: i.condicoes,
      // `termo` segue gravado para quem ainda lê a regra simples: o texto da primeira condição de descrição.
      termo: String(i.condicoes.find((c) => c.campo === "descricao")?.valor ?? ""),
      categoriaId: vazioParaNulo(i.categoriaId),
      centroId: vazioParaNulo(i.centroId),
      formaId: vazioParaNulo(i.formaId),
      projetoId: vazioParaNulo(i.projetoId),
      fornecedorId: vazioParaNulo(i.fornecedorId),
      clienteId: vazioParaNulo(i.clienteId),
      tags: [...new Set(i.tags)],
      ativo: i.ativo,
    };
    if (i.id) {
      const existe = await prisma.regraCategorizacao.count({ where: { id: i.id } });
      if (!existe) throw new ActionError("Regra não encontrada.");
      await prisma.regraCategorizacao.update({ where: { id: i.id }, data: dados });
      rev();
      return { id: i.id };
    }
    const fim = await prisma.regraCategorizacao.aggregate({ _max: { ordem: true } });
    const r = await prisma.regraCategorizacao.create({ data: { ...dados, ordem: (fim._max.ordem ?? -1) + 1 } });
    rev();
    return { id: r.id };
  },
);

export const excluirRegra = defineAction(
  { ...base, acao: "excluir-regra-preenchimento", entidade: "RegraCategorizacao", schema: idRegraSchema, entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
    capturarAntes: (i) => prisma.regraCategorizacao.findUnique({ where: { id: i.id } }) },
  async (i) => {
    const r = await prisma.regraCategorizacao.deleteMany({ where: { id: i.id } });
    if (r.count !== 1) throw new ActionError("Regra não encontrada.");
    rev();
    return { id: i.id };
  },
);

export const duplicarRegra = defineAction(
  { ...base, acao: "duplicar-regra-preenchimento", entidade: "RegraCategorizacao", schema: idRegraSchema, entidadeId: (d, i) => ((d ?? i) as { id: string }).id },
  async (i) => {
    const r = await prisma.regraCategorizacao.findUnique({ where: { id: i.id } });
    if (!r) throw new ActionError("Regra não encontrada.");
    const fim = await prisma.regraCategorizacao.aggregate({ _max: { ordem: true } });
    // Nasce PAUSADA: duas regras iguais ativas fariam a segunda nunca valer, e a cópia é para ser editada antes.
    const { id: _id, usos: _u, ultimoUsoEm: _ult, createdAt: _c, updatedAt: _up, ...resto } = r;
    void _id; void _u; void _ult; void _c; void _up;
    const nova = await prisma.regraCategorizacao.create({ data: { ...resto, condicoes: resto.condicoes ?? [], ativo: false, ordem: (fim._max.ordem ?? -1) + 1 } });
    rev();
    return { id: nova.id };
  },
);

export const alternarAtivaRegra = defineAction(
  { ...base, acao: "alternar-regra-preenchimento", entidade: "RegraCategorizacao", schema: ativarRegraSchema, entidadeId: (d, i) => ((d ?? i) as { id: string }).id },
  async (i) => {
    const r = await prisma.regraCategorizacao.updateMany({ where: { id: i.id }, data: { ativo: i.ativo } });
    if (r.count !== 1) throw new ActionError("Regra não encontrada.");
    rev();
    return { id: i.id };
  },
);

/** Sobe ou desce uma posição na lista: troca a ordem com a vizinha (a ordem é compacta e sem buracos). */
export const moverRegra = defineAction(
  { ...base, acao: "mover-regra-preenchimento", entidade: "RegraCategorizacao", schema: moverRegraSchema, entidadeId: (d, i) => ((d ?? i) as { id: string }).id },
  async (i) => {
    await prisma.$transaction(async (tx) => {
      const todas = await tx.regraCategorizacao.findMany({ orderBy: [{ ordem: "asc" }, { id: "asc" }], select: { id: true } });
      const pos = todas.findIndex((r) => r.id === i.id);
      if (pos < 0) throw new ActionError("Regra não encontrada.");
      const alvo = i.direcao === "subir" ? pos - 1 : pos + 1;
      if (alvo < 0 || alvo >= todas.length) throw new ActionError(i.direcao === "subir" ? "Já é a primeira da lista." : "Já é a última da lista.");
      const ids = todas.map((r) => r.id);
      [ids[pos], ids[alvo]] = [ids[alvo], ids[pos]];
      for (let n = 0; n < ids.length; n++) await tx.regraCategorizacao.update({ where: { id: ids[n] }, data: { ordem: n } });
    });
    rev();
    return { id: i.id };
  },
);

/** Prévia do editor: quantos lançamentos dos últimos 12 meses as condições casariam. Não grava nem audita. */
export const simularRegra = defineAction(
  { ...base, acao: "simular-regra-preenchimento", entidade: "RegraCategorizacao", schema: simularRegraSchema, audit: false },
  async (i) => casamentosDoHistorico(i.condicoes, i.listar ? 30 : 0),
);

/** "Criar regra a partir deste lançamento": descrição contém o termo → categoria (e centro/projeto, se marcado). */
export const criarRegraDeLancamento = defineAction(
  { ...base, acao: "criar-regra-de-lancamento", entidade: "RegraCategorizacao", schema: regraDeLancamentoSchema, entidadeId: (d, i) => ((d ?? i) as { lancamentoId: string }).lancamentoId },
  async (i) => {
    const l = await prisma.lancamento.findUnique({
      where: { id: i.lancamentoId },
      select: { tipo: true, categoriaId: true, centroId: true, projetoId: true },
    });
    if (!l) throw new ActionError("Lançamento não encontrado.");
    const fim = await prisma.regraCategorizacao.aggregate({ _max: { ordem: true } });
    const r = await prisma.regraCategorizacao.create({
      data: {
        termo: i.termo,
        condicoes: [{ campo: "descricao", op: "contem", valor: i.termo }, { campo: "tipo", op: "igual", valor: l.tipo }],
        categoriaId: i.usarCategoria ? l.categoriaId : null,
        centroId: i.usarCentroEProjeto ? l.centroId : null,
        projetoId: i.usarCentroEProjeto ? l.projetoId : null,
        ordem: (fim._max.ordem ?? -1) + 1,
      },
    });
    if (!i.usarCategoria && !i.usarCentroEProjeto) throw new ActionError("Marque o que a regra deve preencher.");
    rev();
    return { id: r.id };
  },
);

/** Sugestão ao lançar à mão: o formulário pergunta depois da descrição e aplica só nos campos vazios. */
export const sugerirPreenchimentoAoLancar = defineAction(
  { ...base, acao: "sugerir-preenchimento", entidade: "RegraCategorizacao", schema: sugestaoAoLancarSchema, audit: false },
  async (i) => {
    const s = await sugerirParaEntrada(
      prisma,
      { descricao: i.descricao, tipo: i.tipo, valor: i.valor, contaId: vazioParaNulo(i.contaId) },
      {
        categoriaId: i.categoriaId, centroId: i.centroId, formaId: i.formaId, projetoId: i.projetoId,
        fornecedorId: i.fornecedorId, clienteId: i.clienteId, tags: i.tags,
      },
    );
    if (!s) return { sugestao: null };
    return { sugestao: { regraId: s.regraId, preenche: s.preenche, rotulo: rotuloDosCampos(s.campos) } };
  },
);
