"use client";

import { useEffect, useState, useTransition, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, ListTree, Lock, Pin, Plus, Trash2, Unlock, X } from "lucide-react";
import { criarEapTarefa, definirBloqueio, desbloquear, excluirEapTarefa, salvarLinhaEap } from "@/modules/planejamento/actions";
import type { EapTarefaDTO } from "@/modules/planejamento/queries";
import type { Vinculo } from "@/modules/planejamento/gantt-linhas";
import { rotuloHoras } from "@/modules/planejamento/progresso-sugerido";
import { disciplinaParaLinhaNova } from "@/modules/planejamento/disciplina-linha";
import { MOTIVO_PLANO_TRAVADO } from "@/modules/planejamento/trava-plano";
import { EapAtribuicoes } from "@/components/planejamento/eap-atribuicoes";
import { PredecessorasDialog } from "@/components/planejamento/predecessoras-dialog";
import { dataCurta } from "@/lib/dias-iso";
import { cn, formatarData } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useConfirm } from "@/components/ui/confirm-dialog";

const selectCls =
  "h-8 w-full min-w-0 rounded-sm border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:border-primary disabled:opacity-60";

const TIPO_VINCULO: Record<Vinculo["tipo"], string> = {
  fs: "Término → Início",
  ss: "Início → Início",
  ff: "Término → Término",
  sf: "Início → Término",
};

export const RESTRICAO_LABEL: Record<string, string> = {
  iniciar_em: "Iniciar em",
  iniciar_nao_antes_de: "Não iniciar antes de",
  iniciar_nao_depois_de: "Não iniciar depois de",
  terminar_em: "Terminar em",
  terminar_nao_antes_de: "Não terminar antes de",
  terminar_nao_depois_de: "Não terminar depois de",
};

/** Uma linha da árvore de predecessoras (o formato que a janela da árvore usa). */
type LinhaDaArvore = { id: string; parentId: string | null; ordem: number; codigo: string; nome: string; tipoEap: string };

/** O que o painel edita. Datas `YYYY-MM-DD`; `""` = vazio. */
type Form = {
  nome: string;
  marco: boolean;
  disciplinaId: string;
  etapaId: string;
  duracao: string;
  progresso: number;
  inicio: string;
  termino: string;
  restricaoTipo: string;
  restricaoData: string;
  predecessoras: Vinculo[];
  /** Só na linha nova. */
  parentId: string;
};

const deLinha = (t: EapTarefaDTO): Form => ({
  nome: t.nome,
  marco: t.marco,
  disciplinaId: t.disciplinaId ?? "",
  etapaId: t.etapaId ?? "",
  duracao: t.marco ? "" : String(t.duracaoDias).replace(".", ","),
  progresso: Math.round(t.progresso),
  inicio: t.inicioPrevisto ?? "",
  termino: t.fimPrevisto ?? "",
  restricaoTipo: t.restricaoTipo ?? "",
  restricaoData: t.restricaoData ?? "",
  predecessoras: t.predecessoras.map((p) => ({ predecessoraId: p.predecessoraId, tipo: p.tipo as Vinculo["tipo"], lagDias: p.lagDias })),
  parentId: t.parentId ?? "",
});

const NOVA: Form = {
  nome: "",
  marco: false,
  disciplinaId: "",
  etapaId: "",
  duracao: "5",
  progresso: 0,
  inicio: "",
  termino: "",
  restricaoTipo: "",
  restricaoData: "",
  predecessoras: [],
  parentId: "",
};

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function Secao({ titulo, children, className }: { titulo: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-2", className)}>
      <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{titulo}</h3>
      {children}
    </section>
  );
}

/**
 * Painel da linha da EAP (mock aprovado em 2026-10-23) — substitui o modal de editar tarefa. Fica à direita com a tabela à
 * vista; ↑↓ (ou Alt+↑/↓) passam para a linha de cima/de baixo sem fechar. Tudo o que é do PLANO e do % grava num "Salvar"
 * só (`salvarLinhaEap`: um passo de desfazer, tudo ou nada). Pessoas e bloqueio seguem gravando na hora, como antes.
 */
