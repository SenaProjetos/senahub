"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { proximoCodigoProjeto } from "@/modules/projetos/numbering";
import { ensureCanaisProjeto } from "@/modules/chat/service";

const base = { modulo: "licitacoes", recurso: "licitacoes", permissao: "gerir" } as const;
const rev = () => revalidatePath("/licitacoes");
const opt = (s: z.ZodString) => s.optional().or(z.literal(""));

const licitacaoSchema = z.object({
  titulo: z.string().min(1, "Informe o título."),
  orgao: opt(z.string()),
  modalidade: opt(z.string()),
  numeroEdital: opt(z.string()),
  prazoProposta: opt(z.string()),
  valorEstimado: z.number().nonnegative().optional(),
  observacoes: opt(z.string()),
});
const editarSchema = licitacaoSchema.extend({
  id: z.string().min(1),
  status: z.enum(["em_andamento", "ganha", "perdida", "em_execucao", "concluida"]),
});
const idSchema = z.object({ id: z.string().min(1) });
const medicaoSchema = z.object({
  licitacaoId: z.string().min(1),
  descricao: opt(z.string()),
  valor: z.number().positive("Valor deve ser positivo."),
  data: z.string().min(1),
});
const importarSchema = z.object({ id: z.string().min(1), clienteId: z.string().min(1) });

export const criarLicitacao = defineAction(
  { ...base, acao: "criar-licitacao", entidade: "Licitacao", schema: licitacaoSchema },
  async (i) => {
    const l = await prisma.licitacao.create({
      data: {
        titulo: i.titulo,
        orgao: i.orgao || null,
        modalidade: i.modalidade || null,
        numeroEdital: i.numeroEdital || null,
        prazoProposta: i.prazoProposta ? new Date(i.prazoProposta) : null,
        valorEstimado: i.valorEstimado,
        observacoes: i.observacoes || null,
      },
    });
    rev();
    return { id: l.id };
  },
);

export const editarLicitacao = defineAction(
  { ...base, acao: "editar-licitacao", entidade: "Licitacao", schema: editarSchema },
  async (i) => {
    const { id, ...r } = i;
    await prisma.licitacao.update({
      where: { id },
      data: {
        titulo: r.titulo,
        orgao: r.orgao || null,
        modalidade: r.modalidade || null,
        numeroEdital: r.numeroEdital || null,
        prazoProposta: r.prazoProposta ? new Date(r.prazoProposta) : null,
        valorEstimado: r.valorEstimado,
        observacoes: r.observacoes || null,
        status: r.status,
      },
    });
    rev();
    return { id };
  },
);

/** Medição → Lançamento de receita PREVISTO na categoria 1.02 (Licitações). */
export const registrarMedicao = defineAction(
  { ...base, acao: "registrar-medicao", entidade: "MedicaoLicitacao", schema: medicaoSchema },
  async (i, { user }) => {
    const lic = await prisma.licitacao.findUnique({
      where: { id: i.licitacaoId },
      include: { medicoes: { orderBy: { numero: "desc" }, take: 1 } },
    });
    if (!lic) throw new ActionError("Licitação não encontrada.");
    const categoria = await prisma.categoriaFinanceira.findUnique({ where: { codigo: "1.02" } });
    if (!categoria) throw new ActionError("Categoria 1.02 ausente no plano de contas.");

    const numero = (lic.medicoes[0]?.numero ?? 0) + 1;
    const medicao = await prisma.$transaction(async (tx) => {
      const lanc = await tx.lancamento.create({
        data: {
          tipo: "receita",
          descricao: `Medição ${numero} — ${lic.titulo}`,
          valor: i.valor,
          status: "previsto",
          data: new Date(i.data),
          vencimento: new Date(i.data),
          categoriaId: categoria.id,
          projetoId: lic.projetoId,
          autorId: user.id,
        },
      });
      return tx.medicaoLicitacao.create({
        data: {
          licitacaoId: lic.id,
          numero,
          descricao: i.descricao || null,
          valor: i.valor,
          data: new Date(i.data),
          lancamentoId: lanc.id,
        },
      });
    });
    rev();
    revalidatePath("/financeiro/contas-a-receber");
    return { id: medicao.id, numero };
  },
);

/**
 * Importa licitação GANHA → cria projeto tipo licitação + canais de chat,
 * e leva a documentação ao Jurídico (pasta do projeto). Status → em_execucao.
 */
export const importarLicitacao = defineAction(
  { ...base, acao: "importar-licitacao", entidade: "Licitacao", schema: importarSchema },
  async (i) => {
    const lic = await prisma.licitacao.findUnique({
      where: { id: i.id },
      include: { docs: { include: { versoes: true } } },
    });
    if (!lic) throw new ActionError("Licitação não encontrada.");
    if (lic.status !== "ganha") throw new ActionError("Apenas licitações GANHAS podem ser importadas.");
    if (lic.projetoId) throw new ActionError("Licitação já importada.");

    const projeto = await prisma.$transaction(async (tx) => {
      const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
      const prj = await tx.projeto.create({
        data: {
          ano,
          sequencial,
          codigo,
          tipo: "licitacao",
          nome: lic.titulo,
          clienteId: i.clienteId,
        },
      });
      await tx.licitacao.update({
        where: { id: lic.id },
        data: { status: "em_execucao", projetoId: prj.id },
      });
      // Documentação da licitação → Jurídico, vinculada ao projeto.
      for (const doc of lic.docs) {
        await tx.documentoJuridico.create({
          data: {
            titulo: `[Licitação] ${doc.titulo}`,
            tipo: "outro",
            projetoId: prj.id,
            versoes: {
              create: doc.versoes.map((v) => ({
                numero: v.numero,
                arquivoPath: v.arquivoPath,
                arquivoNome: v.arquivoNome,
                autorId: v.autorId,
              })),
            },
          },
        });
      }
      return prj;
    });

    await ensureCanaisProjeto(projeto.id);
    rev();
    revalidatePath("/projetos");
    revalidatePath("/juridico");
    return { projetoId: projeto.id, codigo: projeto.codigo };
  },
);

export const excluirLicitacao = defineAction(
  { ...base, acao: "excluir-licitacao", entidade: "Licitacao", schema: idSchema },
  async (i) => {
    const lic = await prisma.licitacao.findUnique({ where: { id: i.id } });
    if (!lic) throw new ActionError("Licitação não encontrada.");
    if (lic.projetoId) throw new ActionError("Licitação importada não pode ser excluída.");
    await prisma.licitacao.delete({ where: { id: i.id } });
    rev();
    return { id: i.id };
  },
);
