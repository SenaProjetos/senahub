import type { Metadata } from "next";
import { FolderOpen } from "lucide-react";
import { conteudoPublicoPorToken } from "@/modules/projetos/arquivos/link-publico";
import { metadataPublica } from "@/lib/metadata-publica";
import { ArquivosPublicoView } from "@/components/arquivos/arquivos-publico-view";
import { LinkIndisponivel } from "@/components/publico/link-indisponivel";

export const metadata: Metadata = metadataPublica({
  titulo: "Arquivos do projeto",
  descricao: "Baixe os arquivos liberados para você.",
});

export default async function ArquivosPublicoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const conteudo = await conteudoPublicoPorToken(token);

  // Token inexistente, revogado, expirado ou sem disciplina liberada → mensagem neutra
  // (não revela se o link já existiu). Nunca expõe conteúdo do projeto.
  if (!conteudo) {
    return (
      <LinkIndisponivel
        icone={FolderOpen}
        mensagem="Este link de arquivos não está mais ativo ou expirou. Solicite um novo link ao responsável pelo projeto."
      />
    );
  }

  return <ArquivosPublicoView token={token} conteudo={conteudo} />;
}
