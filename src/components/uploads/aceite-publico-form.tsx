"use client";

import { useState } from "react";
import { CheckCircle, XCircle, FileText, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatarData } from "@/lib/utils";

const SITUACAO_LABEL: Record<string, string> = {
  pendente: "Aguardando resposta",
  aceito: "Aceito",
  revisao: "Revisão solicitada",
};

export function AceitePublicoForm({
  token,
  arquivo,
  pacote,
  disciplina,
  dataEntrega,
  situacaoAtual,
  respondidoEm,
  observacaoAnterior,
}: {
  token: string;
  arquivo: string;
  pacote: string;
  disciplina: string;
  dataEntrega: string;
  situacaoAtual: string;
  respondidoEm: string | null;
  observacaoAnterior: string | null;
}) {
  const [obs, setObs] = useState("");
  const [loading, setLoading] = useState(false);
  const [situacao, setSituacao] = useState(situacaoAtual);
  const [erro, setErro] = useState<string | null>(null);

  async function responder(s: "aceito" | "revisao") {
    setLoading(true);
    setErro(null);
    try {
      const res = await fetch(`/api/p/aceite/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situacao: s, observacao: obs }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.error ?? "Erro ao enviar resposta.");
      } else {
        setSituacao(s);
      }
    } catch {
      setErro("Erro de rede. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  const jaRespondido = situacao !== "pendente";

  return (
    <div className="space-y-5">
      <div className="rounded-lg border p-4 space-y-2 text-sm">
        <div className="flex items-center gap-2 font-medium">
          <FileText className="size-4 text-primary" />
          {arquivo}
        </div>
        <div className="text-muted-foreground">
          Disciplina: <span className="text-foreground">{disciplina}</span>{" "}
          · Pacote: <span className="text-foreground font-mono">{pacote}</span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <Clock className="size-3.5" />
          Entregue em {formatarData(dataEntrega)}
        </div>
      </div>

      {jaRespondido ? (
        <div
          className={`rounded-lg border p-4 text-center ${
            situacao === "aceito"
              ? "border-success/40 bg-success/10 text-success-foreground"
              : "border-warning/40 bg-warning/10 text-warning-foreground"
          }`}
        >
          {situacao === "aceito" ? (
            <CheckCircle className="mx-auto mb-2 size-8" />
          ) : (
            <XCircle className="mx-auto mb-2 size-8" />
          )}
          <p className="font-semibold">{SITUACAO_LABEL[situacao]}</p>
          {respondidoEm && (
            <p className="text-sm opacity-80">em {formatarData(respondidoEm)}</p>
          )}
          {observacaoAnterior && (
            <p className="mt-2 text-sm italic">"{observacaoAnterior}"</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Observação (opcional)</label>
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Descreva pontos de revisão ou comentários…"
              rows={3}
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
            />
          </div>
          {erro && <p className="text-sm text-destructive">{erro}</p>}
          <div className="flex gap-3">
            <Button
              className="flex-1"
              onClick={() => responder("aceito")}
              disabled={loading}
            >
              <CheckCircle className="size-4" /> Aceitar entrega
            </Button>
            <Button
              className="flex-1"
              variant="outline"
              onClick={() => responder("revisao")}
              disabled={loading}
            >
              <XCircle className="size-4" /> Solicitar revisão
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
