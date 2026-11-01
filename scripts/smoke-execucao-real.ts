/**
 * Smoke do realizado por linha da EAP (Lote 7) contra o banco de dev. O vitest cobre as regras puras
 * (`execucao-real.ts`); aqui vai a leitura real (`eapDoProjeto`): horas do ponto pelo card da linha,
 * custo/hora de quem APONTOU, valor digitado do terceiro, soma no agrupamento e o que some para quem
 * não vê financeiro ou datas.
 *
 * Uso: npm run smoke:execucao-real
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { inicioDoDiaUtc } from "../src/lib/data";
import { diasUteisEntre } from "../src/lib/calendario-trabalho";
import { eapDoProjeto } from "../src/modules/planejamento/queries";
import { paraDia, planoDoProjeto } from "../src/modules/planejamento/agenda";
import { reservarIdsParaLinhas } from "../src/modules/planejamento/id-corporativo";

let falhas = 0;
function check(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ""}`);
  }
}

const tag = `smoke-execreal-${Date.now()}`;
const MIN = 60_000;

async function main() {
  const admin = await prisma.user.findFirst({ where: { superUsuario: true, ativo: true }, select: { id: true } });
  const statusAberto = await prisma.tarefaStatus.findFirst({ where: { ativo: true, concluido: false }, select: { id: true } });
  if (!admin || !statusAberto) {
    console.log("Sem admin ativo ou status de tarefa no banco de dev — rode `npm run db:seed`.");
    process.exitCode = 1;
    return;
  }
  const pessoa = (sufixo: string) =>
    prisma.user.create({
      data: { name: `${tag}-${sufixo}`, email: `${tag}-${sufixo}@teste.local`, tipo: "interno", emailVerified: false },
      select: { id: true },
    });
  const u1 = await pessoa("u1");
  const u2 = await pessoa("u2");
  await prisma.recurso.create({ data: { userId: u1.id, custoHora: 100 } });

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
    const hojeData = inicioDoDiaUtc();
    const hoje = paraDia(hojeData);
    const diasAtras = (n: number) => new Date(hojeData.getTime() - n * 86_400_000);
    const linha = async (nome: string, ordem: number, parentId: string | null) => {
      const [id] = await reservarIdsParaLinhas(prisma, ["atv"]);
      return prisma.eapTarefa.create({
        data: {
          projetoId: projeto.id,
          parentId,
          idCorporativo: id,
          nome: `${tag} ${nome}`,
          tipoEap: "atv",
          duracaoDias: 10,
          ordem,
          inicioPrevisto: diasAtras(7),
          fimPrevisto: diasAtras(-7),
        },
        select: { id: true },
      });
    };

    const R = await linha("R", 0, null);
    const A = await linha("A", 1, R.id);
    const T = await linha("T", 2, R.id);
    const inicioRealA = paraDia(diasAtras(7));
    await prisma.eapTarefa.update({ where: { id: A.id }, data: { inicioReal: diasAtras(7), status: "and", progresso: 30 } });
    await prisma.eapAtribuicao.create({ data: { tarefaId: T.id, userId: null, papel: "ext", horasPrevistas: 0 } });
    await prisma.eapTarefa.update({ where: { id: T.id }, data: { custoRealTerceiro: 500 } });

    const card = await prisma.tarefa.create({
      data: { titulo: `${tag} card A`, statusId: statusAberto.id, projetoId: projeto.id, criadorId: admin.id, eapTarefaId: A.id },
      select: { id: true },
    });
    const sessao = (userId: string, minutos: number) => {
      const inicio = new Date(Date.now() - 3 * 60 * MIN);
      return prisma.sessaoTrabalho.create({
        data: { userId, projetoId: projeto.id, tipoAlocacao: "projeto", tarefaId: card.id, inicio, fim: new Date(inicio.getTime() + minutos * MIN) },
      });
    };
    await sessao(u1.id, 90);
    await sessao(u2.id, 60);

    const com = await eapDoProjeto(projeto.id, { verCusto: true, verDatas: true });
    const de = (r: typeof com, id: string) => r.tarefas.find((t) => t.id === id)!;
    const a = de(com, A.id);
    const t = de(com, T.id);
    const r = de(com, R.id);

    check("Trab. real da interna = horas do ponto pelo card", a.trabalhoReal === 2.5, a.trabalhoReal);
    check(
      "Custo real da interna = horas × custo/hora de quem tem taxa, parcial por quem não tem",
      a.custoReal === 150 && a.custoRealParcial === true,
      { custoReal: a.custoReal, parcial: a.custoRealParcial },
    );
    check("terceiro não se mede pelo ponto", t.trabalhoReal === null, t.trabalhoReal);
    check("Custo real do terceiro = o valor digitado", t.custoReal === 500 && t.custoRealTerceiro === 500, {
      custoReal: t.custoReal,
      digitado: t.custoRealTerceiro,
    });
    check("agrupamento soma os filhos", r.trabalhoReal === 2.5 && r.custoReal === 650 && r.custoRealParcial === true, {
      trabalho: r.trabalhoReal,
      custo: r.custoReal,
      parcial: r.custoRealParcial,
    });

    const plano = await planoDoProjeto(projeto.id);
    const esperado = diasUteisEntre(inicioRealA, hoje, plano!.calendario);
    check("Dur. real = dias úteis do início real até hoje", a.duracaoReal === esperado && esperado > 0, { dto: a.duracaoReal, esperado });
    check("Dur. rest. calculada para a linha em andamento", typeof a.duracaoRestante === "number" && a.duracaoRestante >= 0, a.duracaoRestante);

    const semCusto = await eapDoProjeto(projeto.id, { verCusto: false, verDatas: true });
    check(
      "sem financeiro: nenhum Custo real nem valor digitado sai do servidor",
      semCusto.tarefas.every((x) => x.custoReal === null && x.custoRealTerceiro === null),
      semCusto.tarefas.map((x) => [x.custoReal, x.custoRealTerceiro]),
    );
    check("sem financeiro o Trab. real continua (hora não é R$)", de(semCusto, A.id).trabalhoReal === 2.5);

    const semDatas = await eapDoProjeto(projeto.id, { verCusto: true, verDatas: false });
    check(
      "sem datas: Dur. real e Dur. rest. não saem",
      semDatas.tarefas.every((x) => x.duracaoReal === null && x.duracaoRestante === null),
      semDatas.tarefas.map((x) => [x.duracaoReal, x.duracaoRestante]),
    );
  } finally {
    const linhas = await prisma.eapTarefa.findMany({ where: { projetoId: projeto.id }, select: { id: true } });
    await prisma.sessaoTrabalho.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.tarefa.deleteMany({ where: { eapTarefaId: { in: linhas.map((l) => l.id) } } });
    await prisma.eapTarefa.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.cronogramaProjeto.deleteMany({ where: { projetoId: projeto.id } });
    await prisma.projeto.delete({ where: { id: projeto.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
    await prisma.user.deleteMany({ where: { id: { in: [u1.id, u2.id] } } });
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
