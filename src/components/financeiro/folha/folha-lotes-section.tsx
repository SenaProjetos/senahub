"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Layers, Wallet } from "lucide-react";
import {
  gerarFolhaDoMes,
  pagarFolhaProjetista,
  pagamentosDoLote,
} from "@/modules/financeiro/folha-lote/actions";
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
import { BadgeStatus, CelulaPagamento } from "./folha-linhas-compartilhadas";
import { EfetivarPagamentoDialog, type DadosEfetivacao } from "./efetivar-pagamento-dialog";

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
}: {
  folhas: FolhaLoteItem[];
  total: number;
  page: number;
  pageSize: number;
  contas: Opcao[];
  formas: Opcao[];
  podeLancamento: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pagarLote, setPagarLote] = useState<FolhaLoteItem | null>(null);
  const ref = new Date();
  ref.setMonth(ref.getMonth() - 1);
  const [ano, setAno] = useState(String(ref.getFullYear()));
  const [mes, setMes] = useState(String(ref.getMonth() + 1));

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
                <LinhaLote key={f.id} folha={f} onPagar={setPagarLote} podeLancamento={podeLancamento} />
              ))}
            </div>
            <Pagination page={page} pageCount={pageCount(total, pageSize)} pageSize={pageSize} total={total} />
          </>
        )}
      </CardContent>

      <PagarLoteDialog folha={pagarLote} onClose={() => setPagarLote(null)} contas={contas} formas={formas} />
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
  podeLancamento,
}: {
  folha: FolhaLoteItem;
  onPagar: (f: FolhaLoteItem) => void;
  podeLancamento: boolean;
}) {
  const [itens, setItens] = useState<PagamentoDoLote[] | null>(null);
  const [semPermissao, setSemPermissao] = useState(false);
  const [carregando, start] = useTransition();

  // Recarrega A CADA abertura, não só na primeira — o painel expandido fica com estado
  // próprio (não é `folhas` vindo do servidor), então "Pagar lote" ou "Corrigir valor" em
  // outra linha da tela deixariam esta tabela desatualizada se ela só carregasse uma vez.
  function alternar(aberto: boolean) {
    if (!aberto) return;
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
  }

  return (
    <Collapsible onOpenChange={alternar}>
      <div className="flex items-center gap-3 py-2">
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
      </div>
      <CollapsiblePanel>
        <div className="overflow-x-auto border-t pb-2">
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
                      <CelulaPagamento p={p} linkLancamento={podeLancamento} />
                    </TableCell>
                    <TableCell>
                      <BadgeStatus p={p} />
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

  async function efetivar(d: DadosEfetivacao) {
    if (!folha) return { ok: false as const, error: "Lote não encontrado." };
    const r = await pagarFolhaProjetista({ id: folha.id, ...d });
    if (r.ok) {
      const ficaram = r.data.semValor
        ? ` ${r.data.semValor} sem valor continua(m) pendente(s) — corrija o valor para pagar.`
        : "";
      toast.success(`Lote pago — ${r.data.pagos} pagamento(s) confirmado(s) no caixa.${ficaram}`);
      onClose();
      router.refresh();
    }
    return r;
  }

  return (
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
  );
}
