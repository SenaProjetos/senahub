import { describe, expect, it } from "vitest";

import {
  aplicarCondicoes,
  calcularStatusBriefing,
  condicaoAtendida,
  mesclarRespostasVisiveis,
  progressoObrigatorios,
  respostasVisiveis,
  type CampoBriefing,
  type SecaoBriefing,
} from "./briefing-schema";
import {
  adicionarOpcao,
  atualizarCampo,
  comOrigens,
  controladorasPossiveis,
  duplicarCampo,
  esquemaParaGravar,
  moverCampoParaSecao,
  normalizarCondicoes,
  removerCampo,
  removerOpcao,
  renomearOpcao,
  renomeiosDoRascunho,
  reordenarOpcoes,
} from "./modelo-editor";
import { migrarRespostas, problemaDosRenomeios, validarEsquema } from "./modelo-schema";

const campo = (chave: string, over: Partial<CampoBriefing> = {}): CampoBriefing => ({ chave, label: `Pergunta ${chave}`, tipo: "text", obrigatorio: false, ...over });

/** piscina (sim/não) → aquecimento (só se piscina = Sim) → detalhe (só se aquecimento = Solar) */
function esquema(): SecaoBriefing[] {
  return [
    {
      id: "s1",
      titulo: "Geral",
      campos: [
        campo("piscina", { tipo: "sim-nao", opcoes: ["Sim", "Não"] }),
        campo("aquecimento", { tipo: "radio", opcoes: ["Solar", "Elétrico", "Gás"], obrigatorio: true, condicao: { campo: "piscina", igual: ["Sim"] } }),
      ],
    },
    { id: "s2", titulo: "Detalhes", campos: [campo("detalhe", { tipo: "textarea", obrigatorio: true, condicao: { campo: "aquecimento", igual: ["Solar"] } })] },
  ];
}

describe("condicaoAtendida", () => {
  it("escolha única compara o texto; caixas, qualquer marcada; vazio nunca atende", () => {
    const c = { campo: "x", igual: ["A", "B"] };
    expect(condicaoAtendida(c, "A")).toBe(true);
    expect(condicaoAtendida(c, "C")).toBe(false);
    expect(condicaoAtendida(c, ["C", "B"])).toBe(true);
    expect(condicaoAtendida(c, [])).toBe(false);
    expect(condicaoAtendida(c, "")).toBe(false);
    expect(condicaoAtendida(c, undefined)).toBe(false);
  });
});

describe("aplicarCondicoes", () => {
  it("mostra a pergunta quando a resposta atende e esconde quando não", () => {
    const campos = (r: Record<string, unknown>) => aplicarCondicoes(esquema(), r).flatMap((s) => s.campos.map((c) => c.chave));
    expect(campos({})).toEqual(["piscina"]);
    expect(campos({ piscina: "Não" })).toEqual(["piscina"]);
    expect(campos({ piscina: "Sim" })).toEqual(["piscina", "aquecimento"]);
  });

  it("encadeia: a cadeia só abre se cada elo atende, e a seção sem pergunta some", () => {
    const abre = aplicarCondicoes(esquema(), { piscina: "Sim", aquecimento: "Solar" });
    expect(abre.map((s) => s.id)).toEqual(["s1", "s2"]);
    const fecha = aplicarCondicoes(esquema(), { piscina: "Não", aquecimento: "Solar" });
    // 'aquecimento' oculta (piscina = Não): 'detalhe' também, mesmo com a resposta Solar guardada.
    expect(fecha.map((s) => s.id)).toEqual(["s1"]);
  });

  it("controladora fora da lista (ocultada no projeto ou disciplina) esconde quem depende dela", () => {
    const semControladora = esquema().map((s) => ({ ...s, campos: s.campos.filter((c) => c.chave !== "piscina") }));
    expect(aplicarCondicoes(semControladora, { piscina: "Sim" }).flatMap((s) => s.campos)).toHaveLength(0);
  });
});

describe("status e progresso ignoram a pergunta condicional oculta", () => {
  it("obrigatória oculta não pesa", () => {
    expect(progressoObrigatorios({ piscina: "Não" }, esquema())).toEqual({ preenchidos: 0, total: 0 });
    expect(progressoObrigatorios({ piscina: "Sim" }, esquema())).toEqual({ preenchidos: 0, total: 1 });
    expect(calcularStatusBriefing({ piscina: "Sim" }, esquema())).toBe("nao_iniciado");
    expect(calcularStatusBriefing({ piscina: "Sim", aquecimento: "Elétrico" }, esquema())).toBe("completo");
  });
});

