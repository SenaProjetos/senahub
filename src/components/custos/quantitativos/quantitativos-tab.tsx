"use client";

import { useState } from "react";
import { Boxes, FileText, Pencil, Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatarDataHora } from "@/lib/utils";
import type { QuantitativoListItem } from "@/modules/custos/quantitativos/queries";
import { LevantarIfcDialog, type ModeloOpcao } from "./levantar-ifc-dialog";
import { MedirDxfDialog, type DesenhoOpcao } from "./medir-dxf-dialog";
import { MedirPdfDialog, type PdfOpcao } from "./medir-pdf-dialog";
import { ManualQuantitativoDialog } from "./manual-quantitativo-dialog";
import { AplicarQuantitativoDialog, type ItemParaAplicar } from "./aplicar-quantitativo-dialog";

const ORIGEM_LABEL: Record<string, string> = { manual: "Manual", ifc: "IFC", dwg: "DXF", pdf: "PDF", ia: "IA" };

export function QuantitativosTab({
  orcamentoId,
  quantitativos,
  itensParaAplicar,
  modelosIfc,
  desenhosDxf,
  pdfs,
  podeGerir,
}: {
  orcamentoId: string;
  quantitativos: QuantitativoListItem[];
  itensParaAplicar: ItemParaAplicar[];
  modelosIfc: ModeloOpcao[];
  desenhosDxf: DesenhoOpcao[];
  pdfs: PdfOpcao[];
  podeGerir: boolean;
}) {
  const [abrirIfc, setAbrirIfc] = useState(false);
  const [abrirDxf, setAbrirDxf] = useState(false);
  const [abrirPdf, setAbrirPdf] = useState(false);
  const [abrirManual, setAbrirManual] = useState(false);
  const [alvoAplicar, setAlvoAplicar] = useState<QuantitativoListItem | null>(null);

  return (
    <div className="space-y-4 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Quantitativos</h3>
          <p className="text-xs text-muted-foreground">
            Levantamentos com rastro até a fonte — nunca sobrescritos; recontar sempre gera uma linha nova.
          </p>
        </div>
        {podeGerir && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setAbrirIfc(true)} disabled={modelosIfc.length === 0} title={modelosIfc.length === 0 ? "Nenhum modelo IFC convertido neste projeto" : undefined}>
              <Boxes className="size-4" /> Levantar do IFC
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAbrirDxf(true)} disabled={desenhosDxf.length === 0} title={desenhosDxf.length === 0 ? "Nenhum DXF convertido neste projeto" : undefined}>
              <Ruler className="size-4" /> Levantar do DXF
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAbrirPdf(true)} disabled={pdfs.length === 0} title={pdfs.length === 0 ? "Nenhum PDF neste projeto" : undefined}>
              <FileText className="size-4" /> Medir no PDF
            </Button>
            <Button size="sm" onClick={() => setAbrirManual(true)}>
              <Pencil className="size-4" /> Manual
            </Button>
          </div>
        )}
      </div>

      {quantitativos.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="Nenhum levantamento ainda."
          description={podeGerir ? "Levante do IFC, do DXF, meça no PDF, ou registre manualmente." : undefined}
        />
      ) : (
        <div className="rounded-sm border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead className="w-20">Origem</TableHead>
                <TableHead className="w-32 text-right">Quantidade</TableHead>
                <TableHead>Aplicado a</TableHead>
                <TableHead className="w-32">Data</TableHead>
                {podeGerir && <TableHead className="w-24" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {quantitativos.map((q) => (
                <TableRow key={q.id}>
                  <TableCell className="text-sm">{q.descricao}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      {ORIGEM_LABEL[q.origem] ?? q.origem}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {q.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {q.unidade}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{q.itemDescricao ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatarDataHora(q.createdAt)}</TableCell>
                  {podeGerir && (
                    <TableCell>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setAlvoAplicar(q)}>
                        Aplicar
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <LevantarIfcDialog orcamentoId={orcamentoId} modelos={modelosIfc} open={abrirIfc} onOpenChange={setAbrirIfc} />
      <MedirDxfDialog orcamentoId={orcamentoId} desenhos={desenhosDxf} open={abrirDxf} onOpenChange={setAbrirDxf} />
      <MedirPdfDialog orcamentoId={orcamentoId} pdfs={pdfs} open={abrirPdf} onOpenChange={setAbrirPdf} />
      <ManualQuantitativoDialog orcamentoId={orcamentoId} open={abrirManual} onOpenChange={setAbrirManual} />
      <AplicarQuantitativoDialog
        itens={itensParaAplicar}
        quantitativo={alvoAplicar}
        open={alvoAplicar !== null}
        onOpenChange={(v) => !v && setAlvoAplicar(null)}
      />
    </div>
  );
}
