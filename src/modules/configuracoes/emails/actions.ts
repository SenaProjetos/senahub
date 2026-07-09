"use server";

import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { enviarEmail, smtpConfigurado } from "@/lib/mail";
import { markdownParaHtml, substituirVariaveis } from "@/lib/email-templates";
import { metaTemplate, exemplosDoTemplate } from "@/lib/email-templates-meta";

const base = { modulo: "configuracoes", recurso: "configuracoes", permissao: "gerir" } as const;

/** Cria ou atualiza um modelo (variante) de uma categoria de e-mail. */
export const salvarVariante = defineAction(
  {
    ...base,
    acao: "salvar-email-variante",
    entidade: "EmailTemplateVariante",
    entidadeId: (data) => (data as { id?: string }).id,
    schema: z.object({
      id: z.string().optional(),
      slug: z.string().min(1),
      nome: z.string().min(1, "Dê um nome ao modelo."),
      assunto: z.string().min(1, "Informe o assunto."),
      corpoHtml: z.string().min(1, "Informe o corpo."),
      ativo: z.boolean().default(true),
    }),
  },
  async (i, ctx) => {
    if (!metaTemplate(i.slug)) throw new ActionError("Categoria desconhecida.");
    if (i.id) {
      const existe = await prisma.emailTemplateVariante.findUnique({ where: { id: i.id } });
      if (!existe || existe.slug !== i.slug) throw new ActionError("Modelo não encontrado.");
      await prisma.emailTemplateVariante.update({
        where: { id: i.id },
        data: { nome: i.nome, assunto: i.assunto, corpoHtml: i.corpoHtml, ativo: i.ativo, updatedById: ctx.user.id },
      });
      return { id: i.id };
    }
    const criada = await prisma.emailTemplateVariante.create({
      data: { slug: i.slug, nome: i.nome, assunto: i.assunto, corpoHtml: i.corpoHtml, ativo: i.ativo, updatedById: ctx.user.id },
    });
    return { id: criada.id };
  },
);

/** Liga/desliga um modelo (define quais entram no sorteio de envio). */
export const definirVarianteAtiva = defineAction(
  {
    ...base,
    acao: "ativar-email-variante",
    entidade: "EmailTemplateVariante",
    entidadeId: (_d, i) => i.id,
    schema: z.object({ id: z.string().min(1), ativo: z.boolean() }),
  },
  async (i, ctx) => {
    await prisma.emailTemplateVariante.update({
      where: { id: i.id },
      data: { ativo: i.ativo, updatedById: ctx.user.id },
    });
    return { id: i.id, ativo: i.ativo };
  },
);

/** Exclui um modelo. */
export const excluirVariante = defineAction(
  {
    ...base,
    acao: "excluir-email-variante",
    entidade: "EmailTemplateVariante",
    entidadeId: (_d, i) => i.id,
    schema: z.object({ id: z.string().min(1) }),
  },
  async (i) => {
    await prisma.emailTemplateVariante.delete({ where: { id: i.id } });
    return { id: i.id };
  },
);

/**
 * Envia um e-mail de teste para o próprio usuário. Renderiza o conteúdo passado
 * (o que está no editor) ou, se ausente, o padrão da categoria.
 */
export const enviarEmailTeste = defineAction(
  {
    ...base,
    acao: "enviar-email-teste",
    schema: z.object({
      slug: z.string().min(1),
      assunto: z.string().optional(),
      corpoHtml: z.string().optional(),
    }),
  },
  async (i, ctx) => {
    if (!smtpConfigurado()) throw new ActionError("SMTP não configurado (defina SMTP_HOST no .env).");
    const meta = metaTemplate(i.slug);
    if (!meta) throw new ActionError("Categoria desconhecida.");
    const exemplos = exemplosDoTemplate(i.slug);
    const assuntoRaw = i.assunto?.trim() || meta.assuntoPadrao;
    const corpoRaw = i.corpoHtml?.trim() || meta.corpoPadrao;
    const assunto = substituirVariaveis(assuntoRaw, exemplos);
    const html = markdownParaHtml(substituirVariaveis(corpoRaw, exemplos));
    const ok = await enviarEmail({ to: ctx.user.email, subject: `[Teste] ${assunto}`, html });
    if (!ok) throw new ActionError("Falha ao enviar o e-mail de teste.");
    return { para: ctx.user.email };
  },
);
