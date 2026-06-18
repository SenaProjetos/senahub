import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, Prisma } from '@/generated/prisma/client'

/**
 * Soft delete de Lancamento: injeta `excluidoEm: null` em todas as LEITURAS
 * (findMany/findFirst/count/aggregate/groupBy) para que registros excluídos sumam
 * de listagens e relatórios em todo o sistema. Mutations e findUnique não são afetados
 * (operam por id; necessários p/ snapshot/restore). Quem quiser ver os excluídos pode
 * passar `excluidoEm` explicitamente no where.
 */
const softDeleteLancamento = Prisma.defineExtension({
  name: 'softDeleteLancamento',
  query: {
    lancamento: {
      async $allOperations({ operation, args, query }) {
        const LEITURA = ['findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy']
        if (LEITURA.includes(operation)) {
          const a = (args ?? {}) as { where?: Record<string, unknown> }
          a.where = { ...(a.where ?? {}), excluidoEm: a.where?.excluidoEm ?? null }
          return query(a as typeof args)
        }
        return query(args)
      },
    },
  },
})

function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  // A extensão só intercepta queries (não adiciona API nova), então o tipo público
  // segue sendo PrismaClient — mantém o filtro em runtime sem mudar assinaturas no resto do app.
  return new PrismaClient({ adapter }).$extends(softDeleteLancamento) as unknown as PrismaClient
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
