/**
 * Fixture das 6 grafias de `Disciplina` que existem em PRODUÇÃO e o `seed:demo` NÃO cria.
 *
 * Existe porque sem ela o dev só exercita o caminho feliz: as 34 disciplinas do `seed:demo`
 * batem todas exato com o catálogo, então `scripts/backfill-disciplina-f119c.ts` resolvia 34/34
 * e o ramo "sem match exato" — que é justamente o que a F1.21 vai tratar à mão — nunca rodava.
 * Testar só contra o dev daria verde sem provar nada.
 *
 * As 6 são as de `docs/crm/03-migracao.md` §5: 3 que colapsam por decisão já tomada
 * (`Ar condicionado (ARC)`/`Exaustão (EXT)` → `Climatização (AVAC)`, `Gases` → `Gás`) e 3
 * strings compostas que exigem o responsável de cada projeto.
 *
 * SÓ PARA DEV. Escreve direto por SQL (`disciplinaTextoLegado` é `@map("nome")`) com ids fixos
 * `fixf119c*`, então rodar de novo não duplica.
 *
 *   tsx --tsconfig tsconfig.server.json scripts/fixture-disciplinas-f121.ts
 *   tsx --tsconfig tsconfig.server.json scripts/fixture-disciplinas-f121.ts --limpar
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const GRAFIAS = [
  "Ar condicionado (ARC)",
  "Exaustão (EXT)",
  "Gases",
  "Lógica/cftv",
  "Lógica e Cftv",
  "Dados/Voz, Automação e CFTV",
];

async function main() {
  const limpar = process.argv.includes("--limpar");
  const projetos = await prisma.projeto.findMany({ select: { id: true, codigo: true }, take: 3, orderBy: { codigo: "asc" } });
  if (projetos.length === 0) throw new Error("Sem projeto no dev.");

  if (limpar) {
    const r = await prisma.$executeRaw`DELETE FROM disciplina WHERE nome = ANY(${GRAFIAS})`;
    console.log(`Removidas ${r} disciplina(s) de fixture.`);
    return;
  }

  for (const [i, nome] of GRAFIAS.entries()) {
    const p = projetos[i % projetos.length];
    const ja = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM disciplina WHERE nome = ${nome}`;
    if (ja[0].n > 0) {
      console.log(`  já existe: "${nome}"`);
      continue;
    }
    await prisma.$executeRaw`
      INSERT INTO disciplina (id, "projetoId", nome, status, ordem, "exigePacoteA", "exigePacoteB", "createdAt", "updatedAt")
      VALUES (${`fixf119c${i}`}, ${p.id}, ${nome}, 'aguardando', 99, true, true, NOW(), NOW())
    `;
    console.log(`  criada: "${nome}" em ${p.codigo}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
