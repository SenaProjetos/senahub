/**
 * Reparo: revisões "em análise" que ficaram sem nenhum arquivo voltam para "em andamento".
 *
 *   npx tsx --tsconfig tsconfig.server.json scripts/devolver-revisoes-sem-arquivo.ts           # só lê: relatório
 *   npx tsx --tsconfig tsconfig.server.json scripts/devolver-revisoes-sem-arquivo.ts --gravar  # grava
 *
 * Até 2026-11-05 a exclusão definitiva (lixeira) apagava os arquivos e deixava a revisão "em análise",
 * vazia: o documento sumia da árvore e todo envio com o mesmo nome era recusado com "A R00 está em
 * análise". Desde então a exclusão (e o próprio envio, ao cair numa delas) devolve a revisão sozinha; este
 * script corrige de uma vez as que ficaram antes.
 *
 * A escrita é a mesma da exclusão (`devolverRevisoesSemArquivo`, serviço do ciclo): transação, evento no
 * histórico do documento, motivo "Os arquivos da revisão foram excluídos em definitivo.". Arquivo na
 * lixeira conta como arquivo (ainda pode voltar); revisão bloqueada não muda. Idempotente.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { devolverRevisoesSemArquivo } from "../src/modules/uploads/ciclo/service";
import { rotuloRevisao } from "../src/lib/utils";
import { participaDoCiclo } from "../src/modules/uploads/ciclo/escopo";

const GRAVAR = process.argv.includes("--gravar");

async function main() {
  const lidas = await prisma.documentoRevisao.findMany({
    // Leitura aninhada: `uploads: none` enxerga lixeira e versões substituídas (os filtros automáticos não se aplicam).
    where: { estado: "compartilhado", uploads: { none: {} } },
    select: {
      id: true,
      numero: true,
      estadoEm: true,
      controles: { where: { removidoEm: null, tipo: "bloqueio" }, select: { id: true } },
      documento: { select: { chave: true, nomeArquivo: true, disciplina: { select: { projeto: { select: { codigo: true } } } } } },
    },
    orderBy: [{ documento: { nomeArquivo: "asc" } }, { numero: "asc" }],
  });
  // Mesma regra de escopo do serviço — fora do ciclo o estado não muda.
  const vazias = lidas.filter((r) => participaDoCiclo({ chave: r.documento.chave, extensoes: [] }));

  if (vazias.length === 0) {
    console.log("Nenhuma revisão em análise sem arquivo.");
    return;
  }

  console.log(`${vazias.length} revisão(ões) em análise sem nenhum arquivo:`);
  for (const r of vazias) {
    const bloqueio = r.controles.length > 0 ? "  [BLOQUEADA — fica como está]" : "";
    console.log(
      `  ${r.documento.disciplina.projeto.codigo}  ${r.documento.nomeArquivo}  ${rotuloRevisao(r.numero)}  em análise desde ${r.estadoEm.toISOString()}${bloqueio}`,
    );
  }

  if (!GRAVAR) {
    console.log("\nSó leitura. Rode com --gravar para devolver para em andamento.");
    return;
  }

  const devolvidas = await devolverRevisoesSemArquivo(vazias.map((r) => r.id));
  console.log(`\n${devolvidas} revisão(ões) devolvida(s) para em andamento.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
