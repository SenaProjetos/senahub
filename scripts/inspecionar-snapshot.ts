import "dotenv/config";
import { Client } from "pg";

const u = new URL(process.env.DATABASE_URL!);
u.pathname = "/senahub_snapshot_prod";

async function main() {
  const c = new Client({ connectionString: u.toString() });
  await c.connect();

  const cols = await c.query<{ column_name: string }>(
    "SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY 1",
    ["user"],
  );
  const nomes = new Set(cols.rows.map((r) => r.column_name));
  const querem = [
    "cargo", "departamento", "salarioBase", "banco", "agencia", "conta", "tipoContaBancaria",
    "cpf", "rg", "dataAdmissao", "setor", "contratacao", "tipo", "vinculoAtivoId",
    "perfilId", "superUsuario", "nomeCompleto", "conselho", "enderecoCep",
  ];
  console.log('Colunas de "user" relevantes:');
  for (const q of querem) console.log(`   ${nomes.has(q) ? "OK  " : "FALTA"} ${q}`);
  console.log(`\nTotal de colunas em "user": ${nomes.size}`);

  const tabs = await c.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY 1",
    ["public"],
  );
  const tnomes = new Set(tabs.rows.map((r) => r.table_name));
  console.log(`\nTabelas no schema public: ${tnomes.size}`);
  for (const t of ["vinculo", "perfil_acesso", "dependente", "funcionario_documento", "holerite", "cargo", "departamento"]) {
    console.log(`   ${tnomes.has(t) ? "OK  " : "FALTA"} ${t}`);
  }

  const migs = await c.query<{ migration_name: string; finished_at: Date | null }>(
    "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC NULLS LAST LIMIT 8",
  );
  console.log("\nUltimas migrations aplicadas em PROD:");
  for (const m of migs.rows) {
    console.log(`   ${m.finished_at ? m.finished_at.toISOString().slice(0, 19) : "PENDENTE"}  ${m.migration_name}`);
  }
  const totalMigs = await c.query<{ n: number }>("SELECT count(*)::int AS n FROM _prisma_migrations");
  console.log(`   (total aplicadas: ${totalMigs.rows[0]!.n})`);

  const tot = await c.query<{ users: number }>('SELECT count(*)::int AS users FROM "user"');
  console.log(`\nUsuarios em prod: ${tot.rows[0]!.users}`);

  // Contagens dos campos do escopo, só para as colunas que existem.
  const alvo = ["cargo", "departamento", "salarioBase", "banco", "cpf", "dataAdmissao"].filter((x) => nomes.has(x));
  if (alvo.length > 0) {
    const sel = alvo.map((x) => `count("${x}")::int AS "${x}"`).join(", ");
    const r = await c.query(`SELECT ${sel} FROM "user"`);
    console.log("\nPreenchimento (nao-nulos):");
    for (const [k, v] of Object.entries(r.rows[0] as Record<string, number>)) console.log(`   ${k}: ${v}`);
  }

  if (nomes.has("cargo")) {
    const r = await c.query('SELECT cargo, count(*)::int AS n FROM "user" WHERE btrim(coalesce(cargo, \'\')) <> \'\' GROUP BY cargo ORDER BY n DESC');
    console.log(`\nValores distintos de user.cargo: ${r.rowCount}`);
    for (const row of r.rows as { cargo: string; n: number }[]) console.log(`   "${row.cargo}" (${row.n})`);
  }
  if (nomes.has("departamento")) {
    const r = await c.query('SELECT departamento, count(*)::int AS n FROM "user" WHERE btrim(coalesce(departamento, \'\')) <> \'\' GROUP BY departamento ORDER BY n DESC');
    console.log(`\nValores distintos de user.departamento: ${r.rowCount}`);
    for (const row of r.rows as { departamento: string; n: number }[]) console.log(`   "${row.departamento}" (${row.n})`);
  }
  if (tnomes.has("vinculo")) {
    const r = await c.query("SELECT count(*)::int AS total, count(cargo)::int AS com_cargo, count(remuneracao)::int AS com_remuneracao FROM vinculo");
    console.log(`\nVinculo: ${JSON.stringify(r.rows[0])}`);
  }

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
