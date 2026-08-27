import { describe, expect, it } from "vitest";
import { resolverTexto } from "@/modules/documentos/tokens";
import {
  camposDaProposta,
  camposDoVinculo,
  catalogo,
  extrairTokens,
  mensagemTokensNaoResolvidos,
  montarEndereco,
  montarEnderecoCliente,
  tokensNaoResolvidos,
  type DadosContrato,
  type DadosProposta,
  type DadosVinculo,
} from "./campos";

const contrato: DadosContrato = {
  titulo: "Contrato de Estágio",
  valor: 1500,
  dataVencimento: new Date("2027-01-31T00:00:00.000Z"),
};

function vinculo(over: Partial<DadosVinculo> = {}): DadosVinculo {
  return {
    contratacao: "estagiario",
    setor: "projetos",
    cargo: "Estagiário de Engenharia",
    cargaSemanal: 30,
    remuneracao: 1500,
    dataInicio: new Date("2026-02-01T00:00:00.000Z"),
    dataFim: null,
    user: {
      name: "Zé",
      nomeCompleto: "José da Silva Santos",
      // Cache contratual vigente: por padrão o fixture NÃO tem, para o fallback ao vínculo ser o
      // caminho exercitado nos demais testes.
      salarioBase: null,
      cargo: null,
      email: "jose@exemplo.com",
      cpf: "123.456.789-00",
      rg: "MG-12.345.678",
      dataNascimento: new Date("2004-05-10T00:00:00.000Z"),
      estadoCivil: "solteiro",
      telefone: "(81) 99999-0000",
      enderecoLogradouro: "Rua das Acácias",
      enderecoNumero: "100",
      enderecoComplemento: "Apto 302",
      enderecoBairro: "Boa Viagem",
      enderecoCidade: "Recife",
      enderecoUf: "PE",
      enderecoCep: "51020-000",
    },
    pj: null,
    ...over,
  };
}

const proposta: DadosProposta = {
  numero: "PR-260001",
  titulo: "Projeto estrutural — Edifício Aurora",
  valor: 48000,
  areaM2: 820,
  cliente: {
    nome: "Construtora Aurora LTDA",
    documento: "12.345.678/0001-90",
    email: "contato@aurora.com",
    telefone: null,
    endereco: "Av. Central, 50",
  },
  projetoCodigo: "26-0142",
};

describe("camposDoVinculo", () => {
  it("usa nomeCompleto no lugar do nome de exibição — é documento formal", () => {
    expect(camposDoVinculo(vinculo(), contrato).Nome).toBe("José da Silva Santos");
  });

  it("cai no nome de exibição quando não há nome completo", () => {
    const v = vinculo();
    v.user.nomeCompleto = null;
    expect(camposDoVinculo(v, contrato).Nome).toBe("Zé");
  });

  it("usa o cache contratual do User no salário e no cargo, não o valor do vínculo", () => {
    // O caso real: pessoa contratada a 3.000 como Projetista, promovida a 5.000 como Coordenadora.
    // `Vinculo` guarda o que foi contratado na abertura; `User` guarda o que vale hoje. Gerar o
    // contrato pelo vínculo imprimiria o salário e o cargo ANTIGOS — número errado num documento
    // assinável, e a validação de token não pegaria (não está vazio, está velho).
    const v = vinculo();
    v.user.salarioBase = 5000;
    v.user.cargo = "Coordenadora de Projetos";
    const e = camposDoVinculo(v, contrato);
    expect(e.Salario).toBe(5000);
    expect(e.Cargo).toBe("Coordenadora de Projetos");
  });

  it("cai no valor do vínculo quando a carga inicial do histórico ainda não cobriu a pessoa", () => {
    const e = camposDoVinculo(vinculo(), contrato); // fixture nasce sem cache contratual
    expect(e.Salario).toBe(1500);
    expect(e.Cargo).toBe("Estagiário de Engenharia");
  });

  it("expõe os dados da PJ quando o vínculo fatura por uma", () => {
    const v = vinculo({ pj: { razaoSocial: "Silva Engenharia ME", cnpj: "98.765.432/0001-10", nomeFantasia: null } });
    const e = camposDoVinculo(v, contrato);
    expect(e.PjRazaoSocial).toBe("Silva Engenharia ME");
    expect(e.PjCnpj).toBe("98.765.432/0001-10");
  });

  it("deixa os campos de PJ nulos quando não há PJ (CLT/estágio)", () => {
    expect(camposDoVinculo(vinculo(), contrato).PjRazaoSocial).toBeNull();
  });
});

