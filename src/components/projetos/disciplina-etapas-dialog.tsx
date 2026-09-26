"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Layers, Lock, Plus, Trash2 } from "lucide-react";
import {
  aprovarEtapaDisciplina,
  carregarEtapasDisciplina,
  excluirEtapaDisciplina,
  salvarEtapaDisciplina,
} from "@/modules/projetos/etapas-actions";
import { poolsDasFasesPendentes } from "@/modules/uploads/pagamento-fase";
import {
  percentualQueFalta,
  prazoEtapaValido,
  validarPercentuais,
  type EtapaParaTela,
} from "@/modules/projetos/etapas";
import { brl, formatarData } from "@/lib/utils";
import { STATUS_LABEL } from "@/modules/projetos/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Fase = { id: string; sigla: string; nome: string };
type Dados = {
  etapas: EtapaParaTela[];
  fases: Fase[];
  prazoDisciplina: string | null;
  prazoPlanejado: string | null;
  podeAprovarFase: boolean;
  pagaInteira: boolean;
};

/**
 * Status que se escolhe na lista. `aprovado` fica de fora: vem do botão "Aprovar" da fase (que
 * libera o pagamento dela) ou da aprovação da disciplina inteira — nunca de um select.
 */
const STATUS_ETAPA = ["aguardando", "em_andamento", "em_revisao", "entregue"] as const;

/**
 * Etapas da disciplina (F4 — par disciplina × fase, D30/D37). Carrega os próprios dados ao
 * abrir, em vez de viajar pela página → lista → card de toda disciplina a cada render.
 *
 * Cada linha salva sozinha, como a proposta composta: o plano pode ficar em rascunho sem somar
 * 100%, e a tela diz a soma o tempo todo. Quem reparte dinheiro (F7) é que recusa.
 */
