import { describe, expect, it } from "vitest";
import { HR_ADMIN_ROLES, INTERNAL_ROLES } from "@/lib/roles";
import { contratoTemDados, podeVerContrato } from "./fonte";

/**
 * O gate por registro da fonte `contrato` do Estúdio.
 *
 * `FonteDef.permissao` autoriza por FONTE, com `recurso:acao` fixo — não distingue um contrato de
 * cliente de um contrato de equipe, que carrega salário, CPF e RG. Esta é a linha que impede
 * qualquer um com `juridico:ver` de gerar um documento com a folha de pagamento de um colega.
 */

const equipe = { vinculoId: "vinc-1" };
const cliente = { vinculoId: null };

describe("podeVerContrato — contrato de EQUIPE", () => {
  it.each(HR_ADMIN_ROLES)("RH (%s) vê", (role) => {
    expect(podeVerContrato(equipe, { role })).toBe(true);
  });

  it("qualquer papel FORA de HR_ADMIN_ROLES é barrado", () => {
    // Varre todos os papéis internos em vez de listar alguns à mão: papel NOVO adicionado ao
    // sistema entra neste teste sozinho e falha se alguém o incluir sem pensar no salário.
    const foraDoRh = INTERNAL_ROLES.filter((r) => !HR_ADMIN_ROLES.includes(r));
    expect(foraDoRh.length).toBeGreaterThan(0);
    for (const role of foraDoRh) {
      expect(podeVerContrato(equipe, { role }), `papel "${role}" NÃO pode ver contrato de equipe`).toBe(false);
    }
  });

  it("cliente e papel desconhecido também são barrados", () => {
    expect(podeVerContrato(equipe, { role: "cliente" })).toBe(false);
    expect(podeVerContrato(equipe, { role: "papel_inexistente" })).toBe(false);
  });

  it("nomeia quem hoje é barrado, para a lista não mudar sem alguém perceber", () => {
    // Explícito de propósito, em vez de derivado das constantes: se um papel sair desta lista
    // (por entrar em HR_ADMIN_ROLES), o teste cai e obriga a decisão a ser consciente — é folha
    // de pagamento que passa a ser visível.
    expect(INTERNAL_ROLES.filter((r) => !podeVerContrato(equipe, { role: r })).sort()).toEqual(
      ["clt", "estagiario", "freelancer", "projetista_pj", "ti"],
    );
  });
});

describe("podeVerContrato — contrato de CLIENTE", () => {
  it("passa para qualquer papel: o gate da fonte (juridico:ver) já filtrou antes", () => {
    for (const role of [...INTERNAL_ROLES, "cliente"]) {
      expect(podeVerContrato(cliente, { role })).toBe(true);
    }
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
