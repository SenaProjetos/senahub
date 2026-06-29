import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { inputsPorToken } from "@/modules/inputs/queries";
import { prePopularRespostas } from "@/modules/inputs/briefing-schema";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { InputsPublicForm } from "@/components/inputs/inputs-public-form";
import { BriefingPublico } from "@/components/inputs/briefing-public";

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

  const disciplinas = projeto.disciplinas.map((d) => d.nome);
  const respostasBriefing = prePopularRespostas(
    (projeto.briefing?.respostasJson as Record<string, unknown> | null) ?? {},
    {
      nome: projeto.cliente?.nome,
      email: projeto.cliente?.email,
      telefone: projeto.cliente?.telefone,
      endereco: projeto.endereco ?? undefined,
    },
  );

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <div>
        <p className="font-mono text-xs text-muted-foreground">{formatarCodigo(projeto.codigo)}</p>
        <h1 className="text-2xl font-extrabold tracking-tight">{projeto.nome}</h1>
        <p className="text-sm text-muted-foreground">
          Preencha as informações abaixo. Suas respostas são salvas automaticamente.
        </p>
      </div>

      <BriefingPublico token={token} respostasIniciais={respostasBriefing} disciplinas={disciplinas} />

      {itens.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Perguntas extras</h2>
          <InputsPublicForm token={token} itens={itens} />
        </div>
      )}
    </main>
  );
}
