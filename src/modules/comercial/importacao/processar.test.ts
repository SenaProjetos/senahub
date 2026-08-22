import { describe, it, expect } from "vitest";
import {
  normalizarLinhasCrm,
  resolverLinhas,
  contarBuckets,
  type LinhaCrmNorm,
  type ExistentesCrm,
} from "@/modules/comercial/importacao/processar";
import type { CampoCrm } from "@/lib/import/mapeamento-crm";

// ── normalizarLinhasCrm ──────────────────────────────────────────────────────

describe("normalizarLinhasCrm", () => {
  const M: Partial<Record<CampoCrm, number>> = { empresa: 0, nomeContato: 1, emailContato: 2 };

  it("linha completa não tem erro", () => {
    const [l] = normalizarLinhasCrm([["Acme Ltda", "Fulano", "fulano@acme.com"]], M);
    expect(l.erros).toEqual([]);
    expect(l.empresaNome).toBe("Acme Ltda");
    expect(l.nomeContato).toBe("Fulano");
    expect(l.emailContato).toBe("fulano@acme.com");
  });

  it("sem empresa OU sem nome do contato vira erro (mesmo par que a service exige)", () => {
    const [semEmpresa] = normalizarLinhasCrm([["", "Fulano", ""]], M);
    expect(semEmpresa.erros).toContain("Sem nome da empresa.");
    const [semContato] = normalizarLinhasCrm([["Acme", "", ""]], M);
    expect(semContato.erros).toContain("Sem nome do contato.");
  });

  it("e-mail com formato inválido vira erro; e-mail vazio não", () => {
    const [invalido] = normalizarLinhasCrm([["Acme", "Fulano", "não-é-email"]], M);
    expect(invalido.erros).toContain("E-mail inválido.");
    const [vazio] = normalizarLinhasCrm([["Acme", "Fulano", ""]], M);
    expect(vazio.erros).toEqual([]);
  });

  it("documento vira só dígitos", () => {
    const [l] = normalizarLinhasCrm(
      [["Acme", "12.345.678/0001-90", "Fulano"]],
      { empresa: 0, documento: 1, nomeContato: 2 },
    );
    expect(l.documento).toBe("12345678000190");
  });

  it("idx é 1-based e segue a ordem do array", () => {
    const linhas = normalizarLinhasCrm([["A", "X"], ["B", "Y"]], { empresa: 0, nomeContato: 1 });
    expect(linhas.map((l) => l.idx)).toEqual([1, 2]);
  });
});

// ── resolverLinhas ────────────────────────────────────────────────────────────

const SEM_NADA: ExistentesCrm = { clientes: [], contatosPorCliente: new Map(), leadAtivoPorCliente: new Map() };

function linha(idx: number, overrides: Partial<LinhaCrmNorm> = {}): LinhaCrmNorm {
  return {
    idx,
    empresaNome: `Empresa ${idx}`,
    documento: "",
    nomeContato: `Contato ${idx}`,
    cargo: "",
    emailContato: "",
    telefone: "",
    segmento: "",
    cidade: "",
    uf: "",
    linkedinUrl: "",
    observacao: "",
    erros: [],
    ...overrides,
  };
}

describe("resolverLinhas — banco vazio", () => {
  it("1ª linha de uma empresa nova é 'criar'", () => {
    const [r] = resolverLinhas([linha(1)], SEM_NADA);
    expect(r.status).toBe("criar");
    expect(r.empresa?.novo).toBe(true);
    expect(r.contato?.novo).toBe(true);
  });

  it("linha com erro de normalização vira 'erro' e não resolve empresa/contato", () => {
    const [r] = resolverLinhas([linha(1, { empresaNome: "", erros: ["Sem nome da empresa."] })], SEM_NADA);
    expect(r.status).toBe("erro");
    expect(r.empresa).toBeNull();
    expect(r.contato).toBeNull();
  });

  it("buckets somam o total de linhas, disjuntos", () => {
    const linhas = [linha(1), linha(2, { empresaNome: "", erros: ["Sem nome da empresa."] })];
    const c = contarBuckets(resolverLinhas(linhas, SEM_NADA));
    expect(c.total).toBe(2);
    expect(c.criados + c.vinculados + c.ignorados + c.erros).toBe(2);
    expect(c.criados).toBe(1);
    expect(c.erros).toBe(1);
  });
});

