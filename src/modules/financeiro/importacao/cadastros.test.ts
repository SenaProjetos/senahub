import { describe, it, expect } from "vitest";
import { errosDoSaldoInicial, resolverLinha, resolverLinhas, linhasDaPrevia, type IndiceCadastros } from "@/modules/financeiro/importacao/cadastros";
import { CATEGORIA_TRANSFERENCIA, type LinhaNorm } from "@/modules/financeiro/importacao/processar";

const CNPJ_VALIDO = "11222333000181";

function indice(): IndiceCadastros {
  return {
    categorias: [
      { id: "cat-desp", tipo: "despesa", codigo: "2", nomeChave: "despesas", paiNomeChave: null },
      { id: "cat-prolabore", tipo: "despesa", codigo: "2.08", nomeChave: "pro-labore", paiNomeChave: "despesas" },
      { id: "cat-outros-topo", tipo: "despesa", codigo: "9", nomeChave: "outros", paiNomeChave: null },
      { id: "cat-outros-filha", tipo: "despesa", codigo: "2.99", nomeChave: "outros", paiNomeChave: "despesas" },
      { id: "cat-rec", tipo: "receita", codigo: "1", nomeChave: "receitas", paiNomeChave: null },
      { id: "cat-servicos", tipo: "receita", codigo: "1.01", nomeChave: "servicos", paiNomeChave: "receitas" },
    ],
    contas: new Map([["santander", "conta-1"]]),
    formas: new Map([["pix", "forma-1"]]),
    centros: new Map([["administrativo", "centro-1"]]),
    projetos: new Map([["260031", "proj-1"]]),
    socios: [
      { id: "socio-1", nomeChave: "lucio henrique sena da silva", emailChave: "lucio@sena.com.br" },
      { id: "socio-2", nomeChave: "maria souza", emailChave: "maria@sena.com.br" },
    ],
    fornecedores: { porDoc: new Map([[CNPJ_VALIDO, "forn-1"]]), porNome: new Map([["papelaria x", "forn-2"]]) },
    clientes: { porDoc: new Map(), porNome: new Map([["cliente alfa", "cli-1"]]) },
  };
}

function linha(over: Partial<LinhaNorm> = {}): LinhaNorm {
  return {
    idx: 1,
    tipo: "despesa",
    descricao: "Linha",
    valor: 10,
    valorEfetivo: null,
    data: new Date(Date.UTC(2026, 0, 5)),
    vencimento: null,
    dataConfirmacao: new Date(Date.UTC(2026, 0, 5)),
    status: "confirmado",
    categoriaNome: "2.08",
    subcategoriaNome: "",
    contaNome: "",
    formaNome: "",
    centroNome: "",
    contatoNome: "",
    contatoDoc: "",
    observacao: "",
    tags: [],
    projetoCodigo: "",
    socioRef: "",
    numeroDocumento: "",
    hash: "x:1",
    hashLegado: "h:1",
    erros: [],
    ...over,
  };
}

const ESTRITO = { criarCadastros: false };
const CRIAR = { criarCadastros: true };

describe("resolverLinha — categoria", () => {
  it("acha pelo código do plano de contas", () => {
    const r = resolverLinha(linha({ categoriaNome: "2.08" }), indice(), ESTRITO);
    expect(r.erros).toEqual([]);
    expect(r.categoriaId).toBe("cat-prolabore");
  });

  it("código de despesa em linha de receita é erro de tipo", () => {
    const r = resolverLinha(linha({ tipo: "receita", categoriaNome: "2.08" }), indice(), ESTRITO);
    expect(r.erros).toEqual(["Categoria «2.08» é de despesa, a linha é receita."]);
  });

  it("nome de receita em linha de despesa é erro de tipo, mesmo criando cadastros", () => {
    const r = resolverLinha(linha({ tipo: "despesa", categoriaNome: "Receitas" }), indice(), CRIAR);
    expect(r.erros).toEqual(["Categoria «Receitas» é de receita, a linha é despesa."]);
  });

  it("nome inexistente: erro no modo estrito, criar no outro", () => {
    expect(resolverLinha(linha({ categoriaNome: "Software" }), indice(), ESTRITO).erros).toEqual([
      "Categoria «Software» não existe no plano de contas.",
    ]);
    const r = resolverLinha(linha({ categoriaNome: "Software" }), indice(), CRIAR);
    expect(r.erros).toEqual([]);
    expect(r.categoriaId).toBeNull();
  });

  it("'Outros' de topo e filha: sem subcategoria usa o de topo", () => {
    const r = resolverLinha(linha({ categoriaNome: "Outros" }), indice(), ESTRITO);
    expect(r.categoriaId).toBe("cat-outros-topo");
  });

  it("com subcategoria usa a filha daquele pai", () => {
    const r = resolverLinha(linha({ categoriaNome: "Despesas", subcategoriaNome: "Outros" }), indice(), ESTRITO);
    expect(r.categoriaId).toBe("cat-outros-filha");
  });

  it("transferência não passa pela regra da categoria", () => {
    const r = resolverLinha(linha({ categoriaNome: CATEGORIA_TRANSFERENCIA }), indice(), ESTRITO);
    expect(r.erros).toEqual([]);
  });
});

