/**
 * I/O da migração F5.2 — a leitura e a escrita que `planejarVinculo` (puro) não faz.
 *
 * Separado do script (`scripts/migrar-proposta-negociacao-f52.ts`) pelo mesmo motivo de
 * `importacao/commit.ts` na F4.5: script não é importável por smoke, e o caminho de escrita
 * desta migração precisa ser exercitado contra Postgres real antes de tocar produção. Sem
 * `server-only` — roda sob `tsx`, fora do bundler do Next.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import type { LeadConhecido, NegociacaoDoLead, PlanoVinculo, PropostaPendente } from "@/modules/comercial/vinculo-negociacao";

/**
 * Tudo que `planejarVinculo` precisa, em três consultas — nunca uma por proposta.
 *
 * `valorTotal` vem da soma dos itens aqui, e não no plano, porque somar `Decimal` do Prisma é
 * I/O-adjacente (o tipo só existe do lado do client); a função pura recebe `number | null` e
 * segue testável sem o Prisma.
 *
 * ⚠️ **A consulta de negociações usa o escape hatch de soft delete de propósito.** `Negociacao`
 * está na extensão de `lib/prisma.ts`, então um `findMany` normal esconderia as excluídas — e
 * esconder aqui é pior que mostrar: o planejamento classificaria o lead como "sem negociação",
 * mandaria criar uma sintética, e o `Negociacao.leadId @unique` (constraint de BANCO, que não
 * sabe de `excluidoEm`) mataria a transação inteira com `P2002`. Enxergar a excluída é o que
 * permite abortar com mensagem em vez de morrer no meio da migração.
 *
 * Note a assimetria, que é fácil de ler errado: a consulta de LEADS logo abaixo já enxerga os
 * excluídos sem pedir nada, porque `{ where: { id: { in: [...] } } }` cai no `ehLookupPorId` da
 * extensão (chave única `id`) e passa direto. A de negociações filtra por `leadId`, não por
 * `id` — não passa. Mesmo arquivo, comportamentos opostos, a uma linha de distância.
 */
export async function carregarPendentes(db: PrismaClient): Promise<{
  pendentes: PropostaPendente[];
  leads: LeadConhecido[];
  negociacoes: NegociacaoDoLead[];
}> {
  const propostas = await db.proposta.findMany({
    where: { negociacaoId: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      numero: true,
      titulo: true,
      status: true,
      clienteId: true,
      leadId: true,
      aceitaEm: true,
      cliente: { select: { nome: true } },
      itens: { select: { valor: true } },
    },
  });

  const pendentes: PropostaPendente[] = propostas.map((p) => ({
    id: p.id,
    numero: p.numero,
    titulo: p.titulo,
    status: p.status,
    clienteId: p.clienteId,
    clienteNome: p.cliente.nome,
    leadId: p.leadId,
    aceitaEm: p.aceitaEm,
    valorTotal: p.itens.length > 0 ? p.itens.reduce((s, it) => s + Number(it.valor), 0) : null,
  }));

  const leadIds = [...new Set(pendentes.map((p) => p.leadId).filter((x): x is string => x !== null))];
  if (leadIds.length === 0) return { pendentes, leads: [], negociacoes: [] };

  const [leads, negociacoes] = await Promise.all([
    db.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, nome: true } }),
    db.negociacao.findMany({
      // `excluidoEm: { not: undefined }` = o escape hatch documentado em `lib/prisma.ts` — vê
      // TODAS (ativas + excluídas). Ver o ⚠️ no docblock acima: sem isto, o P2002 é certo.
      where: { leadId: { in: leadIds }, excluidoEm: { not: undefined } },
      select: { id: true, titulo: true, clienteId: true, leadId: true, excluidoEm: true },
    }),
  ]);

  return {
    pendentes,
    leads,
    // `leadId` é nullable no model, mas o `where` acima garante não-nulo nestas linhas.
    negociacoes: negociacoes.map((n) => ({ ...n, leadId: n.leadId! })),
  };
}

export type ResultadoVinculo = {
  vinculadasAReal: number;
  vinculadasASintetica: number;
  negociacoesCriadas: number;
};

/**
 * Grava o plano **numa transação só**: ou o arquivo inteiro de vínculos entra, ou nenhum.
 * Meio-caminho aqui deixaria parte das propostas apontando para negociações sintéticas e parte
 * sem vínculo nenhum — estado que ninguém saberia distinguir de "a migração ainda não rodou".
 *
 * O chamador é responsável por NÃO chamar isto quando `planejarVinculo` devolveu abortos.
 */
export async function executarVinculo(db: PrismaClient, planos: PlanoVinculo[]): Promise<ResultadoVinculo> {
  return db.$transaction(async (tx) => {
    let vinculadasAReal = 0;
    let vinculadasASintetica = 0;
    const negociacaoPorGrupo = new Map<string, string>();

    for (const plano of planos) {
      if (plano.tipo === "real") {
        await tx.proposta.update({
          where: { id: plano.propostaId },
          data: { negociacaoId: plano.negociacaoId },
        });
        vinculadasAReal++;
        continue;
      }

      let negociacaoId = negociacaoPorGrupo.get(plano.chaveGrupo);
      if (!negociacaoId) {
        const nova = await tx.negociacao.create({
          data: {
            titulo: plano.titulo,
            clienteId: plano.clienteId,
            leadId: plano.leadId,
            estagio: plano.estagio,
            valorEstimado: plano.valorEstimado,
            dataFechamento: plano.dataFechamento,
            // ADR-16: classificação derivada de dado incompleto espera conferência humana. As 8
            // negociações da F2.18 nasceram com a mesma marca, pelo mesmo motivo.
            needsReview: true,
          },
          select: { id: true },
        });
        negociacaoId = nova.id;
        negociacaoPorGrupo.set(plano.chaveGrupo, negociacaoId);
      }
      await tx.proposta.update({ where: { id: plano.propostaId }, data: { negociacaoId } });
      vinculadasASintetica++;
    }

    return { vinculadasAReal, vinculadasASintetica, negociacoesCriadas: negociacaoPorGrupo.size };
  });
}
