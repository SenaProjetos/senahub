/**
 * Volume sintético do Comercial (F6.2) — a base de dado que a Fase 6 inteira mede contra.
 *
 * `docs/crm/05-metricas.md` (§1 do texto que abre o documento): "o aceite de toda tarefa de
 * métrica é contra o seed sintético, com o número conferido à mão — nunca contra os 8 leads de
 * produção". Sem volume, funil/conversão/recompra/forecast não têm o que medir.
 *
 * Cria: **2.000 empresas · 6.000 contatos · 4.000 prospecções · 1.500 negociações ·
 * 3.000 propostas · 50.000 atividades.**
 *
 * ⚠️⚠️ **NUNCA RODAR CONTRA PRODUÇÃO.** O guard abaixo recusa rodar contra qualquer banco cujo
 * NOME não pareça um banco de dev — não confia em host/porta (ambos podem ser "localhost" tanto
 * no dev quanto no servidor de produção, que roda na própria máquina — DEPLOY.md §"Banco").
 *
 * **IDEMPOTENTE por marca, não por chave natural.** Toda linha criada carrega o prefixo
 * `SEED_VOL_` no nome — rodar de novo apaga só o que tem essa marca e recria do zero. É o mesmo
 * padrão de `seed-demo.ts` ("limpa os dados de negócio e recria"), adaptado para não tocar em
 * nada que não seja synthetic (dado real de dev, se houver, sobrevive).
 *
 * Uso: `npm run seed:crm-volume`
 */
import "dotenv/config";
import { randomUUID, randomBytes } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { ESTAGIOS_ATIVOS } from "../src/modules/comercial/jornada";
import type { EstagioNegociacao, StatusProspeccao, StatusProposta, TipoAtividade, Prisma } from "../src/generated/prisma/client";

const TAG = "SEED_VOL_";

const N_CLIENTES = 2000;
const N_CONTATOS = 6000;
const N_LEADS = 4000;
const N_NEGOCIACOES = 1500;
const N_PROPOSTAS = 3000;
const N_ATIVIDADES = 50000;

const TAMANHO_LOTE = 1000;

// ── Guarda anti-produção ─────────────────────────────────────────────────────────────────────
/**
 * Recusa por SAFELIST, não por blocklist: só roda se o nome do banco parecer de dev. Um banco
 * desconhecido é tratado como perigoso por padrão — não o contrário. Host/porta não entram na
 * checagem de propósito: produção e dev podem estar ambos em "localhost" (produção roda na
 * própria máquina do servidor), então o único sinal confiável é o NOME do banco
 * (`senahub` em produção, `senahub_remake` no dev deste repo — ver `docs/DEPLOY.md`).
 */
function garantirAmbienteDev(): void {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ausente — abortando por segurança.");

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("DATABASE_URL malformada — abortando por segurança (não dá para confirmar o banco).");
  }

  const dbNome = parsed.pathname.replace(/^\//, "");
  const pareceDev = /(_remake|_dev|_test)$/i.test(dbNome);
  if (!pareceDev) {
    throw new Error(
      `RECUSADO: DATABASE_URL aponta para o banco "${dbNome}" (host "${parsed.hostname}"), que não ` +
        `parece um banco de DEV (esperava nome terminando em _remake, _dev ou _test). Este script cria ` +
        `E APAGA dezenas de milhares de linhas sintéticas — nunca deve rodar contra produção. Se este é ` +
        `um dev de verdade com outro nome, ajuste o padrão em scripts/seed-crm-volume.ts conscientemente, ` +
        `nunca só para destravar a execução.`,
    );
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("RECUSADO: NODE_ENV=production — este script não roda com essa flag, ponto final.");
  }
}

