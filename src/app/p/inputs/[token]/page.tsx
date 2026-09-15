import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { inputsPorToken } from "@/modules/inputs/queries";
import { prePopularRespostas } from "@/modules/inputs/briefing-schema";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { InputsPublicForm } from "@/components/inputs/inputs-public-form";
import { BriefingPublico } from "@/components/inputs/briefing-public";
import { metadataPublica } from "@/lib/metadata-publica";
import { CabecalhoPublico } from "@/components/publico/cabecalho-publico";
import { LinkIndisponivel } from "@/components/publico/link-indisponivel";

export const metadata: Metadata = metadataPublica({
  titulo: "Formulário do projeto",
  descricao: "Preencha as informações solicitadas para o projeto.",
});

export default async function InputsPublicoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const projeto = await inputsPorToken(token);

  // Token inexistente, revogado ou expirado → mensagem neutra (não revela se o link
  // já existiu, nem qual projeto).
  if (!projeto) {
    return (
      <LinkIndisponivel
        icone={ClipboardList}
        mensagem="Este formulário não está mais ativo ou expirou. Solicite um novo link ao responsável pelo projeto."
      />
    );
  }

  const itens = projeto.inputs.map((i) => ({
    id: i.id,
    disciplina: i.disciplina,
    pergunta: i.pergunta,
    resposta: i.resposta ?? "",
  }));

  const disciplinas = projeto.disciplinas.map((d) => d.disciplinaTextoLegado);
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
      <CabecalhoPublico
        icone={ClipboardList}
        rotulo="Formulário do projeto"
        codigo={formatarCodigo(projeto.codigo)}
        titulo={projeto.nome}
        descricao="Preencha as informações abaixo. Suas respostas são salvas automaticamente."
      />

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
