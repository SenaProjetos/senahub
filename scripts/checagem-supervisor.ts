import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
    const supervisores = await prisma.user.findMany({
        where: { role: "supervisor", ativo: true },
        select: { id: true, name: true, email: true },
    });
    console.log(supervisores);
}
main().finally(() => prisma.$disconnect());
