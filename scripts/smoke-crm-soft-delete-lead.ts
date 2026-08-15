/**
 * Smoke do soft delete de Lead e ContatoCliente (F1.18).
 *
 * Por que existe: nos dois models a leitura PRINCIPAL é ANINHADA — o Kanban lê leads via
 * `FunilEtapa.leads`, e a ficha do cliente lê contatos via `include`. Leitura aninhada NÃO passa
 * pela extensão de soft delete do `lib/prisma.ts`. Ou seja: ligar a extensão sozinha NÃO cumpre
 * o critério de aceite ("funil não mostra lead com excluidoEm"); o filtro precisa ser explícito
 * nesses pontos, e é isso que este smoke verifica.
 *
 * Também cobre os `_count`, que são leitura aninhada igualmente: sem filtro, a etapa mostraria
 * "3 leads" com 2 na tela.
 *
 * Uso: npm run smoke:crm-soft-delete-lead
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { funilCompleto, listarEtapasFunil } from "../src/modules/comercial/queries";
import { obterCliente, listarClientesPaginado, contatosDoCliente } from "../src/modules/clientes/queries";

async function main() {
  const tag = `SMKSDL_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean, extra = "") => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}${extra ? ` — ${extra}` : ""}`);
    if (!cond) ok = false;
  };

  const etapa = await prisma.funilEtapa.findFirst({ where: { ativo: true }, orderBy: { ordem: "asc" } });
  if (!etapa) throw new Error("sem etapa de funil — rode `npm run db:seed`");

  const cliente = await prisma.cliente.create({ data: { tipo: "PJ", nome: `${tag}_cli` } });
  const lead = await prisma.lead.create({
    data: { nome: `${tag}_lead`, etapaId: etapa.id, clienteId: cliente.id },
  });
  const contato = await prisma.contatoCliente.create({
    data: { clienteId: cliente.id, nome: `${tag}_contato` },
  });

  const noFunil = async () =>
    (await funilCompleto()).flatMap((e) => e.leads).filter((l) => l.id === lead.id).length;
  const contagemEtapa = async () =>
    (await listarEtapasFunil()).find((e) => e.id === etapa.id)?._count.leads ?? -1;
  const naFicha = async () =>
    ((await obterCliente(cliente.id))?.contatos ?? []).filter((c) => c.id === contato.id).length;
  const contagemLista = async () =>
    (await listarClientesPaginado({ incluirInativos: true })).items.find((c) => c.id === cliente.id)
      ?._count.contatos ?? -1;

  // ── 1. Antes de excluir ──────────────────────────────────────────────────
  check("lead aparece no funil", (await noFunil()) === 1);
  check("contato aparece na ficha do cliente", (await naFicha()) === 1);
  const etapaAntes = await contagemEtapa();
  const listaAntes = await contagemLista();
  check("contagens iniciais coerentes", etapaAntes >= 1 && listaAntes >= 1, `etapa=${etapaAntes} lista=${listaAntes}`);

  // ── 2. Soft delete ───────────────────────────────────────────────────────
  await prisma.lead.update({ where: { id: lead.id }, data: { excluidoEm: new Date() } });
  await prisma.contatoCliente.update({ where: { id: contato.id }, data: { excluidoEm: new Date() } });

  // Estes são os checks que a extensão sozinha NÃO garantiria.
  check("lead excluído SOME do funil (leitura aninhada)", (await noFunil()) === 0);
  check("contato excluído SOME da ficha (leitura aninhada)", (await naFicha()) === 0);
  check(
    "contagem da etapa cai 1 (_count aninhado)",
    (await contagemEtapa()) === etapaAntes - 1,
    `${etapaAntes} → ${await contagemEtapa()}`,
  );
  check(
    "contagem de contatos na lista cai 1 (_count aninhado)",
    (await contagemLista()) === listaAntes - 1,
    `${listaAntes} → ${await contagemLista()}`,
  );

  // Leitura top-level: coberta pela extensão. NOTA: o where NÃO pode ser só `{ id }` — lookup
  // por id é isento de propósito (exemption da F1.17, para resolver nome em histórico), então
  // `count({ where: { id } })` devolveria 1 mesmo com o lead excluído. Isso é o comportamento
  // desejado; usar `nome` aqui testa a listagem de verdade.
  check(
    "lead some das leituras top-level (extensão)",
    (await prisma.lead.count({ where: { nome: { startsWith: tag } } })) === 0,
  );
  check(
    "mas CONTINUA visível em lookup por id (exemption da F1.17, para histórico)",
    (await prisma.lead.count({ where: { id: lead.id } })) === 1,
  );
  check(
    "contato some de contatosDoCliente (extensão)",
    (await contatosDoCliente(cliente.id)).filter((c) => c.id === contato.id).length === 0,
  );

  // ── 3. Continua no banco ─────────────────────────────────────────────────
  check(
    "lead CONTINUA no banco (findUnique não é filtrado)",
    !!(await prisma.lead.findUnique({ where: { id: lead.id } })),
  );
  check(
    "contato CONTINUA no banco",
    !!(await prisma.contatoCliente.findUnique({ where: { id: contato.id } })),
  );

  // ── 4. Reversível ────────────────────────────────────────────────────────
  await prisma.lead.update({ where: { id: lead.id }, data: { excluidoEm: null } });
  check("limpar excluidoEm devolve o lead ao funil", (await noFunil()) === 1);

  // ── Limpeza ──────────────────────────────────────────────────────────────
  await prisma.contatoCliente.delete({ where: { id: contato.id } });
  await prisma.lead.delete({ where: { id: lead.id } });
  await prisma.cliente.delete({ where: { id: cliente.id } });

  console.log(ok ? "\nSmoke do soft delete de Lead/Contato: OK" : "\nSmoke do soft delete de Lead/Contato: FALHOU");
  if (!ok) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
