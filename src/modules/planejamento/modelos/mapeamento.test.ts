import { describe, expect, it } from "vitest";
import {
  aplicarRespostas,
  chaveDeNome,
  fasesDoModelo,
  mapearArquivo,
  sugereTerceiro,
  validarPercentuaisPorFase,
  type CatalogosParaMapear,
} from "./mapeamento";
import type { ArquivoMspdi, LinhaMspdi } from "./mspdi";

const disciplinas = [
  { id: "d-est", nome: "Estrutural", sigla: "EST", sinonimos: ["ESTR"] },
  { id: "d-fun", nome: "Fundações", sigla: "FUN", sinonimos: [] },
  { id: "d-cli", nome: "Climatização (AVAC)", sigla: "CLI", sinonimos: [] },
  { id: "d-gas", nome: "Gás", sigla: "GAS", sinonimos: [] },
];
const fases = [
  { id: "f-bs", nome: "Projeto Básico", sigla: "BS", sinonimos: ["PB"] },
  { id: "f-ex", nome: "Projeto Executivo", sigla: "EX", sinonimos: ["PE", "EXE"] },
];
const cat: CatalogosParaMapear = { disciplinas, fases };

const l = (uid: string, nivel: number, nome: string, o: Partial<LinhaMspdi> = {}): LinhaMspdi => ({
  uid,
  nivel,
  nome,
  wbs: null,
  resumo: false,
  marco: false,
  duracaoDias: 2,
  predecessoras: [],
  ...o,
});

const arq = (linhas: LinhaMspdi[]): ArquivoMspdi => ({
  titulo: "EAP",
  minutosPorDia: 480,
  linhas,
  avisos: [],
});

describe("chaveDeNome", () => {
  it("tira acento, caixa, parênteses e espaço sobrando", () => {
    expect(chaveDeNome("  TELECOMUNICAÇÕES ")).toBe("telecomunicacoes");
    expect(chaveDeNome("Climatização (AVAC)")).toBe("climatizacao");
    expect(chaveDeNome("Incêndio (PPCI)")).toBe("incendio");
  });
});

describe("sugereTerceiro", () => {
  it("reconhece o que a casa não executa", () => {
    expect(sugereTerceiro("Receber projeto arquitetônico")).toBe(true);
    expect(sugereTerceiro("Recebimento da sondagem")).toBe(true);
    expect(sugereTerceiro("Análise na prefeitura")).toBe(true);
    expect(sugereTerceiro("Validação do projeto básico pelo cliente")).toBe(true);
    expect(sugereTerceiro("Recebimento dos comentarios dos clientes")).toBe(true);
  });

  it("não confunde trabalho da casa", () => {
    expect(sugereTerceiro("Modelagem estrutural")).toBe(false);
    expect(sugereTerceiro("Revisão interna")).toBe(false);
    // "Solicitar complementações ao cliente" é a casa que faz o pedido.
    expect(sugereTerceiro("Solicitar complementações ao cliente/arquiteto")).toBe(false);
  });
});

