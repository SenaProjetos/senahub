import type { Temperatura } from "@/generated/prisma/client";
import { ehTemperatura } from "@/modules/comercial/temperatura";

/**
 * Filtros compartilhados pelos dois boards (F2.15). Puro: transforma os `searchParams` da URL num
 * objeto validado, e daí em `where` do Prisma. Sem I/O e com relógio injetado, então o recorte de
 * período é testável em vez de depender do dia em que o teste roda.
 *
 * A URL é a fonte de verdade — não há estado de filtro em memória. É isso que faz "copiar a URL e
 * abrir noutra aba reproduz o filtro" funcionar de graça, que é o aceite da tarefa: a página é um
 * Server Component que lê `searchParams`, então a aba nova renderiza já filtrada, sem hidratação
 * nem efeito.
 *
 * Chaves curtas (`resp`, `camp`, `canal`…) porque elas aparecem na URL que as pessoas copiam e
 * colam em conversa.
 */

/** Períodos oferecidos. `null` = sem recorte (o padrão). */
export const PERIODOS = ["7d", "30d", "90d", "12m"] as const;
export type Periodo = (typeof PERIODOS)[number];

export const PERIODO_LABEL: Record<Periodo, string> = {
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
  "12m": "Últimos 12 meses",
};

const PERIODO_DIAS: Record<Periodo, number> = { "7d": 7, "30d": 30, "90d": 90, "12m": 365 };

export type FiltrosComerciais = {
  responsavelId: string | null;
  campanhaId: string | null;
  canalId: string | null;
  clienteId: string | null;
  temperatura: Temperatura | null;
  periodo: Periodo | null;
  disciplinaId: string | null;
};

const ehPeriodo = (v: string | undefined): v is Periodo =>
  v != null && (PERIODOS as readonly string[]).includes(v);

/** Um valor de searchParam pode chegar como array quando a chave se repete na URL. */
function primeiro(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  const t = s?.trim();
  return t ? t : undefined;
}

/**
 * Lê os filtros da URL. Valor inválido é tratado como AUSENTE, nunca como erro: a URL é editável
 * por qualquer pessoa, e um `?temp=BANANA` colado errado deve mostrar a lista completa, não uma
 * tela de erro.
 */
export function lerFiltros(sp: Record<string, string | string[] | undefined>): FiltrosComerciais {
  const temp = primeiro(sp.temp);
  const per = primeiro(sp.periodo);
  return {
    responsavelId: primeiro(sp.resp) ?? null,
    campanhaId: primeiro(sp.camp) ?? null,
    canalId: primeiro(sp.canal) ?? null,
    clienteId: primeiro(sp.empresa) ?? null,
    temperatura: ehTemperatura(temp) ? temp : null,
    periodo: ehPeriodo(per) ? per : null,
    disciplinaId: primeiro(sp.disc) ?? null,
  };
}

export function temFiltroAtivo(f: FiltrosComerciais): boolean {
  return Object.values(f).some((v) => v !== null);
}

/** Início do recorte de período, ou `null` quando não há recorte. Relógio injetado. */
export function inicioDoPeriodo(periodo: Periodo | null, agora: Date): Date | null {
  if (!periodo) return null;
  return new Date(agora.getTime() - PERIODO_DIAS[periodo] * 86_400_000);
}

/**
 * `where` do Prisma para PROSPECÇÃO. Campos ausentes viram `undefined`, que o Prisma ignora —
 * por isso não há `if` para cada filtro.
 *
 * `disciplinaId` não entra aqui de propósito: prospecção não tem disciplinas (só a negociação
 * tem, via `NegociacaoDisciplina`). Filtrar por disciplina numa prospecção devolveria vazio
 * sempre, o que pareceria bug.
 */
export function whereProspeccao(f: FiltrosComerciais, agora: Date) {
  const desde = inicioDoPeriodo(f.periodo, agora);
  return {
    responsavelId: f.responsavelId ?? undefined,
    campaignId: f.campanhaId ?? undefined,
    canalId: f.canalId ?? undefined,
    clienteId: f.clienteId ?? undefined,
    temperatura: f.temperatura ?? undefined,
    createdAt: desde ? { gte: desde } : undefined,
  };
}

/** `where` do Prisma para NEGOCIAÇÃO — igual, mais o filtro por disciplina. */
export function whereNegociacao(f: FiltrosComerciais, agora: Date) {
  const desde = inicioDoPeriodo(f.periodo, agora);
  return {
    responsavelId: f.responsavelId ?? undefined,
    campaignId: f.campanhaId ?? undefined,
    canalId: f.canalId ?? undefined,
    clienteId: f.clienteId ?? undefined,
    temperatura: f.temperatura ?? undefined,
    createdAt: desde ? { gte: desde } : undefined,
    disciplinas: f.disciplinaId ? { some: { disciplinaId: f.disciplinaId } } : undefined,
  };
}
