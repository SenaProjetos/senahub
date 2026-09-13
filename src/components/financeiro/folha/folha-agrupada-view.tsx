"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, FileText, Users, Wallet } from "lucide-react";
import { pagarProjetistasSelecionados } from "@/modules/financeiro/folha/actions";
import { diasPendenteParado } from "@/modules/financeiro/folha/service";
import { TIPO_PROFISSIONAL_LABEL } from "@/modules/financeiro/folha/status";
import type { FolhaGrupo, FolhaItem } from "@/modules/financeiro/folha/queries";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import { EmptyState } from "@/components/ui/empty-state";
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
import { ReciboMensalDialog } from "@/components/financeiro/recibo/recibo-mensal-dialog";
import { EfetivarPagamentoDialog, type DadosEfetivacao } from "./efetivar-pagamento-dialog";

/**
 * Modo "por projetista" (F3, N1, padrão da aba Pagamentos): uma linha-mãe por pessoa,
 * expande nas entregas dela. Sem paginação — `listarFolhaAgrupada` já traz tudo (§1 do
 * plano: volume pequeno o bastante pra caber inteiro agrupado).
 *
 * Os 3 dialogs (pagar um, editar, pagar tudo de um grupo) moram AQUI, um conjunto só —
 * não um por grupo. Com N projetistas expandidos, N cópias de `PagarDialog` etc.
 * duplicariam ids de campo (`valor-pagamento`, `observacao-pagamento`) e um clique no rótulo
 * de um grupo focaria o campo do primeiro grupo do DOM.
 */
export function FolhaAgrupadaView({
  grupos,
  filtrado,
  filtroStatus,
  links,
  contas,
  formas,
  podeConciliar,
  podeCorrigir,
}: {
  grupos: FolhaGrupo[];
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
  const [reciboMensal, setReciboMensal] = useState<{ projetistaId: string; projetistaNome: string } | null>(null);
  const [loteGrupo, setLoteGrupo] = useState<FolhaGrupo | null>(null);
  const [comprovantesLote, setComprovantesLote] = useState<ItemPago[] | null>(null);

  const pagaveisDoLote = useMemo(() => (loteGrupo ? loteGrupo.itens.filter(pagavel) : []), [loteGrupo]);
  const totalDoLote = pagaveisDoLote.reduce((s, p) => s + p.valor, 0);

  async function pagarTudo(d: DadosEfetivacao) {
    const r = await pagarProjetistasSelecionados({ ids: pagaveisDoLote.map((p) => p.id), ...d });
    if (r.ok) {
      const ignorados = r.data.ignorados
        ? ` ${r.data.ignorados} ignorado(s) — já pagos, cancelados ou sem valor.`
        : "";
      toast.success(`${r.data.pagos} pagamento(s) efetivado(s) — ${brl(r.data.total)} no caixa.${ignorados}`);
      setLoteGrupo(null);
      // G7/B1: lista de comprovante linha a linha no lugar do fechamento direto.
      setComprovantesLote(r.data.itens);
      router.refresh();
    }
    return r;
  }

  if (grupos.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title={filtrado || filtroStatus ? "Nenhum projetista neste filtro." : "Nenhum pagamento."}
      />
    );
  }

  return (
    <div className="space-y-2">
      {grupos.map((g) => (
        <GrupoProjetista
          key={g.projetistaId}
          grupo={g}
          links={links}
          onPagar={setPagar}
          onEditar={setEditar}
          onCorrigir={setCorrigir}
          onEstornar={setEstornar}
          onComprovantes={setComprovantes}
          podeCorrigir={podeCorrigir}
          onReciboMensal={setReciboMensal}
          onPagarTudo={setLoteGrupo}
        />
      ))}

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
      <ReciboMensalDialog alvo={reciboMensal} onClose={() => setReciboMensal(null)} />
      <EfetivarPagamentoDialog
        open={!!loteGrupo}
        titulo="Pagar tudo"
        descricao={loteGrupo ? `${loteGrupo.projetistaNome} — ${pagaveisDoLote.length} pagamento(s), ${brl(totalDoLote)}` : ""}
        contas={contas}
        formas={formas}
        confirmarLabel="Pagar tudo"
        onConfirmar={pagarTudo}
        onClose={() => setLoteGrupo(null)}
      />
      <ComprovantesEmLoteDialog itens={comprovantesLote} onClose={() => setComprovantesLote(null)} />
    </div>
  );
}