export function EapLinhaPainel({
  aberto,
  linhaId,
  nova,
  onFechar,
  onNavegar,
  ordem,
  codigoPorId,
  tarefas,
  projetoId,
  disciplinas,
  pessoas,
  planoTravado,
  linhasDaArvore,
  dependenciasDaArvore,
  onAlteracoes,
}: {
  aberto: boolean;
  /** A linha editada (`null` com `nova`). */
  linhaId: string | null;
  /** "Nova tarefa": o mesmo painel, com "Subtarefa de" e "Não iniciar antes de". */
  nova: boolean;
  onFechar: () => void;
  onNavegar: (id: string) => void;
  /** Ordem das linhas na tabela (as visíveis), para ↑↓. */
  ordem: readonly string[];
  codigoPorId: ReadonlyMap<string, string>;
  tarefas: EapTarefaDTO[];
  projetoId: string;
  disciplinas: { id: string; nome: string; etapas: { etapaId: string; sigla: string; nome: string }[] }[];
  pessoas: { id: string; name: string; image: string | null }[];
  planoTravado: boolean;
  linhasDaArvore: readonly LinhaDaArvore[];
  dependenciasDaArvore: readonly { tarefaId: string; predecessoraId: string }[];
  /** Quantas alterações não salvas há (quem abre outra linha pergunta antes de descartar). */
  onAlteracoes?: (n: number) => void;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const linha = linhaId ? (tarefas.find((t) => t.id === linhaId) ?? null) : null;
  const base: Form = linha ? deLinha(linha) : NOVA;
  // Só o que a pessoa mudou: o resto vem sempre do servidor (depois de salvar, o painel mostra as datas do motor).
  const [alteracoes, setAlteracoes] = useState<Partial<Form>>({});
  const [chave, setChave] = useState(nova ? "nova" : linhaId);
  if ((nova ? "nova" : linhaId) !== chave) {
    setChave(nova ? "nova" : linhaId);
    setAlteracoes({});
  }
  const form: Form = { ...base, ...alteracoes };
  const mudou = (Object.keys(alteracoes) as (keyof Form)[]).filter((k) => !igual(alteracoes[k], base[k]));
  const set = (campos: Partial<Form>) => setAlteracoes((a) => ({ ...a, ...campos }));
  const totalMudou = mudou.length;
  useEffect(() => {
    onAlteracoes?.(totalMudou);
  }, [totalMudou, onAlteracoes]);
  // A linha aberta sumiu (excluída pelo menu, por outra pessoa, ou desfeita com Ctrl+Z): o painel fecha — senão ele viraria
  // um "Nova tarefa" com o Salvar criando uma linha.
  // A linha recém-criada só chega na lista com o refresh: até lá ela não "sumiu".
  const [criadaId, setCriadaId] = useState<string | null>(null);
  const sumiu = aberto && !nova && !!linhaId && !linha && linhaId !== criadaId;
  useEffect(() => {
    if (sumiu) onFechar();
  }, [sumiu, onFechar]);

  const [restricaoAberta, setRestricaoAberta] = useState(false);
  const [bloqueioAberto, setBloqueioAberto] = useState(false);
  const [motivoBloqueio, setMotivoBloqueio] = useState("");
  const [previsaoDesbloqueio, setPrevisaoDesbloqueio] = useState("");
  const [arvoreAberta, setArvoreAberta] = useState(false);

  const ehResumo = linha?.ehResumo === true;
  const podeSerMarco = !linha || ((linha.tipoEap === "atv" || linha.tipoEap === "mrc") && !ehResumo);
  const trava = planoTravado && !!linha;
  const fases = disciplinas.find((d) => d.id === form.disciplinaId)?.etapas ?? [];
  const nomeDe = (id: string) => tarefas.find((t) => t.id === id)?.nome ?? "—";
  const sucessoras = linha ? tarefas.filter((t) => t.predecessoraIds.includes(linha.id)) : [];
  const pos = linhaId ? ordem.indexOf(linhaId) : -1;
  const anterior = pos > 0 ? ordem[pos - 1] : null;
  const proxima = pos >= 0 && pos < ordem.length - 1 ? ordem[pos + 1] : null;
  const bloqueada = linha?.status === "blq";
  const terminoDigitado = mudou.includes("termino");

  async function podeSair(): Promise<boolean> {
    if (mudou.length === 0) return true;
    return confirm({
      title: "Descartar as alterações desta linha?",
      description: `${mudou.length === 1 ? "1 alteração não foi salva" : `${mudou.length} alterações não foram salvas`}.`,
      confirmLabel: "Descartar",
      variant: "destructive",
    });
  }
  async function navegar(id: string | null) {
    if (!id || pending) return;
    if (await podeSair()) {
      setAlteracoes({});
      onNavegar(id);
    }
  }
  async function fechar() {
    if (pending) return;
    if (await podeSair()) {
      setAlteracoes({});
      onFechar();
    }
  }

  function salvar() {
    if (pending || !form.nome.trim() || (linha && mudou.length === 0)) return;
    const semDuracao = form.marco || ehResumo;
    const duracaoDias = Number(form.duracao.replace(",", "."));
    if (!semDuracao && !terminoDigitado && !(duracaoDias > 0)) {
      toast.error("Informe a duração em dias úteis (maior que zero).");
      return;
    }
    if (form.restricaoTipo && !form.restricaoData) {
      toast.error("Informe a data da restrição.");
      return;
    }
    start(async () => {
      if (!linha) {
        const r = await criarEapTarefa({
          projetoId,
          parentId: form.parentId,
          disciplinaId: form.disciplinaId,
          etapaId: form.etapaId,
          nome: form.nome,
          duracaoDias: form.marco ? undefined : duracaoDias,
          naoIniciarAntesDe: form.inicio,
          progresso: 0,
          marco: form.marco,
        });
        if (!r.ok) return void toast.error(r.error);
        toast.success("Tarefa criada — datas calculadas.");
        setAlteracoes({});
        setCriadaId(r.data.id);
        onNavegar(r.data.id);
        router.refresh();
        return;
      }
      // "Tirar" a data fixada e digitar um início novo = o início vira o alfinete (não some calado).
      const mudouRestricao =
        (mudou.includes("restricaoTipo") || mudou.includes("restricaoData")) && !(form.restricaoTipo === "" && mudou.includes("inicio") && form.inicio);
      const r = await salvarLinhaEap({
        id: linha.id,
        nome: form.nome,
        disciplinaId: form.disciplinaId,
        etapaId: form.etapaId,
        // Com o término digitado a duração sai dele; o servidor ainda pede uma duração válida para o editar (marco que vira
        // atividade tem 0): vai a gravada, ou 1.
        duracaoDias: semDuracao ? undefined : terminoDigitado ? Number(base.duracao.replace(",", ".")) || 1 : duracaoDias,
        progresso: form.progresso,
        marco: form.marco,
        inicio: mudou.includes("inicio") && form.inicio ? form.inicio : undefined,
        termino: terminoDigitado && form.termino ? form.termino : undefined,
        restricao: mudouRestricao ? { tipo: (form.restricaoTipo || null) as never, data: form.restricaoData || undefined } : undefined,
        predecessoras: mudou.includes("predecessoras") ? form.predecessoras : undefined,
      });
      if (!r.ok) return void toast.error(r.error);
      if (mudou.includes("inicio") && form.inicio && r.data.inicio !== form.inicio && !mudouRestricao) {
        toast.warning(`A tarefa só pode começar em ${dataCurta(r.data.inicio)}.`, {
          description: 'Depois das predecessoras e num dia útil — a data que você pediu ficou como "não iniciar antes de".',
        });
      } else {
        toast.success("Linha salva — datas recalculadas.");
      }
      setAlteracoes({});
      router.refresh();
    });
  }

  async function excluir() {
    if (!linha) return;
    const ok = await confirm({
      title: `Excluir "${linha.nome}"?`,
      description: ehResumo ? "As subtarefas dela saem junto. Dá para voltar com Ctrl+Z." : "Dá para voltar com Ctrl+Z.",
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    start(async () => {
      const r = await excluirEapTarefa({ id: linha.id });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Tarefa excluída.");
      setAlteracoes({});
      onFechar();
      router.refresh();
    });
  }

  function bloquear() {
    if (!linha) return;
    if (!motivoBloqueio.trim()) return void toast.error("Descreva o motivo do bloqueio.");
    start(async () => {
      const r = await definirBloqueio({ id: linha.id, motivo: motivoBloqueio, previsaoDesbloqueio: previsaoDesbloqueio || undefined });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Tarefa bloqueada.");
      setBloqueioAberto(false);
      setMotivoBloqueio("");
      setPrevisaoDesbloqueio("");
      router.refresh();
    });
  }

  function liberar() {
    if (!linha) return;
    start(async () => {
      const r = await desbloquear({ id: linha.id });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Bloqueio removido.");
      router.refresh();
    });
  }

  function aoTeclar(e: KeyboardEvent) {
    // Teclas da janela da árvore (portal, filho no React) não comandam o painel.
    if (!(e.currentTarget as HTMLElement).contains(e.target as Node)) return;
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      salvar();
    } else if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      void navegar(e.key === "ArrowUp" ? anterior : proxima);
    }
  }

  const codigo = linha ? (codigoPorId.get(linha.id) ?? "") : "";
  const pai = linha?.parentId ? nomeDe(linha.parentId) : null;
  const possiveisPais = tarefas.filter((t) => !t.marco);
  const restricaoAtual = form.restricaoTipo ? `${RESTRICAO_LABEL[form.restricaoTipo] ?? form.restricaoTipo} ${form.restricaoData ? formatarData(form.restricaoData) : "—"}` : null;

  return (
    <Sheet open={aberto && !sumiu} modal={false} disablePointerDismissal onOpenChange={(o) => !o && void fechar()}>
      <SheetContent semFundo showCloseButton={false} className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[540px]" onKeyDown={aoTeclar}>
        {/* Cabeçalho: código, nome, sinais e ↑↓ */}
        <div className="space-y-2 border-b px-4 pb-3 pt-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {linha ? (
              <>
                <span className="font-mono">
                  {codigo}
                  {linha.idCorporativo ? ` · ${linha.idCorporativo}` : ""}
                </span>
                {pai && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="min-w-0 truncate">{pai}</span>
                  </>
                )}
              </>
            ) : (
              <span>Nova tarefa da EAP</span>
            )}
            <span className="flex-1" />
            {linha && (
              <>
                <Button size="icon-sm" variant="outline" aria-label="Linha anterior" title="Linha anterior (Alt+↑)" disabled={!anterior || pending} onClick={() => void navegar(anterior)}>
                  <ChevronUp className="size-3.5" />
                </Button>
                <Button size="icon-sm" variant="outline" aria-label="Próxima linha" title="Próxima linha (Alt+↓)" disabled={!proxima || pending} onClick={() => void navegar(proxima)}>
                  <ChevronDown className="size-3.5" />
                </Button>
              </>
            )}
            <Button size="icon-sm" variant="ghost" aria-label="Fechar" onClick={() => void fechar()}>
              <X className="size-4" />
            </Button>
          </div>
          <SheetTitle className="sr-only">{linha ? `Tarefa ${codigo} ${linha.nome}` : "Nova tarefa da EAP"}</SheetTitle>
          <SheetDescription className="sr-only">Edite a linha e salve. Pessoas e bloqueio gravam na hora.</SheetDescription>
          <Label htmlFor="linha-nome" className="sr-only">
            Nome da tarefa
          </Label>
          <Input
            id="linha-nome"
            value={form.nome}
            onChange={(e) => set({ nome: e.target.value })}
            placeholder="Nome da tarefa"
            className="-mx-2 h-9 border-transparent bg-muted/50 px-2 text-lg font-bold shadow-none focus-visible:border-input"
            autoFocus={nova}
          />
          {linha && (
            <div className="flex flex-wrap gap-1.5">
              {bloqueada && (
                <Badge variant="outline" className="border-destructive/40 text-destructive">
                  <Lock className="mr-1 size-3" /> bloqueada
                </Badge>
              )}
              {linha.critica && (
                <Badge variant="outline" className="border-destructive/40 text-destructive">
                  caminho crítico
                </Badge>
              )}
              {!ehResumo && (
                <Badge variant="outline" className="text-muted-foreground">
                  folga {linha.folgaTotal}d
                </Badge>
              )}
              {linha.conflitoRestricao && (
                <Badge variant="outline" className="border-warning/40 text-warning">
                  <Pin className="mr-1 size-3" /> conflito de restrição
                </Badge>
              )}
              {linha.reprogramada && (
                <Badge variant="outline" className="text-muted-foreground">
                  reprogramada para depois da Data de Status
                </Badge>
              )}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 text-sm">
          {trava && (
            <p className="flex gap-1.5 rounded-sm border border-info/40 bg-info/10 px-2.5 py-1.5 text-xs" title={MOTIVO_PLANO_TRAVADO}>
              <Lock className="mt-0.5 size-3.5 shrink-0 text-info" />
              <span>Cronograma aprovado: aqui mudam o nome, o %, as pessoas e o bloqueio. O resto pede &ldquo;Revisar planejamento&rdquo;.</span>
            </p>
          )}

          {/* O quê */}
          <div className="grid grid-cols-2 gap-3">
            {podeSerMarco && (
              <div className="col-span-2 flex items-center gap-3">
                <span className="w-20 text-xs text-muted-foreground">Tipo</span>
                <div className="flex overflow-hidden rounded-sm border" role="group" aria-label="Tipo da linha">
                  {([
                    [false, "Atividade"],
                    [true, "Marco"],
                  ] as const).map(([v, rotulo]) => (
                    <button
                      key={rotulo}
                      type="button"
                      aria-pressed={form.marco === v}
                      disabled={trava}
                      onClick={() => set({ marco: v, ...(v ? { termino: base.termino } : {}) })}
                      className={cn(
                        "px-3 py-1 text-xs font-medium disabled:opacity-60",
                        form.marco === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {rotulo}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="linha-disciplina" className="text-xs text-muted-foreground">
                Disciplina
              </Label>
              <select
                id="linha-disciplina"
                className={selectCls}
                disabled={trava}
                value={form.disciplinaId}
                onChange={(e) => {
                  const disciplinaId = e.target.value;
                  // Fase de outra disciplina não aponta etapa desta: trocar a disciplina limpa a fase.
                  const aindaVale = disciplinas.find((d) => d.id === disciplinaId)?.etapas.some((x) => x.etapaId === form.etapaId);
                  set({ disciplinaId, etapaId: aindaVale ? form.etapaId : "" });
                }}
              >
                <option value="">—</option>
                {disciplinas.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="linha-fase" className="text-xs text-muted-foreground">
                Fase
              </Label>
              <select id="linha-fase" className={selectCls} disabled={trava || fases.length === 0} value={form.etapaId} onChange={(e) => set({ etapaId: e.target.value })}>
                <option value="">—</option>
                {fases.map((f) => (
                  <option key={f.etapaId} value={f.etapaId}>
                    {f.sigla} · {f.nome}
                  </option>
                ))}
              </select>
            </div>
            {!linha && possiveisPais.length > 0 && (
              <div className="col-span-2 space-y-1">
                <Label htmlFor="linha-pai" className="text-xs text-muted-foreground">
                  Subtarefa de
                </Label>
                <select
                  id="linha-pai"
                  className={selectCls}
                  value={form.parentId}
                  onChange={(e) => {
                    const parentId = e.target.value;
                    if (mudou.includes("disciplinaId")) return set({ parentId });
                    // A1: a linha nova nasce com a disciplina (e a fase) do agrupamento — até a pessoa escolher a dela.
                    const p = tarefas.find((t) => t.id === parentId);
                    const herdada = disciplinaParaLinhaNova(p ? { disciplinaId: p.disciplinaId, etapaId: p.etapaId } : null);
                    const temFase = disciplinas.find((d) => d.id === herdada.disciplinaId)?.etapas.some((x) => x.etapaId === herdada.etapaId);
                    setAlteracoes((a) => ({ ...a, parentId, disciplinaId: herdada.disciplinaId ?? "", etapaId: temFase && herdada.etapaId ? herdada.etapaId : "" }));
                  }}
                >
                  <option value="">— (tarefa de topo)</option>
                  {possiveisPais.map((t) => (
                    <option key={t.id} value={t.id}>
                      {codigoPorId.get(t.id) ? `${codigoPorId.get(t.id)} · ` : ""}
                      {t.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Prazo */}
          <Secao titulo="Prazo">
            {ehResumo ? (
              <p className="rounded-sm border border-dashed px-2.5 py-2 text-xs text-muted-foreground">
                Agrupamento: início, término e duração vêm das atividades dentro dele
                {linha && ` (${formatarData(linha.inicioPrevisto)} – ${formatarData(linha.fimPrevisto)})`}.
              </p>
            ) : (
              <>
                <div className={cn("grid grid-cols-2 gap-2", !form.marco && linha && "sm:grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1fr)]")}>
                  {!form.marco && (
                    <div className={cn("space-y-1", linha && "col-span-2 sm:col-span-1")}>
                      <Label htmlFor="linha-duracao" className="text-xs text-muted-foreground">
                        Duração (d. úteis)
                      </Label>
                      <Input
                        id="linha-duracao"
                        inputMode="decimal"
                        className="h-8 font-mono"
                        disabled={trava}
                        value={terminoDigitado ? "" : form.duracao}
                        placeholder={terminoDigitado ? "pelo término" : undefined}
                        onChange={(e) => set({ duracao: e.target.value.replace(/[^0-9.,]/g, ""), termino: base.termino })}
                      />
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label htmlFor="linha-inicio" className="text-xs text-muted-foreground">
                      {form.marco ? "Data" : "Início"}
                    </Label>
                    <Input id="linha-inicio" type="date" className="h-8 font-mono" disabled={trava} value={form.inicio} onChange={(e) => set({ inicio: e.target.value })} />
                  </div>
                  {!form.marco && linha && (
                    <div className="space-y-1">
                      <Label htmlFor="linha-termino" className="text-xs text-muted-foreground">
                        Término
                      </Label>
                      <Input
                        id="linha-termino"
                        type="date"
                        className="h-8 font-mono"
                        disabled={trava}
                        value={form.termino}
                        onChange={(e) => set({ termino: e.target.value, duracao: base.duracao })}
                      />
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {linha
                    ? "Mudar o término muda a duração. Digitar o início prende a tarefa nele (o alfinete). As datas se recalculam ao salvar."
                    : "Sem início, a tarefa começa quando as predecessoras deixarem — ou no início do projeto. Com início, ela fica presa nele (o alfinete)."}
                </p>
                {linha && (
                  <div className="space-y-2 rounded-sm border border-dashed px-2.5 py-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pin className="size-3.5 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1">{restricaoAtual ?? <span className="text-muted-foreground">Sem data fixada — a tarefa segue as predecessoras.</span>}</span>
                      {restricaoAtual && !trava && (
                        <button type="button" className="text-info hover:underline" aria-label="Tirar a data fixada" onClick={() => set({ restricaoTipo: "", restricaoData: "" })}>
                          Tirar
                        </button>
                      )}
                      {!trava && (
                        <button type="button" className="text-info hover:underline" aria-expanded={restricaoAberta} onClick={() => setRestricaoAberta((v) => !v)}>
                          Outra restrição…
                        </button>
                      )}
                    </div>
                    {restricaoAberta && !trava && (
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          aria-label="Tipo da restrição"
                          className={selectCls}
                          value={form.restricaoTipo}
                          onChange={(e) => set({ restricaoTipo: e.target.value, restricaoData: form.restricaoData || form.inicio })}
                        >
                          <option value="">Sem restrição</option>
                          {Object.entries(RESTRICAO_LABEL).map(([v, rotulo]) => (
                            <option key={v} value={v}>
                              {rotulo}
                            </option>
                          ))}
                        </select>
                        <Input
                          aria-label="Data da restrição"
                          type="date"
                          className="h-8 font-mono"
                          disabled={!form.restricaoTipo}
                          value={form.restricaoData}
                          onChange={(e) => set({ restricaoData: e.target.value })}
                        />
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </Secao>

          {/* Andamento */}
          {linha && !form.marco && (
            <Secao titulo="Andamento">
              {linha.progressoDerivado ? (
                <p className="text-xs text-muted-foreground">
                  {Math.round(linha.progresso)}% — agrupamento: o avanço é calculado das linhas de dentro, ponderado por horas.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="% concluído">
                    {[0, 25, 50, 75, 100].map((v) => (
                      <Button key={v} type="button" size="sm" variant="outline" aria-pressed={form.progresso === v} className={cn("h-7 w-12 px-0", form.progresso === v && "border-primary bg-primary text-primary-foreground hover:bg-primary/90 dark:bg-primary")} onClick={() => set({ progresso: v })}>
                        {v}%
                      </Button>
                    ))}
                    <Label htmlFor="linha-progresso" className="ml-1 text-xs text-muted-foreground">
                      outro
                    </Label>
                    <Input
                      id="linha-progresso"
                      aria-label="% concluído, outro valor"
                      inputMode="numeric"
                      className="h-7 w-16 font-mono"
                      value={String(form.progresso)}
                      onChange={(e) => {
                        const n = Number(e.target.value.replace(/\D/g, ""));
                        set({ progresso: Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0)) });
                      }}
                    />
                  </div>
                  {linha.sugestoesProgresso.map((sug) => (
                    // O sistema só SUGERE (F6.3, D19): "usar" preenche o %; nada grava até Salvar.
                    <button
                      key={sug.origem}
                      type="button"
                      onClick={() => set({ progresso: sug.valor })}
                      className="block w-full rounded-sm border border-dashed px-2 py-1 text-left text-xs text-muted-foreground hover:border-primary hover:text-foreground"
                    >
                      Sugestão: <strong className="text-foreground">{sug.valor}%</strong> — {sug.motivo} <span className="text-info">usar</span>
                    </button>
                  ))}
                  {linha.contextoArquivos && <p className="text-xs text-muted-foreground">{linha.contextoArquivos}</p>}
                </>
              )}
            </Secao>
          )}

          {/* Predecessoras: só os vínculos desta linha */}
          {linha && !ehResumo && (
            <Secao titulo="Depende de">
              {form.predecessoras.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma predecessora: começa no início do projeto (ou na data fixada).</p>
              ) : (
                <ul className="space-y-1.5">
                  {form.predecessoras.map((v, idx) => (
                    <li key={v.predecessoraId} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-sm border px-2 py-1.5">
                      <span className="flex min-w-0 basis-full items-baseline gap-2">
                        <span className="shrink-0 font-mono text-xs text-muted-foreground">{codigoPorId.get(v.predecessoraId) ?? ""}</span>
                        <span className="min-w-0 truncate">{nomeDe(v.predecessoraId)}</span>
                      </span>
                      <span className="flex-1" />
                      <select
                        aria-label={`Tipo do vínculo com ${nomeDe(v.predecessoraId)}`}
                        className="h-7 rounded-sm border bg-background px-1 text-xs text-foreground disabled:opacity-60"
                        disabled={trava}
                        value={v.tipo}
                        onChange={(e) => set({ predecessoras: form.predecessoras.map((x, j) => (j === idx ? { ...x, tipo: e.target.value as Vinculo["tipo"] } : x)) })}
                      >
                        {Object.entries(TIPO_VINCULO).map(([t, rotulo]) => (
                          <option key={t} value={t}>
                            {rotulo}
                          </option>
                        ))}
                      </select>
                      <Input
                        aria-label={`Defasagem em dias úteis com ${nomeDe(v.predecessoraId)}`}
                        title="Defasagem em dias úteis (negativo = antecipação)"
                        type="number"
                        className="h-7 w-14 px-1 font-mono text-xs"
                        disabled={trava}
                        // Sem controle a cada tecla: "-" sozinho viraria 0 e não daria para digitar defasagem negativa. Grava ao sair.
                        key={`${v.predecessoraId}:${v.lagDias}`}
                        defaultValue={v.lagDias}
                        onBlur={(e) => {
                          const n = Number(e.target.value);
                          if (e.target.value.trim() === "" || !Number.isFinite(n) || n === v.lagDias) return;
                          set({ predecessoras: form.predecessoras.map((x, j) => (j === idx ? { ...x, lagDias: n } : x)) });
                        }}
                      />
                      <span className="text-[11px] text-muted-foreground">d</span>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Tirar a predecessora ${nomeDe(v.predecessoraId)}`}
                        disabled={trava}
                        onClick={() => set({ predecessoras: form.predecessoras.filter((_, j) => j !== idx) })}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <span title={trava ? MOTIVO_PLANO_TRAVADO : undefined}>
                <Button size="sm" variant="outline" disabled={trava} onClick={() => setArvoreAberta(true)}>
                  <ListTree className="size-3.5" /> Escolher predecessoras na árvore
                </Button>
              </span>
              {sucessoras.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {sucessoras.length === 1 ? "Sucessora" : "Sucessoras"}:{" "}
                  {sucessoras.map((s, k) => (
                    <span key={s.id}>
                      {k > 0 && ", "}
                      <span className="font-mono">{codigoPorId.get(s.id) ?? ""}</span> {s.nome}
                    </span>
                  ))}
                </p>
              )}
            </Secao>
          )}

          {/* Pessoas e horas — gravam na hora, como antes */}
          {linha && (
            <Secao titulo="Pessoas e horas">
              {!ehResumo && (linha.horasApontadas > 0 || linha.trabalhoHoras != null) && (
                <p className="text-xs text-muted-foreground">
                  Apontado no ponto: <strong className="text-foreground">{rotuloHoras(linha.horasApontadas)}</strong>
                  {linha.trabalhoHoras != null ? ` de ${rotuloHoras(linha.trabalhoHoras)} previstas` : " (sem horas previstas)"}.
                </p>
              )}
              <EapAtribuicoes linha={linha} pessoas={pessoas} />
              <p className="text-[11px] text-muted-foreground">Pessoas e horas gravam na hora.</p>
            </Secao>
          )}

          {/* Bloqueio — ação própria (avisa e registra a origem do atraso) */}
          {linha && (
            <section className="space-y-2 rounded-sm border px-2.5 py-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {bloqueada ? <Lock className="size-3.5 text-destructive" aria-hidden /> : <Unlock className="size-3.5 text-muted-foreground" aria-hidden />}
                <span className={cn("min-w-0 flex-1", !bloqueada && "text-muted-foreground")}>
                  {bloqueada ? (
                    <>
                      <strong>Bloqueada:</strong> {linha.motivoBloqueio}
                      {linha.previsaoDesbloqueio ? ` · previsão ${formatarData(linha.previsaoDesbloqueio)}` : ""}
                    </>
                  ) : (
                    "Sem bloqueio"
                  )}
                </span>
                {bloqueada ? (
                  <Button size="sm" variant="outline" className="h-7" onClick={liberar} disabled={pending}>
                    <Unlock className="size-3.5" /> Desbloquear
                  </Button>
                ) : (
                  <button type="button" className="text-xs text-info hover:underline" aria-expanded={bloqueioAberto} onClick={() => setBloqueioAberto((v) => !v)}>
                    Registrar bloqueio…
                  </button>
                )}
              </div>
              {bloqueioAberto && !bloqueada && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Bloqueio não pausa o prazo — o atraso continua contando. Ele registra a origem, para separar &ldquo;atrasado por
                    nós&rdquo; de &ldquo;atrasado esperando o cliente&rdquo;.
                  </p>
                  <Label htmlFor="linha-motivo-bloqueio" className="sr-only">
                    Motivo do bloqueio
                  </Label>
                  <textarea
                    id="linha-motivo-bloqueio"
                    rows={2}
                    placeholder="Motivo (ex.: aguardando definição da arquitetura)"
                    value={motivoBloqueio}
                    onChange={(e) => setMotivoBloqueio(e.target.value)}
                    className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                  />
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="linha-previsao" className="text-xs text-muted-foreground">
                        Previsão de solução (opcional)
                      </Label>
                      <Input id="linha-previsao" type="date" className="h-8" value={previsaoDesbloqueio} onChange={(e) => setPrevisaoDesbloqueio(e.target.value)} />
                    </div>
                    <Button size="sm" variant="outline" onClick={bloquear} disabled={pending}>
                      <Lock className="size-3.5" /> Bloquear
                    </Button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        {/* Um jeito só de gravar */}
        <div className="flex flex-wrap items-center gap-2 border-t bg-muted/30 px-4 py-2.5">
          {linha && (
            <span title={trava ? MOTIVO_PLANO_TRAVADO : undefined}>
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void excluir()} disabled={pending || trava}>
                <Trash2 className="size-3.5" /> Excluir
              </Button>
            </span>
          )}
          <span className="flex-1 text-xs text-warning" aria-live="polite">
            {linha && mudou.length > 0 ? (mudou.length === 1 ? "1 alteração não salva" : `${mudou.length} alterações não salvas`) : ""}
          </span>
          {linha ? (
            <Button size="sm" variant="outline" onClick={() => setAlteracoes({})} disabled={pending || mudou.length === 0}>
              Descartar
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => void fechar()} disabled={pending}>
              Cancelar
            </Button>
          )}
          <Button size="sm" onClick={salvar} disabled={pending || !form.nome.trim() || (!!linha && mudou.length === 0)} aria-keyshortcuts="Control+Enter" title="Salvar (Ctrl+Enter)">
            {pending ? "Salvando…" : linha ? "Salvar" : (
              <>
                <Plus className="size-3.5" /> Criar tarefa
              </>
            )}
          </Button>
        </div>

        {linha && (
          <PredecessorasDialog
            tarefa={arvoreAberta ? { id: linha.id, nome: form.nome, codigo } : null}
            linhas={linhasDaArvore}
            dependencias={dependenciasDaArvore}
            vinculosAtuais={form.predecessoras}
            onAplicar={async (vinculos) => {
              // A árvore só escolhe: o vínculo grava junto com o resto, no Salvar.
              set({ predecessoras: vinculos });
              setArvoreAberta(false);
              return null;
            }}
            onFechar={() => setArvoreAberta(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
