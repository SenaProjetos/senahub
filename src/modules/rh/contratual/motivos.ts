/**
 * Motivos de alteração contratual — **client-safe**: sem `server-only`, sem Prisma. Componentes
 * client (`alteracao-contratual-dialog.tsx`) importam daqui; `service.ts`/`actions.ts` também,
 * para não haver duas listas. Mesmo padrão de `modules/usuarios/vinculo/labels.ts`.
 *
 * Isolado em arquivo próprio porque `service.ts` importa `Prisma` do client gerado — se um
 * componente client importasse os motivos de lá, o bundler arrastaria o Prisma Client inteiro
 * para o navegador (o build falha com "chunking context does not support external modules").
 */
export const MOTIVOS_CONTRATUAIS = [
  "admissao",
  "reajuste",
  "promocao",
  "transferencia",
  "correcao",
  "carga_inicial",
] as const;
export type MotivoContratual = (typeof MOTIVOS_CONTRATUAIS)[number];

export const MOTIVO_LABELS: Record<MotivoContratual, string> = {
  admissao: "Admissão",
  reajuste: "Reajuste",
  promocao: "Promoção",
  transferencia: "Transferência",
  correcao: "Correção",
  carga_inicial: "Carga inicial",
};
