import { describe, expect, it } from "vitest";
import type { StatusDisciplina } from "@/generated/prisma/client";
import type { ConteudoPublico } from "@/modules/projetos/arquivos/link-publico";
import type { Situacao } from "@/modules/uploads/revisao-marcada";
import { FASE_SEM } from "@/modules/uploads/arvore-navegacao";
import {
  andamentoDoProjeto,
  chaveMarca,
  linhaDoTempo,
  marcasDoConteudo,
  type DisciplinaEntrada,
  type FaseEntrada,
  type MarcaEntrada,
} from "./andamento";

const d = (iso: string) => new Date(iso);

function fase(sigla: string, status: StatusDisciplina, extra: Partial<FaseEntrada> = {}): FaseEntrada {
  return { faseId: `f-${sigla.toLowerCase()}`, sigla, status, entregueEm: null, percentual: 0, ordem: 0, ...extra };
}

function disc(id: string, fases: FaseEntrada[], extra: Partial<DisciplinaEntrada> = {}): DisciplinaEntrada {
  return { id, nome: `Disciplina ${id}`, status: "em_andamento", entregueEm: null, fases, ...extra };
}

function marca(documentoId: string, disciplinaId: string, faseId: string | null, situacao: Situacao, iso: string | null): MarcaEntrada {
  return { documentoId, disciplinaId, faseId, situacao, marcadaEm: iso ? d(iso) : null };
}

function arquivo(id: string, nome: string) {
  return { id, nome, tamanho: 1, ehPdf: nome.endsWith(".pdf"), versao: 1, emRevisao: null, descricaoRevisao: null, bloqueado: false, indisponivel: false };
}

function conteudo(situacao: Situacao, disciplinaId: string, faseChave: string, arquivos: ReturnType<typeof arquivo>[]): ConteudoPublico {
  const pasta = { chave: faseChave, rotulo: "EP", titulo: "EP", total: arquivos.length, extensoes: [{ chave: "pdf", rotulo: "PDF", total: arquivos.length, arquivos }] };
  return {
    projeto: { codigo: "260001", nome: "P" },
    titulo: null,
    disciplinas: [],
    situacoes: [
      { id: situacao, rotulo: "x", total: arquivos.length, disciplinas: [{ id: disciplinaId, nome: "Est", total: arquivos.length, pastas: [pasta] }] },
    ],
    arts: [],
  };
}

describe("marcasDoConteudo", () => {
  it("tira uma marca por documento e situação, com a fase da pasta", () => {
    const c = conteudo("compartilhado", "d1", "f-ep", [arquivo("u1", "a.pdf"), arquivo("u2", "a.dwg")]);
    const docs = new Map([["u1", "doc1"], ["u2", "doc1"]]);
    const datas = new Map([[chaveMarca("doc1", "compartilhado"), d("2026-10-02T15:00:00Z")]]);
    expect(marcasDoConteudo(c, docs, datas)).toEqual([
      { documentoId: "doc1", disciplinaId: "d1", faseId: "f-ep", situacao: "compartilhado", marcadaEm: d("2026-10-02T15:00:00Z") },
    ]);
  });

  it("pasta Sem fase vira faseId null", () => {
    const c = conteudo("liberado_obra", "d1", FASE_SEM, [arquivo("u1", "a.pdf")]);
    const [m] = marcasDoConteudo(c, new Map([["u1", "doc1"]]), new Map());
    expect(m.faseId).toBeNull();
    expect(m.marcadaEm).toBeNull();
  });

  it("upload sem documento no mapa fica fora", () => {
    const c = conteudo("compartilhado", "d1", "f-ep", [arquivo("u1", "a.pdf")]);
    expect(marcasDoConteudo(c, new Map(), new Map())).toEqual([]);
  });

  it("conteúdo null devolve lista vazia", () => {
    expect(marcasDoConteudo(null, new Map(), new Map())).toEqual([]);
  });
});

