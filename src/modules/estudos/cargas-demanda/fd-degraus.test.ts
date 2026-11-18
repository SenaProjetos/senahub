/**
 * FD de iluminação e tomadas por uso em DEGRAUS de carga (Neoenergia T22, Cemig T11, Celesc T05, Copel T12, Equatorial T4 e T5
 * "Prédios Residenciais"). Não há caso na planilha do engenheiro: os esperados são contas à mão sobre o TEXTO LITERAL da tabela,
 * citado em cada teste (ex.: Neoenergia T22, hotéis: "0,50 para os primeiros 20 kW / 0,40 para o que exceder 20 kW"); os
 * degraus lidos da biblioteca já são conferidos em `fd-sugerido-tipos.test.ts`.
 */

import { describe, expect, it } from "vitest";

import { conteudoSchema, type LinhaCargaEstudo, type TipoCarga } from "./conteudo";
import { degrausDaLinha, escolhaDaRegra, fdEfetivoDaLinha, fdSugeridoComFonte, regrasOferecidas, type ContextoFd } from "./fd-linha";
import { montarRelatorio } from "./relatorio/montar";
import { calcularCalculoDeCargaInstalada } from "./resultado";

const perto = (v: number | null | undefined, e: number, tol = 1e-9) => {
  expect(v).not.toBeNull();
  expect(Math.abs((v as number) - e)).toBeLessThanOrEqual(tol);
};

const linha = (id: string, tipoCarga: TipoCarga, potenciaW: number, fp: number, regraFd: string | null, subtipo: string | null, extra: Partial<LinhaCargaEstudo> = {}): LinhaCargaEstudo => ({
  id, descricao: id, tipoCarga, quantidade: 1, potenciaW, fp, fd: null, vinculo: null, regraFd, subtipo, ...extra,
});

const ctx = (concessionaria: ContextoFd["concessionaria"], linhas: LinhaCargaEstudo[], escopoN = 1): ContextoFd => ({
  concessionaria, escopoN, fdAquecimento: null, linhas,
});

describe("Neoenergia T22 — hotéis: 0,50 para os primeiros 20 kW / 0,40 para o que exceder 20 kW", () => {
  const HOTEL = "Hotéis e semelhantes";
  // Iluminação 15 kW + tomadas 15 kW = 30 kW no grupo: 20 × 0,50 + 10 × 0,40 = 14 kW → FD equivalente 14 ÷ 30.
  const ls = [linha("il", "iluminacao", 15000, 1, "neo-ilum-tug-uso", HOTEL), linha("tug", "tomadas_uso_geral", 15000, 0.8, "neo-ilum-tug-uso", HOTEL)];
  const c = ctx("neoenergia", ls);

  it("a regra aparece na iluminação e nas tomadas, e pede o uso", () => {
    expect(regrasOferecidas("neoenergia", "iluminacao").map((r) => r.id)).toContain("neo-ilum-tug-uso");
    expect(regrasOferecidas("neoenergia", "tomadas_uso_geral").map((r) => r.id)).toContain("neo-ilum-tug-uso");
    const e = escolhaDaRegra(c, ls[0]);
    expect(e?.rotulo).toBe("Uso da edificação");
    expect(e?.opcoes.map((o) => o.valor)).toContain(HOTEL);
    // "Administração de edifícios" é só texto na tabela (tem regra própria por botão): não vira uso de degraus.
    expect(e?.opcoes.map((o) => o.valor)).not.toContain("Administração de edifícios de uso coletivo");
  });

  it("os degraus somam as linhas do grupo: 30 kW → 14 kW", () => {
    const d = degrausDaLinha(c, ls[0])!;
    perto(d.carga, 30);
    expect(d.partes.map((p) => [p.carga, p.fd])).toEqual([[20, 0.5], [10, 0.4]]);
    perto(d.demanda, 14);
    perto(d.fdEquivalente, 14 / 30);
    expect(d.referencia).toContain("Tabela 22");
  });

  it("cada linha adota o FD equivalente e a soma das demandas é a dos degraus (÷ FP de cada linha)", () => {
    const k = conteudoSchema.parse({ calculos: [{ id: "k", nome: "Hotel", metodo: "carga_instalada", linhas: ls }] }).calculos[0];
    const r = calcularCalculoDeCargaInstalada(k, "neoenergia");
    for (const x of r.linhas) expect(x.fdEhSugerido).toBe(true);
    perto(r.demandaKW, 14);
    perto(r.demandaKVA, (15 * (14 / 30)) / 1 + (15 * (14 / 30)) / 0.8);
  });

  it("o × N do escopo entra na carga do grupo: × 2 → 60 kW → 20 × 0,50 + 40 × 0,40 = 26 kW", () => {
    const d = degrausDaLinha(ctx("neoenergia", ls, 2), ls[0])!;
    perto(d.carga, 60);
    perto(d.demanda, 26);
  });

  it("sem o uso, com uso de outra tabela ou com linha incompleta no grupo: sem sugestão", () => {
    expect(fdSugeridoComFonte(ctx("neoenergia", [linha("a", "iluminacao", 1000, 1, "neo-ilum-tug-uso", null)]), linha("a", "iluminacao", 1000, 1, "neo-ilum-tug-uso", null))).toBeNull();
    const fora = linha("a", "iluminacao", 1000, 1, "neo-ilum-tug-uso", "não existe");
    expect(fdSugeridoComFonte(ctx("neoenergia", [fora]), fora)).toBeNull();
    const incompleta = [ls[0], { ...ls[1], potenciaW: null }] as unknown as LinhaCargaEstudo[];
    expect(fdSugeridoComFonte(ctx("neoenergia", incompleta), ls[0])).toBeNull();
  });

  it("FD digitado vale sobre o sugerido", () => {
    const dig = { ...ls[0], fd: 0.9 };
    expect(fdEfetivoDaLinha(ctx("neoenergia", [dig, ls[1]]), dig)).toEqual({ fd: 0.9, ehSugerido: false });
  });

  it("outro uso no mesmo cálculo forma outro grupo", () => {
    const escola = linha("esc", "iluminacao", 30000, 1, "neo-ilum-tug-uso", "Escolas e semelhantes");
    const d = degrausDaLinha(ctx("neoenergia", [...ls, escola]), ls[0])!;
    perto(d.carga, 30);
    expect(d.linhas).toEqual(["il", "tug"]);
  });

  it("a regra de outra concessionária não vale", () => {
    expect(fdSugeridoComFonte(ctx("celesc", ls), ls[0])).toBeNull();
  });
});

