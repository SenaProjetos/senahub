import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { inputsPorToken } from "@/modules/inputs/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { InputsPublicForm } from "@/components/inputs/inputs-public-form";

export const metadata: Metadata = { title: "Formulário do projeto", robots: { index: false } };

export default async function InputsPublicoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const projeto = await inputsPorToken(token);
  if (!projeto) notFound();

  const itens = projeto.inputs.map((i) => ({
    id: i.id,
    disciplina: i.disciplina,
    pergunta: i.pergunta,
    resposta: i.resposta ?? "",
  }));

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6">
        <p className="font-mono text-xs text-muted-foreground">{formatarCodigo(projeto.codigo)}</p>
        <h1 className="text-2xl font-extrabold tracking-tight">{projeto.nome}</h1>
        <p className="text-sm text-muted-foreground">
          Preencha as informações abaixo. Suas respostas são salvas automaticamente.
        </p>
      </div>
      <InputsPublicForm token={token} itens={itens} />
    </main>
  );
}
