/**
 * Leitura PURA (sem I/O) do quadro de revisão do carimbo de uma prancha em PDF: a tabela
 * "REV | DESCRIÇÃO | AUTOR | DATA" onde cada linha numerada diz o que mudou naquela revisão.
 * Spec: `docs/superpowers/specs/2026-10-21-ciclo-documental-revisao-cliente-design.md` §3.
 *
 * Recebe os itens de texto da 1ª página (`carimbo-servidor.ts` / `lib/ler-texto-pdf.ts`) e trabalha
 * no espaço de leitura (`paraEspacoDeLeitura`), que já desfaz o carimbo girado. Na dúvida devolve
 * `null`/linha vazia: quem chama decide o que fazer sem quadro, nunca com um texto chutado.
 *
 * Calibrado contra 12 pranchas reais de 4 modelos (fixture `__fixtures__/quadros-revisao.json`):
 * A. SENA novo — REV · DESCRIÇÃO · AUTOR · DATA embaixo, linhas 01–05, 01 = EMISSÃO INICIAL;
 * B. SENA "ASSUNTO" — REV. · ASSUNTO · DESENHO · DATA embaixo, linhas 00–06, uma palavra por item;
 * C. prefeitura — DATA · REVISÃO · DESCRIÇÃO embaixo, linhas 00–02;
 * D. terceiro — "Tabela de Revisão": Revisão · Data · Emitido por · Descrição da Revisão EM CIMA,
 *    célula da descrição em várias linhas.
 *
 * Regras que vieram das amostras:
 * 1. CABEÇALHO = um rótulo de revisão e, na mesma linha e à direita, um de descrição. Rótulo exato
 *    (sem ":"): "REVISÃO:" é o campo do carimbo, não a coluna; "ASSUNTO:" é o título da prancha.
 * 2. LINHAS = itens só-número alinhados com o rótulo de revisão, do lado do cabeçalho onde eles estão,
 *    em sequência (um salto grande = já é outro texto da folha).
 * 3. COLUNA DA DESCRIÇÃO: a borda direita é o espelho da borda esquerda em torno do centro do rótulo
 *    (exata quando o rótulo é centralizado, como nas 12 amostras). Com coluna seguinte (AUTOR,
 *    DESENHO…), vale o maior entre o espelho e o meio dos centros dos dois rótulos — com o rótulo
 *    alinhado à esquerda o espelho encolheria a coluna — sem passar do início do rótulo seguinte. Um item entra
 *    pelo CENTRO: o nome do autor fica centralizado sob AUTOR/DESENHO e às vezes começa colado no fim
 *    da descrição (PEDF3) — pelo início ele entraria. A borda esquerda é o fim da coluna do número, ou
 *    o fim do último rótulo entre REVISÃO e DESCRIÇÃO (modelo D: Data e Emitido por ficam no meio).
 * 4. FAIXA DA LINHA: do topo da linha até o topo da linha seguinte na leitura (a de baixo); a última
 *    vai até o cabeçalho, ou — com o cabeçalho em cima — enquanto as linhas de texto forem contíguas.
 */

import type { ItemTextoPdf } from "@/lib/ler-texto-pdf";
import { paraEspacoDeLeitura, type ItemLeitura } from "../titulo-carimbo";

/** `numero` como impresso (`01` → 1); `texto` vazio = linha sem descrição. */
export type LinhaQuadro = { numero: number; texto: string };
/** Linhas ordenadas por número. */
export type QuadroRevisao = { linhas: LinhaQuadro[] };

const ROTULOS_REVISAO = new Set(["REV", "REV.", "REVISAO"]);
const ROTULOS_DESCRICAO = new Set(["DESCRICAO", "ASSUNTO", "DESCRICAO DA REVISAO"]);
const SO_NUMERO = /^\d{1,2}$/;

/** Sem acento, maiúsculas, espaços colapsados. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Só letras e números, separados por um espaço. */
function semPontuacao(texto: string): string {
  return texto.replace(/[^A-Z0-9]+/g, " ").trim();
}

const alturaDe = (it: ItemLeitura) => (it.h > 0 ? it.h : 6);
const fimDe = (it: ItemLeitura) => it.x + it.w;
const centroDe = (it: ItemLeitura) => it.x + it.w / 2;

/** Junta os itens de uma linha (já em ordem de x) com espaço onde havia lacuna. */
function juntarLinha(itens: ItemLeitura[]): string {
  let texto = "";
  let fimAnterior: number | null = null;
  for (const item of itens) {
    if (fimAnterior !== null && item.x - fimAnterior > Math.max(0.8, alturaDe(item) * 0.15)) texto += " ";
    texto += item.str;
    fimAnterior = fimDe(item);
  }
  return texto;
}

