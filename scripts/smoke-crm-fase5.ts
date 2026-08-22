/**
 * Smoke da Fase 5 do CRM (Propostas) contra o banco de dev — um arquivo por fase, mesmo padrão
 * de `smoke-crm-fase1/2/3/4.ts`. Hoje cobre F5.2 (vínculo Proposta ↔ Negociação).
 *
 * ── F5.2 ── `planejarVinculo` (puro) já tem cobertura de `vitest` em
 * `vinculo-negociacao.test.ts` — os 5 ramos de classificação. O que SÓ este smoke prova é o que
 * exige Postgres real:
 *   · `carregarPendentes` lendo o banco de verdade (soma de itens, `leadId`, cliente);
 *   · `executarVinculo` gravando numa transação de verdade, com o agrupamento por lead batendo
 *     no `Negociacao.leadId @unique` — que é constraint de banco, não regra de código;
 *   · e principalmente **os 3 invariantes do `03-migracao.md` §7**: `numero` e `token` byte a
 *     byte inalterados, `PropostaSequencia.ultimo` inalterado, e a proposta ainda resolvível
 *     pelo token (o que a página `/a/proposta/[token]` faz).
 *
 * ── F5.4 ── `versoes.ts` (vigente derivada, trio de valores) tem cobertura de `vitest`. Aqui
 * ficam as duas coisas que só o banco prova: que `salvarProposta` de fato GRAVA as colunas
 * novas (e a comparação sobrevive ao snapshot ser esvaziado), e que **o SQL de backfill do
 * arquivo de migration funciona** — ele é lido do próprio arquivo e executado sobre versões
 * fabricadas no formato antigo, incluindo uma malformada. Sem isto, aquele SQL estrearia no
 * deploy de produção sem nunca ter rodado em lugar nenhum.
 *
 * ⚠️ NUNCA RODAR CONTRA PRODUÇÃO. Cria e apaga clientes, leads, negociações e propostas. Tudo
 * com prefixo `SMKF5_`, limpeza no `finally`.
 *
 * Uso: npm run smoke:crm-fase5
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import { planejarVinculo } from "../src/modules/comercial/vinculo-negociacao";
import { carregarPendentes, executarVinculo } from "../src/modules/comercial/migracao-vinculo";
import { salvarProposta } from "../src/modules/comercial/service";
import { versoesComparaveis } from "../src/modules/comercial/propostas-extras/queries";
import { versaoVigente } from "../src/modules/comercial/versoes";

const TAG = `SMKF5_${Date.now()}`;

async function main() {
  let ok = true;
  const check = (nome: string, cond: boolean, detalhe = "") => {
    console.log(`${cond ? "[OK]  " : "[FALHA]"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
    if (!cond) ok = false;
  };

  const [user, etapa] = await Promise.all([
    prisma.user.findFirst({ where: { role: "admin", ativo: true }, select: { id: true } }),
    prisma.funilEtapa.findFirst({ where: { ativo: true }, orderBy: { ordem: "asc" }, select: { id: true } }),
  ]);
  if (!user || !etapa) throw new Error("dev incompleto — rode `npm run db:seed`.");

  console.log("\n── F5.2: cenário (empresa, leads, negociação, 4 propostas) ────────\n");

  const cliente = await prisma.cliente.create({ data: { nome: `${TAG}_Empresa`, tipo: "PJ" } });

  // Lead A: JÁ qualificado — tem negociação real. As propostas dele devem ligar nela.
  const leadA = await prisma.lead.create({
    data: { nome: `${TAG}_LeadQualificado`, clienteId: cliente.id, etapaId: etapa.id, status: "OPORTUNIDADE_CRIADA" },
  });
  const negReal = await prisma.negociacao.create({
    data: { titulo: `${TAG}_NegociacaoReal`, clienteId: cliente.id, leadId: leadA.id, estagio: "PROPOSTA_ENVIADA" },
  });

  // Lead B: existe, NÃO qualificado. Suas 2 propostas devem COMPARTILHAR uma sintética.
  const leadB = await prisma.lead.create({
    data: { nome: `${TAG}_LeadSemNegociacao`, clienteId: cliente.id, etapaId: etapa.id, status: "EM_CONTATO" },
  });

  const ano = new Date().getFullYear();
  const criarProposta = async (sufixo: string, over: Record<string, unknown> = {}) =>
    prisma.proposta.create({
      data: {
        ano,
        // `sequencial` alto e fora da faixa real: NÃO tocar `PropostaSequencia` é parte do que
        // este smoke prova, então ele não pode consumir números da sequência de verdade.
        sequencial: 900000 + Math.floor(Math.random() * 90000),
        numero: `${TAG}_${sufixo}`,
        titulo: `${TAG} ${sufixo}`,
        clienteId: cliente.id,
        token: randomBytes(18).toString("hex"),
        autorId: user.id,
        ...over,
      },
      select: { id: true, numero: true, token: true, negociacaoId: true },
    });

  const pReal = await criarProposta("REAL", { leadId: leadA.id, status: "enviada" });
  const pSemLead = await criarProposta("SEMLEAD", { status: "aceita", aceitaEm: new Date() });
  const pLeadB1 = await criarProposta("LEADB1", { leadId: leadB.id, status: "rascunho" });
  const pLeadB2 = await criarProposta("LEADB2", { leadId: leadB.id, status: "rascunho" });
  const minhas = [pReal, pSemLead, pLeadB1, pLeadB2];
  const idsMinhas = new Set(minhas.map((p) => p.id));

  // Fotografia ANTES — é contra isto que os invariantes do §7 são conferidos.
  const antes = await prisma.proposta.findMany({
    where: { id: { in: [...idsMinhas] } },
    select: { id: true, numero: true, token: true, ano: true, sequencial: true, status: true, projetoId: true },
    orderBy: { numero: "asc" },
  });
  const sequenciaAntes = await prisma.propostaSequencia.findUnique({ where: { ano } });

  console.log("\n── F5.2: carregarPendentes lê o banco corretamente ────────────────\n");

  const carregado = await carregarPendentes(prisma);
  const meusPendentes = carregado.pendentes.filter((p) => idsMinhas.has(p.id));
  check("as 4 propostas novas aparecem como pendentes (negociacaoId nulo)", meusPendentes.length === 4, `${meusPendentes.length}`);
  check(
    "a negociação real do leadA foi carregada junto",
    carregado.negociacoes.some((n) => n.id === negReal.id && n.leadId === leadA.id),
  );
  check(
    "proposta sem itens vem com valorTotal nulo (o caso de produção)",
    meusPendentes.every((p) => p.valorTotal === null),
  );

  console.log("\n── F5.2: o plano classifica os 3 ramos ────────────────────────────\n");

  const { planos, abortos } = planejarVinculo(meusPendentes, carregado.leads, carregado.negociacoes);
  check("nenhum aborto neste cenário", abortos.length === 0, abortos.join(" | "));

  const planoDe = (id: string) => planos.find((p) => p.propostaId === id);
  const pr = planoDe(pReal.id);
  check("proposta do lead qualificado → negociação REAL", pr?.tipo === "real" && pr.negociacaoId === negReal.id);
  const ps = planoDe(pSemLead.id);
  check("proposta sem lead → sintética CONTRATADO (status aceita)", ps?.tipo === "sintetica" && ps.estagio === "CONTRATADO");
  const pb1 = planoDe(pLeadB1.id);
  const pb2 = planoDe(pLeadB2.id);
  check(
    "as 2 propostas do lead NÃO qualificado compartilham o mesmo grupo sintético",
    pb1?.tipo === "sintetica" && pb2?.tipo === "sintetica" && pb1.chaveGrupo === pb2.chaveGrupo,
  );

  console.log("\n── F5.2: executarVinculo grava contra Postgres real ───────────────\n");

  const negociacoesAntes = await prisma.negociacao.count();
  const out = await executarVinculo(prisma, planos);
  check("1 proposta vinculada à negociação existente", out.vinculadasAReal === 1, `${out.vinculadasAReal}`);
  check("3 propostas vinculadas a sintéticas", out.vinculadasASintetica === 3, `${out.vinculadasASintetica}`);
  check(
    "só 2 negociações sintéticas criadas (leadB agrupou suas 2 propostas)",
    out.negociacoesCriadas === 2,
    `${out.negociacoesCriadas}`,
  );
  const negociacoesDepois = await prisma.negociacao.count();
  check("o banco ganhou exatamente 2 negociações", negociacoesDepois - negociacoesAntes === 2, `${negociacoesDepois - negociacoesAntes}`);

  const depoisDoVinculo = await prisma.proposta.findMany({
    where: { id: { in: [...idsMinhas] } },
    select: { id: true, negociacaoId: true },
  });
  check("as 4 propostas ficaram com negociacaoId preenchido", depoisDoVinculo.every((p) => p.negociacaoId !== null));
  check(
    "a proposta do lead qualificado aponta para a negociação REAL, não para uma nova",
    depoisDoVinculo.find((p) => p.id === pReal.id)?.negociacaoId === negReal.id,
  );
  const negDe = (id: string) => depoisDoVinculo.find((p) => p.id === id)?.negociacaoId;
  check(
    "leadB1 e leadB2 apontam para a MESMA negociação sintética",
    negDe(pLeadB1.id) != null && negDe(pLeadB1.id) === negDe(pLeadB2.id),
    `${negDe(pLeadB1.id)} vs ${negDe(pLeadB2.id)}`,
  );
  check(
    "a proposta sem lead ganhou uma sintética PRÓPRIA, não a do leadB",
    negDe(pSemLead.id) != null && negDe(pSemLead.id) !== negDe(pLeadB1.id),
  );
  const idsSinteticas = new Set(
    depoisDoVinculo.filter((p) => p.id !== pReal.id).map((p) => p.negociacaoId),
  );

  const sinteticasCriadas = await prisma.negociacao.findMany({
    where: { id: { in: [...idsSinteticas].filter((x): x is string => x !== null) } },
    select: { needsReview: true, estagio: true, dataFechamento: true, leadId: true },
  });
  check("toda sintética nasce com needsReview=true (ADR-16)", sinteticasCriadas.every((n) => n.needsReview));
  check(
    "a sintética da proposta aceita carrega dataFechamento",
    sinteticasCriadas.some((n) => n.estagio === "CONTRATADO" && n.dataFechamento !== null),
  );

  console.log("\n── F5.2: os 3 invariantes do 03-migracao.md §7 ────────────────────\n");

  const depois = await prisma.proposta.findMany({
    where: { id: { in: [...idsMinhas] } },
    select: { id: true, numero: true, token: true, ano: true, sequencial: true, status: true, projetoId: true },
    orderBy: { numero: "asc" },
  });
  check(
    "numero e token BYTE A BYTE inalterados (e ano/sequencial/status/projetoId também)",
    JSON.stringify(antes) === JSON.stringify(depois),
  );

  const sequenciaDepois = await prisma.propostaSequencia.findUnique({ where: { ano } });
  check(
    "PropostaSequencia.ultimo inalterado — a próxima proposta não colide",
    sequenciaAntes?.ultimo === sequenciaDepois?.ultimo,
    `antes=${sequenciaAntes?.ultimo} depois=${sequenciaDepois?.ultimo}`,
  );

  // O que `/a/proposta/[token]/page.tsx` faz: findUnique por token, com itens e condições.
  const porToken = await prisma.proposta.findUnique({
    where: { token: pReal.token },
    include: { cliente: { select: { nome: true } }, itens: true, condicoes: true },
  });
  check("a proposta continua resolvível pelo token (o que a página pública faz)", porToken?.id === pReal.id);

  console.log("\n── F5.2: rodar de novo não faz nada (idempotência) ────────────────\n");

  const recarregado = await carregarPendentes(prisma);
  check(
    "nenhuma das 4 aparece mais como pendente",
    recarregado.pendentes.every((p) => !idsMinhas.has(p.id)),
  );
  const negociacoesFinal = await prisma.negociacao.count();
  check(
    "2ª leitura não criou negociação nenhuma",
    negociacoesFinal === negociacoesDepois,
    `delta=${negociacoesFinal - negociacoesDepois}`,
  );

  console.log("\n── F5.2: negociação SOFT-DELETADA aborta em vez de morrer no P2002 ──\n");

  // O caso que só o Postgres real prova: `Negociacao` tem soft delete, mas `leadId @unique` é
  // constraint de BANCO e não sabe de `excluidoEm`. Sem o escape hatch em `carregarPendentes`,
  // esta negociação seria invisível, o plano diria "sintética", e o INSERT morreria com P2002
  // no meio da transação — em produção, onde não dá para iterar.
  const leadC = await prisma.lead.create({
    data: { nome: `${TAG}_LeadNegExcluida`, clienteId: cliente.id, etapaId: etapa.id, status: "OPORTUNIDADE_CRIADA" },
  });
  const negExcluida = await prisma.negociacao.create({
    data: { titulo: `${TAG}_NegociacaoExcluida`, clienteId: cliente.id, leadId: leadC.id },
  });
  await prisma.negociacao.update({ where: { id: negExcluida.id }, data: { excluidoEm: new Date() } });
  const pLeadC = await criarProposta("LEADC", { leadId: leadC.id, status: "rascunho" });

  const carregado2 = await carregarPendentes(prisma);
  const negDoLeadC = carregado2.negociacoes.filter((n) => n.leadId === leadC.id);
  check(
    "carregarPendentes ENXERGA a negociação excluída (escape hatch de soft delete)",
    negDoLeadC.length === 1 && negDoLeadC[0].excluidoEm !== null,
    `${negDoLeadC.length} encontrada(s)`,
  );

  const plano2 = planejarVinculo(
    carregado2.pendentes.filter((p) => p.id === pLeadC.id),
    carregado2.leads,
    carregado2.negociacoes,
  );
  check("o plano ABORTA em vez de mandar criar sintética", plano2.abortos.length === 1 && plano2.planos.length === 0);
  check(
    "a mensagem explica o motivo (negociação excluída + índice único)",
    /negociação EXCLUÍDA/.test(plano2.abortos[0] ?? "") && /índice único de leadId/.test(plano2.abortos[0] ?? ""),
    plano2.abortos[0],
  );

  // E a prova de que o aborto não é zelo excessivo: criar a sintética de fato estoura.
  let estourou = "";
  try {
    await prisma.negociacao.create({
      data: { titulo: `${TAG}_NaoDeveriaNascer`, clienteId: cliente.id, leadId: leadC.id },
    });
  } catch (e) {
    estourou = (e as { code?: string }).code ?? "";
  }
  check(
    "criar a sintética mesmo assim estoura P2002 — é isto que o aborto evita",
    estourou === "P2002",
    estourou || "não estourou",
  );

  console.log("\n── F5.4: 3 versões, comparadas sem parsear JSON ───────────────────\n");

  const pVersionada = await criarProposta("VERSOES", { status: "rascunho" });
  const salvar = (titulo: string, itens: { disciplina: string; valor: number }[], validade?: string) =>
    salvarProposta(
      {
        id: pVersionada.id,
        titulo,
        areaM2: undefined,
        validade: validade ?? "",
        observacoes: `obs de ${titulo}`,
        itens: itens.map((it) => ({ disciplina: it.disciplina, descricao: "", valor: it.valor })),
        condicoes: [],
      },
      user.id,
    );

  await salvar("v1", [{ disciplina: "Arquitetura", valor: 1000 }], "2026-09-30");
  await salvar("v2", [{ disciplina: "Arquitetura", valor: 1000 }, { disciplina: "Estrutural", valor: 2500.5 }]);
  await salvar("v3", [{ disciplina: "Arquitetura", valor: 4000 }]);

  const comparaveis = await versoesComparaveis(pVersionada.id);
  check("as 3 versões existem, numeradas 1..3", comparaveis.length === 3, `${comparaveis.length}`);
  check(
    "a numeração é sequencial e a vigente é a de maior número",
    versaoVigente(comparaveis)?.numero === 3,
    `vigente=v${versaoVigente(comparaveis)?.numero}`,
  );

  // O aceite: o total vem da COLUNA. Conferido lendo o banco direto, sem passar pelo snapshot.
  const colunas = await prisma.propostaVersao.findMany({
    where: { propostaId: pVersionada.id },
    orderBy: { numero: "asc" },
    select: { numero: true, valorOriginal: true, valorVersao: true, desconto: true, status: true, validade: true, observacao: true },
  });
  check(
    "valorVersao gravado em COLUNA nas 3 versões (1000 / 3500.5 / 4000)",
    colunas.map((c) => Number(c.valorVersao)).join(",") === "1000,3500.5,4000",
    colunas.map((c) => c.valorVersao?.toString()).join(" | "),
  );
  check(
    "sem desconto, valorOriginal === valorVersao (estado 'nenhum abatimento')",
    colunas.every((c) => c.valorOriginal?.toString() === c.valorVersao?.toString() && c.desconto === null),
  );
  check("status da proposta no momento da versão foi gravado", colunas.every((c) => c.status === "rascunho"));
  check("validade da v1 foi para coluna própria", colunas[0].validade?.toISOString().slice(0, 10) === "2026-09-30");
  check("observação da versão foi para coluna própria", colunas[2].observacao === "obs de v3");

  // A prova de que comparar não depende mais do JSON: apaga o snapshot e o total continua certo.
  await prisma.$executeRawUnsafe(
    `UPDATE proposta_versao SET snapshot = '{}'::jsonb WHERE "propostaId" = $1 AND numero = 2`,
    pVersionada.id,
  );
  const aposApagarSnapshot = await versoesComparaveis(pVersionada.id);
  const v2SemSnapshot = aposApagarSnapshot.find((v) => v.numero === 2);
  check(
    "com o snapshot ESVAZIADO, o total da v2 continua 3500.5 (vem da coluna)",
    v2SemSnapshot?.total === 3500.5,
    `${v2SemSnapshot?.total}`,
  );
  check("os itens somem junto com o snapshot — é ele que os guarda, e isso é esperado", v2SemSnapshot?.itens.length === 0);

  console.log("\n── F5.4: o SQL de backfill da migration, contra dado real ─────────\n");

  // Versões escritas ANTES da F5.4 não têm as colunas preenchidas. Simula esse estado e roda os
  // mesmos UPDATEs do arquivo de migration — que de outro modo só estreariam em produção.
  const pLegado = await criarProposta("LEGADO", { status: "enviada" });
  const legadas = [
    { numero: 1, snapshot: { titulo: "L1", validade: "2026-12-31", observacoes: "obs legada", itens: [{ disciplina: "A", valor: 1000 }, { disciplina: "B", valor: 2500.5 }] } },
    { numero: 2, snapshot: { titulo: "L2", validade: null, itens: [{ disciplina: "A", valor: "3000" }] } },
    { numero: 3, snapshot: { titulo: "L3", validade: "data-invalida", itens: "lixo" } },
  ];
  for (const l of legadas) {
    await prisma.propostaVersao.create({
      data: { propostaId: pLegado.id, numero: l.numero, autorId: user.id, snapshot: l.snapshot as never },
    });
  }

  const sqlMigration = readFileSync(
    "prisma/migrations/20260822140000_crm_f54_proposta_versao_estruturada/migration.sql",
    "utf8",
  );
  const updates = sqlMigration
    .split("\n")
    .filter((linha) => !linha.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.toUpperCase().startsWith("UPDATE"));
  check("o arquivo de migration tem os 3 UPDATEs de backfill", updates.length === 3, `${updates.length}`);
  for (const u of updates) await prisma.$executeRawUnsafe(u);

  const backfilled = await prisma.propostaVersao.findMany({
    where: { propostaId: pLegado.id },
    orderBy: { numero: "asc" },
    select: { numero: true, valorOriginal: true, valorVersao: true, validade: true, observacao: true, status: true },
  });
  check("v1 legada: soma dos itens (3500.5) foi derivada do snapshot", Number(backfilled[0].valorVersao) === 3500.5);
  check("v1 legada: validade e observação extraídas do JSON", backfilled[0].validade?.toISOString().slice(0, 10) === "2026-12-31" && backfilled[0].observacao === "obs legada");
  check("v2 legada: valor gravado como STRING no JSON também converte", Number(backfilled[1].valorVersao) === 3000);
  check("v2 legada: validade null no snapshot fica null, sem estourar", backfilled[1].validade === null);
  check(
    "v3 legada: snapshot MALFORMADO (itens não-array) vira NULL em vez de derrubar a migration",
    backfilled[2].valorVersao === null,
  );
  check('v3 legada: validade "data-invalida" não passou pelo cast', backfilled[2].validade === null);
  check(
    "status NÃO é inventado no backfill — o snapshot nunca o guardou",
    backfilled.every((b) => b.status === null),
  );

  console.log(`\n${ok ? "✔ Fase 5: tudo verde." : "✖ Fase 5: há falhas acima."}`);
  if (!ok) process.exitCode = 1;
}

async function limpar() {
  const clientes = await prisma.cliente.findMany({ where: { nome: { contains: TAG } }, select: { id: true } });
  const ids = clientes.map((c) => c.id);
  if (ids.length === 0) return;
  // Ordem ditada pelas FKs: proposta referencia negociacao (SET NULL, mas some junto de qualquer
  // forma), negociacao referencia cliente (RESTRICT), lead referencia cliente (RESTRICT).
  const props = await prisma.proposta.findMany({ where: { clienteId: { in: ids } }, select: { id: true } });
  await prisma.propostaVersao.deleteMany({ where: { propostaId: { in: props.map((p) => p.id) } } });
  await prisma.propostaItem.deleteMany({ where: { propostaId: { in: props.map((p) => p.id) } } });
  await prisma.propostaCondicao.deleteMany({ where: { propostaId: { in: props.map((p) => p.id) } } });
  await prisma.proposta.deleteMany({ where: { clienteId: { in: ids } } });
  // SQL cru: `deleteMany` do Prisma passa pela extensão de soft delete, que injeta
  // `excluidoEm: null` e deixaria a negociação EXCLUÍDA do cenário acima para trás — resíduo
  // que bloquearia o `cliente.delete` no fim (FK RESTRICT).
  await prisma.$executeRawUnsafe(
    `DELETE FROM negociacao WHERE "clienteId" = ANY($1::text[])`,
    ids,
  );
  await prisma.atividade.deleteMany({ where: { clienteId: { in: ids } } });
  await prisma.lead.deleteMany({ where: { clienteId: { in: ids } } });
  await prisma.cliente.deleteMany({ where: { id: { in: ids } } });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await limpar();
    await prisma.$disconnect();
  });
