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
import { can } from "@/lib/permissions";
import type { SessionUser } from "@/lib/session";
import { whereAudiencia } from "@/lib/audiencias";
import { statusValidacao } from "@/modules/uploads/validacao";
import { chaveDocumento, nomeComExtensaoOriginal, nomeSemExtensao } from "@/modules/uploads/documento";
import { liberarPagamentosProjetista } from "@/modules/uploads/pagamento";
import { bloqueioValorDisciplina } from "@/modules/uploads/rateio";
import { disciplinaUsaPastas } from "@/modules/projetos/estrutura-tipo";
import { projetoVisivel } from "@/modules/planejamento/queries";
import { podeVerTodasDisciplinas, responsavelOuVeTodas } from "@/modules/arquivos/acesso";
import { STATUS_ABERTOS } from "@/modules/projetos/pendencias/helpers";
import { historicoRevisoesDocumento, irmaosDoDocumento, casosEscopoExclusao } from "@/modules/uploads/queries";
import { expandirSelecao } from "@/modules/uploads/exclusao-escopo";
import { resolverNomenclatura } from "@/modules/projetos/nomenclatura/queries";
import { expiraAceiteEm, linkAceiteEstaAtivo } from "@/modules/uploads/aceite";
import { registrarEventoDocumento, registrarEventoUploads } from "@/modules/uploads/historico/service";
import { camposAlterados } from "@/modules/uploads/historico/eventos";
import { historicoDocumento } from "@/modules/uploads/historico/queries";

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
        corpo: `${disciplina.disciplinaTextoLegado} (${codigoDisc}) aprovada — pagamento já liberado, sem novo pagamento.`,
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
          corpo: `Entrega de ${disciplina.disciplinaTextoLegado} (${codigo}) validada. Pagamento liberado.`,
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
          corpo: `Entrega de ${disciplina.disciplinaTextoLegado} (${codigo}) validada.`,
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
            ? `${disciplina.disciplinaTextoLegado} (${codigo}) validada — pagamento de projetista criado.`
            : `${disciplina.disciplinaTextoLegado} (${codigo}) validada — sem pagamento (equipe CLT/estágio).`,
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
          disciplinaTextoLegado: true,
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
    await registrarEventoUploads({ uploadIds: [upload.id], tipo: "validacao", userId: user.id });
    revalidarArquivos(upload.disciplina.projetoId);
    return { uploadId: upload.id, nome: upload.nomeArquivo };
  },
);

/** Desfaz a validação de um arquivo (antes de finalizar a entrega). */
export const reverterValidacaoArquivo = defineAction(
  { ...baseValidacao, acao: "reverter-validacao-arquivo", schema: uploadIdSchema },
  async (input, { user }) => {
    const upload = await carregarUploadEditavel(input.uploadId);
    await prisma.upload.update({
      where: { id: upload.id },
      data: { validado: false, validadoPorId: null, validadoEm: null },
    });
    await registrarEventoUploads({ uploadIds: [upload.id], tipo: "validacao_revertida", userId: user.id });
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
    await registrarEventoUploads({
      uploadIds: [upload.id],
      tipo: "ajuste_solicitado",
      userId: user.id,
      detalhe: { motivo: input.motivo },
    });

    const { disciplina } = upload;
    const codigo = formatarCodigo(disciplina.projeto.codigo);
    const destinatarios = [upload.autorId, ...disciplina.responsaveis.map((r) => r.userId)]
      .filter((id) => id !== user.id);
    if (destinatarios.length > 0) {
      await notificarMuitos(destinatarios, {
        titulo: "Ajuste solicitado em arquivo",
        corpo: `${upload.nomeArquivo} (${disciplina.disciplinaTextoLegado} · ${codigo}): ${input.motivo}`,
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
    await registrarEventoUploads({ uploadIds: validos.map((u) => u.id), tipo: "validacao", userId: user.id });
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
    recurso: "arquivos",
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
    await exigirEscopoArquivo(user, up.disciplina);

    // Global/responsável continuam valendo como sempre; `arquivos:renomear` é uma porta a
    // MAIS, agora visível na tela de Permissões (antes a regra só existia aqui no código).
    const ehGlobal = user.role === "admin" || GLOBAL_ROLES.includes(user.role as Role);
    const ehResp = up.disciplina.responsaveis.some((r) => r.userId === user.id);
    if (!ehGlobal && !ehResp && !(await can(user, "arquivos", "renomear"))) {
      throw new ActionError("Sem permissão para renomear este arquivo.");
    }

    // O nome informado é o nome-base do documento. Cada Upload conserva sua própria
    // extensão: uma prancha com PDF+DWG continua com os dois formatos após o rename.
    const nomeBase = nomeSemExtensao(input.nome).trim();
    if (!nomeBase) {
      throw new ActionError("Informe um nome antes da extensão.");
    }
    const nomeFinal = nomeComExtensaoOriginal(nomeBase, up.nomeArquivo);

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
      nomeArquivo: nomeBase,
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
          data: { nomeArquivo: nomeBase, chave: chaveNova },
        });
      }
      const uploads = await tx.upload.findMany({ where: alvo, select: { id: true, nomeArquivo: true } });
      await Promise.all(
        uploads.map((upload) =>
          tx.upload.update({
            where: { id: upload.id },
            data: { nomeArquivo: nomeComExtensaoOriginal(nomeBase, upload.nomeArquivo) },
          }),
        ),
      );
      return { count: uploads.length };
    });
    if (up.documentoId) {
      await registrarEventoDocumento({
        documentoId: up.documentoId,
        uploadId: up.id,
        tipo: "renomeio",
        userId: user.id,
        detalhe: { de: up.nomeArquivo, para: nomeFinal },
      });
    }
    revalidatePath(`/projetos/${up.disciplina.projetoId}/arquivos`);
    return { disciplinaId: up.disciplinaId, de: up.nomeArquivo, para: nomeFinal, versoes: count };
  },
);

