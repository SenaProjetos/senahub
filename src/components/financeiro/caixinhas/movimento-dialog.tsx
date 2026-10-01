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
import { brlC } from "@/components/financeiro/planejador/formato";
import { motivoDeRecusa, type TipoMovimento } from "@/modules/financeiro/caixinhas/calculo";
import { movimentarCaixinha } from "@/modules/financeiro/caixinhas/actions";
import type { CaixinhaDto } from "@/modules/financeiro/caixinhas/queries";

export type TipoDoDialog = TipoMovimento;

const TEXTO: Record<TipoDoDialog, { titulo: string; descricao: string; botao: string }> = {
  alocacao: { titulo: "Reservar valor", descricao: "Separa parte do caixa para esta caixinha. O dinheiro continua nas contas.", botao: "Reservar" },
  liberacao: { titulo: "Liberar valor", descricao: "Devolve parte do reservado ao dinheiro livre.", botao: "Liberar" },
  transferencia: { titulo: "Transferir entre caixinhas", descricao: "Tira do reservado de uma e põe na outra. O caixa não muda.", botao: "Transferir" },
  ajuste: { titulo: "Ajustar o alocado", descricao: "Corrige o valor alocado quando ele não bate com a realidade. Fica registrado no extrato.", botao: "Ajustar" },
};

/**
 * Reservar, liberar, transferir ou ajustar. A recusa aparece ao digitar (mesma regra pura do
 * servidor, `motivoDeRecusa`); reservar nunca é recusado por falta de caixa — o planejador mostra a
 * reserva descoberta, não impede.
 */