describe("andamentoDoProjeto", () => {
  it("aguardando é Não iniciada", () => {
    const a = andamentoDoProjeto([disc("d1", [fase("EP", "aguardando")])], []);
    expect(a.disciplinas[0].fases[0]).toEqual({ faseId: "f-ep", sigla: "EP", situacao: "nao_iniciada", concluidaEm: null });
  });

  it("aprovada sem prancha nas Entregas segue Em andamento", () => {
    const a = andamentoDoProjeto([disc("d1", [fase("EP", "aprovado", { entregueEm: d("2026-10-05T12:00:00Z") })])], []);
    expect(a.disciplinas[0].fases[0].situacao).toBe("em_andamento");
  });

  it("prancha compartilhada antes da aprovação não conclui", () => {
    const a = andamentoDoProjeto(
      [disc("d1", [fase("EP", "em_andamento")])],
      [marca("doc1", "d1", "f-ep", "compartilhado", "2026-10-02T15:00:00Z")],
    );
    expect(a.disciplinas[0].fases[0].situacao).toBe("em_andamento");
  });

  it("em_revisao e entregue são Em andamento", () => {
    const a = andamentoDoProjeto([disc("d1", [fase("EP", "em_revisao"), fase("BS", "entregue")])], []);
    expect(a.disciplinas[0].fases.map((f) => f.situacao)).toEqual(["em_andamento", "em_andamento"]);
  });

  it("aprovada com uma prancha da fase conclui, data = a mais recente entre aprovação e primeira marcação", () => {
    const marcas = [
      marca("doc1", "d1", "f-ep", "compartilhado", "2026-10-02T15:00:00Z"),
      marca("doc2", "d1", "f-ep", "compartilhado", "2026-10-08T15:00:00Z"),
    ];
    const depois = andamentoDoProjeto([disc("d1", [fase("EP", "aprovado", { entregueEm: d("2026-10-05T12:00:00Z") })])], marcas);
    expect(depois.disciplinas[0].fases[0]).toMatchObject({ situacao: "concluida", concluidaEm: "2026-10-05" });
    const antes = andamentoDoProjeto([disc("d1", [fase("EP", "aprovado", { entregueEm: d("2026-09-30T12:00:00Z") })])], marcas);
    expect(antes.disciplinas[0].fases[0].concluidaEm).toBe("2026-10-02");
  });

  it("mesma prancha compartilhada e liberada: vale a marcação mais antiga", () => {
    const a = andamentoDoProjeto(
      [disc("d1", [fase("EP", "aprovado")])],
      [
        marca("doc1", "d1", "f-ep", "liberado_obra", "2026-10-09T15:00:00Z"),
        marca("doc1", "d1", "f-ep", "compartilhado", "2026-10-03T15:00:00Z"),
      ],
    );
    expect(a.disciplinas[0].fases[0].concluidaEm).toBe("2026-10-03");
  });

  it("concluída sem nenhuma data tem concluidaEm null", () => {
    const a = andamentoDoProjeto([disc("d1", [fase("EP", "aprovado")])], [marca("doc1", "d1", "f-ep", "compartilhado", null)]);
    expect(a.disciplinas[0].fases[0]).toMatchObject({ situacao: "concluida", concluidaEm: null });
  });

  it("prancha de outra fase ou Sem fase não conclui a fase", () => {
    const a = andamentoDoProjeto(
      [disc("d1", [fase("EP", "aprovado")])],
      [marca("doc1", "d1", "f-bs", "compartilhado", "2026-10-02T15:00:00Z"), marca("doc2", "d1", null, "compartilhado", "2026-10-02T15:00:00Z")],
    );
    expect(a.disciplinas[0].fases[0].situacao).toBe("em_andamento");
  });

  it("prancha de outra disciplina não conclui a fase", () => {
    const a = andamentoDoProjeto([disc("d1", [fase("EP", "aprovado")])], [marca("doc1", "d2", "f-ep", "compartilhado", null)]);
    expect(a.disciplinas[0].fases[0].situacao).toBe("em_andamento");
  });

  it("disciplina sem fase usa o próprio status e qualquer prancha dela", () => {
    const a = andamentoDoProjeto(
      [disc("d1", [], { status: "aprovado", entregueEm: d("2026-10-01T12:00:00Z") })],
      [marca("doc1", "d1", null, "liberado_obra", "2026-10-04T15:00:00Z")],
    );
    expect(a.disciplinas[0].fases).toEqual([{ faseId: null, sigla: null, situacao: "concluida", concluidaEm: "2026-10-04" }]);
    expect(a.disciplinas[0].percentual).toBe(100);
  });

  it("percentual soma os percentuais das concluídas sobre o total do plano", () => {
    const marcas = [marca("doc1", "d1", "f-ep", "compartilhado", null)];
    const cheio = andamentoDoProjeto(
      [disc("d1", [fase("EP", "aprovado", { percentual: 30 }), fase("BS", "em_andamento", { percentual: 30 }), fase("EX", "aguardando", { percentual: 40 })])],
      marcas,
    );
    expect(cheio.disciplinas[0].percentual).toBe(30);
    const rascunho = andamentoDoProjeto(
      [disc("d1", [fase("EP", "aprovado", { percentual: 20 }), fase("BS", "em_andamento", { percentual: 20 })])],
      marcas,
    );
    expect(rascunho.disciplinas[0].percentual).toBe(50);
  });

  it("plano com percentuais zerados conta fases", () => {
    const a = andamentoDoProjeto(
      [disc("d1", [fase("EP", "aprovado"), fase("BS", "em_andamento"), fase("EX", "aguardando")])],
      [marca("doc1", "d1", "f-ep", "compartilhado", null)],
    );
    expect(a.disciplinas[0].percentual).toBe(33);
  });

  it("disciplina sem fase vale 0 ou 100; projeto é a média arredondada", () => {
    const a = andamentoDoProjeto(
      [
        disc("d1", [], { status: "aprovado" }),
        disc("d2", [fase("EP", "aprovado"), fase("BS", "em_andamento"), fase("EX", "aguardando")]),
        disc("d3", [], { status: "aprovado" }),
      ],
      [marca("doc1", "d1", null, "compartilhado", null), marca("doc2", "d2", "f-ep", "compartilhado", null)],
    );
    expect(a.disciplinas.map((x) => x.percentual)).toEqual([100, 33, 0]);
    expect(a.percentual).toBe(44);
    expect(andamentoDoProjeto([], []).percentual).toBe(0);
  });

  it("fase concluída volta a Em andamento quando a prancha sai das Entregas", () => {
    const disciplinas = [disc("d1", [fase("EP", "aprovado")])];
    expect(andamentoDoProjeto(disciplinas, [marca("doc1", "d1", "f-ep", "compartilhado", null)]).disciplinas[0].fases[0].situacao).toBe("concluida");
    expect(andamentoDoProjeto(disciplinas, []).disciplinas[0].fases[0].situacao).toBe("em_andamento");
  });
});