describe("mapearArquivo — árvore e tipo de linha", () => {
  const arquivo = arq([
    l("1", 1, "XXXXX-EDF FULANO DE TAL", { resumo: true }),
    l("2", 2, "BÁSICO", { resumo: true }),
    l("3", 3, "ESTRUTURAL", { resumo: true }),
    l("4", 4, "Modelagem da superestrutura", { duracaoDias: 5 }),
    l("5", 4, "Superestrutura básica liberada", { marco: true }),
    l("6", 3, "FUNDAÇÃO", { resumo: true }),
    l("7", 4, "Dimensionamento das sapatas", { duracaoDias: 3 }),
    l("8", 2, "Receber projeto arquitetônico", { duracaoDias: 2 }),
  ]);

  it("o resumo do projeto não vem, e os filhos dele sobem um nível", () => {
    const { estrutura, conferencia } = mapearArquivo(arquivo, cat);
    expect(estrutura.linhas.find((x) => x.id === "1")).toBeUndefined();
    expect(estrutura.linhas.find((x) => x.id === "2")!.parentId).toBeNull();
    expect(conferencia.avisos.join(" ")).toContain("resumo do projeto");
  });

  it("nível 2 que casa com fase vira fase; nível 3 que casa com disciplina vira disciplina", () => {
    const { estrutura } = mapearArquivo(arquivo, cat);
    const por = new Map(estrutura.linhas.map((x) => [x.id, x]));
    expect(por.get("2")!.tipoEap).toBe("fas");
    expect(por.get("2")!.etapaId).toBe("f-bs");
    expect(por.get("3")!.tipoEap).toBe("disc");
    expect(por.get("3")!.disciplinaCatalogoId).toBe("d-est");
  });

  it("folha é atividade, marco é marco, e agrupamento sem par é agrupamento comum", () => {
    const { estrutura } = mapearArquivo(arquifoComOutro(), cat);
    const por = new Map(estrutura.linhas.map((x) => [x.id, x]));
    expect(por.get("30")!.tipoEap).toBe("res");
    expect(por.get("31")!.tipoEap).toBe("atv");
    expect(por.get("32")!.tipoEap).toBe("mrc");
  });

  function arquifoComOutro() {
    return arq([
      l("30", 1, "GESTÃO E INICIAÇÃO DO PROJETO", { resumo: true }),
      l("31", 2, "Levantar premissas"),
      l("32", 2, "Base técnica preparada", { marco: true }),
    ]);
  }

  it("disciplina e fase DESCEM até a folha — sem isso o marco não fecha a fase", () => {
    const { estrutura } = mapearArquivo(arquivo, cat);
    const por = new Map(estrutura.linhas.map((x) => [x.id, x]));
    for (const id of ["4", "5"]) {
      expect([por.get(id)!.etapaId, por.get(id)!.disciplinaCatalogoId]).toEqual(["f-bs", "d-est"]);
    }
    expect([por.get("7")!.etapaId, por.get("7")!.disciplinaCatalogoId]).toEqual(["f-bs", "d-fun"]);
  });

  it("agrupamento e marco não têm duração própria", () => {
    const { estrutura } = mapearArquivo(arquivo, cat);
    const por = new Map(estrutura.linhas.map((x) => [x.id, x]));
    expect([por.get("2")!.duracaoDias, por.get("5")!.duracaoDias, por.get("4")!.duracaoDias]).toEqual([0, 0, 5]);
  });

  it("a ordem é por irmão, começando em zero", () => {
    const { estrutura } = mapearArquivo(arquivo, cat);
    const por = new Map(estrutura.linhas.map((x) => [x.id, x]));
    expect([por.get("2")!.ordem, por.get("8")!.ordem]).toEqual([0, 1]);
    expect([por.get("3")!.ordem, por.get("6")!.ordem]).toEqual([0, 1]);
  });

  it("sugere a etapa de terceiro só em atividade", () => {
    const { conferencia } = mapearArquivo(arquivo, cat);
    expect(conferencia.terceiros.map((t) => t.id)).toEqual(["8"]);
  });

  it("conta o que a tela mostra", () => {
    const { conferencia } = mapearArquivo(arquivo, cat);
    expect(conferencia.totais).toEqual({ linhas: 7, agrupamentos: 3, marcos: 1, vinculos: 0, comDisciplina: 5 });
  });
});

describe("mapearArquivo — casamento de nome", () => {
  const so = (nome: string) => arq([l("1", 1, nome, { resumo: true }), l("2", 2, "Atividade")]);

  it("igual (sem acento e sem parênteses) é casamento EXATO", () => {
    const { conferencia } = mapearArquivo(so("CLIMATIZAÇÃO"), cat);
    expect([conferencia.disciplinas[0].catalogoId, conferencia.disciplinas[0].como]).toEqual(["d-cli", "exato"]);
  });

  it("sigla e sinônimo casam", () => {
    expect(mapearArquivo(so("ESTR"), cat).conferencia.disciplinas[0].catalogoId).toBe("d-est");
  });

  it("plural/singular casa como PARECIDO — é o caso FUNDAÇÃO × Fundações", () => {
    const p = mapearArquivo(so("FUNDAÇÃO"), cat).conferencia.disciplinas[0];
    expect([p.catalogoId, p.como]).toEqual(["d-fun", "parecido"]);
  });

  it("nome sem relação lexical NÃO é adivinhado: fica sem par e avisa", () => {
    const r = mapearArquivo(so("GLP"), cat);
    const p = r.conferencia.disciplinas[0];
    expect([p.catalogoId, p.como]).toEqual([null, "sem_par"]);
    expect(r.conferencia.avisos.join(" ")).toContain("não têm par no catálogo");
  });

  it("o que a casa já respondeu antes vem LEMBRADO, sem perguntar de novo", () => {
    const r = mapearArquivo(so("GLP"), { ...cat, mapaDisciplinaConhecido: { glp: "d-gas" } });
    const p = r.conferencia.disciplinas[0];
    expect([p.catalogoId, p.catalogoNome, p.como]).toEqual(["d-gas", "Gás", "lembrado"]);
  });

  it('"não é disciplina" também é resposta lembrada (e não vira palpite)', () => {
    const r = mapearArquivo(so("ESTRUTURAL"), { ...cat, mapaDisciplinaConhecido: { estrutural: null } });
    expect(r.conferencia.disciplinas[0].catalogoId).toBeNull();
    expect(r.estrutura.linhas.every((x) => x.disciplinaCatalogoId == null)).toBe(true);
  });
});

