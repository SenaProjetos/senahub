"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction, ActionError } from "@/lib/with-action";
import { prisma } from "@/lib/prisma";
import { removerArquivo } from "@/lib/storage";
import { notificarMuitos } from "@/lib/notificar";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { GLOBAL_ROLES, type Role } from "@/lib/roles";
import { whereAudiencia } from "@/lib/audiencias";
import { statusValidacao } from "@/modules/uploads/validacao";
import { chaveDocumento } from "@/modules/uploads/documento";
import { liberarPagamentosProjetista } from "@/modules/uploads/pagamento";
import { bloqueioValorDisciplina } from "@/modules/uploads/rateio";
import { disciplinaUsaPastas } from "@/modules/projetos/estrutura-tipo";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { podeVerTodasDisciplinas } from "@/modules/arquivos/acesso";
import { STATUS_ABERTOS } from "@/modules/projetos/pendencias/helpers";

/** Extensão com o ponto, no case original (`.pdf`). Sem ponto (ou dotfile) → vazio. */
function extComPonto(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i > 0 ? nome.slice(i) : "";
}

const validarSchema = z.object({ disciplinaId: z.string().min(1) });

/**
 * REGRA DE OURO: valida a entrega da disciplina (exige pacotes configurados em exigePacoteA/B).
 * Marca uploads como validados e LIBERA o pagamento ao(s) projetista(s),
 * criando um PagamentoProjetista pendente por responsável. Notifica todos.
 * Idempotente: recusa se já houver pagamentos liberados.
 */