// ── Utilidades ───────────────────────────────────────────────────────────────────────────────

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function escolha<T>(arr: readonly T[]): T {
  return arr[randInt(0, arr.length - 1)];
}
/** Ponderado: `[[peso, valor], ...]`. Pesos não precisam somar 1. */
function escolhaPonderada<T>(opcoes: readonly [number, T][]): T {
  const total = opcoes.reduce((s, [p]) => s + p, 0);
  let alvo = Math.random() * total;
  for (const [p, v] of opcoes) {
    if (alvo < p) return v;
    alvo -= p;
  }
  return opcoes[opcoes.length - 1][1];
}
/** Data aleatória entre `mesesAtras` meses atrás e hoje. */
function dataAleatoria(mesesAtras: number): Date {
  const agora = Date.now();
  const inicio = agora - mesesAtras * 30 * 86_400_000;
  return new Date(inicio + Math.random() * (agora - inicio));
}
/** N dias depois de `d` (para encadear eventos em ordem cronológica plausível). */
function depoisDe(d: Date, minDias: number, maxDias: number): Date {
  return new Date(d.getTime() + randInt(minDias, maxDias) * 86_400_000);
}
async function emLotes<T>(itens: T[], fn: (lote: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < itens.length; i += TAMANHO_LOTE) {
    await fn(itens.slice(i, i + TAMANHO_LOTE));
  }
}

const NOMES_EMPRESA = [
  "Construtora", "Incorporadora", "Engenharia", "Empreendimentos", "Edificações",
  "Grupo", "Residencial", "Comercial", "Urbanismo", "Projetos",
];
const SOBRENOMES_EMPRESA = [
  "Aurora", "Horizonte", "Vértice", "Panorama", "Meridiano", "Prisma", "Alicerce",
  "Estrutura", "Fundação", "Zênite", "Cardeal", "Bússola", "Marco", "Cimento",
  "Alvenaria", "Concreto", "Viga", "Pilar", "Laje", "Fôrma",
];
const PRIMEIROS_NOMES = ["Ana", "Bruno", "Carla", "Diego", "Elaine", "Fábio", "Gabriela", "Hugo", "Inês", "João", "Karla", "Lucas", "Marina", "Nelson", "Olívia", "Paulo", "Renata", "Sérgio", "Tânia", "Vitor"];
const SOBRENOMES = ["Silva", "Santos", "Oliveira", "Souza", "Costa", "Pereira", "Lima", "Carvalho", "Gomes", "Ribeiro"];
const CARGOS = ["Diretor(a)", "Sócio(a)", "Engenheiro(a)", "Arquiteto(a)", "Gerente de obras", "Compras", null];
const UFS = ["PE", "PB", "AL", "RN", "CE", "BA"];
const CIDADES: Record<string, string[]> = {
  PE: ["Recife", "Olinda", "Jaboatão dos Guararapes", "Caruaru"],
  PB: ["João Pessoa", "Campina Grande"],
  AL: ["Maceió"],
  RN: ["Natal"],
  CE: ["Fortaleza"],
  BA: ["Salvador", "Feira de Santana"],
};

