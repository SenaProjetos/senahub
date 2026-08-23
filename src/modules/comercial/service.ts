import "server-only";

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/with-action";
import { notificar, notificarMuitos } from "@/lib/notificar";
import { whereAudiencia } from "@/lib/audiencias";
import { proximoCodigoProjeto } from "@/modules/projetos/numbering";
import { ensureCanaisProjeto } from "@/modules/chat/service";
import { notificarNovosMembros } from "@/lib/socket";
import { formatarNumeroProposta } from "@/modules/comercial/numeracao";
import { disciplinasDeItens } from "@/modules/comercial/disciplinas";
import type { SalvarPropostaInput } from "@/modules/comercial/schemas";
import type {
  EstagioNegociacao,
  StatusProspeccao,
  StatusProposta,
  TipoAncoraCompromisso,
  TipoAtividade,
  TipoProximaAcao,
} from "@/generated/prisma/client";
import {
  probabilidadeDe,
  validarMovimento,
  type TabelaProbabilidade,
} from "@/modules/comercial/jornada";
import { calcularValoresVersao, proximoNumeroVersao, percentualDesconto } from "@/modules/comercial/versoes";
import { isoParaDataValidade } from "@/modules/comercial/validade";
import { getConfigComercial } from "@/modules/comercial/config/queries";
import { exigeJustificativaDesconto } from "@/modules/comercial/config/padroes";
import { calcularStatusComercial } from "@/modules/comercial/status";
import { arquivarPdfDaVersao } from "@/modules/comercial/pdf-proposta";
import {
  validarQualificacao,
  validarMovimentoProspeccao,
  STATUS_PROSPECCAO_ATIVOS,
  podeQualificar,
  STATUS_PROSPECCAO_LABEL,
} from "@/modules/comercial/prospeccao";
import { tipoAtividadeDe } from "@/modules/comercial/atividade";
import { descreverEvento, type EventoAtividade } from "@/modules/comercial/atividade-eventos";
import { TIPO_PROXIMA_ACAO_LABEL } from "@/modules/agenda/proxima-acao";
import { podeAbordar } from "@/modules/comercial/lgpd";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Lógica de negócio das propostas, fora do `defineAction` (F1.3, docs/crm/04-plano-fases.md).
 *
 * Extraída de `actions.ts` por MOVIMENTAÇÃO LITERAL — nenhuma regra foi alterada no processo.
 * `actions.ts` continua sendo o único lugar com sessão/permissão/Zod/auditoria; aqui mora só o
 * que acontece depois disso, para poder ser chamado por jobs e exercitado por smoke sem HTTP.
 *
 * Segue a variante COM I/O do padrão de service do projeto (como `modules/coordenacao/service.ts`),
 * e mantém `ActionError` sendo lançado — igual a `modules/ferramentas`. Converter para resultado
 * tipado transformaria uma movimentação em reescrita.
 */

/**
 * Reserva o próximo número da proposta DENTRO da transação recebida. O contador
 * (`PropostaSequencia`) é estado compartilhado e o incremento precisa da mesma transação de quem
 * cria a proposta — por isso recebe `tx` e não abre a sua própria.
 */
export async function proximoNumeroProposta(tx: Prisma.TransactionClient) {
  const ano = new Date().getFullYear();
  const seq = await tx.propostaSequencia.upsert({
    where: { ano },
    create: { ano, ultimo: 1 },
    update: { ultimo: { increment: 1 } },
  });
  return {
    ano,
    sequencial: seq.ultimo,
    numero: formatarNumeroProposta(ano, seq.ultimo),
  };
}

/**
 * Cria uma proposta AVULSA (não a partir de um lead — esse caminho é `criarPropostaDeLead`,
 * logo abaixo), a partir de um cliente e de uma negociação já escolhidos na tela.
 *
 * **F5.3 — `negociacaoId` é obrigatório e é validado aqui, não só no Zod.** O schema garante
 * que a string não é vazia; esta função garante que a negociação EXISTE e é DAQUELE cliente —
 * sem isto, um Select mal montado (ou um payload editado à mão) poderia mandar a negociação de
 * OUTRA empresa, e a proposta nasceria apontando "de onde veio" para o negócio errado.
 */
export async function criarProposta(
  input: { titulo: string; clienteId: string; negociacaoId: string },
  autorId: string,
) {
  const negociacao = await prisma.negociacao.findUnique({
    where: { id: input.negociacaoId },
    select: { id: true, clienteId: true },
  });
  if (!negociacao) throw new ActionError("Negociação não encontrada.");
  if (negociacao.clienteId !== input.clienteId) {
    throw new ActionError("Esta negociação não é desta empresa.");
  }

  return prisma.$transaction(async (tx) => {
    const { ano, sequencial, numero } = await proximoNumeroProposta(tx);
    return tx.proposta.create({
      data: {
        ano,
        sequencial,
        numero,
        titulo: input.titulo,
        clienteId: input.clienteId,
        negociacaoId: input.negociacaoId,
        token: randomBytes(18).toString("hex"),
        autorId,
      },
    });
  });
}

/**
 * Muda o status "de vitrine" da proposta — o vai-e-vem editorial (`rascunho` ↔ `enviada` ↔
 * `em_negociacao` ↔ `recusada`), NUNCA o aceite: `aceita` só chega por `aceitarProposta`, que
 * gera o projeto na mesma transação (F5.9). É a mesma separação que `Negociacao` tem entre
 * `moverEstagio` (jornada) e o aceite criando `CONTRATADO` por um caminho próprio.
 *
 * **F5.5 — a única transição bloqueada é sair de `aceita`.** Uma proposta aceita é imutável
 * (`salvarProposta` já recusa editar itens/condições dela); esta function fecha a MESMA regra
 * do lado do status — sem isto, `mudarStatusProposta` conseguiria "desaceitar" uma proposta que
 * já virou projeto, um estado que nada mais no sistema sabe desfazer. Fora isso, permissivo de
 * propósito: `enviada → rascunho` (puxar de volta pra editar) e `em_negociacao → enviada`
 * (reenviar) são idas e vindas legítimas — travar demais aqui repetiria o erro que o ADR-02 já
 * documentou para `Negociacao`.
 */
export async function mudarStatusProposta(
  input: { id: string; status: Exclude<StatusProposta, "aceita"> },
  autorId: string,
): Promise<{ id: string }> {
  const atual = await prisma.proposta.findUnique({ where: { id: input.id }, select: { status: true } });
  if (!atual) throw new ActionError("Proposta não encontrada.");
  if (atual.status === "aceita") {
    throw new ActionError("Proposta aceita não pode mudar de status — ela já virou projeto.");
  }

  const p = await prisma.proposta.update({
    where: { id: input.id },
    data: { status: input.status, enviadaEm: input.status === "enviada" ? new Date() : undefined },
    select: { id: true, numero: true, clienteId: true },
  });

  // F3.2 — só "enviada" vira evento. Rascunho/em_negociacao/recusada são idas e vindas de
  // edição; encher a timeline com elas afogaria os eventos que importam.
  if (input.status === "enviada") {
    await registrarAtividade(
      { evento: "PROPOSTA_ENVIADA", numero: p.numero, porEmail: false },
      { autorId, clienteId: p.clienteId, propostaId: p.id },
    );
    // F5.13 — congela o PDF do que está sendo enviado. Nunca lança (ver docblock do módulo): o
    // envio não pode falhar por causa do arquivo.
    await arquivarPdfDaVersao(p.id);
  }

  return { id: p.id };
}

/**
 * Cria uma proposta partindo de um lead. Garante o cliente (converte o lead se ainda não tiver
 * um), garante uma negociação (F5.3, ADR-21 item 5) e vincula a proposta aos dois — assim o
 * funil e a ficha do lead passam a listar suas propostas.
 *
 * ── `negociacaoId` deixou de ser opcional na proposta (F5.3) ─────────────────────────────────
 * Este é o caminho que teria quebrado com a regra nova sem a auto-qualificação: "Nova proposta"
 * na tela do lead sempre funcionou com um clique. `garantirNegociacaoParaProposta` resolve os
 * 3 casos (já tem negociação / qualifica direto / fora do fluxo pede confirmação) DENTRO desta
 * mesma transação — nunca duas transações independentes, que deixariam negociação órfã se o
 * passo seguinte falhasse.
 *
 * Devolve `criouCliente` para o chamador decidir se revalida `/clientes`.
 */