describe("aplicarRespostas", () => {
  const base = mapearArquivo(
    arq([
      l("1", 1, "BÁSICO", { resumo: true }),
      l("2", 2, "GLP", { resumo: true }),
      l("3", 3, "Dimensionar rede"),
      l("4", 3, "Receber laudo do cliente"),
    ]),
    cat,
  ).estrutura;

  it("a disciplina escolhida na conferência desce até as folhas", () => {
    const r = aplicarRespostas(base, { mapaDisciplina: { glp: "d-gas" } });
    const por = new Map(r.linhas.map((x) => [x.id, x]));
    expect(por.get("2")!.tipoEap).toBe("disc");
    expect([por.get("3")!.disciplinaCatalogoId, por.get("4")!.disciplinaCatalogoId]).toEqual(["d-gas", "d-gas"]);
    expect(por.get("3")!.etapaId).toBe("f-bs");
  });

  it("desfazer a escolha volta o agrupamento a ser comum e limpa as folhas", () => {
    const comGas = aplicarRespostas(base, { mapaDisciplina: { glp: "d-gas" } });
    const semGas = aplicarRespostas(comGas, { mapaDisciplina: { glp: null } });
    const por = new Map(semGas.linhas.map((x) => [x.id, x]));
    expect(por.get("2")!.tipoEap).toBe("res");
    expect(por.get("3")!.disciplinaCatalogoId).toBeNull();
  });

  it("a lista de terceiros passada SUBSTITUI as sugestões (é a palavra de quem conferiu)", () => {
    const r = aplicarRespostas(base, { terceiros: ["3"] });
    const por = new Map(r.linhas.map((x) => [x.id, x]));
    expect([por.get("3")!.deTerceiro, por.get("4")!.deTerceiro]).toEqual([true, false]);
  });

  it("agrupamento nunca fica marcado como terceiro (não recebe recurso)", () => {
    const r = aplicarRespostas(base, { terceiros: ["1", "2", "3"] });
    const por = new Map(r.linhas.map((x) => [x.id, x]));
    expect([por.get("1")!.deTerceiro, por.get("2")!.deTerceiro, por.get("3")!.deTerceiro]).toEqual([false, false, true]);
  });
});

describe("percentual por fase (D38)", () => {
  const comDuasFases = mapearArquivo(
    arq([
      l("1", 1, "BÁSICO", { resumo: true }),
      l("2", 2, "ESTRUTURAL", { resumo: true }),
      l("3", 3, "Modelagem básica"),
      l("4", 1, "EXECUTIVO", { resumo: true }),
      l("5", 2, "ESTRUTURAL", { resumo: true }),
      l("6", 3, "Detalhamento"),
    ]),
    cat,
  ).estrutura;

  it("lista só as fases que o modelo usa, com quantas linhas caem em cada", () => {
    expect(fasesDoModelo(comDuasFases)).toEqual([
      { etapaId: "f-bs", linhas: 3 },
      { etapaId: "f-ex", linhas: 3 },
    ]);
  });

  it("vazio é resposta válida: não cadastra fase nenhuma", () => {
    expect(validarPercentuaisPorFase(comDuasFases)).toEqual({ ok: true, cadastrar: false });
  });

  it("soma 100 fecha", () => {
    const r = aplicarRespostas(comDuasFases, { percentuaisPorFase: { "f-bs": 40, "f-ex": 60 } });
    expect(validarPercentuaisPorFase(r)).toEqual({ ok: true, cadastrar: true });
  });

  it("centavos fecham (33,33 + 33,33 + 33,34)", () => {
    const tres = aplicarRespostas(
      mapearArquivo(
        arq([
          l("1", 1, "BÁSICO", { resumo: true }),
          l("2", 2, "Atividade"),
          l("3", 1, "EXECUTIVO", { resumo: true }),
          l("4", 2, "Atividade"),
          l("5", 1, "AS BUILT", { resumo: true }),
          l("6", 2, "Atividade"),
        ]),
        { ...cat, fases: [...fases, { id: "f-ab", nome: "As Built", sigla: "AB", sinonimos: [] }] },
      ).estrutura,
      { percentuaisPorFase: { "f-bs": 33.33, "f-ex": 33.33, "f-ab": 33.34 } },
    );
    expect(validarPercentuaisPorFase(tres)).toEqual({ ok: true, cadastrar: true });
  });

  it("soma que não fecha é recusada, dizendo quanto deu", () => {
    const r = aplicarRespostas(comDuasFases, { percentuaisPorFase: { "f-bs": 40, "f-ex": 40 } });
    const v = validarPercentuaisPorFase(r);
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.motivo).toContain("80%");
  });

  it("informar só uma das fases é recusado — 100% da disciplina ficaria numa fase só", () => {
    const r = aplicarRespostas(comDuasFases, { percentuaisPorFase: { "f-bs": 100 } });
    const v = validarPercentuaisPorFase(r);
    expect(v.ok).toBe(false);
    expect(v.ok === false && v.motivo).toContain("todas as 2 fases");
  });

  it("trocar a fase por disciplina na conferência descarta o percentual dela", () => {
    const comPct = aplicarRespostas(comDuasFases, { percentuaisPorFase: { "f-bs": 40, "f-ex": 60 } });
    const semExecutivo = aplicarRespostas(comPct, { mapaFase: { executivo: null } });
    expect(Object.keys(semExecutivo.percentuaisPorFase)).toEqual(["f-bs"]);
  });
});
