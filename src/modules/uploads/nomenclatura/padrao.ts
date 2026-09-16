/**
 * Padrão de nomenclatura do projeto (`NomenclaturaConfig.padrao`), em duas escritas:
 *
 * - **modelo** — `{proj}-{disc}-{fase}-{nº}-{tipo}[-{Rnn}]`, que é como as pessoas escreveram de
 *   verdade em produção. Vira regex com grupos nomeados, então o padrão do projeto passa a
 *   EXTRAIR campos, não só validar.
 * - **regex** — o que o campo aceitava antes. Se trouxer grupos nomeados conhecidos, também extrai.
 *
 * `{4}` e `{1,3}` continuam sendo quantificadores de regex: só conta como campo de modelo o que
 * tem letras entre chaves (mesma regra de `foraDoPadrao`).
 */

export type CampoPadrao = "proj" | "disc" | "fase" | "num" | "tipo" | "rev";

export type PadraoCompilado = {
  escrita: "modelo" | "regex";
  regex: RegExp;
  /** Tem grupos nomeados: dá para ler campos, não só dizer se casou. */
  extrai: boolean;
  campos: CampoPadrao[];
};

const CAMPO_DE_MODELO = /\{[A-Za-zÀ-ÿºª]+\}/;

/** Nomes aceitos dentro de `{}` para cada campo (pt-BR e abreviações vistas em produção). */
const NOMES_DE_CAMPO: Record<CampoPadrao, string[]> = {
  proj: ["proj", "projeto", "codigo", "obra", "empreendimento"],
  disc: ["disc", "disciplina", "esp", "especialidade"],
  fase: ["fase", "etapa"],
  num: ["n", "no", "nº", "num", "numero", "numeracao", "prancha", "folha"],
  tipo: ["tipo", "doc", "documento"],
  rev: ["r", "rev", "rnn", "rev nn", "revisao", "revnn"],
};

const PADRAO_DO_CAMPO: Record<CampoPadrao, string> = {
  proj: String.raw`\d{3,6}(?:[.-]\d{1,2})?`,
  disc: String.raw`[A-Za-zÀ-ÿ0-9]+`,
  fase: String.raw`[A-Za-zÀ-ÿ]+`,
  num: String.raw`\d{1,6}`,
  tipo: String.raw`[A-Za-zÀ-ÿ0-9]+`,
  // Cobre `{Rnn}` (o R vem no grupo) e `R{rev}` (o R é literal e sobra o número).
  rev: String.raw`(?:RV?|REV)?\d{1,3}`,
};

export function ehModelo(padrao: string): boolean {
  return CAMPO_DE_MODELO.test(padrao);
}

export function campoDe(nome: string): CampoPadrao | null {
  const chave = nome.trim().toLowerCase().replace(/\s+/g, " ");
  for (const [campo, nomes] of Object.entries(NOMES_DE_CAMPO) as [CampoPadrao, string[]][]) {
    if (nomes.includes(chave)) return campo;
  }
  return null;
}

const escapar = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * `[...]` no modelo = trecho opcional (`[-{Rnn}]`). Chaves com nome desconhecido viram grupo
 * anônimo permissivo: o padrão continua validando, só não extrai aquele pedaço.
 */
function compilarModelo(modelo: string): PadraoCompilado | null {
  const campos: CampoPadrao[] = [];
  let fonte = "";
  let i = 0;
  while (i < modelo.length) {
    const c = modelo[i];
    if (c === "[") {
      fonte += "(?:";
      i++;
    } else if (c === "]") {
      fonte += ")?";
      i++;
    } else if (c === "{") {
      const fim = modelo.indexOf("}", i);
      if (fim === -1) return null;
      const nome = modelo.slice(i + 1, fim);
      const campo = campoDe(nome);
      if (campo && !campos.includes(campo)) {
        campos.push(campo);
        fonte += `(?<${campo}>${PADRAO_DO_CAMPO[campo]})`;
      } else {
        fonte += String.raw`[A-Za-zÀ-ÿ0-9]+`;
      }
      i = fim + 1;
    } else {
      fonte += escapar(c);
      i++;
    }
  }
  // Modelo que não fala de revisão não está PROIBINDO revisão: o próprio gerador de código do
  // sistema (`codigoPrancha`) acrescenta `-Rnn` quando a revisão é > 0, então um nome com
  // sufixo de revisão continua conforme. Sem esta tolerância, o padrão global de produção
  // (`{proj}-{disc}-{fase}-{nº}-{tipo}`, sem revisão) marcaria como "fora do padrão" a família
  // mais comum do acervo (`…-DET-R00`) — trocaria um alerta falso por outro.
  const revisaoOpcional = campos.includes("rev") ? "" : String.raw`(?:[-_. ]?(?:RV?|REV)\d{1,3})?`;
  try {
    return {
      escrita: "modelo",
      regex: new RegExp(`^${fonte}${revisaoOpcional}$`, "i"),
      extrai: campos.length > 0,
      campos,
    };
  } catch {
    return null;
  }
}

