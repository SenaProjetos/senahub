"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronRight, Flag, Lock, LockOpen, Pencil } from "lucide-react";
import {
  abrirRevisaoPlanejamento,
  alinharDisciplinaAoAgrupamento,
  aprovarCronogramaAction,
  cancelarRevisaoPlanejamento,
  replanejarCronograma,
  definirDataStatus,
  definirInicioProjeto,
} from "@/modules/planejamento/actions";
import { contarPorSeveridade, type Achado } from "@/modules/planejamento/qualidade";
import { rotuloBaseline, type VersaoBaseline } from "@/modules/planejamento/baselines";
import { InicioProjetoDialog } from "@/components/planejamento/inicio-projeto-dialog";
import { FAIXA_COR, SaudeCronogramaPainel, iconeDaFaixa, rotuloFaixa, type ComparativoBase } from "@/components/planejamento/saude-cronograma-painel";
import { formatarData } from "@/lib/utils";
import { dataCurta } from "@/lib/dias-iso";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";

const Separador = () => <span aria-hidden className="hidden h-5 w-px bg-border sm:block" />;

/** Um valor da faixa que se edita num balão (Data de Status, início do projeto). */
function CampoDaFaixa({
  rotulo,
  valor,
  editavel,
  aberto,
  onAbertoChange,
  children,
}: {
  rotulo: string;
  valor: string | null;
  editavel: boolean;
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  children: ReactNode;
}) {
  const conteudo = (
    <>
      <span className="text-muted-foreground">{rotulo}</span>{" "}
      <span className="font-mono">{valor ? formatarData(valor) : "—"}</span>
    </>
  );
  if (!editavel) return <span className="whitespace-nowrap">{conteudo}</span>;
  return (
    <Popover open={aberto} onOpenChange={onAbertoChange}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-1 py-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${rotulo}: ${valor ? formatarData(valor) : "não definido"} — alterar`}
          />
        }
      >
        {conteudo}
        <Pencil className="size-3 text-muted-foreground" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto space-y-2 p-3">
        {children}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Faixa de status do cronograma (mock aprovado em 2026-10-23): numa linha só, a saúde (abre o painel), a situação com a ação
 * dela (Aprovar / Revisar planejamento), a Data de Status, o início do projeto e o custo previsto. Com a revisão aberta, uma
 * segunda linha curta com Cancelar revisão e "Fechar com nova linha de base…". Substitui o antigo painel de saúde.
 *
 * Aprovar RECUSA com erro aberto: são exatamente os achados que o painel mostra em vermelho.
 */
export function FaixaCronograma({
  projetoId,
  hoje,
  podeAprovar,
  podeGerir,
  podeExecutado,
  linhasComDataFixada,
  aprovado,
  emRevisao,
  revisaoAbertaEm,
  revisaoAlterada,
  aprovadoEm,
  dataStatus,
  inicioProjeto,
  ultimaBaseline,
  versoes,
  alocacoesTipadas,
  linhasSemHora,
  achados,
  nota,
  faixa,
  provisoria,
  custo,
  comparativo,
  onVerNaTabela,
}: {
  projetoId: string;
  /** `YYYY-MM-DD` de hoje (servidor). */
  hoje: string;
  podeAprovar: boolean;
  /** `planejamento:gerir` — muda o início do projeto e corrige a disciplina das linhas. */
  podeGerir: boolean;
  podeExecutado: boolean;
  /** Linhas com restrição de data (o alfinete): mudar o início do projeto pergunta se elas andam junto. */
  linhasComDataFixada: number;
  aprovado: boolean;
  /** "Revisar planejamento" aberto: o plano aprovado está destravado até a nova linha de base (`trava-plano.ts`). */
  emRevisao: boolean;
  revisaoAbertaEm: string | null;
  /** O plano mudou nesta revisão — não dá mais para cancelar, só fechar com a nova linha de base. */
  revisaoAlterada: boolean;
  aprovadoEm: string | null;
  dataStatus: string | null;
  inicioProjeto: string | null;
  ultimaBaseline: { numero: number; motivo: string | null; criadaEm: string } | null;
  versoes: VersaoBaseline[];
  /** F5 (D17): quantas alocações digitadas o projeto tem — somem da carga da equipe ao aprovar. */
  alocacoesTipadas: number;
  /** F5: atividades da casa sem NENHUMA hora estimada — aprovar assim some da carga sem substituir. */
  linhasSemHora: number;
  achados: Achado[];
  nota: number | null;
  faixa: string | null;
  provisoria: boolean;
  /** Custo previsto já formatado para a ponta da faixa (`null` = quem olha não vê custo). */
  custo: ReactNode;
  comparativo: ComparativoBase | null;
  onVerNaTabela: (rotulo: string, tarefaIds: string[]) => void;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [painelAberto, setPainelAberto] = useState(false);
  const [statusAberto, setStatusAberto] = useState(false);
  const [inicioAberto, setInicioAberto] = useState(false);
  const [fecharRevisaoAberto, setFecharRevisaoAberto] = useState(false);
  const [novaDataStatus, setNovaDataStatus] = useState(dataStatus ?? hoje);
  const [motivoReplan, setMotivoReplan] = useState("");
  const [novoInicio, setNovoInicio] = useState(inicioProjeto ?? hoje);
  const [perguntaInicio, setPerguntaInicio] = useState(false);
  // O início que veio do servidor mudou (gravou aqui, ou desfez com Ctrl+Z): o campo acompanha.
  const [inicioVisto, setInicioVisto] = useState(inicioProjeto);
  if (inicioProjeto !== inicioVisto) {
    setInicioVisto(inicioProjeto);
    if (inicioProjeto) setNovoInicio(inicioProjeto);
  }

  const travado = aprovado && !emRevisao;
  const contagem = contarPorSeveridade(achados);
  const bloqueiaAprovacao = contagem.erro > 0;
  const Icone = iconeDaFaixa(faixa);

  async function aprovar() {
    // D17: aprovar troca a alocação DIGITADA do projeto pelas horas das linhas. Sem hora estimada em lugar nenhum, o
    // projeto simplesmente some da carga da equipe — e isso só aparece depois, em `/recursos`. Avisa ANTES de aprovar.
    if (alocacoesTipadas > 0 || linhasSemHora > 0) {
      const ok = await confirm({
        title: linhasSemHora > 0 ? "Aprovar sem estimar horas?" : "Aprovar troca a alocação digitada?",
        description: [
          alocacoesTipadas > 0
            ? `${alocacoesTipadas} alocação(ões) digitada(s) deste projeto deixam de contar na carga da equipe — a partir daqui ela vem das horas das linhas.`
            : null,
          linhasSemHora > 0
            ? `${linhasSemHora} atividade(s) da equipe ainda não têm nenhuma hora prevista. Sem hora, elas não entram na carga de ninguém nem no custo.`
            : null,
        ]
          .filter(Boolean)
          .join(" "),
        confirmLabel: "Aprovar assim mesmo",
      });
      if (!ok) return;
    }
    start(async () => {
      const r = await aprovarCronogramaAction({ projetoId });
      if (r.ok) {
        toast.success(`Cronograma aprovado — BL-${String(r.data.baselineNumero).padStart(2, "0")}.`, {
          description: r.data.cardsCriados > 0 ? `${r.data.cardsCriados} card(s) criado(s) no quadro de tarefas de quem está escalado.` : undefined,
        });
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function replanejar() {
    if (!motivoReplan.trim()) {
      toast.error("Explique o motivo da nova linha de base.");
      return;
    }
    start(async () => {
      const r = await replanejarCronograma({ projetoId, motivo: motivoReplan });
      if (r.ok) {
        toast.success(`Nova linha de base — ${rotuloBaseline(r.data.baselineNumero)}.`);
        setMotivoReplan("");
        setFecharRevisaoAberto(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  async function abrirRevisao() {
    const ok = await confirm({
      title: "Revisar o planejamento?",
      description:
        "A estrutura, as durações, as dependências e as restrições ficam liberadas para edição. A revisão fecha com " +
        "uma nova linha de base, com o motivo da mudança — as versões anteriores continuam guardadas. Se nada for " +
        "mudado, dá para cancelar a revisão.",
      confirmLabel: "Revisar planejamento",
    });
    if (!ok) return;
    start(async () => {
      const r = await abrirRevisaoPlanejamento({ projetoId });
      if (r.ok) {
        toast.success("Planejamento em revisão — o plano está liberado para edição.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function cancelarRevisao() {
    start(async () => {
      const r = await cancelarRevisaoPlanejamento({ projetoId });
      if (r.ok) {
        toast.success("Revisão cancelada — o plano voltou a travar.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  async function alinharDisciplinas(tarefaIds: string[]) {
    const ok = await confirm({
      title: "Usar a disciplina do agrupamento?",
      description:
        `${tarefaIds.length === 1 ? "1 linha passa" : `${tarefaIds.length} linhas passam`} para a disciplina (e a fase) do agrupamento em que ` +
        "estão. Quem já está atribuído continua; a linha que estiver sem ninguém recebe o responsável da disciplina nova.",
      confirmLabel: "Corrigir",
    });
    if (!ok) return;
    start(async () => {
      const r = await alinharDisciplinaAoAgrupamento({ projetoId, tarefaIds });
      if (r.ok) {
        toast.success(r.data.corrigidas === 1 ? "1 linha corrigida." : `${r.data.corrigidas} linhas corrigidas.`, {
          description: "Confira a coluna Recursos: quem já estava atribuído continua.",
        });
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function salvarDataStatus() {
    start(async () => {
      const r = await definirDataStatus({ projetoId, dataStatus: novaDataStatus });
      if (r.ok) {
        toast.success("Data de Status atualizada — o trabalho não feito foi para depois dela.");
        setStatusAberto(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  /** Mudar o início com tarefas de data fixada pergunta antes (Mover junto / Manter); sem elas, grava direto. */
  function salvarInicioProjeto() {
    if (inicioProjeto && novoInicio !== inicioProjeto && linhasComDataFixada > 0) {
      setInicioAberto(false);
      setPerguntaInicio(true);
      return;
    }
    gravarInicioProjeto(false);
  }

  function gravarInicioProjeto(moverRestricoes: boolean) {
    start(async () => {
      const r = await definirInicioProjeto({ projetoId, inicio: novoInicio, moverRestricoes });
      if (r.ok) {
        setPerguntaInicio(false);
        setInicioAberto(false);
        toast.success(
          r.data.movidas > 0
            ? `Início do projeto definido; ${r.data.movidas === 1 ? "1 data fixada andou" : `${r.data.movidas} datas fixadas andaram`} junto.`
            : "Data de início do projeto definida.",
        );
        router.refresh();
      } else toast.error(r.error);
    });
  }

  // Sem início, quem aprova define (a âncora do cronograma); com início, quem monta muda enquanto o plano não trava.
  const podeMudarInicio = inicioProjeto ? podeGerir && !travado : podeAprovar;
  const resumoAchados =
    achados.length === 0 ? "sem achados" : contagem.erro > 0 ? `${contagem.erro} erro(s) · ${achados.length} achados` : `${achados.length} achados`;

  return (
    <section aria-label="Situação do cronograma" className="rounded-sm border bg-card text-sm">
      <InicioProjetoDialog
        aberto={perguntaInicio}
        linhasFixadas={linhasComDataFixada}
        inicioAtual={inicioProjeto}
        novoInicio={novoInicio}
        pendente={pending}
        onMover={() => gravarInicioProjeto(true)}
        onManter={() => gravarInicioProjeto(false)}
        onCancelar={() => setPerguntaInicio(false)}
      />
      <SaudeCronogramaPainel
        aberto={painelAberto}
        onAbertoChange={setPainelAberto}
        achados={achados}
        nota={nota}
        faixa={faixa}
        provisoria={provisoria}
        comparativo={comparativo}
        versoes={versoes}
        podeCorrigirDisciplina={podeGerir}
        planoTravado={travado}
        pendente={pending}
        onCorrigirDisciplina={(ids) => void alinharDisciplinas(ids)}
        onVerNaTabela={(rotulo, ids) => {
          setPainelAberto(false);
          onVerNaTabela(rotulo, ids);
        }}
      />

      <div className="flex min-h-10 flex-wrap items-center gap-x-2.5 gap-y-1.5 px-2.5 py-1 text-[13px]">
        <button
          type="button"
          onClick={() => setPainelAberto(true)}
          className="inline-flex items-center gap-1.5 rounded-sm px-1 py-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Saúde do cronograma: ${nota ?? "—"}%, ${resumoAchados}. Abrir detalhes`}
        >
          <Icone className={`size-4 ${faixa ? FAIXA_COR[faixa]?.split(" ")[0] : "text-muted-foreground"}`} aria-hidden />
          <strong className="tabular-nums">{nota ?? "—"}%</strong>
          {faixa && (
            <Badge variant="outline" className={FAIXA_COR[faixa]}>
              {rotuloFaixa(faixa)}
            </Badge>
          )}
          {provisoria && <span className="hidden text-xs text-muted-foreground 2xl:inline">provisória</span>}
          <span aria-hidden className="text-muted-foreground">·</span>
          <span className={`underline underline-offset-[3px] ${contagem.erro > 0 ? "text-destructive" : ""}`}>{resumoAchados}</span>
          <ChevronRight className="size-3" aria-hidden />
        </button>

        <Separador />

        <span className="inline-flex flex-wrap items-center gap-1.5">
          {aprovado ? (
            <>
              <Badge variant="outline" className="border-info/40 text-info">
                <Flag className="mr-1 size-3" aria-hidden /> aprovado{aprovadoEm ? ` ${dataCurta(aprovadoEm)}` : ""}
                {ultimaBaseline && ` · ${rotuloBaseline(ultimaBaseline.numero)}`}
              </Badge>
              {emRevisao ? (
                <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">
                  <LockOpen className="mr-1 size-3" aria-hidden /> em revisão
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="text-muted-foreground"
                  title="Estrutura, durações, dependências e restrições travadas. %, datas reais, Data de Status, pessoas e bloqueio seguem livres."
                >
                  <Lock className="mr-1 size-3" aria-hidden /> plano travado
                </Badge>
              )}
              {podeAprovar && !emRevisao && (
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void abrirRevisao()} disabled={pending} title="Revisar planejamento: libera a estrutura para mudar">
                  <LockOpen className="size-3.5" /> Revisar
                </Button>
              )}
            </>
          ) : (
            <>
              <Badge variant="outline" className="text-muted-foreground">
                rascunho
              </Badge>
              {podeAprovar && inicioProjeto && (
                // O motivo vai no <span>: o botão desabilitado não recebe o mouse e o `title` dele nunca apareceria.
                <span title={bloqueiaAprovacao ? "Corrija os erros do verificador antes de aprovar" : undefined}>
                  <Button size="sm" variant="outline" className="h-7 border-primary text-xs" onClick={() => void aprovar()} disabled={pending || bloqueiaAprovacao}>
                    <Flag className="size-3.5" /> Aprovar cronograma
                  </Button>
                </span>
              )}
            </>
          )}
        </span>

        <Separador />

        <CampoDaFaixa rotulo="Data de Status" valor={dataStatus} editavel={podeExecutado} aberto={statusAberto} onAbertoChange={setStatusAberto}>
          <Label htmlFor="faixa-data-status" className="text-xs">
            Data de Status
          </Label>
          <div className="flex gap-1.5">
            <Input
              id="faixa-data-status"
              type="date"
              value={novaDataStatus}
              max={hoje}
              onChange={(e) => setNovaDataStatus(e.target.value)}
              className="h-8 w-40 text-xs"
            />
            <Button size="sm" onClick={salvarDataStatus} disabled={pending || !novaDataStatus}>
              Apurar
            </Button>
          </div>
          <p className="max-w-64 text-xs text-muted-foreground">Até quando o andamento está informado. O trabalho não feito vai para depois dela.</p>
        </CampoDaFaixa>

        {inicioProjeto || podeMudarInicio ? (
          <CampoDaFaixa rotulo="Início" valor={inicioProjeto} editavel={podeMudarInicio} aberto={inicioAberto} onAbertoChange={setInicioAberto}>
            <Label htmlFor="inicio-projeto" className="text-xs">
              Início do projeto
            </Label>
            <div className="flex gap-1.5">
              <Input id="inicio-projeto" type="date" value={novoInicio} onChange={(e) => setNovoInicio(e.target.value)} className="h-8 w-40 text-xs" />
              <Button size="sm" onClick={salvarInicioProjeto} disabled={pending || !novoInicio || novoInicio === inicioProjeto}>
                {inicioProjeto ? "Alterar início" : "Definir início"}
              </Button>
            </div>
            <p className="max-w-64 text-xs text-muted-foreground">
              A âncora do cronograma: linha sem predecessora começa aqui, como a Data de Início do Projeto no MS Project.
            </p>
          </CampoDaFaixa>
        ) : null}
        {!inicioProjeto && podeAprovar && <span className="text-xs text-warning">Defina o início para aprovar.</span>}

        {custo && <span className="ml-auto text-xs">{custo}</span>}
      </div>

      {aprovado && emRevisao && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-warning/30 bg-warning/10 px-3 py-1.5 text-xs">
          <span className="min-w-0 flex-1">
            <strong>Em revisão{revisaoAbertaEm ? ` desde ${formatarData(revisaoAbertaEm)}` : ""}.</strong> A revisão fecha com uma nova linha de base
            {revisaoAlterada ? " — o plano já mudou, então não dá mais para cancelar." : "."}
          </span>
          {podeAprovar && !revisaoAlterada && (
            <Button size="sm" variant="ghost" className="h-7" onClick={cancelarRevisao} disabled={pending}>
              Cancelar revisão
            </Button>
          )}
          {podeAprovar && (
            <Button size="sm" className="h-7" onClick={() => setFecharRevisaoAberto(true)} disabled={pending}>
              Fechar com nova linha de base…
            </Button>
          )}
        </div>
      )}

      <Dialog open={fecharRevisaoAberto} onOpenChange={(o) => !pending && setFecharRevisaoAberto(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Fechar a revisão com uma nova linha de base</DialogTitle>
            <DialogDescription>
              O cronograma de hoje vira a nova referência e o plano volta a travar. As versões anteriores continuam guardadas e
              podem ser comparadas no Gantt de Controle.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-1.5">
            <Label htmlFor="motivo-nova-base">Motivo da mudança</Label>
            <Input
              id="motivo-nova-base"
              placeholder="Ex.: atraso na aprovação da arquitetura pelo cliente, aditivo de contrato"
              value={motivoReplan}
              onChange={(e) => setMotivoReplan(e.target.value)}
              autoFocus
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFecharRevisaoAberto(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button onClick={replanejar} disabled={pending || !motivoReplan.trim()}>
              {pending ? "Gravando…" : "Criar nova linha de base"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
