import { describe, it, expect } from "vitest";
import { wrapEmail } from "./email-layout";

describe("wrapEmail", () => {
  it("envolve o corpo num documento HTML completo", () => {
    const out = wrapEmail("<p>Olá</p>");
    expect(out).toMatch(/^<!DOCTYPE html>/);
    expect(out).toContain("<p>Olá</p>");
    expect(out).toContain("</html>");
  });

  it("aplica a marca do sistema (nome + cor primária)", () => {
    const out = wrapEmail("<p>x</p>");
    expect(out).toContain("SenaHub");
    expect(out).toContain("#1c2d58"); // --primary
  });

  it("escapa o preheader (sem injeção de HTML)", () => {
    const out = wrapEmail("<p>x</p>", { preheader: '<script>alert(1)</script>' });
    expect(out).not.toContain("<script>alert(1)</script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("usa APP_URL no rodapé quando definido", () => {
    const prev = process.env.APP_URL;
    process.env.APP_URL = "https://sena.example.com";
    try {
      expect(wrapEmail("<p>x</p>")).toContain("sena.example.com");
    } finally {
      if (prev === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = prev;
    }
  });

  it("usa a logo (imagem) no cabeçalho quando APP_URL está definido", () => {
    const prev = process.env.APP_URL;
    process.env.APP_URL = "https://sena.example.com";
    try {
      const out = wrapEmail("<p>x</p>");
      expect(out).toContain("https://sena.example.com/MARCA/email-logo.png");
      expect(out).toContain('alt="Sena Projetos"');
    } finally {
      if (prev === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = prev;
    }
  });

  it("sem APP_URL, cai no nome em texto (sem <img> quebrada)", () => {
    const prev = process.env.APP_URL;
    delete process.env.APP_URL;
    try {
      expect(wrapEmail("<p>x</p>")).not.toContain("<img");
    } finally {
      if (prev !== undefined) process.env.APP_URL = prev;
    }
  });
});
