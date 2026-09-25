"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, Pin, PinOff, Lock, Unlock } from "lucide-react";
import {
  criarEapTarefa,
  editarEapTarefa,
  excluirEapTarefa,
  vincularDependencia,
  removerDependencia,
  editarVinculo,
  definirBloqueio,
  desbloquear,
  definirRestricao,
} from "@/modules/planejamento/actions";
import type { EapTarefaDTO } from "@/modules/planejamento/queries";
import { rotuloHoras } from "@/modules/planejamento/progresso-sugerido";
import { EapAtribuicoes } from "@/components/planejamento/eap-atribuicoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CollapsibleSection } from "@/components/ui/collapsible";

const NONE = "__none";

const TIPO_VINCULO_LABEL: Record<string, string> = {
  fs: "FS — término → início",
  ss: "SS — início → início",
  ff: "FF — término → término",
  sf: "SF — início → término",
};

const RESTRICAO_LABEL: Record<string, string> = {
  iniciar_em: "Iniciar em",
  iniciar_nao_antes_de: "Iniciar não antes de",
  iniciar_nao_depois_de: "Iniciar não depois de",
  terminar_em: "Terminar em",
  terminar_nao_antes_de: "Terminar não antes de",
  terminar_nao_depois_de: "Terminar não depois de",
};

