"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import { pagarProjetistasSelecionados } from "@/modules/financeiro/folha/actions";
import { diasPendenteParado } from "@/modules/financeiro/folha/service";
import { TIPO_PROFISSIONAL_LABEL } from "@/modules/financeiro/folha/status";
import type { FolhaItem } from "@/modules/financeiro/folha/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableHead } from "@/components/ui/sortable-head";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { pageCount } from "@/lib/list-params";
import { brl, cn, formatarData } from "@/lib/utils";
import {
  pagavel,
  linkCls,
  BadgeStatus,
  AcoesPagamento,
  CelulaPagamento,
  PagarDialog,
  EditarValorDialog,
  type LinksFolha,
  type Opcao,
} from "./folha-linhas-compartilhadas";
import { CorrigirPagamentoDialog } from "./corrigir-pagamento-dialog";
import { EstornarPagamentoDialog } from "./estornar-pagamento-dialog";
import { GerenciarComprovantesDialog } from "./gerenciar-comprovantes-dialog";
import { ComprovantesEmLoteDialog, type ItemPago } from "./comprovantes-em-lote-dialog";
import { EfetivarPagamentoDialog, type DadosEfetivacao } from "./efetivar-pagamento-dialog";

/** Modo "por pagamento" (F2): tabela plana, paginada. Filtros/KPI vivem no `page.tsx`. */
export function FolhaView({
  itens,
  total,
  page,
  pageSize,
  filtrado,
  filtroStatus,
  links,
  contas,
  formas,
  podeConciliar,
  podeCorrigir,
}: {
  itens: FolhaItem[];
  total: number;
  page: number;
  pageSize: number;
  filtrado: boolean;
  filtroStatus: string | null;
  links: LinksFolha;
  contas: Opcao[];
  formas: Opcao[];
  /** `financeiro:conciliar` — habilita desfazer a conciliação pelo dialog (G1c). */
  podeConciliar: boolean;
  /** `financeiro:folha_pj_corrigir` — corrigir/estornar pagamento já efetivado (G2). */
  podeCorrigir: boolean;
}) {
  const router = useRouter();
  const [pagar, setPagar] = useState<FolhaItem | null>(null);
  const [editar, setEditar] = useState<FolhaItem | null>(null);
  const [corrigir, setCorrigir] = useState<FolhaItem | null>(null);
  const [estornar, setEstornar] = useState<FolhaItem | null>(null);
  const [comprovantes, setComprovantes] = useState<FolhaItem | null>(null);
  const [comprovantesLote, setComprovantesLote] = useState<ItemPago[] | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [loteAberto, setLoteAberto] = useState(false);

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

  async function pagarSelecionados(d: DadosEfetivacao) {
    const r = await pagarProjetistasSelecionados({ ids: selecao.map((p) => p.id), ...d });
    if (r.ok) {
      const ignorados = r.data.ignorados
        ? ` ${r.data.ignorados} ignorado(s) — já pagos, cancelados ou sem valor.`
        : "";
      toast.success(`${r.data.pagos} pagamento(s) efetivado(s) — ${brl(r.data.total)} no caixa.${ignorados}`);
      setLoteAberto(false);
      setSelecionados(new Set());
      // G7/B1: lista de comprovante linha a linha no lugar do fechamento direto.
      setComprovantesLote(r.data.itens);
      router.refresh();
    }
    return r;
  }

  return (
    <div className="space-y-4">
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
                    title={filtrado || filtroStatus ? "Nenhum pagamento neste filtro." : "Nenhum pagamento."}
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
                      {parado != null && <span className="block text-xs text-warning">parado há {parado} dias</span>}
                    </TableCell>
                    <TableCell>
                      <CelulaPagamento p={p} linkLancamento={links.lancamento} />
                    </TableCell>
                    <TableCell>
                      <BadgeStatus p={p} />
                    </TableCell>
                    <TableCell>
                      <AcoesPagamento
                        p={p}
                        onPagar={setPagar}
                        onEditar={setEditar}
                        onCorrigir={podeCorrigir ? setCorrigir : undefined}
                        onEstornar={podeCorrigir ? setEstornar : undefined}
                        onComprovantes={setComprovantes}
                      />
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
      <CorrigirPagamentoDialog
        pagamento={corrigir}
        contas={contas}
        formas={formas}
        podeConciliar={podeConciliar}
        onClose={() => setCorrigir(null)}
      />
      <EstornarPagamentoDialog pagamento={estornar} onClose={() => setEstornar(null)} />
      <GerenciarComprovantesDialog
        pagamento={
          comprovantes && comprovantes.lancamento
            ? { id: comprovantes.id, projetistaNome: comprovantes.projetista.name, lancamentoId: comprovantes.lancamento.id }
            : null
        }
        onClose={() => setComprovantes(null)}
      />
      <EfetivarPagamentoDialog
        open={loteAberto}
        titulo="Pagar selecionados"
        descricao={`${selecao.length} pagamento(s) de ${new Set(selecao.map((p) => p.projetistaId)).size} projetista(s) — ${brl(totalSelecao)}`}
        contas={contas}
        formas={formas}
        confirmarLabel="Pagar selecionados"
        onConfirmar={pagarSelecionados}
        onClose={() => setLoteAberto(false)}
      />
      <ComprovantesEmLoteDialog itens={comprovantesLote} onClose={() => setComprovantesLote(null)} />
    </div>
  );
}
