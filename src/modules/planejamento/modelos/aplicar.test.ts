import { describe, expect, it } from "vitest";
import { aplicarModelo, emOrdemDeArvore, podar, type ContextoAplicacao } from "./aplicar";
import type { EstruturaModelo, LinhaModelo } from "./estrutura";

const linha = (id: string, o: Partial<LinhaModelo> = {}): LinhaModelo => ({
  id,
  parentId: null,
  ordem: 0,
  nome: `linha ${id}`,
  tipoEap: "atv",
  duracaoDias: 3,
  disciplinaCatalogoId: null,
  etapaId: null,
  deTerceiro: false,
  predecessoras: [],
  ...o,
});

const estrutura = (linhas: LinhaModelo[]): EstruturaModelo => ({
  versao: 1,
  jornadaMinutos: 480,
  linhas,
  mapaDisciplina: {},
  mapaFase: {},
  percentuaisPorFase: {},
  avisos: [],
});

const ancora = new Date("2026-10-05T00:00:00.000Z");

const ctx = (ids: string[], extra: Partial<ContextoAplicacao> = {}): ContextoAplicacao => ({
  projetoId: "p1",
  disciplinaDoProjeto: new Map([["cat-est", "disc-est"]]),
  fasesDaDisciplina: new Map([["disc-est", new Set(["f-bs"])]]),
  novaLinha: new Map(ids.map((id, i) => [id, { id: `n-${id}`, idCorporativo: `ATV-0000${i + 1}` }])),
  ancora,
  cadastrarFases: false,
  ...extra,
});

// BÁSICO > ESTRUTURAL > {atividade, marco} + HIDRÁULICA (que o projeto não tem) > atividade
const modelo = estrutura([
  linha("fase", { tipoEap: "fas", parentId: null, ordem: 0, nome: "BÁSICO", etapaId: "f-bs", duracaoDias: 0 }),
  linha("est", { tipoEap: "disc", parentId: "fase", ordem: 0, nome: "ESTRUTURAL", disciplinaCatalogoId: "cat-est", etapaId: "f-bs", duracaoDias: 0 }),
  linha("a1", { parentId: "est", ordem: 0, nome: "Modelagem", disciplinaCatalogoId: "cat-est", etapaId: "f-bs", duracaoDias: 5 }),
  linha("m1", { tipoEap: "mrc", parentId: "est", ordem: 1, nome: "Estrutural liberado", disciplinaCatalogoId: "cat-est", etapaId: "f-bs", duracaoDias: 0, predecessoras: [{ id: "a1", tipo: "fs", lagDias: 0 }] }),
  linha("hid", { tipoEap: "disc", parentId: "fase", ordem: 1, nome: "HIDRÁULICA", disciplinaCatalogoId: "cat-hid", etapaId: "f-bs", duracaoDias: 0 }),
  linha("a2", { parentId: "hid", ordem: 0, nome: "Rede de água", disciplinaCatalogoId: "cat-hid", etapaId: "f-bs", duracaoDias: 4, predecessoras: [{ id: "a1", tipo: "fs", lagDias: 2 }] }),
]);

describe("emOrdemDeArvore", () => {
  it("pai antes de filho, irmãos pela ordem", () => {
    expect(emOrdemDeArvore(modelo.linhas).map((l) => l.id)).toEqual(["fase", "est", "a1", "m1", "hid", "a2"]);
  });

  it("linha órfã (pai que não existe) entra como raiz, em vez de desaparecer", () => {
    const r = emOrdemDeArvore([linha("a", { parentId: "fantasma" }), linha("b")]);
    expect(r.map((l) => [l.id, l.parentId])).toEqual([
      ["b", null],
      ["a", null],
    ]);
  });
});

describe("podar", () => {
  it("disciplina que o projeto não tem sai com o galho inteiro", () => {
    const { manter, podadas } = podar(modelo, new Map([["cat-est", "disc-est"]]));
    expect(manter.map((l) => l.id)).toEqual(["fase", "est", "a1", "m1"]);
    expect(podadas.map((p) => [p.nome, p.motivo])).toEqual([
      ["HIDRÁULICA", "disciplina_fora_do_projeto"],
      ["Rede de água", "pai_podado"],
    ]);
  });

  it("projeto com as duas disciplinas mantém tudo", () => {
    const { manter, podadas } = podar(
      modelo,
      new Map([
        ["cat-est", "disc-est"],
        ["cat-hid", "disc-hid"],
      ]),
    );
    expect(manter).toHaveLength(6);
    expect(podadas).toEqual([]);
  });

  it("linha sem disciplina (gestão, emissão) nunca é podada", () => {
    const m = estrutura([linha("g", { tipoEap: "res", nome: "GESTÃO" }), linha("g1", { parentId: "g" })]);
    expect(podar(m, new Map()).manter).toHaveLength(2);
  });
});

