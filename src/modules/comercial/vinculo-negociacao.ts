/**
 * Classificação "de qual negociação esta proposta nasceu" (F5.2, ADR-21). **Puro** — sem I/O:
 * recebe as propostas e o que se sabe dos leads, devolve o plano. O script
 * `scripts/migrar-proposta-negociacao-f52.ts` é só a casca que consulta o banco e executa.
 *
 * Existe separado porque é aqui que mora a DECISÃO, e ela tem cinco saídas (real, sintética
 * agrupada, sintética solta, e dois abortos) que precisam ser exercitadas sem depender de
 * fabricar o cenário certo no banco — mesma razão de `dedupe.ts` e `jornada.ts` serem puros.
 */
import type { EstagioNegociacao, StatusProposta } from "@/generated/prisma/client";

/**
 * Estágio da negociação sintética, derivado do status da proposta — não um default fixo.
 * Uma proposta aceita virando negociação em `LEVANTAMENTO` mentiria no board e no forecast da
 * Fase 6; é o mesmo cuidado que fez a F2.18 ler a etapa antiga em vez de assumir "Identificado".
 */
export const ESTAGIO_POR_STATUS_PROPOSTA: Record<StatusProposta, EstagioNegociacao> = {
  rascunho: "ORCAMENTO",
  enviada: "PROPOSTA_ENVIADA",
  // F5.5 — `em_negociacao` não existia quando este mapa foi escrito (F5.2); o TypeScript força
  // a entrada aqui assim que o enum ganha o valor, que é exatamente o ponto de usar `Record`
  // em vez de um `switch` com `default`.
  em_negociacao: "NEGOCIACAO",
  aceita: "CONTRATADO",
  recusada: "PERDIDO",
};

export type PropostaPendente = {
  id: string;
  numero: string;
  titulo: string;
  status: StatusProposta;
  clienteId: string;
  clienteNome: string;
  leadId: string | null;
  aceitaEm: Date | null;
  /** Soma dos itens; `null` quando a proposta não tem item nenhum (o caso de produção). */
  valorTotal: number | null;
};

export type LeadConhecido = { id: string; nome: string };
export type NegociacaoDoLead = {
  id: string;
  titulo: string;
  clienteId: string;
  leadId: string;
  /**
   * Soft delete (ADR-11). **Tem de vir preenchido** — quem carrega precisa usar o escape hatch
   * de `lib/prisma.ts` para enxergar as excluídas. Ver o 3º aborto em `planejarVinculo`.
   */
  excluidoEm: Date | null;
};

export type PlanoVinculo =
  | { tipo: "real"; propostaId: string; numero: string; negociacaoId: string; tituloNegociacao: string }
  | {
      tipo: "sintetica";
      propostaId: string;
      numero: string;
      /** Propostas com a mesma chave compartilham UMA negociação sintética. */
      chaveGrupo: string;
      clienteId: string;
      leadId: string | null;
      titulo: string;
      estagio: EstagioNegociacao;
      valorEstimado: number | null;
      dataFechamento: Date | null;
    };

export type ResultadoPlanejamento = {
  planos: PlanoVinculo[];
  /** Não vazio ⇒ NADA deve ser gravado. Cada string explica um caso que o script se recusa a adivinhar. */
  abortos: string[];
};

/**
 * Monta o plano de vínculo. **Se `abortos` voltar não-vazio, o chamador não grava nada** — nem
 * os planos que deram certo. É a forma que a F2.18 provou: recusar por inteiro em vez de migrar
 * a parte fácil e deixar a difícil para alguém descobrir depois.
 *
 * Os três casos que abortam:
 * 1. `leadId` aponta para lead inexistente (FK órfã — dado corrompido, não caso a tratar);
 * 2. o lead tem negociação, mas de um CLIENTE DIFERENTE do da proposta. Acontece de verdade
 *    depois de fusão de empresa (F1.14) — ligar mudaria de quem é o documento;
 * 3. a negociação do lead está SOFT-DELETADA. Ligar numa negociação excluída é tão errado
 *    quanto inventar uma; e criar sintética no lugar dela é pior ainda — `Negociacao.leadId` é
 *    `@unique` no BANCO, constraint que não sabe de `excluidoEm`, então a linha excluída ainda
 *    ocupa aquele `leadId` e o INSERT morre com `P2002` no meio da transação. Quem decide o que
 *    fazer (restaurar a negociação? desvincular o lead?) é gente, não este script.
 *
 * O que NÃO aborta, e vira sintética: proposta sem `leadId`, e lead que existe mas ainda não foi
 * qualificado. Nos dois não há o que adivinhar, há o que criar.
 */
export function planejarVinculo(
  pendentes: PropostaPendente[],
  leads: LeadConhecido[],
  negociacoesPorLead: NegociacaoDoLead[],
): ResultadoPlanejamento {
  const leadPorId = new Map(leads.map((l) => [l.id, l]));
  const negociacaoPorLead = new Map(negociacoesPorLead.map((n) => [n.leadId, n]));

  const planos: PlanoVinculo[] = [];
  const abortos: string[] = [];

  for (const p of pendentes) {
    if (p.leadId) {
      const lead = leadPorId.get(p.leadId);
      if (!lead) {
        abortos.push(`${p.numero}: leadId "${p.leadId}" não existe na tabela lead (FK órfã).`);
        continue;
      }
      const neg = negociacaoPorLead.get(p.leadId);
      if (neg) {
        if (neg.excluidoEm !== null) {
          abortos.push(
            `${p.numero}: o lead "${lead.nome}" tem uma negociação EXCLUÍDA ("${neg.titulo}", ` +
              `${neg.id}). Não dá para ligar nela, e criar uma sintética estouraria o índice único ` +
              `de leadId (o banco não enxerga soft delete). Restaure a negociação, ou desvincule o ` +
              `lead dela, e rode de novo.`,
          );
          continue;
        }
        if (neg.clienteId !== p.clienteId) {
          abortos.push(
            `${p.numero}: a proposta é do cliente ${p.clienteId} ("${p.clienteNome}"), mas a ` +
              `negociação do lead "${lead.nome}" é do cliente ${neg.clienteId}. O vínculo mudaria ` +
              `de quem é o documento — resolva à mão (fusão de empresa? F1.14).`,
          );
          continue;
        }
        planos.push({
          tipo: "real",
          propostaId: p.id,
          numero: p.numero,
          negociacaoId: neg.id,
          tituloNegociacao: neg.titulo,
        });
        continue;
      }
    }

    planos.push({
      tipo: "sintetica",
      propostaId: p.id,
      numero: p.numero,
      // Propostas do MESMO lead compartilham a sintética: além de ser o correto (duas propostas
      // do mesmo negócio), `Negociacao.leadId` é @unique e uma por proposta estouraria P2002.
      // Sem lead, cada proposta ganha a sua — não há como saber se são o mesmo negócio, e
      // chutar é o que este planejamento não faz.
      chaveGrupo: p.leadId ? `lead:${p.leadId}` : `proposta:${p.id}`,
      clienteId: p.clienteId,
      leadId: p.leadId,
      titulo: p.titulo,
      estagio: ESTAGIO_POR_STATUS_PROPOSTA[p.status],
      valorEstimado: p.valorTotal,
      dataFechamento: p.status === "aceita" ? p.aceitaEm : null,
    });
  }

  return { planos, abortos };
}