describe("montarEndereco", () => {
  it("junta as partes existentes", () => {
    expect(montarEndereco(vinculo().user)).toBe("Rua das Acácias, 100 — Apto 302 — Boa Viagem");
  });

  it("pula os pedaços que faltam, sem deixar separador solto", () => {
    const u = { ...vinculo().user, enderecoComplemento: null, enderecoBairro: null };
    expect(montarEndereco(u)).toBe("Rua das Acácias, 100");
  });

  it("monta o do cliente com cidade/UF, que o do colaborador tem em token separado", () => {
    expect(
      montarEnderecoCliente({
        logradouro: "Av. Central",
        numero: "50",
        bairro: "Centro",
        cidade: "Recife",
        uf: "PE",
      }),
    ).toBe("Av. Central, 50 — Centro — Recife/PE");
  });

  it("cliente sem endereço nenhum devolve nulo", () => {
    expect(
      montarEnderecoCliente({ logradouro: null, numero: null, bairro: null, cidade: null, uf: null }),
    ).toBeNull();
  });

  it("devolve nulo quando não há endereço nenhum", () => {
    const u = {
      ...vinculo().user,
      enderecoLogradouro: null,
      enderecoNumero: null,
      enderecoComplemento: null,
      enderecoBairro: null,
    };
    expect(montarEndereco(u)).toBeNull();
  });
});

/**
 * `Intl` pt-BR separa "R$" do número com ESPAÇO NÃO-SEPARÁVEL (U+00A0), não espaço comum. Escrito
 * explícito aqui porque um literal com o caractere invisível colado passaria a impressão de espaço
 * normal e faria o próximo a mexer perder tempo com um diff que parece idêntico na tela.
 */
const NBSP = String.fromCharCode(0xa0);

describe("integração com o motor de tokens", () => {
  it("preenche um trecho de cláusula real, com formato de moeda e data", () => {
    const escalar = camposDoVinculo(vinculo(), contrato);
    const texto =
      "[Nome], CPF [CPF], admitido em [DataInicio:d] no cargo de [Cargo], " +
      "com bolsa mensal de [Salario:c2] e carga de [CargaSemanal]h semanais.";
    expect(resolverTexto(texto, { escalar, linhas: [] })).toBe(
      "José da Silva Santos, CPF 123.456.789-00, admitido em 01/02/2026 no cargo de "
        + `Estagiário de Engenharia, com bolsa mensal de R$${NBSP}1.500,00 e carga de 30h semanais.`,
    );
  });

  it("preenche contrato de cliente a partir da proposta", () => {
    const escalar = camposDaProposta(proposta, { ...contrato, titulo: "Prestação de Serviços" });
    const texto = "Proposta [PropostaNumero] — [ClienteNome] (CNPJ [ClienteDocumento]), valor [PropostaValor:c2].";
    expect(resolverTexto(texto, { escalar, linhas: [] })).toBe(
      `Proposta PR-260001 — Construtora Aurora LTDA (CNPJ 12.345.678/0001-90), valor R$${NBSP}48.000,00.`,
    );
  });
});

describe("extrairTokens", () => {
  it("acha tokens simples", () => {
    expect(extrairTokens("olá [Nome], seu CPF é [CPF].")).toEqual(["Nome", "CPF"]);
  });

  it("respeita aninhamento de calculado", () => {
    expect(extrairTokens("total [= [Salario] * 12 ]")).toEqual(["= [Salario] * 12 "]);
  });

  it("ignora colchete sem fechamento", () => {
    expect(extrairTokens("texto [Nome sem fechar")).toEqual([]);
  });
});

