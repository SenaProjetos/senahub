/**
 * Converte a duração das linhas de EAP que a F0 gravou em DIAS CORRIDOS para DIAS ÚTEIS
 * (regra em `src/modules/planejamento/duracao-legada.ts`).
 *
 * RODAR UMA VEZ NO DEPLOY, logo depois das migrations e ANTES de alguém mexer num cronograma:
 *
 *   npx tsx --tsconfig tsconfig.server.json scripts/converter-duracao-eap.ts            (simula)
 *   npx tsx --tsconfig tsconfig.server.json scripts/converter-duracao-eap.ts --gravar   (grava)
 *
 * Por que existe: a partir do B2, toda mudança no cronograma reagenda o projeto pelo motor, que lê a
 * duração em dias úteis. Uma linha que a F0 deixou com "30" (dias corridos) passaria a durar 30 dias
 * ÚTEIS — o cronograma inteiro esticaria ~40% no primeiro clique, e as datas que o time digitou
 * sumiriam sem aviso.
 *
 * Só cronogramas em RASCUNHO: num aprovado, a linha de base congelou as datas que o motor já calculou,
 * e mudar a duração agora criaria um desvio que ninguém causou. Só a duração que AINDA é a de dias
 * corridos: linha já editada em dias úteis fica como está, e rodar de novo não muda nada.
 *
 * Não reagenda: grava só a duração. As datas continuam as que estavam — elas são justamente o que a
 * conversão preserva.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { montarCalendario, paraDia } from "../src/modules/planejamento/agenda";
import { duracaoConvertida } from "../src/modules/planejamento/duracao-legada";

const gravar = process.argv.includes("--gravar");

async function main() {
  const linhas = await prisma.eapTarefa.findMany({
    where: { projeto: { OR: [{ cronograma: null }, { cronograma: { aprovado: false } }] } },
    select: {
      id: true,
      projetoId: true,
      nome: true,
      tipoEap: true,
      duracaoDias: true,
      inicioPrevisto: true,
      fimPrevisto: true,
      _count: { select: { filhas: true } },
      projeto: { select: { codigo: true } },
    },
  });
  if (linhas.length === 0) {
    console.log("Nenhuma linha de cronograma em rascunho.");
    return;
  }

  const anos = linhas.flatMap((l) => [l.inicioPrevisto.getUTCFullYear(), l.fimPrevisto.getUTCFullYear()]);
  const cal = await montarCalendario([...new Set(anos)]);

  const mudancas: { id: string; codigo: string; nome: string; de: number; para: number }[] = [];
  for (const l of linhas) {
    const para = duracaoConvertida(
      {
        tipoEap: l.tipoEap,
        ehResumo: l._count.filhas > 0,
        duracaoDias: Number(l.duracaoDias),
        inicio: paraDia(l.inicioPrevisto),
        fim: paraDia(l.fimPrevisto),
      },
      cal,
    );
    if (para != null) mudancas.push({ id: l.id, codigo: l.projeto.codigo, nome: l.nome, de: Number(l.duracaoDias), para });
  }

  for (const m of mudancas) console.log(`  ${m.codigo}  ${m.de} corridos → ${m.para} úteis  ${m.nome}`);
  console.log(`\n${mudancas.length} de ${linhas.length} linha(s) em rascunho com duração em dias corridos.`);

  if (!gravar) {
    console.log("Simulação: nada gravado. Rode com --gravar para aplicar.");
    return;
  }
  for (const m of mudancas) {
    await prisma.eapTarefa.update({ where: { id: m.id }, data: { duracaoDias: m.para } });
  }
  console.log(`Gravado: ${mudancas.length} linha(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
