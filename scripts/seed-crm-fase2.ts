/**
 * Seed SINTÉTICO da Fase 2 do CRM — dado de trabalho para verificar os boards.
 *
 * Existe porque o `seed:demo` não conhece nada do funil novo: dev tem 0 negociações, 1 contato e
 * 8 leads todos em `IDENTIFICADO`. Com isso o Kanban de Negociações (F2.14) renderiza vazio e não
 * há como conferir contador por coluna, soma por estágio, frescor, temperatura ou "sem próxima
 * ação" — que são justamente os critérios de aceite.
 *
 * **Nada aqui vem de produção.** Empresas, pessoas e valores são inventados. A decisão foi
 * deliberada: uma cópia anonimizada do banco real traria `AuditLog.detalhe` (JSON livre com o
 * antes/depois de toda mutação), mensagens de chat e dezenas de campos de observação — texto livre
 * que não se mascara de forma confiável, só se trunca. O que falta ao dev é FORMA e VOLUME, não
 * conteúdo real, e isso dá para fabricar sem tocar em dado de ninguém.
 *
 * A forma imita produção onde importa: a maioria das prospecções sem campanha (produção não tem
 * nenhuma), negociações concentradas nos estágios do meio, uma parte sem próxima ação marcada e
 * uma parte com follow-up vencido — que é o retrato que o board precisa saber desenhar.
 *
 * SÓ PARA DEV. Ids com prefixo `f2s`, então rodar de novo não duplica e `--limpar` remove tudo.
 *
 *   tsx --tsconfig tsconfig.server.json scripts/seed-crm-fase2.ts
 *   tsx --tsconfig tsconfig.server.json scripts/seed-crm-fase2.ts --limpar
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import type { EstagioNegociacao, StatusProspeccao, Temperatura } from "../src/generated/prisma/client";

const P = "f2s"; // prefixo de id — tudo que este script cria começa com isto
const LIMPAR = process.argv.includes("--limpar");

const dia = 86_400_000;
/** Relógio base: fixo no instante da execução, mas todas as datas derivam dele por offset. */
const AGORA = Date.now();
const emDias = (n: number) => new Date(AGORA + n * dia);

const EMPRESAS = [
  { id: `${P}c01`, nome: "Construtora Aurora", documento: "11111111000101" },
  { id: `${P}c02`, nome: "Incorporadora Vale Verde", documento: "11111111000102" },
  { id: `${P}c03`, nome: "Engenharia Praia Nova", documento: "11111111000103" },
  { id: `${P}c04`, nome: "Grupo Meridiano", documento: "11111111000104" },
  { id: `${P}c05`, nome: "Construtora Pedra Branca", documento: "11111111000105" },
  { id: `${P}c06`, nome: "Empreendimentos Sol Nascente", documento: "11111111000106" },
  { id: `${P}c07`, nome: "Realiza Incorporações", documento: "11111111000107" },
  { id: `${P}c08`, nome: "Construtora Horizonte Sul", documento: "11111111000108" },
];

const PESSOAS = [
  "Ana Ribeiro", "Bruno Tavares", "Carla Meneses", "Diego Nunes",
  "Elisa Cardoso", "Fábio Aguiar", "Gabriela Pinto", "Henrique Sales",
];

const PARCEIROS = [
  { id: `${P}p1`, nome: "Escritório Lima Arquitetura", tipo: "PJ" as const },
  { id: `${P}p2`, nome: "Marcos Vidal (indicação)", tipo: "PF" as const },
  { id: `${P}p3`, nome: "Consultoria Base Forte", tipo: "PJ" as const },
];

const CAMPANHAS = [
  { id: `${P}k1`, nome: "Feira Construir 2026" },
  { id: `${P}k2`, nome: "Prospecção LinkedIn Q3" },
];

/**
 * Prospecções. **Uma empresa ativa por campanha** — o índice parcial da F2.5 recusaria duas
 * abertas na mesma empresa sem campanha, então o seed respeita a própria regra que o sistema
 * impõe. É de propósito que `c01` apareça duas vezes: uma sem campanha e outra COM, que é
 * exatamente o caso que a regra permite e que vale ter no board para conferir.
 */
