"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeftRight, ChevronDown, Download, FileSpreadsheet, Layers, Trash2, Wallet } from "lucide-react";
import {
  excluirFolhaProjetista,
  gerarFolhaDoMes,
  pagarFolhaProjetista,
  pagamentosDoLote,
} from "@/modules/financeiro/folha-lote/actions";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { FolhaLoteItem, PagamentoDoLote } from "@/modules/financeiro/folha-lote/queries";
import { TIPO_PROFISSIONAL_LABEL } from "@/modules/financeiro/folha/status";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { pageCount } from "@/lib/list-params";
import { brl, formatarData } from "@/lib/utils";
import { MESES_CURTOS } from "@/lib/data";
import {
  BadgeStatus,
  CelulaPagamento,
  AcoesPagamento,
  EditarValorDialog,
  PagarDialog as PagarIndividualDialog,
} from "./folha-linhas-compartilhadas";
import { CorrigirPagamentoDialog } from "./corrigir-pagamento-dialog";
import { EstornarPagamentoDialog } from "./estornar-pagamento-dialog";
import { GerenciarComprovantesDialog } from "./gerenciar-comprovantes-dialog";
import { EfetivarPagamentoDialog, type DadosEfetivacao } from "./efetivar-pagamento-dialog";
import { MoverPagamentoDialog } from "./mover-pagamento-dialog";
import { ComprovantesEmLoteDialog, type ItemPago } from "./comprovantes-em-lote-dialog";

// "aberta" não aparece na UI de propósito (N5 do plano): `gerarFolhaDoMes` sempre cria o
// lote como "fechada" — o valor fica só no enum do banco, sem virar um passo real da tela.
// "fechada" = fechada aguardando pagamento → warning; "paga" → success.
const TONE: Partial<Record<string, "success" | "warning">> = { fechada: "warning", paga: "success" };

type Opcao = { id: string; nome: string };