export const validarEntrega = defineAction(
  {
    modulo: "uploads",
    acao: "validar-entrega",
    recurso: "uploads",
    permissao: "validar",
    entidade: "Disciplina",
    schema: validarSchema,
    entidadeId: (d, i) => ((d ?? i) as { disciplinaId: string }).disciplinaId,
  },
  async (input, { user }) => {
    const disciplina = await prisma.disciplina.findUnique({
      where: { id: input.disciplinaId },
      include: {
        responsaveis: { include: { user: { select: { id: true, name: true, role: true } } } },
        // Lixeira: leitura aninhada não passa pelo filtro global → arquivos na lixeira
        // não contam para completude de pacote nem para validação.
        uploads: { where: { excluidoEm: null } },
        pagamentos: { select: { id: true } },
        pastas: { select: { origem: true } },
        projeto: { select: { id: true, codigo: true, nome: true, tipo: true } },
      },
    });
    if (!disciplina) throw new ActionError("Disciplina não encontrada.");

    // Aprovação/laudo COM árvore de pastas: sem validação por-arquivo — a conclusão é só
    // via fluxo de 2 etapas (solicitarAprovacaoDisciplina/confirmarAprovacaoDisciplina).
    // Fecha o bypass que um admin abriria ao desmarcar exigePacoteA/B manualmente.
    // O gate é por DISCIPLINA (não pelo tipo do projeto): disciplinas de projetos
    // aprovação/laudo anteriores à feature de pastas seguem no fluxo A/B legado — que é
    // exatamente o que a UI lhes oferece.
    if (disciplinaUsaPastas(disciplina.pastas)) {
      throw new ActionError(
        "Este tipo de projeto usa o fluxo de aprovação em 2 etapas, não a validação por arquivo.",
      );
    }

    // P-24: status "aprovado" só é alcançável por esta ação (P-11) → guarda de idempotência
    // mesmo quando a disciplina é 100% CLT (sem pagamento criado para o check abaixo cobrir).
    if (disciplina.status === "aprovado") {
      throw new ActionError("Esta entrega já foi validada.");
    }
    // Pagamento já existente NÃO é sinal de "já validada" — a idempotência é o check de
    // status acima. Disciplina não-aprovada com pagamento liberado (reabertura, ou dado
    // vindo de importação/seed) apenas conclui SEM gerar pagamento novo, no ramo abaixo.
    // Antes isso valia só para "em_revisao", e a partir de qualquer outro status a
    // disciplina ficava presa: o botão aparecia e a action recusava para sempre.
    const jaTemPagamento = disciplina.pagamentos.length > 0;

    const temA = !disciplina.exigePacoteA || disciplina.uploads.some((u) => u.pacote === "A");
    const temB = !disciplina.exigePacoteB || disciplina.uploads.some((u) => u.pacote === "B");
    const faltam = [
      !temA ? "Pranchas e arquivos" : null,
      !temB ? "Backup do modelo" : null,
    ].filter(Boolean);
    if (faltam.length > 0) {
      throw new ActionError(`Envie os pacotes obrigatórios antes de validar: ${faltam.join(", ")}.`);
    }
    if (disciplina.responsaveis.length === 0) {
      throw new ActionError("Defina ao menos um responsável antes de validar.");
    }

    // Validação parcial: só finaliza quando TODOS os entregáveis (versão atual) já
    // foram validados um a um. Os efeitos financeiros/conclusão vêm só aqui. Uploads
    // que vivem numa PastaProjeto (pasta personalizada, admin) não são pacote A/B —
    // ficam fora da validação por-arquivo, igual RECEBIDOS/OUTROS.
    const uploadsPacote = disciplina.uploads.filter(
      (u): u is typeof u & { pacote: NonNullable<typeof u.pacote> } => u.pacote != null,
    );
    const st = statusValidacao(uploadsPacote, {
      exigePacoteA: disciplina.exigePacoteA,
      exigePacoteB: disciplina.exigePacoteB,
    });
    if (st.pendentes > 0) {
      throw new ActionError(
        `Valide todos os arquivos antes de finalizar: ${st.pendentes} pendente(s) de ${st.total}.`,
      );
    }

    const agora = new Date();
    const href = `/projetos/${disciplina.projeto.id}`;
    const codigoDisc = formatarCodigo(disciplina.projeto.codigo);

    // Reaprovação: fecha a disciplina em "aprovado" mantendo o pagamento já liberado.
    if (jaTemPagamento) {
      await prisma.disciplina.update({
        where: { id: disciplina.id },
        data: { status: "aprovado", entregueEm: agora },
      });
      const avisar = [
        ...disciplina.responsaveis.map((r) => r.userId),
        ...(await prisma.user.findMany({
          where: whereAudiencia("gestao_operacional"),
          select: { id: true },
        })).map((g) => g.id),
      ];
      await notificarMuitos([...new Set(avisar)].filter((id) => id !== user.id), {
        titulo: "Entrega aprovada",
        corpo: `${disciplina.nome} (${codigoDisc}) aprovada — pagamento já liberado, sem novo pagamento.`,
        href,
        tag: `aprovacao-sem-pagamento-${disciplina.id}`,
      }, { categoria: "aprovacao_arquivo" });
      revalidatePath(href);
      revalidatePath("/planejamento/cronograma");
      revalidatePath("/");
      return { disciplinaId: disciplina.id, pagamentos: 0 };
    }

    // Concluir sem valor gerava PagamentoProjetista de R$ 0,00 na folha, sem lançamento
    // e sem rota de conserto (o próprio zero bloqueia a regeneração, via jaTemPagamento).
    const bloqueio = bloqueioValorDisciplina(
      disciplina.responsaveis,
      disciplina.valor == null ? null : Number(disciplina.valor),
    );
    if (bloqueio) throw new ActionError(bloqueio);

    const { pagaveis, salariados } = await prisma.$transaction(async (tx) => {
      await tx.disciplina.update({
        where: { id: disciplina.id },
        // P-12: entregueEm marca a data da validação formal (separado do status manual).
        data: { status: "aprovado", entregueEm: agora },
      });
      return liberarPagamentosProjetista(tx, { disciplina, autorId: user.id, agora });
    });

    // Notifica projetistas (pagamento liberado) e gestores/financeiro.
    const codigo = formatarCodigo(disciplina.projeto.codigo);
    if (pagaveis.length > 0) {
      await notificarMuitos(
        pagaveis.map((r) => r.userId),
        {
          titulo: "Pagamento liberado",
          corpo: `Entrega de ${disciplina.nome} (${codigo}) validada. Pagamento liberado.`,
          href,
          tag: `pagto-${disciplina.id}`,
        },
        { categoria: "pagamento" },
      );
    }
    if (salariados.length > 0) {
      // P-24: CLT/estagiário não recebem por entrega — apenas confirmamos a validação.
      await notificarMuitos(
        salariados.map((r) => r.userId),
        {
          titulo: "Entrega validada",
          corpo: `Entrega de ${disciplina.nome} (${codigo}) validada.`,
          href,
          tag: `entrega-${disciplina.id}`,
        },
        { categoria: "pagamento" },
      );
    }

    const gestores = await prisma.user.findMany({
      where: whereAudiencia("gestao_operacional"),
      select: { id: true },
    });
    await notificarMuitos(
      gestores.map((g) => g.id),
      {
        titulo: "Entrega validada",
        corpo:
          pagaveis.length > 0
            ? `${disciplina.nome} (${codigo}) validada — pagamento de projetista criado.`
            : `${disciplina.nome} (${codigo}) validada — sem pagamento (equipe CLT/estágio).`,
        href,
        tag: `validacao-${disciplina.id}`,
      },
      { categoria: "aprovacao_arquivo" },
    );

    revalidatePath(href);
    revalidatePath("/planejamento/cronograma");
    revalidatePath("/");
    revalidatePath("/financeiro/lancamentos");
    revalidatePath("/financeiro/contas-a-pagar");
    return { disciplinaId: disciplina.id, pagamentos: pagaveis.length };
  },
);

// ── Validação parcial (arquivo a arquivo) ──────────────────────

const uploadIdSchema = z.object({ uploadId: z.string().min(1) });
const ajusteSchema = z.object({
  uploadId: z.string().min(1),
  motivo: z.string().trim().min(1, "Descreva o ajuste necessário.").max(500),
});

const baseValidacao = {
  modulo: "uploads",
  recurso: "uploads",
  permissao: "validar",
  entidade: "Upload",
  // Correlação no histórico do projeto: o uploadId cai no conjunto de ids da disciplina.
  entidadeId: (d: unknown, i: unknown) =>
    (i as { uploadId?: string })?.uploadId ?? (d as { uploadId?: string } | undefined)?.uploadId,
} as const;

/** Carrega o upload + disciplina e recusa se a entrega já foi finalizada (status aprovado). */
async function carregarUploadEditavel(uploadId: string) {
  const upload = await prisma.upload.findUnique({
    where: { id: uploadId },
    select: {
      id: true,
      nomeArquivo: true,
      autorId: true,
      disciplinaId: true,
      documentoId: true,
      disciplina: {
        select: {
          status: true,
          projetoId: true,
          nome: true,
          projeto: { select: { codigo: true } },
          responsaveis: { select: { userId: true } },
        },
      },
    },
  });
  if (!upload) throw new ActionError("Arquivo não encontrado.");
  if (upload.disciplina.status === "aprovado") {
    throw new ActionError("Entrega já finalizada — não é possível alterar a validação dos arquivos.");
  }
  return upload;
}

