/**
 * Smoke do link público de inputs (formulário do cliente) contra o banco de dev.
 * Exercita o que lint/tsc/vitest não alcançam: a trava de 6 h da notificação, a
 * transição para briefing completo, a revogação (`ativo=false`) e a expiração
 * (`expiraEm` no passado) — nas ROTAS públicas de verdade, não em mocks.
 *
 * Cria cliente + projeto + link throwaway e apaga tudo no final.
 *
 * Uso: tsx --tsconfig tsconfig.server.json scripts/smoke-inputs-link.ts
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { proximoCodigoProjeto } from "../src/modules/projetos/numbering";
import { inputsPorToken } from "../src/modules/inputs/queries";
import { BRIEFING_SCHEMA } from "../src/modules/inputs/briefing-schema";
import { PUT as putInputs } from "../src/app/api/p/inputs/[token]/route";
import { PUT as putBriefing } from "../src/app/api/p/inputs/[token]/briefing/route";

const req = (body: unknown) =>
  new Request("http://localhost/api/p/inputs/x", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

async function main() {
  const tag = `SMKINP_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean) => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}`);
    if (!cond) ok = false;
  };

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
    });
  });

  const token = randomBytes(18).toString("hex");
  await prisma.linkPublicoInput.create({ data: { projetoId: projeto.id, token, ativo: true } });
  const pergunta = await prisma.inputProjeto.create({
    data: { projetoId: projeto.id, pergunta: `${tag} pergunta?`, ordem: 0 },
  });

  // Cada chamada recebe seu próprio ctx: `params` é uma Promise consumida uma vez.
  const novoCtx = () => ({ params: Promise.resolve({ token }) });
  const desde = new Date();
  const contarNotificacoes = () =>
    prisma.notificacao.count({ where: { createdAt: { gte: desde }, href: `/projetos/${projeto.id}/inputs` } });

  try {
    // 1) Link vigente abre o formulário.
    check("link vigente resolve o projeto", (await inputsPorToken(token))?.id === projeto.id);

    // 2) Primeiro preenchimento notifica (1 destinatário no mínimo) e carimba notificadoEm.
    const r1 = await putInputs(req({ respostas: [{ id: pergunta.id, resposta: "resposta 1" }] }), novoCtx());
    check("PUT inputs aceita com link vigente", r1.status === 200);
    const apos1 = await contarNotificacoes();
    check("primeiro preenchimento notifica", apos1 > 0);
    const link1 = await prisma.linkPublicoInput.findUnique({ where: { projetoId: projeto.id } });
    check("notificadoEm carimbado", !!link1?.notificadoEm);

    // 3) Segundo preenchimento na mesma janela NÃO notifica (autosave não vira spam).
    await putInputs(req({ respostas: [{ id: pergunta.id, resposta: "resposta 2" }] }), novoCtx());
    check("segundo preenchimento na janela não notifica", (await contarNotificacoes()) === apos1);

    // 4) Briefing incompleto dentro da janela: também não notifica.
    const obrigatorias = chavesObrigatorias();
    const r4 = await putBriefing(req({ respostas: { [obrigatorias[0]]: "preenchido" } }), novoCtx());
    const b4 = (await r4.json()) as { status: string };
    check("briefing parcial fica em_preenchimento", b4.status === "em_preenchimento");
    check("briefing parcial na janela não notifica", (await contarNotificacoes()) === apos1);

    // 5) Transição para completo FURA a janela.
    const completo = Object.fromEntries(obrigatorias.map((c) => [c, "preenchido"]));
    const r5 = await putBriefing(req({ respostas: completo }), novoCtx());
    const b5 = (await r5.json()) as { status: string };
    check("briefing fica completo", b5.status === "completo");
    const apos5 = await contarNotificacoes();
    check("transição para completo notifica mesmo na janela", apos5 > apos1);

    // 6) Salvar de novo já completo NÃO renotifica (não há transição).
    await putBriefing(req({ respostas: completo }), novoCtx());
    check("save posterior já completo não renotifica", (await contarNotificacoes()) === apos5);

    // 7) Revogação corta na hora — página e as duas rotas.
    await prisma.linkPublicoInput.update({ where: { projetoId: projeto.id }, data: { ativo: false } });
    check("link revogado não resolve projeto", (await inputsPorToken(token)) === null);
    check("PUT inputs 404 com link revogado", (await putInputs(req({ respostas: [] }), novoCtx())).status === 404);
    check(
      "PUT briefing 404 com link revogado",
      (await putBriefing(req({ respostas: {} }), novoCtx())).status === 404,
    );

    // 8) Expiração no passado corta igual, mesmo com ativo=true.
    await prisma.linkPublicoInput.update({
      where: { projetoId: projeto.id },
      data: { ativo: true, expiraEm: new Date(Date.now() - 60_000) },
    });
    check("link expirado não resolve projeto", (await inputsPorToken(token)) === null);
    check("PUT inputs 404 com link expirado", (await putInputs(req({ respostas: [] }), novoCtx())).status === 404);

    // 9) Validade futura volta a valer.
    await prisma.linkPublicoInput.update({
      where: { projetoId: projeto.id },
      data: { expiraEm: new Date(Date.now() + 60 * 60_000) },
    });
    check("validade futura mantém o link de pé", (await inputsPorToken(token))?.id === projeto.id);
  } finally {
    await prisma.notificacao.deleteMany({ where: { href: `/projetos/${projeto.id}/inputs` } });
    await prisma.projeto.delete({ where: { id: projeto.id } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
  }

  console.log(ok ? "\nSMOKE INPUTS-LINK OK" : "\nSMOKE INPUTS-LINK FALHOU");
  process.exit(ok ? 0 : 1);
}

/** Chaves obrigatórias do briefing (fonte: o próprio schema, sem lista paralela). */
function chavesObrigatorias(): string[] {
  return BRIEFING_SCHEMA.flatMap((s) => s.campos)
    .filter((c) => c.obrigatorio)
    .map((c) => c.chave);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
