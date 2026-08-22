import { describe, it, expect } from "vitest";
import {
  planejarVinculo,
  ESTAGIO_POR_STATUS_PROPOSTA,
  type PropostaPendente,
  type NegociacaoDoLead,
} from "@/modules/comercial/vinculo-negociacao";

function proposta(over: Partial<PropostaPendente> = {}): PropostaPendente {
  return {
    id: "prop-1",
    numero: "PR-260001",
    titulo: "Proposta X",
    status: "rascunho",
    clienteId: "cli-1",
    clienteNome: "Cliente Um",
    leadId: null,
    aceitaEm: null,
    valorTotal: null,
    ...over,
  };
}

const LEAD = { id: "lead-1", nome: "Lead Um" };
const NEG: NegociacaoDoLead = {
  id: "neg-1",
  titulo: "Negócio Um",
  clienteId: "cli-1",
  leadId: "lead-1",
  excluidoEm: null,
};

describe("planejarVinculo — deriva da negociação REAL quando dá", () => {
  it("proposta com lead que já virou negociação liga na real, sem criar sintética", () => {
    const { planos, abortos } = planejarVinculo([proposta({ leadId: "lead-1" })], [LEAD], [NEG]);
    expect(abortos).toEqual([]);
    expect(planos).toHaveLength(1);
    expect(planos[0]).toMatchObject({ tipo: "real", negociacaoId: "neg-1", tituloNegociacao: "Negócio Um" });
  });

  it("duas propostas do mesmo lead qualificado ligam na MESMA negociação real", () => {
    const { planos } = planejarVinculo(
      [proposta({ id: "p1", numero: "PR-1", leadId: "lead-1" }), proposta({ id: "p2", numero: "PR-2", leadId: "lead-1" })],
      [LEAD],
      [NEG],
    );
    expect(planos.every((p) => p.tipo === "real")).toBe(true);
    expect(planos.map((p) => (p.tipo === "real" ? p.negociacaoId : null))).toEqual(["neg-1", "neg-1"]);
  });
});

describe("planejarVinculo — sintética quando não há de onde derivar", () => {
  it("proposta sem lead vira sintética", () => {
    const { planos, abortos } = planejarVinculo([proposta()], [], []);
    expect(abortos).toEqual([]);
    expect(planos[0]).toMatchObject({ tipo: "sintetica", leadId: null });
  });

  it("lead que existe mas ainda NÃO foi qualificado vira sintética — não é aborto", () => {
    const { planos, abortos } = planejarVinculo([proposta({ leadId: "lead-1" })], [LEAD], []);
    expect(abortos).toEqual([]);
    expect(planos[0]).toMatchObject({ tipo: "sintetica", leadId: "lead-1" });
  });

  it("duas propostas do MESMO lead compartilham uma sintética (Negociacao.leadId é @unique)", () => {
    const { planos } = planejarVinculo(
      [proposta({ id: "p1", numero: "PR-1", leadId: "lead-1" }), proposta({ id: "p2", numero: "PR-2", leadId: "lead-1" })],
      [LEAD],
      [],
    );
    const chaves = planos.map((p) => (p.tipo === "sintetica" ? p.chaveGrupo : null));
    expect(chaves[0]).toBe(chaves[1]);
    expect(new Set(chaves).size).toBe(1);
  });

  it("duas propostas SEM lead ganham sintéticas separadas — não se assume que são o mesmo negócio", () => {
    const { planos } = planejarVinculo(
      [proposta({ id: "p1", numero: "PR-1" }), proposta({ id: "p2", numero: "PR-2" })],
      [],
      [],
    );
    const chaves = planos.map((p) => (p.tipo === "sintetica" ? p.chaveGrupo : null));
    expect(new Set(chaves).size).toBe(2);
  });
});