// ── Lixeira do projeto: excluir / restaurar / purgar (só admin) ──

const excluirSchema = z.object({ uploadId: z.string().min(1) });

/**
 * Escopo da operação de lixeira. `revisao` (padrão) mantém o comportamento histórico —
 * uma linha por vez; `documento` leva todas as revisões do mesmo documento lógico junto.
 *
 * O default é `revisao` de propósito: chamador antigo que não conhece o campo continua
 * fazendo exatamente o que sempre fez. Quem pré-marca `documento` é a UI, no diálogo.
 */
const escopoExclusaoSchema = excluirSchema.extend({
  // `.optional()` e não `.default()`: `defineAction` tipa o input pelo OUTPUT do schema, e
  // com `.default()` o campo vira obrigatório na chamada — o que anularia a compatibilidade
  // que este default existe para dar. O valor ausente é resolvido no corpo.
  escopo: z.enum(["revisao", "documento"]).optional(),
});

/**
 * Gate da lixeira: admin OU quem tiver `arquivos:excluir` concedido na matriz.
 *
 * Era `role === "admin"` cravado em código, invisível para a tela de Permissões
 * (docs/auditoria/01-arquitetura-atual.md §10b). A capability foi catalogada e passa a ser
 * um caminho ADICIONAL — o `role === "admin"` continua aqui de propósito: `can()` bypassa
 * por `superUsuario`, não por role, então trocar um pelo outro trancaria o admin para fora
 * em qualquer base onde o backfill de perfis ainda não tenha rodado.
 */
async function exigirPermissaoLixeira(user: SessionUser) {
  if (user.role === "admin") return;
  if (await can(user, "arquivos", "excluir")) return;
  throw new ActionError("Você não tem permissão para gerir a lixeira do projeto.");
}

/**
 * Muralha de escrita de arquivos: além da capability da ação, exige que a pessoa veja o
 * projeto e a disciplina do Upload. Não usar `podeVerTudo` aqui: só o escopo de leitura
 * estabelecido para arquivos pode autorizar uma mutação.
 */
async function exigirEscopoArquivo(
  user: SessionUser,
  disciplina: { projetoId: string; responsaveis: { userId: string }[] },
) {
  const [podeVerProjeto, projeto, veTodas] = await Promise.all([
    can(user, "projetos", "ver"),
    projetoVisivel(user, disciplina.projetoId),
    podeVerTodasDisciplinas(user),
  ]);
  if (!podeVerProjeto) throw new ActionError("Sem permissão para gerir arquivos.");

  const naoEncontrado = new ActionError("Arquivo não encontrado.");
  if (!projeto) throw naoEncontrado;
  if (!responsavelOuVeTodas(user.id, veTodas, disciplina.responsaveis)) {
    throw naoEncontrado;
  }
}

