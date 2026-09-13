"use server";

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { notificar } from "@/lib/notificar";
import { filtrarPorCategoria } from "@/modules/usuarios/preferencias/queries";
import { textoRecibo, totalRecibo, type ItemRecibo } from "./service";

/**
 * Recibo de pagamento de produção (G5/D36). Nasce DEPOIS do pagamento e nunca o trava
 * (decisão do dono): é documento do que já saiu do caixa, não etapa de aprovação.
 *
 * Gerar é de quem paga (`folha_pj`); assinar é do próprio projetista (`extrato` + titular).
 */

const SELECT_PAGAMENTO = {
  id: true,
  valor: true,
  status: true,
  liberadoEm: true,
  pagoEm: true,
  projetistaId: true,
  disciplina: {
    select: { disciplinaTextoLegado: true, projeto: { select: { codigo: true, nome: true } } },
  },
} as const;

type PagamentoDoRecibo = {
  id: string;
  valor: unknown;
  liberadoEm: Date;
  pagoEm: Date | null;
  disciplina: { disciplinaTextoLegado: string; projeto: { codigo: string; nome: string } };
};

/** Ordem estável (mais antigo primeiro): o texto assinado não pode variar por sorte da query. */
function itensDoTexto(pagamentos: PagamentoDoRecibo[]): ItemRecibo[] {
  return [...pagamentos]
    .sort((a, b) => a.liberadoEm.getTime() - b.liberadoEm.getTime() || a.id.localeCompare(b.id))
    .map((p) => ({
      projetoCodigo: p.disciplina.projeto.codigo,
      projetoNome: p.disciplina.projeto.nome,
      disciplina: p.disciplina.disciplinaTextoLegado,
      liberadoEm: p.liberadoEm,
      pagoEm: p.pagoEm,
      valor: Number(p.valor),
    }));
}

const individualSchema = z.object({ pagamentoId: z.string().min(1) });

/** Recibo de UMA entrega paga. */
export const gerarReciboIndividual = defineAction(
  {
    modulo: "financeiro",
    acao: "gerar-recibo-individual",
    recurso: "financeiro",
    permissao: "folha_pj",
    entidade: "ReciboProjetista",
    schema: individualSchema,
  },
  async (i, { user }) => {
    const pag = await prisma.pagamentoProjetista.findUnique({
      where: { id: i.pagamentoId },
      select: { ...SELECT_PAGAMENTO, projetista: { select: { id: true, name: true } } },
    });
    if (!pag) throw new ActionError("Pagamento não encontrado.");
    if (pag.status !== "pago") throw new ActionError("Recibo é do que já foi pago — este pagamento ainda não foi efetivado.");

    const jaTem = await prisma.reciboProjetistaItem.findFirst({
      where: { pagamentoId: pag.id, recibo: { tipo: "individual" } },
      select: { reciboId: true },
    });
    if (jaTem) throw new ActionError("Esta entrega já tem recibo individual.");

    const itens = itensDoTexto([pag]);
    const emitidoEm = new Date();
    const texto = textoRecibo({ tipo: "individual", projetistaNome: pag.projetista.name, itens, emitidoEm });

    const recibo = await prisma.reciboProjetista.create({
      data: {
        tipo: "individual",
        projetistaId: pag.projetista.id,
        valor: totalRecibo(itens),
        texto,
        textoHash: createHash("sha256").update(texto).digest("hex"),
        geradoPorId: user.id,
        criadoEm: emitidoEm,
        itens: { create: [{ pagamentoId: pag.id }] },
      },
    });

    await notificar(
      pag.projetista.id,
      {
        titulo: "Recibo de produção para assinar",
        corpo: "Um recibo de pagamento foi gerado — confira e assine no seu extrato.",
        href: "/financeiro",
        tag: `recibo-${recibo.id}`,
      },
      { categoria: "pagamento" },
    );

    revalidatePath("/financeiro/folha-projetistas");
    revalidatePath("/financeiro");
    return { id: recibo.id };
  },
);

const mensalSchema = z.object({
  projetistaId: z.string().min(1),
  ano: z.number().int().min(2000).max(2100),
  mes: z.number().int().min(1).max(12),
});

/**
 * Recibo consolidado do mês: todas as entregas PAGAS daquele projetista com `pagoEm` no mês.
 * Recorte por data de pagamento (e não de liberação): o recibo é do dinheiro que saiu.
 */
