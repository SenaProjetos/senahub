/**
 * Leitor do XML do MS Project (MSPDI) — PURO: recebe o texto do arquivo e devolve a estrutura, sem
 * tocar em banco, disco ou rede. Quem grava é `modelos/service.ts`; quem interpreta a hierarquia em
 * linhas de EAP é `modelos/mapeamento.ts`.
 *
 * O que o SenaHub aproveita do arquivo: a ÁRVORE (nível de estrutura de tópicos), o nome, a duração,
 * o marco e as dependências com tipo e atraso. Nada mais — e é de propósito:
 *
 * - **Datas não vêm.** No SenaHub as datas são do motor (duração + vínculo + calendário). Importar as
 *   datas do Project traria o cronograma de OUTRO projeto, que começou em outro dia.
 * - **Horas não vêm.** No arquivo de referência da casa, as 159 atribuições têm `Work` IGUAL à duração
 *   e apontam para o recurso −65535 (o "sem recurso" do Project): é o padrão da ferramenta (um recurso
 *   a 100% pela duração), não uma estimativa de alguém. Importar isso inventaria hora prevista.
 * - **Recursos não vêm.** São pessoas de outro projeto; a equipe é decisão do projeto novo (mesma
 *   regra da duplicação de projeto).
 *
 * Unidades do MSPDI, que não são óbvias:
 * - `Duration` e `Work` são ISO-8601 (`PT800H0M0S` = 800 horas). A hora só vira DIA dividindo pela
 *   jornada do arquivo (`MinutesPerDay`, tipicamente 480) — sem isso, 800 h "viram" 800 dias.
 * - `LinkLag` é em DÉCIMOS DE MINUTO (4800 = 480 min = 1 dia com jornada de 8 h). Negativo é
 *   adiantamento (lead), que o SenaHub aceita como atraso negativo.
 */
import { XMLParser } from "fast-xml-parser";

export type TipoVinculo = "fs" | "ss" | "ff" | "sf";

export type LinhaMspdi = {
  /** `UID` do arquivo — é por ele que os vínculos se referem, não pelo `ID` (que é a posição). */
  uid: string;
  /** `OutlineLevel`: 1 = raiz. É o que dá a árvore, já que o arquivo é uma lista plana em ordem. */
  nivel: number;
  nome: string;
  /** `WBS` do Project ("1.2.3") — só para a pessoa reconhecer a linha na tela de conferência. */
  wbs: string | null;
  /** Tem filhas (o Project chama de "tarefa de resumo"). */
  resumo: boolean;
  marco: boolean;
  /** Dias ÚTEIS, derivados das horas pela jornada do arquivo. Marco = 0. */
  duracaoDias: number;
  predecessoras: { uid: string; tipo: TipoVinculo; lagDias: number }[];
};

export type ArquivoMspdi = {
  /** `Title` do arquivo, ou o `Name`; é a sugestão de nome do modelo. */
  titulo: string | null;
  /** Jornada do arquivo em minutos (`MinutesPerDay`). */
  minutosPorDia: number;
  linhas: LinhaMspdi[];
  /**
   * O que foi ignorado ou convertido com ressalva — a tela de conferência MOSTRA isto. Silenciar
   * seria pior que recusar o arquivo: a pessoa aprovaria um modelo sem saber o que ficou de fora.
   */
  avisos: string[];
};

/** `Type` do `PredecessorLink` no MSPDI. */
const TIPO_VINCULO: Record<string, TipoVinculo> = { "0": "ff", "1": "fs", "2": "sf", "3": "ss" };

/**
 * `DurationFormat` de duração DECORRIDA (dia corrido, que anda no fim de semana). O SenaHub só tem
 * dia útil (D8: um calendário da empresa), então a linha é convertida e a pessoa avisada.
 */
const FORMATOS_DECORRIDOS = new Set(["4", "6", "8", "10", "12"]);

