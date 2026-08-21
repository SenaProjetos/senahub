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
  criarParceiroSchema,
  editarParceiroSchema,
  parceiroIdSchema,
  moverEstagioSchema,
  qualificarProspeccaoSchema,
  agendarProximaAcaoSchema,
  concluirProximaAcaoSchema,
  definirTemperaturaSchema,
  moverProspeccaoSchema,
} from "@/modules/comercial/schemas";
import { removerArquivo } from "@/lib/storage";
import { etapaEhPerdido } from "@/modules/comercial/status";
import { exigeQualificacao } from "@/modules/comercial/prospeccao";
import {
  proximoNumeroProposta,
  criarPropostaDeLead as servicoCriarPropostaDeLead,
  salvarProposta as servicoSalvarProposta,
  aceitarProposta as servicoAceitarProposta,
  moverEstagio as servicoMoverEstagio,
  qualificarProspeccao as servicoQualificarProspeccao,
  agendarProximaAcao as servicoAgendarProximaAcao,
  concluirProximaAcao as servicoConcluirProximaAcao,
  moverProspeccao as servicoMoverProspeccao,
  registrarAtividade,
} from "@/modules/comercial/service";

const base = { modulo: "comercial", recurso: "comercial", permissao: "gerir" } as const;

/**
 * `entidadeId` do caso comum (F3.3): o id vem do RETORNO quando a action cria algo, e do INPUT
 * quando ela edita/apaga. `(d ?? i)` cobre os dois sem cada action repetir o mesmo cast.
 *
 * Por que isso importa: sem `entidadeId` o `AuditLog` registra que "alguém editou um lead" mas
 * não QUAL — e a tela de histórico por entidade (que filtra justamente por esse campo) mostra a
 * linha em lugar nenhum. Era o estado de 23 das 31 actions do Comercial.
 */
const idResultadoOuInput = (d: unknown, i: unknown): string | undefined =>
  ((d ?? i) as { id?: string } | undefined)?.id;
const rev = () => {
  revalidatePath("/comercial");
  revalidatePath("/comercial/propostas");
  revalidatePath("/comercial/parceiros");
};

/**
 * Valida `parceiroId` recebido do cliente antes de gravar no Lead — mesmo padrão de `moverLead`
 * validando `etapaId` (existência, não "está ativo": um lead já vinculado a um parceiro
 * arquivado continua legítimo, e `moverLead` também não checa se a etapa está ativa).
 *
 * Sem isto o Zod (`opt(z.string())`) deixa passar qualquer string — Server Action aceita payload
 * arbitrário do cliente, então "nunca texto livre" seria garantido só pelo Select, não pelo
 * servidor. Sem a checagem, um id que não existe vira `P2003` (violação de FK) e o
 * `defineAction` devolve "erro inesperado" em vez da mensagem de negócio.
 */
async function validarParceiroId(parceiroId: string | undefined): Promise<string | null> {
  if (!parceiroId) return null;
  const existe = await prisma.parceiro.findUnique({ where: { id: parceiroId }, select: { id: true } });
  if (!existe) throw new ActionError("Parceiro não encontrado.");
  return parceiroId;
}

/**
 * Traduz a violação dos índices parciais da F2.5 (ADR-02/ADR-18) numa mensagem que o vendedor
 * entende. Sem isto o `defineAction` devolveria "erro inesperado" para uma regra de negócio
 * perfeitamente normal — mesmo raciocínio (e mesmo formato) de `comDocumentoUnico` em
 * `modules/clientes/actions.ts`, criado na F1.16 para o índice de CPF/CNPJ.
 *
 * Aqui a rede de segurança é a ÚNICA checagem, e não um complemento a uma consulta prévia: uma
 * verificação "já existe prospecção ativa?" antes do INSERT teria janela de corrida e ainda
 * assim precisaria deste catch. Deixar só o catch é mais simples e igualmente correto.
 */
async function comProspeccaoAtivaUnica<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const codigo = (e as { code?: string }).code;
    const alvo = JSON.stringify((e as { meta?: unknown }).meta ?? "");
    if (codigo === "P2002" && alvo.includes("prospeccao_ativa")) {
      throw new ActionError(
        "Já existe uma prospecção ativa para esta empresa nesta campanha. " +
          "Registre o contato na prospecção existente, ou encerre-a antes de abrir outra.",
      );
    }
    throw e;
  }
}

