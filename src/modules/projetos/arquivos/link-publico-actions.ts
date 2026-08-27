"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { smtpConfigurado } from "@/lib/mail";
import { enviarEmailTemplate } from "@/lib/email-templates";

const base = { modulo: "projetos", recurso: "projetos", permissao: "gerir", entidade: "LinkPublicoArquivos" } as const;

/**
 * Um projeto tem VÁRIOS links, então a auditoria precisa apontar qual deles mudou —
 * `entidadeId` é o id do link, não o do projeto.
 */
const idLink = (d: unknown, i: unknown) => ((d ?? i) as { linkId: string }).linkId;

const escopoSchema = z.enum(["disciplinas", "projeto_todo", "selecao"]);

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
 * IDs de upload que realmente pertencem ao projeto e não estão na lixeira.
 *
 * A seleção manual dispensa as regras de revisão e de backup do modelo — foi escolha
 * de alguém de dentro. Não dispensa a lixeira: o job de purga apaga o arquivo em 30
 * dias e o link fica quebrado na mão do cliente.
 */
async function uploadsValidos(projetoId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const ups = await prisma.upload.findMany({
    where: { id: { in: ids }, excluidoEm: null, disciplina: { projetoId } },
    select: { id: true },
  });
  return ups.map((u) => u.id);
}

/** Carrega o link garantindo que ele existe; devolve também o projeto para o revalidate. */
async function carregarLink(linkId: string) {
  const link = await prisma.linkPublicoArquivos.findUnique({ where: { id: linkId } });
  if (!link) throw new ActionError("Link não encontrado.");
  return link;
}

/**
 * Cria mais um link público de arquivos no projeto. Cada link é independente: tem o seu
 * escopo, a sua validade e o seu token, e revogar um não mexe nos outros.
 *
 * Sem `nome`, sem escopo e sem seleção, nasce liberando todas as disciplinas de hoje —
 * que é como o link único funcionava.
 */
export const criarLinkArquivos = defineAction(
  {
    ...base,
    acao: "criar-link-arquivos",
    schema: z.object({
      projetoId: z.string().min(1),
      nome: z.string().trim().max(80).optional(),
      escopo: escopoSchema.default("disciplinas"),
      disciplinaIds: z.array(z.string()).default([]),
      uploadIds: z.array(z.string()).default([]),
      expiraEm: z.string().datetime().nullable().optional(),
    }),
    entidadeId: (d) => (d as { linkId: string } | undefined)?.linkId ?? "",
  },
  async (input, { user }) => {
    if (input.escopo === "selecao" && input.uploadIds.length === 0) {
      throw new ActionError("Selecione ao menos um arquivo para gerar um link de seleção.");
    }

    const disciplinaIds =
      input.escopo === "disciplinas"
        ? input.disciplinaIds.length > 0
          ? await disciplinasValidas(input.projetoId, input.disciplinaIds)
          : (await prisma.disciplina.findMany({ where: { projetoId: input.projetoId }, select: { id: true } })).map(
              (d) => d.id,
            )
        : [];

    const uploadIds = input.escopo === "selecao" ? await uploadsValidos(input.projetoId, input.uploadIds) : [];
    if (input.escopo === "selecao" && uploadIds.length === 0) {
      throw new ActionError("Nenhum dos arquivos escolhidos pode ser publicado (podem estar na lixeira).");
    }

    const link = await prisma.linkPublicoArquivos.create({
      data: {
        projetoId: input.projetoId,
        token: randomBytes(18).toString("hex"),
        nome: input.nome?.trim() || null,
        escopo: input.escopo,
        ativo: true,
        expiraEm: input.expiraEm ? new Date(input.expiraEm) : null,
        disciplinaIds,
        uploadIds,
        criadoPorId: user.id,
      },
    });

    revalidatePath(`/projetos/${input.projetoId}/arquivos`);
    return { linkId: link.id, projetoId: input.projetoId, token: link.token };
  },
);

