"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AssinarComCertificadoIcp } from "@/components/juridico/assinar-com-certificado-icp";

/**
 * Formulário de assinatura por link público (Fase F).
 *
 * Regras que vêm da validade jurídica, não da UX:
 * - O consentimento é EXPLÍCITO e ESPECÍFICO: caixa nunca pré-marcada, e o texto nomeia o
 *   documento e a versão. "Li e aceito" genérico não prova manifestação de vontade sobre ESTE
 *   documento (spec §Fase D, mecanismo item 3).
 * - Ler o documento é pré-requisito para o botão liberar: assinar sem ter aberto é a fraqueza
 *   mais óbvia que alguém apontaria depois.
 */
export function AssinaturaPublicaForm({
  token,
  nomeEsperado,
  titulo,
  versao,
}: {
  token: string;
  nomeEsperado: string;
  titulo: string;
  versao: number;
}) {
  const router = useRouter();
  const [nome, setNome] = useState(nomeEsperado);
  const [cpf, setCpf] = useState("");
  const [leu, setLeu] = useState(false);
  const [aceito, setAceito] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function assinar() {
    if (!nome.trim()) return toast.error("Informe seu nome completo.");
    if (!aceito) return toast.error("Marque a confirmação para assinar.");
    setEnviando(true);
    try {
      const res = await fetch(`/api/p/assinar/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, cpf }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Assinatura registrada.");
        router.refresh();
      } else {
        toast.error(data.error ?? "Não foi possível assinar.");
      }
    } catch {
      toast.error("Falha de conexão. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <a
        href={`/api/p/assinar/${token}/documento`}
        target="_blank"
        rel="noreferrer"
        onClick={() => setLeu(true)}
        className="inline-block rounded-sm border px-4 py-2 text-sm font-medium text-primary hover:bg-muted/40"
      >
        Abrir o documento para leitura →
      </a>
      {!leu && (
        <p className="text-xs text-muted-foreground">Abra o documento antes de assinar.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Nome completo</Label>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>CPF (opcional)</Label>
          <Input value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" />
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={aceito} onCheckedChange={(v) => setAceito(v === true)} disabled={!leu} />
        <span>
          Li e assino <strong>{titulo}</strong>, versão {versao}, declarando que as informações
          acima são verdadeiras.
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={assinar} disabled={!leu || !aceito || enviando}>
          Assinar documento
        </Button>
        <AssinarComCertificadoIcp />
      </div>

      <p className="text-xs text-muted-foreground">
        Sua assinatura será registrada com data, hora, endereço IP e navegador, junto ao código de
        verificação (hash) do documento — prova de autoria e integridade na forma do art. 10, §2º da
        MP nº 2.200-2/2001.
      </p>
    </div>
  );
}
