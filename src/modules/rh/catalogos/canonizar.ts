/**
 * Canonização de cargo/departamento de texto livre → itens de catálogo. **Puro, sem I/O.**
 *
 * Serve a dois consumidores: o dry-run (`scripts/dry-run-cargos.ts`), que reporta o que a
 * migração faria, e a própria migração da sub-etapa 2.1 — os dois precisam agrupar exatamente
 * igual, senão o relatório aprovado não descreve o que roda.
 *
 * Não usa `server-only` nem Prisma, como os demais núcleos puros do projeto (`health.ts`,
 * `encargos.ts`, `aquisitivo.ts`).
 */
import { chaveMatch, normalizarTexto } from "@/lib/import/valores";
import { SETOR_LABELS } from "@/modules/usuarios/vinculo/labels";

/** De onde veio o texto livre — muda quais ambiguidades se aplicam. */
export type OrigemValor = "user.cargo" | "user.departamento" | "vinculo.cargo";

/** Uma grafia crua e quantas pessoas a usam. */
export type Variante = { valorCru: string; n: number };

export type Grupo = {
  /** Chave de comparação (minúsculo, sem acento, espaços colapsados). */
  chave: string;
  /** Grafia sugerida como canônica: a mais frequente; empate resolve por `escoreGrafia`. */
  canonico: string;
  /** Soma das pessoas de todas as variantes. */
  total: number;
  /** Variantes ordenadas da mais para a menos frequente. */
  variantes: Variante[];
  /** Motivos que exigem decisão humana antes de migrar. Vazio = pode migrar direto. */
  ambiguidades: string[];
};

/** Separadores que sugerem dois valores espremidos num campo só ("Projetista / Fiscal"). */
const SEPARADORES = [" / ", "/", " | ", "|", ";", " e ", " - "];

/** Chaves dos setores (valor do enum + rótulo pt-BR) — departamento que casa é setor disfarçado. */
const CHAVES_SETOR = new Set<string>([
  ...Object.keys(SETOR_LABELS).map(chaveMatch),
  ...Object.values(SETOR_LABELS).map(chaveMatch),
]);

/** Conta ocorrências de cada grafia, ignorando nulos e strings em branco. */
export function contarValores(valores: (string | null | undefined)[]): Variante[] {
  const m = new Map<string, number>();
  for (const v of valores) {
    const t = (v ?? "").trim();
    if (!t) continue;
    m.set(t, (m.get(t) ?? 0) + 1);
  }
  return [...m].map(([valorCru, n]) => ({ valorCru, n }));
}

function ambiguidadesDe(canonico: string, chave: string, origem: OrigemValor): string[] {
  const out: string[] = [];
  const baixo = canonico.toLowerCase();
  if (SEPARADORES.some((s) => baixo.includes(s))) {
    out.push("parece conter mais de um valor num campo só");
  }
  if (/^\d+$/.test(canonico)) {
    out.push("só dígitos");
  }
  if (canonico.length < 3) {
    out.push("curto demais para virar item de catálogo");
  }
  if (origem === "user.departamento" && CHAVES_SETOR.has(chave)) {
    out.push("é um SETOR, não um departamento — decidir se vira Departamento ou fica só no enum");
  }
  return out;
}

/**
 * Qualidade da grafia para virar rótulo de catálogo: Capitalizada > MAIÚSCULA > minúscula.
 * Só decide empates de frequência — sem isso, `localeCompare` põe "projetista" antes de
 * "Projetista" (ICU ordena minúscula primeiro) e o catálogo nasceria em caixa baixa.
 */
function escoreGrafia(s: string): number {
  const temMaiuscula = s !== s.toLowerCase();
  const soMaiusculas = s === s.toUpperCase();
  if (temMaiuscula && !soMaiusculas) return 2;
  if (soMaiusculas && temMaiuscula) return 1;
  return 0;
}

/**
 * Tem acento/cedilha? Desempata depois da caixa: entre "Orçamentos" e "Orcamentos" (mesma
 * frequência, mesma caixa) a forma acentuada é a correta em pt-BR, e `localeCompare` sozinho
 * escolheria a sem acento por ordem alfabética.
 */
function temDiacritico(s: string): boolean {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "") !== s;
}

/**
 * Agrupa grafias equivalentes (caixa/acento/espaço) num item de catálogo e marca o que precisa
 * de decisão humana. Ordena por total desc, depois alfabético.
 */
export function agrupar(valores: Variante[], origem: OrigemValor): Grupo[] {
  const porChave = new Map<string, Variante[]>();
  for (const v of valores) {
    const chave = chaveMatch(v.valorCru);
    const lista = porChave.get(chave);
    if (lista) lista.push(v);
    else porChave.set(chave, [v]);
  }

  const grupos: Grupo[] = [];
  for (const [chave, variantes] of porChave) {
    variantes.sort(
      (a, b) =>
        b.n - a.n ||
        escoreGrafia(b.valorCru) - escoreGrafia(a.valorCru) ||
        Number(temDiacritico(b.valorCru)) - Number(temDiacritico(a.valorCru)) ||
        a.valorCru.localeCompare(b.valorCru, "pt-BR"),
    );
    const canonico = normalizarTexto(variantes[0]!.valorCru);
    grupos.push({
      chave,
      canonico,
      total: variantes.reduce((s, v) => s + v.n, 0),
      variantes,
      ambiguidades: ambiguidadesDe(canonico, chave, origem),
    });
  }
  grupos.sort((a, b) => b.total - a.total || a.canonico.localeCompare(b.canonico, "pt-BR"));
  return grupos;
}
