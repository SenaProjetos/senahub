/**
 * Smoke da Fase 2 do CRM (F2.20): exercita a jornada inteira contra o banco de dev.
 *
 * Por que existe: a Fase 2 tem muita regra que só se prova com Prisma real — transição de
 * estágio recusada ANTES de tocar o banco, `leadId @unique` barrando dupla qualificação, o
 * índice parcial da F2.5 recusando prospecção duplicada, e a próxima ação saindo da fila quando
 * concluída. Nada disso é alcançável por `vitest` (que roda sem banco) nem por `tsc`.
 *
 * Os testes puros cobrem as REGRAS (`jornada.test.ts`, `prospeccao.test.ts`, `frescor.test.ts`);
 * este smoke cobre a FIAÇÃO — que as regras estão de fato ligadas ao banco e às actions.
 *
 * ⚠️ NUNCA RODAR CONTRA PRODUÇÃO. Cria e apaga leads, negociações, empresas e compromissos.
 * Tudo com prefixo `SMKF2_`, e a limpeza roda no `finally` — mas em produção o risco não
 * compensa, e a F2.18 já é o caminho certo para tocar dado real.
 *
 * Uso: npm run smoke:crm-fase2
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  agendarProximaAcao,
  concluirProximaAcao,
  moverEstagio,
  moverProspeccao,
  qualificarProspeccao,
} from "../src/modules/comercial/service";
import {
  funilNegociacao,
  funilProspeccao,
  prospeccoesSemProximaAcao,
  proximasAcoesDe,
} from "../src/modules/comercial/queries";
import { lerFiltros } from "../src/modules/comercial/filtros";

const TAG = `SMKF2_${Date.now()}`;

async function main() {
  let ok = true;
  const check = (nome: string, cond: boolean, detalhe = "") => {
    console.log(`${cond ? "[OK]  " : "[FALHA]"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
    if (!cond) ok = false;
  };
  /** Espera que `fn` seja recusada com mensagem de negócio. */
  const recusa = async (nome: string, fn: () => Promise<unknown>, trecho: RegExp) => {
    try {
      await fn();
      check(nome, false, "PASSOU quando deveria ser recusado");
    } catch (e) {
      const msg = (e as Error).message ?? "";
      check(nome, trecho.test(msg), `"${msg.slice(0, 70)}"`);
    }
  };

  const user = await prisma.user.findFirst({ where: { role: "admin", ativo: true }, select: { id: true } });
  const etapa = await prisma.funilEtapa.findFirst({ select: { id: true } });
  const motivoSimples = await prisma.motivoPerda.findFirst({ where: { exigeConcorrente: false }, select: { id: true } });
  const motivoConcorrente = await prisma.motivoPerda.findFirst({ where: { exigeConcorrente: true }, select: { id: true } });
  if (!user || !etapa || !motivoSimples || !motivoConcorrente) {
    throw new Error("dev incompleto — rode `npm run db:seed`.");
  }

  const emp = await prisma.cliente.create({ data: { nome: `${TAG}_Empresa`, tipo: "PJ" }, select: { id: true } });
  const contato = await prisma.contatoCliente.create({
    data: { clienteId: emp.id, nome: `${TAG}_Contato`, telefone: "81999999999", principal: true },
    select: { id: true },
  });

  console.log("\n── F2.3/F2.13: prospecção e movimento ────────────────────────────\n");

  const lead = await prisma.lead.create({
    data: {
      nome: `${TAG}_lead`,
      clienteId: emp.id,
      etapaId: etapa.id,
      status: "IDENTIFICADO",
      origemDetalhada: `${TAG}_OBRA`,
      valorEstimado: 50000,
      temperatura: "MORNO",
      contatos: { create: [{ contatoId: contato.id, principal: true }] },
    },
    select: { id: true },
  });
  check("lead nasce com status de prospecção", true, "IDENTIFICADO");

  const boardP = await funilProspeccao();
  const naColuna = boardP.find((c) => c.status === "IDENTIFICADO")?.leads.some((l) => l.id === lead.id);
  check("board de prospecção mostra o lead na coluna certa", naColuna === true);

  await moverProspeccao({ leadId: lead.id, para: "EM_CONTATO" });
  check("moverProspeccao avança o status", true, "IDENTIFICADO → EM_CONTATO");

  await recusa("mover para o mesmo status é recusado", () =>
    moverProspeccao({ leadId: lead.id, para: "EM_CONTATO" }), /já está/i);

  console.log("\n── F2.5: uma prospecção ativa por empresa+campanha ────────────────\n");

  // Sem campanha o índice foi REMOVIDO (ADR-02 revisado em 2026-08-21), então isto agora PASSA.
  const lead2 = await prisma.lead.create({
    data: { nome: `${TAG}_lead2`, clienteId: emp.id, etapaId: etapa.id, status: "IDENTIFICADO" },
    select: { id: true },
  });
  check("2ª prospecção ativa na mesma empresa SEM campanha é permitida", true, "ADR-02 revisado");

  const camp = await prisma.campanha.create({ data: { nome: `${TAG}_camp` }, select: { id: true } });
  await prisma.lead.update({ where: { id: lead2.id }, data: { campaignId: camp.id } });
  await recusa(
    "2ª prospecção ativa na MESMA campanha é recusada",
    async () => {
      const l3 = await prisma.lead.create({
        data: { nome: `${TAG}_l3`, clienteId: emp.id, etapaId: etapa.id, status: "IDENTIFICADO", campaignId: camp.id },
      });
      return l3;
    },
    /Unique|unique|prospeccao_ativa/,
  );

  console.log("\n── F2.8: qualificação ────────────────────────────────────────────\n");

  const q = await qualificarProspeccao({ leadId: lead.id });
  const leadDepois = await prisma.lead.findUnique({
    where: { id: lead.id },
    select: { status: true, negociacao: { select: { id: true, titulo: true, estagio: true } } },
  });
  check("lead SOBREVIVE à qualificação", leadDepois !== null);
  check("lead vai para OPORTUNIDADE_CRIADA", leadDepois?.status === "OPORTUNIDADE_CRIADA");
  check("negociação aponta de volta para o lead", leadDepois?.negociacao?.id === q.negociacaoId);
  check("título herda o empreendimento", leadDepois?.negociacao?.titulo === `${TAG}_OBRA`);

  const contatosHerdados = await prisma.negociacaoContato.count({ where: { negociacaoId: q.negociacaoId } });
  check("contatos herdados do lead", contatosHerdados === 1, `${contatosHerdados}`);

  await recusa("qualificar 2× é recusado", () => qualificarProspeccao({ leadId: lead.id }), /já foi qualificada/i);
  await recusa(
    "prospecção já qualificada não se move mais",
    () => moverProspeccao({ leadId: lead.id, para: "EM_CONTATO" }),
    /já virou negociação/i,
  );

  console.log("\n── F2.6/F2.7: jornada da negociação ──────────────────────────────\n");

  await recusa(
    "atalho para CONTRATADO é recusado (criaria projeto sem proposta)",
    () => moverEstagio({ negociacaoId: q.negociacaoId, para: "CONTRATADO" }),
    /Não é possível mover/i,
  );

  await moverEstagio({ negociacaoId: q.negociacaoId, para: "ORCAMENTO" });
  const apos1 = await prisma.negociacao.findUnique({ where: { id: q.negociacaoId }, select: { probabilidade: true } });
  check("probabilidade acompanha o estágio", apos1?.probabilidade === 35, `${apos1?.probabilidade}% em ORCAMENTO`);

  await moverEstagio({ negociacaoId: q.negociacaoId, para: "PROPOSTA_ENVIADA" });
  await recusa(
    "PERDIDO sem motivo é recusado",
    () => moverEstagio({ negociacaoId: q.negociacaoId, para: "PERDIDO" }),
    /motivo da perda/i,
  );
  await recusa(
    "motivo que exige concorrente sem o nome é recusado",
    () => moverEstagio({ negociacaoId: q.negociacaoId, para: "PERDIDO", motivoPerdaId: motivoConcorrente.id }),
    /concorrente/i,
  );

  await moverEstagio({ negociacaoId: q.negociacaoId, para: "PERDIDO", motivoPerdaId: motivoSimples.id });
  const perdida = await prisma.negociacao.findUnique({
    where: { id: q.negociacaoId },
    select: { estagio: true, probabilidade: true, dataFechamento: true, motivoPerdaId: true },
  });
  check("PERDIDO zera a probabilidade", perdida?.probabilidade === 0);
  check("PERDIDO grava dataFechamento", perdida?.dataFechamento != null);
  check("PERDIDO grava o motivo", perdida?.motivoPerdaId === motivoSimples.id);

  await moverEstagio({ negociacaoId: q.negociacaoId, para: "NEGOCIACAO" });
  const reaberta = await prisma.negociacao.findUnique({
    where: { id: q.negociacaoId },
    select: { estagio: true, dataFechamento: true, motivoPerdaId: true, probabilidade: true },
  });
  check("reabrir volta ao funil (ADR-10)", reaberta?.estagio === "NEGOCIACAO");
  check("reabrir LIMPA dataFechamento", reaberta?.dataFechamento === null, "senão contaria como fechada nos relatórios");
  check("reabrir LIMPA o motivo da perda", reaberta?.motivoPerdaId === null);
  check("reabrir recalcula a probabilidade", reaberta?.probabilidade === 75);

  console.log("\n── F2.10: próxima ação ancorada ──────────────────────────────────\n");

  const semAcaoAntes = (await prospeccoesSemProximaAcao()).some((l) => l.id === lead2.id);
  check("lead sem ação aparece na fila de cobrança", semAcaoAntes === true);

  const acao = await agendarProximaAcao({
    entidadeTipo: "LEAD",
    entidadeId: lead2.id,
    tipo: "LIGACAO",
    titulo: `${TAG}_ligar`,
    inicio: new Date(Date.now() + 86_400_000),
    criadorId: user.id,
  });
  const semAcaoDepois = (await prospeccoesSemProximaAcao()).some((l) => l.id === lead2.id);
  check("agendar tira o lead da fila", semAcaoDepois === false);

  const acoes = await proximasAcoesDe("LEAD", lead2.id);
  check("próxima ação é consultável POR QUERY", acoes.length === 1 && acoes[0].tipo === "LIGACAO");

  await concluirProximaAcao({ compromissoId: acao.id, userId: user.id, quando: new Date() });
  const voltouAFila = (await prospeccoesSemProximaAcao()).some((l) => l.id === lead2.id);
  check("concluir devolve o lead à fila", voltouAFila === true);
  await recusa("concluir 2× é recusado", () =>
    concluirProximaAcao({ compromissoId: acao.id, userId: user.id, quando: new Date() }), /já foi concluída/i);

  console.log("\n── F2.14/F2.15: board e filtros ──────────────────────────────────\n");

  const boardN = await funilNegociacao({});
  const totalBoard = boardN.reduce((s, c) => s + c.total, 0);
  const totalBanco = await prisma.negociacao.count();
  check("contador do board bate com o banco", totalBoard === totalBanco, `${totalBoard} vs ${totalBanco}`);

  const filtrado = await funilNegociacao({ filtros: lerFiltros({ empresa: emp.id }) });
  const doFiltro = filtrado.reduce((s, c) => s + c.total, 0);
  const noBanco = await prisma.negociacao.count({ where: { clienteId: emp.id } });
  check("filtro por empresa recorta certo", doFiltro === noBanco, `${doFiltro} vs ${noBanco}`);

  const invalido = await funilNegociacao({ filtros: lerFiltros({ temp: "BANANA" }) });
  check(
    "filtro inválido na URL não quebra nem filtra",
    invalido.reduce((s, c) => s + c.total, 0) === totalBanco,
  );

  console.log(`\n${ok ? "✔ Fase 2: tudo verde." : "✖ Fase 2: há falhas acima."}`);
  if (!ok) process.exitCode = 1;
}