export async function criarPropostaDeLead(
  input: { leadId: string; titulo: string; confirmarReativacao?: boolean },
  autorId: string,
) {
  const lead = await prisma.lead.findUnique({
    where: { id: input.leadId },
    include: { contatos: { select: { contatoId: true, principal: true } } },
  });
  if (!lead) throw new ActionError("Lead não encontrado.");

  const { proposta, criouCliente } = await prisma.$transaction(async (tx) => {
    // Garante um cliente: converte o lead se ainda não tiver.
    let clienteId = lead.clienteId;
    let criouCliente = false;
    if (!clienteId) {
      const cliente = await tx.cliente.create({
        data: {
          tipo: "PJ",
          nome: lead.nome,
          email: lead.email,
          telefone: lead.telefone,
          observacoes: lead.observacoes,
        },
      });
      clienteId = cliente.id;
      criouCliente = true;
      await tx.lead.update({ where: { id: lead.id }, data: { clienteId } });
    }

    // F5.3 — garante a negociação ANTES de criar a proposta, com o `clienteId` já resolvido
    // (pode ter acabado de nascer 3 linhas acima).
    const negociacaoId = await garantirNegociacaoParaProposta(
      tx,
      { ...lead, clienteId },
      { autorId, confirmarReativacao: input.confirmarReativacao ?? false },
    );

    const { ano, sequencial, numero } = await proximoNumeroProposta(tx);
    const proposta = await tx.proposta.create({
      data: {
        ano,
        sequencial,
        numero,
        titulo: input.titulo,
        clienteId,
        leadId: lead.id,
        negociacaoId,
        token: randomBytes(18).toString("hex"),
        autorId,
      },
    });
    // F3.2 — dentro da transação. Quando o cliente nasce aqui (lead ainda sem empresa), o
    // evento de "empresa cadastrada" também entra: é a primeira coisa que aconteceu com ela, e
    // sem isso a Empresa 360 começaria a história pela proposta, sem dizer de onde a empresa veio.
    if (autorId) {
      if (criouCliente) {
        await registrarAtividade(
          { evento: "EMPRESA_CADASTRADA", nome: lead.nome },
          { autorId, clienteId, leadId: lead.id, tx },
        );
      }
      await registrarAtividade(
        { evento: "PROPOSTA_CRIADA", numero: proposta.numero, titulo: input.titulo },
        { autorId, clienteId, leadId: lead.id, propostaId: proposta.id, negociacaoId, tx },
      );
    }

    return { proposta, criouCliente };
  });

  return { proposta, criouCliente, leadId: lead.id };
}

/**
 * Salva itens/condições e grava versão.
 *
 * A versão guarda o `snapshot` JSON (itens e condições linha a linha, o único lugar que os tem)
 * **e**, desde a F5.4, os campos estruturados ao lado — valor, desconto, status, validade,
 * observação. Os dois não competem: o JSON é o detalhe, as colunas são o que relatório e
 * comparação leem sem parsear nada.
 *
 * ── F5.8 (Q6/ADR-19): desconto acima do limite exige justificativa ──────────────────────────
 * O limite é `ConfigSistema` (`getConfigComercial`), não uma constante — é o ÚNICO lugar do
 * módulo que ainda lia esse número sem chamador (F1.7 construiu a peça, ninguém a ligou até
 * agora). A checagem só é POSSÍVEL depois de somar os itens (`calcularValoresVersao`), por isso
 * não dá pra validar no Zod: o schema não sabe se 15% está acima do limite sem saber os itens.
 *
 * Quando exige e a justificativa vem preenchida, um `DESCONTO_JUSTIFICADO` entra na timeline —
 * evento PRÓPRIO, não afogado dentro do `PROPOSTA_REVISADA` genérico que toda revisão já
 * dispara: é uma decisão comercial que vale aparecer sozinha na Empresa 360, não escondida
 * dentro de "revisão nº 3". O `AuditLog` fica coberto de graça — `justificativaDesconto` está
 * no input validado, e `defineAction` audita o input inteiro por padrão.
 */
export async function salvarProposta(i: SalvarPropostaInput, autorId: string) {
  const p = await prisma.proposta.findUnique({
    where: { id: i.id },
    include: { versoes: { orderBy: { numero: "desc" }, take: 1 } },
  });
  if (!p) throw new ActionError("Proposta não encontrada.");
  if (p.status === "aceita") throw new ActionError("Proposta aceita não pode ser editada.");

  const snapshot = {
    titulo: i.titulo,
    areaM2: i.areaM2 ?? null,
    validade: i.validade || null,
    observacoes: i.observacoes || null,
    itens: i.itens,
    condicoes: i.condicoes,
  };

  // F5.4/F5.8 — os mesmos números do snapshot, agora em coluna. `desconto` ausente/zero vira
  // `null` dentro de `calcularValoresVersao` — `valorVersao === valorOriginal` é o estado "sem
  // desconto".
  const valores = calcularValoresVersao(i.itens, i.desconto ?? null);
  const percentual = percentualDesconto(valores);
  const justificativa = i.justificativaDesconto?.trim() || null;
  if (percentual !== null) {
    const config = await getConfigComercial();
    if (exigeJustificativaDesconto(percentual, config) && !justificativa) {
      throw new ActionError(
        `Desconto de ${percentual.toFixed(1)}% acima do limite de ${config.descontoMaxSemJustificativa}% ` +
          "exige justificativa.",
      );
    }
  }
  const numeroVersao = proximoNumeroVersao(p.versoes);

  // Resolve as disciplinas do catálogo por nome EXATO (F1.19). O que não casar grava só o texto,
  // com `disciplinaId` null — casar por aproximação apontaria o item para a disciplina errada, e
  // valor de disciplina vira pagamento de projetista.
  const catalogo = await prisma.disciplinaCatalogo.findMany({ select: { id: true, nome: true } });
  const idsPorNome = new Map(catalogo.map((d) => [d.nome, d.id]));

  await prisma.$transaction([
    prisma.proposta.update({
      where: { id: i.id },
      data: {
        titulo: i.titulo,
        areaM2: i.areaM2,
        validade: isoParaDataValidade(i.validade),
        observacoes: i.observacoes || null,
      },
    }),
    prisma.propostaItem.deleteMany({ where: { propostaId: i.id } }),
    prisma.propostaItem.createMany({
      data: i.itens.map((it, idx) => ({
        propostaId: i.id,
        // Grava o texto E resolve a FK pelo nome (F1.19). `disciplinaId` fica null quando a
        // grafia nao existe no catalogo -- estado esperado ate a consolidacao da F1.21.
        disciplinaTextoLegado: it.disciplina,
        disciplinaId: idsPorNome.get(it.disciplina) ?? null,
        descricao: it.descricao || null,
        valor: it.valor,
        ordem: idx,
      })),
    }),
    prisma.propostaCondicao.deleteMany({ where: { propostaId: i.id } }),
    prisma.propostaCondicao.createMany({
      data: i.condicoes.map((c, idx) => ({
        propostaId: i.id,
        descricao: c.descricao,
        tipo: c.tipo,
        valor: c.valor,
        ordem: idx,
      })),
    }),
    prisma.propostaVersao.create({
      data: {
        propostaId: i.id,
        numero: numeroVersao,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        autorId,
        // F5.4 — campos estruturados ao lado do snapshot.
        valorOriginal: valores.valorOriginal,
        valorVersao: valores.valorVersao,
        desconto: valores.desconto,
        // Status e envio são da PROPOSTA no momento em que a versão nasceu — não do que ela
        // virá a ser depois. É isso que faz "v2 foi salva quando já estava enviada" ser um
        // fato consultável em vez de uma inferência pela data.
        status: p.status,
        dataEnvio: p.enviadaEm,
        validade: isoParaDataValidade(i.validade),
        observacao: i.observacoes || null,
      },
    }),
  ]);

  // F3.2 — fora da transação em lote de propósito: `$transaction([...])` recebe um ARRAY de
  // promessas, não um callback com `tx`, então não há como passar o cliente transacional para
  // `registrarAtividade`. Reescrever o lote inteiro em callback só para isso seria mexer no
  // caminho da proposta (que a Fase 5 vai reescrever) por um ganho pequeno: se a timeline
  // falhar, `registrarAtividade` engole o erro e a revisão continua salva — que é o
  // comportamento desejado.
  await registrarAtividade(
    { evento: "PROPOSTA_REVISADA", numero: p.numero, versao: numeroVersao },
    { autorId, clienteId: p.clienteId, propostaId: p.id },
  );
  // F5.8 — só quando o desconto de fato passou do limite (não todo desconto com justificativa
  // preenchida à toa gera ruído na timeline).
  if (percentual !== null && justificativa) {
    const config = await getConfigComercial();
    if (exigeJustificativaDesconto(percentual, config)) {
      await registrarAtividade(
        { evento: "DESCONTO_JUSTIFICADO", numero: p.numero, percentual, justificativa },
        { autorId, clienteId: p.clienteId, propostaId: p.id },
      );
    }
  }

  return { id: i.id };
}

