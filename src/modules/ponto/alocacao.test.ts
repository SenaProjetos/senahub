import { describe, expect, it } from "vitest";
import {
  ALOCACAO_REUNIAO_EXTERNA,
  ALOCACAO_REUNIAO_INTERNA,
  ALOCACAO_SEM_PROJETO,
  alocacoesDistintas,
  normalizarAlocacaoPonto,
  selecaoDaAlocacaoPonto,
  tarefaDoDestino,
} from "./alocacao";

describe("alocação de ponto", () => {
  it("separa as reuniões das horas sem projeto", () => {
    expect(normalizarAlocacaoPonto(ALOCACAO_REUNIAO_INTERNA)).toEqual({
      projetoId: null,
      tipoAlocacao: "reuniao_interna",
    });
    expect(normalizarAlocacaoPonto(ALOCACAO_REUNIAO_EXTERNA)).toEqual({
      projetoId: null,
      tipoAlocacao: "reuniao_externa",
    });
  });

  it("preserva uma seleção de projeto e converte o sem projeto", () => {
    expect(normalizarAlocacaoPonto("projeto-42")).toEqual({
      projetoId: "projeto-42",
      tipoAlocacao: "projeto",
    });
    expect(normalizarAlocacaoPonto()).toEqual({ projetoId: null, tipoAlocacao: "sem_projeto" });
    expect(selecaoDaAlocacaoPonto(null, "sem_projeto")).toBe(ALOCACAO_SEM_PROJETO);
  });
});

describe("alocações recentes", () => {
  const vila = { id: "p1", codigo: "260001", nome: "Residencial Vila Real" };
  const hosp = { id: "p5", codigo: "260005", nome: "Hospital Municipal Norte" };

  it("mantém a ordem de chegada e tira as repetidas", () => {
    const r = alocacoesDistintas(
      [
        { tipoAlocacao: "projeto", projeto: hosp },
        { tipoAlocacao: "reuniao_interna", projeto: null },
        { tipoAlocacao: "projeto", projeto: hosp },
        { tipoAlocacao: "projeto", projeto: vila },
      ],
      5,
    );
    expect(r.map((a) => a.selecao)).toEqual(["p5", ALOCACAO_REUNIAO_INTERNA, "p1"]);
  });

  it("deixa de fora sem projeto e sessão de projeto sem o projeto", () => {
    const r = alocacoesDistintas(
      [
        { tipoAlocacao: "sem_projeto", projeto: null },
        { tipoAlocacao: "projeto", projeto: null },
        { tipoAlocacao: "reuniao_externa", projeto: null },
      ],
      5,
    );
    expect(r).toEqual([{ selecao: ALOCACAO_REUNIAO_EXTERNA, tipoAlocacao: "reuniao_externa", projeto: null }]);
  });

  it("para no limite", () => {
    const r = alocacoesDistintas(
      [
        { tipoAlocacao: "projeto", projeto: hosp },
        { tipoAlocacao: "projeto", projeto: vila },
        { tipoAlocacao: "reuniao_interna", projeto: null },
      ],
      2,
    );
    expect(r.map((a) => a.selecao)).toEqual(["p5", "p1"]);
  });
});

describe("tarefa do destino no card do celular", () => {
  const base = { destino: "p1", rodando: false, selecaoCorrente: "p1", tarefaCorrenteId: "t1", escolhida: null };

  it("rodando, vale a tarefa da sessão aberta", () => {
    expect(tarefaDoDestino({ ...base, rodando: true, escolhida: "t9" })).toBe("t1");
    expect(tarefaDoDestino({ ...base, rodando: true, tarefaCorrenteId: "" })).toBe("");
  });

  it("parado no mesmo projeto, retoma a tarefa da última sessão", () => {
    expect(tarefaDoDestino(base)).toBe("t1");
  });

  it("parado em outro projeto, começa sem tarefa", () => {
    expect(tarefaDoDestino({ ...base, destino: "p2" })).toBe("");
  });

  it("a escolha da gaveta vence, inclusive escolher nenhuma", () => {
    expect(tarefaDoDestino({ ...base, destino: "p2", escolhida: "t5" })).toBe("t5");
    expect(tarefaDoDestino({ ...base, escolhida: "" })).toBe("");
  });

  it("reunião e sem projeto nunca têm tarefa", () => {
    expect(tarefaDoDestino({ ...base, destino: ALOCACAO_REUNIAO_INTERNA, selecaoCorrente: ALOCACAO_REUNIAO_INTERNA })).toBe("");
    expect(tarefaDoDestino({ ...base, destino: ALOCACAO_SEM_PROJETO, escolhida: "t5" })).toBe("");
  });
});
