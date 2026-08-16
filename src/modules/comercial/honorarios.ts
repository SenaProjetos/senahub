/**
 * Honorários da proposta: preço por área e o que de fato vai para o banco (F1.22).
 *
 * Puro, sem I/O. Existe por causa do critério de aceite da F1.22 — "total na tela = total no PDF".
 * O PDF é renderizado da própria página pública (`page.goto` em `/a/proposta/[token]`), então
 * PDF e página pública são iguais por construção; o que sobra para garantir é
 * **total na tela do editor = total persistido**. Este arquivo é a fonte única desse número:
 * o editor exibe `totalItens(itensPersistiveis(...))` e envia `itensPersistiveis(...)`.
 */

export type LinhaTabelaPreco = { disciplina: string; valorM2: number };
export type ItemProposta = { disciplina: string; descricao: string; valor: number };

/**
 * Arredonda para 2 casas do jeito que o PostgreSQL arredonda em `Decimal(14,2)`.
 *
 * Não é `Math.round(v * 100) / 100`. Essa forma erra justamente onde importa: o valor que trafega
 * até o banco é o `number` serializado em JSON, ou seja, a REPRESENTAÇÃO DECIMAL MAIS CURTA do
 * double (`String(v)`) — é ela que o Prisma manda e o PG arredonda meio-para-cima. Em `1.005`,
 * `Math.round(1.005 * 100) / 100` devolve `1` (o double é 1.00499…), enquanto o PG grava `1.01`,
 * porque enxerga a string "1.005". Divergência de um centavo entre a tela e o que o cliente lê.
 *
 * Por isso arredondamos sobre a MESMA string que o banco vai ver.
 */
export function arredondarMoeda(valor: number): number {
  if (!Number.isFinite(valor)) return 0;
  const s = String(valor);
  // Notação exponencial só aparece fora da faixa de dinheiro real (|v| ≥ 1e21 estoura o
  // Decimal(14,2); |v| < 1e-6 arredonda para zero de qualquer forma).
  if (s.includes("e") || s.includes("E")) return Math.round(valor * 100) / 100;

  const negativo = s.startsWith("-");
  const abs = negativo ? s.slice(1) : s;
  const [inteira, fracionaria = ""] = abs.split(".");
  if (fracionaria.length <= 2) return valor;

  // BigInt (e não Number) porque a conta é sobre dígitos, não sobre o double — é o ponto todo
  // da função. `BigInt(1)` em vez do literal `1n`: o `target` do projeto é ES2017, e literal
  // BigInt exige ES2020; o construtor roda igual e não pede mudança de tsconfig.
  const centavos = BigInt(inteira + fracionaria.slice(0, 2));
  // Meio-para-cima (afastando do zero), igual ao PG. `charCodeAt(2) >= 53` é o dígito ≥ '5'.
  const total = fracionaria.charCodeAt(2) >= 53 ? centavos + BigInt(1) : centavos;
  const resultado = Number(total) / 100;
  return negativo ? -resultado : resultado;
}

/** Preço de uma disciplina: R$/m² × área, já na precisão que o banco guarda. */
export function valorPorArea(valorM2: number, areaM2: number): number {
  return arredondarMoeda(valorM2 * areaM2);
}

/**
 * Os itens exatamente como serão gravados: sem os que não têm disciplina (a action os rejeitaria)
 * e com o valor já na precisão da coluna.
 *
 * O editor usa esta lista para as DUAS coisas — exibir o total e enviar no salvar. É isso que faz
 * "total na tela = total persistido" valer por construção, e não por coincidência.
 */
export function itensPersistiveis(itens: ItemProposta[]): ItemProposta[] {
  return itens
    .filter((i) => i.disciplina)
    .map((i) => ({ ...i, valor: arredondarMoeda(i.valor || 0) }));
}

/** Soma dos itens. Sem arredondamento extra: as parcelas já vêm quantizadas. */
export function totalItens(itens: { valor: number }[]): number {
  return arredondarMoeda(itens.reduce((s, i) => s + (i.valor || 0), 0));
}

/**
 * Pré-preenche a proposta a partir de uma tabela de preço (o "gancho de adoção" da F1.22).
 *
 * Disciplina marcada que ainda não está na proposta vira item novo; a que já está é reprecificada.
 * O que NÃO foi marcado fica intocado — inclusive item digitado à mão que não existe na tabela.
 * A operação nunca remove nada.
 *
 * O item novo nasce COM o valor da linha da tabela: não há casamento por nome nesse caminho, o
 * preço vem da própria linha que o originou.
 *
 * `disciplinasValidas` (quando informado) é o catálogo, e nenhuma disciplina de fora dele entra.
 * Sem essa trava, uma linha de tabela com grafia fora do catálogo — em dev, `Lógica`, renomeada
 * para `Cabeamento` e ainda sem FK — viraria um item cujo `<Select>` no editor não tem opção
 * correspondente: valor na tela, disciplina em branco. E quem "consertasse" o dropdown vazio
 * trocaria a disciplina mantendo o valor, que é o risco desta tarefa por outra porta. O diálogo
 * também desabilita essas linhas; a trava mora aqui porque aqui dá para provar com teste.
 */
export function preencherItensDaTabela(args: {
  itens: ItemProposta[];
  linhas: LinhaTabelaPreco[];
  areaM2: number;
  selecionadas: string[];
  disciplinasValidas?: string[];
}): { itens: ItemProposta[]; adicionados: number; reprecificados: number } {
  const { itens, linhas, areaM2, selecionadas, disciplinasValidas } = args;
  const validas = disciplinasValidas ? new Set(disciplinasValidas) : null;
  const marcadas = new Set(selecionadas.filter((d) => !validas || validas.has(d)));
  const precoPor = new Map(linhas.map((l) => [l.disciplina, l.valorM2]));

  let reprecificados = 0;
  const atualizados = itens.map((it) => {
    const valorM2 = marcadas.has(it.disciplina) ? precoPor.get(it.disciplina) : undefined;
    if (valorM2 === undefined) return it;
    reprecificados++;
    return { ...it, valor: valorPorArea(valorM2, areaM2) };
  });

  const jaNaProposta = new Set(itens.map((i) => i.disciplina));
  const novos = linhas
    .filter((l) => marcadas.has(l.disciplina) && !jaNaProposta.has(l.disciplina))
    .map((l) => ({
      disciplina: l.disciplina,
      descricao: "",
      valor: valorPorArea(l.valorM2, areaM2),
    }));

  return { itens: [...atualizados, ...novos], adicionados: novos.length, reprecificados };
}
