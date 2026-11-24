/**
 * Carga do "100% sem datas = concluída como planejado" (2026-11-24): as atividades da EAP que JÁ estão em 100% sem
 * término real ganham as datas reais pela regra de `src/modules/planejamento/concluir-pelo-planejado.ts` — linha de base
 * (senão o previsto), término limitado a hoje, início real já gravado mantido — e passam a concluída. A partir do deploy a
 * célula do %, o painel da linha e o "Atualizar tarefa" fazem isso sozinhos; este script cobre as linhas de antes.
 *
 * RODAR UMA VEZ NO DEPLOY (simula primeiro):
 *
 *   npm run eap:concluir-pelo-planejado                (simula: lista o que mudaria)
 *   npm run eap:concluir-pelo-planejado -- --gravar    (grava e reagenda cada projeto tocado)
 *
 * Fora: marco, agrupamento, bloqueada, suspensa, cancelada, arquivada e já concluída. Cada linha grava com trilha na
 * auditoria (acao `concluir-pelo-planejado-carga`), condicionada ao estado lido. Rodar de novo não muda nada.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { diaDeSaoPaulo } from "../src/lib/data";
import { paraDia, reagendarProjeto } from "../src/modules/planejamento/agenda";
import { sincronizarCards } from "../src/modules/planejamento/recursos-service";
import { datasPeloPlanejado, rotuloDaOrigem } from "../src/modules/planejamento/concluir-pelo-planejado";
import { SELECT_CONCLUSAO, concluirPeloPlanejadoNoTx } from "../src/modules/planejamento/concluir-pelo-planejado-service";
import { sincronizarPrevisoesDoProjeto } from "../src/modules/juridico/contrato/previsao-service";

const gravar = process.argv.includes("--gravar");
const dia = (d: Date | null) => (d ? paraDia(d) : null);

async function main() {
  const hoje = diaDeSaoPaulo();
  const linhas = await prisma.eapTarefa.findMany({
    where: {
      progresso: { gte: 100 },
      fimReal: null,
      tipoEap: { not: "mrc" },
      status: { notIn: ["blq", "sus", "can", "arq", "con"] },
      filhas: { none: {} },
    },
    select: { ...SELECT_CONCLUSAO, id: true, nome: true, projeto: { select: { id: true, codigo: true } } },
    orderBy: [{ projetoId: "asc" }, { ordem: "asc" }],
  });

  const mudancas = linhas.flatMap((l) => {
    const d = datasPeloPlanejado(
      {
        inicioReal: dia(l.inicioReal),
        inicioBaseline: dia(l.inicioBaseline),
        fimBaseline: dia(l.fimBaseline),
        inicioPrevisto: dia(l.inicioPrevisto),
        fimPrevisto: dia(l.fimPrevisto),
      },
      hoje,
    );
    return d ? [{ linha: l, datas: d }] : [];
  });

  for (const { linha: l, datas: d } of mudancas) {
    console.log(`  ${l.projeto.codigo}  ${d.inicioReal} – ${d.fimReal}  (${rotuloDaOrigem(d.origem)}, ${l.status} → con)  ${l.nome}`);
  }
  console.log(`\n${mudancas.length} atividade(s) em 100% sem término real (de ${linhas.length} candidata(s)).`);

  if (!gravar) {
    console.log("Simulação: nada gravado. Rode com --gravar para aplicar.");
    return;
  }
  if (mudancas.length === 0) return;
  // Autor da trilha e do reagendamento: um superusuário ativo (não há sessão num script).
  const admin = await prisma.user.findFirst({ where: { superUsuario: true, ativo: true }, select: { id: true } });
  if (!admin) {
    console.log("Sem superusuário ativo para assinar a carga — nada gravado.");
    process.exitCode = 1;
    return;
  }
  const projetos = new Set<string>();
  let puladas = 0;
  for (const { linha: l, datas: d } of mudancas) {
    try {
      await prisma.$transaction((tx) => concluirPeloPlanejadoNoTx(tx, l.id, l, d, admin.id, "concluir-pelo-planejado-carga"));
      projetos.add(l.projeto.id);
    } catch (e) {
      puladas++;
      console.log(`  pulada (mudou durante a carga): ${l.nome} —`, e instanceof Error ? e.message : e);
    }
  }
  for (const projetoId of projetos) {
    await reagendarProjeto(projetoId, admin.id);
    await sincronizarCards(prisma, projetoId, admin.id);
    try {
      await sincronizarPrevisoesDoProjeto(projetoId, admin.id);
    } catch (e) {
      console.log(`  aviso: previsão de recebimento do projeto ${projetoId} não sincronizou —`, e instanceof Error ? e.message : e);
    }
  }
  console.log(`Gravado: ${mudancas.length - puladas} linha(s) concluída(s), ${projetos.size} projeto(s) reagendado(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
