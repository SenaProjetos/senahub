"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Tags, EyeOff, Eye, Layers } from "lucide-react";
import {
  listarSubdisciplinasAction,
  criarSubdisciplina,
  editarSubdisciplina,
} from "@/modules/projetos/subdisciplinas/actions";
import { SiglasVersaoDialog, type AlvoSiglaDialog, type VersaoOpcao } from "@/components/configuracoes/siglas-versao-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { rotuloFaixa, versaoMaisNova } from "@/modules/uploads/nomenclatura/siglas-versao";
import {
  ValidadeVersaoCampos,
  faixaDoForm,
  faixaParaForm,
  mostrarValidade,
  rotuloVersaoOpcao,
  type FaixaForm,
} from "@/components/configuracoes/validade-versao-campos";

type Sub = { id: string; nome: string; ativo: boolean; siglaAtual: string | null; versaoDesde: number; versaoAte: number | null };

/**
 * Sub-disciplinas de UM card + acesso às siglas por versão (D7/D11). Aberto a partir da linha
 * do card em Configurações → Disciplinas.
 */
export function SubdisciplinasDialog({
  aberto,
  onFechar,
  card,
  versoes,
}: {
  aberto: boolean;
  onFechar: () => void;
  card: { id: string; nome: string } | null;
  versoes: VersaoOpcao[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const [nome, setNome] = useState("");
  /** "A partir da" da sub nova — abre na versão mais nova, como as siglas. */
  const [desde, setDesde] = useState("1");
  const ordenadas = [...versoes].sort((a, b) => a.numero - b.numero);
  const [editando, setEditando] = useState<Sub | null>(null);
  const [siglasAlvo, setSiglasAlvo] = useState<{ alvo: AlvoSiglaDialog; rotulo: string } | null>(null);

  useEffect(() => {
    if (!aberto || !card) return;
    listarSubdisciplinasAction({ disciplinaCatalogoId: card.id }).then((r) => setSubs(r.ok ? r.data : []));
    setNome("");
    setDesde(String(versaoMaisNova(versoes) ?? 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, card]);

  function recarregar() {
    if (!card) return;
    listarSubdisciplinasAction({ disciplinaCatalogoId: card.id }).then((r) => r.ok && setSubs(r.data));
    router.refresh();
  }

  function adicionar() {
    if (!card || !nome.trim()) return;
    start(async () => {
      const r = await criarSubdisciplina({ disciplinaCatalogoId: card.id, nome: nome.trim(), versaoDesde: Number(desde) || 1 });
      if (r.ok) {
        toast.success("Sub-disciplina criada.");
        setNome("");
        recarregar();
      } else toast.error(r.error);
    });
  }

  function alternarAtivo(sub: Sub) {
    start(async () => {
      const r = await editarSubdisciplina({ id: sub.id, nome: sub.nome, ativo: !sub.ativo });
      if (r.ok) recarregar();
      else toast.error(r.error);
    });
  }

  return (
    <>
      <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sub-disciplinas de {card?.nome}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Etiqueta de documento dentro deste card (ex.: Água Fria em Hidrossanitário) — sem projetista, prazo nem
              pagamento próprios. Reconhecida só pelo nome do arquivo.
            </p>
            <div className="flex items-center justify-between rounded-sm border p-2">
              <span className="text-sm font-medium">Siglas gerais do card</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => card && setSiglasAlvo({ alvo: { tipo: "disciplina", id: card.id }, rotulo: card.nome })}
              >
                <Tags className="size-3.5" /> Siglas por versão
              </Button>
            </div>

            {!subs || subs.length === 0 ? (
              <EmptyState icon={Layers} title="Nenhuma sub-disciplina" />
            ) : (
              <ul className="divide-y">
                {subs.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 py-1.5 text-sm">
                    {s.siglaAtual && <Badge variant="outline" className="shrink-0 font-mono">{s.siglaAtual}</Badge>}
                    <span className={`min-w-0 flex-1 truncate ${s.ativo ? "" : "text-muted-foreground line-through"}`}>{s.nome}</span>
                    {rotuloFaixa(s) && (
                      <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">{rotuloFaixa(s)}</Badge>
                    )}
                    <Button size="icon" variant="ghost" className="size-7" aria-label={s.ativo ? "Desativar" : "Ativar"} disabled={pending} onClick={() => alternarAtivo(s)}>
                      {s.ativo ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5 text-muted-foreground" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="size-7" aria-label={`Editar ${s.nome}`} title="Nome e versões" onClick={() => setEditando(s)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="size-7" aria-label={`Siglas de ${s.nome}`} onClick={() => setSiglasAlvo({ alvo: { tipo: "subdisciplina", id: s.id }, rotulo: `${s.nome} (sub de ${card?.nome})` })}>
                      <Tags className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-end gap-2 border-t pt-3">
              <div className="min-w-40 flex-1 space-y-1">
                <Label className="text-xs">Nova sub-disciplina</Label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Água Fria" />
              </div>
              {ordenadas.length > 1 && (
                <div className="w-40 space-y-1">
                  <Label className="text-xs">A partir da</Label>
                  <Select value={desde} onValueChange={(v) => setDesde(v ?? "1")}>
                    <SelectTrigger className="w-full text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ordenadas.map((v) => (
                        <SelectItem key={v.id} value={String(v.numero)}>{rotuloVersaoOpcao(v)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button size="icon" aria-label="Adicionar sub-disciplina" disabled={pending || !nome.trim()} onClick={adicionar}>
                <Plus className="size-4" />
              </Button>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={onFechar}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditarSubDialog sub={editando} versoes={versoes} onClose={() => { setEditando(null); recarregar(); }} />

      <SiglasVersaoDialog
        aberto={siglasAlvo !== null}
        onFechar={() => setSiglasAlvo(null)}
        alvo={siglasAlvo?.alvo ?? null}
        rotuloAlvo={siglasAlvo?.rotulo ?? ""}
        versoes={versoes}
      />
    </>
  );
}

function EditarSubDialog({ sub, versoes, onClose }: { sub: Sub | null; versoes: VersaoOpcao[]; onClose: () => void }) {
  const [pending, start] = useTransition();
  const [nome, setNome] = useState("");
  const [faixa, setFaixa] = useState<FaixaForm>({ desde: "1", ate: "" });
  const [lastId, setLastId] = useState<string | null>(null);

  if (sub && sub.id !== lastId) {
    setLastId(sub.id);
    setNome(sub.nome);
    setFaixa(faixaParaForm(sub));
  }

  function salvar() {
    if (!sub || !nome.trim()) return;
    start(async () => {
      const r = await editarSubdisciplina({ id: sub.id, nome: nome.trim(), ativo: sub.ativo, ...faixaDoForm(faixa) });
      if (r.ok) {
        toast.success("Sub-disciplina atualizada.");
        onClose();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open={!!sub} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Editar sub-disciplina</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          {mostrarValidade(versoes, faixa) && <ValidadeVersaoCampos versoes={versoes} valor={faixa} onChange={setFaixa} />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={pending}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
