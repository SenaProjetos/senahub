import { describe, expect, it } from "vitest";
import { motivoParaNaoAceitar, situacaoDaRevisao, type EstadoDaRevisao, type SituacaoDaRevisao } from "./regras";
import { indisponibilidade, motivoNaTelaDoPedido, motivoParaNaoAceitarModelo, piorSituacao } from "./modelo-regras";

/**
 * A fila (e o detalhe) mostram o motivo "indisponível" a partir da situação lida (`indisponibilidade` →
 * `motivoNaTelaDoPedido`); o aceite recusa por `motivoParaNaoAceitar` / `motivoParaNaoAceitarModelo`. Para quem pode
 * decidir, as duas frases são sempre a mesma — a tela nunca promete um aceite que o servidor recusa, nem o contrário.
 */
const PODE_TUDO = { podeValidar: true, podeCoordenar: true };
const SITUACOES: SituacaoDaRevisao[] = ["nas_entregas", "retirada", "substituida"];

describe("fila × aceite: a mesma regra do indisponível", () => {
  it("pedido de modelo: toda combinação de situações das marcações (inclusive sem marcação)", () => {
    const combinacoes: SituacaoDaRevisao[][] = [[]];
    for (let n = 0; n < 3; n++) {
      for (const c of [...combinacoes]) for (const s of SITUACOES) combinacoes.push([...c, s]);
    }
    for (const situacoes of combinacoes) {
      const naFila = motivoNaTelaDoPedido({ tipo: "modelo", indisponivel: indisponibilidade(piorSituacao(situacoes)) }, PODE_TUDO);
      const noAceite = motivoParaNaoAceitarModelo({ status: "aguardando", situacoes });
      expect(naFila, JSON.stringify(situacoes)).toBe(noAceite);
    }
  });

  it("pedido de prancha: todo estado da revisão", () => {
    const bool = [false, true];
    for (const estado of [null, "em_andamento", "compartilhado", "publicado", "arquivado"]) {
      for (const participa of bool)
        for (const uploadSubstituido of bool)
          for (const uploadExcluido of bool)
            for (const nasPastasDoCliente of bool)
              for (const outraNasPastas of bool) {
                const revisao: EstadoDaRevisao = {
                  estado,
                  participa,
                  uploadSubstituido,
                  uploadExcluido,
                  arquivada: estado === "arquivado",
                  nasPastasDoCliente,
                  outraNasPastas,
                };
                const naFila = motivoNaTelaDoPedido(
                  { tipo: "prancha", indisponivel: indisponibilidade(situacaoDaRevisao(revisao)) },
                  PODE_TUDO,
                );
                const noAceite = motivoParaNaoAceitar({ status: "aguardando", podeValidar: true, revisao });
                expect(naFila, JSON.stringify(revisao)).toBe(noAceite);
              }
    }
  });
});
