import { describe, expect, it } from "vitest";

import { cargaDaLinha } from "@/modules/ferramentas/calc/cargas-demanda/carga-instalada";

import { conteudoSchema, type ConteudoCargasDemanda } from "./conteudo";
import {
  atualizarDoLevantamento,
  avisosDeVinculo,
  avisosDoEscopo,
  chaveDoEquipamento,
  estadoDoVinculo,
  iluminacaoDoAmbiente,
  totaisDoEscopo,
  trazerLinha,
  trazerLinhas,
} from "./levantamento";

/**
 * Caso 20 da planilha `casos-de-teste-demanda-preliminar.xlsx` — vínculo com o levantamento (Neoenergia): dois
 * ambientes alimentam a linha de iluminação e a de tomadas de uso geral do cálculo de demanda.
 *   Ambiente 1: iluminação 280 VA, FP 1,00; TUG 4 × 100 VA, FP 0,80
 *   Ambiente 2: iluminação 100 VA, FP 1,00; TUG 1 × 600 VA, FP 0,80
 *   saída: iluminação 380 W; TUG 800 W (± 0,01); alerta ao alterar o levantamento depois de trazer:
 *   "O levantamento foi alterado depois de trazer os valores. Atualize o cálculo."
 * Os demais testes cobrem as regras de vínculo da spec §3.1 (sem número de norma: são regras de comportamento).
 */

const perto = (recebido: number | null, esperado: number, tol = 0.01) => {
  expect(recebido).not.toBeNull();
  expect(Math.abs((recebido as number) - esperado)).toBeLessThanOrEqual(tol + 1e-12);
};

function estudo(ilum1 = 280, extra: Record<string, unknown>[] = []): ConteudoCargasDemanda {
  const amb = (id: string, vaIl: number, tug: { n: number; va: number }, mais: Record<string, unknown>[] = []) => ({
    id,
    nome: id,
    iluminacao: { vaAdotado: vaIl, fp: 1 },
    pontos: [{ id: `${id}-tug`, tipo: "tug", quantidade: tug.n, vaPorPonto: tug.va, fp: 0.8 }, ...mais],
  });
  return conteudoSchema.parse({
    criterioIluminacao: "habitacao",
    levantamentos: [
      {
        id: "lev1",
        nome: "Flat tipo A",
        pavimentos: [{ id: "pav1", nome: "Térreo", ambientes: [amb("a1", ilum1, { n: 4, va: 100 }, extra), amb("a2", 100, { n: 1, va: 600 })] }],
      },
    ],
    calculos: [{ id: "k1", nome: "Demanda do flat", metodo: "carga_instalada", escopo: { levantamentoIds: ["lev1"], quantidade: 1 } }],
  });
}

let seq = 0;
const novoId = () => `l${++seq}`;

describe("caso 20 — vínculo com o levantamento (planilha)", () => {
  const c = estudo();
  const totais = totaisDoEscopo(c, ["lev1"]);
  const linhas = trazerLinhas(totais, novoId);

  it("a linha de iluminação traz 380 W", () => {
    const il = linhas.find((l) => l.tipoCarga === "iluminacao")!;
    perto(il.quantidade! * il.potenciaW!, 380);
    perto(totais.iluminacao.w, 380);
  });

  it("a linha de tomadas de uso geral traz 800 W", () => {
    const tug = linhas.find((l) => l.tipoCarga === "tomadas_uso_geral")!;
    perto(tug.quantidade! * tug.potenciaW!, 800);
    perto(totais.tug.w, 800);
  });

  it("alterar o levantamento depois de trazer dispara o alerta da §6, com o texto da planilha", () => {
    const il = linhas.find((l) => l.tipoCarga === "iluminacao")!;
    const alterado = totaisDoEscopo(estudo(300), ["lev1"]);
    const e = estadoDoVinculo(il, alterado);
    expect(e.levantamentoAlterado).toBe(true);
    const aviso = e.avisos.find((a) => a.id === "levantamento_alterado")!;
    expect(aviso.texto).toBe("O levantamento foi alterado depois de trazer os valores. Atualize o cálculo.");
    expect(aviso.tipo).toBe("alerta");
    // nunca sobrescreve sozinha: a linha segue com o que trouxe
    perto(il.quantidade! * il.potenciaW!, 380);
  });
});

