import "server-only";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/action-error";
import type { Prisma } from "@/generated/prisma/client";
import {
  montarArvore,
  calcularCodigosWbs,
  rollUp,
  recalcularIncremental,
  type NoOrcamento,
  type Totais,
} from "../orcamento-arvore";
import { calcularCustoUnitario, type ItemComposicaoRef } from "../composicoes/composicao";
import { duplicarItens, type ItemParaDuplicar } from "./duplicar-orcamento";
import { relatorioImpacto, itensParaAtualizar, type ItemParaTroca, type RelatorioImpacto } from "./troca-data-base";

type Tx = Prisma.TransactionClient;

// ── Carregamento da árvore ───────────────────────────────────────

type LinhaItem = {
  id: string;
  parentId: string | null;
  tipo: "grupo" | "servico";
  ordem: number;
  quantidade: Prisma.Decimal;
  custoUnitario: Prisma.Decimal;
  bdiPercentual: Prisma.Decimal | null;
  bloqueado: boolean;
  codigo: string;
};

function paraNo(l: LinhaItem): NoOrcamento {
  return {
    id: l.id,
    parentId: l.parentId,
    tipo: l.tipo,
    ordem: l.ordem,
    quantidade: Number(l.quantidade),
    custoUnitario: Number(l.custoUnitario),
    bdiPercentual: l.bdiPercentual === null ? null : Number(l.bdiPercentual),
    bloqueado: l.bloqueado,
  };
}

const SELECT_ITEM = {
  id: true,
  parentId: true,
  tipo: true,
  ordem: true,
  quantidade: true,
  custoUnitario: true,
  bdiPercentual: true,
  bloqueado: true,
  codigo: true,
} as const;

async function carregarNos(db: Tx | typeof prisma, orcamentoId: string): Promise<NoOrcamento[]> {
  const linhas = await db.custoOrcamentoItem.findMany({ where: { orcamentoId }, select: SELECT_ITEM });
  return linhas.map(paraNo);
}

async function bdiDoOrcamento(db: Tx | typeof prisma, orcamentoId: string): Promise<number> {
  const orc = await db.custoOrcamento.findUnique({ where: { id: orcamentoId }, select: { bdiPercentual: true } });
  return orc?.bdiPercentual === null || orc?.bdiPercentual === undefined ? 0 : Number(orc.bdiPercentual);
}

// ── Roll-up persistido (design §7) ───────────────────────────────

async function gravarTotais(db: Tx, alterados: Map<string, Totais>, anteriores: Map<string, Totais>) {
  const updates: Promise<unknown>[] = [];
  for (const [id, t] of alterados) {
    const antes = anteriores.get(id);
    if (antes && antes.totalSemBdi === t.totalSemBdi && antes.totalComBdi === t.totalComBdi) continue;
    updates.push(
      db.custoOrcamentoItem.update({
        where: { id },
        data: { totalSemBdi: t.totalSemBdi, totalComBdi: t.totalComBdi },
      }),
    );
  }
  await Promise.all(updates);
}

async function totaisAtuais(db: Tx | typeof prisma, orcamentoId: string): Promise<Map<string, Totais>> {
  const linhas = await db.custoOrcamentoItem.findMany({
    where: { orcamentoId },
    select: { id: true, totalSemBdi: true, totalComBdi: true },
  });
  return new Map(
    linhas.map((l) => [l.id, { totalSemBdi: Number(l.totalSemBdi), totalComBdi: Number(l.totalComBdi) }]),
  );
}

/**
 * Recalcula APENAS o caminho do nó alterado até a raiz e grava (design §7 — nunca varre a
 * árvore inteira por edição). Use `recalcularSubarvoreCompleta` quando o BDI de um GRUPO mudar,
 * porque aí a herança afeta toda a subárvore.
 */
export async function recalcularCaminho(db: Tx, orcamentoId: string, noAlteradoId: string) {
  const [nos, bdi, anteriores] = await Promise.all([
    carregarNos(db, orcamentoId),
    bdiDoOrcamento(db, orcamentoId),
    totaisAtuais(db, orcamentoId),
  ]);
  const r = recalcularIncremental(nos, noAlteradoId, bdi, anteriores);
  if (!r.ok) throw new ActionError(r.erro);
  await gravarTotais(db, r.totais, anteriores);
}

