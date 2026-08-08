import { describe, expect, it } from "vitest";
import {
  enviaveis,
  mencionadosNovos,
  pesoSeveridade,
  proximoNumero,
  resolverMencionados,
  rotuloItemPendencia,
  SEVERIDADES,
  SEVERIDADE_LABEL,
  temImpeditivoAberto,
  TIPOS_PENDENCIA,
  TIPO_PENDENCIA_LABEL,
} from "@/modules/projetos/pendencias/helpers";

describe("rotuloItemPendencia", () => {
  it("formata número, página e texto", () => {
    expect(rotuloItemPendencia({ numero: 3, pagina: 2, texto: "Cota ausente" })).toBe(
      "#3 (pág. 2) — Cota ausente",
    );
  });
});

describe("proximoNumero", () => {
  it("começa em 1 quando não há pendências", () => {
    expect(proximoNumero([])).toBe(1);
  });
  it("é max+1, ignorando ordem/lacunas", () => {
    expect(proximoNumero([1, 2, 5])).toBe(6);
    expect(proximoNumero([3, 1, 2])).toBe(4);
  });
});

describe("enviaveis", () => {
  const base = { status: "aberta", tarefaId: null as string | null };
  it("inclui só abertas sem tarefa", () => {
    const lista = [
      { ...base },
      { status: "aberta", tarefaId: "t1" },
      { status: "resolvida", tarefaId: null },
      { status: "fechada", tarefaId: null },
    ];
    expect(enviaveis(lista)).toHaveLength(1);
  });
  it("vazio quando nada é enviável", () => {
    expect(enviaveis([{ status: "fechada", tarefaId: null }])).toHaveLength(0);
  });
});

describe("resolverMencionados", () => {
  const candidatos = [
    { userId: "u1", nome: "João Silva" },
    { userId: "u2", nome: "Maria Conceição" },
  ];

  it("casa pelo primeiro nome, case-insensitive", () => {
    expect(resolverMencionados("confere @joão a cota", candidatos)).toEqual([candidatos[0]]);
  });

  it("casa nome acentuado (primeiro nome do candidato)", () => {
    const comAcento = [{ userId: "u3", nome: "Conceição Duarte" }];
    expect(resolverMencionados("oi @Conceição", comAcento)).toEqual(comAcento);
  });

  it("várias menções distintas, sem duplicar", () => {
    const r = resolverMencionados("@João e @Maria e @joão de novo", candidatos);
    expect(r).toHaveLength(2);
  });

  it("ignora quem não é candidato (não recebe notificação daquele apontamento)", () => {
    expect(resolverMencionados("oi @Pedro", candidatos)).toEqual([]);
  });

  it("texto sem @ não casa nada", () => {
    expect(resolverMencionados("sem menção nenhuma aqui", candidatos)).toEqual([]);
  });
});

describe("mencionadosNovos", () => {
  const candidatos = [
    { userId: "u1", nome: "João Silva" },
    { userId: "u2", nome: "Maria Conceição" },
  ];

  it("só quem foi ADICIONADO na edição", () => {
    const r = mencionadosNovos("oi @João", "oi @João e @Maria", candidatos);
    expect(r).toEqual([candidatos[1]]);
  });

  it("vazio quando a menção já existia antes (evita renotificar)", () => {
    expect(mencionadosNovos("oi @João", "oi @João, tudo certo", candidatos)).toEqual([]);
  });

  it("vazio quando uma menção é removida (não é 'nova')", () => {
    expect(mencionadosNovos("oi @João e @Maria", "oi @João", candidatos)).toEqual([]);
  });
});

describe("catálogo de classificação (item 11)", () => {
  it("toda severidade e todo tipo têm rótulo pt-BR", () => {
    for (const s of SEVERIDADES) expect(SEVERIDADE_LABEL[s]).toBeTruthy();
    for (const t of TIPOS_PENDENCIA) expect(TIPO_PENDENCIA_LABEL[t]).toBeTruthy();
  });
  it("impeditivo é o topo da escala", () => {
    expect(SEVERIDADES[0]).toBe("impeditivo");
  });
});

describe("pesoSeveridade", () => {
  it("ordena do mais grave pro menos grave", () => {
    expect(pesoSeveridade("impeditivo")).toBeLessThan(pesoSeveridade("alta"));
    expect(pesoSeveridade("alta")).toBeLessThan(pesoSeveridade("media"));
    expect(pesoSeveridade("media")).toBeLessThan(pesoSeveridade("baixa"));
  });
  it("não classificado vai pro FIM, não pro topo (null não é 'pouco grave')", () => {
    expect(pesoSeveridade(null)).toBeGreaterThan(pesoSeveridade("baixa"));
    expect(pesoSeveridade(undefined)).toBeGreaterThan(pesoSeveridade("baixa"));
  });
  it("valor desconhecido cai no mesmo balde do não classificado", () => {
    expect(pesoSeveridade("catastrofico")).toBe(pesoSeveridade(null));
  });
});

describe("temImpeditivoAberto (base do item 19)", () => {
  it("true só com impeditivo ABERTO", () => {
    expect(temImpeditivoAberto([{ status: "aberta", severidade: "impeditivo" }])).toBe(true);
  });
  it("impeditivo já fechado/resolvido/descartado não trava", () => {
    expect(
      temImpeditivoAberto([
        { status: "fechada", severidade: "impeditivo" },
        { status: "resolvida", severidade: "impeditivo" },
        { status: "descartada", severidade: "impeditivo" },
      ]),
    ).toBe(false);
  });
  it("aberto de severidade menor (ou sem severidade) não trava", () => {
    expect(
      temImpeditivoAberto([
        { status: "aberta", severidade: "alta" },
        { status: "aberta", severidade: null },
        { status: "aberta" },
      ]),
    ).toBe(false);
  });
  it("lista vazia não trava", () => {
    expect(temImpeditivoAberto([])).toBe(false);
  });
});
