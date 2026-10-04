// src/modules/coordenacao/federado/regras.test.ts
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TAMANHO_MAX_IFC } from "@/modules/coordenacao/conversao-estado";
import {
  LIMITE_ENTRADA_FEDERADO,
  MOTIVO_ARQUIVO_SUMIU, MOTIVO_CABECALHO, MOTIVO_NAO_CONVERTIDO, MOTIVO_POUCOS,
  avaliarSelecao, conflitoEntreAnalises, familiaDoSchema, lerSaidaDoFilho, rotuloUnidade, type CandidatoFederado,
} from "./regras";

const SRC = path.resolve(__dirname, "../../..");

/** Arquivo .ts/.tsx de um import local (`@/…` ou relativo); null para pacote externo. */
function resolver(de: string, alvo: string): string | null {
  const base = alvo.startsWith("@/") ? path.join(SRC, alvo.slice(2)) : alvo.startsWith(".") ? path.resolve(path.dirname(de), alvo) : null;
  if (!base) return null;
  for (const c of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) if (existsSync(c)) return c;
  return null;
}

/** Imports `node:*` (ou fs/path/child_process crus) alcançáveis a partir do arquivo, com o caminho até eles. */
function modulosDeNodeAlcancaveis(inicio: string): string[] {
  const vistos = new Set<string>();
  const achados: string[] = [];
  const visitar = (arq: string, trilha: string[]) => {
    if (vistos.has(arq)) return;
    vistos.add(arq);
    const src = readFileSync(arq, "utf8");
    for (const m of src.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)) {
      const alvo = m[1];
      if (/^node:|^(fs|path|child_process|crypto|os)$/.test(alvo)) achados.push([...trilha, path.relative(SRC, arq), alvo].join(" → "));
      const prox = resolver(arq, alvo);
      if (prox) visitar(prox, [...trilha, path.relative(SRC, arq)]);
    }
  };
  visitar(inicio, []);
  return achados;
}

describe("limite e fronteira do navegador", () => {
  it("o limite da junção é o mesmo do conversor", () => {
    expect(LIMITE_ENTRADA_FEDERADO).toBe(TAMANHO_MAX_IFC);
  });

  // O diálogo de exportar e a pasta da aba Arquivos rodam no navegador: um `node:` alcançável por eles quebra a
  // tela no webpack do dev:server (aconteceu: regras.ts importava conversao-estado.ts, que importa node:path).
  it.each(["regras.ts", "acoes.ts"])("%s não alcança nenhum módulo do Node", (arq) => {
    expect(modulosDeNodeAlcancaveis(path.join(__dirname, arq))).toEqual([]);
  });
});

const GB = 1024 ** 3;
const c = (modeloId: string, o: Partial<CandidatoFederado> = {}): CandidatoFederado => ({
  modeloId, nome: `${modeloId}.ifc`, grupo: "Estrutural", revisao: "R00", tamanho: 1000,
  convertido: true, arquivoExiste: true, schema: "IFC4", unidade: "MILLI METRE", ...o,
});

describe("familiaDoSchema / rotuloUnidade", () => {
  it("agrupa variantes do schema", () => {
    expect(familiaDoSchema("IFC4X3_ADD2")).toBe("IFC4X3");
    expect(familiaDoSchema("ifc4")).toBe("IFC4");
    expect(familiaDoSchema("IFC2X3")).toBe("IFC2X3");
    expect(familiaDoSchema("IFC5")).toBeNull();
    expect(familiaDoSchema(null)).toBeNull();
  });
  it("unidade por extenso", () => {
    expect(rotuloUnidade("MILLI METRE")).toBe("milímetros");
    expect(rotuloUnidade("METRE")).toBe("metros");
    expect(rotuloUnidade("FOOT")).toBe("pés");
    expect(rotuloUnidade(null)).toBe("unidade não declarada");
  });
});

