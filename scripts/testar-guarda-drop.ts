/**
 * Testa a GUARDA da migration `20260805140000_drop_bancarios_user` — o bloco que aborta o
 * `DROP COLUMN` quando existe pessoa com dado bancário sem conta correspondente.
 *
 * Guarda que nunca dispara não está verificada: aqui ela é exercitada nos dois sentidos, num
 * banco descartável criado e destruído pelo próprio script. Nada toca dev nem produção.
 *
 * Uso: tsx --tsconfig tsconfig.server.json scripts/testar-guarda-drop.ts
 */
import "dotenv/config";
import { Client } from "pg";
import { readFileSync } from "node:fs";

const DB_TESTE = "senahub_teste_guarda";
const MIGRATION = "prisma/migrations/20260805140000_drop_bancarios_user/migration.sql";

function conexao(base: URL, database: string) {
  return new Client({
    host: base.hostname,
    port: Number(base.port),
    user: decodeURIComponent(base.username),
    password: decodeURIComponent(base.password),
    database,
  });
}

/** Extrai só o bloco DO $$ ... $$; da migration, sem o ALTER TABLE que vem depois. */
function extrairGuarda(): string {
  const sql = readFileSync(MIGRATION, "utf8");
  const ini = sql.indexOf("DO $$");
  const fim = sql.indexOf("-- AlterTable");
  if (ini < 0 || fim < 0) throw new Error("Não achei o bloco da guarda na migration.");
  return sql.slice(ini, fim);
}

async function main() {
  const base = new URL(process.env.DATABASE_URL!);
  const guarda = extrairGuarda();

  const admin = conexao(base, "postgres");
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${DB_TESTE}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${DB_TESTE}"`);
  await admin.end();

  const db = conexao(base, DB_TESTE);
  await db.connect();
  await db.query('CREATE TABLE "user" (id text primary key, banco text, agencia text, conta text, "tipoContaBancaria" text, "contaBancariaPrincipalId" text)');
  await db.query('CREATE TABLE "conta_bancaria_colaborador" (id text primary key, "userId" text)');

  let ok = true;
  const check = (nome: string, cond: boolean) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}`);
    if (!cond) ok = false;
  };

  // 1) Base vazia: nada a proteger, a guarda deixa passar.
  try {
    await db.query(guarda);
    check("base vazia não dispara a guarda", true);
  } catch {
    check("base vazia não dispara a guarda", false);
  }

  // 2) Pessoa com dado bancário E conta correspondente: cópia feita, pode seguir.
  await db.query(`INSERT INTO "user" (id, banco, agencia, conta, "tipoContaBancaria") VALUES ('u1','341','1234','56789-0','corrente')`);
  await db.query(`INSERT INTO "conta_bancaria_colaborador" (id, "userId") VALUES ('c1','u1')`);
  try {
    await db.query(guarda);
    check("dado bancário COM conta copiada não dispara", true);
  } catch {
    check("dado bancário COM conta copiada não dispara", false);
  }

  // 3) Pessoa com dado bancário e SEM conta: é exatamente o caso que o DROP perderia.
  await db.query(`INSERT INTO "user" (id, banco, agencia, conta, "tipoContaBancaria") VALUES ('u2','237','0001','11111-1','poupanca')`);
  try {
    await db.query(guarda);
    check("dado bancário SEM conta DISPARA a guarda", false);
  } catch (e) {
    const msg = (e as Error).message;
    check("dado bancário SEM conta DISPARA a guarda", msg.includes("ABORTADO"));
    console.log(`      → ${msg.split("\n")[0]}`);
  }

  // 4) Campo só com espaços não conta como dado bancário (btrim no WHERE).
  await db.query(`DELETE FROM "user" WHERE id = 'u2'`);
  await db.query(`INSERT INTO "user" (id, banco, agencia, conta, "tipoContaBancaria") VALUES ('u3','   ','','','')`);
  try {
    await db.query(guarda);
    check("campos em branco não são tratados como dado bancário", true);
  } catch {
    check("campos em branco não são tratados como dado bancário", false);
  }

  await db.end();
  const limpeza = conexao(base, "postgres");
  await limpeza.connect();
  await limpeza.query(`DROP DATABASE "${DB_TESTE}" WITH (FORCE)`);
  await limpeza.end();

  console.log(ok ? "\nGuarda verificada." : "\nGuarda com comportamento inesperado.");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