describe("tokensNaoResolvidos", () => {
  const campos = catalogo("equipe");

  it("aceita modelo com tudo preenchido", () => {
    const escalar = camposDoVinculo(vinculo(), contrato);
    expect(tokensNaoResolvidos("[Nome] — [Cargo] — [Salario:c2]", escalar, campos)).toEqual([]);
  });

  it("acusa token que não existe no catálogo (erro de digitação no modelo)", () => {
    const escalar = camposDoVinculo(vinculo(), contrato);
    expect(tokensNaoResolvidos("[Salrio:c2]", escalar, campos)).toEqual([
      { token: "Salrio", motivo: "desconhecido" },
    ]);
  });

  it("acusa campo citado e vazio — o caso que geraria 'salário de R$ ' num contrato assinado", () => {
    const escalar = camposDoVinculo(vinculo({ remuneracao: null }), contrato);
    expect(tokensNaoResolvidos("salário de [Salario:c2]", escalar, campos)).toEqual([
      { token: "Salario", motivo: "vazio", label: "Salário/bolsa/honorário" },
    ]);
  });

  it("bloqueia endereço vazio — foi o achado real que produzia 'residente em , /.'", () => {
    const v = vinculo();
    v.user.enderecoLogradouro = null;
    v.user.enderecoNumero = null;
    v.user.enderecoComplemento = null;
    v.user.enderecoBairro = null;
    v.user.enderecoCidade = null;
    v.user.enderecoUf = null;
    const escalar = camposDoVinculo(v, contrato);
    const achados = tokensNaoResolvidos("residente em [Endereco], [Cidade]/[UF]", escalar, campos);
    expect(achados.map((a) => a.token)).toEqual(["Endereco", "Cidade", "UF"]);
    expect(achados.every((a) => a.motivo === "vazio")).toBe(true);
  });

  it("campo do catálogo que o modelo NÃO cita nunca bloqueia", () => {
    const v = vinculo();
    v.user.rg = null; // RG está no catálogo e vazio…
    const escalar = camposDoVinculo(v, contrato);
    expect(tokensNaoResolvidos("[Nome] — [Cargo]", escalar, campos)).toEqual([]); // …mas não é citado
  });

  it("não acusa os tokens que o próprio motor resolve", () => {
    const escalar = camposDoVinculo(vinculo(), contrato);
    expect(tokensNaoResolvidos("Recife, [Hoje] — pág [Pagina] de [Paginas]", escalar, campos)).toEqual([]);
  });

  it("aceita a forma [Fonte.Campo], igual ao motor", () => {
    const escalar = camposDoVinculo(vinculo(), contrato);
    expect(tokensNaoResolvidos("[Vinculo.Nome]", escalar, campos)).toEqual([]);
  });

  it("não repete o mesmo token citado várias vezes", () => {
    const escalar = camposDoVinculo(vinculo({ remuneracao: null }), contrato);
    const achados = tokensNaoResolvidos("[Salario] ... [Salario:c2] ... [Salario]", escalar, campos);
    expect(achados).toHaveLength(1);
  });

  it("trata string só de espaço como vazia", () => {
    const v = vinculo({ cargo: "   " });
    const escalar = camposDoVinculo(v, contrato);
    expect(tokensNaoResolvidos("[Cargo]", escalar, campos)).toEqual([
      { token: "Cargo", motivo: "vazio", label: "Cargo" },
    ]);
  });

  it("valida contrato de cliente contra o catálogo do cliente", () => {
    const escalar = camposDaProposta(proposta, contrato);
    // `Salario` é campo de equipe: num contrato de cliente ele não existe.
    expect(tokensNaoResolvidos("[Salario]", escalar, catalogo("cliente"))).toEqual([
      { token: "Salario", motivo: "desconhecido" },
    ]);
  });
});

describe("mensagemTokensNaoResolvidos", () => {
  it("separa erro de modelo de falta de cadastro", () => {
    const msg = mensagemTokensNaoResolvidos([
      { token: "Salrio", motivo: "desconhecido" },
      { token: "CPF", motivo: "vazio", label: "CPF" },
    ]);
    expect(msg).toBe("Campo inexistente no modelo: [Salrio]. Sem dado no cadastro: CPF.");
  });
});
