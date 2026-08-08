import { describe, it, expect } from "vitest";
import { construirAncora, relocalizarAncora, RAIO_ANCORA, type Ancora } from "./ancora";
import type { ItemPagina } from "@/lib/pdf-busca";

/** Item posicionado; `temQuebraLinha` default false. */
function item(texto: string, x: number, y: number, temQuebraLinha = false): ItemPagina {
  return { texto, temQuebraLinha, x, y };
}

/** Página de exemplo com trechos longos o bastante para virar âncora distintiva. */
function paginaExemplo(): ItemPagina[] {
  return [
    item("VIGA V12 20x50 CONCRETO FCK 25 MPA", 0.2, 0.3, true),
    item("PILAR P07 30x30 ARMADURA 8 BARRAS", 0.6, 0.3, true),
    item("LAJE L03 ESPESSURA 12 CENTIMETROS", 0.2, 0.7, true),
  ];
}

describe("construirAncora", () => {
  it("ancora no item mais próximo e guarda o deslocamento até o clique", () => {
    const a = construirAncora(paginaExemplo(), 0.25, 0.32);
    expect(a).not.toBeNull();
    expect(a!.texto).toContain("viga v12 20x50");
    // dx/dy = clique menos posição do item.
    expect(a!.dx).toBeCloseTo(0.05, 6);
    expect(a!.dy).toBeCloseTo(0.02, 6);
  });

  it("normaliza acento e caixa no trecho guardado", () => {
    const itens = [item("FUNDAÇÃO SAPATA ISOLADA S01 DIMENSÕES 120x120", 0.5, 0.5)];
    const a = construirAncora(itens, 0.5, 0.5);
    expect(a!.texto).toContain("fundacao sapata isolada");
  });

  it("devolve null quando não há texto dentro do raio", () => {
    const a = construirAncora(paginaExemplo(), 0.95, 0.95);
    expect(a).toBeNull();
  });

  it("devolve null quando a página não tem texto algum", () => {
    expect(construirAncora([], 0.5, 0.5)).toBeNull();
  });

  it("ignora itens sem geometria (extrator que não calculou posição)", () => {
    const itens: ItemPagina[] = [{ texto: "TEXTO SEM POSICAO CONHECIDA NA PAGINA", temQuebraLinha: false }];
    expect(construirAncora(itens, 0.5, 0.5)).toBeNull();
  });

  it("ignora item só de espaço em branco ao escolher o mais próximo", () => {
    const itens = [item("   ", 0.5, 0.5), item("VIGA BALDRAME VB02 SECAO 15x40 ARMADA", 0.52, 0.52)];
    const a = construirAncora(itens, 0.5, 0.5);
    expect(a!.texto).toContain("viga baldrame");
  });

  it("ancora num clique no MEIO de um rótulo longo (distância ao segmento, não à origem)", () => {
    // Rótulo começa em x=0.05 e se estende por 0.5 da página. Um clique em x=0.30 está a
    // 0.25 da ORIGEM — fora do raio — mas em cima do texto.
    const itens: ItemPagina[] = [
      { texto: "VIGA V12 SECAO 20x50 CONCRETO FCK 25 MPA ARMADURA DUPLA", temQuebraLinha: false, x: 0.05, y: 0.2, largura: 0.5 },
    ];
    expect(construirAncora(itens, 0.3, 0.205)).not.toBeNull();
    // Já além do fim do rótulo (0.55) + raio, continua fora.
    expect(construirAncora(itens, 0.9, 0.205)).toBeNull();
  });

  it("sem largura conhecida, cai na distância até a origem (conservador)", () => {
    const itens: ItemPagina[] = [
      { texto: "VIGA V12 SECAO 20x50 CONCRETO FCK 25 MPA", temQuebraLinha: false, x: 0.05, y: 0.2 },
    ];
    expect(construirAncora(itens, 0.3, 0.205)).toBeNull();
    expect(construirAncora(itens, 0.07, 0.205)).not.toBeNull();
  });

  it("respeita o raio: item logo além do limite não ancora", () => {
    const itens = [item("DETALHE CONSTRUTIVO TIPICO DA ESCADA", 0.5, 0.5)];
    expect(construirAncora(itens, 0.5, 0.5 + RAIO_ANCORA * 1.1)).toBeNull();
    expect(construirAncora(itens, 0.5, 0.5 + RAIO_ANCORA * 0.9)).not.toBeNull();
  });
});

describe("relocalizarAncora", () => {
  it("reposiciona quando o conteúdo mudou de lugar na revisão nova", () => {
    const a = construirAncora(paginaExemplo(), 0.25, 0.32)!;
    // Revisão nova: mesmo texto, tudo deslocado 0.1 para a direita e 0.05 para baixo.
    const nova = [
      item("VIGA V12 20x50 CONCRETO FCK 25 MPA", 0.3, 0.35, true),
      item("PILAR P07 30x30 ARMADURA 8 BARRAS", 0.7, 0.35, true),
      item("LAJE L03 ESPESSURA 12 CENTIMETROS", 0.3, 0.75, true),
    ];
    const pos = relocalizarAncora(nova, a);
    expect(pos).not.toBeNull();
    // Segue o texto: nova posição do item + o mesmo dx/dy.
    expect(pos!.x).toBeCloseTo(0.35, 6);
    expect(pos!.y).toBeCloseTo(0.37, 6);
  });

  it("devolve null quando a âncora sumiu da revisão nova", () => {
    const a = construirAncora(paginaExemplo(), 0.25, 0.32)!;
    const nova = [item("PILAR P07 30x30 ARMADURA 8 BARRAS", 0.6, 0.3)];
    expect(relocalizarAncora(nova, a)).toBeNull();
  });

  it("devolve null quando a âncora aparece em mais de um lugar (ambígua)", () => {
    const itens = [item("CORTE AA", 0.2, 0.2, true), item("CORTE AA", 0.7, 0.2, true)];
    const ancora: Ancora = { texto: "corte aa", offset: 0, dx: 0, dy: 0 };
    expect(relocalizarAncora(itens, ancora)).toBeNull();
  });

  it("devolve null para âncora vazia", () => {
    expect(relocalizarAncora(paginaExemplo(), { texto: "", offset: 0, dx: 0, dy: 0 })).toBeNull();
  });

  it("devolve null quando o item encontrado não tem geometria", () => {
    const itens: ItemPagina[] = [{ texto: "PLANTA DE FORMAS PAVIMENTO TIPO", temQuebraLinha: false }];
    const ancora: Ancora = { texto: "planta de formas", offset: 0, dx: 0, dy: 0 };
    expect(relocalizarAncora(itens, ancora)).toBeNull();
  });

  it("mantém a posição dentro de 0..1 mesmo com deslocamento que estouraria a borda", () => {
    const itens = [item("QUADRO DE AREAS E TAXAS DO TERRENO", 0.95, 0.95)];
    const ancora: Ancora = { texto: "quadro de areas", offset: 0, dx: 0.5, dy: 0.5 };
    const pos = relocalizarAncora(itens, ancora)!;
    expect(pos.x).toBe(1);
    expect(pos.y).toBe(1);
  });

  it("ida e volta: âncora construída numa página se relocaliza nela mesma sem mexer no pino", () => {
    const itens = paginaExemplo();
    const a = construirAncora(itens, 0.25, 0.32)!;
    const pos = relocalizarAncora(itens, a)!;
    expect(pos.x).toBeCloseTo(0.25, 6);
    expect(pos.y).toBeCloseTo(0.32, 6);
  });
});