describe("envio e link público", () => {
  it("só grava pergunta que aparece, avaliando com as respostas do próprio envio", () => {
    const visiveis = esquema();
    const r = mesclarRespostasVisiveis({}, { piscina: "Sim", aquecimento: "Gás", detalhe: "x" }, visiveis);
    expect(r).toEqual({ piscina: "Sim", aquecimento: "Gás" }); // detalhe só abre com aquecimento = Solar
    const r2 = mesclarRespostasVisiveis({}, { aquecimento: "Gás" }, visiveis);
    expect(r2).toEqual({}); // sem 'piscina' respondida, 'aquecimento' está oculta
  });

  it("a resposta guardada de pergunta oculta não é apagada pelo envio", () => {
    const r = mesclarRespostasVisiveis({ piscina: "Sim", aquecimento: "Gás" }, { piscina: "Não" }, esquema());
    expect(r).toEqual({ piscina: "Não", aquecimento: "Gás" });
  });

  it("o link público devolve a resposta da condicional escondida (é do cliente; tela e servidor avaliam o mesmo)", () => {
    const r = respostasVisiveis({ piscina: "Não", aquecimento: "Gás", inventada: "x" }, esquema());
    expect(Object.keys(r).sort()).toEqual(["aquecimento", "piscina"]);
  });
});

describe("validação da condição no esquema", () => {
  it("esquema válido passa", () => {
    expect(validarEsquema(esquema()).ok).toBe(true);
  });

  it("recusa controladora depois, inexistente, de texto ou com resposta que não é opção", () => {
    const depois = esquema();
    depois[0].campos.reverse();
    expect(validarEsquema(depois)).toMatchObject({ ok: false, erro: expect.stringContaining("vir antes") });

    const inexistente = esquema();
    inexistente[0].campos[1].condicao = { campo: "nao-existe", igual: ["Sim"] };
    expect(validarEsquema(inexistente).ok).toBe(false);

    const deTexto = esquema();
    deTexto[0].campos[0] = campo("piscina", { tipo: "text" });
    expect(validarEsquema(deTexto)).toMatchObject({ ok: false, erro: expect.stringContaining("só pergunta de escolha") });

    const respostaFalsa = esquema();
    respostaFalsa[0].campos[1].condicao = { campo: "piscina", igual: ["Talvez"] };
    expect(validarEsquema(respostaFalsa)).toMatchObject({ ok: false, erro: expect.stringContaining("não é uma opção") });
  });

  it("recusa condição sem nenhuma resposta e dependência de si mesma", () => {
    const vazia = esquema();
    vazia[0].campos[1].condicao = { campo: "piscina", igual: [] };
    expect(validarEsquema(vazia).ok).toBe(false);
    const propria = esquema();
    propria[0].campos[1].condicao = { campo: "aquecimento", igual: ["Solar"] };
    expect(validarEsquema(propria).ok).toBe(false);
  });

  it("o campo 'opcoesOrigem' do editor não chega ao que é gravado", () => {
    const r = validarEsquema(comOrigens(esquema()));
    expect(r.ok && JSON.stringify(r.esquema)).not.toContain("opcoesOrigem");
  });
});

