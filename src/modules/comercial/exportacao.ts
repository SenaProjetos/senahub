import "server-only";
import { prisma } from "@/lib/prisma";
import { listarClientes, type ListarClientesOpts } from "@/modules/clientes/queries";
import { whereProspeccao, whereNegociacao, type FiltrosComerciais } from "@/modules/comercial/filtros";
import { COLUNAS_PROSPECCAO } from "@/modules/comercial/prospeccao";
import { WHERE_PODE_ABORDAR } from "@/modules/comercial/lgpd";

/**
 * Consultas do export CSV do Comercial (F4.6) — separadas das rotas (`api/comercial/export/*`)
 * pelo mesmo motivo de `modules/comercial/importacao/commit.ts`: uma rota `"use server"`-like
 * (aqui, autenticação de `route.ts`) não é chamável direto por smoke/script. Cada função aqui é
 * só Prisma — sem CSV, sem `Request`/`NextResponse` — pra ser testável sem sessão.
 */

// ── Empresas ──────────────────────────────────────────────────────────────
export function empresasParaExport(opts: ListarClientesOpts) {
  return listarClientes(opts);
}

// ── Contatos — "lista de abordagem" escopada aos filtros de prospecção ─────
/**
 * `WHERE_PODE_ABORDAR` é filtro de BANCO — um contato com `optOut: true` nunca é lido pra
 * esta resposta, não só omitido dela depois. Ver docblock de `WHERE_PODE_ABORDAR` em `lgpd.ts`.
 *
 * **Risco conhecido, não corrigido aqui:** sem dedup por e-mail. A mesma pessoa cadastrada
 * como `ContatoCliente` em duas empresas diferentes (o cenário que a F4.5 documentou como
 * "dedup é responsabilidade da UI/importação, não da service") sai como 2 linhas — mesmo
 * risco, mesma decisão de design, só que do lado do EXPORT em vez do lado do IMPORT. Se um
 * disparo de e-mail em massa a partir deste CSV virar rotina, isto precisa de um
 * `Map` por e-mail normalizado antes de devolver.
 */
export function contatosParaExport(filtros: FiltrosComerciais, agora: Date) {
  return prisma.contatoCliente.findMany({
    where: {
      ...WHERE_PODE_ABORDAR,
      leads: { some: { lead: { arquivado: false, ...whereProspeccao(filtros, agora) } } },
    },
    orderBy: { nome: "asc" },
    select: { nome: true, cargo: true, email: true, telefone: true, cliente: { select: { nome: true } } },
  });
}

// ── Prospecções ──────────────────────────────────────────────────────────
/**
 * "Contato principal" é leitura ANINHADA (`LeadContato` → `contato`) — por isso o
 * `where: WHERE_PODE_ABORDAR` no INCLUDE, e não só no export de contatos: sem ele, um contato
 * que pediu descadastro continuaria aparecendo aqui, numa coluna que ninguém revisaria de novo
 * pra LGPD.
 */
export function prospeccoesParaExport(filtros: FiltrosComerciais, agora: Date) {
  return prisma.lead.findMany({
    where: { status: { in: [...COLUNAS_PROSPECCAO] }, arquivado: false, ...whereProspeccao(filtros, agora) },
    orderBy: { updatedAt: "desc" },
    select: {
      nome: true,
      status: true,
      temperatura: true,
      valorEstimado: true,
      createdAt: true,
      cliente: { select: { nome: true } },
      responsavel: { select: { name: true } },
      campanha: { select: { nome: true } },
      contatos: {
        where: { contato: WHERE_PODE_ABORDAR },
        orderBy: { principal: "desc" },
        take: 1,
        select: { contato: { select: { nome: true, email: true } } },
      },
    },
  });
}

// ── Negociações ──────────────────────────────────────────────────────────
export function negociacoesParaExport(filtros: FiltrosComerciais, agora: Date) {
  return prisma.negociacao.findMany({
    where: whereNegociacao(filtros, agora),
    orderBy: { updatedAt: "desc" },
    select: {
      titulo: true,
      estagio: true,
      temperatura: true,
      valorEstimado: true,
      valorProposto: true,
      valorNegociado: true,
      createdAt: true,
      cliente: { select: { nome: true } },
      responsavel: { select: { name: true } },
      campanha: { select: { nome: true } },
      contatos: {
        where: { contato: WHERE_PODE_ABORDAR },
        orderBy: { principal: "desc" },
        take: 1,
        select: { contato: { select: { nome: true, email: true } } },
      },
    },
  });
}
