/**
 * Semeia a escala PADRÃO por role (`EscalaRole`) para clt/estagiario
 * (08:00–17:00, almoço 12:00–13:00) — dá aos alertas de jornada (F6) um horário
 * concreto para comparar. Idempotente: não sobrescreve linhas já existentes.
 *
 * NOTA: o backfill de `EscalaTrabalho.horasDia` → `EscalaUsuario` (seg–sex) que
 * este script fazia foi movido para dentro da migration de drop da F7
 * (`20260706150000_drop_escala_trabalho`), rodando ANTES do DROP — assim um único
 * `prisma migrate deploy` fica correto e à prova de ordem, sem depender de rodar
 * este script no momento certo. Só a semeadura de EscalaRole permanece aqui.
 *
 * Uso: npx tsx --tsconfig tsconfig.server.json scripts/migrar-escalas.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const DIAS_UTEIS = [1, 2, 3, 4, 5]; // segunda..sexta

async function semearEscalaRolePadrao() {
  const roles: Array<"clt" | "estagiario"> = ["clt", "estagiario"];
  let criadas = 0;
  for (const role of roles) {
    for (const diaSemana of DIAS_UTEIS) {
      const existe = await prisma.escalaRole.findUnique({
        where: { role_diaSemana: { role, diaSemana } },
      });
      if (existe) continue;
      await prisma.escalaRole.create({
        data: {
          role,
          diaSemana,
          entrada: "08:00",
          saida: "17:00",
          descansos: [{ inicio: "12:00", fim: "13:00" }],
          horasDia: 8,
          toleranciaMin: 10,
        },
      });
      criadas++;
    }
  }
  console.log(`✔ EscalaRole: ${criadas} linha(s) padrão criada(s) para clt/estagiario (não sobrescreve existentes).`);
}

async function main() {
  await semearEscalaRolePadrao();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
