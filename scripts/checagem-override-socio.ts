import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
    const overrides = await prisma.permissaoUsuario.findMany({
        where: { userId: "cmr5ad70z01g2ywnucot87wlo" },
        select: { recurso: true, acao: true, motivo: true, criadoEm: true },
    });
    console.log(overrides);
}
main().finally(() => prisma.$disconnect());
