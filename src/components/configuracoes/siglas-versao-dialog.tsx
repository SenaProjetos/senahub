"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X, RotateCcw, Trash2, Tags } from "lucide-react";
import {
  listarSiglasDoAlvoAction,
  criarSiglaVersao,
  encerrarSiglaVersao,
  reabrirSiglaVersao,
  excluirSiglaVersao,
} from "@/modules/uploads/nomenclatura/siglas-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { versaoAteSugerida, versaoMaisNova } from "@/modules/uploads/nomenclatura/siglas-versao";

export type AlvoSiglaDialog = { tipo: "disciplina" | "subdisciplina" | "prancha"; id: string };

type SiglaRow = {
  id: string;
  sigla: string;
  oficial: boolean;
  versaoDesde: number;
  versaoAte: number | null;
};

export type VersaoOpcao = { id: string; numero: number; nome: string; publicadaEm: Date | string | null };

function rotuloVersao(v: VersaoOpcao) {
  return `v${v.numero} — ${v.nome}${v.publicadaEm ? "" : " (rascunho)"}`;
}

/**
 * Diálogo compartilhado de "siglas por versão" (D4): abre para um card, uma sub-disciplina ou
 * um item do catálogo da Lista Mestre. Cada linha vale de uma versão a outra (ou sem fim); a
 * mesma sigla pode significar coisas diferentes desde que as faixas não se cruzem — a action
 * barra colisão de verdade.
 */
