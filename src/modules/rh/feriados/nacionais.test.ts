import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { feriadosNacionais } = await import("./queries");

const datas = (ano: number) => feriadosNacionais(ano).map((f) => f.data.toISOString().slice(0, 10));

describe("feriadosNacionais", () => {
  it("Consciência Negra (20/11) é nacional a partir de 2024 — Lei 14.759/2023", () => {
    expect(datas(2024)).toContain("2024-11-20");
    expect(datas(2026)).toContain("2026-11-20");
    expect(feriadosNacionais(2026).find((f) => f.nome === "Consciência Negra")).toBeTruthy();
  });

  it("antes de 2024 não existia", () => {
    expect(datas(2023)).not.toContain("2023-11-20");
  });

  it("2026: 13 feriados nacionais, móveis pela Páscoa (5/4/2026)", () => {
    const d = datas(2026);
    expect(d).toHaveLength(13);
    expect(d).toEqual(
      expect.arrayContaining(["2026-02-16", "2026-02-17", "2026-04-03", "2026-06-04", "2026-10-12", "2026-12-25"]),
    );
  });
});
