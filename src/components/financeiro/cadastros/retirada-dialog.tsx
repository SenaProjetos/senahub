"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InputMoeda } from "@/components/ui/input-moeda";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Valor } from "@/components/financeiro/valor";
import { brl } from "@/lib/utils";
import { adiantarLucros, distribuirLucros } from "@/modules/financeiro/socios/actions";
import { bpParaTexto, motivoDoRateio, ratearEntreSocios, type SocioParaRateio } from "@/modules/financeiro/socios/calculo";

export type TipoRetirada = "distribuicao" | "adiantamento";

/**
 * Distribuição de lucros (dividida pelo percentual de cada sócio) e adiantamento (um sócio).
 * Cria contas a pagar previstas, fora do resultado: sai do caixa, não é despesa na DRE.
 */
export function RetiradaDialog({
  aberto,
  tipo,
  socios,
  hoje,
  onFechar,
}: {
  aberto: boolean;
  tipo: TipoRetirada;
  /** Sócios ATIVOS, com o percentual em basis points. */
  socios: SocioParaRateio[];
  hoje: string;
  onFechar: () => void;
}) {
  const router = useRouter();
  const [valor, setValor] = useState<number | null>(null);
  const [data, setData] = useState(hoje);
  const [socioId, setSocioId] = useState("");
  const [observacao, setObservacao] = useState("");
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    if (!aberto) return;
    setValor(null);
    setData(hoje);
    setSocioId(socios[0]?.id ?? "");
    setObservacao("");
  }, [aberto, hoje, socios]);

  const centavos = valor == null ? 0 : Math.round(valor * 100);
  const motivo = tipo === "distribuicao" ? motivoDoRateio(socios) : socios.length === 0 ? "Nenhum sócio ativo cadastrado." : null;
  const partes = tipo === "distribuicao" && !motivo ? ratearEntreSocios(centavos, socios) : [];
  const valido = centavos > 0 && !motivo && (tipo === "distribuicao" ? partes.length > 0 : socioId !== "");

  function enviar() {
    if (!valido) return;
    iniciar(async () => {
      const r =
        tipo === "distribuicao"
          ? await distribuirLucros({ valor: valor!, data, observacao })
          : await adiantarLucros({ socioId, valor: valor!, data, observacao });
      if (!r.ok) return void toast.error(r.error);
      toast.success(
        tipo === "distribuicao"
          ? `${(r.data as { lancamentos: number }).lancamentos} contas a pagar criadas, uma por sócio.`
          : "Adiantamento lançado como conta a pagar.",
      );
      onFechar();
      router.refresh();
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tipo === "distribuicao" ? "Distribuir lucros" : "Adiantar lucros"}</DialogTitle>
          <DialogDescription>
            {tipo === "distribuicao"
              ? "Divide o valor pelo percentual de cada sócio e cria uma conta a pagar para cada um."
              : "Cria uma conta a pagar para o sócio escolhido."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-3">
            {tipo === "adiantamento" && (
              <div className="grid gap-1.5">
                <Label htmlFor="rt-socio">Sócio</Label>
                <Select value={socioId} onValueChange={(v) => setSocioId(v ?? "")} items={Object.fromEntries(socios.map((s) => [s.id, s.nome]))}>
                  <SelectTrigger id="rt-socio" className="w-full">
                    <SelectValue placeholder="Selecione…" />
                  </SelectTrigger>
                  <SelectContent>
                    {socios.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="rt-valor">Valor total</Label>
                <InputMoeda id="rt-valor" value={valor} onChange={setValor} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="rt-data">Data</Label>
                <Input id="rt-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rt-obs">Observação (opcional)</Label>
              <Input id="rt-obs" value={observacao} maxLength={200} onChange={(e) => setObservacao(e.target.value)} />
            </div>

            {motivo && (
              <p role="alert" className="text-[13px] font-medium text-destructive">
                {motivo}
              </p>
            )}
            {partes.length > 0 && (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-1 font-medium">Sócio</th>
                    <th className="py-1 text-right font-medium">%</th>
                    <th className="py-1 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {partes.map((p) => (
                    <tr key={p.socioId} className="border-t">
                      <td className="py-1">{p.nome}</td>
                      <td className="py-1 text-right font-mono">{bpParaTexto(p.percentualBp)}</td>
                      <td className="py-1 text-right">
                        <Valor valor={p.valor / 100} sentido="neutro" />
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t font-bold">
                    <td className="py-1">Total</td>
                    <td className="py-1 text-right font-mono">100%</td>
                    <td className="py-1 text-right font-mono">{brl(centavos / 100)}</td>
                  </tr>
                </tbody>
              </table>
            )}
            <p className="rounded-sm border bg-muted/30 px-2.5 py-1.5 text-[12.5px]">
              Fica fora do resultado: sai do caixa e aparece no DFC como financiamento, mas não é despesa na DRE.
            </p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button disabled={pendente || !valido} onClick={enviar}>
            {tipo === "distribuicao" ? "Criar contas a pagar" : "Criar conta a pagar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