export function SiglasVersaoDialog({
  aberto,
  onFechar,
  alvo,
  rotuloAlvo,
  versoes,
}: {
  aberto: boolean;
  onFechar: () => void;
  alvo: AlvoSiglaDialog | null;
  rotuloAlvo: string;
  versoes: VersaoOpcao[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [linhas, setLinhas] = useState<SiglaRow[] | null>(null);
  const [carregando, setCarregando] = useState(false);

  const [sigla, setSigla] = useState("");
  const [oficial, setOficial] = useState(true);
  const [versaoDesde, setVersaoDesde] = useState<string>("");
  const [semFim, setSemFim] = useState(true);
  const [versaoAte, setVersaoAte] = useState<string>("");
  /** Linha sendo encerrada + a versão escolhida para o fim — encerrar pergunta "até qual". */
  const [encerrando, setEncerrando] = useState<{ linha: SiglaRow; ate: string } | null>(null);

  const versoesOrdenadas = [...versoes].sort((a, b) => a.numero - b.numero);

  useEffect(() => {
    if (!aberto || !alvo) return;
    setCarregando(true);
    listarSiglasDoAlvoAction(alvo)
      .then((r) => setLinhas(r.ok ? r.data : []))
      .finally(() => setCarregando(false));
    setSigla("");
    setOficial(true);
    setSemFim(true);
    setVersaoAte("");
    setEncerrando(null);
    // Abre na versão mais nova (rascunho incluso): cadastrar sigla quase sempre é preparar a
    // próxima versão. Abrir na v1 fazia a sigla valer também nos projetos antigos quando alguém
    // esquecia de trocar o seletor.
    const nova = versaoMaisNova(versoesOrdenadas);
    setVersaoDesde(nova !== null ? String(nova) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, alvo]);

  function recarregar() {
    if (!alvo) return;
    listarSiglasDoAlvoAction(alvo).then((r) => r.ok && setLinhas(r.data));
    router.refresh();
  }

  function adicionar() {
    if (!alvo || !sigla.trim() || !versaoDesde) return;
    start(async () => {
      const r = await criarSiglaVersao({
        alvo,
        sigla: sigla.trim(),
        oficial,
        versaoDesde: Number(versaoDesde),
        versaoAte: semFim || !versaoAte ? null : Number(versaoAte),
      });
      if (r.ok) {
        toast.success("Sigla adicionada.");
        setSigla("");
        recarregar();
      } else toast.error(r.error);
    });
  }

  function pedirEncerramento(linha: SiglaRow) {
    setEncerrando({ linha, ate: String(versaoAteSugerida(versoesOrdenadas, linha.versaoDesde)) });
  }

  function confirmarEncerramento() {
    if (!encerrando) return;
    const { linha, ate } = encerrando;
    start(async () => {
      const r = await encerrarSiglaVersao({ id: linha.id, versaoAte: Number(ate) });
      if (r.ok) {
        setEncerrando(null);
        recarregar();
      } else toast.error(r.error);
    });
  }

  function reabrir(id: string) {
    start(async () => {
      const r = await reabrirSiglaVersao({ id });
      if (r.ok) recarregar();
      else toast.error(r.error);
    });
  }

  function excluir(id: string) {
    start(async () => {
      const r = await excluirSiglaVersao({ id });
      if (r.ok) recarregar();
      else toast.error(r.error);
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Siglas de {rotuloAlvo}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-xs text-muted-foreground">
            A sigla oficial é a que aparece nos nomes gerados; sinônimos são reconhecidos no envio mas nunca escritos.
            Cada linha vale numa faixa de versões — trocar a sigla oficial não apaga a antiga, só encerra a faixa dela.
          </p>
          {carregando ? (
            <p className="text-xs text-muted-foreground">Carregando…</p>
          ) : !linhas || linhas.length === 0 ? (
            <EmptyState icon={Tags} title="Nenhuma sigla cadastrada" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sigla</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Vale</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono font-medium">{l.sigla}</TableCell>
                    <TableCell>
                      <Badge variant={l.oficial ? "default" : "outline"} className="text-[10px]">
                        {l.oficial ? "oficial" : "sinônimo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      da v{l.versaoDesde} {l.versaoAte ? `até a v${l.versaoAte}` : "em diante"}
                    </TableCell>
                    <TableCell className="text-right">
                      {l.versaoAte === null ? (
                        <Button size="icon" variant="ghost" className="size-7" aria-label={`Encerrar ${l.sigla}`} title="Encerrar (escolher até qual versão vale)" disabled={pending} onClick={() => pedirEncerramento(l)}>
                          <X className="size-3.5" />
                        </Button>
                      ) : (
                        <Button size="icon" variant="ghost" className="size-7" aria-label={`Reabrir ${l.sigla}`} title="Reabrir (sem fim de faixa)" disabled={pending} onClick={() => reabrir(l.id)}>
                          <RotateCcw className="size-3.5" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-destructive" aria-label={`Excluir ${l.sigla}`} disabled={pending} onClick={() => excluir(l.id)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {encerrando && (
            <div className="space-y-2 rounded-md border bg-muted/40 p-2.5">
              <p className="text-xs font-medium">
                Encerrar <span className="font-mono">{encerrando.linha.sigla}</span>
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-48 min-w-0 space-y-1">
                  <Label className="text-xs">Vale até a</Label>
                  <Select value={encerrando.ate} onValueChange={(v) => v && setEncerrando({ ...encerrando, ate: v })}>
                    <SelectTrigger className="w-full text-xs"><SelectValue placeholder="Versão" /></SelectTrigger>
                    <SelectContent>
                      {versoesOrdenadas
                        .filter((v) => v.numero >= encerrando.linha.versaoDesde)
                        .map((v) => (
                          <SelectItem key={v.id} value={String(v.numero)}>{rotuloVersao(v)}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" disabled={pending || !encerrando.ate} onClick={confirmarEncerramento}>Encerrar</Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEncerrando(null)}>Cancelar</Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                A partir da v{Number(encerrando.ate) + 1} a sigla deixa de ser reconhecida. Projetos nas versões anteriores
                não mudam.
              </p>
            </div>
          )}

          <div className="space-y-2 rounded-md border border-dashed p-2.5">
            <p className="text-xs font-medium">Nova sigla</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-24 space-y-1">
                <Label className="text-xs">Sigla</Label>
                <Input value={sigla} onChange={(e) => setSigla(e.target.value.toUpperCase())} className="font-mono" />
              </div>
              <label className="flex items-center gap-1.5 pb-1.5 text-xs">
                <Checkbox checked={oficial} onCheckedChange={(v) => setOficial(!!v)} /> oficial
              </label>
              <div className="w-48 min-w-0 space-y-1">
                <Label className="text-xs">A partir da</Label>
                <Select value={versaoDesde} onValueChange={(v) => setVersaoDesde(v ?? "")}>
                  <SelectTrigger className="w-full text-xs"><SelectValue placeholder="Versão" /></SelectTrigger>
                  <SelectContent>
                    {versoesOrdenadas.map((v) => (
                      <SelectItem key={v.id} value={String(v.numero)}>{rotuloVersao(v)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button size="icon" aria-label="Adicionar sigla" disabled={pending || !sigla.trim() || !versaoDesde} onClick={adicionar}>
                <Plus className="size-4" />
              </Button>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Checkbox checked={!semFim} onCheckedChange={(v) => setSemFim(!v)} /> tem versão final
            </label>
            {!semFim && (
              <div className="w-48 min-w-0 space-y-1">
                <Label className="text-xs">Até a versão</Label>
                <Select value={versaoAte} onValueChange={(v) => setVersaoAte(v ?? "")}>
                  <SelectTrigger className="w-full text-xs"><SelectValue placeholder="Versão" /></SelectTrigger>
                  <SelectContent>
                    {versoesOrdenadas.map((v) => (
                      <SelectItem key={v.id} value={String(v.numero)}>{rotuloVersao(v)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
