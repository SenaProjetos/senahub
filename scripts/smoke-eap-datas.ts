/**
 * Smoke das datas digitadas na EAP (Fase D do plano 2026-10-23-eap-fases-d-e-datas-e-modelo) contra o banco de dev. O vitest
 * cobre as regras puras (`datas-linha.ts`); aqui vai o I/O sobre o motor:
 *   - o TÉRMINO digitado vira duração (dias úteis do início do motor ao término), sem restrição;
 *   - o INÍCIO digitado vira a restrição "não iniciar antes de" e o motor respeita (ou mantém a data real, se não dá);
 *   - agrupamento, marco e data impossível são recusados e nada muda;
 *   - "mover junto": as restrições andam os mesmos dias úteis que o início do projeto.
 *
 * Uso: npm run smoke:eap-datas
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { reagendarProjeto } from "../src/modules/planejamento/agenda";
import { definirInicioDaLinha, definirTerminoDaLinha, moverRestricoesDoProjeto } from "../src/modules/planejamento/datas-linha-service";
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

const tag = `smoke-eap-datas-${Date.now()}`;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const dia = (x: Date | null) => x?.toISOString().slice(0, 10) ?? null;

async function main() {
  const admin = await prisma.user.findFirst({ where: { superUsuario: true, ativo: true }, select: { id: true } });
  if (!admin) {
    console.log("Banco de dev sem admin — rode `npm run db:seed`.");
    process.exitCode = 1;
    return;
  }
  const cliente = await prisma.cliente.create({ data: { nome: `${tag}-cliente` } });
  const projeto = await prisma.projeto.create({
    data: { codigo: `${Date.now()}`.slice(-6), ano: new Date().getFullYear(), sequencial: Number(`${Date.now()}`.slice(-5)), nome: `${tag}-projeto`, clienteId: cliente.id },
  });

  try {
    await prisma.cronogramaProjeto.create({ data: { projetoId: projeto.id, inicioProjeto: d("2026-10-05") } });
    let ordem = 0;
    const nova = async (nome: string, parentId: string | null, tipoEap: "res" | "atv" | "mrc", duracao: number) => {
      const [idCorporativo] = await reservarIdsParaLinhas(prisma, [tipoEap]);
      return prisma.eapTarefa.create({
        data: { projetoId: projeto.id, idCorporativo, nome, parentId, tipoEap, duracaoDias: duracao, ordem: ordem++, inicioPrevisto: d("2026-10-05"), fimPrevisto: d("2026-10-05") },
      });
    };
    // P › A (5d), B (3d, depois de A), M (marco). Atenção: 12/10 e 02/11 são feriados nacionais — o calendário do motor os pula.
    const P = await nova("P", null, "res", 0);
    const A = await nova("A", P.id, "atv", 5);
    const B = await nova("B", P.id, "atv", 3);
    const M = await nova("M", P.id, "mrc", 0);
    await prisma.eapDependencia.create({ data: { tarefaId: B.id, predecessoraId: A.id, tipo: "fs", lagDias: 0 } });
    await reagendarProjeto(projeto.id, admin.id);
    const linha = (id: string) => prisma.eapTarefa.findUniqueOrThrow({ where: { id }, select: { duracaoDias: true, inicioPrevisto: true, fimPrevisto: true, restricaoTipo: true, restricaoData: true } });

    // ── término digitado → duração ───────────────────────────────────────────
    check("preparo: A começa na segunda 05/10 e termina na sexta 09/10 (B começa na terça 13/10: 12/10 é feriado)", dia((await linha(A.id)).inicioPrevisto) === "2026-10-05" && dia((await linha(A.id)).fimPrevisto) === "2026-10-09");
    const t1 = await definirTerminoDaLinha({ id: A.id, data: "2026-10-07" });
    const a1 = await linha(A.id);
    check("término de A na quarta 07/10: duração 3 dias úteis, SEM restrição", t1.duracaoDias === 3 && Number(a1.duracaoDias) === 3 && a1.restricaoTipo === null, { t1, a1 });
    const t2 = await definirTerminoDaLinha({ id: A.id, data: "2026-10-10" });
    check("término no sábado 10/10: os dias úteis até ali (5), o sábado não conta", t2.duracaoDias === 5 && Number((await linha(A.id)).duracaoDias) === 5, t2);
    await reagendarProjeto(projeto.id, admin.id);

    const antes = JSON.stringify([await linha(A.id), await linha(B.id)]);
    check("término antes do início: recusa com a data do início", (await erroDe(() => definirTerminoDaLinha({ id: B.id, data: "2026-10-05" }))) === "O término não pode ser antes do início (13/10/2026).", await erroDe(() => definirTerminoDaLinha({ id: B.id, data: "2026-10-05" })));
    await prisma.eapTarefa.update({ where: { id: B.id }, data: { restricaoTipo: "terminar_em", restricaoData: d("2026-10-30") } });
    check("término fixado por restrição de término: recusa em vez de gravar duração que o motor ignora", (await erroDe(() => definirTerminoDaLinha({ id: B.id, data: "2026-10-23" }))) === "Esta linha tem o término fixado por uma restrição. Tire a restrição para mudar o término pela duração.");
    await prisma.eapTarefa.update({ where: { id: B.id }, data: { restricaoTipo: null, restricaoData: null } });
    check("marco não tem término", (await erroDe(() => definirTerminoDaLinha({ id: M.id, data: "2026-10-30" }))) === "Marco não tem término: ele é uma data só. Mude o início.");
    check("agrupamento não tem término nem início editáveis", (await erroDe(() => definirTerminoDaLinha({ id: P.id, data: "2026-10-30" }))) === "Agrupamento: o início e o término vêm das tarefas de dentro." && (await erroDe(() => definirInicioDaLinha({ id: P.id, data: "2026-10-30" }))) === "Agrupamento: o início e o término vêm das tarefas de dentro.");
    check("as recusas não mudaram nada", JSON.stringify([await linha(A.id), await linha(B.id)]) === antes);
    check("linha inexistente", (await erroDe(() => definirInicioDaLinha({ id: "fantasma", data: "2026-10-30" }))) === "Tarefa não encontrada.");

    // ── início digitado → restrição ──────────────────────────────────────────
    await definirInicioDaLinha({ id: B.id, data: "2026-10-30" });
    await reagendarProjeto(projeto.id, admin.id);
    const b1 = await linha(B.id);
    check("início de B em 30/10: restrição 'não iniciar antes de' e o motor respeita", b1.restricaoTipo === "iniciar_nao_antes_de" && dia(b1.restricaoData) === "2026-10-30" && dia(b1.inicioPrevisto) === "2026-10-30" && Number(b1.duracaoDias) === 3, b1);
    await definirInicioDaLinha({ id: B.id, data: "2026-10-01" });
    await reagendarProjeto(projeto.id, admin.id);
    const b2 = await linha(B.id);
    check("início ANTES do que a predecessora permite: a restrição fica gravada, mas o motor mantém a data real", dia(b2.restricaoData) === "2026-10-01" && dia(b2.inicioPrevisto) === "2026-10-13", b2);
    await definirInicioDaLinha({ id: M.id, data: "2026-11-02" });
    check("o marco aceita início", dia((await linha(M.id)).restricaoData) === "2026-11-02");

    // ── mover junto ──────────────────────────────────────────────────────────
    const movidas = await moverRestricoesDoProjeto(projeto.id, "2026-10-05", "2026-10-12");
    check("mover junto: as 2 restrições andam 5 dias úteis", movidas.movidas === 2 && dia((await linha(B.id)).restricaoData) === "2026-10-08" && dia((await linha(M.id)).restricaoData) === "2026-11-10", { movidas, b: dia((await linha(B.id)).restricaoData), m: dia((await linha(M.id)).restricaoData) });
    check("linha sem restrição não muda", (await linha(A.id)).restricaoData === null);
    check("sem início anterior não há o que deslocar", (await moverRestricoesDoProjeto(projeto.id, null, "2026-10-12")).movidas === 0);
    check("mesmo início: nada anda", (await moverRestricoesDoProjeto(projeto.id, "2026-10-12", "2026-10-12")).movidas === 0);
  } finally {
    await prisma.eapTarefa.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.cronogramaProjeto.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.projeto.delete({ where: { id: projeto.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
  }

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