/** Roll-up completo do orçamento — usado quando a herança de BDI muda ou após operações em lote. */
async function recalcularTudo(db: Tx, orcamentoId: string) {
  const [nos, bdi, anteriores] = await Promise.all([
    carregarNos(db, orcamentoId),
    bdiDoOrcamento(db, orcamentoId),
    totaisAtuais(db, orcamentoId),
  ]);
  const arv = montarArvore(nos);
  if (!arv.ok) throw new ActionError(arv.erro);
  await gravarTotais(db, rollUp(arv.raizes, bdi), anteriores);
}

/**
 * Recalcula os códigos WBS e grava só os que mudaram. `@@unique([orcamentoId, codigo])` colide
 * durante a troca (1↔2), então a gravação é em DUAS FASES — código temporário e depois o final —
 * mas apenas sobre o conjunto que mudou, nunca sobre a árvore inteira.
 */
async function reindexarWbs(db: Tx, orcamentoId: string) {
  const linhas = await db.custoOrcamentoItem.findMany({ where: { orcamentoId }, select: SELECT_ITEM });
  const arv = montarArvore(linhas.map(paraNo));
  if (!arv.ok) throw new ActionError(arv.erro);

  const novos = calcularCodigosWbs(arv.raizes);
  const mudaram = linhas.filter((l) => novos.get(l.id) !== l.codigo);
  if (mudaram.length === 0) return;

  for (const l of mudaram) {
    await db.custoOrcamentoItem.update({ where: { id: l.id }, data: { codigo: `~${l.id}` } });
  }
  for (const l of mudaram) {
    await db.custoOrcamentoItem.update({ where: { id: l.id }, data: { codigo: novos.get(l.id)! } });
  }
}

// ── Custo a partir de composição (materialização, design §7) ─────

/** Resolve o custo unitário de uma composição contra uma base de preço. */
export async function custoDaComposicao(
  db: Tx | typeof prisma,
  composicaoId: string,
  basePrecoId: string,
): Promise<{ custo: number; semPreco: string[] } | { erro: string }> {
  const itens = await db.custoComposicaoItem.findMany({
    where: { composicao: { id: composicaoId } },
    select: { composicaoId: true, tipo: true, insumoId: true, composicaoAuxId: true, coeficiente: true },
  });
  // Carrega o subgrafo inteiro de auxiliares de uma vez (evita N+1 na recursão).
  const visitados = new Set<string>([composicaoId]);
  const porComposicao = new Map<string, ItemComposicaoRef[]>();
  let fronteira = [composicaoId];
  let todos = itens;

  while (fronteira.length > 0) {
    for (const compId of fronteira) {
      porComposicao.set(
        compId,
        todos
          .filter((i) => i.composicaoId === compId)
          .map((i) => ({
            tipo: i.tipo,
            refId: i.tipo === "insumo" ? i.insumoId! : i.composicaoAuxId!,
            coeficiente: Number(i.coeficiente),
          })),
      );
    }
    const proximos = todos
      .filter((i) => i.tipo === "composicao" && i.composicaoAuxId && !visitados.has(i.composicaoAuxId))
      .map((i) => i.composicaoAuxId!);
    for (const p of proximos) visitados.add(p);
    fronteira = [...new Set(proximos)];
    if (fronteira.length > 0) {
      todos = await db.custoComposicaoItem.findMany({
        where: { composicaoId: { in: fronteira } },
        select: { composicaoId: true, tipo: true, insumoId: true, composicaoAuxId: true, coeficiente: true },
      });
    }
  }

  const insumoIds = [...porComposicao.values()].flat().filter((i) => i.tipo === "insumo").map((i) => i.refId);
  const precos = await db.custoPreco.findMany({
    where: { baseId: basePrecoId, insumoId: { in: [...new Set(insumoIds)] } },
    select: { insumoId: true, valor: true },
  });
  const precoPorInsumo = new Map(precos.map((p) => [p.insumoId, Number(p.valor)]));

  const r = calcularCustoUnitario(
    composicaoId,
    (id) => porComposicao.get(id),
    (id) => precoPorInsumo.get(id),
  );
  if (!r.ok) return { erro: r.erro };
  return { custo: r.custoUnitario, semPreco: r.semPreco };
}

// ── CRUD de item ─────────────────────────────────────────────────

export async function exigirOrcamentoEditavel(db: Tx | typeof prisma, orcamentoId: string) {
  const orc = await db.custoOrcamento.findUnique({
    where: { id: orcamentoId },
    select: { id: true, status: true, basePrecoId: true },
  });
  if (!orc) throw new ActionError("Orçamento não encontrado.");
  if (orc.status === "cancelado") throw new ActionError("Orçamento cancelado não pode ser editado.");
  return orc;
}

