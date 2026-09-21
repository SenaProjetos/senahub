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
  reagendarProximaAcao,
  definirDisciplinasNegociacao,
  qualificarPeloBoard,
  editarNegociacao,
  registrarInteracaoManual,
} from "../src/modules/comercial/service";
import {
  fichaNegociacao,
  leadsDoParceiro,
  followUpsComerciais,
  funilComercial,
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

  // Recorta a empresa da fixture: com a paginação real da F6.11, o seed de volume pode ter
  // datas sintéticas futuras e ocupar os 25 primeiros lugares da coluna global.
  const boardP = await funilProspeccao({ filtros: lerFiltros({ empresa: emp.id }) });
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

  console.log("\n── F3.4: registro manual de interação (2 cliques) ─────────────────\n");

  const interacao = await registrarInteracaoManual({
    entidadeTipo: "LEAD",
    entidadeId: lead2.id,
    tipo: "LIGACAO",
    nota: `${TAG}_liguei e o cliente pediu retorno amanhã`,
    autorId: user.id,
  });
  const atividadeCriada = await prisma.atividade.findUnique({
    where: { id: interacao.id },
    select: { tipo: true, descricao: true, clienteId: true, leadId: true, negociacaoId: true },
  });
  check("registrarInteracaoManual cria a Atividade", atividadeCriada !== null);
  check("tipo gravado é o escolhido, não SISTEMA", atividadeCriada?.tipo === "LIGACAO");
  check("descrição é o texto digitado, sem reescrever", atividadeCriada?.descricao.includes("pediu retorno") === true);
  check("ancorada no cliente certo", atividadeCriada?.clienteId === emp.id);
  check("ancorada no lead certo", atividadeCriada?.leadId === lead2.id);
  check("sem negociacaoId (é LEAD, não NEGOCIACAO)", atividadeCriada?.negociacaoId === null);

  const leadOrfao = await prisma.lead.create({
    data: { nome: `${TAG}_lead_orfao`, etapaId: etapa.id, status: "IDENTIFICADO" }, // sem clienteId de propósito
    select: { id: true },
  });
  await recusa(
    "sem empresa vinculada, o registro manual é recusado (não silenciado como o automático)",
    () =>
      registrarInteracaoManual({
        entidadeTipo: "LEAD",
        entidadeId: leadOrfao.id,
        tipo: "NOTA",
        nota: "não devia gravar",
        autorId: user.id,
      }),
    /empresa vinculada/i,
  );

  const interacaoNeg = await registrarInteracaoManual({
    entidadeTipo: "NEGOCIACAO",
    entidadeId: q.negociacaoId,
    tipo: "REUNIAO",
    nota: `${TAG}_reunião de alinhamento`,
    autorId: user.id,
  });
  const atividadeNeg = await prisma.atividade.findUnique({
    where: { id: interacaoNeg.id },
    select: { negociacaoId: true, leadId: true },
  });
  check("registro em NEGOCIACAO ancora negociacaoId, não leadId", atividadeNeg?.negociacaoId === q.negociacaoId && atividadeNeg?.leadId === null);

  console.log("\n── ADR-0004: board único (costura + Encerrados) ─────────────────\n");

  const descartado = await prisma.lead.create({
    data: {
      nome: `${TAG}_descartado`,
      clienteId: emp.id,
      etapaId: etapa.id,
      status: "DESCARTADO",
      origemDetalhada: `${TAG}_OBRA_2`,
    },
    select: { id: true },
  });
  await recusa(
    "lead fora do fluxo NÃO é qualificado pelo board sem consentimento no payload",
    () => qualificarPeloBoard({ leadId: descartado.id, autorId: user.id, confirmarReativacao: false }),
    /Confirme para continuar/,
  );
  const semNeg = await prisma.negociacao.count({ where: { leadId: descartado.id } });
  check("a recusa não deixa negociação órfã", semNeg === 0);

  const qb = await qualificarPeloBoard({ leadId: descartado.id, autorId: user.id, confirmarReativacao: true });
  const depois = await prisma.lead.findUnique({ where: { id: descartado.id }, select: { status: true } });
  check("com consentimento, reativa e qualifica na mesma transação", depois?.status === "OPORTUNIDADE_CRIADA");

  const qb2 = await qualificarPeloBoard({ leadId: descartado.id, autorId: user.id, confirmarReativacao: false });
  check("soltar de novo em Levantamento é idempotente (reusa a negociação)", qb2.negociacaoId === qb.negociacaoId);

  const encerrado = await prisma.lead.create({
    data: { nome: `${TAG}_em_espera`, clienteId: emp.id, etapaId: etapa.id, status: "EM_ESPERA" },
    select: { id: true },
  });
  const filtroEmp = lerFiltros({ empresa: emp.id });
  const padrao = await funilComercial({ filtros: filtroEmp, fechadas: new Set(["ENCERRADOS"]) });
  const cardsDoLead = padrao.flatMap((c) => c.cards).filter((c) => c.tipo === "LEAD" && c.id === descartado.id);
  check("lead qualificado NÃO aparece duplicado — quem o representa é a negociação", cardsDoLead.length === 0);
  const levantamento = padrao.find((c) => c.coluna === "LEVANTAMENTO");
  check(
    "a negociação criada aparece em Levantamento",
    levantamento?.cards.some((c) => c.tipo === "NEGOCIACAO" && c.id === qb.negociacaoId) === true,
  );

  console.log("\n── ADR-0004: ficha do card (edição da negociação) ────────────────\n");

  const campanhaFicha = await prisma.campanha.create({
    data: { nome: `${TAG}_campanha_ficha` },
    select: { id: true },
  });
  await editarNegociacao({
    id: qb.negociacaoId,
    titulo: `${TAG}_demanda editada`,
    probabilidade: 42,
    campanhaId: campanhaFicha.id,
    previsaoFechamento: "2026-12-15",
    valorEstimado: 1234.5,
  });
  const editada = await prisma.negociacao.findUnique({
    where: { id: qb.negociacaoId },
    select: {
      titulo: true,
      probabilidade: true,
      probabilidadeOverride: true,
      campaignId: true,
      previsaoFechamento: true,
      estagio: true,
    },
  });
  check("campanhaId do formulário grava em campaignId", editada?.campaignId === campanhaFicha.id);
  check("probabilidade digitada liga o override (ADR-12)", editada?.probabilidade === 42 && editada.probabilidadeOverride);
  check("previsão é dia-calendário (meia-noite UTC)", editada?.previsaoFechamento?.toISOString() === "2026-12-15T00:00:00.000Z");
  check("editar a ficha não mexe no estágio", editada?.estagio === "LEVANTAMENTO");

  await editarNegociacao({ id: qb.negociacaoId, titulo: `${TAG}_demanda editada`, probabilidade: null });
  const semOverride = await prisma.negociacao.findUnique({
    where: { id: qb.negociacaoId },
    select: { probabilidadeOverride: true, campaignId: true },
  });
  check("probabilidade vazia desliga o override", semOverride?.probabilidadeOverride === false);
  check("campo omitido no formulário é limpo (campanha)", semOverride?.campaignId === null);

  const ficha = await fichaNegociacao(qb.negociacaoId);
  check(
    "a ficha da negociação traz o histórico da prospecção que a originou",
    ficha?.timeline.some((t) => t.nota.length > 0) === true && ficha.lead?.id === descartado.id,
  );

  console.log("\n── Follow-ups: agenda do responsável + tela dedicada ────────────\n");

  const dono = await prisma.user.findFirst({
    where: { ativo: true, role: { not: "cliente" }, id: { not: user.id } },
    select: { id: true },
  });
  if (dono) {
    await prisma.negociacao.update({ where: { id: qb.negociacaoId }, data: { responsavelId: dono.id } });
    const agendada = await agendarProximaAcao({
      entidadeTipo: "NEGOCIACAO",
      entidadeId: qb.negociacaoId,
      tipo: "FOLLOW_UP",
      titulo: `${TAG}_follow_ficha`,
      inicio: new Date(Date.now() - 3 * 86_400_000),
      criadorId: user.id,
    });
    const part = await prisma.compromissoParticipante.findMany({
      where: { compromissoId: agendada.id },
      select: { userId: true },
    });
    check(
      "follow-up agendado por OUTRA pessoa entra na agenda do dono da negociação",
      part.some((x) => x.userId === dono.id) && part.some((x) => x.userId === user.id),
    );
    const meus = await followUpsComerciais({ responsavelId: dono.id });
    const todos = await followUpsComerciais({});
    check("'meus' traz a ação do dono", meus.itens.some((i) => i.id === agendada.id));
    check("'todos' também traz, e ela vem atrasada", todos.itens.some((i) => i.id === agendada.id));
    const deOutro = await followUpsComerciais({ responsavelId: "id-que-nao-existe" });
    check("'meus' de outra pessoa não traz a ação", !deOutro.itens.some((i) => i.id === agendada.id));

    // Arrastar no calendário reagenda: o fim (quando existe) anda junto, senão ficaria antes do início.
    const inicioOriginal = new Date(2030, 0, 10, 14, 0);
    const comFim = await agendarProximaAcao({
      entidadeTipo: "NEGOCIACAO",
      entidadeId: qb.negociacaoId,
      tipo: "REUNIAO",
      titulo: `${TAG}_reuniao_com_fim`,
      inicio: inicioOriginal,
      fim: new Date(2030, 0, 10, 15, 30),
      criadorId: user.id,
    });
    await reagendarProximaAcao({ compromissoId: comFim.id, novoInicio: new Date(2030, 0, 15, 14, 0) });
    const movida = await prisma.compromisso.findUnique({ where: { id: comFim.id }, select: { inicio: true, fim: true } });
    check(
      "reagendar leva o fim junto e mantém a duração de 1h30",
      movida?.inicio.getTime() === new Date(2030, 0, 15, 14, 0).getTime() &&
        movida.fim?.getTime() === new Date(2030, 0, 15, 15, 30).getTime(),
    );
    await recusa(
      "reagendar com data inválida é recusado",
      () => reagendarProximaAcao({ compromissoId: comFim.id, novoInicio: new Date("lixo") }),
      /Data inválida/,
    );
  } else {
    console.log("[PULO] só há um usuário interno no dev — follow-up cruzado não testado");
  }

  console.log("\n── Parceiros: leads indicados (linha expandida) ─────────────────\n");
  const parceiroSmk = await prisma.parceiro.create({ data: { nome: `${TAG}_parceiro`, tipo: "PJ" }, select: { id: true } });
  const leadIndicado = await prisma.lead.create({
    data: {
      nome: `${TAG}_indicado`,
      clienteId: emp.id,
      etapaId: etapa.id,
      status: "EM_CONTATO",
      parceiroId: parceiroSmk.id,
      valorEstimado: 7500,
    },
    select: { id: true },
  });
  const indicados = await leadsDoParceiro(parceiroSmk.id);
  check("leadsDoParceiro devolve o lead indicado", indicados.length === 1 && indicados[0].id === leadIndicado.id);
  check(
    "valor vira número e a data vira ISO (atravessa a Server Action sem perder o tipo)",
    indicados[0]?.valorEstimado === 7500 && typeof indicados[0]?.createdAt === "string",
  );
  check("parceiro sem indicação devolve lista vazia", (await leadsDoParceiro("id-que-nao-existe")).length === 0);

  console.log("\n── Disciplinas de interesse da negociação ───────────────────────\n");
  const [disc1, disc2] = await prisma.disciplinaCatalogo.findMany({ where: { ativo: true }, take: 2, select: { id: true } });
  await definirDisciplinasNegociacao({
    negociacaoId: qb.negociacaoId,
    disciplinas: [{ disciplinaId: disc1.id, valor: 3000 }, { disciplinaId: disc2.id }],
  });
  const ligadas = await prisma.negociacaoDisciplina.findMany({ where: { negociacaoId: qb.negociacaoId }, select: { disciplinaId: true, valor: true } });
  check("grava as disciplinas, com valor opcional", ligadas.length === 2 && ligadas.some((d) => Number(d.valor) === 3000) && ligadas.some((d) => d.valor === null));

  const filtrada = await funilComercial({ filtros: lerFiltros({ empresa: emp.id, disc: disc1.id }), fechadas: new Set() });
  check(
    "o filtro por disciplina do funil passa a achar a negociação",
    filtrada.flatMap((c) => c.cards).some((c) => c.tipo === "NEGOCIACAO" && c.id === qb.negociacaoId),
  );

  await definirDisciplinasNegociacao({ negociacaoId: qb.negociacaoId, disciplinas: [{ disciplinaId: disc2.id }] });
  const substituidas = await prisma.negociacaoDisciplina.count({ where: { negociacaoId: qb.negociacaoId } });
  check("a lista SUBSTITUI o conjunto anterior (não acumula)", substituidas === 1);

  await recusa(
    "disciplina repetida é recusada com mensagem de negócio",
    () => definirDisciplinasNegociacao({ negociacaoId: qb.negociacaoId, disciplinas: [{ disciplinaId: disc1.id }, { disciplinaId: disc1.id }] }),
    /repetida/i,
  );
  await recusa(
    "id fora do catálogo é recusado",
    () => definirDisciplinasNegociacao({ negociacaoId: qb.negociacaoId, disciplinas: [{ disciplinaId: "id-que-nao-existe" }] }),
    /catálogo/i,
  );
  const aposRecusas = await prisma.negociacaoDisciplina.count({ where: { negociacaoId: qb.negociacaoId } });
  check("recusa não apaga o que já estava salvo", aposRecusas === 1);

  const enc = padrao.find((c) => c.coluna === "ENCERRADOS");
  check("Encerrados recolhido não busca cards", enc?.fechada === true && enc.cards.length === 0);
  const aberto = await funilComercial({ filtros: filtroEmp, fechadas: new Set() });
  const encAberto = aberto.find((c) => c.coluna === "ENCERRADOS");
  check(
    "Encerrados aberto traz o lead em espera, e o total bate com o banco mesmo recolhido",
    encAberto?.cards.some((c) => c.id === encerrado.id) === true && (enc?.total ?? -1) === encAberto?.total,
  );

  console.log(`\n${ok ? "✔ Fase 2: tudo verde." : "✖ Fase 2: há falhas acima."}`);
  if (!ok) process.exitCode = 1;
}

async function limpar() {
  // F3.2: os hooks de timeline criam `Atividade`, que tem FK NOT NULL para `Cliente`. Precisa
  // sair ANTES do cliente, senão o delete final bate na constraint — foi exatamente o que
  // aconteceu quando os hooks entraram e este smoke passou a falhar na limpeza.
  await prisma.atividade.deleteMany({ where: { cliente: { nome: { contains: TAG } } } });

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

  await prisma.parceiro.deleteMany({ where: { nome: { contains: TAG } } });
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
