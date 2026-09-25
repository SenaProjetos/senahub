/**
 * Smoke da edição do cronograma direto na tabela (nível 2 do layout estilo MS Project) contra o banco de dev.
 * O vitest cobre as regras puras (`ciclo-dependencias`, `gantt-linhas`); aqui vai o I/O:
 *
 *   1. Troca do conjunto de predecessoras de uma linha (célula Predecessoras): cria, altera tipo/atraso, tira
 *      o que sumiu, é idempotente e limpa com conjunto vazio.
 *   2. Recusas do servidor: ciclo, linha citando a si mesma, predecessora repetida ou de outro projeto.
 *
 *   3. Estrutura da árvore como no Project: recuar (vira subtarefa da de cima), avançar (sobe um nível, levando
 *      as irmãs de baixo como filhas) e inserir acima — conferidos pelo código da EAP (1.1, 1.2…) que sai do banco.
 *
 * Uso: npm run smoke:editar-cronograma
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { trocarPredecessoras } from "../src/modules/planejamento/dependencias-service";
import { reservarIdsParaLinhas } from "../src/modules/planejamento/id-corporativo";
import { avancarLinha, inserirLinhaAcima, recuarLinha } from "../src/modules/planejamento/arvore-service";
import { calcularCodigos } from "../src/modules/planejamento/codigo-eap";

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
  const arvore = await novoProjeto("arvore", 2);

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

    // ── 3) árvore ─────────────────────────────────────────────────────────────────
    const admin = await prisma.user.findFirst({ where: { role: "admin" }, select: { id: true } });
    const nova = async (nome: string, parentId: string | null, ordem: number, tipoEap: "atv" | "mrc" = "atv") => {
      const [idCorporativo] = await reservarIdsParaLinhas(prisma, [tipoEap]);
      return prisma.eapTarefa.create({
        data: { projetoId: arvore.id, idCorporativo, nome, parentId, tipoEap, duracaoDias: tipoEap === "mrc" ? 0 : 2, ordem, inicioPrevisto: d("2026-10-05"), fimPrevisto: d("2026-10-06") },
      });
    };
    const R1 = await nova("R1", null, 0);
    const TA = await nova("A", R1.id, 1);
    const TB = await nova("B", R1.id, 2);
    const TC = await nova("C", R1.id, 3);
    const R2 = await nova("R2", null, 4);
    /** Código da EAP de cada linha (por nome), como a tela os numera. */
    const codigos = async () => {
      const linhas = await prisma.eapTarefa.findMany({ where: { projetoId: arvore.id }, select: { id: true, nome: true, parentId: true, ordem: true } });
      const porId = new Map(linhas.map((l) => [l.id, l.nome]));
      return Object.fromEntries(calcularCodigos(linhas).map((c) => [porId.get(c.id)!, c.codigo]));
    };
    check("árvore inicial: R1 (A, B, C) e R2", JSON.stringify(await codigos()) === JSON.stringify({ R1: "1", A: "1.1", B: "1.2", C: "1.3", R2: "2" }), await codigos());

    const primeiraRecusa = await erroDe(() => recuarLinha(TA.id));
    check("recuar a primeira irmã é recusado", !!primeiraRecusa && /Não há uma tarefa acima/.test(primeiraRecusa), primeiraRecusa);

    await recuarLinha(TB.id);
    check("recuar B: vira subtarefa de A", JSON.stringify(await codigos()) === JSON.stringify({ R1: "1", A: "1.1", B: "1.1.1", C: "1.2", R2: "2" }), await codigos());

    await avancarLinha(TB.id);
    check("avançar B: volta ao nível de A, logo depois dele", JSON.stringify(await codigos()) === JSON.stringify({ R1: "1", A: "1.1", B: "1.2", C: "1.3", R2: "2" }), await codigos());

    await avancarLinha(TA.id);
    check(
      "avançar A: sobe para a raiz, logo depois de R1, e leva B e C como filhas",
      JSON.stringify(await codigos()) === JSON.stringify({ R1: "1", A: "2", B: "2.1", C: "2.2", R2: "3" }),
      await codigos(),
    );
    const raizRecusa = await erroDe(() => avancarLinha(R1.id));
    check("avançar quem já está na raiz é recusado", !!raizRecusa && /nível mais alto/.test(raizRecusa), raizRecusa);

    const novaRaiz = await inserirLinhaAcima(R2.id);
    check(
      "inserir acima de R2: nasce na raiz, antes dele",
      JSON.stringify(await codigos()) === JSON.stringify({ R1: "1", A: "2", B: "2.1", C: "2.2", "Nova tarefa": "3", R2: "4" }),
      await codigos(),
    );
    const criada = await prisma.eapTarefa.findUniqueOrThrow({ where: { id: novaRaiz.novaId } });
    check("a nova linha é atividade de 1 dia, com ID corporativo próprio", criada.tipoEap === "atv" && Number(criada.duracaoDias) === 1 && !!criada.idCorporativo, criada.idCorporativo);

    await inserirLinhaAcima(TB.id);
    const cods = await codigos();
    check("inserir acima de B (filha de A): nasce como filha de A, antes de B", cods["B"] === "2.2" && cods["C"] === "2.3", cods);

    // marco não recebe subtarefa
    const M = await nova("M", null, 100, "mrc");
    const L = await nova("L", null, 101);
    const marcoRecusa = await erroDe(() => recuarLinha(L.id));
    check("recuar sob um marco é recusado", !!marcoRecusa && /marco/.test(marcoRecusa), marcoRecusa);
    void M;

    // novo pai que tinha gente vira agrupamento: avisa
    if (admin) {
      const X = await nova("X (tem gente)", null, 200);
      const Y = await nova("Y", null, 201);
      await prisma.eapAtribuicao.create({ data: { tarefaId: X.id, userId: admin.id, papel: "pro", horasPrevistas: 8, principal: true } });
      const r = await recuarLinha(Y.id);
      check("recuar sob quem tem gente avisa que o pai virou agrupamento com pessoas", r.paiVirouAgrupamentoComGente === true, r);
    }
    void TC;
  } finally {
    await prisma.eapTarefa.deleteMany({ where: { projetoId: { in: [projeto.id, outro.id, arvore.id] } } });
    await prisma.projeto.deleteMany({ where: { id: { in: [projeto.id, outro.id, arvore.id] } } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
  }

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
