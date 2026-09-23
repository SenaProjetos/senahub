import { describe, expect, it } from "vitest";
import {
  aplicarPadrao,
  compilarPadrao,
  ehModelo,
  interpretarModeloVisual,
  montarModelo,
  exemploNomeModelo,
  montarNome,
  MODELO_PADRAO_ORIGINAL,
  type BlocoModelo,
} from "./padrao";

describe("ehModelo", () => {
  it("campo entre chaves é modelo; quantificador de regex não é", () => {
    expect(ehModelo("{proj}-{disc}-{fase}-{nº}-{tipo}")).toBe(true);
    expect(ehModelo("^[A-Z]{3}-\\d{4}$")).toBe(false);
  });
});

describe("compilarPadrao — modelo", () => {
  // Os dois padrões cadastrados em produção em 2026-09-15.
  const global = compilarPadrao("{proj}-{disc}-{fase}-{nº}-{tipo}");
  const comRevisao = compilarPadrao("{proj}-{disc}-{fase}-{nº}-{tipo}-{Rnn}");

  it("lê os campos do nome", () => {
    expect(aplicarPadrao("260020-EST-EX-4000-DET", global!)).toEqual({
      proj: "260020",
      disc: "EST",
      fase: "EX",
      num: "4000",
      tipo: "DET",
    });
  });

  it("exige o que o modelo exige e aceita o que ele permite", () => {
    expect(aplicarPadrao("260020-EST-EX-4000-DET", comRevisao!)).toBeNull();
    expect(aplicarPadrao("260020-EST-EX-4000-DET-R00", comRevisao!)?.rev).toBe("R00");
  });

  // O padrão global de produção não tem campo de revisão, mas a família mais comum do acervo
  // termina em `-R00` — e é o próprio `codigoPrancha` que acrescenta esse sufixo.
  it("modelo sem campo de revisão ainda casa nome COM revisão (sem extrair)", () => {
    expect(aplicarPadrao("260020-EST-EX-4000-DET-R00", global!)).toEqual({
      proj: "260020",
      disc: "EST",
      fase: "EX",
      num: "4000",
      tipo: "DET",
    });
    expect(aplicarPadrao("260020-EST-EX-4000-DET-RV3", global!)).not.toBeNull();
    // Sufixo que não é revisão continua fora do padrão.
    expect(aplicarPadrao("260020-EST-EX-4000-DET-XYZ", global!)).toBeNull();
  });

  it("trecho entre colchetes é opcional", () => {
    const p = compilarPadrao("{proj}-{disc}-{fase}-{nº}-{tipo}[-{Rnn}]")!;
    expect(aplicarPadrao("260020-EST-EX-4000-DET", p)).toMatchObject({ tipo: "DET" });
    expect(aplicarPadrao("260020-EST-EX-4000-DET-R02", p)?.rev).toBe("R02");
  });

  it("aceita underscore, subprojeto e o R fora do campo", () => {
    const p = compilarPadrao("{proj}_{disc}_{fase}_{tipo}_{nº}_R{rev}")!;
    expect(aplicarPadrao("26019_EST_EX_DTC_4003_R00", p)).toMatchObject({ disc: "EST", tipo: "DTC", num: "4003", rev: "00" });
    const comSub = compilarPadrao("{proj}-{disc}-{fase}-{nº}-{tipo}")!;
    expect(aplicarPadrao("26001.1-EST-EX-4001-DTC", comSub)?.proj).toBe("26001.1");
  });

  it("campo desconhecido no modelo ainda valida, só não extrai", () => {
    const p = compilarPadrao("{proj}-{cliente}-{disc}-{fase}")!;
    expect(p.campos).not.toContain("cliente");
    expect(aplicarPadrao("260020-ACME-EST-EX", p)).toEqual({ proj: "260020", disc: "EST", fase: "EX" });
  });

  it("não casa nome fora do modelo", () => {
    expect(aplicarPadrao("planta qualquer", global!)).toBeNull();
  });
});

