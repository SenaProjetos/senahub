import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { usuariosInternos } from "@/modules/projetos/queries";
import { SeletorPessoaTrabalho } from "@/components/projetos/seletor-pessoa-trabalho";
import { minhasAtividades, minhasDisciplinas } from "@/modules/projetos/meu-trabalho/queries";
import { MinhasAtividades } from "@/components/projetos/minhas-atividades";
import { CabecalhoPagina } from "@/components/shell/cabecalho-pagina";
import { STATUS_LABEL, STATUS_CHIP, STATUS_TEXT } from "@/modules/projetos/status";
import { DisciplinaIcone } from "@/components/projetos/disciplina-icone";
import { formatarData } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Meu trabalho" };

/**
 * Quem pode ver o trabalho DE OUTRA PESSOA. `recursos:ver` é a permissão que já significa
 * "enxergar a alocação das pessoas" (é o gate da matriz de Recursos) — reusar evita criar uma
 * permissão nova só para esta tela, e mantém as duas visões sob a mesma decisão de acesso.
 */
const PERMISSAO_VER_DE_OUTROS = { recurso: "recursos", acao: "ver" } as const;

export default async function MeuTrabalhoPage({
  searchParams,
}: {
  searchParams: Promise<{ usuario?: string }>;
}) {
  const user = await requirePermission("projetos", "ver");
  const { usuario } = await searchParams;

  const podeVerDeOutros = await can(user, PERMISSAO_VER_DE_OUTROS.recurso, PERMISSAO_VER_DE_OUTROS.acao);
  // Gate no SERVIDOR, não no seletor: sem isto, bastaria digitar `?usuario=<id>` na barra de
  // endereços para ler a carteira de qualquer pessoa. `alvoId` só é diferente do próprio usuário
  // quando a permissão confirma.
  const alvoId = podeVerDeOutros && usuario && usuario !== user.id ? usuario : user.id;
  const vendoOutraPessoa = alvoId !== user.id;

  const [disciplinas, atividades, pessoas] = await Promise.all([
    minhasDisciplinas(alvoId),
    minhasAtividades(alvoId),
    podeVerDeOutros ? usuariosInternos() : Promise.resolve([]),
  ]);
  const alvo = vendoOutraPessoa ? pessoas.find((p) => p.id === alvoId) : null;

  const atrasadas = disciplinas.filter((d) => d.atraso > 0);
  const nosPrazos = disciplinas.filter((d) => d.atraso === 0);

  function DisciplinaRow({ d }: { d: (typeof disciplinas)[number] }) {
    return (
      <Link
        href={`/projetos/${d.projetoId}`}
        className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors"
      >
        <DisciplinaIcone nome={d.nome} className={cn("size-4 shrink-0", STATUS_TEXT[d.status])} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-sm">{d.nome}</p>
          <p className="truncate text-xs text-muted-foreground">
            <span className="font-mono">{d.projetoCodigo}</span> · {d.projetoNome}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {d.prazo && (
            <span className={cn("text-xs", d.atraso > 0 ? "text-destructive font-medium" : "text-muted-foreground")}>
              {d.atraso > 0 ? `Atrasada ${d.atraso}d` : formatarData(d.prazo)}
            </span>
          )}
          <Badge variant="outline" className={cn("text-xs", STATUS_CHIP[d.status])}>
            {STATUS_LABEL[d.status]}
          </Badge>
        </div>
      </Link>
    );
  }

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo={vendoOutraPessoa ? `Trabalho de ${alvo?.name ?? "—"}` : "Meu trabalho"}
        descricao={
          vendoOutraPessoa
            ? "Atividades e disciplinas desta pessoa em projetos ativos."
            : "Suas atividades e as disciplinas em que você é responsável, em projetos ativos."
        }
        acoes={
          podeVerDeOutros ? <SeletorPessoaTrabalho pessoas={pessoas} selecionado={vendoOutraPessoa ? alvoId : null} /> : undefined
        }
      />

      <MinhasAtividades
        projetos={atividades.projetos}
        statusConcluidoId={atividades.statusConcluidoId}
        podeConcluir={!vendoOutraPessoa}
      />

      {disciplinas.length === 0 ? (
        atividades.projetos.length === 0 && (
          <EmptyState icon={Briefcase} title={vendoOutraPessoa ? "Nenhuma atividade nem disciplina atribuída a esta pessoa em projetos ativos." : "Nenhuma atividade nem disciplina atribuída a você em projetos ativos."} />
        )
      ) : (
        <div className="space-y-4">
          {atrasadas.length > 0 && (
            <Card className="border-destructive/40">
              <CardHeader className="pb-1 pt-4">
                <CardTitle className="text-sm text-destructive">
                  Atrasadas ({atrasadas.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {atrasadas.map((d) => <DisciplinaRow key={d.disciplinaId} d={d} />)}
                </div>
              </CardContent>
            </Card>
          )}

          {nosPrazos.length > 0 && (
            <Card>
              <CardHeader className="pb-1 pt-4">
                <CardTitle className="text-sm text-muted-foreground">
                  Em andamento ({nosPrazos.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {nosPrazos.map((d) => <DisciplinaRow key={d.disciplinaId} d={d} />)}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
