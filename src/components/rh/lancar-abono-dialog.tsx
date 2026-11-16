"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FilePlus2, Paperclip, TriangleAlert, X } from "lucide-react";
import { MOTIVOS_AUSENCIA, rotuloMotivo } from "@/modules/rh/ausencia";
import {
  MAX_DETALHES,
  motivoParaRecusarAtestado,
  tratamentoPadrao,
  validarEntradaAbono,
  type TratamentoAusenciaValor,
} from "@/modules/rh/abono-entrada";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const TRATAMENTOS: { valor: TratamentoAusenciaValor; rotulo: string }[] = [
  { valor: "abonar", rotulo: "Abonar — horas não são cobradas" },
  { valor: "banco_horas", rotulo: "Banco de horas — horas continuam devidas" },
];

type Pessoa = { id: string; name: string };

/**
 * Lançamento de abono / atestado pelo RH, sem solicitação do colaborador. O registro nasce
 * aprovado com o tratamento escolhido; quem valida de verdade é `/api/rh/abono/lancar` (mesma
 * regra de `validarEntradaAbono`) — aqui só evitamos o round-trip óbvio.
 *
 * `pessoa` fixa o colaborador (ficha da pessoa); sem ela, `colaboradores` vira um seletor.
 */
export function LancarAbonoDialog({
  colaboradores = [],
  pessoa,
  ultimoMesFechado,
}: {
  colaboradores?: Pessoa[];
  pessoa?: Pessoa;
  /** Último mês com banco de horas fechado — dispara o aviso de lançamento retroativo. */
  ultimoMesFechado: { ano: number; mes: number } | null;
}) {
  const router = useRouter();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [userId, setUserId] = useState(pessoa?.id ?? "");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [motivoTipo, setMotivoTipo] = useState("atestado");
  // `null` = segue o motivo (atestado abona, o resto vai para o banco); o RH pode trocar.
  const [tratamentoEscolhido, setTratamentoEscolhido] = useState<TratamentoAusenciaValor | null>(null);
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFim, setHoraFim] = useState("");
  const [motivo, setMotivo] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);

  const tratamento = tratamentoEscolhido ?? tratamentoPadrao(motivoTipo);

  // `inicio` é "YYYY-MM-DD"; comparar como string ordena igual à data.
  const mesFechado =
    !!ultimoMesFechado &&
    inicio.length >= 7 &&
    inicio.slice(0, 7) <= `${ultimoMesFechado.ano}-${String(ultimoMesFechado.mes).padStart(2, "0")}`;

  function fechar(o: boolean) {
    // Fechar no meio do envio apagaria o formulário antes da resposta chegar.
    if (!o && enviando) return;
    setAberto(o);
    if (!o) limparFormulario();
  }

  function limparFormulario() {
    setUserId(pessoa?.id ?? "");
    setInicio("");
    setFim("");
    setMotivoTipo("atestado");
    setTratamentoEscolhido(null);
    setHoraInicio("");
    setHoraFim("");
    setMotivo("");
    setArquivo(null);
  }

  function limparArquivo() {
    setArquivo(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function escolherArquivo(f: File | null) {
    const recusa = f ? motivoParaRecusarAtestado(f.name, f.size) : null;
    if (recusa) {
      toast.error(recusa);
      limparArquivo();
      return;
    }
    setArquivo(f);
  }

  async function lancar() {
    if (!userId) {
      toast.error("Selecione o colaborador.");
      return;
    }
    const v = validarEntradaAbono({ dataInicio: inicio, dataFim: fim, motivoTipo, horaInicio, horaFim, motivo });
    if (!v.ok) {
      toast.error(v.erro);
      return;
    }
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("dataInicio", inicio);
    fd.set("dataFim", fim);
    fd.set("motivoTipo", motivoTipo);
    fd.set("tratamento", tratamento);
    fd.set("horaInicio", horaInicio);
    fd.set("horaFim", horaFim);
    fd.set("motivo", motivo);
    if (arquivo) fd.set("atestado", arquivo);

    setEnviando(true);
    let res: Response;
    try {
      res = await fetch("/api/rh/abono/lancar", { method: "POST", body: fd });
    } catch {
      setEnviando(false);
      // A conexão pode ter caído depois de o servidor gravar: conferir antes de repetir.
      toast.error("Falha de conexão. Atualize a página e confira se a ausência entrou antes de tentar de novo.");
      return;
    }
    setEnviando(false);
    if (res.ok) {
      toast.success("Ausência lançada e aprovada. O colaborador foi notificado.");
      setAberto(false);
      limparFormulario();
      router.refresh();
      return;
    }
    const corpo = (await res.json().catch(() => null)) as { error?: string } | null;
    toast.error(corpo?.error ?? `O servidor não conseguiu lançar a ausência (erro ${res.status}). Tente de novo.`);
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAberto(true)}>
        <FilePlus2 className="size-3.5" /> Lançar abono
      </Button>
      {aberto && (
        <Dialog open onOpenChange={fechar}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{pessoa ? `Lançar abono — ${pessoa.name}` : "Lançar abono"}</DialogTitle>
              <DialogDescription>
                Registra a ausência já aprovada, sem depender de solicitação do colaborador. Ele será
                notificado.
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-3">
              {!pessoa && (
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-colaborador`} className="text-xs">
                    Colaborador
                  </Label>
                  <Select value={userId} onValueChange={(v) => setUserId(v ?? "")}>
                    <SelectTrigger id={`${id}-colaborador`} className="w-full">
                      <SelectValue placeholder="Selecione…">
                        {colaboradores.find((c) => c.id === userId)?.name}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {colaboradores.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {colaboradores.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Nenhum outro colaborador interno ativo. A sua própria ausência vai pela solicitação em RH.
                    </p>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-inicio`} className="text-xs">
                    Início
                  </Label>
                  <Input id={`${id}-inicio`} type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-fim`} className="text-xs">
                    Fim
                  </Label>
                  <Input id={`${id}-fim`} type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-motivo`} className="text-xs">
                    Motivo
                  </Label>
                  <Select value={motivoTipo} onValueChange={(v) => setMotivoTipo(v ?? "atestado")}>
                    <SelectTrigger id={`${id}-motivo`} className="w-full">
                      <SelectValue>{rotuloMotivo(motivoTipo)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {MOTIVOS_AUSENCIA.map((m) => (
                        <SelectItem key={m.valor} value={m.valor}>
                          {m.rotulo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`${id}-das`} className="text-xs">
                      Das
                    </Label>
                    <Input
                      id={`${id}-das`}
                      type="time"
                      aria-label="Horário de início"
                      aria-describedby={`${id}-ajuda-horario`}
                      value={horaInicio}
                      onChange={(e) => setHoraInicio(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`${id}-as`} className="text-xs">
                      Às
                    </Label>
                    <Input
                      id={`${id}-as`}
                      type="time"
                      aria-label="Horário de término"
                      aria-describedby={`${id}-ajuda-horario`}
                      value={horaFim}
                      onChange={(e) => setHoraFim(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <p id={`${id}-ajuda-horario`} className="text-xs text-muted-foreground">
                Deixe o horário em branco para o dia inteiro; com horário, vale só para um dia.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-tratamento`} className="text-xs">
                  Tratamento das horas
                </Label>
                <Select
                  value={tratamento}
                  onValueChange={(v) => v && setTratamentoEscolhido(v as TratamentoAusenciaValor)}
                >
                  <SelectTrigger id={`${id}-tratamento`} className="w-full">
                    <SelectValue>{TRATAMENTOS.find((t) => t.valor === tratamento)?.rotulo}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {TRATAMENTOS.map((t) => (
                      <SelectItem key={t.valor} value={t.valor}>
                        {t.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-detalhes`} className="text-xs">
                  Detalhes (opcional)
                </Label>
                <Input
                  id={`${id}-detalhes`}
                  maxLength={MAX_DETALHES}
                  placeholder="Ex.: atestado de 2 dias entregue em mãos"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*,.pdf"
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden
                  onChange={(e) => escolherArquivo(e.target.files?.[0] ?? null)}
                />
                <Button type="button" variant="outline" className="w-full" onClick={() => inputRef.current?.click()}>
                  <Paperclip className="size-4" />
                  {arquivo ? "Trocar atestado" : "Anexar atestado (opcional)"}
                </Button>
                {arquivo && (
                  <div className="flex items-center justify-between gap-2 rounded-sm border bg-muted/40 py-0.5 pr-0.5 pl-2.5 text-xs">
                    <span role="status" className="min-w-0 truncate text-muted-foreground" title={arquivo.name}>
                      <span className="sr-only">Atestado anexado: </span>
                      {arquivo.name}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={limparArquivo}
                      aria-label="Remover atestado"
                      className="shrink-0"
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                )}
              </div>
              {mesFechado && (
                <p role="status" className="flex items-start gap-2 rounded-sm border border-dashed p-2 text-xs text-muted-foreground">
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    O banco de horas desse mês já foi fechado. Depois de lançar, use{" "}
                    <strong>Recalcular histórico</strong> em Banco de horas para o saldo refletir a ausência.
                  </span>
                </p>
              )}
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" disabled={enviando} onClick={() => fechar(false)}>
                Cancelar
              </Button>
              <Button
                onClick={lancar}
                disabled={enviando || (!pessoa && colaboradores.length === 0)}
                loading={enviando}
                aria-busy={enviando}
              >
                {enviando ? "Lançando…" : "Lançar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
