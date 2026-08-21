import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
    const perfis = await prisma.perfilAcesso.count();
    const comPerfil = await prisma.user.count({ where: { perfilId: { not: null } } });
    const superUsuarios = await prisma.user.count({ where: { superUsuario: true } });
    const escalas = await prisma.escalaUsuario.count();
    const internosAtivos = await prisma.user.count({ where: { ativo: true, tipo: "interno" } });

    console.log({ perfis, comPerfil, superUsuarios, escalas, internosAtivos });
}

main().finally(() => prisma.$disconnect());