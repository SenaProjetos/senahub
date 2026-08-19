/**
 * Ensaio da F1.15 + F1.16 contra o dado REAL de produção, dentro de uma transação que termina
 * sempre em `ROLLBACK`. **Nada persiste.**
 *
 * Por que existe: o caminho recomendado (`restaurar-snapshot-prod.ts` num banco descartável)
 * exige `CREATEDB`, que o papel `senahub` não tem — e o único superusuário (`postgres`) está com
 * a senha indisponível. Postgres tem **DDL transacional**, então dá para ensaiar até o
 * `CREATE UNIQUE INDEX` e desfazer.
 *
 * O que ele prova, contra os 46 clientes e 32 projetos de verdade:
 *   1. a normalização de `documento` roda e deixa 0 registros fora do formato;
 *   2. as 5 fusões repontam todos os vínculos, sem perder linha;
 *   3. nenhum projeto troca de cliente fora do previsto;
 *   4. o `CREATE UNIQUE INDEX ... WHERE documento IS NOT NULL` **aplica sem erro** — que é a
 *      pergunta que mais interessa na F1.16.
 *
 * ⚠️ O que ele NÃO prova: não chama `mesclarClientes()` (a função roda a própria transação, e
 * transação aninhada no Prisma não volta atrás junto). Ele **replica o efeito** repontando as
 * colunas listadas em `REFERENCIAS_CLIENTE` — a MESMA constante que a função usa, importada daqui
 * de propósito para as duas não divergirem em silêncio. A função em si já é coberta ponta a ponta
 * por `npm run smoke:crm-dedupe`.
 *
 * Usa `pg` direto, não o Prisma: é preciso uma única sessão com `BEGIN`/`ROLLBACK` explícitos.
 *
 * Uso:
 *   tsx --tsconfig tsconfig.server.json scripts/ensaio-f115-f116.ts
 */
import "dotenv/config";
import { Client } from "pg";
import { REFERENCIAS_CLIENTE } from "../src/modules/clientes/fusao";
import { normalizarDocumento } from "../src/modules/comercial/dedupe";

/** Os mesmos pares da F1.15 — ver o cabeçalho de `fundir-clientes-f115.ts` para o porquê de cada. */
const PARES: { grupo: string; sobrevivente: string; absorvido: string }[] = [
  { grupo: "MADANO", sobrevivente: "cmrp0p8g1014etwnunrsyglg5", absorvido: "cms38k67100cws0nu2t845n83" },
  { grupo: "ZÁPHIS", sobrevivente: "cmr3kqb57006hywnu1x3z4t3j", absorvido: "cms38knd200d0s0nu2wc5759x" },
  { grupo: "ZÁPHIS", sobrevivente: "cmr3kqb57006hywnu1x3z4t3j", absorvido: "cms38kq6r00d2s0nushj7z88v" },
  { grupo: "ZÁPHIS", sobrevivente: "cmr3kqb57006hywnu1x3z4t3j", absorvido: "cms38kssi00d4s0nucev5930y" },
  { grupo: "NOMINAL", sobrevivente: "cmsqawghw01if74nueumptdh3", absorvido: "cmshtgi25077vb0nuzn126dw6" },
];

let falhas = 0;
function check(nome: string, cond: boolean, detalhe: string) {
  if (cond) console.log(`  ✓ ${nome} — ${detalhe}`);
  else {
    falhas++;
    console.error(`  ✖ ${nome} — ${detalhe}`);
  }
}

async function n(cli: Client, sql: string, params: unknown[] = []): Promise<number> {
  const r = await cli.query(sql, params);
  return Number(r.rows[0].n);
}

