import { describe, expect, it } from "vitest";
import { ehArquivoDeBackup } from "@/lib/backup";

describe("ehArquivoDeBackup", () => {
  it("reconhece dumps publicados, legados e temporários para retenção", () => {
    expect(ehArquivoDeBackup("senahub_20260824_030000.backup")).toBe(true);
    expect(ehArquivoDeBackup("pre-restauracao_senahub_20260824.backup")).toBe(true);
    expect(ehArquivoDeBackup("senahub_20260824_030000.backup.partial")).toBe(true);
    expect(ehArquivoDeBackup("senahub_20260824_030000.dump")).toBe(true);
  });

  it("não inclui arquivos arbitrários na retenção", () => {
    expect(ehArquivoDeBackup("outro.backup")).toBe(false);
    expect(ehArquivoDeBackup("senahub_20260824.sql")).toBe(false);
  });
});