async function limpar() {
  const negs = await prisma.negociacao.findMany({
    where: { OR: [{ titulo: { contains: TAG } }, { cliente: { nome: { contains: TAG } } }] },
    select: { id: true },
  });
  const ids = negs.map((n) => n.id);
  await prisma.negociacaoContato.deleteMany({ where: { negociacaoId: { in: ids } } });
  await prisma.negociacaoDisciplina.deleteMany({ where: { negociacaoId: { in: ids } } });
  await prisma.negociacao.deleteMany({ where: { id: { in: ids } } });

  const comps = await prisma.compromisso.findMany({ where: { titulo: { contains: TAG } }, select: { id: true } });
  await prisma.compromissoParticipante.deleteMany({ where: { compromissoId: { in: comps.map((c) => c.id) } } });
  await prisma.compromisso.deleteMany({ where: { id: { in: comps.map((c) => c.id) } } });

  const leads = await prisma.lead.findMany({ where: { nome: { contains: TAG } }, select: { id: true } });
  await prisma.leadContato.deleteMany({ where: { leadId: { in: leads.map((l) => l.id) } } });
  await prisma.lead.deleteMany({ where: { id: { in: leads.map((l) => l.id) } } });

  await prisma.campanha.deleteMany({ where: { nome: { contains: TAG } } });
  await prisma.contatoCliente.deleteMany({ where: { nome: { contains: TAG } } });
  await prisma.cliente.deleteMany({ where: { nome: { contains: TAG } } });
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
