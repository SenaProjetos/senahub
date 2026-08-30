/**
 * Criptografia de senhas para o módulo Acessos e Credenciais.
 * AES-256-GCM com IV aleatório + keyVersion para rotação futura.
 *
 * Uso:
 *   const encrypted = await criptografarSenha("minha-senha");
 *   const plaintext = await descriptografarSenha(encrypted);
 *
 * A chave vem de env: ACESSOS_ENCRYPTION_KEY (32 bytes base64)
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface EncryptedPayload {
  iv: string; // base64
  authTag: string; // base64
  ciphertext: string; // base64
  keyVersion: number;
}

// Validação e cache da chave na inicialização
let encryptionKey: Buffer | null = null;
let keyInitialized = false;

function obterChave(): Buffer {
  if (keyInitialized && encryptionKey === null) {
    throw new Error(
      "ACESSOS_ENCRYPTION_KEY não configurada ou inválida. " +
        "Defina como 32 bytes em base64.",
    );
  }

  if (!keyInitialized) {
    const keyEnv = process.env.ACESSOS_ENCRYPTION_KEY;
    if (!keyEnv) {
      throw new Error(
        "ACESSOS_ENCRYPTION_KEY não configurada. " +
          "Defina no .env como 32 bytes em base64.",
      );
    }

    try {
      encryptionKey = Buffer.from(keyEnv, "base64");
    } catch {
      throw new Error("ACESSOS_ENCRYPTION_KEY inválida (não é base64 válido)");
    }

    if (encryptionKey.length !== 32) {
      throw new Error(
        `ACESSOS_ENCRYPTION_KEY deve ter 32 bytes (256 bits), tem ${encryptionKey.length}`,
      );
    }

    keyInitialized = true;
  }

  if (!encryptionKey) {
    throw new Error("Chave de criptografia não inicializada");
  }

  return encryptionKey;
}

/**
 * Criptografa um plaintext com AES-256-GCM.
 * Retorna um JSON-serializable payload com IV, authTag e ciphertext.
 */
export async function criptografarSenha(plaintext: string): Promise<EncryptedPayload> {
  const chave = obterChave();
  const iv = randomBytes(12); // 96 bits padrão para GCM
  const cipher = createCipheriv("aes-256-gcm", chave, iv);

  let ciphertext = cipher.update(plaintext, "utf8", "base64");
  ciphertext += cipher.final("base64");

  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext,
    keyVersion: 1, // v1 = chave atual; para rotação, incrementar e suportar múltiplas
  };
}

/**
 * Descriptografa um EncryptedPayload.
 * Falha se authTag não corresponder (integridade violada).
 */
export async function descriptografarSenha(payload: EncryptedPayload): Promise<string> {
  const chave = obterChave();

  if (payload.keyVersion !== 1) {
    throw new Error(
      `Versão de chave ${payload.keyVersion} não suportada. ` +
        "Implementar rotação em Fase 2.",
    );
  }

  // Tudo dentro do try: `createDecipheriv` (IV de tamanho errado) e `setAuthTag` (tag de
  // tamanho errado) lançam mensagens cruas do Node ("Invalid authentication tag length: 26").
  // Payload corrompido é entrada não confiável — a mensagem nunca deve vazar para o usuário.
  try {
    const iv = Buffer.from(payload.iv, "base64");
    const authTag = Buffer.from(payload.authTag, "base64");
    const ciphertext = Buffer.from(payload.ciphertext, "base64");

    const decipher = createDecipheriv("aes-256-gcm", chave, iv);
    decipher.setAuthTag(authTag);

    let plaintext = decipher.update(ciphertext, undefined, "utf8");
    plaintext += decipher.final("utf8");
    return plaintext;
  } catch {
    throw new Error("Descriptografia falhou: dados corrompidos ou chave inválida");
  }
}

/**
 * Valida que a chave está configurada no boot.
 * Chamada automaticamente pelo seed; pode ser invocada manualmente em healthchecks.
 */
export function validarConfiguracaoEncryption(): { ok: boolean; error?: string } {
  try {
    obterChave();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
