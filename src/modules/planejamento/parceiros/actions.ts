"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { criarParceiro, definirParceiroAtivo, editarParceiro, excluirParceiro } from "./service";
import { MOTIVO_NOME_LONGO } from "./regras";

/**
 * Cadastro de parceiros externos (pool de recursos, parte 6 — decisão 4): quem gere Recursos (`recursos:gerir`), só
 * interno. Regras em `regras.ts`, escritas em `service.ts`.
 */
const gerir = { modulo: "recursos", recurso: "recursos", permissao: "gerir", interno: true, entidade: "ParceiroExterno" } as const;
const antes = async (i: { id: string }) => prisma.parceiroExterno.findUnique({ where: { id: i.id } });

const revisar = () => {
  revalidatePath("/recursos/parceiros");
  revalidatePath("/recursos/por-pessoa");
  revalidatePath("/planejamento", "layout");
};

// Só um teto de sanidade: o limite de 80 vale depois de juntar os espaços (`regras.ts`, no serviço).
const nome = z.string().max(500, MOTIVO_NOME_LONGO);
const disciplinaId = z.string().min(1).nullable();

export const criarParceiroAction = defineAction(
  { ...gerir, acao: "criar-parceiro-externo", schema: z.object({ nome, disciplinaId }), entidadeId: (d) => (d as { id: string }).id },
  async (i) => {
    const r = await criarParceiro(i);
    revisar();
    return r;
  },
);

export const editarParceiroAction = defineAction(
  {
    ...gerir,
    acao: "editar-parceiro-externo",
    schema: z.object({ id: z.string().min(1), nome, disciplinaId }),
    entidadeId: (_d, i) => i.id,
    capturarAntes: antes,
  },
  async (i) => {
    const r = await editarParceiro(i);
    revisar();
    return r;
  },
);

export const definirParceiroAtivoAction = defineAction(
  {
    ...gerir,
    acao: "arquivar-parceiro-externo",
    schema: z.object({ id: z.string().min(1), ativo: z.boolean() }),
    entidadeId: (_d, i) => i.id,
    capturarAntes: antes,
  },
  async (i) => {
    const r = await definirParceiroAtivo(i);
    revisar();
    return r;
  },
);

export const excluirParceiroAction = defineAction(
  { ...gerir, acao: "excluir-parceiro-externo", schema: z.object({ id: z.string().min(1) }), entidadeId: (_d, i) => i.id, capturarAntes: antes },
  async (i) => {
    const r = await excluirParceiro(i);
    revisar();
    return r;
  },
);
