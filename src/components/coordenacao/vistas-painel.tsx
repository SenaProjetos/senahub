"use client";

import { useState, useTransition } from "react";
import { Check, ChevronDown, Eye, Pencil, Save, Trash2, X } from "lucide-react";
import type { ViewerEngine } from "@/modules/coordenacao/viewer/engine";
import type { VistaView } from "@/modules/coordenacao/queries";
import {
  excluirVistaCoordenacao,
  renomearVistaCoordenacao,
} from "@/modules/coordenacao/actions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AvatarUsuario } from "@/components/ui/avatar-usuario";
import { cn } from "@/lib/utils";

export function VistasPanel({
  engine,
  vistas,
  carregados,
  onToggleModelo,
  onAplicarCorte,
  currentUserId,
  podeAdministrarVistas,
  onSalvarAtual,
  onVistaRenomeada,
}: {
  engine: ViewerEngine | null;
  vistas: VistaView[];
  carregados: Set<string>;
  onToggleModelo: (uploadId: string, ligar: boolean) => void;
  onAplicarCorte: (config: { eixo: "x" | "y" | "z"; posicao: number; invertido: boolean } | null) => void;
  currentUserId: string;
  /** Perfis globais podem alterar vistas de outros autores, igual ao gate do servidor. */
  podeAdministrarVistas: boolean;
  /** Salva a câmera + modelos visíveis + corte atuais como uma nova vista nomeada. */
  onSalvarAtual: (nome: string) => Promise<boolean>;
  onVistaRenomeada: (id: string, nome: string) => void;
}) {
  const [aberto, setAberto] = useState(true);
  const [pending, start] = useTransition();
  const [salvarAberto, setSalvarAberto] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nomeEdicao, setNomeEdicao] = useState("");

  async function salvarAtual() {
    const nome = nomeNovo.trim();
    if (!nome) return;
    setSalvando(true);
    try {
      const ok = await onSalvarAtual(nome);
      if (ok) {
        setNomeNovo("");
        setSalvarAberto(false);
      }
    } finally {
      setSalvando(false);
    }
  }

  async function aplicarVista(vista: VistaView) {
    if (!engine) return;
    try {
      // Restaura câmera.
      await engine.restaurarCamera(vista.camera);
      // Só mexe no que precisa mudar: desliga quem não está na vista, liga quem falta.
      // Desligar+religar o mesmo modelo na mesma leva não funciona — onToggleModelo(id, true)
      // ainda vê `carregados` com o id presente (o desligar é assíncrono) e não faz nada.
      const desejados = new Set(vista.modelosVisiveis);
      for (const carregadoId of carregados) {
        if (!desejados.has(carregadoId)) onToggleModelo(carregadoId, false);
      }
      for (const modeloId of vista.modelosVisiveis) {
        if (!carregados.has(modeloId)) onToggleModelo(modeloId, true);
      }
      // Reaplicar corte.
      onAplicarCorte(vista.corte);
      toast.success(`Vista "${vista.nome}" aplicada.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao aplicar vista.");
    }
  }

  function podeAlterar(vista: VistaView) {
    return currentUserId === vista.autorId || podeAdministrarVistas;
  }

  function iniciarRenomeacao(vista: VistaView) {
    if (!podeAlterar(vista)) return;
    setEditandoId(vista.id);
    setNomeEdicao(vista.nome);
  }

  function renomear(vista: VistaView) {
    const nome = nomeEdicao.trim();
    if (!nome || nome === vista.nome) {
      setEditandoId(null);
      return;
    }
    start(async () => {
      const r = await renomearVistaCoordenacao({ id: vista.id, nome });
      if (r.ok) {
        onVistaRenomeada(vista.id, r.data.nome);
        setEditandoId(null);
        toast.success(`Vista renomeada para "${r.data.nome}".`);
      } else {
        toast.error(r.error || "Erro ao renomear vista.");
      }
    });
  }

  function excluir(vista: VistaView) {
    if (!podeAlterar(vista)) {
      toast.error("Só quem criou a vista (ou perfil global) pode excluí-la.");
      return;
    }
    start(async () => {
      const r = await excluirVistaCoordenacao({ id: vista.id });
      if (r.ok) {
        toast.success(`Vista "${vista.nome}" excluída.`);
      } else {
        toast.error(r.error || "Erro ao excluir vista.");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 pb-3">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={aberto}
        >
          <ChevronDown className={cn("size-4 shrink-0 transition-transform", !aberto && "-rotate-90")} />
          <CardTitle className="text-sm">
            Vistas salvas
            <span className="ml-2 font-normal text-muted-foreground">({vistas.length})</span>
          </CardTitle>
        </button>
        <Popover open={salvarAberto} onOpenChange={setSalvarAberto}>
          <PopoverTrigger
            render={
              <Button size="icon" variant="ghost" className="size-7 shrink-0" title="Salvar vista atual" disabled={!engine}>
                <Save className="size-4" />
              </Button>
            }
          />
          <PopoverContent align="end" className="w-64 space-y-2">
            <p className="text-sm font-medium">Salvar vista atual</p>
            <p className="text-xs text-muted-foreground">Guarda câmera, disciplinas visíveis e corte.</p>
            <Input
              placeholder="Nome da vista"
              value={nomeNovo}
              onChange={(e) => setNomeNovo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void salvarAtual()}
              maxLength={120}
              autoFocus
            />
            <Button size="sm" className="w-full" disabled={!nomeNovo.trim() || salvando} onClick={() => void salvarAtual()}>
              {salvando ? "Salvando…" : "Salvar"}
            </Button>
          </PopoverContent>
        </Popover>
      </CardHeader>
      {aberto && (
        <CardContent>
          {vistas.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">Nenhuma vista salva ainda.</p>
          ) : (
            <ScrollArea className="max-h-[40vh]">
              <div className="space-y-2 pr-3">
                {vistas.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between gap-2 rounded bg-muted/30 px-2.5 py-2 text-sm"
                  >
                    {editandoId === v.id ? (
                      <Input
                        value={nomeEdicao}
                        onChange={(evento) => setNomeEdicao(evento.target.value)}
                        onKeyDown={(evento) => {
                          if (evento.key === "Enter") renomear(v);
                          if (evento.key === "Escape") setEditandoId(null);
                        }}
                        maxLength={120}
                        className="h-8 min-w-0 flex-1 text-xs"
                        aria-label={`Novo nome da vista ${v.nome}`}
                        autoFocus
                      />
                    ) : (
                      <div className="flex min-w-0 flex-1 items-center gap-1.5">
                        <AvatarUsuario nome={v.autor} image={v.autorImage} size="sm" className="size-6 shrink-0" title={v.autor} />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{v.nome}</p>
                          <p className="truncate text-xs text-muted-foreground">{v.autor}</p>
                        </div>
                      </div>
                    )}
                    <div className="flex shrink-0 gap-1">
                      {editandoId === v.id ? (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            onClick={() => renomear(v)}
                            title="Confirmar novo nome"
                            disabled={pending || !nomeEdicao.trim()}
                          >
                            <Check className="size-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            onClick={() => setEditandoId(null)}
                            title="Cancelar"
                            disabled={pending}
                          >
                            <X className="size-3.5" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            onClick={() => aplicarVista(v)}
                            title="Aplicar vista"
                          >
                            <Eye className="size-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7"
                            onClick={() => iniciarRenomeacao(v)}
                            title="Renomear vista"
                            disabled={!podeAlterar(v) || pending}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-7 text-destructive hover:text-destructive"
                            onClick={() => excluir(v)}
                            title="Excluir vista"
                            disabled={!podeAlterar(v) || pending}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      )}
    </Card>
  );
}
