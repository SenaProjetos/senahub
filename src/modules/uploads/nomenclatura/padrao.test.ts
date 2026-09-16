import { describe, expect, it } from "vitest";
import {
  aplicarPadrao,
  compilarPadrao,
  ehModelo,
  interpretarModeloVisual,
  montarModelo,
  exemploNomeModelo,
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