/**
 * ACEITE (reescrito na F5.9) — o caminho mais crítico do módulo. **Uma transação só**, fechando
 * o ciclo comercial inteiro: cria o `Projeto` com as disciplinas dos itens, marca a proposta
 * como aceita, leva a `Negociacao` a `CONTRATADO` com os valores finais, materializa o status
 * comercial da empresa e carimba a versão aceita.
 *
 * ── §8.5: os dois caminhos para "de onde veio este projeto", gravados JUNTOS ────────────────
 * `Proposta.projetoId` e `Projeto.negociacaoId` respondem à mesma pergunta por caminhos
 * diferentes. Nada no banco impede que divirjam — é a divergência silenciosa que o
 * `02-schema.md` §8.5 aponta como risco real. Aqui os dois nascem na MESMA transação, do id
 * retornado pelo `create`, nunca de um valor capturado antes: ou existem os dois, ou nenhum.
 * O smoke tem check dedicado para isso, e outro provando que uma falha no meio não deixa
 * projeto órfão.
 *
 * ── Os TRÊS eventos que a F3.2 previa ──────────────────────────────────────────────────────
 * `PROPOSTA_ACEITA`, `PROJETO_CRIADO` e — agora que o aceite conhece `Negociacao` — o
 * `ESTAGIO_ALTERADO` para `CONTRATADO`, que vem de `aplicarMovimentoEstagio`. O comentário da
 * F3.2 dizia "o terceiro evento nasce lá [na F5.9]"; nasceu.
 *
 * ⚠️ Os canais de chat e as notificações rodam FORA da transação, de propósito e como sempre
 * foi: se o fan-out falhar, o projeto continua criado e a proposta aceita. Mover para dentro
 * mudaria comportamento observável (uma falha de notificação desfaria o aceite).
 */
export async function aceitarProposta(propostaId: string, autorId?: string) {
  const p = await prisma.proposta.findUnique({
    where: { id: propostaId },
    include: {
      // `disciplina` (catalogo) entra no include para o aceite resolver o nome preferindo o
      // catalogo e caindo no texto legado (F1.19) -- ver `disciplinasDeItens`.
      itens: { orderBy: { ordem: "asc" }, include: { disciplina: { select: { nome: true } } } },
      cliente: { select: { nome: true, statusOverride: true } },
      // F5.2 — de qual negociação esta proposta nasceu. `null` nas históricas.
      negociacao: { select: { id: true, estagio: true, clienteId: true, probabilidade: true, probabilidadeOverride: true } },
      // F5.4 — a versão vigente recebe o carimbo de "foi esta que o cliente aceitou".
      versoes: { orderBy: { numero: "desc" }, take: 1, select: { id: true, numero: true } },
    },
  });
  if (!p) throw new ActionError("Proposta não encontrada.");
  if (p.status === "aceita") throw new ActionError("Proposta já aceita.");
  if (p.itens.length === 0) throw new ActionError("Adicione itens antes de aceitar.");

  // ── Validação do movimento ANTES de escrever qualquer coisa ──
  // `validarMovimento` é puro e lança mensagem de negócio; rodar aqui garante que uma negociação
  // já perdida/cancelada recusa o aceite sem ter criado projeto nenhum.
  let probabilidadeContratado = 0;
  if (p.negociacao) {
    validarMovimento({
      de: p.negociacao.estagio,
      para: "CONTRATADO",
      porAceiteDeProposta: true,
    });
    const linhas = await prisma.probabilidadeEstagio.findMany({
      select: { estagio: true, probabilidade: true },
    });
    const tabela: TabelaProbabilidade = Object.fromEntries(
      linhas.map((l) => [l.estagio, l.probabilidade]),
    );
    probabilidadeContratado = probabilidadeDe("CONTRATADO", {
      tabela,
      override: p.negociacao.probabilidadeOverride,
      atual: p.negociacao.probabilidade,
    });
  }

  const valorFinal = p.itens.reduce((s, it) => s + Number(it.valor), 0);
  const aceitaEm = new Date();

  const projeto = await prisma.$transaction(async (tx) => {
    const { ano, sequencial, codigo } = await proximoCodigoProjeto(tx);
    const projeto = await tx.projeto.create({
      data: {
        ano,
        sequencial,
        codigo,
        tipo: "particular",
        nome: p.titulo,
        clienteId: p.clienteId,
        areaM2: p.areaM2,
        // §8.5, metade 1 de 2 — a outra é o `projetoId` logo abaixo, na mesma transação.
        negociacaoId: p.negociacao?.id ?? null,
        disciplinas: {
          create: disciplinasDeItens(p.itens),
        },
      },
    });
    // §8.5, metade 2 de 2. `projeto.id` vem do RETORNO do create acima — nunca de um valor
    // montado antes da transação (o `P2003` da F2.18 nasceu exatamente desse descuido).
    await tx.proposta.update({
      where: { id: p.id },
      data: { status: "aceita", aceitaEm, projetoId: projeto.id },
    });

    // F5.4 — carimba QUAL versão o cliente aceitou. A imutabilidade em si já vem de
    // `salvarProposta`, que recusa editar proposta aceita; isto responde "aceitou qual?", que
    // o histórico não saberia dizer depois de N revisões.
    if (p.versoes[0]) {
      await tx.propostaVersao.update({
        where: { id: p.versoes[0].id },
        data: { status: "aceita", valorVersao: valorFinal },
      });
    }

    // ── Negociação → CONTRATADO, com os valores comerciais finais ──
    if (p.negociacao) {
      await tx.negociacao.update({
        where: { id: p.negociacao.id },
        // `valorNegociado` é o que de fato fechou: a soma dos itens da proposta aceita. Sem
        // isto o forecast da Fase 6 continuaria somando `valorEstimado`, que é o chute inicial.
        data: { valorNegociado: valorFinal },
      });
      await aplicarMovimentoEstagio(tx, {
        negociacao: p.negociacao,
        para: "CONTRATADO",
        probabilidade: probabilidadeContratado,
        encerra: true,
        autorId,
      });
    }

    // ── Empresa vira CLIENTE (ADR-08) ──
    // `calcularStatusComercial` existia desde a F1.5 sem nenhum chamador: o status é DERIVADO de
    // "tem proposta aceita", e até agora nada materializava isso. O override manual continua
    // vencendo — é o único caminho para EX_CLIENTE/PARCEIRO, que nunca são inferidos.
    await tx.cliente.update({
      where: { id: p.clienteId },
      data: { status: calcularStatusComercial(true, p.cliente.statusOverride) },
    });

    // F3.2 — os eventos entram na mesma transação: se qualquer etapa falhar, nem o projeto nem
    // a timeline existem. São dois aqui (o terceiro, `ESTAGIO_ALTERADO`, veio de
    // `aplicarMovimentoEstagio` acima) porque respondem a perguntas diferentes na Empresa 360:
    // "quando fechamos?" e "que obra isso virou?".
    if (autorId) {
      await registrarAtividade(
        { evento: "PROPOSTA_ACEITA", numero: p.numero },
        { autorId, clienteId: p.clienteId, propostaId: p.id, negociacaoId: p.negociacao?.id, tx },
      );
      await registrarAtividade(
        { evento: "PROJETO_CRIADO", codigo: projeto.codigo, nome: projeto.nome },
        { autorId, clienteId: p.clienteId, propostaId: p.id, negociacaoId: p.negociacao?.id, tx },
      );
    }

    return projeto;
  });

  // Canais de chat do projeto (idempotente).
  notificarNovosMembros(await ensureCanaisProjeto(projeto.id));

  const gestores = await prisma.user.findMany({
    where: whereAudiencia("gestao_operacional"),
    select: { id: true },
  });
  await notificarMuitos(
    gestores.map((g) => g.id),
    {
      titulo: "Proposta aceita — projeto criado",
      corpo: `${p.numero} (${p.cliente.nome}) virou o projeto ${projeto.codigo}.`,
      href: `/projetos/${projeto.id}`,
      tag: `proposta-${p.id}`,
    },
    { categoria: "proposta" },
  );

  return { projetoId: projeto.id, codigo: projeto.codigo };
}