describe("resolverLinha — conta, forma, centro", () => {
  it("desconhecidos são erro só no modo estrito", () => {
    const l = linha({ contaNome: "Itaú", formaNome: "Boleto", centroNome: "Obras" });
    expect(resolverLinha(l, indice(), ESTRITO).erros).toEqual([
      "Conta «Itaú» não existe.",
      "Forma de pagamento «Boleto» não existe.",
      "Centro de custo «Obras» não existe.",
    ]);
    expect(resolverLinha(l, indice(), CRIAR).erros).toEqual([]);
  });

  it("conhecidos passam, sem diferenciar caixa e acento", () => {
    const l = linha({ contaNome: "SANTANDER", formaNome: "Pix", centroNome: "Administrativo" });
    expect(resolverLinha(l, indice(), ESTRITO).erros).toEqual([]);
  });
});

describe("resolverLinha — projeto", () => {
  it("pelo código, sem diferenciar caixa nem espaço", () => {
    expect(resolverLinha(linha({ projetoCodigo: "260031" }), indice(), ESTRITO).projetoId).toBe("proj-1");
    expect(resolverLinha(linha({ projetoCodigo: "260031 " }), indice(), ESTRITO).projetoId).toBe("proj-1");
  });

  it("código minúsculo acha o código maiúsculo", () => {
    const idx = indice();
    idx.projetos.set("SP-01", "proj-2");
    expect(resolverLinha(linha({ projetoCodigo: "sp-01" }), idx, ESTRITO).projetoId).toBe("proj-2");
  });

  it("desconhecido é erro mesmo criando cadastros", () => {
    const r = resolverLinha(linha({ projetoCodigo: "999999" }), indice(), CRIAR);
    expect(r.erros).toEqual(["Projeto «999999» não existe."]);
    expect(r.projetoId).toBeNull();
  });
});

describe("resolverLinha — sócio", () => {
  it("nome truncado pelo banco acha o sócio", () => {
    const r = resolverLinha(linha({ socioRef: "LUCIO HENRIQUE SENA DA SI" }), indice(), ESTRITO);
    expect(r.erros).toEqual([]);
    expect(r.socioId).toBe("socio-1");
  });

  it("pelo e-mail", () => {
    expect(resolverLinha(linha({ socioRef: "Maria@Sena.com.br" }), indice(), ESTRITO).socioId).toBe("socio-2");
  });

  it("dois sócios com o mesmo começo é ambíguo", () => {
    const idx = indice();
    idx.socios.push({ id: "socio-3", nomeChave: "lucio pereira", emailChave: "lp@sena.com.br" });
    const r = resolverLinha(linha({ socioRef: "Lucio" }), idx, CRIAR);
    expect(r.erros).toEqual(["Sócio «Lucio» é ambíguo."]);
    expect(r.socioId).toBeNull();
  });

  it("nome exato vence o começo de outro nome", () => {
    const idx = indice();
    idx.socios.push({ id: "socio-3", nomeChave: "maria souza lima", emailChave: "ml@sena.com.br" });
    expect(resolverLinha(linha({ socioRef: "Maria Souza" }), idx, ESTRITO).socioId).toBe("socio-2");
  });

  it("desconhecido é erro", () => {
    expect(resolverLinha(linha({ socioRef: "Fulano" }), indice(), CRIAR).erros).toEqual(["Sócio «Fulano» não encontrado."]);
  });
});