function revalidarArquivos(projetoId: string) {
  revalidatePath(`/projetos/${projetoId}`);
  revalidatePath(`/projetos/${projetoId}/arquivos`);
}

/** Valida um único arquivo (validação parcial). Limpa qualquer ajuste pendente nele. */
export const validarArquivo = defineAction(
  { ...baseValidacao, acao: "validar-arquivo", schema: uploadIdSchema },
  async (input, { user }) => {
    const upload = await carregarUploadEditavel(input.uploadId);
    // Escopo do DOCUMENTO, não da versão: um apontamento aberto na R01 continua visível (e
    // aberto) na R02 por carry-over — contar só por `uploadId` deixaria validar a R02 com o
    // pino herdado ainda em aberto, esvaziando o gate. Mesma correção já feita em
    // `pendenciasDoUpload`/`enviarApontamentos`/`contarPendenciasAbertas`. `excluidoEm: null`
    // porque `Pendencia` fica fora da extension de soft delete (ver `excluirPendencia`).
    const apontamentoAberto = await prisma.pendencia.count({
      where: {
        ...(upload.documentoId ? { documentoId: upload.documentoId } : { uploadId: upload.id }),
        // Inclui `em_correcao`: um apontamento que alguém está corrigindo continua bloqueando
        // a validação — senão assumir a correção destravaria a entrega (ver STATUS_ABERTOS).
        status: { in: [...STATUS_ABERTOS] },
        excluidoEm: null,
      },
    });
    if (apontamentoAberto > 0) {
      throw new ActionError("Há apontamento(s) em aberto nesta prancha — resolva-os antes de validar.");
    }
    await prisma.upload.update({
      where: { id: upload.id },
      data: {
        validado: true,
        validadoPorId: user.id,
        validadoEm: new Date(),
        revisaoObs: null,
        revisaoEm: null,
        revisaoPorId: null,
      },
    });
    revalidarArquivos(upload.disciplina.projetoId);
    return { uploadId: upload.id, nome: upload.nomeArquivo };
  },
);

/** Desfaz a validação de um arquivo (antes de finalizar a entrega). */
export const reverterValidacaoArquivo = defineAction(
  { ...baseValidacao, acao: "reverter-validacao-arquivo", schema: uploadIdSchema },
  async (input) => {
    const upload = await carregarUploadEditavel(input.uploadId);
    await prisma.upload.update({
      where: { id: upload.id },
      data: { validado: false, validadoPorId: null, validadoEm: null },
    });
    revalidarArquivos(upload.disciplina.projetoId);
    return { uploadId: upload.id, nome: upload.nomeArquivo };
  },
);

/** Solicita ajuste em um arquivo (com motivo) e notifica autor + responsáveis. */
export const solicitarAjusteArquivo = defineAction(
  { ...baseValidacao, acao: "solicitar-ajuste-arquivo", schema: ajusteSchema },
  async (input, { user }) => {
    const upload = await carregarUploadEditavel(input.uploadId);
    await prisma.upload.update({
      where: { id: upload.id },
      data: {
        validado: false,
        validadoPorId: null,
        validadoEm: null,
        revisaoObs: input.motivo,
        revisaoEm: new Date(),
        revisaoPorId: user.id,
      },
    });

    const { disciplina } = upload;
    const codigo = formatarCodigo(disciplina.projeto.codigo);
    const destinatarios = [upload.autorId, ...disciplina.responsaveis.map((r) => r.userId)]
      .filter((id) => id !== user.id);
    if (destinatarios.length > 0) {
      await notificarMuitos(destinatarios, {
        titulo: "Ajuste solicitado em arquivo",
        corpo: `${upload.nomeArquivo} (${disciplina.nome} · ${codigo}): ${input.motivo}`,
        href: `/projetos/${disciplina.projetoId}/arquivos`,
        tag: `ajuste-${upload.id}`,
      });
    }

    revalidarArquivos(disciplina.projetoId);
    return { uploadId: upload.id, nome: upload.nomeArquivo };
  },
);

const validarLoteSchema = z.object({
  projetoId: z.string().min(1),
  uploadIds: z.array(z.string().min(1)).min(1, "Selecione ao menos um arquivo.").max(500),
});

/**
 * Valida VÁRIOS arquivos de uma vez (seleção múltipla no explorer / painel de Aprovações).
 * Mesma regra do single (validarArquivo), mas tolerante: arquivos já validados, de disciplina
 * já finalizada, ou com apontamento em aberto são ignorados em vez de abortar o lote inteiro.
 */