function GrupoProjetista({
  grupo,
  links,
  onPagar,
  onEditar,
  onCorrigir,
  onEstornar,
  onComprovantes,
  podeCorrigir,
  onPagarTudo,
  onReciboMensal,
}: {
  grupo: FolhaGrupo;
  links: LinksFolha;
  onPagar: (p: FolhaItem) => void;
  onEditar: (p: FolhaItem) => void;
  onCorrigir: (p: FolhaItem) => void;
  onEstornar: (p: FolhaItem) => void;
  onComprovantes: (p: FolhaItem) => void;
  podeCorrigir: boolean;
  onPagarTudo: (g: FolhaGrupo) => void;
  onReciboMensal: (alvo: { projetistaId: string; projetistaNome: string }) => void;
}) {
  const pagaveis = grupo.itens.filter(pagavel);
  const rotuloEntregas = grupo.qtd === 1 ? "1 entrega" : `${grupo.qtd} entregas`;

  return (
    <Collapsible className="rounded-sm border">
      {/* O link do nome e o botão "Pagar tudo" NÃO podem morar dentro do CollapsibleTrigger
          — ele já é um <button>, e interativo-dentro-de-interativo quebra teclado/leitor
          de tela e (no caso do link) fica de fora da ordem de tabulação. Sem link (quem
          não tem `rh:cadastro`), o nome é texto puro e cabe dentro do trigger — clicar
          em qualquer parte da linha expande, como antes. */}
      <div className="flex items-center gap-2 p-3">
        <CollapsibleTrigger
          className="group/proj flex flex-1 items-center gap-2 text-left"
          aria-label={links.pessoa ? `${rotuloEntregas}, expandir` : `${grupo.projetistaNome} — ${rotuloEntregas}, expandir`}
        >
          <ChevronDown
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[panel-open]/proj:rotate-180"
          />
          {!links.pessoa && <span className="font-medium">{grupo.projetistaNome}</span>}
          <span className="text-xs text-muted-foreground">{rotuloEntregas}</span>
        </CollapsibleTrigger>
        {links.pessoa && (
          <Link href={`/rh/pessoas/${grupo.projetistaId}`} className={cn("font-medium", linkCls)}>
            {grupo.projetistaNome}
          </Link>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <span className="font-mono text-sm text-warning">{brl(grupo.totalPendente)}</span>
          {pagaveis.length > 0 && (
            <Button size="sm" onClick={() => onPagarTudo(grupo)}>
              <Wallet className="size-3.5" /> Pagar tudo
            </Button>
          )}
          {/* G5/D36: recibo do mês desta pessoa — junta as entregas PAGAS da competência. */}
          <Button
            size="sm"
            variant="ghost"
            className="px-2"
            title={`Recibo do mês de ${grupo.projetistaNome}`}
            aria-label={`Gerar recibo mensal de ${grupo.projetistaNome}`}
            onClick={() => onReciboMensal({ projetistaId: grupo.projetistaId, projetistaNome: grupo.projetistaNome })}
          >
            <FileText className="size-3.5" />
          </Button>
        </div>
      </div>
      <CollapsiblePanel>
        <div className="overflow-x-auto border-t">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Disciplina / Projeto</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Liberado em</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {grupo.itens.map((p) => {
                const parado = p.status === "pendente" ? diasPendenteParado(p.liberadoEm) : null;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm">
                      {p.disciplina.disciplinaTextoLegado}
                      <span className="block text-xs text-muted-foreground">
                        {TIPO_PROFISSIONAL_LABEL[p.tipoProfissional] ?? p.tipoProfissional}
                        {" · "}
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
                        onPagar={onPagar}
                        onEditar={onEditar}
                        onCorrigir={podeCorrigir ? onCorrigir : undefined}
                        onEstornar={podeCorrigir ? onEstornar : undefined}
                        onComprovantes={onComprovantes}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CollapsiblePanel>
    </Collapsible>
  );
}
