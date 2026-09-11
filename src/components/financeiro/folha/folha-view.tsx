"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Wallet, Pencil, Ban } from "lucide-react";
import {
  pagarProjetista,
  pagarProjetistasSelecionados,
  editarPagamentoProjetista,
  cancelarPagamentoProjetista,
} from "@/modules/financeiro/folha/actions";
import { temValorPagavel, temFiltroAlemDoStatus, diasPendenteParado } from "@/modules/financeiro/folha/service";
import {
  STATUS_PAGAMENTO_LABEL,
  STATUS_PAGAMENTO_TONE,
  TIPO_PROFISSIONAL_LABEL,
  type FiltrosFolha,
} from "@/modules/financeiro/folha/status";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { FolhaItem } from "@/modules/financeiro/folha/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/ui/status-badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { InputMoeda } from "@/components/ui/input-moeda";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableHead } from "@/components/ui/sortable-head";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { pageCount } from "@/lib/list-params";
import { brl, cn, formatarData } from "@/lib/utils";
import { FolhaFiltros } from "./folha-filtros";
import { EfetivarPagamentoDialog, type DadosEfetivacao } from "./efetivar-pagamento-dialog";

const NONE = "__none";
const linkCls = "underline-offset-2 hover:underline";

type Opcao = { id: string; nome: string };
/** Quais links a pessoa pode seguir — cada destino tem seu próprio gate de permissão. */
export type LinksFolha = { projeto: boolean; pessoa: boolean; lancamento: boolean };

function pagavel(p: FolhaItem) {
  return p.status === "pendente" && temValorPagavel(p.valor);
}