export const validarArquivosLote = defineAction(
  {
    ...baseValidacao,
    acao: "validar-arquivos-lote",
    schema: validarLoteSchema,
    entidadeId: (d, i) => (i as { projetoId?: string })?.projetoId,
  },
  async (input, { user }) => {
    const candidatos = await prisma.upload.findMany({
      where: {
        id: { in: input.uploadIds },
        validado: false,
        disciplina: { projetoId: input.projetoId, status: { not: "aprovado" } },
      },
      select: { id: true, documentoId: true },
    });
    if (candidatos.length === 0) {
      throw new ActionError("Nenhum arquivo válido para validar.");
    }

    // Mesmo escopo por DOCUMENTO do `validarArquivo` (ver comentário lá): o pino herdado da
    // revisão anterior tem `uploadId` da versão ANTIGA, então bloquear por uploadId deixaria
    // passar a versão nova com apontamento aberto.
    const apontamentosAbertos = await prisma.pendencia.findMany({
      where: {
        OR: [
          { uploadId: { in: candidatos.filter((u) => !u.documentoId).map((u) => u.id) } },
          { documentoId: { in: candidatos.map((u) => u.documentoId).filter((d): d is string => d != null) } },
        ],
        // Inclui `em_correcao`: um apontamento que alguém está corrigindo continua bloqueando
        // a validação — senão assumir a correção destravaria a entrega (ver STATUS_ABERTOS).
        status: { in: [...STATUS_ABERTOS] },
        excluidoEm: null,
      },
      select: { uploadId: true, documentoId: true },
    });
    const docsBloqueados = new Set(apontamentosAbertos.map((p) => p.documentoId).filter((d): d is string => d != null));
    const uploadsBloqueados = new Set(apontamentosAbertos.filter((p) => !p.documentoId).map((p) => p.uploadId));
    const validos = candidatos.filter((u) =>
      u.documentoId ? !docsBloqueados.has(u.documentoId) : !uploadsBloqueados.has(u.id),
    );
    if (validos.length === 0) {
      throw new ActionError("Todos os arquivos selecionados têm apontamento(s) em aberto.");
    }

    await prisma.upload.updateMany({
      where: { id: { in: validos.map((u) => u.id) } },
      data: {
        validado: true,
        validadoPorId: user.id,
        validadoEm: new Date(),
        revisaoObs: null,
        revisaoEm: null,
        revisaoPorId: null,
      },
    });
    revalidarArquivos(input.projetoId);
    return { total: validos.length, ignorados: input.uploadIds.length - validos.length };
  },
);

// ── Renomear arquivo de disciplina (nome exibido) ──────────────

const renomearSchema = z.object({
  uploadId: z.string().min(1),
  nome: z.string().trim().min(1, "Informe o novo nome.").max(255),
});

/**
 * Renomeia o nome exibido de um upload (não altera o arquivo físico nem a versão).
 * A cadeia de versões é derivada por (disciplinaId, pacote, nomeArquivo) — sem FK —,
 * então renomeamos TODAS as versões do arquivo em bloco. Renomear só a versão atual
 * quebraria a cadeia: a versão renomeada viraria um "arquivo cópia" e o histórico
 * (versões anteriores) ficaria órfão sob o nome antigo.
 * Permitido ao responsável da disciplina ou perfil global. Auditado (de → para),
 * com `entidadeId = disciplinaId` para correlação no histórico do projeto.
 */
export const renomearUpload = defineAction(
  {
    modulo: "uploads",
    acao: "renomear-arquivo",
    recurso: "projetos",
    permissao: "ver",
    entidade: "Upload",
    schema: renomearSchema,
    entidadeId: (d) => (d as { disciplinaId?: string } | undefined)?.disciplinaId,
    capturarAntes: (input) =>
      prisma.upload.findUnique({ where: { id: input.uploadId }, select: { nomeArquivo: true } }),
  },
  async (input, { user }) => {
    const up = await prisma.upload.findUnique({
      where: { id: input.uploadId },
      select: {
        id: true,
        nomeArquivo: true,
        pacote: true,
        pastaId: true,
        documentoId: true,
        disciplinaId: true,
        disciplina: { select: { projetoId: true, responsaveis: { select: { userId: true } } } },
      },
    });
    if (!up) throw new ActionError("Arquivo não encontrado.");

    const ehGlobal = user.role === "admin" || GLOBAL_ROLES.includes(user.role as Role);
    const ehResp = up.disciplina.responsaveis.some((r) => r.userId === user.id);
    if (!ehGlobal && !ehResp) throw new ActionError("Sem permissão para renomear este arquivo.");

    // A extensão do arquivo não pode ser alterada: força a extensão original,
    // trocando o que o cliente eventualmente tenha enviado (case-insensitive).
    const extOriginal = extComPonto(up.nomeArquivo);
    let nomeFinal = input.nome;
    if (extOriginal) {
      const extNova = extComPonto(nomeFinal);
      if (extNova.toLowerCase() !== extOriginal.toLowerCase()) {
        const base = extNova ? nomeFinal.slice(0, nomeFinal.length - extNova.length) : nomeFinal;
        nomeFinal = `${base}${extOriginal}`;
      }
    }
    if (!nomeFinal.trim() || nomeFinal.trim() === extOriginal) {
      throw new ActionError("Informe um nome antes da extensão.");
    }

    // Renomeia a cadeia inteira (todas as versões deste arquivo lógico), não só a
    // versão-alvo — assim o agrupamento por nome não se quebra e o histórico se mantém.
    // Sem filtro de excluidoEm: versões na lixeira também migram (nenhuma fica órfã
    // sob o nome antigo, o que reiniciaria a numeração num futuro re-upload). `updateMany`
    // não passa pelo filtro de soft delete (só leituras passam — ver lib/prisma.ts).
    //
    // Escopo pelo documento (pai) quando existe: o filtro antigo por `pacote` casava
    // `pacote: null` para QUALQUER arquivo de mesmo nome em pastas diferentes da mesma
    // disciplina, renomeando junto o que não devia. `documentoId` é exato.
    const alvo = up.documentoId
      ? { documentoId: up.documentoId }
      : { disciplinaId: up.disciplinaId, pacote: up.pacote, nomeArquivo: up.nomeArquivo };

    const chaveNova = chaveDocumento({
      pacote: up.pacote,
      pastaId: up.pastaId,
      nomeArquivo: nomeFinal,
    });

    // Colisão: já existe OUTRO documento com esse nome no mesmo local. Antes o rename
    // fundia as duas cadeias em silêncio (mesma disciplina + pacote + nome = "mesmo
    // arquivo"), embaralhando as versões. Agora recusa com mensagem clara.
    const conflito = await prisma.documentoDisciplina.findUnique({
      where: { disciplinaId_chave: { disciplinaId: up.disciplinaId, chave: chaveNova } },
      select: { id: true },
    });
    if (conflito && conflito.id !== up.documentoId) {
      throw new ActionError("Já existe um arquivo com esse nome nesta pasta.");
    }

    const { count } = await prisma.$transaction(async (tx) => {
      // O pai carrega o nome exibido e a chave de agrupamento — precisa acompanhar o
      // rename, senão o próximo upload com o nome novo não encontra esta cadeia.
      if (up.documentoId) {
        await tx.documentoDisciplina.update({
          where: { id: up.documentoId },
          data: { nomeArquivo: nomeFinal, chave: chaveNova },
        });
      }
      return tx.upload.updateMany({ where: alvo, data: { nomeArquivo: nomeFinal } });
    });
    revalidatePath(`/projetos/${up.disciplina.projetoId}/arquivos`);
    return { disciplinaId: up.disciplinaId, de: up.nomeArquivo, para: nomeFinal, versoes: count };
  },
);