// ── Timeline automática (F3.2) ───────────────────────────────────────────────────────────────
/**
 * Grava um evento automático na timeline. É o único ponto de escrita de `Atividade` vinda do
 * fluxo — o registro manual (F3.4) terá o seu.
 *
 * **Nunca lança.** Uma falha ao registrar histórico não pode desfazer a operação que o originou:
 * seria absurdo o aceite de uma proposta falhar porque a linha da timeline não gravou. Erros vão
 * para o console e a operação segue — mesmo princípio do `logAudit` (`lib/audit.ts`), que também
 * engole a própria falha de propósito.
 *
 * **Aceita `tx`.** Quando o chamador está numa transação, o evento entra nela e some junto se ela
 * reverter — que é o correto para o aceite: projeto e timeline nascem ou não nascem juntos.
 *
 * **Devolve `false` quando não houve `clienteId`.** `Atividade.clienteId` é NOT NULL (F3.1: toda
 * atividade resolve para uma empresa), e nem toda entidade tem empresa — `Lead.clienteId` segue
 * nullable desde a F2.3. Nesses casos o evento é descartado silenciosamente, e o retorno diz isso
 * a quem quiser conferir.
 */
export async function registrarAtividade(
  ev: EventoAtividade,
  ctx: {
    autorId: string;
    clienteId: string | null | undefined;
    leadId?: string | null;
    negociacaoId?: string | null;
    propostaId?: string | null;
    contatoId?: string | null;
    tx?: Prisma.TransactionClient;
  },
): Promise<boolean> {
  if (!ctx.clienteId) return false;
  try {
    const d = descreverEvento(ev);
    const db = ctx.tx ?? prisma;
    await db.atividade.create({
      data: {
        tipo: d.tipo,
        descricao: d.descricao,
        metadata: d.metadata as Prisma.InputJsonValue,
        autorId: ctx.autorId,
        clienteId: ctx.clienteId,
        leadId: ctx.leadId ?? null,
        negociacaoId: ctx.negociacaoId ?? null,
        propostaId: ctx.propostaId ?? null,
        contatoId: ctx.contatoId ?? null,
      },
    });
    return true;
  } catch (err) {
    console.error("[atividade] falha ao registrar evento:", err);
    return false;
  }
}

// ── Negociação: ponto ÚNICO de escrita de estágio (F2.7, ADR-10) ─────────────────────────────
/**
 * A única forma de um `Negociacao.estagio` mudar. Qualquer `update` genérico de estágio fora
 * daqui é regressão — foi exatamente o defeito do `atualizarOportunidade`, que trocava o status
 * livremente, sem guarda e sem rastro (ADR-10 registra isso como conflito com o código atual).
 *
 * A validação roda ANTES de qualquer escrita: `validarMovimento` é pura e lança `ActionError`
 * com mensagem de negócio, então uma transição inválida nunca chega a tocar o banco.
 *
 * A probabilidade acompanha o estágio (ADR-12), respeitando o override manual — a regra mora em
 * `probabilidadeDe`, e a tabela vem do banco (`ProbabilidadeEstagio`, seed da F1.6), nunca de
 * constante no código.
 *
 * ⚠️ **A entrada de timeline (`Atividade`) NÃO é gravada aqui, e é de propósito:** o model
 * `Atividade` só nasce na F3.1 — não existe tabela para escrever hoje. Este é o ponto de inserção
 * dela: quando a F3.1 rodar, o registro de timeline entra nesta mesma transação, junto do update.
 * A auditoria já está coberta pelo `defineAction` da action que chama isto, com `capturarAntes`
 * guardando o estágio anterior e `entidadeId` apontando para a negociação.
 */
export async function moverEstagio(input: {
  negociacaoId: string;
  para: EstagioNegociacao;
  motivoPerdaId?: string | null;
  concorrente?: string | null;
  /** F3.2: autor do evento de timeline. Opcional só para não quebrar chamadas de script/smoke. */
  autorId?: string;
}): Promise<{ id: string; de: EstagioNegociacao; para: EstagioNegociacao; probabilidade: number }> {
  const negociacao = await prisma.negociacao.findUnique({
    where: { id: input.negociacaoId },
    select: {
      id: true,
      estagio: true,
      probabilidade: true,
      probabilidadeOverride: true,
      clienteId: true,
    },
  });
  if (!negociacao) throw new ActionError("Negociação não encontrada.");

  const motivo = input.motivoPerdaId
    ? await prisma.motivoPerda.findUnique({
        where: { id: input.motivoPerdaId },
        // `nome` entra para a timeline (F3.2) descrever a perda sem uma segunda consulta.
        select: { id: true, nome: true, exigeConcorrente: true },
      })
    : null;
  if (input.motivoPerdaId && !motivo) throw new ActionError("Motivo de perda não encontrado.");

  validarMovimento({
    de: negociacao.estagio,
    para: input.para,
    motivoPerdaId: input.motivoPerdaId,
    concorrente: input.concorrente,
    motivo,
  });

  const linhas = await prisma.probabilidadeEstagio.findMany({
    select: { estagio: true, probabilidade: true },
  });
  const tabela: TabelaProbabilidade = Object.fromEntries(
    linhas.map((l) => [l.estagio, l.probabilidade]),
  );
  const probabilidade = probabilidadeDe(input.para, {
    tabela,
    override: negociacao.probabilidadeOverride,
    atual: negociacao.probabilidade,
  });

  // `dataFechamento` marca o fim do ciclo — preenchida ao encerrar, LIMPA ao reabrir (ADR-10),
  // senão uma negociação reaberta continuaria contando como fechada nos relatórios da Fase 6.
  const encerra = input.para === "CONTRATADO" || input.para === "PERDIDO" || input.para === "CANCELADO";

  await prisma.$transaction((tx) =>
    aplicarMovimentoEstagio(tx, {
      negociacao,
      para: input.para,
      probabilidade,
      encerra,
      motivoPerdaId: input.motivoPerdaId,
      concorrente: input.concorrente,
      motivoNome: motivo?.nome ?? null,
      autorId: input.autorId,
    }),
  );

  return { id: negociacao.id, de: negociacao.estagio, para: input.para, probabilidade };
}

/**
 * A ESCRITA do movimento de estágio, recebendo `tx` de fora.
 *
 * Extraída do corpo de `moverEstagio` na F5.9 — sem mudança de comportamento — porque o aceite
 * (`aceitarProposta`) precisa mover a negociação para `CONTRATADO` **dentro da própria
 * transação**, junto de criar o projeto. Chamar `moverEstagio` de lá abriria uma segunda
 * transação independente: uma falha ao criar o projeto deixaria a negociação já contratada,
 * apontando para um projeto que não existe. É a mesma armadilha registrada no ADR-21 item 5.
 *
 * A VALIDAÇÃO continua fora daqui, antes de qualquer escrita — `validarMovimento` é pura e
 * lança `ActionError` com mensagem de negócio, então transição inválida nunca chega ao banco.
 */
