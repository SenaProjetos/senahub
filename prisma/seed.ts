import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { auth } from "../src/lib/auth";

const ADMIN_EMAIL = "tadrio@senaprojetos.com.br";
const ADMIN_NAME = "Tádrio";
const ADMIN_SENHA_INICIAL = "SenaHub@2026";

/**
 * Matriz base de permissões finas (recurso:ação) por perfil.
 * admin tem bypass total no código — não precisa estar aqui.
 */
const PERMISSOES_BASE: { role: string; recurso: string; acao: string }[] = [
  // Supervisor: gestão ampla
  { role: "supervisor", recurso: "usuarios", acao: "gerir" },
  { role: "supervisor", recurso: "configuracoes", acao: "gerir" },
  // Administrativo: configurações e usuários
  { role: "administrativo", recurso: "usuarios", acao: "gerir" },
  { role: "administrativo", recurso: "configuracoes", acao: "gerir" },
];

async function main() {
  // 1) Admin
  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });

  if (!existing) {
    const ctx = await auth.$context;
    const hash = await ctx.password.hash(ADMIN_SENHA_INICIAL);

    const user = await prisma.user.create({
      data: {
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
        emailVerified: true,
        role: "admin",
        ativo: true,
        mustChangePassword: true,
      },
    });

    await prisma.account.create({
      data: {
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: hash,
      },
    });

    console.log(`✔ Admin criado: ${ADMIN_EMAIL} (senha inicial: ${ADMIN_SENHA_INICIAL}, troca obrigatória)`);
  } else {
    console.log(`• Admin já existe: ${ADMIN_EMAIL}`);
  }

  // 2) Permissões base
  for (const p of PERMISSOES_BASE) {
    await prisma.permissao.upsert({
      where: { role_recurso_acao: { role: p.role as never, recurso: p.recurso, acao: p.acao } },
      create: { role: p.role as never, recurso: p.recurso, acao: p.acao, permitido: true },
      update: {},
    });
  }
  console.log(`✔ ${PERMISSOES_BASE.length} permissões base garantidas.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