describe("editor: a condição acompanha as mudanças", () => {
  it("excluir a controladora tira a condição de quem dependia dela", () => {
    const e = removerCampo(esquema(), "piscina");
    expect(e[0].campos[0].condicao).toBeUndefined();
  });

  it("mover a controladora para depois da dependente tira a condição", () => {
    const e = moverCampoParaSecao(esquema(), "piscina", "s2");
    expect(e[0].campos[0].chave).toBe("aquecimento");
    expect(e[0].campos[0].condicao).toBeUndefined();
  });

  it("trocar a controladora para texto tira a condição", () => {
    const e = atualizarCampo(esquema(), "piscina", { tipo: "text" });
    expect(e[0].campos[1].condicao).toBeUndefined();
  });

  it("renomear a opção da controladora leva a condição junto, letra a letra", () => {
    let e = esquema();
    e = renomearOpcao(e, "aquecimento", 0, "Solar ");
    e = renomearOpcao(e, "aquecimento", 0, "Solar t");
    e = renomearOpcao(e, "aquecimento", 0, "Solar térmico");
    expect(e[1].campos[0].condicao).toEqual({ campo: "aquecimento", igual: ["Solar térmico"] });
    expect(validarEsquema(e).ok).toBe(true);
  });

  it("opção que passa pelo texto de outra não leva a condição dela", () => {
    let e = esquema();
    e[0].campos[1].opcoes = ["Solar", "Solares", "Gás"]; // a condição de "detalhe" é "Solar" (índice 0)
    e = renomearOpcao(e, "aquecimento", 1, "Solare");
    e = renomearOpcao(e, "aquecimento", 1, "Solar"); // igual à do índice 0 no meio da digitação
    e = renomearOpcao(e, "aquecimento", 1, "Solar2");
    expect(e[1].campos[0].condicao?.igual).toEqual(["Solar"]);
  });

  it("remover a única opção da condição tira a condição; remover outra a mantém e poda", () => {
    const e = esquema();
    e[1].campos[0].condicao = { campo: "aquecimento", igual: ["Solar", "Gás"] };
    const semGas = removerOpcao(e, "aquecimento", 2);
    expect(semGas[1].campos[0].condicao?.igual).toEqual(["Solar"]);
    const semSolar = removerOpcao(semGas, "aquecimento", 0);
    expect(semSolar[1].campos[0].condicao).toBeUndefined();
  });

  it("controladoras possíveis: só de escolha e só as de antes", () => {
    const e = esquema();
    expect(controladorasPossiveis(e, "detalhe").map((c) => c.chave)).toEqual(["piscina", "aquecimento"]);
    expect(controladorasPossiveis(e, "piscina")).toEqual([]);
    expect(controladorasPossiveis(e, "aquecimento").map((c) => c.chave)).toEqual(["piscina"]);
  });

  it("normalizarCondicoes não mexe no que está certo", () => {
    expect(normalizarCondicoes(esquema())).toEqual(esquema());
  });

  it("duplicar a pergunta mantém a condição e não carrega a origem das opções", () => {
    const e = duplicarCampo(comOrigens(esquema()), "aquecimento");
    const copia = e[0].campos[2];
    expect(copia.condicao).toEqual({ campo: "piscina", igual: ["Sim"] });
    expect(copia.opcoesOrigem).toBeUndefined();
  });
});