describe("resolverLinha — contato", () => {
  it("existente por documento ou por nome não cria", () => {
    expect(resolverLinha(linha({ contatoDoc: CNPJ_VALIDO, contatoNome: "Outro nome" }), indice(), ESTRITO).criaContato).toBe(false);
    expect(resolverLinha(linha({ contatoNome: "Papelaria X" }), indice(), ESTRITO).criaContato).toBe(false);
  });

  it("novo com CNPJ válido é criado sem erro", () => {
    const r = resolverLinha(linha({ tipo: "receita", categoriaNome: "1.01", contatoNome: "Cliente novo", contatoDoc: CNPJ_VALIDO }), indice(), ESTRITO);
    expect(r.erros).toEqual([]);
    expect(r.criaContato).toBe(true);
  });

  it("novo sem documento: erro no modo estrito, criado no outro", () => {
    const l = linha({ contatoNome: "GUSTAVO LUIZ MAURICIO INA" });
    expect(resolverLinha(l, indice(), ESTRITO).erros).toEqual([
      "Contato «GUSTAVO LUIZ MAURICIO INA» não existe e a linha não tem CPF/CNPJ válido.",
    ]);
    const r = resolverLinha(l, indice(), CRIAR);
    expect(r.erros).toEqual([]);
    expect(r.criaContato).toBe(true);
  });

  it("documento inválido conta como sem documento", () => {
    const l = linha({ contatoNome: "Fornecedor Y", contatoDoc: "11111111111" });
    expect(resolverLinha(l, indice(), ESTRITO).erros).toEqual([
      "Contato «Fornecedor Y» não existe e a linha não tem CPF/CNPJ válido.",
    ]);
  });
});

describe("errosDoSaldoInicial", () => {
  it("conta inexistente: erro no modo estrito, nada no outro", () => {
    const s = { contaNome: "Conta X", valor: 100, data: null };
    expect(errosDoSaldoInicial(s, indice(), ESTRITO)).toEqual(["Conta «Conta X» não existe."]);
    expect(errosDoSaldoInicial(s, indice(), CRIAR)).toEqual([]);
    expect(errosDoSaldoInicial({ ...s, contaNome: "Santander" }, indice(), ESTRITO)).toEqual([]);
  });
});

describe("resolverLinhas — transferência anda inteira", () => {
  it("perna com erro derruba a outra perna da mesma transferência", () => {
    const base = { categoriaNome: CATEGORIA_TRANSFERENCIA, hashLegado: null };
    const linhas = [
      linha({ ...base, tipo: "despesa", contaNome: "Santander", hash: "x:abc:out" }),
      linha({ ...base, tipo: "receita", contaNome: "Conta inexistente", hash: "x:abc:in" }),
      linha({ categoriaNome: "2.08", contaNome: "Santander", hash: "x:outra" }),
    ];
    const r = resolverLinhas(linhas, indice(), ESTRITO);
    expect(r[1].erros).toEqual(["Conta «Conta inexistente» não existe."]);
    expect(r[0].erros).toEqual(["A outra perna desta transferência tem erro."]);
    expect(r[2].erros).toEqual([]);
  });

  it("erro da própria planilha (data ruim) também derruba a outra perna", () => {
    const base = { categoriaNome: CATEGORIA_TRANSFERENCIA, hashLegado: null, contaNome: "Santander" };
    const linhas = [
      linha({ ...base, tipo: "despesa", hash: "x:d:out", erros: ["Data inválida ou ausente."] }),
      linha({ ...base, tipo: "receita", hash: "x:d:in" }),
    ];
    const r = resolverLinhas(linhas, indice(), ESTRITO);
    expect(r[1].erros).toEqual(["A outra perna desta transferência tem erro."]);
  });
});

describe("linhasDaPrevia", () => {
  it("todas as linhas, com erros somados, duplicada e cria cadastro", () => {
    const linhas = [
      linha({ idx: 1, categoriaNome: "2.08", contaNome: "Santander", hash: "x:1", projetoCodigo: "260031" }),
      linha({ idx: 2, categoriaNome: "Software", hash: "x:2" }),
      linha({ idx: 3, categoriaNome: "2.08", hash: "x:3", hashLegado: "h:3" }),
      linha({ idx: 4, categoriaNome: "2.08", hash: "x:4", contatoNome: "Novo", contatoDoc: "33445566000186" }),
      linha({ idx: 5, categoriaNome: "", hash: "x:5", erros: ["Sem categoria."] }),
    ];
    const p = linhasDaPrevia(linhas, indice(), new Set(["h:3"]), ESTRITO);
    expect(p).toHaveLength(5);
    expect(p[0]).toMatchObject({ idx: 1, categoria: "2.08", conta: "Santander", projeto: "260031", erros: [], duplicada: false, criaCadastro: false });
    expect(p[1].erros).toEqual(["Categoria «Software» não existe no plano de contas."]);
    expect(p[2].duplicada).toBe(true);
    expect(p[3]).toMatchObject({ erros: [], criaCadastro: true });
    expect(p[4].erros).toEqual(["Sem categoria."]);
    expect(p[0].data).toBe("2026-01-05");
  });

  it("criando cadastros: categoria e conta novas marcam a linha", () => {
    const p = linhasDaPrevia([linha({ categoriaNome: "Software", contaNome: "Itaú" })], indice(), new Set(), CRIAR);
    expect(p[0]).toMatchObject({ erros: [], criaCadastro: true });
  });
});
