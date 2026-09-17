"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { criarCertidao } from "@/modules/certidoes/actions";
import { extrairValidadeDoTexto } from "@/modules/certidoes/extrair-validade";
import { lerTextoPdf } from "@/lib/ler-texto-pdf";
import type { Responsavel, Tipo } from "@/components/certidoes/tipos";

const NENHUM = "__nenhum";

/**
 * §12 — cadastro saiu da faixa fixa acima da lista e virou dialog.
 *
 * O formulário inline ocupava ~90px permanentes no topo para uma ação pontual, empurrando a
 * tabela (que é o conteúdo) para baixo da dobra.
 *
 * NÃO há preenchimento automático por tipo: `CertidaoTipo` é `{id, nome, obrigatoria}` — não existe
 * responsável padrão nem prazo padrão no modelo, e §13/§27 mandam não criar essas colunas aqui.
 *
 * Mantém a detecção de validade no PDF que já existia no fluxo de nova versão.
 */
export function NovaCertidaoDialog({
  aberto,
  onClose,
  tipos,
  responsaveis,
}: {
  aberto: boolean;
  onClose: () => void;
  tipos: Tipo[];
  responsaveis: Responsavel[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tipoId, setTipoId] = useState("");
  const [responsavelId, setResponsavelId] = useState(NENHUM);
  const [validade, setValidade] = useState("");
  const [descricao, setDescricao] = useState("");
  const [lendo, setLendo] = useState(false);
  const [sugerida, setSugerida] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function limpar() {
    setTipoId("");
    setResponsavelId(NENHUM);
    setValidade("");
    setDescricao("");
    setSugerida(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSugerida(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setLendo(true);
    try {
      const { texto, itens } = await lerTextoPdf(file);
      const achada = extrairValidadeDoTexto(texto, itens);
      if (achada) {
        setSugerida(achada);
        setValidade((atual) => atual || achada);
      }
    } catch {
      // PDF escaneado/corrompido — segue sem sugestão, o upload não pode travar por isso.
    } finally {
      setLendo(false);
    }
  }

  function salvar() {
    if (!tipoId || !validade) return toast.error("Selecione o tipo e informe a validade.");
    const file = fileRef.current?.files?.[0] ?? null;

    start(async () => {
      const r = await criarCertidao({
        tipoId,
        descricao,
        validade,
        responsavelId: responsavelId === NENHUM ? "" : responsavelId,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }

      if (file) {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("validade", validade);
        const res = await fetch(`/api/certidoes/${r.data.id}/versao`, { method: "POST", body: fd });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          toast.error(data?.error ?? "Certidão criada, mas falhou o envio do arquivo.");
        } else {
          toast.success("Certidão cadastrada com documento.");
        }
      } else {
        toast.success("Certidão cadastrada — anexe o documento em seguida.");
      }

      limpar();
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova certidão</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select value={tipoId} onValueChange={(v) => setTipoId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {tipos.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nome}
                      {t.obrigatoria ? " (obrigatória)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select value={responsavelId} onValueChange={(v) => setResponsavelId(v ?? NENHUM)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sem responsável" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NENHUM}>Sem responsável</SelectItem>
                  {responsaveis.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nova-certidao-validade">Validade *</Label>
              <Input
                id="nova-certidao-validade"
                type="date"
                value={validade}
                onChange={(e) => setValidade(e.target.value)}
              />
              {sugerida && validade === sugerida && (
                <p className="text-xs text-success">
                  Validade detectada no PDF — confira antes de salvar.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nova-certidao-arquivo">Documento (PDF, opcional)</Label>
              <input
                id="nova-certidao-arquivo"
                ref={fileRef}
                type="file"
                accept="application/pdf"
                className="block w-full text-sm"
                onChange={onFileChange}
              />
              {lendo && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" aria-hidden /> Lendo o PDF em busca da
                  validade…
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nova-certidao-descricao">Descrição / observação</Label>
              <Input
                id="nova-certidao-descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Opcional"
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={pending || !tipoId || !validade}>
            {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            Cadastrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