export async function criarItem(input: {
  orcamentoId: string;
  parentId: string | null;
  tipo: "grupo" | "servico";
  descricao: string;
  unidade?: string | null;
  quantidade?: number;
  custoUnitario?: number;
}) {
  return prisma.$transaction(async (db) => {
    await exigirOrcamentoEditavel(db, input.orcamentoId);
    if (input.parentId) {
      const pai = await db.custoOrcamentoItem.findFirst({
        where: { id: input.parentId, orcamentoId: input.orcamentoId },
        select: { tipo: true },
      });
      if (!pai) throw new ActionError("Item pai não encontrado neste orçamento.");
      if (pai.tipo !== "grupo") throw new ActionError("Só é possível adicionar itens dentro de um grupo.");
    }

    const max = await db.custoOrcamentoItem.aggregate({
      where: { orcamentoId: input.orcamentoId, parentId: input.parentId },
      _max: { ordem: true },
    });

    const item = await db.custoOrcamentoItem.create({
      data: {
        orcamentoId: input.orcamentoId,
        parentId: input.parentId,
        tipo: input.tipo,
        // Código provisório único; `reindexarWbs` grava o definitivo em seguida.
        codigo: `~novo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ordem: (max._max.ordem ?? -1) + 1,
        descricao: input.descricao,
        unidade: input.unidade ?? null,
        quantidade: input.quantidade ?? 0,
        custoUnitario: input.custoUnitario ?? 0,
      },
    });

    await reindexarWbs(db, input.orcamentoId);
    await recalcularCaminho(db, input.orcamentoId, item.id);
    return item;
  });
}

export async function editarItem(input: {
  id: string;
  descricao?: string;
  unidade?: string | null;
  quantidade?: number;
  custoUnitario?: number;
  bdiPercentual?: number | null;
}) {
  return prisma.$transaction(async (db) => {
    const atual = await db.custoOrcamentoItem.findUnique({
      where: { id: input.id },
      select: { id: true, orcamentoId: true, tipo: true, bloqueado: true },
    });
    if (!atual) throw new ActionError("Item não encontrado.");
    await exigirOrcamentoEditavel(db, atual.orcamentoId);
    if (atual.bloqueado && input.custoUnitario !== undefined) {
      throw new ActionError("Item travado — destrave antes de alterar o custo.");
    }

    const item = await db.custoOrcamentoItem.update({
      where: { id: input.id },
      data: {
        ...(input.descricao !== undefined ? { descricao: input.descricao } : {}),
        ...(input.unidade !== undefined ? { unidade: input.unidade } : {}),
        ...(input.quantidade !== undefined ? { quantidade: input.quantidade } : {}),
        ...(input.custoUnitario !== undefined
          ? { custoUnitario: input.custoUnitario, composicaoId: null, basePrecoUsadaId: null, custoCalculadoEm: new Date() }
          : {}),
        ...(input.bdiPercentual !== undefined ? { bdiPercentual: input.bdiPercentual } : {}),
      },
    });

    // BDI de grupo muda a herança da subárvore inteira; os demais campos só afetam o caminho.
    if (input.bdiPercentual !== undefined && atual.tipo === "grupo") {
      await recalcularTudo(db, atual.orcamentoId);
    } else {
      await recalcularCaminho(db, atual.orcamentoId, input.id);
    }
    return item;
  });
}

export async function moverItem(input: { id: string; direcao: "cima" | "baixo" }) {
  return prisma.$transaction(async (db) => {
    const item = await db.custoOrcamentoItem.findUnique({
      where: { id: input.id },
      select: { id: true, orcamentoId: true, parentId: true, ordem: true },
    });
    if (!item) throw new ActionError("Item não encontrado.");
    await exigirOrcamentoEditavel(db, item.orcamentoId);

    const irmaos = await db.custoOrcamentoItem.findMany({
      where: { orcamentoId: item.orcamentoId, parentId: item.parentId },
      select: { id: true, ordem: true },
      orderBy: { ordem: "asc" },
    });
    const i = irmaos.findIndex((x) => x.id === item.id);
    const j = input.direcao === "cima" ? i - 1 : i + 1;
    if (j < 0 || j >= irmaos.length) return item;

    await db.custoOrcamentoItem.update({ where: { id: irmaos[i].id }, data: { ordem: irmaos[j].ordem } });
    await db.custoOrcamentoItem.update({ where: { id: irmaos[j].id }, data: { ordem: irmaos[i].ordem } });

    await reindexarWbs(db, item.orcamentoId);
    return item;
  });
}

export async function excluirItem(id: string) {
  return prisma.$transaction(async (db) => {
    const item = await db.custoOrcamentoItem.findUnique({
      where: { id },
      select: { id: true, orcamentoId: true, parentId: true },
    });
    if (!item) throw new ActionError("Item não encontrado.");
    await exigirOrcamentoEditavel(db, item.orcamentoId);

    // Cascade no schema remove a subárvore inteira.
    await db.custoOrcamentoItem.delete({ where: { id } });
    await reindexarWbs(db, item.orcamentoId);
    if (item.parentId) await recalcularCaminho(db, item.orcamentoId, item.parentId);
    else await recalcularTudo(db, item.orcamentoId);
    return item;
  });
}

export async function alternarTrava(id: string, bloqueado: boolean) {
  const item = await prisma.custoOrcamentoItem.findUnique({ where: { id }, select: { orcamentoId: true } });
  if (!item) throw new ActionError("Item não encontrado.");
  return prisma.custoOrcamentoItem.update({ where: { id }, data: { bloqueado } });
}

// ── Vínculo com composição + materialização ──────────────────────

export async function vincularComposicao(input: { itemId: string; composicaoId: string }) {
  return prisma.$transaction(async (db) => {
    const item = await db.custoOrcamentoItem.findUnique({
      where: { id: input.itemId },
      select: { id: true, orcamentoId: true, tipo: true, bloqueado: true },
    });
    if (!item) throw new ActionError("Item não encontrado.");
    if (item.tipo !== "servico") throw new ActionError("Só serviços podem ser vinculados a uma composição.");
    if (item.bloqueado) throw new ActionError("Item travado — destrave antes de vincular uma composição.");

    const orc = await exigirOrcamentoEditavel(db, item.orcamentoId);
    if (!orc.basePrecoId) {
      throw new ActionError("Escolha a base de preço do orçamento antes de vincular composições.");
    }

    const comp = await db.custoComposicao.findUnique({
      where: { id: input.composicaoId },
      select: { id: true, descricao: true, unidade: true },
    });
    if (!comp) throw new ActionError("Composição não encontrada.");

    const r = await custoDaComposicao(db, input.composicaoId, orc.basePrecoId);
    if ("erro" in r) throw new ActionError(r.erro);

    const atualizado = await db.custoOrcamentoItem.update({
      where: { id: input.itemId },
      data: {
        composicaoId: comp.id,
        unidade: comp.unidade,
        custoUnitario: r.custo,
        basePrecoUsadaId: orc.basePrecoId,
        custoCalculadoEm: new Date(),
      },
    });
    await recalcularCaminho(db, item.orcamentoId, input.itemId);
    return { item: atualizado, semPreco: r.semPreco };
  });
}

// ── Troca de data-base (= troca da base de preço) ────────────────

/** Pré-visualização: compara os custos nas duas bases sem gravar nada. */
export async function previewTrocaBase(orcamentoId: string, basePrecoNovaId: string): Promise<RelatorioImpacto> {
  const itens = await prisma.custoOrcamentoItem.findMany({
    where: { orcamentoId, tipo: "servico" },
    select: {
      id: true,
      codigo: true,
      descricao: true,
      quantidade: true,
      custoUnitario: true,
      bloqueado: true,
      composicaoId: true,
    },
    orderBy: { codigo: "asc" },
  });

  const paraTroca: ItemParaTroca[] = [];
  for (const item of itens) {
    let custoNovo: number | null = null;
    if (item.composicaoId && !item.bloqueado) {
      const r = await custoDaComposicao(prisma, item.composicaoId, basePrecoNovaId);
      custoNovo = "erro" in r ? null : r.custo;
    } else if (!item.composicaoId) {
      // Custo digitado à mão não depende da base — permanece.
      custoNovo = Number(item.custoUnitario);
    }
    paraTroca.push({
      id: item.id,
      codigo: item.codigo,
      descricao: item.descricao,
      quantidade: Number(item.quantidade),
      custoAtual: Number(item.custoUnitario),
      custoNovo,
      bloqueado: item.bloqueado,
    });
  }
  return relatorioImpacto(paraTroca);
}

/** Aplica a troca: grava os custos alterados + a nova base no cabeçalho e refaz o roll-up. */
export async function aplicarTrocaBase(orcamentoId: string, basePrecoNovaId: string) {
  const relatorio = await previewTrocaBase(orcamentoId, basePrecoNovaId);
  const alterados = itensParaAtualizar(relatorio);

  const base = await prisma.custoBasePreco.findUnique({
    where: { id: basePrecoNovaId },
    select: { id: true, dataBase: true },
  });
  if (!base) throw new ActionError("Base de preço não encontrada.");

  await prisma.$transaction(async (db) => {
    for (const linha of alterados) {
      await db.custoOrcamentoItem.update({
        where: { id: linha.id },
        data: { custoUnitario: linha.custoDepois, basePrecoUsadaId: base.id, custoCalculadoEm: new Date() },
      });
    }
    await db.custoOrcamento.update({
      where: { id: orcamentoId },
      data: { basePrecoId: base.id, dataBase: base.dataBase },
    });
    await recalcularTudo(db, orcamentoId);
  });

  return relatorio;
}

// ── Duplicação ───────────────────────────────────────────────────

export async function duplicarOrcamento(orcamentoId: string, titulo: string, criadoPorId: string) {
  const origem = await prisma.custoOrcamento.findUnique({ where: { id: orcamentoId } });
  if (!origem) throw new ActionError("Orçamento não encontrado.");

  const itens = await prisma.custoOrcamentoItem.findMany({
    where: { orcamentoId },
    orderBy: { codigo: "asc" },
  });

  return prisma.$transaction(async (db) => {
    const novo = await db.custoOrcamento.create({
      data: {
        titulo,
        descricao: origem.descricao,
        projetoId: origem.projetoId,
        nomeAvulso: origem.nomeAvulso,
        contratanteId: origem.contratanteId,
        contratanteNome: origem.contratanteNome,
        dataBase: origem.dataBase,
        basePrecoId: origem.basePrecoId,
        bdiAdmCentral: origem.bdiAdmCentral,
        bdiSeguro: origem.bdiSeguro,
        bdiRisco: origem.bdiRisco,
        bdiGarantia: origem.bdiGarantia,
        bdiDespesasFinanceiras: origem.bdiDespesasFinanceiras,
        bdiLucro: origem.bdiLucro,
        bdiPis: origem.bdiPis,
        bdiCofins: origem.bdiCofins,
        bdiIss: origem.bdiIss,
        bdiCprb: origem.bdiCprb,
        bdiPercentual: origem.bdiPercentual,
        regimeEncargos: origem.regimeEncargos,
        encargosPreset: origem.encargosPreset,
        encargosOverridesJson: origem.encargosOverridesJson ?? undefined,
        encargosHoristaPct: origem.encargosHoristaPct,
        encargosMensalistaPct: origem.encargosMensalistaPct,
        regimeTributario: origem.regimeTributario,
        criadoPorId,
      },
    });

    if (itens.length > 0) {
      const paraDuplicar: ItemParaDuplicar[] = itens.map((i) => ({
        id: i.id,
        parentId: i.parentId,
        tipo: i.tipo,
        codigo: i.codigo,
        ordem: i.ordem,
        descricao: i.descricao,
        unidade: i.unidade,
        quantidade: Number(i.quantidade),
        custoUnitario: Number(i.custoUnitario),
        bdiPercentual: i.bdiPercentual === null ? null : Number(i.bdiPercentual),
        bloqueado: i.bloqueado,
        totalSemBdi: Number(i.totalSemBdi),
        totalComBdi: Number(i.totalComBdi),
        composicaoId: i.composicaoId,
        basePrecoUsadaId: i.basePrecoUsadaId,
      }));

      const r = duplicarItens(paraDuplicar, novo.id, () => crypto.randomUUID());
      if (!r.ok) throw new ActionError(r.erro);

      // createMany não resolve auto-relação: insere pais antes dos filhos, por nível.
      const porId = new Map(r.itens.map((i) => [i.id, i]));
      const nivel = (id: string): number => {
        let n = 0;
        let atual = porId.get(id);
        while (atual?.parentId) {
          n++;
          atual = porId.get(atual.parentId);
        }
        return n;
      };
      const ordenados = [...r.itens].sort((a, b) => nivel(a.id) - nivel(b.id));
      for (const item of ordenados) {
        await db.custoOrcamentoItem.create({ data: item });
      }
    }

    return novo;
  });
}
