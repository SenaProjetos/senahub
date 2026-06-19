import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Hash de senha de exclusão (PIN configurável p/ proteção contra exclusão acidental).
 * Formato armazenado: `saltHex:hashHex` (scrypt). Não é a senha de login.
 */
export function hashSenha(senha: string): string {
  const salt = randomBytes(16);
  const dk = scryptSync(senha, salt, 32);
  return `${salt.toString("hex")}:${dk.toString("hex")}`;
}

export function verificarSenha(senha: string, armazenado: string | null | undefined): boolean {
  if (!armazenado) return false;
  const [saltHex, hashHex] = armazenado.split(":");
  if (!saltHex || !hashHex) return false;
  const dk = scryptSync(senha, Buffer.from(saltHex, "hex"), 32);
  const alvo = Buffer.from(hashHex, "hex");
  return dk.length === alvo.length && timingSafeEqual(dk, alvo);
}