export const gerarReciboMensal = defineAction(
  {
    modulo: "financeiro",
    acao: "gerar-recibo-mensal",
    recurso: "financeiro",
    permissao: "folha_pj",
    entidade: "ReciboProjetista",
    schema: mensalSchema,
  },
  async (i, { user }) => {
    const projetista = await prisma.user.findUnique({ where: { id: i.projetistaId }, select: { id: true, name: true } });
    if (!projetista) throw new ActionError("Projetista não encontrado.");

    const existente = await prisma.reciboProjetista.findFirst({
      where: { projetistaId: i.projetistaId, tipo: "mensal", ano: i.ano, mes: i.mes },
      select: { id: true },
    });
    if (existente) throw new ActionError("Já existe recibo mensal deste projetista para esta competência.");

    // Fronteiras em UTC: `pagoEm` é gravado como meia-noite UTC do dia (ver `quandoDoPagamento`).
    const ini = new Date(Date.UTC(i.ano, i.mes - 1, 1));
    const fim = new Date(Date.UTC(i.ano, i.mes, 1));
    const pagamentos = await prisma.pagamentoProjetista.findMany({
      where: { projetistaId: i.projetistaId, status: "pago", pagoEm: { gte: ini, lt: fim } },
      select: SELECT_PAGAMENTO,
    });
    if (pagamentos.length === 0) {
      throw new ActionError("Nenhum pagamento efetivado deste projetista nesta competência.");
    }

    const itens = itensDoTexto(pagamentos);
    const emitidoEm = new Date();
    const texto = textoRecibo({
      tipo: "mensal",
      projetistaNome: projetista.name,
      ano: i.ano,
      mes: i.mes,
      itens,
      emitidoEm,
    });

    const recibo = await prisma.reciboProjetista.create({
      data: {
        tipo: "mensal",
        projetistaId: projetista.id,
        ano: i.ano,
        mes: i.mes,
        valor: totalRecibo(itens),
        texto,
        textoHash: createHash("sha256").update(texto).digest("hex"),
        geradoPorId: user.id,
        criadoEm: emitidoEm,
        itens: { create: pagamentos.map((p) => ({ pagamentoId: p.id })) },
      },
    });

    await notificar(
      projetista.id,
      {
        titulo: "Recibo do mês para assinar",
        corpo: `Recibo de ${String(i.mes).padStart(2, "0")}/${i.ano} gerado — confira, anexe a NF e assine no seu extrato.`,
        href: "/financeiro",
        tag: `recibo-${recibo.id}`,
      },
      { categoria: "pagamento" },
    );

    revalidatePath("/financeiro/folha-projetistas");
    revalidatePath("/financeiro");
    return { id: recibo.id, entregas: pagamentos.length };
  },
);

const assinarSchema = z.object({ id: z.string().min(1) });

/**
 * Assinatura eletrônica do projetista, dentro do sistema (decisão do dono).
 *
 * Gate `financeiro:extrato` (o par que PJ e freelancer já têm) MAIS a checagem de titular:
 * ninguém assina recibo de outra pessoa, nem quem tem permissão de financeiro. Confere o
 * SHA-256 do texto gravado antes de assinar — se o texto tiver sido alterado no banco por
 * fora, a assinatura não acontece.
 */
export const assinarRecibo = defineAction(
  {
    modulo: "financeiro",
    acao: "assinar-recibo",
    recurso: "financeiro",
    permissao: "extrato",
    entidade: "ReciboProjetista",
    schema: assinarSchema,
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
  },
  async (i, { user }) => {
    const recibo = await prisma.reciboProjetista.findUnique({
      where: { id: i.id },
      select: { id: true, projetistaId: true, assinadoEm: true, texto: true, textoHash: true },
    });
    if (!recibo) throw new ActionError("Recibo não encontrado.");
    if (recibo.projetistaId !== user.id) throw new ActionError("Só o próprio projetista assina o recibo dele.");
    if (recibo.assinadoEm) throw new ActionError("Este recibo já foi assinado.");

    const hashAtual = createHash("sha256").update(recibo.texto).digest("hex");
    if (hashAtual !== recibo.textoHash) {
      throw new ActionError("O texto deste recibo não confere com o código de verificação — fale com o financeiro.");
    }

    // `assinadoEm: null` na condição: dois cliques simultâneos não geram duas assinaturas.
    const assinado = await prisma.reciboProjetista.updateMany({
      where: { id: recibo.id, assinadoEm: null },
      data: { assinadoEm: new Date(), assinanteId: user.id },
    });
    if (assinado.count === 0) throw new ActionError("Este recibo já foi assinado.");

    revalidatePath("/financeiro");
    revalidatePath("/financeiro/folha-projetistas");
    return { id: recibo.id };
  },
);

const lembrarSchema = z.object({ id: z.string().min(1) });

/**
 * Reenvia o aviso de assinatura pendente — pra quem gerencia Produção acompanhar recibo
 * gerado e "esquecido" (achado do dono, 2026-09-12: gerar era "atirar e esquecer", sem
 * nenhum jeito de saber se o projetista nunca assinou). Não é uma fila/lembrete automático,
 * é o gestor pedindo de novo quando achar que já demorou.
 */
export const lembrarAssinaturaRecibo = defineAction(
  {
    modulo: "financeiro",
    acao: "lembrar-assinatura-recibo",
    recurso: "financeiro",
    permissao: "folha_pj",
    entidade: "ReciboProjetista",
    schema: lembrarSchema,
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
  },
  async (i) => {
    const recibo = await prisma.reciboProjetista.findUnique({
      where: { id: i.id },
      select: { id: true, projetistaId: true, assinadoEm: true, tipo: true, ano: true, mes: true },
    });
    if (!recibo) throw new ActionError("Recibo não encontrado.");
    if (recibo.assinadoEm) throw new ActionError("Este recibo já foi assinado — não há o que lembrar.");

    // Botão existe pra AVISAR — se o canal está fechado (opt-out), o toast precisa dizer
    // isso em vez de afirmar "enviado" (achado do advisor: notificar() silencioso em opt-out
    // era tolerável na notificação original de geração, mas não aqui, onde a função do
    // botão é a entrega em si).
    const liberados = await filtrarPorCategoria([recibo.projetistaId], "pagamento");
    const avisado = liberados.length > 0;
    if (avisado) {
      const competencia = recibo.ano && recibo.mes ? ` de ${String(recibo.mes).padStart(2, "0")}/${recibo.ano}` : "";
      await notificar(
        recibo.projetistaId,
        {
          titulo: "Lembrete: recibo aguardando sua assinatura",
          corpo: `O recibo${recibo.tipo === "mensal" ? " mensal" + competencia : ""} de produção ainda não foi assinado — confira e assine no seu extrato.`,
          href: "/financeiro",
          tag: `recibo-lembrete-${recibo.id}-${Date.now()}`,
        },
        { categoria: "pagamento" },
      );
    }

    return { id: recibo.id, avisado };
  },
);
