/**
 * Reseta a senha do admin para a senha inicial padrão e marca troca obrigatória.
 * Usa o mesmo hash do better-auth do seed, garantindo que o login valide.
 * O seed só define a senha ao CRIAR o admin; este script reaplica num admin já existente.
 *
 * Uso: npm run admin:reset-senha
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { auth } from "../src/lib/auth";

const ADMIN_EMAIL = "tadrio@senaprojetos.com.br";
const SENHA_PADRAO = "SenaHub@2026";

async function main() {
  const user = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!user) throw new Error(`Admin ${ADMIN_EMAIL} não encontrado. Rode o seed primeiro.`);

  const ctx = await auth.$context;
  const hash = await ctx.password.hash(SENHA_PADRAO);

  const conta = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
  });

  if (conta) {
    await prisma.account.update({ where: { id: conta.id }, data: { password: hash } });
  } else {
    await prisma.account.create({
      data: { userId: user.id, providerId: "credential", accountId: user.id, password: hash },
    });
  }

  await prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });

  console.log(`✔ Senha do admin resetada para "${SENHA_PADRAO}" (troca obrigatória no 1º login).`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
