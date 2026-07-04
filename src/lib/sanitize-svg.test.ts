import { describe, it, expect } from "vitest";
import { sanitizeSvg, SVG_MAX_BYTES } from "./sanitize-svg";

describe("sanitizeSvg", () => {
  it("mantém um SVG simples e válido", () => {
    const out = sanitizeSvg('<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>');
    expect(out).toContain("<svg");
    expect(out).toContain("<path");
    expect(out).toContain("</svg>");
  });

  it("remove <script>", () => {
    const out = sanitizeSvg('<svg><script>alert(1)</script><circle r="5"/></svg>');
    expect(out).not.toMatch(/script/i);
    expect(out).toContain("<circle");
  });

  it("remove script auto-fechado", () => {
    const out = sanitizeSvg('<svg><script href="x.js"/><rect/></svg>');
    expect(out).not.toMatch(/script/i);
  });

  it("remove atributos onload/onclick", () => {
    const out = sanitizeSvg('<svg onload="evil()"><rect onclick=\'hack()\'/></svg>');
    expect(out).not.toMatch(/onload/i);
    expect(out).not.toMatch(/onclick/i);
  });

  it("remove <foreignObject>", () => {
    const out = sanitizeSvg('<svg><foreignObject><body>x</body></foreignObject><path/></svg>');
    expect(out).not.toMatch(/foreignObject/i);
    expect(out).toContain("<path");
  });

  it("remove href externo mas mantém ref de fragmento", () => {
    const out = sanitizeSvg(
      '<svg><a href="https://evil.com"><use xlink:href="#a"/></a><image href="javascript:alert(1)"/></svg>',
    );
    expect(out).not.toMatch(/evil\.com/);
    expect(out).not.toMatch(/javascript:/i);
    expect(out).toContain('href="#a"');
  });

  it("remove DOCTYPE/ENTITY e prolog XML", () => {
    const out = sanitizeSvg(
      '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x "y">]><svg><path/></svg>',
    );
    expect(out).not.toMatch(/DOCTYPE/i);
    expect(out).not.toMatch(/ENTITY/i);
    expect(out!.startsWith("<svg")).toBe(true);
  });

  it("remove <style>", () => {
    const out = sanitizeSvg('<svg><style>@import url(evil)</style><path/></svg>');
    expect(out).not.toMatch(/@import/i);
    expect(out).not.toMatch(/<style/i);
  });

  it("retorna null para conteúdo sem raiz svg", () => {
    expect(sanitizeSvg("<div>oi</div>")).toBeNull();
    expect(sanitizeSvg("texto solto")).toBeNull();
  });

  it("retorna null para vazio/nulo", () => {
    expect(sanitizeSvg("")).toBeNull();
    expect(sanitizeSvg(null)).toBeNull();
    expect(sanitizeSvg(undefined)).toBeNull();
  });

  it("retorna null acima do limite de tamanho", () => {
    const grande = "<svg>" + "a".repeat(SVG_MAX_BYTES) + "</svg>";
    expect(sanitizeSvg(grande)).toBeNull();
  });
});