/** Retorna se a pessoa enxerga todas as disciplinas do projeto para operações em lote. */
async function exigirEscopoProjetoArquivos(user: SessionUser, projetoId: string) {
  const [podeVerProjeto, projeto, veTodas] = await Promise.all([
    can(user, "projetos", "ver"),
    projetoVisivel(user, projetoId),
    podeVerTodasDisciplinas(user),
  ]);
  if (!podeVerProjeto) throw new ActionError("Sem permissão para gerir arquivos.");
  if (!projeto) throw new ActionError("Projeto não encontrado.");
  return veTodas;
}

/**
 * Lê os casos que o diálogo de escopo mostra: para cada documento tocado pela seleção,
 * quais revisões estão marcadas e quais são irmãs que a pessoa pode arrastar junto.
 *
 * É leitura, mas vai por `defineAction` de propósito: expõe nomes de arquivo e precisa do
 * mesmo gate da lixeira. A entrada de auditoria é bem-vinda — "quem estava prestes a apagar
 * o quê" é justamente o rastro que faltou quando uma limpeza manual deixou revisão vencida
 * viva no link do cliente.
 */
export const consultarEscopoExclusao = defineAction(
  {
    modulo: "uploads",
    acao: "consultar-escopo-exclusao",
    recurso: "arquivos",
    permissao: "ver",
    entidade: "Upload",
    schema: z.object({
      uploadIds: z.array(z.string().min(1)).min(1).max(500),
      naLixeira: z.boolean().optional(),
    }),
  },
  async (input, { user }) => {
    await exigirPermissaoLixeira(user);
    if (!(await can(user, "projetos", "ver"))) throw new ActionError("Sem permissão para gerir arquivos.");

    /**
     * Recorta os ids ao que a pessoa REALMENTE enxerga antes de devolver nome de arquivo e
     * número de revisão. A capability da lixeira sozinha não diz de QUAIS disciplinas — sem
     * isto, qualquer um com `arquivos:excluir` leria o acervo de qualquer projeto por id.
     *
     * Basta filtrar a seleção: as irmãs vivem no mesmo documento, que é único por disciplina,
     * então elas herdam a visibilidade já verificada aqui.
     */
    const veTodas = await podeVerTodasDisciplinas(user);
    const visiveis = await prisma.upload.findMany({
      where: {
        id: { in: input.uploadIds },
        excluidoEm: input.naLixeira ? { not: null } : null,
        ...(veTodas ? {} : { disciplina: { responsaveis: { some: { userId: user.id } } } }),
      },
      select: { id: true },
    });
    if (visiveis.length === 0) return { casos: [] };

    return {
      casos: await casosEscopoExclusao(
        visiveis.map((v) => v.id),
        input.naLixeira ?? false,
      ),
    };
  },
);

/**
 * Manda um arquivo (Upload) para a LIXEIRA do projeto (soft delete). RESTRITO A ADMIN,
 * override total (mesmo entregas já validadas). Não apaga nada do disco — o arquivo some
 * das listagens/downloads (filtro `excluidoEm` em lib/prisma.ts + leituras aninhadas) e
 * pode ser restaurado por até `DIAS_LIXEIRA` dias, quando o job de purga o remove em
 * definitivo. Auditado (entidadeId = disciplinaId p/ correlação no histórico do projeto).
 *
 * `escopo: "documento"` leva TODAS as revisões vivas do mesmo documento lógico junto. É a
 * diferença entre "descartei esta revisão, vale a anterior" e "este documento não existe":
 * excluir de uma em uma e esquecer a mais antiga faz o recorte do link público promover a
 * revisão esquecida a entrega corrente (ver `link-publico-regras.ts`). Um `exigirEscopoArquivo`
 * cobre o conjunto inteiro: documento é único por disciplina, então todas as irmãs vivem na
 * mesma disciplina já checada.
 */
