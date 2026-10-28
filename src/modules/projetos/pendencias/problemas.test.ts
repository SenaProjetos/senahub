import { describe, expect, it } from "vitest";
import {
  MOTIVO_NAO_PARTICIPA,
  agruparPorDisciplina,
  contarPorSituacao,
  dicaDeOutrasSituacoes,
  diasEmAberto,
  escolherVigente,
  extensaoDoArquivo,
  ehPublicada,
  filtrarProblemas,
  hrefDaPrancha,
  podeParticiparDaConversa,
  podeVerProblema,
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
  it("numeração é por documento: agrupa pela prancha antes do número (sem #1 intercalado)", () => {
    const g = agruparPorDisciplina([
      linha({ id: "b1", numero: 1, arquivo: "EST-10.pdf" }),
      linha({ id: "a2", numero: 2, arquivo: "EST-02.pdf" }),
      linha({ id: "b2", numero: 2, arquivo: "EST-10.pdf" }),
      linha({ id: "a1", numero: 1, arquivo: "EST-02.pdf" }),
    ]);
    // `numeric`: EST-02 antes de EST-10.
    expect(g[0].linhas.map((l) => l.id)).toEqual(["a1", "a2", "b1", "b2"]);
  });
});

describe("podeVerProblema (mesma regra do visualizador)", () => {
  const ninguem = { global: false, membro: false, responsavelDaDisciplina: false };
  it("global vê tudo", () => {
    expect(podeVerProblema({ ...ninguem, global: true })).toBe(true);
  });
  it("membro do projeto vê tudo", () => {
    expect(podeVerProblema({ ...ninguem, membro: true })).toBe(true);
  });
  it("fora da equipe, responsável vê só a própria disciplina", () => {
    // A flag é da disciplina DA LINHA: responsável de outra disciplina chega aqui com `false`.
    expect(podeVerProblema({ ...ninguem, responsavelDaDisciplina: true })).toBe(true);
  });
  it("fora da equipe e sem ser responsável não vê nada", () => {
    expect(podeVerProblema(ninguem)).toBe(false);
  });
});

describe("contarPorSituacao com filtros e dicaDeOutrasSituacoes", () => {
  const linhas = [
    linha({ status: "aberta", severidade: "alta" }),
    linha({ status: "fechada", severidade: "alta" }),
    linha({ status: "fechada", severidade: "baixa" }),
    linha({ status: "resolvida", severidade: "baixa" }),
  ];
  it("conta só o que casa com severidade e tipo", () => {
    expect(contarPorSituacao(linhas, { severidade: "alta", tipo: "todos" })).toEqual({ em_aberto: 1, aguardando: 0, encerrados: 1 });
    expect(contarPorSituacao(linhas, { severidade: "todas", tipo: "todos" })).toEqual({ em_aberto: 1, aguardando: 1, encerrados: 2 });
  });
  it("dica cita as outras situações com itens", () => {
    expect(dicaDeOutrasSituacoes({ em_aberto: 0, aguardando: 0, encerrados: 3 }, "em_aberto")).toBe("Há 3 em Encerrados.");
    expect(dicaDeOutrasSituacoes({ em_aberto: 0, aguardando: 1, encerrados: 2 }, "em_aberto")).toBe(
      "Há 1 em Aguardando verificação e 2 em Encerrados.",
    );
  });
  it("sem itens fora da situação atual → null", () => {
    expect(dicaDeOutrasSituacoes({ em_aberto: 5, aguardando: 0, encerrados: 0 }, "em_aberto")).toBeNull();
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

describe("escolherVigente", () => {
  const u = (id: string, nomeArquivo: string, versao: number, extra: Record<string, unknown> = {}) => ({
    id,
    nomeArquivo,
    versao,
    ...extra,
  });

  it("PDF e DWG no mesmo documento: o DWG com versão maior não vence o PDF", () => {
    const v = escolherVigente([u("dwg", "A-01.dwg", 5), u("pdf", "A-01.pdf", 2)], "pdf");
    expect(v?.id).toBe("pdf");
  });
  it("todos os PDFs na lixeira: nenhum (mesmo havendo DWG)", () => {
    const v = escolherVigente(
      [u("dwg", "A-01.dwg", 5), u("pdf", "A-01.pdf", 2, { excluidoEm: new Date("2026-10-01T00:00:00.000Z") })],
      "pdf",
    );
    expect(v).toBeNull();
  });
  it("vence a maior versão entre os da mesma extensão", () => {
    const v = escolherVigente([u("a", "A-01.pdf", 1), u("c", "A-01.pdf", 3), u("b", "A-01.pdf", 2)], "pdf");
    expect(v?.id).toBe("c");
  });
  it("linha substituída nunca é escolhida", () => {
    const v = escolherVigente([u("novo", "A-01.pdf", 2, { substituidoPorId: "x" }), u("velho", "A-01.pdf", 1)], "pdf");
    expect(v?.id).toBe("velho");
  });
  it("a versão mais nova na lixeira é pulada", () => {
    const v = escolherVigente(
      [u("lixo", "A-01.pdf", 3, { excluidoEm: "2026-10-01T00:00:00.000Z" }), u("ok", "A-01.pdf", 2)],
      "pdf",
    );
    expect(v?.id).toBe("ok");
  });
  it("extensão compara sem diferenciar caixa; lista vazia → nenhum", () => {
    expect(escolherVigente([u("a", "A-01.PDF", 1)], "pdf")?.id).toBe("a");
    expect(escolherVigente([], "pdf")).toBeNull();
  });
});

describe("extensaoDoArquivo", () => {
  it("minúscula, sem ponto; sem extensão → vazio", () => {
    expect(extensaoDoArquivo("Planta.PDF")).toBe("pdf");
    expect(extensaoDoArquivo("semextensao")).toBe("");
    expect(extensaoDoArquivo(".gitignore")).toBe("");
  });
});