// ── Lixeira do projeto: excluir / restaurar / purgar (só admin) ──

const excluirSchema = z.object({ uploadId: z.string().min(1) });

/** Gate comum: só admin mexe na lixeira. */
function exigirAdmin(role: string) {
  if (role !== "admin") {
    throw new ActionError("Apenas administradores podem gerir a lixeira do projeto.");
  }
}

/**
 * Manda um arquivo (Upload) para a LIXEIRA do projeto (soft delete). RESTRITO A ADMIN,
 * override total (mesmo entregas já validadas). Não apaga nada do disco — o arquivo some
 * das listagens/downloads (filtro `excluidoEm` em lib/prisma.ts + leituras aninhadas) e
 * pode ser restaurado por até `DIAS_LIXEIRA` dias, quando o job de purga o remove em
 * definitivo. Auditado (entidadeId = disciplinaId p/ correlação no histórico do projeto).
 */
export const excluirUpload = defineAction(
  {
    modulo: "uploads",
    acao: "excluir-arquivo",
    recurso: "projetos",
    permissao: "ver",
    entidade: "Upload",
    schema: excluirSchema,
    entidadeId: (d) => (d as { disciplinaId?: string } | undefined)?.disciplinaId,
    capturarAntes: (input) =>
      prisma.upload.findUnique({
        where: { id: input.uploadId },
        select: { nomeArquivo: true, disciplinaId: true, pacote: true, versao: true },
      }),
  },
  async (input, { user }) => {
    exigirAdmin(user.role);
    const upload = await prisma.upload.findUnique({
      where: { id: input.uploadId },
      select: {
        id: true,
        nomeArquivo: true,
        excluidoEm: true,
        disciplinaId: true,
        disciplina: { select: { projetoId: true } },
      },
    });
    if (!upload) throw new ActionError("Arquivo não encontrado.");
    if (upload.excluidoEm) throw new ActionError("Arquivo já está na lixeira.");

    await prisma.upload.update({
      where: { id: upload.id },
      data: { excluidoEm: new Date(), excluidoPorId: user.id },
    });
    // Pedido de exclusão em aberto neste arquivo: fecha e avisa quem pediu.
    await fecharPedidosDeExclusao([upload.id], user.id);
    revalidarArquivos(upload.disciplina.projetoId);
    revalidatePath("/aprovacoes");
    return { disciplinaId: upload.disciplinaId, nome: upload.nomeArquivo };
  },
);

const excluirLoteSchema = z.object({
  projetoId: z.string().min(1),
  uploadIds: z.array(z.string().min(1)).min(1, "Selecione ao menos um arquivo.").max(500),
});

/**
 * Move VÁRIOS arquivos (Upload) para a lixeira de uma vez (seleção múltipla no explorer).
 * Mesma regra do single: RESTRITO A ADMIN, soft delete (não apaga do disco), restaurável.
 * O escopo é travado ao `projetoId` informado — ids fora dele (ou já na lixeira) são
 * ignorados, não removidos. Auditado uma vez (entidadeId = projetoId → cai no histórico
 * do projeto). O `detalhe` guarda quantos/quais ids foram movidos.
 */
export const excluirUploadsLote = defineAction(
  {
    modulo: "uploads",
    acao: "excluir-arquivos-lote",
    recurso: "projetos",
    permissao: "ver",
    entidade: "Upload",
    schema: excluirLoteSchema,
    entidadeId: (d) => (d as { projetoId?: string } | undefined)?.projetoId,
  },
  async (input, { user }) => {
    exigirAdmin(user.role);
    // Só arquivos DESTE projeto e ainda fora da lixeira (escopo + idempotência).
    const uploads = await prisma.upload.findMany({
      where: {
        id: { in: input.uploadIds },
        excluidoEm: null,
        disciplina: { projetoId: input.projetoId },
      },
      select: { id: true },
    });
    if (uploads.length === 0) {
      throw new ActionError("Nenhum arquivo válido para mover à lixeira.");
    }

    await prisma.upload.updateMany({
      where: { id: { in: uploads.map((u) => u.id) } },
      data: { excluidoEm: new Date(), excluidoPorId: user.id },
    });
    await fecharPedidosDeExclusao(uploads.map((u) => u.id), user.id);
    revalidarArquivos(input.projetoId);
    revalidatePath("/aprovacoes");
    return { total: uploads.length, ids: uploads.map((u) => u.id) };
  },
);

