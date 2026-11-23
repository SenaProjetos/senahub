/**
 * Agenda do portal — marcos de entrega e itens fixos do contrato (spec
 * docs/superpowers/specs/2026-11-23-portal-agenda-contrato-design.md). Puro: sem Prisma, sem I/O. Datas como `YYYY-MM-DD`
 * (dia de São Paulo); `Date` com hora só entra pelas colunas que a têm (`assinadoEm`, `prazoContrato`) e passa por
 * `diaDeSaoPaulo`.
 */
import { diaDeSaoPaulo } from "@/lib/data";

export const MOTIVO_AGENDA_NAO_ENCONTRADA = "Agenda não encontrada.";
export const MOTIVO_MARCO_ENTREGUE = "Este marco já foi entregue — a nota não aparece mais para o cliente.";
export const MOTIVO_SEM_NOTA = "Este marco não tem nota.";
export const MOTIVO_NOTA_VAZIA = "Escreva a nota.";
export const MOTIVO_NOTA_LONGA = "A nota passa de 500 caracteres.";
export const NOTA_MAX = 500;

export type ContratoEntrada = {
  id: string;
  titulo: string;
  tipo: string;
  statusContrato: string | null;
  formaCobranca: "por_data" | "por_entrega";
  clienteId: string | null;
  projetoId: string | null;
  vinculoId: string | null;
  assinadoEm: Date | null;
  dataVencimento: Date | null;
  parcelas: { id: string; descricao: string; ordem: number; naAssinatura: boolean; marcoId: string | null }[];
};

export type MarcoEntrada = { id: string; projetoId: string; status: string; fimPrevisto: string; fimReal: string | null };

export type EntradaDaAgenda = {
  projetoId: string;
  clienteId: string;
  prazoContrato: Date | null;
  cronograma: { aprovado: boolean; emRevisao: boolean } | null;
  contratos: ContratoEntrada[];
  marcos: ReadonlyMap<string, MarcoEntrada>;
  /** marcoId → fim da linha na BL-00 (a linha de base original). */
  combinado: ReadonlyMap<string, string>;
};

export type SituacaoDoMarco = "no_prazo" | "alterada" | "entregue" | "sem_combinado";

export type MarcoDaAgenda = {
  parcelaId: string;
  marcoId: string;
  titulo: string;
  combinado: string | null;
  /** Previsão atual; para marco entregue, o dia da entrega. */
  previsao: string;
  diferencaDias: number | null;
  situacao: SituacaoDoMarco;
  entregueEm: string | null;
  contratoTitulo: string;
};

export type ItemFixo = { tipo: "assinatura" | "prazo" | "vigencia"; dia: string; contratoTitulo?: string };

const STATUS_VIGENTES = new Set(["assinado", "vencido"]);

/** Contrato de cliente deste projeto e deste cliente, assinado ou vencido. Aditivo, proposta e procuração ficam fora. */
function contratoValido(c: ContratoEntrada, e: EntradaDaAgenda): boolean {
  return (
    c.tipo === "contrato" &&
    c.vinculoId == null &&
    c.clienteId === e.clienteId &&
    c.projetoId === e.projetoId &&
    STATUS_VIGENTES.has(c.statusContrato ?? "")
  );
}

const diaUtc = (dia: string) => {
  const [a, m, d] = dia.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
};

/** Dias corridos de `de` até `ate` (positivo = `ate` depois de `de`). */
export function diferencaEmDiasCorridos(de: string, ate: string): number {
  return Math.round((diaUtc(ate) - diaUtc(de)) / 86_400_000);
}

export function rotuloDiferenca(n: number): string {
  if (n === 0) return "no dia";
  const abs = Math.abs(n);
  const dias = `${abs} ${abs === 1 ? "dia" : "dias"}`;
  return n > 0 ? `+${dias}` : `${dias} antes`;
}

export function situacaoDoMarco(m: { concluido: boolean; combinado: string | null; previsao: string }): SituacaoDoMarco {
  if (m.concluido) return "entregue";
  if (m.combinado == null) return "sem_combinado";
  return m.previsao > m.combinado ? "alterada" : "no_prazo";
}

