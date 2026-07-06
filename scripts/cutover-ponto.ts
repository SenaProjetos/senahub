/**
 * Cutover do Ponto v2 (rodar no deploy da F3, fora do expediente).
 *
 * Toda SessaoTrabalho ABERTA (fim=null) representa uma jornada em andamento no
 * modelo antigo (cronômetro). Para o modelo de batidas, criamos retroativamente
 * a batida `entrada` correspondente (origem `migracao`) no instante em que a
 * sessão começou, SEM fechar a sessão — a jornada continua sem perda: o usuário
 * segue direto para descanso/saída pelo novo /ponto.
 *
 * Idempotente: se já existe uma batida `entrada` para aquele usuário/dia no
 * horário da sessão, não duplica.
 *
 * Uso: npx tsx --tsconfig tsconfig.server.json scripts/cutover-ponto.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { diaLocalDate } from "../src/modules/ponto/engine";

async function main() {
  const abertas = await prisma.sessaoTrabalho.findMany({
    where: { fim: null },
    orderBy: { inicio: "asc" },
  });

  let criadas = 0;
  let jaExistiam = 0;

  for (const s of abertas) {
    const dia = diaLocalDate(s.inicio);
    // Evita duplicar se o cutover já rodou (ou se a jornada já nasceu com batida).
    const existente = await prisma.batida.findFirst({
      where: { userId: s.userId, dia, tipo: "entrada", horario: s.inicio },
      select: { id: true },
    });
    if (existente) {
      jaExistiam++;
      continue;
    }
    await prisma.batida.create({
      data: {
        userId: s.userId,
        dia,
        tipo: "entrada",
        horario: s.inicio,
        projetoId: s.projetoId,
        origem: "migracao",
      },
    });
    criadas++;
  }

  console.log(
    `✔ Cutover ponto: ${abertas.length} sessão(ões) aberta(s) · ${criadas} batida(s) entrada criada(s) · ${jaExistiam} já existia(m).`,
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