describe("compilarPadrao — regex", () => {
  it("regex sem grupo nomeado só valida", () => {
    const p = compilarPadrao("^[A-Z]{3}-\\d{4}$")!;
    expect(p.extrai).toBe(false);
    expect(aplicarPadrao("EST-4001", p)).toEqual({});
    expect(aplicarPadrao("est-4001", p)).toBeNull();
  });

  it("regex com grupo nomeado extrai", () => {
    const p = compilarPadrao("^(?<proj>\\d{6})-(?<disc>[A-Z]{3})-(?<fase>[A-Z]{2})$")!;
    expect(p.extrai).toBe(true);
    expect(aplicarPadrao("260020-EST-EX", p)).toEqual({ proj: "260020", disc: "EST", fase: "EX" });
  });

  it("regex inválida não compila (e não vira alerta para ninguém)", () => {
    expect(compilarPadrao("[")).toBeNull();
    expect(compilarPadrao("   ")).toBeNull();
    expect(compilarPadrao(null)).toBeNull();
  });
});

describe("interpretarModeloVisual / montarModelo (F5 — editor visual)", () => {
  it("reconhece o padrão global de produção", () => {
    const v = interpretarModeloVisual("{proj}-{disc}-{fase}-{nº}-{tipo}");
    expect(v).toEqual({
      separador: "-",
      blocos: [
        { campo: "proj", opcional: false },
        { campo: "disc", opcional: false },
        { campo: "fase", opcional: false },
        { campo: "num", opcional: false },
        { campo: "tipo", opcional: false },
      ],
    });
  });

  it("reconhece o bloco de revisão opcional entre colchetes", () => {
    const v = interpretarModeloVisual("{proj}-{disc}-{fase}-{nº}-{tipo}[-{Rnn}]");
    expect(v?.blocos.at(-1)).toEqual({ campo: "rev", opcional: true });
  });

  it("NÃO reconhece a escrita R{rev} — o R quebra o separador único (cai no modo avançado)", () => {
    expect(interpretarModeloVisual("{proj}-{disc}-{fase}-{tipo}-{nº}-R{rev}")).toBeNull();
  });

  it("não reconhece campo repetido nem separador inconsistente", () => {
    expect(interpretarModeloVisual("{proj}-{proj}-{disc}")).toBeNull();
    expect(interpretarModeloVisual("{proj}-{disc}_{fase}")).toBeNull();
  });

  it("não reconhece regex legada (sem chaves) nem string vazia", () => {
    expect(interpretarModeloVisual("^[A-Z]{3}-\\d{4}$")).toBeNull();
    expect(interpretarModeloVisual("")).toBeNull();
  });

  it("monta sempre a escrita canônica (Rnn), mesmo que nunca tenha sido lida assim", () => {
    const blocos: BlocoModelo[] = [
      { campo: "proj", opcional: false },
      { campo: "disc", opcional: false },
      { campo: "rev", opcional: true },
    ];
    expect(montarModelo(blocos, "-")).toBe("{proj}-{disc}[-{Rnn}]");
  });

  it("bloco opcional em primeiro lugar não carrega separador (não há o que separar)", () => {
    expect(montarModelo([{ campo: "proj", opcional: true }], "-")).toBe("[{proj}]");
  });

  it("ida e volta: montar → interpretar devolve os mesmos blocos e separador", () => {
    const blocos: BlocoModelo[] = [
      { campo: "tipo", opcional: false },
      { campo: "num", opcional: false },
      { campo: "rev", opcional: true },
    ];
    const modelo = montarModelo(blocos, "_");
    expect(interpretarModeloVisual(modelo)).toEqual({ blocos, separador: "_" });
  });

  it("prévia junta os valores de exemplo na ordem escolhida", () => {
    const blocos: BlocoModelo[] = [
      { campo: "tipo", opcional: false },
      { campo: "num", opcional: false },
    ];
    expect(exemploNomeModelo(blocos, "_")).toBe("DET_4001");
  });
});