describe("resolverLinhas — dedup DENTRO do mesmo arquivo (o risco nº 1 deste tipo de importação)", () => {
  it("2ª linha da MESMA empresa nova vincula à 1ª, não cria outra", () => {
    const linhas = [
      linha(1, { empresaNome: "Construtora Alfa Ltda", nomeContato: "Ana" }),
      linha(2, { empresaNome: "Construtora Alfa Ltda", nomeContato: "Bruno" }),
    ];
    const [r1, r2] = resolverLinhas(linhas, SEM_NADA);
    expect(r1.status).toBe("criar");
    expect(r2.status).toBe("vincular");
    expect(r2.empresa?.ref).toBe(r1.empresa?.ref); // mesma empresa
    expect(r2.empresa?.novo).toBe(false); // já existia (nesta mesma importação) quando a 2ª linha chegou
    expect(r2.contato?.ref).not.toBe(r1.contato?.ref); // Ana e Bruno são pessoas diferentes
  });

  it("nome quase-igual (typo) dentro do arquivo ainda casa — mesma tolerância de candidatosDuplicata", () => {
    const linhas = [
      linha(1, { empresaNome: "Construtora Alfa Ltda" }),
      linha(2, { empresaNome: "Construtora Alfaa Ltda" }), // 1 letra a mais
    ];
    const [r1, r2] = resolverLinhas(linhas, SEM_NADA);
    expect(r2.empresa?.ref).toBe(r1.empresa?.ref);
  });

  it("documento igual casa mesmo com nomes diferentes (sinal mais forte que nome)", () => {
    const linhas = [
      linha(1, { empresaNome: "Construtora Alfa", documento: "12345678000190" }),
      linha(2, { empresaNome: "Alfa Engenharia SA", documento: "12345678000190" }),
    ];
    const [r1, r2] = resolverLinhas(linhas, SEM_NADA);
    expect(r2.empresa?.ref).toBe(r1.empresa?.ref);
  });

  it("2 contatos DIFERENTES da mesma empresa nova entram na MESMA prospecção", () => {
    const linhas = [
      linha(1, { empresaNome: "Beta Ltda", nomeContato: "Carla" }),
      linha(2, { empresaNome: "Beta Ltda", nomeContato: "Diego" }),
    ];
    const [r1, r2] = resolverLinhas(linhas, SEM_NADA);
    expect(r1.status).toBe("criar");
    expect(r2.status).toBe("vincular"); // a prospecção já nasceu na linha 1
  });

  it("mesmo contato (mesmo e-mail) repetido na planilha reaproveita o contato, não duplica", () => {
    const linhas = [
      linha(1, { empresaNome: "Gama Ltda", nomeContato: "Elis", emailContato: "elis@gama.com" }),
      linha(2, { empresaNome: "Gama Ltda", nomeContato: "Elis Ferreira", emailContato: "elis@gama.com" }),
    ];
    const [r1, r2] = resolverLinhas(linhas, SEM_NADA);
    expect(r2.contato?.ref).toBe(r1.contato?.ref);
    expect(r2.contato?.novo).toBe(false);
  });
});

