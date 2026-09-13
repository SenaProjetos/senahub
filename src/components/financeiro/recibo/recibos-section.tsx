"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Bell, Download, FileText } from "lucide-react";
import { lembrarAssinaturaRecibo } from "@/modules/financeiro/recibo/actions";
import type { RecibosItem } from "@/modules/financeiro/recibo/queries";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { pageCount } from "@/lib/list-params";
import { useSetParams } from "@/lib/use-set-param";
import { brl, formatarData } from "@/lib/utils";
import { MESES_CURTOS } from "@/lib/data";

const TODOS = "__todos";

const STATUS_OPCOES = [
  { value: TODOS, label: "Todos" },
  { value: "pendente", label: "Aguardando assinatura" },
  { value: "assinado", label: "Assinado" },
];

/**
 * Aba Recibos (achado do dono, 2026-09-12): gerar um recibo era "atirar e esquecer" — nada
 * mostrava se o projetista assinou ou o recibo ficou parado. Lista TODO recibo gerado, de
 * qualquer projetista, com o mesmo filtro de status/projetista do resto da tela — mas com
 * nomes de param próprios (`reciboStatus`/`reciboProjetistaId`) pra não vazar pra aba
 * Pagamentos, que usa `status`/`projetistaId` pra outra coisa.
 */
export function RecibosSection({
  recibos,
  total,
  page,
  pageSize,
  pendentes,
  filtros,
  projetistas,
}: {
  recibos: RecibosItem[];
  total: number;
  page: number;
  pageSize: number;
  pendentes: number;
  filtros: { projetistaId: string; status: string };
  projetistas: { id: string; name: string }[];
}) {
  const setParams = useSetParams();
  const filtrado = Boolean(filtros.projetistaId || filtros.status);

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-lg border bg-card p-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="filtro-status-recibo">Status</Label>
            <Select
              value={filtros.status || TODOS}
              onValueChange={(v) => v && setParams({ reciboStatus: v === TODOS ? null : v })}
            >
              <SelectTrigger id="filtro-status-recibo" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPCOES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="filtro-projetista-recibo">Projetista</Label>
            <Select
              value={filtros.projetistaId || TODOS}
              onValueChange={(v) => v && setParams({ reciboProjetistaId: v === TODOS ? null : v })}
            >
              <SelectTrigger id="filtro-projetista-recibo" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos</SelectItem>
                {projetistas.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {pendentes > 0 && (
          <p className="text-xs text-muted-foreground">
            <strong className="text-warning">{pendentes}</strong>{" "}
            {pendentes === 1 ? "recibo aguardando assinatura" : "recibos aguardando assinatura"}
            {filtrado ? " neste filtro" : ""} — soma todo o recorte, mesmo o que a lista não está mostrando.
          </p>
        )}
      </div>

      <div className="overflow-x-auto rounded-sm border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Projetista</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Gerado em</TableHead>
              <TableHead>Status</TableHead>
              <TableHead aria-label="Ações" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {recibos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <EmptyState icon={FileText} title={filtrado ? "Nenhum recibo neste filtro." : "Nenhum recibo gerado."} />
                </TableCell>
              </TableRow>
            ) : (
              recibos.map((r) => <LinhaRecibo key={r.id} r={r} />)
            )}
          </TableBody>
        </Table>
      </div>

      <Pagination page={page} pageCount={pageCount(total, pageSize)} pageSize={pageSize} total={total} />
    </div>
  );
}

function LinhaRecibo({ r }: { r: RecibosItem }) {
  const [pending, start] = useTransition();
  const competencia = r.ano && r.mes ? `${MESES_CURTOS[r.mes - 1]}/${r.ano}` : null;

  function lembrar() {
    start(async () => {
      const res = await lembrarAssinaturaRecibo({ id: r.id });
      if (!res.ok) {
        toast.error(res.error);
      } else if (res.data.avisado) {
        toast.success("Lembrete enviado ao projetista.");
      } else {
        toast.warning("O projetista desativou avisos de pagamento — avise por outro canal.");
      }
    });
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{r.projetista.name}</TableCell>
      <TableCell className="text-sm">
        {r.tipo === "mensal" ? "Mensal" : "Individual"}
        {competencia && (
          <span className="block text-xs text-muted-foreground">
            {competencia} · {r.qtdEntregas} entrega{r.qtdEntregas > 1 ? "s" : ""}
          </span>
        )}
      </TableCell>
      <TableCell className="text-right font-mono">{brl(r.valor)}</TableCell>
      <TableCell className="text-sm">{formatarData(r.criadoEm)}</TableCell>
      <TableCell>
        {r.assinadoEm ? (
          <StatusBadge tone="success">Assinado {formatarData(r.assinadoEm)}</StatusBadge>
        ) : (
          <StatusBadge tone="warning">Aguardando assinatura</StatusBadge>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="px-2"
            title="Baixar PDF"
            aria-label={`Baixar PDF do recibo de ${r.projetista.name}`}
            render={<a href={`/api/financeiro/recibos/${r.id}/pdf`} target="_blank" rel="noreferrer" />}
          >
            <Download className="size-3.5" />
          </Button>
          {!r.assinadoEm && (
            <Button
              size="sm"
              variant="ghost"
              className="px-2"
              title="Lembrar projetista"
              aria-label={`Lembrar ${r.projetista.name} de assinar o recibo`}
              onClick={lembrar}
              disabled={pending}
            >
              <Bell className="size-3.5" />
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
