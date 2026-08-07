/**
 * Carga SIMULADA de `cargo`/`departamento` no banco de DEV — produção não tem esses campos
 * preenchidos, então o dry-run da 2.0 e o backfill da 2.1 só se provam com dados fabricados.
 *
 * Os valores são de propósito "sujos", reproduzindo o que um cadastro de texto livre produz:
 * mesma função escrita em caixas diferentes, acento inconsistente, dois cargos num campo só e
 * departamento que na verdade é um setor. Isso exercita o canonizador
 * (`modules/rh/catalogos/canonizar.ts`) e as ambiguidades que devem BLOQUEAR a migração.
 *
 * Nada sensível: só cargo e departamento. Não escreve CPF, salário nem dados bancários.
 *
 * Uso:
 *   tsx --tsconfig tsconfig.server.json scripts/seed-cargos-dev.ts            # dry-run, não grava
 *   tsx --tsconfig tsconfig.server.json scripts/seed-cargos-dev.ts --gravar   # grava
 *   tsx --tsconfig tsconfig.server.json scripts/seed-cargos-dev.ts --limpar --gravar  # desfaz
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

/** Bancos onde este script pode escrever. Evita apontar o .env pra produção sem querer. */
const BANCOS_PERMITIDOS = ["senahub_remake", "senahub_dev"];

/**
 * Quem recebe o quê. A chave é `User.name` do dataset de demo — quem não estiver aqui fica
 * intocado. `vinculoCargo` diverge de propósito em um caso, para o relatório da 2.0 mostrar a
 * seção "só em vinculo.cargo".
 */
const CARGA: Record<string, { cargo: string; departamento: string; vinculoCargo?: string }> = {
  // Duas grafias da MESMA função: o canonizador tem de unificar em "Projetista" / "Projetos".
  "Ana Silva": { cargo: "Projetista", departamento: "Projetos" },
  "Bruno Costa": { cargo: "PROJETISTA", departamento: "projetos" },
  // Acento inconsistente no departamento: "Orçamentos" vs "Orcamentos".
  "Carla Dias": {
    cargo: "Engenheira Civil",
    departamento: "Orçamentos",
    vinculoCargo: "Engenheira Civil Pleno", // diverge do User.cargo de propósito
  },
  "Diego Melo": { cargo: "Estagiário de Engenharia", departamento: "Orcamentos" },
  // AMBÍGUO: dois cargos espremidos num campo só.
  "Elis Rocha": { cargo: "Projetista / Fiscal de Obra", departamento: "Projetos" },
  // AMBÍGUO: "Engenharia" é SETOR, não departamento.
  "Helena Marques": { cargo: "Sócia Diretora", departamento: "Engenharia" },
  "Paulo Ramos": { cargo: "Analista Administrativo", departamento: "Financeiro" },
  // AMBÍGUO: "TI" é setor E tem menos de 3 caracteres.
  Tadrioo: { cargo: "Diretor de TI", departamento: "TI" },
};

async function main() {
  const args = process.argv.slice(2);
  const gravar = args.includes("--gravar");
  const limpar = args.includes("--limpar");

  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  console.log(`Banco alvo: ${db}`);
  if (!BANCOS_PERMITIDOS.includes(db)) {
    console.error(`ABORTADO: "${db}" não está na lista de bancos de dev (${BANCOS_PERMITIDOS.join(", ")}).`);
    await prisma.$disconnect();
    process.exit(1);
  }

  if (limpar) {
    console.log(gravar ? "Limpando cargo/departamento simulados…" : "[dry-run] limparia cargo/departamento de:");
    const alvos = await prisma.user.findMany({
      where: { name: { in: Object.keys(CARGA) } },
      select: { id: true, name: true },
    });
    for (const u of alvos) console.log(`   ${u.name}`);
    if (gravar) {
      await prisma.user.updateMany({
        where: { id: { in: alvos.map((u) => u.id) } },
        data: { cargo: null, departamento: null },
      });
      await prisma.vinculo.updateMany({
        where: { userId: { in: alvos.map((u) => u.id) } },
        data: { cargo: null },
      });
      console.log(`\n${alvos.length} pessoa(s) limpa(s).`);
    } else {
      console.log("\nNada gravado. Repita com --gravar.");
    }
    await prisma.$disconnect();
    return;
  }

  const usuarios = await prisma.user.findMany({
    where: { name: { in: Object.keys(CARGA) } },
    select: { id: true, name: true, cargo: true, departamento: true, vinculoAtivoId: true },
  });

  const ausentes = Object.keys(CARGA).filter((n) => !usuarios.some((u) => u.name === n));
  if (ausentes.length > 0) {
    console.log(`\nAviso: não encontrados neste banco (serão ignorados): ${ausentes.join(", ")}`);
  }

  console.log(gravar ? "\nGravando:" : "\n[dry-run] gravaria:");
  let n = 0;
  for (const u of usuarios) {
    const c = CARGA[u.name]!;
    const jaTinha = u.cargo != null || u.departamento != null;
    const nota = jaTinha ? "  (SOBRESCREVE valor existente)" : "";
    const vinc = c.vinculoCargo ?? c.cargo;
    console.log(`   ${u.name.padEnd(18)} cargo="${c.cargo}"  depto="${c.departamento}"  vinculo.cargo="${vinc}"${nota}`);
    if (gravar) {
      await prisma.user.update({
        where: { id: u.id },
        data: { cargo: c.cargo, departamento: c.departamento },
      });
      if (u.vinculoAtivoId) {
        await prisma.vinculo.update({ where: { id: u.vinculoAtivoId }, data: { cargo: vinc } });
      }
      n++;
    }
  }

  if (gravar) {
    console.log(`\n${n} pessoa(s) atualizada(s). Agora rode:`);
    console.log("   tsx --tsconfig tsconfig.server.json scripts/dry-run-cargos.ts");
    console.log("Esperado: 3 valores AMBÍGUOS e 2 grupos de grafias unificadas.");
  } else {
    console.log("\nNada gravado. Repita com --gravar.");
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
