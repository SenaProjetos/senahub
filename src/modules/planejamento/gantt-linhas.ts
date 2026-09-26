/**
 * A grade do planejamento no molde do MS Project: as linhas na ordem da árvore (o "Id" 1, 2, 3…), recolher e
 * expandir níveis, e o texto das colunas Predecessoras e Nomes dos recursos.
 *
 * PURO. O número de uma linha é a posição dela na lista COMPLETA, sem filtro e sem nível recolhido — como o "Id"
 * do Project, que não muda quando você esconde linhas. É esse número que a coluna Predecessoras cita ("3TI+2d"):
 * não é o código da EAP (`1.2.3`, posição hierárquica) nem o índice da lista filtrada.
 */
import { calcularCodigos, type NoEap } from "./codigo-eap";

export type LinhaGrade<T> = {
  t: T;
  /** O "Id" do Project: 1-based, na ordem da árvore, da lista completa. */
  numero: number;
  /** Código da EAP (`1.2.3`). */
  codigo: string;
  /** Profundidade: raiz = 1. */
  nivel: number;
  temFilhos: boolean;
};

/** Ordena a árvore em profundidade (pai, depois os filhos por `ordem`) e numera. Órfã e ciclo viram raiz. */
export function montarGrade<T extends NoEap>(tarefas: readonly T[]): LinhaGrade<T>[] {
  const calc = calcularCodigos(tarefas.map((t) => ({ id: t.id, parentId: t.parentId, ordem: t.ordem })));
  const porId = new Map(tarefas.map((t) => [t.id, t]));
  return calc.map((c, i) => ({
    t: porId.get(c.id)!,
    numero: i + 1,
    codigo: c.codigo,
    nivel: c.nivel,
    // Tem filho quando a linha seguinte é mais funda: a mesma leitura que o motor faz da árvore em profundidade.
    temFilhos: i + 1 < calc.length && calc[i + 1].nivel > c.nivel,
  }));
}

/** Esconde os descendentes das linhas recolhidas. */
export function linhasVisiveis<T extends { id: string }>(
  grade: readonly LinhaGrade<T>[],
  recolhidos: ReadonlySet<string>,
): LinhaGrade<T>[] {
  const out: LinhaGrade<T>[] = [];
  let ocultaAbaixoDe: number | null = null;
  for (const l of grade) {
    if (ocultaAbaixoDe != null) {
      if (l.nivel > ocultaAbaixoDe) continue;
      ocultaAbaixoDe = null;
    }
    out.push(l);
    if (l.temFilhos && recolhidos.has(l.t.id)) ocultaAbaixoDe = l.nivel;
  }
  return out;
}

/**
 * Filtro ativo (atrasadas, críticas, lookahead…): mostra só as linhas escolhidas, na ordem da árvore e SEM
 * esconder nível — uma linha que casou não pode sumir por estar dentro de um agrupamento recolhido.
 */
export function soAsDoFiltro<T extends { id: string }>(
  grade: readonly LinhaGrade<T>[],
  ids: ReadonlySet<string>,
): LinhaGrade<T>[] {
  return grade.filter((l) => ids.has(l.t.id));
}

/**
 * O que o menu da linha precisa saber sobre a posição dela na árvore: se existe uma irmã logo acima (no mesmo nível,
 * sem sair do agrupamento) e se ela é um marco, em que nível a linha está e quantas subtarefas tem. Sempre sobre a
 * grade COMPLETA — recolher ou filtrar não muda quem é a irmã de cima.
 */
export type ContextoDaLinha = { temIrmaAcima: boolean; irmaAcimaEMarco: boolean; nivel: number; subtarefas: number };

export function contextoDaLinha<T extends { id: string; marco?: boolean }>(
  grade: readonly LinhaGrade<T>[],
  indice: number,
): ContextoDaLinha {
  const l = grade[indice];
  let irma: LinhaGrade<T> | null = null;
  for (let i = indice - 1; i >= 0; i--) {
    if (grade[i].nivel < l.nivel) break; // saiu do agrupamento: não há irmã acima
    if (grade[i].nivel === l.nivel) {
      irma = grade[i];
      break;
    }
  }
  let subtarefas = 0;
  for (let i = indice + 1; i < grade.length && grade[i].nivel > l.nivel; i++) subtarefas++;
  return { temIrmaAcima: irma != null, irmaAcimaEMarco: !!irma?.t.marco, nivel: l.nivel, subtarefas };
}