/**
 * Marcos que o cliente vê: contrato por entrega vigente, cronograma APROVADO (sem aprovação não há BL-00), parcela com
 * marco (não "na assinatura") do mesmo projeto. Uma linha por marco, com a descrição da parcela de menor ordem.
 */
export function marcosDaAgenda(e: EntradaDaAgenda): MarcoDaAgenda[] {
  if (!e.cronograma?.aprovado) return [];
  const candidatas = e.contratos
    .filter((c) => contratoValido(c, e) && c.formaCobranca === "por_entrega")
    .flatMap((c) => c.parcelas.filter((p) => !p.naAssinatura && p.marcoId != null).map((p) => ({ c, p })))
    .sort((a, b) => a.p.ordem - b.p.ordem || a.p.id.localeCompare(b.p.id));

  const vistos = new Set<string>();
  const marcos: MarcoDaAgenda[] = [];
  for (const { c, p } of candidatas) {
    const marcoId = p.marcoId as string;
    if (vistos.has(marcoId)) continue;
    const m = e.marcos.get(marcoId);
    if (!m || m.projetoId !== e.projetoId) continue;
    vistos.add(marcoId);
    const concluido = m.status === "con";
    const entregueEm = concluido ? (m.fimReal ?? m.fimPrevisto) : null;
    const previsao = entregueEm ?? m.fimPrevisto;
    const combinado = e.combinado.get(marcoId) ?? null;
    marcos.push({
      parcelaId: p.id,
      marcoId,
      titulo: p.descricao,
      combinado,
      previsao,
      diferencaDias: combinado ? diferencaEmDiasCorridos(combinado, previsao) : null,
      situacao: situacaoDoMarco({ concluido, combinado, previsao }),
      entregueEm,
      contratoTitulo: c.titulo,
    });
  }
  return marcos.sort((a, b) => a.previsao.localeCompare(b.previsao) || a.parcelaId.localeCompare(b.parcelaId));
}

/**
 * Só para a equipe: por que o contrato por entrega existe mas o cliente não vê marco. Nulo = nada a explicar (há marcos,
 * ou não há contrato por entrega).
 */
export function motivoSemMarcos(e: EntradaDaAgenda): string | null {
  if (marcosDaAgenda(e).length > 0) return null;
  const porEntrega = e.contratos.filter(
    (c) => c.tipo === "contrato" && c.vinculoId == null && c.clienteId === e.clienteId && c.projetoId === e.projetoId && c.formaCobranca === "por_entrega",
  );
  if (porEntrega.length === 0) return null;
  if (!porEntrega.some((c) => contratoValido(c, e))) return "O contrato ainda não foi assinado.";
  if (!e.cronograma?.aprovado) {
    return "O cronograma do projeto ainda está em rascunho — os marcos aparecem para o cliente quando ele for aprovado.";
  }
  return "As parcelas do contrato não têm marco do cronograma.";
}

/** Assinatura, prazo do projeto e fim da vigência: fatos, sem "Combinado × Previsão". */
export function itensFixos(e: EntradaDaAgenda): ItemFixo[] {
  const validos = e.contratos.filter((c) => contratoValido(c, e));
  const itens: ItemFixo[] = [];
  for (const c of validos) {
    if (c.assinadoEm) itens.push({ tipo: "assinatura", dia: diaDeSaoPaulo(c.assinadoEm), contratoTitulo: c.titulo });
  }
  if (e.prazoContrato) itens.push({ tipo: "prazo", dia: diaDeSaoPaulo(e.prazoContrato) });
  for (const c of validos) {
    // `dataVencimento` é @db.Date (meia-noite UTC): o dia certo é o do UTC, não o de São Paulo.
    if (c.dataVencimento) itens.push({ tipo: "vigencia", dia: c.dataVencimento.toISOString().slice(0, 10), contratoTitulo: c.titulo });
  }
  return itens;
}