describe("renomear opção migra resposta", () => {
  it("o editor sabe de onde veio cada opção, mesmo depois de reordenar, adicionar e remover", () => {
    let e = comOrigens(esquema());
    e = renomearOpcao(e, "aquecimento", 0, "Solar térmico"); // Solar → Solar térmico
    e = reordenarOpcoes(e, "aquecimento", 0, 2); // Elétrico, Gás, Solar térmico
    e = adicionarOpcao(e, "aquecimento"); // nova (sem origem)
    e = renomearOpcao(e, "aquecimento", 0, "Elétrico (rede)"); // Elétrico → Elétrico (rede)
    e = removerOpcao(e, "aquecimento", 1); // tira Gás
    expect(e[0].campos[1].opcoes).toEqual(["Elétrico (rede)", "Solar térmico", "Opção 4"]);
    expect(renomeiosDoRascunho(e)).toEqual([
      { chave: "aquecimento", de: "Elétrico", para: "Elétrico (rede)" },
      { chave: "aquecimento", de: "Solar", para: "Solar térmico" },
    ]);
  });

  it("sem mudança de nome não há renomeio; opção nova e tipo trocado não geram", () => {
    expect(renomeiosDoRascunho(comOrigens(esquema()))).toEqual([]);
    const trocado = atualizarCampo(renomearOpcao(comOrigens(esquema()), "aquecimento", 0, "X"), "aquecimento", { tipo: "select" });
    expect(renomeiosDoRascunho(trocado)).toEqual([]);
  });

  it("opção com espaço no fim é aparada como o servidor grava (renomeio e condição incluídos)", () => {
    let e = comOrigens(esquema());
    e = renomearOpcao(e, "aquecimento", 0, "Solar ");
    expect(renomeiosDoRascunho(e)).toEqual([]);
    e = renomearOpcao(e, "aquecimento", 0, "Solar novo ");
    expect(renomeiosDoRascunho(e)).toEqual([{ chave: "aquecimento", de: "Solar", para: "Solar novo" }]);
    const gravar = esquemaParaGravar(e);
    expect(gravar[0].campos[1].opcoes?.[0]).toBe("Solar novo");
    expect(gravar[1].campos[0].condicao?.igual).toEqual(["Solar novo"]);
    expect(validarEsquema(gravar).ok).toBe(true);
  });

  it("esquemaParaGravar tira a origem", () => {
    expect(JSON.stringify(esquemaParaGravar(comOrigens(esquema())))).not.toContain("opcoesOrigem");
  });

  it("migrarRespostas troca escolha única e caixas, sem repetir, e a troca A↔B é simultânea", () => {
    const r = migrarRespostas(
      { aquecimento: "Solar", docs: ["Planta", "3D", "Layout"], outro: "Solar" },
      [
        { chave: "aquecimento", de: "Solar", para: "Solar térmico" },
        { chave: "docs", de: "3D", para: "Planta" },
      ],
    );
    expect(r.respostas).toEqual({ aquecimento: "Solar térmico", docs: ["Planta", "Layout"], outro: "Solar" });
    expect(r.alteradas).toBe(2);

    const troca = migrarRespostas({ q: "A" }, [
      { chave: "q", de: "A", para: "B" },
      { chave: "q", de: "B", para: "A" },
    ]);
    expect(troca.respostas).toEqual({ q: "B" });
  });

  it("migrarRespostas não mexe no que não bate", () => {
    const r = migrarRespostas({ q: "Z", w: true }, [{ chave: "q", de: "A", para: "B" }, { chave: "w", de: "A", para: "B" }]);
    expect(r).toEqual({ respostas: { q: "Z", w: true }, alteradas: 0 });
  });

  it("problemaDosRenomeios confere com o esquema novo", () => {
    const e = esquema();
    expect(problemaDosRenomeios([{ chave: "aquecimento", de: "Solar", para: "Elétrico" }], e)).toBeNull();
    expect(problemaDosRenomeios([{ chave: "aquecimento", de: "Solar", para: "Nada" }], e)).toMatch(/não confere/);
    expect(problemaDosRenomeios([{ chave: "aquecimento", de: "Solar", para: "Solar" }], e)).toMatch(/não confere/);
    expect(problemaDosRenomeios([{ chave: "piscina", de: "Sim", para: "Não" }], e)).toMatch(/não existe mais/); // sim/não é fixo
    expect(
      problemaDosRenomeios(
        [
          { chave: "aquecimento", de: "Solar", para: "Gás" },
          { chave: "aquecimento", de: "Solar", para: "Elétrico" },
        ],
        e,
      ),
    ).toMatch(/duas vezes/);
  });

  it("com o esquema antigo: 'de' tem de ter existido e ter saído; esquema ilegível não aceita renomeio", () => {
    const antes = esquema();
    const depois = esquema();
    depois[0].campos[1].opcoes = ["Solar térmico", "Elétrico", "Gás"];
    expect(problemaDosRenomeios([{ chave: "aquecimento", de: "Solar", para: "Solar térmico" }], depois, antes)).toBeNull();
    // 'de' que nunca existiu (pedido forjado)
    expect(problemaDosRenomeios([{ chave: "aquecimento", de: "Nuclear", para: "Solar térmico" }], depois, antes)).toMatch(/não confere/);
    // 'de' ainda existe no esquema novo (opção viva): não migra
    expect(problemaDosRenomeios([{ chave: "aquecimento", de: "Gás", para: "Solar térmico" }], depois, antes)).toMatch(/não confere/);
    expect(problemaDosRenomeios([{ chave: "aquecimento", de: "Solar", para: "Solar térmico" }], depois, null)).toMatch(/não confere/);
    // troca A↔B: cada 'de' continua no esquema novo, mas só porque o outro foi renomeado para ele
    const trocado = esquema();
    trocado[0].campos[1].opcoes = ["Elétrico", "Solar", "Gás"];
    expect(
      problemaDosRenomeios(
        [
          { chave: "aquecimento", de: "Solar", para: "Elétrico" },
          { chave: "aquecimento", de: "Elétrico", para: "Solar" },
        ],
        trocado,
        antes,
      ),
    ).toBeNull();
  });

  it("controladora com menos de duas opções não é oferecida", () => {
    const e = esquema();
    e[0].campos[1].opcoes = ["Solar"];
    expect(controladorasPossiveis(e, "detalhe").map((c) => c.chave)).toEqual(["piscina"]);
  });
});
