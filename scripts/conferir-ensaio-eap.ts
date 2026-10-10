/**
 * Confere, em texto, o que cada perfil do ensaio (`ensaio:eap`) enxerga: a atividade que o ponto sugere, a lista do
 * ponto, "Minhas atividades", os sinais da EAP (verde/vermelho), as etapas do card e a carga da equipe. Só lê.
 *
 * Uso: npm run ensaio:conferir
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { projetosDoUsuario } from "../src/modules/ponto/queries";
import { sugestaoParaPonto, tarefasParaPonto } from "../src/modules/ponto/tarefa-ponto-service";
import { minhasAtividades } from "../src/modules/projetos/meu-trabalho/queries";
import { eapDoProjeto } from "../src/modules/planejamento/queries";
import { sinalDaLinha } from "../src/modules/planejamento/sinais-linha";
import { cargaDaEquipe } from "../src/modules/planejamento/recursos-queries";
import { diaDeSaoPaulo } from "../src/lib/data";

async function main() {
  const projeto = await prisma.projeto.findFirst({ where: { nome: { startsWith: "ENSAIO" } }, select: { id: true, nome: true } });
  if (!projeto) {
    console.log("Sem projeto de ensaio. Rode `npm run ensaio:eap`.");
    return;
  }
  const hoje = diaDeSaoPaulo();
  console.log(`${projeto.nome} — hoje ${hoje}\n`);

  for (const email of ["clt", "estagiario", "pj"]) {
    const u = await prisma.user.findUnique({ where: { email: `ensaio.${email}@demo.senahub` }, select: { id: true, name: true } });
    if (!u) continue;
    const projetos = await projetosDoUsuario(u.id);
    const sug = await sugestaoParaPonto(u.id, new Set(projetos.map((p) => p.id)));
    const lista = await tarefasParaPonto(u.id, projeto.id);
    const meu = await minhasAtividades(u.id);
    console.log(`── ${u.name}`);
    console.log(`  ponto abre em: ${sug ? `${sug.projeto.nome} → ${sug.tarefa.titulo}` : "(sem sugestão)"}`);
    console.log(`  lista do ponto: ${lista.map((t) => `${t.titulo}${t.atrasada ? " [atrasada]" : ""}${t.grupo === "etapa" ? " (outras da etapa)" : ""}`).join(" | ") || "—"}`);
    console.log(`  Meu trabalho: ${meu.projetos.flatMap((p) => p.atividades).length} atividade(s)`);
  }

  const eap = await eapDoProjeto(projeto.id, { verDatas: true });
  console.log("\n── EAP (sinais)");
  for (const t of eap.tarefas.filter((x) => !x.ehResumo)) {
    const sinal = sinalDaLinha(t, hoje);
    console.log(`  ${t.nome.padEnd(34)} ${t.inicioPrevisto} → ${t.fimPrevisto}  ${sinal ?? "—"}`);
  }

  const etapas = await prisma.disciplinaEtapa.findMany({
    where: { disciplina: { projetoId: projeto.id } },
    orderBy: [{ disciplinaId: "asc" }, { ordem: "asc" }],
    select: { inicio: true, prazo: true, status: true, percentual: true, etapa: { select: { sigla: true } }, disciplina: { select: { disciplinaTextoLegado: true } } },
  });
  console.log("\n── Etapas no card");
  for (const e of etapas) {
    console.log(`  ${e.disciplina.disciplinaTextoLegado.padEnd(12)} ${e.etapa.sigla}  ${e.inicio?.toISOString().slice(0, 10) ?? "—"} → ${e.prazo?.toISOString().slice(0, 10) ?? "—"}  ${e.status}  ${Number(e.percentual)}%`);
  }

  const carga = await cargaDaEquipe({ semanas: 4 });
  console.log(`\n── Carga: ${carga.projetosCalculados.includes(projeto.id) ? "projeto entra como CALCULADO (aprovado)" : "projeto fora da carga calculada"}`);
}

main().finally(() => prisma.$disconnect());
