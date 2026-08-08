/**
 * Restaura um dump de PRODUÇÃO (`pg_dump -Fc`) num banco DESCARTÁVEL da instância local, para
 * conferir a realidade dos dados e ensaiar migrations destrutivas sem tocar em produção.
 *
 * Reusa host/porta/usuário/senha do `DATABASE_URL` do `.env` e troca **só o nome do banco** —
 * a senha nunca é impressa. Recusa-se a escrever por cima do banco de desenvolvimento.
 *
 * ATENÇÃO: um dump de produção contém dado pessoal real (CPF, salário, hash de senha, sessões).
 * Apague o banco e o arquivo quando terminar:
 *   tsx --tsconfig tsconfig.server.json scripts/restaurar-snapshot-prod.ts --descartar
 *
 * Uso:
 *   ... scripts/restaurar-snapshot-prod.ts <caminho-do-dump> [--db nome] [--recriar] [--analisar]
 *   ... scripts/restaurar-snapshot-prod.ts --descartar [--db nome]
 */
import "dotenv/config";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { Client } from "pg";

const PADRAO_PG_BIN = "C:\\Program Files\\PostgreSQL\\17\\bin";
const DB_PADRAO = "senahub_snapshot_prod";

type Conexao = { host: string; port: string; user: string; senha: string; db: string };

function parseUrl(url: string): Conexao {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port || "5432",
    user: decodeURIComponent(u.username),
    senha: decodeURIComponent(u.password),
    db: u.pathname.replace(/^\//, ""),
  };
}

function urlCom(c: Conexao, db: string): string {
  const u = new URL(`postgresql://${c.host}:${c.port}/${db}`);
  u.username = encodeURIComponent(c.user);
  u.password = encodeURIComponent(c.senha);
  return u.toString();
}

/** Conecta no banco de manutenção `postgres` para poder criar/derrubar outros bancos. */
async function comManutencao<T>(c: Conexao, fn: (cli: Client) => Promise<T>): Promise<T> {
  const cli = new Client({ host: c.host, port: Number(c.port), user: c.user, password: c.senha, database: "postgres" });
  await cli.connect();
  try {
    return await fn(cli);
  } finally {
    await cli.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (nome: string) => args.includes(nome);
  const valor = (nome: string) => {
    const i = args.indexOf(nome);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const raw = process.env.DATABASE_URL;
  if (!raw) {
    console.error("ABORTADO: DATABASE_URL não definida (.env não carregado?).");
    process.exit(1);
  }
  const conexao = parseUrl(raw);
  const alvo = valor("--db") ?? DB_PADRAO;

  console.log(`Instância local: ${conexao.host}:${conexao.port} (usuário ${conexao.user})`);
  console.log(`Banco de dev (intocado): ${conexao.db}`);
  console.log(`Banco descartável alvo:  ${alvo}`);

  if (alvo === conexao.db) {
    console.error("\nABORTADO: o alvo é o próprio banco de DESENVOLVIMENTO. Escolha outro nome com --db.");
    process.exit(1);
  }

  if (flag("--descartar")) {
    await comManutencao(conexao, async (cli) => {
      await cli.query(`DROP DATABASE IF EXISTS "${alvo}" WITH (FORCE)`);
    });
    console.log(`\n[OK] Banco "${alvo}" removido. Apague também o arquivo .backup do disco.`);
    return;
  }

  const dump = args.find((a) => !a.startsWith("--") && a !== alvo);
  if (!dump) {
    console.error("\nABORTADO: informe o caminho do arquivo .backup gerado por pg_dump -Fc.");
    process.exit(1);
  }
  if (!existsSync(dump)) {
    console.error(`\nABORTADO: arquivo não encontrado: ${dump}`);
    process.exit(1);
  }

  const pgBin = process.env.PG_BIN_PATH ?? PADRAO_PG_BIN;
  const pgRestore = `${pgBin}\\pg_restore.exe`;
  if (!existsSync(pgRestore)) {
    console.error(`\nABORTADO: pg_restore não encontrado em ${pgRestore}. Defina PG_BIN_PATH.`);
    process.exit(1);
  }

  const existia = await comManutencao(conexao, async (cli) => {
    const r = await cli.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM pg_database WHERE datname = $1",
      [alvo],
    );
    const jaExiste = (r.rows[0]?.n ?? 0) > 0;
    if (jaExiste && flag("--recriar")) {
      await cli.query(`DROP DATABASE "${alvo}" WITH (FORCE)`);
      await cli.query(`CREATE DATABASE "${alvo}"`);
      return "recriado";
    }
    if (jaExiste) return "existente";
    await cli.query(`CREATE DATABASE "${alvo}"`);
    return "criado";
  });

  if (existia === "existente") {
    console.error(`\nABORTADO: "${alvo}" já existe. Use --recriar para sobrescrevê-lo.`);
    process.exit(1);
  }
  console.log(`\nBanco ${existia}. Restaurando ${dump} …`);

  const r = spawnSync(
    pgRestore,
    [
      "-h", conexao.host,
      "-p", conexao.port,
      "-U", conexao.user,
      "-d", alvo,
      "--no-owner",
      "--no-privileges",
      dump,
    ],
    { env: { ...process.env, PGPASSWORD: conexao.senha }, stdio: "inherit" },
  );

  // pg_restore devolve 1 com avisos benignos (roles ausentes) mesmo restaurando tudo.
  if (r.status !== 0) {
    console.log(`\n[AVISO] pg_restore saiu com código ${r.status} — confira os avisos acima.`);
  }

  const url = urlCom(conexao, alvo);
  console.log(`\n[OK] Snapshot em "${alvo}".`);

  if (flag("--analisar")) {
    console.log("\nRodando o dry-run contra o snapshot…\n");
    spawnSync(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["tsx", "--tsconfig", "tsconfig.server.json", "scripts/dry-run-cargos.ts"],
      { env: { ...process.env, DATABASE_URL: url }, stdio: "inherit" },
    );
  } else {
    console.log("Para analisar: repita este comando com --analisar (ou rode o dry-run com DATABASE_URL apontando pro snapshot).");
  }
  console.log(`\nAo terminar: scripts/restaurar-snapshot-prod.ts --descartar --db ${alvo}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
