"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { ehAdminDoCiclo, exigirEscopoDaRevisao, exigirEscopoDoControle } from "./acesso";
import {
  aplicarControleNoBanco,
  arquivarNoBanco,
  devolverNoBanco,
  enviarParaAnaliseNoBanco,
  publicarNoBanco,
  removerControleNoBanco,
} from "./service";
import { verificarEnvioParaAnalise } from "./envio-analise";
import { notificarPublicacao, notificarTransicao, notificarControle } from "./notificacoes";

/**
 * Ações do ciclo documental. Cada uma: `defineAction` (sessão, permissão fina, Zod, auditoria) →
 * muralha da disciplina → serviço (transação + evento) → notificações depois do commit (A6).
 * Nenhuma escreve no banco por conta própria.
 */

const id = z.string().min(1);
const motivo = z.string().trim().min(1, "Informe o motivo.").max(1000);

export const enviarParaAnalise = defineAction(
  {
    modulo: "uploads",
    acao: "ciclo-enviar-analise",
    recurso: "arquivos",
    permissao: "enviar",
    entidade: "DocumentoRevisao",
    schema: z.object({
      revisaoId: id,
      /** Descrição da revisão — o único metadado digitado; obrigatória da R01 em diante. */
      descricao: z.string().trim().max(500).optional(),
    }),
    entidadeId: (_d, input) => input.revisaoId,
  },
  async (input, { user }) => {
    await exigirEscopoDaRevisao(user, input.revisaoId);
    const r = await enviarParaAnaliseNoBanco({
      revisaoId: input.revisaoId,
      quem: { userId: user.id },
      descricao: input.descricao,
      verificar: verificarEnvioParaAnalise,
    });
    await notificarTransicao(r, "enviar_analise", user.id);
    return { revisaoId: r.revisaoId };
  },
);

export const devolverRevisao = defineAction(
  {
    modulo: "uploads",
    acao: "ciclo-devolver",
    recurso: "arquivos",
    permissao: "publicar",
    entidade: "DocumentoRevisao",
    schema: z.object({ revisaoId: id, motivo }),
    entidadeId: (_d, input) => input.revisaoId,
  },
  async (input, { user }) => {
    await exigirEscopoDaRevisao(user, input.revisaoId);
    const r = await devolverNoBanco({ revisaoId: input.revisaoId, quem: { userId: user.id }, motivo: input.motivo });
    await notificarTransicao(r, "devolver", user.id, input.motivo);
    return { revisaoId: r.revisaoId };
  },
);

export const publicarRevisao = defineAction(
  {
    modulo: "uploads",
    acao: "ciclo-publicar",
    recurso: "arquivos",
    permissao: "publicar",
    entidade: "DocumentoRevisao",
    schema: z.object({ revisaoId: id, justificativa: z.string().trim().max(1000).optional() }),
    entidadeId: (_d, input) => input.revisaoId,
  },
  async (input, { user }) => {
    await exigirEscopoDaRevisao(user, input.revisaoId);
    const r = await publicarNoBanco({ revisaoId: input.revisaoId, quem: { userId: user.id }, justificativa: input.justificativa });
    await notificarPublicacao(r, user.id);
    return { revisaoId: r.revisaoId, liberacaoObra: r.liberacaoObra, restricaoPendencias: r.restricaoPendencias };
  },
);

export const arquivarRevisao = defineAction(
  {
    modulo: "uploads",
    acao: "ciclo-arquivar",
    recurso: "arquivos",
    permissao: "publicar",
    entidade: "DocumentoRevisao",
    schema: z.object({ revisaoId: id, motivo }),
    entidadeId: (_d, input) => input.revisaoId,
  },
  async (input, { user }) => {
    await exigirEscopoDaRevisao(user, input.revisaoId);
    const r = await arquivarNoBanco({ revisaoId: input.revisaoId, quem: { userId: user.id }, motivo: input.motivo });
    await notificarTransicao(r, "arquivar", user.id, input.motivo);
    return { revisaoId: r.revisaoId };
  },
);

/** Liberar para obra / enviar ao cliente à mão (só em revisão publicada). */
export const aplicarControlePasta = defineAction(
  {
    modulo: "uploads",
    acao: "ciclo-aplicar-controle-pasta",
    recurso: "arquivos",
    permissao: "alterar_status",
    entidade: "DocumentoRevisao",
    schema: z.object({ revisaoId: id, tipo: z.enum(["liberado_obra", "enviado_cliente"]), motivo }),
    entidadeId: (_d, input) => input.revisaoId,
  },
  async (input, { user }) => {
    await exigirEscopoDaRevisao(user, input.revisaoId);
    const r = await aplicarControleNoBanco({ revisaoId: input.revisaoId, tipo: input.tipo, quem: { userId: user.id }, motivo: input.motivo });
    await notificarControle(r, "aplicado", user.id, input.motivo);
    return { revisaoId: r.revisaoId };
  },
);

