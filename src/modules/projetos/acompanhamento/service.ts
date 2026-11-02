import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { enviarEmail, smtpConfigurado } from "@/lib/mail";
import { renderTemplate } from "@/lib/email-templates";
import { ActionError } from "@/lib/with-action";
import { itensEnviadosAoCliente } from "./queries";
import {
  assuntoDoAcompanhamento,
  cabecalhosDeConversa,
  destinatariosValidos,
  listaEmMarkdown,
  novoMessageId,
} from "./regras";

/** O que o serviço usa de fora — trocável no smoke para rodar o mesmo código sem SMTP. */
export type DependenciasEnvio = {
  smtpConfigurado: () => boolean;
  enviar: typeof enviarEmail;
};
const REAIS: DependenciasEnvio = { smtpConfigurado, enviar: enviarEmail };

/** Domínio do `Message-ID`: o do APP_URL; sem ele, um domínio local estável. */
function dominioDoMessageId(): string {
  try {
    return new URL(process.env.APP_URL ?? "").hostname || "senahub.local";
  } catch {
    return "senahub.local";
  }
}

export type EnvioAcompanhamento = {
  projetoId: string;
  usuario: { id: string; email: string; name: string };
  destinatarios: string[];
  revisaoIds: string[];
  observacao?: string;
  copiaParaMim: boolean;
};

/**
 * Envia o e-mail de acompanhamento ao cliente do projeto e registra o envio. O servidor revalida tudo que
 * a tela mandou: só entra na lista a revisão que AINDA está "Enviado ao cliente", e o registro só é gravado
 * depois que o servidor de e-mail aceitou — assim o "desde o último e-mail" e o encadeamento nunca avançam
 * por um envio que não aconteceu.
 */
export async function enviarAcompanhamento(
  args: EnvioAcompanhamento,
  deps: DependenciasEnvio = REAIS,
): Promise<{ id: string; destinatarios: string[]; itens: number }> {
  if (!deps.smtpConfigurado()) throw new ActionError("Envio de e-mail indisponível: SMTP não configurado.");

  const projeto = await prisma.projeto.findUnique({
    where: { id: args.projetoId },
    select: { id: true, codigo: true, nome: true, cliente: { select: { nome: true } } },
  });
  if (!projeto) throw new ActionError("Projeto não encontrado.");

  const destinatarios = destinatariosValidos([], args.destinatarios);
  if (destinatarios.length === 0) throw new ActionError("Informe ao menos um destinatário com e-mail válido.");

  const escolhidas = new Set(args.revisaoIds);
  const itens = (await itensEnviadosAoCliente(projeto.id)).filter((i) => escolhidas.has(i.revisaoId));
  if (itens.length === 0) {
    throw new ActionError("Nenhuma das revisões escolhidas está marcada como enviada ao cliente. Atualize a lista e tente de novo.");
  }

  const anteriores = await prisma.emailAcompanhamento.findMany({
    where: { projetoId: projeto.id },
    orderBy: { enviadoEm: "asc" },
    select: { messageId: true },
  });
  const conversa = cabecalhosDeConversa(anteriores.map((a) => a.messageId));
  const messageId = novoMessageId(projeto.id, randomUUID().replace(/-/g, "").slice(0, 16), dominioDoMessageId());
  const assunto = assuntoDoAcompanhamento(projeto.codigo, projeto.nome);

  const { html } = await renderTemplate("acompanhamento-projeto", {
    nomeCliente: projeto.cliente?.nome || "cliente",
    projeto: projeto.nome,
    lista: listaEmMarkdown(itens),
    observacao: args.observacao?.trim() ?? "",
  });

  const enviado = await deps.enviar({
    to: destinatarios.join(", "),
    subject: assunto,
    html,
    bcc: args.copiaParaMim ? args.usuario.email : undefined,
    replyTo: args.usuario.email,
    messageId,
    ...conversa,
  });
  if (!enviado) throw new ActionError("Não foi possível enviar o e-mail. Verifique a configuração de SMTP.");

  const registro = await prisma.emailAcompanhamento.create({
    data: {
      projetoId: projeto.id,
      enviadoPorId: args.usuario.id,
      assunto,
      messageId,
      destinatarios,
      copiaPara: args.copiaParaMim ? args.usuario.email : null,
      observacao: args.observacao?.trim() || null,
      itens: itens.map((i) => ({ revisaoId: i.revisaoId, rotulo: i.rotulo })),
    },
    select: { id: true },
  });
  return { id: registro.id, destinatarios, itens: itens.length };
}
