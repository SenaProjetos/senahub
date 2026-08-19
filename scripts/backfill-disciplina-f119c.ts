/**
 * Backfill do F1.19c: `Disciplina.disciplinaId` (FK para `DisciplinaCatalogo`).
 *
 * Fica em SCRIPT, não na migration, de propósito — duas razões independentes:
 *
 * 1. Foi o bug da F1.23: `migrate deploy` roda ANTES do `db:seed` no fluxo de deploy
 *    (`deploy/gerenciar-servidor.ps1`). Um `UPDATE` guardado por "se o catálogo já existir"
 *    dentro da migration pode não fazer nada, em silêncio, e nunca mais re-rodar.
 * 2. `disciplina` é a tabela que carrega `valor` — a base do pagamento ao projetista — além de
 *    `RevisaoDisciplina`, uploads, responsáveis e apontamentos. Escrever nela sem alguém ver
 *    antes o que vai mudar é o oposto do que a F1.15 provou ser necessário (foi o dry-run
 *    enumerando tudo que se movia que revelou o 4º registro Záphis que os docs não conheciam).
 *
 * ── Regra de casamento: nome EXATO, nada de aproximação ────────────────────────────────────
 * Mesma regra da F1.19/F1.20. Casar por aproximação aqui apontaria a disciplina para a entrada
 * errada do catálogo, e `Disciplina.valor` vira pagamento de projetista — errar é caro e
 * silencioso. O que não casa por nome exato fica com `disciplinaId = null`, que é estado
 * ESPERADO, não falha: são as 6 grafias que a F1.21 resolve à mão (3 colapsam por decisão já
 * tomada, 3 são string composta e exigem o responsável de cada projeto — `docs/crm/03-migracao.md` §5).
 *
 * ── Idempotente ────────────────────────────────────────────────────────────────────────────
 * Só toca `disciplinaId IS NULL`. Repetir não mexe em quem já foi resolvido — nem por este
 * script, nem à mão pela F1.21. É o que permite rodar de novo depois da F1.21 sem desfazer
 * decisão humana.
 *
 * O relatório lista as pendentes com o que cada uma carrega (valor / revisões / uploads), porque
 * é exatamente essa informação que a F1.21 precisa ter à vista para decidir cada caso.
 *
 * Uso (depois de `npm run db:seed`, que garante o catálogo populado):
 *   tsx --tsconfig tsconfig.server.json scripts/backfill-disciplina-f119c.ts              # dry-run
 *   tsx --tsconfig tsconfig.server.json scripts/backfill-disciplina-f119c.ts --gravar
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const gravar = process.argv.includes("--gravar");

  const catalogo = await prisma.disciplinaCatalogo.findMany({ select: { id: true, nome: true } });
  if (catalogo.length === 0) {
    console.log("Catálogo vazio — rode `npm run db:seed` primeiro. Nada a fazer.");
    return;
  }
  const porNome = new Map(catalogo.map((c) => [c.nome, c.id]));
  console.log(`Catálogo: ${catalogo.length} disciplina(s).`);

  const pendentes = await prisma.disciplina.findMany({
    where: { disciplinaId: null },
    select: {
      id: true,
      disciplinaTextoLegado: true,
      valor: true,
      projeto: { select: { codigo: true, nome: true } },
      // `_count` é leitura ANINHADA e NÃO passa pela extensão de soft delete do `lib/prisma.ts`.
      // Aqui é inofensivo (nenhuma destas tabelas tem `excluidoEm`), mas contar sem pensar nisso
      // já mordeu duas vezes nesta fase (F1.18 e F1.23b) — deixado explícito para o próximo.
      _count: { select: { revisoes: true, uploads: true, responsaveis: true } },
    },
    orderBy: { disciplinaTextoLegado: "asc" },
  });

  if (pendentes.length === 0) {
    console.log("Nenhuma disciplina sem FK. Nada a fazer.");
    return;
  }

  const resolvidas = pendentes.filter((d) => porNome.has(d.disciplinaTextoLegado));
  const semMatch = pendentes.filter((d) => !porNome.has(d.disciplinaTextoLegado));

  console.log(gravar ? "\n[FK] Gravando:" : "\n[FK] [dry-run] resolveria por nome exato:");
  for (const d of resolvidas) {
    console.log(`   ${d.projeto.codigo} · "${d.disciplinaTextoLegado}" -> ${porNome.get(d.disciplinaTextoLegado)}`);
  }

  if (gravar) {
    for (const d of resolvidas) {
      await prisma.disciplina.update({
        where: { id: d.id },
        data: { disciplinaId: porNome.get(d.disciplinaTextoLegado)! },
      });
    }
  }
  console.log(`[FK] ${gravar ? "Feito" : "[dry-run]"}: ${resolvidas.length} disciplina(s).`);

  if (semMatch.length > 0) {
    console.log(`\n[F1.21] ${semMatch.length} disciplina(s) SEM match exato — ficam com FK null, é o esperado:`);
    // Agrupa por grafia: é assim que a F1.21 vai tratar (uma decisão por grafia, não por linha).
    const porGrafia = new Map<string, typeof semMatch>();
    for (const d of semMatch) {
      const lista = porGrafia.get(d.disciplinaTextoLegado) ?? [];
      lista.push(d);
      porGrafia.set(d.disciplinaTextoLegado, lista);
    }
    for (const [grafia, linhas] of [...porGrafia].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))) {
      console.log(`\n   "${grafia}" — ${linhas.length} projeto(s):`);
      for (const d of linhas) {
        const val = d.valor != null ? `R$ ${d.valor}` : "valor NULL";
        console.log(
          `      ${d.projeto.codigo} · ${d.projeto.nome} — ${val}, ` +
            `${d._count.revisoes} revisão(ões), ${d._count.uploads} upload(s), ${d._count.responsaveis} responsável(is)`,
        );
      }
    }
    console.log("\n   Decidir caso a caso na F1.21 — ver docs/crm/03-migracao.md §5.");
  }

  if (!gravar) console.log("\nNada gravado. Repita com --gravar.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
