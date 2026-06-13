import "server-only";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/lib/roles";

/** Gera uma senha temporária legível (ex.: "Sena-4F8K2"). */
export function gerarSenhaTemporaria(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `Sena-${s}`;
}

/** Cria um usuário com credencial (senha temporária + troca obrigatória). */
export async function criarUsuarioComCredencial(input: {
  name: string;
  email: string;
  role: Role;
  clienteId?: string;
}): Promise<{ id: string; senhaTemporaria: string }> {
  const senhaTemporaria = gerarSenhaTemporaria();
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(senhaTemporaria);

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email.toLowerCase().trim(),
      emailVerified: true,
      role: input.role,
      ativo: true,
      mustChangePassword: true,
      clienteId: input.role === "cliente" ? input.clienteId || null : null,
    },
  });

  await prisma.account.create({
    data: {
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: hash,
    },
  });

  return { id: user.id, senhaTemporaria };
}

/** Reinicia a senha de um usuário para uma nova temporária (troca obrigatória). */
export async function resetarSenha(userId: string): Promise<string> {
  const senhaTemporaria = gerarSenhaTemporaria();
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(senhaTemporaria);

  await ctx.internalAdapter.updatePassword(userId, hash);
  await prisma.user.update({
    where: { id: userId },
    data: { mustChangePassword: true },
  });

  return senhaTemporaria;
}