/** Troca só o token: o endereço antigo para de funcionar na hora, o resto fica de pé. */
export const regerarTokenLinkArquivos = defineAction(
  {
    ...base,
    acao: "regerar-token-link-arquivos",
    schema: z.object({ linkId: z.string().min(1) }),
    entidadeId: idLink,
    capturarAntes: (i) => prisma.linkPublicoArquivos.findUnique({ where: { id: i.linkId } }),
  },
  async (input) => {
    const link = await carregarLink(input.linkId);
    const token = randomBytes(18).toString("hex");
    await prisma.linkPublicoArquivos.update({ where: { id: link.id }, data: { token } });
    revalidatePath(`/projetos/${link.projetoId}/arquivos`);
    return { linkId: link.id, projetoId: link.projetoId, token };
  },
);

/** Apaga o link de vez. Revogar (`ativo=false`) já basta na maioria dos casos. */
export const excluirLinkArquivos = defineAction(
  {
    ...base,
    acao: "excluir-link-arquivos",
    schema: z.object({ linkId: z.string().min(1) }),
    entidadeId: idLink,
    capturarAntes: (i) => prisma.linkPublicoArquivos.findUnique({ where: { id: i.linkId } }),
  },
  async (input) => {
    const link = await carregarLink(input.linkId);
    await prisma.linkPublicoArquivos.delete({ where: { id: link.id } });
    revalidatePath(`/projetos/${link.projetoId}/arquivos`);
    return { linkId: link.id, projetoId: link.projetoId };
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
    schema: z.object({ linkId: z.string().min(1), email: z.string().email("E-mail inválido.") }),
    entidadeId: idLink,
  },
  async (input) => {
    if (!smtpConfigurado()) throw new ActionError("Envio de e-mail indisponível: SMTP não configurado.");

    const link = await carregarLink(input.linkId);
    if (!link.ativo) throw new ActionError("Ative o link antes de enviar por e-mail.");
    if (link.expiraEm && link.expiraEm.getTime() <= Date.now()) throw new ActionError("O link público está expirado.");

    const email = input.email.toLowerCase().trim();
    const projeto = await prisma.projeto.findUnique({
      where: { id: link.projetoId },
      select: { nome: true, cliente: { select: { nome: true } } },
    });
    if (!projeto) throw new ActionError("Projeto não encontrado.");

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

    return { linkId: link.id, email, convite: !usuario };
  },
);

/** Atualiza rótulo, escopo, recorte, estado (ativo/revogado) e validade de UM link. */
export const atualizarLinkArquivos = defineAction(
  {
    ...base,
    acao: "atualizar-link-arquivos",
    schema: z.object({
      linkId: z.string().min(1),
      nome: z.string().trim().max(80).nullable().optional(),
      escopo: escopoSchema.optional(),
      disciplinaIds: z.array(z.string()).default([]),
      uploadIds: z.array(z.string()).optional(),
      ativo: z.boolean(),
      expiraEm: z.string().datetime().nullable().optional(),
    }),
    entidadeId: idLink,
    capturarAntes: (i) => prisma.linkPublicoArquivos.findUnique({ where: { id: i.linkId } }),
  },
  async (input) => {
    const link = await carregarLink(input.linkId);
    const escopo = input.escopo ?? link.escopo;

    const disciplinaIds =
      escopo === "disciplinas" ? await disciplinasValidas(link.projetoId, input.disciplinaIds) : [];
    const uploadIds =
      escopo === "selecao"
        ? await uploadsValidos(link.projetoId, input.uploadIds ?? link.uploadIds)
        : [];

    if (escopo === "selecao" && uploadIds.length === 0) {
      throw new ActionError("Um link de seleção precisa de ao menos um arquivo publicável.");
    }

    await prisma.linkPublicoArquivos.update({
      where: { id: link.id },
      data: {
        nome: input.nome === undefined ? undefined : input.nome?.trim() || null,
        escopo,
        disciplinaIds,
        uploadIds,
        ativo: input.ativo,
        expiraEm: input.expiraEm ? new Date(input.expiraEm) : null,
      },
    });
    revalidatePath(`/projetos/${link.projetoId}/arquivos`);
    return { linkId: link.id, projetoId: link.projetoId };
  },
);