/**
 * Restaura um arquivo da lixeira (limpa `excluidoEm`). Só admin. Auditado.
 */
export const restaurarUpload = defineAction(
  {
    modulo: "uploads",
    acao: "restaurar-arquivo",
    recurso: "projetos",
    permissao: "ver",
    entidade: "Upload",
    schema: excluirSchema,
    entidadeId: (d) => (d as { disciplinaId?: string } | undefined)?.disciplinaId,
    capturarAntes: (input) =>
      prisma.upload.findUnique({
        where: { id: input.uploadId },
        select: { nomeArquivo: true, disciplinaId: true, excluidoEm: true },
      }),
  },
  async (input, { user }) => {
    exigirAdmin(user.role);
    const upload = await prisma.upload.findUnique({
      where: { id: input.uploadId },
      select: {
        id: true,
        nomeArquivo: true,
        excluidoEm: true,
        disciplinaId: true,
        disciplina: { select: { projetoId: true } },
      },
    });
    if (!upload) throw new ActionError("Arquivo não encontrado.");
    if (!upload.excluidoEm) throw new ActionError("Este arquivo não está na lixeira.");

    await prisma.upload.update({
      where: { id: upload.id },
      data: { excluidoEm: null, excluidoPorId: null },
    });
    revalidarArquivos(upload.disciplina.projetoId);
    return { disciplinaId: upload.disciplinaId, nome: upload.nomeArquivo };
  },
);

/**
 * Exclui EM DEFINITIVO um arquivo que já está na lixeira ("excluir agora" / esvaziar).
 * Só admin. Remove o registro (cascata: Pendencia/AceiteCliente/ConversaoModelo) e os
 * arquivos físicos (o próprio + o `.frag` da conversão IFC, se houver). Auditado.
 *
 * NÃO chama `fecharPedidosDeExclusao` de propósito: só age sobre arquivo que JÁ está na
 * lixeira, e o pedido pendente já foi encerrado (com aviso) quando ele foi pra lá. A
 * cascata leva junto o histórico de pedidos — o registro permanente é o AuditLog.
 */
export const excluirUploadDefinitivo = defineAction(
  {
    modulo: "uploads",
    acao: "excluir-arquivo-definitivo",
    recurso: "projetos",
    permissao: "ver",
    entidade: "Upload",
    schema: excluirSchema,
    entidadeId: (d) => (d as { disciplinaId?: string } | undefined)?.disciplinaId,
    capturarAntes: (input) =>
      prisma.upload.findUnique({
        where: { id: input.uploadId },
        select: { nomeArquivo: true, disciplinaId: true, pacote: true, versao: true },
      }),
  },
  async (input, { user }) => {
    exigirAdmin(user.role);
    const upload = await prisma.upload.findUnique({
      where: { id: input.uploadId },
      select: {
        id: true,
        nomeArquivo: true,
        caminho: true,
        excluidoEm: true,
        disciplinaId: true,
        disciplina: { select: { projetoId: true } },
        conversao: { select: { caminhoFrag: true } },
      },
    });
    if (!upload) throw new ActionError("Arquivo não encontrado.");
    if (!upload.excluidoEm) {
      throw new ActionError("Só é possível excluir em definitivo arquivos que estão na lixeira.");
    }

    // Cascata (schema): remove Pendencia, AceiteCliente e ConversaoModelo vinculados.
    await prisma.upload.delete({ where: { id: upload.id } });
    await removerArquivo(upload.caminho);
    if (upload.conversao?.caminhoFrag) await removerArquivo(upload.conversao.caminhoFrag);

    revalidarArquivos(upload.disciplina.projetoId);
    return { disciplinaId: upload.disciplinaId, nome: upload.nomeArquivo };
  },
);

// ── Solicitação de exclusão (quem NÃO pode excluir pede; admin decide) ──

/**
 * Fecha (como `aprovada`) os pedidos pendentes dos arquivos que acabaram de ir para a
 * lixeira por ação direta do admin, e avisa quem pediu. Sem isso o pedido ficaria órfão
 * na fila apontando para um arquivo que já não existe na árvore. Devolve os pedidos
 * fechados só para o chamador decidir o que revalidar.
 */
async function fecharPedidosDeExclusao(uploadIds: string[], adminId: string) {
  const pendentes = await prisma.solicitacaoExclusaoUpload.findMany({
    where: { uploadId: { in: uploadIds }, status: "pendente" },
    select: { id: true, solicitanteId: true, upload: { select: { nomeArquivo: true } } },
  });
  if (pendentes.length === 0) return [];

  await prisma.solicitacaoExclusaoUpload.updateMany({
    where: { id: { in: pendentes.map((p) => p.id) } },
    data: {
      status: "aprovada",
      decididoPorId: adminId,
      decididoEm: new Date(),
      motivoDecisao: "Arquivo excluído diretamente por um administrador.",
    },
  });

  // Uma notificação por SOLICITANTE (não por pedido): num lote de 500 arquivos do mesmo
  // autor isso é 1 aviso, não 500 — e um filtro de categoria em vez de 500.
  const porSolicitante = new Map<string, string[]>();
  for (const p of pendentes) {
    if (p.solicitanteId === adminId) continue;
    const nomes = porSolicitante.get(p.solicitanteId) ?? [];
    nomes.push(p.upload.nomeArquivo);
    porSolicitante.set(p.solicitanteId, nomes);
  }
  await Promise.all(
    [...porSolicitante].map(([solicitanteId, nomes]) =>
      notificarMuitos(
        [solicitanteId],
        {
          titulo: "Exclusão aprovada",
          corpo:
            nomes.length === 1
              ? `"${nomes[0]}" foi movido para a lixeira do projeto.`
              : `${nomes.length} arquivos que você pediu para excluir foram movidos para a lixeira.`,
          href: "/",
          tag: `exclusao-${solicitanteId}-${Date.now()}`,
        },
        { categoria: "aprovacao_arquivo" },
      ),
    ),
  );
  return pendentes;
}

