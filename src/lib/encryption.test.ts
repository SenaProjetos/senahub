import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { randomBytes } from "node:crypto";
import {
  criptografarSenha,
  descriptografarSenha,
  validarConfiguracaoEncryption,
} from "./encryption";

// Chave de teste: 32 bytes em base64
const TEST_KEY = randomBytes(32).toString("base64");

/**
 * Carrega uma instância NOVA do módulo com a env informada.
 *
 * A chave é cacheada na primeira leitura, então trocar `process.env` depois do primeiro uso
 * não tem efeito — só um módulo recém-importado revalida. A env **não** é restaurada aqui:
 * `obterChave()` é lazy (roda na primeira chamada, não no import), então restaurar dentro
 * do helper faria o módulo enxergar a chave boa de novo. Quem restaura é o `afterEach`.
 */
async function moduloCom(key: string | undefined) {
  if (key === undefined) delete process.env.ACESSOS_ENCRYPTION_KEY;
  else process.env.ACESSOS_ENCRYPTION_KEY = key;
  vi.resetModules();
  return import("./encryption");
}

describe("encryption", () => {
  beforeAll(() => {
    process.env.ACESSOS_ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    process.env.ACESSOS_ENCRYPTION_KEY = TEST_KEY;
  });

  it("deve criptografar e descriptografar texto simples", async () => {
    const plaintext = "minha-senha-secreta";
    const encrypted = await criptografarSenha(plaintext);

    expect(encrypted).toHaveProperty("iv");
    expect(encrypted).toHaveProperty("authTag");
    expect(encrypted).toHaveProperty("ciphertext");
    expect(encrypted).toHaveProperty("keyVersion", 1);

    const decrypted = await descriptografarSenha(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("não deve deixar o plaintext aparecer no payload cifrado", async () => {
    const plaintext = "senha-que-nao-pode-vazar";
    const encrypted = await criptografarSenha(plaintext);

    // §90: "senha nunca armazenada em plaintext" — é isto que vai para a coluna do banco.
    const serializado = JSON.stringify(encrypted);
    expect(serializado).not.toContain(plaintext);
    expect(Buffer.from(encrypted.ciphertext, "base64").toString("utf8")).not.toContain(plaintext);
  });

  it("deve gerar IVs diferentes para cada criptografia", async () => {
    const plaintext = "mesma-senha";
    const enc1 = await criptografarSenha(plaintext);
    const enc2 = await criptografarSenha(plaintext);

    expect(enc1.iv).not.toBe(enc2.iv);
    expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
  });

  it("deve falhar ao descriptografar com ciphertext corrompido", async () => {
    const encrypted = await criptografarSenha("senha");
    encrypted.ciphertext = Buffer.from("conteudo-trocado").toString("base64");

    await expect(descriptografarSenha(encrypted)).rejects.toThrow(/Descriptografia falhou/i);
  });

  it("deve falhar ao descriptografar com authTag adulterada (mesmo tamanho)", async () => {
    const encrypted = await criptografarSenha("senha");
    const tag = Buffer.from(encrypted.authTag, "base64");
    tag[0] = tag[0] ^ 0xff; // vira um bit: tamanho continua válido, autenticação não
    encrypted.authTag = tag.toString("base64");

    await expect(descriptografarSenha(encrypted)).rejects.toThrow(/Descriptografia falhou/i);
  });

  it("não deve vazar a mensagem crua do Node quando a authTag tem tamanho inválido", async () => {
    const encrypted = await criptografarSenha("senha");
    encrypted.authTag = Buffer.from("tag-de-tamanho-errado-26b").toString("base64");

    // Sem o try envolvendo setAuthTag, o Node lança "Invalid authentication tag length: 26".
    await expect(descriptografarSenha(encrypted)).rejects.toThrow(/Descriptografia falhou/i);
    await expect(descriptografarSenha(encrypted)).rejects.not.toThrow(/authentication tag length/i);
  });

  it("deve recusar payload com keyVersion desconhecida", async () => {
    const encrypted = await criptografarSenha("senha");
    encrypted.keyVersion = 99;

    await expect(descriptografarSenha(encrypted)).rejects.toThrow(/Versão de chave 99/i);
  });

  it("deve trabalhar com textos longos", async () => {
    const plaintext = "A".repeat(10000);
    const encrypted = await criptografarSenha(plaintext);
    expect(await descriptografarSenha(encrypted)).toBe(plaintext);
  });

  it("deve trabalhar com caracteres especiais e unicode", async () => {
    const plaintext = "senha@123!#$ unicode: 中文 émoji 🔐";
    const encrypted = await criptografarSenha(plaintext);
    expect(await descriptografarSenha(encrypted)).toBe(plaintext);
  });

  it("deve validar configuração quando a chave está correta", () => {
    expect(validarConfiguracaoEncryption()).toEqual({ ok: true });
  });

  it("deve falhar fechado quando a chave está ausente", async () => {
    const mod = await moduloCom(undefined);

    const resultado = mod.validarConfiguracaoEncryption();
    expect(resultado.ok).toBe(false);
    expect(resultado.error).toMatch(/ACESSOS_ENCRYPTION_KEY/);

    // E o caminho de uso também nega — não cai em plaintext.
    await expect(mod.criptografarSenha("x")).rejects.toThrow(/ACESSOS_ENCRYPTION_KEY/);
  });

  it("deve falhar fechado quando a chave tem tamanho errado", async () => {
    const mod = await moduloCom(randomBytes(16).toString("base64"));

    const resultado = mod.validarConfiguracaoEncryption();
    expect(resultado.ok).toBe(false);
    expect(resultado.error).toMatch(/32 bytes/);
  });
});
