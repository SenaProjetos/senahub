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
 * ── F5.7 ── exercita o handler REAL (`alertaPropostasExpiradas`), não uma cópia. Consequência
 * a saber: ele varre o banco inteiro, como faria em produção, então **carimba
 * `alertaValidadeEm` nas propostas do seed que já estiverem vencidas** e gera o sino delas.
 * É comportamento correto (é o que o job faz), e o `finally` só limpa o que o smoke criou —
 * as notificações do seed ficam, porque são verdadeiras.
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
import { removerArquivo } from "../src/lib/storage";
import { planejarVinculo } from "../src/modules/comercial/vinculo-negociacao";
import { carregarPendentes, executarVinculo } from "../src/modules/comercial/migracao-vinculo";
import {
  salvarProposta,
  aceitarProposta,
  criarProposta,
  criarPropostaDeLead,
  mudarStatusProposta,
  moverEstagio,
  reabrirNegociacao,
} from "../src/modules/comercial/service";
import { versoesComparaveis } from "../src/modules/comercial/propostas-extras/queries";
import { versaoVigente } from "../src/modules/comercial/versoes";
import { alertaPropostasExpiradas } from "../src/lib/jobs-handlers";
import {
  arquivarPdfDaVersao,
  pdfArquivadoDaVersao,
  pdfArquivadoDaProposta,
} from "../src/modules/comercial/pdf-proposta";
import { getConfigComercial } from "../src/modules/comercial/config/queries";

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
  const criarPropostaFixture = async (sufixo: string, over: Record<string, unknown> = {}) =>
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

  const pReal = await criarPropostaFixture("REAL", { leadId: leadA.id, status: "enviada" });
  const pSemLead = await criarPropostaFixture("SEMLEAD", { status: "aceita", aceitaEm: new Date() });
  const pLeadB1 = await criarPropostaFixture("LEADB1", { leadId: leadB.id, status: "rascunho" });
  const pLeadB2 = await criarPropostaFixture("LEADB2", { leadId: leadB.id, status: "rascunho" });
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
  const pLeadC = await criarPropostaFixture("LEADC", { leadId: leadC.id, status: "rascunho" });

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

  const pVersionada = await criarPropostaFixture("VERSOES", { status: "rascunho" });
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
  const pLegado = await criarPropostaFixture("LEGADO", { status: "enviada" });
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

  console.log("\n── F5.7: alerta de validade — tick 2× dá 1 notificação só ────────\n");

  // Prime: drena ANTES de criar as fixtures o que já estiver "enviada + vencida + nunca avisada"
  // no banco inteiro — `alertaPropostasExpiradas` varre TODA a tabela, sem filtro por tag, e a
  // carga sintética da F6.2 (3 mil propostas, validade aleatória) inevitavelmente inclui algumas
  // nessa condição. Sem o prime, o "2º tick" deste smoke conta esse backlog alheio, não a
  // proposta da fixture (achado rodando de verdade após a F6.2 popular o banco de dev).
  await alertaPropostasExpiradas();

  const ONTEM_EM_RECIFE = "2020-01-01"; // bem no passado: expirada sem depender do relógio real
  const pExpirada = await criarPropostaFixture("EXPIRADA", {
    status: "enviada",
    validade: new Date(`${ONTEM_EM_RECIFE}T00:00:00.000Z`),
  });
  const pAceitaVencida = await criarPropostaFixture("ACEITAVENCIDA", {
    status: "aceita",
    aceitaEm: new Date(),
    validade: new Date(`${ONTEM_EM_RECIFE}T00:00:00.000Z`),
  });
  const pNoPrazo = await criarPropostaFixture("NOPRAZO", {
    status: "enviada",
    validade: new Date("2099-12-31T00:00:00.000Z"),
  });

  // `Notificacao` não persiste `tag` (ela só existe para o push) — o `href` é o que identifica
  // a proposta no sino, e é único por proposta.
  const contarNotif = (propostaId: string) =>
    prisma.notificacao.count({ where: { href: `/comercial/propostas/${propostaId}` } });

  const primeiroTick = await alertaPropostasExpiradas();
  check("1º tick avisou ao menos a proposta expirada", primeiroTick >= 1, `${primeiroTick} avisada(s)`);
  check("a proposta expirada gerou notificação", (await contarNotif(pExpirada.id)) > 0);
  check(
    "proposta ACEITA com validade vencida NÃO é avisada (aceite da tarefa)",
    (await contarNotif(pAceitaVencida.id)) === 0,
  );
  check("proposta dentro do prazo não é avisada", (await contarNotif(pNoPrazo.id)) === 0);

  const notifDepoisDo1 = await contarNotif(pExpirada.id);
  const segundoTick = await alertaPropostasExpiradas();
  const notifDepoisDo2 = await contarNotif(pExpirada.id);
  check(
    "2º tick NÃO avisa de novo a mesma proposta (compare-and-swap)",
    notifDepoisDo2 === notifDepoisDo1,
    `${notifDepoisDo1} → ${notifDepoisDo2}`,
  );
  check("o 2º tick não contou a proposta já avisada", segundoTick === 0, `${segundoTick}`);

  const marcada = await prisma.proposta.findUnique({
    where: { id: pExpirada.id },
    select: { alertaValidadeEm: true, status: true },
  });
  check("alertaValidadeEm foi carimbado", marcada?.alertaValidadeEm != null);
  check(
    "o status NÃO mudou — 'expirada' não é estado, é derivado da validade",
    marcada?.status === "enviada",
    `${marcada?.status}`,
  );

  console.log("\n── F5.9: aceite ponta a ponta, numa transação só ─────────────────\n");

  // Cenário completo: empresa PROSPECT, negociação em ORÇAMENTO (de propósito — não é
  // PROPOSTA_ENVIADA, para exercitar o caminho `porAceiteDeProposta`), proposta com itens.
  const cliAceite = await prisma.cliente.create({
    data: { nome: `${TAG}_EmpresaAceite`, tipo: "PJ", status: "PROSPECT" },
  });
  const leadAceite = await prisma.lead.create({
    data: { nome: `${TAG}_LeadAceite`, clienteId: cliAceite.id, etapaId: etapa.id, status: "OPORTUNIDADE_CRIADA" },
  });
  const negAceite = await prisma.negociacao.create({
    data: {
      titulo: `${TAG}_NegAceite`,
      clienteId: cliAceite.id,
      leadId: leadAceite.id,
      estagio: "ORCAMENTO",
      valorEstimado: 999,
    },
  });
  const pAceite = await prisma.proposta.create({
    data: {
      ano,
      sequencial: 970000 + Math.floor(Math.random() * 9000),
      numero: `${TAG}_ACEITE`,
      titulo: `${TAG} Projeto do aceite`,
      clienteId: cliAceite.id,
      negociacaoId: negAceite.id,
      token: randomBytes(18).toString("hex"),
      autorId: user.id,
      status: "enviada",
    },
    select: { id: true, numero: true },
  });
  await salvarProposta(
    {
      id: pAceite.id,
      titulo: `${TAG} Projeto do aceite`,
      areaM2: undefined,
      validade: "",
      observacoes: "",
      itens: [
        { disciplina: "Arquitetura", descricao: "", valor: 12000 },
        { disciplina: "Estrutural", descricao: "", valor: 8000 },
      ],
      condicoes: [],
    },
    user.id,
  );

  const projetosAntes = await prisma.projeto.count();
  const resultado = await aceitarProposta(pAceite.id, user.id);
  check("o aceite devolveu projeto", !!resultado.projetoId && !!resultado.codigo, resultado.codigo);

  const [propostaDepois, projetoCriado, negDepois, cliDepois] = await Promise.all([
    prisma.proposta.findUnique({
      where: { id: pAceite.id },
      select: { status: true, aceitaEm: true, projetoId: true, negociacaoId: true },
    }),
    prisma.projeto.findUnique({
      where: { id: resultado.projetoId },
      select: { negociacaoId: true, clienteId: true, nome: true, disciplinas: { select: { id: true } } },
    }),
    prisma.negociacao.findUnique({
      where: { id: negAceite.id },
      select: { estagio: true, valorNegociado: true, dataFechamento: true, probabilidade: true },
    }),
    prisma.cliente.findUnique({ where: { id: cliAceite.id }, select: { status: true } }),
  ]);

  // ── §8.5: os dois caminhos gravados JUNTOS ──
  check(
    "§8.5 — Proposta.projetoId E Projeto.negociacaoId gravados na MESMA transação",
    propostaDepois?.projetoId === resultado.projetoId && projetoCriado?.negociacaoId === negAceite.id,
    `proposta.projetoId=${propostaDepois?.projetoId} projeto.negociacaoId=${projetoCriado?.negociacaoId}`,
  );
  check(
    "os dois apontam para a mesma negociação da proposta",
    propostaDepois?.negociacaoId === projetoCriado?.negociacaoId,
  );

  check("proposta virou aceita, com data", propostaDepois?.status === "aceita" && propostaDepois.aceitaEm != null);
  check("projeto nasceu com 1 disciplina por item", projetoCriado?.disciplinas.length === 2, `${projetoCriado?.disciplinas.length}`);
  check("negociação foi a CONTRATADO", negDepois?.estagio === "CONTRATADO", `${negDepois?.estagio}`);
  check(
    "valorNegociado = soma dos itens da proposta aceita (20000), não o valorEstimado (999)",
    Number(negDepois?.valorNegociado) === 20000,
    `${negDepois?.valorNegociado}`,
  );
  check("dataFechamento carimbada", negDepois?.dataFechamento != null);
  check("empresa virou CLIENTE (ADR-08)", cliDepois?.status === "CLIENTE", `${cliDepois?.status}`);

  const versaoAceita = await prisma.propostaVersao.findFirst({
    where: { propostaId: pAceite.id },
    orderBy: { numero: "desc" },
    select: { status: true, valorVersao: true },
  });
  check(
    "a versão vigente foi carimbada como aceita, com o valor final",
    versaoAceita?.status === "aceita" && Number(versaoAceita.valorVersao) === 20000,
    `${versaoAceita?.status} / ${versaoAceita?.valorVersao}`,
  );

  const eventos = await prisma.atividade.findMany({
    where: { clienteId: cliAceite.id },
    select: { metadata: true },
  });
  const nomesEventos = eventos.map((e) => (e.metadata as { evento?: string } | null)?.evento);
  for (const ev of ["PROPOSTA_ACEITA", "PROJETO_CRIADO", "ESTAGIO_ALTERADO"]) {
    check(`timeline registrou ${ev}`, nomesEventos.includes(ev), nomesEventos.join(", "));
  }

  console.log("\n── F5.9: falha no meio não deixa projeto órfão ────────────────────\n");

  // Aceitar a MESMA proposta de novo é recusado — e o importante: sem criar projeto nenhum.
  const projetosAntesDaFalha = await prisma.projeto.count();
  let recusouSegundoAceite = false;
  try {
    await aceitarProposta(pAceite.id, user.id);
  } catch {
    recusouSegundoAceite = true;
  }
  check("aceitar duas vezes é recusado", recusouSegundoAceite);
  check(
    "nenhum projeto a mais foi criado na tentativa recusada",
    (await prisma.projeto.count()) === projetosAntesDaFalha,
  );

  // Negociação já PERDIDA recusa o aceite ANTES de tocar o banco — a validação roda antes da
  // transação, então nem sequência de projeto é consumida.
  const cliPerdido = await prisma.cliente.create({ data: { nome: `${TAG}_EmpresaPerdida`, tipo: "PJ" } });
  const negPerdida = await prisma.negociacao.create({
    data: { titulo: `${TAG}_NegPerdida`, clienteId: cliPerdido.id, estagio: "PERDIDO" },
  });
  const pPerdida = await prisma.proposta.create({
    data: {
      ano,
      sequencial: 960000 + Math.floor(Math.random() * 9000),
      numero: `${TAG}_PERDIDA`,
      titulo: `${TAG} Perdida`,
      clienteId: cliPerdido.id,
      negociacaoId: negPerdida.id,
      token: randomBytes(18).toString("hex"),
      autorId: user.id,
    },
    select: { id: true },
  });
  await salvarProposta(
    {
      id: pPerdida.id,
      titulo: `${TAG} Perdida`,
      areaM2: undefined,
      validade: "",
      observacoes: "",
      itens: [{ disciplina: "Arquitetura", descricao: "", valor: 5000 }],
      condicoes: [],
    },
    user.id,
  );

  const projetosAntesDaPerdida = await prisma.projeto.count();
  let recusouPerdida = "";
  try {
    await aceitarProposta(pPerdida.id, user.id);
  } catch (e) {
    recusouPerdida = (e as Error).message;
  }
  check("aceite de proposta em negociação PERDIDA é recusado", recusouPerdida !== "", recusouPerdida);
  check("a mensagem é de negócio, falando em aceitar", /aceitar a proposta/i.test(recusouPerdida));
  check(
    "nenhum projeto órfão — a validação roda ANTES da transação",
    (await prisma.projeto.count()) === projetosAntesDaPerdida,
  );
  check(
    "a negociação perdida continua PERDIDO, intocada",
    (await prisma.negociacao.findUnique({ where: { id: negPerdida.id }, select: { estagio: true } }))?.estagio === "PERDIDO",
  );

  check(
    "no total, o aceite bem-sucedido criou exatamente 1 projeto",
    (await prisma.projeto.count()) === projetosAntes + 1,
  );

  console.log("\n── F5.13: PDF da v1 continua sendo o da v1 depois da v2 ──────────\n");

  // Gerador FALSO: o de verdade faz `page.goto` num servidor Next que não está no ar sob `tsx`.
  // O que importa aqui não é o Chrome — é o arquivamento: gravou o byte, carimbou o caminho, e
  // o download devolve o documento ANTIGO depois de a proposta mudar.
  const pdfDaChamada: string[] = [];
  const gerarFake = async (token: string) => {
    const conteudo = `%PDF-fake v${pdfDaChamada.length + 1} token=${token}`;
    pdfDaChamada.push(conteudo);
    return Buffer.from(conteudo, "utf8");
  };

  const pPdf = await criarPropostaFixture("PDF", { status: "rascunho" });
  const salvarPdf = (titulo: string, valor: number) =>
    salvarProposta(
      {
        id: pPdf.id,
        titulo,
        areaM2: undefined,
        validade: "",
        observacoes: "",
        itens: [{ disciplina: "Arquitetura", descricao: "", valor }],
        condicoes: [],
      },
      user.id,
    );

  await salvarPdf(`${TAG} v1`, 1000);
  const arq1 = await arquivarPdfDaVersao(pPdf.id, { gerar: gerarFake });
  check(
    "arquivou o PDF da v1 no envio",
    arq1.arquivado === true && arq1.versao === 1,
    JSON.stringify(arq1),
  );

  // Reenviar a MESMA versão não regera — o documento que o cliente recebeu é o que fica.
  const arq1Denovo = await arquivarPdfDaVersao(pPdf.id, { gerar: gerarFake });
  check(
    "reenviar a mesma versão NÃO regera o PDF (idempotente)",
    arq1Denovo.arquivado === false && /já tem PDF arquivado/.test(arq1Denovo.motivo),
    JSON.stringify(arq1Denovo),
  );

  // ── O aceite literal da tarefa ──
  await salvarPdf(`${TAG} v2 MUDADA`, 99999);
  const pdfV1 = await pdfArquivadoDaVersao(pPdf.id, 1);
  check(
    "depois de salvar a v2, o PDF da v1 ainda é o documento da v1",
    pdfV1?.buffer.toString("utf8") === "%PDF-fake v1 token=" + (await prisma.proposta.findUnique({ where: { id: pPdf.id }, select: { token: true } }))!.token,
    pdfV1?.buffer.toString("utf8").slice(0, 30),
  );
  check("o PDF da v1 não virou o da v2", !pdfV1?.buffer.toString("utf8").includes("v2"));

  const pdfV2 = await pdfArquivadoDaVersao(pPdf.id, 2);
  check("a v2, ainda não enviada, NÃO tem PDF arquivado (404 na rota interna)", pdfV2 === null);

  // A rota pública serve o arquivado da VIGENTE; como a v2 não foi enviada, não há arquivado
  // vigente e ela cairia no ao-vivo — que é o fallback correto, não um bug.
  const publico = await pdfArquivadoDaProposta(pPdf.id);
  check(
    "a rota pública não serve o PDF da v1 como se fosse o atual (vigente é a v2, sem arquivo)",
    publico === null,
  );

  // Agora envia a v2: passa a haver arquivado vigente, e os DOIS coexistem.
  const arq2 = await arquivarPdfDaVersao(pPdf.id, { gerar: gerarFake });
  check("arquivou o PDF da v2", arq2.arquivado === true && arq2.versao === 2, JSON.stringify(arq2));
  const publicoDepois = await pdfArquivadoDaProposta(pPdf.id);
  check("a rota pública agora serve o da v2 (a vigente)", publicoDepois?.versao === 2);
  const pdfV1AindaLa = await pdfArquivadoDaVersao(pPdf.id, 1);
  check(
    "e o da v1 continua lá, intocado — os dois coexistem",
    pdfV1AindaLa?.buffer.toString("utf8").includes("v1") === true,
  );

  const colunasPdf = await prisma.propostaVersao.findMany({
    where: { propostaId: pPdf.id },
    orderBy: { numero: "asc" },
    select: { numero: true, pdfPath: true, pdfHashSha256: true, pdfTamanho: true },
  });
  check(
    "as duas versões têm caminho, hash e tamanho gravados",
    colunasPdf.every((c) => c.pdfPath && c.pdfHashSha256 && (c.pdfTamanho ?? 0) > 0),
    JSON.stringify(colunasPdf.map((c) => ({ v: c.numero, t: c.pdfTamanho }))),
  );
  check(
    "os caminhos são diferentes entre as versões (não sobrescreve)",
    colunasPdf[0].pdfPath !== colunasPdf[1].pdfPath,
  );

  // Falha na geração não derruba o envio.
  const pPdfFalha = await criarPropostaFixture("PDFFALHA", { status: "rascunho" });
  await salvarProposta(
    { id: pPdfFalha.id, titulo: `${TAG} falha`, areaM2: undefined, validade: "", observacoes: "",
      itens: [{ disciplina: "Arquitetura", descricao: "", valor: 1 }], condicoes: [] },
    user.id,
  );
  const arqFalha = await arquivarPdfDaVersao(pPdfFalha.id, {
    gerar: async () => {
      throw new Error("Chrome explodiu");
    },
  });
  check(
    "falha ao gerar NÃO lança — devolve o motivo (o envio não pode cair por causa do PDF)",
    arqFalha.arquivado === false && /Chrome explodiu/.test(arqFalha.motivo),
    JSON.stringify(arqFalha),
  );

  console.log("\n── F5.3: proposta nova exige negociação ───────────────────────────\n");

  const cliF53 = await prisma.cliente.create({ data: { nome: `${TAG}_EmpresaF53`, tipo: "PJ" } });
  const negF53 = await prisma.negociacao.create({
    data: { titulo: `${TAG}_NegF53`, clienteId: cliF53.id, estagio: "ORCAMENTO" },
  });

  const propostaComNeg = await criarProposta({ titulo: `${TAG} com negociação`, clienteId: cliF53.id, negociacaoId: negF53.id }, user.id);
  check("criarProposta com negociação válida funciona", !!propostaComNeg.numero, propostaComNeg.numero);

  let recusouOutroCliente = "";
  const cliOutro = await prisma.cliente.create({ data: { nome: `${TAG}_EmpresaOutra`, tipo: "PJ" } });
  try {
    await criarProposta({ titulo: `${TAG} x`, clienteId: cliOutro.id, negociacaoId: negF53.id }, user.id);
  } catch (e) {
    recusouOutroCliente = (e as Error).message;
  }
  check(
    "negociação de OUTRO cliente é recusada, com mensagem de negócio",
    /não é desta empresa/i.test(recusouOutroCliente),
    recusouOutroCliente,
  );

  let recusouInexistente = "";
  try {
    await criarProposta({ titulo: `${TAG} y`, clienteId: cliF53.id, negociacaoId: "id-que-nao-existe" }, user.id);
  } catch (e) {
    recusouInexistente = (e as Error).message;
  }
  check("negociação inexistente é recusada", /não encontrada/i.test(recusouInexistente), recusouInexistente);

  // "a proposta histórica continua abrindo" — simula uma proposta ANTERIOR à F5.3 (sem
  // negociação) e confere que a leitura não quebrou.
  const propostaHistorica = await prisma.proposta.create({
    data: {
      ano, sequencial: 950000 + Math.floor(Math.random() * 9000), numero: `${TAG}_HIST`,
      titulo: `${TAG} histórica`, clienteId: cliF53.id, token: randomBytes(18).toString("hex"), autorId: user.id,
    },
  });
  const lida = await prisma.proposta.findUnique({ where: { id: propostaHistorica.id }, select: { negociacaoId: true, numero: true } });
  check(
    "proposta histórica (sem negociação) continua legível normalmente",
    lida?.negociacaoId === null && lida.numero === propostaHistorica.numero,
  );

  console.log("\n── F5.3: criarPropostaDeLead garante negociação (ADR-21 item 5) ──\n");

  // (a) Lead JÁ qualificado (tem negociação) — reusa, não cria uma 2ª.
  const leadJaQualificado = await prisma.lead.create({
    data: { nome: `${TAG}_LeadJaQual`, clienteId: cliF53.id, etapaId: etapa.id, status: "OPORTUNIDADE_CRIADA" },
  });
  const negJaExistente = await prisma.negociacao.create({
    data: { titulo: `${TAG}_NegJaExistente`, clienteId: cliF53.id, leadId: leadJaQualificado.id, estagio: "LEVANTAMENTO" },
  });
  const negociacoesAntesA = await prisma.negociacao.count();
  const { proposta: propostaA } = await criarPropostaDeLead(
    { leadId: leadJaQualificado.id, titulo: `${TAG} de lead já qualificado` },
    user.id,
  );
  check("(a) proposta criada aponta pra negociação JÁ EXISTENTE, não pra uma nova", propostaA.negociacaoId === negJaExistente.id);
  check("(a) nenhuma negociação a mais foi criada", (await prisma.negociacao.count()) === negociacoesAntesA);

  // (b) Lead qualificável (status ativo) — qualifica sozinho, sem perguntar nada.
  const leadQualificavel = await prisma.lead.create({
    data: { nome: `${TAG}_LeadQualificavel`, clienteId: cliF53.id, etapaId: etapa.id, status: "EM_CONTATO" },
  });
  const { proposta: propostaB } = await criarPropostaDeLead(
    { leadId: leadQualificavel.id, titulo: `${TAG} de lead qualificável` },
    user.id,
  );
  const leadBDepois = await prisma.lead.findUnique({ where: { id: leadQualificavel.id }, select: { status: true } });
  check("(b) lead qualificável virou OPORTUNIDADE_CRIADA sozinho", leadBDepois?.status === "OPORTUNIDADE_CRIADA");
  check("(b) a proposta nasceu com negociacaoId preenchido", propostaB.negociacaoId !== null);
  const negB = await prisma.negociacao.findUnique({ where: { id: propostaB.negociacaoId! }, select: { leadId: true } });
  check("(b) a negociação criada aponta de volta pro lead (o lead sobrevive, F2.8)", negB?.leadId === leadQualificavel.id);

  // (c) Lead FORA do fluxo, sem confirmação — recusa, com a mensagem que a UI reconhece.
  const leadForaDoFluxo = await prisma.lead.create({
    data: { nome: `${TAG}_LeadDescartado`, clienteId: cliF53.id, etapaId: etapa.id, status: "DESCARTADO" },
  });
  let recusouSemConfirmar = "";
  try {
    await criarPropostaDeLead({ leadId: leadForaDoFluxo.id, titulo: `${TAG} sem confirmar` }, user.id);
  } catch (e) {
    recusouSemConfirmar = (e as Error).message;
  }
  check(
    "(c) lead DESCARTADO sem confirmarReativacao é recusado, mensagem fala em reativar",
    /reativá-la/i.test(recusouSemConfirmar),
    recusouSemConfirmar,
  );
  const leadCIntocado = await prisma.lead.findUnique({ where: { id: leadForaDoFluxo.id }, select: { status: true } });
  check("(c) o lead recusado continua DESCARTADO, intocado", leadCIntocado?.status === "DESCARTADO");
  check(
    "(c) nenhuma negociação foi criada na tentativa recusada",
    (await prisma.negociacao.findUnique({ where: { leadId: leadForaDoFluxo.id } })) === null,
  );

  // (d) MESMO lead, agora COM confirmação — reativa (por validarMovimentoProspeccao, não update
  // cru), qualifica, e cria a proposta — tudo numa transação.
  const { proposta: propostaD } = await criarPropostaDeLead(
    { leadId: leadForaDoFluxo.id, titulo: `${TAG} com confirmação`, confirmarReativacao: true },
    user.id,
  );
  const leadDDepois = await prisma.lead.findUnique({ where: { id: leadForaDoFluxo.id }, select: { status: true } });
  check(
    "(d) com confirmação, o lead sai de DESCARTADO e termina OPORTUNIDADE_CRIADA (não fica em EM_CONTATO)",
    leadDDepois?.status === "OPORTUNIDADE_CRIADA",
    `${leadDDepois?.status}`,
  );
  check("(d) a proposta nasceu com negociação", propostaD.negociacaoId !== null);
  const negD = await prisma.negociacao.findUnique({ where: { id: propostaD.negociacaoId! }, select: { leadId: true, estagio: true } });
  check("(d) a negociação criada é deste lead, no estágio inicial LEVANTAMENTO", negD?.leadId === leadForaDoFluxo.id && negD.estagio === "LEVANTAMENTO");

  console.log("\n── F5.5: StatusProposta.em_negociacao + transições ────────────────\n");

  const cliF55 = await prisma.cliente.create({ data: { nome: `${TAG}_EmpresaF55`, tipo: "PJ" } });
  const negF55 = await prisma.negociacao.create({
    data: { titulo: `${TAG}_NegF55`, clienteId: cliF55.id, estagio: "PROPOSTA_ENVIADA" },
  });
  const pF55 = await criarProposta({ titulo: `${TAG} F55`, clienteId: cliF55.id, negociacaoId: negF55.id }, user.id);

  const paraEnviada = await mudarStatusProposta({ id: pF55.id, status: "enviada" }, user.id);
  check("mudarStatusProposta aceita 'enviada'", paraEnviada.id === pF55.id);
  const paraEmNegociacao = await mudarStatusProposta({ id: pF55.id, status: "em_negociacao" }, user.id);
  check("mudarStatusProposta aceita 'em_negociacao' (o valor novo do enum)", paraEmNegociacao.id === pF55.id);
  const lidaF55 = await prisma.proposta.findUnique({ where: { id: pF55.id }, select: { status: true } });
  check("o status gravado é exatamente em_negociacao", lidaF55?.status === "em_negociacao");

  // Imutabilidade: uma proposta ACEITA não muda de status por aqui — mesma regra que
  // `salvarProposta` já aplica a itens/condições, agora também do lado do status.
  const pF55b = await criarProposta({ titulo: `${TAG} F55b`, clienteId: cliF55.id, negociacaoId: negF55.id }, user.id);
  await salvarProposta(
    { id: pF55b.id, titulo: `${TAG} F55b`, areaM2: undefined, validade: "", observacoes: "",
      itens: [{ disciplina: "Arquitetura", descricao: "", valor: 1000 }], condicoes: [] },
    user.id,
  );
  await aceitarProposta(pF55b.id, user.id);
  let recusouStatusDeAceita = "";
  try {
    await mudarStatusProposta({ id: pF55b.id, status: "rascunho" }, user.id);
  } catch (e) {
    recusouStatusDeAceita = (e as Error).message;
  }
  check(
    "proposta ACEITA não muda de status por mudarStatusProposta (imutável)",
    /não pode mudar de status/i.test(recusouStatusDeAceita),
    recusouStatusDeAceita,
  );
  const aindaAceita = await prisma.proposta.findUnique({ where: { id: pF55b.id }, select: { status: true } });
  check("a proposta continua aceita, intocada", aindaAceita?.status === "aceita");

  console.log("\n── F5.8: desconto acima do limite exige justificativa (Q6/ADR-19) ─\n");

  const configComercial = await getConfigComercial();
  const limite = configComercial.descontoMaxSemJustificativa;

  const cliF58 = await prisma.cliente.create({ data: { nome: `${TAG}_EmpresaF58`, tipo: "PJ" } });
  const negF58 = await prisma.negociacao.create({
    data: { titulo: `${TAG}_NegF58`, clienteId: cliF58.id, estagio: "PROPOSTA_ENVIADA" },
  });
  const pF58 = await criarProposta({ titulo: `${TAG} F58`, clienteId: cliF58.id, negociacaoId: negF58.id }, user.id);

  // (a) Desconto ABAIXO do limite — passa sem justificativa nenhuma.
  const abaixoDoLimite = Math.max(0, limite - 1); // ex.: limite=10 → 9%
  await salvarProposta(
    {
      id: pF58.id,
      titulo: `${TAG} F58 v1`,
      areaM2: undefined,
      validade: "",
      observacoes: "",
      itens: [{ disciplina: "Arquitetura", descricao: "", valor: 10000 }],
      condicoes: [],
      desconto: (abaixoDoLimite / 100) * 10000,
    },
    user.id,
  );
  const versaoA = await prisma.propostaVersao.findFirst({
    where: { propostaId: pF58.id },
    orderBy: { numero: "desc" },
    select: { desconto: true },
  });
  check(
    `(a) desconto de ${abaixoDoLimite}% (abaixo do limite de ${limite}%) grava sem justificativa`,
    Number(versaoA?.desconto) === (abaixoDoLimite / 100) * 10000,
    `${versaoA?.desconto}`,
  );

  // (b) Desconto ACIMA do limite, SEM justificativa — recusado, e a versão NÃO nasce.
  const acimaDoLimite = limite + 20; // bem acima, sem ambiguidade de arredondamento
  const versoesAntesDoB = await prisma.propostaVersao.count({ where: { propostaId: pF58.id } });
  let recusouSemJustificativa = "";
  try {
    await salvarProposta(
      {
        id: pF58.id,
        titulo: `${TAG} F58 v2 sem justificativa`,
        areaM2: undefined,
        validade: "",
        observacoes: "",
        itens: [{ disciplina: "Arquitetura", descricao: "", valor: 10000 }],
        condicoes: [],
        desconto: (acimaDoLimite / 100) * 10000,
      },
      user.id,
    );
  } catch (e) {
    recusouSemJustificativa = (e as Error).message;
  }
  check(
    `(b) desconto de ${acimaDoLimite}% sem justificativa é recusado`,
    /exige justificativa/i.test(recusouSemJustificativa),
    recusouSemJustificativa,
  );
  check(
    "(b) a versão recusada NÃO foi criada (nenhuma versão a mais)",
    (await prisma.propostaVersao.count({ where: { propostaId: pF58.id } })) === versoesAntesDoB,
  );

  // (c) MESMO desconto acima do limite, agora COM justificativa — grava, e a timeline ganha um
  // evento DESCONTO_JUSTIFICADO próprio, distinto do PROPOSTA_REVISADA de toda revisão.
  const justificativaTexto = `${TAG} — cliente antigo, projeto grande`;
  await salvarProposta(
    {
      id: pF58.id,
      titulo: `${TAG} F58 v2 justificada`,
      areaM2: undefined,
      validade: "",
      observacoes: "",
      itens: [{ disciplina: "Arquitetura", descricao: "", valor: 10000 }],
      condicoes: [],
      desconto: (acimaDoLimite / 100) * 10000,
      justificativaDesconto: justificativaTexto,
    },
    user.id,
  );
  const versaoC = await prisma.propostaVersao.findFirst({
    where: { propostaId: pF58.id },
    orderBy: { numero: "desc" },
    select: { numero: true, desconto: true },
  });
  check(
    "(c) com justificativa, a versão nasce normalmente",
    versaoC?.numero === 2 && Number(versaoC.desconto) === (acimaDoLimite / 100) * 10000,
    `v${versaoC?.numero} desconto=${versaoC?.desconto}`,
  );

  const eventosF58 = await prisma.atividade.findMany({
    where: { clienteId: cliF58.id },
    select: { metadata: true },
  });
  const descontoJustificadoEv = eventosF58.find(
    (e) => (e.metadata as { evento?: string } | null)?.evento === "DESCONTO_JUSTIFICADO",
  );
  check(
    "(c) a timeline ganhou UM evento DESCONTO_JUSTIFICADO",
    !!descontoJustificadoEv,
    JSON.stringify(eventosF58.map((e) => (e.metadata as { evento?: string } | null)?.evento)),
  );
  check(
    "(c) o metadata do evento carrega o percentual e a justificativa exatos",
    (descontoJustificadoEv?.metadata as { percentual?: number; justificativa?: string } | undefined)
      ?.justificativa === justificativaTexto,
    JSON.stringify(descontoJustificadoEv?.metadata),
  );
  check(
    "(c) PROPOSTA_REVISADA continua dispando em toda revisão, sem ser afogado pelo evento novo",
    eventosF58.filter((e) => (e.metadata as { evento?: string } | null)?.evento === "PROPOSTA_REVISADA").length === 2,
    `${eventosF58.filter((e) => (e.metadata as { evento?: string } | null)?.evento === "PROPOSTA_REVISADA").length}`,
  );

  // (d) Exatamente NO limite (fronteira `>`, não `>=`) — não exige justificativa.
  const pF58d = await criarProposta({ titulo: `${TAG} F58d`, clienteId: cliF58.id, negociacaoId: negF58.id }, user.id);
  let recusouNoLimite = "";
  try {
    await salvarProposta(
      {
        id: pF58d.id,
        titulo: `${TAG} F58d`,
        areaM2: undefined,
        validade: "",
        observacoes: "",
        itens: [{ disciplina: "Arquitetura", descricao: "", valor: 10000 }],
        condicoes: [],
        desconto: (limite / 100) * 10000,
      },
      user.id,
    );
  } catch (e) {
    recusouNoLimite = (e as Error).message;
  }
  check(
    `(d) desconto EXATAMENTE no limite (${limite}%) NÃO exige justificativa (fronteira é '>', não '>=')`,
    recusouNoLimite === "",
    recusouNoLimite,
  );

  console.log("\n── F5.10: perda estruturada — Negociacao ganha observação livre ───\n");

  // Motivos vêm do CATÁLOGO seedado (F1.6) — nunca hardcoded, o catálogo pode crescer/mudar sem
  // deploy. Um SEM exigeConcorrente e um COM, pra exercitar os dois ramos.
  const [motivoSemConcorrente, motivoComConcorrente] = await Promise.all([
    prisma.motivoPerda.findFirst({ where: { ativo: true, exigeConcorrente: false } }),
    prisma.motivoPerda.findFirst({ where: { ativo: true, exigeConcorrente: true } }),
  ]);
  if (!motivoSemConcorrente || !motivoComConcorrente) {
    throw new Error("dev incompleto — catálogo MotivoPerda sem os 2 tipos (rode `npm run db:seed`).");
  }

  const cliF510 = await prisma.cliente.create({ data: { nome: `${TAG}_EmpresaF510`, tipo: "PJ" } });
  const negF510 = await prisma.negociacao.create({
    data: { titulo: `${TAG}_NegF510`, clienteId: cliF510.id, estagio: "PROPOSTA_ENVIADA" },
  });

  // (a) Perder SEM motivo é recusado — a jornada.ts já cobria isto antes da F5.10; confirma que
  // continua valendo depois da mudança.
  let recusouSemMotivo = "";
  try {
    await moverEstagio({ negociacaoId: negF510.id, para: "PERDIDO", autorId: user.id });
  } catch (e) {
    recusouSemMotivo = (e as Error).message;
  }
  check("(a) mover pra PERDIDO sem motivo é recusado", /motivo da perda/i.test(recusouSemMotivo), recusouSemMotivo);

  // (b) Motivo que exige concorrente, sem preencher — recusado.
  let recusouSemConcorrente = "";
  try {
    await moverEstagio({
      negociacaoId: negF510.id,
      para: "PERDIDO",
      motivoPerdaId: motivoComConcorrente.id,
      autorId: user.id,
    });
  } catch (e) {
    recusouSemConcorrente = (e as Error).message;
  }
  check(
    "(b) motivo que exige concorrente, sem concorrente, é recusado",
    /exige informar o concorrente/i.test(recusouSemConcorrente),
    recusouSemConcorrente,
  );

  // (c) Motivo + concorrente + observação — grava os 3, e a timeline ganha o evento com os 3.
  await moverEstagio({
    negociacaoId: negF510.id,
    para: "PERDIDO",
    motivoPerdaId: motivoComConcorrente.id,
    concorrente: "Gama Projetos",
    observacao: `${TAG} — perdemos no preço final`,
    autorId: user.id,
  });
  const negF510Perdida = await prisma.negociacao.findUnique({
    where: { id: negF510.id },
    select: { estagio: true, motivoPerdaId: true, concorrente: true, observacaoPerda: true },
  });
  check(
    "(c) os 3 campos gravados na Negociacao",
    negF510Perdida?.motivoPerdaId === motivoComConcorrente.id &&
      negF510Perdida.concorrente === "Gama Projetos" &&
      negF510Perdida.observacaoPerda === `${TAG} — perdemos no preço final`,
    JSON.stringify(negF510Perdida),
  );
  const eventoPerdidaF510 = await prisma.atividade.findFirst({
    where: { negociacaoId: negF510.id },
    orderBy: { createdAt: "desc" },
    select: { metadata: true },
  });
  check(
    "(c) o evento NEGOCIACAO_PERDIDA carrega motivo, concorrente e observação",
    (eventoPerdidaF510?.metadata as { evento?: string; observacao?: string } | null)?.evento ===
      "NEGOCIACAO_PERDIDA" &&
      (eventoPerdidaF510?.metadata as { observacao?: string } | null)?.observacao ===
        `${TAG} — perdemos no preço final`,
    JSON.stringify(eventoPerdidaF510?.metadata),
  );

  // (d) Reabrir (PERDIDO → ativo) limpa os 3 — não pode sobrar "perdemos pra Gama" numa
  // negociação viva de novo.
  await moverEstagio({ negociacaoId: negF510.id, para: "LEVANTAMENTO", autorId: user.id });
  const negF510Reaberta = await prisma.negociacao.findUnique({
    where: { id: negF510.id },
    select: { motivoPerdaId: true, concorrente: true, observacaoPerda: true },
  });
  check(
    "(d) reabrir limpa motivo, concorrente E observação",
    negF510Reaberta?.motivoPerdaId === null &&
      negF510Reaberta.concorrente === null &&
      negF510Reaberta.observacaoPerda === null,
    JSON.stringify(negF510Reaberta),
  );

  console.log("\n── F5.10: perda estruturada — Proposta recusada (a parte nova) ────\n");

  const negF510b = await prisma.negociacao.create({
    data: { titulo: `${TAG}_NegF510b`, clienteId: cliF510.id, estagio: "PROPOSTA_ENVIADA" },
  });
  const pF510 = await criarProposta({ titulo: `${TAG} F510`, clienteId: cliF510.id, negociacaoId: negF510b.id }, user.id);
  await mudarStatusProposta({ id: pF510.id, status: "enviada" }, user.id);

  // (e) Recusar SEM motivo é recusado — critério literal da tarefa.
  let recusouRecusaSemMotivo = "";
  try {
    await mudarStatusProposta({ id: pF510.id, status: "recusada" }, user.id);
  } catch (e) {
    recusouRecusaSemMotivo = (e as Error).message;
  }
  check(
    "(e) recusar a proposta sem motivo é recusado",
    /motivo da recusa/i.test(recusouRecusaSemMotivo),
    recusouRecusaSemMotivo,
  );
  const pF510AindaEnviada = await prisma.proposta.findUnique({ where: { id: pF510.id }, select: { status: true } });
  check("(e) o status NÃO mudou na tentativa recusada", pF510AindaEnviada?.status === "enviada");

  // (f) Motivo que exige concorrente, sem preencher — recusado, do lado da Proposta também.
  let recusouPropostaSemConcorrente = "";
  try {
    await mudarStatusProposta(
      { id: pF510.id, status: "recusada", motivoPerdaId: motivoComConcorrente.id },
      user.id,
    );
  } catch (e) {
    recusouPropostaSemConcorrente = (e as Error).message;
  }
  check(
    "(f) motivo que exige concorrente, sem concorrente, é recusado na proposta também",
    /exige informar o concorrente/i.test(recusouPropostaSemConcorrente),
    recusouPropostaSemConcorrente,
  );

  // (g) Com motivo (sem exigência de concorrente) + observação — grava, vira PROPOSTA_RECUSADA
  // na timeline (evento PRÓPRIO, não NEGOCIACAO_PERDIDA).
  await mudarStatusProposta(
    {
      id: pF510.id,
      status: "recusada",
      motivoPerdaId: motivoSemConcorrente.id,
      observacaoRecusa: `${TAG} — cliente achou caro`,
    },
    user.id,
  );
  const pF510Recusada = await prisma.proposta.findUnique({
    where: { id: pF510.id },
    select: { status: true, motivoPerdaId: true, concorrente: true, observacaoRecusa: true },
  });
  check(
    "(g) status recusada e os 3 campos gravados na Proposta",
    pF510Recusada?.status === "recusada" &&
      pF510Recusada.motivoPerdaId === motivoSemConcorrente.id &&
      pF510Recusada.observacaoRecusa === `${TAG} — cliente achou caro`,
    JSON.stringify(pF510Recusada),
  );
  const eventoRecusadaF510 = await prisma.atividade.findFirst({
    where: { propostaId: pF510.id },
    orderBy: { createdAt: "desc" },
    select: { metadata: true },
  });
  check(
    "(g) o evento é PROPOSTA_RECUSADA — não NEGOCIACAO_PERDIDA disfarçado",
    (eventoRecusadaF510?.metadata as { evento?: string } | null)?.evento === "PROPOSTA_RECUSADA",
    JSON.stringify(eventoRecusadaF510?.metadata),
  );
  check(
    "(g) o metadata carrega a observação exata",
    (eventoRecusadaF510?.metadata as { observacao?: string } | null)?.observacao ===
      `${TAG} — cliente achou caro`,
  );

  // (h) `recusada` é reversível (F5.5) — voltar pra `enviada` LIMPA os 3, senão um reenvio
  // carregaria "cliente achou caro" escondido.
  await mudarStatusProposta({ id: pF510.id, status: "enviada" }, user.id);
  const pF510Reenviada = await prisma.proposta.findUnique({
    where: { id: pF510.id },
    select: { status: true, motivoPerdaId: true, concorrente: true, observacaoRecusa: true },
  });
  check(
    "(h) reenviar limpa motivo, concorrente E observação da recusa anterior",
    pF510Reenviada?.status === "enviada" &&
      pF510Reenviada.motivoPerdaId === null &&
      pF510Reenviada.concorrente === null &&
      pF510Reenviada.observacaoRecusa === null,
    JSON.stringify(pF510Reenviada),
  );

  console.log("\n── F5.11: reabrir volta ao estágio ANTERIOR (ADR-10) ──────────────\n");

  const cliF511 = await prisma.cliente.create({ data: { nome: `${TAG}_EmpresaF511`, tipo: "PJ" } });

  // (a) Caminho normal: LEVANTAMENTO → ORCAMENTO → NEGOCIACAO → PERDIDO. Reabrir deve voltar
  // pra NEGOCIACAO (o estágio de onde ela perdeu), não pro LEVANTAMENTO inicial nem pra um
  // estágio escolhido na hora.
  const negF511a = await prisma.negociacao.create({
    data: { titulo: `${TAG}_NegF511a`, clienteId: cliF511.id, estagio: "LEVANTAMENTO" },
  });
  await moverEstagio({ negociacaoId: negF511a.id, para: "ORCAMENTO", autorId: user.id });
  await moverEstagio({ negociacaoId: negF511a.id, para: "NEGOCIACAO", autorId: user.id });
  await moverEstagio({
    negociacaoId: negF511a.id,
    para: "PERDIDO",
    motivoPerdaId: motivoSemConcorrente.id,
    observacao: `${TAG} — sem verba este ano`,
    autorId: user.id,
  });
  const reaberta = await reabrirNegociacao(negF511a.id, user.id);
  check(
    "(a) reabrir volta para NEGOCIACAO — o estágio de onde perdeu, não LEVANTAMENTO",
    reaberta.de === "PERDIDO" && reaberta.para === "NEGOCIACAO",
    `${reaberta.de} → ${reaberta.para}`,
  );
  const negF511aDepois = await prisma.negociacao.findUnique({
    where: { id: negF511a.id },
    select: { estagio: true, motivoPerdaId: true, concorrente: true, observacaoPerda: true, dataFechamento: true },
  });
  check(
    "(a) motivo, concorrente, observação E dataFechamento limpos na reabertura",
    negF511aDepois?.estagio === "NEGOCIACAO" &&
      negF511aDepois.motivoPerdaId === null &&
      negF511aDepois.observacaoPerda === null &&
      negF511aDepois.dataFechamento === null,
    JSON.stringify(negF511aDepois),
  );
  const eventosF511a = await prisma.atividade.findMany({
    where: { negociacaoId: negF511a.id },
    orderBy: { createdAt: "asc" },
    select: { metadata: true },
  });
  const eventosNomesF511a = eventosF511a.map((e) => (e.metadata as { evento?: string })?.evento);
  check(
    "(a) a timeline mostra os DOIS eventos do reabrir (ESTAGIO_ALTERADO de novo, sem duplicar NEGOCIACAO_PERDIDA)",
    eventosNomesF511a.filter((e) => e === "ESTAGIO_ALTERADO").length === 4 && // ORC, NEG, PERDIDO, reabertura
      eventosNomesF511a.filter((e) => e === "NEGOCIACAO_PERDIDA").length === 1,
    eventosNomesF511a.join(", "),
  );

  // (b) Sem histórico de ESTAGIO_ALTERADO nenhum (negociação nasce e já é movida pra PERDIDO
  // SEM autorId — simula o caso sem timeline) — cai em LEVANTAMENTO, o fallback documentado.
  const negF511b = await prisma.negociacao.create({
    data: {
      titulo: `${TAG}_NegF511b`,
      clienteId: cliF511.id,
      estagio: "PERDIDO",
      motivoPerdaId: motivoSemConcorrente.id,
    },
  });
  const reabertaB = await reabrirNegociacao(negF511b.id, user.id);
  check(
    "(b) sem timeline nenhuma, cai em LEVANTAMENTO (fallback documentado, não erro)",
    reabertaB.para === "LEVANTAMENTO",
    reabertaB.para,
  );

  // (c) Reabrir uma negociação que NÃO está PERDIDO/CANCELADO é recusado.
  const negF511c = await prisma.negociacao.create({
    data: { titulo: `${TAG}_NegF511c`, clienteId: cliF511.id, estagio: "ORCAMENTO" },
  });
  let recusouReabrirAtiva = "";
  try {
    await reabrirNegociacao(negF511c.id, user.id);
  } catch (e) {
    recusouReabrirAtiva = (e as Error).message;
  }
  check(
    "(c) reabrir negociação que já está ativa é recusado",
    /perdida ou cancelada/i.test(recusouReabrirAtiva),
    recusouReabrirAtiva,
  );

  // (d) Ciclo reabrir → perder de novo → reabrir: pega o ÚLTIMO estágio anterior, não o
  // primeiro que aparecer na timeline (o caso que o advisor apontou como armadilha).
  await moverEstagio({ negociacaoId: negF511a.id, para: "ORCAMENTO", autorId: user.id }); // NEGOCIACAO → ORCAMENTO
  await moverEstagio({
    negociacaoId: negF511a.id,
    para: "PERDIDO",
    motivoPerdaId: motivoSemConcorrente.id,
    autorId: user.id,
  }); // perde de novo, desta vez de ORCAMENTO
  const reabertaDeNovo = await reabrirNegociacao(negF511a.id, user.id);
  check(
    "(d) 2ª perda foi de ORCAMENTO — reabrir pega o ÚLTIMO ciclo, não o primeiro (NEGOCIACAO)",
    reabertaDeNovo.para === "ORCAMENTO",
    reabertaDeNovo.para,
  );

  console.log("\n── F5.12: aceite fecha 'equipe' e 'financeiro' — sem duplicar empresa/contato ──\n");

  // (a) Negociação COM responsável: o aceite cria o projeto já com o coordenador — e com o
  // valorContrato preenchido (a lacuna "financeiro").
  const cliF512 = await prisma.cliente.create({ data: { nome: `${TAG}_EmpresaF512`, tipo: "PJ" } });
  const contatosAntes = await prisma.contatoCliente.count();
  const clientesAntes = await prisma.cliente.count();

  const negF512 = await prisma.negociacao.create({
    data: {
      titulo: `${TAG}_NegF512`,
      clienteId: cliF512.id,
      estagio: "PROPOSTA_ENVIADA",
      responsavelId: user.id,
    },
  });
  const pF512 = await prisma.proposta.create({
    data: {
      ano,
      sequencial: 940000 + Math.floor(Math.random() * 9000),
      numero: `${TAG}_F512`,
      titulo: `${TAG} F512`,
      clienteId: cliF512.id,
      negociacaoId: negF512.id,
      token: randomBytes(18).toString("hex"),
      autorId: user.id,
      status: "enviada",
    },
    select: { id: true },
  });
  await salvarProposta(
    {
      id: pF512.id,
      titulo: `${TAG} F512`,
      areaM2: undefined,
      validade: "",
      observacoes: "",
      itens: [{ disciplina: "Arquitetura", descricao: "", valor: 15000 }],
      condicoes: [],
    },
    user.id,
  );
  const resultadoF512 = await aceitarProposta(pF512.id, user.id);
  const projetoF512 = await prisma.projeto.findUnique({
    where: { id: resultadoF512.projetoId },
    select: { valorContrato: true, membros: { select: { userId: true, papel: true } } },
  });
  check(
    "(a) projeto nasceu com valorContrato = valor final da proposta (15000)",
    Number(projetoF512?.valorContrato) === 15000,
    `${projetoF512?.valorContrato}`,
  );
  check(
    "(a) projeto nasceu com o responsável da negociação como coordenador (equipe)",
    projetoF512?.membros.length === 1 &&
      projetoF512.membros[0].userId === user.id &&
      projetoF512.membros[0].papel === "coordenador",
    JSON.stringify(projetoF512?.membros),
  );

  // (b) Negociação SEM responsável (responsavelId null) — aceita normalmente, projeto nasce
  // SEM membro nenhum (não inventa quem seria o coordenador).
  const negF512b = await prisma.negociacao.create({
    data: { titulo: `${TAG}_NegF512b`, clienteId: cliF512.id, estagio: "PROPOSTA_ENVIADA" },
  });
  const pF512b = await criarProposta({ titulo: `${TAG} F512b`, clienteId: cliF512.id, negociacaoId: negF512b.id }, user.id);
  await salvarProposta(
    { id: pF512b.id, titulo: `${TAG} F512b`, areaM2: undefined, validade: "", observacoes: "",
      itens: [{ disciplina: "Arquitetura", descricao: "", valor: 5000 }], condicoes: [] },
    user.id,
  );
  const resultadoF512b = await aceitarProposta(pF512b.id, user.id);
  const projetoF512b = await prisma.projeto.findUnique({
    where: { id: resultadoF512b.projetoId },
    select: { valorContrato: true, membros: { select: { userId: true } } },
  });
  check(
    "(b) sem responsável na negociação, o projeto nasce SEM membro (não inventa)",
    projetoF512b?.membros.length === 0,
    `${projetoF512b?.membros.length}`,
  );
  check("(b) valorContrato ainda grava mesmo sem membro", Number(projetoF512b?.valorContrato) === 5000);

  // (c) Proposta histórica SEM negociação (o caso já coberto na F5.3) — aceita normalmente,
  // sem membro, sem erro por causa de `p.negociacao` ser null.
  const pF512c = await prisma.proposta.create({
    data: {
      ano, sequencial: 930000 + Math.floor(Math.random() * 9000), numero: `${TAG}_F512C`,
      titulo: `${TAG} F512c`, clienteId: cliF512.id, token: randomBytes(18).toString("hex"), autorId: user.id,
    },
    select: { id: true },
  });
  await salvarProposta(
    { id: pF512c.id, titulo: `${TAG} F512c`, areaM2: undefined, validade: "", observacoes: "",
      itens: [{ disciplina: "Arquitetura", descricao: "", valor: 3000 }], condicoes: [] },
    user.id,
  );
  let falhouSemNegociacao = "";
  let resultadoF512c: { projetoId: string } | null = null;
  try {
    resultadoF512c = await aceitarProposta(pF512c.id, user.id);
  } catch (e) {
    falhouSemNegociacao = (e as Error).message;
  }
  check("(c) aceitar proposta histórica (sem negociação) NÃO quebra", falhouSemNegociacao === "", falhouSemNegociacao);
  const projetoF512c = resultadoF512c
    ? await prisma.projeto.findUnique({ where: { id: resultadoF512c.projetoId }, select: { membros: true } })
    : null;
  check("(c) sem negociação, também sem membro — nenhum crash lendo `p.negociacao`", projetoF512c?.membros.length === 0);

  // (d) O critério literal: nenhum Cliente/ContatoCliente novo em NENHUM dos 3 aceites acima.
  const contatosDepois = await prisma.contatoCliente.count();
  const clientesDepois = await prisma.cliente.count();
  check(
    "(d) nenhum ContatoCliente novo foi criado pelos 3 aceites",
    contatosDepois === contatosAntes,
    `${contatosAntes} → ${contatosDepois}`,
  );
  check(
    "(d) nenhum Cliente novo foi criado pelos 3 aceites (`cliF512` já existia quando contei)",
    clientesDepois === clientesAntes,
    `${clientesAntes} → ${clientesDepois}`,
  );

  console.log("\n── F6.1a: o desconto SOBREVIVE ao aceite (regressão achada na F6.1) ──\n");

  // O aceite somava os itens CRUS e escrevia em 3 lugares, ignorando o desconto da versão: um
  // abatimento justificado sumia de todo número de receita. Nenhum smoke pegava porque nenhum
  // cenário aceitava proposta COM desconto — este cenário é exatamente essa lacuna.
  const cliDesc = await prisma.cliente.create({ data: { nome: `${TAG}_EmpresaDesconto`, tipo: "PJ" } });
  const negDesc = await prisma.negociacao.create({
    data: { titulo: `${TAG}_NegDesconto`, clienteId: cliDesc.id, estagio: "PROPOSTA_ENVIADA" },
  });
  const pDesc = await criarProposta({ titulo: `${TAG} desconto`, clienteId: cliDesc.id, negociacaoId: negDesc.id }, user.id);
  await salvarProposta(
    {
      id: pDesc.id, titulo: `${TAG} desconto`, areaM2: undefined, validade: "", observacoes: "",
      itens: [{ disciplina: "Arquitetura", descricao: "", valor: 10000 }], condicoes: [],
      desconto: 2000, justificativaDesconto: `${TAG} — parceria antiga`,
    },
    user.id,
  );
  const resultadoDesc = await aceitarProposta(pDesc.id, user.id);
  const [versaoDesc, negDescDepois, projDesc] = await Promise.all([
    prisma.propostaVersao.findFirst({
      where: { propostaId: pDesc.id }, orderBy: { numero: "desc" },
      select: { valorOriginal: true, valorVersao: true, desconto: true },
    }),
    prisma.negociacao.findUnique({ where: { id: negDesc.id }, select: { valorNegociado: true } }),
    prisma.projeto.findUnique({ where: { id: resultadoDesc.projetoId }, select: { valorContrato: true } }),
  ]);
  check(
    "valorVersao da versão aceita é 8000 (10000 − 2000), não a soma crua",
    Number(versaoDesc?.valorVersao) === 8000,
    `${versaoDesc?.valorVersao}`,
  );
  check(
    "o invariante de versoes.ts se mantém: valorVersao = valorOriginal − desconto",
    Number(versaoDesc?.valorVersao) === Number(versaoDesc?.valorOriginal) - Number(versaoDesc?.desconto),
    `${versaoDesc?.valorOriginal} − ${versaoDesc?.desconto} ≠ ${versaoDesc?.valorVersao}`,
  );
  check(
    "Negociacao.valorNegociado é o valor COM desconto (o forecast não infla)",
    Number(negDescDepois?.valorNegociado) === 8000,
    `${negDescDepois?.valorNegociado}`,
  );
  check(
    "Projeto.valorContrato é o valor COM desconto (é o que o cliente paga)",
    Number(projDesc?.valorContrato) === 8000,
    `${projDesc?.valorContrato}`,
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
  // F5.9: o aceite CRIA um `Projeto`. `Disciplina` e `Canal` (+ membros/mensagens) caem por
  // cascata dele, mas `Proposta.projetoId` precisa ser solto antes — senão o delete esbarra na
  // FK. Mesma sequência que `smoke-crm-fase1.ts` já usava pelo mesmo motivo.
  const projetos = await prisma.projeto.findMany({ where: { clienteId: { in: ids } }, select: { id: true } });
  if (projetos.length > 0) {
    await prisma.notificacao.deleteMany({
      where: { href: { in: projetos.map((p) => `/projetos/${p.id}`) } },
    });
    await prisma.proposta.updateMany({
      where: { projetoId: { in: projetos.map((p) => p.id) } },
      data: { projetoId: null },
    });
    await prisma.projeto.deleteMany({ where: { id: { in: projetos.map((p) => p.id) } } });
  }

  const props = await prisma.proposta.findMany({ where: { clienteId: { in: ids } }, select: { id: true } });

  // F5.13: os PDFs arquivados são ARQUIVOS em `STORAGE_BASE_PATH` — não caem com o registro.
  // Sem isto, cada rodada do smoke deixaria dois .pdf de lixo no disco do dev.
  const comPdf = await prisma.propostaVersao.findMany({
    where: { propostaId: { in: props.map((p) => p.id) }, pdfPath: { not: null } },
    select: { pdfPath: true },
  });
  for (const v of comPdf) await removerArquivo(v.pdfPath!);
  // Notificações do alerta de validade (F5.7) — não pendem de FK, então some por `href` ou
  // ficariam no sino de todo mundo depois que o smoke apagasse as propostas.
  await prisma.notificacao.deleteMany({
    where: { href: { in: props.map((p) => `/comercial/propostas/${p.id}`) } },
  });
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
