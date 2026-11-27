"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
import { useAberto, type ControleJanela } from "@/lib/use-aberto";
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
  controle,
}: {
  disciplinaId: string;
  nome: string;
  /** Valor já mascarado pelo card — quem não vê valor recebe `null` e vê só o percentual. */
  valor: number | null;
  temEtapas: boolean;
  /** Aberta pelo menu do card: sem o botão próprio. */
  controle?: ControleJanela;
}) {
  const [open, setOpen] = useAberto(controle);
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, startCarga] = useTransition();

  function carregar() {
    startCarga(async () => {
      const r = await carregarEtapasDisciplina({ disciplinaId });
      if (r.ok) setDados(r.data);
      else toast.error(r.error);
    });
  }

  function abrir() {
    setOpen(true);
    carregar();
  }

  // Aberta pelo menu (sem passar por `abrir`): carrega ao abrir.
  const abertaAntes = useRef(open);
  useEffect(() => {
    if (controle && open && !abertaAntes.current) carregar();
    abertaAntes.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setDados(null);
      }}
    >
      {!controle && (
        <button
          type="button"
          onClick={abrir}
          className="inline-flex size-7 items-center justify-center rounded hover:bg-muted"
          title={temEtapas ? "Etapas da disciplina" : "Dividir em etapas (Básico, Executivo…)"}
          aria-label="Etapas da disciplina"
        >
          <Layers className={`size-3.5 ${temEtapas ? "text-primary" : "text-muted-foreground"}`} />
        </button>
      )}
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Etapas — {nome}</DialogTitle>
          <DialogDescription>
            Cada fase da disciplina com início, prazo, situação e fatia do valor. Com etapa, o prazo da
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
  const confirm = useConfirm();
  // Gravações em FILA, uma de cada vez, e os campos de data e % continuam livres enquanto ela
  // anda: quem preencheu o início da fase BS já digita o prazo (ou a fase EX) sem esperar a volta
  // do servidor. Cada gravação lê o estado da etapa NA HORA em que roda (`dadosRef`, já com o que
  // a anterior gravou) — montar o pedido com a linha da tela no clique mandaria o início antigo
  // junto com o prazo novo e apagaria o início que acabou de ser salvo.
  const fila = useRef<Promise<void>>(Promise.resolve());
  // `dados` só muda por aqui (`recarregar`) enquanto o editor está montado: o diálogo zera e
  // remonta o editor a cada abertura.
  const dadosRef = useRef(dados);
  const [emFila, setEmFila] = useState(0);
  const pending = emFila > 0;
  // Remonta SÓ a linha recusada: o campo guarda o que se digita em estado local, e a remontagem
  // traz de volta o que o banco de fato tem (o campo mostraria o valor recusado). Remontar todas
  // a cada gravação apagaria o que a pessoa está digitando em outra linha.
  const [versaoLinha, setVersaoLinha] = useState<Record<string, number>>({});

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

  /**
   * Recarrega depois de gravar — ou de falhar: o prazo consolidado e a ordem vêm do servidor.
   * Sem `router.refresh()`: as actions de etapa chamam `revalidatePath`, e a resposta da própria
   * action já traz a página redesenhada (o card atrás do diálogo) — o refresh renderizava a página
   * inteira do projeto uma SEGUNDA vez a cada campo salvo.
   */
  async function recarregar() {
    const r = await carregarEtapasDisciplina({ disciplinaId });
    if (r.ok) {
      dadosRef.current = r.data;
      setDados(r.data);
    }
  }

  function recusada(etapaId: string) {
    setVersaoLinha((v) => ({ ...v, [etapaId]: (v[etapaId] ?? 0) + 1 }));
  }

  /** Põe um passo na fila: roda depois do anterior, e recarrega os dados ao fim dele. */
  function enfileirar(passo: () => Promise<void>) {
    setEmFila((n) => n + 1);
    fila.current = fila.current.then(async () => {
      try {
        await passo();
        await recarregar();
      } catch {
        toast.error("Não foi possível salvar. Tente de novo.");
      } finally {
        setEmFila((n) => n - 1);
      }
    });
  }

  function salvar(etapaId: string, patch: Partial<Pick<EtapaParaTela, "inicio" | "prazo" | "percentual" | "status">>) {
    enfileirar(async () => {
      const atual = dadosRef.current.etapas.find((x) => x.id === etapaId);
      if (!atual) return;
      const prox = { ...atual, ...patch };
      const r = await salvarEtapaDisciplina({
        disciplinaId,
        etapaId: prox.etapaId,
        inicio: prox.inicio,
        prazo: prox.prazo,
        percentual: prox.percentual,
        status: prox.status,
      });
      if (!r.ok) {
        toast.error(r.error);
        recusada(etapaId);
      }
    });
  }

  function adicionar(faseId: string) {
    enfileirar(async () => {
      const r = await salvarEtapaDisciplina({
        disciplinaId,
        etapaId: faseId,
        prazo: null,
        // Pré-preenche o que falta para fechar 100%, em vez de a etapa nascer 0% parecendo válida.
        percentual: percentualQueFalta(dadosRef.current.etapas),
      });
      if (!r.ok) toast.error(r.error);
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
    enfileirar(async () => {
      const r = await aprovarEtapaDisciplina({ id: e.id });
      if (!r.ok) toast.error(r.error);
      else
        toast.success(
          r.data.pagamentos > 0
            ? `Fase ${e.sigla} aprovada — pagamento liberado.`
            : `Fase ${e.sigla} aprovada.`,
        );
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
    enfileirar(async () => {
      const r = await excluirEtapaDisciplina({ id: e.id });
      if (!r.ok) toast.error(r.error);
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
                <th className="px-3 py-2">Início</th>
                <th className="px-3 py-2">Prazo (fim)</th>
                <th className="px-3 py-2">Situação</th>
                <th className="px-3 py-2">%</th>
                {valor != null && <th className="px-3 py-2 text-right">Valor</th>}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {dados.etapas.map((e) => (
                <LinhaEtapa
                  key={`${e.id}:${versaoLinha[e.id] ?? 0}`}
                  etapa={e}
                  mostrarValor={valor != null}
                  valorDaFase={valorDaFase(e)}
                  prazoPlanejado={dados.prazoPlanejado}
                  pending={pending}
                  podeAprovar={dados.podeAprovarFase && !dados.pagaInteira}
                  onSalvar={(patch) => salvar(e.id, patch)}
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
            {pending && <span className="mr-2 text-muted-foreground">Salvando…</span>}
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
  onSalvar: (patch: Partial<Pick<EtapaParaTela, "inicio" | "prazo" | "percentual" | "status">>) => void;
  onAprovar: () => void;
  onExcluir: () => void;
}) {
  const aprovavel = podeAprovar && (etapa.status === "entregue" || etapa.status === "em_revisao");
  // Prazo e percentual editados localmente e gravados ao sair do campo (ou Enter). Gravar a
  // cada tecla dispararia uma action — e um registro de auditoria — por dígito; no campo de
  // data, pior: apagar um segmento com Backspace já esvazia o valor, e gravar isso zeraria o
  // prazo da etapa e rebaixaria o da disciplina no meio da digitação. Datas e % ficam livres
  // enquanto uma gravação anda: a fila do editor salva uma de cada vez.
  const [data, setData] = useState(etapa.prazo ?? "");
  const [dataInicio, setDataInicio] = useState(etapa.inicio ?? "");
  const [pct, setPct] = useState(String(etapa.percentual));
  // O que o banco devolveu muda (gravou, ou arredondou o Decimal(5,2)): o campo passa a mostrá-lo.
  // Só o campo cujo valor salvo mudou — o que a pessoa digita em outro campo da linha fica.
  const [salvo, setSalvo] = useState({ prazo: etapa.prazo, inicio: etapa.inicio, percentual: etapa.percentual });
  if (salvo.prazo !== etapa.prazo || salvo.inicio !== etapa.inicio || salvo.percentual !== etapa.percentual) {
    if (salvo.prazo !== etapa.prazo) setData(etapa.prazo ?? "");
    if (salvo.inicio !== etapa.inicio) setDataInicio(etapa.inicio ?? "");
    if (salvo.percentual !== etapa.percentual) setPct(String(etapa.percentual));
    setSalvo({ prazo: etapa.prazo, inicio: etapa.inicio, percentual: etapa.percentual });
  }

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

  // Mesma regra do prazo: só grava ao sair do campo, e digitação interrompida não limpa.
  function gravarInicio(input: HTMLInputElement) {
    if (dataInicio === (etapa.inicio ?? "")) return;
    if (dataInicio === "") {
      if (input.validity.badInput) setDataInicio(etapa.inicio ?? "");
      else onSalvar({ inicio: null });
      return;
    }
    if (prazoEtapaValido(dataInicio)) onSalvar({ inicio: dataInicio });
    else {
      toast.error("Data de início inválida.");
      setDataInicio(etapa.inicio ?? "");
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
          value={dataInicio}
          max={etapa.prazo ?? prazoPlanejado ?? undefined}
          onChange={(ev) => setDataInicio(ev.target.value)}
          onBlur={(ev) => gravarInicio(ev.currentTarget)}
          onKeyDown={enterGrava}
          aria-label={`Início da fase ${etapa.sigla}`}
          className="h-8 w-36 text-xs"
        />
      </td>
      <td className="px-3 py-2">
        <Input
          type="date"
          value={data}
          aria-label={`Prazo da fase ${etapa.sigla}`}
          max={prazoPlanejado ?? undefined}
          onChange={(ev) => setData(ev.target.value)}
          onBlur={(ev) => gravarData(ev.currentTarget)}
          onKeyDown={enterGrava}
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
            // Duas casas, como o Decimal(5,2) grava: o campo já mostra o que fica salvo.
            const n = Math.round(Number(pct.replace(",", ".")) * 100) / 100;
            if (Number.isFinite(n) && n !== etapa.percentual) {
              setPct(String(n));
              onSalvar({ percentual: n });
            } else setPct(String(etapa.percentual));
          }}
          onKeyDown={enterGrava}
          disabled={etapa.liberada}
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
