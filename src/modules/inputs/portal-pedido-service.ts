import "server-only";
import { prisma } from "@/lib/prisma";
import { notificar } from "@/lib/notificar";
import { smtpConfigurado } from "@/lib/mail";
import { enviarEmailTemplate } from "@/lib/email-templates";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { secoesDoProjeto } from "@/modules/inputs/briefing-schema";
import { resolverModeloDoProjeto } from "@/modules/inputs/modelo-queries";
import { aplicarInputsPadraoCore } from "@/modules/inputs/inputs-padrao-service";
import {
  MOTIVO_JA_PEDIDO,
  MOTIVO_PEDIDO_NAO_ABERTO,
  motivoParaNaoPedir,
  situacaoPortal,
  textoPedidoBriefing,
} from "@/modules/inputs/portal-pedido";

/**
 * Pedir e encerrar o briefing pelo portal do cliente (equipe). A mudança de estado é um `updateMany`
 * condicionado ao estado lido: dois cliques simultâneos terminam em um só pedido, e só quem gravou avisa.
 */

export type AvisarPedido = {
  notificar: (userId: string, n: { titulo: string; corpo: string; href: string }) => Promise<void>;
  enviarEmail: ((to: string, slug: string, vars: Record<string, string>) => Promise<boolean>) | null;
};

export type ResultadoPedido =
  | { ok: true; reaberto: boolean; avisadas: number; emails: number }
  | { ok: false; erro: string };

/** O que o pedido precisa saber do projeto: cliente, contas do portal, estado do pedido e se há o que preencher. */
export async function lerContexto(projetoId: string) {
  const projeto = await prisma.projeto.findUnique({
    where: { id: projetoId },
    select: { id: true, nome: true, codigo: true, clienteId: true, cliente: { select: { ativo: true } } },
  });
  if (!projeto) return null;
  const contas = projeto.clienteId
    ? await prisma.user.findMany({
        where: { tipo: "externo", ativo: true, clienteId: projeto.clienteId },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      })
    : [];
  const briefing = await prisma.briefingProjeto.findUnique({
    where: { projetoId },
    select: { portalPedidoEm: true, portalEncerradoEm: true, modeloId: true, secoesOcultas: true, camposOcultos: true },
  });
  return { projeto, contas, briefing, situacao: situacaoPortal(briefing) };
}

/** Há pergunta para o cliente responder: alguma seção visível no formulário do projeto OU pergunta extra ativa. */
export async function temAlgoAPreencher(
  projetoId: string,
  briefing: { modeloId: string | null; secoesOcultas: string[]; camposOcultos: string[] } | null,
): Promise<boolean> {
  const modelo = await resolverModeloDoProjeto(projetoId, briefing?.modeloId);
  const disciplinas = (await prisma.disciplina.findMany({ where: { projetoId }, select: { disciplinaTextoLegado: true } })).map(
    (d) => d.disciplinaTextoLegado,
  );
  const visiveis = secoesDoProjeto(modelo.secoes, disciplinas, {
    secoes: briefing?.secoesOcultas ?? [],
    campos: briefing?.camposOcultos ?? [],
  });
  if (visiveis.length > 0) return true;
  return (await prisma.inputProjeto.count({ where: { projetoId, removidoEm: null } })) > 0;
}

export async function pedirBriefingNoPortal(
  projetoId: string,
  porId: string,
  deps: AvisarPedido = { notificar, enviarEmail: smtpConfigurado() ? enviarEmailTemplate : null },
): Promise<ResultadoPedido> {
  const ctx = await lerContexto(projetoId);
  if (!ctx) return { ok: false, erro: "Projeto não encontrado." };
  const { projeto, contas, situacao } = ctx;
  const base = {
    temCliente: !!projeto.clienteId,
    clienteAtivo: projeto.cliente?.ativo ?? false,
    contasAtivas: contas.length,
    situacao,
  };
  // Recusa barata primeiro: não cria pergunta padrão num projeto que o pedido não vai atender.
  const recusa = motivoParaNaoPedir({ ...base, temAlgoAPreencher: true });
  if (recusa) return { ok: false, erro: recusa };

  await aplicarInputsPadraoCore(projetoId);
  const algo = await temAlgoAPreencher(projetoId, ctx.briefing);
  const motivo = motivoParaNaoPedir({ ...base, temAlgoAPreencher: algo });
  if (motivo) return { ok: false, erro: motivo };

  const reaberto = situacao === "encerrado";
  // A linha pode não existir (briefing nunca aberto): garante antes do updateMany condicionado.
  await prisma.briefingProjeto.createMany({ data: [{ projetoId }], skipDuplicates: true });
  const { count } = await prisma.briefingProjeto.updateMany({
    where: { projetoId, OR: [{ portalPedidoEm: null }, { portalEncerradoEm: { not: null } }] },
    data: {
      portalPedidoEm: new Date(),
      portalPedidoPorId: porId,
      portalEncerradoEm: null,
      portalEncerradoPorId: null,
    },
  });
  if (count !== 1) return { ok: false, erro: MOTIVO_JA_PEDIDO };

  // Depois do commit: o aviso nunca desfaz o pedido.
  const href = `/portal/${projetoId}/briefing`;
  const texto = textoPedidoBriefing({ projetoNome: projeto.nome, projetoCodigo: formatarCodigo(projeto.codigo), reaberto });
  const app = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  let avisadas = 0;
  let emails = 0;
  for (const conta of contas) {
    try {
      await deps.notificar(conta.id, { ...texto, href });
      avisadas += 1;
    } catch (e) {
      console.error("[briefing-portal] sino do pedido falhou:", e);
    }
    if (deps.enviarEmail && conta.email) {
      try {
        const enviado = await deps.enviarEmail(conta.email, "portal-briefing-pedido", {
          nome: conta.name.trim().split(/\s+/)[0] ?? "",
          projeto: projeto.nome,
          url: `${app}${href}`,
        });
        if (enviado) emails += 1;
      } catch (e) {
        console.error("[briefing-portal] e-mail do pedido falhou:", e);
      }
    }
  }
  return { ok: true, reaberto, avisadas, emails };
}

export async function encerrarBriefingNoPortal(
  projetoId: string,
  porId: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const { count } = await prisma.briefingProjeto.updateMany({
    where: { projetoId, portalPedidoEm: { not: null }, portalEncerradoEm: null },
    data: { portalEncerradoEm: new Date(), portalEncerradoPorId: porId },
  });
  return count === 1 ? { ok: true } : { ok: false, erro: MOTIVO_PEDIDO_NAO_ABERTO };
}