export function DisciplinaEtapasButton({
  disciplinaId,
  nome,
  valor,
  temEtapas,
}: {
  disciplinaId: string;
  nome: string;
  /** Valor já mascarado pelo card — quem não vê valor recebe `null` e vê só o percentual. */
  valor: number | null;
  temEtapas: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, startCarga] = useTransition();

  function abrir() {
    setOpen(true);
    startCarga(async () => {
      const r = await carregarEtapasDisciplina({ disciplinaId });
      if (r.ok) setDados(r.data);
      else toast.error(r.error);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setDados(null);
      }}
    >
      <button
        type="button"
        onClick={abrir}
        className="inline-flex size-7 items-center justify-center rounded hover:bg-muted"
        title={temEtapas ? "Etapas da disciplina" : "Dividir em etapas (Básico, Executivo…)"}
        aria-label="Etapas da disciplina"
      >
        <Layers className={`size-3.5 ${temEtapas ? "text-primary" : "text-muted-foreground"}`} />
      </button>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Etapas — {nome}</DialogTitle>
          <DialogDescription>
            Cada fase da disciplina com prazo, situação e fatia do valor. Com etapa, o prazo da
            disciplina passa a ser o maior prazo entre elas.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {!dados || carregando ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <EditorEtapas disciplinaId={disciplinaId} valor={valor} dados={dados} setDados={setDados} />
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditorEtapas({
  disciplinaId,
  valor,
  dados,
  setDados,
}: {
  disciplinaId: string;
  valor: number | null;
  dados: Dados;
  setDados: (d: Dados) => void;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  // Remonta as linhas a cada recarga: o campo guarda o que se digita em estado local, e só a
  // remontagem traz de volta o que o banco de fato gravou — depois de uma recusa (o campo
  // mostraria o valor recusado) ou do arredondamento do Decimal(5,2).
  const [versao, setVersao] = useState(0);

  const usadas = new Set(dados.etapas.map((e) => e.etapaId));
  const livres = dados.fases.filter((f) => !usadas.has(f.id));
  const somaOk = validarPercentuais(dados.etapas);
  // Valor de cada fase pela MESMA regra da liberação (F7.4): liberada = pool congelado; pendente
  // = o que falta, pelo % das pendentes. Sem soma 100% não há regra — cai na conta simples, e a
  // mensagem da soma já está na tela.
  const pools = valor != null ? poolsDasFasesPendentes(valor, dados.etapas.map(paraPool)) : null;
  const valorDaFase = (e: EtapaParaTela): number | null => {
    if (valor == null) return null;
    if (e.liberada) return e.valorPagamento;
    if (pools?.ok) return pools.pools.get(e.id) ?? null;
    return (valor * e.percentual) / 100;
  };

  /** Recarrega depois de gravar — ou de falhar: o prazo consolidado e a ordem vêm do servidor. */
  async function recarregar() {
    const r = await carregarEtapasDisciplina({ disciplinaId });
    if (r.ok) setDados(r.data);
    setVersao((v) => v + 1);
    router.refresh();
  }

  function salvar(e: EtapaParaTela, patch: Partial<Pick<EtapaParaTela, "prazo" | "percentual" | "status">>) {
    const prox = { ...e, ...patch };
    start(async () => {
      const r = await salvarEtapaDisciplina({
        disciplinaId,
        etapaId: prox.etapaId,
        prazo: prox.prazo,
        percentual: prox.percentual,
        status: prox.status,
      });
      if (!r.ok) toast.error(r.error);
      await recarregar();
    });
  }

  function adicionar(faseId: string) {
    start(async () => {
      const r = await salvarEtapaDisciplina({
        disciplinaId,
        etapaId: faseId,
        prazo: null,
        // Pré-preenche o que falta para fechar 100%, em vez de a etapa nascer 0% parecendo válida.
        percentual: percentualQueFalta(dados.etapas),
      });
      if (!r.ok) toast.error(r.error);
      await recarregar();
    });
  }

  async function aprovar(e: EtapaParaTela) {
    const ok = await confirm({
      title: `Aprovar a fase ${e.sigla}?`,
      description:
        "Libera o pagamento desta fase para os projetistas PJ/freelancer da disciplina. Depois disso o percentual da fase fica fixo e ela não pode mais ser removida.",
      confirmLabel: "Aprovar fase",
    });
    if (!ok) return;
    start(async () => {
      const r = await aprovarEtapaDisciplina({ id: e.id });
      if (!r.ok) toast.error(r.error);
      else
        toast.success(
          r.data.pagamentos > 0
            ? `Fase ${e.sigla} aprovada — pagamento liberado.`
            : `Fase ${e.sigla} aprovada.`,
        );
      await recarregar();
    });
  }

  async function excluir(e: EtapaParaTela) {
    const ultima = dados.etapas.length === 1;
    const ok = await confirm({
      title: `Remover a etapa ${e.sigla}?`,
      description: ultima
        ? "É a última etapa: a disciplina volta a ter prazo editado direto, e fica com o prazo atual."
        : "O prazo da disciplina é recalculado com as etapas que ficam.",
      confirmLabel: "Remover",
    });
    if (!ok) return;
    start(async () => {
      const r = await excluirEtapaDisciplina({ id: e.id });
      if (!r.ok) toast.error(r.error);
      await recarregar();
    });
  }

  return (
    <div className="space-y-4">
      {dados.etapas.length === 0 ? (
        <p className="rounded-sm border border-dashed p-4 text-center text-sm text-muted-foreground">
          Sem etapas: a disciplina tem um prazo só, editado direto. Adicione a primeira fase abaixo.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-sm border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Fase</th>
                <th className="px-3 py-2">Prazo</th>
                <th className="px-3 py-2">Situação</th>
                <th className="px-3 py-2">%</th>
                {valor != null && <th className="px-3 py-2 text-right">Valor</th>}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {dados.etapas.map((e) => (
                <LinhaEtapa
                  key={`${e.id}:${versao}`}
                  etapa={e}
                  mostrarValor={valor != null}
                  valorDaFase={valorDaFase(e)}
                  prazoPlanejado={dados.prazoPlanejado}
                  pending={pending}
                  podeAprovar={dados.podeAprovarFase && !dados.pagaInteira}
                  onSalvar={(patch) => salvar(e, patch)}
                  onAprovar={() => aprovar(e)}
                  onExcluir={() => excluir(e)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dados.pagaInteira && dados.etapas.length > 0 && (
        <p className="rounded-sm border border-dashed px-3 py-2 text-xs text-muted-foreground">
          O pagamento desta disciplina já foi liberado por inteiro — as fases servem ao prazo e ao
          acompanhamento, mas não liberam pagamento.
        </p>
      )}

      {dados.etapas.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">
            Prazo da disciplina:{" "}
            <span className="font-mono text-foreground">
              {dados.prazoDisciplina ? formatarData(dados.prazoDisciplina) : "—"}
            </span>{" "}
            (o maior entre as etapas)
          </span>
          <span className={somaOk.ok ? "text-success" : "text-warning"}>
            {somaOk.ok ? "Soma 100%" : somaOk.mensagem}
          </span>
        </div>
      )}

      {livres.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Adicionar fase</Label>
          <div className="flex flex-wrap gap-1.5">
            {livres.map((f) => (
              <Button
                key={f.id}
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => adicionar(f.id)}
                title={f.nome}
              >
                <Plus className="size-3.5" /> {f.sigla} · {f.nome}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function paraPool(e: EtapaParaTela) {
  return { id: e.id, ordem: e.ordem, percentual: e.percentual, liberadaEm: e.liberada ? "liberada" : null, valorPagamento: e.valorPagamento };
}

function LinhaEtapa({
  etapa,
  mostrarValor,
  valorDaFase,
  prazoPlanejado,
  pending,
  podeAprovar,
  onSalvar,
  onAprovar,
  onExcluir,
}: {
  etapa: EtapaParaTela;
  mostrarValor: boolean;
  valorDaFase: number | null;
  prazoPlanejado: string | null;
  pending: boolean;
  podeAprovar: boolean;
  onSalvar: (patch: Partial<Pick<EtapaParaTela, "prazo" | "percentual" | "status">>) => void;
  onAprovar: () => void;
  onExcluir: () => void;
}) {
  const aprovavel = podeAprovar && (etapa.status === "entregue" || etapa.status === "em_revisao");
  // Prazo e percentual editados localmente e gravados ao sair do campo (ou Enter). Gravar a
  // cada tecla dispararia uma action — e um registro de auditoria — por dígito; no campo de
  // data, pior: apagar um segmento com Backspace já esvazia o valor, e gravar isso zeraria o
  // prazo da etapa e rebaixaria o da disciplina no meio da digitação.
  const [data, setData] = useState(etapa.prazo ?? "");
  const [pct, setPct] = useState(String(etapa.percentual));

  function gravarData(input: HTMLInputElement) {
    if (data === (etapa.prazo ?? "")) return;
    if (data === "") {
      // Vazio com segmento pela metade (`badInput`) é digitação interrompida, não pedido de
      // limpar: volta ao prazo salvo. Vazio de verdade — todos os segmentos apagados — limpa.
      if (input.validity.badInput) setData(etapa.prazo ?? "");
      else onSalvar({ prazo: null });
      return;
    }
    if (prazoEtapaValido(data)) onSalvar({ prazo: data });
    else {
      toast.error("Data do prazo inválida.");
      setData(etapa.prazo ?? "");
    }
  }

  const enterGrava = (ev: React.KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === "Enter") ev.currentTarget.blur();
  };

  return (
    <tr>
      <td className="whitespace-nowrap px-3 py-2">
        <span className="font-mono text-xs font-bold">{etapa.sigla}</span>{" "}
        <span className="text-muted-foreground">{etapa.nome}</span>
      </td>
      <td className="px-3 py-2">
        <Input
          type="date"
          value={data}
          max={prazoPlanejado ?? undefined}
          onChange={(ev) => setData(ev.target.value)}
          onBlur={(ev) => gravarData(ev.currentTarget)}
          onKeyDown={enterGrava}
          disabled={pending}
          className="h-8 w-36 text-xs"
        />
      </td>
      <td className="px-3 py-2">
        {etapa.status === "aprovado" ? (
          <span className="inline-flex items-center gap-1 text-xs text-success">
            <CheckCircle2 className="size-3.5" aria-hidden />
            {etapa.liberada ? "Aprovada · pagamento liberado" : STATUS_LABEL.aprovado}
          </span>
        ) : (
          <Select
            value={etapa.status}
            disabled={pending}
            onValueChange={(v) => v && v !== etapa.status && onSalvar({ status: v as EtapaParaTela["status"] })}
          >
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_ETAPA.map((s) => (
                <SelectItem key={s} value={s} className="text-xs">
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </td>
      <td className="px-3 py-2">
        <Input
          type="number"
          min={0}
          max={100}
          step="0.01"
          value={pct}
          onChange={(ev) => setPct(ev.target.value)}
          onBlur={() => {
            const n = Number(pct.replace(",", "."));
            if (Number.isFinite(n) && n !== etapa.percentual) onSalvar({ percentual: n });
            else setPct(String(etapa.percentual));
          }}
          onKeyDown={enterGrava}
          disabled={pending || etapa.liberada}
          title={etapa.liberada ? "Pagamento da fase já liberado — o percentual está fixado." : undefined}
          className="h-8 w-20 text-xs"
        />
      </td>
      {mostrarValor && (
        <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs text-muted-foreground">
          {/* Liberada: o pool congelado. Pendente: previsão pela regra da liberação — muda se o
              valor da disciplina mudar antes de a fase ser aprovada. */}
          {valorDaFase == null ? "—" : brl(valorDaFase)}
          {etapa.liberada && <Lock className="ml-1 inline size-3" aria-label="Valor fixado na liberação" />}
        </td>
      )}
      <td className="whitespace-nowrap px-3 py-2 text-right">
        {aprovavel && (
          <Button size="sm" variant="outline" className="mr-1 h-7 text-xs" onClick={onAprovar} disabled={pending}>
            Aprovar
          </Button>
        )}
        {etapa.liberada ? (
          <span className="inline-flex size-7 items-center justify-center" title="Fase com pagamento liberado — não pode ser removida.">
            <Lock className="size-3.5 text-muted-foreground" aria-label="Fase com pagamento liberado" />
          </span>
        ) : (
          <Button size="icon-sm" variant="ghost" aria-label={`Remover ${etapa.sigla}`} onClick={onExcluir} disabled={pending}>
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </td>
    </tr>
  );
}
