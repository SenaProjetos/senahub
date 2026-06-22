import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { projetoVisivel, eapDoProjeto } from "@/modules/planejamento/queries";
import { Gantt } from "@/components/planejamento/gantt";
import { formatarCodigo } from "@/modules/projetos/numbering";

export default async function PrintCronogramaPage({
  params,
}: {
  params: Promise<{ projetoId: string }>;
}) {
  const { projetoId } = await params;
  const user = await requirePermission("planejamento", "ver");
  const projeto = await projetoVisivel(user, projetoId);
  if (!projeto) notFound();

  const { tarefas } = await eapDoProjeto(projetoId);

  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <title>{`Cronograma — ${projeto.codigo} · ${projeto.nome}`}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: system-ui, sans-serif; font-size: 12px; background: #fff; color: #111; padding: 16px; }
          h1 { font-size: 15px; font-weight: 700; margin-bottom: 4px; }
          p { font-size: 11px; color: #666; margin-bottom: 12px; }
          @media print { body { padding: 8px; } }
        `}</style>
      </head>
      <body>
        <h1>Cronograma — <span style={{ fontFamily: "monospace" }}>{formatarCodigo(projeto.codigo)}</span> · {projeto.nome}</h1>
        <p>Gerado em {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</p>
        {tarefas.length === 0 ? (
          <p>Nenhuma tarefa cadastrada na EAP.</p>
        ) : (
          <Gantt tarefas={tarefas} px={12} />
        )}
      </body>
    </html>
  );
}