describe("trazer — regras 1 a 4 da spec §3.1", () => {
  it("traz iluminação (W, VA e FP), TUG (quantidade, VA e W) e deixa FD em branco para o projetista", () => {
    const totais = totaisDoEscopo(estudo(), ["lev1"]);
    expect(totais.iluminacao).toMatchObject({ itens: 2, va: 380, w: 380, fp: 1 });
    expect(totais.tug).toMatchObject({ itens: 2, quantidade: 5, va: 1000, w: 800 });
    perto(totais.tug.fp, 0.8);
    const linhas = trazerLinhas(totais, novoId);
    expect(linhas.map((l) => l.tipoCarga)).toEqual(["iluminacao", "tomadas_uso_geral"]);
    for (const l of linhas) {
      expect(l.fd).toBeNull();
      expect(l.vinculo).not.toBeNull();
    }
    const tug = linhas[1];
    expect(tug.quantidade).toBe(5);
    perto(tug.potenciaW, 160);
    perto(tug.fp, 0.8);
  });

  it("logo depois de trazer a linha é 'do levantamento', sem aviso", () => {
    const totais = totaisDoEscopo(estudo(), ["lev1"]);
    for (const l of trazerLinhas(totais, novoId)) {
      expect(estadoDoVinculo(l, totais)).toEqual({ situacao: "do_levantamento", levantamentoAlterado: false, avisos: [] });
    }
  });

  it("o × N multiplica o escopo na carga instalada, não nos totais do levantamento", () => {
    const totais = totaisDoEscopo(estudo(), ["lev1"]);
    const tug = trazerLinhas(totais, novoId)[1];
    const um = cargaDaLinha({ quantidade: tug.quantidade!, potenciaW: tug.potenciaW!, fp: tug.fp! }, 1);
    const tres = cargaDaLinha({ quantidade: tug.quantidade!, potenciaW: tug.potenciaW!, fp: tug.fp! }, 3);
    perto(um.kW, 0.8);
    perto(tres.kW, 2.4);
    perto(tres.kVA, 3);
  });

  it("soma os levantamentos do escopo e ignora os de fora", () => {
    const a = estudo();
    const c = conteudoSchema.parse({
      ...a,
      levantamentos: [
        ...a.levantamentos,
        { id: "lev2", nome: "Condomínio", pavimentos: [{ id: "pav2", nome: "T", ambientes: [{ id: "b1", nome: "Hall", iluminacao: { vaAdotado: 500, fp: 1 } }] }] },
      ],
    });
    expect(totaisDoEscopo(c, ["lev1"]).iluminacao.va).toBe(380);
    expect(totaisDoEscopo(c, ["lev1", "lev2"]).iluminacao.va).toBe(880);
    expect(totaisDoEscopo(c, ["lev2"]).tug.itens).toBe(0);
    expect(totaisDoEscopo(c, []).iluminacao.itens).toBe(0);
  });

  it("junta as TUE de mesmo nome entre ambientes (sem acento nem caixa) e separa as de nome diferente", () => {
    const c = estudo(280, [{ id: "p1", tipo: "tue", descricao: "Chuveiro", quantidade: 1, vaPorPonto: 5000, fp: 1 }]);
    const base = c.levantamentos[0].pavimentos[0].ambientes;
    base[1].pontos.push(
      { id: "p2", tipo: "tue", descricao: " chuvéiro ", quantidade: 1, vaPorPonto: 5000, fp: 1 },
      { id: "p3", tipo: "tue", descricao: "Forno", quantidade: 1, vaPorPonto: 3000, fp: 0.9 },
    );
    const t = totaisDoEscopo(c, ["lev1"]);
    expect(t.equipamentos.map((e) => [e.chave, e.total.quantidade, e.total.va])).toEqual([
      ["chuveiro", 2, 10000],
      ["forno", 1, 3000],
    ]);
    const linhas = trazerLinhas(t, novoId);
    expect(linhas.map((l) => l.tipoCarga)).toEqual(["iluminacao", "tomadas_uso_geral", "tomadas_uso_especifico", "tomadas_uso_especifico"]);
    expect(linhas[2].descricao).toBe("Chuveiro");
    expect(chaveDoEquipamento("  Chuvéiro  ")).toBe("chuveiro");
  });

  it("FP em branco deixa o total em '—' e não traz a linha", () => {
    const c = estudo();
    c.levantamentos[0].pavimentos[0].ambientes[0].pontos[0].fp = null;
    const t = totaisDoEscopo(c, ["lev1"]);
    expect(t.tug).toMatchObject({ itens: 2, va: 1000, w: null, fp: null });
    expect(trazerLinha(t, { tipo: "tug" }, "x")).toBeNull();
    expect(trazerLinhas(t, novoId).map((l) => l.tipoCarga)).toEqual(["iluminacao"]);
  });

  it("critério de iluminação não escolhido: a iluminação fica incompleta", () => {
    const c = estudo();
    c.criterioIluminacao = null;
    expect(totaisDoEscopo(c, ["lev1"]).iluminacao.w).toBeNull();
  });
});

