/**
 * Restaura um backup (`pg_dump -Fc`) POR CIMA de um banco existente — DESTRUTIVO.
 *
 * É o par do `lib/backup.ts` / opção "Backup manual" do menu do servidor. Diferente do
 * `restaurar-snapshot-prod.ts` (que se recusa a tocar no banco em uso e restaura num banco
 * descartável para ensaio), este aqui existe justamente para sobrescrever o banco real.
 * As duas coisas são classes de risco opostas — não unifique os scripts.
 *
 * Ordem fixa, pensada para nunca destruir sem rede de segurança:
 *   1. valida o arquivo com `pg_restore --list` (dump truncado por pg_dump morto parece
 *      íntegro no Explorer; só a listagem prova que dá para restaurar)
 *   2. confirmação digitada com o nome do banco alvo
 *   3. cópia de segurança do estado ATUAL (aborta se ela falhar)
 *   4. DROP + CREATE do banco
 *   5. pg_restore
 *   6. relatório de migrations pendentes
 * Se o passo 5 falhar, o caminho da cópia de segurança é impresso — é a única volta.
 *
 * O schema `pgboss` é EXCLUÍDO por padrão: restaurá-lo traria a fila de jobs congelada na
 * hora do backup (agendamentos e jobs pendentes disparariam ao subir o serviço). O
 * `boss.start()` recria o schema limpo. Use `--com-pgboss` para manter o do dump.
 *
 * ANTES de rodar em produção: pare o serviço (`Stop-Service SenaHub`), senão o pg-boss
 * reconecta na hora e o DROP não passa.
 *
 * Uso:
 *   tsx --tsconfig tsconfig.server.json scripts/restaurar-backup.ts <dump> [--db nome]
 *        [--confirmado] [--sem-copia-seguranca] [--com-pgboss]
 */
import "dotenv/config";
import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import readline from "node:readline/promises";
import { Client } from "pg";

const PADRAO_PG_BIN = "C:\\Program Files\\PostgreSQL\\17\\bin";

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