/** Agrupa em linhas de leitura (y desc, x asc) e junta tudo com espaço. */
function textoEmOrdemDeLeitura(itens: ItemLeitura[]): string {
  const linhas: { y: number; itens: ItemLeitura[] }[] = [];
  for (const item of [...itens].sort((a, b) => b.y - a.y)) {
    const linha = linhas.find((l) => Math.abs(l.y - item.y) <= alturaDe(item) * 0.4);
    if (linha) linha.itens.push(item);
    else linhas.push({ y: item.y, itens: [item] });
  }
  return linhas
    .sort((a, b) => b.y - a.y)
    .map((l) => juntarLinha(l.itens.sort((a, b) => a.x - b.x)))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Números da coluna do rótulo, de um lado do cabeçalho, em sequência a partir dele. */
function numerosDoLado(rotulo: ItemLeitura, candidatos: ItemLeitura[], lado: 1 | -1): ItemLeitura[] {
  const h = alturaDe(rotulo);
  const doLado = candidatos
    .filter((c) => (c.y - rotulo.y) * lado > h * 0.5)
    .sort((a, b) => (a.y - b.y) * lado);
  const aceitos: ItemLeitura[] = [];
  let ultimoY = rotulo.y;
  for (const c of doLado) {
    const salto = Math.abs(c.y - ultimoY);
    if (aceitos.length > 0 && salto <= alturaDe(c) * 0.4) continue; // item repetido na mesma linha
    if (salto > h * (aceitos.length === 0 ? 4 : 6)) break;
    aceitos.push(c);
    ultimoY = c.y;
  }
  return aceitos;
}

type Cabecalho = { rotulo: ItemLeitura; descricao: ItemLeitura; numeros: ItemLeitura[]; numerosEmCima: boolean };

function acharCabecalhos(itens: ItemLeitura[]): Cabecalho[] {
  const cabecalhos: Cabecalho[] = [];
  for (const rotulo of itens.filter((it) => ROTULOS_REVISAO.has(normalizar(it.str)))) {
    const descricao = itens
      .filter(
        (it) =>
          it.giro === rotulo.giro &&
          ROTULOS_DESCRICAO.has(normalizar(it.str)) &&
          Math.abs(it.y - rotulo.y) <= Math.max(alturaDe(it), alturaDe(rotulo)) * 0.5 &&
          it.x > fimDe(rotulo) - alturaDe(rotulo) * 0.2,
      )
      .sort((a, b) => a.x - b.x)[0];
    if (!descricao) continue;

    const naColuna = itens.filter(
      (it) =>
        it !== rotulo &&
        it.giro === rotulo.giro &&
        SO_NUMERO.test(it.str.trim()) &&
        it.x >= rotulo.x - alturaDe(rotulo) &&
        it.x <= fimDe(rotulo),
    );
    const emCima = numerosDoLado(rotulo, naColuna, 1);
    const embaixo = numerosDoLado(rotulo, naColuna, -1);
    const numerosEmCima = emCima.length >= embaixo.length;
    const numeros = numerosEmCima ? emCima : embaixo;
    if (numeros.length > 0) cabecalhos.push({ rotulo, descricao, numeros, numerosEmCima });
  }
  return cabecalhos;
}

function lerCabecalho(itens: ItemLeitura[], cab: Cabecalho): QuadroRevisao {
  const { rotulo, descricao, numeros, numerosEmCima } = cab;
  const tolCabecalho = alturaDe(rotulo) * 0.5;
  const naLinhaDoCabecalho = itens.filter(
    (it) =>
      it !== rotulo &&
      it !== descricao &&
      it.giro === rotulo.giro &&
      Math.abs(it.y - rotulo.y) <= Math.max(alturaDe(it), alturaDe(rotulo)) * 0.5,
  );

  // Colunas entre a da revisão e a da descrição (modelo D) empurram a borda esquerda.
  const entre = naLinhaDoCabecalho.filter((it) => it.x > fimDe(rotulo) && fimDe(it) <= descricao.x + 0.5);
  const esquerda =
    entre.length > 0
      ? Math.max(...entre.map(fimDe))
      : Math.max(fimDe(rotulo), ...numeros.map(fimDe));
  const proxima = naLinhaDoCabecalho
    .filter((it) => it.x >= fimDe(descricao) - 0.5)
    .sort((a, b) => a.x - b.x)[0];
  const espelho = 2 * centroDe(descricao) - esquerda;
  const direita = proxima
    ? Math.min(proxima.x, Math.max(espelho, (centroDe(descricao) + centroDe(proxima)) / 2))
    : espelho;

  const ehNumero = new Set(numeros);
  const naDescricao = itens.filter(
    (it) =>
      it.giro === rotulo.giro &&
      !ehNumero.has(it) &&
      centroDe(it) > esquerda &&
      centroDe(it) < direita &&
      Math.abs(it.y - rotulo.y) > tolCabecalho,
  );

  // Ordem de leitura: de cima para baixo. Cada linha vai do seu topo até o topo da de baixo.
  const emLeitura = [...numeros].sort((a, b) => b.y - a.y);
  const linhas = emLeitura.map((numero, i): LinhaQuadro => {
    const topo = numero.y + alturaDe(numero) * 0.5;
    const debaixo = emLeitura[i + 1];
    let daLinha: ItemLeitura[];
    if (debaixo) {
      const piso = debaixo.y + alturaDe(debaixo) * 0.5;
      daLinha = naDescricao.filter((it) => it.y <= topo && it.y > piso);
    } else if (numerosEmCima) {
      const piso = rotulo.y + tolCabecalho;
      daLinha = naDescricao.filter((it) => it.y <= topo && it.y > piso);
    } else {
      // Última linha com o cabeçalho em cima: segue enquanto o texto da célula for contíguo.
      daLinha = [];
      let ultimoY = numero.y;
      for (const it of naDescricao.filter((d) => d.y <= topo).sort((a, b) => b.y - a.y)) {
        if (ultimoY - it.y > alturaDe(it) * 2) break;
        daLinha.push(it);
        ultimoY = it.y;
      }
    }
    return { numero: Number(numero.str.trim()), texto: textoEmOrdemDeLeitura(daLinha) };
  });

  return { linhas: linhas.sort((a, b) => a.numero - b.numero) };
}

/**
 * O quadro de revisão da 1ª página, ou `null` quando não há cabeçalho de quadro com linhas numeradas
 * (carimbo de layout desconhecido, PDF sem texto). Com mais de um candidato, vale o de mais linhas.
 */
export function lerQuadroDeRevisao(itens: readonly ItemTextoPdf[]): QuadroRevisao | null {
  const emLeitura = itens.filter((it) => it.pagina === 1 && it.str.trim() !== "").map(paraEspacoDeLeitura);
  const cabecalhos = acharCabecalhos(emLeitura);
  if (cabecalhos.length === 0) return null;
  const melhor = cabecalhos.reduce((a, b) => (b.numeros.length > a.numeros.length ? b : a));
  return lerCabecalho(emLeitura, melhor);
}

function ehEmissaoInicial(texto: string): boolean {
  return semPontuacao(normalizar(texto)) === "EMISSAO INICIAL";
}

/**
 * Texto da linha da revisão `revisao` (0 = R00), ou `null` quando não há linha para ela ou a linha
 * está vazia. Se alguma linha diz "EMISSÃO INICIAL", ela é a R00 e as seguintes contam a partir dela
 * (modelo A numera 01 = emissão inicial); sem essa âncora, o número da linha é a revisão.
 */
export function textoDaRevisao(q: QuadroRevisao, revisao: number): string | null {
  const ancora = q.linhas.find((l) => ehEmissaoInicial(l.texto));
  const alvo = ancora ? ancora.numero + revisao : revisao;
  const linha = q.linhas.find((l) => l.numero === alvo);
  return linha && linha.texto !== "" ? linha.texto : null;
}

const LIGACOES = new Set(["DE", "DA", "DO", "DAS", "DOS", "E", "A", "O"]);
const PALAVRAS_GENERICAS = new Set([
  "REVISAO", "REVISOES", "ALTERACAO", "ALTERACOES", "ATUALIZACAO", "ATUALIZACOES", "AJUSTE", "AJUSTES",
  "MODIFICACAO", "MODIFICACOES", "CORRECAO", "CORRECOES", "GERAL", "GERAIS",
]);

/**
 * `true` quando a descrição não diz O QUE mudou ("REVISÕES", "REV 01 - AJUSTES", "EMISSÃO INICIAL"):
 * tirando prefixo de revisão (`REV 01`, `R01`), pontuação e palavras de ligação, sobra nada ou só
 * palavras genéricas.
 */
export function descricaoGenerica(texto: string): boolean {
  const base = semPontuacao(
    normalizar(texto)
      .replace(/\bREV\.?\s*\d+/g, " ")
      .replace(/\bR\d+\b/g, " "),
  );
  if (base === "EMISSAO INICIAL") return true;
  return base
    .split(" ")
    .filter((p) => p !== "" && !LIGACOES.has(p))
    .every((p) => PALAVRAS_GENERICAS.has(p));
}
