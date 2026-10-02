"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Plus, Repeat } from "lucide-react";
import { toast } from "sonner";
import type { AcaoItemAcao } from "@/components/ui/acoes";
import { BotaoAcoes } from "@/components/ui/acoes-menu";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DicaMenuContexto } from "@/components/ui/dica-menu-contexto";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { InputMoeda } from "@/components/ui/input-moeda";
import { Label } from "@/components/ui/label";
import { LinhaComMenu } from "@/components/ui/linha-com-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Valor } from "@/components/financeiro/valor";
import { cn } from "@/lib/utils";
import {
  ACAO_ATIVAR,
  ACAO_DESATIVAR,
  ACAO_EDITAR,
  ACAO_EXCLUIR,
  ACAO_GERAR,
  itensDeCompromisso,
} from "@/modules/financeiro/recorrencia/acoes";
import {
  alternarAtivoCompromisso,
  excluirCompromisso,
  gerarAgora,
  salvarCompromisso,
} from "@/modules/financeiro/recorrencia/actions";
import { descreverVencimento, rotuloDaCompetencia } from "@/modules/financeiro/recorrencia/calculo";
import type { CompromissoDto } from "@/modules/financeiro/recorrencia/queries";

const NENHUM = "__nenhum";
const PRIORIDADES = [
  ["p1", "P1 · não pode atrasar"],
  ["p2", "P2 · importante"],
  ["p3", "P3 · pode negociar"],
  ["p4", "P4 · adiável"],
] as const;

type Opcao = { id: string; nome: string };
type Rascunho = {
  id: string | null;
  descricao: string;
  valor: number | null;
  diaVencimento: string;
  regraVencimento: "dia_fixo" | "dia_util";
  mesesAteVencimento: string;
  adiantamento: boolean;
  competenciaInicio: string;
  competenciaFim: string;
  categoriaId: string;
  socioId: string;
  caixinhaId: string;
  prioridade: string;
  antecedenciaDias: string;
};

const vazio = (mesAtual: string): Rascunho => ({
  id: null,
  descricao: "",
  valor: null,
  diaVencimento: "5",
  regraVencimento: "dia_fixo",
  mesesAteVencimento: "0",
  adiantamento: false,
  competenciaInicio: mesAtual,
  competenciaFim: "",
  categoriaId: "",
  socioId: NENHUM,
  caixinhaId: NENHUM,
  prioridade: NENHUM,
  antecedenciaDias: "5",
});

const daDto = (c: CompromissoDto): Rascunho => ({
  id: c.id,
  descricao: c.descricao,
  valor: c.valor / 100,
  diaVencimento: String(c.diaVencimento),
  regraVencimento: c.regraVencimento,
  mesesAteVencimento: String(c.mesesAteVencimento),
  adiantamento: c.adiantamento,
  competenciaInicio: c.competenciaInicio,
  competenciaFim: c.competenciaFim ?? "",
  categoriaId: c.categoriaId,
  socioId: c.socioId ?? NENHUM,
  caixinhaId: c.caixinhaId ?? NENHUM,
  prioridade: c.prioridade ?? NENHUM,
  antecedenciaDias: String(c.antecedenciaDias),
});

/**
 * Compromissos recorrentes (ADR-0009): o cadastro do que se repete todo mês. Não cria conta a pagar —
 * o planejador projeta os meses e o sistema gera o lançamento perto do vencimento.
 */
