"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ActionError, defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";

import { feriadosNacionais } from "@/modules/rh/feriados/queries";
import { diasDoPeriodo, diasLivresDoRecesso, motivoPeriodoInvalido, TIPO_RECESSO } from "@/modules/rh/feriados/periodo";

const base = { modulo: "rh", gereRh: true } as const;
const rev = () => revalidatePath("/configuracoes/feriados");

export const salvarFeriado = defineAction(
  {
    ...base,
    acao: "salvar-feriado",
    entidade: "Feriado",
    schema: z.object({ data: z.string().min(1), nome: z.string().min(1), tipo: z.string().default("nacional") }),
  },
  async (i) => {
    const data = new Date(i.data + "T00:00:00Z");
    const f = await prisma.feriado.upsert({
      where: { data },
      create: { data, nome: i.nome, tipo: i.tipo },
      update: { nome: i.nome, tipo: i.tipo },
    });
    rev();
    return { id: f.id };
  },
);

export const excluirFeriado = defineAction(
  { ...base, acao: "excluir-feriado", entidade: "Feriado", schema: z.object({ id: z.string().min(1) }) },
  async (i) => {
    await prisma.feriado.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Recesso em período: um `Feriado` tipo "recesso" por dia de `inicio` a `fim` (fins de semana
 * inclusive). Dia que já tem feriado, avulso ou recorrente, fica como está.
 */
export const salvarPeriodoRecesso = defineAction(
  {
    ...base,
    acao: "salvar-periodo-recesso",
    entidade: "Feriado",
    schema: z.object({ inicio: z.string(), fim: z.string(), nome: z.string().trim().min(1, "Informe o nome do recesso.") }),
  },
  async (i) => {
    const motivo = motivoPeriodoInvalido(i.inicio, i.fim);
    if (motivo) throw new ActionError(motivo);
    const total = diasDoPeriodo(i.inicio, i.fim).length;
    const existentes = await prisma.feriado.findMany({
      where: { data: { gte: new Date(`${i.inicio}T00:00:00Z`), lte: new Date(`${i.fim}T00:00:00Z`) } },
      select: { data: true },
    });
    const recorrentes = await prisma.feriadoRecorrente.findMany({ select: { dia: true, mes: true } });
    const livres = diasLivresDoRecesso(
      i.inicio,
      i.fim,
      new Set(existentes.map((f) => f.data.toISOString().slice(0, 10))),
      new Set(recorrentes.map((r) => `${pad(r.mes)}-${pad(r.dia)}`)),
    );
    // skipDuplicates: outro cadastro no mesmo dia entre a leitura e aqui não vira erro nem é sobrescrito.
    const r = await prisma.feriado.createMany({
      data: livres.map((d) => ({ data: new Date(`${d}T00:00:00Z`), nome: i.nome, tipo: TIPO_RECESSO })),
      skipDuplicates: true,
    });
    rev();
    return { criados: r.count, pulados: total - r.count };
  },
);

/** Exclui um recesso inteiro (os dias da linha agrupada). Só apaga dias de tipo recesso. */
export const excluirPeriodoRecesso = defineAction(
  {
    ...base,
    acao: "excluir-periodo-recesso",
    entidade: "Feriado",
    schema: z.object({ ids: z.array(z.string().min(1)).min(1).max(400) }),
  },
  async (i) => {
    const r = await prisma.feriado.deleteMany({ where: { id: { in: i.ids }, tipo: TIPO_RECESSO } });
    rev();
    return { excluidos: r.count };
  },
);

/** Cria/atualiza um feriado recorrente de data fixa (repete todo ano por dia/mês). */
export const salvarFeriadoRecorrente = defineAction(
  {
    ...base,
    acao: "salvar-feriado-recorrente",
    entidade: "FeriadoRecorrente",
    schema: z.object({
      dia: z.coerce.number().int().min(1).max(31),
      mes: z.coerce.number().int().min(1).max(12),
      nome: z.string().min(1),
      tipo: z.string().default("nacional"),
    }),
  },
  async (i) => {
    const f = await prisma.feriadoRecorrente.upsert({
      where: { dia_mes_nome: { dia: i.dia, mes: i.mes, nome: i.nome } },
      create: { dia: i.dia, mes: i.mes, nome: i.nome, tipo: i.tipo },
      update: { tipo: i.tipo },
    });
    // Dia de recesso avulso na mesma data dava lugar ao recorrente só na tela (o avulso vence) e tirava
    // o feriado das contas legais (`semRecesso`). O feriado que repete todo ano assume o dia.
    const recessos = await prisma.feriado.findMany({ where: { tipo: TIPO_RECESSO }, select: { id: true, data: true } });
    const mesmoDia = recessos.filter((r) => r.data.getUTCDate() === i.dia && r.data.getUTCMonth() + 1 === i.mes);
    if (mesmoDia.length) await prisma.feriado.deleteMany({ where: { id: { in: mesmoDia.map((r) => r.id) } } });
    rev();
    return { id: f.id };
  },
);

export const excluirFeriadoRecorrente = defineAction(
  { ...base, acao: "excluir-feriado-recorrente", entidade: "FeriadoRecorrente", schema: z.object({ id: z.string().min(1) }) },
  async (i) => {
    await prisma.feriadoRecorrente.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);

/** Importa os feriados nacionais do ano (fixos + móveis). Idempotente (upsert por data). */
export const importarFeriadosNacionais = defineAction(
  { ...base, acao: "importar-feriados", entidade: "Feriado", schema: z.object({ ano: z.number().int() }) },
  async (i) => {
    const lista = feriadosNacionais(i.ano);
    for (const f of lista) {
      await prisma.feriado.upsert({
        where: { data: f.data },
        create: { data: f.data, nome: f.nome, tipo: "nacional" },
        // tipo também: um dia de recesso cadastrado antes vira o feriado nacional (senão `semRecesso`
        // o tiraria do 5º dia útil e da regra de férias, e "remover recesso" o apagaria junto).
        update: { nome: f.nome, tipo: "nacional" },
      });
    }
    rev();
    return { total: lista.length };
  },
);
