import { describe, it, expect } from "vitest";
import {
  LIMITE_TEXTO_RESPOSTA,
  type CampoBriefing,
  BRIEFING_SCHEMA,
  filtrarSecoes,
  prePopularRespostas,
  calcularStatusBriefing,
  progressoObrigatorios,
  aplicarOcultos,
  camposDescartadosNoEnvio,
  existeNoBriefing,
  mesclarRespostasVisiveis,
  respostasVisiveis,
  respostaValida,
  secoesDoProjeto,
} from "./briefing-schema";

/** Uma resposta que o campo aceita (escolha = a primeira opção). */
function valorValido(c: CampoBriefing): unknown {
  if (c.tipo === "checkbox") return [c.opcoes![0]];
  if (c.tipo === "checkbox-single") return true;
  if (c.tipo === "sim-nao") return "Sim";
  if (c.tipo === "radio" || c.tipo === "select") return c.opcoes![0];
  return "x";
}

describe("briefing-schema", () => {
  it("tem 7 seções com Dados Gerais primeiro e Declaração por último", () => {
    expect(BRIEFING_SCHEMA).toHaveLength(7);
    expect(BRIEFING_SCHEMA[0].id).toBe("dados-gerais");
    expect(BRIEFING_SCHEMA.at(-1)!.id).toBe("declaracao");
  });

  it("filtra seções por disciplina ativa (Dados Gerais e Declaração sempre entram)", () => {
    const secoes = filtrarSecoes(["Estrutural", "Elétrico"]);
    const ids = secoes.map((s) => s.id);
    expect(ids).toContain("dados-gerais");
    expect(ids).toContain("declaracao");
    expect(ids).toContain("estrutural");
    expect(ids).toContain("eletrico");
    expect(ids).not.toContain("hidrossanitario");
    expect(ids).not.toContain("climatizacao");
  });

  it("sem disciplinas → todas as seções", () => {
    expect(filtrarSecoes([])).toHaveLength(7);
    expect(filtrarSecoes(undefined)).toHaveLength(7);
  });

  it("pré-popula do cadastro sem sobrescrever respostas existentes", () => {
    const r = prePopularRespostas(
      { nomeCompleto: "Já preenchido" },
      { email: "c@x.com", nome: "Cliente X", telefone: "(81) 99999-8888", endereco: "Rua 1" },
    );
    expect(r.emailContato).toBe("c@x.com");
    expect(r.nomeCompleto).toBe("Já preenchido");
    expect(r.telefoneContato).toBe("(81) 99999-8888");
  });

  it("pré-popula e-mail/telefone do cadastro só se válidos, já no formato padrão", () => {
    const ok = prePopularRespostas({}, { email: " Contato@Alfa.com ", telefone: "81999998888" });
    expect(ok.emailContato).toBe("contato@alfa.com");
    expect(ok.telefoneContato).toBe("(81) 99999-8888");
    const ruim = prePopularRespostas({}, { email: "sem-arroba", telefone: "123", nome: "Cliente X" });
    expect(ruim.emailContato).toBeUndefined();
    expect(ruim.telefoneContato).toBeUndefined();
    expect(ruim.nomeCompleto).toBe("Cliente X");
  });

  it("status: nao_iniciado → em_preenchimento → completo", () => {
    expect(calcularStatusBriefing({})).toBe("nao_iniciado");
    expect(calcularStatusBriefing({ emailContato: "a@b.com" })).toBe("em_preenchimento");
    const obrig = BRIEFING_SCHEMA.flatMap((s) => s.campos).filter((c) => c.obrigatorio);
    const todas: Record<string, unknown> = {};
    for (const c of obrig) todas[c.chave] = valorValido(c);
    expect(calcularStatusBriefing(todas)).toBe("completo");
  });

  it("status: resposta de escolha que não é mais opção não conta (a tela a mostra vazia)", () => {
    const obrig = BRIEFING_SCHEMA.flatMap((s) => s.campos).filter((c) => c.obrigatorio);
    const todas: Record<string, unknown> = {};
    for (const c of obrig) todas[c.chave] = valorValido(c);
    const escolha = obrig.find((c) => c.tipo === "radio" || c.tipo === "select" || c.tipo === "sim-nao");
    if (escolha) {
      expect(calcularStatusBriefing({ ...todas, [escolha.chave]: "opção removida" })).toBe("em_preenchimento");
    }
    const secoes = [{ id: "s", titulo: "S", campos: [{ chave: "k", label: "K", tipo: "checkbox" as const, obrigatorio: true, opcoes: ["a", "b"] }] }];
    expect(calcularStatusBriefing({ k: ["velha"] }, secoes)).toBe("nao_iniciado");
    expect(calcularStatusBriefing({ k: ["velha", "b"] }, secoes)).toBe("completo");
  });

  it("progresso: obrigatórios vivem só em Dados Gerais + Declaração (sempre visíveis)", () => {
    // Seções de disciplina não têm campos obrigatórios → total não muda ao filtrar.
    const { total } = progressoObrigatorios({}, filtrarSecoes(["Estrutural"]));
    expect(total).toBe(progressoObrigatorios({}).total);
    expect(total).toBeGreaterThan(0);
    // Preencher um obrigatório incrementa o contador.
    expect(progressoObrigatorios({ emailContato: "a@b.com" }).preenchidos).toBe(1);
  });
});

