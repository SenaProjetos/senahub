"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { notificarMuitos } from "@/lib/notificar";
import { smtpConfigurado } from "@/lib/mail";
import { enviarEmailTemplate } from "@/lib/email-templates";
import { proximoCodigoProjeto } from "@/modules/projetos/numbering";
import { ensureCanaisProjeto } from "@/modules/chat/service";
import { notificarNovosMembros } from "@/lib/socket";
import {
  criarLeadSchema,
  editarLeadSchema,
  moverLeadSchema,
  idSchema,
  notaLeadSchema,
  converterLeadSchema,
  metaSchema,
  tabelaPrecoSchema,
  tabelaPrecoEditSchema,
  criarPropostaSchema,
  salvarPropostaSchema,
  statusPropostaSchema,
  criarEtapaSchema,
  editarEtapaSchema,
  alternarEtapaSchema,
} from "@/modules/comercial/schemas";
import type { Prisma } from "@/generated/prisma/client";

const base = { modulo: "comercial", recurso: "comercial", permissao: "gerir" } as const;
const rev = () => {
  revalidatePath("/comercial");
  revalidatePath("/comercial/propostas");
};

/**
 * Detecta a etapa "Perdido" pelo NOME (não há flag no schema; ver
 * FunilEtapa em schema.prisma e a etapa "Perdido" do seed). Comparação
 * case-insensitive por substring "perdid" — cobre "Perdido"/"Perdida".
 */
const etapaEhPerdido = (nome: string) => nome.toLowerCase().includes("perdid");

// ── Leads ─────────────────────────────────────────────────────
export const criarLead = defineAction(
  { ...base, acao: "criar-lead", entidade: "Lead", schema: criarLeadSchema },
  async (i) => {
    const lead = await prisma.lead.create({
      data: { ...i, email: i.email || null, valorEstimado: i.valorEstimado },
    });
    rev();
    return { id: lead.id };
  },
);

export const editarLead = defineAction(
  { ...base, acao: "editar-lead", entidade: "Lead", schema: editarLeadSchema },
  async (i) => {
    const { id, ...rest } = i;
    await prisma.lead.update({
      where: { id },
      data: { ...rest, email: rest.email || null },
    });
    rev();
    return { id };
  },
);

/**
 * Drag-and-drop do Kanban (ou troca de etapa via select): muda a etapa.
 * Se a etapa destino for "Perdido", exige `motivoPerda` e o grava.
 * Ao sair de "Perdido" para outra etapa, limpa o motivo.
 */
export const moverLead = defineAction(
  { ...base, acao: "mover-lead", entidade: "Lead", schema: moverLeadSchema },
  async (i) => {
    const destino = await prisma.funilEtapa.findUnique({
      where: { id: i.etapaId },
      select: { nome: true },
    });
    if (!destino) throw new ActionError("Etapa não encontrada.");

    let motivoPerda: string | null | undefined;
    if (etapaEhPerdido(destino.nome)) {
      const motivo = i.motivoPerda?.trim();
      if (!motivo) throw new ActionError("Informe o motivo da perda.");
      motivoPerda = motivo;
    } else {
      // Saindo de "Perdido" (ou indo para etapa comum): limpa o motivo.
      motivoPerda = null;
    }

    await prisma.lead.update({
      where: { id: i.id },
      data: { etapaId: i.etapaId, motivoPerda },
    });
    rev();
    return { id: i.id };
  },
);

export const arquivarLead = defineAction(
  { ...base, acao: "arquivar-lead", entidade: "Lead", schema: idSchema },
  async (i) => {
    await prisma.lead.update({ where: { id: i.id }, data: { arquivado: true } });
    rev();
    return { id: i.id };
  },
);

export const adicionarNotaLead = defineAction(
  { ...base, acao: "nota-lead", entidade: "AtividadeLead", schema: notaLeadSchema },
  async (i, { user }) => {
    await prisma.atividadeLead.create({
      data: { leadId: i.leadId, nota: i.nota, autorId: user.id },
    });
    rev();
    return { leadId: i.leadId };
  },
);

