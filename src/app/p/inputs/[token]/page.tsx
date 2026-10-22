import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { inputsPorToken } from "@/modules/inputs/queries";
import {
  aplicarOcultos,
  filtrarSecoes,
  prePopularRespostas,
  respostasVisiveis,
} from "@/modules/inputs/briefing-schema";
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
  const ocultos = {
    secoes: projeto.briefing?.secoesOcultas ?? [],
    campos: projeto.briefing?.camposOcultos ?? [],
  };
  const secoesVisiveis = aplicarOcultos(filtrarSecoes(disciplinas), ocultos);
  // Resposta de campo oculto não sai do servidor (a gravação mescla, então ela fica guardada).
  const respostasBriefing = respostasVisiveis(
    prePopularRespostas(
    (projeto.briefing?.respostasJson as Record<string, unknown> | null) ?? {},
    {
      nome: projeto.cliente?.nome,
      email: projeto.cliente?.email,
      telefone: projeto.cliente?.telefone,
      endereco: projeto.endereco ?? undefined,
    },
    ),
    secoesVisiveis,
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

      <BriefingPublico
        token={token}
        respostasIniciais={respostasBriefing}
        disciplinas={disciplinas}
        ocultos={ocultos}
      />

      {secoesVisiveis.length === 0 && itens.length === 0 && (
        <p className="rounded-sm border bg-card p-6 text-center text-sm text-muted-foreground">
          Não há nada para preencher neste formulário no momento. Aguarde o contato da equipe.
        </p>
      )}

      {itens.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Perguntas extras</h2>
          <InputsPublicForm token={token} itens={itens} />
        </div>
      )}
    </main>
  );
}
