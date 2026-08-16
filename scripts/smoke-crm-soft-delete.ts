/**
 * Smoke do soft delete de Cliente (F1.17) + Parceiro (F1.23a).
 *
 * Por que existe: `Cliente` é lido por 6 módulos FORA do CRM (busca, custos, documentos,
 * financeiro, projetos, rh). Ligar o filtro automático na extensão do Prisma pode fazer cliente
 * sumir onde ninguém esperava — regressão silenciosa em módulo que esta reforma nem tocou.
 *
 * Prova três coisas que lint/tsc/vitest não alcançam:
 *   1. Com nada excluído, TODA contagem continua idêntica (a extensão não muda o presente).
 *   2. Excluindo 1 cliente, ele some das LISTAGENS — exatamente 1 a menos, nem mais nem menos.
 *   3. Ele CONTINUA visível onde precisa: lookup por id, findUnique, relação (`include`), e no
 *      índice de deduplicação da importação financeira.
 *
 * O item 3 é o que importa: se falhar, a importação passa a criar clientes duplicados e
 * documento histórico perde o nome de quem era.
 *
 * Uso: npm run smoke:crm-soft-delete
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const tag = `SMKSOFT_${Date.now()}`;
  let ok = true;
  const check = (nome: string, cond: boolean, extra = "") => {
    console.log(`${cond ? "[OK]" : "[FALHA]"} ${nome}${extra ? ` — ${extra}` : ""}`);
    if (!cond) ok = false;
  };

  const cliente = await prisma.cliente.create({
    data: { tipo: "PJ", nome: `${tag}_alvo`, documento: "99888777000166", ativo: true },
  });

  // Contagens por módulo, do jeito que cada um consulta de verdade.
  const contagens = async () => ({
    listagem: await prisma.cliente.count(),
    ativos: await prisma.cliente.count({ where: { ativo: true } }),
    lookupPorId: (await prisma.cliente.findMany({ where: { id: { in: [cliente.id] } } })).length,
    findUnique: (await prisma.cliente.findUnique({ where: { id: cliente.id } })) ? 1 : 0,
    dedupeImportacao: (
      await prisma.cliente.findMany({
        where: { excluidoEm: { not: undefined } },
        select: { id: true },
      })
    ).length,
  });

  // ── 1. Antes de excluir nada ─────────────────────────────────────────────
  const antes = await contagens();
  check("cliente novo aparece na listagem", antes.listagem >= 1);
  check("aparece no lookup por id", antes.lookupPorId === 1);
  check("aparece no findUnique", antes.findUnique === 1);

  // ── 2. Soft delete ───────────────────────────────────────────────────────
  await prisma.cliente.update({ where: { id: cliente.id }, data: { excluidoEm: new Date() } });
  const depois = await contagens();

  check(
    "some da listagem — exatamente 1 a menos",
    depois.listagem === antes.listagem - 1,
    `${antes.listagem} → ${depois.listagem}`,
  );
  check(
    "some do filtro por ativo — exatamente 1 a menos",
    depois.ativos === antes.ativos - 1,
    `${antes.ativos} → ${depois.ativos}`,
  );

  // ── 3. Onde DEVE continuar visível ───────────────────────────────────────
  check("CONTINUA no lookup por id (resolve nome em histórico)", depois.lookupPorId === 1);
  check("CONTINUA no findUnique", depois.findUnique === 1);
  check(
    "CONTINUA no índice de dedupe da importação (senão duplicaria)",
    depois.dedupeImportacao === antes.dedupeImportacao,
    `${antes.dedupeImportacao} → ${depois.dedupeImportacao}`,
  );

  // Leitura por relação: um projeto do cliente excluído ainda mostra de quem era.
  const anoAtual = new Date().getFullYear();
  const projeto = await prisma.projeto.create({
    data: {
      ano: anoAtual, sequencial: Date.now() % 100000, codigo: `${tag}P`,
      tipo: "particular", nome: `${tag}_proj`, clienteId: cliente.id,
    },
  });
  const projComCliente = await prisma.projeto.findUnique({
    where: { id: projeto.id },
    select: { cliente: { select: { nome: true } } },
  });
  check(
    "projeto do cliente excluído AINDA mostra o nome dele (leitura por relação)",
    projComCliente?.cliente?.nome === `${tag}_alvo`,
  );

  // ── 4. Reativar volta ao estado anterior ─────────────────────────────────
  await prisma.cliente.update({ where: { id: cliente.id }, data: { excluidoEm: null } });
  const revertido = await contagens();
  check(
    "limpar excluidoEm devolve o cliente à listagem",
    revertido.listagem === antes.listagem,
    `${revertido.listagem}`,
  );

  // ── Limpeza ──────────────────────────────────────────────────────────────
  await prisma.projeto.delete({ where: { id: projeto.id } });
  await prisma.cliente.delete({ where: { id: cliente.id } });

  // ── 5. Parceiro (F1.23a) — mesmo padrão, verificação separada porque `parceiro` está FORA
  // dos 4 models originais da ADR-11 (o backlog pediu `excluidoEm` explicitamente na F1.23a) ──
  const parceiro = await prisma.parceiro.create({ data: { nome: `${tag}_parceiro`, tipo: "PF" } });
  // `where: { id }` sozinho cai na exceção `ehLookupPorId` — de propósito, não é o que este
  // bloco quer provar. Usa `nome` para exercitar a extensão de verdade.
  const contarPorNome = () => prisma.parceiro.count({ where: { nome: parceiro.nome } });

  check("parceiro novo aparece na listagem", (await contarPorNome()) === 1);
  await prisma.parceiro.update({ where: { id: parceiro.id }, data: { excluidoEm: new Date() } });
  check("some da listagem depois de excluído", (await contarPorNome()) === 0);
  check(
    "escape hatch (`excluidoEm: { not: undefined }`) continua enxergando",
    (await prisma.parceiro.count({ where: { nome: parceiro.nome, excluidoEm: { not: undefined } } })) === 1,
  );
  await prisma.parceiro.update({ where: { id: parceiro.id }, data: { excluidoEm: null } });
  check("reativar devolve à listagem", (await contarPorNome()) === 1);
  await prisma.parceiro.delete({ where: { id: parceiro.id } });

  console.log(ok ? "\nSmoke do soft delete de Cliente: OK" : "\nSmoke do soft delete de Cliente: FALHOU");
  if (!ok) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
