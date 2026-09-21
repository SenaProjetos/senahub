"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, Plus, Trash2 } from "lucide-react";
import { registrarVersaoExterna } from "@/modules/comercial/actions";
import { brl } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InputMoeda } from "@/components/ui/input-moeda";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NOVA = "__nova";

type Linha = { disciplina: string; valor: number | null };

function hojeIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Registra a versão de uma proposta montada fora do sistema (ADR-0005): o PDF que foi enviado ao
 * cliente + as linhas por disciplina (é delas que o aceite cria o projeto) + desconto e datas.
 * Primeira versão consome o número sequencial; as seguintes entram na proposta escolhida.
 */
export function RegistrarVersaoExternaDialog({
  negociacaoId,
  tituloPadrao,
  propostasExternas,
  disciplinas,
  descontoMaxSemJustificativa,
}: {
  negociacaoId: string;
  tituloPadrao: string;
  /** Externas ainda não aceitas — podem receber nova versão. */
  propostasExternas: { id: string; numero: string; titulo: string; versao: number | null }[];
  disciplinas: string[];
  descontoMaxSemJustificativa: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [enviando, setEnviando] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);
  /** Último PDF já enviado ao servidor: se o registro for recusado, tentar de novo não reenvia. */
  const jaEnviado = useRef<{ chave: string; caminho: string } | null>(null);

  const [alvo, setAlvo] = useState(propostasExternas[0]?.id ?? NOVA);
  const [titulo, setTitulo] = useState(propostasExternas[0]?.titulo ?? tituloPadrao);
  const [linhas, setLinhas] = useState<Linha[]>([{ disciplina: "", valor: null }]);
  const [desconto, setDesconto] = useState<number | null>(null);
  const [justificativa, setJustificativa] = useState("");
  const [dataEnvio, setDataEnvio] = useState(hojeIso);
  const [validade, setValidade] = useState("");
  const [observacao, setObservacao] = useState("");

  const total = linhas.reduce((s, l) => s + (l.valor ?? 0), 0);
  const percentual = desconto && total > 0 ? (desconto / total) * 100 : null;
  const pedeJustificativa = percentual != null && percentual > descontoMaxSemJustificativa;

  function trocarAlvo(v: string) {
    setAlvo(v);
    const p = propostasExternas.find((x) => x.id === v);
    setTitulo(p?.titulo ?? tituloPadrao);
  }

  function setLinha(i: number, parcial: Partial<Linha>) {
    setLinhas((ls) => ls.map((l, k) => (k === i ? { ...l, ...parcial } : l)));
  }

  async function registrar() {
    const file = arquivo.current?.files?.[0];
    if (!file) {
      toast.error("Anexe o PDF enviado ao cliente.");
      return;
    }
    const itens = linhas
      .filter((l) => l.disciplina)
      .map((l) => ({ disciplina: l.disciplina, valor: l.valor ?? 0 }));
    if (itens.length === 0) {
      toast.error("Informe ao menos uma disciplina com valor.");
      return;
    }

    // Mesmo arquivo de antes (nome, tamanho e data): o upload já está no servidor. Reenviar deixaria
    // o anterior sem versão nenhuma, e a limpeza só o recolheria depois de 24h.
    const chave = `${file.name}:${file.size}:${file.lastModified}`;
    let caminho: string;
    if (jaEnviado.current?.chave === chave) {
      caminho = jaEnviado.current.caminho;
    } else {
      setEnviando(true);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/comercial/propostas/pdf-externo", { method: "POST", body: fd });
        const meta = await res.json();
        if (!res.ok) throw new Error(meta.error ?? "Falha no envio do PDF.");
        caminho = meta.caminho;
        jaEnviado.current = { chave, caminho };
      } catch (e) {
        toast.error((e as Error).message);
        setEnviando(false);
        return;
      }
      setEnviando(false);
    }

    start(async () => {
      const r = await registrarVersaoExterna({
        negociacaoId,
        propostaId: alvo === NOVA ? "" : alvo,
        titulo,
        itens,
        desconto,
        justificativaDesconto: justificativa,
        validade,
        dataEnvio,
        observacao,
        pdfCaminho: caminho,
      });
      if (r.ok) {
        toast.success(`Proposta ${r.data.numero} — versão ${r.data.versao} registrada.`);
        jaEnviado.current = null;
        setOpen(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  const ocupado = pending || enviando;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <FileUp className="size-3.5" /> Registrar proposta enviada (PDF)
          </Button>
        }
      />
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Registrar proposta enviada</DialogTitle>
          <DialogDescription>
            Para propostas montadas fora do sistema. O PDF fica guardado nesta versão; as disciplinas
            viram o projeto quando a proposta for aceita.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {propostasExternas.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="ext-alvo">Proposta</Label>
              <Select value={alvo} onValueChange={(v) => trocarAlvo(v ?? NOVA)}>
                <SelectTrigger id="ext-alvo" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {propostasExternas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {`${p.numero} — nova versão (v${(p.versao ?? 0) + 1})`}
                    </SelectItem>
                  ))}
                  <SelectItem value={NOVA}>Nova proposta (novo número)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="ext-titulo">Título</Label>
            <Input id="ext-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Disciplinas e valores</Label>
            {linhas.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select value={l.disciplina || null} onValueChange={(v) => setLinha(i, { disciplina: v ?? "" })}>
                  <SelectTrigger className="min-w-0 flex-1" aria-label={`Disciplina ${i + 1}`}>
                    <SelectValue placeholder="Disciplina" />
                  </SelectTrigger>
                  <SelectContent>
                    {disciplinas.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <InputMoeda
                  className="w-36"
                  aria-label={`Valor ${i + 1}`}
                  value={l.valor}
                  onChange={(v) => setLinha(i, { valor: v })}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Remover linha"
                  disabled={linhas.length === 1}
                  onClick={() => setLinhas((ls) => ls.filter((_, k) => k !== i))}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button size="sm" variant="ghost" onClick={() => setLinhas((ls) => [...ls, { disciplina: "", valor: null }])}>
                <Plus className="size-3.5" /> Disciplina
              </Button>
              <span className="font-mono text-xs text-muted-foreground">Total {brl(total)}</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="ext-desc">Desconto</Label>
              <InputMoeda id="ext-desc" value={desconto} onChange={setDesconto} />
              {percentual != null && (
                <p className="text-[11px] text-muted-foreground">
                  {percentual.toFixed(1)}% · final {brl(total - (desconto ?? 0))}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ext-envio">Enviada em</Label>
              <Input id="ext-envio" type="date" value={dataEnvio} onChange={(e) => setDataEnvio(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ext-validade">Válida até</Label>
              <Input id="ext-validade" type="date" value={validade} onChange={(e) => setValidade(e.target.value)} />
            </div>
          </div>
          {pedeJustificativa && (
            <div className="space-y-1.5">
              <Label htmlFor="ext-just">
                Justificativa do desconto (acima de {descontoMaxSemJustificativa}%)
              </Label>
              <Input id="ext-just" value={justificativa} onChange={(e) => setJustificativa(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="ext-obs">Observação (opcional)</Label>
            <Input id="ext-obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ext-pdf">PDF enviado ao cliente</Label>
            <Input id="ext-pdf" ref={arquivo} type="file" accept="application/pdf,.pdf" />
            <p className="text-[11px] text-muted-foreground">Só PDF, até 25 MB. Exporte o Word como PDF antes.</p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={ocupado}>
            Cancelar
          </Button>
          <Button onClick={registrar} disabled={ocupado || !titulo.trim() || (pedeJustificativa && !justificativa.trim())}>
            {enviando ? "Enviando PDF…" : pending ? "Registrando…" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
