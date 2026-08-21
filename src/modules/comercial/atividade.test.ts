import { describe, expect, it } from "vitest";
import { mesclarTimeline, tipoAtividadeDe, ultimaInteracaoDe } from "./atividade";

describe("tipoAtividadeDe", () => {
  it("os 5 canais de comunicação mapeiam direto", () => {
    expect(tipoAtividadeDe("LIGACAO")).toBe("LIGACAO");
    expect(tipoAtividadeDe("WHATSAPP")).toBe("WHATSAPP");
    expect(tipoAtividadeDe("EMAIL")).toBe("EMAIL");
    expect(tipoAtividadeDe("LINKEDIN")).toBe("LINKEDIN");
    expect(tipoAtividadeDe("REUNIAO")).toBe("REUNIAO");
  });

  it("os 7 tipos sem canal equivalente viram NOTA", () => {
    const semEquivalente = [
      "FOLLOW_UP",
      "COBRAR_DOCUMENTACAO",
      "COBRAR_ARQUITETURA",
      "ENVIAR_PROPOSTA",
      "REVISAR_PROPOSTA",
      "RETORNO_AO_CLIENTE",
      "OUTRO",
    ] as const;
    for (const t of semEquivalente) expect(tipoAtividadeDe(t)).toBe("NOTA");
  });
});

describe("mesclarTimeline", () => {
  const autor = { name: "Ana" };

  it("junta legado e novo, ordenado do mais recente para o mais antigo", () => {
    const legado = [{ id: "l1", nota: "nota antiga", createdAt: new Date("2026-08-01"), autor }];
    const nova = [
      { id: "n1", descricao: "atividade nova", createdAt: new Date("2026-08-20"), autor, tipo: "LIGACAO" as const },
    ];
    const m = mesclarTimeline(legado, nova);
    expect(m.map((i) => i.id)).toEqual(["n1", "l1"]);
  });

  it("descricao do novo vira nota — mesma chave que o componente de exibição usa", () => {
    const nova = [
      { id: "n1", descricao: "ligação concluída", createdAt: new Date(), autor, tipo: "LIGACAO" as const },
    ];
    expect(mesclarTimeline([], nova)[0].nota).toBe("ligação concluída");
  });

  it("vazio nos dois lados dá array vazio", () => {
    expect(mesclarTimeline([], [])).toEqual([]);
  });

  it("intercala quando as datas se alternam", () => {
    const legado = [
      { id: "l1", nota: "l1", createdAt: new Date("2026-08-10"), autor },
      { id: "l2", nota: "l2", createdAt: new Date("2026-08-05"), autor },
    ];
    const nova = [{ id: "n1", descricao: "n1", createdAt: new Date("2026-08-07"), autor, tipo: "NOTA" as const }];
    expect(mesclarTimeline(legado, nova).map((i) => i.id)).toEqual(["l1", "n1", "l2"]);
  });

  it("F3.6: legado sempre vira tipo NOTA — não há canal estruturado nos dados antigos", () => {
    const legado = [{ id: "l1", nota: "l1", createdAt: new Date(), autor }];
    expect(mesclarTimeline(legado, [])[0].tipo).toBe("NOTA");
  });

  it("F3.6: novo preserva o tipo real, para o filtro do <Timeline>", () => {
    const nova = [{ id: "n1", descricao: "n1", createdAt: new Date(), autor, tipo: "WHATSAPP" as const }];
    expect(mesclarTimeline([], nova)[0].tipo).toBe("WHATSAPP");
  });
});

describe("ultimaInteracaoDe", () => {
  it("null quando a timeline está vazia", () => {
    expect(ultimaInteracaoDe([])).toBeNull();
  });

  it("é o createdAt mais recente, mesmo se o array não vier ordenado", () => {
    // Contrato deliberado: não confia em quem chama ter ordenado antes.
    const fora_de_ordem = [
      { createdAt: new Date("2026-08-01") },
      { createdAt: new Date("2026-08-20") },
      { createdAt: new Date("2026-08-10") },
    ];
    expect(ultimaInteracaoDe(fora_de_ordem)).toEqual(new Date("2026-08-20"));
  });

  it("um único item é a própria última interação", () => {
    const d = new Date("2026-08-15");
    expect(ultimaInteracaoDe([{ createdAt: d }])).toEqual(d);
  });
});
