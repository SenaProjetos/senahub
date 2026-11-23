import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lerAnotacoes, normalizarNome, sugerirTipoEResponsavel, type Candidatos } from "./leitura-gemini";

const amostra = (nome: string) => readFileSync(join(__dirname, "__amostras__", nome), "utf8");

describe("atas — leitura das anotações do Gemini", () => {
  it("formato novo: decisões e etapas com responsável entre colchetes", () => {
    const a = lerAnotacoes(amostra("formato-novo.md"));
    expect(a.reconhecido).toBe(true);
    expect(a.decisoes).toHaveLength(3);
    expect(a.decisoes[0]).toEqual({
      titulo: "Telha termoacústica na cobertura",
      descricao: "A cobertura usará telha termoacústica com inclinação de 10%.",
    });
    expect(a.etapas).toHaveLength(4);
    expect(a.etapas[0]).toEqual({
      responsavelBruto: "SENA Engenharia",
      titulo: "Revisar fachada",
      descricao: "Atualizar as pranchas de fachada com o novo acabamento. Enviar a revisão para o cliente.",
    });
    expect(a.etapas[1].responsavelBruto).toBe("Joana Prado");
    expect(a.resumo).toContain("Alinhamento do projeto executivo");
    expect(a.resumo).not.toContain("**");
    expect(a.resumo).not.toContain("Alinhada");
    expect(JSON.stringify(a)).not.toContain("\\[");
  });

  it("formato novo em .txt (sem marcação)", () => {
    const a = lerAnotacoes(amostra("formato-novo.txt"));
    expect(a.reconhecido).toBe(true);
    expect(a.decisoes).toHaveLength(0);
    expect(a.etapas.map((e) => e.responsavelBruto)).toEqual(["SENA Engenharia", "Joana Prado", "O grupo"]);
    expect(a.etapas[1].titulo).toBe("Enviar levantamento topográfico");
    expect(a.detalhes).toContain("Cobertura");
    expect(a.detalhes).not.toContain("____");
  });

  it("formato antigo: próximas etapas sugeridas em frase 'Fulano vai'", () => {
    const a = lerAnotacoes(amostra("formato-antigo.txt"));
    expect(a.reconhecido).toBe(true);
    expect(a.etapas).toEqual([
      { responsavelBruto: "Paulo Reis", titulo: "Paulo Reis vai revisar o anteprojeto com o novo programa de necessidades.", descricao: null },
      { responsavelBruto: "Joana Prado", titulo: "Joana Prado vai enviar o programa de necessidades atualizado até sexta-feira.", descricao: null },
    ]);
    expect(a.resumo).toContain("Ficou combinado");
  });

  it("rodapé, links e marcações de tempo somem", () => {
    const tudo = JSON.stringify(lerAnotacoes(amostra("formato-novo.md")));
    expect(tudo).not.toContain("Revise as anotações");
    expect(tudo).not.toContain("Como está a qualidade");
    expect(tudo).not.toContain("http");
    expect(tudo).not.toContain("00:03:12");
    const antigo = JSON.stringify(lerAnotacoes(amostra("formato-antigo.txt")));
    expect(antigo).not.toContain("Envie feedback");
    expect(antigo).not.toContain("00:10:04");
  });

  it("cabeçalho: título e data", () => {
    const antigo = lerAnotacoes(amostra("formato-antigo.txt"));
    expect(antigo.titulo).toBe("Reunião - Clube Exemplo");
    expect(antigo.data).toBe("2026-01-19");
    const novo = lerAnotacoes(amostra("formato-novo.md"));
    expect(novo.data).toBe("2026-11-04");
    expect(novo.titulo).toBeNull();
    expect(lerAnotacoes("Reunião em 8 de out. de 2026 às 17:29 GMT-03:00\nResumo\nx").data).toBe("2026-10-08");
  });

  it("texto que não é do Gemini vira só resumo, sem itens, reconhecido false", () => {
    const texto = "Oi pessoal,\nsegue o combinado de hoje:\n- trocar o piso\n- mandar a planta";
    const a = lerAnotacoes(texto);
    expect(a.reconhecido).toBe(false);
    expect(a.decisoes).toEqual([]);
    expect(a.etapas).toEqual([]);
    expect(a.resumo).toContain("trocar o piso");
  });

  it("texto antes da primeira seção não se perde (só o cabeçalho do Gemini sai)", () => {
    const a = lerAnotacoes("nov. 4, 2026\nReunião em 4 de nov. de 2026 às 14:10\nRegistros da reunião Transcrição\nPauta: cobertura e prazos.\nResumo\nTudo certo.");
    expect(a.resumo).toContain("Pauta: cobertura e prazos.");
    expect(a.resumo).toContain("Tudo certo.");
    expect(a.resumo).not.toContain("Registros da reunião");
    expect(a.resumo).not.toContain("Reunião em 4 de nov");
  });

  it("linha sem marcador dentro de Decisões vira decisão (não some)", () => {
    const a = lerAnotacoes("Decisões\nPiso porcelanato na varanda\n- Telha termoacústica\nResumo\nx");
    expect(a.decisoes.map((d) => d.titulo)).toEqual(["Piso porcelanato na varanda", "Telha termoacústica"]);
  });

  it("sugestão: membro, conta do cliente, nome do cliente, SENA Engenharia e primeiro nome ambíguo", () => {
    const c: Candidatos = {
      membros: [
        { id: "u1", nome: "Carlos Mendes" },
        { id: "u2", nome: "Paulo Reis" },
        { id: "u3", nome: "Paulo Souza" },
      ],
      contas: [{ nome: "Joana Prado" }],
      cliente: "Construtora Exemplo",
    };
    expect(sugerirTipoEResponsavel("Carlos Mendes", c)).toEqual({ tipo: "tarefa_equipe", responsavelId: "u1" });
    expect(sugerirTipoEResponsavel("carlos", c)).toEqual({ tipo: "tarefa_equipe", responsavelId: "u1" });
    expect(sugerirTipoEResponsavel("Paulo", c)).toEqual({ tipo: "tarefa_equipe", responsavelId: null });
    expect(sugerirTipoEResponsavel("Joana Prado", c)).toEqual({ tipo: "pendencia_cliente", responsavelId: null });
    expect(sugerirTipoEResponsavel("Construtora Exemplo", c)).toEqual({ tipo: "pendencia_cliente", responsavelId: null });
    expect(sugerirTipoEResponsavel("SENA Engenharia", c)).toEqual({ tipo: "tarefa_equipe", responsavelId: null });
    expect(sugerirTipoEResponsavel("O grupo", c)).toEqual({ tipo: "tarefa_equipe", responsavelId: null });
    expect(sugerirTipoEResponsavel(null, c)).toEqual({ tipo: "tarefa_equipe", responsavelId: null });
  });

  it("normalizarNome tira acento, caixa e espaços duplos", () => {
    expect(normalizarNome("  JOÃO   Ávila ")).toBe("joao avila");
  });
});
