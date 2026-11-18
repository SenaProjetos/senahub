import { describe, expect, it } from "vitest";
import {
  LIMITE_DESFAZER,
  clicar,
  definirCampos,
  deslocar,
  desfazer,
  iniciarSessao,
  instrucao,
  marcadores,
  mudou,
  passoDaSeta,
  trocarModo,
  type SessaoAlinhamento,
} from "./sessao-alinhamento";
import { IDENTIDADE, aplicar, type Alinhamento } from "./transformacao";

const ERRO_MESMO_LUGAR = "Os dois pontos estão no mesmo lugar. Escolha pontos afastados.";

function sessao(alinhamento: Alinhamento = IDENTIDADE, modo?: SessaoAlinhamento["modo"]): SessaoAlinhamento {
  const s = iniciarSessao({ camadaId: "c1", formato: "dwg", versaoLida: 3, alinhamento });
  return modo ? trocarModo(s, modo) : s;
}

function clicarTodos(s: SessaoAlinhamento, pontos: { x: number; y: number }[]) {
  let atual = s;
  let erro: string | undefined;
  for (const p of pontos) {
    const r = clicar(atual, p);
    atual = r.sessao;
    erro = r.erro ?? erro;
  }
  return { sessao: atual, erro };
}

describe("iniciarSessao", () => {
  it("começa em 2 pontos, sem cliques, sem nada para desfazer e sem mudança", () => {
    const s = sessao({ tx: 5, ty: 6, giro: 10, escala: 2 });
    expect(s.modo).toBe("dois_pontos");
    expect(s.cliques).toEqual([]);
    expect(s.desfazer).toEqual([]);
    expect(s.atual).toEqual(s.inicial);
    expect(mudou(s)).toBe(false);
  });
});

describe("1 ponto", () => {
  it("clique na camada e depois na base só desloca (giro e escala ficam)", () => {
    const inicial = { tx: 10, ty: 20, giro: 30, escala: 2 };
    const s = sessao(inicial, "um_ponto");
    // O ponto (100, 0) nativo está desenhado em aplicar(inicial, …); clica nele e manda para (500, 500).
    const naTela = aplicar(inicial, { x: 100, y: 0 });
    const r = clicarTodos(s, [naTela, { x: 500, y: 500 }]);
    expect(r.erro).toBeUndefined();
    expect(r.sessao.atual.giro).toBe(30);
    expect(r.sessao.atual.escala).toBe(2);
    const agora = aplicar(r.sessao.atual, { x: 100, y: 0 });
    expect(agora.x).toBeCloseTo(500, 9);
    expect(agora.y).toBeCloseTo(500, 9);
    expect(r.sessao.cliques).toEqual([]);
    expect(r.sessao.desfazer).toEqual([inicial]);
  });

  it("depois do primeiro clique só a camada tem marcador; o par fechado limpa os marcadores", () => {
    const s = clicar(sessao(IDENTIDADE, "um_ponto"), { x: 3, y: 4 }).sessao;
    expect(marcadores(s)).toEqual([{ mundo: { x: 3, y: 4 }, lado: "camada", par: 1 }]);
    expect(marcadores(clicar(s, { x: 9, y: 9 }).sessao)).toEqual([]);
  });
});

