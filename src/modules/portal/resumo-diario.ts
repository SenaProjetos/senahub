/**
 * Resumo diário do portal (spec docs/superpowers/specs/2026-11-19-portal-resumo-diario-design.md). Puro: decide QUAIS
 * dias uma rodada avalia e monta o texto do e-mail e do sino a partir da linha do tempo (`linhaDoTempo`), a mesma da
 * tela — o aviso nunca fala de algo que o portal não mostra.
 *
 * Cada dia é avaliado UMA vez (`ultimoDia`): item que aparece depois com data de um dia já avaliado não gera e-mail
 * atrasado. Recupera no máximo `limite` dias (servidor fora) e nunca antes de `desde` (o aviso ainda não estava ligado).
 */
/**
 * O que o resumo precisa de um item: o dia, o rótulo (disciplina ou "Agenda") e o texto. `ItemLinhaDoTempo` é atribuível a
 * isto. `seguro` = o texto já vem escapado para o Markdown (itens da agenda), então a lista não escapa de novo.
 */
export type ItemDoResumo = { dia: string; disciplina: string; texto: string; seguro?: boolean; puro?: string };

export const CHAVE_CONFIG_RESUMO = "portal.resumoDiario";
export type ConfigResumo = { ativo: boolean; desde: string | null; ultimoDia: string | null };
/** Sem linha de configuração: ligado (decisão do dono), ainda sem `desde` — a primeira rodada grava. */
export const CONFIG_RESUMO_PADRAO: ConfigResumo = { ativo: true, desde: null, ultimoDia: null };

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const diaOuNulo = (v: unknown): string | null | undefined => (v == null ? null : typeof v === "string" && DIA.test(v) ? v : undefined);

/** Lê o valor do `ConfigSistema`. Qualquer campo inválido devolve o padrão inteiro (melhor que meia configuração). */
export function normalizarConfigResumo(valor: unknown): ConfigResumo {
  if (!valor || typeof valor !== "object") return { ...CONFIG_RESUMO_PADRAO };
  const v = valor as Record<string, unknown>;
  const desde = diaOuNulo(v.desde);
  const ultimoDia = diaOuNulo(v.ultimoDia);
  if (typeof v.ativo !== "boolean" || desde === undefined || ultimoDia === undefined) return { ...CONFIG_RESUMO_PADRAO };
  return { ativo: v.ativo, desde, ultimoDia };
}

export function somarDiasIso(dia: string, n: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

const maior = (a: string, b: string) => (a > b ? a : b);

/** Dias de `max(desde, ultimoDia + 1, hoje − limite)` até ontem, em ordem. */
export function diasParaAvaliar(o: { hoje: string; desde: string | null; ultimoDia: string | null; limite?: number }): string[] {
  if (!o.desde) return [];
  let inicio = maior(o.desde, somarDiasIso(o.hoje, -(o.limite ?? 7)));
  if (o.ultimoDia) inicio = maior(inicio, somarDiasIso(o.ultimoDia, 1));
  const ontem = somarDiasIso(o.hoje, -1);
  const dias: string[] = [];
  for (let d = inicio; d <= ontem; d = somarDiasIso(d, 1)) dias.push(d);
  return dias;
}

/** Itens da linha do tempo por dia, só dos dias pedidos que têm item (na ordem da linha do tempo). */
export function itensDosDias<T extends ItemDoResumo>(linha: T[], dias: readonly string[]): Map<string, T[]> {
  const pedidos = new Set(dias);
  const porDia = new Map<string, T[]>();
  for (const i of linha) {
    if (!pedidos.has(i.dia)) continue;
    const lista = porDia.get(i.dia);
    if (lista) lista.push(i);
    else porDia.set(i.dia, [i]);
  }
  return porDia;
}

const dataBr = (dia: string) => dia.split("-").reverse().join("/");

export function periodoDoResumo(dias: readonly string[]): string {
  const ordem = [...dias].sort();
  const [primeiro, ultimo] = [ordem[0], ordem[ordem.length - 1]];
  return primeiro === ultimo ? dataBr(primeiro) : `${dataBr(primeiro)} a ${dataBr(ultimo)}`;
}

/** Escapa o que o Markdown do e-mail interpretaria em texto vindo do banco. */
export function escaparMarkdown(s: string): string {
  return s.replace(/[\\`*_[\]<>#|]/g, (c) => `\\${c}`);
}

const linhaDoItem = (i: ItemDoResumo) => `- **${escaparMarkdown(i.disciplina)}** · ${i.seguro ? i.texto : escaparMarkdown(i.texto)}`;
const diasEmOrdem = (porDia: ReadonlyMap<string, ItemDoResumo[]>) => [...porDia.keys()].sort();

/** Uma linha por item; com mais de um dia, um subtítulo por dia, do mais antigo para o mais novo. */
export function listaEmMarkdown(porDia: ReadonlyMap<string, ItemDoResumo[]>): string {
  const dias = diasEmOrdem(porDia);
  if (dias.length === 1) return porDia.get(dias[0])!.map(linhaDoItem).join("\n");
  return dias.map((d) => `**${dataBr(d)}**\n\n${porDia.get(d)!.map(linhaDoItem).join("\n")}`).join("\n\n");
}

/** Corpo do sino: o primeiro item (do dia mais antigo) e quantos mais. */
export function textoDoSino(porDia: ReadonlyMap<string, ItemDoResumo[]>): string {
  const itens = diasEmOrdem(porDia).flatMap((d) => porDia.get(d)!);
  if (itens.length === 0) return "";
  // O texto da agenda pode ter uma segunda linha (motivo): o sino mostra só a primeira.
  const primeiro = `${itens[0].disciplina} · ${(itens[0].puro ?? itens[0].texto).split("\n")[0]}`;
  return itens.length > 1 ? `${primeiro} e mais ${itens.length - 1}` : primeiro;
}