describe("resolverLinhas — contra o banco (ExistentesCrm)", () => {
  const clienteExistente = { id: "cli-1", nome: "Fornecedora Delta", tipo: "PJ" as const, documento: null, email: null };

  it("empresa já cadastrada é reaproveitada (não 'novo'), e sem lead ativo vira 'criar'", () => {
    const existentes: ExistentesCrm = {
      clientes: [clienteExistente],
      contatosPorCliente: new Map(),
      leadAtivoPorCliente: new Map(),
    };
    const [r] = resolverLinhas([linha(1, { empresaNome: "Fornecedora Delta" })], existentes);
    expect(r.empresa?.novo).toBe(false);
    expect(r.empresa?.ref).toBe("cli-1");
    expect(r.status).toBe("criar"); // empresa existe, mas prospecção ainda não
  });

  it("empresa com prospecção ATIVA no banco vira 'vincular' já na 1ª linha do arquivo", () => {
    const existentes: ExistentesCrm = {
      clientes: [clienteExistente],
      contatosPorCliente: new Map(),
      leadAtivoPorCliente: new Map([["cli-1", "lead-9"]]),
    };
    const [r] = resolverLinhas([linha(1, { empresaNome: "Fornecedora Delta" })], existentes);
    expect(r.status).toBe("vincular");
  });

  it("contato existente com optOut=true faz a linha ser IGNORADA (LGPD) — nada é criado", () => {
    const existentes: ExistentesCrm = {
      clientes: [clienteExistente],
      contatosPorCliente: new Map([["cli-1", [{ id: "cont-1", nome: "Fabio", email: "fabio@delta.com", optOut: true }]]]),
      leadAtivoPorCliente: new Map(),
    };
    const [r] = resolverLinhas(
      [linha(1, { empresaNome: "Fornecedora Delta", nomeContato: "Fabio", emailContato: "fabio@delta.com" })],
      existentes,
    );
    expect(r.status).toBe("ignorar");
    expect(r.motivo).toMatch(/opt-out/i);
    expect(r.contato).toBeNull();
  });

  it("contato existente SEM optOut é reaproveitado normalmente", () => {
    const existentes: ExistentesCrm = {
      clientes: [clienteExistente],
      contatosPorCliente: new Map([["cli-1", [{ id: "cont-2", nome: "Gina", email: "gina@delta.com", optOut: false }]]]),
      leadAtivoPorCliente: new Map(),
    };
    const [r] = resolverLinhas(
      [linha(1, { empresaNome: "Fornecedora Delta", nomeContato: "Gina", emailContato: "gina@delta.com" })],
      existentes,
    );
    expect(r.status).toBe("criar");
    expect(r.contato?.novo).toBe(false);
    expect(r.contato?.ref).toBe("cont-2");
  });

  it("`existentes` original não é mutado (o chamador pode reusar entre chamadas)", () => {
    const existentes: ExistentesCrm = { clientes: [], contatosPorCliente: new Map(), leadAtivoPorCliente: new Map() };
    resolverLinhas([linha(1), linha(2)], existentes);
    expect(existentes.clientes).toEqual([]);
    expect(existentes.leadAtivoPorCliente.size).toBe(0);
  });
});

describe("resolverLinhas — idempotência de reimportar o MESMO arquivo (simulada em memória)", () => {
  it("rodar 2x a mesma planilha: a 2ª rodada não tem NENHUMA linha 'criar'", () => {
    const linhas = [
      linha(1, { empresaNome: "Rerun Ltda", nomeContato: "Hugo", emailContato: "hugo@rerun.com" }),
      linha(2, { empresaNome: "Rerun Ltda", nomeContato: "Iris", emailContato: "iris@rerun.com" }),
    ];

    const run1 = resolverLinhas(linhas, SEM_NADA);
    expect(contarBuckets(run1).criados).toBe(1); // só a empresa "cria"; a 2ª linha já vincula

    // Projeta o estado do banco APÓS o commit da 1ª rodada — mesma forma que `carregarExistentesCrm`
    // devolveria depois de `executarCommitCrm` ter gravado `run1`.
    const clienteId = "cli-real-1";
    const existentesDepois: ExistentesCrm = {
      clientes: [{ id: clienteId, nome: "Rerun Ltda", tipo: "PJ", documento: null, email: null }],
      contatosPorCliente: new Map([
        [
          clienteId,
          [
            { id: "cont-real-1", nome: "Hugo", email: "hugo@rerun.com", optOut: false },
            { id: "cont-real-2", nome: "Iris", email: "iris@rerun.com", optOut: false },
          ],
        ],
      ]),
      leadAtivoPorCliente: new Map([[clienteId, "lead-real-1"]]),
    };

    const run2 = resolverLinhas(linhas, existentesDepois);
    const c2 = contarBuckets(run2);
    expect(c2.criados).toBe(0);
    expect(c2.vinculados).toBe(2);
    expect(run2.every((r) => r.empresa?.novo === false && r.contato?.novo === false)).toBe(true);
  });
});