describe("briefing: seções e campos ocultos no projeto", () => {
  it("seção oculta sai inteira; campo oculto sai da seção", () => {
    const secoes = aplicarOcultos(BRIEFING_SCHEMA, { secoes: ["estrutural"], campos: ["areaConstruida"] });
    expect(secoes.some((s) => s.id === "estrutural")).toBe(false);
    const gerais = secoes.find((s) => s.id === "dados-gerais")!;
    expect(gerais.campos.some((c) => c.chave === "areaConstruida")).toBe(false);
    expect(gerais.campos.length).toBe(BRIEFING_SCHEMA[0].campos.length - 1);
  });

  it("seção com todos os campos ocultos some", () => {
    const declaracao = BRIEFING_SCHEMA.find((s) => s.id === "declaracao")!;
    const secoes = aplicarOcultos(BRIEFING_SCHEMA, { secoes: [], campos: declaracao.campos.map((c) => c.chave) });
    expect(secoes.some((s) => s.id === "declaracao")).toBe(false);
  });

  it("obrigatório oculto não conta no status", () => {
    const obrig = BRIEFING_SCHEMA.flatMap((s) => s.campos).filter((c) => c.obrigatorio);
    const [primeiro, ...resto] = obrig;
    const respostas: Record<string, unknown> = {};
    for (const c of resto) respostas[c.chave] = valorValido(c);
    expect(calcularStatusBriefing(respostas)).toBe("em_preenchimento");
    const visiveis = aplicarOcultos(BRIEFING_SCHEMA, { secoes: [], campos: [primeiro.chave] });
    expect(calcularStatusBriefing(respostas, visiveis)).toBe("completo");
  });

  it("sem obrigatório visível: completo quando há alguma resposta visível", () => {
    const visiveis = aplicarOcultos(BRIEFING_SCHEMA, { secoes: ["dados-gerais", "declaracao"], campos: [] });
    expect(calcularStatusBriefing({}, visiveis)).toBe("nao_iniciado");
    expect(calcularStatusBriefing({ emailContato: "a@b.com" }, visiveis)).toBe("nao_iniciado");
    expect(calcularStatusBriefing({ tipoEstrutura: "Metálica" }, visiveis)).toBe("completo");
  });

  it("existeNoBriefing reconhece seção pelo id e campo pela chave", () => {
    expect(existeNoBriefing("secao", "estrutural")).toBe(true);
    expect(existeNoBriefing("campo", "areaConstruida")).toBe(true);
    expect(existeNoBriefing("campo", "estrutural")).toBe(false);
    expect(existeNoBriefing("secao", "inventada")).toBe(false);
  });
});

describe("briefing: gravação só mexe no que está visível", () => {
  const visiveis = aplicarOcultos(BRIEFING_SCHEMA, { secoes: ["estrutural"], campos: ["areaConstruida"] });

  it("campo oculto no envio é ignorado; ausente do envio fica como estava", () => {
    const anteriores = { areaConstruida: "250", tipoEstrutura: "Metálica", quantidadePavimentos: "2" };
    const enviadas = { areaConstruida: "", tipoEstrutura: "Mista", nomeCompleto: "Ana" };
    expect(mesclarRespostasVisiveis(anteriores, enviadas, visiveis)).toEqual({
      areaConstruida: "250",
      tipoEstrutura: "Metálica",
      quantidadePavimentos: "2",
      nomeCompleto: "Ana",
    });
  });

  it("chave desconhecida no envio não entra; chave antiga guardada não sai", () => {
    const r = mesclarRespostasVisiveis({ legado: "x" }, { inventada: "y" }, visiveis);
    expect(r).toEqual({ legado: "x" });
  });

  it("ao navegador do link vão só as respostas visíveis", () => {
    expect(respostasVisiveis({ areaConstruida: "250", nomeCompleto: "Ana", tipoEstrutura: "Mista" }, visiveis)).toEqual({
      nomeCompleto: "Ana",
    });
  });
});

