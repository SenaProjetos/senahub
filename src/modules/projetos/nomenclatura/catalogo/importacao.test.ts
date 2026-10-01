import { describe, expect, it } from "vitest";
import { catalogoDev, PLANILHA_GESTAO } from "@/test/catalogo-nomenclatura-snap";
import { lerPlanilhaCatalogo } from "./planilha";
import { itensEscolhidos, nomeBase, nomeLegivel, operacoesEscolhidas, planejarImportacao } from "./importacao";
import { catalogoNaVersao, colisoes, simular } from "./versao";

const planilha = lerPlanilhaCatalogo(PLANILHA_GESTAO);
const plano = planejarImportacao(catalogoDev(), 2, planilha, { versoesExistentes: [1, 2] });
const doGrupo = (g: string) => plano.itens.filter((i) => i.grupo === g);

describe("nomes", () => {
  it("nomeBase ignora acento, caixa, parênteses e 'geral'", () => {
    expect(nomeBase("Climatização (AVAC)")).toBe(nomeBase("CLIMATIZAÇÃO"));
    expect(nomeBase("SPDA GERAL")).toBe("spda");
  });

  it("nomeLegivel: caixa alta vira nome de cadastro", () => {
    expect(nomeLegivel("ENTRADA DE ENERGIA", true)).toBe("Entrada de Energia");
    expect(nomeLegivel("FOTOVOLTAICO GERAL", true)).toBe("Fotovoltaico");
    expect(nomeLegivel("ÁGUA PARA REUSO", false)).toBe("Água para Reuso");
    expect(nomeLegivel("CFTV", false)).toBe("CFTV");
    expect(nomeLegivel("SITEMA DE TANQUE RETARDO/ACUMULO", false)).toBe("Sitema de Tanque Retardo/Acumulo");
    expect(nomeLegivel("Já Formatado", true)).toBe("Já Formatado");
  });
});

describe("planejarImportacao — planilha da gestão sobre o catálogo do dev", () => {
  it("não tem erro", () => {
    expect(plano.erros).toEqual([]);
  });

  it("liga pela sigla e pelo nome, sem renomear o cadastro", () => {
    const ligado = (planilhaNome: string, sigla?: string) =>
      plano.correspondencias.find(
        (c) => c.tipo === "card" && c.planilha === planilhaNome && (!sigla || planilha.linhas.find((l) => l.linha === c.linha)?.sigla === sigla),
      );
    expect(ligado("ELÉTRICA GERAL")).toMatchObject({ cadastro: "Elétrico", como: "sigla" });
    expect(ligado("SPDA GERAL")).toMatchObject({ cadastro: "SPDA", como: "nome" });
    expect(ligado("CLIMATIZAÇÃO")).toMatchObject({ cadastro: "Climatização (AVAC)", como: "nome" });
    expect(ligado("ORÇAMENTO GERAL")).toMatchObject({ cadastro: "Orçamento", como: "sigla" });
    expect(ligado("TERRAPLANAGEM GERAL", "TER")).toMatchObject({ cadastro: "Terraplenagem" });
    // A linha com o nome errado (TOP) liga em Topografia pela sigla — e avisa para conferir.
    expect(ligado("TERRAPLANAGEM GERAL", "TOP")).toMatchObject({ cadastro: "Topografia", como: "sigla" });
    expect(ligado("TERRAPLANAGEM GERAL", "TOP")?.aviso).toContain("Confira");
    // Grafia parecida não é motivo de aviso.
    expect(ligado("ELÉTRICA GERAL")?.aviso).toBeUndefined();
    expect(ligado("TERRAPLANAGEM GERAL", "TER")?.aviso).toBeUndefined();
  });

  it("'Prevenção de Incêndio' × 'Incêndio (PPCI)' é ligação provável, para confirmar", () => {
    expect(doGrupo("ligacoes")).toEqual([
      expect.objectContaining({ id: expect.stringMatching(/^ligar:/), opcional: true, descricao: expect.stringContaining("Incêndio (PPCI)") }),
    ]);
  });

  it("entram 6 cards novos e 29 subs", () => {
    const novos = doGrupo("entram").filter((i) => i.operacao?.tipo === "card-novo").map((i) => i.operacao);
    expect(novos.map((o) => (o?.tipo === "card-novo" ? `${o.nome}|${o.sigla ?? ""}` : ""))).toEqual([
      "Entrada de Energia|ENE",
      "Fotovoltaico|FOT",
      "Automação|AUT",
      "Telecomunicações|",
      "Segurança e Alarme|",
      "Compatibilização|CPB",
    ]);
    expect(doGrupo("entram").filter((i) => i.operacao?.tipo === "sub-nova")).toHaveLength(29);
  });

  it("card novo pega a categoria do grupo quando ela existe (Entrada de Energia → ELÉTRICA)", () => {
    const ene = doGrupo("entram").find((i) => i.operacao?.tipo === "card-novo" && i.operacao.nome === "Entrada de Energia");
    expect(ene?.operacao).toMatchObject({ categoria: "ELÉTRICA" });
  });

  it("só o SPDA troca de sigla (ORÇ = ORC, que já é a do Orçamento)", () => {
    expect(doGrupo("siglas").map((i) => i.descricao)).toEqual(["SPDA: SPD → PDA"]);
  });

  it("saem da v2 os cards que não estão na planilha", () => {
    expect(doGrupo("saem").map((i) => i.descricao).sort()).toEqual(["Acústica (ACU)", "Arquitetura (ARQ)", "CFTV (SEG)", "Cabeamento (LOG)"]);
  });

  it("ESG vira a sub Esgoto: deixa de ser sinônimo do Hidro na v2 (consequência obrigatória)", () => {
    const [c] = doGrupo("consequencias");
    expect(c).toMatchObject({ opcional: false, descricao: expect.stringContaining("ESG deixa de ser sinônimo de “Hidrossanitário”") });
    expect(c.dependeDe).toHaveLength(1);
    expect(plano.itens.find((i) => i.id === c.dependeDe[0])?.descricao).toContain("Esgoto");
  });

  it("aplicado, a v2 fica como a planilha e a v1 não muda", () => {
    const s = simular(catalogoDev(), 2, operacoesEscolhidas(plano.itens, new Set()));
    const v2 = catalogoNaVersao(s, 2);
    expect(v2.cards).toHaveLength(20);
    expect(v2.cards.flatMap((c) => c.subs)).toHaveLength(29);
    expect(v2.cards.find((c) => c.nome === "Telecomunicações")?.subs.map((x) => x.sigla)).toEqual(["DAD", "VOZ", "INT", "ANT"]);
    expect(v2.cards.find((c) => c.nome === "Incêndio (PPCI)")?.subs.map((x) => x.sigla)).toEqual(["SIN", "HDT", "SPK", "DTA"]);
    expect(colisoes(s, [1, 2])).toEqual([]);
    const v1 = catalogoNaVersao(s, 1);
    expect(v1.cards).toHaveLength(18);
    expect(v1.cards.flatMap((c) => c.subs)).toHaveLength(0);
  });

  it("importar de novo a mesma planilha não muda nada", () => {
    const s = simular(catalogoDev(), 2, operacoesEscolhidas(plano.itens, new Set()));
    const denovo = planejarImportacao(s, 2, planilha, { versoesExistentes: [1, 2] });
    expect(denovo.erros).toEqual([]);
    expect(denovo.itens.filter((i) => i.operacao !== null)).toEqual([]);
  });
});

