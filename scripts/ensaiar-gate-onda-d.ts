/**
 * Ensaio do **gate 2 da Onda D** (§6.2/R1 do plano de Setor × Contratação × Perfil de acesso):
 * roda a equivalência de permissões contra DADO DE PRODUÇÃO, sem tocar em produção.
 *
 * Por que não basta o resultado que já temos: o "416 células, 0 ganhos, 0 perdas" de §13.4 foi
 * medido no banco de DEV, onde `db:seed` e `backfill-perfis-acesso.ts` já rodaram. Produção
 * ainda tem `perfil_acesso` vazio e `perfilId` nulo em 100% dos usuários — rodar o checador
 * contra um restore cru daria "0 ganhos" trivialmente (não há perfil de onde ganhar) e o verde
 * não significaria nada. O ensaio precisa **reproduzir o que o deploy vai fazer** e só então
 * medir.
 *
 * O que faz, num banco DESCARTÁVEL clonado do restore de produção:
 *   1. clona `senahub_snapshot_prod` → `senahub_gate_onda_d` (recria do zero a cada execução)
 *   2. `prisma migrate deploy`          — ensaia a migração pendente com dado real
 *   3. `db:seed`                        — catálogo + `Permissao` + perfis semente
 *   4. `backfill-perfis-acesso.ts`      — atribui `perfilId`/`superUsuario` + piso de sócio
 *   5. `checar-equivalencia-permissoes.ts` — o gate: 0 ganhos é bloqueante, 0 perdas é a meta
 *   6. `snapshot-audiencia.ts`          — fotografa audiências/menus com o dado de produção
 *
 * NÃO toca em produção e NÃO toca no banco de dev: só o clone descartável recebe escrita, e o
 * `DATABASE_URL` de cada passo é montado trocando apenas o NOME do banco (host/usuário/senha
 * vêm do `.env`, e a senha nunca é impressa). Recusa-se a rodar se o `.env` já apontar para o
 * banco de ensaio.
 *
 * ATENÇÃO: o clone contém dado pessoal real de produção (CPF, salário, hash de senha). Apague
 * quando terminar: `... scripts/ensaiar-gate-onda-d.ts --descartar`
 *
 * Uso:
 *   npx tsx --tsconfig tsconfig.server.json scripts/ensaiar-gate-onda-d.ts [--descartar]
 *
 * Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (§6.2, §15)
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { Client } from "pg";

const ORIGEM = "senahub_snapshot_prod";
const ALVO = "senahub_gate_onda_d";

function conexao() {
  const bruto = process.env.DATABASE_URL;
  if (!bruto) throw new Error("DATABASE_URL ausente — configure o .env.");
  const u = new URL(bruto);
  if (u.pathname.slice(1) === ALVO) {
    throw new Error(`recusa: DATABASE_URL do .env já aponta para ${ALVO}; aponte para o banco de dev.`);
  }
  return u;
}

/** Mesma conexão, trocando SÓ o nome do banco. A senha nunca é impressa. */
function urlDoBanco(u: URL, db: string): string {
  const novo = new URL(`postgresql://${u.hostname}:${u.port || 5432}/${db}`);
  novo.username = u.username;
  novo.password = u.password;
  return novo.toString();
}

async function comManutencao<T>(u: URL, fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({
    host: u.hostname,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: "postgres",
  });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

/** Roda um comando com o DATABASE_URL apontado para o clone. Retorna o exit code. */
function passo(titulo: string, comando: string, args: string[], url: string): number {
  console.log(`\n──── ${titulo} ────`);
  const r = spawnSync(comando, args, {
    stdio: "inherit",
    shell: true,
    // `dotenv` não sobrescreve variável já presente no ambiente, então este valor vence o .env.
    env: { ...process.env, DATABASE_URL: url },
  });
  return r.status ?? 1;
}

async function main() {
  const u = conexao();
  const urlAlvo = urlDoBanco(u, ALVO);

  if (process.argv.includes("--descartar")) {
    await comManutencao(u, async (c) => {
      await c.query(`select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`, [ALVO]);
      await c.query(`drop database if exists ${ALVO}`);
    });
    console.log(`${ALVO} descartado.`);
    return;
  }

  const existeOrigem = await comManutencao(u, async (c) => {
    const r = await c.query(`select 1 from pg_database where datname = $1`, [ORIGEM]);
    return r.rowCount === 1;
  });
  if (!existeOrigem) {
    console.error(`Banco ${ORIGEM} não existe. Restaure um dump de produção primeiro:`);
    console.error("  npx tsx --tsconfig tsconfig.server.json scripts/restaurar-snapshot-prod.ts <dump>");
    process.exit(2);
  }

  console.log(`Clonando ${ORIGEM} → ${ALVO} (recriado do zero)...`);
  await comManutencao(u, async (c) => {
    await c.query(
      `select pg_terminate_backend(pid) from pg_stat_activity where datname in ($1,$2) and pid <> pg_backend_pid()`,
      [ORIGEM, ALVO],
    );
    await c.query(`drop database if exists ${ALVO}`);
    await c.query(`create database ${ALVO} template ${ORIGEM}`);
  });

  const tsx = ["tsx", "--tsconfig", "tsconfig.server.json"];
  const etapas: [string, string, string[]][] = [
    ["1/6 · prisma migrate deploy (ensaio da migração com dado real)", "npx", ["prisma", "migrate", "deploy"]],
    ["2/6 · db:seed (catálogo + Permissao + perfis semente)", "npx", [...tsx, "prisma/seed.ts"]],
    // A Fase 0 nunca rodou em produção: lá `tipo`/`setor`/`contratacao` são nulos e não há
    // `Vinculo`. Sem este passo o gate seguinte não acha NENHUM usuário `tipo: "interno"` e
    // "passa" comparando zero células (§15.2). O deploy real precisa desta ordem também.
    ["3/6 · backfill da Fase 0 (TipoUsuario/Setor/Contratacao + Vinculo)", "npx", [...tsx, "scripts/backfill-vinculos.ts"]],
    ["4/6 · backfill de perfilId/superUsuario + piso de sócio", "npx", [...tsx, "scripts/backfill-perfis-acesso.ts"]],
    ["5/6 · GATE: equivalência de permissões (0 ganhos é bloqueante)", "npx", [...tsx, "scripts/checar-equivalencia-permissoes.ts"]],
    ["6/6 · snapshot de audiências e menus com dado de produção", "npx", [...tsx, "scripts/snapshot-audiencia.ts"]],
  ];

  for (const [titulo, comando, args] of etapas) {
    const code = passo(titulo, comando, args, urlAlvo);
    if (code !== 0) {
      console.error(`\n✖ Etapa falhou (exit ${code}): ${titulo}`);
      console.error(`  O banco ${ALVO} ficou de pé para inspeção. Descarte com --descartar quando terminar.`);
      process.exit(code);
    }
  }

  console.log(`\n✔ Ensaio completo. O gate rodou contra dado de produção no clone ${ALVO}.`);
  console.log(`  Lembre de descartar (contém dado pessoal real): scripts/ensaiar-gate-onda-d.ts --descartar`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