export const excluirUpload = defineAction(
  {
    modulo: "uploads",
    acao: "excluir-arquivo",
    recurso: "arquivos",
    permissao: "ver",
    entidade: "Upload",
    schema: escopoExclusaoSchema,
    entidadeId: (d) => (d as { disciplinaId?: string } | undefined)?.disciplinaId,
    capturarAntes: (input) =>
      prisma.upload.findUnique({
        where: { id: input.uploadId },
        select: { nomeArquivo: true, disciplinaId: true, pacote: true, versao: true },
      }),
  },
  async (input, { user }) => {
    await exigirPermissaoLixeira(user);
    const upload = await prisma.upload.findUnique({
      where: { id: input.uploadId },
      select: {
        id: true,
        nomeArquivo: true,
        excluidoEm: true,
        disciplinaId: true,
        disciplina: { select: { projetoId: true, responsaveis: { select: { userId: true } } } },
      },
    });
    if (!upload) throw new ActionError("Arquivo não encontrado.");
    await exigirEscopoArquivo(user, upload.disciplina);
    if (upload.excluidoEm) throw new ActionError("Arquivo já está na lixeira.");

    const alvos = input.escopo === "documento" ? await irmaosDoDocumento(upload.id) : [upload.id];

    await prisma.upload.updateMany({
      where: { id: { in: alvos } },
      data: { excluidoEm: new Date(), excluidoPorId: user.id },
    });
    await registrarEventoUploads({
      uploadIds: alvos,
      tipo: "lixeira",
      userId: user.id,
      detalhe: { escopo: input.escopo ?? "revisao" },
    });
    // Pedido de exclusão em aberto em qualquer um deles: fecha e avisa quem pediu.
    await fecharPedidosDeExclusao(alvos, user.id);
    revalidarArquivos(upload.disciplina.projetoId);
    revalidatePath("/aprovacoes");
    return {
      disciplinaId: upload.disciplinaId,
      nome: upload.nomeArquivo,
      escopo: input.escopo,
      total: alvos.length,
      ids: alvos,
    };
  },
);

const excluirLoteSchema = z.object({
  projetoId: z.string().min(1),
  uploadIds: z.array(z.string().min(1)).min(1, "Selecione ao menos um arquivo.").max(500),
  /**
   * Documentos que a pessoa escolheu levar INTEIROS (todas as revisões vivas), decididos um
   * a um no diálogo. Fica ao lado de `uploadIds` em vez de reformatar a seleção: chamador
   * antigo continua válido, e upload sem documento lógico simplesmente não aparece aqui
   * (não há documento a levar inteiro).
   */
  documentosInteiros: z.array(z.string().min(1)).max(500).optional(),
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
    recurso: "arquivos",
    permissao: "ver",
    entidade: "Upload",
    schema: excluirLoteSchema,
    entidadeId: (d) => (d as { projetoId?: string } | undefined)?.projetoId,
  },
  async (input, { user }) => {
    await exigirPermissaoLixeira(user);
    const veTodas = await exigirEscopoProjetoArquivos(user, input.projetoId);
    // Só arquivos DESTE projeto e ainda fora da lixeira (escopo + idempotência).
    const uploads = await prisma.upload.findMany({
      where: {
        id: { in: input.uploadIds },
        excluidoEm: null,
        disciplina: {
          projetoId: input.projetoId,
          ...(veTodas ? {} : { responsaveis: { some: { userId: user.id } } }),
        },
      },
      select: { id: true, documentoId: true, documento: { select: { substituidoPorId: true } } },
    });
    if (uploads.length === 0) {
      throw new ActionError("Nenhum arquivo válido para mover à lixeira.");
    }

    /**
     * `documentosInteiros` vem do cliente: só vale para documento que a SELEÇÃO já toca.
     * Sem este cruzamento, mandar um id qualquer expandiria revisões que a pessoa nunca
     * marcou (limitado às disciplinas que ela escreve, mas ainda assim "apaguei o que não
     * escolhi"). O diálogo só oferece documentos da seleção, então isto não custa nada na UI.
     */
    const documentosDaSelecao = new Set(
      uploads.map((u) => u.documento?.substituidoPorId ?? u.documentoId).filter((d): d is string => d !== null),
    );
    const documentosInteiros = (input.documentosInteiros ?? []).filter((d) => documentosDaSelecao.has(d));

    // Irmãs dos documentos marcados "inteiro". Cada uma passa pelo MESMO filtro de escopo
    // acima antes de entrar: expandir por documento não pode virar caminho para tocar
    // arquivo de disciplina que a pessoa não enxerga.
    const irmaosPorDocumento = new Map<string, string[]>();
    for (const documentoId of new Set(documentosInteiros)) {
      const irmaos = await prisma.upload.findMany({
        where: {
          excluidoEm: null,
          OR: [{ documentoId }, { documento: { substituidoPorId: documentoId } }],
          disciplina: {
            projetoId: input.projetoId,
            ...(veTodas ? {} : { responsaveis: { some: { userId: user.id } } }),
          },
        },
        select: { id: true },
        orderBy: [{ versao: "asc" }, { nomeArquivo: "asc" }],
      });
      irmaosPorDocumento.set(documentoId, irmaos.map((i) => i.id));
    }

    const alvos = expandirSelecao(uploads.map((u) => u.id), documentosInteiros, irmaosPorDocumento);

    await prisma.upload.updateMany({
      where: { id: { in: alvos } },
      data: { excluidoEm: new Date(), excluidoPorId: user.id },
    });
    await registrarEventoUploads({ uploadIds: alvos, tipo: "lixeira", userId: user.id, detalhe: { escopo: "lote" } });
    await fecharPedidosDeExclusao(alvos, user.id);
    revalidarArquivos(input.projetoId);
    revalidatePath("/aprovacoes");
    // `marcados` vs `total`: a auditoria precisa distinguir o que a pessoa clicou do que a
    // expansão por documento arrastou junto — foi a falta desse rastro que tornou difícil
    // reconstruir a limpeza que originou o chamado do link público.
    return {
      total: alvos.length,
      marcados: uploads.length,
      documentosInteiros: documentosInteiros.length,
      ids: alvos,
    };
  },
);

