import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, Folder, ListTree } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { inicioDoDiaUtc } from "@/lib/data";
import { montarCalendario, paraDia } from "@/modules/planejamento/agenda";
import { podeVerDatasDoPlanejamento } from "@/modules/planejamento/acesso";
import { catalogosParaMapear, modeloParaRevisar } from "@/modules/planejamento/modelos/service";
import { formatarDataHora } from "@/lib/utils";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CollapsibleSection } from "@/components/ui/collapsible";
import { ModeloEapEditor } from "@/components/planejamento/modelos/modelo-eap-editor";

export const metadata: Metadata = { title: "Modelo de EAP" };

/**
 * O modelo por inteiro, no Gantt da EAP do projeto. Quem monta a EAP (`planejamento:gerir`) edita aqui
 * mesmo (plano 2026-09-27-editar-modelo-eap) — não precisa mais reimportar o arquivo para mudar um
 * detalhe; quem só vê tem o Gantt em leitura. A lista da conferência da importação fica abaixo.
 */
export default async function ModeloEapPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("planejamento", "ver");
  const { id } = await params;
  const [modelo, podeEditar, verDatas] = await Promise.all([
    modeloParaRevisar(id),
    can(user, "planejamento", "gerir"),
    podeVerDatasDoPlanejamento(user),
  ]);
  if (!modelo) notFound();

  const estrutura = modelo.estrutura;
  const hoje = paraDia(inicioDoDiaUtc());
  const ano = Number(hoje.slice(0, 4));
  // O calendário do motor (feriados do banco), para o Gantt do modelo agendar como o do projeto. Quatro anos
  // cobrem qualquer início de referência plausível; fora deles só falta sombrear feriado.
  const [calendario, catalogos] = estrutura
    ? await Promise.all([montarCalendario([ano - 1, ano, ano + 1, ano + 2, ano + 3]), catalogosParaMapear()])
    : [null, null];

  return (
    <div className="space-y-4">
      <CabecalhoPagina
        titulo={modelo.nome}
        descricao={
          podeEditar
            ? "Edite como na EAP do projeto: na célula, nas predecessoras e no menu da linha. Salve no fim."
            : "A estrutura do modelo, como ela entra num projeto."
        }
        trilha={[
          { href: "/", label: "Início" },
          { href: "/planejamento", label: "Planejamento" },
          { href: "/planejamento/modelos", label: "Modelos de EAP" },
          { label: modelo.nome },
        ]}
        acoes={
          <Button variant="outline" size="sm" render={<Link href="/planejamento/modelos" />}>
            <ArrowLeft className="size-3.5" /> Modelos
          </Button>
        }
      />
      <p className="text-xs text-muted-foreground">
        {modelo.arquivoNome ? `Importado de ${modelo.arquivoNome} · ` : ""}atualizado em {formatarDataHora(modelo.updatedAt)}
        {modelo.descricao ? ` · ${modelo.descricao}` : ""}
      </p>

      {!estrutura || !calendario || !catalogos ? (
        <p className="rounded-sm border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          Este modelo foi gravado num formato que o sistema não lê mais. Importe o arquivo do MS Project de
          novo para recriá-lo.
        </p>
      ) : (
        <>
          <ModeloEapEditor
            modeloId={modelo.id}
            versao={modelo.updatedAt.toISOString()}
            linhasIniciais={estrutura.linhas}
            calendario={{ diasUteis: [...calendario.diasSemana], feriados: [...calendario.feriados] }}
            hoje={hoje}
            disciplinas={catalogos.disciplinas.map((d) => ({ id: d.id, nome: d.nome }))}
            fases={catalogos.fases.map((f) => ({ id: f.id, nome: f.nome, sigla: f.sigla ?? null }))}
            podeEditar={podeEditar}
            verDatas={verDatas}
          />

          {modelo.nomes.length > 0 && (
            <CollapsibleSection
              titulo="O que cada nome do arquivo virou"
              descricao="A conferência da importação: cada agrupamento do arquivo e a disciplina ou fase que ele virou."
              resumo={<span className="text-xs text-muted-foreground tabular-nums">{modelo.nomes.length} nomes</span>}
            >
              <ul className="divide-y rounded-sm border text-sm">
                {modelo.nomes.map((n) => (
                  <li key={n.chave} className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5">
                    <span className="truncate">{n.origem}</span>
                    <Badge variant={n.tipo === "agrupamento" ? "outline" : "secondary"}>
                      {n.tipo === "fase" ? (
                        <Folder className="size-3" />
                      ) : n.tipo === "disciplina" ? (
                        <ListTree className="size-3" />
                      ) : (
                        <Building2 className="size-3" />
                      )}
                      {n.tipo === "agrupamento" ? "agrupamento" : n.virou}
                    </Badge>
                  </li>
                ))}
              </ul>
            </CollapsibleSection>
          )}
        </>
      )}
    </div>
  );
}
