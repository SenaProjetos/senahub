import { describe, expect, it } from "vitest";
import {
  MOTIVO_CLIENTE_DIFERENTE,
  MOTIVO_FICHA_EXCLUIDA,
  MOTIVO_JA_LINKADO_ESTA,
  MOTIVO_JA_LINKADO_OUTRA,
  MOTIVO_JA_NO_PROJETO,
  MOTIVO_NAO_CONTRATADA,
  MOTIVO_REPETIDO,
  MOTIVO_SEM_ARQUIVO,
  dataBr,
  descricaoComResumo,
  extensaoDe,
  marcarArquivos,
  motivoParaNaoVincular,
  planejarCampos,
  resumoHistorico,
  type ItemArquivo,
  type NegociacaoParaVinculo,
  type ProjetoParaVinculo,
} from "./regras";

const projeto = (o: Partial<ProjetoParaVinculo> = {}): ProjetoParaVinculo => ({
  id: "p1",
  clienteId: "c1",
  negociacaoId: null,
  valorContrato: null,
  areaM2: null,
  tipoEmpreendimentoId: null,
  descricao: null,
  membrosIds: [],
  ...o,
});

const ficha = (o: Partial<NegociacaoParaVinculo> = {}): NegociacaoParaVinculo => ({
  id: "n1",
  titulo: "Residencial Aurora",
  clienteId: "c1",
  estagio: "CONTRATADO",
  excluida: false,
  valorNegociado: 150000,
  areaM2: 320.5,
  tipoEmpreendimentoId: "t1",
  responsavelId: "u1",
  ...o,
});

const item = (o: Partial<ItemArquivo> = {}): ItemArquivo => ({
  chave: "lead:a1",
  origem: "anexo_lead",
  nome: "Solicitação",
  nomeArquivo: "solicitacao.pdf",
  caminho: "comercial/leads/aa.pdf",
  mime: "application/pdf",
  tamanho: 10,
  hashSha256: "h1",
  existe: true,
  ...o,
});

describe("motivoParaNaoVincular", () => {
  it("ficha contratada, mesmo cliente, projeto livre: pode", () => {
    expect(motivoParaNaoVincular(projeto(), ficha())).toBeNull();
  });
  it("ficha excluída", () => {
    expect(motivoParaNaoVincular(projeto(), ficha({ excluida: true }))).toBe(MOTIVO_FICHA_EXCLUIDA);
  });
  it("só Contratado", () => {
    expect(motivoParaNaoVincular(projeto(), ficha({ estagio: "PERDIDO" }))).toBe(MOTIVO_NAO_CONTRATADA);
    expect(motivoParaNaoVincular(projeto(), ficha({ estagio: "ORCAMENTO" }))).toBe(MOTIVO_NAO_CONTRATADA);
  });
  it("cliente diferente", () => {
    expect(motivoParaNaoVincular(projeto({ clienteId: "c2" }), ficha())).toBe(MOTIVO_CLIENTE_DIFERENTE);
  });
  it("projeto já linkado: a esta ficha ou a outra", () => {
    expect(motivoParaNaoVincular(projeto({ negociacaoId: "n1" }), ficha())).toBe(MOTIVO_JA_LINKADO_ESTA);
    expect(motivoParaNaoVincular(projeto({ negociacaoId: "n9" }), ficha())).toBe(MOTIVO_JA_LINKADO_OUTRA);
  });
});

describe("planejarCampos", () => {
  it("projeto vazio recebe tudo o que a ficha tem", () => {
    const plano = planejarCampos(projeto(), ficha(), true);
    expect(plano.preenche).toEqual({ valorContrato: 150000, areaM2: 320.5, tipoEmpreendimentoId: "t1" });
    expect(plano.mantem).toEqual([]);
  });
  it("nunca sobrescreve: campo já preenchido vai para 'mantém'", () => {
    const plano = planejarCampos(projeto({ valorContrato: 99, areaM2: 10 }), ficha(), true);
    expect(plano.preenche).toEqual({ tipoEmpreendimentoId: "t1" });
    expect(plano.mantem).toEqual(["valorContrato", "areaM2"]);
  });
  it("campo que a ficha não tem não é oferecido nem listado como mantido", () => {
    const plano = planejarCampos(projeto(), ficha({ valorNegociado: null, areaM2: null, tipoEmpreendimentoId: null }), true);
    expect(plano.preenche).toEqual({});
    expect(plano.mantem).toEqual([]);
  });
  it("coordenador: responsável interno que ainda não é membro", () => {
    expect(planejarCampos(projeto(), ficha(), true).coordenadorId).toBe("u1");
  });
  it("coordenador: já é membro (qualquer papel) fica como está", () => {
    expect(planejarCampos(projeto({ membrosIds: ["u1"] }), ficha(), true).coordenadorId).toBeNull();
  });
  it("coordenador: externo ou inativo não entra", () => {
    expect(planejarCampos(projeto(), ficha(), false).coordenadorId).toBeNull();
  });
  it("coordenador: ficha sem responsável", () => {
    expect(planejarCampos(projeto(), ficha({ responsavelId: null }), true).coordenadorId).toBeNull();
  });
});