describe("iluminação por lux no levantamento", () => {
  const amb = (extra: Record<string, unknown> = {}) =>
    conteudoSchema.parse({
      levantamentos: [
        {
          id: "l",
          nome: "L",
          pavimentos: [
            {
              id: "p",
              nome: "P",
              ambientes: [
                {
                  id: "a",
                  nome: "Sala",
                  areaM2: 20,
                  perimetroM: 18,
                  alturaPlanoM: 0.8,
                  iluminacao: { emLux: 300, fu: 0.6, fm: 0.8, luminaria: { fluxoLm: 3000, potenciaW: 30, fp: 0.9 }, quantidade: 4, ...extra },
                },
              ],
            },
          ],
        },
      ],
    }).levantamentos[0].pavimentos[0].ambientes[0];

  it("potência = quantidade × potência da luminária; VA = W ÷ FP (passo 6)", () => {
    const r = iluminacaoDoAmbiente(amb(), "lux", 2.8)!;
    perto(r.w, 120);
    perto(r.va, 120 / 0.9);
  });

  it("sem pé-direito, sem Fu ou sem luminária: incompleto", () => {
    expect(iluminacaoDoAmbiente(amb(), "lux", null)).toBeNull();
    expect(iluminacaoDoAmbiente(amb({ fu: null }), "lux", 2.8)).toBeNull();
    expect(iluminacaoDoAmbiente(amb({ luminaria: { fluxoLm: null, potenciaW: 30, fp: 0.9 } }), "lux", 2.8)).toBeNull();
  });

  it("quantidade em branco adota a sugerida", () => {
    // Φ = 300·20 ÷ (0,6·0,8) = 12.500 lm → 12.500 ÷ 3.000 = 4,17 → 5 luminárias
    const r = iluminacaoDoAmbiente(amb({ quantidade: null }), "lux", 2.8)!;
    perto(r.w, 150);
  });
});

