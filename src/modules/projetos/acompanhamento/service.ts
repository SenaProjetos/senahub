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
  escaparMarkdown,
  listaEmMarkdown,
  novoMessageId,
} from "./regras";

/** O que o serviço usa de fora — trocável no smoke para rodar o mesmo código sem SMTP. */
export type DependenciasEnvio = {
  smtpConfigurado: () => boolean;
  enviar: typeof enviarEmail;
};
const REAIS: DependenciasEnvio = { smtpConfigurado, enviar: enviarEmail };

/** Mesmo e-mail mandado de novo dentro desta janela é tratado como clique duplo. */
const JANELA_DUPLICADO_MS = 2 * 60_000;

function revisoesDoRegistro(itens: unknown): string[] {
  if (!Array.isArray(itens)) return [];
  return itens.flatMap((i) => {
    const id = (i as { revisaoId?: unknown } | null)?.revisaoId;
    return typeof id === "string" ? [id] : [];
  });
}

function assinaturaDoEnvio(revisaoIds: readonly string[], destinatarios: readonly string[]): string {
  return `${[...revisaoIds].sort().join(",")}|${[...destinatarios].sort().join(",")}`;
}

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
    select: { id: true, codigo: true, nome: true, clienteId: true, cliente: { select: { nome: true } } },
  });
  if (!projeto) throw new ActionError("Projeto não encontrado.");

  // Quem pediu para não receber contato (`optOut`) não recebe, nem digitado à mão: a regra vale no servidor.
  const optOuts = projeto.clienteId
    ? await prisma.contatoCliente.findMany({
        // Também o contato excluído: o pedido de não receber vale mesmo depois que o cadastro saiu.
        where: { clienteId: projeto.clienteId, optOut: true, email: { not: null }, excluidoEm: { not: undefined } },
        select: { email: true },
      })
    : [];
  const bloqueados = new Set(optOuts.map((c) => (c.email ?? "").trim().toLowerCase()));
  const validos = destinatariosValidos([], args.destinatarios);
  const destinatarios = validos.filter((e) => !bloqueados.has(e));
  if (validos.length === 0) throw new ActionError("Informe ao menos um destinatário com e-mail válido.");
  if (destinatarios.length === 0) throw new ActionError("Os destinatários escolhidos pediram para não receber comunicações.");

  const escolhidas = new Set(args.revisaoIds);
  const itens = (await itensEnviadosAoCliente(projeto.id)).filter((i) => escolhidas.has(i.revisaoId));
  if (itens.length === 0) {
    throw new ActionError("Nenhuma das revisões escolhidas está marcada como enviada ao cliente. Atualize a lista e tente de novo.");
  }

  // Um envio por projeto de cada vez (dois cliques, duas abas): o segundo espera o primeiro terminar, relê o histórico e
  // é recusado se o primeiro acabou de mandar o MESMO e-mail. O encadeamento (In-Reply-To) também sai certo — os dois
  // não respondem ao mesmo e-mail anterior.
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`acompanhamento:${projeto.id}`}))`;
      const recentes = await tx.emailAcompanhamento.findMany({
        where: { projetoId: projeto.id, enviadoEm: { gte: new Date(Date.now() - JANELA_DUPLICADO_MS) } },
        select: { itens: true, destinatarios: true },
      });
      const assinatura = assinaturaDoEnvio(itens.map((i) => i.revisaoId), destinatarios);
      if (recentes.some((r) => assinaturaDoEnvio(revisoesDoRegistro(r.itens), r.destinatarios) === assinatura)) {
        throw new ActionError("Este e-mail acabou de ser enviado, com as mesmas revisões e os mesmos destinatários. Confira em Envios anteriores.");
      }

      const anteriores = await tx.emailAcompanhamento.findMany({
        where: { projetoId: projeto.id },
        orderBy: { enviadoEm: "asc" },
        select: { messageId: true },
      });
      const conversa = cabecalhosDeConversa(anteriores.map((a) => a.messageId));
      const messageId = novoMessageId(projeto.id, randomUUID().replace(/-/g, "").slice(0, 16), dominioDoMessageId());
      const assunto = assuntoDoAcompanhamento(projeto.codigo, projeto.nome);

      // Tudo que vem de gente (nome, título do arquivo, observação) é escapado: o corpo é Markdown e sai da empresa.
      const { html } = await renderTemplate("acompanhamento-projeto", {
        nomeCliente: escaparMarkdown(projeto.cliente?.nome || "cliente"),
        projeto: escaparMarkdown(projeto.nome),
        lista: listaEmMarkdown(itens.map((i) => ({ rotulo: escaparMarkdown(i.rotulo) }))),
        observacao: escaparMarkdown(args.observacao?.trim() ?? ""),
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

      // O e-mail já saiu: se o registro falhar, a pessoa precisa saber — senão manda de novo e duplica para o cliente.
      const registro = await tx.emailAcompanhamento
        .create({
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
        })
        .catch((err: unknown) => {
          console.error("[acompanhamento] e-mail enviado, mas o registro falhou:", err);
          throw new ActionError(
            "O e-mail foi enviado ao cliente, mas não foi possível registrar o envio. Não envie de novo; avise a equipe de TI.",
          );
        });
      return { id: registro.id, destinatarios, itens: itens.length };
    },
    // O envio SMTP acontece dentro da transação (teto de 30 s no transporte): o padrão de 5 s não basta.
    { timeout: 90_000, maxWait: 60_000 },
  );
}
