/**
 * Smoke da Onda 5 — Planejamento & Recursos:
 * projeto → EAP (tarefa + subtarefa + dependência) → linha de base → desvio →
 * aplicar ao projeto (prazo da disciplina) → recurso (capacidade) + alocação → superalocação.
 * Exercita as queries reais (eapDoProjeto, matrizRecursos, projetosComPlano).
 * Idempotente: limpa o que cria.
 *
 * Uso: npm run smoke:onda5
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { eapDoProjeto, matrizRecursos, projetosComPlano } from "../src/modules/planejamento/queries";
import type { Role } from "../src/lib/roles";

async function main() {
  const tag = `SMK5_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}`);
    if (!cond) ok = false;
  };
  const d = (s: string) => new Date(s + "T00:00:00");

  const admin = await prisma.user.findFirst({ where: { role: "admin" } });
  if (!admin) throw new Error("Admin não encontrado.");

  // Cliente + projeto throwaway com 1 disciplina
  const cliente = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_cli` } });
  const projeto = await prisma.$transaction(async (tx) => {
    const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
    return tx.projeto.create({
      data: {
        ano,
        sequencial,
        codigo,
        tipo: "particular",
        nome: `${tag}_proj`,
        clienteId: cliente.id,
        disciplinas: { create: [{ nome: "Estrutural", ordem: 0 }] },
      },
      include: { disciplinas: true },
    });
  });
  const disc = projeto.disciplinas[0];

  // 1) EAP: tarefa mãe + subtarefa vinculada à disciplina
  const mae = await prisma.eapTarefa.create({
    data: {
      projetoId: projeto.id,
      nome: `${tag}_mae`,
      inicioPrevisto: d("2026-07-01"),
      fimPrevisto: d("2026-07-10"),
      ordem: 0,
    },
  });
  const filha = await prisma.eapTarefa.create({
    data: {
      projetoId: projeto.id,
      parentId: mae.id,
      disciplinaId: disc.id,
      nome: `${tag}_filha`,
      inicioPrevisto: d("2026-07-03"),
      fimPrevisto: d("2026-07-08"),
      progresso: 40,
      ordem: 1,
    },
  });
  await prisma.eapDependencia.create({ data: { tarefaId: filha.id, predecessoraId: mae.id } });
  check("EAP: 2 tarefas + hierarquia + dependência", true);

  // 2) Linha de base = copia previsto → baseline
  const tarefas = await prisma.eapTarefa.findMany({ where: { projetoId: projeto.id } });
  await prisma.$transaction(
    tarefas.map((t) =>
      prisma.eapTarefa.update({
        where: { id: t.id },
        data: { inicioBaseline: t.inicioPrevisto, fimBaseline: t.fimPrevisto },
      }),
    ),
  );
  const comBase = await prisma.eapTarefa.findFirst({ where: { id: mae.id } });
  check("linha de base gravada (fimBaseline = fimPrevisto)", comBase?.fimBaseline?.toISOString().slice(0, 10) === "2026-07-10");

  // 3) Desvio: atrasa o fim previsto da mãe; baseline permanece
  await prisma.eapTarefa.update({ where: { id: mae.id }, data: { fimPrevisto: d("2026-07-15") } });
  const desviada = await prisma.eapTarefa.findUnique({ where: { id: mae.id } });
  const desvioDias = Math.round(
    (desviada!.fimPrevisto.getTime() - desviada!.fimBaseline!.getTime()) / 86400000,
  );
  check("desvio = +5 dias vs linha de base", desvioDias === 5);

  // 4) Aplicar ao projeto: tarefa com disciplina grava prazo da disciplina
  const comDisc = await prisma.eapTarefa.findMany({
    where: { projetoId: projeto.id, disciplinaId: { not: null } },
  });
  await prisma.$transaction(
    comDisc.map((t) =>
      prisma.disciplina.update({ where: { id: t.disciplinaId! }, data: { prazo: t.fimPrevisto } }),
    ),
  );
  const discAtual = await prisma.disciplina.findUnique({ where: { id: disc.id } });
  check("aplicar ao projeto → prazo da disciplina = fim previsto", discAtual?.prazo?.toISOString().slice(0, 10) === "2026-07-08");

  // 5) query eapDoProjeto
  const eap = await eapDoProjeto(projeto.id);
  check("eapDoProjeto: tarefas + baseline + dependência", eap.tarefas.length === 2 && eap.temLinhaBase && eap.tarefas.some((t) => t.predecessoraIds.length === 1));

  // 6) projetosComPlano (viewer admin = global)
  const lista = await projetosComPlano({ id: admin.id, role: admin.role as Role });
  const naLista = lista.find((p) => p.id === projeto.id);
  check("projetosComPlano inclui o projeto com 2 tarefas", naLista?.totalTarefas === 2);

  // 7) Recurso (capacidade 0,5) + alocação 60% → superalocação (60 > 50)
  const recurso = await prisma.recurso.create({ data: { userId: admin.id, capacidade: 0.5 } });
  const aloc = await prisma.alocacao.create({
    data: { recursoId: recurso.id, projetoId: projeto.id, percentual: 60 },
  });
  const matriz = await matrizRecursos();
  const linha = matriz.linhas.find((l) => l.recursoId === recurso.id);
  check("matriz: recurso com capacidade 50% e alocado 60%", linha?.capacidadePct === 50 && linha?.totalAlocado === 60);
  check("superalocação detectada (60% > 50%)", linha?.superalocado === true);

  // Limpeza
  await prisma.alocacao.delete({ where: { id: aloc.id } });
  await prisma.recurso.delete({ where: { id: recurso.id } });
  await prisma.projeto.delete({ where: { id: projeto.id } }); // cascata: EAP, dependências, disciplina
  await prisma.cliente.delete({ where: { id: cliente.id } });

  console.log(ok ? "\nSMOKE ONDA 5: OK" : "\nSMOKE ONDA 5: FALHOU");
  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