/** Mesmo carimbo local de `lib/backup.ts` — os dois nomes convivem na mesma pasta. */
function carimboLocal(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function abortar(msg: string): never {
  console.error(`\nABORTADO: ${msg}`);
  process.exit(1);
}

/** Pasta do PostgreSQL: PG_BIN_PATH > pasta do PG_DUMP_PATH > caminho padrão da v17. */
function resolverBin(nome: string): string {
  const candidatos = [
    process.env.PG_BIN_PATH,
    process.env.PG_DUMP_PATH ? path.dirname(process.env.PG_DUMP_PATH) : undefined,
    PADRAO_PG_BIN,
  ].filter(Boolean) as string[];
  for (const dir of candidatos) {
    const exe = path.join(dir, `${nome}.exe`);
    if (existsSync(exe)) return exe;
  }
  abortar(`${nome} não encontrado. Defina PG_BIN_PATH (pasta bin do PostgreSQL) no .env.`);
}

async function comManutencao<T>(c: Conexao, fn: (cli: Client) => Promise<T>): Promise<T> {
  const cli = new Client({
    host: c.host,
    port: Number(c.port),
    user: c.user,
    password: c.senha,
    database: "postgres",
  });
  await cli.connect();
  try {
    return await fn(cli);
  } finally {
    await cli.end();
  }
}

/** `pg_restore --list` só devolve 0 num arquivo -Fc íntegro; conta as entradas do TOC. */
function validarDump(pgRestore: string, dump: string): number {
  const r = spawnSync(pgRestore, ["--list", dump], { encoding: "utf8" });
  if (r.status !== 0) {
    abortar(
      `o arquivo não é um dump válido de \`pg_dump -Fc\` (ou está truncado).\n${(r.stderr || "").trim()}`,
    );
  }
  const entradas = (r.stdout || "").split(/\r?\n/).filter((l) => /^\d+;/.test(l)).length;
  if (entradas === 0) abortar("o dump é válido mas não contém nenhum objeto — nada a restaurar.");
  return entradas;
}

/** Migrations no disco que o banco restaurado ainda não tem. */
async function migrationsPendentes(c: Conexao, db: string): Promise<string[] | null> {
  const dir = path.join(process.cwd(), "prisma", "migrations");
  if (!existsSync(dir)) return null;
  const noDisco = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const cli = new Client({
    host: c.host,
    port: Number(c.port),
    user: c.user,
    password: c.senha,
    database: db,
  });
  await cli.connect();
  try {
    const r = await cli.query<{ migration_name: string }>(
      `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`,
    );
    const aplicadas = new Set(r.rows.map((x) => x.migration_name));
    return noDisco.filter((m) => !aplicadas.has(m));
  } catch {
    return null; // banco sem _prisma_migrations (dump antigo demais) — não é erro fatal
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
  if (!raw) abortar("DATABASE_URL não definida (.env não carregado?).");
  const conexao = parseUrl(raw);
  const alvo = valor("--db") ?? conexao.db;

  const dump = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--db");
  if (!dump) abortar("informe o caminho do arquivo .backup gerado por pg_dump -Fc.");
  if (!existsSync(dump)) abortar(`arquivo não encontrado: ${dump}`);

  const pgRestore = resolverBin("pg_restore");
  const pgDump = resolverBin("pg_dump");

  console.log("=============== RESTAURAR BACKUP (DESTRUTIVO) ===============");
  console.log(`Instância: ${conexao.host}:${conexao.port} (usuário ${conexao.user})`);
  console.log(`Banco ALVO (será APAGADO e recriado): ${alvo}`);
  console.log(`Arquivo:   ${path.resolve(dump)}`);

  // ---- 1. Validar ANTES de destruir qualquer coisa ----
  console.log("\n[1/6] Validando o dump...");
  const entradas = validarDump(pgRestore, dump);
  console.log(`      [OK] Dump íntegro (${entradas} objetos no índice).`);

  // ---- 2. Confirmação digitada ----
  if (!flag("--confirmado")) {
    console.log(`\n[2/6] Isso APAGA o banco "${alvo}" e o substitui pelo conteúdo do arquivo.`);
    console.log(`      Digite o nome do banco (${alvo}) para confirmar; qualquer outra coisa cancela.`);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const resp = (await rl.question("> ")).trim();
    rl.close();
    if (resp !== alvo) abortar("cancelado pelo operador.");
  } else {
    console.log("\n[2/6] Confirmação já obtida por quem chamou (--confirmado).");
  }

  const existe = await comManutencao(conexao, async (cli) => {
    const r = await cli.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM pg_database WHERE datname = $1",
      [alvo],
    );
    return (r.rows[0]?.n ?? 0) > 0;
  });

  // ---- 3. Cópia de segurança do estado atual ----
  let copiaSeguranca: string | null = null;
  if (!existe) {
    console.log("\n[3/6] Banco alvo ainda não existe — nada a preservar.");
  } else if (flag("--sem-copia-seguranca")) {
    console.log("\n[3/6] Cópia de segurança PULADA (--sem-copia-seguranca). Sem volta se algo falhar.");
  } else {
    const dirCopia = process.env.BACKUP_PATH || path.join(process.cwd(), "backups");
    copiaSeguranca = path.join(dirCopia, `pre-restauracao_${alvo}_${carimboLocal()}.backup`);
    console.log(`\n[3/6] Copiando o estado ATUAL para ${copiaSeguranca} ...`);
    const r = spawnSync(
      pgDump,
      ["-h", conexao.host, "-p", conexao.port, "-U", conexao.user, "-Fc", "-f", copiaSeguranca, alvo],
      { env: { ...process.env, PGPASSWORD: conexao.senha }, stdio: "inherit" },
    );
    if (r.status !== 0) {
      abortar("a cópia de segurança falhou. NADA foi alterado — resolva isso antes de restaurar.");
    }
    console.log("      [OK] Cópia de segurança gravada.");
  }

  // ---- 4. Recriar o banco ----
  console.log(`\n[4/6] Recriando o banco "${alvo}" ...`);
  try {
    await comManutencao(conexao, async (cli) => {
      if (existe) await cli.query(`DROP DATABASE "${alvo}" WITH (FORCE)`);
      await cli.query(`CREATE DATABASE "${alvo}"`);
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n[ERRO] Não foi possível recriar o banco: ${msg}`);
    if (copiaSeguranca) console.error(`       O banco NÃO foi tocado. Cópia de segurança em ${copiaSeguranca}`);
    process.exit(1);
  }
  console.log("      [OK] Banco vazio criado.");

  // ---- 5. Restaurar ----
  const argsRestore = [
    "-h", conexao.host,
    "-p", conexao.port,
    "-U", conexao.user,
    "-d", alvo,
    "--no-owner",
    "--no-privileges",
  ];
  if (!flag("--com-pgboss")) argsRestore.push("-N", "pgboss");
  argsRestore.push(dump);

  console.log(`\n[5/6] Restaurando${flag("--com-pgboss") ? "" : " (schema pgboss excluído)"} ...`);
  const r = spawnSync(pgRestore, argsRestore, {
    env: { ...process.env, PGPASSWORD: conexao.senha },
    stdio: "inherit",
  });
  // pg_restore devolve 1 com avisos benignos (roles ausentes, extensões) mesmo restaurando tudo.
  if (r.status !== 0) {
    console.log(`\n[AVISO] pg_restore saiu com código ${r.status}. Leia os avisos acima:`);
    console.log("        avisos sobre roles/extensões costumam ser inofensivos;");
    console.log("        erros de 'relation already exists' ou 'out of memory' NÃO são.");
    if (copiaSeguranca) {
      console.log(`\n        Para voltar ao estado anterior, restaure a cópia de segurança:`);
      console.log(`        tsx --tsconfig tsconfig.server.json scripts/restaurar-backup.ts "${copiaSeguranca}" --db ${alvo}`);
    }
  } else {
    console.log("      [OK] Restauração concluída.");
  }

  // ---- 6. Migrations ----
  console.log("\n[6/6] Conferindo migrations...");
  const pendentes = await migrationsPendentes(conexao, alvo);
  if (pendentes === null) {
    console.log("      [ATENCAO] Não foi possível ler _prisma_migrations no banco restaurado.");
  } else if (pendentes.length === 0) {
    console.log("      [OK] Schema do dump está em dia com prisma/migrations.");
  } else {
    console.log(`      [ATENCAO] ${pendentes.length} migration(s) do código ainda não aplicadas no dump:`);
    for (const m of pendentes.slice(0, 10)) console.log(`        - ${m}`);
    console.log("      Rode: npx prisma migrate deploy   (antes de subir o serviço)");
  }

  console.log("\n=============================================================");
  console.log(`Banco "${alvo}" restaurado a partir de ${path.resolve(dump)}`);
  if (copiaSeguranca) console.log(`Estado anterior preservado em ${copiaSeguranca}`);
  console.log("Lembre-se: o dump do Postgres NÃO contém os arquivos de STORAGE_BASE_PATH.");
  console.log("=============================================================");
}

main().catch((err) => {
  console.error("\nFALHOU:", err instanceof Error ? err.message : err);
  process.exit(1);
});
