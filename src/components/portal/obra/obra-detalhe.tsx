import Link from "next/link";
import { notFound } from "next/navigation";
import { Box, Download, FileStack, MapPin } from "lucide-react";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { conteudoTemZip } from "@/modules/projetos/arquivos/link-publico-regras";
import { obraParaVer } from "@/modules/portal/obra/queries";
import { modelosParaVerNoPortal } from "@/modules/portal/modelo3d/queries";
import { temModelo3dNoPortal } from "@/modules/portal/modelo3d/regras";
import type { UsuarioDaSessao } from "@/modules/portal/acesso";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { EntregasDaObra } from "@/components/portal/obra/entregas-da-obra";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * A obra para a conta de obra (spec 2026-11-25): cabeçalho, endereço e a pasta "Liberado para obra" (ver, baixar, .zip, ARTs)
 * com o atalho do modelo 3D. Componente próprio, nunca a página do cliente com cartões escondidos: um cartão novo do cliente
 * não aparece aqui.
 */
export async function ObraDetalhe({ user, projetoId }: { user: UsuarioDaSessao; projetoId: string }) {
  const obra = await obraParaVer(user, projetoId);
  if (!obra) notFound();
  const { projeto, conteudo } = obra;
  // Os modelos só põem o atalho "Modelo 3D" e o olho do IFC: se a leitura falhar, a pasta sai sem eles.
  const modelos = await modelosParaVerNoPortal(user, projeto.id).catch((e: unknown) => {
    console.error("[obra] modelos 3D não carregaram:", e);
    return null;
  });
  const modeloPorUpload: Record<string, string> = {};
  for (const m of modelos ?? []) if (m.origemUploadId) modeloPorUpload[m.origemUploadId] = m.modeloId;
  const temModelo3d = temModelo3dNoPortal(modelos ?? []);
  const total = conteudo ? conteudo.situacoes.reduce((n, s) => n + s.total, 0) + conteudo.arts.length : 0;
  const base = `/api/portal/projetos/${projeto.id}/arquivos`;
  const temZip = !!conteudo && conteudoTemZip(conteudo);

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo={projeto.nome}
        descricao={formatarCodigo(projeto.codigo)}
        trilha={[{ label: "Minhas obras", href: "/portal" }, { label: projeto.nome }]}
      />
      {projeto.endereco && (
        <p className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="size-4 shrink-0" aria-hidden /> <span className="truncate">{projeto.endereco}</span>
        </p>
      )}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base">Liberado para obra</CardTitle>
          {(temZip || temModelo3d) && (
            <div className="flex flex-wrap gap-2">
              {temModelo3d && (
                <Button size="sm" variant="outline" render={<Link href={`/portal/${projeto.id}/modelo`} />}>
                  <Box className="size-4" /> Modelo 3D
                </Button>
              )}
              {temZip && (
                <Button size="sm" variant="outline" render={<a href={`${base}/zip`} rel="noopener" />}>
                  <Download className="size-4" /> Baixar tudo (.zip)
                </Button>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className="p-2 pt-0">
          {conteudo && total > 0 ? (
            <div className="divide-y">
              <EntregasDaObra base={base} conteudo={conteudo} projetoId={projeto.id} modeloPorUpload={modeloPorUpload} />
            </div>
          ) : (
            <EmptyState
              icon={FileStack}
              title="Nenhuma prancha liberada para obra ainda."
              description="Quando o escritório liberar pranchas para a execução, elas aparecem aqui."
            />
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Vale sempre a revisão mostrada aqui. Uma cópia baixada antes pode estar desatualizada.
      </p>
    </div>
  );
}
