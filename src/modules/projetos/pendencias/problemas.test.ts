import { describe, expect, it } from "vitest";
import {
  MOTIVO_NAO_PARTICIPA,
  agruparPorDisciplina,
  contarPorSituacao,
  diasEmAberto,
  ehPublicada,
  filtrarProblemas,
  hrefDaPrancha,
  podeParticiparDaConversa,
  situacaoDoStatus,
  type ProblemaLinha,
} from "@/modules/projetos/pendencias/problemas";

const base = { autorId: "a", usuarioId: "u", ehResponsavel: false, ehGlobal: false };

describe("podeParticiparDaConversa", () => {
  it("autor participa mesmo sem ser responsável", () => {
    expect(podeParticiparDaConversa({ ...base, usuarioId: "a" })).toBe(true);
  });
  it("responsável participa", () => {
    expect(podeParticiparDaConversa({ ...base, ehResponsavel: true })).toBe(true);
  });
  it("global participa", () => {
    expect(podeParticiparDaConversa({ ...base, ehGlobal: true })).toBe(true);
  });
  it("nenhum dos três não participa", () => {
    expect(podeParticiparDaConversa(base)).toBe(false);
  });
  it("MOTIVO_NAO_PARTICIPA é a frase do servidor", () => {
    expect(MOTIVO_NAO_PARTICIPA).toBe("Só um responsável da disciplina pode alterar esta pendência.");
  });
});

function linha(p: Partial<ProblemaLinha> = {}): ProblemaLinha {
  return {
    id: "p1",
    numero: 1,
    texto: "Texto",
    pagina: 1,
    status: "aberta",
    severidade: null,
    tipo: null,
    prazo: null,
    createdAt: "2026-10-01T12:00:00.000Z",
    fechadoEm: null,
    autorId: "a",
    autor: "Autor",
    tarefaId: null,
    disciplinaId: "d1",
    disciplinaNome: "Estrutural",
    arquivo: "EST-01.pdf",
    uploadIdOrigem: "uo",
    uploadIdVigente: "uv",
    arquivoDisponivel: true,
    deOutraRevisao: false,
    revisaoOrigemId: "r1",
    revisaoVigenteId: "r1",
    revisaoVigenteNumero: 1,
    respostas: [],
    papeis: { ehValidador: false, ehResponsavel: false, ehGlobal: false },
    ...p,
  };
}

describe("situacaoDoStatus", () => {
  it("agrupa os 6 status", () => {
    expect(situacaoDoStatus("aberta")).toBe("em_aberto");
    expect(situacaoDoStatus("em_correcao")).toBe("em_aberto");
    expect(situacaoDoStatus("resolvida")).toBe("aguardando");
    expect(situacaoDoStatus("fechada")).toBe("encerrados");
    expect(situacaoDoStatus("descartada")).toBe("encerrados");
    expect(situacaoDoStatus("adiado")).toBe("encerrados");
  });
  it("status desconhecido não tem situação", () => {
    expect(situacaoDoStatus("xyz")).toBeNull();
  });
});

describe("filtrarProblemas", () => {
  const linhas = [
    linha({ id: "1", status: "aberta", severidade: "impeditivo", tipo: "erro" }),
    linha({ id: "2", status: "em_correcao", severidade: null, tipo: "duvida" }),
    linha({ id: "3", status: "resolvida", severidade: "menor", tipo: "erro" }),
    linha({ id: "4", status: "fechada" }),
  ];
  const ids = (r: ProblemaLinha[]) => r.map((l) => l.id);
  it("filtra por situação", () => {
    const f = { severidade: "todas", tipo: "todos" };
    expect(ids(filtrarProblemas(linhas, { situacao: "em_aberto", ...f }))).toEqual(["1", "2"]);
    expect(ids(filtrarProblemas(linhas, { situacao: "aguardando", ...f }))).toEqual(["3"]);
    expect(ids(filtrarProblemas(linhas, { situacao: "encerrados", ...f }))).toEqual(["4"]);
  });
  it("severidade 'sem' pega as sem classificação", () => {
    expect(ids(filtrarProblemas(linhas, { situacao: "em_aberto", severidade: "sem", tipo: "todos" }))).toEqual(["2"]);
  });
  it("severidade específica", () => {
    expect(ids(filtrarProblemas(linhas, { situacao: "em_aberto", severidade: "impeditivo", tipo: "todos" }))).toEqual(["1"]);
  });
  it("filtra por tipo", () => {
    expect(ids(filtrarProblemas(linhas, { situacao: "em_aberto", severidade: "todas", tipo: "duvida" }))).toEqual(["2"]);
  });
});