/**
 * Restaura um arquivo da lixeira (limpa `excluidoEm`). Só admin. Auditado.
 *
 * `escopo: "documento"` traz todas as revisões do documento que estão na lixeira, não só a
 * linha clicada — simétrico ao da exclusão e pelo mesmo motivo: restaurar 1 de 3 remonta um
 * documento capenga, cuja revisão sobrevivente vira "corrente" no link público sem ninguém
 * ter decidido isso.
 */
export const restaurarUpload = defineAction(
  {
    modulo: "uploads",
    acao: "restaurar-arquivo",
    recurso: "arquivos",
    permissao: "ver",
    entidade: "Upload",
    schema: escopoExclusaoSchema,
    entidadeId: (d) => (d as { disciplinaId?: string } | undefined)?.disciplinaId,
    capturarAntes: (input) =>
      prisma.upload.findUnique({
        where: { id: input.uploadId },
        select: { nomeArquivo: true, disciplinaId: true, excluidoEm: true },
      }),
  },
  async (input, { user }) => {
    await exigirPermissaoLixeira(user);
    const upload = await prisma.upload.findUnique({
      where: { id: input.uploadId },
      select: {
        id: true,
        nomeArquivo: true,
        excluidoEm: true,
        disciplinaId: true,
        disciplina: { select: { projetoId: true, responsaveis: { select: { userId: true } } } },
      },
    });
    if (!upload) throw new ActionError("Arquivo não encontrado.");
    await exigirEscopoArquivo(user, upload.disciplina);
    if (!upload.excluidoEm) throw new ActionError("Este arquivo não está na lixeira.");

    // `true`: aqui os irmãos que interessam são os que ESTÃO na lixeira.
    const alvos = input.escopo === "documento" ? await irmaosDoDocumento(upload.id, true) : [upload.id];

    await prisma.upload.updateMany({
      where: { id: { in: alvos } },
      data: { excluidoEm: null, excluidoPorId: null },
    });
    await registrarEventoUploads({
      uploadIds: alvos,
      tipo: "restauracao",
      userId: user.id,
      detalhe: { escopo: input.escopo ?? "revisao" },
    });
    revalidarArquivos(upload.disciplina.projetoId);
    return {
      disciplinaId: upload.disciplinaId,
      nome: upload.nomeArquivo,
      escopo: input.escopo,
      total: alvos.length,
      ids: alvos,
    };
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
    recurso: "arquivos",
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
    await exigirPermissaoLixeira(user);
    const upload = await prisma.upload.findUnique({
      where: { id: input.uploadId },
      select: {
        id: true,
        nomeArquivo: true,
        caminho: true,
        excluidoEm: true,
        disciplinaId: true,
        documentoId: true,
        versao: true,
        disciplina: { select: { projetoId: true, responsaveis: { select: { userId: true } } } },
        conversao: { select: { caminhoFrag: true } },
      },
    });
    if (!upload) throw new ActionError("Arquivo não encontrado.");
    await exigirEscopoArquivo(user, upload.disciplina);
    if (!upload.excluidoEm) {
      throw new ActionError("Só é possível excluir em definitivo arquivos que estão na lixeira.");
    }

    // Cascata (schema): remove Pendencia, AceiteCliente e ConversaoModelo vinculados.
    await prisma.upload.delete({ where: { id: upload.id } });
    // Depois do delete o Upload já não resolve o documento — por isso o id veio no select acima.
    if (upload.documentoId) {
      await registrarEventoDocumento({
        documentoId: upload.documentoId,
        uploadId: upload.id,
        tipo: "exclusao_definitiva",
        userId: user.id,
        detalhe: { arquivo: upload.nomeArquivo, versao: upload.versao },
      });
    }
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
            disciplinaTextoLegado: true,
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
    await registrarEventoUploads({
      uploadIds: [upload.id],
      tipo: "exclusao_solicitada",
      userId: user.id,
      detalhe: { justificativa: input.justificativa },
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
        corpo: `${user.name} pediu a exclusão de "${upload.nomeArquivo}" (${codigo} · ${upload.disciplina.disciplinaTextoLegado}).`,
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
    await exigirPermissaoLixeira(user);
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
    await registrarEventoUploads({ uploadIds: [solicitacao.uploadId], tipo: "exclusao_aprovada", userId: user.id });

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
    await exigirPermissaoLixeira(user);
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
    await registrarEventoUploads({
      uploadIds: [solicitacao.uploadId],
      tipo: "exclusao_recusada",
      userId: user.id,
      detalhe: { motivo: input.motivo },
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
const revogarAceiteSchema = z.object({ uploadId: z.string().min(1) });

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
      select: {
        id: true,
        validado: true,
        disciplina: { select: { projetoId: true, responsaveis: { select: { userId: true } } } },
      },
    });
    const naoEncontrado = new ActionError("Entrega não encontrada.");
    if (!upload) throw naoEncontrado;
    await exigirEscopoArquivo(user, upload.disciplina);
    if (!upload.validado) throw new ActionError("A entrega precisa ser validada antes de gerar o link de aceite.");

    const agora = new Date();
    const existing = await prisma.aceiteCliente.findUnique({
      where: { uploadId: input.uploadId },
      select: { id: true, token: true, situacao: true, expiraEm: true, revogadoEm: true },
    });
    if (existing && existing.situacao !== "pendente") {
      throw new ActionError("Este aceite já foi respondido. Envie uma nova versão da entrega para solicitar outro aceite.");
    }
    if (existing && linkAceiteEstaAtivo(existing, agora)) return { token: existing.token };

    const token = randomBytes(24).toString("hex");
    const expiraEm = expiraAceiteEm(agora);
    const aceite = existing
      ? await prisma.aceiteCliente.update({
          where: { id: existing.id },
          data: {
            token,
            expiraEm,
            revogadoEm: null,
            respondidoEm: null,
            respondidoPor: null,
            respondidoIp: null,
            respondidoUserAgent: null,
            observacao: null,
          },
        })
      : await prisma.aceiteCliente.create({
          data: { uploadId: input.uploadId, token, expiraEm, geradoPorId: user.id },
        });
    await registrarEventoUploads({ uploadIds: [upload.id], tipo: "aceite_gerado", userId: user.id });
    revalidatePath(`/projetos/${upload.disciplina.projetoId}`);
    return { token: aceite.token };
  },
);

/** Revoga imediatamente um link público pendente. A geração posterior emite outro token. */
export const revogarAceiteCliente = defineAction(
  {
    modulo: "uploads",
    acao: "revogar-aceite-cliente",
    recurso: "uploads",
    permissao: "validar",
    entidade: "AceiteCliente",
    schema: revogarAceiteSchema,
    entidadeId: (d) => (d as { id: string }).id,
  },
  async (input, { user }) => {
    const upload = await prisma.upload.findUnique({
      where: { id: input.uploadId },
      select: {
        id: true,
        disciplina: { select: { projetoId: true, responsaveis: { select: { userId: true } } } },
        aceite: { select: { id: true, situacao: true, revogadoEm: true } },
      },
    });
    if (!upload) throw new ActionError("Entrega não encontrada.");
    await exigirEscopoArquivo(user, upload.disciplina);
    if (!upload.aceite) throw new ActionError("Não há link de aceite para esta entrega.");
    if (upload.aceite.situacao !== "pendente") {
      throw new ActionError("Só é possível revogar links de aceite ainda pendentes.");
    }
    if (upload.aceite.revogadoEm) return { id: upload.aceite.id, jaRevogado: true };

    await prisma.aceiteCliente.update({
      where: { id: upload.aceite.id },
      data: { revogadoEm: new Date() },
    });
    await registrarEventoUploads({ uploadIds: [upload.id], tipo: "aceite_revogado", userId: user.id });
    revalidatePath(`/projetos/${upload.disciplina.projetoId}`);
    return { id: upload.aceite.id, jaRevogado: false };
  },
);

// ── Histórico de revisões (F2-PR8) ─────────────────────────────

const historicoRevisoesSchema = z.object({ uploadId: z.string().min(1) });

/**
 * Leitura sob demanda do histórico de revisões (abre o drawer do menu "..." sem
 * recarregar a página). `historicoRevisoesDocumento` mora em `queries.ts`
 * (`server-only`, sem checagem de sessão) — este wrapper é o único jeito de chamá-la a
 * partir do menu (client component), com a mesma muralha por disciplina das demais
 * leituras de upload deste arquivo (`projetoVisivel` + responsável-ou-`ver_todas_disciplinas`).
 * `audit: false`: abrir um histórico é navegação, não uma ação de negócio — auditar
 * cada abertura seria ruído no log.
 */
export const carregarHistoricoRevisoes = defineAction(
  {
    modulo: "uploads",
    acao: "ver-historico-revisoes",
    recurso: "projetos",
    permissao: "ver",
    schema: historicoRevisoesSchema,
    audit: false,
  },
  async (input, { user }) => {
    const upload = await prisma.upload.findUnique({
      where: { id: input.uploadId },
      select: {
        disciplina: {
          select: { projetoId: true, responsaveis: { select: { userId: true } } },
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

    return historicoRevisoesDocumento(input.uploadId);
  },
);

// ── Metadados e status do documento lógico (F2-PR6c) ──────────────────────

const editarMetadadosDocumentoSchema = z.object({
  documentoId: z.string().min(1),
  titulo: z.string().trim().max(160, "O título pode ter no máximo 160 caracteres.").nullable(),
  descricao: z.string().trim().max(2_000, "A descrição pode ter no máximo 2.000 caracteres.").nullable(),
  faseId: z.string().min(1).nullable(),
});

const atualizarStatusDocumentoSchema = z.object({
  documentoId: z.string().min(1),
  statusId: z.string().min(1).nullable(),
});

type DisciplinaDoDocumento = { projetoId: string; responsaveis: { userId: string }[] };

/** A muralha de escrita é a mesma de Upload, mas o id público desta ação é o DocumentoDisciplina. */
async function exigirEscopoDocumento(user: SessionUser, disciplina: DisciplinaDoDocumento) {
  const [podeVerProjeto, projeto, veTodas] = await Promise.all([
    can(user, "projetos", "ver"),
    projetoVisivel(user, disciplina.projetoId),
    podeVerTodasDisciplinas(user),
  ]);
  if (!podeVerProjeto) throw new ActionError("Sem permissão para gerir documentos.");

  const naoEncontrado = new ActionError("Documento não encontrado.");
  if (!projeto) throw naoEncontrado;
  if (!responsavelOuVeTodas(user.id, veTodas, disciplina.responsaveis)) throw naoEncontrado;
}

async function carregarDocumentoEditavel(documentoId: string) {
  const documento = await prisma.documentoDisciplina.findUnique({
    where: { id: documentoId },
    select: {
      id: true,
      disciplinaId: true,
      substituidoPorId: true,
      disciplina: { select: { projetoId: true, responsaveis: { select: { userId: true } } } },
    },
  });
  if (!documento || documento.substituidoPorId) throw new ActionError("Documento não encontrado.");
  return documento;
}

export const editarMetadadosDocumento = defineAction(
  {
    modulo: "uploads",
    acao: "editar-metadados-documento",
    recurso: "arquivos",
    permissao: "editar_metadados",
    entidade: "DocumentoDisciplina",
    schema: editarMetadadosDocumentoSchema,
    entidadeId: (data) => (data as { documentoId: string }).documentoId,
    capturarAntes: (input) =>
      prisma.documentoDisciplina.findUnique({
        where: { id: input.documentoId },
        select: { titulo: true, descricao: true, faseId: true, disciplinaId: true },
      }),
  },
  async (input, { user }) => {
    const documento = await carregarDocumentoEditavel(input.documentoId);
    await exigirEscopoDocumento(user, documento.disciplina);

    const nomenclatura = await resolverNomenclatura(documento.disciplina.projetoId);
    if (nomenclatura.exigirFase && !input.faseId) {
      throw new ActionError("Selecione a fase do documento.");
    }

    let siglaNova: string | null = null;
    if (input.faseId) {
      const fase = await prisma.pranchaCatalogo.findFirst({
        where: {
          id: input.faseId,
          categoria: "fase",
          ativo: true,
          OR: [{ projetoId: null }, { projetoId: documento.disciplina.projetoId }],
        },
        select: { id: true, sigla: true },
      });
      if (!fase) throw new ActionError("A fase selecionada não está disponível para este projeto.");
      siglaNova = fase.sigla;
    }

    // Sigla, não id: o histórico precisa continuar legível se a fase sair do catálogo.
    const atual = await prisma.documentoDisciplina.findUnique({
      where: { id: documento.id },
      select: { titulo: true, descricao: true, fase: { select: { sigla: true } } },
    });
    await prisma.documentoDisciplina.update({
      where: { id: documento.id },
      data: {
        titulo: input.titulo || null,
        descricao: input.descricao || null,
        faseId: input.faseId,
      },
    });
    const campos = camposAlterados(
      { titulo: atual?.titulo, descricao: atual?.descricao, fase: atual?.fase?.sigla },
      { titulo: input.titulo, descricao: input.descricao, fase: siglaNova },
      ["titulo", "descricao", "fase"] as const,
    );
    if (Object.keys(campos).length > 0) {
      await registrarEventoDocumento({ documentoId: documento.id, tipo: "metadados", userId: user.id, detalhe: { campos } });
    }
    revalidarArquivos(documento.disciplina.projetoId);
    return { documentoId: documento.id };
  },
);

export const atualizarStatusDocumento = defineAction(
  {
    modulo: "uploads",
    acao: "atualizar-status-documento",
    recurso: "arquivos",
    permissao: "alterar_status",
    entidade: "DocumentoDisciplina",
    schema: atualizarStatusDocumentoSchema,
    entidadeId: (data) => (data as { documentoId: string }).documentoId,
    capturarAntes: (input) =>
      prisma.documentoDisciplina.findUnique({
        where: { id: input.documentoId },
        select: { statusId: true, disciplinaId: true },
      }),
  },
  async (input, { user }) => {
    const documento = await carregarDocumentoEditavel(input.documentoId);
    await exigirEscopoDocumento(user, documento.disciplina);

    let nomeNovo: string | null = null;
    if (input.statusId) {
      const status = await prisma.documentoStatus.findFirst({
        where: { id: input.statusId, ativo: true },
        select: { id: true, nome: true },
      });
      if (!status) throw new ActionError("O status selecionado não está ativo.");
      nomeNovo = status.nome;
    }

    const atual = await prisma.documentoDisciplina.findUnique({
      where: { id: documento.id },
      select: { status: { select: { nome: true } } },
    });
    await prisma.documentoDisciplina.update({
      where: { id: documento.id },
      data: { statusId: input.statusId },
    });
    const de = atual?.status?.nome ?? null;
    if (de !== nomeNovo) {
      await registrarEventoDocumento({
        documentoId: documento.id,
        tipo: "status",
        userId: user.id,
        detalhe: { de, para: nomeNovo },
      });
    }
    revalidarArquivos(documento.disciplina.projetoId);
    return { documentoId: documento.id };
  },
);

// ── Histórico do documento (alterações + acessos) ──────────────

/**
 * Linha do tempo do documento, sob demanda (abre com o painel de detalhe). Mesma muralha de
 * leitura de `carregarHistoricoRevisoes`. Acessos (quem baixou/visualizou) só entram com
 * `arquivos:ver_acessos` — é monitoramento de colegas, não metadado do documento.
 * `audit: false`: abrir o histórico é navegação.
 */
export const carregarHistoricoDocumento = defineAction(
  {
    modulo: "uploads",
    acao: "ver-historico-documento",
    recurso: "projetos",
    permissao: "ver",
    schema: z.object({ documentoId: z.string().min(1) }),
    audit: false,
  },
  async (input, { user }) => {
    const documento = await prisma.documentoDisciplina.findUnique({
      where: { id: input.documentoId },
      select: { id: true, disciplina: { select: { projetoId: true, responsaveis: { select: { userId: true } } } } },
    });
    const naoEncontrado = new ActionError("Documento não encontrado.");
    if (!documento) throw naoEncontrado;
    if (!(await projetoVisivel(user, documento.disciplina.projetoId))) throw naoEncontrado;
    const veTodas = await podeVerTodasDisciplinas(user);
    if (!responsavelOuVeTodas(user.id, veTodas, documento.disciplina.responsaveis)) throw naoEncontrado;

    const podeVerAcessos = await can(user, "arquivos", "ver_acessos");
    const { eventos, truncado } = await historicoDocumento(documento.id, { incluirAcessos: podeVerAcessos });
    return { eventos, truncado, podeVerAcessos };
  },
);
