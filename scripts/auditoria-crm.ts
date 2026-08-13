/**
 * Auditoria PRÉ-MIGRAÇÃO do CRM (P4, item 1) — 100% SOMENTE LEITURA.
 *
 * Não escreve, não altera, não apaga nada. Pode rodar em produção com segurança.
 * Objetivo: ver os NÚMEROS antes de decidir qualquer migração de dados.
 *
 *   npx tsx --tsconfig tsconfig.server.json scripts/auditoria-crm.ts
 *
 * Cobre:
 *   1. Classificação determinística de cada Lead em bucket (prospecção / oportunidade / ambíguo)
 *   2. Duplicatas de Cliente (pré-requisito do índice único parcial de CNPJ — ADR-03)
 *   3. Valores distintos de `Lead.origem` (insumo do de-para Canal/Origem/Campanha)
 *   4. Valores distintos de disciplina (insumo do catálogo DisciplinaPadrao)
 *   5. Etapas do funil fora das 5 seedadas (risco de classificação sem mapeamento)
 *   6. Uso real do model `Oportunidade` órfão (decisão Q2 do 01-decisoes.md)
 *   7. Baseline de contagens (o "antes" do checklist de validação pós-migração)
 *
 * Ver docs/crm/03-migracao.md para a leitura dos resultados e as regras em prosa.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

// ── Regras de classificação (determinísticas — ver docs/crm/03-migracao.md §2) ──

/** As 5 etapas criadas pelo seed (prisma/seed.ts). Qualquer outra é "customizada". */
const ETAPAS_SEED = ["Orçamento", "Em negociação", "Proposta enviada", "Contratado", "Perdido"];

/** Etapas que, por si só, provam que houve negociação real (não é mais prospecção). */
const ETAPAS_DE_NEGOCIO = ["Em negociação", "Proposta enviada", "Contratado"];

type Bucket = "prospeccao_pura" | "oportunidade_real" | "ambiguo";

type LeadClassificavel = {
  id: string;
  nome: string;
  etapaNome: string;
  temProposta: boolean;
  temPropostaAceita: boolean;
  clienteId: string | null;
  valorEstimado: unknown;
  arquivado: boolean;
  motivoPerda: string | null;
};

/**
 * Classificação determinística. A ordem das regras importa — a primeira que casa vence.
 * Cada retorno traz o MOTIVO, para a revisão humana poder discutir a regra, não só o número.
 *
 * DECISÕES EM ABERTO nesta função (ver docs/crm/03-migracao.md §2.1) — a ordem escolhida
 * aqui NÃO é neutra e precisa de validação humana antes de virar migração:
 *   • R6 roda DEPOIS de R7 de propósito: um lead "Perdido" que já virou Cliente e tinha valor
 *     é uma PERDA REAL de negociação, não uma prospecção fria descartada. Se caísse em
 *     prospecção pura, sumiria do denominador da taxa de conversão que o P17 calcula.
 *   • `arquivado` NÃO participa da classificação — é reportado à parte (ver §2.2).
 */
export function classificarLead(l: LeadClassificavel): { bucket: Bucket; motivo: string } {
  // R1 — Proposta é a prova mais forte de negociação real que existe no schema atual.
  if (l.temPropostaAceita) return { bucket: "oportunidade_real", motivo: "R1: tem proposta ACEITA" };
  if (l.temProposta) return { bucket: "oportunidade_real", motivo: "R2: tem proposta emitida" };

  // R3 — "Contratado" sem proposta é contraditório: fechou negócio sem proposta no sistema.
  if (l.etapaNome === "Contratado") {
    return { bucket: "ambiguo", motivo: "R3: etapa Contratado mas SEM proposta no sistema" };
  }

  // R4 — Etapa de negócio sem proposta: negociação existiu fora do sistema (ou dado incompleto).
  if (ETAPAS_DE_NEGOCIO.includes(l.etapaNome)) {
    return { bucket: "ambiguo", motivo: `R4: etapa "${l.etapaNome}" sem proposta registrada` };
  }

  // R5 — Etapa desconhecida (criada por admin): não há como inferir significado.
  if (!ETAPAS_SEED.includes(l.etapaNome)) {
    return { bucket: "ambiguo", motivo: `R5: etapa customizada "${l.etapaNome}" sem mapeamento` };
  }

  // R7 (antes de R6, ver nota no topo) — virou cliente E tinha valor: houve negócio de verdade,
  // mesmo que a proposta tenha corrido fora do sistema. Vale revisão, nunca descarte silencioso.
  if (l.clienteId && l.valorEstimado != null) {
    return { bucket: "ambiguo", motivo: "R7: convertido em cliente + valor, mas sem proposta" };
  }

  // R6 — Perdido sem nenhum sinal de negociação: prospecção que não vingou.
  if (l.etapaNome === "Perdido") {
    return { bucket: "prospeccao_pura", motivo: "R6: perdido sem proposta — prospecção descartada" };
  }

  // R8 — Orçamento (etapa inicial) sem proposta: prospecção pura, o caso saudável.
  return { bucket: "prospeccao_pura", motivo: "R8: etapa inicial, sem proposta — prospecção" };
}