describe("planejarVinculo — estágio da sintética sai do status da proposta", () => {
  // F5.5: `em_negociacao` entrou no enum depois deste mapa existir (F5.2) — o TypeScript já
  // obriga a chave em `ESTAGIO_POR_STATUS_PROPOSTA`; este teste é o que pegaria, em runtime,
  // um valor MAPEADO ERRADO (o tipo não valida o VALOR, só a presença da chave).
  it("os 5 status mapeiam para estágios distintos e coerentes", () => {
    expect(ESTAGIO_POR_STATUS_PROPOSTA).toEqual({
      rascunho: "ORCAMENTO",
      enviada: "PROPOSTA_ENVIADA",
      em_negociacao: "NEGOCIACAO",
      aceita: "CONTRATADO",
      recusada: "PERDIDO",
    });
  });

  it("proposta aceita nasce CONTRATADO e carrega a data de fechamento", () => {
    const aceitaEm = new Date("2026-03-10T12:00:00Z");
    const { planos } = planejarVinculo([proposta({ status: "aceita", aceitaEm })], [], []);
    expect(planos[0]).toMatchObject({ tipo: "sintetica", estagio: "CONTRATADO", dataFechamento: aceitaEm });
  });

  it("proposta NÃO aceita não carrega data de fechamento, mesmo tendo aceitaEm residual", () => {
    const { planos } = planejarVinculo(
      [proposta({ status: "recusada", aceitaEm: new Date("2026-03-10T12:00:00Z") })],
      [],
      [],
    );
    expect(planos[0]).toMatchObject({ estagio: "PERDIDO", dataFechamento: null });
  });

  it("valor da sintética é a soma dos itens; proposta sem itens fica sem valor (o caso de produção)", () => {
    const comItens = planejarVinculo([proposta({ valorTotal: 15000 })], [], []).planos[0];
    expect(comItens).toMatchObject({ valorEstimado: 15000 });
    const semItens = planejarVinculo([proposta({ valorTotal: null })], [], []).planos[0];
    expect(semItens).toMatchObject({ valorEstimado: null });
  });
});

describe("planejarVinculo — recusa por inteiro em vez de adivinhar", () => {
  it("leadId apontando para lead inexistente aborta", () => {
    const { abortos } = planejarVinculo([proposta({ leadId: "lead-fantasma" })], [], []);
    expect(abortos).toHaveLength(1);
    expect(abortos[0]).toMatch(/não existe na tabela lead/);
  });

  it("negociação do lead pertence a OUTRO cliente — aborta (caso de fusão de empresa)", () => {
    const negOutroCliente: NegociacaoDoLead = { ...NEG, clienteId: "cli-OUTRO" };
    const { abortos } = planejarVinculo([proposta({ leadId: "lead-1" })], [LEAD], [negOutroCliente]);
    expect(abortos).toHaveLength(1);
    expect(abortos[0]).toMatch(/mudaria.*de quem é o documento/);
  });

  /**
   * O caso que mais dói e o menos óbvio: `Negociacao` tem soft delete, mas `leadId @unique` é
   * constraint de BANCO e não sabe de `excluidoEm`. Se isto virasse sintética, o INSERT morreria
   * com P2002 no meio da transação de produção — verificado contra o Postgres de dev antes de
   * existir este teste.
   */
  it("negociação do lead está SOFT-DELETADA — aborta, nunca vira sintética", () => {
    const negExcluida: NegociacaoDoLead = { ...NEG, excluidoEm: new Date("2026-05-01T00:00:00Z") };
    const { planos, abortos } = planejarVinculo([proposta({ leadId: "lead-1" })], [LEAD], [negExcluida]);
    expect(planos).toHaveLength(0);
    expect(abortos).toHaveLength(1);
    expect(abortos[0]).toMatch(/negociação EXCLUÍDA/);
    expect(abortos[0]).toMatch(/índice único de leadId/);
  });

  it("negociação ATIVA do mesmo cliente continua ligando normalmente (o excluidoEm não estragou o caminho feliz)", () => {
    const { planos, abortos } = planejarVinculo([proposta({ leadId: "lead-1" })], [LEAD], [NEG]);
    expect(abortos).toEqual([]);
    expect(planos[0]).toMatchObject({ tipo: "real" });
  });

  it("um aborto no meio NÃO impede os demais planos de serem calculados — mas o chamador não grava nenhum", () => {
    const { planos, abortos } = planejarVinculo(
      [proposta({ id: "ok", numero: "PR-OK" }), proposta({ id: "ruim", numero: "PR-RUIM", leadId: "fantasma" })],
      [],
      [],
    );
    // O plano da proposta boa existe (é o relatório que o operador lê)…
    expect(planos).toHaveLength(1);
    // …mas há aborto, e o contrato documentado é: aborto não-vazio ⇒ nada é gravado.
    expect(abortos).toHaveLength(1);
  });
});
