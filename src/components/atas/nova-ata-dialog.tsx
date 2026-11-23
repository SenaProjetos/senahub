"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FilePlus2 } from "lucide-react";
import { criarAtaDeTexto } from "@/modules/portal/atas/actions";
import { hrefDoEditor } from "@/modules/portal/atas/acoes";
import { EXTENSOES_ARQUIVO, TAMANHO_MAX_ARQUIVO_LABEL, motivoDoArquivo } from "@/modules/portal/atas/regras";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CLASSE_TEXTAREA } from "./motivo-dialog";

const FALHA = "Não foi possível enviar. Verifique a conexão e tente de novo.";

/**
 * "Nova ata": colar o texto das anotações do Gemini ou anexar o arquivo baixado do Google Docs (.docx, .md, .txt), com a
 * transcrição opcional. Cria a reunião com o rascunho já separado em itens e abre o editor.
 */
export function NovaAtaDialog({ projetoId }: { projetoId: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [modo, setModo] = useState<"colar" | "arquivo">("colar");
  const [texto, setTexto] = useState("");
  const [anotacoes, setAnotacoes] = useState<File | null>(null);
  const [transcricao, setTranscricao] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();
  const ids = { texto: useId(), anotacoes: useId(), transcricao: useId(), erro: useId() };
  const aceitos = EXTENSOES_ARQUIVO.map((e) => `.${e}`).join(",");

  function abrir() {
    setAberto(true);
    setTexto("");
    setAnotacoes(null);
    setTranscricao(null);
    setErro(null);
  }

  function escolher(f: File | undefined, set: (f: File | null) => void) {
    setErro(null);
    if (!f) return set(null);
    const motivo = motivoDoArquivo({ nome: f.name, tamanho: f.size });
    if (motivo) {
      setErro(motivo);
      return set(null);
    }
    set(f);
  }

  function criar() {
    setErro(null);
    startTransition(async () => {
      if (modo === "colar") {
        const r = await criarAtaDeTexto({ projetoId, texto }).catch(() => null);
        if (!r) return void toast.error(FALHA);
        if (!r.ok) return setErro(r.error);
        router.push(hrefDoEditor(projetoId, r.data.reuniaoId));
        return;
      }
      if (!anotacoes) return;
      const fd = new FormData();
      fd.append("anotacoes", anotacoes);
      if (transcricao) fd.append("transcricao", transcricao);
      const res = await fetch(`/api/portal/atas/importar?projetoId=${encodeURIComponent(projetoId)}`, { method: "POST", body: fd }).catch(() => null);
      if (!res) return void toast.error(FALHA);
      const corpo = (await res.json().catch(() => ({}))) as { reuniaoId?: string; error?: string };
      if (!res.ok || !corpo.reuniaoId) return setErro(corpo.error ?? "Não foi possível importar o arquivo.");
      router.push(hrefDoEditor(projetoId, corpo.reuniaoId));
    });
  }

  const pode = !enviando && (modo === "colar" ? texto.trim().length > 0 : anotacoes !== null);

  return (
    <>
      <Button size="sm" onClick={abrir}>
        <FilePlus2 className="size-4" aria-hidden /> Nova ata
      </Button>
      <Dialog open={aberto} onOpenChange={(o) => !enviando && setAberto(o)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nova ata de reunião</DialogTitle>
            <DialogDescription>
              Traga as anotações do Gemini (Google Meet). O sistema separa decisões e próximas etapas; você revisa tudo antes
              de publicar para o cliente.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Como trazer as anotações">
              <Button size="sm" variant={modo === "colar" ? "default" : "outline"} aria-pressed={modo === "colar"} onClick={() => setModo("colar")}>
                Colar texto
              </Button>
              <Button size="sm" variant={modo === "arquivo" ? "default" : "outline"} aria-pressed={modo === "arquivo"} onClick={() => setModo("arquivo")}>
                Anexar arquivo
              </Button>
            </div>
            {modo === "colar" ? (
              <div className="space-y-1.5">
                <Label htmlFor={ids.texto}>Anotações do Gemini</Label>
                <textarea
                  id={ids.texto}
                  rows={12}
                  className={CLASSE_TEXTAREA}
                  placeholder="Abra as anotações no Google Docs, selecione tudo (Ctrl+A), copie e cole aqui."
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  disabled={enviando}
                  aria-describedby={erro ? ids.erro : undefined}
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor={ids.anotacoes}>Anotações (obrigatório)</Label>
                  <Input id={ids.anotacoes} type="file" accept={aceitos} onChange={(e) => escolher(e.target.files?.[0], setAnotacoes)} disabled={enviando} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={ids.transcricao}>Transcrição (opcional, só fica guardada)</Label>
                  <Input id={ids.transcricao} type="file" accept={aceitos} onChange={(e) => escolher(e.target.files?.[0], setTranscricao)} disabled={enviando} />
                </div>
                <p className="text-xs text-muted-foreground">
                  No Google Docs: Arquivo → Fazer download → .docx, .md ou .txt. Até {TAMANHO_MAX_ARQUIVO_LABEL} cada. Os arquivos ficam
                  só para a equipe; o cliente nunca vê.
                </p>
              </div>
            )}
            {erro && (
              <p id={ids.erro} role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAberto(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={criar} disabled={!pode}>
              <span role="status">{enviando ? "Lendo as anotações…" : "Continuar"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