function compilarRegex(padrao: string): PadraoCompilado | null {
  let regex: RegExp;
  try {
    regex = new RegExp(padrao);
  } catch {
    // Regex inválida não vira alerta em ninguém — mesma decisão de `foraDoPadrao`.
    return null;
  }
  const campos = (Object.keys(NOMES_DE_CAMPO) as CampoPadrao[]).filter((campo) =>
    new RegExp(String.raw`\(\?<${campo}>`).test(padrao),
  );
  return { escrita: "regex", regex, extrai: campos.length > 0, campos };
}

export function compilarPadrao(padrao: string | null | undefined): PadraoCompilado | null {
  const texto = padrao?.trim();
  if (!texto) return null;
  return ehModelo(texto) ? compilarModelo(texto) : compilarRegex(texto);
}

export type CamposDoPadrao = Partial<Record<CampoPadrao, string>>;

/** Roda o padrão contra o nome (já sem extensão) e devolve os campos lidos, ou `null` se não casou. */
export function aplicarPadrao(base: string, compilado: PadraoCompilado): CamposDoPadrao | null {
  const m = base.match(compilado.regex);
  if (!m) return null;
  const grupos = (m.groups ?? {}) as Record<string, string | undefined>;
  const campos: CamposDoPadrao = {};
  for (const campo of compilado.campos) {
    const valor = grupos[campo];
    if (valor) campos[campo] = valor;
  }
  return campos;
}

/**
 * Editor visual do padrão (F5): monta/lê um MODELO como blocos ordenados + um separador único,
 * sem exigir que ninguém escreva chave/colchete. Regex legada não entra aqui — nem todo modelo
 * de texto, só o subconjunto que dá pra representar como "campo, separador, campo...".
 */

/** Ordem de apresentação no seletor de blocos (não afeta o padrão gerado). */
export const CAMPOS_PADRAO: readonly CampoPadrao[] = ["proj", "disc", "fase", "num", "tipo", "rev"];

export const LABEL_CAMPO: Record<CampoPadrao, string> = {
  proj: "Projeto",
  disc: "Disciplina",
  fase: "Fase",
  num: "Número",
  tipo: "Tipo",
  rev: "Revisão",
};

/** Token que o editor SEMPRE emite para cada campo — é o que fecha a decisão de D-F5: uma
 *  única escrita para revisão (`{Rnn}`, nunca `R{rev}`), estendida aos demais por consistência. */
const TOKEN_CANONICO: Record<CampoPadrao, string> = {
  proj: "proj",
  disc: "disc",
  fase: "fase",
  num: "num",
  tipo: "tipo",
  rev: "Rnn",
};

export type BlocoModelo = { campo: CampoPadrao; opcional: boolean };
export type ModeloVisual = { blocos: BlocoModelo[]; separador: string };

type TokenModelo =
  | { tipo: "campo"; campo: CampoPadrao }
  | { tipo: "lit"; texto: string }
  | { tipo: "abre" }
  | { tipo: "fecha" };

