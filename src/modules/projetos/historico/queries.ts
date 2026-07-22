import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Ações consideradas no histórico completo do projeto: documentos/arquivos (CDE)
 * E itens do projeto (disciplinas, equipe, ciclo de vida). Depende da padronização de
 * `entidadeId` nas actions (disciplinaId / projetoId / uploadId) para correlação sem FK.
 */
const ACOES_HISTORICO = [
  // ── Documentos / arquivos ──
  "enviar-arquivos",
  "validar-entrega",
  "validar-arquivo",
  "reverter-validacao-arquivo",
  "solicitar-ajuste-arquivo",
  "enviar-apontamentos",
  "gerar-aceite-cliente",
  "renomear-arquivo",
  "criar-prancha",
  "editar-prancha",
  "excluir-prancha",
  "importar-pranchas",
  // Repositório "Geral" antigo (ArquivoProjeto) — logs históricos.
  "criar-arquivo",
  "editar-arquivo",
  "excluir-arquivo",
  "excluir-arquivos-lote",
  "restaurar-arquivo",
  "excluir-arquivo-definitivo",
  "adicionar-versao-arquivo",
  // Repositório unificado `Documento` (Fase 5a: Geral + recebidos do cliente).
  "criar-documento",
  "editar-documento",
  "excluir-documento",
  "adicionar-versao-documento",
  // ── Itens do projeto (disciplinas, equipe, ciclo de vida) ──
  "criar-projeto",
  "editar-projeto",
  "cancelar-projeto",
  "criar-disciplina",
  "editar-disciplina",
  "excluir-disciplina",
  "editar-disciplinas-em-massa",
  "adicionar-disciplinas-catalogo",
  "atualizar-status-disciplina",
  "definir-responsaveis",
  "registrar-revisao",
  "definir-membros",
  // ── Inputs (aba Inputs) ──
  "adicionar-input",
  "remover-input",
  "responder-inputs",
  "salvar-briefing",
  "gerar-link-input",
  "aplicar-inputs-padrao",
  // ── Serviços terceirizados (aba Serviços) ──
  "criar-servico",
  "editar-servico",
  "excluir-servico",
  // ── Extras (revisão, composição, LM, linha de base, checklist, riscos) ──
  "solicitar-revisao",
  "responder-revisao",
  "salvar-composicao",
  "salvar-lm-config",
  "salvar-linha-base",
  "excluir-linha-base",
  "criar-checklist-item",
  "toggle-checklist-item",
  "excluir-checklist-item",
  "criar-risco-projeto",
  "atualizar-risco-projeto",
  "excluir-risco-projeto",
  // ── Diário (aba Diário) ──
  "criar-entrada-diario",
  "editar-entrada-diario",
  "excluir-entrada-diario",
  // ── Nomenclatura por projeto (modulo `configuracoes`) ──
  "salvar-nomenclatura-projeto",
  "limpar-nomenclatura-projeto",
  // ── Pendências / apontamentos (modulo `uploads`) ──
  "criar-pendencia",
  "editar-pendencia",
  "excluir-pendencia",
  "resolver-pendencia",
  "reabrir-pendencia",
  "fechar-pendencia",
  "descartar-pendencia",
  // ── Receita (aba Receita — inclui lançamentos financeiros do projeto) ──
  "definir-valor-contrato",
  "gerar-parcelas-projeto",
  "faturar-entrega",
  "limpar-parcelas-projeto",
];

/** Coleta ids de usuário referenciados no `detalhe` (responsáveis/membros) para resolver nomes. */
function coletarUsuariosDoDetalhe(detalhe: unknown, acc: Set<string>) {
  if (!detalhe || typeof detalhe !== "object") return;
  const d = detalhe as Record<string, unknown>;
  const bags = [d, d.antes, d.novo].filter(
    (b): b is Record<string, unknown> => !!b && typeof b === "object",
  );
  for (const bag of bags) {
    const ids = bag.responsaveisIds;
    if (Array.isArray(ids)) ids.forEach((x) => typeof x === "string" && acc.add(x));
    if (typeof bag.responsavelId === "string") acc.add(bag.responsavelId);
    const membros = bag.membros;
    if (Array.isArray(membros)) {
      for (const m of membros) {
        const uid = (m as { userId?: unknown })?.userId;
        if (typeof uid === "string") acc.add(uid);
      }
    }
  }
}

/**
 * Histórico completo de um projeto: eventos de AuditLog (documentos + itens) cujo
 * `entidadeId` cai no projeto (o próprio projeto, suas disciplinas, uploads e documentos).
 */
export async function historicoDocumentosProjeto(
  projetoId: string,
  opts?: { page?: number; take?: number },
) {
  const page = Math.max(1, opts?.page ?? 1);
  const take = opts?.take ?? 50;

  const [disciplinas, arquivos] = await Promise.all([
    prisma.disciplina.findMany({ where: { projetoId }, select: { id: true } }),
    // Geral = Documento(origem=interno) do projeto (Fase 5a); IDs preservados na
    // migração, então logs antigos (entidade ArquivoProjeto) ainda batem.
    prisma.documento.findMany({
      where: { projetoId, origem: "interno" },
      select: { id: true, versoes: { select: { id: true } } },
    }),
  ]);
  const disciplinaIds = disciplinas.map((d) => d.id);
  const uploads = disciplinaIds.length
    ? await prisma.upload.findMany({ where: { disciplinaId: { in: disciplinaIds } }, select: { id: true } })
    : [];

  const ids = [
    projetoId,
    ...disciplinaIds,
    ...uploads.map((u) => u.id),
    ...arquivos.map((a) => a.id),
    ...arquivos.flatMap((a) => a.versoes.map((v) => v.id)),
  ];

  const where: Prisma.AuditLogWhereInput = {
    // `configuracoes` = nomenclatura por projeto; `financeiro` = receita/parcelas do projeto.
    // A lista de `acao` (única por evento) mantém o escopo — só entram os eventos listados.
    modulo: { in: ["uploads", "projetos", "documentos_cliente", "configuracoes", "financeiro"] },
    acao: { in: ACOES_HISTORICO },
    entidadeId: { in: ids },
  };

  const [rows, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * take,
      take,
      select: {
        id: true,
        acao: true,
        modulo: true,
        resultado: true,
        entidade: true,
        detalhe: true,
        createdAt: true,
        userId: true,
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  // Resolve nomes: autores + usuários citados no detalhe (responsáveis/membros).
  const userIds = new Set<string>();
  for (const r of rows) {
    if (r.userId) userIds.add(r.userId);
    coletarUsuariosDoDetalhe(r.detalhe, userIds);
  }
  const users = userIds.size
    ? await prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true } })
    : [];
  const nomeUsuario = new Map(users.map((u) => [u.id, u.name]));

  return {
    total,
    page,
    take,
    pageCount: Math.max(1, Math.ceil(total / take)),
    /** id → nome de todos os usuários citados (autor + responsáveis/membros no detalhe). */
    nomes: Object.fromEntries(nomeUsuario) as Record<string, string>,
    itens: rows.map((r) => ({
      id: r.id,
      acao: r.acao,
      resultado: r.resultado,
      entidade: r.entidade,
      autor: r.userId ? (nomeUsuario.get(r.userId) ?? "—") : "sistema",
      quando: r.createdAt.toISOString(),
      detalhe: r.detalhe as Record<string, unknown> | null,
    })),
  };
}

export type HistoricoProjeto = Awaited<ReturnType<typeof historicoDocumentosProjeto>>;
export type HistoricoItem = HistoricoProjeto["itens"][number];