describe("contarPorSituacao", () => {
  it("conta cada situação, ignorando status desconhecido", () => {
    const c = contarPorSituacao([
      linha({ status: "aberta" }),
      linha({ status: "em_correcao" }),
      linha({ status: "resolvida" }),
      linha({ status: "descartada" }),
      linha({ status: "xyz" }),
    ]);
    expect(c).toEqual({ em_aberto: 2, aguardando: 1, encerrados: 1 });
  });
  it("vazio zera tudo", () => {
    expect(contarPorSituacao([])).toEqual({ em_aberto: 0, aguardando: 0, encerrados: 0 });
  });
});

describe("agruparPorDisciplina", () => {
  it("lista vazia → []", () => {
    expect(agruparPorDisciplina([])).toEqual([]);
  });
  it("ordena grupos por nome e linhas por número", () => {
    const g = agruparPorDisciplina([
      linha({ id: "a", numero: 3, disciplinaId: "e", disciplinaNome: "Elétrica" }),
      linha({ id: "b", numero: 2, disciplinaId: "a", disciplinaNome: "Arquitetura" }),
      linha({ id: "c", numero: 1, disciplinaId: "e", disciplinaNome: "Elétrica" }),
    ]);
    expect(g.map((x) => x.disciplinaNome)).toEqual(["Arquitetura", "Elétrica"]);
    expect(g[1].linhas.map((l) => l.id)).toEqual(["c", "a"]);
  });
});

describe("diasEmAberto", () => {
  it("aberto conta até agora", () => {
    expect(diasEmAberto("2026-10-01T12:00:00.000Z", null, new Date("2026-10-11T13:00:00.000Z"))).toBe(10);
  });
  it("encerrado para em fechadoEm e não cresce com agora", () => {
    const fechado = "2026-10-04T12:00:00.000Z";
    expect(diasEmAberto("2026-10-01T12:00:00.000Z", fechado, new Date("2026-12-01T00:00:00.000Z"))).toBe(3);
  });
  it("nunca negativo", () => {
    expect(diasEmAberto("2026-10-05T12:00:00.000Z", null, new Date("2026-10-01T00:00:00.000Z"))).toBe(0);
  });
  it("aceita Date", () => {
    expect(diasEmAberto(new Date("2026-10-01T00:00:00.000Z"), null, new Date("2026-10-03T00:00:00.000Z"))).toBe(2);
  });
});

describe("hrefDaPrancha", () => {
  it("usa o arquivo vigente", () => {
    expect(hrefDaPrancha({ arquivoDisponivel: true, uploadIdVigente: "uv", uploadIdOrigem: "uo", numero: 7 }, "proj")).toBe(
      "/projetos/proj/arquivos/uv/visualizar?pin=7",
    );
  });
  it("sem vigente cai no de origem", () => {
    expect(hrefDaPrancha({ arquivoDisponivel: true, uploadIdVigente: null, uploadIdOrigem: "uo", numero: 2 }, "proj")).toBe(
      "/projetos/proj/arquivos/uo/visualizar?pin=2",
    );
  });
  it("arquivo indisponível → null", () => {
    expect(hrefDaPrancha({ arquivoDisponivel: false, uploadIdVigente: "uv", uploadIdOrigem: "uo", numero: 1 }, "proj")).toBeNull();
  });
});

describe("ehPublicada", () => {
  it("rascunho (publicadoEm nulo) não é publicada", () => {
    expect(ehPublicada({ publicadoEm: null, excluidoEm: null })).toBe(false);
  });
  it("excluída não é publicada, mesmo com data de publicação", () => {
    expect(ehPublicada({ publicadoEm: new Date("2026-10-01T00:00:00.000Z"), excluidoEm: new Date("2026-10-02T00:00:00.000Z") })).toBe(false);
  });
  it("publicada e não excluída é publicada", () => {
    expect(ehPublicada({ publicadoEm: new Date("2026-10-01T00:00:00.000Z"), excluidoEm: null })).toBe(true);
    expect(ehPublicada({ publicadoEm: "2026-10-01T00:00:00.000Z", excluidoEm: null })).toBe(true);
  });
});