export function RecorrentesSection({
  compromissos,
  categorias,
  socios,
  caixinhas,
  mesAtual,
}: {
  compromissos: CompromissoDto[];
  /** Categorias de despesa ativas. */
  categorias: { id: string; codigo: string; nome: string }[];
  socios: Opcao[];
  caixinhas: Opcao[];
  /** `YYYY-MM` de hoje, para a primeira competência do formulário. */
  mesAtual: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pendente, iniciar] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [rascunho, setRascunho] = useState<Rascunho>(() => vazio(mesAtual));

  useEffect(() => {
    if (!aberto) setRascunho(vazio(mesAtual));
  }, [aberto, mesAtual]);

  const rodar = (p: Promise<{ ok: boolean; error?: string }>, ok: string) =>
    iniciar(async () => {
      const r = await p;
      if (!r.ok) return void toast.error(r.error ?? "Não foi possível.");
      toast.success(ok);
      router.refresh();
    });

  async function aoSelecionar(c: CompromissoDto, item: AcaoItemAcao) {
    // Confirmação SEMPRE antes da transição (React 19 suspenderia o diálogo dentro dela).
    if (item.confirmar && !(await confirm({ title: item.confirmar.titulo, description: item.confirmar.descricao, confirmLabel: item.confirmar.rotuloConfirmar, variant: item.variant === "destructive" ? "destructive" : "default" })))
      return;
    if (item.id === ACAO_EDITAR) {
      setRascunho(daDto(c));
      setAberto(true);
    } else if (item.id === ACAO_ATIVAR || item.id === ACAO_DESATIVAR) {
      rodar(alternarAtivoCompromisso({ id: c.id }), item.id === ACAO_ATIVAR ? "Compromisso ativado." : "Compromisso inativo.");
    } else if (item.id === ACAO_EXCLUIR) {
      rodar(excluirCompromisso({ id: c.id }), "Compromisso excluído.");
    } else if (item.id === ACAO_GERAR) {
      iniciar(async () => {
        const r = await gerarAgora(undefined as never);
        if (!r.ok) return void toast.error(r.error);
        toast.success(r.data.criados > 0 ? `${r.data.criados} ${r.data.criados === 1 ? "lançamento criado" : "lançamentos criados"}.` : "Nada a gerar: os meses vencidos já têm lançamento.");
        router.refresh();
      });
    }
  }

  function salvar() {
    iniciar(async () => {
      const r = await salvarCompromisso({
        id: rascunho.id ?? undefined,
        descricao: rascunho.descricao,
        valor: rascunho.valor ?? 0,
        diaVencimento: Number(rascunho.diaVencimento) || 1,
        regraVencimento: rascunho.regraVencimento,
        mesesAteVencimento: Number(rascunho.mesesAteVencimento) || 0,
        adiantamento: rascunho.adiantamento,
        competenciaInicio: rascunho.competenciaInicio,
        competenciaFim: rascunho.competenciaFim || null,
        categoriaId: rascunho.categoriaId,
        socioId: rascunho.socioId === NENHUM ? null : rascunho.socioId,
        caixinhaId: rascunho.caixinhaId === NENHUM ? null : rascunho.caixinhaId,
        prioridade: rascunho.prioridade === NENHUM ? null : (rascunho.prioridade as "p1" | "p2" | "p3" | "p4"),
        antecedenciaDias: Number(rascunho.antecedenciaDias) || 0,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success(rascunho.id ? "Compromisso atualizado." : "Compromisso criado. O planejador já projeta os próximos meses.");
      setAberto(false);
      router.refresh();
    });
  }

  const set = (p: Partial<Rascunho>) => setRascunho((r) => ({ ...r, ...p }));
  const valido = rascunho.descricao.trim() && (rascunho.valor ?? 0) > 0 && rascunho.categoriaId && /^\d{4}-\d{2}$/.test(rascunho.competenciaInicio);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">
          O que se repete todo mês (pró-labore, aluguel, licenças). O cadastro não cria conta a pagar: o planejador projeta os meses e o
          lançamento nasce perto do vencimento.
        </p>
        <Button
          size="sm"
          onClick={() => {
            setRascunho(vazio(mesAtual));
            setAberto(true);
          }}
        >
          <Plus className="size-4" aria-hidden /> Novo compromisso
        </Button>
      </div>

      {compromissos.length === 0 ? (
        <EmptyState icon={Repeat} title="Nenhum compromisso recorrente." description="Cadastre o pró-labore ou outra saída que se repete todo mês." />
      ) : (
        <>
          <DicaMenuContexto />
          <ul className="overflow-hidden rounded-sm border">
            {compromissos.map((c) => renderLinha(c))}
          </ul>
        </>
      )}

      <Dialog open={aberto} onOpenChange={(o) => !o && setAberto(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{rascunho.id ? "Editar compromisso" : "Novo compromisso recorrente"}</DialogTitle>
            <DialogDescription>Mudar o valor vale para os meses que ainda não viraram lançamento.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="cr-desc">Descrição</Label>
                <Input id="cr-desc" value={rascunho.descricao} maxLength={120} placeholder="Ex.: Pró-labore Ana" onChange={(e) => set({ descricao: e.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="cr-valor">Valor por mês</Label>
                  <InputMoeda id="cr-valor" value={rascunho.valor} onChange={(v) => set({ valor: v })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="cr-dia">{rascunho.regraVencimento === "dia_util" ? "Dia útil do vencimento" : "Dia do vencimento"}</Label>
                  <Input
                    id="cr-dia"
                    type="number"
                    min={1}
                    max={rascunho.regraVencimento === "dia_util" ? 23 : 31}
                    value={rascunho.diaVencimento}
                    onChange={(e) => set({ diaVencimento: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    {rascunho.regraVencimento === "dia_util" ? "Conta os feriados cadastrados no RH." : "Mês mais curto cai no último dia."}
                  </p>
                </div>
              </div>
              {/* Folha CLT: competência de setembro, paga no 5º dia útil de outubro. */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="cr-regra">Conta o dia como</Label>
                  <Select
                    value={rascunho.regraVencimento}
                    onValueChange={(v) => set({ regraVencimento: v === "dia_util" ? "dia_util" : "dia_fixo" })}
                    items={{ dia_fixo: "Dia do mês", dia_util: "Dia útil do mês" }}
                  >
                    <SelectTrigger id="cr-regra" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dia_fixo">Dia do mês</SelectItem>
                      <SelectItem value="dia_util">Dia útil do mês</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="cr-mes">Vence</Label>
                  <Select
                    value={rascunho.mesesAteVencimento}
                    onValueChange={(v) => set({ mesesAteVencimento: v ?? "0" })}
                    items={{ "0": "No mês da competência", "1": "No mês seguinte" }}
                  >
                    <SelectTrigger id="cr-mes" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">No mês da competência</SelectItem>
                      <SelectItem value="1">No mês seguinte</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">A folha de um mês é paga no mês seguinte.</p>
                </div>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={rascunho.adiantamento}
                  onChange={(e) => set({ adiantamento: e.target.checked })}
                />
                <span>
                  É adiantamento de salário
                  <span className="block text-xs text-muted-foreground">
                    Paga antes da folha, na mesma competência. Fechar a folha nunca mexe nesta conta: o holerite já a desconta.
                  </span>
                </span>
              </label>
              <div className="grid gap-1.5">
                <Label htmlFor="cr-cat">Categoria</Label>
                <Select value={rascunho.categoriaId} onValueChange={(v) => set({ categoriaId: v ?? "" })} items={Object.fromEntries(categorias.map((c) => [c.id, `${c.codigo} ${c.nome}`]))}>
                  <SelectTrigger id="cr-cat" className="w-full">
                    <SelectValue placeholder="Selecione…" />
                  </SelectTrigger>
                  <SelectContent>
                    {categorias.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.codigo} · {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="cr-socio">Sócio (pró-labore)</Label>
                  <Select value={rascunho.socioId} onValueChange={(v) => set({ socioId: v ?? NENHUM })} items={{ [NENHUM]: "Nenhum", ...Object.fromEntries(socios.map((s) => [s.id, s.nome])) }}>
                    <SelectTrigger id="cr-socio" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NENHUM}>Nenhum</SelectItem>
                      {socios.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">É o que liga um lançamento manual a este compromisso.</p>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="cr-caixinha">Paga pela caixinha</Label>
                  <Select value={rascunho.caixinhaId} onValueChange={(v) => set({ caixinhaId: v ?? NENHUM })} items={{ [NENHUM]: "Nenhuma", ...Object.fromEntries(caixinhas.map((c) => [c.id, c.nome])) }}>
                    <SelectTrigger id="cr-caixinha" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NENHUM}>Nenhuma</SelectItem>
                      {caixinhas.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="cr-ini">Primeira competência</Label>
                  <Input id="cr-ini" type="month" value={rascunho.competenciaInicio} onChange={(e) => set({ competenciaInicio: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="cr-fim">Última competência (opcional)</Label>
                  <Input id="cr-fim" type="month" value={rascunho.competenciaFim} onChange={(e) => set({ competenciaFim: e.target.value })} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="cr-prio">Prioridade</Label>
                  <Select value={rascunho.prioridade} onValueChange={(v) => set({ prioridade: v ?? NENHUM })} items={{ [NENHUM]: "A da categoria", ...Object.fromEntries(PRIORIDADES) }}>
                    <SelectTrigger id="cr-prio" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NENHUM}>A da categoria</SelectItem>
                      {PRIORIDADES.map(([v, r]) => (
                        <SelectItem key={v} value={v}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="cr-ant">Gerar quantos dias antes</Label>
                  <Input id="cr-ant" type="number" min={0} max={60} value={rascunho.antecedenciaDias} onChange={(e) => set({ antecedenciaDias: e.target.value })} />
                </div>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button disabled={pendente || !valido} onClick={salvar}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  // Função de renderização, NÃO componente: um componente aqui dentro remontaria as linhas e fecharia
  // o menu de contexto aberto (ADR-0002).
  function renderLinha(c: CompromissoDto) {
    const itens = itensDeCompromisso({ descricao: c.descricao, ativo: c.ativo, gerados: c.gerados }, { podeGerir: true });
    const aoEscolher = (item: AcaoItemAcao) => void aoSelecionar(c, item);
    return (
      <li key={c.id} className="border-t first:border-t-0">
        <LinhaComMenu itens={itens} onSelect={aoEscolher} render={<div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm", !c.ativo && "opacity-70")} />}>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5">
              <b className="truncate">{c.descricao}</b>
              {!c.ativo && <span className="rounded-sm border px-1.5 text-xs">Inativo</span>}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {descreverVencimento(c)}
              {c.adiantamento ? " · adiantamento de salário" : ""} · {c.categoriaNome}
              {c.socioNome ? ` · ${c.socioNome}` : ""}
              {c.caixinhaNome ? ` · caixinha ${c.caixinhaNome}` : ""} · desde {rotuloDaCompetencia(c.competenciaInicio)}
              {c.competenciaFim ? ` até ${rotuloDaCompetencia(c.competenciaFim)}` : ""} · gera {c.antecedenciaDias} dia(s) antes ·{" "}
              {c.gerados === 0 ? "nenhum lançamento gerado" : `${c.gerados} ${c.gerados === 1 ? "lançamento gerado" : "lançamentos gerados"}`}
            </span>
          </span>
          <Valor valor={c.valor / 100} sentido="neutro" className="font-semibold" />
          <BotaoAcoes itens={itens} onSelect={aoEscolher} rotulo={`Ações do compromisso ${c.descricao}`} className="size-8" />
        </LinhaComMenu>
      </li>
    );
  }
}