async function aplicarMovimentoEstagio(
  tx: Prisma.TransactionClient,
  args: {
    negociacao: { id: string; estagio: EstagioNegociacao; clienteId: string };
    para: EstagioNegociacao;
    probabilidade: number;
    encerra: boolean;
    motivoPerdaId?: string | null;
    concorrente?: string | null;
    motivoNome?: string | null;
    autorId?: string;
  },
): Promise<void> {
  const { negociacao, para, probabilidade, encerra, autorId } = args;

  await tx.negociacao.update({
    where: { id: negociacao.id },
    data: {
      estagio: para,
      probabilidade,
      dataFechamento: encerra ? new Date() : null,
      // Motivo e concorrente só fazem sentido no encerramento sem contrato; ao sair de PERDIDO
      // (reabertura) eles são zerados, para não sobrar "perdemos para X" numa negociação viva.
      motivoPerdaId: para === "PERDIDO" ? (args.motivoPerdaId ?? null) : null,
      concorrente: para === "PERDIDO" ? (args.concorrente?.trim() || null) : null,
    },
  });

  // F3.2 — o evento entra na MESMA transação do update: ou a negociação muda e a timeline
  // registra, ou nenhum dos dois. Uma timeline dizendo "movido para X" sobre uma negociação
  // que não moveu seria pior que timeline nenhuma.
  if (autorId) {
    await registrarAtividade(
      { evento: "ESTAGIO_ALTERADO", de: negociacao.estagio, para },
      { autorId, clienteId: negociacao.clienteId, negociacaoId: negociacao.id, tx },
    );
    // PERDIDO ganha um segundo evento, com o motivo — é o que a Fase 6 agrupa no relatório
    // "por que perdemos". Ler isso do `ESTAGIO_ALTERADO` exigiria juntar com a tabela de
    // motivos toda vez.
    if (para === "PERDIDO") {
      await registrarAtividade(
        {
          evento: "NEGOCIACAO_PERDIDA",
          motivo: args.motivoNome ?? null,
          concorrente: args.concorrente?.trim() || null,
        },
        { autorId, clienteId: negociacao.clienteId, negociacaoId: negociacao.id, tx },
      );
    }
  }
}

/**
 * Qualifica uma prospecção: nasce a `Negociacao` e **o `Lead` sobrevive** (F2.8, P9 item 4).
 *
 * O lead NÃO é destruído nem convertido — vai para `OPORTUNIDADE_CRIADA` e a negociação aponta de
 * volta por `leadId`. É o que preserva "como esta empresa chegou até nós": canal, campanha,
 * parceiro que indicou, e a timeline da prospecção continuam existindo e consultáveis depois que
 * o negócio virou negociação. Destruir o lead (o que a conversão antiga fazia com o cliente)
 * apagaria justamente a informação que a Fase 6 precisa para medir origem.
 *
 * Qualificar 2× é impossível por **duas** barreiras independentes: o guard (`validarQualificacao`
 * recusa `OPORTUNIDADE_CRIADA`) e o `Negociacao.leadId @unique` no banco. A segunda cobre a
 * corrida entre dois cliques simultâneos, que o guard sozinho não pega.
 *
 * Tudo numa transação: uma negociação criada sem o lead mudar de status deixaria a empresa travada
 * para novas prospecções (F2.5) por um registro que já virou negócio.
 */
export async function qualificarProspeccao(input: {
  leadId: string;
  /** Opcional: por padrão herda o nome do empreendimento já registrado na prospecção. */
  titulo?: string | null;
  responsavelId?: string | null;
  /** F3.2: autor do evento de timeline. */
  autorId?: string;
}): Promise<{ negociacaoId: string; leadId: string }> {
  const lead = await prisma.lead.findUnique({
    where: { id: input.leadId },
    select: {
      id: true,
      nome: true,
      status: true,
      clienteId: true,
      canalId: true,
      campaignId: true,
      parceiroId: true,
      origemDetalhada: true,
      valorEstimado: true,
      responsavelId: true,
      contatos: { select: { contatoId: true, principal: true } },
    },
  });
  if (!lead) throw new ActionError("Prospecção não encontrada.");

  validarQualificacao({ status: lead.status, clienteId: lead.clienteId });

  return prisma.$transaction(async (tx) => {
    const { negociacaoId } = await aplicarQualificacao(tx, lead, {
      titulo: input.titulo,
      responsavelId: input.responsavelId,
      autorId: input.autorId,
    });
    return { negociacaoId, leadId: lead.id };
  });
}

type LeadParaQualificar = {
  id: string;
  nome: string;
  clienteId: string | null;
  canalId: string | null;
  campaignId: string | null;
  parceiroId: string | null;
  origemDetalhada: string | null;
  valorEstimado: Prisma.Decimal | number | null;
  responsavelId: string | null;
  contatos: { contatoId: string; principal: boolean }[];
};

/**
 * A ESCRITA da qualificação, recebendo `tx` de fora — extraída de `qualificarProspeccao` na
 * F5.3, mesma forma de `aplicarMovimentoEstagio` (F5.9) e pelo mesmo motivo: o novo chamador
 * (`criarPropostaDeLead`, via `garantirNegociacaoParaProposta` abaixo) precisa qualificar
 * DENTRO da própria transação que também cria a proposta. Duas transações independentes
 * deixariam uma negociação criada sem a proposta que a motivou, se o passo seguinte falhasse.
 *
 * A VALIDAÇÃO (`validarQualificacao`) continua fora, antes de qualquer escrita — comportamento
 * inalterado de `qualificarProspeccao`.
 */
async function aplicarQualificacao(
  tx: Prisma.TransactionClient,
  lead: LeadParaQualificar,
  opts: { titulo?: string | null; responsavelId?: string | null; autorId?: string },
): Promise<{ negociacaoId: string }> {
  // `origemDetalhada` é onde o nome do empreendimento foi parar no backfill da F1.23 (o campo
  // `origem` legado era "canal" no nome e empreendimento no uso — ver 03-migracao.md §3). É esse
  // o "campo próprio da Negociacao" que o §3 manda usar: o título do negócio.
  const titulo = opts.titulo?.trim() || lead.origemDetalhada?.trim() || lead.nome;

  const negociacao = await tx.negociacao.create({
    data: {
      titulo,
      clienteId: lead.clienteId!, // garantido pelo chamador (validarQualificacao já rodou)
      leadId: lead.id,
      responsavelId: opts.responsavelId ?? lead.responsavelId,
      canalId: lead.canalId,
      campaignId: lead.campaignId,
      parceiroId: lead.parceiroId,
      valorEstimado: lead.valorEstimado,
      // Nasce no início do funil de negociação; a probabilidade correspondente entra na
      // primeira transição via `moverEstagio`, que é o ponto único de escrita (F2.7).
      estagio: "LEVANTAMENTO",
      contatos: {
        create: lead.contatos.map((c) => ({ contatoId: c.contatoId, principal: c.principal })),
      },
    },
    select: { id: true },
  });

  await tx.lead.update({
    where: { id: lead.id },
    data: { status: "OPORTUNIDADE_CRIADA" },
  });

  // F3.2 — dentro da transação: se a qualificação reverter, a timeline não fica dizendo que
  // uma negociação inexistente foi criada.
  if (opts.autorId) {
    await registrarAtividade(
      { evento: "NEGOCIACAO_CRIADA", titulo, deProspeccao: true },
      { autorId: opts.autorId, clienteId: lead.clienteId, leadId: lead.id, negociacaoId: negociacao.id, tx },
    );
  }

  return { negociacaoId: negociacao.id };
}

/**
 * Garante uma `Negociacao` para uma proposta que está nascendo de um `Lead` (F5.3, ADR-21
 * item 5) — dentro da MESMA transação de `criarPropostaDeLead`. Três caminhos:
 *
 * 1. **Já tem negociação** (`Negociacao.leadId` é `@unique`) → reusa. É o caso de todo lead já
 *    `OPORTUNIDADE_CRIADA` — inclusive uma 2ª proposta do mesmo negócio.
 * 2. **Status qualificável** (os 4 de `STATUS_PROSPECCAO_ATIVOS`) → qualifica direto, sem
 *    perguntar nada — é o fluxo normal, idêntico ao que "Nova proposta" sempre fez.
 * 3. **Fora do fluxo** (`SEM_OPORTUNIDADE`/`EM_ESPERA`/`DESCARTADO`) → é o caso do ADR-21 §5b.
 *    **Recusa por padrão** com uma mensagem que a UI reconhece para oferecer confirmação
 *    (`lead-detalhe-view.tsx` já faz essa checagem ANTES de chamar a action, usando o `status`
 *    que já tem em mãos — isto aqui é o cinturão, não a UX principal). Só com
 *    `confirmarReativacao: true` reativa — e reativa por `validarMovimentoProspeccao`, nunca
 *    por um `update` cru, porque um 2º caminho de escrita de status é o que a F2.7 existiu
 *    para fechar.
 */
