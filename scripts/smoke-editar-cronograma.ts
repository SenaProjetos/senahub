/**
 * Smoke da edição do cronograma direto na tabela (nível 2 do layout estilo MS Project) contra o banco de dev.
 * O vitest cobre as regras puras (`ciclo-dependencias`, `gantt-linhas`); aqui vai o I/O:
 *
 *   1. Troca do conjunto de predecessoras de uma linha (célula Predecessoras): cria, altera tipo/atraso, tira
 *      o que sumiu, é idempotente e limpa com conjunto vazio.
 *   2. Recusas do servidor: ciclo, linha citando a si mesma, predecessora repetida ou de outro projeto.
 *
 * Uso: npm run smoke:editar-cronograma
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { trocarPredecessoras } from "../src/modules/planejamento/dependencias-service";
import { reservarIdsParaLinhas } from "../src/modules/planejamento/id-corporativo";

let falhas = 0;
function check(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ""}`);
  }
}

async function erroDe(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const tag = `smoke-editcron-${Date.now()}`;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function main() {
  const cliente = await prisma.cliente.create({ data: { nome: `${tag}-cliente` } });
  const novoProjeto = (nome: string, n: number) =>
    prisma.projeto.create({
      data: {
        codigo: `${Date.now()}`.slice(-6),
        ano: new Date().getFullYear(),
        sequencial: Number(`${Date.now()}`.slice(-5)) + n,
        nome: `${tag}-${nome}`,
        clienteId: cliente.id,
      },
    });
  const projeto = await novoProjeto("a", 0);
  const outro = await novoProjeto("b", 1);

  try {
    const linha = async (projetoId: string, nome: string, ordem: number) => {
      const [id] = await reservarIdsParaLinhas(prisma, ["atv"]);
      return prisma.eapTarefa.create({
        data: {
          projetoId,
          idCorporativo: id,
          nome,
          tipoEap: "atv",
          duracaoDias: 3,
          ordem,
          inicioPrevisto: d("2026-10-05"),
          fimPrevisto: d("2026-10-07"),
        },
      });
    };
    const A = await linha(projeto.id, "A", 0);
    const B = await linha(projeto.id, "B", 1);
    const C = await linha(projeto.id, "C", 2);
    const X = await linha(outro.id, "X (outro projeto)", 0);
    const vinculosDe = (id: string) =>
      prisma.eapDependencia.findMany({ where: { tarefaId: id }, select: { predecessoraId: true, tipo: true, lagDias: true } });

    // 1) conjunto novo
    const r1 = await trocarPredecessoras({ tarefaId: B.id, vinculos: [{ predecessoraId: A.id, tipo: "fs", lagDias: 0 }] });
    check("cria a primeira predecessora", r1.criadas === 1 && r1.alteradas === 0 && r1.removidas === 0 && r1.projetoId === projeto.id, r1);

    const r2 = await trocarPredecessoras({
      tarefaId: C.id,
      vinculos: [
        { predecessoraId: A.id, tipo: "ss", lagDias: 2 },
        { predecessoraId: B.id, tipo: "ff", lagDias: -1 },
      ],
    });
    check("cria duas de uma vez, com tipo e atraso (inclusive negativo)", r2.criadas === 2, r2);
    const v2 = await vinculosDe(C.id);
    check(
      "gravou tipo e atraso certos",
      v2.some((v) => v.predecessoraId === A.id && v.tipo === "ss" && Number(v.lagDias) === 2) &&
        v2.some((v) => v.predecessoraId === B.id && v.tipo === "ff" && Number(v.lagDias) === -1),
      v2,
    );

    // 2) troca: sai A, B muda de tipo e atraso
    const r3 = await trocarPredecessoras({ tarefaId: C.id, vinculos: [{ predecessoraId: B.id, tipo: "fs", lagDias: 1.5 }] });
    check("troca o conjunto: tira uma, altera a que ficou", r3.criadas === 0 && r3.alteradas === 1 && r3.removidas === 1, r3);
    const v3 = await vinculosDe(C.id);
    check("ficou só B, término→início com 1,5 dia", v3.length === 1 && v3[0].predecessoraId === B.id && v3[0].tipo === "fs" && Number(v3[0].lagDias) === 1.5, v3);

    // 3) idempotente
    const r4 = await trocarPredecessoras({ tarefaId: C.id, vinculos: [{ predecessoraId: B.id, tipo: "fs", lagDias: 1.5 }] });
    check("repetir o mesmo conjunto não muda nada", r4.criadas === 0 && r4.alteradas === 0 && r4.removidas === 0, r4);

    // 4) recusas
    const ciclo = await erroDe(() => trocarPredecessoras({ tarefaId: A.id, vinculos: [{ predecessoraId: C.id, tipo: "fs", lagDias: 0 }] }));
    check("ciclo A ← C (C ← B ← A) é recusado", !!ciclo && /ciclo/.test(ciclo), ciclo);
    check("…e nada foi gravado", (await vinculosDe(A.id)).length === 0);
    const propria = await erroDe(() => trocarPredecessoras({ tarefaId: A.id, vinculos: [{ predecessoraId: A.id, tipo: "fs", lagDias: 0 }] }));
    check("linha citando a si mesma é recusada", !!propria && /dela mesma/.test(propria), propria);
    const repetida = await erroDe(() =>
      trocarPredecessoras({
        tarefaId: C.id,
        vinculos: [
          { predecessoraId: A.id, tipo: "fs", lagDias: 0 },
          { predecessoraId: A.id, tipo: "ss", lagDias: 0 },
        ],
      }),
    );
    check("predecessora repetida é recusada", !!repetida && /repetidas/.test(repetida), repetida);
    const fora = await erroDe(() => trocarPredecessoras({ tarefaId: C.id, vinculos: [{ predecessoraId: X.id, tipo: "fs", lagDias: 0 }] }));
    check("predecessora de outro projeto é recusada", !!fora && /mesmo projeto/.test(fora), fora);
    const semLinha = await erroDe(() => trocarPredecessoras({ tarefaId: "nao-existe", vinculos: [] }));
    check("linha inexistente é recusada", !!semLinha && /não encontrada/.test(semLinha), semLinha);
    check("recusas não mexeram nas predecessoras de C", (await vinculosDe(C.id)).length === 1);

    // 5) esvaziar
    const r5 = await trocarPredecessoras({ tarefaId: C.id, vinculos: [] });
    check("conjunto vazio limpa as predecessoras", r5.removidas === 1 && (await vinculosDe(C.id)).length === 0, r5);
  } finally {
    await prisma.eapTarefa.deleteMany({ where: { projetoId: { in: [projeto.id, outro.id] } } });
    await prisma.projeto.deleteMany({ where: { id: { in: [projeto.id, outro.id] } } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
  }

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
