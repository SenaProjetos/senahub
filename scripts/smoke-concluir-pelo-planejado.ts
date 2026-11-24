/**
 * Smoke do "100% sem datas = concluída como planejado" (2026-11-24) contra o banco de dev, pelos caminhos REAIS da célula
 * do % (`editarLinhaNoBanco`) e do painel da linha (`salvarLinhaNoBanco`). A regra pura está em
 * `concluir-pelo-planejado.test.ts`; o "Atualizar tarefa" em `smoke:progresso-historico`.
 *
 * Uso: npm run smoke:concluir-pelo-planejado
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { editarLinhaNoBanco, salvarLinhaNoBanco } from "../src/modules/planejamento/linha-service";
import { reservarIdsParaLinhas } from "../src/modules/planejamento/id-corporativo";

let falhas = 0;
function check(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ""}`);
  }
}

const tag = `smoke-concluir-${Date.now()}`;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const dia = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : null);
const HOJE = "2026-11-24";
const COM = { hoje: HOJE, podeExecucao: true };

async function main() {
  const admin = await prisma.user.findFirst({ where: { superUsuario: true, ativo: true }, select: { id: true } });
  if (!admin) {
    console.log("Sem admin ativo no banco de dev — rode `npm run db:seed`.");
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
    const nova = async (nome: string, ordem: number, extra: { status?: "blq"; base?: [string, string] | null } = {}) => {
      const [id] = await reservarIdsParaLinhas(prisma, ["atv"]);
      const base = extra.base === undefined ? ["2026-10-01", "2026-10-10"] : extra.base;
      return prisma.eapTarefa.create({
        data: {
          projetoId: projeto.id,
          idCorporativo: id,
          nome: `${tag} ${nome}`,
          tipoEap: "atv",
          duracaoDias: 5,
          progresso: 40,
          ordem,
          status: extra.status ?? "nin",
          inicioPrevisto: d("2026-10-05"),
          fimPrevisto: d("2026-10-20"),
          inicioBaseline: base ? d(base[0]) : null,
          fimBaseline: base ? d(base[1]) : null,
        },
        select: { id: true, nome: true },
      });
    };
    const ler = (id: string) =>
      prisma.eapTarefa.findUniqueOrThrow({ where: { id }, select: { progresso: true, status: true, inicioReal: true, fimReal: true } });
    const erroDe = async (f: () => Promise<unknown>) => {
      try {
        await f();
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    };

    // 1. Célula do %: 100 sem datas → concluída pela linha de base, com trilha.
    const A = await nova("A", 0);
    const rA = await editarLinhaNoBanco({ id: A.id, nome: A.nome, progresso: 100, marco: false }, admin.id, COM);
    const a = await ler(A.id);
    check(
      "célula 100% conclui com as datas da linha de base",
      a.status === "con" && a.progresso === 100 && dia(a.inicioReal) === "2026-10-01" && dia(a.fimReal) === "2026-10-10",
      a,
    );
    check("e devolve a origem para a tela", rA.conclusao?.origem === "linha_base", rA.conclusao);
    const trilha = await prisma.auditLog.count({ where: { entidadeId: A.id, acao: "concluir-pelo-planejado" } });
    check("com a trilha na auditoria", trilha === 1, trilha);

    // 2. Baixar o % da concluída pela célula: recusa, nada muda.
    const eBaixar = await erroDe(() => editarLinhaNoBanco({ id: A.id, nome: A.nome, progresso: 90, marco: false }, admin.id, COM));
    check(
      "baixar o % de concluída pede o Atualizar tarefa",
      eBaixar === "Para reabrir a tarefa, use Atualizar tarefa e informe o % concluído.",
      eBaixar,
    );
    check("e ela segue concluída em 100%", (await ler(A.id)).progresso === 100);

    // 3. Sem a permissão de datas reais: só o número, como antes.
    const B = await nova("B", 1);
    await editarLinhaNoBanco({ id: B.id, nome: B.nome, progresso: 100, marco: false }, admin.id, { hoje: HOJE, podeExecucao: false });
    const b = await ler(B.id);
    check("sem cronograma:executado grava só o %", b.progresso === 100 && b.status === "nin" && b.fimReal === null, b);

    // 4. Bloqueada: só o número.
    const C = await nova("C", 2, { status: "blq" });
    await editarLinhaNoBanco({ id: C.id, nome: C.nome, progresso: 100, marco: false }, admin.id, COM);
    const c = await ler(C.id);
    check("bloqueada grava só o %", c.progresso === 100 && c.status === "blq" && c.fimReal === null, c);

    // 5. Painel da linha, sem linha de base: datas previstas; início real já gravado é mantido.
    const D = await nova("D", 3, { base: null });
    await prisma.eapTarefa.update({ where: { id: D.id }, data: { inicioReal: d("2026-10-07"), status: "and" } });
    const rD = await salvarLinhaNoBanco({ id: D.id, nome: D.nome, progresso: 100, marco: false }, admin.id, COM);
    const dd = await ler(D.id);
    check(
      "painel 100% sem linha de base: término previsto, início real mantido",
      dd.status === "con" && dia(dd.inicioReal) === "2026-10-07" && dia(dd.fimReal) === "2026-10-20" && rD.conclusao?.origem === "previsto",
      { dd, c: rD.conclusao },
    );

    // 6. Linha de base terminando depois de hoje: termina hoje.
    const E = await nova("E", 4, { base: ["2026-11-10", "2026-12-05"] });
    await editarLinhaNoBanco({ id: E.id, nome: E.nome, progresso: 100, marco: false }, admin.id, COM);
    const e = await ler(E.id);
    check("término da linha de base no futuro vira hoje", dia(e.inicioReal) === "2026-11-10" && dia(e.fimReal) === HOJE, e);

    // 7. Painel: baixar o % de concluída recusa antes de gravar o resto (o nome não muda).
    const eNome = await erroDe(() => salvarLinhaNoBanco({ id: A.id, nome: `${A.nome} renomeada`, progresso: 50, marco: false }, admin.id, COM));
    const nomeA = (await prisma.eapTarefa.findUniqueOrThrow({ where: { id: A.id }, select: { nome: true } })).nome;
    check("painel recusa baixar o % sem gravar o nome", eNome !== null && nomeA === A.nome, { eNome, nomeA });
  } finally {
    const linhas = await prisma.eapTarefa.findMany({ where: { projetoId: projeto.id }, select: { id: true } });
    const ids = linhas.map((l) => l.id);
    await prisma.eapProgressoRegistro.deleteMany({ where: { tarefaId: { in: ids } } });
    await prisma.tarefa.deleteMany({ where: { eapTarefaId: { in: ids } } });
    await prisma.eapTarefa.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.cronogramaProjeto.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.projeto.delete({ where: { id: projeto.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
  }

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