async function main() {
  garantirAmbienteDev();

  const [user, etapas, disciplinas, motivos, canais] = await Promise.all([
    prisma.user.findFirst({ where: { role: "admin", ativo: true }, select: { id: true } }),
    prisma.funilEtapa.findMany({ where: { ativo: true }, select: { id: true } }),
    prisma.disciplinaCatalogo.findMany({ select: { id: true, nome: true } }),
    prisma.motivoPerda.findMany({ where: { ativo: true }, select: { id: true, nome: true, exigeConcorrente: true } }),
    prisma.canalAquisicao.findMany({ where: { ativo: true }, select: { id: true } }),
  ]);
  if (!user) throw new Error("dev incompleto — rode `npm run db:seed` (sem admin ativo).");
  if (etapas.length === 0) throw new Error("dev incompleto — `FunilEtapa` vazia. Rode `npm run db:seed`.");
  if (disciplinas.length === 0) throw new Error("dev incompleto — `DisciplinaCatalogo` vazia. Rode `npm run db:seed`.");

  console.log("── Limpando volume sintético de uma rodada anterior (se houver) ──");
  await limpar();

  console.log(`── Gerando ${N_CLIENTES} clientes ──`);
  const clientes = Array.from({ length: N_CLIENTES }, (_, i) => {
    const uf = escolha(UFS);
    const tipo = Math.random() < 0.85 ? "PJ" : "PF";
    const nome =
      tipo === "PJ"
        ? `${TAG}${escolha(NOMES_EMPRESA)} ${escolha(SOBRENOMES_EMPRESA)} ${i}`
        : `${TAG}${escolha(PRIMEIROS_NOMES)} ${escolha(SOBRENOMES)} ${i}`;
    return {
      id: randomUUID(),
      nome,
      tipo: tipo as "PJ" | "PF",
      uf,
      cidade: escolha(CIDADES[uf]),
      createdAt: dataAleatoria(30),
    };
  });
  await emLotes(clientes, (l) => prisma.cliente.createMany({ data: l }));

  console.log(`── Gerando ${N_CONTATOS} contatos ──`);
  const contatos = Array.from({ length: N_CONTATOS }, () => {
    const cliente = escolha(clientes);
    return {
      id: randomUUID(),
      clienteId: cliente.id,
      nome: `${TAG}${escolha(PRIMEIROS_NOMES)} ${escolha(SOBRENOMES)}`,
      cargo: escolha(CARGOS),
      principal: Math.random() < 0.3,
      optOut: Math.random() < 0.05,
      createdAt: depoisDe(cliente.createdAt, 0, 60),
    };
  });
  await emLotes(contatos, (l) => prisma.contatoCliente.createMany({ data: l }));

  // ── Leads (prospecções) ──────────────────────────────────────────────────────────────────
  // Distribuição pesada em status ATIVO — é o funil real: a maioria ainda não desfechou.
  console.log(`── Gerando ${N_LEADS} prospecções ──`);
  const STATUS_LEAD: readonly [number, StatusProspeccao][] = [
    [30, "IDENTIFICADO"], [15, "CONTATO_INICIADO"], [15, "EM_CONTATO"], [10, "QUALIFICADO"],
    [15, "OPORTUNIDADE_CRIADA"], [5, "SEM_OPORTUNIDADE"], [3, "EM_ESPERA"], [7, "DESCARTADO"],
  ];
  const leads = Array.from({ length: N_LEADS }, () => {
    const cliente = escolha(clientes);
    const criadoEm = depoisDe(cliente.createdAt, 0, 90);
    return {
      id: randomUUID(),
      nome: `${TAG}Prospecção ${cliente.nome}`,
      clienteId: cliente.id,
      etapaId: escolha(etapas).id,
      status: escolhaPonderada(STATUS_LEAD),
      needsReview: false,
      canalId: canais.length > 0 && Math.random() < 0.7 ? escolha(canais).id : null,
      createdAt: criadoEm,
      updatedAt: criadoEm,
    };
  });
  await emLotes(leads, (l) => prisma.lead.createMany({ data: l }));

  // Leads elegíveis a virar negociação: os que "avançaram" no funil de prospecção.
  const leadsQualificaveis = leads.filter((l) => l.status === "OPORTUNIDADE_CRIADA" || l.status === "QUALIFICADO");

  // ── Negociações ───────────────────────────────────────────────────────────────────────────
  // Cada uma recebe uma TRAJETÓRIA: os estágios que ela de fato atravessou, na ordem — é o que
  // gera as `Atividade` de ESTAGIO_ALTERADO que §3.10 do dicionário lê para medir conversão.
  console.log(`── Gerando ${N_NEGOCIACOES} negociações (+ trajetória de estágios) ──`);
  const DESFECHO: readonly [number, "CONTRATADO" | "PERDIDO" | "CANCELADO" | "EM_ESPERA" | "ATIVA"][] = [
    [35, "CONTRATADO"], [22, "PERDIDO"], [5, "CANCELADO"], [8, "EM_ESPERA"], [30, "ATIVA"],
  ];
  type Negociacao = {
    id: string;
    titulo: string;
    clienteId: string;
    leadId: string | null;
    estagio: EstagioNegociacao;
    probabilidade: number;
    valorEstimado: number;
    valorProposto: number | null;
    valorNegociado: number | null;
    motivoPerdaId: string | null;
    concorrente: string | null;
    dataFechamento: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };
  const negociacoes: Negociacao[] = [];
  const eventosEstagio: {
    id: string;
    tipo: TipoAtividade;
    descricao: string;
    metadata: Prisma.InputJsonValue;
    autorId: string;
    clienteId: string;
    negociacaoId: string;
    leadId: string | null;
    createdAt: Date;
  }[] = [];

  // Metade das negociações nasce de um lead qualificável (fura fila enquanto houver);
  // a outra metade nasce direto — é a mistura que §2.9 do dicionário exige existir no seed.
  for (let i = 0; i < N_NEGOCIACOES; i++) {
    const negociacaoId = randomUUID(); // gerado ANTES da trajetória — os eventos referenciam direto
    const deLead = i < leadsQualificaveis.length && Math.random() < 0.6;
    const lead = deLead ? leadsQualificaveis[i] : null;
    const cliente = lead ? clientes.find((c) => c.id === lead.clienteId)! : escolha(clientes);

    const desfecho = escolhaPonderada(DESFECHO);
    const criadoEm = lead ? depoisDe(lead.createdAt, 1, 20) : depoisDe(cliente.createdAt, 0, 90);
    const valorEstimado = randInt(5, 800) * 1000;

    // Trajetória: quantos estágios ATIVOS ela atravessou antes do desfecho.
    const profundidade =
      desfecho === "CONTRATADO"
        ? ESTAGIOS_ATIVOS.length // percorreu todos
        : randInt(1, ESTAGIOS_ATIVOS.length); // demais desfechos: parou em algum ponto do caminho

    let dataEvento = criadoEm;
    let estagioAnterior: EstagioNegociacao | null = null;
    for (let e = 0; e < profundidade; e++) {
      const alvo = ESTAGIOS_ATIVOS[e];
      dataEvento = e === 0 ? criadoEm : depoisDe(dataEvento, 2, 25);
      if (estagioAnterior) {
        eventosEstagio.push({
          id: randomUUID(),
          tipo: "SISTEMA",
          descricao: `Estágio movido de "${estagioAnterior}" para "${alvo}"`,
          metadata: { evento: "ESTAGIO_ALTERADO", de: estagioAnterior, para: alvo },
          autorId: user.id,
          clienteId: cliente.id,
          negociacaoId,
          leadId: null,
          createdAt: dataEvento,
        });
      }
      estagioAnterior = alvo;
    }

    let estagioFinal: EstagioNegociacao;
    let dataFechamento: Date | null = null;
    let valorNegociado: number | null = null;
    const valorProposto: number | null = valorEstimado + randInt(-50, 50) * 1000;
    let motivoPerdaId: string | null = null;
    let concorrente: string | null = null;

    if (desfecho === "CONTRATADO") {
      estagioFinal = "CONTRATADO";
      dataFechamento = depoisDe(dataEvento, 2, 20);
      valorNegociado = valorProposto! - randInt(0, 15) * 1000; // pode ter saído com desconto
      dataEvento = dataFechamento;
      eventosEstagio.push({
        id: randomUUID(),
        tipo: "SISTEMA",
        descricao: `Estágio movido de "${estagioAnterior}" para "CONTRATADO"`,
        metadata: { evento: "ESTAGIO_ALTERADO", de: estagioAnterior, para: "CONTRATADO" },
        autorId: user.id,
        clienteId: cliente.id,
        negociacaoId,
        leadId: null,
        createdAt: dataFechamento,
      });
    } else if (desfecho === "PERDIDO") {
      estagioFinal = "PERDIDO";
      dataFechamento = depoisDe(dataEvento, 1, 15);
      const motivo = motivos.length > 0 ? escolha(motivos) : null;
      motivoPerdaId = motivo?.id ?? null;
      concorrente = motivo?.exigeConcorrente ? `${TAG}Concorrente ${randInt(1, 5)}` : null;
      eventosEstagio.push({
        id: randomUUID(),
        tipo: "SISTEMA",
        descricao: "Negociação perdida",
        metadata: { evento: "NEGOCIACAO_PERDIDA", motivo: motivo?.nome ?? null, concorrente, observacao: null },
        autorId: user.id,
        clienteId: cliente.id,
        negociacaoId,
        leadId: null,
        createdAt: dataFechamento,
      });
    } else if (desfecho === "CANCELADO") {
      estagioFinal = "CANCELADO";
      dataFechamento = depoisDe(dataEvento, 1, 15);
    } else if (desfecho === "EM_ESPERA") {
      estagioFinal = "EM_ESPERA";
    } else {
      estagioFinal = estagioAnterior ?? "LEVANTAMENTO";
    }

    negociacoes.push({
      id: negociacaoId,
      titulo: `${TAG}${cliente.nome} — negociação`,
      clienteId: cliente.id,
      leadId: lead?.id ?? null,
      estagio: estagioFinal,
      probabilidade: estagioFinal === "CONTRATADO" ? 100 : estagioFinal === "PERDIDO" || estagioFinal === "CANCELADO" ? 0 : randInt(10, 80),
      valorEstimado,
      valorProposto: profundidade >= 3 ? valorProposto : null,
      valorNegociado,
      motivoPerdaId,
      concorrente,
      dataFechamento,
      createdAt: criadoEm,
      updatedAt: dataEvento,
    });
  }

  await emLotes(negociacoes, (l) =>
    prisma.negociacao.createMany({
      data: l.map((n) => ({
        id: n.id,
        titulo: n.titulo,
        clienteId: n.clienteId,
        leadId: n.leadId,
        estagio: n.estagio,
        probabilidade: n.probabilidade,
        valorEstimado: n.valorEstimado,
        valorProposto: n.valorProposto,
        valorNegociado: n.valorNegociado,
        motivoPerdaId: n.motivoPerdaId,
        concorrente: n.concorrente,
        dataFechamento: n.dataFechamento,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
      })),
    }),
  );

  // ── Propostas (+ 1 item + 1 versão cada, o mínimo para valer como proposta de verdade) ────
  console.log(`── Gerando ${N_PROPOSTAS} propostas ──`);
  const STATUS_PROPOSTA: readonly [number, StatusProposta][] = [
    [15, "rascunho"], [30, "enviada"], [10, "em_negociacao"], [35, "aceita"], [10, "recusada"],
  ];
  const propostas: {
    id: string;
    ano: number;
    sequencial: number;
    numero: string;
    titulo: string;
    clienteId: string;
    negociacaoId: string | null;
    status: StatusProposta;
    token: string;
    autorId: string;
    enviadaEm: Date | null;
    aceitaEm: Date | null;
    validade: Date | null;
    alertaValidadeEm: Date | null;
    createdAt: Date;
  }[] = [];
  const propostaItens: { id: string; propostaId: string; disciplinaTextoLegado: string; disciplinaId: string; valor: number; ordem: number }[] = [];
  const propostaVersoes: {
    id: string;
    propostaId: string;
    numero: number;
    snapshot: object;
    autorId: string;
    valorOriginal: number;
    valorVersao: number;
    desconto: number | null;
    status: StatusProposta;
    createdAt: Date;
  }[] = [];

  const anoSeed = new Date().getFullYear();
  for (let i = 0; i < N_PROPOSTAS; i++) {
    // 60% ligadas a uma negociação existente (F5.3 obrigatório para propostas novas de verdade);
    // 40% avulsas — mantém o seed honesto sobre o estado real (nem toda proposta tem negociação).
    const negociacao = Math.random() < 0.6 ? escolha(negociacoes) : null;
    const cliente = negociacao ? clientes.find((c) => c.id === negociacao.clienteId)! : escolha(clientes);
    const criadoEm = negociacao ? depoisDe(negociacao.createdAt, 1, 10) : depoisDe(cliente.createdAt, 0, 90);

    const status = escolhaPonderada(STATUS_PROPOSTA);
    const valorItem = randInt(5, 500) * 1000;
    const temDesconto = Math.random() < 0.25;
    const desconto = temDesconto ? Math.round(valorItem * (randInt(2, 25) / 100)) : null;
    const valorVersao = valorItem - (desconto ?? 0);
    const propostaValidade = depoisDe(criadoEm, 15, 45);

    const propostaId = randomUUID();
    const sequencial = 5_000_000 + i; // fora de qualquer faixa real — nunca toca PropostaSequencia
    propostas.push({
      id: propostaId,
      ano: anoSeed,
      sequencial,
      numero: `${TAG.slice(0, -1)}-${anoSeed}-${sequencial}`,
      titulo: `${TAG}Proposta ${cliente.nome}`,
      clienteId: cliente.id,
      negociacaoId: negociacao?.id ?? null,
      status,
      token: randomBytes(18).toString("hex"),
      autorId: user.id,
      enviadaEm: status === "rascunho" ? null : depoisDe(criadoEm, 0, 5),
      aceitaEm: status === "aceita" ? depoisDe(criadoEm, 3, 30) : null,
      validade: propostaValidade,
      // Data histórica sintética: se a validade já ficou pra trás E o status é candidato do job
      // (mesmo filtro de `alertaPropostasExpiradas`: tudo exceto aceita/recusada), o job diário
      // (F5.7, `lib/jobs-handlers.ts`) já teria avisado em algum tick entre então e hoje — sem
      // isto, o seed cria milhares de propostas "vencida + nunca avisada", um estado que não
      // ocorre na operação real (achado rodando `smoke-crm-fase5` depois deste seed existir: o
      // job varre a tabela inteira sem filtro por origem, `take: 50` sem `order by`, e o backlog
      // sintético engolia o tick antes de chegar na fixture do próprio smoke).
      alertaValidadeEm:
        status !== "aceita" && status !== "recusada" && propostaValidade < new Date()
          ? new Date(Math.min(depoisDe(propostaValidade, 1, 15).getTime(), Date.now() - 3_600_000))
          : null,
      createdAt: criadoEm,
    });

    const disc = escolha(disciplinas);
    propostaItens.push({
      id: randomUUID(),
      propostaId,
      disciplinaTextoLegado: disc.nome,
      disciplinaId: disc.id,
      valor: valorItem,
      ordem: 0,
    });
    propostaVersoes.push({
      id: randomUUID(),
      propostaId,
      numero: 1,
      snapshot: { titulo: `${TAG}Proposta ${cliente.nome}`, itens: [{ disciplina: disc.nome, valor: valorItem }] },
      autorId: user.id,
      valorOriginal: valorItem,
      valorVersao,
      desconto,
      status,
      createdAt: criadoEm,
    });
  }
  await emLotes(propostas, (l) => prisma.proposta.createMany({ data: l }));
  await emLotes(propostaItens, (l) => prisma.propostaItem.createMany({ data: l }));
  await emLotes(propostaVersoes, (l) => prisma.propostaVersao.createMany({ data: l }));

  // ── Atividades ────────────────────────────────────────────────────────────────────────────
  // Os eventos ESTAGIO_ALTERADO/NEGOCIACAO_PERDIDA já gerados junto das negociações entram
  // direto; o resto é preenchido com interação manual (o que a métrica "contatos realizados",
  // §3.2 do dicionário, precisa para ter volume) até completar N_ATIVIDADES.
  console.log(`── Gerando atividades (${eventosEstagio.length} estruturais + o resto manual, até ${N_ATIVIDADES}) ──`);
  const TIPOS_MANUAIS: TipoAtividade[] = ["LIGACAO", "WHATSAPP", "EMAIL", "LINKEDIN", "REUNIAO", "NOTA"];
  const faltam = Math.max(0, N_ATIVIDADES - eventosEstagio.length);
  const atividadesManuais = Array.from({ length: faltam }, () => {
    const cliente = escolha(clientes);
    const negDoCliente = negociacoes.filter((n) => n.clienteId === cliente.id);
    const negociacao = negDoCliente.length > 0 && Math.random() < 0.5 ? escolha(negDoCliente) : null;
    const tipo = escolha(TIPOS_MANUAIS);
    return {
      id: randomUUID(),
      tipo,
      descricao: `${TAG}${tipo.toLowerCase()} registrado`,
      autorId: user.id,
      clienteId: cliente.id,
      negociacaoId: negociacao?.id ?? null,
      leadId: null,
      createdAt: dataAleatoria(24),
    };
  });

  await emLotes(
    eventosEstagio.map((e) => ({
      id: e.id,
      tipo: e.tipo,
      descricao: e.descricao,
      metadata: e.metadata,
      autorId: e.autorId,
      clienteId: e.clienteId,
      negociacaoId: e.negociacaoId || null,
      leadId: e.leadId,
      createdAt: e.createdAt,
    })),
    (l) => prisma.atividade.createMany({ data: l }),
  );
  await emLotes(atividadesManuais, (l) => prisma.atividade.createMany({ data: l }));

  const totalAtividades = eventosEstagio.length + atividadesManuais.length;
  console.log(
    `\n✔ Seed de volume concluído: ${clientes.length} clientes, ${contatos.length} contatos, ` +
      `${leads.length} prospecções, ${negociacoes.length} negociações, ${propostas.length} propostas, ` +
      `${totalAtividades} atividades.`,
  );
}

