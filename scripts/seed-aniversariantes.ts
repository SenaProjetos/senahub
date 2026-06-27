/**
 * Dados FICTÍCIOS de aniversariantes (dev only) para visualizar o herocard:
 * define `dataNascimento` em alguns colaboradores ativos (não-clientes) —
 * 2 fazendo aniversário HOJE e os demais espalhados no mês corrente.
 *
 * Idempotente (só faz update de dataNascimento/cargo). Rode com:
 *   npx tsx --tsconfig tsconfig.server.json scripts/seed-aniversariantes.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const hoje = new Date();
  const mes = hoje.getMonth(); // 0-based
  const dia = hoje.getDate();

  const users = await prisma.user.findMany({
    where: { ativo: true, role: { not: "cliente" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 8,
  });
  if (users.length === 0) {
    throw new Error("Nenhum colaborador ativo (não-cliente) encontrado. Rode o seed primeiro.");
  }

  // Dias do mês para os "do mês" (evita o dia de hoje, p/ não duplicar com os do dia).
  const diasMes = [2, 6, 11, 15, 20, 24, 28].filter((d) => d !== dia);

  let doDia = 0;
  let doMes = 0;
  for (let i = 0; i < users.length; i++) {
    const ano = 1985 + (i % 12);
    const ehHoje = i < 2; // 2 aniversariantes HOJE
    const d = ehHoje ? dia : diasMes[(i - 2) % diasMes.length];
    if (ehHoje) doDia++;
    else doMes++;
    // @db.Date é UTC à meia-noite — a query usa getUTC* p/ não deslocar o dia por fuso.
    const nasc = new Date(Date.UTC(ano, mes, d));
    await prisma.user.update({
      where: { id: users[i].id },
      data: { dataNascimento: nasc },
    });
    console.log(
      `  ${users[i].name.padEnd(28)} ${String(d).padStart(2, "0")}/${String(mes + 1).padStart(2, "0")}/${ano}${ehHoje ? "  ← HOJE" : ""}`,
    );
  }
  console.log(`\n✓ ${doDia} aniversariante(s) hoje + ${doMes} no mês (de ${users.length} colaboradores).`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
