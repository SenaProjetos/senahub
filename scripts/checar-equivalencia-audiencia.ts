/**
 * Gate de AUDIÊNCIA da Onda D (§6.2 passo 4, R2): compara um snapshot "antes" gravado em
 * disco com a foto de AGORA, e falha se qualquer conjunto mudou.
 *
 * **Qualquer diferença é falha dura — ao contrário do gate de permissão**, onde perder acesso
 * é só warning. A assimetria de lá existe porque uma perda de permissão se conserta com um
 * override e a pessoa reclama no mesmo dia. Aqui os dois lados são irrecuperáveis: quem saiu
 * da audiência deixa de ser notificado em silêncio (R2 — não gera erro, ninguém percebe por
 * semanas, e a notificação perdida não volta), e quem entrou já leu o que não devia.
 *
 * Fluxo pretendido na Onda D:
 *   1. ANTES de tocar em qualquer call-site:
 *        npx tsx --tsconfig tsconfig.server.json scripts/snapshot-audiencia.ts
 *      → guarde o caminho do JSON gerado em `logs/`.
 *   2. Faça o corte (codemod de `can()`, nav → permissão, `acessoGlobal()` no perfil).
 *   3. DEPOIS:
 *        npx tsx --tsconfig tsconfig.server.json scripts/checar-equivalencia-audiencia.ts logs/snapshot-audiencia-....json
 *
 * Mudança intencional de audiência passa por allowlist versionada e aprovada, mesmo rito do R1
 * — não por edição do snapshot.
 *
 * Plano: docs/superpowers/plans/2026-07-27-setor-contratacao-perfil-acesso.md (§6.2, §7-R2)
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import { compararConjuntos, conjuntosVazios, type DiferencaConjunto } from "../src/lib/equivalencia-audiencia";
import { gerarSnapshotAudiencia, type SnapshotAudiencia } from "./snapshot-audiencia";

function relatar(titulo: string, diffs: DiferencaConjunto[]): void {
  if (diffs.length === 0) {
    console.log(`✔ ${titulo}: sem diferença.`);
    return;
  }
  console.error(`\n✖ ${titulo}: ${diffs.length} conjunto(s) mudaram —`);
  for (const d of diffs) {
    if (d.sairam.length > 0) {
      console.error(`  [${d.chave}] SAÍRAM (${d.sairam.length}) — deixam de ser notificados em silêncio: ${d.sairam.join(", ")}`);
    }
    if (d.entraram.length > 0) {
      console.error(`  [${d.chave}] ENTRARAM (${d.entraram.length}) — passam a receber o que não recebiam: ${d.entraram.join(", ")}`);
    }
  }
}

async function main() {
  const caminho = process.argv[2];
  if (!caminho) {
    console.error("Uso: ... scripts/checar-equivalencia-audiencia.ts <caminho-do-snapshot-antes.json>");
    console.error("Gere o 'antes' com scripts/snapshot-audiencia.ts ANTES de mexer nos call-sites.");
    process.exit(2);
  }

  const antes = JSON.parse(readFileSync(caminho, "utf8")) as SnapshotAudiencia;
  console.log(`Snapshot "antes": ${caminho} (gerado em ${antes.geradoEm})`);
  console.log("Calculando a foto de agora...\n");
  const depois = await gerarSnapshotAudiencia();

  const diffAudiencias = compararConjuntos(antes.audiencias, depois.audiencias);
  const diffParametrizadas = compararConjuntos(antes.parametrizadas, depois.parametrizadas);
  const diffNav = compararConjuntos(antes.nav, depois.nav);

  relatar("Audiências", diffAudiencias);
  relatar("Audiências parametrizadas", diffParametrizadas);
  relatar("Menu por usuário", diffNav);

  const vazias = conjuntosVazios(depois.audiencias);
  if (vazias.length > 0) {
    console.error(`\n✖ Audiência(s) VAZIA(S) agora: ${vazias.join(", ")}`);
  }

  const total = diffAudiencias.length + diffParametrizadas.length + diffNav.length;
  if (total > 0 || vazias.length > 0) {
    console.error(`\nBLOQUEANTE: ${total} conjunto(s) divergente(s), ${vazias.length} audiência(s) vazia(s).`);
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log("\n✔ Audiências e menus idênticos ao snapshot. Nenhum destinatário ganho ou perdido.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