/** Ids das linhas que têm filhos — o que "recolher tudo" recolhe. */
export function idsComFilhos<T extends { id: string }>(grade: readonly LinhaGrade<T>[]): string[] {
  return grade.filter((l) => l.temFilhos).map((l) => l.t.id);
}

// ─────────────────────────────────────────────────────────────
// Predecessoras: "3TI+2d;5"
// ─────────────────────────────────────────────────────────────

export type TipoVinculo = "fs" | "ss" | "ff" | "sf";
export type Vinculo = { predecessoraId: string; tipo: TipoVinculo; lagDias: number };

/**
 * Como o vínculo se escreve. `pt`: TI (término→início), II, TT, IT — o Project em português. `en`: FS, SS, FF, SF.
 * A leitura aceita os dois, e a tela mostra o que estiver aqui: trocar de idioma é mudar esta constante.
 */
export type IdiomaVinculo = "pt" | "en";
export const IDIOMA_VINCULO: IdiomaVinculo = "pt";

const SIGLA: Record<IdiomaVinculo, Record<TipoVinculo, string>> = {
  en: { fs: "FS", ss: "SS", ff: "FF", sf: "SF" },
  pt: { fs: "TI", ss: "II", ff: "TT", sf: "IT" },
};
const TIPO_DA_SIGLA: Record<string, TipoVinculo> = { fs: "fs", ti: "fs", ss: "ss", ii: "ss", ff: "ff", tt: "ff", sf: "sf", it: "sf" };

const numeroBr = (n: number) => String(Math.abs(n)).replace(".", ",");

/** `+2d`, `-1d`, `+1,5d`; vazio para zero. Atraso é sempre em dias ÚTEIS. */
export function formatarLag(lagDias: number): string {
  if (!lagDias) return "";
  return `${lagDias > 0 ? "+" : "-"}${numeroBr(lagDias)}d`;
}

/**
 * `3` (término→início sem atraso), `3TI+2d`, `5II`, `2TT-1d`. Vínculos separados por `;`, em ordem de número.
 * Predecessora fora do conjunto (sem número) é ignorada.
 */
export function formatarPredecessoras(
  vinculos: readonly Vinculo[],
  numeroPorId: ReadonlyMap<string, number>,
  idioma: IdiomaVinculo = IDIOMA_VINCULO,
): string {
  return vinculos
    .map((v) => ({ n: numeroPorId.get(v.predecessoraId), v }))
    .filter((x): x is { n: number; v: Vinculo } => x.n != null)
    .sort((a, b) => a.n - b.n)
    .map(({ n, v }) => `${n}${v.tipo === "fs" && !v.lagDias ? "" : SIGLA[idioma][v.tipo]}${formatarLag(v.lagDias)}`)
    .join(";");
}

export type ResultadoPredecessoras = { ok: true; vinculos: Vinculo[] } | { ok: false; erro: string };

const TOKEN = /^(\d+)\s*(fs|ss|ff|sf|ti|ii|tt|it)?\s*(?:([+-])\s*(\d+(?:[.,]\d+)?)\s*(?:d|dia|dias)?)?$/i;

/**
 * Lê o texto da célula Predecessoras. Aceita `3`, `3TI`, `3FS+2d`, `3II-1 dia`, vários separados por `;` (ou por
 * vírgula, quando não há atraso decimal). `idPorNumero` é o "Id" → id da linha, da lista COMPLETA; `propriaId`
 * é a linha que está sendo editada (não pode citar a si mesma). Vazio = sem predecessoras.
 *
 * Só valida o que dá para ver no texto. Ciclo (A depende de B que depende de A) só o servidor enxerga.
 */
