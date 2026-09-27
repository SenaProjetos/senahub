"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { aposMudarEap } from "../pos-eap";
import { estruturaModeloSchema } from "./estrutura";
import { aplicarModeloNoProjeto, salvarEdicaoDoModelo, salvarModeloDeEap } from "./service";
import { criarModelosDeDisciplina } from "./disciplina-service";

/**
 * Modelos de EAP (decisão #5). Mesma permissão de quem monta a EAP (`planejamento:gerir`): o modelo é
 * a EAP da casa, e quem pode montar uma pode guardar o molde dela.
 *
 * A LEITURA do arquivo não está aqui: o XML da casa tem 966 KB e Server Action tem limite de 1 MB de
 * corpo, então o arquivo sobe pela rota multipart `/api/planejamento/modelos/previa`, que só lê e
 * devolve a prévia. O que chega nesta action é a estrutura JÁ interpretada (uns 100 KB), que é o que
 * a pessoa confirmou na tela.
 */
const plan = { modulo: "planejamento", recurso: "planejamento", permissao: "gerir", entidade: "ModeloEap" } as const;

const respostasSchema = z
  .object({
    mapaDisciplina: z.record(z.string(), z.string().min(1).nullable()).optional(),
    mapaFase: z.record(z.string(), z.string().min(1).nullable()).optional(),
    terceiros: z.array(z.string().min(1)).max(2000).optional(),
    /** D38: percentual do valor da disciplina por fase do catálogo. */
    percentuaisPorFase: z.record(z.string(), z.number().finite().min(0).max(100)).optional(),
  })
  .optional();

export const salvarModeloEap = defineAction(
  {
    ...plan,
    acao: "salvar-modelo-eap",
    schema: z.object({
      id: z.string().min(1).optional(),
      nome: z.string().min(2, "Dê um nome ao modelo.").max(120),
      descricao: z.string().max(500).nullish(),
      tipoEmpreendimentoId: z.string().min(1).nullish(),
      arquivoNome: z.string().max(260).nullish(),
      estrutura: estruturaModeloSchema,
      respostas: respostasSchema,
    }),
    // Só o cabeçalho: a estrutura tem ~100 KB de JSON, e gravar antes e depois no log de auditoria
    // encheria a tabela sem ninguém ler.
    capturarAntes: async (i) =>
      i.id
        ? prisma.modeloEap.findUnique({
            where: { id: i.id },
            select: { id: true, nome: true, descricao: true, tipoEmpreendimentoId: true, totalLinhas: true, totalMarcos: true },
          })
        : null,
  },
  async (i, { user }) => {
    const r = await salvarModeloDeEap({
      id: i.id,
      nome: i.nome,
      descricao: i.descricao ?? null,
      tipoEmpreendimentoId: i.tipoEmpreendimentoId ?? null,
      arquivoNome: i.arquivoNome ?? null,
      estrutura: i.estrutura,
      respostas: i.respostas,
      autorId: user.id,
    });
    revalidatePath("/planejamento/modelos");
    return r;
  },
);

/**
 * A estrutura editada na tela do modelo (plano 2026-09-27-editar-modelo-eap). As linhas ficam FORA da
 * auditoria (`redact`, ~100 KB por gravação); o cabeçalho com os totais de antes vai em `antes`.
 */
export const editarEstruturaModeloEap = defineAction(
  {
    ...plan,
    acao: "editar-estrutura-modelo-eap",
    schema: z.object({
      id: z.string().min(1),
      /** `updatedAt` que a tela abriu (M6: conflito de edição). */
      versao: z.string().min(1),
      linhas: estruturaModeloSchema.shape.linhas,
    }),
    redact: ["linhas"],
    capturarAntes: async (i) =>
      prisma.modeloEap.findUnique({
        where: { id: i.id },
        select: { id: true, nome: true, totalLinhas: true, totalMarcos: true, updatedAt: true },
      }),
  },
  async (i) => {
    const r = await salvarEdicaoDoModelo({ id: i.id, versao: i.versao, linhas: i.linhas });
    revalidatePath("/planejamento/modelos");
    revalidatePath(`/planejamento/modelos/${i.id}`);
    return r;
  },
);

/**
 * Um modelo de DISCIPLINA para cada disciplina do catálogo que o modelo de projeto tem (pedido do dono,
 * 2026-09-27): é o que "Gerar EAP das disciplinas" aplica. Não duplica o que já existe com o mesmo nome.
 */
export const criarModelosDeDisciplinaEap = defineAction(
  { ...plan, acao: "criar-modelos-disciplina", schema: z.object({ modeloId: z.string().min(1) }) },
  async (i, { user }) => {
    const r = await criarModelosDeDisciplina({ modeloId: i.modeloId, autorId: user.id });
    revalidatePath("/planejamento/modelos");
    return r;
  },
);

export const removerModeloEap = defineAction(
  {
    ...plan,
    acao: "remover-modelo-eap",
    schema: z.object({ id: z.string().min(1) }),
    capturarAntes: async (i) => prisma.modeloEap.findUnique({ where: { id: i.id }, select: { id: true, nome: true, ativo: true } }),
  },
  async (i) => {
    const modelo = await prisma.modeloEap.findUnique({ where: { id: i.id }, select: { ativo: true } });
    if (!modelo?.ativo) throw new ActionError("Modelo não encontrado.");
    // Desativa em vez de apagar: o projeto que nasceu dele guarda no histórico de onde veio.
    await prisma.modeloEap.update({ where: { id: i.id }, data: { ativo: false } });
    revalidatePath("/planejamento/modelos");
    return { id: i.id };
  },
);

export const aplicarModeloEap = defineAction(
  {
    ...plan,
    acao: "aplicar-modelo-eap",
    entidade: "EapTarefa",
    schema: z.object({ projetoId: z.string().min(1), modeloId: z.string().min(1) }),
  },
  async (i, { user }) => {
    const r = await aplicarModeloNoProjeto({ projetoId: i.projetoId, modeloId: i.modeloId });
    // O modelo traz duração e vínculo; as datas são do motor, então reagenda na sequência (e, com
    // cronograma aprovado — que não é o caso de projeto novo —, sincroniza card e previsão).
    await aposMudarEap(i.projetoId, user.id);
    revalidatePath(`/planejamento/${i.projetoId}`);
    revalidatePath("/planejamento");
    revalidatePath(`/projetos/${i.projetoId}`);
    return r;
  },
);
