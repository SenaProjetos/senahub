import { describe, expect, it } from "vitest";
import { criarItem } from "./service";
import { ActionError } from "@/lib/action-error";

// A regra "serviço sem vínculo é recusado" é checada ANTES de qualquer acesso ao banco (guard
// síncrono, no topo de criarItem) — testável sem DB, igual ao padrão já usado em
// notificacoes/avisos/service.test.ts pros helpers puros de um service.ts com I/O.
describe("criarItem — política de vínculo obrigatório (aprovada pelo usuário em 2026-07-30)", () => {
  it("recusa criar serviço sem composição nem insumo", async () => {
    await expect(
      criarItem({ orcamentoId: "orc-1", parentId: null, tipo: "servico", descricao: "Item avulso" }),
    ).rejects.toThrow(ActionError);
  });

  it("mensagem explica o motivo pro usuário", async () => {
    await expect(
      criarItem({ orcamentoId: "orc-1", parentId: null, tipo: "servico", descricao: "Item avulso" }),
    ).rejects.toThrow(/composição ou de um insumo/i);
  });
});