export function EapDialog({
  tarefa,
  open,
  onOpenChange,
  projetoId,
  disciplinas,
  tarefas,
  pessoas,
}: {
  tarefa: EapTarefaDTO | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projetoId: string;
  disciplinas: { id: string; nome: string; etapas: { etapaId: string; sigla: string; nome: string }[] }[];
  tarefas: EapTarefaDTO[];
  pessoas: { id: string; name: string; image: string | null }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  // A tarefa vem do estado do PAI, capturada quando o diálogo abriu. Depois de um
  // `router.refresh()` (ex.: adicionar uma atribuição) `tarefas` chega atualizado mas
  // `tarefa` continua o objeto antigo — sem isto a seção de Recursos (e `predecessoraIds`,
  // usado por `toggleDep` abaixo) ficaria uma gravação atrás até o diálogo reabrir.
  const linhaAtual = tarefa ? tarefas.find((t) => t.id === tarefa.id) ?? tarefa : null;

  const hoje = new Date().toISOString().slice(0, 10);
  const vazio = {
    nome: "",
    parentId: NONE,
    disciplinaId: NONE,
    etapaId: NONE,
    inicioPrevisto: hoje,
    fimPrevisto: hoje,
    progresso: 0,
    marco: false,
  };
  const de = (t: EapTarefaDTO) => ({
    nome: t.nome,
    parentId: t.parentId ?? NONE,
    disciplinaId: t.disciplinaId ?? NONE,
    etapaId: t.etapaId ?? NONE,
    inicioPrevisto: t.inicioPrevisto,
    fimPrevisto: t.fimPrevisto,
    progresso: t.progresso,
    marco: t.marco,
  });
  const [form, setForm] = useState(tarefa ? de(tarefa) : vazio);
  const key = tarefa?.id ?? "nova";
  const [lastKey, setLastKey] = useState(key);
  if (lastKey !== key) {
    setLastKey(key);
    setForm(tarefa ? de(tarefa) : vazio);
  }

  // Restrição — estado próprio, editado por ação dedicada (não faz parte do salvar geral).
  const [restricaoTipo, setRestricaoTipo] = useState(tarefa?.restricaoTipo ?? "");
  const [restricaoData, setRestricaoData] = useState(tarefa?.restricaoData ?? hoje);
  const [lastKeyR, setLastKeyR] = useState(key);
  if (lastKeyR !== key) {
    setLastKeyR(key);
    setRestricaoTipo(tarefa?.restricaoTipo ?? "");
    setRestricaoData(tarefa?.restricaoData ?? hoje);
  }

  // Bloqueio — idem: ação própria, com motivo obrigatório.
  const [motivoBloqueio, setMotivoBloqueio] = useState(tarefa?.motivoBloqueio ?? "");
  const [previsaoDesbloqueio, setPrevisaoDesbloqueio] = useState(tarefa?.previsaoDesbloqueio ?? "");
  const [lastKeyB, setLastKeyB] = useState(key);
  if (lastKeyB !== key) {
    setLastKeyB(key);
    setMotivoBloqueio(tarefa?.motivoBloqueio ?? "");
    setPrevisaoDesbloqueio(tarefa?.previsaoDesbloqueio ?? "");
  }

  function salvar() {
    if (!form.nome.trim()) return;
    start(async () => {
      const r = linhaAtual
        ? await editarEapTarefa({
            id: linhaAtual.id,
            nome: form.nome,
            disciplinaId: form.disciplinaId === NONE ? "" : form.disciplinaId,
            etapaId: form.etapaId === NONE ? "" : form.etapaId,
            inicioPrevisto: form.inicioPrevisto,
            fimPrevisto: form.marco ? form.inicioPrevisto : form.fimPrevisto,
            progresso: Number(form.progresso),
            marco: form.marco,
          })
        : await criarEapTarefa({
            projetoId,
            parentId: form.parentId === NONE ? "" : form.parentId,
            disciplinaId: form.disciplinaId === NONE ? "" : form.disciplinaId,
            etapaId: form.etapaId === NONE ? "" : form.etapaId,
            nome: form.nome,
            inicioPrevisto: form.inicioPrevisto,
            fimPrevisto: form.marco ? form.inicioPrevisto : form.fimPrevisto,
            progresso: Number(form.progresso),
            marco: form.marco,
          });
      if (r.ok) {
        toast.success(linhaAtual ? "Tarefa atualizada." : "Tarefa criada.");
        onOpenChange(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function excluir() {
    if (!linhaAtual) return;
    start(async () => {
      const r = await excluirEapTarefa({ id: linhaAtual.id });
      if (r.ok) {
        toast.success("Tarefa excluída.");
        onOpenChange(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function toggleDep(predecessoraId: string) {
    if (!linhaAtual) return;
    const tem = linhaAtual.predecessoraIds.includes(predecessoraId);
    start(async () => {
      const r = tem
        ? await removerDependencia({ tarefaId: linhaAtual.id, predecessoraId })
        : await vincularDependencia({ tarefaId: linhaAtual.id, predecessoraId, tipo: "fs", lagDias: 0 });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  function mudarVinculo(predecessoraId: string, campo: "tipo" | "lagDias", valor: string | number) {
    if (!linhaAtual) return;
    const vinculo = linhaAtual.predecessoras.find((p) => p.predecessoraId === predecessoraId);
    if (!vinculo) return;
    start(async () => {
      const r = await editarVinculo({
        tarefaId: linhaAtual.id,
        predecessoraId,
        tipo: campo === "tipo" ? (valor as "fs" | "ss" | "ff" | "sf") : vinculo.tipo,
        lagDias: campo === "lagDias" ? Number(valor) : vinculo.lagDias,
      });
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  }

  function salvarRestricao() {
    if (!linhaAtual) return;
    if (restricaoTipo && !restricaoData) {
      toast.error("Informe a data da restrição.");
      return;
    }
    start(async () => {
      const r = await definirRestricao({
        id: linhaAtual.id,
        tipo: (restricaoTipo || null) as never,
        data: restricaoData || undefined,
      });
      if (r.ok) {
        toast.success(restricaoTipo ? "Restrição fixada." : "Restrição removida.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function bloquear() {
    if (!linhaAtual) return;
    if (!motivoBloqueio.trim()) {
      toast.error("Descreva o motivo do bloqueio.");
      return;
    }
    start(async () => {
      const r = await definirBloqueio({
        id: linhaAtual.id,
        motivo: motivoBloqueio,
        previsaoDesbloqueio: previsaoDesbloqueio || undefined,
      });
      if (r.ok) {
        toast.success("Tarefa bloqueada.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function liberar() {
    if (!linhaAtual) return;
    start(async () => {
      const r = await desbloquear({ id: linhaAtual.id });
      if (r.ok) {
        toast.success("Bloqueio removido.");
        setMotivoBloqueio("");
        setPrevisaoDesbloqueio("");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const outras = tarefas.filter((t) => t.id !== tarefa?.id);
  /** Fases que a disciplina escolhida tem (F4) — as únicas que a linha pode apontar. */
  const fasesDaDisciplina = disciplinas.find((d) => d.id === form.disciplinaId)?.etapas ?? [];
  const possiveisPais = outras;
  const bloqueada = linhaAtual?.status === "blq";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {linhaAtual ? linhaAtual.nome : "Nova tarefa da EAP"}
            {bloqueada && (
              <Badge variant="outline" className="border-destructive/40 text-destructive">
                <Lock className="mr-1 size-3" /> bloqueada
              </Badge>
            )}
            {linhaAtual?.conflitoRestricao && (
              <Badge variant="outline" className="border-warning/40 text-warning">
                <Pin className="mr-1 size-3" /> conflito de restrição
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {linhaAtual && (
            <p className="rounded-sm bg-muted/40 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
              {linhaAtual.idCorporativo ?? "—"} · EAP {linhaAtual.codigoEap ?? "—"} · {linhaAtual.duracaoDias}d úteis
              {linhaAtual.folgaTotal > 0 && ` · folga ${linhaAtual.folgaTotal}d`}
              {linhaAtual.critica && " · caminho crítico"}
            </p>
          )}

          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="marco"
              checked={form.marco}
              onCheckedChange={(v) => setForm((f) => ({ ...f, marco: v === true }))}
            />
            <Label htmlFor="marco" className="cursor-pointer font-normal">
              Marco (milestone — data pontual, sem duração)
            </Label>
          </div>

          <div className={`grid gap-3 ${form.marco ? "grid-cols-1" : "grid-cols-2"}`}>
            <div className="space-y-1.5">
              <Label>{form.marco ? "Data do marco" : "Início previsto"}</Label>
              <Input
                type="date"
                value={form.inicioPrevisto}
                onChange={(e) => setForm((f) => ({ ...f, inicioPrevisto: e.target.value }))}
              />
            </div>
            {!form.marco && (
              <div className="space-y-1.5">
                <Label>Fim previsto</Label>
                <Input
                  type="date"
                  value={form.fimPrevisto}
                  onChange={(e) => setForm((f) => ({ ...f, fimPrevisto: e.target.value }))}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Disciplina (opcional)</Label>
              <Select
                value={form.disciplinaId}
                onValueChange={(v) =>
                  setForm((f) => {
                    const disciplinaId = v ?? NONE;
                    // Fase de outra disciplina não aponta etapa desta: troca de disciplina limpa a fase.
                    const aindaVale = disciplinas.find((d) => d.id === disciplinaId)?.etapas.some((e) => e.etapaId === f.etapaId);
                    return { ...f, disciplinaId, etapaId: aindaVale ? f.etapaId : NONE };
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {disciplinas.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!form.marco && (
              <div className="space-y-1.5">
                <Label>Progresso: {form.progresso}%</Label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={form.progresso}
                  // Linha-resumo: o % é calculado dos filhos e ignora o que se digitar (Doc 03 §23).
                  disabled={linhaAtual?.progressoDerivado === true}
                  onChange={(e) => setForm((f) => ({ ...f, progresso: Number(e.target.value) }))}
                  className="w-full accent-primary disabled:opacity-50"
                />
                {linhaAtual?.progressoDerivado && (
                  <p className="text-[11px] text-muted-foreground">
                    Linha de agrupamento: o avanço é calculado dos filhos, ponderado por horas.
                  </p>
                )}
                {linhaAtual && !linhaAtual.progressoDerivado && (
                  <div className="space-y-1 pt-0.5">
                    {/* F6.3 (D19): o coordenador INFORMA o %; o sistema só sugere o que já sabe (checklist
                        do card, situação da disciplina). "Usar" preenche o controle acima — nada é gravado
                        até clicar em Salvar. */}
                    {linhaAtual.sugestoesProgresso.map((sug) => (
                      <button
                        key={sug.origem}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, progresso: sug.valor }))}
                        className="block w-full rounded-sm border border-dashed px-2 py-1 text-left text-[11px] text-muted-foreground hover:border-primary hover:text-foreground"
                      >
                        Sugestão: <strong className="text-foreground">{sug.valor}%</strong> — {sug.motivo}{" "}
                        <span className="text-primary">usar</span>
                      </button>
                    ))}
                    {linhaAtual.contextoArquivos && (
                      <p className="text-[11px] text-muted-foreground">{linhaAtual.contextoArquivos}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {fasesDaDisciplina.length > 0 && (
            <div className="space-y-1.5">
              <Label>Fase (opcional)</Label>
              <Select value={form.etapaId} onValueChange={(v) => setForm((f) => ({ ...f, etapaId: v ?? NONE }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {fasesDaDisciplina.map((e) => (
                    <SelectItem key={e.etapaId} value={e.etapaId}>
                      {e.sigla} · {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.marco && (
                <p className="text-[11px] text-muted-foreground">
                  Marco de entrega da fase: quando for concluído, quem aprova disciplinas pode aprovar a fase e liberar o
                  pagamento dela.
                </p>
              )}
            </div>
          )}

          {!tarefa && possiveisPais.length > 0 && (
            <div className="space-y-1.5">
              <Label>Subtarefa de (opcional)</Label>
              <Select
                value={form.parentId}
                onValueChange={(v) => setForm((f) => ({ ...f, parentId: v ?? NONE }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— (tarefa de topo)</SelectItem>
                  {possiveisPais.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {linhaAtual && outras.length > 0 && (
            <div className="space-y-1.5">
              <Label>Depende de (predecessoras)</Label>
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {outras.map((t) => {
                  const vinculo = linhaAtual.predecessoras.find((p) => p.predecessoraId === t.id);
                  const sel = vinculo != null;
                  return (
                    <div key={t.id} className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => toggleDep(t.id)}
                        className={`rounded-sm border px-2 py-1 text-xs transition-colors ${
                          sel
                            ? "border-warning bg-warning/15 text-warning"
                            : "border-border text-muted-foreground hover:border-warning/50"
                        }`}
                      >
                        {t.nome}
                      </button>
                      {sel && vinculo && (
                        <>
                          <Select
                            value={vinculo.tipo}
                            onValueChange={(v) => v && mudarVinculo(t.id, "tipo", v)}
                          >
                            <SelectTrigger className="h-6 w-[7.5rem] text-[11px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(TIPO_VINCULO_LABEL).map(([v, label]) => (
                                <SelectItem key={v} value={v} className="text-[11px]">
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            type="number"
                            value={vinculo.lagDias}
                            onChange={(e) => mudarVinculo(t.id, "lagDias", e.target.value)}
                            className="h-6 w-16 text-[11px]"
                            title="Lag em dias úteis (negativo = antecipação)"
                          />
                          <span className="text-[10px] text-muted-foreground">dias úteis</span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {linhaAtual && (
            <CollapsibleSection
              titulo="Recursos"
              resumo={
                linhaAtual.atribuicoes.length === 0
                  ? undefined
                  : `${linhaAtual.atribuicoes.length} pessoa(s)/perfil(is)${
                      linhaAtual.trabalhoHoras != null ? ` · ${linhaAtual.trabalhoHoras}h` : ""
                    }${linhaAtual.horasApontadas > 0 ? ` · ${rotuloHoras(linhaAtual.horasApontadas)} apontadas` : ""}`
              }
            >
              {/* Previsto × real (F6): as horas que o ponto já registrou nesta linha, via o card dela. */}
              {!linhaAtual.ehResumo && (linhaAtual.horasApontadas > 0 || linhaAtual.trabalhoHoras != null) && (
                <p className="mb-2 text-xs text-muted-foreground">
                  Apontado no ponto: <strong className="text-foreground">{rotuloHoras(linhaAtual.horasApontadas)}</strong>
                  {linhaAtual.trabalhoHoras != null ? ` de ${rotuloHoras(linhaAtual.trabalhoHoras)} previstas` : " (sem horas previstas)"}.
                </p>
              )}
              <EapAtribuicoes linha={linhaAtual} pessoas={pessoas} />
            </CollapsibleSection>
          )}

          {linhaAtual && (
            <CollapsibleSection
              titulo="Restrição de data"
              resumo={
                linhaAtual.restricaoTipo
                  ? `${RESTRICAO_LABEL[linhaAtual.restricaoTipo]} ${linhaAtual.restricaoData}`
                  : undefined
              }
            >
              <p className="mb-2 text-xs text-muted-foreground">
                Fixa a data e a tela mostra o alfinete. Sem restrição, o motor calcula livremente
                pelas dependências.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={restricaoTipo || NONE}
                  onValueChange={(v) => setRestricaoTipo(v === NONE ? "" : (v ?? ""))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sem restrição" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sem restrição</SelectItem>
                    {Object.entries(RESTRICAO_LABEL).map(([v, label]) => (
                      <SelectItem key={v} value={v}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={restricaoData}
                  onChange={(e) => setRestricaoData(e.target.value)}
                  disabled={!restricaoTipo}
                />
              </div>
              <Button size="sm" variant="outline" className="mt-2" onClick={salvarRestricao} disabled={pending}>
                {restricaoTipo ? (
                  <>
                    <Pin className="size-3.5" /> Fixar restrição
                  </>
                ) : (
                  <>
                    <PinOff className="size-3.5" /> Remover restrição
                  </>
                )}
              </Button>
            </CollapsibleSection>
          )}

          {linhaAtual && (
            <CollapsibleSection
              titulo="Bloqueio"
              resumo={bloqueada ? linhaAtual.motivoBloqueio ?? "bloqueada" : undefined}
            >
              <p className="mb-2 text-xs text-muted-foreground">
                Bloqueio não pausa o prazo — o atraso continua contando. Ele só registra a
                origem, para separar &ldquo;atrasado por nós&rdquo; de &ldquo;atrasado esperando o cliente&rdquo;.
              </p>
              {bloqueada ? (
                <div className="space-y-2">
                  <p className="text-sm">{linhaAtual.motivoBloqueio}</p>
                  {linhaAtual.previsaoDesbloqueio && (
                    <p className="text-xs text-muted-foreground">
                      Previsão de solução: {linhaAtual.previsaoDesbloqueio}
                    </p>
                  )}
                  <Button size="sm" variant="outline" onClick={liberar} disabled={pending}>
                    <Unlock className="size-3.5" /> Desbloquear
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea
                    rows={3}
                    placeholder="Motivo do bloqueio (ex.: aguardando definição da arquitetura)"
                    value={motivoBloqueio}
                    onChange={(e) => setMotivoBloqueio(e.target.value)}
                    className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                  />
                  <div className="space-y-1.5">
                    <Label className="text-xs">Previsão de solução (opcional)</Label>
                    <Input
                      type="date"
                      value={previsaoDesbloqueio}
                      onChange={(e) => setPrevisaoDesbloqueio(e.target.value)}
                    />
                  </div>
                  <Button size="sm" variant="outline" onClick={bloquear} disabled={pending}>
                    <Lock className="size-3.5" /> Bloquear
                  </Button>
                </div>
              )}
            </CollapsibleSection>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          {linhaAtual ? (
            <Button variant="ghost" size="sm" onClick={excluir} disabled={pending}>
              <Trash2 className="size-3.5" /> Excluir
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={pending || !form.nome.trim()}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
