import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage() {
  // Quem já tem sessão válida não precisa do formulário. A checagem é REAL (getSession consulta o
  // banco), ao contrário do cookie visto pelo middleware: cookie sem sessão correspondente cai no
  // formulário, em vez de voltar para / e entrar em laço com o requireUser.
  if (await getSession()) redirect("/");

  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