export function FolhaLotesSection({
  folhas,
  total,
  page,
  pageSize,
  contas,
  formas,
  podeLancamento,
  podeCorrigir,
  podeConciliar,
  loteAlvo,
}: {
  folhas: FolhaLoteItem[];
  total: number;
  page: number;
  pageSize: number;
  contas: Opcao[];
  formas: Opcao[];
  podeLancamento: boolean;
  /** `financeiro:folha_pj_corrigir` — excluir lote e corrigir/estornar pago já dentro dele (G2). */
  podeCorrigir: boolean;
  /** `financeiro:conciliar` — habilita desfazer conciliação pelo dialog de corrigir (G1c). */
  podeConciliar: boolean;
  /** D34: veio do link "lote X/Y" da aba Pagamentos (`?loteId=`) — abre esse lote sozinho. */
  loteAlvo?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pagarLote, setPagarLote] = useState<FolhaLoteItem | null>(null);
  const [mover, setMover] = useState<{ pagamento: PagamentoDoLote; loteId: string } | null>(null);
  const [tokenRecarga, setTokenRecarga] = useState(0);
  // G9/B4: ações individuais dentro do lote expandido — mesmos dialogs dos outros dois
  // modos, sem duplicar lógica. Estado aqui (não em LinhaLote) porque um único conjunto de
  // dialogs serve todas as linhas de todos os lotes, igual ao padrão de FolhaView.
  const [pagarUm, setPagarUm] = useState<PagamentoDoLote | null>(null);
  const [editar, setEditar] = useState<PagamentoDoLote | null>(null);
  const [corrigir, setCorrigir] = useState<PagamentoDoLote | null>(null);
  const [estornar, setEstornar] = useState<PagamentoDoLote | null>(null);
  const [comprovantes, setComprovantes] = useState<PagamentoDoLote | null>(null);
  const ref = new Date();
  ref.setMonth(ref.getMonth() - 1);
  const [ano, setAno] = useState(String(ref.getFullYear()));
  const [mes, setMes] = useState(String(ref.getMonth() + 1));

  // G9/B4: fecha o dialog E recarrega o painel expandido (se algum estiver aberto), igual
  // ao token que a G3 já usa para "mover". Recarrega também ao só CANCELAR (sem ter mudado
  // nada) — custo de uma query leve, e mais simples do que distinguir sucesso de
  // cancelamento nos 4 dialogs reaproveitados, que só expõem `onClose`.
  function fecharERecarregar<T>(setter: (v: T | null) => void) {
    return () => {
      setter(null);
      setTokenRecarga((t) => t + 1);
    };
  }

  function gerar() {
    start(async () => {
      const r = await gerarFolhaDoMes({ ano: Number(ano), mes: Number(mes) });
      if (r.ok) {
        if (r.data.vinculados === 0) {
          // Mês sem pagamento fora de lote é rotina (mês corrente, ou já coberto por outro
          // lote) — não é erro, então não é toast vermelho.
          toast.info(`Nenhum pagamento liberado em ${MESES_CURTOS[Number(mes) - 1]}/${ano} fora de lote.`);
        } else {
          toast.success(`Lote gerado — ${r.data.vinculados} pagamento(s) vinculado(s).`);
          router.refresh();
        }
      } else toast.error(r.error);
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <CardTitle className="text-base">Lotes mensais</CardTitle>
            <CardDescription>Agrupa os pagamentos de produção liberados no mês em um lote.</CardDescription>
          </div>
          <div className="flex items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="lote-mes">Mês</Label>
              <Select value={mes} onValueChange={(v) => v && setMes(v)}>
                <SelectTrigger id="lote-mes" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MESES_CURTOS.map((nome, i) => (
                    <SelectItem key={nome} value={String(i + 1)}>
                      {nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lote-ano">Ano</Label>
              <Input id="lote-ano" type="number" value={ano} onChange={(e) => setAno(e.target.value)} className="w-24" />
            </div>
            <Button size="sm" variant="outline" onClick={gerar} disabled={pending}>
              <Layers className="size-3.5" /> Gerar lote
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <EmptyState icon={Layers} title="Nenhum lote gerado." />
        ) : (
          <>
            <div className="divide-y text-sm">
              {folhas.map((f) => (
                <LinhaLote
                  key={f.id}
                  folha={f}
                  onPagar={setPagarLote}
                  onMover={setMover}
                  onPagarUm={setPagarUm}
                  onEditar={setEditar}
                  onCorrigir={setCorrigir}
                  onEstornar={setEstornar}
                  onComprovantes={setComprovantes}
                  onCancelado={() => setTokenRecarga((t) => t + 1)}
                  podeLancamento={podeLancamento}
                  podeCorrigir={podeCorrigir}
                  tokenRecarga={tokenRecarga}
                  autoAbrir={f.id === loteAlvo}
                />
              ))}
            </div>
            <Pagination page={page} pageCount={pageCount(total, pageSize)} pageSize={pageSize} total={total} />
          </>
        )}
      </CardContent>

      <PagarLoteDialog folha={pagarLote} onClose={() => setPagarLote(null)} contas={contas} formas={formas} />
      <MoverPagamentoDialog
        alvo={mover}
        onClose={() => setMover(null)}
        onMovido={() => setTokenRecarga((t) => t + 1)}
      />
      {/* G9/B4: mesmos dialogs de FolhaView/FolhaAgrupadaView, um conjunto só pra todas as
          linhas de todos os lotes — reusa a lógica em vez de duplicar. */}
      <PagarIndividualDialog pagamento={pagarUm} onClose={fecharERecarregar(setPagarUm)} contas={contas} formas={formas} />
      <EditarValorDialog pagamento={editar} onClose={fecharERecarregar(setEditar)} />
      <CorrigirPagamentoDialog
        pagamento={corrigir}
        contas={contas}
        formas={formas}
        podeConciliar={podeConciliar}
        onClose={fecharERecarregar(setCorrigir)}
      />
      <EstornarPagamentoDialog pagamento={estornar} onClose={fecharERecarregar(setEstornar)} />
      <GerenciarComprovantesDialog
        pagamento={
          comprovantes?.lancamento
            ? { id: comprovantes.id, projetistaNome: comprovantes.projetista.name, lancamentoId: comprovantes.lancamento.id }
            : null
        }
        onClose={fecharERecarregar(setComprovantes)}
      />
    </Card>
  );
}

/**
 * Uma linha de lote, expansível (F10/D29) — "lote" era uma caixa preta, só número; abrir
 * mostra os pagamentos que o compõem, com a mesma rastreabilidade do modo Pagamentos (D24).
 * Carrega sob demanda, na primeira vez que abre — não junto com a lista de lotes (D12).
 */
function LinhaLote({
  folha,
  onPagar,
  onMover,
  onPagarUm,
  onEditar,
  onCorrigir,
  onEstornar,
  onComprovantes,
  onCancelado,
  podeLancamento,
  podeCorrigir,
  tokenRecarga,
  autoAbrir,
}: {
  folha: FolhaLoteItem;
  onPagar: (f: FolhaLoteItem) => void;
  onMover: (alvo: { pagamento: PagamentoDoLote; loteId: string }) => void;
  onPagarUm: (p: PagamentoDoLote) => void;
  onEditar: (p: PagamentoDoLote) => void;
  onCorrigir: (p: PagamentoDoLote) => void;
  onEstornar: (p: PagamentoDoLote) => void;
  onComprovantes: (p: PagamentoDoLote) => void;
  /** G9: cancelar dentro do lote não passa por `fecharERecarregar` (não é dialog) — precisa
   * do próprio bump de `tokenRecarga` pra a linha cancelada sumir sem recolher/expandir. */
  onCancelado: () => void;
  podeLancamento: boolean;
  podeCorrigir: boolean;
  /** Sobe a cada movimentação: o painel aberto recarrega sem recolher/expandir (G3). */
  tokenRecarga: number;
  /** D34: veio do link "lote X/Y" da aba Pagamentos — abre e rola até esta linha sozinho. */
  autoAbrir: boolean;
}) {
  const [itens, setItens] = useState<PagamentoDoLote[] | null>(null);
  const [semPermissao, setSemPermissao] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [carregando, start] = useTransition();
  const linhaRef = useRef<HTMLDivElement>(null);

  const carregar = useCallback(() => {
    start(async () => {
      const r = await pagamentosDoLote(folha.id);
      if (r.ok) {
        setItens(r.itens);
        setSemPermissao(false);
      } else {
        setItens(null);
        setSemPermissao(true);
      }
    });
  }, [folha.id]);

  // Recarrega A CADA abertura, não só na primeira — o painel expandido fica com estado
  // próprio (não é `folhas` vindo do servidor), então "Pagar lote" ou "Corrigir valor" em
  // outra linha da tela deixariam esta tabela desatualizada se ela só carregasse uma vez.
  function alternar(novoAberto: boolean) {
    setAberto(novoAberto);
    if (novoAberto) carregar();
  }

  // G3: mover um pagamento muda ESTE lote e o de destino. `router.refresh()` conserta a
  // lista de lotes (dado do servidor), mas não esta tabela, que tem estado próprio — daí o
  // token: subiu, o painel que estiver aberto busca de novo.
  useEffect(() => {
    if (aberto && tokenRecarga > 0) carregar();
    // `aberto` não entra: recarregar ao abrir já é trabalho do `alternar`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenRecarga]);

  // D34: chegou pelo link "lote X/Y" — abre sozinho e rola até a linha, só uma vez.
  useEffect(() => {
    if (!autoAbrir) return;
    setAberto(true);
    carregar();
    linhaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Collapsible defaultOpen={autoAbrir} onOpenChange={alternar}>
      <div ref={linhaRef} className="flex items-center gap-3 py-2">
        <CollapsibleTrigger
          className="group/lote flex flex-1 items-center gap-3 text-left"
          aria-label={`${MESES_CURTOS[folha.mes - 1]}/${folha.ano}, expandir`}
        >
          <ChevronDown
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[panel-open]/lote:rotate-180"
          />
          <span className="font-mono">{MESES_CURTOS[folha.mes - 1]}/{folha.ano}</span>
          <span className="text-muted-foreground">{folha.pagos}/{folha.qtd} pagos</span>
          <span className="font-mono">{brl(folha.total)}</span>
        </CollapsibleTrigger>
        <StatusBadge tone={TONE[folha.todosPagos ? "paga" : folha.status] ?? "neutral"}>
          {folha.todosPagos ? "paga" : folha.status}
        </StatusBadge>
        {folha.pagaveis > 0 ? (
          <Button size="sm" variant="outline" onClick={() => onPagar(folha)}>
            <Wallet className="size-3.5" /> Pagar lote
          </Button>
        ) : folha.semValor > 0 ? (
          <StatusBadge tone="warning">{folha.semValor} sem valor</StatusBadge>
        ) : (
          <span className="w-[104px]" aria-hidden />
        )}
        {podeCorrigir && <ExcluirLoteButton folha={folha} />}
      </div>
      <CollapsiblePanel>
        <div className="overflow-x-auto border-t pb-2">
          {/* D34: exportar só o conteúdo deste lote — reusa a mesma rota da aba Pagamentos
              (dadosFolhaExport), filtrando por folhaId; `status=todos` porque dentro do lote
              o interesse é "o que tem aqui", não o recorte padrão que esconde cancelados.
              Escondido junto com `semPermissao`: a rota tem piso de sócio que `pagamentosDoLote`
              não tem, então um sócio pode ver "sem permissão" na tabela e mesmo assim ter
              acesso à exportação — mostrar os dois juntos contradiz a mensagem da tela. */}
          {!semPermissao && (
            <div className="flex justify-end gap-2 px-1 pt-2">
              <Button
                variant="outline"
                size="sm"
                render={<a href={`/api/financeiro/folha-projetistas/export?formato=xlsx&status=todos&folhaId=${folha.id}`} />}
              >
                <FileSpreadsheet className="size-3.5" /> XLSX
              </Button>
              <Button
                variant="outline"
                size="sm"
                render={<a href={`/api/financeiro/folha-projetistas/export?formato=csv&status=todos&folhaId=${folha.id}`} />}
              >
                <Download className="size-3.5" /> CSV
              </Button>
            </div>
          )}
          {carregando ? (
            <p className="py-3 text-xs text-muted-foreground">Carregando pagamentos do lote…</p>
          ) : semPermissao ? (
            <p className="py-3 text-xs text-warning">Sem permissão para ver os pagamentos deste lote.</p>
          ) : itens === null ? null : itens.length === 0 ? (
            // Só aparece depois de `itens` vir preenchido com `[]` de verdade — nunca antes
            // da 1ª expansão, que é `null` puro e não renderiza nada (painel ainda fechado).
            <p className="py-3 text-xs text-muted-foreground">Este lote não tem pagamentos.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Projetista</TableHead>
                  <TableHead>Disciplina / Projeto</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Liberado em</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead aria-label="Ações" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm">
                      <span className="font-medium">{p.projetista.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {TIPO_PROFISSIONAL_LABEL[p.tipoProfissional] ?? p.tipoProfissional}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.disciplina.disciplinaTextoLegado}
                      <span className="block text-xs text-muted-foreground">
                        {formatarCodigo(p.disciplina.projeto.codigo)} · {p.disciplina.projeto.nome}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono">{brl(p.valor)}</TableCell>
                    <TableCell className="text-sm">{formatarData(p.liberadoEm)}</TableCell>
                    <TableCell>
                      <CelulaPagamento p={p} linkLancamento={podeLancamento} mostrarLote={false} />
                    </TableCell>
                    <TableCell>
                      <BadgeStatus p={p} />
                    </TableCell>
                    <TableCell>
                      {/* G9/B4: as mesmas ações de FolhaView/FolhaAgrupadaView, dentro do
                          lote — reusa AcoesPagamento em vez de duplicar por status. */}
                      <div className="flex flex-wrap items-center gap-1">
                        <AcoesPagamento
                          p={p}
                          onPagar={onPagarUm}
                          onEditar={onEditar}
                          onCorrigir={podeCorrigir ? onCorrigir : undefined}
                          onEstornar={podeCorrigir ? onEstornar : undefined}
                          onComprovantes={onComprovantes}
                          onCancelado={onCancelado}
                        />
                        {p.status === "pendente" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="px-2"
                            title="Mover de lote"
                            aria-label={`Mover pagamento de ${p.projetista.name} de lote`}
                            onClick={() => onMover({ pagamento: p, loteId: folha.id })}
                          >
                            <ArrowLeftRight className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}

/**
 * Excluir lote (F12/N7). Fora do `CollapsibleTrigger` (que já é um <button> — interativo
 * dentro de interativo quebra teclado e leitor de tela) e sempre renderizado, para as
 * colunas não mudarem de lugar entre lotes pagáveis e não pagáveis.
 *
 * O texto da confirmação sai de `FolhaLoteItem` (qtd, pagos) — sem query nova. A contagem
 * de pagos é o ponto do aviso: eles NÃO voltam a um lote se o mês for gerado de novo.
 */
function ExcluirLoteButton({ folha }: { folha: FolhaLoteItem }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const rotulo = `${MESES_CURTOS[folha.mes - 1]}/${folha.ano}`;

  async function excluir() {
    const avisoPagos =
      folha.pagos > 0
        ? ` ${folha.pagos} já pago(s) continua(m) pago(s), mas não volta(m) a um lote se você gerar ${rotulo} de novo — gerar lote só recolhe pendentes.`
        : "";
    const ok = await confirm({
      title: `Excluir lote ${rotulo}`,
      description: `Os ${folha.qtd} pagamento(s) deste lote voltam a ficar fora de lote. Nenhum pagamento e nenhum lançamento do caixa é apagado.${avisoPagos}`,
      confirmLabel: "Excluir lote",
      variant: "destructive",
    });
    if (!ok) return;
    start(async () => {
      const r = await excluirFolhaProjetista({ id: folha.id });
      if (r.ok) {
        toast.success(`Lote ${rotulo} excluído — ${r.data.soltos} pagamento(s) ficaram fora de lote.`);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className="px-2 text-destructive"
      title={`Excluir lote ${rotulo}`}
      aria-label={`Excluir lote ${rotulo}`}
      onClick={excluir}
      disabled={pending}
    >
      <Trash2 className="size-3.5" />
    </Button>
  );
}

/** Pagar lote — o mesmo dialog de efetivação dos outros caminhos (F5), conta obrigatória. */
function PagarLoteDialog({
  folha,
  onClose,
  contas,
  formas,
}: {
  folha: FolhaLoteItem | null;
  onClose: () => void;
  contas: Opcao[];
  formas: Opcao[];
}) {
  const router = useRouter();
  const [comprovantesLote, setComprovantesLote] = useState<ItemPago[] | null>(null);

  async function efetivar(d: DadosEfetivacao) {
    if (!folha) return { ok: false as const, error: "Lote não encontrado." };
    const r = await pagarFolhaProjetista({ id: folha.id, ...d });
    if (r.ok) {
      const ficaram = r.data.semValor
        ? ` ${r.data.semValor} sem valor continua(m) pendente(s) — corrija o valor para pagar.`
        : "";
      toast.success(`Lote pago — ${r.data.pagos} pagamento(s) confirmado(s) no caixa.${ficaram}`);
      onClose();
      // G7/B1: lista de comprovante linha a linha no lugar do fechamento direto.
      setComprovantesLote(r.data.itens);
      router.refresh();
    }
    return r;
  }

  return (
    <>
      <EfetivarPagamentoDialog
        open={!!folha}
        titulo="Pagar lote"
        descricao={
          folha
            ? `${MESES_CURTOS[folha.mes - 1]}/${folha.ano} — ${folha.pagaveis} pagamento(s) a efetivar, ${brl(folha.total)}` +
              (folha.semValor > 0 ? ` · ${folha.semValor} sem valor fica(m) de fora` : "")
            : ""
        }
        contas={contas}
        formas={formas}
        confirmarLabel="Pagar lote"
        onConfirmar={efetivar}
        onClose={onClose}
      />
      <ComprovantesEmLoteDialog itens={comprovantesLote} onClose={() => setComprovantesLote(null)} />
    </>
  );
}
