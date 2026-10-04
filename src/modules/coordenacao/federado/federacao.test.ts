import { afterEach, describe, expect, it, vi } from "vitest";
import { federar, type ManifestoFederar } from "./federacao";
import { MOTIVO_NAO_INICIOU, MOTIVO_SEM_RESPOSTA } from "./regras";
import { ErroMostravel } from "./step";

const MANIFESTO: ManifestoFederar = {
  entradas: [],
  saida: "documentos/x/y.ifc",
  cabecalho: { nomeArquivo: "a.ifc", autor: "Fulana", quando: "2026-10-04T10:00:00", composicao: [] },
};

describe("federar: o que vai para o usuário", () => {
  afterEach(() => vi.restoreAllMocks());

  it("repassa a frase do child e manda o stderr só para o log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await federar(MANIFESTO, async () => ({
      code: 1,
      stdout: '{"ok":false,"erro":"IFC truncado: o arquivo termina no meio de um texto ou comentário."}\n',
      stderr: "Error: ENOSPC: no space left on device, write 'H:\\storage\\documentos\\x\\y.ifc.parcial'",
    }));
    expect(r).toEqual({ ok: false, erro: "IFC truncado: o arquivo termina no meio de um texto ou comentário." });
    expect(String(log.mock.calls[0]?.[0])).toContain("ENOSPC");
  });

  it("child sem resposta: frase genérica, nunca o stderr", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await federar(MANIFESTO, async () => ({ code: 134, stdout: "", stderr: "FATAL ERROR: Reached heap limit\n    at C:\\SenaHub\\x.js" }));
    expect(r).toEqual({ ok: false, erro: MOTIVO_SEM_RESPOSTA });
    expect(String(log.mock.calls[0]?.[0])).toContain("heap limit");
  });

  it("erro do Node ao iniciar: frase genérica; timeout (frase nossa) passa como está", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const semNode = await federar(MANIFESTO, async () => {
      throw Object.assign(new Error("spawn C:\\Program Files\\nodejs\\node.exe ENOENT"), { code: "ENOENT" });
    });
    expect(semNode).toEqual({ ok: false, erro: MOTIVO_NAO_INICIOU });
    const timeout = await federar(MANIFESTO, async () => {
      throw new ErroMostravel("A geração do modelo federado passou de 30 min e foi interrompida.");
    });
    expect(timeout).toEqual({ ok: false, erro: "A geração do modelo federado passou de 30 min e foi interrompida." });
  });

  it("sucesso não loga nada", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await federar(MANIFESTO, async () => ({ code: 0, stdout: '{"ok":true,"tamanho":10,"sha256":"ab","avisos":[]}\n', stderr: "" }));
    expect(r).toEqual({ ok: true, tamanho: 10, sha256: "ab", avisos: [] });
    expect(log).not.toHaveBeenCalled();
  });
});
