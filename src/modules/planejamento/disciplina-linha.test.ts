import { describe, expect, it } from "vitest";
import {
  disciplinaParaLinhaNova,
  divergenciasDeDisciplina,
  faseQueAcompanha,
  propagacaoDeDisciplina,
  type NoDisciplina,
} from "./disciplina-linha";

describe("disciplinaParaLinhaNova", () => {
  it("sem pai: nasce sem disciplina e sem fase", () => {
    expect(disciplinaParaLinhaNova(null)).toEqual({ disciplinaId: null, etapaId: null });
  });

  it("herda disciplina e fase do pai", () => {
    expect(disciplinaParaLinhaNova({ disciplinaId: "hid", etapaId: "bs" })).toEqual({ disciplinaId: "hid", etapaId: "bs" });
  });

  it("pai com fase mas sem disciplina: a fase não vai (fase exige disciplina)", () => {
    expect(disciplinaParaLinhaNova({ disciplinaId: null, etapaId: "bs" })).toEqual({ disciplinaId: null, etapaId: null });
  });
});

const no = (id: string, parentId: string | null, disciplinaId: string | null, etapaId: string | null = null): NoDisciplina => ({
  id,
  parentId,
  disciplinaId,
  etapaId,
});

describe("divergenciasDeDisciplina", () => {
  const arvore = [
    no("F", null, null, "bs"),
    no("H", "F", "hid", "bs"),
    no("M", "H", "hid"),
    no("V", "H", "ele"),
    no("G", "H", null),
    no("X", "G", null),
    no("Y", "G", "ele"),
    no("R", "F", "ele"),
  ];

  it("acusa a linha cuja disciplina difere da do ancestral mais próximo com disciplina", () => {
    expect(divergenciasDeDisciplina(arvore)).toEqual([
      { tarefaId: "V", atualId: "ele", esperadaId: "hid", etapaEsperadaId: "bs" },
      { tarefaId: "Y", atualId: "ele", esperadaId: "hid", etapaEsperadaId: "bs" },
    ]);
  });

  it("linha sem disciplina nunca é achado", () => {
    expect(divergenciasDeDisciplina(arvore).map((d) => d.tarefaId)).not.toContain("X");
  });

  it("linha sem ancestral com disciplina não diverge", () => {
    expect(divergenciasDeDisciplina(arvore).map((d) => d.tarefaId)).not.toContain("R");
  });

  it("ciclo de parentId não trava e não acusa", () => {
    expect(divergenciasDeDisciplina([no("A", "B", "x"), no("B", "A", "y")])).toEqual([]);
  });

  it("agrupamento (linha com filhas) nunca é achado: o conserto é mover o bloco, não trocar a disciplina dele", () => {
    // "Elétrica" recuada por engano para dentro de "Hidro": só o bloco estaria errado, e trocar a disciplina dele
    // arrastaria as folhas no clique seguinte.
    const nos: NoDisciplina[] = [
      no("H", null, "hid"),
      { ...no("E", "H", "ele"), ehResumo: true },
      no("E1", "E", "ele"),
    ];
    expect(divergenciasDeDisciplina(nos)).toEqual([]);
  });

  it("parentId para id ausente é tratado como raiz", () => {
    expect(divergenciasDeDisciplina([no("A", "fantasma", "x")])).toEqual([]);
  });
});

describe("faseQueAcompanha", () => {
  const fases = new Set(["bs", "ex"]);

  it("fica com a primeira fase que a disciplina tem cadastrada", () => {
    expect(faseQueAcompanha(["bs", "ex"], fases)).toBe("bs");
    expect(faseQueAcompanha(["pl", "ex"], fases)).toBe("ex");
  });

  it("ignora candidata nula e devolve null quando nenhuma serve", () => {
    expect(faseQueAcompanha([null, "bs"], fases)).toBe("bs");
    expect(faseQueAcompanha(["pl", null], fases)).toBeNull();
    expect(faseQueAcompanha(["bs"], new Set())).toBeNull();
  });
});

