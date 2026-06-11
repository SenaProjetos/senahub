import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { TrocarSenhaForm } from "@/components/auth/trocar-senha-form";

export const metadata: Metadata = { title: "Trocar senha" };

export default async function TrocarSenhaPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const primeiroAcesso = session.user.mustChangePassword;

  return <TrocarSenhaForm primeiroAcesso={primeiroAcesso} />;
}