describe("2 pontos", () => {
  it("dois pares recuperam deslocamento, giro e escala", () => {
    const alvo = { tx: 50, ty: 80, giro: -90, escala: 0.5 };
    const o1 = { x: 0, y: 0 };
    const o2 = { x: 100, y: 0 };
    const r = clicarTodos(sessao(), [o1, aplicar(alvo, o1), o2, aplicar(alvo, o2)]);
    expect(r.erro).toBeUndefined();
    expect(r.sessao.atual.giro).toBeCloseTo(-90, 9);
    expect(r.sessao.atual.escala).toBeCloseTo(0.5, 9);
    expect(r.sessao.atual.tx).toBeCloseTo(50, 9);
    expect(r.sessao.atual.ty).toBeCloseTo(80, 9);
    expect(r.sessao.desfazer).toHaveLength(1);
  });

  it("a origem é lida pelo alinhamento em uso (a camada já deslocada)", () => {
    const inicial = { tx: 1000, ty: 0, giro: 0, escala: 1 };
    // Os pontos nativos (0,0) e (10,0) aparecem em (1000,0) e (1010,0); destinos = os mesmos: nada muda.
    const r = clicarTodos(sessao(inicial), [
      { x: 1000, y: 0 },
      { x: 1000, y: 0 },
      { x: 1010, y: 0 },
      { x: 1010, y: 0 },
    ]);
    expect(r.sessao.atual.tx).toBeCloseTo(1000, 9);
    expect(r.sessao.atual.escala).toBeCloseTo(1, 9);
  });

  it("origens coincidentes: devolve o erro da conta, limpa os cliques e não muda o alinhamento", () => {
    const r = clicarTodos(sessao(), [
      { x: 5, y: 5 },
      { x: 0, y: 0 },
      { x: 5, y: 5 },
      { x: 9, y: 9 },
    ]);
    expect(r.erro).toBe(ERRO_MESMO_LUGAR);
    expect(r.sessao.atual).toEqual(IDENTIDADE);
    expect(r.sessao.cliques).toEqual([]);
    expect(r.sessao.desfazer).toEqual([]);
  });

  it("instrução acompanha o próximo clique", () => {
    let s = sessao();
    expect(instrucao(s)).toBe("Clique num ponto da camada que está alinhando.");
    s = clicar(s, { x: 0, y: 0 }).sessao;
    expect(instrucao(s)).toBe("Clique no mesmo ponto na base.");
    s = clicar(s, { x: 1, y: 1 }).sessao;
    expect(instrucao(s)).toBe("Clique num segundo ponto da camada, longe do primeiro.");
    s = clicar(s, { x: 50, y: 0 }).sessao;
    expect(instrucao(s)).toBe("Clique no mesmo segundo ponto na base.");
  });

  it("alinhando a própria base, o destino é outra camada já alinhada (a base antiga não está na tela)", () => {
    let s = iniciarSessao({ camadaId: "b", formato: "pdf", versaoLida: 1, alinhamento: IDENTIDADE, ehBase: true });
    s = clicar(s, { x: 0, y: 0 }).sessao;
    expect(instrucao(s)).toBe("Clique no mesmo ponto numa camada já alinhada.");
    s = clicar(clicar(s, { x: 1, y: 1 }).sessao, { x: 50, y: 0 }).sessao;
    expect(instrucao(s)).toBe("Clique no mesmo segundo ponto numa camada já alinhada.");
    expect(instrucao(trocarModo(clicar(trocarModo(s, "um_ponto"), { x: 0, y: 0 }).sessao, "um_ponto"))).toBe(
      "Clique num ponto da camada que está alinhando.",
    );
  });

  it("marcadores: a origem segue o desenho da camada, o destino fica no mundo", () => {
    const inicial = { tx: 100, ty: 0, giro: 0, escala: 1 };
    const s = clicarTodos(sessao(inicial), [{ x: 100, y: 0 }, { x: 7, y: 7 }, { x: 150, y: 0 }]).sessao;
    expect(marcadores(s)).toEqual([
      { mundo: { x: 100, y: 0 }, lado: "camada", par: 1 },
      { mundo: { x: 7, y: 7 }, lado: "base", par: 1 },
      { mundo: { x: 150, y: 0 }, lado: "camada", par: 2 },
    ]);
  });
});

describe("trocarModo", () => {
  it("descarta os cliques em andamento e mantém o alinhamento", () => {
    const s = clicar(sessao({ tx: 1, ty: 2, giro: 3, escala: 4 }), { x: 1, y: 1 }).sessao;
    const t = trocarModo(s, "ajuste");
    expect(t.modo).toBe("ajuste");
    expect(t.cliques).toEqual([]);
    expect(t.atual).toEqual(s.atual);
  });

  it("no ajuste fino o clique não faz nada e a instrução explica o arraste", () => {
    const s = sessao(IDENTIDADE, "ajuste");
    expect(clicar(s, { x: 1, y: 1 }).sessao).toEqual(s);
    expect(instrucao(s)).toBe(
      "Arraste a camada, use as setas (Shift = passo maior) ou digite os valores. O botão do meio do mouse move a vista.",
    );
  });
});

