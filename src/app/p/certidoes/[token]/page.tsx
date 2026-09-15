import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { conteudoPublicoPorToken } from "@/modules/certidoes/link-publico";
import { CertidoesPublicoView } from "@/components/certidoes/certidoes-publico-view";
import { metadataPublica } from "@/lib/metadata-publica";
import { LinkIndisponivel } from "@/components/publico/link-indisponivel";

export const metadata: Metadata = metadataPublica({
  titulo: "Certidões",
  descricao: "Consulte as certidões disponibilizadas.",
});

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
      <LinkIndisponivel
        icone={ShieldCheck}
        mensagem="Este link de certidões não está mais ativo ou expirou. Solicite um novo link ao responsável."
      />
    );
  }

  return <CertidoesPublicoView token={token} certidoes={certidoes} />;
}
