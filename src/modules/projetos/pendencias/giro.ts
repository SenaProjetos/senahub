/**
 * Giro de LEITURA da prancha no viewer (botão "Girar 90°"), somado ao `/Rotate` do próprio PDF.
 *
 * Apontamentos (`x`/`y` e a geometria das marcações) são gravados normalizados no espaço da
 * página SEM este giro — o mesmo espaço da âncora textual (`pdf-pagina.tsx`, viewport de escala 1
 * sem `rotation`). Girar é só apresentação: a camada de pinos gira junto por CSS e o clique é
 * trazido de volta para esse espaço aqui. Assim a mesma pendência aparece no mesmo lugar da
 * prancha em qualquer giro, e nada gravado depende de como quem apontou estava olhando.
 *
 * Pura e client-safe. Sentido horário, igual ao `rotation` do pdf.js e ao `rotate()` do CSS.
 */
export type Giro = 0 | 90 | 180 | 270;

/**
 * Ponto normalizado na caixa VISÍVEL (já girada) → ponto normalizado na página sem giro.
 * `u`/`v` são a posição relativa dentro do retângulo que a página ocupa na tela.
 */
export function desgirarPonto(u: number, v: number, giro: Giro): { x: number; y: number } {
  switch (giro) {
    case 90:
      return { x: v, y: 1 - u };
    case 180:
      return { x: 1 - u, y: 1 - v };
    case 270:
      return { x: 1 - v, y: u };
    default:
      return { x: u, y: v };
  }
}

/** Inverso de `desgirarPonto`: ponto da página sem giro → posição na caixa visível. */
export function girarPonto(x: number, y: number, giro: Giro): { u: number; v: number } {
  switch (giro) {
    case 90:
      return { u: 1 - y, v: x };
    case 180:
      return { u: 1 - x, v: 1 - y };
    case 270:
      return { u: y, v: 1 - x };
    default:
      return { u: x, v: y };
  }
}

/** 90° e 270° trocam largura e altura. */
export function trocaEixos(giro: Giro): boolean {
  return giro === 90 || giro === 270;
}