describe("deslocar (arrastar e setas)", () => {
  it("desloca no mundo e registra um passo de desfazer quando pedido", () => {
    const s = deslocar(sessao({ tx: 1, ty: 1, giro: 45, escala: 3 }), { x: 10, y: -5 }, true);
    expect(s.atual).toEqual({ tx: 11, ty: -4, giro: 45, escala: 3 });
    expect(s.desfazer).toEqual([{ tx: 1, ty: 1, giro: 45, escala: 3 }]);
  });

  it("no meio do arraste não empilha um passo por movimento", () => {
    let s = deslocar(sessao(), { x: 1, y: 0 }, true);
    s = deslocar(s, { x: 1, y: 0 }, false);
    s = deslocar(s, { x: 1, y: 0 }, false);
    expect(s.atual.tx).toBe(3);
    expect(s.desfazer).toHaveLength(1);
  });
});

describe("passoDaSeta", () => {
  it("1 px de tela por seta, 10 px com Shift, convertido pela escala da vista", () => {
    expect(passoDaSeta("ArrowRight", false, 2)).toEqual({ x: 0.5, y: 0 });
    expect(passoDaSeta("ArrowLeft", true, 2)).toEqual({ x: -5, y: 0 });
    expect(passoDaSeta("ArrowUp", false, 4)).toEqual({ x: 0, y: -0.25 });
    expect(passoDaSeta("ArrowDown", true, 1)).toEqual({ x: 0, y: 10 });
  });
  it("outra tecla não é passo", () => {
    expect(passoDaSeta("Enter", false, 1)).toBeNull();
  });
});

describe("definirCampos", () => {
  it("grava os números digitados com um passo de desfazer e normaliza o giro", () => {
    const r = definirCampos(sessao(), { tx: 12.5, giro: 270, escala: 2 });
    expect(r.erro).toBeUndefined();
    expect(r.sessao.atual).toEqual({ tx: 12.5, ty: 0, giro: -90, escala: 2 });
    expect(r.sessao.desfazer).toEqual([IDENTIDADE]);
  });
  it("escala zero ou negativa é recusada com a mensagem da ação e nada muda", () => {
    const s = sessao();
    expect(definirCampos(s, { escala: 0 })).toEqual({ sessao: s, erro: "A escala precisa ser maior que zero." });
    expect(definirCampos(s, { escala: -1 }).erro).toBe("A escala precisa ser maior que zero.");
  });
  it("valor que não é número é recusado", () => {
    const s = sessao();
    expect(definirCampos(s, { tx: Number.NaN })).toEqual({ sessao: s, erro: "Digite um número." });
  });
  it("o mesmo valor não empilha passo", () => {
    const s = sessao({ tx: 1, ty: 2, giro: 3, escala: 4 });
    expect(definirCampos(s, { tx: 1 }).sessao.desfazer).toEqual([]);
  });
});

describe("desfazer", () => {
  it("volta ao alinhamento anterior e limpa cliques em andamento", () => {
    let s = deslocar(sessao(), { x: 5, y: 0 }, true);
    s = clicar(trocarModo(s, "um_ponto"), { x: 1, y: 1 }).sessao;
    const d = desfazer(s);
    expect(d.atual).toEqual(IDENTIDADE);
    expect(d.desfazer).toEqual([]);
    expect(d.cliques).toEqual([]);
    expect(mudou(d)).toBe(false);
  });
  it("sem passo para desfazer nada muda", () => {
    const s = sessao();
    expect(desfazer(s)).toEqual(s);
  });
  it(`guarda no máximo ${LIMITE_DESFAZER} passos`, () => {
    let s = sessao();
    for (let i = 0; i < LIMITE_DESFAZER + 5; i++) s = deslocar(s, { x: 1, y: 0 }, true);
    expect(s.desfazer).toHaveLength(LIMITE_DESFAZER);
    expect(s.desfazer[0].tx).toBe(5);
  });
});
