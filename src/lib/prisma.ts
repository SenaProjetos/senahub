import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, Prisma } from '@/generated/prisma/client'

/**
 * Soft delete: injeta `excluidoEm: null` em todas as LEITURAS TOP-LEVEL
 * (findMany/findFirst/count/aggregate/groupBy) para que registros excluídos sumam
 * de listagens e relatórios em todo o sistema. Mutations e findUnique não são afetados
 * (operam por id; necessários p/ snapshot/restore).
 *
 * ATENÇÃO: extensões de query só interceptam operações TOP-LEVEL (`prisma.upload.*`).
 * Leituras ANINHADAS por relação (ex.: `disciplina.findMany({ select: { uploads } })`)
 * NÃO passam por aqui — nelas o filtro `excluidoEm: null` precisa ser explícito.
 *
 * - `lancamento`: excluídos somem de financeiro/relatórios.
 * - `upload`: lixeira do projeto (arquivos de disciplina) — some das listagens/downloads.
 * - `cliente`: some das listagens/selects, mas continua resolvendo onde é referenciado (F1.17).
 *
 * ── COMO VER OS EXCLUÍDOS ───────────────────────────────────────────────────
 * Passe `excluidoEm` explicitamente no `where`. As formas foram VERIFICADAS contra o banco
 * (não são inferência), porque o resultado é contra-intuitivo:
 *
 *   excluidoEm: { not: undefined }   → vê TODOS (excluídos + ativos)   ✅ é o escape hatch
 *   excluidoEm: { not: null }        → vê SÓ os excluídos
 *   excluidoEm: undefined            → NÃO funciona: o `??` abaixo converte para null
 *   OR: [{excluidoEm: null}, ...]    → NÃO funciona: o `where.excluidoEm` injetado é AND-ado
 *                                       com o OR, e o resultado continua sendo "IS NULL"
 */
const LEITURA = ['findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy']

/**
 * Lookup keyed SÓ por id (`{ id }` ou `{ id: { in: [...] } }`) não é listagem — é um
 * `findUnique` em lote, tipicamente para resolver o nome de algo já referenciado em outro
 * registro. Filtrar aqui faria o nome sumir de documento/lançamento histórico cujo cliente foi
 * excluído, e quebraria o índice de deduplicação da importação financeira (que precisa
 * enxergar o excluído justamente para NÃO criar uma duplicata dele).
 */
function ehLookupPorId(where: Record<string, unknown> | undefined): boolean {
  if (!where) return false
  const chaves = Object.keys(where)
  return chaves.length === 1 && chaves[0] === 'id'
}

function filtroSoftDelete({ operation, args, query }: { operation: string; args: unknown; query: (a: unknown) => unknown }) {
  if (LEITURA.includes(operation)) {
    const a = (args ?? {}) as { where?: Record<string, unknown> }
    if (ehLookupPorId(a.where)) return query(a)
    a.where = { ...(a.where ?? {}), excluidoEm: a.where?.excluidoEm ?? null }
    return query(a)
  }
  return query(args)
}

const softDelete = Prisma.defineExtension({
  name: 'softDelete',
  query: {
    lancamento: { async $allOperations(ctx) { return filtroSoftDelete(ctx as never) } },
    upload: { async $allOperations(ctx) { return filtroSoftDelete(ctx as never) } },
    cliente: { async $allOperations(ctx) { return filtroSoftDelete(ctx as never) } },
  },
})

function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  // A extensão só intercepta queries (não adiciona API nova), então o tipo público
  // segue sendo PrismaClient — mantém o filtro em runtime sem mudar assinaturas no resto do app.
  return new PrismaClient({ adapter }).$extends(softDelete) as unknown as PrismaClient
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
