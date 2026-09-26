/**
 * Smoke da etapa de terceiro pelo recurso "Externo" (decisão #1 de 2026-09-25) contra o banco
 * de dev. O vitest cobre as regras puras (`ehEtapaDeTerceiro`, `regraDoRecursoExterno`); aqui
 * vai o que só o banco e o I/O provam:
 *
 *   1. Os dois CHECKs: "Externo" nunca tem pessoa nem horas.
 *   2. O motor: linha de terceiro é ESTIMADA com zero hora (não "sem estimativa"), e o
 *      verificador não cobra responsável dela.
 *   3. O card: cronograma aprovado NÃO gera card da linha de terceiro, mesmo com gente da casa
 *      escalada nela — e gera da linha vizinha, igual em tudo, que não é de terceiro.
 *
 * Uso: npm run smoke:etapa-terceiro
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { planoDoProjeto } from "../src/modules/planejamento/agenda";
import { avaliarQualidade } from "../src/modules/planejamento/service";
import { sincronizarCards } from "../src/modules/planejamento/recursos-service";
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

const tag = `smoke-terceiro-${Date.now()}`;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "admin", ativo: true }, select: { id: true } });
  if (!admin) {
    console.log("Sem admin ativo no banco de dev — rode `npm run db:seed` antes.");
    process.exitCode = 1;
    return;
  }

  const cliente = await prisma.cliente.create({ data: { nome: `${tag}-cliente` } });
  const projeto = await prisma.projeto.create({
    data: {
      codigo: `${Date.now()}`.slice(-6),
      ano: new Date().getFullYear(),
      sequencial: Number(`${Date.now()}`.slice(-5)),
      nome: `${tag}-projeto`,
      clienteId: cliente.id,
    },
  });

  try {
    const linha = async (nome: string, ordem: number) => {
      const [id] = await reservarIdsParaLinhas(prisma, ["atv"]);
      return prisma.eapTarefa.create({
        data: {
          projetoId: projeto.id,
          idCorporativo: id,
          nome: `${tag} ${nome}`,
          tipoEap: "atv",
          duracaoDias: 5,
          ordem,
          inicioPrevisto: d("2026-10-05"),
          fimPrevisto: d("2026-10-09"),
        },
      });
    };

    // A é etapa de terceiro (aprovação na prefeitura); B é igual em tudo, mas da casa.
    const A = await linha("A (prefeitura)", 0);
    const B = await linha("B (da casa)", 1);
    const semNinguem = await linha("C (ninguém escalado)", 2);

    // ── 1. Os dois CHECKs do banco ─────────────────────────────────────────
    const comPessoa = await erroDe(() =>
      prisma.eapAtribuicao.create({ data: { tarefaId: A.id, userId: admin.id, papel: "ext", horasPrevistas: 0 } }),
    );
    check("Externo com pessoa é recusado pelo banco", !!comPessoa && /externo_sem_pessoa/.test(comPessoa), comPessoa);

    const comHoras = await erroDe(() =>
      prisma.eapAtribuicao.create({ data: { tarefaId: A.id, papel: "ext", horasPrevistas: 8 } }),
    );
    check("Externo com horas é recusado pelo banco", !!comHoras && /externo_sem_horas/.test(comHoras), comHoras);

    await prisma.eapAtribuicao.create({ data: { tarefaId: A.id, papel: "ext", horasPrevistas: 0 } });
    // Gente da casa junto na MESMA linha: acompanhar uma etapa de terceiro é legítimo, e não
    // deve ressuscitar o card dela.
    await prisma.eapAtribuicao.create({
      data: { tarefaId: A.id, userId: admin.id, papel: "coo", horasPrevistas: 0, principal: true },
    });
    await prisma.eapAtribuicao.create({
      data: { tarefaId: B.id, userId: admin.id, papel: "pro", horasPrevistas: 16, principal: true },
    });

    // ── 2. Motor e verificador ─────────────────────────────────────────────
    const plano = await planoDoProjeto(projeto.id);
    const hA = plano?.resultado.linhas.get(A.id)?.trabalhoHoras;
    const hB = plano?.resultado.linhas.get(B.id)?.trabalhoHoras;
    const hC = plano?.resultado.linhas.get(semNinguem.id)?.trabalhoHoras;
    check("linha de terceiro é ESTIMADA com zero hora", hA === 0, { hA });
    check("linha da casa soma as horas de quem está nela", hB === 16, { hB });
    check("linha da casa sem ninguém segue sem estimativa (null)", hC === null, { hC });

    const q = await avaliarQualidade(projeto.id);
    const semResp = q.achados.filter((a) => a.regra === "sem_responsavel").map((a) => a.tarefaId);
    check("verificador não cobra responsável da etapa de terceiro", !semResp.includes(A.id), semResp);
    check("e continua cobrando da linha da casa sem ninguém", semResp.includes(semNinguem.id), semResp);

    // ── 3. Card do projetista ──────────────────────────────────────────────
    await prisma.cronogramaProjeto.create({
      data: { projetoId: projeto.id, inicioProjeto: d("2026-10-05"), aprovado: true, aprovadoEm: new Date(), aprovadoPorId: admin.id },
    });
    await sincronizarCards(prisma, projeto.id, admin.id);
    const cards = await prisma.tarefa.findMany({
      where: { eapTarefaId: { in: [A.id, B.id, semNinguem.id] } },
      select: { eapTarefaId: true, titulo: true },
    });
    const comCard = cards.map((c) => c.eapTarefaId);
    check("etapa de terceiro NÃO gera card, mesmo com gente da casa acompanhando", !comCard.includes(A.id), cards);
    check("a linha vizinha, da casa, gera card", comCard.includes(B.id), comCard);

    // Desmarcar devolve a linha para a casa: o card passa a existir na próxima sincronização.
    await prisma.eapAtribuicao.deleteMany({ where: { tarefaId: A.id, papel: "ext" } });
    await sincronizarCards(prisma, projeto.id, admin.id);
    const depois = await prisma.tarefa.count({ where: { eapTarefaId: A.id } });
    check("desmarcar a etapa de terceiro devolve o card para a linha", depois === 1, { depois });
  } finally {
    const linhas = await prisma.eapTarefa.findMany({ where: { projetoId: projeto.id }, select: { id: true } });
    await prisma.tarefa.deleteMany({ where: { eapTarefaId: { in: linhas.map((l) => l.id) } } });
    await prisma.eapTarefa.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.cronogramaProjeto.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.projeto.delete({ where: { id: projeto.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
  }

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
