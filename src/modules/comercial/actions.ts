"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { smtpConfigurado } from "@/lib/mail";
import { enviarEmailTemplate } from "@/lib/email-templates";
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
  criarPropostaDeLeadSchema,
  salvarPropostaSchema,
  statusPropostaSchema,
  criarEtapaSchema,
  editarEtapaSchema,
  alternarEtapaSchema,
  adicionarAnexoLeadSchema,
  removerAnexoLeadSchema,
} from "@/modules/comercial/schemas";
import { removerArquivo } from "@/lib/storage";
import { etapaEhPerdido } from "@/modules/comercial/status";
import {
  proximoNumeroProposta,
  criarPropostaDeLead as servicoCriarPropostaDeLead,
  salvarProposta as servicoSalvarProposta,
  aceitarProposta as servicoAceitarProposta,
} from "@/modules/comercial/service";

const base = { modulo: "comercial", recurso: "comercial", permissao: "gerir" } as const;
const rev = () => {
  revalidatePath("/comercial");
  revalidatePath("/comercial/propostas");
};

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

/**
 * Anexa um arquivo ao lead. O upload em si vai pela rota multipart
 * `/api/comercial/anexos` (devolve `meta`); aqui só persiste o registro.
 * `nome` opcional — cai no nome original do arquivo quando vazio.
 */
export const adicionarAnexoLead = defineAction(
  { ...base, acao: "add-anexo-lead", entidade: "AnexoLead", schema: adicionarAnexoLeadSchema },
  async (i, { user }) => {
    const lead = await prisma.lead.findUnique({ where: { id: i.leadId }, select: { id: true } });
    if (!lead) throw new ActionError("Lead não encontrado.");
    const anexo = await prisma.anexoLead.create({
      data: {
        leadId: i.leadId,
        nome: i.nome?.trim() || i.meta.nomeArquivo,
        caminho: i.meta.caminho,
        nomeArquivo: i.meta.nomeArquivo,
        mime: i.meta.mime,
        tamanho: i.meta.tamanho,
        hashSha256: i.meta.hashSha256,
        autorId: user.id,
      },
    });
    rev();
    revalidatePath(`/comercial/${i.leadId}`);
    return { id: anexo.id };
  },
);

export const removerAnexoLead = defineAction(
  { ...base, acao: "rm-anexo-lead", entidade: "AnexoLead", schema: removerAnexoLeadSchema },
  async (i) => {
    const anexo = await prisma.anexoLead.findUnique({ where: { id: i.id }, select: { caminho: true, leadId: true } });
    if (!anexo) throw new ActionError("Anexo não encontrado.");
    await prisma.anexoLead.delete({ where: { id: i.id } });
    await removerArquivo(anexo.caminho);
    rev();
    revalidatePath(`/comercial/${anexo.leadId}`);
    return { id: i.id };
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

/**
 * Resolve a FK do catálogo por nome EXATO (F1.20, mesmo racional da F1.19: casar por
 * aproximação arriscaria apontar o item para a disciplina errada).
 */
async function idsDisciplinaPorNome(): Promise<Map<string, string>> {
  const catalogo = await prisma.disciplinaCatalogo.findMany({ select: { id: true, nome: true } });
  return new Map(catalogo.map((d) => [d.nome, d.id]));
}

export const criarTabelaPreco = defineAction(
  { ...base, acao: "criar-tabela-preco", entidade: "TabelaPreco", schema: tabelaPrecoSchema },
  async (i) => {
    const idsPorNome = await idsDisciplinaPorNome();
    const t = await prisma.tabelaPreco.create({
      data: {
        nome: i.nome,
        itens: {
          create: i.itens.map((it) => ({
            disciplinaTextoLegado: it.disciplina,
            disciplinaId: idsPorNome.get(it.disciplina) ?? null,
            valorM2: it.valorM2,
          })),
        },
      },
    });
    revalidatePath("/comercial/tabelas");
    return { id: t.id };
  },
);

export const editarTabelaPreco = defineAction(
  { ...base, acao: "editar-tabela-preco", entidade: "TabelaPreco", schema: tabelaPrecoEditSchema },
  async (i) => {
    const idsPorNome = await idsDisciplinaPorNome();
    await prisma.$transaction([
      prisma.tabelaPreco.update({ where: { id: i.id }, data: { nome: i.nome } }),
      prisma.itemTabelaPreco.deleteMany({ where: { tabelaId: i.id } }),
      prisma.itemTabelaPreco.createMany({
        data: i.itens.map((it) => ({
          tabelaId: i.id,
          disciplinaTextoLegado: it.disciplina,
          disciplinaId: idsPorNome.get(it.disciplina) ?? null,
          valorM2: it.valorM2,
        })),
      }),
    ]);
    revalidatePath("/comercial/tabelas");
    return { id: i.id };
  },
);

// ── Propostas ─────────────────────────────────────────────────
// A lógica vive em `service.ts` (F1.3) — aqui ficam só sessão/permissão/Zod/auditoria
// e a revalidação de rota, que é a parte que depende do Next.

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

/** Cria uma proposta partindo de um lead. Lógica em `service.ts`. */
export const criarPropostaDeLead = defineAction(
  { ...base, acao: "criar-proposta-lead", entidade: "Proposta", schema: criarPropostaDeLeadSchema },
  async (i, { user }) => {
    const { proposta, criouCliente, leadId } = await servicoCriarPropostaDeLead(i, user.id);

    rev();
    revalidatePath(`/comercial/${leadId}`);
    if (criouCliente) revalidatePath("/clientes");
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
    await servicoSalvarProposta(i, user.id);
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
              // Copia os DOIS: texto legado e a FK ja resolvida (F1.19). Nao re-resolve pelo
              // nome -- a copia deve ser fiel ao original, inclusive quando ele nao tem FK.
              disciplinaTextoLegado: it.disciplinaTextoLegado,
              disciplinaId: it.disciplinaId,
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
    const resultado = await servicoAceitarProposta(i.id);
    rev();
    revalidatePath("/projetos");
    return resultado;
  },
);
