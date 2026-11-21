import "server-only";
import { prisma } from "@/lib/prisma";
import { secoesDoProjeto } from "@/modules/inputs/briefing-schema";
import { resolverModeloDoProjeto } from "@/modules/inputs/modelo-queries";
import { perguntasDoPadraoParaCriar } from "@/modules/inputs/perguntas";
import { haPerguntaParaOCliente, situacaoPortal } from "@/modules/inputs/portal-pedido";

/**
 * Leituras do pedido do briefing pelo portal — só leitura, sem aviso nem e-mail. Servem o serviço do pedido
 * (`portal-pedido-service.ts`) e a tela da equipe (`queries.ts`), que não deve puxar o serviço (e-mail, sino).
 */

/** O que o pedido precisa saber do projeto: cliente, contas do portal, estado do pedido e o briefing. */
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

/**
 * Há pergunta para o cliente responder: seção visível no formulário do projeto, pergunta extra ativa ou pergunta
 * do padrão que o "Pedir" cria antes de abrir (só conta, não grava). Mesma regra na tela e no serviço.
 */
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
  // Com seção visível já há o que preencher: não carrega pergunta nem padrão.
  if (visiveis.length > 0) return true;
  const existentes = await prisma.inputProjeto.findMany({
    where: { projetoId },
    select: { templateId: true, disciplina: true, pergunta: true, removidoEm: true },
  });
  const templates = await prisma.inputTemplate.findMany({
    where: { ativo: true },
    select: { id: true, disciplina: true, pergunta: true, ordem: true },
  });
  return haPerguntaParaOCliente({
    secoesVisiveis: 0,
    extrasAtivas: existentes.filter((e) => e.removidoEm == null).length,
    padraoACriar: perguntasDoPadraoParaCriar(templates, existentes, disciplinas).length,
  });
}