function tokenizarModelo(modelo: string): TokenModelo[] | null {
  const tokens: TokenModelo[] = [];
  let i = 0;
  while (i < modelo.length) {
    const c = modelo[i];
    if (c === "{") {
      const fim = modelo.indexOf("}", i);
      if (fim === -1) return null;
      const campo = campoDe(modelo.slice(i + 1, fim));
      if (!campo) return null; // nome de campo desconhecido: fora do que o editor representa
      tokens.push({ tipo: "campo", campo });
      i = fim + 1;
    } else if (c === "[") {
      tokens.push({ tipo: "abre" });
      i++;
    } else if (c === "]") {
      tokens.push({ tipo: "fecha" });
      i++;
    } else {
      let j = i;
      while (j < modelo.length && !"{[]".includes(modelo[j])) j++;
      tokens.push({ tipo: "lit", texto: modelo.slice(i, j) });
      i = j;
    }
  }
  return tokens;
}

/**
 * Reconhece um modelo como blocos + separador único, ou `null` quando a escrita foge desse
 * formato exato — inclusive `R{rev}` (o "R" some no meio do separador, quebrando a regra do
 * separador único) e qualquer campo repetido ou desconhecido. `null` é o sinal para a tela
 * cair no modo avançado (texto), sem tentar converter.
 */
export function interpretarModeloVisual(padrao: string): ModeloVisual | null {
  if (!ehModelo(padrao)) return null;
  const tokens = tokenizarModelo(padrao);
  if (!tokens) return null;

  const blocos: BlocoModelo[] = [];
  let separador: string | null = null;
  let primeiro = true;

  function bateSeparador(lit: string): boolean {
    if (lit === "") return primeiro;
    if (separador === null) {
      separador = lit;
      return true;
    }
    return lit === separador;
  }

  function empilhar(campo: CampoPadrao, opcional: boolean): boolean {
    if (blocos.some((b) => b.campo === campo)) return false; // campo repetido: não representável
    blocos.push({ campo, opcional });
    primeiro = false;
    return true;
  }

  let i = 0;
  while (i < tokens.length) {
    const tk = tokens[i];
    if (tk.tipo === "campo") {
      if (!primeiro) return null; // campo sem separador antes dele, fora de colchete
      if (!empilhar(tk.campo, false)) return null;
      i++;
    } else if (tk.tipo === "lit") {
      if (!bateSeparador(tk.texto)) return null;
      i++;
      const campoTk = tokens[i];
      if (!campoTk || campoTk.tipo !== "campo") return null;
      if (!empilhar(campoTk.campo, false)) return null;
      i++;
    } else if (tk.tipo === "abre") {
      i++;
      let litDentro = "";
      if (tokens[i]?.tipo === "lit") {
        litDentro = (tokens[i] as { tipo: "lit"; texto: string }).texto;
        i++;
      }
      const campoTk = tokens[i];
      if (!campoTk || campoTk.tipo !== "campo") return null;
      if (!bateSeparador(litDentro)) return null;
      if (!empilhar(campoTk.campo, true)) return null;
      i++;
      if (tokens[i]?.tipo !== "fecha") return null;
      i++;
    } else {
      return null; // "]" sem "[" correspondente
    }
  }
  if (blocos.length === 0) return null;
  return { blocos, separador: separador ?? "-" };
}

/** Monta o texto do modelo a partir dos blocos — sempre na escrita canônica de cada campo. */
export function montarModelo(blocos: readonly BlocoModelo[], separador: string): string {
  return blocos
    .map((b, i) => {
      const token = `{${TOKEN_CANONICO[b.campo]}}`;
      const comSeparador = i === 0 ? token : `${separador}${token}`;
      return b.opcional ? `[${i === 0 ? token : `${separador}${token}`}]` : comSeparador;
    })
    .join("");
}

/** Valores de exemplo (acervo real de produção) para a prévia do editor visual. */
const EXEMPLO_CAMPO: Record<CampoPadrao, string> = {
  proj: "260020",
  disc: "EST",
  fase: "EX",
  num: "4001",
  tipo: "DET",
  rev: "R00",
};

/** Nome de exemplo com os blocos escolhidos já preenchidos — a prévia do editor visual. */
export function exemploNomeModelo(blocos: readonly BlocoModelo[], separador: string): string {
  return blocos.map((b) => EXEMPLO_CAMPO[b.campo]).join(separador);
}
