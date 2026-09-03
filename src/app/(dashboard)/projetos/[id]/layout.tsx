import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronRight, MessageSquare } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/permissions";
import { obterProjetoMinimo, abasComConteudo } from "@/modules/projetos/queries";
import type { AbaConfigItem } from "@/modules/projetos/abas";
import { listarClientes } from "@/modules/clientes/queries";
import { canalDoProjeto } from "@/modules/chat/queries";
import { modelosPorFonte } from "@/modules/documentos/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { SITUACAO_PROJETO_LABEL, TIPO_PROJETO_LABEL } from "@/modules/projetos/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DuplicarProjetoButton } from "@/components/projetos/duplicar-projeto-button";
import { GerarDocumentoButton } from "@/components/documentos/gerar-documento-button";
import { ProjetoTabNav } from "@/components/projetos/projeto-tab-nav";
import { ProjetoAcoesMenu } from "@/components/projetos/projeto-acoes-menu";
import { EditarProjetoDialog } from "@/components/projetos/editar-projeto-dialog";
import { inicioDoDia, inicioDoDiaLocal } from "@/lib/data";

export const metadata: Metadata = { title: "Projeto" };

export default async function ProjetoLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("projetos", "ver");
  const { id } = await params;
  const projeto = await obterProjetoMinimo(user, id);
  if (!projeto) notFound();

  const [
    podeGerir,
    podeVerFinanceiro,
    podeHistorico,
    podeCoordenacao,
    podeCustos,
    podeServicos,
    podeArts,
    podeDiario,
    podeExtras,
    canalChat,
    modelosDoc,
    conteudoPorAba,
  ] = await Promise.all([
    can(user, "projetos", "gerir"),
    can(user, "financeiro", "ver"),
    can(user, "projetos", "historico"),
    can(user, "coordenacao", "ver"),
    can(user, "custos", "ver"),
    // F4 (2026-09-02): Serviços, ARTs, Diário e Extras não tinham gate nenhum (Diário só
    // `INTERNAL_ROLES`). A permissão é o TETO e o `abasConfig` do projeto recorta DENTRO dela
    // (decisão do dono, opção C): sem o par, a aba nunca aparece; com o par, aparece se aquele
    // projeto a mantiver ligada. Semeadas para quem tem `projetos:ver`, então ninguém perdeu aba.
    can(user, "projetos", "servicos"),
    can(user, "projetos", "arts"),
    can(user, "projetos", "diario"),
    can(user, "projetos", "extras"),
    canalDoProjeto(id),
    modelosPorFonte("projeto"),
    abasComConteudo(id),
  ]);
  // Item 12 (beta): editar todos os campos do projeto — só busca clientes se puder editar.
  const clientes = podeGerir ? await listarClientes({ incluirInativos: false }) : [];

  const diasAtraso = (() => {
    // Banner interno → prazo planejado.
    if (!projeto.prazoPlanejado || projeto.situacao !== "em_andamento") return 0;
    // `inicioDoDia` normaliza a meia-noite UTC do banco: `setHours(0,…)` direto
    // recuava o vencimento um dia em America/Sao_Paulo.
    const venc = inicioDoDia(projeto.prazoPlanejado);
    if (!venc) return 0;
    return Math.max(0, Math.floor((inicioDoDiaLocal().getTime() - venc.getTime()) / 86_400_000));
  })();

  return (
    <div className="space-y-0">
      {/* Cabeçalho */}
      <div className="border-b pb-4">
        <nav aria-label="Navegação estrutural" className="mb-3 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/" className="hover:text-foreground">Início</Link>
          <ChevronRight className="size-3" aria-hidden />
          <Link href="/projetos" className="hover:text-foreground">Projetos</Link>
          <ChevronRight className="size-3" aria-hidden />
          <span aria-current="page">Detalhe</span>
        </nav>
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" render={<Link href="/projetos" aria-label="Voltar para projetos" />}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold text-muted-foreground">
                {formatarCodigo(projeto.codigo)}
              </span>
              <h1 className="truncate text-xl font-extrabold tracking-tight sm:text-2xl">{projeto.nome}</h1>
              <Badge variant="outline">{TIPO_PROJETO_LABEL[projeto.tipo] ?? projeto.tipo}</Badge>
              <Badge variant="outline">{SITUACAO_PROJETO_LABEL[projeto.situacao]}</Badge>
              {diasAtraso > 0 && (
                <Badge variant="destructive">
                  {diasAtraso} {diasAtraso === 1 ? "dia" : "dias"} de atraso
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              <Link href={`/clientes/${projeto.cliente.id}`} className="hover:underline">
                {projeto.cliente.nome}
              </Link>
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {canalChat && (
            <Button variant="outline" size="sm" render={<Link href={`/chat?c=${canalChat.id}`} />}>
              <MessageSquare className="size-4" /> Chat
            </Button>
          )}
          {podeGerir && (
            <EditarProjetoDialog
              projeto={{
                id: projeto.id,
                nome: projeto.nome,
                tipo: projeto.tipo,
                situacao: projeto.situacao,
                descricao: projeto.descricao,
                areaM2: projeto.areaM2 != null ? Number(projeto.areaM2) : null,
                endereco: projeto.endereco,
                prazoContrato: projeto.prazoContrato ? projeto.prazoContrato.toISOString().slice(0, 10) : null,
                prazoPlanejado: projeto.prazoPlanejado ? projeto.prazoPlanejado.toISOString().slice(0, 10) : null,
                valorContrato: projeto.valorContrato != null ? Number(projeto.valorContrato) : null,
                clienteId: projeto.cliente.id,
                abasConfig: (projeto.abasConfig as AbaConfigItem[] | null) ?? null,
              }}
              clientes={clientes.map((c) => ({ id: c.id, nome: c.nome }))}
            />
          )}
          {podeGerir && <DuplicarProjetoButton projetoId={id} />}
          <GerarDocumentoButton modelos={modelosDoc} paramId="projetoId" valor={id} />
          {podeGerir && <ProjetoAcoesMenu projetoId={id} situacao={projeto.situacao} />}
          </div>
        </div>
      </div>

      {/* Navegação por abas */}
      <ProjetoTabNav
        projetoId={id}
        conteudoPorAba={conteudoPorAba}
        abasConfig={projeto.abasConfig as AbaConfigItem[] | null}
        abasVisiveis={[
          "",
          "/disciplinas",
          "/inputs",
          ...(podeVerFinanceiro ? ["/financeiro"] : []),
          "/lista-mestre",
          ...(podeServicos ? ["/servicos"] : []),
          "/arquivos",
          ...(podeArts ? ["/arts"] : []),
          ...(podeCoordenacao ? ["/coordenacao"] : []),
          ...(podeCustos ? ["/custos"] : []),
          ...(podeDiario ? ["/diario"] : []),
          ...(podeExtras ? ["/extras"] : []),
          // Histórico (CDE) só para admin ou cargos autorizados em Configurações.
          ...(podeHistorico ? ["/historico"] : []),
        ]}
      />

      {/* Conteúdo da aba ativa */}
      <div className="pt-6">{children}</div>
    </div>
  );
}
