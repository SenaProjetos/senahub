import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, Prisma } from '@/generated/prisma/client'

/**
 * Soft delete: injeta `excluidoEm: null` em todas as LEITURAS TOP-LEVEL
 * (findMany/findFirst/count/aggregate/groupBy) para que registros excluídos sumam
 * de listagens e relatórios em todo o sistema. Mutations e findUnique não são afetados
 * (operam por id; necessários p/ snapshot/restore). Quem quiser ver os excluídos pode
 * passar `excluidoEm` explicitamente no where.
 *
 * ATENÇÃO: extensões de query só interceptam operações TOP-LEVEL (`prisma.upload.*`).
 * Leituras ANINHADAS por relação (ex.: `disciplina.findMany({ select: { uploads } })`)
 * NÃO passam por aqui — nelas o filtro `excluidoEm: null` precisa ser explícito.
 *
 * - `lancamento`: excluídos somem de financeiro/relatórios.
 * - `upload`: lixeira do projeto (arquivos de disciplina) — some das listagens/downloads.
 */
const LEITURA = ['findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy']

function filtroSoftDelete({ operation, args, query }: { operation: string; args: unknown; query: (a: unknown) => unknown }) {
  if (LEITURA.includes(operation)) {
    const a = (args ?? {}) as { where?: Record<string, unknown> }
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