async function garantirNegociacaoParaProposta(
  tx: Prisma.TransactionClient,
  lead: LeadParaQualificar & { status: StatusProspeccao },
  opts: { autorId?: string; confirmarReativacao: boolean },
): Promise<string> {
  const existente = await tx.negociacao.findUnique({ where: { leadId: lead.id }, select: { id: true } });
  if (existente) return existente.id;

  let statusAtual = lead.status;
  if (!podeQualificar(statusAtual)) {
    if (!opts.confirmarReativacao) {
      throw new ActionError(
        `Esta prospecção está "${STATUS_PROSPECCAO_LABEL[statusAtual]}" — criar a proposta vai ` +
          "reativá-la e abrir uma negociação. Confirme para continuar.",
      );
    }
    // Reativa por um estágio ativo antes de qualificar — mesma validação de um arrasto no
    // board (`moverProspeccao`), nunca um `update` de status solto.
    validarMovimentoProspeccao(statusAtual, "EM_CONTATO");
    await tx.lead.update({ where: { id: lead.id }, data: { status: "EM_CONTATO" } });
    statusAtual = "EM_CONTATO";
  }

  validarQualificacao({ status: statusAtual, clienteId: lead.clienteId });
  const { negociacaoId } = await aplicarQualificacao(tx, lead, { autorId: opts.autorId });
  return negociacaoId;
}

// ── Registro manual de interação (F3.4) ──────────────────────────────────────────────────────
/**
 * Registro manual em **2 cliques** — o contraponto da F3.2. Lá o sistema registra sozinho o que
 * ele mesmo causa (mudou de estágio, aceitou proposta); aqui a pessoa registra o que aconteceu
 * **fora** dele — a ligação, a conversa de WhatsApp. Sem API de WhatsApp (#28, veredito do dono):
 * o registro é sempre manual, nunca automático.
 *
 * Os 6 tipos aceitos (`LIGACAO`/`WHATSAPP`/`EMAIL`/`LINKEDIN`/`REUNIAO`/`NOTA`) são exatamente
 * `TipoAtividade` menos `ANEXO` (tem fluxo próprio) e `SISTEMA` (reservado para `atividade-eventos.ts`
 * — ninguém digita um evento automático).
 *
 * Reusa `resolverAncoraComercial` — o mesmo resolvedor de empresa/responsável que
 * `concluirProximaAcao` (F2.11) já usa para a mesma âncora polimórfica.
 *
 * ⚠️ Ao contrário de `registrarAtividade` (que nunca lança, porque protege uma operação que já
 * aconteceu), este **lança** quando não há empresa: aqui não existe operação nenhuma além do
 * próprio registro, então "salvar em silêncio um registro que não existe" seria pior que recusar
 * e dizer o motivo.
 */
export async function registrarInteracaoManual(input: {
  entidadeTipo: TipoAncoraCompromisso;
  entidadeId: string;
  tipo: Extract<TipoAtividade, "LIGACAO" | "WHATSAPP" | "EMAIL" | "LINKEDIN" | "REUNIAO" | "NOTA">;
  nota: string;
  autorId: string;
}): Promise<{ id: string }> {
  const { clienteId } = await resolverAncoraComercial(input.entidadeTipo, input.entidadeId);
  if (!clienteId) {
    throw new ActionError(
      "Esta prospecção/negociação ainda não tem empresa vinculada — vincule antes de registrar.",
    );
  }

  const atividade = await prisma.atividade.create({
    data: {
      tipo: input.tipo,
      descricao: input.nota,
      autorId: input.autorId,
      clienteId,
      leadId: input.entidadeTipo === "LEAD" ? input.entidadeId : null,
      negociacaoId: input.entidadeTipo === "NEGOCIACAO" ? input.entidadeId : null,
    },
    select: { id: true },
  });
  return { id: atividade.id };
}

/**
 * Traduz a violação dos índices parciais da F2.5 (ADR-02/ADR-18) numa mensagem que o vendedor
 * entende. Movida de `actions.ts` para cá na F4.3 — `criarProspeccaoRapida` precisa do mesmo
 * catch dentro de uma transação, e `actions.ts` segue reexportando/reusando esta versão em vez
 * de manter uma segunda cópia.
 */
export async function comProspeccaoAtivaUnica<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const codigo = (e as { code?: string }).code;
    const alvo = JSON.stringify((e as { meta?: unknown }).meta ?? "");
    if (codigo === "P2002" && alvo.includes("prospeccao_ativa")) {
      throw new ActionError(
        "Já existe uma prospecção ativa para esta empresa nesta campanha. " +
          "Registre o contato na prospecção existente, ou encerre-a antes de abrir outra.",
      );
    }
    throw e;
  }
}

// ── Fluxo rápido de prospecção (F4.3, "Sales Navigator numa tela só") ─────────────────────────
export type ProspeccaoRapidaInput = {
  /** Link colado (perfil LinkedIn/Sales Navigator da empresa OU da pessoa) — nunca "raspado". */
  urlPerfil?: string | null;
  /** A quem o `urlPerfil` pertence — decide se vira `Cliente.salesNavigatorUrl` ou
   * `ContatoCliente.salesNavigatorUrl`. Sem isso o link de uma PESSOA acabaria gravado como se
   * fosse o perfil da EMPRESA (ou vice-versa), o que é pior que não guardar o link nenhum. */
  urlAlvo: "cliente" | "contato";
  empresa: { clienteId?: string | null; nome?: string };
  contato: { contatoId?: string | null; nome?: string; email?: string; telefone?: string; cargo?: string };
  campanhaId?: string | null;
  canalId?: string | null;
  abordagem: {
    tipo: Extract<TipoAtividade, "LIGACAO" | "WHATSAPP" | "EMAIL" | "LINKEDIN" | "REUNIAO" | "NOTA">;
    nota: string;
  };
  autorId: string;
};

export type ProspeccaoRapidaResultado = {
  leadId: string;
  clienteId: string;
  contatoId: string;
  reaproveitouEmpresa: boolean;
  reaproveitouContato: boolean;
  /** A empresa já tinha prospecção ATIVA — o contato entrou nela em vez de abrir uma 2ª. */
  reaproveitouProspeccaoAtiva: boolean;
};

/**
 * "Colar URL → criar/vincular empresa → criar/vincular contato → criar prospecção → registrar
 * abordagem", tudo numa transação só (F4.3). É a resposta a como os 8 leads reais da F2.18
 * chegaram órfãos: nada aqui deixa a etapa seguinte para "depois" — sai tudo junto ou nada sai.
 *
 * ── Por que uma transação, e não 5 chamadas separadas ──────────────────────────────────────
 * Empresa nova + contato novo + prospecção só fazem sentido juntos. Um erro no passo 4 depois de
 * já ter criado a empresa nos passos 1–2 deixaria um `Cliente` órfão, sem prospecção nenhuma —
 * pior que o problema que a F3.8 existe para resolver. `$transaction` garante tudo-ou-nada.
 *
 * ── "2º prospect da mesma empresa reaproveita a empresa" (aceite da tarefa) ────────────────
 * Não é só a EMPRESA que não duplica — uma empresa com prospecção ATIVA não ganha uma segunda: o
 * novo contato entra na existente (`LeadContato`) e a abordagem é registrada nela. É a mesma
 * regra que o índice parcial `lead_prospeccao_ativa_campanha_unica` (F2.5/ADR-02) já impõe no
 * banco quando há campanha — aqui a checagem é PROATIVA (antes do INSERT, então nunca aparece
 * como erro pro usuário) e vale mesmo sem campanha selecionada, que é o caso mais comum deste
 * fluxo. `comProspeccaoAtivaUnica` continua como rede de segurança para a corrida entre o SELECT
 * e o INSERT — cinturão e suspensório, não redundância inútil.
 *
 * ── `listaSalesNavigator`/`statusAbordagem` (dívida deixada pela F4.1) ─────────────────────
 * Só nasce `true`/`ABORDADO` em registro NOVO. Num registro REAPROVEITADO, só o
 * `statusAbordagem` avança para `ABORDADO` — `dataInclusaoLista` não é tocada, porque a empresa
 * não "entrou na lista" hoje, entrou quando entrou; reescrever essa data seria mentir sobre o
 * histórico (mesmo cuidado do docblock da migration da F4.1).
 */
