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
        disciplina: it.disciplina,
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
    include: { itens: { orderBy: { ordem: "asc" } }, cliente: { select: { nome: true } } },
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
