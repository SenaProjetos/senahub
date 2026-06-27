"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { INTERNAL_ROLES } from "@/lib/roles";
import type { Prisma } from "@/generated/prisma/client";
import { escopoProjeto } from "@/modules/projetos/queries";
import { calcular, snapshotParaSalvar } from "./service";
import { getFerramenta } from "./registry";
import { autoStore } from "./auto-store";

const base = { modulo: "ferramentas", roles: INTERNAL_ROLES, recurso: "ferramentas" } as const;
const rev = () => revalidatePath("/ferramentas");

const opt = (s: z.ZodString) => s.optional().or(z.literal(""));

const salvarSchema = z.object({
  ferramenta: z.string().min(1),
  titulo: z.string().min(1, "Informe o título do cálculo."),
  projetoId: opt(z.string()),
  disciplinaId: opt(z.string()),
  entradas: z.record(z.string(), z.unknown()),
});

const renomearSchema = z.object({
  id: z.string().min(1),
  titulo: z.string().min(1, "Informe o título."),
});

const excluirSchema = z.object({
  id: z.string().min(1),
});

export const salvarCalculo = defineAction(
  {
    ...base,
    acao: "salvar-calculo",
    permissao: "usar",
    entidade: "CalculoFerramenta",
    entidadeId: (d) => (d as { id: string }).id,
    schema: salvarSchema,
  },
  async (i, { user }) => {
    const meta = getFerramenta(i.ferramenta);
    if (!meta) throw new ActionError(`Ferramenta desconhecida: "${i.ferramenta}".`);

    // Recalcula no servidor — não confia no resultado que veio do cliente.
    const resultado = calcular(i.ferramenta, i.entradas);
    const snapshot = snapshotParaSalvar(
      i.ferramenta,
      i.titulo,
      meta.norma,
      1,
      i.entradas,
      resultado,
    );

    const registro = await prisma.calculoFerramenta.create({
      data: {
        ferramenta: snapshot.ferramenta,
        titulo: snapshot.titulo,
        norma: snapshot.norma ?? null,
        versaoCalc: snapshot.versaoCalc,
        entradasJson: snapshot.entradasJson as Prisma.InputJsonValue,
        resultadoJson: snapshot.resultadoJson as Prisma.InputJsonValue,
        autorId: user.id,
        projetoId: i.projetoId || null,
        disciplinaId: i.disciplinaId || null,
      },
    });

    // Auto-store: gera arquivos e os registra na disciplina.
    // void = fire-and-forget; não bloqueia o retorno da action
    // (PDF com puppeteer pode ser lento — o salvamento aparece imediato para o usuário).
    if (i.projetoId && i.disciplinaId) {
      void autoStore({
        ferramenta: i.ferramenta,
        titulo: i.titulo,
        entradas: i.entradas,
        projetoId: i.projetoId,
        disciplinaId: i.disciplinaId,
        autorId: user.id,
        autorNome: user.name,
        userRole: user.role,
      }).catch((err) => console.error("[ferramentas] auto-store falhou:", err));
    }

    rev();
    return { id: registro.id };
  },
);

export const renomearCalculo = defineAction(
  {
    ...base,
    acao: "renomear-calculo",
    permissao: "usar",
    entidade: "CalculoFerramenta",
    schema: renomearSchema,
    capturarAntes: async (i) =>
      prisma.calculoFerramenta.findUnique({ where: { id: i.id }, select: { titulo: true } }),
  },
  async (i, { user }) => {
    const registro = await prisma.calculoFerramenta.findUnique({ where: { id: i.id } });
    if (!registro) throw new ActionError("Cálculo não encontrado.");

    const podeGerir = await can(user.role, "ferramentas", "gerir");
    if (registro.autorId !== user.id && !podeGerir) {
      throw new ActionError("Sem permissão para renomear este cálculo.");
    }

    await prisma.calculoFerramenta.update({ where: { id: i.id }, data: { titulo: i.titulo } });
    rev();
    return { id: i.id };
  },
);

export const buscarCalculo = defineAction(
  {
    ...base,
    acao: "buscar-calculo",
    permissao: "usar",
    entidade: "CalculoFerramenta",
    schema: excluirSchema,
    audit: false,
  },
  async (i, { user }) => {
    const registro = await prisma.calculoFerramenta.findUnique({ where: { id: i.id } });
    if (!registro) throw new ActionError("Cálculo não encontrado.");
    const podeGerir = await can(user.role, "ferramentas", "gerir");
    if (registro.autorId !== user.id && !podeGerir) throw new ActionError("Sem permissão.");
    return {
      id: registro.id,
      titulo: registro.titulo,
      ferramenta: registro.ferramenta,
      entradasJson: registro.entradasJson as Record<string, unknown>,
    };
  },
);

export const excluirCalculo = defineAction(
  {
    ...base,
    acao: "excluir-calculo",
    permissao: "usar",
    entidade: "CalculoFerramenta",
    schema: excluirSchema,
    capturarAntes: async (i) =>
      prisma.calculoFerramenta.findUnique({
        where: { id: i.id },
        select: { titulo: true, ferramenta: true },
      }),
  },
  async (i, { user }) => {
    const registro = await prisma.calculoFerramenta.findUnique({ where: { id: i.id } });
    if (!registro) throw new ActionError("Cálculo não encontrado.");

    const podeGerir = await can(user.role, "ferramentas", "gerir");
    if (registro.autorId !== user.id && !podeGerir) {
      throw new ActionError("Sem permissão para excluir este cálculo.");
    }

    await prisma.calculoFerramenta.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);

// ── Leituras para os selects do salvar-dialog ─────────────────────────────

/** Projetos visíveis ao usuário (para o select de associação). */
export const listarProjetosParaFerramenta = defineAction(
  { ...base, acao: "listar-projetos", permissao: "usar", schema: z.object({}), audit: false },
  async (_, { user }) => {
    const projetos = await prisma.projeto.findMany({
      where: escopoProjeto(user),
      orderBy: [{ ano: "desc" }, { sequencial: "desc" }],
      select: { id: true, codigo: true, nome: true },
    });
    return projetos;
  },
);

/** Disciplinas de um projeto (para o select em cascata). */
export const listarDisciplinasParaFerramenta = defineAction(
  {
    ...base,
    acao: "listar-disciplinas",
    permissao: "usar",
    schema: z.object({ projetoId: z.string().min(1) }),
    audit: false,
  },
  async ({ projetoId }, { user }) => {
    const projetoAcessivel = await prisma.projeto.findFirst({
      where: { id: projetoId, AND: [escopoProjeto(user)] },
      select: { id: true },
    });
    if (!projetoAcessivel) return [];
    return prisma.disciplina.findMany({
      where: { projetoId },
      orderBy: { ordem: "asc" },
      select: { id: true, nome: true },
    });
  },
);
