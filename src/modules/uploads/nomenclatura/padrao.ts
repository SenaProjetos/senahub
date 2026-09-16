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

function campoDe(nome: string): CampoPadrao | null {
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
