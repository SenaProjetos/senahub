import { describe, expect, it } from "vitest";
import { descreverEvento, type EventoAtividade } from "./atividade-eventos";

describe("descreverEvento — todo evento automático é SISTEMA", () => {
  const todos: EventoAtividade[] = [
    { evento: "EMPRESA_CADASTRADA", nome: "Construtora Aurora" },
    { evento: "CONTATO_CADASTRADO", nome: "Ana", cargo: null },
    { evento: "PROSPECCAO_CRIADA", nome: "EDIF. MIRANTE" },
    { evento: "ESTAGIO_ALTERADO", de: "ORCAMENTO", para: "PROPOSTA_ENVIADA" },
    { evento: "NEGOCIACAO_CRIADA", titulo: "X", deProspeccao: true },
    { evento: "PROPOSTA_CRIADA", numero: "PR-260001", titulo: "T" },
    { evento: "PROPOSTA_ENVIADA", numero: "PR-260001", porEmail: true },
    { evento: "PROPOSTA_REVISADA", numero: "PR-260001", versao: 2 },
    { evento: "PROPOSTA_ACEITA", numero: "PR-260001" },
    { evento: "PROJETO_CRIADO", codigo: "260031", nome: "N" },
    { evento: "NEGOCIACAO_PERDIDA", motivo: null, concorrente: null },
  ];

  it("os 11 eventos produzem tipo SISTEMA", () => {
    // O registro MANUAL (F3.4) é que usa LIGACAO/EMAIL/NOTA. Estes aqui ninguém digita.
    for (const ev of todos) expect(descreverEvento(ev).tipo).toBe("SISTEMA");
  });

  it("todos têm descrição não vazia e `evento` no metadata", () => {
    for (const ev of todos) {
      const d = descreverEvento(ev);
      expect(d.descricao.length).toBeGreaterThan(0);
      expect(d.metadata.evento).toBe(ev.evento);
    }
  });

  it("nenhuma descrição vaza id ou jargão de banco", () => {
    // A timeline é lida por quem vende. `clienteId`, `cuid`, `null` na tela seriam ruído.
    for (const ev of todos) {
      const d = descreverEvento(ev).descricao;
      expect(d).not.toMatch(/\bid\b|cuid|clienteId|undefined|null/i);
    }
  });
});

describe("ESTAGIO_ALTERADO", () => {
  it("usa os rótulos pt-BR, não os valores do enum", () => {
    const d = descreverEvento({ evento: "ESTAGIO_ALTERADO", de: "ORCAMENTO", para: "NEGOCIACAO" });
    expect(d.descricao).toBe('Estágio movido de "Orçamento" para "Negociação"');
  });

  it("guarda `de`/`para` CRUS no metadata", () => {
    // A Fase 6 mede tempo-por-etapa a partir daqui. Parsear o texto seria frágil e quebraria
    // no dia em que alguém mudasse o rótulo.
    const d = descreverEvento({ evento: "ESTAGIO_ALTERADO", de: "ORCAMENTO", para: "NEGOCIACAO" });
    expect(d.metadata).toMatchObject({ de: "ORCAMENTO", para: "NEGOCIACAO" });
  });
});

describe("CONTATO_CADASTRADO", () => {
  it("inclui o cargo quando há", () => {
    expect(
      descreverEvento({ evento: "CONTATO_CADASTRADO", nome: "Ana", cargo: "Diretora" }).descricao,
    ).toBe("Contato cadastrado: Ana (Diretora)");
  });

  it("omite os parênteses quando não há cargo", () => {
    expect(
      descreverEvento({ evento: "CONTATO_CADASTRADO", nome: "Ana", cargo: null }).descricao,
    ).toBe("Contato cadastrado: Ana");
  });
});

describe("NEGOCIACAO_CRIADA", () => {
  it("distingue vinda de prospecção de criada direto", () => {
    const q = descreverEvento({ evento: "NEGOCIACAO_CRIADA", titulo: "Obra X", deProspeccao: true });
    const d = descreverEvento({ evento: "NEGOCIACAO_CRIADA", titulo: "Obra X", deProspeccao: false });
    expect(q.descricao).toMatch(/qualificada/i);
    expect(d.descricao).not.toMatch(/qualificada/i);
  });
});

describe("PROPOSTA_ENVIADA", () => {
  it("distingue envio por e-mail de marcação manual", () => {
    expect(
      descreverEvento({ evento: "PROPOSTA_ENVIADA", numero: "PR-1", porEmail: true }).descricao,
    ).toMatch(/e-mail/);
    expect(
      descreverEvento({ evento: "PROPOSTA_ENVIADA", numero: "PR-1", porEmail: false }).descricao,
    ).toMatch(/marcada como enviada/);
  });
});

describe("NEGOCIACAO_PERDIDA", () => {
  it("sem motivo, só o fato", () => {
    expect(
      descreverEvento({ evento: "NEGOCIACAO_PERDIDA", motivo: null, concorrente: null }).descricao,
    ).toBe("Negociação perdida");
  });

  it("com motivo, acrescenta", () => {
    expect(
      descreverEvento({ evento: "NEGOCIACAO_PERDIDA", motivo: "Preço", concorrente: null }).descricao,
    ).toBe("Negociação perdida — Preço");
  });

  it("com concorrente, nomeia quem ganhou", () => {
    const d = descreverEvento({
      evento: "NEGOCIACAO_PERDIDA",
      motivo: "Perdemos para concorrente",
      concorrente: "Alfa Projetos",
    });
    expect(d.descricao).toBe(
      "Negociação perdida — Perdemos para concorrente (concorrente: Alfa Projetos)",
    );
    expect(d.metadata.concorrente).toBe("Alfa Projetos");
  });
});
