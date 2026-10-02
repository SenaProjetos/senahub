/**
 * Regras de preenchimento (M2 do Financeiro). Puro, sem I/O — roda no servidor (conciliação, importação,
 * sugestão ao lançar) e no navegador (prévia).
 *
 * Uma regra é: QUANDO todas as condições batem → ENTÃO preenche categoria, centro, contato, forma, projeto e
 * tags. Duas garantias que a tela promete e o motor cumpre:
 *  - a PRIMEIRA regra ativa da lista (por ordem) que casa é a que vale — as seguintes não completam;
 *  - uma regra NUNCA sobrescreve o que a pessoa já escolheu: só preenche campo vazio (tags somam).
 */

export type CampoCondicao = "descricao" | "tipo" | "valor" | "conta";
export type OperadorCondicao = "contem" | "igual" | "comeca" | "maior" | "menor";

export type Condicao = {
  campo: CampoCondicao;
  op: OperadorCondicao;
  /** Texto (descrição), "receita"|"despesa" (tipo), reais (valor) ou id (conta). */
  valor: string | number;
};

/** Operadores que cada campo aceita (o formulário só oferece estes; o servidor também confere). */
export const OPERADORES_POR_CAMPO: Record<CampoCondicao, readonly OperadorCondicao[]> = {
  descricao: ["contem", "igual", "comeca"],
  tipo: ["igual"],
  valor: ["igual", "maior", "menor"],
  conta: ["igual"],
};

export type Preenchimento = {
  categoriaId: string | null;
  centroId: string | null;
  formaId: string | null;
  projetoId: string | null;
  fornecedorId: string | null;
  clienteId: string | null;
  tags: string[];
};

export type RegraDoMotor = {
  id: string;
  ordem: number;
  ativo: boolean;
  condicoes: Condicao[];
  preenche: Preenchimento;
};

/** O que se sabe do lançamento (ou da transação do extrato) na hora de decidir. */
export type EntradaDoMotor = {
  descricao: string;
  tipo: "receita" | "despesa";
  /** Em reais, positivo. */
  valor: number;
  contaId: string | null;
};

/** O que a pessoa já preencheu: campo preenchido nunca é trocado. */
export type JaPreenchido = Partial<Record<keyof Omit<Preenchimento, "tags">, string | null | undefined>> & { tags?: readonly string[] };

export function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const centavos = (v: number | string): number => Math.round(Number(v) * 100);

function condicaoBate(c: Condicao, e: EntradaDoMotor): boolean {
  switch (c.campo) {
    case "descricao": {
      const d = normalizar(e.descricao);
      const v = normalizar(String(c.valor));
      if (!v) return false;
      return c.op === "igual" ? d === v : c.op === "comeca" ? d.startsWith(v) : d.includes(v);
    }
    case "tipo":
      return e.tipo === c.valor;
    case "valor": {
      const alvo = centavos(c.valor);
      const v = centavos(e.valor);
      return c.op === "maior" ? v > alvo : c.op === "menor" ? v < alvo : v === alvo;
    }
    case "conta":
      return e.contaId != null && e.contaId === c.valor;
  }
}

/** Regra sem condição nenhuma não casa com nada (senão uma regra vazia preencheria tudo). */
export function regraCasa(r: Pick<RegraDoMotor, "condicoes">, e: EntradaDoMotor): boolean {
  return r.condicoes.length > 0 && r.condicoes.every((c) => condicaoBate(c, e));
}

/** A primeira regra ativa, na ordem da lista, que casa. */
export function primeiraQueCasa(regras: readonly RegraDoMotor[], e: EntradaDoMotor): RegraDoMotor | null {
  const ordenadas = [...regras].filter((r) => r.ativo).sort((a, b) => a.ordem - b.ordem || a.id.localeCompare(b.id));
  return ordenadas.find((r) => regraCasa(r, e)) ?? null;
}

export type Sugestao = {
  regraId: string;
  /** Só o que a regra preenche E estava vazio. */
  preenche: Partial<Preenchimento>;
  /** Campos que a regra preencheu (para o aviso "a regra preencheu categoria e tag"). */
  campos: (keyof Preenchimento)[];
};

/**
 * Decide o que preencher: a primeira regra que casa, só nos campos que a pessoa deixou vazios. Contato é um
 * só (fornecedor OU cliente): se um dos dois já está preenchido, nenhum dos dois é preenchido; despesa recebe
 * fornecedor e receita recebe cliente.
 */
