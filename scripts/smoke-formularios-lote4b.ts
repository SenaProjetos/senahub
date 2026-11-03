/**
 * Smoke do Lote 4b dos formulários do briefing contra o banco de dev: pergunta condicional (envio, status e resposta
 * guardada), modelo padrão por cliente (ordem projeto → cliente → padrão e quem usa cada modelo) e renomear opção
 * migrando as respostas na mesma transação do salvamento do modelo (trava otimista, A↔B, só quem usa o modelo).
 *
 * Cria cliente + projetos + modelos throwaway e apaga tudo no final.
 *
 * Uso: npm run smoke:formularios-lote4b
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { gravarRespostasBriefing } from "../src/modules/inputs/briefing-service";
import { briefingsQueUsam, resolverModeloDoProjeto } from "../src/modules/inputs/modelo-queries";
import { salvarModeloNoBanco, MOTIVO_OUTRA_PESSOA } from "../src/modules/inputs/modelo-service";
import type { Prisma } from "../src/generated/prisma/client";

const campo = (chave: string, over: Record<string, unknown> = {}): Record<string, unknown> => ({ chave, label: `Pergunta ${chave}`, tipo: "text", obrigatorio: false, ...over });

const esquemaA = (): { id: string; titulo: string; campos: Record<string, unknown>[] }[] => [
  {
    id: "geral",
    titulo: "Geral",
    campos: [
      campo("piscina", { tipo: "sim-nao", obrigatorio: true, opcoes: ["Sim", "Não"] }),
      campo("aquecimento", { tipo: "radio", obrigatorio: true, opcoes: ["Solar", "Elétrico", "Gás"], condicao: { campo: "piscina", igual: ["Sim"] } }),
      campo("docs", { tipo: "checkbox", opcoes: ["Planta", "3D", "Layout"] }),
    ],
  },
];

async function main() {
  const tag = `SMK4B_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean, extra?: string) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}${!cond && extra ? ` — ${extra}` : ""}`);
    if (!cond) ok = false;
  };
  const erroDe = async (p: Promise<unknown>) => {
    try {
      await p;
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };

  const json = (x: unknown) => x as unknown as Prisma.InputJsonValue;
  const modeloA = await prisma.modeloBriefing.create({ data: { nome: `${tag}_A`, esquema: json(esquemaA()) } });
  const modeloB = await prisma.modeloBriefing.create({
    data: { nome: `${tag}_B`, esquema: json([{ id: "b", titulo: "B", campos: [campo("so_do_b", { obrigatorio: true })] }]) },
  });
  const cliente = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_cli` } });
  const outroCliente = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_cli2` } });
  const novoProjeto = (clienteId: string, nome: string) =>
    prisma.$transaction(async (tx) => {
      const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
      return tx.projeto.create({ data: { ano, sequencial, codigo, tipo: "particular", nome: `${tag}_${nome}`, clienteId } });
    });
  const p1 = await novoProjeto(cliente.id, "p1");
  const p2 = await novoProjeto(cliente.id, "p2");
  const p3 = await novoProjeto(outroCliente.id, "p3");
  const projetos = [p1.id, p2.id, p3.id];

  try {
    // ── 1) Pergunta condicional ─────────────────────────────────────────────────────────────────
    await prisma.briefingProjeto.create({ data: { projetoId: p1.id, modeloId: modeloA.id } });
    const r1 = await gravarRespostasBriefing(p1.id, { piscina: "Não", aquecimento: "Gás" }, "smoke");
    const g1 = await prisma.briefingProjeto.findUniqueOrThrow({ where: { projetoId: p1.id } });
    check("condicional: com piscina = Não, a resposta de 'aquecimento' não é gravada", !("aquecimento" in (g1.respostasJson as object)), JSON.stringify(g1.respostasJson));
    check("condicional: a obrigatória oculta não pesa — status completo", r1.ok && r1.status === "completo");

    const r2 = await gravarRespostasBriefing(p1.id, { piscina: "Sim" }, "smoke");
    check("condicional: piscina = Sim abre a obrigatória — em preenchimento", r2.ok && r2.status === "em_preenchimento");
    const r3 = await gravarRespostasBriefing(p1.id, { piscina: "Sim", aquecimento: "Gás" }, "smoke");
    check("condicional: envio com controladora e dependente juntos grava os dois", r3.ok && r3.status === "completo");

    await gravarRespostasBriefing(p1.id, { piscina: "Não" }, "smoke");
    const g2 = await prisma.briefingProjeto.findUniqueOrThrow({ where: { projetoId: p1.id } });
    check("condicional: esconder a pergunta NÃO apaga a resposta guardada", (g2.respostasJson as Record<string, unknown>).aquecimento === "Gás");
    check("condicional: esconder tira a exigência (status completo)", g2.status === "completo");

    // ── 2) Modelo por cliente ───────────────────────────────────────────────────────────────────
    const padrao = await prisma.modeloBriefing.findFirst({ where: { padrao: true }, select: { id: true } });
    const semHeranca = await resolverModeloDoProjeto(p2.id, null);
    check("herança: cliente sem modelo → o padrão do sistema", semHeranca.origem === (padrao ? "padrao" : "embutido") && semHeranca.id === (padrao?.id ?? null));

    await prisma.cliente.update({ where: { id: cliente.id }, data: { modeloBriefingId: modeloB.id } });
    const doCliente = await resolverModeloDoProjeto(p2.id, null);
    check("herança: cliente com modelo → o do cliente", doCliente.id === modeloB.id && doCliente.origem === "cliente");
    const proprio = await resolverModeloDoProjeto(p1.id, modeloA.id);
    check("herança: o modelo escolhido no projeto vence o do cliente", proprio.id === modeloA.id && proprio.origem === "projeto");
    const deOutro = await resolverModeloDoProjeto(p3.id, null);
    check("herança: projeto de OUTRO cliente não herda", deOutro.id !== modeloB.id);

    await prisma.briefingProjeto.create({ data: { projetoId: p2.id } }); // sem escolha própria
    await prisma.briefingProjeto.create({ data: { projetoId: p3.id } });
    const usamB = await prisma.briefingProjeto.findMany({ where: briefingsQueUsam(modeloB.id, false), select: { projetoId: true } });
    check("herança: quem usa o modelo B = só o projeto que herda do cliente", usamB.length === 1 && usamB[0].projetoId === p2.id, JSON.stringify(usamB));
    const usamA = await prisma.briefingProjeto.findMany({ where: briefingsQueUsam(modeloA.id, false), select: { projetoId: true } });
    check("herança: quem usa o modelo A = o projeto que o escolheu", usamA.length === 1 && usamA[0].projetoId === p1.id);

    const rHerdado = await gravarRespostasBriefing(p2.id, { so_do_b: "x" }, "smoke");
    check("herança: o envio de p2 já valida no formulário do cliente (completo)", rHerdado.ok && rHerdado.status === "completo");

    // ── 3) Renomear opção migra as respostas ─────────────────────────────────────────────────────
    await prisma.briefingProjeto.update({ where: { projetoId: p1.id }, data: { respostasJson: json({ piscina: "Sim", aquecimento: "Solar", docs: ["Planta", "3D"] }) } });
    // p2 herda do cliente (modelo B) mas guarda uma resposta de mesma chave de A: não pode ser tocada.
    await prisma.briefingProjeto.update({ where: { projetoId: p2.id }, data: { respostasJson: json({ so_do_b: "x", aquecimento: "Solar" }) } });
    const versaoA = (await prisma.modeloBriefing.findUniqueOrThrow({ where: { id: modeloA.id } })).versao;
    const novoEsquema = esquemaA();
    novoEsquema[0].campos[1].opcoes = ["Solar térmico", "Elétrico", "Gás"];
    novoEsquema[0].campos[2].opcoes = ["Planta", "Modelo 3D", "Layout"];
    const salvou = await salvarModeloNoBanco({
      id: modeloA.id,
      versao: versaoA,
      nome: `${tag}_A`,
      esquema: novoEsquema,
      renomeios: [
        { chave: "aquecimento", de: "Solar", para: "Solar térmico" },
        { chave: "docs", de: "3D", para: "Modelo 3D" },
      ],
    });
    check("renomear: salvou e migrou 2 respostas (a escolha única e a caixa)", salvou.migradas === 2 && salvou.versao === versaoA + 1, JSON.stringify(salvou));
    const m1 = (await prisma.briefingProjeto.findUniqueOrThrow({ where: { projetoId: p1.id } })).respostasJson as Record<string, unknown>;
    check("renomear: escolha única acompanhou o novo texto", m1.aquecimento === "Solar térmico");
    check("renomear: caixas de marcação acompanharam, na ordem", JSON.stringify(m1.docs) === JSON.stringify(["Planta", "Modelo 3D"]));
    const m2 = (await prisma.briefingProjeto.findUniqueOrThrow({ where: { projetoId: p2.id } })).respostasJson as Record<string, unknown>;
    check("renomear: briefing que NÃO usa o modelo A não é tocado", m2.aquecimento === "Solar");

    const antiga = await erroDe(salvarModeloNoBanco({ id: modeloA.id, versao: versaoA, nome: `${tag}_A`, esquema: novoEsquema, renomeios: [] }));
    check("renomear: salvar com a versão velha é recusado", antiga === MOTIVO_OUTRA_PESSOA, antiga ?? "sem erro");

    const invalido = await erroDe(
      salvarModeloNoBanco({ id: modeloA.id, versao: versaoA + 1, nome: `${tag}_A`, esquema: novoEsquema, renomeios: [{ chave: "aquecimento", de: "X", para: "Nada" }] }),
    );
    check("renomear: renomeio que não confere com o esquema é recusado sem gravar", !!invalido && (await prisma.modeloBriefing.findUniqueOrThrow({ where: { id: modeloA.id } })).versao === versaoA + 1);

    // troca simultânea A↔B
    const troca = esquemaA();
    troca[0].campos[1].opcoes = ["Elétrico", "Solar térmico", "Gás"];
    await prisma.briefingProjeto.update({ where: { projetoId: p1.id }, data: { respostasJson: json({ piscina: "Sim", aquecimento: "Solar térmico" }) } });
    await salvarModeloNoBanco({
      id: modeloA.id,
      versao: versaoA + 1,
      nome: `${tag}_A`,
      esquema: troca,
      renomeios: [
        { chave: "aquecimento", de: "Solar térmico", para: "Elétrico" },
        { chave: "aquecimento", de: "Elétrico", para: "Solar térmico" },
      ],
    });
    const m3 = (await prisma.briefingProjeto.findUniqueOrThrow({ where: { projetoId: p1.id } })).respostasJson as Record<string, unknown>;
    check("renomear: troca simultânea de duas opções (A↔B) não se atropela", m3.aquecimento === "Elétrico");

    // esquema com condição inválida é recusado pelo servidor (a regra não depende da tela)
    const ruim = esquemaA();
    ruim[0].campos[1].condicao = { campo: "piscina", igual: ["Talvez"] };
    const recusa = await erroDe(salvarModeloNoBanco({ id: modeloA.id, versao: versaoA + 2, nome: `${tag}_A`, esquema: ruim, renomeios: [] }));
    check("condição: o servidor recusa resposta que não é opção da controladora", !!recusa && recusa.includes("não é uma opção"), recusa ?? "sem erro");
  } finally {
    await prisma.briefingProjeto.deleteMany({ where: { projetoId: { in: projetos } } });
    await prisma.projeto.deleteMany({ where: { id: { in: projetos } } }).catch((e) => console.error("limpeza dos projetos:", e));
    await prisma.cliente.deleteMany({ where: { id: { in: [cliente.id, outroCliente.id] } } }).catch((e) => console.error("limpeza dos clientes:", e));
    await prisma.modeloBriefing.deleteMany({ where: { id: { in: [modeloA.id, modeloB.id] } } }).catch((e) => console.error("limpeza dos modelos:", e));
  }

  console.log(ok ? "\nTUDO CERTO" : "\nHÁ FALHAS");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