describe("avaliarSelecao", () => {
  it("motivos intrínsecos valem marcado ou não", () => {
    const r = avaliarSelecao(
      [c("a", { convertido: false }), c("b", { arquivoExiste: false }), c("d", { schema: null }), c("e")],
      [],
    );
    expect(r.motivos).toEqual({ a: MOTIVO_NAO_CONVERTIDO, b: MOTIVO_ARQUIVO_SUMIU, d: MOTIVO_CABECALHO, e: null });
  });

  it("o primeiro marcado válido dita schema e unidade", () => {
    const r = avaliarSelecao(
      [c("a"), c("b", { schema: "IFC2X3" }), c("d", { unidade: "METRE" }), c("e", { unidade: undefined })],
      ["a", "b", "d", "e"],
    );
    expect(r.motivos.b).toBe("IFC2X3 — os marcados são IFC4. Exporte de novo em IFC4.");
    expect(r.motivos.d).toBe("Em metros — os marcados estão em milímetros. Exporte de novo na mesma unidade.");
    expect(r.motivos.e).toBeNull();
    expect(r.validos).toEqual(["a", "e"]);
    expect(r.podeGerar).toBe(true);
  });

  it("desmarcar o primeiro passa o papel ao próximo", () => {
    const r = avaliarSelecao([c("a"), c("b", { unidade: "METRE" }), c("d", { unidade: "METRE" })], ["b", "d"]);
    expect(r.motivos.a).toBe("Em milímetros — os marcados estão em metros. Exporte de novo na mesma unidade.");
    expect(r.validos).toEqual(["b", "d"]);
  });

  it("precisa de dois e respeita o limite de tamanho", () => {
    expect(avaliarSelecao([c("a"), c("b")], ["a"]).motivoGerar).toBe(MOTIVO_POUCOS);
    const grande = avaliarSelecao([c("a", { tamanho: 1.5 * GB }), c("b", { tamanho: 1 * GB })], ["a", "b"]);
    expect(grande.podeGerar).toBe(false);
    expect(grande.motivoGerar).toBe("Os modelos marcados somam 2,5 GB; o limite é 2 GB. Desmarque algum modelo.");
  });
});

describe("conflitoEntreAnalises", () => {
  it("confere de novo no arquivo inteiro (o child é a palavra final)", () => {
    expect(conflitoEntreAnalises([
      { rotulo: "est.ifc", schema: "IFC4", unidade: "MILLI METRE", projetos: 1 },
      { rotulo: "ele.ifc", schema: "IFC4", unidade: "METRE", projetos: 1 },
    ])).toBe("ele.ifc está em metros e est.ifc em milímetros. Exporte de novo na mesma unidade.");
    expect(conflitoEntreAnalises([{ rotulo: "x.ifc", schema: "IFC4", unidade: null, projetos: 2 }]))
      .toBe("x.ifc tem 2 IfcProject; um IFC válido tem um só.");
    expect(conflitoEntreAnalises([
      { rotulo: "a.ifc", schema: "IFC4", unidade: "METRE", projetos: 1 },
      { rotulo: "b.ifc", schema: "IFC2X3", unidade: "METRE", projetos: 1 },
    ])).toBe("b.ifc é IFC2X3 e a.ifc é IFC4. Exporte de novo em IFC4.");
  });

  it("recusa o IFC cuja unidade não pôde ser resolvida", () => {
    expect(conflitoEntreAnalises([
      { rotulo: "a.ifc", schema: "IFC4", unidade: "METRE", projetos: 1 },
      { rotulo: "b.ifc", schema: "IFC4", unidade: undefined, projetos: 1 },
    ])).toBe("b.ifc: não foi possível ler a unidade de comprimento deste IFC.");
  });
});

describe("lerSaidaDoFilho", () => {
  it("pega a última linha JSON com ok", () => {
    expect(lerSaidaDoFilho('ruído\n{"ok":true,"tamanho":10,"sha256":"ab","avisos":[]}\n')).toEqual({
      ok: true, tamanho: 10, sha256: "ab", avisos: [],
    });
    expect(lerSaidaDoFilho('{"ok":false,"erro":"x"}')).toEqual({ ok: false, erro: "x" });
    expect(lerSaidaDoFilho("nada")).toBeNull();
  });
});