const LEADS: {
  id: string;
  empresa: string;
  titulo: string;
  status: StatusProspeccao;
  temperatura: Temperatura | null;
  campanha?: string;
  parceiro?: string;
  valor?: number;
  /** Dias até a próxima ação. Negativo = vencida. `undefined` = sem próxima ação. */
  acaoEmDias?: number;
}[] = [
  { id: `${P}l01`, empresa: `${P}c01`, titulo: "RESIDENCIAL MIRANTE", status: "IDENTIFICADO", temperatura: null, valor: 45000, acaoEmDias: 2 },
  { id: `${P}l02`, empresa: `${P}c01`, titulo: "TORRE COMERCIAL CENTRO", status: "EM_CONTATO", temperatura: "MORNO", campanha: `${P}k1`, valor: 120000, acaoEmDias: -3 },
  { id: `${P}l03`, empresa: `${P}c02`, titulo: "CONDOMÍNIO PARQUE SUL", status: "CONTATO_INICIADO", temperatura: "FRIO", valor: 78000 },
  { id: `${P}l04`, empresa: `${P}c03`, titulo: "GALPÃO LOGÍSTICO BR-101", status: "QUALIFICADO", temperatura: "QUENTE", parceiro: `${P}p1`, valor: 210000, acaoEmDias: 0 },
  { id: `${P}l05`, empresa: `${P}c04`, titulo: "ESCOLA MUNICIPAL NORTE", status: "EM_CONTATO", temperatura: "MORNO", valor: 96000, acaoEmDias: -12 },
  { id: `${P}l06`, empresa: `${P}c05`, titulo: "CLÍNICA SANTA RITA", status: "IDENTIFICADO", temperatura: null },
  { id: `${P}l07`, empresa: `${P}c06`, titulo: "SHOPPING VILA MAR", status: "QUALIFICADO", temperatura: "QUENTE", campanha: `${P}k2`, parceiro: `${P}p3`, valor: 340000, acaoEmDias: 5 },
  { id: `${P}l08`, empresa: `${P}c07`, titulo: "EDIFÍCIO ATLÂNTICO", status: "CONTATO_INICIADO", temperatura: "FRIO", valor: 64000 },
  // Terminais: não travam a empresa, então podem repetir empresa à vontade (ADR-18).
  { id: `${P}l09`, empresa: `${P}c02`, titulo: "RETROFIT SEDE ANTIGA", status: "SEM_OPORTUNIDADE", temperatura: "FRIO" },
  { id: `${P}l10`, empresa: `${P}c04`, titulo: "ANEXO ADMINISTRATIVO", status: "DESCARTADO", temperatura: null },
];

/**
 * Negociações espalhadas pelos 8 estágios, com o peso concentrado no meio do funil — é como um
 * pipeline real se distribui, e é o que faz a soma por coluna significar alguma coisa.
 */