describe("marcarArquivos", () => {
  it("arquivo normal vem marcado para importar", () => {
    const [a] = marcarArquivos([item()], new Set());
    expect(a.importarPadrao).toBe(true);
    expect(a.motivoNaoImportar).toBeNull();
  });
  it("hash já no projeto: desmarcado com o motivo", () => {
    const [a] = marcarArquivos([item()], new Set(["h1"]));
    expect(a.importarPadrao).toBe(false);
    expect(a.motivoNaoImportar).toBe(MOTIVO_JA_NO_PROJETO);
  });
  it("hash repetido dentro da própria lista: só o segundo é marcado como repetido", () => {
    const [a, b] = marcarArquivos([item({ chave: "x1" }), item({ chave: "x2" })], new Set());
    expect(a.importarPadrao).toBe(true);
    expect(b.motivoNaoImportar).toBe(MOTIVO_REPETIDO);
  });
  it("arquivo ausente no disco: desmarcado, motivo próprio, vence a deduplicação", () => {
    const [a] = marcarArquivos([item({ existe: false })], new Set(["h1"]));
    expect(a.importarPadrao).toBe(false);
    expect(a.motivoNaoImportar).toBe(MOTIVO_SEM_ARQUIVO);
  });
  it("sem hash nunca conta como duplicado", () => {
    const r = marcarArquivos([item({ chave: "x1", hashSha256: null }), item({ chave: "x2", hashSha256: null })], new Set(["h1"]));
    expect(r.every((a) => a.importarPadrao)).toBe(true);
  });
});

describe("resumoHistorico", () => {
  const nota = (dia: number, descricao = `nota ${dia}`, tipo = "NOTA") => ({
    tipo,
    descricao,
    createdAt: new Date(Date.UTC(2026, 9, dia, 15)),
  });

  it("sem nota nem reunião: null", () => {
    expect(resumoHistorico([], "15/10/2026")).toBeNull();
    expect(resumoHistorico([nota(1, "x", "SISTEMA"), nota(2, "y", "LIGACAO")], "15/10/2026")).toBeNull();
  });
  it("ignora descrição em branco", () => {
    expect(resumoHistorico([nota(1, "   ")], "15/10/2026")).toBeNull();
  });
  it("cabeçalho com a data de importação e linhas com data, tipo e texto", () => {
    const r = resumoHistorico([nota(3, "Cliente pediu revisão"), nota(5, "Reunião de kickoff", "REUNIAO")], "15/10/2026")!;
    const linhas = r.split("\n");
    expect(linhas[0]).toBe("Histórico comercial (importado em 15/10/2026)");
    expect(linhas[1]).toBe("- 03/10/2026 · Nota: Cliente pediu revisão");
    expect(linhas[2]).toBe("- 05/10/2026 · Reunião: Reunião de kickoff");
  });
  it("máximo de 10 linhas: as 10 mais recentes, em ordem cronológica", () => {
    const todas = Array.from({ length: 12 }, (_, i) => nota(i + 1));
    const linhas = resumoHistorico(todas, "15/10/2026")!.split("\n");
    expect(linhas).toHaveLength(11);
    expect(linhas[1]).toContain("03/10/2026");
    expect(linhas[10]).toContain("12/10/2026");
  });
  it("corta cada linha em 200 caracteres com reticências e colapsa espaços", () => {
    const r = resumoHistorico([nota(1, "x".repeat(300))], "15/10/2026")!;
    const texto = r.split("\n")[1].split(": ")[1];
    expect(texto).toHaveLength(200);
    expect(texto.endsWith("…")).toBe(true);
    const r2 = resumoHistorico([nota(1, "a   b\n\nc")], "15/10/2026")!;
    expect(r2.split("\n")[1]).toBe("- 01/10/2026 · Nota: a b c");
  });
  it("nota legada do lead conta como Nota", () => {
    const r = resumoHistorico([nota(2, "antiga", "NOTA_LEGADA")], "15/10/2026")!;
    expect(r.split("\n")[1]).toBe("- 02/10/2026 · Nota: antiga");
  });
});

describe("descricaoComResumo", () => {
  it("sem resumo, nada a gravar", () => {
    expect(descricaoComResumo(null, null)).toBeNull();
  });
  it("descrição já preenchida não é tocada", () => {
    expect(descricaoComResumo("Casa de praia", "Histórico…")).toBeNull();
  });
  it("descrição vazia ou só espaços recebe o resumo", () => {
    expect(descricaoComResumo(null, "Histórico…")).toBe("Histórico…");
    expect(descricaoComResumo("   ", "Histórico…")).toBe("Histórico…");
  });
});

describe("extensaoDe", () => {
  it("minúscula e com ponto", () => {
    expect(extensaoDe("Planta.PDF")).toBe(".pdf");
    expect(extensaoDe("arquivo.tar.gz")).toBe(".gz");
  });
  it("sem extensão: vazio", () => {
    expect(extensaoDe("sem-extensao")).toBe("");
    expect(extensaoDe("arquivo.")).toBe("");
  });
  it("tira caractere que não seja letra, número ou ponto", () => {
    expect(extensaoDe("x.p$f")).toBe(".pf");
  });
});

describe("dataBr", () => {
  it("dd/mm/aaaa no fuso de São Paulo", () => {
    expect(dataBr(new Date("2026-10-15T12:00:00Z"))).toBe("15/10/2026");
    // 01:00 UTC ainda é o dia anterior em São Paulo.
    expect(dataBr(new Date("2026-10-15T01:00:00Z"))).toBe("14/10/2026");
  });
});