export function MovimentoDialog({
  aberto,
  tipo,
  origemId,
  caixinhas,
  hoje,
  caixaAtual,
  reservadoTotal,
  onFechar,
}: {
  aberto: boolean;
  tipo: TipoDoDialog;
  origemId: string | null;
  caixinhas: CaixinhaDto[];
  hoje: string;
  /** Centavos. */
  caixaAtual: number;
  /** Centavos, de todas as caixinhas ativas. */
  reservadoTotal: number;
  onFechar: () => void;
}) {
  const router = useRouter();
  const [origem, setOrigem] = useState("");
  const [destino, setDestino] = useState("");
  const [valor, setValor] = useState<number | null>(null);
  const [diminuir, setDiminuir] = useState(false);
  const [data, setData] = useState(hoje);
  const [descricao, setDescricao] = useState("");
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    if (!aberto) return;
    setOrigem(origemId ?? caixinhas[0]?.id ?? "");
    setDestino("");
    setValor(null);
    setDiminuir(false);
    setData(hoje);
    setDescricao("");
  }, [aberto, origemId, caixinhas, hoje]);

  const t = TEXTO[tipo];
  const c = caixinhas.find((x) => x.id === origem);
  const centavos = valor == null ? 0 : Math.round(valor * 100);
  const assinado = tipo === "ajuste" && diminuir ? -centavos : centavos;
  const recusa = c && centavos > 0 ? motivoDeRecusa({ tipo, valor: assinado }, { alocado: c.situacao.alocado, reservado: c.situacao.reservado }) : null;
  const dataOk = data >= "2000-01-01" && data <= "2100-12-31";
  const valido = !!c && centavos > 0 && !recusa && dataOk && (tipo !== "transferencia" || (destino !== "" && destino !== origem));

  const reservadoDepois = c
    ? tipo === "alocacao"
      ? c.situacao.reservado + centavos
      : tipo === "liberacao" || tipo === "transferencia"
        ? c.situacao.reservado - centavos
        : Math.max(0, c.situacao.alocado + assinado - c.situacao.usado)
    : 0;
  const totalDepois = tipo === "transferencia" ? reservadoTotal : reservadoTotal + (reservadoDepois - (c?.situacao.reservado ?? 0));
  const descobertoDepois = Math.max(0, totalDepois - caixaAtual);

  function enviar() {
    if (!c || !valido) return;
    iniciar(async () => {
      const base = { caixinhaId: c.id, valor: assinado, data, descricao };
      const r = await movimentarCaixinha(tipo === "transferencia" ? { tipo, destinoId: destino, ...base } : { tipo, ...base });
      if (!r.ok) return void toast.error(r.error);
      toast.success(`${t.botao === "Reservar" ? "Reservado" : t.botao === "Liberar" ? "Liberado" : t.botao === "Transferir" ? "Transferido" : "Ajustado"}.`);
      onFechar();
      router.refresh();
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.titulo}</DialogTitle>
          <DialogDescription>{t.descricao}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="mv-origem">{tipo === "transferencia" ? "De" : "Caixinha"}</Label>
              <Select value={origem} onValueChange={(v) => v && setOrigem(v)} items={Object.fromEntries(caixinhas.map((x) => [x.id, x.nome]))}>
                <SelectTrigger id="mv-origem" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {caixinhas.map((x) => (
                    <SelectItem key={x.id} value={x.id}>
                      {x.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {c && (
                <p className="text-xs text-muted-foreground">
                  Reservado agora: <b className="font-mono">{brlC(c.situacao.reservado)}</b>
                  {c.situacao.usoAlem > 0 && <span className="text-warning"> · o uso passou do reservado em {brlC(c.situacao.usoAlem)}</span>}
                </p>
              )}
            </div>
            {tipo === "transferencia" && (
              <div className="grid gap-1.5">
                <Label htmlFor="mv-destino">Para</Label>
                <Select value={destino} onValueChange={(v) => setDestino(v ?? "")} items={Object.fromEntries(caixinhas.map((x) => [x.id, x.nome]))}>
                  <SelectTrigger id="mv-destino" className="w-full">
                    <SelectValue placeholder="Escolha a caixinha" />
                  </SelectTrigger>
                  <SelectContent>
                    {caixinhas
                      .filter((x) => x.id !== origem)
                      .map((x) => (
                        <SelectItem key={x.id} value={x.id}>
                          {x.nome}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {tipo === "ajuste" && (
              <div role="group" aria-label="Sentido do ajuste" className="flex gap-1.5">
                <Button size="sm" variant={!diminuir ? "default" : "outline"} aria-pressed={!diminuir} onClick={() => setDiminuir(false)}>
                  Aumentar
                </Button>
                <Button size="sm" variant={diminuir ? "default" : "outline"} aria-pressed={diminuir} onClick={() => setDiminuir(true)}>
                  Diminuir
                </Button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="mv-valor">Valor</Label>
                <InputMoeda id="mv-valor" value={valor} onChange={setValor} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="mv-data">Data</Label>
                <Input id="mv-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mv-desc">Observação (opcional)</Label>
              <Input id="mv-desc" value={descricao} maxLength={200} onChange={(e) => setDescricao(e.target.value)} />
            </div>
            {recusa && (
              <p role="alert" className="text-[13px] font-medium text-destructive">
                {recusa}
              </p>
            )}
            {!recusa && c && centavos > 0 && (
              <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 rounded-sm border p-3 text-[13px]">
                <dt>Reservado em {c.nome}, depois</dt>
                <dd className="text-right font-mono">{brlC(reservadoDepois)}</dd>
                {tipo !== "transferencia" && (
                  <>
                    <dt>Reservado em todas, depois</dt>
                    <dd className="text-right font-mono">{brlC(totalDepois)}</dd>
                  </>
                )}
                {descobertoDepois > 0 && (
                  <>
                    <dt className="font-semibold text-warning">Reserva descoberta</dt>
                    <dd className="text-right font-mono font-semibold text-warning">{brlC(descobertoDepois)}</dd>
                  </>
                )}
              </dl>
            )}
            {descobertoDepois > 0 && !recusa && (
              <p className="text-xs text-muted-foreground">As caixinhas passariam do caixa nas contas. Não é impedido: o planejador mostra a diferença.</p>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button disabled={pendente || !valido} onClick={enviar}>
            {t.botao}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
