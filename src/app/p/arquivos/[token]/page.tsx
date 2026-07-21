import type { Metadata } from "next";
import { FolderOpen } from "lucide-react";
import { conteudoPublicoPorToken } from "@/modules/projetos/arquivos/link-publico";
import { ArquivosPublicoView } from "@/components/arquivos/arquivos-publico-view";

export const metadata: Metadata = { title: "Arquivos do projeto", robots: { index: false } };

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
      <main className="mx-auto flex min-h-[60svh] max-w-md flex-col items-center justify-center px-4 text-center">
        <FolderOpen className="mb-3 size-10 text-muted-foreground" />
        <h1 className="text-lg font-bold">Link indisponível</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Este link de arquivos não está mais ativo ou expirou. Solicite um novo link ao responsável pelo projeto.
        </p>
      </main>
    );
  }

  return <ArquivosPublicoView token={token} conteudo={conteudo} />;
}