async function retrato(cli: Client): Promise<Map<string, string | null>> {
  const r = await cli.query(`SELECT id, "clienteId" FROM projeto`);
  return new Map(r.rows.map((x) => [x.id, x.clienteId]));
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurado.");
  const cli = new Client({ connectionString: url });
  await cli.connect();

  console.log("\n=== ENSAIO F1.15 + F1.16 (transação revertida — nada persiste) ===\n");

  try {
    await cli.query("BEGIN");

    const projetosAntes = await n(cli, `SELECT count(*) AS n FROM projeto`);
    const clientesAntes = await n(cli, `SELECT count(*) AS n FROM cliente`);
    const retratoAntes = await retrato(cli);

    // ── 1. Normalização de documento (F1.16, pré-requisito) ──────────────────────────────
    console.log("── 1. Normalização de documento ──────────────────────────────────────────\n");
    const docs = await cli.query<{ id: string; documento: string }>(
      `SELECT id, documento FROM cliente WHERE documento IS NOT NULL`,
    );
    let normalizados = 0;
    for (const d of docs.rows) {
      const alvo = normalizarDocumento(d.documento);
      if (alvo !== d.documento) {
        await cli.query(`UPDATE cliente SET documento = $1 WHERE id = $2`, [alvo, d.id]);
        normalizados++;
      }
    }
    const foraFormato = await n(
      cli,
      `SELECT count(*) AS n FROM cliente WHERE documento IS NOT NULL AND (documento = '' OR documento ~ '[^0-9]')`,
    );
    check("normalização", foraFormato === 0, `${normalizados} alterados, ${foraFormato} fora do formato (esperado 0)`);

    // ── 2. As 5 fusões ───────────────────────────────────────────────────────────────────
    console.log("\n── 2. Fusões ─────────────────────────────────────────────────────────────\n");
    const previsto = new Map<string, string>();
    for (const p of PARES) {
      const r = await cli.query(`SELECT id FROM projeto WHERE "clienteId" = $1`, [p.absorvido]);
      for (const x of r.rows) previsto.set(x.id, p.sobrevivente);
    }

    for (const p of PARES) {
      const movidos: string[] = [];
      for (const ref of REFERENCIAS_CLIENTE) {
        const tabela = ref.tabela === "user" ? '"user"' : `"${ref.tabela}"`;
        const r = await cli.query(
          `UPDATE ${tabela} SET "${ref.coluna}" = $1 WHERE "${ref.coluna}" = $2`,
          [p.sobrevivente, p.absorvido],
        );
        if (r.rowCount) movidos.push(`${ref.tabela}=${r.rowCount}`);
      }
      await cli.query(
        `UPDATE cliente SET ativo = false, "fundidoEmId" = $1, "fusaoEm" = now() WHERE id = $2`,
        [p.sobrevivente, p.absorvido],
      );
      console.log(`  ✓ [${p.grupo}] ${p.absorvido.slice(0, 8)}… → ${p.sobrevivente.slice(0, 8)}…  ${movidos.join(" ") || "(só o arquivamento)"}`);
    }

    // ── 3. Verificação ───────────────────────────────────────────────────────────────────
    console.log("\n── 3. Verificação ────────────────────────────────────────────────────────\n");
    const projetosDepois = await n(cli, `SELECT count(*) AS n FROM projeto`);
    const clientesDepois = await n(cli, `SELECT count(*) AS n FROM cliente`);
    const naoFundidos = await n(cli, `SELECT count(*) AS n FROM cliente WHERE "fundidoEmId" IS NULL`);
    const retratoDepois = await retrato(cli);

    check("projeto não muda de contagem", projetosDepois === projetosAntes, `${projetosAntes} → ${projetosDepois}`);
    check("cliente não perde linha", clientesDepois === clientesAntes, `${clientesAntes} → ${clientesDepois}`);
    check("cliente não fundido", naoFundidos === 41, `${naoFundidos} (esperado 41)`);

    let movidosOk = 0;
    const forasDoPrevisto: string[] = [];
    for (const [id, antes] of retratoAntes) {
      const depois = retratoDepois.get(id) ?? null;
      if (antes === depois) continue;
      if (previsto.get(id) === depois) movidosOk++;
      else forasDoPrevisto.push(`${id}: ${antes} → ${depois}`);
    }
    check(
      "nenhum projeto trocou de cliente fora do previsto",
      forasDoPrevisto.length === 0,
      forasDoPrevisto.length === 0 ? `${movidosOk} projeto(s) movido(s), todos previstos` : forasDoPrevisto.join(" | "),
    );

    const sobrando = await n(
      cli,
      `SELECT count(*) AS n FROM projeto x JOIN cliente c ON c.id = x."clienteId" WHERE c."fundidoEmId" IS NOT NULL`,
    );
    check("nenhum vínculo ficou em cliente absorvido", sobrando === 0, `${sobrando} vínculo(s) sobrando`);

    // ── 4. O índice único da F1.16, de verdade ───────────────────────────────────────────
    console.log("\n── 4. CREATE UNIQUE INDEX (o teste real da migration) ────────────────────\n");
    try {
      await cli.query(
        `CREATE UNIQUE INDEX cliente_documento_unico ON "cliente" (documento) WHERE documento IS NOT NULL`,
      );
      check("índice único parcial aplica", true, "CREATE UNIQUE INDEX passou sem erro");
    } catch (e) {
      check("índice único parcial aplica", false, `falhou: ${(e as Error).message}`);
    }

    // Prova que o índice REALMENTE recusa duplicata: tenta gravar um CNPJ que já existe.
    const [alvo] = (
      await cli.query<{ id: string; documento: string }>(
        `SELECT id, documento FROM cliente WHERE documento IS NOT NULL LIMIT 1`,
      )
    ).rows;
    if (alvo) {
      await cli.query("SAVEPOINT tenta_duplicar");
      try {
        await cli.query(
          `INSERT INTO cliente (id, nome, tipo, documento, ativo, "createdAt", "updatedAt")
           VALUES ('ensaio-duplicata', 'Ensaio Duplicata', 'PJ', $1, true, now(), now())`,
          [alvo.documento],
        );
        await cli.query("ROLLBACK TO SAVEPOINT tenta_duplicar");
        check("índice recusa CNPJ repetido", false, "o INSERT duplicado PASSOU — o índice não está barrando");
      } catch (e) {
        await cli.query("ROLLBACK TO SAVEPOINT tenta_duplicar");
        const msg = (e as Error).message;
        check("índice recusa CNPJ repetido", msg.includes("cliente_documento_unico"), `recusado: ${msg.split("\n")[0]}`);
      }
    }
  } finally {
    await cli.query("ROLLBACK");
    const restou = await cli.query(`SELECT count(*) AS n FROM cliente WHERE "fundidoEmId" IS NOT NULL`);
    const indice = await cli.query(
      `SELECT count(*) AS n FROM pg_indexes WHERE indexname = 'cliente_documento_unico'`,
    );
    console.log("\n── Reversão ──────────────────────────────────────────────────────────────\n");
    console.log(`  ROLLBACK executado.`);
    console.log(`  clientes fundidos que restaram: ${Number(restou.rows[0].n)} (tem que ser 0)`);
    console.log(`  índice que restou:              ${Number(indice.rows[0].n)} (tem que ser 0)`);
    if (Number(restou.rows[0].n) !== 0 || Number(indice.rows[0].n) !== 0) {
      console.error("\n  ✖✖ A REVERSÃO NÃO LIMPOU TUDO — confira o banco antes de qualquer outra coisa.\n");
      process.exitCode = 1;
    }
    await cli.end();
  }

  console.log(`\n${falhas === 0 ? "✓ Ensaio passou inteiro." : `✖ ${falhas} check(s) falharam.`}\n`);
  if (falhas > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
