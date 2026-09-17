/**
 * Heurística pura (sem I/O) para SUGERIR o título da prancha a partir do carimbo (selo) de um PDF,
 * usando o texto posicionado extraído no cliente (`lib/ler-texto-pdf.ts`).
 *
 * O que ela procura: um rótulo de campo do carimbo ("ASSUNTO:", "TÍTULO:") e o valor que está na
 * célula logo abaixo dele. NÃO é OCR — PDF de prancha escaneado/rasterizado não tem camada de
 * texto e a função devolve `null`.
 *
 * A sugestão é sempre CONFERIDA pelo usuário antes de virar título (decisão do dono): errar em
 * silêncio é pior que não sugerir, então toda regra abaixo prefere `null` a chutar.
 *
 * ---------------------------------------------------------------------------------------------
 * Limiares calibrados contra o acervo real de dev (51 pranchas de 4 escritórios diferentes,
 * 2026-09-17). Cada um existe por um caso concreto:
 *
 * 1. GIRO. Prancha de CAD é plotada com o carimbo deitado — no acervo, a MESMA família de arquivos
 *    tinha folhas com o carimbo a 0° e outras a 270°. Sem normalizar por giro, "a linha de baixo"
 *    vira "a coluna ao lado" e a extração pega o campo errado. Por isso tudo roda em "espaço de
 *    leitura" (texto corre em +x, linhas empilham em -y), derivado do giro do PRÓPRIO item.
 *
 * 2. DOIS-PONTOS OBRIGATÓRIO no rótulo. Carimbo de terceiro costuma ter a palavra "ASSUNTO" solta
 *    como cabeçalho de bloco, com o nome da prefeitura/cliente logo abaixo; o campo de verdade é o
 *    escrito como formulário ("ASSUNTO:"). Exigir o ":" eliminou exatamente os falso-positivos
 *    ("MUNICIPAL DE OROBÓ-PE", "EMPREENDIMENTOS IMOBILIÁRIOS LTDA") sem perder nenhum acerto.
 *
 * 3. LINHA QUEBRADA EM PALAVRAS. CAD escreve cada palavra como um item próprio — o valor
 *    "ESTRUTURA - COBERTA METÁLICA" chega como 4 itens. Por isso a linha é remontada juntando
 *    itens contíguos e inserindo espaço quando há lacuna horizontal.
 *
 * 4. JANELA HORIZONTAL SÓ ANCORA. O limite de `dx` vale para a PRIMEIRA palavra da linha (é o que
 *    diz "este valor pertence à célula deste rótulo"); as palavras seguintes entram por
 *    contiguidade, senão o título era truncado na primeira palavra.
 */

import type { ItemTextoPdf } from "@/lib/ler-texto-pdf";

/** Rótulos de campo que carregam o título da prancha, com as variações vistas no acervo. */
const ROTULO_TITULO = /^\s*(assunto|t[ií]tulo(\s+da\s+prancha)?|nome\s+da\s+prancha|descri[cç][aã]o)\s*:\s*$/i;

/** Valor que na verdade é o rótulo da célula seguinte. */
const PARECE_ROTULO = /:\s*$/;

/**
 * Nome de arquivo/código de prancha (`260037-HDR-EX-6001-DET.DWG`) — no carimbo da SENA o campo
 * "CÓDIGO:" fica na mesma pilha de células do "ASSUNTO:", então precisa ser descartado
 * explicitamente. Só casa texto SEM espaço, então título com hífen ("PLANTA BAIXA - TÉRREO") passa.
 */
const PARECE_CODIGO = /^[\w.]+([-_][\w.]+){3,}$/;

/** Título de prancha não é parágrafo: acima disto, a linha varreu texto de fora da célula. */
const MAX_CARACTERES = 120;

type ItemLeitura = { str: string; x: number; y: number; w: number; h: number; giro: number };

/**
 * Posição no espaço de leitura do próprio item: desfaz o giro do texto, de modo que "linha de
 * baixo" seja sempre `y` menor e "mesma coluna" seja sempre `x` parecido.
 */
function paraEspacoDeLeitura(item: ItemTextoPdf): ItemLeitura {
  const giro = ((Math.round(item.giro ?? 0) % 360) + 360) % 360;
  const { x, y } = item;
  const pos =
    giro === 90 ? { x: y, y: -x }
    : giro === 180 ? { x: -x, y: -y }
    : giro === 270 ? { x: -y, y: x }
    : { x, y };
  return { str: item.str, x: pos.x, y: pos.y, w: item.w, h: item.h, giro };
}

/** Junta itens de uma linha inserindo espaço onde havia lacuna horizontal. */
function juntarLinha(itens: ItemLeitura[]): string {
  let texto = "";
  let fimAnterior: number | null = null;
  for (const item of itens) {
    if (fimAnterior !== null && item.x - fimAnterior > Math.max(0.8, (item.h || 6) * 0.15)) texto += " ";
    texto += item.str;
    fimAnterior = item.x + item.w;
  }
  return texto.trim().replace(/\s+/g, " ");
}

/**
 * Sugere o título da prancha, ou `null` quando nenhum rótulo de título tem um valor reconhecível
 * logo abaixo (carimbo de layout desconhecido, PDF sem camada de texto, documento que não é
 * prancha). Nunca inventa: na dúvida devolve `null`.
 */
export function extrairTituloDoCarimbo(itens: ItemTextoPdf[]): string | null {
  const daPrimeiraPagina = itens.filter((it) => it.pagina === 1 && it.str.trim() !== "");
  const emLeitura = daPrimeiraPagina.map(paraEspacoDeLeitura);

  for (const rotulo of emLeitura.filter((it) => ROTULO_TITULO.test(it.str))) {
    const alturaLinha = rotulo.h > 0 ? rotulo.h : 6;
    // Onde a primeira palavra do valor pode começar para ainda ser "a célula deste rótulo".
    const limiteDireita = Math.max(rotulo.w, alturaLinha * 4);
    const limiteEsquerda = alturaLinha * 1.5;

    const abaixo = emLeitura.filter(
      (it) =>
        it !== rotulo &&
        it.giro === rotulo.giro &&
        it.y < rotulo.y - alturaLinha * 0.3 &&
        rotulo.y - it.y <= Math.max(alturaLinha, it.h) * 2.5,
    );

    const linhas = new Map<number, ItemLeitura[]>();
    for (const item of abaixo) {
      const chave = [...linhas.keys()].find((y) => Math.abs(y - item.y) <= Math.max(1.5, alturaLinha * 0.4)) ?? item.y;
      linhas.set(chave, [...(linhas.get(chave) ?? []), item]);
    }

    const daLinhaMaisPerto = [...linhas.entries()].sort((a, b) => b[0] - a[0]);
    for (const [, itensDaLinha] of daLinhaMaisPerto) {
      const ordenados = [...itensDaLinha].sort((a, b) => a.x - b.x);
      const inicio = ordenados.findIndex((it) => it.x > rotulo.x - limiteEsquerda && it.x < rotulo.x + limiteDireita);
      if (inicio === -1) continue;

      const celula = [ordenados[inicio]];
      for (const proximo of ordenados.slice(inicio + 1)) {
        const anterior = celula[celula.length - 1];
        if (proximo.x - (anterior.x + anterior.w) > Math.max(alturaLinha * 3, 12)) break;
        celula.push(proximo);
      }

      const texto = juntarLinha(celula);
      if (texto.length < 4 || texto.length > MAX_CARACTERES) continue;
      if (PARECE_ROTULO.test(texto) || PARECE_CODIGO.test(texto)) continue;
      return texto;
    }
  }
  return null;
}