describe("propagacaoDeDisciplina", () => {
  const nova = { disciplinaId: "estr", etapaId: "bs" as string | null };
  const fasesDaNova = new Set(["bs"]);
  const arvore = (): NoDisciplina[] => [
    no("F", null, null),
    no("G", "F", "hid", "bs"),
    no("M", "G", "hid"),
    no("V", "G", "ele", "ex"),
    no("S", "G", null),
    no("SG", "G", "ele"),
    no("Y", "SG", "ele"),
    no("X", "F", "ele"),
  ];

  it("leva filhas, netas e subagrupamentos para a disciplina nova", () => {
    expect(propagacaoDeDisciplina(arvore(), "G", nova, fasesDaNova).map((m) => m.tarefaId)).toEqual(["M", "V", "S", "SG", "Y"]);
  });

  it("não toca linhas fora do agrupamento", () => {
    expect(propagacaoDeDisciplina(arvore(), "G", nova, fasesDaNova).map((m) => m.tarefaId)).not.toContain("X");
  });

  it("ignora quem já está na disciplina nova", () => {
    const nos = arvore().map((n) => (n.id === "M" ? { ...n, disciplinaId: "estr" } : n));
    expect(propagacaoDeDisciplina(nos, "G", nova, fasesDaNova).map((m) => m.tarefaId)).not.toContain("M");
  });

  it("inclui a linha que estava sem disciplina", () => {
    const s = propagacaoDeDisciplina(arvore(), "G", nova, fasesDaNova).find((m) => m.tarefaId === "S");
    expect(s).toEqual({ tarefaId: "S", atualId: null, etapaId: "bs" });
  });

  it("fase: mantém a própria se a nova disciplina a tem; senão a do agrupamento; senão nenhuma", () => {
    const porId = (m: ReturnType<typeof propagacaoDeDisciplina>, id: string) => m.find((x) => x.tarefaId === id);
    // V tem fase "ex", que a nova disciplina não tem: cai na do agrupamento.
    expect(porId(propagacaoDeDisciplina(arvore(), "G", nova, fasesDaNova), "V")?.etapaId).toBe("bs");
    // Sem fase no agrupamento, a que a nova disciplina não tem não serve: nenhuma.
    expect(porId(propagacaoDeDisciplina(arvore(), "G", { ...nova, etapaId: null }, fasesDaNova), "V")?.etapaId).toBeNull();
    // Linha com fase própria que a nova disciplina tem mantém a dela, mesmo com outra no agrupamento.
    const nos = arvore().map((n) => (n.id === "M" ? { ...n, etapaId: "bs" } : n));
    expect(porId(propagacaoDeDisciplina(nos, "G", { ...nova, etapaId: "ex" }, new Set(["bs", "ex"])), "M")?.etapaId).toBe("bs");
  });

  it("agrupamento sem descendentes devolve lista vazia", () => {
    expect(propagacaoDeDisciplina(arvore(), "X", nova, fasesDaNova)).toEqual([]);
  });

  it("ciclo de parentId e pai fora da lista não travam", () => {
    const nos = [no("G", null, "hid"), no("A", "B", "ele"), no("B", "A", "ele"), no("C", "fantasma", "ele")];
    expect(propagacaoDeDisciplina(nos, "G", nova, fasesDaNova)).toEqual([]);
  });

  it("ciclo alcançável a partir do agrupamento termina, não devolve o agrupamento e não repete ninguém", () => {
    // Agrupamento que aponta para si mesmo, com filha e neta.
    const proprio = [no("G", "G", "hid"), no("A", "G", "ele"), no("B", "A", "ele")];
    expect(propagacaoDeDisciplina(proprio, "G", nova, fasesDaNova).map((m) => m.tarefaId)).toEqual(["A", "B"]);
    // Ciclo que passa pelo agrupamento: G → A → B → G (o pai de G é B).
    const pelaRaiz = [no("G", "B", "hid"), no("A", "G", "ele"), no("B", "A", "ele"), no("C", "B", null)];
    const ids = propagacaoDeDisciplina(pelaRaiz, "G", nova, fasesDaNova).map((m) => m.tarefaId);
    expect(ids).toEqual(["A", "B", "C"]);
    expect(ids).not.toContain("G");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("devolve na ordem de entrada, não na ordem da busca", () => {
    // Y (neta) vem antes de M (filha) na entrada.
    const nos = [no("G", null, "hid"), no("Y", "SG", "ele"), no("SG", "G", "ele"), no("M", "G", "hid")];
    expect(propagacaoDeDisciplina(nos, "G", nova, fasesDaNova).map((m) => m.tarefaId)).toEqual(["Y", "SG", "M"]);
  });

  it("subagrupamento já na disciplina nova ainda leva as descendentes de outras disciplinas", () => {
    const nos = arvore().map((n) => (n.id === "SG" ? { ...n, disciplinaId: "estr" } : n));
    const ids = propagacaoDeDisciplina(nos, "G", nova, fasesDaNova).map((m) => m.tarefaId);
    expect(ids).not.toContain("SG");
    expect(ids).toContain("Y");
  });
});
