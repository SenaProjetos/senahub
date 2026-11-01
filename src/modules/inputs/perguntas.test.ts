import { describe, expect, it } from "vitest";
import { perguntasDoPadraoParaCriar, type TemplatePergunta } from "./perguntas";
import { itensDaPergunta } from "./acoes";

const t = (id: string, disciplina: string | null, pergunta: string): TemplatePergunta => ({ id, disciplina, pergunta, ordem: 0 });

describe("perguntas padrão do projeto", () => {
  const templates = [t("g1", null, "Prazo?"), t("e1", "Estrutural", "Fundação?"), t("h1", "Hidrossanitário", "Poço?")];

  it("cria só as gerais e as das disciplinas do projeto", () => {
    expect(perguntasDoPadraoParaCriar(templates, [], ["Estrutural"]).map((x) => x.id)).toEqual(["g1", "e1"]);
  });

  it("não recria a que veio do padrão, mesmo editada ou removida (templateId)", () => {
    const existentes = [{ templateId: "g1", disciplina: null, pergunta: "Prazo de entrega da obra?" }];
    expect(perguntasDoPadraoParaCriar(templates, existentes, []).map((x) => x.id)).toEqual([]);
  });

  it("linha antiga sem templateId casa pelo texto e disciplina", () => {
    const existentes = [{ templateId: null, disciplina: "Estrutural", pergunta: "Fundação?" }];
    expect(perguntasDoPadraoParaCriar(templates, existentes, ["Estrutural"]).map((x) => x.id)).toEqual(["g1"]);
  });

  it("mesmo texto em outra disciplina não conta como existente", () => {
    const existentes = [{ templateId: null, disciplina: null, pergunta: "Fundação?" }];
    expect(perguntasDoPadraoParaCriar(templates, existentes, ["Estrutural"]).map((x) => x.id)).toEqual(["g1", "e1"]);
  });
});

describe("ações da pergunta extra", () => {
  it("sem permissão de gerir, nenhuma ação (linha sem menu)", () => {
    expect(itensDaPergunta({ resposta: "" }, false)).toEqual([]);
  });

  it("editar e remover; remover é destrutivo e confirma", () => {
    const itens = itensDaPergunta({ resposta: "sim" }, true);
    expect(itens.map((i) => i.id)).toEqual(["editar", "s1", "remover"]);
    const remover = itens.find((i) => i.id === "remover");
    expect(remover && remover.tipo === "acao" && remover.variant === "destructive" && remover.confirmar).toBeTruthy();
  });
});
