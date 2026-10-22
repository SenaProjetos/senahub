import { describe, it, expect } from "vitest";
import {
  BRIEFING_SCHEMA,
  filtrarSecoes,
  prePopularRespostas,
  calcularStatusBriefing,
  progressoObrigatorios,
  aplicarOcultos,
  existeNoBriefing,
  mesclarRespostasVisiveis,
  respostasVisiveis,
} from "./briefing-schema";

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
    for (const c of obrig) todas[c.chave] = c.tipo === "checkbox" || c.tipo === "checkbox-single" ? ["x"] : "x";
    expect(calcularStatusBriefing(todas)).toBe("completo");
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
    for (const c of resto) respostas[c.chave] = c.tipo === "checkbox" ? ["x"] : "x";
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