export function sugerirPreenchimento(regras: readonly RegraDoMotor[], e: EntradaDoMotor, ja: JaPreenchido = {}): Sugestao | null {
  const r = primeiraQueCasa(regras, e);
  if (!r) return null;
  const p = r.preenche;
  const preenche: Partial<Preenchimento> = {};
  const campos: (keyof Preenchimento)[] = [];
  const vazio = (v: string | null | undefined) => v == null || v === "";
  const poe = <K extends keyof Preenchimento>(k: K, v: Preenchimento[K]) => {
    preenche[k] = v;
    campos.push(k);
  };
  if (p.categoriaId && vazio(ja.categoriaId)) poe("categoriaId", p.categoriaId);
  if (p.centroId && vazio(ja.centroId)) poe("centroId", p.centroId);
  if (p.formaId && vazio(ja.formaId)) poe("formaId", p.formaId);
  if (p.projetoId && vazio(ja.projetoId)) poe("projetoId", p.projetoId);
  const temContato = !vazio(ja.fornecedorId) || !vazio(ja.clienteId);
  if (!temContato && p.fornecedorId && e.tipo === "despesa") poe("fornecedorId", p.fornecedorId);
  if (!temContato && p.clienteId && e.tipo === "receita") poe("clienteId", p.clienteId);
  const novas = p.tags.filter((t) => !(ja.tags ?? []).includes(t));
  if (novas.length > 0) poe("tags", novas);
  return campos.length === 0 ? null : { regraId: r.id, preenche, campos };
}

const ROTULO_CAMPO: Record<keyof Preenchimento, string> = {
  categoriaId: "categoria",
  centroId: "centro",
  formaId: "forma",
  projetoId: "projeto",
  fornecedorId: "contato",
  clienteId: "contato",
  tags: "tag",
};

/** "categoria e tag", "categoria, centro e tag". */
export function rotuloDosCampos(campos: readonly (keyof Preenchimento)[]): string {
  const nomes = [...new Set(campos.map((c) => ROTULO_CAMPO[c]))];
  return nomes.length <= 1 ? (nomes[0] ?? "") : `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}`;
}

/** Texto da condição para a lista ("Descrição contém “ENEL”"). `nomeDaConta` resolve o id. */
export function descreverCondicao(c: Condicao, nomeDaConta: (id: string) => string = (id) => id): string {
  if (c.campo === "descricao") return `Descrição ${c.op === "igual" ? "igual a" : c.op === "comeca" ? "começa com" : "contém"} “${c.valor}”`;
  if (c.campo === "tipo") return c.valor === "despesa" ? "Saída" : "Entrada";
  if (c.campo === "conta") return `Conta ${nomeDaConta(String(c.valor))}`;
  const reais = Number(c.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return `Valor ${c.op === "maior" ? "maior que" : c.op === "menor" ? "menor que" : "igual a"} ${reais}`;
}

const PALAVRAS_COMUNS = new Set([
  "pag", "pagto", "pagamento", "pgto", "boleto", "pix", "ted", "doc", "tarifa", "transf", "transferencia", "compra", "debito", "credito", "cartao",
  "de", "da", "do", "das", "dos", "em", "para", "ref", "nf", "nfe", "ltda", "me", "sa", "recebido", "enviado",
]);

/**
 * Texto que identifica um lançamento ("Criar regra a partir deste lançamento"): a palavra da descrição que mais
 * se repete nos lançamentos parecidos, ignorando termos de banco (PAG, BOLETO, PIX…) e números puros; no empate,
 * a mais longa. Sem parecidos, a primeira palavra útil. Devolve o trecho como está escrito, ou "" se não achar.
 */
export function sugerirTermo(descricao: string, outras: readonly string[] = []): string {
  const palavras = descricao
    .split(/\s+/)
    .map((p) => p.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);
  const uteis = palavras.filter((p) => /\p{L}/u.test(p) && p.length >= 3 && !PALAVRAS_COMUNS.has(normalizar(p)) && !/^\d+$/.test(p));
  if (uteis.length === 0) return "";
  const normOutras = outras.map(normalizar);
  let melhor = uteis[0];
  let melhorPontos = -1;
  for (const p of uteis) {
    const n = normalizar(p);
    const pontos = normOutras.filter((o) => o.includes(n)).length;
    if (pontos > melhorPontos || (pontos === melhorPontos && p.length > melhor.length)) {
      melhor = p;
      melhorPontos = pontos;
    }
  }
  return melhor;
}
