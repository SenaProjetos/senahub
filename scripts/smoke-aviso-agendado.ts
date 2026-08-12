/**
 * Smoke do aviso agendado contra o banco de dev. Exercita o que lint/tsc/vitest não
 * alcançam: o job `dispararAvisosAgendados` só roda sob `dev:server`/prod, e é
 * justamente ali que mora o risco — reenviar um modal bloqueante para a empresa
 * inteira porque um segundo tick pegou o mesmo aviso.
 *
 * Verifica: nenhum destinatário antes da hora (o modal não vaza), disparo marca
 * `enviadoEm` e cria os destinatários, um segundo tick não duplica e um aviso
 * cancelado nunca sai. Cria avisos throwaway e apaga tudo no final.
 *
 * Uso: tsx --tsconfig tsconfig.server.json scripts/smoke-aviso-agendado.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { dispararAvisosAgendados } from "../src/lib/jobs-handlers";

async function main() {
  const tag = `SMKAVI_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}`);
    if (!cond) ok = false;
  };

  const autor = await prisma.user.findFirst({ where: { role: "admin", ativo: true } });
  if (!autor) throw new Error("Sem usuário admin no banco de dev — rode `npm run db:seed`.");

  const alvos = await prisma.user.findMany({
    where: { ativo: true, role: { not: "cliente" }, id: { not: autor.id } },
    select: { id: true },
    take: 3,
  });
  check(`alvos disponíveis (${alvos.length})`, alvos.length > 0);

  const dadosBase = {
    criadoPorId: autor.id,
    alvoTipo: "usuarios" as const,
    alvoUserIds: alvos.map((a) => a.id),
    agendadoPara: new Date(Date.now() - 60_000), // hora já passou → o tick deve pegar
  };

  const aviso = await prisma.aviso.create({
    data: { ...dadosBase, titulo: `${tag}_agendado`, corpo: "smoke" },
  });
  const cancelado = await prisma.aviso.create({
    data: { ...dadosBase, titulo: `${tag}_cancelado`, canceladoEm: new Date() },
  });

  check(
    "antes do disparo não existe destinatário (modal não vaza)",
    (await prisma.avisoDestinatario.count({ where: { avisoId: aviso.id } })) === 0,
  );

  check("primeiro tick disparou", (await dispararAvisosAgendados()) >= 1);

  const depois = await prisma.aviso.findUniqueOrThrow({
    where: { id: aviso.id },
    include: { _count: { select: { destinatarios: true } } },
  });
  check("enviadoEm marcado", !!depois.enviadoEm);
  check(
    `destinatários criados no disparo (${depois._count.destinatarios} de ${alvos.length})`,
    depois._count.destinatarios === alvos.length,
  );

  await dispararAvisosAgendados();
  check(
    "segundo tick não duplica destinatários",
    (await prisma.avisoDestinatario.count({ where: { avisoId: aviso.id } })) === alvos.length,
  );

  const c = await prisma.aviso.findUniqueOrThrow({
    where: { id: cancelado.id },
    include: { _count: { select: { destinatarios: true } } },
  });
  check("aviso cancelado continua sem envio", !c.enviadoEm && c._count.destinatarios === 0);

  // Limpeza (destinatários caem por cascata; as notificações do sino não).
  await prisma.notificacao.deleteMany({ where: { titulo: { startsWith: tag } } });
  await prisma.aviso.deleteMany({ where: { titulo: { startsWith: tag } } });

  console.log(ok ? "\nSmoke do aviso agendado: OK" : "\nSmoke do aviso agendado: FALHOU");
  if (!ok) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