describe("texto fixo no editor visual (padrão v2)", () => {
  const V2 = "{proj}-SENA-{disc}-{fase}-{num}-{tipo}";

  it("lê o texto entre separadores como bloco fixo e volta à mesma escrita", () => {
    const visual = interpretarModeloVisual(V2);
    expect(visual).toEqual({
      separador: "-",
      blocos: [
        { campo: "proj", opcional: false },
        { campo: "texto", texto: "SENA", opcional: false },
        { campo: "disc", opcional: false },
        { campo: "fase", opcional: false },
        { campo: "num", opcional: false },
        { campo: "tipo", opcional: false },
      ],
    });
    expect(montarModelo(visual!.blocos, visual!.separador)).toBe(V2);
    expect(exemploNomeModelo(visual!.blocos, visual!.separador)).toBe("260020-SENA-EST-EX-4001-DET");
  });

  it("texto fixo no começo, no fim e antes de opcional", () => {
    expect(interpretarModeloVisual("SENA-{proj}-{disc}")?.blocos[0]).toEqual({ campo: "texto", texto: "SENA", opcional: false });
    expect(interpretarModeloVisual("{proj}-{disc}-FIM")?.blocos.at(-1)).toEqual({ campo: "texto", texto: "FIM", opcional: false });
    const comOpcional = interpretarModeloVisual("{proj}-SENA[-{Rnn}]");
    expect(comOpcional?.blocos.map((b) => b.campo)).toEqual(["proj", "texto", "rev"]);
    expect(montarModelo(comOpcional!.blocos, "-")).toBe("{proj}-SENA[-{Rnn}]");
  });

  it("modelo sem os antigos textos fixos continua igual", () => {
    expect(interpretarModeloVisual("{proj}-{disc}-{fase}-{nº}-{tipo}[-{Rnn}]")?.blocos).toHaveLength(6);
  });

  it("o compilador casa o nome real do padrão v2", () => {
    const c = compilarPadrao(V2)!;
    expect(aplicarPadrao("260010-SENA-AGF-BAS-001-PLB", c)).toEqual({
      proj: "260010",
      disc: "AGF",
      fase: "BAS",
      num: "001",
      tipo: "PLB",
    });
    expect(c.regex.test("260010-AGF-BAS-001-PLB")).toBe(false);
  });

  it("texto colado no campo ou sem separador cai no modo avançado", () => {
    expect(interpretarModeloVisual("{proj}SENA{disc}")).toBeNull();
    expect(interpretarModeloVisual("{proj}-SE NA-{disc}")).toBeNull();
  });
});

describe("montarNome", () => {
  it("padrão v2: texto fixo, sub no lugar da disciplina e número com 3 dígitos", () => {
    expect(
      montarNome("{proj}-SENA-{disc}-{fase}-{num}-{tipo}", { proj: "260010", disc: "AGF", fase: "BAS", num: 2, tipo: "PLB" }, { larguraNumero: 3 }),
    ).toBe("260010-SENA-AGF-BAS-002-PLB");
  });

  it("padrão v1 (modelo original, 4 dígitos) dá o mesmo que o codigoPrancha antigo", () => {
    expect(montarNome(MODELO_PADRAO_ORIGINAL, { proj: "260018", disc: "EST", fase: "EX", num: 12, tipo: "DET" }, { larguraNumero: 4 })).toBe(
      "260018-EST-EX-0012-DET",
    );
    expect(montarNome(null, { proj: "260018", disc: "EST", fase: "EX", num: 4012, tipo: "DET", rev: 3 }, { larguraNumero: 4 })).toBe(
      "260018-EST-EX-4012-DET-R03",
    );
  });

  it("regex legada ou campo desconhecido: cai no modelo original", () => {
    const valores = { proj: "260018", disc: "EST", fase: "EX", num: 1, tipo: "DET" };
    expect(montarNome("^\d{6}-[A-Z]+$", valores, { larguraNumero: 4 })).toBe("260018-EST-EX-0001-DET");
    expect(montarNome("{proj}-{bloco}", valores, { larguraNumero: 4 })).toBe("260018-EST-EX-0001-DET");
  });

  it("trecho opcional sai inteiro sem valor; campo obrigatório vazio vira ???", () => {
    const modelo = "{proj}-{disc}-{fase}-{num}-{tipo}[-{Rnn}]";
    expect(montarNome(modelo, { proj: "1", disc: "A", fase: "B", num: 1, tipo: "C" }, { larguraNumero: 3 })).toBe("1-A-B-001-C");
    expect(montarNome(modelo, { proj: "1", disc: "A", fase: "B", num: 1, tipo: "C", rev: 2 }, { larguraNumero: 3 })).toBe("1-A-B-001-C-R02");
    expect(montarNome(modelo, { proj: "1", disc: null, fase: "B", num: 1, tipo: "C" }, { larguraNumero: 3 })).toBe("1-???-B-001-C");
  });

  it("o nome montado casa com o próprio modelo", () => {
    const modelo = "{proj}-SENA-{disc}-{fase}-{num}-{tipo}";
    const nome = montarNome(modelo, { proj: "260010.1", disc: "ESG", fase: "EXE", num: 7, tipo: "ISO" }, { larguraNumero: 3 });
    expect(compilarPadrao(modelo)!.regex.test(nome)).toBe(true);
  });
});
