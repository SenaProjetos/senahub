import { describe, it, expect } from "vitest";
import {
  planejarSincronizacao,
  bloqueioSincronizacao,
  planoVazio,
  PLANO_VAZIO,
  type PagamentoAtual,
} from "@/modules/uploads/sincronizacao-pagamento";

const pend = (id: string, projetistaId: string, valor: number): PagamentoAtual => ({
  id,
  projetistaId,
  valor,
  status: "pendente",
});

describe("bloqueioSincronizacao", () => {
  it("libera quando só há pendentes", () => {
    expect(bloqueioSincronizacao([pend("p1", "a", 400)])).toBeNull();
  });

  it("libera disciplina sem pagamento", () => {
    expect(bloqueioSincronizacao([])).toBeNull();
  });

  it("bloqueia quando algum pagamento já foi efetivado", () => {
    const atuais: PagamentoAtual[] = [pend("p1", "a", 400), { id: "p2", projetistaId: "b", valor: 400, status: "pago" }];
    expect(bloqueioSincronizacao(atuais)).toMatch(/pagamento efetivado/i);
  });

  it("cancelado não bloqueia — é história, não dinheiro que saiu", () => {
    expect(bloqueioSincronizacao([{ id: "p1", projetistaId: "a", valor: 0, status: "cancelado" }])).toBeNull();
  });
});

describe("planejarSincronizacao", () => {
  it("disciplina nunca concluída (sem pagamento) não gera plano", () => {
    expect(planejarSincronizacao([], [{ userId: "a", valor: 400 }])).toEqual(PLANO_VAZIO);
  });

  it("valor inalterado não gera movimento", () => {
    const plano = planejarSincronizacao([pend("p1", "a", 400)], [{ userId: "a", valor: 400 }]);
    expect(planoVazio(plano)).toBe(true);
  });

  it("valor alterado atualiza o pendente", () => {
    const plano = planejarSincronizacao([pend("p1", "a", 400)], [{ userId: "a", valor: 900 }]);
    expect(plano.atualizar).toEqual([{ pagamentoId: "p1", valor: 900 }]);
    expect(plano.cancelar).toEqual([]);
    expect(plano.criar).toEqual([]);
  });

  it("linha de R$ 0,00 ganha valor — caso das disciplinas concluídas sem valor", () => {
    const plano = planejarSincronizacao([pend("p1", "a", 0)], [{ userId: "a", valor: 1500 }]);
    expect(plano.atualizar).toEqual([{ pagamentoId: "p1", valor: 1500 }]);
  });

  it("valor zerado CANCELA o pendente em vez de gravar R$ 0,00", () => {
    const plano = planejarSincronizacao([pend("p1", "a", 400)], [{ userId: "a", valor: 0 }]);
    expect(plano.cancelar).toEqual([{ pagamentoId: "p1" }]);
    expect(plano.atualizar).toEqual([]);
    expect(plano.criar).toEqual([]);
  });

  it("sem cota nenhuma (valor limpo) cancela todos os pendentes", () => {
    const plano = planejarSincronizacao([pend("p1", "a", 400), pend("p2", "b", 400)], []);
    expect(plano.cancelar).toEqual([{ pagamentoId: "p1" }, { pagamentoId: "p2" }]);
  });

  it("responsável removido tem o pendente cancelado", () => {
    const plano = planejarSincronizacao(
      [pend("p1", "a", 500), pend("p2", "b", 500)],
      [{ userId: "a", valor: 1000 }],
    );
    expect(plano.atualizar).toEqual([{ pagamentoId: "p1", valor: 1000 }]);
    expect(plano.cancelar).toEqual([{ pagamentoId: "p2" }]);
  });

  it("responsável adicionado ganha pagamento novo", () => {
    const plano = planejarSincronizacao(
      [pend("p1", "a", 1000)],
      [{ userId: "a", valor: 500 }, { userId: "b", valor: 500 }],
    );
    expect(plano.atualizar).toEqual([{ pagamentoId: "p1", valor: 500 }]);
    expect(plano.criar).toEqual([{ userId: "b", valor: 500 }]);
  });

  it("pago não é tocado pelo plano (o bloqueio é quem recusa antes)", () => {
    const plano = planejarSincronizacao(
      [{ id: "p1", projetistaId: "a", valor: 400, status: "pago" }],
      [{ userId: "a", valor: 900 }],
    );
    expect(plano.atualizar).toEqual([]);
    expect(plano.criar).toEqual([{ userId: "a", valor: 900 }]);
  });

  it("responsável que volta recebe linha nova — cancelado não revive", () => {
    const plano = planejarSincronizacao(
      [{ id: "p1", projetistaId: "a", valor: 400, status: "cancelado" }],
      [{ userId: "a", valor: 700 }],
    );
    expect(plano.criar).toEqual([{ userId: "a", valor: 700 }]);
    expect(plano.atualizar).toEqual([]);
    expect(plano.cancelar).toEqual([]);
  });
});
