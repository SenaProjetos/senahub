/**
 * Smoke do status do briefing contra o banco de dev: o envio filtra pelas disciplinas do projeto (obrigatória de seção que
 * o projeto não mostra não segura o "completo"), e o status persistido é recalculado quando algo muda de baixo do
 * briefing — disciplina nova, fusão de clientes e troca de cliente do projeto (mesma regra: se o formulário efetivo
 * mudou, as ocultações zeram; as respostas nunca).
 *
 * Cria clientes + projetos + modelos throwaway e apaga tudo no final.
 *
 * Uso: npm run smoke:briefing-status
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { gravarRespostasBriefing } from "../src/modules/inputs/briefing-service";
import { formulariosEfetivos, recalcularBriefingsDosProjetos } from "../src/modules/inputs/briefing-status";
import { mesclarClientes } from "../src/modules/clientes/fusao";
import type { Prisma } from "../src/generated/prisma/client";

const campo = (chave: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({ chave, label: `Pergunta ${chave}`, tipo: "text", obrigatorio: false, ...over });

async function main() {
  const tag = `SMKST_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean, extra?: string) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}${!cond && extra ? ` — ${extra}` : ""}`);
    if (!cond) ok = false;
  };
  const json = (x: unknown) => x as unknown as Prisma.InputJsonValue;

  // A: obrigatória geral + obrigatória só de hidráulica. B: uma obrigatória própria.
  const modeloA = await prisma.modeloBriefing.create({
    data: {
      nome: `${tag}_A`,
      esquema: json([
        { id: "geral", titulo: "Geral", campos: [campo("nome", { obrigatorio: true })] },
        { id: "hidro", titulo: "Hidráulico", disciplinas: ["hidr"], campos: [campo("reservatorio", { obrigatorio: true })] },
      ]),
    },
  });
  const modeloB = await prisma.modeloBriefing.create({
    data: { nome: `${tag}_B`, esquema: json([{ id: "b", titulo: "B", campos: [campo("so_do_b", { obrigatorio: true })] }]) },
  });
  const clienteA = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_cliA`, modeloBriefingId: modeloA.id } });
  const clienteB = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_cliB`, modeloBriefingId: modeloB.id } });
  const clienteC = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_cliC` } });
  const novoProjeto = (clienteId: string, nome: string) =>
    prisma.$transaction(async (tx) => {
      const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
      return tx.projeto.create({ data: { ano, sequencial, codigo, tipo: "particular", nome: `${tag}_${nome}`, clienteId } });
    });
  const p1 = await novoProjeto(clienteA.id, "p1");
  const p2 = await novoProjeto(clienteB.id, "p2");
  const p3 = await novoProjeto(clienteB.id, "p3");
  const projetos = [p1.id, p2.id, p3.id];
  const ler = (projetoId: string) => prisma.briefingProjeto.findUniqueOrThrow({ where: { projetoId } });

  try {
    // ── 1) Envio filtra pelas disciplinas ───────────────────────────────────────────────────────
    await prisma.disciplina.create({ data: { projetoId: p1.id, disciplinaTextoLegado: "Estrutural" } });
    const r1 = await gravarRespostasBriefing(p1.id, { nome: "Casa" }, "smoke");
    check("envio: projeto sem hidráulica fecha 'completo' sem a obrigatória da seção hidráulica", r1.ok && r1.status === "completo", JSON.stringify(r1));

    await prisma.disciplina.create({ data: { projetoId: p1.id, disciplinaTextoLegado: "Hidrossanitário" } });
    check("disciplina nova: o status gravado segue 'completo' até alguém recalcular (defasagem conhecida)", (await ler(p1.id)).status === "completo");
    const n1 = await prisma.$transaction((tx) => recalcularBriefingsDosProjetos(tx, [p1.id]));
    check("recálculo: com a hidráulica no projeto a obrigatória passa a contar", n1 === 1 && (await ler(p1.id)).status === "em_preenchimento");
    const r2 = await gravarRespostasBriefing(p1.id, { reservatorio: "5000 L" }, "smoke");
    check("envio: preencher a obrigatória da hidráulica fecha 'completo'", r2.ok && r2.status === "completo");

    // ── 2) Fusão de clientes ────────────────────────────────────────────────────────────────────
    // p2 e p3 herdam o modelo B do cliente B; p2 oculta uma pergunta. Fundir B em C (sem modelo): o sobrevivente HERDA o B,
    // o formulário efetivo não muda → ocultação e status ficam.
    await prisma.briefingProjeto.create({ data: { projetoId: p2.id, respostasJson: json({}), secoesOcultas: ["b"], status: "completo" } });
    await prisma.briefingProjeto.create({ data: { projetoId: p3.id, respostasJson: json({ so_do_b: "x" }), status: "nao_iniciado" } });
    await mesclarClientes(clienteC.id, clienteB.id);
    const f2 = await ler(p2.id);
    check("fusão (herda o modelo): o formulário não mudou — ocultação mantida", f2.secoesOcultas.length === 1);
    check("fusão: status de p3 recalculado pelo formulário efetivo (era defasado)", (await ler(p3.id)).status === "completo", (await ler(p3.id)).status);

    // Agora o formulário muda de verdade: A (cliente do p1, fora do fluxo) absorve C. C tem o B por herança; A mantém o A.
    await prisma.briefingProjeto.update({ where: { projetoId: p2.id }, data: { secoesOcultas: ["b"], camposOcultos: [], status: "completo" } });
    await mesclarClientes(clienteA.id, clienteC.id);
    const f3 = await ler(p2.id);
    check("fusão (formulário mudou B → A): ocultações zeradas", f3.secoesOcultas.length === 0 && f3.camposOcultos.length === 0, JSON.stringify(f3.secoesOcultas));
    check("fusão: a resposta guardada fica", JSON.stringify((await ler(p3.id)).respostasJson) === JSON.stringify({ so_do_b: "x" }));
    check("fusão: status recalculado no formulário novo (A pede 'nome')", f3.status === "nao_iniciado", f3.status);

    // ── 3) Trocar o cliente do projeto (o mesmo caminho do editarProjeto) ───────────────────────
    const clienteD = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_cliD`, modeloBriefingId: modeloB.id } });
    try {
      await prisma.briefingProjeto.update({ where: { projetoId: p1.id }, data: { secoesOcultas: ["geral"], status: "completo" } });
      await prisma.$transaction(async (tx) => {
        const antes = await formulariosEfetivos(tx, [p1.id]);
        await tx.projeto.update({ where: { id: p1.id }, data: { clienteId: clienteD.id } });
        await recalcularBriefingsDosProjetos(tx, [p1.id], antes);
      });
      const t1 = await ler(p1.id);
      check("troca de cliente (A → B): ocultações zeradas e status no formulário do B (sem resposta da pergunta do B)", t1.secoesOcultas.length === 0 && t1.status === "nao_iniciado", JSON.stringify(t1.secoesOcultas) + t1.status);
    } finally {
      await prisma.briefingProjeto.deleteMany({ where: { projetoId: p1.id } });
      await prisma.projeto.updateMany({ where: { id: p1.id }, data: { clienteId: clienteA.id } });
      await prisma.cliente.deleteMany({ where: { id: clienteD.id } }).catch((e) => console.error("limpeza do cliente D:", e));
    }
  } finally {
    await prisma.briefingProjeto.deleteMany({ where: { projetoId: { in: projetos } } });
    await prisma.projeto.deleteMany({ where: { id: { in: projetos } } }).catch((e) => console.error("limpeza dos projetos:", e));
    await prisma.cliente.deleteMany({ where: { id: { in: [clienteA.id, clienteB.id, clienteC.id] } } }).catch((e) => console.error("limpeza dos clientes:", e));
    await prisma.modeloBriefing.deleteMany({ where: { id: { in: [modeloA.id, modeloB.id] } } }).catch((e) => console.error("limpeza dos modelos:", e));
  }

  console.log(ok ? "\nTUDO CERTO" : "\nHÁ FALHAS");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
