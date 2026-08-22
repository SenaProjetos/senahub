/**
 * F5.2 (ADR-21) — preenche `Proposta.negociacaoId` nas propostas que nasceram antes de
 * `Negociacao` existir.
 *
 * ── Deriva; não inventa (ADR-21 item 2) ─────────────────────────────────────────────────────
 * O backlog dizia "negociação sintética" sem ressalva. O ADR corrigiu, com aprovação do dono:
 * quando a proposta tem `leadId` e esse lead JÁ virou `Negociacao` (F2.18), o vínculo é com a
 * negociação REAL. Sintética só quando não há de onde derivar. Criar uma sintética existindo a
 * real inventaria um registro que a Fase 6 contaria como um segundo negócio.
 *
 * ── A decisão não mora aqui ─────────────────────────────────────────────────────────────────
 * Classificar é `planejarVinculo` (`modules/comercial/vinculo-negociacao.ts`), **puro e
 * testado** — os cinco ramos (real, sintética agrupada, sintética solta, dois abortos) são
 * exercitados por `vitest`, sem depender de fabricar o cenário certo no banco. Este arquivo é a
 * casca: consulta, mostra o plano, e grava se mandarem.
 *
 * ── Por que o `--gravar` é seguro apesar do ⚠️⚠️ do backlog ──────────────────────────────────
 * Só escreve `Proposta.negociacaoId` (coluna que nasceu vazia nesta mesma fase) e, quando
 * preciso, INSERE `Negociacao` nova. Nunca toca `numero`, `token`, `ano`, `sequencial`,
 * `status`, `projetoId`, itens, condições, versões ou `proposta_sequencia` — exatamente os
 * invariantes do `03-migracao.md` §7. O link `/a/proposta/<token>` continua resolvendo pelo
 * mesmo token, porque o token não é escrito em lugar nenhum daqui.
 *
 * ── Recusa por inteiro se algo ficar ambíguo (forma provada na F2.18) ───────────────────────
 * Havendo qualquer aborto, NADA é gravado — nem os vínculos que deram certo. Migrar a parte
 * fácil e deixar a difícil para alguém descobrir depois é pior que não migrar.
 *
 * IDEMPOTENTE por construção: só lê propostas com `negociacaoId IS NULL`. Rodar de novo depois
 * de gravar não encontra nada a fazer.
 *
 *   tsx --tsconfig tsconfig.server.json scripts/migrar-proposta-negociacao-f52.ts            # dry-run
 *   tsx --tsconfig tsconfig.server.json scripts/migrar-proposta-negociacao-f52.ts --gravar
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { planejarVinculo } from "../src/modules/comercial/vinculo-negociacao";
import { executarVinculo, carregarPendentes } from "../src/modules/comercial/migracao-vinculo";

const GRAVAR = process.argv.includes("--gravar");

async function main() {
  const { pendentes, leads, negociacoes } = await carregarPendentes(prisma);

  console.log(`\n${pendentes.length} proposta(s) sem negociação vinculada.\n`);
  if (pendentes.length === 0) {
    console.log("Nada a fazer — todas as propostas já têm negociação (ou não há propostas).");
    return;
  }

  const { planos, abortos } = planejarVinculo(pendentes, leads, negociacoes);

  if (abortos.length > 0) {
    console.log("✖ ABORTANDO — nada foi gravado. Situações que este script se recusa a adivinhar:\n");
    for (const a of abortos) console.log(`   ${a}`);
    console.log("\nResolva os casos acima e rode de novo.");
    process.exitCode = 1;
    return;
  }

  const reais = planos.filter((p) => p.tipo === "real");
  const sinteticas = planos.filter((p) => p.tipo === "sintetica");
  const grupos = new Set(sinteticas.map((s) => (s.tipo === "sintetica" ? s.chaveGrupo : "")));

  console.log(`${reais.length} proposta(s) → negociação REAL (derivada do lead):`);
  for (const r of reais) {
    if (r.tipo === "real") console.log(`   ${r.numero} → "${r.tituloNegociacao}" (${r.negociacaoId})`);
  }
  console.log(
    `\n${sinteticas.length} proposta(s) → negociação SINTÉTICA ` +
      `(${grupos.size} negociação(ões) a criar, needsReview=true):`,
  );
  for (const s of sinteticas) {
    if (s.tipo === "sintetica") {
      console.log(
        `   ${s.numero} "${s.titulo}" → estágio ${s.estagio}` +
          `${s.leadId ? ` (grupo do lead ${s.leadId})` : " (sem lead)"}`,
      );
    }
  }

  if (!GRAVAR) {
    console.log("\nDry-run — nada gravado. Rode com --gravar para persistir.");
    return;
  }

  const out = await executarVinculo(prisma, planos);
  console.log(
    `\nGravado: ${out.vinculadasAReal} vínculo(s) com negociação existente, ` +
      `${out.negociacoesCriadas} negociação(ões) sintética(s) criada(s) para ${out.vinculadasASintetica} proposta(s).`,
  );
  console.log("Confira as sintéticas na lista de revisão (needsReview) antes de considerar a migração fechada.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
