import { describe, expect, it } from "vitest";
import type { ItemLinhaDoTempo } from "./andamento";
import {
  CONFIG_RESUMO_PADRAO,
  diasParaAvaliar,
  escaparMarkdown,
  itensDosDias,
  listaEmMarkdown,
  normalizarConfigResumo,
  periodoDoResumo,
  somarDiasIso,
  textoDoSino,
} from "./resumo-diario";

function item(dia: string, disciplina: string, texto: string): ItemLinhaDoTempo {
  return { dia, disciplinaId: disciplina, disciplina, tipo: "compartilhado", quantidade: 1, faseSigla: null, texto };
}

describe("somarDiasIso", () => {
  it("volta e avança virando o mês", () => {
    expect(somarDiasIso("2026-11-01", -1)).toBe("2026-10-31");
    expect(somarDiasIso("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("diasParaAvaliar", () => {
  const hoje = "2026-11-20";
  it("desde nulo = nada", () => {
    expect(diasParaAvaliar({ hoje, desde: null, ultimoDia: null })).toEqual([]);
  });
  it("desde ontem = só ontem", () => {
    expect(diasParaAvaliar({ hoje, desde: "2026-11-19", ultimoDia: null })).toEqual(["2026-11-19"]);
  });
  it("desde hoje = nada (primeiro resumo amanhã)", () => {
    expect(diasParaAvaliar({ hoje, desde: "2026-11-20", ultimoDia: null })).toEqual([]);
  });
  it("ultimoDia ontem = nada", () => {
    expect(diasParaAvaliar({ hoje, desde: "2026-11-01", ultimoDia: "2026-11-19" })).toEqual([]);
  });
  it("ultimoDia há 3 dias = os dois que faltam", () => {
    expect(diasParaAvaliar({ hoje, desde: "2026-11-01", ultimoDia: "2026-11-17" })).toEqual(["2026-11-18", "2026-11-19"]);
  });
  it("limite de 7 dias", () => {
    expect(diasParaAvaliar({ hoje, desde: "2026-10-01", ultimoDia: null })).toEqual([
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
    ]);
  });
  it("vira o mês", () => {
    expect(diasParaAvaliar({ hoje: "2026-12-01", desde: "2026-11-29", ultimoDia: null })).toEqual(["2026-11-29", "2026-11-30"]);
  });
});

describe("normalizarConfigResumo", () => {
  it("cai no padrão com lixo", () => {
    expect(normalizarConfigResumo(null)).toEqual(CONFIG_RESUMO_PADRAO);
    expect(normalizarConfigResumo({ ativo: "x", desde: 12 })).toEqual(CONFIG_RESUMO_PADRAO);
    expect(CONFIG_RESUMO_PADRAO).toEqual({ ativo: true, desde: null, ultimoDia: null });
  });
  it("mantém valores válidos", () => {
    expect(normalizarConfigResumo({ ativo: false, desde: "2026-11-19", ultimoDia: null })).toEqual({
      ativo: false,
      desde: "2026-11-19",
      ultimoDia: null,
    });
  });
});

describe("itensDosDias", () => {
  it("só traz dias com item", () => {
    const linha = [item("2026-11-20", "Est", "x"), item("2026-11-18", "Est", "y")];
    const m = itensDosDias(linha, ["2026-11-18", "2026-11-19"]);
    expect([...m.keys()]).toEqual(["2026-11-18"]);
    expect(m.get("2026-11-18")?.map((i) => i.texto)).toEqual(["y"]);
  });
});

describe("periodoDoResumo", () => {
  it("um dia e vários", () => {
    expect(periodoDoResumo(["2026-11-18"])).toBe("18/11/2026");
    expect(periodoDoResumo(["2026-11-18", "2026-11-15", "2026-11-16"])).toBe("15/11/2026 a 18/11/2026");
  });
});

describe("listaEmMarkdown", () => {
  it("um dia", () => {
    const m = new Map([["2026-11-18", [item("2026-11-18", "Estrutural", "8 pranchas compartilhadas com você")]]]);
    expect(listaEmMarkdown(m)).toBe("- **Estrutural** · 8 pranchas compartilhadas com você");
  });
  it("vários dias com subtítulo, do mais antigo", () => {
    const m = new Map([
      ["2026-11-18", [item("2026-11-18", "Estrutural", "8 pranchas compartilhadas com você")]],
      ["2026-11-15", [item("2026-11-15", "Hidráulica", "Fase BS concluída")]],
    ]);
    expect(listaEmMarkdown(m)).toBe(
      "**15/11/2026**\n\n- **Hidráulica** · Fase BS concluída\n\n**18/11/2026**\n\n- **Estrutural** · 8 pranchas compartilhadas com você",
    );
  });
  it("escapa texto do banco", () => {
    const m = new Map([["2026-11-18", [item("2026-11-18", "Elét*rica_[A]", "1 prancha liberada para obra")]]]);
    expect(listaEmMarkdown(m)).toBe("- **Elét\\*rica\\_\\[A\\]** · 1 prancha liberada para obra");
    expect(escaparMarkdown("Ed. *Sol*")).toBe("Ed. \\*Sol\\*");
  });
});

describe("textoDoSino", () => {
  it("com e mais N", () => {
    const tres = new Map([
      ["2026-11-18", [item("2026-11-18", "Estrutural", "8 pranchas compartilhadas com você"), item("2026-11-18", "Hid", "x")]],
      ["2026-11-19", [item("2026-11-19", "Ele", "y")]],
    ]);
    expect(textoDoSino(tres)).toBe("Estrutural · 8 pranchas compartilhadas com você e mais 2");
    const um = new Map([["2026-11-18", [item("2026-11-18", "Estrutural", "Fase EP concluída")]]]);
    expect(textoDoSino(um)).toBe("Estrutural · Fase EP concluída");
  });
});