// ── Normalizações (mesmas que a dedup vai usar — P8) ────────────────────────

/** Só dígitos: "12.345.678/0001-90" → "12345678000190". */
export function normalizarDocumento(d: string | null): string | null {
  if (!d) return null;
  const so = d.replace(/\D/g, "");
  return so.length > 0 ? so : null;
}

/**
 * Minúsculo, sem acento, sem pontuação, espaços colapsados. Sufixo societário só cai
 * quando o registro é PJ — `Cliente.nome` guarda nome de PESSOA quando `tipo = PF`, e aí
 * "Sá" (→ "sa" depois de tirar o acento) e "Me" seriam comidos como se fossem sufixo.
 *
 * A classe de acento vai escrita em escape (\u0300-\u036f) de propósito: os combining marks
 * literais não sobrevivem a todo round-trip de encoding (este repo já tem comentários
 * corrompidos em prisma/schema.prisma por isso).
 */
export function normalizarNomeEmpresa(nome: string, tipo: "PF" | "PJ" = "PJ"): string {
  const base = nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const semSufixo =
    tipo === "PJ" ? base.replace(/\b(ltda|epp|eireli|s\/?a|cia|inc|mei|me)\b/g, "") : base;
  return semSufixo
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Domínio do e-mail, ignorando provedores públicos (não identificam empresa). */
const PROVEDORES_PUBLICOS = new Set([
  "gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "yahoo.com.br",
  "bol.com.br", "uol.com.br", "terra.com.br", "live.com", "icloud.com", "msn.com",
]);
export function dominioCorporativo(email: string | null): string | null {
  if (!email || !email.includes("@")) return null;
  const d = email.split("@").pop()?.toLowerCase().trim();
  if (!d || PROVEDORES_PUBLICOS.has(d)) return null;
  return d;
}

// ── Relatório ────────────────────────────────────────────────────────────────

function titulo(t: string) {
  console.log(`\n${"═".repeat(72)}\n${t}\n${"═".repeat(72)}`);
}

function tabela(linhas: Record<string, unknown>[]) {
  if (linhas.length === 0) {
    console.log("  (nenhum)");
    return;
  }
  console.table(linhas);
}

async function main() {
  const db = new URL(process.env.DATABASE_URL ?? "postgres://?/?");
  console.log(`\nAuditoria pré-migração do CRM — SOMENTE LEITURA`);
  console.log(`Banco: ${db.pathname.replace(/^\//, "")} @ ${db.hostname}:${db.port || "5432"}`);
  console.log(`Data:  ${new Date().toISOString()}`);
  console.log(
    `\n⚠  Se este NÃO for o banco de produção, os números abaixo não servem para decidir a migração.`,
  );

  // ── 7. Baseline de contagens ───────────────────────────────────────────────
  titulo("7. BASELINE DE CONTAGENS (o \"antes\" do checklist pós-migração)");
  const [
    nLead, nLeadArquivado, nCliente, nContato, nProposta, nPropostaItem,
    nPropostaVersao, nOportunidade, nAtividadeLead, nAtividadeOp, nAnexoLead,
    nFunilEtapa, nProjeto, nTabelaPreco,
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: { arquivado: true } }),
    prisma.cliente.count(),
    prisma.contatoCliente.count(),
    prisma.proposta.count(),
    prisma.propostaItem.count(),
    prisma.propostaVersao.count(),
    prisma.oportunidade.count(),
    prisma.atividadeLead.count(),
    prisma.atividadeOportunidade.count(),
    prisma.anexoLead.count(),
    prisma.funilEtapa.count(),
    prisma.projeto.count(),
    prisma.tabelaPreco.count(),
  ]);
  tabela([
    { tabela: "lead", registros: nLead, obs: `${nLeadArquivado} arquivado(s)` },
    { tabela: "cliente", registros: nCliente, obs: "" },
    { tabela: "contato_cliente", registros: nContato, obs: "" },
    { tabela: "proposta", registros: nProposta, obs: "NUNCA pode diminuir" },
    { tabela: "proposta_item", registros: nPropostaItem, obs: "soma de valores é invariante" },
    { tabela: "proposta_versao", registros: nPropostaVersao, obs: "" },
    { tabela: "oportunidade", registros: nOportunidade, obs: "model órfão — decisão Q2" },
    { tabela: "atividade_lead", registros: nAtividadeLead, obs: "" },
    { tabela: "atividade_oportunidade", registros: nAtividadeOp, obs: "" },
    { tabela: "anexo_lead", registros: nAnexoLead, obs: "" },
    { tabela: "funil_etapa", registros: nFunilEtapa, obs: "5 = só o seed" },
    { tabela: "projeto", registros: nProjeto, obs: "" },
    { tabela: "tabela_preco", registros: nTabelaPreco, obs: "" },
  ]);

  const somaPropostas = await prisma.propostaItem.aggregate({ _sum: { valor: true } });
  console.log(
    `\n  Soma de TODOS os PropostaItem.valor: ${Number(somaPropostas._sum.valor ?? 0).toFixed(2)}`,
  );
  console.log(`  ↑ este número tem de ser IDÊNTICO depois da migração (checklist §9).`);

  // ── 5. Etapas do funil ─────────────────────────────────────────────────────
  titulo("5. ETAPAS DO FUNIL (customizadas não têm mapeamento automático)");
  const etapas = await prisma.funilEtapa.findMany({
    orderBy: { ordem: "asc" },
    select: { nome: true, ordem: true, ativo: true, _count: { select: { leads: true } } },
  });
  tabela(
    etapas.map((e) => ({
      etapa: e.nome,
      ordem: e.ordem,
      ativa: e.ativo,
      leads: e._count.leads,
      origem: ETAPAS_SEED.includes(e.nome) ? "seed" : "⚠ CUSTOMIZADA",
    })),
  );

  // ── 1 + 2. Classificação dos Leads ─────────────────────────────────────────
  titulo("1. CLASSIFICAÇÃO DOS LEADS EM BUCKETS");
  const leads = await prisma.lead.findMany({
    select: {
      id: true, nome: true, clienteId: true, valorEstimado: true,
      arquivado: true, motivoPerda: true,
      etapa: { select: { nome: true } },
      propostas: { select: { status: true } },
    },
  });

  const classificados = leads.map((l) => {
    const c = classificarLead({
      id: l.id,
      nome: l.nome,
      etapaNome: l.etapa.nome,
      temProposta: l.propostas.length > 0,
      temPropostaAceita: l.propostas.some((p) => p.status === "aceita"),
      clienteId: l.clienteId,
      valorEstimado: l.valorEstimado,
      arquivado: l.arquivado,
      motivoPerda: l.motivoPerda,
    });
    return { ...l, ...c };
  });

  const porBucket = new Map<Bucket, number>();
  const porMotivo = new Map<string, number>();
  for (const c of classificados) {
    porBucket.set(c.bucket, (porBucket.get(c.bucket) ?? 0) + 1);
    porMotivo.set(c.motivo, (porMotivo.get(c.motivo) ?? 0) + 1);
  }

  tabela(
    (["prospeccao_pura", "oportunidade_real", "ambiguo"] as Bucket[]).map((b) => ({
      bucket: b,
      leads: porBucket.get(b) ?? 0,
      percentual: nLead > 0 ? `${(((porBucket.get(b) ?? 0) / nLead) * 100).toFixed(1)}%` : "—",
      acao: b === "ambiguo" ? "⚠ needsReview = true" : "migração automática",
    })),
  );

  console.log("\n  Detalhe por regra aplicada:");
  tabela([...porMotivo.entries()].sort((a, b) => b[1] - a[1]).map(([motivo, n]) => ({ motivo, leads: n })));

  // `arquivado` é ortogonal ao bucket (um lead arquivado ainda é prospecção OU oportunidade).
  // Reportado à parte porque exige decisão própria: vira `excluidoEm` no modelo novo, ou
  // migra como registro vivo? Ver docs/crm/03-migracao.md §2.2.
  const arquivadosPorBucket = new Map<Bucket, number>();
  for (const c of classificados.filter((x) => x.arquivado)) {
    arquivadosPorBucket.set(c.bucket, (arquivadosPorBucket.get(c.bucket) ?? 0) + 1);
  }
  if (nLeadArquivado > 0) {
    console.log(`\n  ⚠ ${nLeadArquivado} lead(s) ARQUIVADO(s) — decisão pendente (§2.2):`);
    tabela(
      [...arquivadosPorBucket.entries()].map(([bucket, n]) => ({ bucket, arquivados: n })),
    );
  } else {
    console.log(`\n  Nenhum lead arquivado (o campo \`arquivado\` não muda nada nesta base).`);
  }

  const ambiguos = classificados.filter((c) => c.bucket === "ambiguo");
  if (ambiguos.length > 0) {
    console.log(`\n  Os ${ambiguos.length} ambíguos (todos irão para a fila de revisão):`);
    tabela(ambiguos.slice(0, 30).map((a) => ({ id: a.id, nome: a.nome, etapa: a.etapa.nome, motivo: a.motivo })));
    if (ambiguos.length > 30) console.log(`  … e mais ${ambiguos.length - 30}.`);
  }

  // ── 3. Duplicatas de Cliente ───────────────────────────────────────────────
  titulo("3. DUPLICATAS DE CLIENTE (bloqueiam o índice único parcial de CNPJ)");
  const clientes = await prisma.cliente.findMany({
    select: { id: true, nome: true, documento: true, email: true, ativo: true },
  });

  const porDocumento = new Map<string, typeof clientes>();
  for (const c of clientes) {
    const doc = normalizarDocumento(c.documento);
    if (!doc) continue;
    porDocumento.set(doc, [...(porDocumento.get(doc) ?? []), c]);
  }
  const dupDoc = [...porDocumento.entries()].filter(([, cs]) => cs.length > 1);
  console.log(`\n  Duplicatas por DOCUMENTO normalizado: ${dupDoc.length} grupo(s)`);
  if (dupDoc.length > 0) {
    console.log("  ⚠ BLOQUEIA a criação do índice único parcial — resolver ANTES da migration.");
    tabela(dupDoc.flatMap(([doc, cs]) => cs.map((c) => ({ documento: doc, id: c.id, nome: c.nome, ativo: c.ativo }))));
  }

  const porNome = new Map<string, typeof clientes>();
  for (const c of clientes) {
    const n = normalizarNomeEmpresa(c.nome);
    if (!n) continue;
    porNome.set(n, [...(porNome.get(n) ?? []), c]);
  }
  const dupNome = [...porNome.entries()].filter(([, cs]) => cs.length > 1);
  console.log(`\n  Duplicatas por NOME normalizado: ${dupNome.length} grupo(s)`);
  if (dupNome.length > 0) {
    tabela(dupNome.flatMap(([n, cs]) => cs.map((c) => ({ nome_normalizado: n, id: c.id, nome: c.nome, doc: c.documento }))));
  }

  const porDominio = new Map<string, typeof clientes>();
  for (const c of clientes) {
    const d = dominioCorporativo(c.email);
    if (!d) continue;
    porDominio.set(d, [...(porDominio.get(d) ?? []), c]);
  }
  const dupDominio = [...porDominio.entries()].filter(([, cs]) => cs.length > 1);
  console.log(`\n  Mesmo DOMÍNIO corporativo de e-mail: ${dupDominio.length} grupo(s)`);
  if (dupDominio.length > 0) {
    console.log("  (sinal FRACO — só sugere revisão, nunca funde sozinho)");
    tabela(dupDominio.flatMap(([d, cs]) => cs.map((c) => ({ dominio: d, id: c.id, nome: c.nome }))));
  }

  const semDocumento = clientes.filter((c) => !normalizarDocumento(c.documento)).length;
  console.log(`\n  Clientes SEM documento preenchido: ${semDocumento} de ${clientes.length}`);

  // ── 4. Origem (texto livre → Canal + Origem detalhada + Campanha) ──────────
  titulo("4. VALORES DISTINTOS DE `Lead.origem` (insumo do de-para)");
  const origens = await prisma.lead.groupBy({
    by: ["origem"],
    _count: { _all: true },
    orderBy: { _count: { origem: "desc" } },
  });
  tabela(origens.map((o) => ({ origem: o.origem ?? "(vazio)", leads: o._count._all })));
  console.log(`\n  ${origens.length} valor(es) distinto(s) → cada um precisa de linha no de-para (§4).`);

  // ── 4b. Disciplinas (Q3 do 01-decisoes.md) ─────────────────────────────────
  titulo("4b. VALORES DISTINTOS DE DISCIPLINA (catálogo DisciplinaPadrao — Q3)");
  const [dPropostas, dProjetos, dTabelas] = await Promise.all([
    prisma.propostaItem.groupBy({ by: ["disciplina"], _count: { _all: true } }),
    prisma.disciplina.groupBy({ by: ["nome"], _count: { _all: true } }),
    prisma.itemTabelaPreco.groupBy({ by: ["disciplina"], _count: { _all: true } }),
  ]);

  const universo = new Map<string, { proposta: number; projeto: number; tabela: number }>();
  const acc = (chave: string, campo: "proposta" | "projeto" | "tabela", n: number) => {
    const atual = universo.get(chave) ?? { proposta: 0, projeto: 0, tabela: 0 };
    atual[campo] += n;
    universo.set(chave, atual);
  };
  for (const d of dPropostas) acc(d.disciplina, "proposta", d._count._all);
  for (const d of dProjetos) acc(d.nome, "projeto", d._count._all);
  for (const d of dTabelas) acc(d.disciplina, "tabela", d._count._all);

  tabela(
    [...universo.entries()]
      .sort((a, b) => (b[1].proposta + b[1].projeto + b[1].tabela) - (a[1].proposta + a[1].projeto + a[1].tabela))
      .map(([nome, u]) => ({ disciplina: nome, em_propostas: u.proposta, em_projetos: u.projeto, em_tabelas: u.tabela })),
  );
  console.log(`\n  ${universo.size} grafia(s) distinta(s) no total.`);
  console.log(`  ↑ revisar com o usuário: quais são a MESMA disciplina escrita diferente.`);

  // ── 6. Uso real do model Oportunidade órfão (Q2) ───────────────────────────
  titulo("6. USO REAL DO MODEL `Oportunidade` ÓRFÃO (decisão Q2)");
  if (nOportunidade === 0) {
    console.log("\n  ZERO registros. Confirma a hipótese da auditoria: feature nunca usada.");
    console.log("  → Q2 pode ser fechada em (b): não migrar nada, descartar a tela.");
  } else {
    const ops = await prisma.oportunidade.findMany({
      select: {
        id: true, titulo: true, etapa: true, status: true, clienteId: true,
        valorEstimado: true, createdAt: true, updatedAt: true,
        _count: { select: { atividades: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    tabela(ops.slice(0, 30).map((o) => ({
      titulo: o.titulo,
      etapa: o.etapa,
      status: o.status,
      valor: o.valorEstimado != null ? Number(o.valorEstimado) : null,
      atividades: o._count.atividades,
      criada: o.createdAt.toISOString().slice(0, 10),
      atualizada: o.updatedAt.toISOString().slice(0, 10),
    })));
    const comAtividade = ops.filter((o) => o._count.atividades > 0).length;
    console.log(`\n  ${nOportunidade} registro(s); ${comAtividade} com atividade registrada.`);
    console.log(`  ↑ atividade registrada = alguém usou de verdade (não é só um teste esquecido).`);
  }

  // ── Órfãos e integridade ───────────────────────────────────────────────────
  titulo("EXTRA — INTEGRIDADE ATUAL (o que já está inconsistente HOJE)");
  const [propSemLead, propComLeadInvalido, leadClienteInvalido] = await Promise.all([
    prisma.proposta.count({ where: { leadId: null } }),
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*)::bigint AS n FROM proposta p
      WHERE p."leadId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lead l WHERE l.id = p."leadId")`,
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*)::bigint AS n FROM lead l
      WHERE l."clienteId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM cliente c WHERE c.id = l."clienteId")`,
  ]);
  tabela([
    { verificacao: "Propostas sem leadId (nascidas fora do funil)", n: propSemLead },
    { verificacao: "Propostas com leadId inexistente (órfã)", n: Number(propComLeadInvalido[0]?.n ?? 0) },
    { verificacao: "Leads com clienteId inexistente (órfão)", n: Number(leadClienteInvalido[0]?.n ?? 0) },
  ]);

  console.log(`\n${"═".repeat(72)}`);
  console.log("Fim da auditoria. Nada foi alterado.");
  console.log(`${"═".repeat(72)}\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