export function lerPredecessoras(
  texto: string,
  idPorNumero: ReadonlyMap<number, string>,
  propriaId: string,
): ResultadoPredecessoras {
  const limpo = texto.trim();
  if (!limpo) return { ok: true, vinculos: [] };
  const virgulaSepara = !limpo.includes(";") && !/[+-]\s*\d+,\d/.test(limpo);
  const partes = limpo.split(virgulaSepara ? /[;,]/ : ";").map((p) => p.trim()).filter(Boolean);

  const vistos = new Set<number>();
  const vinculos: Vinculo[] = [];
  for (const parte of partes) {
    const m = TOKEN.exec(parte);
    if (!m) {
      const tipoDeAtraso = /[+-]\s*\d/.test(parte);
      return {
        ok: false,
        erro: tipoDeAtraso
          ? `Não entendi "${parte}". O atraso é em dias úteis, como 3TI+2d.`
          : `Não entendi "${parte}". Use o número da tarefa, o tipo (TI, II, TT, IT) e o atraso, como 3TI+2d.`,
      };
    }
    const numero = Number(m[1]);
    const id = idPorNumero.get(numero);
    if (!id) return { ok: false, erro: `Não existe a tarefa ${numero}.` };
    if (id === propriaId) return { ok: false, erro: "Uma tarefa não pode ser predecessora de si mesma." };
    if (vistos.has(numero)) return { ok: false, erro: `A tarefa ${numero} aparece duas vezes.` };
    vistos.add(numero);
    const lag = m[4] ? Number(m[4].replace(",", ".")) * (m[3] === "-" ? -1 : 1) : 0;
    vinculos.push({ predecessoraId: id, tipo: m[2] ? TIPO_DA_SIGLA[m[2].toLowerCase()] : "fs", lagDias: lag });
  }
  return { ok: true, vinculos };
}

// ─────────────────────────────────────────────────────────────
// Células editáveis: duração e % concluído
// ─────────────────────────────────────────────────────────────

export type ResultadoDuracao = { ok: true; marco: true } | { ok: true; marco: false; dias: number } | { ok: false; erro: string };

const DURACAO = /^(\d+(?:[.,]\d+)?)\s*(?:d|dia|dias)?$/i;

/**
 * Lê a célula Duração como o Project: `5`, `5d`, `5 dias`, `1,5`; `0` (ou "marco") torna a linha um marco.
 * Sempre em dias ÚTEIS — o servidor recusa o resto. Não decide se a linha PODE virar marco (agrupamento não vira,
 * linha com horas exige zerá-las): isso é `regrasDeEdicao`, no servidor.
 */
export function lerDuracao(texto: string): ResultadoDuracao {
  const t = texto.trim().toLowerCase();
  if (t === "marco") return { ok: true, marco: true };
  const m = DURACAO.exec(t);
  if (!m) return { ok: false, erro: "Informe a duração em dias úteis, como 5 ou 5d — ou 0 para virar marco." };
  const n = Number(m[1].replace(",", "."));
  if (n === 0) return { ok: true, marco: true };
  if (n > 9999) return { ok: false, erro: "Duração grande demais — divida a atividade." };
  return { ok: true, marco: false, dias: n };
}

/** Lê a célula % concluído: `60` ou `60%`, de 0 a 100, inteiro. */
export function lerPercentual(texto: string): { ok: true; valor: number } | { ok: false; erro: string } {
  const m = /^(\d{1,3})\s*%?$/.exec(texto.trim());
  if (!m) return { ok: false, erro: "Informe o % concluído, de 0 a 100." };
  const n = Number(m[1]);
  return n > 100 ? { ok: false, erro: "O % concluído vai de 0 a 100." } : { ok: true, valor: n };
}

// ─────────────────────────────────────────────────────────────
// Nomes dos recursos
// ─────────────────────────────────────────────────────────────

/**
 * O que a coluna Recursos mostra: as pessoas separadas por `;` e, para vaga sem pessoa, o perfil entre
 * parênteses ("(Projetista)"). Linha de terceiro começa por "terceiro".
 *
 * O recurso "Externo" (decisão #1) NÃO entra como perfil: ele não é vaga esperando gente, é a marca de
 * que a linha é executada fora da casa — escrever "(Externo)" faria parecer que falta escalar alguém.
 * Quem da casa acompanha a etapa aparece depois da marca ("terceiro; Maria").
 */
export function textoRecursos(
  atribuicoes: readonly { nome: string | null; papel?: string; rotuloPapel: string }[],
  deTerceiro: boolean,
): string {
  const daCasa = atribuicoes.filter((a) => a.papel !== "ext").map((a) => a.nome ?? `(${a.rotuloPapel})`);
  if (deTerceiro) return ["terceiro", ...daCasa].join("; ");
  return daCasa.join("; ");
}