/** Converte o lead em cliente (sem redigitação). */
export const converterLead = defineAction(
  { ...base, acao: "converter-lead", entidade: "Lead", schema: converterLeadSchema },
  async (i) => {
    const lead = await prisma.lead.findUnique({ where: { id: i.id } });
    if (!lead) throw new ActionError("Lead não encontrado.");
    if (lead.clienteId) throw new ActionError("Lead já convertido.");

    const cliente = await prisma.cliente.create({
      data: {
        tipo: "PJ",
        nome: lead.nome,
        email: lead.email,
        telefone: lead.telefone,
        observacoes: lead.observacoes,
      },
    });
    await prisma.lead.update({ where: { id: i.id }, data: { clienteId: cliente.id } });
    rev();
    revalidatePath("/clientes");
    return { clienteId: cliente.id };
  },
);

export const definirMeta = defineAction(
  { ...base, acao: "definir-meta", entidade: "MetaComercial", schema: metaSchema },
  async (i) => {
    await prisma.metaComercial.upsert({
      where: { ano_mes: { ano: i.ano, mes: i.mes } },
      create: { ano: i.ano, mes: i.mes, valor: i.valor },
      update: { valor: i.valor },
    });
    rev();
    return { ano: i.ano, mes: i.mes };
  },
);

// ── Etapas do funil ───────────────────────────────────────────

const revFunil = () => {
  revalidatePath("/comercial");
  revalidatePath("/configuracoes/funil-etapas");
};

export const criarEtapaFunil = defineAction(
  { ...base, acao: "criar-etapa-funil", entidade: "FunilEtapa", schema: criarEtapaSchema },
  async (i) => {
    const maxOrdem = await prisma.funilEtapa.aggregate({ _max: { ordem: true } });
    const etapa = await prisma.funilEtapa.create({
      data: { nome: i.nome, cor: i.cor || null, ordem: (maxOrdem._max.ordem ?? 0) + 1 },
    });
    revFunil();
    return { id: etapa.id };
  },
);

export const editarEtapaFunil = defineAction(
  { ...base, acao: "editar-etapa-funil", entidade: "FunilEtapa", schema: editarEtapaSchema },
  async (i) => {
    const existe = await prisma.funilEtapa.findUnique({ where: { id: i.id } });
    if (!existe) throw new ActionError("Etapa não encontrada.");
    await prisma.funilEtapa.update({
      where: { id: i.id },
      data: { nome: i.nome, cor: i.cor || null },
    });
    revFunil();
    return { id: i.id };
  },
);

export const alternarEtapaFunil = defineAction(
  { ...base, acao: "alternar-etapa-funil", entidade: "FunilEtapa", schema: alternarEtapaSchema },
  async (i) => {
    const etapa = await prisma.funilEtapa.findUnique({ where: { id: i.id } });
    if (!etapa) throw new ActionError("Etapa não encontrada.");
    await prisma.funilEtapa.update({ where: { id: i.id }, data: { ativo: !etapa.ativo } });
    revFunil();
    return { id: i.id };
  },
);

// ── Tabelas de preço ──────────────────────────────────────────
export const criarTabelaPreco = defineAction(
  { ...base, acao: "criar-tabela-preco", entidade: "TabelaPreco", schema: tabelaPrecoSchema },
  async (i) => {
    const t = await prisma.tabelaPreco.create({
      data: { nome: i.nome, itens: { create: i.itens } },
    });
    revalidatePath("/comercial/tabelas");
    return { id: t.id };
  },
);

export const editarTabelaPreco = defineAction(
  { ...base, acao: "editar-tabela-preco", entidade: "TabelaPreco", schema: tabelaPrecoEditSchema },
  async (i) => {
    await prisma.$transaction([
      prisma.tabelaPreco.update({ where: { id: i.id }, data: { nome: i.nome } }),
      prisma.itemTabelaPreco.deleteMany({ where: { tabelaId: i.id } }),
      prisma.itemTabelaPreco.createMany({
        data: i.itens.map((it) => ({ tabelaId: i.id, ...it })),
      }),
    ]);
    revalidatePath("/comercial/tabelas");
    return { id: i.id };
  },
);

// ── Propostas ─────────────────────────────────────────────────
async function proximoNumeroProposta(tx: Prisma.TransactionClient) {
  const ano = new Date().getFullYear();
  const seq = await tx.propostaSequencia.upsert({
    where: { ano },
    create: { ano, ultimo: 1 },
    update: { ultimo: { increment: 1 } },
  });
  return {
    ano,
    sequencial: seq.ultimo,
    numero: `PR-${String(ano % 100).padStart(2, "0")}${String(seq.ultimo).padStart(4, "0")}`,
  };
}

