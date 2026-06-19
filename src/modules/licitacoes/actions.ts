"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { proximoCodigoProjeto } from "@/modules/projetos/numbering";
import { ensureCanaisProjeto } from "@/modules/chat/service";
import { transicaoPermitida, mensagemTransicaoInvalida, type StatusLicitacao } from "./status";
import { modalidadePermitida } from "./modalidade";
import { nomesModalidadesAtivas } from "./modalidades/queries";
import {
  registrarHistorico,
  textoMudancaStatus,
  textoMedicao,
  textoImportacao,
  textoExclusaoMedicao,
  textoExclusaoVersaoDoc,
} from "./historico";
import { removerArquivo } from "@/lib/storage";
import { saldoContratual, somaDeltas } from "./contrato/saldo";

/** Valida que a modalidade (se informada) pertence à lista configurável ativa. */
async function validarModalidade(nome: string | null | undefined) {
  if (!nome) return;
  const ativas = await nomesModalidadesAtivas();
  if (!modalidadePermitida(nome, ativas)) {
    throw new ActionError("Modalidade inválida — escolha uma da lista configurada.");
  }
}

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
const excluirMedicaoSchema = z.object({ id: z.string().min(1) });
const excluirVersaoDocSchema = z.object({ versaoId: z.string().min(1) });

