"use client";

import { useRef, useState, useTransition } from "react";
import { formatarData } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plane, FileText, Smile, Paperclip, X, ClipboardList } from "lucide-react";
import { solicitarFerias, registrarHumor } from "@/modules/rh/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FeriasAcoes, type FeriaItem } from "@/components/rh/ferias-acoes";

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  pendente: "warning",
  aprovado: "success",
  rejeitado: "danger",
};
const HUMORES = ["😞", "🙁", "😐", "🙂", "😄"];
const HUMOR_LABELS = ["Muito insatisfeito", "Insatisfeito", "Neutro", "Satisfeito", "Muito satisfeito"];

type Abono = { id: string; dataInicio: string | Date; dataFim: string | Date; status: string; atestadoPath: string | null };
type Feria = FeriaItem;

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
        <AbonoCard />
        <FeriasCard />
      </div>

      <MinhasSolicitacoes abonos={abonos} ferias={ferias} />
    </div>
  );
}

type Solicitacao = {
  id: string;
  tipo: "Abono" | "Férias";
  inicio: string | Date;
  fim: string | Date;
  status: string;
  /** Só nas férias — habilita editar / propor alteração / responder proposta. */
  feria?: Feria;
};

function MinhasSolicitacoes({ abonos, ferias }: { abonos: Abono[]; ferias: Feria[] }) {
  const itens: Solicitacao[] = [
    ...abonos.map((a) => ({
      id: `abono-${a.id}`,
      tipo: "Abono" as const,
      inicio: a.dataInicio,
      fim: a.dataFim,
      status: a.status,
    })),
    ...ferias.map((f) => ({
      id: `ferias-${f.id}`,
      tipo: "Férias" as const,
      inicio: f.inicio,
      fim: f.fim,
      status: f.status,
      feria: f,
    })),
  ].sort((a, b) => new Date(b.inicio).getTime() - new Date(a.inicio).getTime());

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="size-4" /> Minhas solicitações
        </CardTitle>
        <CardDescription>Histórico de abonos e férias e o status de cada um.</CardDescription>
      </CardHeader>
      <CardContent>
        {itens.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Nenhuma solicitação ainda"
            description="Seus pedidos de abono e férias aparecerão aqui."
          />
        ) : (
          <ul className="divide-y text-sm">
            {itens.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <span className="font-medium">{s.tipo}</span>
                  <span className="text-muted-foreground">
                    {" · "}
                    {dt(s.inicio)} – {dt(s.fim)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {s.feria && <FeriasAcoes feria={s.feria} />}
                  <StatusBadge tone={STATUS_TONE[s.status] ?? "neutral"}>{s.status}</StatusBadge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
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
              aria-label={HUMOR_LABELS[i]}
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

function AbonoCard() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [motivo, setMotivo] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);

  function limparArquivo() {
    setArquivo(null);
    if (inputRef.current) inputRef.current.value = "";
  }

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
      if (arquivo) fd.set("atestado", arquivo);
      const res = await fetch("/api/rh/abono", { method: "POST", body: fd });
      if (res.ok) {
        toast.success("Abono solicitado.");
        setInicio("");
        setFim("");
        setMotivo("");
        limparArquivo();
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

        <div className="space-y-1.5">
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.pdf"
            className="sr-only"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => inputRef.current?.click()}
          >
            <Paperclip className="size-4" />
            {arquivo ? "Trocar atestado" : "Anexar atestado"}
          </Button>
          {arquivo && (
            <div className="flex items-center justify-between gap-2 rounded-sm border bg-muted/40 px-2.5 py-1.5 text-xs">
              <span className="min-w-0 truncate text-muted-foreground" title={arquivo.name}>
                {arquivo.name}
              </span>
              <button
                type="button"
                onClick={limparArquivo}
                aria-label="Remover atestado"
                className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}
        </div>

        <Button onClick={enviar} disabled={enviando} className="w-full">
          {enviando ? "Enviando…" : "Solicitar abono"}
        </Button>
      </CardContent>
    </Card>
  );
}

function FeriasCard() {
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
      </CardContent>
    </Card>
  );
}
