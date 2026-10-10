/**
 * Smoke do aviso ao gestor quando alguém conclui uma atividade da EAP (decisão do dono, 2026-10-10) contra o banco
 * de dev: vai para a coordenação do projeto (sem quem concluiu), cai nos gestores sem coordenador, não avisa card
 * manual nem linha já em 100%. Notificador falso: nada é disparado.
 *
 * Uso: npm run smoke:conclusao-eap
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import type { notificarMuitos } from "../src/lib/notificar";
import { avisarCardConcluido } from "../src/modules/planejamento/conclusao-aviso-service";

let falhas = 0;
function check(nome: string, ok: boolean, detalhe?: unknown) {
  if (ok) console.log(`  ok  ${nome}`);
  else {
    falhas++;
    console.log(`FALHA  ${nome}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ""}`);
  }
}

const tag = `smoke-conclusao-eap-${Date.now()}`;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function main() {
  const [resp, coord] = await Promise.all(
    ["resp", "coord"].map((n) => prisma.user.create({ data: { name: `${tag}-${n}`, email: `${tag}-${n}@t.local`, tipo: "interno", contratacao: "clt", perfil: { connect: { chave: "clt" } }, emailVerified: false } })),
  );
  const gestor = await prisma.user.findFirstOrThrow({ where: { superUsuario: true, ativo: true }, select: { id: true } });
  const status = await prisma.tarefaStatus.findFirstOrThrow({ where: { ativo: true }, select: { id: true } });
  const cliente = await prisma.cliente.create({ data: { nome: `${tag}-c` } });
  const mk = (n: number) =>
    prisma.projeto.create({
      data: { codigo: `${Date.now()}`.slice(-5) + n, ano: 2026, sequencial: Number(`${Date.now()}`.slice(-5)) + n, nome: `${tag}-${n}`, clienteId: cliente.id },
    });
  const [comCoord, semCoord] = [await mk(1), await mk(2)];

  const enviados: { userIds: string[]; titulo: string; categoria?: string }[] = [];
  const notificar = (async (userIds: string[], n: { titulo: string }, o?: { categoria?: string }) => {
    enviados.push({ userIds: [...userIds].sort(), titulo: n.titulo, categoria: o?.categoria });
  }) as typeof notificarMuitos;
  const rodar = async (tarefaId: string, autorId = resp.id) => {
    enviados.length = 0;
    const r = await avisarCardConcluido({ tarefaId, autorId, autorNome: "Fulano" }, notificar);
    return { r, envio: enviados[0] };
  };
  const linha = (projetoId: string, nome: string, progresso = 40) =>
    prisma.eapTarefa.create({ data: { projetoId, nome, tipoEap: "atv", duracaoDias: 5, progresso, inicioPrevisto: d("2026-10-05"), fimPrevisto: d("2026-10-09") } });
  const card = (projetoId: string, titulo: string, eapTarefaId?: string) =>
    prisma.tarefa.create({ data: { titulo, statusId: status.id, projetoId, criadorId: resp.id, eapTarefaId: eapTarefaId ?? null } });

  try {
    await prisma.projetoMembro.create({ data: { projetoId: comCoord.id, userId: coord.id, papel: "Coordenador" } });

    const l1 = await linha(comCoord.id, "Modelagem");
    const c1 = await card(comCoord.id, "Modelagem", l1.id);
    let x = await rodar(c1.id);
    check("avisa a coordenação do projeto, na categoria atividade_concluida", JSON.stringify(x.envio?.userIds) === JSON.stringify([coord.id]) && x.envio?.categoria === "atividade_concluida", x.envio);
    check("o título diz a atividade", x.envio?.titulo === "Atividade concluída: Modelagem", x.envio?.titulo);

    x = await rodar(c1.id, coord.id);
    check("quem concluiu não é avisado do que ele mesmo fez", x.r.avisados === 0 && !x.envio, x);

    const l2 = await linha(semCoord.id, "Documentação");
    const c2 = await card(semCoord.id, "Documentação", l2.id);
    x = await rodar(c2.id);
    check("sem coordenador no projeto, cai nos gestores (admin/supervisor)", x.envio?.userIds.includes(gestor.id) === true && !x.envio.userIds.includes(resp.id), x.envio);

    const c3 = await card(comCoord.id, "Card manual");
    x = await rodar(c3.id);
    check("card manual (sem EAP) não avisa", x.r.avisados === 0 && !x.envio);

    const l4 = await linha(comCoord.id, "Já validada", 100);
    const c4 = await card(comCoord.id, "Já validada", l4.id);
    x = await rodar(c4.id);
    check("linha já em 100% (gestor já validou) não avisa", x.r.avisados === 0 && !x.envio);
  } finally {
    await prisma.tarefa.deleteMany({ where: { projeto: { nome: { startsWith: tag } } } });
    await prisma.eapTarefa.deleteMany({ where: { projeto: { nome: { startsWith: tag } } } });
    await prisma.projetoMembro.deleteMany({ where: { projeto: { nome: { startsWith: tag } } } });
    await prisma.projeto.deleteMany({ where: { nome: { startsWith: tag } } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
    await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
  }

  console.log(falhas === 0 ? "\nSmoke OK" : `\n${falhas} falha(s)`);
  process.exitCode = falhas === 0 ? 0 : 1;
}

main().finally(() => prisma.$disconnect());
