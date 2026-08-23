import { describe, expect, it, vi } from "vitest";
import {
  entregarPushBestEffort,
  persistirAutomacaoUmaVez,
  type AutomacaoComercialTx,
} from "./automacoes-dedup";

function txFake(): AutomacaoComercialTx {
  return {
    notificacao: { create: vi.fn(async () => ({ id: "notif-1" })) },
    automacaoComercialEnviada: { create: vi.fn(async () => ({})) },
  };
}

describe("persistirAutomacaoUmaVez", () => {
  it("persiste sino e dedup na mesma transação", async () => {
    const tx = txFake();
    const transacionar = vi.fn(async (operacao: (t: AutomacaoComercialTx) => Promise<string>) =>
      operacao(tx),
    );

    const resultado = await persistirAutomacaoUmaVez(
      transacionar,
      "u1",
      "regra:fato:2026-08-23",
      { titulo: "Alerta", corpo: "Corpo", href: "/comercial/fato" },
    );

    expect(resultado).toEqual({ criado: true, notificacaoId: "notif-1" });
    expect(tx.notificacao.create).toHaveBeenCalledWith({
      data: { userId: "u1", titulo: "Alerta", corpo: "Corpo", href: "/comercial/fato" },
    });
    expect(tx.automacaoComercialEnviada.create).toHaveBeenCalledWith({
      data: { userId: "u1", chave: "regra:fato:2026-08-23", notificacaoId: "notif-1" },
    });
  });

  it("transforma disputa P2002 em duplicata sem erro", async () => {
    const transacionar = vi.fn(async () => {
      throw Object.assign(new Error("unique"), { code: "P2002" });
    });
    await expect(
      persistirAutomacaoUmaVez(transacionar, "u1", "chave", {
        titulo: "Alerta",
        corpo: "Corpo",
        href: "/",
      }),
    ).resolves.toEqual({ criado: false, notificacaoId: null });
  });

  it("não esconde falha que não seja conflito único", async () => {
    const erro = new Error("banco indisponível");
    await expect(
      persistirAutomacaoUmaVez(async () => Promise.reject(erro), "u1", "chave", {
        titulo: "Alerta",
        corpo: "Corpo",
        href: "/",
      }),
    ).rejects.toBe(erro);
  });
});

describe("entregarPushBestEffort", () => {
  it("registra a falha sem propagar", async () => {
    const aoFalhar = vi.fn();
    const resultado = await entregarPushBestEffort(
      async () => Promise.reject(new Error("push fora")),
      aoFalhar,
    );
    expect(resultado).toBe(false);
    expect(aoFalhar).toHaveBeenCalledOnce();
  });
});
