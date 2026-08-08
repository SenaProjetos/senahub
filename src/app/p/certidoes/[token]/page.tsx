import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { conteudoPublicoPorToken } from "@/modules/certidoes/link-publico";
import { CertidoesPublicoView } from "@/components/certidoes/certidoes-publico-view";

export const metadata: Metadata = { title: "Certidões", robots: { index: false } };

export default async function CertidoesPublicoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const certidoes = await conteudoPublicoPorToken(token);

  // Token inexistente, revogado, expirado ou sem certidão liberada → mensagem neutra
  // (não revela se o link já existiu).
  if (!certidoes) {
    return (
      <main className="mx-auto flex min-h-[60svh] max-w-md flex-col items-center justify-center px-4 text-center">
        <ShieldCheck className="mb-3 size-10 text-muted-foreground" />
        <h1 className="text-lg font-bold">Link indisponível</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Este link de certidões não está mais ativo ou expirou. Solicite um novo link ao responsável.
        </p>
      </main>
    );
  }

  return <CertidoesPublicoView token={token} certidoes={certidoes} />;
}