const solicitarExclusaoSchema = z.object({
  uploadId: z.string().min(1),
  justificativa: z
    .string()
    .trim()
    .min(10, "Explique o motivo da exclusão (mínimo 10 caracteres).")
    .max(1000, "Justificativa muito longa (máximo 1000 caracteres)."),
});

/**
 * Pede a exclusão de um arquivo de disciplina. NADA acontece com o arquivo aqui: ele
 * continua na árvore e nos downloads — o pedido só entra na fila de `/aprovacoes` e
 * notifica os admins, que aprovam (aí sim vai para a lixeira) ou recusam.
 *
 * Gate invertido em relação a `excluirUpload`: quem JÁ pode excluir não solicita. O
 * escopo do arquivo é conferido do mesmo jeito que na leitura (projeto visível + muralha
 * por disciplina), pra não virar um oráculo de existência de arquivo alheio.
 */
export const solicitarExclusaoUpload = defineAction(
  {
    modulo: "uploads",
    acao: "solicitar-exclusao-arquivo",
    recurso: "projetos",
    permissao: "ver",
    entidade: "SolicitacaoExclusaoUpload",
    schema: solicitarExclusaoSchema,
    entidadeId: (d) => (d as { id?: string } | undefined)?.id,
  },
  async (input, { user }) => {
    if (user.role === "admin") {
      throw new ActionError("Você já pode excluir arquivos — use a exclusão direta.");
    }

    const upload = await prisma.upload.findUnique({
      where: { id: input.uploadId },
      select: {
        id: true,
        nomeArquivo: true,
        excluidoEm: true,
        disciplinaId: true,
        disciplina: {
          select: {
            nome: true,
            projetoId: true,
            responsaveis: { select: { userId: true } },
            projeto: { select: { codigo: true, nome: true } },
          },
        },
      },
    });
    // Mensagem única para "não existe" e "você não enxerga" — não vaza a existência.
    const naoEncontrado = new ActionError("Arquivo não encontrado.");
    if (!upload) throw naoEncontrado;
    if (!(await projetoVisivel(user, upload.disciplina.projetoId))) throw naoEncontrado;
    const veTodas = await podeVerTodasDisciplinas(user);
    const ehResponsavel = upload.disciplina.responsaveis.some((r) => r.userId === user.id);
    if (!veTodas && !ehResponsavel) throw naoEncontrado;

    if (upload.excluidoEm) throw new ActionError("Este arquivo já está na lixeira.");

    // Idempotência: um pendente por arquivo (índice parcial único cobre a corrida).
    const pendente = await prisma.solicitacaoExclusaoUpload.findFirst({
      where: { uploadId: upload.id, status: "pendente" },
      select: { id: true },
    });
    if (pendente) {
      throw new ActionError("Já existe um pedido de exclusão pendente para este arquivo.");
    }

    const solicitacao = await prisma.solicitacaoExclusaoUpload.create({
      data: {
        uploadId: upload.id,
        projetoId: upload.disciplina.projetoId,
        justificativa: input.justificativa,
        solicitanteId: user.id,
      },
      select: { id: true },
    });

    const admins = await prisma.user.findMany({
      where: { ativo: true, role: "admin" },
      select: { id: true },
    });
    const codigo = formatarCodigo(upload.disciplina.projeto.codigo);
    await notificarMuitos(
      admins.map((a) => a.id).filter((id) => id !== user.id),
      {
        titulo: "Exclusão de arquivo solicitada",
        corpo: `${user.name} pediu a exclusão de "${upload.nomeArquivo}" (${codigo} · ${upload.disciplina.nome}).`,
        href: "/aprovacoes",
        tag: `exclusao-${solicitacao.id}`,
      },
      { categoria: "aprovacao_arquivo" },
    );

    revalidarArquivos(upload.disciplina.projetoId);
    revalidatePath("/aprovacoes");
    return { id: solicitacao.id, uploadId: upload.id, nome: upload.nomeArquivo };
  },
);

/** Carrega o pedido para decisão e garante que ele ainda está pendente. */
async function carregarPedidoPendente(id: string) {
  const solicitacao = await prisma.solicitacaoExclusaoUpload.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      projetoId: true,
      solicitanteId: true,
      uploadId: true,
      upload: {
        select: {
          id: true,
          nomeArquivo: true,
          excluidoEm: true,
          disciplinaId: true,
          disciplina: { select: { projetoId: true } },
        },
      },
    },
  });
  if (!solicitacao) throw new ActionError("Pedido de exclusão não encontrado.");
  if (solicitacao.status !== "pendente") {
    throw new ActionError("Este pedido de exclusão já foi decidido.");
  }
  return solicitacao;
}

const decidirExclusaoSchema = z.object({ id: z.string().min(1) });

/**
 * Aprova o pedido: o arquivo vai para a LIXEIRA (mesmo soft delete de `excluirUpload`,
 * restaurável por `DIAS_LIXEIRA` dias). Só admin. Se o arquivo já tiver sido excluído
 * por outra via, o pedido é apenas encerrado — não é erro. Notifica o solicitante.
 */
