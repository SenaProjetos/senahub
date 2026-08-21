import type { TipoAtividade, TipoProximaAcao } from "@/generated/prisma/client";

/**
 * Ponte entre os dois enums de "tipo" do Comercial (F2.11).
 *
 * `TipoProximaAcao` (F2.1b) descreve a AÇÃO A FAZER — 12 valores operacionais, alguns sem
 * equivalente comunicacional (`ENVIAR_PROPOSTA`, `COBRAR_DOCUMENTACAO`…). `TipoAtividade` (F3.1)
 * descreve o CANAL pelo qual algo foi registrado na timeline — mais estreito, focado em
 * comunicação. Os dois nunca deveriam ser o mesmo enum: a Próxima Ação é um lembrete futuro, a
 * Atividade é o registro do que já aconteceu.
 *
 * O que não tem equivalente direto vira `NOTA` — é o catch-all correto: o texto da atividade
 * (`descricao`) já carrega o título da ação concluída, então nada se perde, só a granularidade do
 * "canal" some para esses casos.
 */
export function tipoAtividadeDe(tipo: TipoProximaAcao): TipoAtividade {
  switch (tipo) {
    case "LIGACAO":
      return "LIGACAO";
    case "WHATSAPP":
      return "WHATSAPP";
    case "EMAIL":
      return "EMAIL";
    case "LINKEDIN":
      return "LINKEDIN";
    case "REUNIAO":
      return "REUNIAO";
    default:
      // FOLLOW_UP, COBRAR_DOCUMENTACAO, COBRAR_ARQUITETURA, ENVIAR_PROPOSTA, REVISAR_PROPOSTA,
      // RETORNO_AO_CLIENTE, OUTRO — nenhum é um "canal" no sentido de TipoAtividade.
      return "NOTA";
  }
}

export type ItemTimeline = {
  id: string;
  nota: string;
  createdAt: Date;
  autor: { name: string | null } | null;
};

/**
 * Mescla o histórico legado (`AtividadeLead`, texto livre em `nota`) com a timeline nova
 * (`Atividade`, em `descricao`) num único array ordenado do mais recente para o mais antigo.
 *
 * Pura — recebe os dois arrays já carregados pela query, não faz I/O. É o mínimo necessário para
 * a tela de detalhe do lead mostrar os dois períodos juntos (F2.11); a consolidação de verdade,
 * com scroll infinito e um componente reutilizável, é a F3.6 — este merge não tenta antecipá-la.
 */
export function mesclarTimeline(
  legado: { id: string; nota: string; createdAt: Date; autor: { name: string | null } }[],
  nova: { id: string; descricao: string; createdAt: Date; autor: { name: string | null } }[],
): ItemTimeline[] {
  const itens: ItemTimeline[] = [
    ...legado.map((a) => ({ id: a.id, nota: a.nota, createdAt: a.createdAt, autor: a.autor })),
    ...nova.map((a) => ({ id: a.id, nota: a.descricao, createdAt: a.createdAt, autor: a.autor })),
  ];
  return itens.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * "Última interação" (F2.11) — NÃO é uma coluna no banco, é derivada: o `createdAt` do item mais
 * recente da timeline. Não depende do array já vir ordenado (calcula o máximo de qualquer jeito),
 * porque um contrato implícito "chame só depois de ordenar" é o tipo de coisa que quebra em
 * silêncio quando alguém reusa a função noutro lugar.
 */
export function ultimaInteracaoDe(timeline: { createdAt: Date }[]): Date | null {
  if (timeline.length === 0) return null;
  return timeline.reduce((max, t) => (t.createdAt > max ? t.createdAt : max), timeline[0].createdAt);
}