describe("aplicarModelo", () => {
  const r = () => aplicarModelo(modelo, ctx(["fase", "est", "a1", "m1"]));

  it("grava a árvore com ids e ID corporativo novos, no projeto certo", () => {
    const { linhas } = r();
    expect(linhas.map((l) => [l.id, l.parentId, l.nome])).toEqual([
      ["n-fase", null, "BÁSICO"],
      ["n-est", "n-fase", "ESTRUTURAL"],
      ["n-a1", "n-est", "Modelagem"],
      ["n-m1", "n-est", "Estrutural liberado"],
    ]);
    expect(linhas.every((l) => l.projetoId === "p1" && String(l.idCorporativo).startsWith("ATV-"))).toBe(true);
  });

  it("disciplina do catálogo vira a disciplina DO PROJETO, e a fase acompanha", () => {
    const { linhas } = r();
    const folha = linhas.find((l) => l.id === "n-a1")!;
    expect([folha.disciplinaId, folha.etapaId]).toEqual(["disc-est", "f-bs"]);
  });

  it("fase que a disciplina do projeto não tem cadastrada não é gravada — ficaria invisível", () => {
    const { linhas } = aplicarModelo(modelo, ctx(["fase", "est", "a1", "m1"], { fasesDaDisciplina: new Map() }));
    expect(linhas.every((l) => l.etapaId == null)).toBe(true);
  });

  it("datas são provisórias (a âncora) e o avanço nasce zero — quem manda nas datas é o motor", () => {
    const { linhas } = r();
    expect(linhas.every((l) => l.inicioPrevisto === ancora && l.fimPrevisto === ancora && l.progresso === 0)).toBe(true);
  });

  it("marco tem duração zero mesmo se o modelo trouxer outra coisa", () => {
    const m = estrutura([linha("x", { tipoEap: "mrc", duracaoDias: 7 })]);
    expect(aplicarModelo(m, ctx(["x"])).linhas[0].duracaoDias).toBe(0);
  });

  it("a ordem é recontada depois da poda: sem buraco onde saiu um galho", () => {
    const { linhas } = r();
    const porId = new Map(linhas.map((l) => [l.id, l]));
    expect([porId.get("n-est")!.ordem, porId.get("n-a1")!.ordem, porId.get("n-m1")!.ordem]).toEqual([0, 0, 1]);
  });

  it("vínculo entre linhas que ficaram é gravado com tipo e atraso", () => {
    const { dependencias } = r();
    expect(dependencias).toEqual([{ tarefaId: "n-m1", predecessoraId: "n-a1", tipo: "fs", lagDias: 0 }]);
  });

  it("vínculo com ponta podada é descartado e CONTADO (a tela avisa)", () => {
    const { dependencias, vinculosDescartados } = aplicarModelo(
      modelo,
      ctx(["fase", "est", "a1", "m1", "hid", "a2"], {
        disciplinaDoProjeto: new Map([["cat-est", "disc-est"]]),
      }),
    );
    expect(dependencias).toHaveLength(1);
    expect(vinculosDescartados).toBe(0); // a linha podada não entra em `manter`, então nem é contada
    const comTudo = aplicarModelo(modelo, ctx(["fase", "est", "a1", "m1"], {
      disciplinaDoProjeto: new Map([
        ["cat-est", "disc-est"],
        ["cat-hid", "disc-hid"],
      ]),
    }));
    // Aqui HIDRÁULICA ficou, mas sem id reservado: o vínculo dela some e é contado.
    expect(comTudo.vinculosDescartados).toBe(1);
  });

  it("etapa de terceiro nasce com o recurso Externo; agrupamento nunca", () => {
    const m = estrutura([
      linha("g", { tipoEap: "res", deTerceiro: true }),
      linha("t", { parentId: "g", deTerceiro: true, nome: "Aprovação na prefeitura" }),
      linha("n", { parentId: "g", ordem: 1 }),
    ]);
    const res = aplicarModelo(m, ctx(["g", "t", "n"]));
    expect(res.atribuicoesExternas).toEqual([{ tarefaId: "n-t", papel: "ext", horasPrevistas: 0 }]);
  });

  it("linha sem id reservado não é gravada — melhor faltar linha que gravar sem identidade", () => {
    const { linhas } = aplicarModelo(modelo, ctx(["fase"]));
    expect(linhas.map((l) => l.id)).toEqual(["n-fase"]);
  });
});

describe("aplicarModelo — fases da disciplina (D38)", () => {
  const comPercentual = { ...modelo, percentuaisPorFase: { "f-bs": 100 } };

  it("cadastra a fase na disciplina que não tem nenhuma, com o percentual do modelo", () => {
    const r = aplicarModelo(comPercentual, ctx(["fase", "est", "a1", "m1"], { fasesDaDisciplina: new Map(), cadastrarFases: true }));
    expect(r.etapasParaCriar).toEqual([{ disciplinaId: "disc-est", etapaId: "f-bs", percentual: 100, ordem: 0 }]);
  });

  it("e a linha GUARDA a fase que está sendo criada na mesma transação (sem isso o marco não fecha fase)", () => {
    const r = aplicarModelo(comPercentual, ctx(["fase", "est", "a1", "m1"], { fasesDaDisciplina: new Map(), cadastrarFases: true }));
    expect(r.linhas.find((l) => l.id === "n-m1")!.etapaId).toBe("f-bs");
    expect(r.disciplinasSemFase).toEqual([]);
  });

  it("disciplina que JÁ tem fase não é tocada", () => {
    const r = aplicarModelo(comPercentual, ctx(["fase", "est", "a1", "m1"], { cadastrarFases: true }));
    expect(r.etapasParaCriar).toEqual([]);
    expect(r.linhas.find((l) => l.id === "n-a1")!.etapaId).toBe("f-bs");
  });

  it("sem percentual no modelo, nada é cadastrado e a disciplina aparece como SEM FASE", () => {
    const r = aplicarModelo(modelo, ctx(["fase", "est", "a1", "m1"], { fasesDaDisciplina: new Map(), cadastrarFases: false }));
    expect(r.etapasParaCriar).toEqual([]);
    expect(r.linhas.every((l) => l.etapaId == null)).toBe(true);
    expect(r.disciplinasSemFase).toEqual(["disc-est"]);
  });

  it("fase sem percentual informado não é cadastrada (a validação já barra o meio a meio)", () => {
    const so = { ...modelo, percentuaisPorFase: {} };
    const r = aplicarModelo(so, ctx(["fase", "est", "a1", "m1"], { fasesDaDisciplina: new Map(), cadastrarFases: true }));
    expect(r.etapasParaCriar).toEqual([]);
  });
});
