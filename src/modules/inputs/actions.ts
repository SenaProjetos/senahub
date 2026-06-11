"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { defineAction } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import {
  adicionarInputSchema,
  removerInputSchema,
  responderInputsSchema,
  gerarLinkSchema,
} from "@/modules/inputs/schemas";

export const adicionarInput = defineAction(
  {
    modulo: "projetos",
    acao: "adicionar-input",
    recurso: "projetos",
    permissao: "gerir",
    entidade: "InputProjeto",
    schema: adicionarInputSchema,
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (input) => {
    const ordem = await prisma.inputProjeto.count({ where: { projetoId: input.projetoId } });
    const item = await prisma.inputProjeto.create({
      data: {
        projetoId: input.projetoId,
        disciplina: input.disciplina || null,
        pergunta: input.pergunta,
        ordem,
      },
    });
    revalidatePath(`/projetos/${input.projetoId}`);
    return { id: item.id };
  },
);

export const removerInput = defineAction(
  {
    modulo: "projetos",
    acao: "remover-input",
    recurso: "projetos",
    permissao: "gerir",
    entidade: "InputProjeto",
    schema: removerInputSchema,
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (input) => {
    const item = await prisma.inputProjeto.delete({ where: { id: input.id } });
    revalidatePath(`/projetos/${item.projetoId}`);
    return { id: input.id };
  },
);

/** Admin edita respostas após o preenchimento do cliente. */
export const responderInputs = defineAction(
  {
    modulo: "projetos",
    acao: "responder-inputs",
    recurso: "projetos",
    permissao: "gerir",
    entidade: "InputProjeto",
    schema: responderInputsSchema,
    entidadeId: (d) => (d as { projetoId: string }).projetoId,
  },
  async (input) => {
    await prisma.$transaction(
      input.respostas.map((r) =>
        prisma.inputProjeto.update({ where: { id: r.id }, data: { resposta: r.resposta || null } }),
      ),
    );
    revalidatePath(`/projetos/${input.projetoId}`);
    return { projetoId: input.projetoId };
  },
);

/** Gera (ou regenera) o link público de inputs do projeto. */
export const gerarLinkInput = defineAction(
  {
    modulo: "projetos",
    acao: "gerar-link-input",
    recurso: "projetos",
    permissao: "gerir",
    entidade: "LinkPublicoInput",
    schema: gerarLinkSchema,
    entidadeId: (d) => (d as { projetoId: string }).projetoId,
  },
  async (input) => {
    const token = randomBytes(18).toString("hex");
    await prisma.linkPublicoInput.upsert({
      where: { projetoId: input.projetoId },
      create: { projetoId: input.projetoId, token, ativo: true },
      update: { token, ativo: true },
    });
    revalidatePath(`/projetos/${input.projetoId}`);
    return { projetoId: input.projetoId, token };
  },
);
