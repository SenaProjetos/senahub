import "server-only";

/**
 * I/O das regras de preenchimento (M2). O que decide é do motor puro (`motor.ts`); aqui ficam carregar a lista
 * pela ordem, contar o que a regra casaria no histórico e registrar o uso. Separado das actions para a
 * conciliação, a importação e o smoke usarem sem sessão.
 */
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { utcInicioDoDia } from "@/lib/data";
import {
  regraCasa,
  sugerirPreenchimento,
  type Condicao,
  type EntradaDoMotor,
  type JaPreenchido,
  type RegraDoMotor,
  type Sugestao,
} from "@/modules/financeiro/regras/motor";

type Db = Prisma.TransactionClient | typeof prisma;

type LinhaRegra = {
  id: string;
  ordem: number;
  ativo: boolean;
  condicoes: Prisma.JsonValue;
  categoriaId: string | null;
  centroId: string | null;
  formaId: string | null;
  projetoId: string | null;
  fornecedorId: string | null;
  clienteId: string | null;
  tags: string[];
};

/** Lê as condições gravadas em JSON, ignorando o que não tiver a forma esperada (linha antiga ou editada à mão). */
export function condicoesDoJson(v: Prisma.JsonValue): Condicao[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const campo = o.campo;
    const op = o.op;
    const valor = o.valor;
    if (typeof campo !== "string" || typeof op !== "string" || (typeof valor !== "string" && typeof valor !== "number")) return [];
    return [{ campo, op, valor } as Condicao];
  });
}

export function paraRegraDoMotor(r: LinhaRegra): RegraDoMotor {
  return {
    id: r.id,
    ordem: r.ordem,
    ativo: r.ativo,
    condicoes: condicoesDoJson(r.condicoes),
    preenche: {
      categoriaId: r.categoriaId,
      centroId: r.centroId,
      formaId: r.formaId,
      projetoId: r.projetoId,
      fornecedorId: r.fornecedorId,
      clienteId: r.clienteId,
      tags: r.tags,
    },
  };
}

/** Regras ATIVAS, na ordem da lista (a primeira que casa vale). */
export async function carregarRegrasAtivas(db: Db = prisma): Promise<RegraDoMotor[]> {
  const rs = await db.regraCategorizacao.findMany({ where: { ativo: true }, orderBy: [{ ordem: "asc" }, { id: "asc" }] });
  return rs.map(paraRegraDoMotor);
}

/** Conta o uso: a regra preencheu algo. */
export async function registrarUso(db: Db, regraId: string): Promise<void> {
  await db.regraCategorizacao.update({ where: { id: regraId }, data: { usos: { increment: 1 }, ultimoUsoEm: new Date() } });
}

/** Sugestão pronta: carrega as regras e decide. */
export async function sugerirParaEntrada(db: Db, entrada: EntradaDoMotor, ja: JaPreenchido = {}): Promise<Sugestao | null> {
  return sugerirPreenchimento(await carregarRegrasAtivas(db), entrada, ja);
}

export type CasamentoDoHistorico = { id: string; descricao: string; data: string; valor: number; tipo: "receita" | "despesa" };

/**
 * Lançamentos dos últimos 12 meses que as condições casariam (a prévia "Casaria com N lançamentos"). Não
 * grava nada. `limite` corta a lista devolvida, não a contagem.
 */
export async function casamentosDoHistorico(
  condicoes: Condicao[],
  limite = 30,
): Promise<{ total: number; amostra: CasamentoDoHistorico[] }> {
  const desde = new Date();
  desde.setUTCFullYear(desde.getUTCFullYear() - 1);
  const ls = await prisma.lancamento.findMany({
    where: { status: { in: ["previsto", "confirmado", "aguardando_aprovacao"] }, data: { gte: utcInicioDoDia(desde.getUTCFullYear(), desde.getUTCMonth(), 1) } },
    orderBy: { data: "desc" },
    // natureza-ok: a prévia olha qualquer lançamento, é só para mostrar onde a regra pegaria.
    select: { id: true, descricao: true, data: true, valor: true, tipo: true, contaId: true },
  });
  const casam = ls.filter((l) => regraCasa({ condicoes }, { descricao: l.descricao, tipo: l.tipo, valor: Number(l.valor), contaId: l.contaId }));
  return {
    total: casam.length,
    amostra: casam.slice(0, limite).map((l) => ({ id: l.id, descricao: l.descricao, data: l.data.toISOString().slice(0, 10), valor: Number(l.valor), tipo: l.tipo })),
  };
}
