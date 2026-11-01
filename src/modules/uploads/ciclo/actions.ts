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
import { verificarEnvioParaAnalise, type CarimboDoEnvio } from "./envio-analise";
import { lerCarimboDoArquivo } from "./carimbo-servidor";
import { descricaoDoCarimbo, PRECISA_DESCRICAO_A_PARTIR_DE, type DescricaoDoCarimbo } from "./envio-regras";
import { resolverNomenclatura } from "@/modules/projetos/nomenclatura/queries";
import { rotuloRevisao } from "@/lib/utils";
import { notificarPublicacao, notificarTransicao, notificarControle } from "./notificacoes";

/**
 * Ações do ciclo documental. Cada uma: `defineAction` (sessão, permissão fina, Zod, auditoria) →
 * muralha da disciplina → serviço (transação + evento) → notificações depois do commit (A6).
 * Nenhuma escreve no banco por conta própria.
 */

const id = z.string().min(1);
const motivo = z.string().trim().min(1, "Informe o motivo.").max(1000);

/** O carimbo do PDF mais recente da revisão, lido no servidor e FORA de transação (ler PDF é lento). */
async function carimboDaRevisao(revisaoId: string): Promise<CarimboDoEnvio> {
  const pdf = await prisma.upload.findFirst({
    where: { revisaoId, excluidoEm: null, nomeArquivo: { endsWith: ".pdf", mode: "insensitive" } },
    orderBy: { createdAt: "desc" },
    select: { nomeArquivo: true, caminho: true },
  });
  return pdf ? { leitura: await lerCarimboDoArquivo(pdf.caminho), nomeArquivo: pdf.nomeArquivo } : null;
}

/**
 * O que o diálogo do envio mostra antes de enviar: a descrição que o carimbo dá para esta revisão (ou por
 * que ela bloqueia). Só leitura — o envio relê o carimbo e decide de novo, nunca confia nesta prévia.
 * `carimbo: null` = revisão sem PDF ou R00 (a descrição só vem do carimbo da R01 em diante).
 */
export const previaDoEnvio = defineAction(
  {
    modulo: "uploads",
    acao: "ciclo-previa-envio",
    recurso: "arquivos",
    permissao: "enviar",
    audit: false,
    schema: z.object({ revisaoId: id }),
  },
  async (input, { user }): Promise<{ carimbo: DescricaoDoCarimbo | null; rotulo: string }> => {
    await exigirEscopoDaRevisao(user, input.revisaoId);
    const rev = await prisma.documentoRevisao.findUnique({
      where: { id: input.revisaoId },
      select: { numero: true, documento: { select: { disciplina: { select: { projetoId: true } } } } },
    });
    if (!rev) throw new ActionError("Revisão não encontrada.");
    const rotulo = rotuloRevisao(rev.numero);
    if (rev.numero < PRECISA_DESCRICAO_A_PARTIR_DE) return { carimbo: null, rotulo };
    const lido = await carimboDaRevisao(input.revisaoId);
    if (!lido) return { carimbo: null, rotulo };
    const nomenclatura = await resolverNomenclatura(rev.documento.disciplina.projetoId);
    const carimbo = descricaoDoCarimbo({
      numero: rev.numero,
      quadro: lido.leitura.quadro,
      revisaoDoCarimbo: lido.leitura.revisao,
      nomenclaturaLivre: !nomenclatura.exigir,
    });
    return { carimbo, rotulo };
  },
);

export const enviarParaAnalise = defineAction(
  {
    modulo: "uploads",
    acao: "ciclo-enviar-analise",
    recurso: "arquivos",
    permissao: "enviar",
    entidade: "DocumentoRevisao",
    schema: z.object({
      revisaoId: id,
      /** Descrição digitada: sem quadro de revisão no carimbo (ou sem PDF), ou contestando o carimbo. */
      descricao: z.string().trim().max(500).optional(),
      /** Carimbo ilegível: a pessoa confirmou o envio sem a conferência (vira evento no histórico). */
      confirmarSemCarimbo: z.boolean().optional(),
      /**
       * "O carimbo foi lido errado": vale a descrição digitada. Quem analisa vê o aviso na linha e no painel da
       * revisão ("Descrição contestada") — não sai notificação.
       */
      contestarCarimbo: z.boolean().optional(),
    }),
    entidadeId: (_d, input) => input.revisaoId,
  },
  async (input, { user }) => {
    await exigirEscopoDaRevisao(user, input.revisaoId);
    // O carimbo é lido ANTES da transação: ler um PDF leva tempo e não pode segurar a conexão. E é sempre
    // relido aqui — a descrição que a tela mostrou não vale como prova.
    const carimbo = await carimboDaRevisao(input.revisaoId);
    const r = await enviarParaAnaliseNoBanco({
      revisaoId: input.revisaoId,
      quem: { userId: user.id },
      descricao: input.descricao,
      verificar: (rev, tx) =>
        verificarEnvioParaAnalise(rev, tx, {
          carimbo,
          confirmarSemCarimbo: input.confirmarSemCarimbo === true,
          contestarCarimbo: input.contestarCarimbo === true,
          userId: user.id,
        }),
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
    schema: z.object({
      revisaoId: id,
      justificativa: z.string().trim().max(1000).optional(),
      /** Documento sem tipo e sem DWG: a pessoa confirmou que ele não tem desenho (vira evento no histórico). */
      confirmarSemDwg: z.boolean().optional(),
    }),
    entidadeId: (_d, input) => input.revisaoId,
  },
  async (input, { user }) => {
    await exigirEscopoDaRevisao(user, input.revisaoId);
    const r = await publicarNoBanco({
      revisaoId: input.revisaoId,
      quem: { userId: user.id },
      justificativa: input.justificativa,
      confirmarSemDwg: input.confirmarSemDwg === true,
    });
    await notificarPublicacao(r, user.id);
    return { revisaoId: r.revisaoId, liberacaoObra: r.liberacaoObra, restricaoPendencias: r.restricaoPendencias, envioAoCliente: r.envioAoCliente };
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

/** Marca a revisão publicada como "Em revisão" (o cliente pediu ajuste); sai sozinha quando a próxima é publicada. */
export const marcarEmRevisao = defineAction(
  {
    modulo: "uploads",
    acao: "ciclo-marcar-em-revisao",
    recurso: "arquivos",
    permissao: "alterar_status",
    entidade: "DocumentoRevisao",
    schema: z.object({ revisaoId: id, motivo }),
    entidadeId: (_d, input) => input.revisaoId,
  },
  async (input, { user }) => {
    await exigirEscopoDaRevisao(user, input.revisaoId);
    const r = await aplicarControleNoBanco({ revisaoId: input.revisaoId, tipo: "em_revisao", quem: { userId: user.id }, motivo: input.motivo });
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
  em_revisao: "alterar_status",
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
      enviarAoClienteAutomaticamente: z.boolean(),
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