export const criarLicitacao = defineAction(
  { ...base, acao: "criar-licitacao", entidade: "Licitacao", schema: licitacaoSchema },
  async (i) => {
    await validarModalidade(i.modalidade);
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
  async (i, { user }) => {
    const { id, ...r } = i;
    const atual = await prisma.licitacao.findUnique({ where: { id }, select: { status: true } });
    if (!atual) throw new ActionError("Licitação não encontrada.");
    const de = atual.status as StatusLicitacao;
    const para = r.status as StatusLicitacao;
    if (!transicaoPermitida(de, para)) throw new ActionError(mensagemTransicaoInvalida(de, para));
    await validarModalidade(r.modalidade);
    await prisma.$transaction(async (tx) => {
      await tx.licitacao.update({
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
      if (de !== para) {
        await registrarHistorico(tx, id, textoMudancaStatus(de, para), user.id);
      }
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
      include: {
        medicoes: { orderBy: { numero: "desc" } },
        contrato: { include: { aditivos: true } },
      },
    });
    if (!lic) throw new ActionError("Licitação não encontrada.");
    if (!lic.projetoId)
      throw new ActionError(
        "Licitação sem projeto vinculado — importe a licitação ganha antes de registrar medições.",
      );
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
      const med = await tx.medicaoLicitacao.create({
        data: {
          licitacaoId: lic.id,
          numero,
          descricao: i.descricao || null,
          valor: i.valor,
          data: new Date(i.data),
          lancamentoId: lanc.id,
        },
      });
      await registrarHistorico(tx, lic.id, textoMedicao(numero, i.valor, i.data), user.id);
      return med;
    });
    let aviso: string | undefined;
    if (lic.contrato && Number(lic.contrato.valorHomologado) > 0) {
      const homologado = Number(lic.contrato.valorHomologado);
      const deltas = somaDeltas(lic.contrato.aditivos.map((a) => ({ valorDelta: a.valorDelta != null ? Number(a.valorDelta) : null })));
      const medidoAntes = lic.medicoes.reduce((s, m) => s + Number(m.valor), 0);
      const saldoAntes = saldoContratual(homologado, deltas, medidoAntes);
      if (i.valor > saldoAntes) {
        const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
        aviso = `Atenção: esta medição (${fmt(i.valor)}) excede o saldo contratual (${fmt(saldoAntes)}).`;
      }
    }
    rev();
    revalidatePath("/financeiro/contas-a-receber");
    return { id: medicao.id, numero, aviso };
  },
);

/**
 * Importa licitação GANHA → cria projeto tipo licitação + canais de chat,
 * e leva a documentação ao Jurídico (pasta do projeto). Status → em_execucao.
 */
export const importarLicitacao = defineAction(
  { ...base, acao: "importar-licitacao", entidade: "Licitacao", schema: importarSchema },
  async (i, { user }) => {
    const lic = await prisma.licitacao.findUnique({
      where: { id: i.id },
      include: { docs: { include: { versoes: true } }, composicao: { include: { itens: true } } },
    });
    if (!lic) throw new ActionError("Licitação não encontrada.");
    if (!transicaoPermitida(lic.status as StatusLicitacao, "em_execucao", { viaImport: true }))
      throw new ActionError("Apenas licitações GANHAS podem ser importadas.");
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
      await registrarHistorico(tx, lic.id, textoImportacao(prj.codigo), user.id);
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
      if (lic.composicao && lic.composicao.itens.length > 0) {
        await tx.projetoComposicaoPreco.create({
          data: {
            projetoId: prj.id,
            observacao: lic.composicao.observacao,
            itens: {
              create: lic.composicao.itens.map((it) => ({
                descricao: it.descricao,
                quantidade: it.quantidade,
                valorUnitario: it.valorUnitario,
                ordem: it.ordem,
              })),
            },
          },
        });
      }
      await tx.contratoLicitacao.create({
        data: { licitacaoId: lic.id, valorHomologado: lic.valorEstimado ?? 0, valorHomologadoBase: lic.valorEstimado ?? 0 },
      });
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
    const lic = await prisma.licitacao.findUnique({
      where: { id: i.id },
      include: { docs: { include: { versoes: { select: { arquivoPath: true } } } } },
    });
    if (!lic) throw new ActionError("Licitação não encontrada.");
    // projetoId guard ensures no Juridico copies exist (import sets projetoId)
    if (lic.projetoId) throw new ActionError("Licitação importada não pode ser excluída.");

    const paths = lic.docs.flatMap((d) => d.versoes.map((v) => v.arquivoPath));

    await prisma.licitacao.delete({ where: { id: i.id } });

    // Remove physical files after successful DB cascade
    await Promise.all(paths.map(removerArquivo));

    rev();
    return { id: i.id, arquivosRemovidos: paths.length };
  },
);

/** Estorna medição: soft-delete do lançamento financeiro + remove a medição. */
export const excluirMedicao = defineAction(
  { ...base, acao: "excluir-medicao", entidade: "MedicaoLicitacao", schema: excluirMedicaoSchema },
  async (i, { user }) => {
    const medicao = await prisma.medicaoLicitacao.findUnique({ where: { id: i.id } });
    if (!medicao) throw new ActionError("Medição não encontrada.");

    if (medicao.lancamentoId) {
      const lanc = await prisma.lancamento.findUnique({
        where: { id: medicao.lancamentoId },
        include: { transacao: true },
      });
      // STOP: lançamento já conciliado com OFX
      if (lanc?.transacao?.conciliado) {
        throw new ActionError(
          "Este lançamento financeiro já foi conciliado com um extrato bancário e não pode ser estornado automaticamente. Revise pelo módulo Financeiro.",
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      if (medicao.lancamentoId) {
        await tx.lancamento.update({
          where: { id: medicao.lancamentoId },
          data: { excluidoEm: new Date() },
        });
      }
      await tx.medicaoLicitacao.delete({ where: { id: i.id } });
      await registrarHistorico(
        tx,
        medicao.licitacaoId,
        textoExclusaoMedicao(medicao.numero, Number(medicao.valor)),
        user.id,
      );
    });

    rev();
    revalidatePath("/financeiro/contas-a-receber");
    return { id: i.id };
  },
);

/** Remove uma versão de documento + arquivo físico. Bloqueia se o arquivo foi copiado ao Jurídico. */
export const excluirVersaoDocLicitacao = defineAction(
  { ...base, acao: "excluir-versao-doc-licitacao", entidade: "DocLicitacaoVersao", schema: excluirVersaoDocSchema },
  async (i, { user }) => {
    const versao = await prisma.docLicitacaoVersao.findUnique({
      where: { id: i.versaoId },
      include: { documento: { select: { id: true, titulo: true, licitacaoId: true } } },
    });
    if (!versao) throw new ActionError("Versão não encontrada.");

    // STOP: mesmo path referenciado em DocJuridicoVersao (copiado ao importar)
    const juridicoRef = await prisma.docJuridicoVersao.findFirst({
      where: { arquivoPath: versao.arquivoPath },
      select: { id: true },
    });
    if (juridicoRef) {
      throw new ActionError(
        "Este arquivo foi copiado para o módulo Jurídico ao importar a licitação. Para removê-lo, exclua também pelo módulo Jurídico.",
      );
    }

    const totalVersoes = await prisma.docLicitacaoVersao.count({
      where: { documentoId: versao.documentoId },
    });

    await prisma.$transaction(async (tx) => {
      await tx.docLicitacaoVersao.delete({ where: { id: i.versaoId } });
      // Remove parent doc when last version is deleted
      if (totalVersoes === 1) {
        await tx.documentoLicitacao.delete({ where: { id: versao.documentoId } });
      }
      await registrarHistorico(
        tx,
        versao.documento.licitacaoId,
        textoExclusaoVersaoDoc(versao.documento.titulo, versao.numero),
        user.id,
      );
    });

    // Physical file removal after DB commit
    await removerArquivo(versao.arquivoPath);

    rev();
    return { id: i.versaoId };
  },
);