export const aprovarSolicitacaoExclusao = defineAction(
  {
    modulo: "uploads",
    acao: "aprovar-exclusao-arquivo",
    recurso: "projetos",
    permissao: "ver",
    entidade: "SolicitacaoExclusaoUpload",
    schema: decidirExclusaoSchema,
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
    capturarAntes: (input) =>
      prisma.solicitacaoExclusaoUpload.findUnique({
        where: { id: input.id },
        select: { status: true, uploadId: true, justificativa: true, solicitanteId: true },
      }),
  },
  async (input, { user }) => {
    exigirAdmin(user.role);
    const solicitacao = await carregarPedidoPendente(input.id);

    await prisma.$transaction(async (tx) => {
      // Já na lixeira (admin excluiu por fora): só encerra o pedido, sem re-datar.
      if (!solicitacao.upload.excluidoEm) {
        await tx.upload.update({
          where: { id: solicitacao.uploadId },
          data: { excluidoEm: new Date(), excluidoPorId: user.id },
        });
      }
      await tx.solicitacaoExclusaoUpload.update({
        where: { id: solicitacao.id },
        data: { status: "aprovada", decididoPorId: user.id, decididoEm: new Date() },
      });
    });

    await notificarMuitos(
      [solicitacao.solicitanteId].filter((id) => id !== user.id),
      {
        titulo: "Exclusão aprovada",
        corpo: `"${solicitacao.upload.nomeArquivo}" foi movido para a lixeira do projeto.`,
        href: `/projetos/${solicitacao.upload.disciplina.projetoId}/arquivos`,
        tag: `exclusao-${solicitacao.id}`,
      },
      { categoria: "aprovacao_arquivo" },
    );

    revalidarArquivos(solicitacao.upload.disciplina.projetoId);
    revalidatePath("/aprovacoes");
    return { id: solicitacao.id, uploadId: solicitacao.uploadId, nome: solicitacao.upload.nomeArquivo };
  },
);

const recusarExclusaoSchema = z.object({
  id: z.string().min(1),
  motivo: z
    .string()
    .trim()
    .min(5, "Explique por que o arquivo será mantido (mínimo 5 caracteres).")
    .max(1000, "Motivo muito longo (máximo 1000 caracteres)."),
});

/**
 * Recusa o pedido: o arquivo é MANTIDO como está. Só admin. O motivo é obrigatório —
 * é o que volta para o solicitante na notificação.
 */
export const recusarSolicitacaoExclusao = defineAction(
  {
    modulo: "uploads",
    acao: "recusar-exclusao-arquivo",
    recurso: "projetos",
    permissao: "ver",
    entidade: "SolicitacaoExclusaoUpload",
    schema: recusarExclusaoSchema,
    entidadeId: (d, i) => ((d ?? i) as { id: string }).id,
    capturarAntes: (input) =>
      prisma.solicitacaoExclusaoUpload.findUnique({
        where: { id: input.id },
        select: { status: true, uploadId: true, justificativa: true, solicitanteId: true },
      }),
  },
  async (input, { user }) => {
    exigirAdmin(user.role);
    const solicitacao = await carregarPedidoPendente(input.id);

    await prisma.solicitacaoExclusaoUpload.update({
      where: { id: solicitacao.id },
      data: {
        status: "recusada",
        decididoPorId: user.id,
        decididoEm: new Date(),
        motivoDecisao: input.motivo,
      },
    });

    await notificarMuitos(
      [solicitacao.solicitanteId].filter((id) => id !== user.id),
      {
        titulo: "Exclusão recusada",
        corpo: `"${solicitacao.upload.nomeArquivo}" será mantido. Motivo: ${input.motivo}`,
        href: `/projetos/${solicitacao.upload.disciplina.projetoId}/arquivos`,
        tag: `exclusao-${solicitacao.id}`,
      },
      { categoria: "aprovacao_arquivo" },
    );

    revalidarArquivos(solicitacao.upload.disciplina.projetoId);
    revalidatePath("/aprovacoes");
    return { id: solicitacao.id, uploadId: solicitacao.uploadId, nome: solicitacao.upload.nomeArquivo };
  },
);

// ── Aceite digital do cliente (N-43) ───────────────────────────

const gerarAceiteSchema = z.object({ uploadId: z.string().min(1) });

export const gerarAceiteCliente = defineAction(
  {
    modulo: "uploads",
    acao: "gerar-aceite-cliente",
    recurso: "uploads",
    permissao: "validar",
    entidade: "AceiteCliente",
    schema: gerarAceiteSchema,
    entidadeId: (d, i) => ((d ?? i) as { uploadId: string }).uploadId,
  },
  async (input, { user }) => {
    const upload = await prisma.upload.findUnique({
      where: { id: input.uploadId },
      select: { id: true, validado: true, disciplina: { select: { projetoId: true } } },
    });
    if (!upload) throw new ActionError("Entrega não encontrada.");
    if (!upload.validado) throw new ActionError("A entrega precisa ser validada antes de gerar o link de aceite.");

    const existing = await prisma.aceiteCliente.findUnique({ where: { uploadId: input.uploadId } });
    if (existing) return { token: existing.token };

    const token = randomBytes(24).toString("hex");
    const aceite = await prisma.aceiteCliente.create({
      data: { uploadId: input.uploadId, token, geradoPorId: user.id },
    });
    revalidatePath(`/projetos/${upload.disciplina.projetoId}`);
    return { token: aceite.token };
  },
);

