import { describe, expect, it } from "vitest";
import { parseChangelog } from "./changelog";

const FIXTURE = `# Changelog

Todas as mudanças relevantes do SenaHub.

## [1.13.0](https://github.com/SenaProjetos//compare/v1.12.0...v1.13.0) (2026-08-30)


### ✨ Funcionalidades

* **acessos:** Fase 1 — schema do cofre ([2dcba8c](https://github.com/SenaProjetos//commit/2dcba8c))
* **clientes:** importar dados por CNPJ ([174f947](https://github.com/x/commit/174f947))

### 🐛 Correções

* **ui:** símbolo escapava do campo
  em \`InputMoeda\` ([d57addd](https://github.com/x/commit/d57addd))


### [1.8.1](https://github.com/x/compare/v1.8.0...v1.8.1) (2026-08-09)


### 🐛 Correções

* correção sem escopo ([abc1234](https://github.com/x/commit/abc1234))

## 1.7.0 (2026-08-01)

### ✨ Funcionalidades

* **rh:** aprimora controle de horas (deadbeef)
* **comercial:** alerta de validade ([4cd1522](https://github.com/x/commit/4cd1522)), closes [#9](https://github.com/x/issues/9)

## [1.6.0](https://github.com/x/compare/v1.5.0...v1.6.0) (2026-07-24)
`;

describe("parseChangelog", () => {
  const versoes = parseChangelog(FIXTURE);

  it("ignora o preâmbulo e lê as versões na ordem do arquivo", () => {
    expect(versoes.map((v) => v.versao)).toEqual(["1.13.0", "1.8.1", "1.7.0"]);
  });

  it("lê patch em ### igual a minor em ##", () => {
    const patch = versoes.find((v) => v.versao === "1.8.1");
    expect(patch?.data).toBe("2026-08-09");
    expect(patch?.secoes[0].titulo).toBe("🐛 Correções");
    expect(patch?.secoes[0].itens[0]).toEqual({
      texto: "Correção sem escopo",
      escopo: null,
      hash: "abc1234",
    });
  });

  it("separa escopo, hash e limpa o markdown do texto", () => {
    const [funcs, fixes] = versoes[0].secoes;
    expect(funcs.itens[0]).toEqual({
      texto: "Fase 1 — schema do cofre",
      escopo: "acessos",
      hash: "2dcba8c",
    });
    expect(funcs.itens).toHaveLength(2);
    // Item quebrado em duas linhas volta como um item só, sem crases.
    expect(fixes.itens[0].texto).toBe("Símbolo escapava do campo em InputMoeda");
  });

  it("aceita cabeçalho sem link e hash sem link", () => {
    const v = versoes.find((x) => x.versao === "1.7.0");
    expect(v?.data).toBe("2026-08-01");
    expect(v?.secoes[0].itens[0].hash).toBe("deadbeef");
  });

  it("descarta a referência a issues no fim do item", () => {
    const v = versoes.find((x) => x.versao === "1.7.0");
    expect(v?.secoes[0].itens[1]).toEqual({
      texto: "Alerta de validade",
      escopo: "comercial",
      hash: "4cd1522",
    });
  });

  it("descarta versões sem itens visíveis", () => {
    expect(versoes.some((v) => v.versao === "1.6.0")).toBe(false);
  });

  it("não quebra com entrada vazia", () => {
    expect(parseChangelog("")).toEqual([]);
  });
});
