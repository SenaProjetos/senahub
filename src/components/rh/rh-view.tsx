"use client";

import { useRef, useState, useTransition } from "react";
import { formatarData } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plane, FileText, Smile } from "lucide-react";
import { solicitarFerias, registrarHumor } from "@/modules/rh/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const STATUS_CHIP: Record<string, string> = {
  pendente: "text-warning border-warning/40",
  aprovado: "text-success border-success/40",
  rejeitado: "text-destructive border-destructive/40",
};
const HUMORES = ["😞", "🙁", "😐", "🙂", "😄"];

type Abono = { id: string; dataInicio: string | Date; dataFim: string | Date; status: string; atestadoPath: string | null };
type Feria = { id: string; inicio: string | Date; fim: string | Date; status: string };

function dt(d: string | Date) {
  return formatarData(d);
}

export function RhView({
  abonos,
  ferias,
  humorAtual,
}: {
  abonos: Abono[];
  ferias: Feria[];
  humorAtual: number | null;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight">RH</h2>
        <p className="text-sm text-muted-foreground">Abono, férias e clima.</p>
      </div>

      <ClimaCard humorAtual={humorAtual} />

      <div className="grid gap-4 lg:grid-cols-2">
        <AbonoCard abonos={abonos} />
        <FeriasCard ferias={ferias} />
      </div>
    </div>
  );
}

function ClimaCard({ humorAtual }: { humorAtual: number | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sel, setSel] = useState<number | null>(humorAtual);
  const [comentario, setComentario] = useState("");

  function registrar(h: number) {
    setSel(h);
    start(async () => {
      const r = await registrarHumor({ humor: h, comentario: comentario || undefined });
      if (r.ok) toast.success("Humor registrado. Obrigado!");
      else toast.error(r.error);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Smile className="size-4" /> Como você está hoje?
        </CardTitle>
        <CardDescription>Registro anônimo — só o RH vê o resumo agregado.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          {HUMORES.map((emoji, i) => (
            <button
              key={i}
              onClick={() => registrar(i + 1)}
              disabled={pending}
              className={`flex-1 rounded-sm border py-3 text-2xl transition-colors ${
                sel === i + 1 ? "border-primary bg-primary/10" : "hover:border-primary/40"
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
        <Input
          placeholder="Comentário (opcional, anônimo)…"
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
        />
      </CardContent>
    </Card>
  );
}

function AbonoCard({ abonos }: { abonos: Abono[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    if (!inicio || !fim) {
      toast.error("Informe as datas.");
      return;
    }
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.set("dataInicio", inicio);
      fd.set("dataFim", fim);
      fd.set("motivo", motivo);
      const file = inputRef.current?.files?.[0];
      if (file) fd.set("atestado", file);
      const res = await fetch("/api/rh/abono", { method: "POST", body: fd });
      if (res.ok) {
        toast.success("Abono solicitado.");
        setInicio("");
        setFim("");
        setMotivo("");
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      } else {
        toast.error((await res.json()).error ?? "Falha.");
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4" /> Abono de falta
        </CardTitle>
        <CardDescription>Anexe o atestado; o RH valida.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Início</Label>
            <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fim</Label>
            <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
          </div>
        </div>
        <Input placeholder="Motivo (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        <input ref={inputRef} type="file" accept="image/*,.pdf" className="text-sm" />
        <Button onClick={enviar} disabled={enviando} className="w-full">
          {enviando ? "Enviando…" : "Solicitar abono"}
        </Button>

        <ul className="divide-y text-sm">
          {abonos.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2">
              <span>
                {dt(a.dataInicio)} – {dt(a.dataFim)}
              </span>
              <Badge variant="outline" className={STATUS_CHIP[a.status]}>
                {a.status}
              </Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function FeriasCard({ ferias }: { ferias: Feria[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [obs, setObs] = useState("");

  function solicitar() {
    if (!inicio || !fim) {
      toast.error("Informe as datas.");
      return;
    }
    start(async () => {
      const r = await solicitarFerias({ inicio, fim, observacao: obs || undefined });
      if (r.ok) {
        toast.success("Férias solicitadas.");
        setInicio("");
        setFim("");
        setObs("");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Plane className="size-4" /> Férias
        </CardTitle>
        <CardDescription>Solicite seu período.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Início</Label>
            <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fim</Label>
            <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
          </div>
        </div>
        <Input placeholder="Observação (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} />
        <Button onClick={solicitar} disabled={pending} className="w-full">
          {pending ? "Enviando…" : "Solicitar férias"}
        </Button>

        <ul className="divide-y text-sm">
          {ferias.map((f) => (
            <li key={f.id} className="flex items-center justify-between py-2">
              <span>
                {dt(f.inicio)} – {dt(f.fim)}
              </span>
              <Badge variant="outline" className={STATUS_CHIP[f.status]}>
                {f.status}
              </Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