export const criarProposta = defineAction(
  { ...base, acao: "criar-proposta", entidade: "Proposta", schema: criarPropostaSchema },
  async (i, { user }) => {
    const proposta = await prisma.$transaction(async (tx) => {
      const { ano, sequencial, numero } = await proximoNumeroProposta(tx);
      return tx.proposta.create({
        data: {
          ano,
          sequencial,
          numero,
          titulo: i.titulo,
          clienteId: i.clienteId,
          leadId: i.leadId || null,
          token: randomBytes(18).toString("hex"),
          autorId: user.id,
        },
      });
    });
    rev();
    return { id: proposta.id, numero: proposta.numero };
  },
);

/** Salva itens/condições e grava versão (snapshot). */
export const salvarProposta = defineAction(
  {
    ...base,
    acao: "salvar-proposta",
    entidade: "Proposta",
    schema: salvarPropostaSchema,
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
  },
  async (i, { user }) => {
    const p = await prisma.proposta.findUnique({
      where: { id: i.id },
      include: { versoes: { orderBy: { numero: "desc" }, take: 1 } },
    });
    if (!p) throw new ActionError("Proposta não encontrada.");
    if (p.status === "aceita") throw new ActionError("Proposta aceita não pode ser editada.");

    const snapshot = {
      titulo: i.titulo,
      areaM2: i.areaM2 ?? null,
      validade: i.validade || null,
      observacoes: i.observacoes || null,
      itens: i.itens,
      condicoes: i.condicoes,
    };

    await prisma.$transaction([
      prisma.proposta.update({
        where: { id: i.id },
        data: {
          titulo: i.titulo,
          areaM2: i.areaM2,
          validade: i.validade ? new Date(i.validade) : null,
          observacoes: i.observacoes || null,
        },
      }),
      prisma.propostaItem.deleteMany({ where: { propostaId: i.id } }),
      prisma.propostaItem.createMany({
        data: i.itens.map((it, idx) => ({
          propostaId: i.id,
          disciplina: it.disciplina,
          descricao: it.descricao || null,
          valor: it.valor,
          ordem: idx,
        })),
      }),
      prisma.propostaCondicao.deleteMany({ where: { propostaId: i.id } }),
      prisma.propostaCondicao.createMany({
        data: i.condicoes.map((c, idx) => ({
          propostaId: i.id,
          descricao: c.descricao,
          tipo: c.tipo,
          valor: c.valor,
          ordem: idx,
        })),
      }),
      prisma.propostaVersao.create({
        data: {
          propostaId: i.id,
          numero: (p.versoes[0]?.numero ?? 0) + 1,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          autorId: user.id,
        },
      }),
    ]);
    rev();
    revalidatePath(`/comercial/propostas/${i.id}`);
    return { id: i.id };
  },
);

export const copiarProposta = defineAction(
  { ...base, acao: "copiar-proposta", entidade: "Proposta", schema: idSchema },
  async (i, { user }) => {
    const p = await prisma.proposta.findUnique({
      where: { id: i.id },
      include: { itens: true, condicoes: true },
    });
    if (!p) throw new ActionError("Proposta não encontrada.");

    const nova = await prisma.$transaction(async (tx) => {
      const { ano, sequencial, numero } = await proximoNumeroProposta(tx);
      return tx.proposta.create({
        data: {
          ano,
          sequencial,
          numero,
          titulo: `${p.titulo} — cópia`,
          clienteId: p.clienteId,
          leadId: p.leadId,
          areaM2: p.areaM2,
          validade: p.validade,
          observacoes: p.observacoes,
          token: randomBytes(18).toString("hex"),
          autorId: user.id,
          itens: {
            create: p.itens.map((it) => ({
              disciplina: it.disciplina,
              descricao: it.descricao,
              valor: it.valor,
              ordem: it.ordem,
            })),
          },
          condicoes: {
            create: p.condicoes.map((c) => ({
              descricao: c.descricao,
              tipo: c.tipo,
              valor: c.valor,
              ordem: c.ordem,
            })),
          },
        },
      });
    });
    rev();
    return { id: nova.id, numero: nova.numero };
  },
);