describe("Cemig T11 — degraus em kVA: áreas comuns e condomínios, 1,00 nos primeiros 10 kVA e 0,25 no excedente", () => {
  const USO = "Áreas comuns e condomínios";
  // 9 kW com FP 0,90 = 10 kVA; mais 9 kW com FP 0,90 = 10 kVA: 20 kVA → 10 × 1,00 + 10 × 0,25 = 12,5 kVA.
  const ls = [linha("il", "iluminacao", 9000, 0.9, "cemig-ilum-tug-uso", USO), linha("tug", "tomadas_uso_geral", 9000, 0.9, "cemig-ilum-tug-uso", USO)];
  it("a carga do grupo é em kVA (P ÷ FP)", () => {
    const d = degrausDaLinha(ctx("cemig", ls), ls[0])!;
    expect(d.unidade).toBe("kVA");
    perto(d.carga, 20);
    perto(d.demanda, 12.5);
    perto(d.fdEquivalente, 12.5 / 20);
  });
  it("sem FP não há carga em kVA: sem sugestão", () => {
    const semFp = [{ ...ls[0], fp: null }, ls[1]] as unknown as LinhaCargaEstudo[];
    expect(degrausDaLinha(ctx("cemig", semFp), semFp[1])).toBeNull();
  });
});

describe("Equatorial T5 — prédios residenciais (tabela de uma linha, sem uso)", () => {
  // Degraus lidos da biblioteca: 10 kW a 1,00, os 110 kW seguintes a 0,20, o excedente a 0,10 (fd-sugerido-tipos.test.ts).
  // 150 kW: 10 × 1,00 + 110 × 0,20 + 30 × 0,10 = 10 + 22 + 3 = 35 kW.
  const ls = [linha("il", "iluminacao", 150000, 1, "eqt-ilum-tug-predio", null)];
  it("não pede uso e percorre os três degraus", () => {
    expect(escolhaDaRegra(ctx("equatorial", ls), ls[0])).toBeNull();
    const d = degrausDaLinha(ctx("equatorial", ls), ls[0])!;
    perto(d.demanda, 35);
  });
});

describe("Copel T12 — só iluminação", () => {
  it("a regra não aparece nas tomadas", () => {
    expect(regrasOferecidas("copel", "iluminacao").map((r) => r.id)).toContain("copel-ilum-uso");
    expect(regrasOferecidas("copel", "tomadas_uso_geral").map((r) => r.id)).not.toContain("copel-ilum-uso");
  });
});

describe("relatório: a conta dos degraus", () => {
  const HOTEL = "Hotéis e semelhantes";
  const c = conteudoSchema.parse({
    concessionaria: "neoenergia",
    calculos: [{ id: "k", nome: "Hotel", metodo: "carga_instalada", papel: "condominio", linhas: [linha("il", "iluminacao", 15000, 1, "neo-ilum-tug-uso", HOTEL), linha("tug", "tomadas_uso_geral", 15000, 0.8, "neo-ilum-tug-uso", HOTEL)] }],
  });
  const r = montarRelatorio(c, { nomeEstudo: "E", obra: "O", cliente: "C", emissao: "2026-11-13" });
  const sec4 = r.secoes.find((s) => s.numero === 4)!;
  const t = sec4.blocos.flatMap((b) => (b.tipo === "tabela" ? [b.tabela] : [])).find((x) => x.titulo?.startsWith("FD em degraus"))!;
  it("uma tabela por grupo, com as faixas e o total", () => {
    expect(t.titulo).toBe(`FD em degraus — ${HOTEL} (linhas: il, tug)`);
    expect(t.linhas).toHaveLength(3);
    const total = t.linhas.at(-1)!;
    expect(total[1]).toEqual({ n: 30, c: 2 });
    expect(total[3]).toEqual({ n: 14, c: 2 });
  });
  it("a fonte da tabela vai para a seção 7", () => {
    expect(JSON.stringify(r.secoes.find((s) => s.numero === 7)!.blocos)).toContain("Tabela 22");
  });
});
