/**
 * F1.16 — Normaliza `Cliente.documento` antes de criar o índice único parcial.
 *
 * Roda ANTES da migration `..._crm_cliente_documento_unico`. Sem ele a migration falha, e o
 * índice que sobreviver seria meia garantia. Dois motivos, os dois medidos em produção:
 *
 * 1. **String vazia não é NULL.** 2 clientes PF ("Bruno", "Roberto Barros") têm `documento = ''`.
 *    O predicado `WHERE documento IS NOT NULL` **inclui** `''` — os dois colidem entre si e
 *    `CREATE UNIQUE INDEX` aborta. Viram `NULL`.
 *
 * 2. **Mesmo CNPJ, grafias diferentes.** 24 dos 28 documentos preenchidos estão só com dígitos e
 *    4 estão pontuados (`40.817.865/0001-60`). Para o índice, "40.817.865/0001-60" e
 *    "40817865000160" são valores distintos — o índice existiria e ainda assim deixaria passar o
 *    mesmo CNPJ duas vezes. Todos passam por `normalizarDocumento` (só dígitos), a MESMA função
 *    que a F1.12 usa para detectar duplicata e que `actions.ts` passa a aplicar na gravação.
 *
 * ⚠️ **Colisão criada pela própria normalização:** se dois clientes tiverem o mesmo CNPJ escrito
 * de jeitos diferentes, normalizar os dois cria uma duplicata REAL que hoje está escondida. O
 * script detecta isso ANTES de gravar e aborta com a lista — resolver é fusão (F1.15), não
 * normalização. Em produção, medido em 2026-08-19: nenhuma colisão.
 *
 * Idempotente: só toca em quem está fora do formato. Rodar de novo não faz nada.
 *
 * Uso:
 *   tsx --tsconfig tsconfig.server.json scripts/normalizar-documento-f116.ts            # dry-run
 *   tsx --tsconfig tsconfig.server.json scripts/normalizar-documento-f116.ts --gravar
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { normalizarDocumento } from "../src/modules/comercial/dedupe";

const GRAVAR = process.argv.includes("--gravar");

type Linha = { id: string; nome: string; documento: string | null };

async function main() {
  console.log(`\n=== F1.16 — normalização de Cliente.documento (${GRAVAR ? "GRAVAR" : "DRY-RUN"}) ===\n`);

  // Lê por SQL para enxergar TODOS os clientes: a extensão de soft delete esconderia os
  // excluídos, e o índice único do banco não sabe de soft delete — um documento mal formatado
  // num cliente excluído quebraria a migration do mesmo jeito.
  const todos = await prisma.$queryRawUnsafe<Linha[]>(
    `SELECT id, nome, documento FROM cliente WHERE documento IS NOT NULL ORDER BY nome`,
  );

  const mudancas: { id: string; nome: string; de: string; para: string | null }[] = [];
  for (const c of todos) {
    const atual = c.documento ?? "";
    const normalizado = normalizarDocumento(atual);
    // Compara com `normalizado` CRU (que pode ser null), não com `normalizado ?? ""`: para
    // `documento = ''` o normalizado é `null`, e `'' !== ''` daria falso — o caso que quebra a
    // migration seria justamente o único a escapar da normalização.
    if (normalizado !== atual) {
      mudancas.push({ id: c.id, nome: c.nome, de: atual, para: normalizado });
    }
  }

  if (mudancas.length === 0) {
    console.log("Nada a normalizar — todos os documentos já estão só com dígitos, e nenhum é string vazia.\n");
    return;
  }

  const vazios = mudancas.filter((m) => m.para === null);
  const repontuados = mudancas.filter((m) => m.para !== null);

  console.log(`── ${vazios.length} documento(s) vazio(s) → NULL ──────────────────────────────\n`);
  for (const m of vazios) console.log(`  "${m.nome}"  '' → NULL`);

  console.log(`\n── ${repontuados.length} documento(s) pontuado(s) → só dígitos ──────────────\n`);
  for (const m of repontuados) console.log(`  "${m.nome}"  ${m.de} → ${m.para}`);

  // ── Colisões que a normalização criaria ────────────────────────────────────────────────
  const depois = new Map<string, string[]>();
  for (const c of todos) {
    const valor = normalizarDocumento(c.documento ?? "");
    if (!valor) continue;
    depois.set(valor, [...(depois.get(valor) ?? []), c.nome]);
  }
  const colisoes = [...depois.entries()].filter(([, nomes]) => nomes.length > 1);

  console.log("\n── Colisões após normalizar ──────────────────────────────────────────────\n");
  if (colisoes.length === 0) {
    console.log("  nenhuma — o índice único passa depois desta normalização.\n");
  } else {
    console.error("  ✖ NORMALIZAR CRIARIA DUPLICATA REAL (o índice único falharia):\n");
    for (const [doc, nomes] of colisoes) console.error(`     ${doc} → ${nomes.join(" | ")}`);
    console.error("\n  Isso é caso de FUSÃO (F1.15), não de normalização. Nada foi gravado.\n");
    process.exitCode = 1;
    return;
  }

  if (!GRAVAR) {
    console.log("DRY-RUN — nada foi gravado. Para executar:\n");
    console.log("   tsx --tsconfig tsconfig.server.json scripts/normalizar-documento-f116.ts --gravar\n");
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const m of mudancas) {
      await tx.$executeRawUnsafe(`UPDATE cliente SET documento = $1 WHERE id = $2`, m.para, m.id);
    }
  });

  const restantes = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*) AS n FROM cliente WHERE documento IS NOT NULL AND (documento = '' OR documento ~ '[^0-9]')`,
  );
  console.log(`\n✓ ${mudancas.length} cliente(s) normalizado(s).`);
  console.log(`  fora do formato restantes: ${Number(restantes[0].n)} (esperado 0)\n`);
  if (Number(restantes[0].n) !== 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