const NEGOCIACOES: {
  id: string;
  empresa: string;
  titulo: string;
  estagio: EstagioNegociacao;
  temperatura: Temperatura | null;
  valor: number;
  area?: number;
  acaoEmDias?: number;
  motivoPerda?: boolean;
  disciplinas?: number;
}[] = [
  { id: `${P}n01`, empresa: `${P}c01`, titulo: "RESIDENCIAL MIRANTE — projetos complementares", estagio: "LEVANTAMENTO", temperatura: "MORNO", valor: 52000, area: 3200, acaoEmDias: 1, disciplinas: 3 },
  { id: `${P}n02`, empresa: `${P}c02`, titulo: "CONDOMÍNIO PARQUE SUL — fase 1", estagio: "LEVANTAMENTO", temperatura: null, valor: 88000, area: 5100, disciplinas: 2 },
  { id: `${P}n03`, empresa: `${P}c03`, titulo: "GALPÃO LOGÍSTICO BR-101", estagio: "ORCAMENTO", temperatura: "QUENTE", valor: 215000, area: 12000, acaoEmDias: -2, disciplinas: 5 },
  { id: `${P}n04`, empresa: `${P}c04`, titulo: "ESCOLA MUNICIPAL NORTE", estagio: "ORCAMENTO", temperatura: "MORNO", valor: 99000, area: 4300, acaoEmDias: 3, disciplinas: 4 },
  { id: `${P}n05`, empresa: `${P}c05`, titulo: "CLÍNICA SANTA RITA — ampliação", estagio: "ORCAMENTO", temperatura: "FRIO", valor: 47000, area: 1800 },
  { id: `${P}n06`, empresa: `${P}c06`, titulo: "SHOPPING VILA MAR — praça de alimentação", estagio: "PROPOSTA_ENVIADA", temperatura: "QUENTE", valor: 356000, area: 9400, acaoEmDias: 0, disciplinas: 6 },
  { id: `${P}n07`, empresa: `${P}c07`, titulo: "EDIFÍCIO ATLÂNTICO — torre B", estagio: "PROPOSTA_ENVIADA", temperatura: "MORNO", valor: 128000, area: 6600, acaoEmDias: -8, disciplinas: 3 },
  { id: `${P}n08`, empresa: `${P}c08`, titulo: "HORIZONTE SUL — quadra 4", estagio: "PROPOSTA_ENVIADA", temperatura: null, valor: 73000, area: 2900 },
  { id: `${P}n09`, empresa: `${P}c01`, titulo: "TORRE COMERCIAL CENTRO", estagio: "NEGOCIACAO", temperatura: "QUENTE", valor: 264000, area: 8800, acaoEmDias: 2, disciplinas: 5 },
  { id: `${P}n10`, empresa: `${P}c02`, titulo: "VALE VERDE — loteamento fase 2", estagio: "NEGOCIACAO", temperatura: "MORNO", valor: 142000, area: 15000, acaoEmDias: -1, disciplinas: 4 },
  { id: `${P}n11`, empresa: `${P}c03`, titulo: "PRAIA NOVA — sede administrativa", estagio: "CONTRATADO", temperatura: "QUENTE", valor: 187000, area: 4100, disciplinas: 4 },
  { id: `${P}n12`, empresa: `${P}c04`, titulo: "MERIDIANO — centro de distribuição", estagio: "CONTRATADO", temperatura: null, valor: 298000, area: 11200, disciplinas: 6 },
  { id: `${P}n13`, empresa: `${P}c05`, titulo: "PEDRA BRANCA — residencial econômico", estagio: "PERDIDO", temperatura: "FRIO", valor: 61000, area: 2200, motivoPerda: true },
  { id: `${P}n14`, empresa: `${P}c06`, titulo: "SOL NASCENTE — anexo", estagio: "EM_ESPERA", temperatura: "FRIO", valor: 39000, area: 1500 },
  { id: `${P}n15`, empresa: `${P}c07`, titulo: "REALIZA — estudo preliminar", estagio: "CANCELADO", temperatura: null, valor: 24000, area: 900 },
];

async function limpar() {
  // Ordem importa: filhos antes dos pais, e nada depende de cascade que possa não existir.
  const compromissos = await prisma.compromisso.findMany({
    where: { id: { startsWith: P } },
    select: { id: true },
  });
  const ids = compromissos.map((c) => c.id);
  await prisma.compromissoParticipante.deleteMany({ where: { compromissoId: { in: ids } } });
  await prisma.compromisso.deleteMany({ where: { id: { startsWith: P } } });

  await prisma.negociacaoDisciplina.deleteMany({ where: { negociacaoId: { startsWith: P } } });
  await prisma.negociacaoContato.deleteMany({ where: { negociacaoId: { startsWith: P } } });
  await prisma.negociacao.deleteMany({ where: { id: { startsWith: P } } });

  await prisma.leadContato.deleteMany({ where: { leadId: { startsWith: P } } });
  await prisma.lead.deleteMany({ where: { id: { startsWith: P } } });

  await prisma.contatoCliente.deleteMany({ where: { id: { startsWith: P } } });
  await prisma.campanha.deleteMany({ where: { id: { startsWith: P } } });
  await prisma.parceiro.deleteMany({ where: { id: { startsWith: P } } });
  await prisma.cliente.deleteMany({ where: { id: { startsWith: P } } });
  console.log("Removido tudo com prefixo " + P + ".");
}