/** `LagFormat` percentual: atraso "20% da duração da predecessora", que o motor não tem. */
const LAG_PERCENTUAL = new Set(["19", "20"]);

class ArquivoInvalido extends Error {}

/** Horas de um período ISO-8601 (`PT8H30M0S`). Devolve 0 no que não reconhece. */
export function horasIso(texto: string | null | undefined): number {
  if (!texto) return 0;
  const m = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(
    texto.trim(),
  );
  if (!m) return 0;
  const [, dias, horas, minutos, segundos] = m;
  // `D` num período do MSPDI é dia de 24 h; não aparece em arquivo do Project, mas se aparecer é
  // melhor contar do que descartar em silêncio.
  return Number(dias ?? 0) * 24 + Number(horas ?? 0) + Number(minutos ?? 0) / 60 + Number(segundos ?? 0) / 3600;
}

/** Arredonda em 2 casas — o mesmo `Decimal(6,2)` de `EapTarefa.duracaoDias`. */
const duas = (n: number) => Math.round(n * 100) / 100;

const texto = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);

/**
 * Lê o XML e devolve as linhas em ORDEM DE ARQUIVO (que é o que dá sentido ao nível de estrutura).
 *
 * Recusa, com mensagem para a tela: arquivo que não é XML do Project, arquivo sem tarefa e arquivo
 * com `DOCTYPE`/`ENTITY` (expansão de entidade — um XML de 1 KB que estoura a memória do servidor).
 */
