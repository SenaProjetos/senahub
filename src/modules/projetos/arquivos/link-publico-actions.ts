"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { smtpConfigurado } from "@/lib/mail";
import { enviarEmailTemplate } from "@/lib/email-templates";

const base = { modulo: "projetos", recurso: "projetos", permissao: "gerir", entidade: "LinkPublicoArquivos" } as const;
const idProjeto = (d: unknown, i: unknown) => ((d ?? i) as { projetoId: string }).projetoId;

/** IDs de disciplina que realmente pertencem ao projeto (barra lixo/whitelist forjada). */
async function disciplinasValidas(projetoId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const discs = await prisma.disciplina.findMany({
    where: { projetoId, id: { in: ids } },
    select: { id: true },
  });
  return discs.map((d) => d.id);
}

/**
 * Gera (ou regenera) o link público de arquivos do projeto. Na criação, libera
 * TODAS as disciplinas por padrão e ativa o link; ao regerar, troca só o token e
 * preserva a seleção/validade (o link antigo para de funcionar imediatamente).
 */
export const gerarLinkArquivos = defineAction(
  {
    ...base,
    acao: "gerar-link-arquivos",
    schema: z.object({ projetoId: z.string().min(1) }),
    entidadeId: idProjeto,
    capturarAntes: (i) => prisma.linkPublicoArquivos.findUnique({ where: { projetoId: i.projetoId } }),
  },
  async (input, { user }) => {
    const token = randomBytes(18).toString("hex");
    const existente = await prisma.linkPublicoArquivos.findUnique({ where: { projetoId: input.projetoId } });
    if (existente) {
      await prisma.linkPublicoArquivos.update({ where: { projetoId: input.projetoId }, data: { token } });
    } else {
      const todas = await prisma.disciplina.findMany({ where: { projetoId: input.projetoId }, select: { id: true } });
      await prisma.linkPublicoArquivos.create({
        data: {
          projetoId: input.projetoId,
          token,
          ativo: true,
          disciplinaIds: todas.map((d) => d.id),
          criadoPorId: user.id,
        },
      });
    }
    revalidatePath(`/projetos/${input.projetoId}/arquivos`);
    return { projetoId: input.projetoId, token };
  },
);

/** Vantagens de ter acesso ao sistema — mostradas no convite a quem ainda não é usuário. */
const VANTAGENS_PORTAL = [
  "Acompanhar o andamento e as entregas do projeto em tempo real",
  "Baixar os arquivos aprovados, sempre na versão mais atual",
  "Enviar documentos e informações com segurança",
  "Receber avisos e comunicados diretamente pelo sistema",
];

/**
 * Envia por e-mail o aviso de que o projeto está disponível, com o link.
 * O conteúdo do bloco de acesso varia pelo destinatário:
 *  - já é usuário do sistema → link de login (acessa o projeto por dentro do sistema);
 *  - ainda não é usuário → link público dos arquivos + vantagens + convite p/ solicitar cadastro.
 */
export const enviarLinkProjetoEmail = defineAction(
  {
    ...base,
    acao: "enviar-link-projeto-email",
    schema: z.object({ projetoId: z.string().min(1), email: z.string().email("E-mail inválido.") }),
    entidadeId: idProjeto,
  },
  async (input) => {
    if (!smtpConfigurado()) throw new ActionError("Envio de e-mail indisponível: SMTP não configurado.");

    const email = input.email.toLowerCase().trim();
    const projeto = await prisma.projeto.findUnique({
      where: { id: input.projetoId },
      select: { nome: true, cliente: { select: { nome: true } } },
    });
    if (!projeto) throw new ActionError("Projeto não encontrado.");

    const link = await prisma.linkPublicoArquivos.findUnique({ where: { projetoId: input.projetoId } });
    if (!link || !link.ativo) throw new ActionError("Gere e ative o link público antes de enviar por e-mail.");
    if (link.expiraEm && link.expiraEm.getTime() <= Date.now()) throw new ActionError("O link público está expirado.");

    const appUrl = process.env.APP_URL ?? "";
    const nomeCliente = projeto.cliente?.nome || email.split("@")[0] || "cliente";
    const usuario = await prisma.user.findUnique({ where: { email }, select: { id: true } });

    let blocoAcesso: string;
    if (usuario) {
      blocoAcesso = `Você já tem acesso ao SenaHub. [Entrar no sistema](${appUrl}/login) para acompanhar o projeto e baixar os arquivos.`;
    } else {
      const vantagens = VANTAGENS_PORTAL.map((v) => `- ${v}`).join("\n");
      blocoAcesso = `[Ver os arquivos do projeto](${appUrl}/p/arquivos/${link.token})

**Quer acompanhar tudo pelo sistema?** Ao ter acesso ao SenaHub você pode:

${vantagens}

[Solicitar meu cadastro](${appUrl}/solicitar-cadastro)`;
    }

    const enviado = await enviarEmailTemplate(email, "projeto-disponivel", {
      nomeCliente,
      projeto: projeto.nome,
      blocoAcesso,
    });
    if (!enviado) throw new ActionError("Não foi possível enviar o e-mail. Verifique a configuração de SMTP.");

    return { projetoId: input.projetoId, email, convite: !usuario };
  },
);

/** Atualiza a whitelist de disciplinas, o estado (ativo/revogado) e a validade do link. */
export const atualizarLinkArquivos = defineAction(
  {
    ...base,
    acao: "atualizar-link-arquivos",
    schema: z.object({
      projetoId: z.string().min(1),
      disciplinaIds: z.array(z.string()).default([]),
      ativo: z.boolean(),
      expiraEm: z.string().datetime().nullable().optional(),
    }),
    entidadeId: idProjeto,
    capturarAntes: (i) => prisma.linkPublicoArquivos.findUnique({ where: { projetoId: i.projetoId } }),
  },
  async (input) => {
    const disciplinaIds = await disciplinasValidas(input.projetoId, input.disciplinaIds);
    await prisma.linkPublicoArquivos.update({
      where: { projetoId: input.projetoId },
      data: {
        disciplinaIds,
        ativo: input.ativo,
        expiraEm: input.expiraEm ? new Date(input.expiraEm) : null,
      },
    });
    revalidatePath(`/projetos/${input.projetoId}/arquivos`);
    return { projetoId: input.projetoId };
  },
);
