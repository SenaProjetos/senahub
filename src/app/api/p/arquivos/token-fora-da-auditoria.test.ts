import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda: o token do link público é a chave de acesso do cliente e não pode ir para `AuditLog.detalhe`,
 * que colaboradores leem. As rotas de download do link registram o `linkId` (que o alcance já traz) e não
 * consultam o link de novo pelo token só para achar o id.
 */
const RAIZ = __dirname;

function rotas(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) return rotas(p);
    return nome === "route.ts" ? [p] : [];
  });
}

describe("rotas do link público de arquivos", () => {
  const arquivos = rotas(RAIZ);

  it("acha as rotas de download", () => {
    expect(arquivos.length).toBeGreaterThanOrEqual(3);
  });

  it("nenhuma grava o token no detalhe da auditoria, e todas gravam o linkId", () => {
    const comToken: string[] = [];
    const semLinkId: string[] = [];
    for (const f of arquivos) {
      const src = readFileSync(f, "utf8");
      // `detalhe: { … }` direto no logAudit, ou `const detalhe = { … }` montado antes (o .zip grava no fim do envio).
      const detalhes = [...src.matchAll(/detalhe(?::|\s*=)\s*\{([^}]*)\}/g)].map((m) => m[1]);
      if (detalhes.some((d) => /\btoken\b/.test(d))) comToken.push(path.relative(RAIZ, f));
      if (!detalhes.some((d) => /\blinkId\b/.test(d))) semLinkId.push(path.relative(RAIZ, f));
    }
    expect(comToken).toEqual([]);
    expect(semLinkId).toEqual([]);
  });

  it("nenhuma consulta o link de novo pelo token", () => {
    const achados = arquivos.filter((f) => /linkPublicoArquivos\.find/.test(readFileSync(f, "utf8")));
    expect(achados.map((f) => path.relative(RAIZ, f))).toEqual([]);
  });
});
