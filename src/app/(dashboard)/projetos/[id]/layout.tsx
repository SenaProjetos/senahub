import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
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
import { ProjetoTabNav } from "@/components/projetos/projeto-tab-nav";
import { RotuloDaBarra } from "@/components/shell/rotulo-da-barra";
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
    canalChat,
    modelosDoc,
    conteudoPorAba,
    tiposEmpreendimento,
  ] = await Promise.all([
    can(user, "projetos", "gerir"),
    can(user, "financeiro", "ver"),
    can(user, "projetos", "historico"),
    can(user, "coordenacao", "ver"),
    can(user, "custos", "ver"),
    // F4 (2026-09-02): Serviços, ARTs e Diário não tinham gate nenhum (Diário só
    // `INTERNAL_ROLES`). A permissão é o TETO e o `abasConfig` do projeto recorta DENTRO dela
    // (decisão do dono, opção C): sem o par, a aba nunca aparece; com o par, aparece se aquele
    // projeto a mantiver ligada. Semeadas para quem tem `projetos:ver`, então ninguém perdeu aba.
    can(user, "projetos", "servicos"),
    can(user, "projetos", "arts"),
    can(user, "projetos", "diario"),
    canalDoProjeto(id),
    modelosPorFonte("projeto"),
    abasComConteudo(id),
    // D13: tipos de empreendimento para o diálogo de edição (o campo sugere o modelo de EAP).
    prisma.tipoEmpreendimento.findMany({
      where: { ativo: true },
      select: { id: true, nome: true },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    }),
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

  const projetoEditavel = {
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
    tipoEmpreendimentoId: projeto.tipoEmpreendimentoId,
    abasConfig: (projeto.abasConfig as AbaConfigItem[] | null) ?? null,
  };

  return (
    <div>
      <RotuloDaBarra
        prefixo={`/projetos/${id}`}
        segmento={id}
        nome={`${formatarCodigo(projeto.codigo)} ${projeto.nome}`}
        tituloCelular={projeto.nome}
        trilhaCelular={`Projetos › ${formatarCodigo(projeto.codigo)} · ${SITUACAO_PROJETO_LABEL[projeto.situacao]}`}
      />
      {/* Cabeçalho do projeto: uma linha de 44 px colada na barra do topo (modelo aprovado, Fase 1).
          No celular não aparece: o nome vai para a barra do topo e as ações para o ⋯ das abas. */}
      <div
        className="-mx-4 -mt-4 hidden h-11 min-w-0 items-center gap-2.5 border-b px-6 md:flex lg:-mx-6 lg:-mt-6"
        data-foco-esconder
      >
        <Link
          href="/projetos"
          aria-label="Voltar para projetos"
          className="grid size-7 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <span className="shrink-0 font-mono text-sm font-semibold text-muted-foreground">
          {formatarCodigo(projeto.codigo)}
        </span>
        <h1 className="min-w-0 truncate text-lg font-extrabold tracking-tight">{projeto.nome}</h1>
        <Link
          href={`/clientes/${projeto.cliente.id}`}
          className="min-w-0 shrink truncate text-sm text-muted-foreground hover:underline"
        >
          · {projeto.cliente.nome}
        </Link>
        <Badge variant="outline" className="shrink-0">{TIPO_PROJETO_LABEL[projeto.tipo] ?? projeto.tipo}</Badge>
        <Badge variant="outline" className="shrink-0">{SITUACAO_PROJETO_LABEL[projeto.situacao]}</Badge>
        {diasAtraso > 0 && (
          <Badge variant="destructive" className="shrink-0">
            {diasAtraso} {diasAtraso === 1 ? "dia" : "dias"} de atraso
          </Badge>
        )}
        <span className="flex-1" />
        {canalChat && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            render={<Link href={`/chat?c=${canalChat.id}`} aria-label="Chat do projeto" title="Chat do projeto" />}
          >
            <MessageSquare className="size-4" />
          </Button>
        )}
        {podeGerir && (
          <EditarProjetoDialog
            gatilho="icone"
            projeto={projetoEditavel}
            clientes={clientes.map((c) => ({ id: c.id, nome: c.nome }))}
            tiposEmpreendimento={tiposEmpreendimento}
          />
        )}
        <ProjetoAcoesMenu projetoId={id} situacao={projeto.situacao} podeGerir={podeGerir} modelosDoc={modelosDoc} />
      </div>

      {/* Navegação por abas */}
      <div className="-mx-4 -mt-4 flex items-stretch border-b md:mt-0 lg:-mx-6" data-foco-celular>
        <div className="min-w-0 flex-1 px-2 lg:px-4">
          <ProjetoTabNav
            projetoId={id}
            conteudoPorAba={conteudoPorAba}
            abasConfig={projeto.abasConfig as AbaConfigItem[] | null}
            abasVisiveis={[
              "",
              "/disciplinas",
              "/inputs",
              ...(podeVerFinanceiro ? ["/financeiro"] : []),
              ...(podeServicos ? ["/servicos"] : []),
              "/arquivos",
              ...(podeArts ? ["/arts"] : []),
              ...(podeCoordenacao ? ["/coordenacao"] : []),
              ...(podeCustos ? ["/custos"] : []),
              ...(podeDiario ? ["/diario"] : []),
              // Histórico (CDE) só para admin ou cargos autorizados em Configurações.
              ...(podeHistorico ? ["/historico"] : []),
            ]}
          />
        </div>
        <div className="flex shrink-0 items-center border-l px-2 md:hidden">
          <ProjetoAcoesMenu
            celular
            projetoId={id}
            situacao={projeto.situacao}
            podeGerir={podeGerir}
            modelosDoc={modelosDoc}
            canalChatId={canalChat?.id ?? null}
            editar={
              podeGerir
                ? {
                    projeto: projetoEditavel,
                    clientes: clientes.map((c) => ({ id: c.id, nome: c.nome })),
                    tiposEmpreendimento,
                  }
                : null
            }
          />
        </div>
      </div>

      {/* Conteúdo da aba ativa: 12 px abaixo das abas e 16 px nas laterais, como no modelo */}
      <div className="pt-3 lg:-mx-2">{children}</div>
    </div>
  );
}