// ── Leads ─────────────────────────────────────────────────────
export const criarLead = defineAction(
  { ...base, acao: "criar-lead", entidade: "Lead", schema: criarLeadSchema, entidadeId: idResultadoOuInput },
  async (i, ctx) => {
    const parceiroId = await validarParceiroId(i.parceiroId);
    const lead = await comProspeccaoAtivaUnica(() =>
      prisma.lead.create({
        data: {
          ...i,
          email: i.email || null,
          valorEstimado: i.valorEstimado,
          parceiroId,
          temperatura: i.temperatura ?? null,
        },
      }),
    );
    // F3.2 — só registra quando o lead já nasce com empresa; `Atividade.clienteId` é NOT NULL
    // e `Lead.clienteId` segue nullable (F2.3). Sem empresa, não há timeline onde pendurar.
    await registrarAtividade(
      { evento: "PROSPECCAO_CRIADA", nome: i.nome },
      { autorId: ctx.user.id, clienteId: lead.clienteId, leadId: lead.id },
    );
    rev();
    return { id: lead.id };
  },
);

export const editarLead = defineAction(
  { ...base, acao: "editar-lead", entidade: "Lead", schema: editarLeadSchema, entidadeId: idResultadoOuInput },
  async (i) => {
    const { id, ...rest } = i;
    const parceiroId = await validarParceiroId(rest.parceiroId);
    // Editar tambem passa pela guarda: trocar a empresa de um lead pode colidir com uma
    // prospeccao ativa que ja exista naquela empresa, exatamente como criar do zero.
    await comProspeccaoAtivaUnica(() =>
      prisma.lead.update({
        where: { id },
        // `parceiroId: null` explicito -- no update do Prisma, `undefined` significa "nao mexe",
        // entao trocar pra "sem parceiro" (sentinel SEM_PARCEIRO no dialog) precisa mandar `null`
        // de verdade, senao o campo fica preso no valor antigo.
        data: {
          ...rest,
          email: rest.email || null,
          parceiroId,
          // null EXPLÍCITO: é o que permite limpar a classificação. `undefined` faria o Prisma
          // ignorar o campo, e "voltar para não classificado" seria um no-op silencioso.
          temperatura: rest.temperatura ?? null,
        },
      }),
    );
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
  { ...base, acao: "mover-lead", entidade: "Lead", schema: moverLeadSchema, entidadeId: idResultadoOuInput },
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
  { ...base, acao: "arquivar-lead", entidade: "Lead", schema: idSchema, entidadeId: idResultadoOuInput },
  async (i) => {
    await prisma.lead.update({ where: { id: i.id }, data: { arquivado: true } });
    rev();
    return { id: i.id };
  },
);

export const adicionarNotaLead = defineAction(
  { ...base, acao: "nota-lead", entidade: "Lead", schema: notaLeadSchema, entidadeId: (_d, i) => (i as { leadId: string }).leadId },
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
  { ...base, acao: "add-anexo-lead", entidade: "AnexoLead", schema: adicionarAnexoLeadSchema, entidadeId: idResultadoOuInput },
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
  { ...base, acao: "rm-anexo-lead", entidade: "AnexoLead", schema: removerAnexoLeadSchema, entidadeId: idResultadoOuInput },
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
  { ...base, acao: "converter-lead", entidade: "Lead", schema: converterLeadSchema, entidadeId: (_d, i) => (i as { id: string }).id },
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
  { ...base, acao: "definir-meta", entidade: "MetaComercial", schema: metaSchema, entidadeId: (_d, i) => { const m = i as { ano: number; mes: number }; return `${m.ano}-${String(m.mes).padStart(2, "0")}`; } },
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
  { ...base, acao: "criar-etapa-funil", entidade: "FunilEtapa", schema: criarEtapaSchema, entidadeId: idResultadoOuInput },
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
  { ...base, acao: "editar-etapa-funil", entidade: "FunilEtapa", schema: editarEtapaSchema, entidadeId: idResultadoOuInput },
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
  { ...base, acao: "alternar-etapa-funil", entidade: "FunilEtapa", schema: alternarEtapaSchema, entidadeId: idResultadoOuInput },
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
  { ...base, acao: "criar-tabela-preco", entidade: "TabelaPreco", schema: tabelaPrecoSchema, entidadeId: idResultadoOuInput },
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
  { ...base, acao: "editar-tabela-preco", entidade: "TabelaPreco", schema: tabelaPrecoEditSchema, entidadeId: idResultadoOuInput },
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

// ── Parceiros (F1.23b, ADR-19) ───────────────────────────────────
function normalizarParceiro<T extends { documento?: string; email?: string; telefone?: string; observacao?: string }>(
  input: T,
) {
  return {
    ...input,
    documento: input.documento || null,
    email: input.email || null,
    telefone: input.telefone || null,
    observacao: input.observacao || null,
  };
}

export const criarParceiro = defineAction(
  { ...base, acao: "criar-parceiro", entidade: "Parceiro", schema: criarParceiroSchema, entidadeId: idResultadoOuInput },
  async (i) => {
    const p = await prisma.parceiro.create({ data: normalizarParceiro(i) });
    rev();
    return { id: p.id };
  },
);

export const editarParceiro = defineAction(
  { ...base, acao: "editar-parceiro", entidade: "Parceiro", schema: editarParceiroSchema, entidadeId: idResultadoOuInput },
  async (i) => {
    const { id, ...rest } = i;
    await prisma.parceiro.update({ where: { id }, data: normalizarParceiro(rest) });
    rev();
    return { id };
  },
);

export const arquivarParceiro = defineAction(
  { ...base, acao: "arquivar-parceiro", entidade: "Parceiro", schema: parceiroIdSchema, entidadeId: idResultadoOuInput },
  async (i) => {
    await prisma.parceiro.update({ where: { id: i.id }, data: { ativo: false } });
    rev();
    return { id: i.id };
  },
);

export const reativarParceiro = defineAction(
  { ...base, acao: "reativar-parceiro", entidade: "Parceiro", schema: parceiroIdSchema, entidadeId: idResultadoOuInput },
  async (i) => {
    await prisma.parceiro.update({ where: { id: i.id }, data: { ativo: true } });
    rev();
    return { id: i.id };
  },
);

// ── Propostas ─────────────────────────────────────────────────
// A lógica vive em `service.ts` (F1.3) — aqui ficam só sessão/permissão/Zod/auditoria
// e a revalidação de rota, que é a parte que depende do Next.

export const criarProposta = defineAction(
  { ...base, acao: "criar-proposta", entidade: "Proposta", schema: criarPropostaSchema, entidadeId: idResultadoOuInput },
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
  { ...base, acao: "criar-proposta-lead", entidade: "Proposta", schema: criarPropostaDeLeadSchema, entidadeId: idResultadoOuInput },
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
  { ...base, acao: "copiar-proposta", entidade: "Proposta", schema: idSchema, entidadeId: idResultadoOuInput },
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
  { ...base, acao: "status-proposta", entidade: "Proposta", schema: statusPropostaSchema, entidadeId: idResultadoOuInput },
  async (i, ctx) => {
    if (i.status === "aceita") {
      throw new ActionError("Use a ação de aceitar (gera o projeto).");
    }
    const p = await prisma.proposta.update({
      where: { id: i.id },
      data: { status: i.status, enviadaEm: i.status === "enviada" ? new Date() : undefined },
      select: { id: true, numero: true, clienteId: true },
    });
    // F3.2 — só "enviada" vira evento. Rascunho ↔ recusada são idas e vindas de edição; encher a
    // timeline com elas afogaria os eventos que importam.
    if (i.status === "enviada") {
      await registrarAtividade(
        { evento: "PROPOSTA_ENVIADA", numero: p.numero, porEmail: false },
        { autorId: ctx.user.id, clienteId: p.clienteId, propostaId: p.id },
      );
    }
    rev();
    revalidatePath(`/comercial/propostas/${i.id}`);
    return { id: i.id };
  },
);

/** Envia a proposta por e-mail ao cliente com o link público. Marca como enviada. */
export const enviarPropostaEmail = defineAction(
  { ...base, acao: "enviar-proposta-email", entidade: "Proposta", schema: idSchema, entidadeId: idResultadoOuInput },
  async (i, ctx) => {
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
    await registrarAtividade(
      { evento: "PROPOSTA_ENVIADA", numero: p.numero, porEmail: true },
      { autorId: ctx.user.id, clienteId: p.clienteId, propostaId: p.id },
    );
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
  async (i, { user }) => {
    const resultado = await servicoAceitarProposta(i.id, user.id);
    rev();
    revalidatePath("/projetos");
    return resultado;
  },
);

// ── Negociação ────────────────────────────────────────────────
/**
 * Única action que muda estágio de negociação (F2.7). Delega inteiramente ao `moverEstagio` do
 * service — a regra de transição não é reimplementada aqui, e nenhuma outra action deve fazer
 * `update` de `estagio`.
 *
 * `capturarAntes` guarda o estágio anterior no `AuditLog`, e `entidadeId` amarra o registro à
 * negociação. Juntos dão o rastro que o ADR-10 exige da reabertura e que o
 * `atualizarOportunidade` antigo não tinha.
 */
export const moverEstagioNegociacao = defineAction(
  {
    ...base,
    acao: "mover-estagio-negociacao",
    entidade: "Negociacao",
    schema: moverEstagioSchema,
    entidadeId: (_d, i) => (i as { negociacaoId: string }).negociacaoId,
    capturarAntes: async (i) =>
      prisma.negociacao.findUnique({
        where: { id: (i as { negociacaoId: string }).negociacaoId },
        select: { estagio: true, probabilidade: true, motivoPerdaId: true, concorrente: true },
      }),
  },
  async (i, { user }) => {
    const r = await servicoMoverEstagio({
      negociacaoId: i.negociacaoId,
      para: i.para,
      motivoPerdaId: i.motivoPerdaId || null,
      concorrente: i.concorrente || null,
      autorId: user.id,
    });
    rev();
    return r;
  },
);

/**
 * Qualifica a prospecção (F2.8). Delega ao service; o lead sobrevive apontando para a negociação.
 * `entidadeId` aponta para o LEAD — é a entidade que o usuário tinha em mãos ao agir, e é por ela
 * que alguém vai procurar no histórico depois.
 */
export const qualificarProspeccao = defineAction(
  {
    ...base,
    acao: "qualificar-prospeccao",
    entidade: "Lead",
    schema: qualificarProspeccaoSchema,
    entidadeId: (_d, i) => (i as { leadId: string }).leadId,
    capturarAntes: async (i) =>
      prisma.lead.findUnique({
        where: { id: (i as { leadId: string }).leadId },
        select: { status: true, clienteId: true },
      }),
  },
  async (i, { user }) => {
    const r = await servicoQualificarProspeccao({
      leadId: i.leadId,
      titulo: i.titulo || null,
      responsavelId: i.responsavelId || null,
      autorId: user.id,
    });
    rev();
    return r;
  },
);

// ── Próxima Ação (F2.10) ──────────────────────────────────────
/**
 * Agenda a próxima ação ANCORADA na entidade. Substitui o caminho antigo, em que o
 * `follow-up-dialog` chamava `criarCompromisso` e deixava o lead só no texto do título.
 */
export const agendarProximaAcao = defineAction(
  {
    ...base,
    acao: "agendar-proxima-acao",
    entidade: "Compromisso",
    schema: agendarProximaAcaoSchema,
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (i, { user }) => {
    const r = await servicoAgendarProximaAcao({
      entidadeTipo: i.entidadeTipo,
      entidadeId: i.entidadeId,
      tipo: i.tipo,
      titulo: i.titulo,
      inicio: new Date(i.inicio),
      local: i.local || null,
      descricao: i.descricao || null,
      criadorId: user.id,
    });
    rev();
    revalidatePath("/agenda");
    return r;
  },
);

export const concluirProximaAcao = defineAction(
  {
    ...base,
    acao: "concluir-proxima-acao",
    entidade: "Compromisso",
    schema: concluirProximaAcaoSchema,
    entidadeId: (_d, i) => (i as { compromissoId: string }).compromissoId,
  },
  async (i, { user }) => {
    const r = await servicoConcluirProximaAcao({
      compromissoId: i.compromissoId,
      userId: user.id,
      quando: new Date(),
    });
    rev();
    revalidatePath("/agenda");
    return r;
  },
);

/**
 * Temperatura manual (F2.12). Um único ponto para os dois funis — `entidadeTipo` decide a tabela,
 * em vez de duas actions quase idênticas que divergiriam na primeira manutenção.
 */
export const definirTemperatura = defineAction(
  {
    ...base,
    acao: "definir-temperatura",
    entidade: "Lead",
    schema: definirTemperaturaSchema,
    entidadeId: (_d, i) => (i as { id: string }).id,
  },
  async (i) => {
    if (i.entidadeTipo === "LEAD") {
      await prisma.lead.update({ where: { id: i.id }, data: { temperatura: i.temperatura } });
    } else {
      await prisma.negociacao.update({ where: { id: i.id }, data: { temperatura: i.temperatura } });
    }
    rev();
    return { id: i.id };
  },
);

/**
 * Move a prospecção no Kanban (F2.13). Se o destino for `OPORTUNIDADE_CRIADA`, delega para a
 * QUALIFICAÇÃO — que cria a `Negociacao` — em vez de trocar o rótulo. Sem isso o board mostraria
 * "oportunidade criada" para um lead sem negociação nenhuma.
 */
export const moverProspeccao = defineAction(
  {
    ...base,
    acao: "mover-prospeccao",
    entidade: "Lead",
    schema: moverProspeccaoSchema,
    entidadeId: (_d, i) => (i as { leadId: string }).leadId,
    capturarAntes: async (i) =>
      prisma.lead.findUnique({
        where: { id: (i as { leadId: string }).leadId },
        select: { status: true },
      }),
  },
  async (i, { user }) => {
    if (exigeQualificacao(i.para)) {
      const r = await servicoQualificarProspeccao({ leadId: i.leadId, autorId: user.id });
      rev();
      return { id: r.leadId, qualificada: true };
    }
    const r = await servicoMoverProspeccao({ leadId: i.leadId, para: i.para });
    rev();
    return { id: r.id, qualificada: false };
  },
);
