/**
 * Smoke do histórico do % concluído (decisão #17) contra o banco de dev. O vitest cobre a regra pura
 * (`progresso-historico.ts`); aqui vai o I/O: a gravação pelos caminhos REAIS (editar a linha e
 * "Atualizar tarefa"), a Data de Status vigente e a leitura por data que o Valor Agregado usa.
 *
 * Uso: npm run smoke:progresso-historico
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { registrarProgresso, progressoDoProjetoNaData } from "../src/modules/planejamento/progresso-historico-service";
import { registrarExecucaoNaLinha } from "../src/modules/planejamento/execucao-service";
import { reservarIdsParaLinhas } from "../src/modules/planejamento/id-corporativo";

let falhas = 0;
function check(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ""}`);
  }
}

const tag = `smoke-progresso-${Date.now()}`;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: "admin", ativo: true }, select: { id: true } });
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
    const nova = async (nome: string, ordem: number, progresso = 0) => {
      const [id] = await reservarIdsParaLinhas(prisma, ["atv"]);
      return prisma.eapTarefa.create({
        data: {
          projetoId: projeto.id,
          idCorporativo: id,
          nome: `${tag} ${nome}`,
          tipoEap: "atv",
          duracaoDias: 5,
          progresso,
          ordem,
          inicioPrevisto: d("2026-09-14"),
          fimPrevisto: d("2026-09-18"),
        },
        select: { id: true, progresso: true },
      });
    };

    const A = await nova("A", 0);
    const B = await nova("B", 1, 30); // já vinha com avanço, sem histórico
    const marco = await prisma.eapTarefa.create({
      data: {
        projetoId: projeto.id,
        idCorporativo: (await reservarIdsParaLinhas(prisma, ["mrc"]))[0],
        nome: `${tag} marco`,
        tipoEap: "mrc",
        duracaoDias: 0,
        ordem: 2,
        inicioPrevisto: d("2026-09-18"),
        fimPrevisto: d("2026-09-18"),
      },
      select: { id: true, progresso: true },
    });

    // ── 1. Data de Status = sexta 18/09 ────────────────────────────────────
    await prisma.cronogramaProjeto.create({
      data: { projetoId: projeto.id, inicioProjeto: d("2026-09-14"), dataStatus: d("2026-09-18") },
    });

    // A coordenação informa 40% em A (na vigência da sexta).
    const gravou = await registrarProgresso(prisma, {
      tarefaId: A.id,
      projetoId: projeto.id,
      anterior: 0,
      progresso: 40,
      autorId: admin.id,
      origem: "informado",
    });
    check("gravou a mudança de %", gravou === true);

    const registro = await prisma.eapProgressoRegistro.findFirst({
      where: { tarefaId: A.id },
      select: { anterior: true, progresso: true, dataStatusVigente: true, origem: true, autorId: true },
    });
    check(
      "guardou o valor anterior, a Data de Status vigente, a origem e o autor",
      registro?.anterior === 0 &&
        registro?.progresso === 40 &&
        registro?.dataStatusVigente?.toISOString().slice(0, 10) === "2026-09-18" &&
        registro?.origem === "informado" &&
        registro?.autorId === admin.id,
      registro,
    );

    const repetido = await registrarProgresso(prisma, {
      tarefaId: A.id,
      projetoId: projeto.id,
      anterior: 40,
      progresso: 40,
      autorId: admin.id,
      origem: "informado",
    });
    check("% que não mudou não vira registro (um por clique em Salvar seria lixo)", repetido === false);

    const emResumo = await registrarProgresso(prisma, {
      tarefaId: A.id,
      projetoId: projeto.id,
      anterior: 0,
      progresso: 80,
      autorId: admin.id,
      origem: "informado",
      ehResumo: true,
    });
    check("linha-resumo não entra no histórico (o % dela é rollup do motor)", emResumo === false);

    // ── 2. "Atualizar tarefa": o % derivado das datas reais também é histórico ──
    await registrarExecucaoNaLinha({
      id: marco.id,
      inicioReal: null,
      fimReal: "2026-09-18",
      hoje: "2026-09-30",
      autorId: admin.id,
    });
    const doMarco = await prisma.eapProgressoRegistro.findFirst({
      where: { tarefaId: marco.id },
      select: { progresso: true, origem: true },
    });
    check("concluir pelas datas reais grava histórico com origem execucao", doMarco?.origem === "execucao" && doMarco?.progresso === 100, doMarco);

    // ── 3. Leitura por data (é o que o VA usa) ─────────────────────────────
    const atuais = new Map([
      [A.id, 40],
      [B.id, 30],
      [marco.id, 100],
    ]);
    const antes = await progressoDoProjetoNaData(projeto.id, "2026-09-10", atuais);
    check("numa data ANTES da mudança, A volta a 0 (o valor de então)", antes.progresso.get(A.id) === 0, [...antes.progresso]);
    check("a linha sem histórico fica com o % de hoje, e é acusada", antes.progresso.get(B.id) === 30 && antes.semHistorico.includes(B.id), {
      b: antes.progresso.get(B.id),
      semHistorico: antes.semHistorico,
    });

    const naData = await progressoDoProjetoNaData(projeto.id, "2026-09-18", atuais);
    check("na Data de Status vigente, vale o que foi informado nela", naData.progresso.get(A.id) === 40, [...naData.progresso]);

    // ── 4. O caso do MS Project: informar na segunda, referente à sexta ────
    // O registro guarda `dataStatusVigente` = 18/09 mesmo sendo gravado depois (hoje).
    await registrarProgresso(prisma, {
      tarefaId: A.id,
      projetoId: projeto.id,
      anterior: 40,
      progresso: 75,
      autorId: admin.id,
      origem: "informado",
    });
    const depois = await progressoDoProjetoNaData(projeto.id, "2026-09-18", atuais);
    check(
      "o que foi digitado hoje, com a sexta ainda como Data de Status, conta para a sexta",
      depois.progresso.get(A.id) === 75,
      [...depois.progresso],
    );

    // Trocando a Data de Status, o registro novo não contamina a data antiga.
    await prisma.cronogramaProjeto.update({ where: { projetoId: projeto.id }, data: { dataStatus: d("2026-09-25") } });
    await registrarProgresso(prisma, {
      tarefaId: A.id,
      projetoId: projeto.id,
      anterior: 75,
      progresso: 95,
      autorId: admin.id,
      origem: "informado",
    });
    const sexta = await progressoDoProjetoNaData(projeto.id, "2026-09-18", atuais);
    const seguinte = await progressoDoProjetoNaData(projeto.id, "2026-09-25", atuais);
    check("a sexta continua em 75 depois de a Data de Status virar 25/09", sexta.progresso.get(A.id) === 75, [...sexta.progresso]);
    check("e a nova Data de Status vê 95", seguinte.progresso.get(A.id) === 95, [...seguinte.progresso]);
  } finally {
    const linhas = await prisma.eapTarefa.findMany({ where: { projetoId: projeto.id }, select: { id: true } });
    await prisma.eapProgressoRegistro.deleteMany({ where: { tarefaId: { in: linhas.map((l) => l.id) } } });
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