async function main() {
  if (LIMPAR) {
    await limpar();
    return;
  }
  // Idempotente por reconstrução: limpa o que este script criou antes e recria. Mais simples e
  // mais confiável que 60 upserts, e o dado é descartável por definição.
  await limpar();

  const etapa = await prisma.funilEtapa.findFirst({ orderBy: { ordem: "asc" }, select: { id: true } });
  if (!etapa) throw new Error("dev sem FunilEtapa — rode `npm run db:seed` antes.");
  const usuarios = await prisma.user.findMany({
    where: { ativo: true, role: { not: "cliente" } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 4,
  });
  if (usuarios.length === 0) throw new Error("dev sem usuário interno.");
  const canais = await prisma.canalAquisicao.findMany({ select: { id: true }, orderBy: { ordem: "asc" } });
  const tipos = await prisma.tipoEmpreendimento.findMany({ select: { id: true }, orderBy: { ordem: "asc" } });
  const cats = await prisma.disciplinaCatalogo.findMany({ select: { id: true }, orderBy: { ordem: "asc" } });
  const motivo = await prisma.motivoPerda.findFirst({ where: { exigeConcorrente: false }, select: { id: true } });
  const resp = (i: number) => usuarios[i % usuarios.length].id;

  for (const e of EMPRESAS) {
    await prisma.cliente.create({
      data: { id: e.id, nome: e.nome, documento: e.documento, tipo: "PJ" },
    });
  }
  for (const p of PARCEIROS) {
    await prisma.parceiro.create({ data: { id: p.id, nome: p.nome, tipo: p.tipo } });
  }
  for (const k of CAMPANHAS) {
    await prisma.campanha.create({ data: { id: k.id, nome: k.nome } });
  }

  // 2 contatos por empresa — o board de negociação mostra contato, e produção tem ZERO hoje.
  const contatoPorEmpresa = new Map<string, string[]>();
  for (const [i, e] of EMPRESAS.entries()) {
    const ids: string[] = [];
    for (const j of [0, 1]) {
      const id = `${P}ct${i}${j}`;
      const nome = PESSOAS[(i * 2 + j) % PESSOAS.length];
      await prisma.contatoCliente.create({
        data: {
          id,
          clienteId: e.id,
          nome,
          cargo: j === 0 ? "Diretor de obras" : "Engenheiro responsável",
          email: `${nome.split(" ")[0].toLowerCase()}@exemplo.test`,
          telefone: `81 9${String(90000000 + i * 100 + j).slice(0, 8)}`,
          principal: j === 0,
        },
      });
      ids.push(id);
    }
    contatoPorEmpresa.set(e.id, ids);
  }

  for (const [i, l] of LEADS.entries()) {
    await prisma.lead.create({
      data: {
        id: l.id,
        nome: l.titulo,
        etapaId: etapa.id,
        clienteId: l.empresa,
        status: l.status,
        temperatura: l.temperatura,
        campaignId: l.campanha ?? null,
        parceiroId: l.parceiro ?? null,
        canalId: canais[i % canais.length]?.id ?? null,
        origemDetalhada: l.titulo,
        valorEstimado: l.valor ?? null,
        responsavelId: resp(i),
        contatos: {
          create: (contatoPorEmpresa.get(l.empresa) ?? []).slice(0, 1).map((cid) => ({
            contatoId: cid,
            principal: true,
          })),
        },
      },
    });
    if (l.acaoEmDias !== undefined) {
      await criarAcao(`${P}a-l${i}`, "LEAD", l.id, l.titulo, l.acaoEmDias, resp(i));
    }
  }

  for (const [i, n] of NEGOCIACOES.entries()) {
    const nDisc = n.disciplinas ?? 0;
    await prisma.negociacao.create({
      data: {
        id: n.id,
        titulo: n.titulo,
        clienteId: n.empresa,
        estagio: n.estagio,
        temperatura: n.temperatura,
        valorEstimado: n.valor,
        valorProposto: n.estagio === "LEVANTAMENTO" ? null : Math.round(n.valor * 0.97),
        areaM2: n.area ?? null,
        responsavelId: resp(i),
        canalId: canais[i % canais.length]?.id ?? null,
        tipoEmpreendimentoId: tipos[i % tipos.length]?.id ?? null,
        motivoPerdaId: n.motivoPerda ? (motivo?.id ?? null) : null,
        dataFechamento:
          n.estagio === "CONTRATADO" || n.estagio === "PERDIDO" || n.estagio === "CANCELADO"
            ? emDias(-(5 + i))
            : null,
        // Probabilidade coerente com o estágio — o board soma isso no forecast.
        probabilidade:
          n.estagio === "CONTRATADO" ? 100
          : n.estagio === "PERDIDO" || n.estagio === "CANCELADO" ? 0
          : n.estagio === "NEGOCIACAO" ? 75
          : n.estagio === "PROPOSTA_ENVIADA" ? 55
          : n.estagio === "ORCAMENTO" ? 35
          : 20,
        contatos: {
          create: (contatoPorEmpresa.get(n.empresa) ?? []).map((cid, j) => ({
            contatoId: cid,
            principal: j === 0,
          })),
        },
        disciplinas: {
          create: cats.slice(0, nDisc).map((c) => ({
            disciplinaId: c.id,
            valor: Math.round(n.valor / Math.max(nDisc, 1)),
          })),
        },
      },
    });
    if (n.acaoEmDias !== undefined) {
      await criarAcao(`${P}a-n${i}`, "NEGOCIACAO", n.id, n.titulo, n.acaoEmDias, resp(i));
    }
  }

  const resumo = {
    clientes: EMPRESAS.length,
    contatos: EMPRESAS.length * 2,
    parceiros: PARCEIROS.length,
    campanhas: CAMPANHAS.length,
    leads: LEADS.length,
    negociacoes: NEGOCIACOES.length,
    acoes:
      LEADS.filter((l) => l.acaoEmDias !== undefined).length +
      NEGOCIACOES.filter((n) => n.acaoEmDias !== undefined).length,
  };
  console.log("Seed sintético da Fase 2 criado:");
  for (const [k, v] of Object.entries(resumo)) console.log(`  ${k}: ${v}`);
  console.log(
    `\n  ${LEADS.filter((l) => l.acaoEmDias === undefined).length} prospecção(ões) e ` +
      `${NEGOCIACOES.filter((n) => n.acaoEmDias === undefined).length} negociação(ões) SEM próxima ação ` +
      `(alimentam a consulta da F2.10)`,
  );
  console.log(
    `  ${[...LEADS, ...NEGOCIACOES].filter((x) => (x.acaoEmDias ?? 0) < 0).length} com follow-up VENCIDO ` +
      `(alimentam o frescor da F2.9)`,
  );
}

async function criarAcao(
  id: string,
  entidadeTipo: "LEAD" | "NEGOCIACAO",
  entidadeId: string,
  titulo: string,
  emQuantosDias: number,
  criadorId: string,
) {
  const TIPOS = ["LIGACAO", "WHATSAPP", "EMAIL", "REUNIAO", "FOLLOW_UP", "ENVIAR_PROPOSTA"] as const;
  await prisma.compromisso.create({
    data: {
      id,
      titulo: `Follow-up: ${titulo}`,
      inicio: emDias(emQuantosDias),
      criadorId,
      entidadeTipo,
      entidadeId,
      tipo: TIPOS[Math.abs(emQuantosDias) % TIPOS.length],
      participantes: { create: [{ userId: criadorId, confirmado: true }] },
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