/** Bloqueio e restrição manuais — decisão de responsabilidade técnica, permissão própria. */
export const aplicarBloqueioOuRestricao = defineAction(
  {
    modulo: "uploads",
    acao: "ciclo-aplicar-bloqueio-restricao",
    recurso: "arquivos",
    permissao: "bloquear",
    entidade: "DocumentoRevisao",
    schema: z.object({
      revisaoId: id,
      tipo: z.enum(["bloqueio", "restricao"]),
      motivo,
      escopos: z.array(z.enum(["download", "atualizacao", "exclusao"])).max(3).optional(),
    }),
    entidadeId: (_d, input) => input.revisaoId,
  },
  async (input, { user }) => {
    await exigirEscopoDaRevisao(user, input.revisaoId);
    const r = await aplicarControleNoBanco({
      revisaoId: input.revisaoId,
      tipo: input.tipo,
      quem: { userId: user.id },
      motivo: input.motivo,
      escopos: input.tipo === "bloqueio" ? input.escopos : undefined,
    });
    await notificarControle(r, "aplicado", user.id, input.motivo);
    return { revisaoId: r.revisaoId };
  },
);

const PERMISSAO_DO_TIPO: Record<string, "alterar_status" | "bloquear"> = {
  liberado_obra: "alterar_status",
  enviado_cliente: "alterar_status",
  bloqueio: "bloquear",
  restricao: "bloquear",
};

export const removerControlePasta = defineAction(
  {
    modulo: "uploads",
    acao: "ciclo-remover-controle-pasta",
    recurso: "arquivos",
    permissao: "alterar_status",
    entidade: "ControleRevisao",
    schema: z.object({ controleId: id, motivo }),
    entidadeId: (_d, input) => input.controleId,
  },
  async (input, { user }) => {
    const tipo = await exigirEscopoDoControle(user, input.controleId);
    if (PERMISSAO_DO_TIPO[tipo] !== "alterar_status") throw new ActionError("Sem permissão para remover este controle.");
    const r = await removerControleNoBanco({ controleId: input.controleId, quem: { userId: user.id }, motivo: input.motivo });
    await notificarControle(r, "removido", user.id, input.motivo);
    return { revisaoId: r.revisaoId };
  },
);

export const removerBloqueioOuRestricao = defineAction(
  {
    modulo: "uploads",
    acao: "ciclo-remover-bloqueio-restricao",
    recurso: "arquivos",
    permissao: "bloquear",
    entidade: "ControleRevisao",
    schema: z.object({ controleId: id, motivo }),
    entidadeId: (_d, input) => input.controleId,
  },
  async (input, { user }) => {
    const tipo = await exigirEscopoDoControle(user, input.controleId);
    if (PERMISSAO_DO_TIPO[tipo] !== "bloquear") throw new ActionError("Sem permissão para remover este controle.");
    const r = await removerControleNoBanco({ controleId: input.controleId, quem: { userId: user.id }, motivo: input.motivo });
    await notificarControle(r, "removido", user.id, input.motivo);
    return { revisaoId: r.revisaoId };
  },
);

/** A9: configuração do ciclo por projeto — só administrador (D8). */
export const salvarConfigDocumentos = defineAction(
  {
    modulo: "uploads",
    acao: "ciclo-salvar-config",
    recurso: "projetos",
    permissao: "ver",
    entidade: "ConfigDocumentosProjeto",
    schema: z.object({
      projetoId: id,
      liberarObraAutomaticamente: z.boolean(),
      permitirPublicarComPendencias: z.boolean(),
      diasAlertaCompartilhado: z.number().int().min(1, "Mínimo de 1 dia.").max(90, "Máximo de 90 dias."),
    }),
    entidadeId: (_d, input) => input.projetoId,
    capturarAntes: (input) => prisma.configDocumentosProjeto.findUnique({ where: { projetoId: input.projetoId } }),
  },
  async (input, { user }) => {
    if (!ehAdminDoCiclo(user)) throw new ActionError("Só um administrador altera a configuração dos documentos do projeto.");
    const { projetoId, ...dados } = input;
    await prisma.configDocumentosProjeto.upsert({ where: { projetoId }, create: { projetoId, ...dados }, update: dados });
    revalidatePath(`/projetos/${projetoId}`, "layout");
    return { projetoId };
  },
);
