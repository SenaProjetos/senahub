import "server-only";

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ActionError } from "@/lib/with-action";
import { notificarMuitos } from "@/lib/notificar";
import { whereAudiencia } from "@/lib/audiencias";
import { proximoCodigoProjeto } from "@/modules/projetos/numbering";
import { ensureCanaisProjeto } from "@/modules/chat/service";
import { notificarNovosMembros } from "@/lib/socket";
import { formatarNumeroProposta } from "@/modules/comercial/numeracao";
import { disciplinasDeItens } from "@/modules/comercial/disciplinas";
import type { SalvarPropostaInput } from "@/modules/comercial/schemas";
import type { EstagioNegociacao } from "@/generated/prisma/client";
import {
  probabilidadeDe,
  validarMovimento,
  type TabelaProbabilidade,
} from "@/modules/comercial/jornada";
import { validarQualificacao } from "@/modules/comercial/prospeccao";
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
 * Cria uma proposta partindo de um lead. Garante o cliente (converte o lead
 * se ainda não tiver um) e vincula a proposta ao lead — assim o funil e a
 * ficha do lead passam a listar suas propostas.
 *
 * Devolve `criouCliente` para o chamador decidir se revalida `/clientes`.
 */
export async function criarPropostaDeLead(
  input: { leadId: string; titulo: string },
  autorId: string,
) {
  const lead = await prisma.lead.findUnique({ where: { id: input.leadId } });
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
    const { ano, sequencial, numero } = await proximoNumeroProposta(tx);
    const proposta = await tx.proposta.create({
      data: {
        ano,
        sequencial,
        numero,
        titulo: input.titulo,
        clienteId,
        leadId: lead.id,
        token: randomBytes(18).toString("hex"),
        autorId,
      },
    });
    return { proposta, criouCliente };
  });

  return { proposta, criouCliente, leadId: lead.id };
}

/** Salva itens/condições e grava versão (snapshot). */
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
        validade: i.validade ? new Date(i.validade) : null,
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
        numero: (p.versoes[0]?.numero ?? 0) + 1,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        autorId,
      },
    }),
  ]);
  return { id: i.id };
}

/**
 * ACEITE: cria o projeto com as disciplinas dos itens (valores incluídos),
 * cria os canais de chat e notifica gestores. Sem redigitação.
 *
 * ⚠️ Os canais de chat e as notificações rodam FORA da transação, de propósito e como sempre
 * foi: se o fan-out falhar, o projeto continua criado e a proposta aceita. Mover para dentro
 * mudaria comportamento observável (uma falha de notificação desfaria o aceite).
 */
export async function aceitarProposta(propostaId: string) {
  const p = await prisma.proposta.findUnique({
    where: { id: propostaId },
    include: {
      // `disciplina` (catalogo) entra no include para o aceite resolver o nome preferindo o
      // catalogo e caindo no texto legado (F1.19) -- ver `disciplinasDeItens`.
      itens: { orderBy: { ordem: "asc" }, include: { disciplina: { select: { nome: true } } } },
      cliente: { select: { nome: true } },
    },
  });
  if (!p) throw new ActionError("Proposta não encontrada.");
  if (p.status === "aceita") throw new ActionError("Proposta já aceita.");
  if (p.itens.length === 0) throw new ActionError("Adicione itens antes de aceitar.");

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
        disciplinas: {
          create: disciplinasDeItens(p.itens),
        },
      },
    });
    await tx.proposta.update({
      where: { id: p.id },
      data: { status: "aceita", aceitaEm: new Date(), projetoId: projeto.id },
    });
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
}): Promise<{ id: string; de: EstagioNegociacao; para: EstagioNegociacao; probabilidade: number }> {
  const negociacao = await prisma.negociacao.findUnique({
    where: { id: input.negociacaoId },
    select: { id: true, estagio: true, probabilidade: true, probabilidadeOverride: true },
  });
  if (!negociacao) throw new ActionError("Negociação não encontrada.");

  const motivo = input.motivoPerdaId
    ? await prisma.motivoPerda.findUnique({
        where: { id: input.motivoPerdaId },
        select: { id: true, exigeConcorrente: true },
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

  await prisma.negociacao.update({
    where: { id: negociacao.id },
    data: {
      estagio: input.para,
      probabilidade,
      dataFechamento: encerra ? new Date() : null,
      // Motivo e concorrente só fazem sentido no encerramento sem contrato; ao sair de PERDIDO
      // (reabertura) eles são zerados, para não sobrar "perdemos para X" numa negociação viva.
      motivoPerdaId: input.para === "PERDIDO" ? (input.motivoPerdaId ?? null) : null,
      concorrente: input.para === "PERDIDO" ? (input.concorrente?.trim() || null) : null,
    },
  });

  return { id: negociacao.id, de: negociacao.estagio, para: input.para, probabilidade };
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

  // `origemDetalhada` é onde o nome do empreendimento foi parar no backfill da F1.23 (o campo
  // `origem` legado era "canal" no nome e empreendimento no uso — ver 03-migracao.md §3). É esse
  // o "campo próprio da Negociacao" que o §3 manda usar: o título do negócio.
  const titulo = input.titulo?.trim() || lead.origemDetalhada?.trim() || lead.nome;

  return prisma.$transaction(async (tx) => {
    const negociacao = await tx.negociacao.create({
      data: {
        titulo,
        clienteId: lead.clienteId!, // garantido por `validarQualificacao`
        leadId: lead.id,
        responsavelId: input.responsavelId ?? lead.responsavelId,
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

    return { negociacaoId: negociacao.id, leadId: lead.id };
  });
}
