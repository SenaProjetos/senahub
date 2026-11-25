import Link from "next/link";
import { notFound } from "next/navigation";
import { Box, Download } from "lucide-react";
import { modelosParaVerNoPortal } from "@/modules/portal/modelo3d/queries";
import { motivoSemModelo } from "@/modules/portal/modelo3d/regras";
import { obraParaVer } from "@/modules/portal/obra/queries";
import type { UsuarioDaSessao } from "@/modules/portal/acesso";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { VisualizadorModeloDinamico } from "@/components/portal/modelo3d/visualizador-modelo-dinamico";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

const TEXTO_SEM_MODELO = {
  vazio: {
    titulo: "Esta obra ainda não tem modelo 3D liberado.",
    descricao: "Quando o escritório liberar um modelo IFC para obra, ele aparece aqui.",
  },
  preparando: {
    titulo: "O modelo 3D ainda não está pronto.",
    descricao: "O arquivo IFC está sendo preparado para ver no navegador. Enquanto isso, você pode baixá-lo na pasta da obra.",
  },
  erro: {
    titulo: "O modelo 3D não pôde ser preparado.",
    descricao: "Fale com o escritório. Enquanto isso, você pode baixar o arquivo IFC na pasta da obra.",
  },
} as const;

/**
 * Modelo 3D da conta de obra (spec 2026-11-25): só os IFCs de "Liberado para obra", nunca os enviados pelo cliente; navegação e
 * modo andar ficam, marcação e pedido não.
 */
export async function ModeloDaObra({
  user,
  projetoId,
  searchParams,
}: {
  user: UsuarioDaSessao;
  projetoId: string;
  searchParams: Promise<{ modelo?: string | string[] }>;
}) {
  const obra = await obraParaVer(user, projetoId);
  if (!obra) notFound();
  const modelos = await modelosParaVerNoPortal(user, projetoId);
  if (!modelos) notFound();
  const { modelo } = await searchParams;
  const foco = typeof modelo === "string" ? modelo : null;
  const motivo = motivoSemModelo(modelos.map((m) => m.situacao));
  const texto = motivo ? TEXTO_SEM_MODELO[motivo] : null;
  const nome = obra.projeto.nome;

  return (
    <div className="space-y-3">
      <CabecalhoPagina
        titulo="Modelo 3D"
        descricao={nome}
        trilha={[
          { label: "Minhas obras", href: "/portal" },
          { label: nome, href: `/portal/${projetoId}` },
          { label: "Modelo 3D" },
        ]}
      />
      {!texto ? (
        <VisualizadorModeloDinamico projetoId={projetoId} modelos={modelos} foco={foco} pedir={null} aguardando={[]} />
      ) : (
        <Card>
          <CardContent>
            <EmptyState
              icon={Box}
              title={texto.titulo}
              description={texto.descricao}
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  {modelos
                    .filter((m) => m.origemUploadId)
                    .map((m) => (
                      <Button
                        key={m.modeloId}
                        size="sm"
                        variant="outline"
                        className="max-w-full"
                        render={<a href={`/api/portal/projetos/${projetoId}/arquivos/${m.origemUploadId}`} />}
                      >
                        <Download className="size-4" /> <span className="truncate">Baixar {m.nomeArquivo}</span>
                      </Button>
                    ))}
                  <Button size="sm" variant="ghost" render={<Link href={`/portal/${projetoId}`} />}>
                    Ver a pasta da obra
                  </Button>
                </div>
              }
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