describe("respostaValida (o link público não confia no tipo enviado)", () => {
  const c = (tipo: CampoBriefing["tipo"], opcoes?: string[]): CampoBriefing => ({ chave: "k", label: "K", tipo, obrigatorio: false, opcoes });

  it("texto só aceita string dentro do limite", () => {
    expect(respostaValida(c("text"), "ok").ok).toBe(true);
    expect(respostaValida(c("text"), { a: 1 }).ok).toBe(false);
    expect(respostaValida(c("textarea"), ["x"]).ok).toBe(false);
    expect(respostaValida(c("text"), "x".repeat(LIMITE_TEXTO_RESPOSTA + 1)).ok).toBe(false);
  });

  it("escolha única/lista/sim-não: uma das opções ou vazio", () => {
    expect(respostaValida(c("radio", ["a", "b"]), "a").ok).toBe(true);
    expect(respostaValida(c("select", ["a", "b"]), "").ok).toBe(true);
    expect(respostaValida(c("radio", ["a", "b"]), "z").ok).toBe(false);
    expect(respostaValida(c("sim-nao"), "Sim").ok).toBe(true);
    expect(respostaValida(c("sim-nao"), "Talvez").ok).toBe(false);
  });

  it("caixas: lista só de opções, sem repetição; caixa de ciência: boolean", () => {
    expect(respostaValida(c("checkbox", ["a", "b"]), ["a", "a"])).toEqual({ ok: true, valor: ["a"] });
    expect(respostaValida(c("checkbox", ["a", "b"]), "a").ok).toBe(false);
    expect(respostaValida(c("checkbox", ["a", "b"]), ["z"]).ok).toBe(false);
    expect(respostaValida(c("checkbox-single", ["Li"]), true).ok).toBe(true);
    expect(respostaValida(c("checkbox-single", ["Li"]), "sim").ok).toBe(false);
  });

  it("mesclar descarta o inválido e mantém a resposta guardada", () => {
    const visiveis = [{ id: "s", titulo: "S", campos: [c("radio", ["a", "b"])] }];
    expect(mesclarRespostasVisiveis({ k: "a" }, { k: "inventada" }, visiveis)).toEqual({ k: "a" });
  });
});

describe("secoesDoProjeto (o que o projeto mostra é o que conta no status)", () => {
  const secoes = [
    { id: "geral", titulo: "Geral", campos: [{ chave: "nome", label: "Nome", tipo: "text", obrigatorio: true }] },
    { id: "hidro", titulo: "Hidráulico", disciplinas: ["hidr"], campos: [{ chave: "reservatorio", label: "Reservatório", tipo: "text", obrigatorio: true }] },
  ] as unknown as Parameters<typeof secoesDoProjeto>[0];

  it("obrigatória de seção que a disciplina do projeto não pede não segura o status", () => {
    const visiveis = secoesDoProjeto(secoes, ["Estrutural"], { secoes: [], campos: [] });
    expect(visiveis.map((s) => s.id)).toEqual(["geral"]);
    expect(calcularStatusBriefing({ nome: "Casa" }, visiveis)).toBe("completo");
    // Sem o filtro (o que acontecia no envio) a mesma resposta ficava "em preenchimento".
    expect(calcularStatusBriefing({ nome: "Casa" }, secoes)).toBe("em_preenchimento");
  });

  it("com a disciplina no projeto a obrigatória volta a contar", () => {
    const visiveis = secoesDoProjeto(secoes, ["Hidrossanitário"], { secoes: [], campos: [] });
    expect(calcularStatusBriefing({ nome: "Casa" }, visiveis)).toBe("em_preenchimento");
  });

  it("aplica as ocultações do projeto sobre o já filtrado", () => {
    const visiveis = secoesDoProjeto(secoes, ["Hidrossanitário"], { secoes: ["hidro"], campos: [] });
    expect(visiveis.map((s) => s.id)).toEqual(["geral"]);
  });
});

describe("camposDescartadosNoEnvio (o envio não cala o que não gravou)", () => {
  const modelo = [
    {
      id: "s",
      titulo: "S",
      campos: [
        { chave: "nome", label: "Nome", tipo: "text" as const, obrigatorio: false },
        { chave: "tipo", label: "Tipo", tipo: "radio" as const, obrigatorio: false, opcoes: ["a", "b"] },
        { chave: "extra", label: "Extra", tipo: "text" as const, obrigatorio: false },
      ],
    },
  ];
  const visiveis = [{ ...modelo[0], campos: modelo[0].campos.filter((c) => c.chave !== "extra") }];

  it("campo que o projeto deixou de mostrar é descartado sem dizer qual (nem se difere do gravado)", () => {
    expect(camposDescartadosNoEnvio({}, { extra: "novo" }, modelo, visiveis)).toEqual(["uma pergunta que saiu do formulário"]);
    expect(camposDescartadosNoEnvio({ extra: "x" }, { extra: "x" }, modelo, visiveis)).toEqual(["uma pergunta que saiu do formulário"]);
  });

  it("valor que o tipo não aceita é descartado", () => {
    expect(camposDescartadosNoEnvio({}, { tipo: "c" }, modelo, visiveis)).toEqual(["Tipo"]);
  });

  it("vazio, igual ao gravado, visível válido e chave desconhecida não entram", () => {
    expect(camposDescartadosNoEnvio({ tipo: "c" }, { nome: "Ana", tipo: "c", inventada: "y" }, modelo, visiveis)).toEqual([]);
    expect(camposDescartadosNoEnvio({}, { extra: "" }, modelo, visiveis)).toEqual([]);
  });

  it("pergunta condicional escondida não conta (visível no projeto, a tela do cliente a esconde)", () => {
    const cond = [{ ...modelo[0], campos: [modelo[0].campos[0], { ...modelo[0].campos[2], condicao: { campo: "tipo", igual: ["b"] } }] }];
    expect(camposDescartadosNoEnvio({}, { extra: "algo" }, cond, cond)).toEqual([]);
  });
});