describe("edição e atualização — o levantamento nunca é copiado sozinho", () => {
  it("valor trazido editado: 'diferente do levantamento' + informativo da §6", () => {
    const totais = totaisDoEscopo(estudo(), ["lev1"]);
    const il = { ...trazerLinhas(totais, novoId)[0], potenciaW: 400 };
    const e = estadoDoVinculo(il, totais);
    expect(e.situacao).toBe("diferente_do_levantamento");
    expect(e.levantamentoAlterado).toBe(false);
    expect(e.avisos.map((a) => [a.id, a.tipo, a.texto])).toEqual([["valor_editado", "informativo", "Valor diferente do levantamento."]]);
  });

  it("linha digitada não tem vínculo nem aviso", () => {
    const totais = totaisDoEscopo(estudo(), ["lev1"]);
    const l = { ...trazerLinhas(totais, novoId)[0], vinculo: null };
    expect(estadoDoVinculo(l, totais)).toEqual({ situacao: "digitada", levantamentoAlterado: false, avisos: [] });
    expect(atualizarDoLevantamento(l, totais)).toMatchObject({ atualizada: false, motivo: "sem_vinculo" });
  });

  it("atualizar renova a linha e o 'trazido': o alerta some; FD e tipo de carga ficam", () => {
    const antes = totaisDoEscopo(estudo(), ["lev1"]);
    const il = { ...trazerLinhas(antes, novoId)[0], fd: 0.8 };
    const depois = totaisDoEscopo(estudo(300), ["lev1"]);
    const r = atualizarDoLevantamento(il, depois);
    expect(r.atualizada).toBe(true);
    perto(r.linha.quantidade! * r.linha.potenciaW!, 400);
    expect(r.linha.fd).toBe(0.8);
    expect(r.linha.tipoCarga).toBe("iluminacao");
    expect(estadoDoVinculo(r.linha, depois)).toEqual({ situacao: "do_levantamento", levantamentoAlterado: false, avisos: [] });
    expect(il.potenciaW).toBe(380); // a linha original não foi mexida
  });

  it("não atualiza o que está em dia", () => {
    const t = totaisDoEscopo(estudo(), ["lev1"]);
    expect(atualizarDoLevantamento(trazerLinhas(t, novoId)[0], t)).toMatchObject({ atualizada: false, motivo: "ja_atualizada" });
  });

  it("linha editada à mão não é sobrescrita, a menos que o projetista descarte a edição", () => {
    const antes = totaisDoEscopo(estudo(), ["lev1"]);
    const editada = { ...trazerLinhas(antes, novoId)[0], potenciaW: 999 };
    const depois = totaisDoEscopo(estudo(300), ["lev1"]);
    const recusada = atualizarDoLevantamento(editada, depois);
    expect(recusada).toMatchObject({ atualizada: false, motivo: "editada" });
    expect(recusada.linha).toBe(editada);
    const e = estadoDoVinculo(editada, depois);
    expect(e.avisos.map((a) => a.id)).toEqual(["levantamento_alterado", "valor_editado"]);
    const forcada = atualizarDoLevantamento(editada, depois, { descartarEdicao: true });
    expect(forcada.atualizada).toBe(true);
    perto(forcada.linha.potenciaW, 400);
  });

  it("o levantamento voltar ao valor trazido apaga o alerta", () => {
    const il = trazerLinhas(totaisDoEscopo(estudo(), ["lev1"]), novoId)[0];
    expect(estadoDoVinculo(il, totaisDoEscopo(estudo(300), ["lev1"])).levantamentoAlterado).toBe(true);
    expect(estadoDoVinculo(il, totaisDoEscopo(estudo(280), ["lev1"])).levantamentoAlterado).toBe(false);
  });

  it("origem que sumiu do levantamento: alerta e nada a atualizar", () => {
    const c = estudo(280, [{ id: "p1", tipo: "tue", descricao: "Chuveiro", quantidade: 1, vaPorPonto: 5000, fp: 1 }]);
    const linha = trazerLinhas(totaisDoEscopo(c, ["lev1"]), novoId).find((l) => l.tipoCarga === "tomadas_uso_especifico")!;
    const sem = totaisDoEscopo(estudo(), ["lev1"]);
    expect(estadoDoVinculo(linha, sem).levantamentoAlterado).toBe(true);
    expect(atualizarDoLevantamento(linha, sem)).toMatchObject({ atualizada: false, motivo: "sem_correspondente" });
  });

  it("avisosDeVinculo lista só as linhas com aviso", () => {
    const antes = totaisDoEscopo(estudo(), ["lev1"]);
    const linhas = trazerLinhas(antes, novoId);
    const depois = totaisDoEscopo(estudo(300), ["lev1"]);
    const mapa = avisosDeVinculo({ linhas }, depois);
    expect([...mapa.keys()]).toEqual([linhas[0].id]);
  });
});

describe("cálculo sem escopo", () => {
  it("sem levantamento e sem linha: alerta; com linha digitada ou com escopo: nada", () => {
    const base = estudo().calculos[0];
    const vazio = { escopo: { levantamentoIds: [], quantidade: 1 }, linhas: [] };
    expect(avisosDoEscopo(vazio).map((a) => a.texto)).toEqual(["Este cálculo não tem escopo. Escolha o levantamento ou digite as cargas."]);
    expect(avisosDoEscopo(base)).toEqual([]);
    const digitada = trazerLinhas(totaisDoEscopo(estudo(), ["lev1"]), novoId).map((l) => ({ ...l, vinculo: null }));
    expect(avisosDoEscopo({ escopo: vazio.escopo, linhas: digitada })).toEqual([]);
  });
});