describe("linhaDoTempo", () => {
  const linha = (disciplinas: DisciplinaEntrada[], marcas: MarcaEntrada[]) =>
    linhaDoTempo(disciplinas, marcas, andamentoDoProjeto(disciplinas, marcas));

  it("agrupa por dia, disciplina e tipo contando documentos", () => {
    const itens = linha(
      [disc("d1", [fase("EP", "em_andamento")])],
      [
        marca("doc1", "d1", "f-ep", "compartilhado", "2026-10-02T12:00:00Z"),
        marca("doc2", "d1", "f-ep", "compartilhado", "2026-10-02T13:00:00Z"),
        marca("doc3", "d1", null, "compartilhado", "2026-10-02T18:00:00Z"),
      ],
    );
    expect(itens).toEqual([
      { dia: "2026-10-02", disciplinaId: "d1", disciplina: "Disciplina d1", tipo: "compartilhado", quantidade: 3, faseSigla: null, texto: "3 pranchas compartilhadas com você" },
    ]);
  });

  it("singular para uma prancha", () => {
    const itens = linha(
      [disc("d1", [])],
      [marca("doc1", "d1", null, "compartilhado", "2026-10-02T12:00:00Z"), marca("doc2", "d1", null, "liberado_obra", "2026-10-03T12:00:00Z")],
    );
    expect(itens.map((i) => i.texto)).toEqual(["1 prancha liberada para obra", "1 prancha compartilhada com você"]);
  });

  it("fase concluída vira item próprio", () => {
    const itens = linha(
      [disc("d1", [fase("EP", "aprovado", { entregueEm: d("2026-10-05T12:00:00Z") })])],
      [marca("doc1", "d1", "f-ep", "compartilhado", "2026-10-02T12:00:00Z")],
    );
    expect(itens[0]).toEqual({ dia: "2026-10-05", disciplinaId: "d1", disciplina: "Disciplina d1", tipo: "fase_concluida", quantidade: 1, faseSigla: "EP", texto: "Fase EP concluída" });
    expect(itens).toHaveLength(2);
  });

  it("disciplina sem fase concluída vira 'Disciplina concluída'", () => {
    const itens = linha([disc("d1", [], { status: "aprovado" })], [marca("doc1", "d1", null, "compartilhado", "2026-10-02T12:00:00Z")]);
    expect(itens.find((i) => i.tipo === "fase_concluida")?.texto).toBe("Disciplina concluída");
  });

  it("marca sem data e fase concluída sem data ficam fora", () => {
    const itens = linha([disc("d1", [fase("EP", "aprovado")])], [marca("doc1", "d1", "f-ep", "compartilhado", null)]);
    expect(itens).toEqual([]);
  });

  it("ordena do mais novo; no mesmo dia: liberadas, compartilhadas, fases; depois a ordem das disciplinas", () => {
    const itens = linha(
      [disc("d1", [fase("EP", "aprovado", { entregueEm: d("2026-10-05T12:00:00Z") })]), disc("d2", [])],
      [
        marca("doc1", "d1", "f-ep", "compartilhado", "2026-10-05T12:00:00Z"),
        marca("doc2", "d2", null, "compartilhado", "2026-10-05T12:00:00Z"),
        marca("doc3", "d1", null, "liberado_obra", "2026-10-05T13:00:00Z"),
        marca("doc4", "d2", null, "liberado_obra", "2026-10-01T13:00:00Z"),
      ],
    );
    expect(itens.map((i) => `${i.dia} ${i.disciplinaId} ${i.tipo}`)).toEqual([
      "2026-10-05 d1 liberado_obra",
      "2026-10-05 d1 compartilhado",
      "2026-10-05 d2 compartilhado",
      "2026-10-05 d1 fase_concluida",
      "2026-10-01 d2 liberado_obra",
    ]);
  });

  it("22h30 de Brasília fica no dia de São Paulo", () => {
    const itens = linha([disc("d1", [])], [marca("doc1", "d1", null, "compartilhado", "2026-10-03T01:30:00Z")]);
    expect(itens[0].dia).toBe("2026-10-02");
  });
});
