import type { Metadata } from "next";
import { RedefinirSenhaForm } from "@/components/auth/redefinir-senha-form";
import { LinkRedefinicaoInvalido } from "@/components/auth/link-redefinicao-invalido";
import { MENSAGEM_LINK_INVALIDO } from "@/modules/auth/redefinir-senha";
import { linkDeRedefinicaoValido } from "@/modules/auth/redefinir-senha-service";

// O token vai na URL: não vazar para outro site pelo Referer.
export const metadata: Metadata = { title: "Nova senha", referrer: "no-referrer" };

export default async function RedefinirSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  // Só leitura: quem consome o token é o better-auth, ao salvar a senha.
  if (typeof token !== "string" || !(await linkDeRedefinicaoValido(token))) {
    return <LinkRedefinicaoInvalido mensagem={MENSAGEM_LINK_INVALIDO} />;
  }
  return <RedefinirSenhaForm token={token} />;
}
