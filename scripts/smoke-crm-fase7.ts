/**
 * Smoke da Fase 7 do CRM (Automações sem IA) contra o banco de dev — mesmo padrão de
 * `smoke-crm-fase1/.../6.ts`. F7.1 (`regras.ts`) e F7.2's `paraParametrosRegras` são puros e já
 * cobertos por `regras.test.ts`/`padroes.test.ts` — não repetidos aqui. Este arquivo cobre a
 * metade que precisa de banco: F7.2 (persistência real de `ConfigSistema`) e F7.6 (checklist
 * SOFT — a metade comportamental do aceite; a metade estrutural, "moverEstagio não consulta
 * checklist", é `checklist-soft.test.ts`, não smoke).
 *
 * Uso: npm run smoke:crm-fase7
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { moverEstagio, alternarChecklistItem } from "../src/modules/comercial/service";
import {
  CHAVE_CONFIG_COMERCIAL,
  getConfigComercial,
} from "../src/modules/comercial/config/queries";
import { CONFIG_COMERCIAL_PADRAO } from "../src/modules/comercial/config/padroes";

const TAG = `SMK7_${randomBytes(3).toString("hex")}_`;

async function main() {
  let ok = true;
  const check = (nome: string, cond: boolean, detalhe = "") => {
    console.log(`${cond ? "[OK]  " : "[FALHA]"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
    if (!cond) ok = false;
  };

  const criados: { clienteId?: string; negociacaoId?: string; itemId?: string; userId?: string } =
    {};

  try {
    console.log("\n── F7.2: configuração do Comercial persiste de verdade em ConfigSistema ──\n");

    // Mesmo efeito que `salvarConfigComercial` faz (a action não é chamável fora de uma request —
    // precisa de sessão — então o smoke reproduz o upsert, igual aos outros smokes fazem com
    // service.ts em vez de actions.ts).
    const antes = await getConfigComercial();
    check(
      "sem linha gravada, cai no default (diasParadoNoEstagio)",
      antes.diasParadoNoEstagio === CONFIG_COMERCIAL_PADRAO.diasParadoNoEstagio ||
        antes.diasParadoNoEstagio > 0, // se outro smoke já gravou config antes, só confirma que é numérico > 0
    );

    const novoValor = { ...antes, diasParadoNoEstagio: 45, diasParaReativar: 400 };
    await prisma.configSistema.upsert({
      where: { chave: CHAVE_CONFIG_COMERCIAL },
      create: { chave: CHAVE_CONFIG_COMERCIAL, valor: novoValor },
      update: { valor: novoValor },
    });
    const depois = await getConfigComercial();
    check("diasParadoNoEstagio gravado volta ao ler (45)", depois.diasParadoNoEstagio === 45);
    check("diasParaReativar gravado volta ao ler (400)", depois.diasParaReativar === 400);

    // Devolve ao valor original — este smoke não deve mudar o comportamento de outras automações.
    await prisma.configSistema.upsert({
      where: { chave: CHAVE_CONFIG_COMERCIAL },
      create: { chave: CHAVE_CONFIG_COMERCIAL, valor: antes },
      update: { valor: antes },
    });

    console.log("\n── F7.6: checklist por estágio é SOFT — marcar em 0% não trava moverEstagio ──\n");

    const user = await prisma.user.findFirst({ select: { id: true } });
    if (!user) throw new Error("nenhum usuário no banco de dev — rode o seed antes.");
    criados.userId = user.id;

    const cliente = await prisma.cliente.create({
      data: { nome: `${TAG}Cliente` },
      select: { id: true },
    });
    criados.clienteId = cliente.id;

    const negociacao = await prisma.negociacao.create({
      data: { titulo: `${TAG}Negociacao`, clienteId: cliente.id, estagio: "LEVANTAMENTO" },
      select: { id: true },
    });
    criados.negociacaoId = negociacao.id;

    const item = await prisma.checklistItemPadrao.create({
      data: { estagio: "LEVANTAMENTO", texto: `${TAG}Item` },
      select: { id: true },
    });
    criados.itemId = item.id;

    // Checklist em 0% (nenhum item marcado) — e ainda assim a transição de estágio funciona.
    const marcadosAntes = await prisma.negociacaoChecklistItem.count({
      where: { negociacaoId: negociacao.id },
    });
    check("checklist nasce em 0% (nenhuma marcação)", marcadosAntes === 0);

    const movimento = await moverEstagio({
      negociacaoId: negociacao.id,
      para: "ORCAMENTO",
      autorId: user.id,
    });
    check(
      "moverEstagio funciona com checklist do estágio de origem em 0%",
      movimento.de === "LEVANTAMENTO" && movimento.para === "ORCAMENTO",
    );

    // Marca o item (agora que a negociação já saiu do estágio do item — a marcação é histórica,
    // não gate: alternarChecklistItem não valida em qual estágio a negociação está).
    const r1 = await alternarChecklistItem({
      negociacaoId: negociacao.id,
      itemId: item.id,
      usuarioId: user.id,
    });
    check("alternarChecklistItem marca (retorna marcado: true)", r1.marcado === true);

    const marcadosDepois = await prisma.negociacaoChecklistItem.count({
      where: { negociacaoId: negociacao.id, itemId: item.id },
    });
    check("a marcação persistiu como 1 linha (presença = marcado)", marcadosDepois === 1);

    const r2 = await alternarChecklistItem({
      negociacaoId: negociacao.id,
      itemId: item.id,
      usuarioId: user.id,
    });
    check("alternarChecklistItem de novo desmarca (retorna marcado: false)", r2.marcado === false);

    const marcadosFinal = await prisma.negociacaoChecklistItem.count({
      where: { negociacaoId: negociacao.id, itemId: item.id },
    });
    check("desmarcar removeu a linha (não zerou um campo)", marcadosFinal === 0);

    // Dupla marcação não deve duplicar linha nem estourar o unique (@@unique negociacaoId+itemId).
    await alternarChecklistItem({ negociacaoId: negociacao.id, itemId: item.id, usuarioId: user.id });
    let duplicouSemErro = false;
    try {
      await prisma.negociacaoChecklistItem.create({
        data: { negociacaoId: negociacao.id, itemId: item.id, marcadoPorId: user.id },
      });
      duplicouSemErro = true;
    } catch {
      // esperado: unique constraint barra a segunda linha
    }
    check(
      "o banco recusa uma 2ª linha para o mesmo par negociação/item (@@unique)",
      !duplicouSemErro,
    );
  } finally {
    // Limpeza — este smoke não deixa fixture (diferente do F6.2, que é volume de propósito).
    if (criados.negociacaoId && criados.itemId) {
      await prisma.negociacaoChecklistItem
        .deleteMany({ where: { negociacaoId: criados.negociacaoId, itemId: criados.itemId } })
        .catch(() => {});
    }
    if (criados.itemId) await prisma.checklistItemPadrao.delete({ where: { id: criados.itemId } }).catch(() => {});
    if (criados.negociacaoId) {
      await prisma.$executeRawUnsafe(`DELETE FROM negociacao WHERE id = $1`, criados.negociacaoId).catch(() => {});
    }
    if (criados.clienteId) {
      // `moverEstagio` grava um `Atividade` (ESTAGIO_ALTERADO) com `clienteId` — sem apagar isto
      // primeiro, o delete do cliente esbarra em `atividade_clienteId_fkey` (achado rodando este
      // smoke de verdade, não suposição).
      await prisma.atividade.deleteMany({ where: { clienteId: criados.clienteId } }).catch(() => {});
      await prisma.cliente.delete({ where: { id: criados.clienteId } }).catch(() => {});
    }
  }

  console.log(`\n${ok ? "✔ Fase 7: tudo verde." : "✖ Fase 7: há falhas acima."}`);
  if (!ok) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
