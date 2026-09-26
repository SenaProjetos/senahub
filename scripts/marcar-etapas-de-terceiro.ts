/**
 * Converte as etapas de terceiro que eram reconhecidas pela ORIGEM da linha para a marca nova:
 * o recurso "Externo" (`PapelEap.ext`). Decisão #1 do time, 2026-09-25 — ver
 * `docs/superpowers/specs/2026-09-25-planejamento-motor-pendencias.md`.
 *
 * RODAR UMA VEZ, NO DEPLOY, junto com as migrations 20260925160000 / 20260925160100:
 *
 *   npx tsx --tsconfig tsconfig.server.json scripts/marcar-etapas-de-terceiro.ts            (simula)
 *   npx tsx --tsconfig tsconfig.server.json scripts/marcar-etapas-de-terceiro.ts --gravar   (grava)
 *
 * Por que existe: até aqui "etapa de terceiro" era DEDUZIDA da origem da linha (CLI, ARQ, EXT,
 * FIS, APR, CON, OBR). A partir da decisão #1 quem responde é o recurso. Sem este script, toda
 * linha antiga que dependia da origem volta a contar como trabalho da casa: ganha card quando o
 * cronograma for aprovado e passa a ser cobrada de horas e de responsável.
 *
 * Por que a lista de origens vive AQUI e não em `recursos.ts`: ela é a regra ANTIGA, usada uma
 * única vez, na conversão. Deixá-la no módulo manteria duas verdades sobre o que é terceiro —
 * exatamente o que a decisão #1 resolveu.
 *
 * Idempotente: linha que já tem o recurso "Externo" não é tocada. Rodar de novo depois do deploy
 * remarcaria linhas que alguém desmarcou de propósito — então é UMA VEZ, e depois pela tela.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

/** A regra antiga (Doc 02 §14), preservada só para esta conversão. */
const ORIGENS_DE_TERCEIRO = ["CLI", "ARQ", "EXT", "FIS", "APR", "CON", "OBR"];

const gravar = process.argv.includes("--gravar");

async function main() {
  const linhas = await prisma.eapTarefa.findMany({
    where: {
      // Só linha executável: resumo e agrupador não recebem atribuição (`linhaAceitaAtribuicao`).
      tipoEap: { in: ["atv", "mrc"] },
      filhas: { none: {} },
      origem: { sigla: { in: ORIGENS_DE_TERCEIRO } },
      atribuicoes: { none: { papel: "ext" } },
    },
    select: {
      id: true,
      nome: true,
      codigoEap: true,
      origem: { select: { sigla: true } },
      projeto: { select: { codigo: true } },
      _count: { select: { atribuicoes: true } },
    },
    orderBy: [{ projetoId: "asc" }, { ordem: "asc" }],
  });

  if (linhas.length === 0) {
    console.log("Nenhuma linha antiga marcada pela origem — nada a converter.");
    return;
  }

  for (const l of linhas) {
    const gente = l._count.atribuicoes > 0 ? ` · ${l._count.atribuicoes} atribuição(ões) da casa mantida(s)` : "";
    console.log(`  ${l.projeto.codigo} ${l.codigoEap ?? "?"} [${l.origem?.sigla}] ${l.nome}${gente}`);
  }

  if (!gravar) {
    console.log(`\nSeriam marcadas ${linhas.length} linha(s) como etapa de terceiro. Rode com --gravar para aplicar.`);
    return;
  }

  // `createMany` numa tacada: a atribuição externa não tem pessoa nem horas, então não há
  // principal a recalcular nem card a sincronizar (a linha de terceiro justamente não gera card).
  const r = await prisma.eapAtribuicao.createMany({
    data: linhas.map((l) => ({ tarefaId: l.id, papel: "ext" as const, horasPrevistas: 0 })),
  });
  console.log(`\nMarcadas ${r.count} linha(s) como etapa de terceiro.`);
  console.log("Reagende os projetos afetados (qualquer edição da EAP já reagenda) para as horas saírem do motor.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