export function lerMspdi(xml: string): ArquivoMspdi {
  if (!xml || xml.trim() === "") throw new ArquivoInvalido("O arquivo está vazio.");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new ArquivoInvalido("O arquivo declara DOCTYPE ou ENTITY e não pode ser lido por segurança. Exporte de novo do MS Project (Salvar como → XML).");
  }

  const parser = new XMLParser({
    ignoreAttributes: true,
    // Tudo como texto: `Duration`, `WBS` e `UID` são strings ("1.2.3" viraria número, "0.5" perderia
    // o sentido, e o UID 0 do resumo do projeto ficaria indistinguível de vazio.
    parseTagValue: false,
    trimValues: true,
    isArray: (nome, jpath) =>
      jpath === "Project.Tasks.Task" ||
      jpath === "Project.Tasks.Task.PredecessorLink" ||
      jpath === "Project.Resources.Resource" ||
      jpath === "Project.Calendars.Calendar",
  });

  let raiz: Record<string, unknown>;
  try {
    raiz = parser.parse(xml) as Record<string, unknown>;
  } catch {
    throw new ArquivoInvalido("Não foi possível ler o arquivo: ele não parece ser um XML válido.");
  }

  const projeto = raiz?.Project as Record<string, unknown> | undefined;
  if (!projeto) {
    throw new ArquivoInvalido("Este XML não é um arquivo do MS Project (não tem a seção Project).");
  }

  const avisos: string[] = [];
  const minutosPorDia = Number(texto(projeto.MinutesPerDay) ?? 480) || 480;
  if (texto(projeto.MinutesPerDay) == null) {
    avisos.push("O arquivo não informa a jornada diária; as durações foram convertidas considerando 8 horas por dia.");
  }
  if (texto(projeto.ScheduleFromStart) === "0") {
    avisos.push("O arquivo é agendado a partir do TÉRMINO. O modelo guarda só a estrutura e as durações, então isso não muda nada aqui — mas confira as durações.");
  }

  const tarefas = lista((projeto.Tasks as Record<string, unknown> | undefined)?.Task);
  if (tarefas.length === 0) throw new ArquivoInvalido("O arquivo não tem nenhuma tarefa.");

  const horasPorDia = minutosPorDia / 60;
  const linhas: LinhaMspdi[] = [];
  let nulas = 0;
  let inativas = 0;
  let decorridas = 0;

  for (const bruta of tarefas as Record<string, unknown>[]) {
    const uid = texto(bruta.UID);
    // UID 0 é o resumo do PROJETO (a linha "1" do Project, que não é tarefa). A raiz da EAP no
    // SenaHub é o próprio projeto, então ela não vem.
    if (uid == null || uid === "0") continue;
    if (texto(bruta.IsNull) === "1") {
      nulas++;
      continue;
    }
    // `Active` = 0 é a tarefa inativa do Project: ela não agenda nada. O motor do SenaHub não tem
    // esse estado, e trazê-la como tarefa normal ESTICARIA o cronograma de todo projeto que usar o
    // modelo.
    if (texto(bruta.Active) === "0") {
      inativas++;
      continue;
    }

    const marco = texto(bruta.Milestone) === "1";
    const resumo = texto(bruta.Summary) === "1";
    if (FORMATOS_DECORRIDOS.has(texto(bruta.DurationFormat) ?? "")) decorridas++;

    const predecessoras: LinhaMspdi["predecessoras"] = [];
    for (const v of lista(bruta.PredecessorLink) as Record<string, unknown>[]) {
      const pred = texto(v.PredecessorUID);
      if (pred == null || pred === "0") continue;
      const tipo = TIPO_VINCULO[texto(v.Type) ?? "1"] ?? "fs";
      const formato = texto(v.LagFormat) ?? "";
      let lagDias = 0;
      if (LAG_PERCENTUAL.has(formato)) {
        avisos.push(`A tarefa "${texto(bruta.Name) ?? uid}" tem um vínculo com atraso em PORCENTAGEM, que o SenaHub não tem: o atraso entrou como zero.`);
      } else {
        // Décimos de minuto → dias úteis da jornada do arquivo.
        lagDias = duas(Number(texto(v.LinkLag) ?? 0) / 10 / minutosPorDia);
      }
      predecessoras.push({ uid: pred, tipo, lagDias });
    }

    linhas.push({
      uid,
      nivel: Math.max(1, Number(texto(bruta.OutlineLevel) ?? 1) || 1),
      nome: texto(bruta.Name) ?? "(sem nome)",
      wbs: texto(bruta.WBS),
      resumo,
      marco,
      // Resumo não tem duração própria (o motor a deriva das filhas); marco é sempre 0.
      duracaoDias: resumo || marco ? 0 : Math.max(0, duas(horasIso(texto(bruta.Duration)) / horasPorDia)),
      predecessoras,
    });
  }

  if (linhas.length === 0) throw new ArquivoInvalido("O arquivo não tem nenhuma tarefa aproveitável (todas estão vazias ou inativas).");

  if (nulas > 0) avisos.push(`${nulas} linha(s) em branco do arquivo foram ignoradas.`);
  if (inativas > 0) avisos.push(`${inativas} tarefa(s) inativa(s) do MS Project foram ignoradas — o SenaHub não tem tarefa inativa.`);
  if (decorridas > 0) {
    avisos.push(`${decorridas} tarefa(s) usam duração em dias CORRIDOS no MS Project. No SenaHub a duração é sempre em dias úteis, então elas ficarão mais longas no calendário — confira.`);
  }

  // Vínculo que aponta para tarefa que não veio (nula, inativa, ou o resumo do projeto) não pode
  // ficar apontando para o nada.
  const conhecidos = new Set(linhas.map((l) => l.uid));
  let orfaos = 0;
  for (const l of linhas) {
    const antes = l.predecessoras.length;
    l.predecessoras = l.predecessoras.filter((p) => conhecidos.has(p.uid) && p.uid !== l.uid);
    orfaos += antes - l.predecessoras.length;
  }
  if (orfaos > 0) avisos.push(`${orfaos} dependência(s) apontavam para tarefas que não vieram e foram descartadas.`);

  return {
    titulo: texto(projeto.Title) ?? texto(projeto.Name),
    minutosPorDia,
    linhas,
    avisos,
  };
}
