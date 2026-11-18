/**
 * Smoke do início real pelo ponto e do "falta o término real" (2026-11-17) contra o banco de dev. O vitest cobre as
 * regras puras (`inicio-pelo-ponto.ts`, `termino-pendente.ts`); aqui vai a gravação de verdade e a leitura da EAP:
 *
 *  - a primeira hora apontada (pelo card) vira o início real, a linha passa a em andamento e a trilha fica na auditoria;
 *  - rodar de novo não muda nada; hora mais antiga que chega depois não mexe no que já foi preenchido;
 *  - início real digitado vence; marco, agrupamento e suspensa ficam de fora;
 *  - dois preenchimentos ao mesmo tempo gravam uma vez só;
 *  - `depoisDoPontoNaTarefa` reagenda: a data prevista gravada passa a ser o início real;
 *  - sucessora (término → início) começou → a predecessora sai com `terminoPendente` e o último dia de ponto como
 *    sugestão; com o término real informado, some; sem datas, não sai do servidor; vínculo início → início não conta.
 *
 * Uso: npm run smoke:inicio-pelo-ponto
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { diaDeSaoPaulo } from "../src/lib/data";
import { diaLocal } from "../src/modules/ponto/engine";
import { eapDoProjeto } from "../src/modules/planejamento/queries";
import { paraDia, paraDataUtc } from "../src/modules/planejamento/agenda";
import { reservarIdsParaLinhas } from "../src/modules/planejamento/id-corporativo";
import { preencherInicioPeloPonto } from "../src/modules/planejamento/inicio-pelo-ponto-service";
import { depoisDoPontoNaTarefa } from "../src/modules/planejamento/pos-ponto";

let falhas = 0;
function check(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ""}`);
  }
}

const tag = `smoke-iniponto-${Date.now()}`;
const DIA = 86_400_000;
const HORA = 3_600_000;

async function main() {
  const admin = await prisma.user.findFirst({ where: { superUsuario: true, ativo: true }, select: { id: true } });
  const statusAberto = await prisma.tarefaStatus.findFirst({ where: { ativo: true, concluido: false }, select: { id: true } });
  if (!admin || !statusAberto) {
    console.log("Sem admin ativo ou status de tarefa no banco de dev — rode `npm run db:seed`.");
    process.exitCode = 1;
    return;
  }
  const pessoa = await prisma.user.create({
    data: { name: `${tag}-u`, email: `${tag}-u@teste.local`, tipo: "interno", emailVerified: false },
    select: { id: true },
  });
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
    const hoje = diaDeSaoPaulo();
    const agora = Date.now();
    const meioDiaHaDias = (n: number) => new Date(`${diaLocal(new Date(agora - n * DIA))}T12:00:00-03:00`);
    const linha = async (nome: string, ordem: number, extra: { parentId?: string; tipoEap?: "atv" | "mrc" } = {}) => {
      const tipoEap = extra.tipoEap ?? "atv";
      const [id] = await reservarIdsParaLinhas(prisma, [tipoEap]);
      return prisma.eapTarefa.create({
        data: {
          projetoId: projeto.id,
          parentId: extra.parentId ?? null,
          idCorporativo: id,
          nome: `${tag} ${nome}`,
          tipoEap,
          duracaoDias: tipoEap === "mrc" ? 0 : 10,
          ordem,
          inicioPrevisto: new Date(agora - 20 * DIA),
          fimPrevisto: new Date(agora + 5 * DIA),
        },
        select: { id: true },
      });
    };
    const card = (eapTarefaId: string, nome: string) =>
      prisma.tarefa.create({
        data: { titulo: `${tag} card ${nome}`, statusId: statusAberto.id, projetoId: projeto.id, criadorId: admin.id, eapTarefaId },
        select: { id: true },
      });
    const sessao = (tarefaId: string, inicio: Date, horas = 2) =>
      prisma.sessaoTrabalho.create({
        data: { userId: pessoa.id, projetoId: projeto.id, tipoAlocacao: "projeto", tarefaId, inicio, fim: new Date(inicio.getTime() + horas * HORA) },
      });
    const ler = (id: string) =>
      prisma.eapTarefa.findUniqueOrThrow({ where: { id }, select: { inicioReal: true, fimReal: true, status: true, progresso: true, inicioPrevisto: true } });

    // ── Início real pela primeira hora ──
    const A = await linha("A", 0);
    const cardA = await card(A.id, "A");
    await sessao(cardA.id, meioDiaHaDias(6));
    await sessao(cardA.id, meioDiaHaDias(3));
    const diaPrimeira = diaLocal(meioDiaHaDias(6));

    const projetos = await preencherInicioPeloPonto({ cardIds: [cardA.id] }, admin.id);
    const a1 = await ler(A.id);
    check("primeira hora apontada vira o início real", a1.inicioReal != null && paraDia(a1.inicioReal) === diaPrimeira, {
      gravado: a1.inicioReal,
      esperado: diaPrimeira,
    });
    check("não iniciada passa a em andamento, % intocado", a1.status === "and" && a1.progresso === 0, a1);
    check("devolve o projeto para reagendar", projetos.length === 1 && projetos[0] === projeto.id, projetos);
    const trilha = await prisma.auditLog.count({ where: { acao: "inicio-real-pelo-ponto", entidadeId: A.id } });
    check("fica a trilha na auditoria (uma vez)", trilha === 1, trilha);

    const deNovo = await preencherInicioPeloPonto({ cardIds: [cardA.id] }, admin.id);
    check("rodar de novo não muda nada", deNovo.length === 0, deNovo);

    await sessao(cardA.id, meioDiaHaDias(9));
    await preencherInicioPeloPonto({ cardIds: [cardA.id] }, admin.id);
    const a2 = await ler(A.id);
    check("hora mais antiga que chega depois não mexe no preenchido", paraDia(a2.inicioReal!) === diaPrimeira, a2.inicioReal);

    // ── O que fica de fora ──
    const C = await linha("C digitada", 1);
    const inicioDigitado = paraDataUtc(diaLocal(meioDiaHaDias(2)));
    await prisma.eapTarefa.update({ where: { id: C.id }, data: { inicioReal: inicioDigitado, status: "and" } });
    const cardC = await card(C.id, "C");
    await sessao(cardC.id, meioDiaHaDias(8));
    await preencherInicioPeloPonto({ cardIds: [cardC.id] }, admin.id);
    check("início real digitado vence o ponto", paraDia((await ler(C.id)).inicioReal!) === paraDia(inicioDigitado));

    const M = await linha("M marco", 2, { tipoEap: "mrc" });
    await sessao((await card(M.id, "M")).id, meioDiaHaDias(4));
    const R = await linha("R grupo", 3);
    await linha("R1", 4, { parentId: R.id });
    await sessao((await card(R.id, "R")).id, meioDiaHaDias(4));
    const S = await linha("S suspensa", 5);
    await prisma.eapTarefa.update({ where: { id: S.id }, data: { status: "sus" } });
    await sessao((await card(S.id, "S")).id, meioDiaHaDias(4));
    await preencherInicioPeloPonto({ linhaIds: [M.id, R.id, S.id] }, admin.id);
    const [m, r, s] = [await ler(M.id), await ler(R.id), await ler(S.id)];
    check("marco, agrupamento e suspensa ficam sem início real", !m.inicioReal && !r.inicioReal && !s.inicioReal, {
      marco: m.inicioReal,
      grupo: r.inicioReal,
      suspensa: s.inicioReal,
    });

    // ── Corrida: dois preenchimentos ao mesmo tempo ──
    const D = await linha("D corrida", 6);
    const cardD = await card(D.id, "D");
    await sessao(cardD.id, meioDiaHaDias(1));
    await Promise.all([
      preencherInicioPeloPonto({ cardIds: [cardD.id] }, admin.id),
      preencherInicioPeloPonto({ cardIds: [cardD.id] }, admin.id),
    ]);
    const trilhaD = await prisma.auditLog.count({ where: { acao: "inicio-real-pelo-ponto", entidadeId: D.id } });
    check("dois preenchimentos simultâneos gravam uma vez só", trilhaD === 1, trilhaD);

    // ── depoisDoPontoNaTarefa: preenche e reagenda ──
    const E = await linha("E reagenda", 7);
    const cardE = await card(E.id, "E");
    await sessao(cardE.id, meioDiaHaDias(5));
    await depoisDoPontoNaTarefa(cardE.id, admin.id);
    const e = await ler(E.id);
    check(
      "depoisDoPontoNaTarefa reagenda: a data prevista gravada passa a ser o início real",
      e.inicioReal != null && paraDia(e.inicioPrevisto) === paraDia(e.inicioReal),
      { inicioReal: e.inicioReal, inicioPrevisto: e.inicioPrevisto },
    );
    await depoisDoPontoNaTarefa(null, admin.id);
    check("sem tarefa na sessão, nada acontece (e não lança)", true);

    // ── Falta o término real ──
    // A (com ponto até 3 dias atrás) → B (término → início) começa hoje pelo ponto.
    const B = await linha("B sucessora", 8);
    await prisma.eapDependencia.create({ data: { tarefaId: B.id, predecessoraId: A.id, tipo: "fs" } });
    const cardB = await card(B.id, "B");
    await sessao(cardB.id, new Date(agora - 10 * 60_000), 0.1);
    // F → E por início → início: E já começou, e isso não diz que F terminou.
    const F = await linha("F paralela", 9);
    await prisma.eapDependencia.create({ data: { tarefaId: E.id, predecessoraId: F.id, tipo: "ss" } });

    const eap = await eapDoProjeto(projeto.id, { verCusto: false, verDatas: true });
    const dto = (id: string) => eap.tarefas.find((t) => t.id === id)!;
    const pendA = dto(A.id).terminoPendente;
    const ultimoA = diaLocal(meioDiaHaDias(3));
    check(
      "sucessora começou: a predecessora pede o término real, sugerindo o último dia de ponto",
      pendA != null && pendA.sucessoraId === B.id && pendA.sugestao === ultimoA && pendA.sucessoraDesde === hoje,
      { pendA, ultimoA, hoje },
    );
    check("vínculo início → início não pede término", dto(F.id).terminoPendente === null, dto(F.id).terminoPendente);
    check("a própria sucessora não é sinalizada", dto(B.id).terminoPendente === null);

    const semDatas = await eapDoProjeto(projeto.id, { verCusto: false, verDatas: false });
    check(
      "sem datas: o pedido não sai do servidor",
      semDatas.tarefas.every((t) => t.terminoPendente === null),
    );

    await prisma.eapTarefa.update({
      where: { id: A.id },
      data: { fimReal: paraDataUtc(ultimoA), status: "con", progresso: 100 },
    });
    const depois = await eapDoProjeto(projeto.id, { verCusto: false, verDatas: true });
    check(
      "com o término real informado, o pedido some",
      depois.tarefas.find((t) => t.id === A.id)!.terminoPendente === null,
    );
  } finally {
    const linhas = await prisma.eapTarefa.findMany({ where: { projetoId: projeto.id }, select: { id: true } });
    await prisma.sessaoTrabalho.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.tarefa.deleteMany({ where: { eapTarefaId: { in: linhas.map((l) => l.id) } } });
    await prisma.eapTarefa.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.cronogramaProjeto.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.projeto.delete({ where: { id: projeto.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
    await prisma.user.delete({ where: { id: pessoa.id } });
  }

  console.log(falhas ? `\n${falhas} falha(s)` : "\nSmoke OK");
  if (falhas) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