/** Apaga só o que carrega a marca `SEED_VOL_` — nunca toca dado que não seja deste script. */
async function limpar() {
  const clientesIds = (
    await prisma.cliente.findMany({ where: { nome: { startsWith: TAG } }, select: { id: true } })
  ).map((c) => c.id);
  if (clientesIds.length === 0) return;

  const propostasIds = (
    await prisma.proposta.findMany({ where: { clienteId: { in: clientesIds } }, select: { id: true } })
  ).map((p) => p.id);

  await prisma.atividade.deleteMany({ where: { clienteId: { in: clientesIds } } });
  await prisma.propostaVersao.deleteMany({ where: { propostaId: { in: propostasIds } } });
  await prisma.propostaItem.deleteMany({ where: { propostaId: { in: propostasIds } } });
  await prisma.propostaCondicao.deleteMany({ where: { propostaId: { in: propostasIds } } });
  await prisma.proposta.deleteMany({ where: { clienteId: { in: clientesIds } } });
  // SQL cru: `negociacao.deleteMany` passaria pela extensão de soft delete (injeta
  // `excluidoEm: null`), e este seed nunca marca `excluidoEm` — mas o cru é mais barato aqui
  // (uma instrução, sem o round-trip de leitura da extensão) e o volume é grande o bastante
  // para o custo importar.
  await prisma.$executeRawUnsafe(`DELETE FROM negociacao WHERE "clienteId" = ANY($1::text[])`, clientesIds);
  await prisma.contatoCliente.deleteMany({ where: { clienteId: { in: clientesIds } } });
  await prisma.lead.deleteMany({ where: { clienteId: { in: clientesIds } } });
  await prisma.cliente.deleteMany({ where: { id: { in: clientesIds } } });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