export const mudarStatusProposta = defineAction(
  { ...base, acao: "status-proposta", entidade: "Proposta", schema: statusPropostaSchema },
  async (i) => {
    if (i.status === "aceita") {
      throw new ActionError("Use a ação de aceitar (gera o projeto).");
    }
    await prisma.proposta.update({
      where: { id: i.id },
      data: { status: i.status, enviadaEm: i.status === "enviada" ? new Date() : undefined },
    });
    rev();
    revalidatePath(`/comercial/propostas/${i.id}`);
    return { id: i.id };
  },
);

/** Envia a proposta por e-mail ao cliente com o link público. Marca como enviada. */
export const enviarPropostaEmail = defineAction(
  { ...base, acao: "enviar-proposta-email", entidade: "Proposta", schema: idSchema },
  async (i) => {
    if (!smtpConfigurado()) {
      throw new ActionError("SMTP não configurado (defina SMTP_HOST no .env).");
    }
    const p = await prisma.proposta.findUnique({
      where: { id: i.id },
      include: { cliente: true, itens: true },
    });
    if (!p) throw new ActionError("Proposta não encontrada.");
    if (!p.cliente.email) throw new ActionError("Cliente sem e-mail cadastrado.");

    const url = `${process.env.APP_URL ?? ""}/a/proposta/${p.token}`;
    const total = p.itens.reduce((s, it) => s + Number(it.valor), 0);
    const ok = await enviarEmailTemplate(p.cliente.email, "proposta-cliente", {
      nomeCliente: p.cliente.nome,
      numero: p.numero,
      titulo: p.titulo,
      valorTotal: `R$ ${total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      url,
    });
    if (!ok) throw new ActionError("Falha ao enviar o e-mail.");

    await prisma.proposta.update({
      where: { id: i.id },
      data: { status: "enviada", enviadaEm: new Date() },
    });
    rev();
    revalidatePath(`/comercial/propostas/${i.id}`);
    return { id: i.id };
  },
);

/**
 * ACEITE: cria o projeto com as disciplinas dos itens (valores incluídos),
 * cria os canais de chat e notifica gestores. Sem redigitação.
 */
export const aceitarProposta = defineAction(
  {
    ...base,
    acao: "aceitar-proposta",
    entidade: "Proposta",
    schema: idSchema,
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
  },
  async (i) => {
    const p = await prisma.proposta.findUnique({
      where: { id: i.id },
      include: { itens: { orderBy: { ordem: "asc" } }, cliente: { select: { nome: true } } },
    });
    if (!p) throw new ActionError("Proposta não encontrada.");
    if (p.status === "aceita") throw new ActionError("Proposta já aceita.");
    if (p.itens.length === 0) throw new ActionError("Adicione itens antes de aceitar.");

    const projeto = await prisma.$transaction(async (tx) => {
      const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
      const projeto = await tx.projeto.create({
        data: {
          ano,
          sequencial,
          codigo,
          tipo: "particular",
          nome: p.titulo,
          clienteId: p.clienteId,
          areaM2: p.areaM2,
          disciplinas: {
            create: p.itens.map((it, idx) => ({
              nome: it.disciplina,
              valor: it.valor,
              ordem: idx,
            })),
          },
        },
      });
      await tx.proposta.update({
        where: { id: p.id },
        data: { status: "aceita", aceitaEm: new Date(), projetoId: projeto.id },
      });
      return projeto;
    });

    // Canais de chat do projeto (idempotente).
    notificarNovosMembros(await ensureCanaisProjeto(projeto.id));

    const gestores = await prisma.user.findMany({
      where: { ativo: true, role: { in: ["admin", "supervisor", "administrativo"] } },
      select: { id: true },
    });
    await notificarMuitos(
      gestores.map((g) => g.id),
      {
        titulo: "Proposta aceita — projeto criado",
        corpo: `${p.numero} (${p.cliente.nome}) virou o projeto ${projeto.codigo}.`,
        href: `/projetos/${projeto.id}`,
        tag: `proposta-${p.id}`,
      },
    );

    rev();
    revalidatePath("/projetos");
    return { projetoId: projeto.id, codigo: projeto.codigo };
  },
);
