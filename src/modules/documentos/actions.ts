"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { resolverFonte } from "@/modules/documentos/fontes";
import { CHAVE_FONTES } from "@/modules/documentos/fontes-config";
import { FONTES_TIPOGRAFICAS } from "@/modules/documentos/fontes-tipograficas";
import {
  criarModeloSchema,
  salvarModeloSchema,
  idModeloSchema,
  restaurarVersaoSchema,
  docVazio,
  docSchemaZ,
} from "@/modules/documentos/schema";
import type { Prisma } from "@/generated/prisma/client";

const base = { modulo: "documentos", recurso: "documentos", permissao: "gerir" } as const;
const PATH = "/documentos";

export const criarModelo = defineAction(
  { ...base, acao: "criar-modelo", entidade: "DocumentoModelo", schema: criarModeloSchema },
  async (i) => {
    const m = await prisma.documentoModelo.create({
      data: {
        nome: i.nome,
        tipo: i.tipo,
        fonte: i.fonte || null,
        schemaJson: docVazio() as unknown as Prisma.InputJsonValue,
      },
    });
    revalidatePath(PATH);
    return { id: m.id };
  },
);

/** Salva o modelo e grava uma nova versão no histórico. */
export const salvarModelo = defineAction(
  {
    ...base,
    acao: "salvar-modelo",
    entidade: "DocumentoModelo",
    schema: salvarModeloSchema,
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (i, { user }) => {
    const m = await prisma.documentoModelo.findUnique({
      where: { id: i.id },
      include: { versoes: { orderBy: { numero: "desc" }, take: 1 } },
    });
    if (!m) throw new ActionError("Modelo não encontrado.");

    const proxima = (m.versoes[0]?.numero ?? 0) + 1;
    await prisma.$transaction([
      prisma.documentoModelo.update({
        where: { id: i.id },
        data: {
          nome: i.nome,
          tipo: i.tipo,
          fonte: i.fonte || null,
          schemaJson: i.schemaJson as unknown as Prisma.InputJsonValue,
        },
      }),
      prisma.documentoModeloVersao.create({
        data: {
          modeloId: i.id,
          numero: proxima,
          schemaJson: i.schemaJson as unknown as Prisma.InputJsonValue,
          autorId: user.id,
        },
      }),
    ]);
    revalidatePath(PATH);
    revalidatePath(`${PATH}/${i.id}`);
    return { id: i.id, versao: proxima };
  },
);

export const duplicarModelo = defineAction(
  { ...base, acao: "duplicar-modelo", entidade: "DocumentoModelo", schema: idModeloSchema },
  async (i) => {
    const m = await prisma.documentoModelo.findUnique({ where: { id: i.id } });
    if (!m) throw new ActionError("Modelo não encontrado.");
    const novo = await prisma.documentoModelo.create({
      data: {
        nome: `${m.nome} — cópia`,
        tipo: m.tipo,
        fonte: m.fonte,
        schemaJson: m.schemaJson as Prisma.InputJsonValue,
      },
    });
    revalidatePath(PATH);
    return { id: novo.id };
  },
);

export const arquivarModelo = defineAction(
  { ...base, acao: "arquivar-modelo", entidade: "DocumentoModelo", schema: idModeloSchema },
  async (i) => {
    await prisma.documentoModelo.update({ where: { id: i.id }, data: { ativo: false } });
    revalidatePath(PATH);
    return { id: i.id };
  },
);

/** Restaura o schema de uma versão do histórico (gera nova versão). */
export const restaurarVersao = defineAction(
  {
    ...base,
    acao: "restaurar-versao",
    entidade: "DocumentoModelo",
    schema: restaurarVersaoSchema,
    entidadeId: (d) => (d as { modeloId: string }).modeloId,
  },
  async (i, { user }) => {
    const v = await prisma.documentoModeloVersao.findUnique({ where: { id: i.versaoId } });
    if (!v || v.modeloId !== i.modeloId) throw new ActionError("Versão não encontrada.");
    const parsed = docSchemaZ.safeParse(v.schemaJson);
    if (!parsed.success) throw new ActionError("Versão com schema inválido.");

    const ultima = await prisma.documentoModeloVersao.findFirst({
      where: { modeloId: i.modeloId },
      orderBy: { numero: "desc" },
    });
    await prisma.$transaction([
      prisma.documentoModelo.update({
        where: { id: i.modeloId },
        data: { schemaJson: v.schemaJson as Prisma.InputJsonValue },
      }),
      prisma.documentoModeloVersao.create({
        data: {
          modeloId: i.modeloId,
          numero: (ultima?.numero ?? 0) + 1,
          schemaJson: v.schemaJson as Prisma.InputJsonValue,
          autorId: user.id,
        },
      }),
    ]);
    revalidatePath(`${PATH}/${i.modeloId}`);
    return { modeloId: i.modeloId };
  },
);

const CHAVE_PADROES = "documentos.padroes";
const padraoSchema = z.object({
  fonte: z.string().min(1),
  modeloId: z.string().optional().or(z.literal("")),
});

/** Define (ou remove, se modeloId vazio) o modelo padrão de uma fonte. */
export const salvarPadraoDocumento = defineAction(
  { ...base, acao: "salvar-padrao-doc", entidade: "ConfigSistema", schema: padraoSchema },
  async (i) => {
    const atual = await prisma.configSistema.findUnique({ where: { chave: CHAVE_PADROES } });
    const mapa = { ...((atual?.valor as Record<string, string> | null) ?? {}) };
    if (i.modeloId) mapa[i.fonte] = i.modeloId;
    else delete mapa[i.fonte];
    await prisma.configSistema.upsert({
      where: { chave: CHAVE_PADROES },
      create: { chave: CHAVE_PADROES, valor: mapa },
      update: { valor: mapa },
    });
    revalidatePath("/configuracoes/documentos");
    return { fonte: i.fonte };
  },
);

const fontesSchema = z.object({ ids: z.array(z.string()) });

/** Define quais famílias do catálogo ficam habilitadas no editor. Requer documentos:gerir. */
export const salvarFontesHabilitadas = defineAction(
  { ...base, acao: "salvar-fontes", entidade: "ConfigSistema", schema: fontesSchema },
  async (i) => {
    // Mantém só ids válidos do catálogo, na ordem do catálogo (canônico).
    const validos = FONTES_TIPOGRAFICAS.filter((f) => i.ids.includes(f.id)).map((f) => f.id);
    await prisma.configSistema.upsert({
      where: { chave: CHAVE_FONTES },
      create: { chave: CHAVE_FONTES, valor: validos },
      update: { valor: validos },
    });
    revalidatePath("/configuracoes/documentos");
    return { ids: validos };
  },
);

const gerarSchema = z.object({
  modeloId: z.string().min(1),
  params: z.record(z.string(), z.string()),
});

/** Persiste um documento gerado (snapshot imutável do schema + dados resolvidos). */
export const registrarDocumentoGerado = defineAction(
  { modulo: "documentos", recurso: "documentos", permissao: "ver", acao: "gerar-documento", entidade: "DocumentoGerado", schema: gerarSchema },
  async (i, { user }) => {
    const modelo = await prisma.documentoModelo.findUnique({ where: { id: i.modeloId } });
    if (!modelo) throw new ActionError("Modelo não encontrado.");
    const dados = modelo.fonte
      ? await resolverFonte(modelo.fonte, i.params)
      : { escalar: {}, linhas: [] };
    const g = await prisma.documentoGerado.create({
      data: {
        modeloId: modelo.id,
        modeloNome: modelo.nome,
        fonte: modelo.fonte,
        params: i.params,
        schemaSnapshot: modelo.schemaJson as Prisma.InputJsonValue,
        dadosSnapshot: dados as unknown as Prisma.InputJsonValue,
        geradoPorId: user.id,
        geradoPorNome: user.name,
      },
    });
    revalidatePath("/documentos/gerados");
    return { id: g.id };
  },
);
