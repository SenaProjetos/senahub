"use client";

import { useMemo, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CenaDwg } from "@/modules/dwg/parse";
import { comprimentoPorCamada, areaPolilinhasFechadasPorCamada } from "@/modules/custos/quantitativos/medicao-dxf";
import { registrarQuantitativo } from "@/modules/custos/quantitativos/actions";

const DwgViewer = dynamic(() => import("@/components/dwg/dwg-viewer").then((m) => m.DwgViewer), {
  ssr: false,
  loading: () => <Skeleton className="size-full" />,
});

export type DesenhoOpcao = { desenhoId: string; nomeArquivo: string; disciplinaNome: string };

export function MedirDxfDialog({
  orcamentoId,
  desenhos,
  open,
  onOpenChange,
}: {
  orcamentoId: string;
  desenhos: DesenhoOpcao[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [desenhoId, setDesenhoId] = useState("");
  const [cena, setCena] = useState<CenaDwg | null>(null);
  const [camadasVisiveis, setCamadasVisiveis] = useState<string[]>([]);
  const [descricao, setDescricao] = useState("");

  // O mundo do parser DWG é sempre mm (convenção documentada em dwg/viewer/canvas-render.ts,
  // mesma de lib/dxf.ts) — diferente do IFC, aqui não há ambiguidade por arquivo, então a
  // conversão pra metros é direta, sem seletor de unidade.
  const comprimentosMm = useMemo(() => (cena ? comprimentoPorCamada(cena, camadasVisiveis) : []), [cena, camadasVisiveis]);
  const areasMm = useMemo(() => (cena ? areaPolilinhasFechadasPorCamada(cena, camadasVisiveis) : []), [cena, camadasVisiveis]);
  const comprimentos = useMemo(() => comprimentosMm.map((l) => ({ ...l, comprimento: l.comprimento / 1000 })), [comprimentosMm]);
  const areas = useMemo(() => areasMm.map((l) => ({ ...l, area: l.area / 1_000_000 })), [areasMm]);
  const somaComprimento = comprimentos.reduce((acc, l) => acc + l.comprimento, 0);
  const somaArea = areas.reduce((acc, l) => acc + l.area, 0);

  function escolherDesenho(id: string) {
    setDesenhoId(id);
    setCena(null);
    setCamadasVisiveis([]);
    const desenho = desenhos.find((d) => d.desenhoId === id);
    setDescricao(desenho ? `Comprimento — ${desenho.nomeArquivo}` : "");
  }

  function salvar(grandeza: "comprimento" | "area", quantidade: number) {
    if (!descricao.trim() || quantidade <= 0) return;
    startTransition(async () => {
      const r = await registrarQuantitativo({
        orcamentoId,
        descricao: descricao.trim(),
        grandeza,
        unidade: grandeza === "comprimento" ? "m" : "m²",
        quantidade,
        origem: "dwg",
        uploadId: desenhoId,
        memoria: `Somado do DXF nas camadas: ${camadasVisiveis.join(", ") || "(nenhuma visível)"}.`,
      });
      if (r.ok) {
        toast.success("Levantamento gravado.");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92svh] w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <DialogHeader className="border-b px-4 py-2">
          <DialogTitle className="text-sm">Levantar do DXF</DialogTitle>
          <DialogDescription className="text-xs">
            Escolha o desenho e marque as camadas — o DXF já tem coordenadas reais, sem precisar de régua.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1">
          <div className="relative w-2/3 shrink-0 border-r">
            {desenhoId ? (
              <DwgViewer
                url={`/api/dwg/${encodeURIComponent(desenhoId)}/dxf`}
                onCena={setCena}
                onCamadasVisiveisChange={setCamadasVisiveis}
                camadasAbertasPorPadrao
              />
            ) : (
              <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
                Escolha um desenho ao lado.
              </div>
            )}
          </div>

          <div className="flex w-1/3 flex-col gap-3 overflow-y-auto p-3">
            <div className="space-y-1.5">
              <Label>Desenho convertido</Label>
              <Select value={desenhoId} onValueChange={(v) => v && escolherDesenho(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha o DXF" />
                </SelectTrigger>
                <SelectContent>
                  {desenhos.map((d) => (
                    <SelectItem key={d.desenhoId} value={d.desenhoId}>
                      {d.disciplinaNome} · {d.nomeArquivo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {cena && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="dxf-descricao">Descrição do levantamento</Label>
                  <Input id="dxf-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={200} />
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-semibold">Comprimento por camada visível</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="h-7">Camada</TableHead>
                        <TableHead className="h-7 text-right">m</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comprimentos.map((l) => (
                        <TableRow key={l.camada}>
                          <TableCell className="text-xs">{l.camada}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{l.comprimento.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-semibold">
                        <TableCell>Total</TableCell>
                        <TableCell className="text-right font-mono">{somaComprimento.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                  <Button size="sm" variant="outline" className="w-full" onClick={() => salvar("comprimento", somaComprimento)} disabled={pending || somaComprimento <= 0}>
                    Gravar comprimento ({somaComprimento.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m)
                  </Button>
                </div>

                {areas.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold">Área das polilinhas fechadas</p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="h-7">Camada</TableHead>
                          <TableHead className="h-7 text-right">m²</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {areas.map((l) => (
                          <TableRow key={l.camada}>
                            <TableCell className="text-xs">{l.camada}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{l.area.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="font-semibold">
                          <TableCell>Total</TableCell>
                          <TableCell className="text-right font-mono">{somaArea.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                    <Button size="sm" variant="outline" className="w-full" onClick={() => salvar("area", somaArea)} disabled={pending || somaArea <= 0}>
                      Gravar área ({somaArea.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²)
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <DialogFooter className="border-t px-4 py-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
