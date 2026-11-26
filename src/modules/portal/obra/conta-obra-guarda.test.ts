import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda da conta de obra (spec 2026-11-25): ela NUNCA tem `User.clienteId`, perfil, override ou superusuário — é isso que
 * mantém fechadas as áreas do cliente sem mexer nelas. Quem escreve `clienteId` num usuário é uma lista fechada, e os caminhos
 * que dão cliente/perfil/permissão a uma conta recusam a conta de obra (`exigirNaoEhContaObra`).
 */
const SRC = path.resolve(__dirname, "..", "..", "..");
const rel = (f: string) => path.relative(SRC, f).split(path.sep).join("/");

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) return nome === "generated" || nome === "test" ? [] : arquivos(p);
    if (/\.test\.tsx?$/.test(p)) return [];
    return /\.tsx?$/.test(p) ? [p] : [];
  });
}

const ler = (r: string) => readFileSync(path.join(SRC, r), "utf8");

/** O texto de cada `….user.update|updateMany|create|upsert(…)` do arquivo, até o parêntese que fecha a chamada. */
function chamadasDeEscritaEmUsuario(src: string): string[] {
  const chamadas: string[] = [];
  for (const m of src.matchAll(/\.user\.(update|updateMany|create|upsert)\(/g)) {
    const inicio = (m.index ?? 0) + m[0].length;
    let nivel = 1;
    let i = inicio;
    while (i < src.length && nivel > 0) {
      if (src[i] === "(") nivel += 1;
      else if (src[i] === ")") nivel -= 1;
      i += 1;
    }
    chamadas.push(src.slice(inicio, i));
  }
  return chamadas;
}

describe("conta de obra nunca ganha cliente, perfil ou permissão", () => {
  it("só três arquivos escrevem `clienteId` num usuário", () => {
    const achados = arquivos(SRC)
      .filter((f) => chamadasDeEscritaEmUsuario(readFileSync(f, "utf8")).some((c) => /\bclienteId\b/.test(c)))
      .map(rel)
      .sort();
    expect(achados).toEqual(["lib/auth-admin.ts", "modules/clientes/fusao.ts", "modules/usuarios/actions.ts"]);
  });

  it("editar usuário, reativar e criar override conferem a conta de obra", () => {
    expect(ler("modules/usuarios/actions.ts")).toContain("exigirNaoEhContaObra(");
    expect(ler("modules/perfis/overrides-actions.ts")).toContain("exigirNaoEhContaObra(");
    expect(ler("modules/usuarios/actions.ts")).toContain("pedeAcessoDeCliente(");
  });

  it("vínculo (RH) nunca transforma a conta de obra em conta interna", () => {
    expect(ler("modules/usuarios/vinculo/service.ts")).toContain("MOTIVO_CONTA_OBRA");
    // A trava do editarUsuario vale para qualquer tipo (a conta pode ter virado interna por outro caminho).
    expect(ler("modules/usuarios/actions.ts")).not.toContain("externo && pedeAcessoDeCliente(");
  });

  it("cadastro de sócio no Financeiro recusa conta externa (cliente do portal ou obra)", () => {
    expect(ler("modules/financeiro/cadastros/actions.ts")).toContain("exigirNaoEhContaObra(");
  });

  it("a fusão de clientes leva a conta de obra do cliente junto", () => {
    expect(ler("modules/clientes/fusao.ts")).toContain("contaObra.updateMany");
  });
});