export async function criarProspeccaoRapida(
  input: ProspeccaoRapidaInput,
): Promise<ProspeccaoRapidaResultado> {
  return prisma.$transaction(async (tx) => {
    // ── 1. Empresa: reaproveita ou cria ───────────────────────────────────────────────────
    let clienteId: string;
    let reaproveitouEmpresa: boolean;
    if (input.empresa.clienteId) {
      const existe = await tx.cliente.findUnique({
        where: { id: input.empresa.clienteId },
        select: { id: true },
      });
      if (!existe) throw new ActionError("Empresa não encontrada.");
      clienteId = existe.id;
      reaproveitouEmpresa = true;
      await tx.cliente.update({ where: { id: clienteId }, data: { statusAbordagem: "ABORDADO" } });
    } else {
      const nome = input.empresa.nome?.trim();
      if (!nome) throw new ActionError("Informe o nome da empresa.");
      const novo = await tx.cliente.create({
        data: {
          nome,
          tipo: "PJ",
          ...(input.urlAlvo === "cliente" && input.urlPerfil ? { salesNavigatorUrl: input.urlPerfil } : {}),
          listaSalesNavigator: true,
          dataInclusaoLista: new Date(),
          statusAbordagem: "ABORDADO",
        },
        select: { id: true },
      });
      clienteId = novo.id;
      reaproveitouEmpresa = false;
      await registrarAtividade(
        { evento: "EMPRESA_CADASTRADA", nome },
        { autorId: input.autorId, clienteId, tx },
      );
    }

    // ── 2. Contato: reaproveita ou cria ───────────────────────────────────────────────────
    let contatoId: string;
    let reaproveitouContato: boolean;
    if (input.contato.contatoId) {
      const existe = await tx.contatoCliente.findFirst({
        where: { id: input.contato.contatoId, clienteId },
        select: { id: true, optOut: true, telefone: true, email: true },
      });
      if (!existe) throw new ActionError("Contato não encontrado nesta empresa.");
      // LGPD (T1): a MESMA regra do resto do sistema — nunca reimplementada solta aqui.
      if (!podeAbordar(existe)) {
        throw new ActionError("Este contato pediu descadastro (opt-out) — não pode ser abordado.");
      }
      contatoId = existe.id;
      reaproveitouContato = true;
      await tx.contatoCliente.update({ where: { id: contatoId }, data: { statusAbordagem: "ABORDADO" } });
    } else {
      const nome = input.contato.nome?.trim();
      if (!nome) throw new ActionError("Informe o nome do contato.");
      const novo = await tx.contatoCliente.create({
        data: {
          clienteId,
          nome,
          email: input.contato.email || null,
          telefone: input.contato.telefone || null,
          cargo: input.contato.cargo || null,
          ...(input.urlAlvo === "contato" && input.urlPerfil ? { salesNavigatorUrl: input.urlPerfil } : {}),
          listaSalesNavigator: true,
          dataInclusaoLista: new Date(),
          statusAbordagem: "ABORDADO",
          // LGPD (T1): de onde veio o dado e quando — exatamente o caso que esses dois campos
          // foram criados para cobrir (F1.9), não um genérico "createdAt" que já existia.
          dataCollectionSource: "Sales Navigator",
          dataCollectedAt: new Date(),
        },
        select: { id: true },
      });
      contatoId = novo.id;
      reaproveitouContato = false;
      await registrarAtividade(
        { evento: "CONTATO_CADASTRADO", nome, cargo: input.contato.cargo ?? null },
        { autorId: input.autorId, clienteId, contatoId, tx },
      );
    }

    // ── 3. Prospecção: reaproveita a ATIVA (se houver) ou cria ───────────────────────────
    const etapaPadrao = await tx.funilEtapa.findFirst({
      where: { ativo: true },
      orderBy: { ordem: "asc" },
      select: { id: true },
    });
    if (!etapaPadrao) throw new ActionError("Nenhuma etapa de funil configurada.");

    const ativa = await tx.lead.findFirst({
      where: {
        clienteId,
        status: { in: [...STATUS_PROSPECCAO_ATIVOS] },
        arquivado: false,
        excluidoEm: null,
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });

    let leadId: string;
    let reaproveitouProspeccaoAtiva: boolean;
    if (ativa) {
      leadId = ativa.id;
      reaproveitouProspeccaoAtiva = true;
    } else {
      const nomeEmpresa = input.empresa.nome?.trim() ?? "";
      const novoLead = await comProspeccaoAtivaUnica(() =>
        tx.lead.create({
          data: {
            nome: nomeEmpresa || "Prospecção",
            clienteId,
            etapaId: etapaPadrao.id,
            campaignId: input.campanhaId || null,
            canalId: input.canalId || null,
          },
          select: { id: true },
        }),
      );
      leadId = novoLead.id;
      reaproveitouProspeccaoAtiva = false;
      await registrarAtividade(
        { evento: "PROSPECCAO_CRIADA", nome: nomeEmpresa },
        { autorId: input.autorId, clienteId, leadId, tx },
      );
    }

    // ── 4. Vincula o contato à prospecção (join idempotente) ─────────────────────────────
    await tx.leadContato.upsert({
      where: { leadId_contatoId: { leadId, contatoId } },
      create: { leadId, contatoId, principal: true },
      update: {},
    });

    // ── 5. Registra a abordagem — o toque real, não um evento de sistema ────────────────
    await tx.atividade.create({
      data: {
        tipo: input.abordagem.tipo,
        descricao: input.abordagem.nota,
        autorId: input.autorId,
        clienteId,
        leadId,
      },
    });

    return { leadId, clienteId, contatoId, reaproveitouEmpresa, reaproveitouContato, reaproveitouProspeccaoAtiva };
  });
}

// ── Próxima Ação (F2.10, ADR-17) ─────────────────────────────────────────────────────────────
/**
 * Agenda a próxima ação de uma prospecção/negociação — um `Compromisso` **ancorado**, não um
 * título com o nome do lead dentro.
 *
 * É a diferença que justifica a tarefa: hoje o `follow-up-dialog` grava
 * `titulo: "Follow-up: <nome do lead>"` e mais nada. O lead existe ali como TEXTO. Por isso
 * "quais prospecções estão sem próximo contato marcado?" — a pergunta mais útil de um CRM — é
 * literalmente impossível de responder por query. Com `entidadeTipo`/`entidadeId` preenchidos,
 * vira um `findMany`.
 *
 * O compromisso continua aparecendo na agenda (é a mesma tabela), agora com `tipo` preenchido,
 * que é o que o filtro da F2.1a usa para não poluir a visão de reuniões.
 */
export async function agendarProximaAcao(input: {
  entidadeTipo: TipoAncoraCompromisso;
  entidadeId: string;
  tipo: TipoProximaAcao;
  titulo: string;
  inicio: Date;
  fim?: Date | null;
  local?: string | null;
  descricao?: string | null;
  criadorId: string;
  participantesIds?: string[];
}): Promise<{ id: string }> {
  const participantes = [...new Set([input.criadorId, ...(input.participantesIds ?? [])])];
  const c = await prisma.compromisso.create({
    data: {
      titulo: input.titulo,
      descricao: input.descricao || null,
      local: input.local || null,
      inicio: input.inicio,
      fim: input.fim ?? null,
      criadorId: input.criadorId,
      entidadeTipo: input.entidadeTipo,
      entidadeId: input.entidadeId,
      tipo: input.tipo,
      participantes: {
        create: participantes.map((userId) => ({
          userId,
          confirmado: userId === input.criadorId ? true : null,
        })),
      },
    },
    select: { id: true },
  });
  return c;
}

/**
 * Conclui uma próxima ação. `concluidoEm`/`concluidoPor` saem do nulo, e a ação deixa de contar
 * como pendente nas consultas de frescor.
 *
 * ⚠️ O registro na timeline (`Atividade`) e a atualização de "última interação" são da F2.11/F3.1
 * — este é o ponto de inserção. Concluir hoje já tira a ação da fila de abertas, que é o efeito
 * que a F2.10 precisa entregar.
 */
/**
 * Conclui uma próxima ação (F2.11). Além do que já fazia (F2.10):
 *
 * - **Registra `Atividade`** na timeline — só quando a entidade resolve uma empresa. Uma
 *   `Atividade` sem `Cliente` não é um estado que o schema aceita (`clienteId` é NOT NULL,
 *   F3.1 §P12 item 1: "toda Atividade resolve para uma Empresa"), e `Lead.clienteId` continua
 *   nullable (F2.3). Concluir a ação NUNCA falha por causa disso — só a entrada na timeline
 *   fica de fora, e é isso que fica registrado no retorno (`atividadeRegistrada`).
 * - **"Última interação" não é escrita aqui.** Não existe coluna para isso (é derivada,
 *   `ultimaInteracaoDe` em `atividade.ts`) — o efeito acontece sozinho no instante em que a
 *   `Atividade` é criada, porque quem lê consulta o `createdAt` mais recente.
 * - **Notifica o responsável**, só quando ele existe e é OUTRA pessoa. Cobre o caso comum de um
 *   assistente registrar a ligação em nome de quem vende — sem isso o responsável nunca saberia
 *   que a ação anotada em nome dele foi concluída.
 */
/**
 * Resolve empresa/responsável/nome a partir de uma âncora polimórfica (LEAD/NEGOCIACAO/CLIENTE),
 * o mesmo par `entidadeTipo`/`entidadeId` usado por `Compromisso` (F2.10) e agora por
 * `registrarInteracaoManual` (F3.4). Sem FK — mesmo padrão de `ApontamentoCoordenacao`/
 * `Pendencia` — então não dá para resolver com um `include`; extraído para não repetir o
 * mesmo if/else nos dois lugares que precisam disso.
 */
async function resolverAncoraComercial(
  entidadeTipo: TipoAncoraCompromisso,
  entidadeId: string,
): Promise<{ clienteId: string | null; responsavelId: string | null; nome: string }> {
  if (entidadeTipo === "LEAD") {
    const lead = await prisma.lead.findUnique({
      where: { id: entidadeId },
      select: { clienteId: true, responsavelId: true, nome: true },
    });
    return {
      clienteId: lead?.clienteId ?? null,
      responsavelId: lead?.responsavelId ?? null,
      nome: lead?.nome ?? "",
    };
  }
  if (entidadeTipo === "NEGOCIACAO") {
    const neg = await prisma.negociacao.findUnique({
      where: { id: entidadeId },
      select: { clienteId: true, responsavelId: true, titulo: true },
    });
    return {
      clienteId: neg?.clienteId ?? null,
      responsavelId: neg?.responsavelId ?? null,
      nome: neg?.titulo ?? "",
    };
  }
  // CLIENTE: a própria empresa é a âncora, e Cliente não tem campo de responsável.
  return { clienteId: entidadeId, responsavelId: null, nome: "" };
}

export async function concluirProximaAcao(input: {
  compromissoId: string;
  userId: string;
  quando: Date;
}): Promise<{ id: string; atividadeRegistrada: boolean }> {
  const c = await prisma.compromisso.findUnique({
    where: { id: input.compromissoId },
    select: {
      id: true,
      tipo: true,
      titulo: true,
      concluidoEm: true,
      entidadeTipo: true,
      entidadeId: true,
    },
  });
  if (!c) throw new ActionError("Ação não encontrada.");
  if (!c.tipo || !c.entidadeTipo || !c.entidadeId) {
    throw new ActionError("Este compromisso não é uma ação comercial.");
  }
  if (c.concluidoEm) throw new ActionError("Esta ação já foi concluída.");

  const { clienteId, responsavelId, nome: entidadeNome } = await resolverAncoraComercial(
    c.entidadeTipo,
    c.entidadeId,
  );

  const atividadeRegistrada = clienteId != null;

  await prisma.$transaction(async (tx) => {
    await tx.compromisso.update({
      where: { id: c.id },
      data: { concluidoEm: input.quando, concluidoPor: input.userId },
    });

    if (clienteId) {
      await tx.atividade.create({
        data: {
          tipo: tipoAtividadeDe(c.tipo!),
          descricao: c.titulo,
          autorId: input.userId,
          clienteId,
          leadId: c.entidadeTipo === "LEAD" ? c.entidadeId : null,
          negociacaoId: c.entidadeTipo === "NEGOCIACAO" ? c.entidadeId : null,
        },
      });
    }
  });

  if (responsavelId && responsavelId !== input.userId) {
    await notificar(
      responsavelId,
      {
        titulo: "Interação registrada",
        corpo: `${TIPO_PROXIMA_ACAO_LABEL[c.tipo!]} concluída — ${entidadeNome}`,
        href: c.entidadeTipo === "LEAD" ? `/comercial/${c.entidadeId}` : "/comercial/negociacoes",
        tag: `comercial-acao-${c.id}`,
      },
      // Categoria nova — "comercial_interacao" ainda não tem alternância nas Preferências
      // (`preferencias-view.tsx`), então hoje ninguém consegue desligá-la pela tela. Não é
      // bug: o padrão de opt-out é "ligado até alguém desligar", e adicionar o toggle é
      // trabalho de UI fora do escopo desta tarefa — registrado como pendência.
      { categoria: "comercial_interacao" },
    );
  }

  return { id: c.id, atividadeRegistrada };
}

/**
 * Ponto ÚNICO de escrita de `Lead.status` (F2.13), espelhando o que `moverEstagio` faz para a
 * negociação. Nenhum update genérico de status fora daqui.
 *
 * Não trata `OPORTUNIDADE_CRIADA`: esse destino exige `qualificarProspeccao`, porque o estado
 * significa "existe uma Negociacao" — e só aquela função a cria. O chamador decide qual das duas
 * invocar (`exigeQualificacao`), em vez de esta função criar negociação por baixo dos panos.
 */
export async function moverProspeccao(input: {
  leadId: string;
  para: StatusProspeccao;
}): Promise<{ id: string; de: StatusProspeccao; para: StatusProspeccao }> {
  const lead = await prisma.lead.findUnique({
    where: { id: input.leadId },
    select: { id: true, status: true },
  });
  if (!lead) throw new ActionError("Prospecção não encontrada.");

  validarMovimentoProspeccao(lead.status, input.para);

  // Passa pela mesma rede da F2.5: mover para um status ATIVO pode colidir com outra prospecção
  // já aberta na mesma empresa, e a mensagem tem que ser de negócio, não P2002 cru.
  await comProspeccaoAtivaUnicaService(() =>
    prisma.lead.update({ where: { id: lead.id }, data: { status: input.para } }),
  );

  return { id: lead.id, de: lead.status, para: input.para };
}

/**
 * Mesma tradução de P2002 de `actions.ts`, disponível no service porque `moverProspeccao` também
 * pode esbarrar no índice parcial da F2.5. Duplicação consciente e mínima: mover isto para um
 * módulo compartilhado exigiria um arquivo novo só para uma função de 12 linhas, e o service não
 * pode importar de `actions.ts` (que é `"use server"`).
 */
async function comProspeccaoAtivaUnicaService<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const codigo = (e as { code?: string }).code;
    const alvo = JSON.stringify((e as { meta?: unknown }).meta ?? "");
    if (codigo === "P2002" && alvo.includes("prospeccao_ativa")) {
      throw new ActionError(
        "Já existe uma prospecção ativa para esta empresa nesta campanha. " +
          "Registre o contato na prospecção existente, ou encerre-a antes de abrir outra.",
      );
    }
    throw e;
  }
}