export function FolhaView({
  itens,
  total,
  page,
  pageSize,
  resumo,
  canceladosOcultos,
  filtros,
  opcoesFiltro,
  links,
  contas,
  formas,
}: {
  itens: FolhaItem[];
  total: number;
  page: number;
  pageSize: number;
  resumo: { pendente: number; pago: number; cancelado: number };
  canceladosOcultos: number;
  filtros: FiltrosFolha;
  opcoesFiltro: { projetistas: { id: string; name: string }[]; projetos: { id: string; codigo: string; nome: string }[] };
  links: LinksFolha;
  contas: Opcao[];
  formas: Opcao[];
}) {
  const router = useRouter();
  const [pagar, setPagar] = useState<FolhaItem | null>(null);
  const [editar, setEditar] = useState<FolhaItem | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [loteAberto, setLoteAberto] = useState(false);
  const [pagandoLote, startLote] = useTransition();

  // A seleção vale só para o que está na tela: trocar de página ou de filtro descarta o
  // resto, e uma linha que deixou de ser pagável (alguém pagou/zerou) sai sozinha.
  const pagaveisDaPagina = useMemo(() => itens.filter(pagavel), [itens]);
  const selecao = useMemo(() => pagaveisDaPagina.filter((p) => selecionados.has(p.id)), [pagaveisDaPagina, selecionados]);
  const totalSelecao = selecao.reduce((s, p) => s + p.valor, 0);
  const todosMarcados = pagaveisDaPagina.length > 0 && selecao.length === pagaveisDaPagina.length;

  function alternar(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function pagarSelecionados(d: DadosEfetivacao) {
    startLote(async () => {
      const r = await pagarProjetistasSelecionados({ ids: selecao.map((p) => p.id), ...d });
      if (r.ok) {
        const ignorados = r.data.ignorados
          ? ` ${r.data.ignorados} ignorado(s) — já pagos, cancelados ou sem valor.`
          : "";
        toast.success(`${r.data.pagos} pagamento(s) efetivado(s) — ${brl(r.data.total)} no caixa.${ignorados}`);
        setLoteAberto(false);
        setSelecionados(new Set());
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const filtrado = temFiltroAlemDoStatus(filtros);

  return (
    <div className="space-y-4">
      <FolhaFiltros
        filtros={filtros}
        projetistas={opcoesFiltro.projetistas}
        projetos={opcoesFiltro.projetos}
        canceladosOcultos={canceladosOcultos}
      />

      <div className="space-y-1.5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Kpi rotulo="A pagar" valor={resumo.pendente} className="text-warning" />
          <Kpi rotulo="Pago" valor={resumo.pago} className="text-success" />
          <Kpi rotulo="Cancelado" valor={resumo.cancelado} className="text-muted-foreground" />
        </div>
        {/* Os totais ignoram o filtro de status de propósito — ver `listarFolha`. */}
        <p className="text-xs text-muted-foreground">
          {filtrado ? "Totais do filtro aplicado" : "Totais gerais"}, somando todos os status — mesmo os que a tabela não está mostrando.
        </p>
      </div>

      {selecao.length > 0 && (
        <div
          role="region"
          aria-label="Pagamentos selecionados"
          className="flex flex-wrap items-center gap-3 rounded-sm border border-primary/30 bg-primary/5 px-3 py-2 text-sm"
        >
          <span>
            <strong>{selecao.length}</strong> selecionado(s) · <span className="font-mono">{brl(totalSelecao)}</span>
          </span>
          <Button size="sm" onClick={() => setLoteAberto(true)}>
            <Wallet className="size-3.5" /> Pagar selecionados
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelecionados(new Set())}>
            Limpar seleção
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-sm border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Checkbox
                  checked={todosMarcados}
                  indeterminate={selecao.length > 0 && !todosMarcados}
                  disabled={pagaveisDaPagina.length === 0}
                  onCheckedChange={() =>
                    setSelecionados(todosMarcados ? new Set() : new Set(pagaveisDaPagina.map((p) => p.id)))
                  }
                  aria-label="Selecionar todos os pagáveis desta página"
                />
              </TableHead>
              <SortableHead field="projetista">Projetista</SortableHead>
              <TableHead>Disciplina / Projeto</TableHead>
              <SortableHead field="valor" className="text-right">
                Valor
              </SortableHead>
              <SortableHead field="liberadoEm">Liberado em</SortableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8}>
                  <EmptyState
                    icon={Wallet}
                    title={filtrado || filtros.status ? "Nenhum pagamento neste filtro." : "Nenhum pagamento."}
                  />
                </TableCell>
              </TableRow>
            ) : (
              itens.map((p) => {
                const parado = p.status === "pendente" ? diasPendenteParado(p.liberadoEm) : null;
                return (
                  <TableRow key={p.id} data-state={selecionados.has(p.id) ? "selected" : undefined}>
                    <TableCell>
                      {pagavel(p) && (
                        <Checkbox
                          checked={selecionados.has(p.id)}
                          onCheckedChange={() => alternar(p.id)}
                          aria-label={`Selecionar pagamento de ${p.projetista.name}`}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {links.pessoa ? (
                        <Link href={`/rh/pessoas/${p.projetistaId}`} className={cn("font-medium", linkCls)}>
                          {p.projetista.name}
                        </Link>
                      ) : (
                        <span className="font-medium">{p.projetista.name}</span>
                      )}
                      <span className="block text-xs text-muted-foreground">
                        {TIPO_PROFISSIONAL_LABEL[p.tipoProfissional] ?? p.tipoProfissional}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.disciplina.disciplinaTextoLegado}
                      <span className="block text-xs text-muted-foreground">
                        {links.projeto ? (
                          <Link href={`/projetos/${p.disciplina.projetoId}/disciplinas`} className={linkCls}>
                            {formatarCodigo(p.disciplina.projeto.codigo)} · {p.disciplina.projeto.nome}
                          </Link>
                        ) : (
                          <>
                            {formatarCodigo(p.disciplina.projeto.codigo)} · {p.disciplina.projeto.nome}
                          </>
                        )}
                      </span>
                      {p.observacao && (
                        <span className="mt-0.5 line-clamp-2 block text-xs italic text-muted-foreground" title={p.observacao}>
                          {p.observacao}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">{brl(p.valor)}</TableCell>
                    <TableCell className="text-sm">
                      {formatarData(p.liberadoEm)}
                      {parado != null && (
                        <span className="block text-xs text-warning">parado há {parado} dias</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <CelulaPagamento p={p} linkLancamento={links.lancamento} />
                    </TableCell>
                    <TableCell>
                      {p.status === "pendente" && !temValorPagavel(p.valor) ? (
                        <StatusBadge tone="danger">Sem valor</StatusBadge>
                      ) : (
                        <StatusBadge tone={STATUS_PAGAMENTO_TONE[p.status] ?? "neutral"}>
                          {STATUS_PAGAMENTO_LABEL[p.status] ?? p.status}
                        </StatusBadge>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.status === "pendente" && (
                        <div className="flex flex-wrap gap-1">
                          {temValorPagavel(p.valor) ? (
                            <>
                              <Button size="sm" variant="outline" onClick={() => setPagar(p)}>
                                <Wallet className="size-3.5" /> Pagar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="px-2"
                                title="Editar valor e observação"
                                aria-label="Editar valor e observação"
                                onClick={() => setEditar(p)}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                            </>
                          ) : (
                            // Pagar R$ 0,00 é recusado pela action — a saída é corrigir o valor.
                            <Button size="sm" variant="outline" onClick={() => setEditar(p)}>
                              <Pencil className="size-3.5" /> Corrigir valor
                            </Button>
                          )}
                          <CancelarPagamentoButton pagamento={p} />
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Pagination page={page} pageCount={pageCount(total, pageSize)} pageSize={pageSize} total={total} />

      <PagarDialog pagamento={pagar} onClose={() => setPagar(null)} contas={contas} formas={formas} />
      <EditarValorDialog pagamento={editar} onClose={() => setEditar(null)} />
      <EfetivarPagamentoDialog
        open={loteAberto}
        titulo="Pagar selecionados"
        descricao={`${selecao.length} pagamento(s) de ${new Set(selecao.map((p) => p.projetistaId)).size} projetista(s) — ${brl(totalSelecao)}`}
        contas={contas}
        formas={formas}
        contaObrigatoria
        confirmarLabel="Pagar selecionados"
        pending={pagandoLote}
        onConfirmar={pagarSelecionados}
        onClose={() => setLoteAberto(false)}
      />
    </div>
  );
}

function Kpi({ rotulo, valor, className }: { rotulo: string; valor: number; className: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="font-mono text-[10px] uppercase tracking-[0.16em]">{rotulo}</CardDescription>
        <CardTitle className={cn("text-2xl", className)}>{brl(valor)}</CardTitle>
      </CardHeader>
    </Card>
  );
}

/**
 * D24: de onde saiu o dinheiro. Pago → data, conta e forma do lançamento, com link para
 * ele no livro caixa. Pendente → se já existe lançamento previsto (linhas zeradas não têm).
 */
function CelulaPagamento({ p, linkLancamento }: { p: FolhaItem; linkLancamento: boolean }) {
  const l = p.lancamento;
  if (p.status === "pago") {
    return (
      <div className="text-xs">
        <span className="text-sm">{formatarData(p.pagoEm)}</span>
        {!l ? (
          <span className="block text-warning">sem lançamento</span>
        ) : (
          <>
            <span className={cn("block", l.conta ? "text-muted-foreground" : "text-warning")}>
              {l.conta ?? "sem conta bancária"}
              {l.forma ? ` · ${l.forma}` : ""}
            </span>
            {linkLancamento && (
              <Link href={`/financeiro/lancamentos?lancamento=${l.id}`} className={cn("text-foreground", linkCls)}>
                ver lançamento
              </Link>
            )}
          </>
        )}
      </div>
    );
  }
  if (p.status === "pendente") {
    const previsto = l && l.status !== "cancelado";
    return (
      <span className="text-xs text-muted-foreground">
        {previsto ? "lançamento previsto" : "sem lançamento previsto"}
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">—</span>;
}

/**
 * Botão de cancelar direto na folha — confirmação via `useConfirm` (padrão do repo,
 * evita mais um dialog controlado). Só aparece em pendentes; a action recusa o resto.
 */
function CancelarPagamentoButton({ pagamento }: { pagamento: FolhaItem }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();

  function cancelar() {
    start(async () => {
      const ok = await confirm({
        title: "Cancelar pagamento",
        description: `${pagamento.projetista.name} — ${brl(Number(pagamento.valor))}. A linha sai do "a pagar" e não pode ser desfeita por aqui.`,
        confirmLabel: "Cancelar pagamento",
        variant: "destructive",
      });
      if (!ok) return;
      const r = await cancelarPagamentoProjetista({ id: pagamento.id });
      if (r.ok) {
        toast.success("Pagamento cancelado.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className="px-2 text-destructive"
      title="Cancelar pagamento"
      aria-label="Cancelar pagamento"
      onClick={cancelar}
      disabled={pending}
    >
      <Ban className="size-3.5" />
    </Button>
  );
}

/**
 * Corrige o valor (e a observação) de um pagamento pendente — a rota de conserto para as
 * linhas de R$ 0,00 que já existem em produção. Zerar não é permitido aqui — use "Cancelar".
 */
function EditarValorDialog({ pagamento, onClose }: { pagamento: FolhaItem | null; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [valor, setValor] = useState<number | null>(null);
  const [observacao, setObservacao] = useState("");

  // Aberto imperativamente (botão na linha, não um DialogTrigger interno) — `onOpenChange`
  // só dispara ao FECHAR, então os campos precisam ser sincronizados aqui.
  useEffect(() => {
    if (pagamento) {
      setValor(Number(pagamento.valor));
      setObservacao(pagamento.observacao ?? "");
    }
  }, [pagamento]);

  function salvar() {
    if (!pagamento) return;
    const num = valor ?? 0;
    if (!(num > 0)) {
      toast.error("Informe um valor maior que zero.");
      return;
    }
    start(async () => {
      const r = await editarPagamentoProjetista({ id: pagamento.id, valor: num, observacao });
      if (r.ok) {
        toast.success("Pagamento atualizado.");
        onClose();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={!!pagamento} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar pagamento</DialogTitle>
          <DialogDescription>{pagamento?.projetista.name} — {pagamento?.disciplina.disciplinaTextoLegado}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="valor-pagamento">Valor (R$)</Label>
            <InputMoeda id="valor-pagamento" value={valor} onChange={setValor} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="observacao-pagamento">Observação</Label>
            <Input
              id="observacao-pagamento"
              value={observacao}
              maxLength={500}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PagarDialog({
  pagamento,
  onClose,
  contas,
  formas,
}: {
  pagamento: FolhaItem | null;
  onClose: () => void;
  contas: Opcao[];
  formas: Opcao[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const hoje = new Date().toISOString().slice(0, 10);
  const [contaId, setContaId] = useState(NONE);
  const [formaId, setFormaId] = useState(NONE);
  const [data, setData] = useState(hoje);

  function efetivar() {
    if (!pagamento) return;
    start(async () => {
      const r = await pagarProjetista({
        id: pagamento.id,
        contaId: contaId === NONE ? "" : contaId,
        formaId: formaId === NONE ? "" : formaId,
        data,
      });
      if (r.ok) {
        toast.success("Pagamento efetivado — lançamento criado no caixa.");
        onClose();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={!!pagamento} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Efetivar pagamento</DialogTitle>
          <DialogDescription>
            {pagamento?.projetista.name} — {brl(Number(pagamento?.valor ?? 0))}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Conta</Label>
              <Select value={contaId} onValueChange={(v) => setContaId(v ?? NONE)}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Forma</Label>
              <Select value={formaId} onValueChange={(v) => setFormaId(v ?? NONE)}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {formas.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Data do pagamento</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={efetivar} disabled={pending}>
            {pending ? "Pagando…" : "Efetivar pagamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
