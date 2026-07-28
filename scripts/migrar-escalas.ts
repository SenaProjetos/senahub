/**
 * Semeia a escala PADRÃO por perfil (`EscalaRole`).
 *
 * A lógica vive em `prisma/escalas-padrao.ts` e passou a rodar dentro do `npm run db:seed`
 * (passo 11) — este script continua existindo apenas para rodar a semeadura isolada, sem o
 * resto do seed. Antes a semeadura só existia aqui, e este arquivo não estava no
 * `package.json`: podia nunca ter rodado, e o estagiário ficava com 8h/dia nos dois cenários.
 *
 * NOTA: o backfill de `EscalaTrabalho.horasDia` → `EscalaUsuario` (seg–sex) que este script
 * fazia foi movido para dentro da migration de drop da F7 (`20260706150000_drop_escala_trabalho`),
 * rodando ANTES do DROP — assim um único `prisma migrate deploy` fica correto e à prova de ordem.
 *
 * Uso: npx tsx --tsconfig tsconfig.server.json scripts/migrar-escalas.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { semearEscalaRolePadrao } from "../prisma/escalas-padrao";

async function main() {
  await semearEscalaRolePadrao();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
