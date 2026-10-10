import { describe, expect, it } from "vitest";
import { contratoTemDados, podeVerContrato } from "./fonte";

/**
 * O gate por registro da fonte `contrato` do Estúdio.
 *
 * `FonteDef.permissao` autoriza por FONTE, com `recurso:acao` fixo — não distingue um contrato de
 * cliente de um contrato de equipe, que carrega salário, CPF e RG. Esta é a linha que impede
 * qualquer um com `juridico:ver` de gerar um documento com a folha de pagamento de um colega.
 *
 * Desde a Onda F (§16.4) "ser RH" é a permissão `rh:gerir`, dada pessoa a pessoa — o papel não conta.
 */

const equipe = { vinculoId: "vinc-1" };
const cliente = { vinculoId: null };

describe("podeVerContrato — contrato de EQUIPE", () => {
  it("quem tem rh:gerir vê", () => {
    expect(podeVerContrato(equipe, { gereRh: true })).toBe(true);
  });

  it("quem não tem rh:gerir é barrado, seja qual for o papel ou o perfil", () => {
    expect(podeVerContrato(equipe, { gereRh: false })).toBe(false);
  });
});

describe("podeVerContrato — contrato de CLIENTE", () => {
  it("passa para qualquer um: o gate da fonte (juridico:ver) já filtrou antes", () => {
    expect(podeVerContrato(cliente, { gereRh: false })).toBe(true);
    expect(podeVerContrato(cliente, { gereRh: true })).toBe(true);
  });
});

describe("contratoTemDados", () => {
  it("distingue resolução bloqueada/inexistente de contrato real", () => {
    // Quem GERA contrato precisa recusar o caso vazio: um PDF com todas as cláusulas em branco é
    // entregável, e alguém pode assiná-lo.
    expect(contratoTemDados({ escalar: {}, linhas: [] })).toBe(false);
    expect(contratoTemDados({ escalar: { ContratoTitulo: "X" }, linhas: [] })).toBe(true);
  });
});