describe("desmarcar", () => {
  it("desmarcar um card novo derruba as subs dele", () => {
    const tel = plano.itens.find((i) => i.operacao?.tipo === "card-novo" && i.operacao.nome === "Telecomunicações")!;
    const ficam = itensEscolhidos(plano.itens, new Set([tel.id]));
    expect(ficam.some((i) => i.descricao.includes("Sub nova em Telecomunicações"))).toBe(false);
    expect(ficam.some((i) => i.descricao.includes("Sub nova em Segurança e Alarme"))).toBe(true);
  });

  it("desmarcar a sub Esgoto derruba a consequência no Hidro", () => {
    const esgoto = plano.itens.find((i) => i.descricao.includes(": Esgoto (ESG)"))!;
    const ficam = itensEscolhidos(plano.itens, new Set([esgoto.id]));
    expect(ficam.some((i) => i.grupo === "consequencias")).toBe(false);
  });

  it("desmarcar a ligação provável cria o card novo e o existente sai", () => {
    const ligar = doGrupo("ligacoes")[0];
    const outro = planejarImportacao(catalogoDev(), 2, planilha, { desmarcados: new Set([ligar.id]), versoesExistentes: [1, 2] });
    expect(outro.itens.some((i) => i.operacao?.tipo === "card-novo" && i.operacao.nome === "Prevenção de Incêndio")).toBe(true);
    expect(outro.itens.some((i) => i.grupo === "saem" && i.descricao.startsWith("Incêndio (PPCI)"))).toBe(true);
  });

  it("a mesma sigla em dois itens da planilha é erro", () => {
    const dupla = lerPlanilhaCatalogo([
      ["NOVO UM", "XYZ", "CARD"],
      ["NOVO DOIS", "XYZ", "CARD"],
    ]);
    const p = planejarImportacao(catalogoDev(), 2, dupla, { versoesExistentes: [1, 2] });
    expect(p.erros.some((e) => e.includes("XYZ aparece duas vezes"))).toBe(true);
  });

  it("card que volta pela planilha com uma sigla que hoje é de outro: a planilha manda (revisão final)", () => {
    // Acústica saiu na v2 com a linha ACU em aberto (E3); Arquitetura ganhou ACU como sinônimo na v2.
    const snap = catalogoDev();
    snap.cards.find((c) => c.id === "acu")!.versaoAte = 1;
    snap.cards.find((c) => c.id === "arq")!.siglas.push({ id: "arq-acu", sigla: "ACU", oficial: false, versaoDesde: 2, versaoAte: null });
    const folha = lerPlanilhaCatalogo([
      ["ACÚSTICA", "ACU", "CARD"],
      ["ARQUITETURA", "ARQ", "CARD"],
    ]);
    const p = planejarImportacao(snap, 3, folha, { versoesExistentes: [1, 2, 3] });
    expect(p.erros).toEqual([]);
    const consequencia = p.itens.find((i) => i.grupo === "consequencias");
    expect(consequencia?.operacao).toMatchObject({ tipo: "encerrar-sigla", alvo: { tipo: "disciplina", id: "arq" }, sigla: "ACU" });
    expect(consequencia?.dependeDe).toHaveLength(1);
    const depois = simular(snap, 3, operacoesEscolhidas(p.itens, new Set()));
    expect(colisoes(depois, [3])).toEqual([]);
  });
});
