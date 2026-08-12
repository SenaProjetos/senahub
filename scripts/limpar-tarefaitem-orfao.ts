/**
 * Limpa ponteiros ÓRFÃOS de checklist: `Pendencia.tarefaItemId` e
 * `ApontamentoCoordenacao.tarefaItemId` apontando para um `TarefaItem` que não existe mais.
 *
 * Por que existiam: `tarefaItemId` é ponteiro SEM FK (de propósito — o apontamento sobrevive à
 * tarefa), e o `editarTarefa` antigo apagava/recriava TODO o checklist a cada edição, trocando
 * os ids. Com o ponteiro órfão, qualquer transição do apontamento (resolver/assumir/fechar/
 * não procede/adiar) estourava P2025 no Prisma e chegava ao usuário como
 * "Erro ao processar a solicitação.".
 *
 * O `editarTarefa` já foi corrigido (reconcilia por id); este script conserta o passivo.
 * Só zera o ponteiro — NÃO muda status de apontamento nem mexe em tarefa. Idempotente.
 *
 * Uso:
 *   npx tsx --tsconfig tsconfig.server.json scripts/limpar-tarefaitem-orfao.ts          # relatório
 *   npx tsx --tsconfig tsconfig.server.json scripts/limpar-tarefaitem-orfao.ts --aplicar # grava
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";

const aplicar = process.argv.includes("--aplicar");

async function orfaosDe(
  rotulo: string,
  lista: { id: string; tarefaItemId: string | null }[],
): Promise<string[]> {
  const ponteiros = [...new Set(lista.map((l) => l.tarefaItemId).filter((v): v is string => !!v))];
  if (ponteiros.length === 0) return [];
  const existentes = new Set(
    (await prisma.tarefaItem.findMany({ where: { id: { in: ponteiros } }, select: { id: true } })).map((i) => i.id),
  );
  const ids = lista.filter((l) => l.tarefaItemId && !existentes.has(l.tarefaItemId)).map((l) => l.id);
  console.log(`${rotulo}: ${lista.length} com ponteiro, ${ids.length} órfão(s).`);
  return ids;
}

async function main() {
  const pendencias = await prisma.pendencia.findMany({
    where: { tarefaItemId: { not: null } },
    select: { id: true, tarefaItemId: true },
  });
  const apontamentos = await prisma.apontamentoCoordenacao.findMany({
    where: { tarefaItemId: { not: null } },
    select: { id: true, tarefaItemId: true },
  });

  const pendOrfas = await orfaosDe("Pendencia (apontamentos de prancha)", pendencias);
  const coordOrfas = await orfaosDe("ApontamentoCoordenacao (BIM)", apontamentos);

  if (!aplicar) {
    console.log("\nModo relatório. Rode de novo com --aplicar para zerar os ponteiros acima.");
    return;
  }
  if (pendOrfas.length > 0) {
    const r = await prisma.pendencia.updateMany({ where: { id: { in: pendOrfas } }, data: { tarefaItemId: null } });
    console.log(`Pendencia: ${r.count} ponteiro(s) zerado(s).`);
  }
  if (coordOrfas.length > 0) {
    const r = await prisma.apontamentoCoordenacao.updateMany({
      where: { id: { in: coordOrfas } },
      data: { tarefaItemId: null },
    });
    console.log(`ApontamentoCoordenacao: ${r.count} ponteiro(s) zerado(s).`);
  }
  if (pendOrfas.length === 0 && coordOrfas.length === 0) console.log("Nada a fazer.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
