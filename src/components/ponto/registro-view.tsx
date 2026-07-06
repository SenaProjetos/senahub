"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Play,
  Square,
  Coffee,
  Utensils,
  Repeat,
  CloudOff,
  Info,
  MapPin,
  ChevronDown,
  Check,
  AlertTriangle,
} from "lucide-react";
import {
  registrarBatida,
  trocarProjeto,
  darCienciaAjuste,
  contestarAjuste,
} from "@/modules/ponto/actions";
import {
  contarPendentes,
  enfileirarBatida,
  enfileirarTroca,
  estaOffline,
  sincronizar,
  type TipoBatida,
  type Geo,
} from "@/lib/ponto-offline";
import { transicoesPermitidas, type EstadoJornada } from "@/modules/ponto/engine";
import { fmtHoras } from "@/modules/ponto/format";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NONE = "__none";

type Projeto = { id: string; codigo: string; nome: string };
type LinhaTimeline = {
  key: string;
  kind: TipoBatida | "troca";
  horario: string | Date;
  editada: boolean;
  projeto: { codigo: string; nome: string } | null;
  adicionadoMin: number | null;
  totalDiaProjMin: number | null;
  historicoProjMin: number | null;
};
export type EstadoDiaProp = {
  estado: EstadoJornada;
  trabalhadoMin: number;
  descansoMin: number;
  incompleto: boolean;
  aberturaInicio: string | Date | null;
  projetoAtivo: Projeto | null;
  timeline: LinhaTimeline[];
  agora: string | Date;
};

export type AjustePendenteProp = {
  id: string;
  dia: string;
  editorNome: string;
  justificativa: string;
};

const ESTADO_LABEL: Record<EstadoJornada, string> = {
  fora: "Fora da jornada",
  trabalhando: "Trabalhando",
  descansando: "Em descanso",
};

const TIPO_LABEL: Record<TipoBatida, string> = {
  entrada: "Entrada",
  inicio_descanso: "Início do descanso",
  fim_descanso: "Fim do descanso",
  saida: "Saída",
};

const BOTAO: Record<TipoBatida, { label: string; icon: typeof Play; variant?: "default" | "outline" | "destructive" | "secondary" }> = {
  entrada: { label: "Iniciar jornada", icon: Play, variant: "default" },
  inicio_descanso: { label: "Iniciar descanso", icon: Coffee, variant: "secondary" },
  fim_descanso: { label: "Voltar do descanso", icon: Utensils, variant: "default" },
  saida: { label: "Encerrar jornada", icon: Square, variant: "destructive" },
};

const SUCESSO: Record<TipoBatida, string> = {
  entrada: "Jornada iniciada.",
  inicio_descanso: "Descanso iniciado.",
  fim_descanso: "De volta ao trabalho.",
  saida: "Jornada encerrada.",
};

function hhmm(d: string | Date): string {
  return new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Captura geolocalização opcional (S6): timeout curto, falha silenciosa. */
async function capturarGeo(): Promise<Geo> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise<Geo>((resolve) => {
    const done = (g: Geo) => resolve(g);
    const t = setTimeout(() => done(null), 5000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(t);
        done({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
      },
      () => {
        clearTimeout(t);
        done(null);
      },
      { timeout: 5000, maximumAge: 60_000 },
    );
  });
}

/** Cronômetro do trabalho do dia, ao vivo quando trabalhando. */
function useTrabalhadoVivo(estadoDia: EstadoDiaProp): number {
  const baseMs = estadoDia.trabalhadoMin * 60_000;
  const ancora = new Date(estadoDia.agora).getTime();
  const [ms, setMs] = useState(baseMs);
  useEffect(() => {
    if (estadoDia.estado !== "trabalhando") {
      setMs(baseMs);
      return;
    }
    const tick = () => setMs(baseMs + (Date.now() - ancora));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [estadoDia.estado, baseMs, ancora]);
  return ms;
}

function Relogio({ ms, ativo }: { ms: number; ativo: boolean }) {
  const tot = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(tot / 3600);
  const m = Math.floor((tot % 3600) / 60);
  const s = tot % 60;
  return (
    <span className={`font-mono text-4xl font-bold tabular-nums ${ativo ? "" : "text-muted-foreground"}`}>
      {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}

function AvisoLegal() {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-muted/40 text-xs">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-muted-foreground"
      >
        <Info className="size-3.5 shrink-0" />
        <span className="flex-1">Este é um registro informativo de jornada.</span>
        <ChevronDown className={`size-3.5 transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto && (
        <p className="px-3 pb-3 pt-0 leading-relaxed text-muted-foreground">
          O registro de ponto aqui tem finalidade de organização interna e cálculo de banco de horas. Não
          substitui o Registro Eletrônico de Ponto (REP) exigido pela legislação trabalhista quando aplicável.
          Ajustes podem ser feitos com justificativa e ficam auditados.
        </p>
      )}
    </div>
  );
}

function dataCurta(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/** Banner de ciência: ajuste feito por um gestor no ponto do usuário. */
function CienciaBanner({ ajuste }: { ajuste: AjustePendenteProp }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [motivo, setMotivo] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  function ciente() {
    start(async () => {
      const r = await darCienciaAjuste({ ajusteId: ajuste.id });
      if (r.ok) {
        toast.success("Ciência registrada.");
        router.refresh();
      } else toast.error(r.error);
    });
  }

  function contestar() {
    if (motivo.trim().length < 5) {
      toast.error("Descreva o motivo (mín. 5 caracteres).");
      return;
    }
    start(async () => {
      const r = await contestarAjuste({ ajusteId: ajuste.id, motivo });
      if (r.ok) {
        toast.success("Contestação enviada.");
        setDialogOpen(false);
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
        <div>
          <p className="font-medium">
            Seu ponto de {dataCurta(ajuste.dia)} foi ajustado por {ajuste.editorNome}.
          </p>
          <p className="text-xs text-muted-foreground">Motivo: {ajuste.justificativa}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={ciente} disabled={pending}>
          <Check className="size-4" /> Estou ciente
        </Button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button size="sm" variant="outline" disabled={pending} />}>
            Contestar
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Contestar ajuste</DialogTitle>
              <DialogDescription>
                Explique por que o ajuste de {dataCurta(ajuste.dia)} está incorreto. O gestor será avisado.
              </DialogDescription>
            </DialogHeader>
            <Input
              placeholder="Motivo da contestação"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
            <DialogFooter>
              <DialogClose render={<Button variant="outline" disabled={pending} />}>Cancelar</DialogClose>
              <Button variant="destructive" onClick={contestar} disabled={pending} loading={pending}>
                Enviar contestação
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

export function RegistroPonto({
  estadoDia,
  projetos,
  pendencias,
}: {
  estadoDia: EstadoDiaProp;
  projetos: Projeto[];
  pendencias: AjustePendenteProp[];
}) {
  const router = useRouter();
  const [projetoId, setProjetoId] = useState(estadoDia.projetoAtivo?.id ?? NONE);
  const [busy, setBusy] = useState(false);
  const [pendentes, setPendentes] = useState(0);

  const trabalhadoMs = useTrabalhadoVivo(estadoDia);
  const permitidas = transicoesPermitidas(estadoDia.estado);
  const proj = (id: string) => (id === NONE ? undefined : id);

  async function bater(tipo: TipoBatida) {
    const geo = await capturarGeo();
    const payload = { projetoId: proj(projetoId), geo };
    if (estaOffline()) {
      enfileirarBatida(tipo, payload);
      setPendentes(contarPendentes());
      toast.info("Sem conexão — batida salva e será enviada ao reconectar.");
      return;
    }
    setBusy(true);
    try {
      const r = await registrarBatida({ tipo, projetoId: proj(projetoId), geo });
      if (r.ok) {
        toast.success(SUCESSO[tipo]);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    } catch {
      enfileirarBatida(tipo, payload);
      setPendentes(contarPendentes());
      toast.info("Sem conexão — batida salva e será enviada ao reconectar.");
    } finally {
      setBusy(false);
    }
  }

  async function trocar() {
    const payload = { projetoId: proj(projetoId) };
    if (estaOffline()) {
      enfileirarTroca(payload);
      setPendentes(contarPendentes());
      toast.info("Sem conexão — troca salva e será enviada ao reconectar.");
      return;
    }
    setBusy(true);
    try {
      const r = await trocarProjeto({ projetoId: proj(projetoId) });
      if (r.ok) {
        toast.success("Projeto trocado.");
        router.refresh();
      } else {
        toast.error(r.error);
      }
    } catch {
      enfileirarTroca(payload);
      setPendentes(contarPendentes());
      toast.info("Sem conexão — troca salva e será enviada ao reconectar.");
    } finally {
      setBusy(false);
    }
  }

  const sincronizarFila = useCallback(async () => {
    if (contarPendentes() === 0) return;
    const { sincronizados, falhas } = await sincronizar({ registrarBatida, trocar: trocarProjeto });
    setPendentes(contarPendentes());
    if (sincronizados > 0) {
      toast.success(`${sincronizados} batida(s) sincronizada(s).`);
      router.refresh();
    }
    for (const f of falhas) toast.error(`Batida offline rejeitada: ${f}`);
  }, [router]);

  useEffect(() => {
    setPendentes(contarPendentes());
    void sincronizarFila();
    const onOnline = () => void sincronizarFila();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [sincronizarFila]);

  const podeEscolherProjeto = estadoDia.estado === "fora" || estadoDia.estado === "descansando";

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 py-6">
        <AvisoLegal />

        {pendencias.length > 0 && (
          <div className="flex flex-col gap-2">
            {pendencias.map((a) => (
              <CienciaBanner key={a.id} ajuste={a} />
            ))}
          </div>
        )}

        <div className="flex flex-col items-center gap-2">
          <Relogio ms={trabalhadoMs} ativo={estadoDia.estado === "trabalhando"} />
          <div className="flex items-center gap-2 text-sm">
            <span
              className={`size-2 rounded-full ${
                estadoDia.estado === "trabalhando"
                  ? "animate-pulse bg-success"
                  : estadoDia.estado === "descansando"
                    ? "bg-warning"
                    : "bg-muted-foreground/40"
              }`}
              aria-hidden
            />
            <span className="text-muted-foreground">{ESTADO_LABEL[estadoDia.estado]}</span>
            {estadoDia.projetoAtivo && estadoDia.estado === "trabalhando" && (
              <span className="text-muted-foreground">
                · {formatarCodigo(estadoDia.projetoAtivo.codigo)} {estadoDia.projetoAtivo.nome}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Trabalhado hoje: {fmtHoras(estadoDia.trabalhadoMin)}
            {estadoDia.descansoMin > 0 ? ` · descanso ${fmtHoras(estadoDia.descansoMin)}` : ""}
          </p>
        </div>

        {/* Seletor de projeto — para anexar à próxima entrada / volta de descanso, ou trocar durante o trabalho. */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Select value={projetoId} onValueChange={(v) => setProjetoId(v ?? NONE)}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Projeto (opcional)…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sem projeto</SelectItem>
              {projetos.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {formatarCodigo(p.codigo)} · {p.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {estadoDia.estado === "trabalhando" && (
            <Button variant="outline" disabled={busy} onClick={trocar}>
              <Repeat className="size-4" /> Trocar projeto
            </Button>
          )}
        </div>

        {/* Botões da máquina de estados. */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {permitidas.map((tipo) => {
            const b = BOTAO[tipo];
            const Icon = b.icon;
            return (
              <Button key={tipo} variant={b.variant} disabled={busy} onClick={() => bater(tipo)}>
                <Icon className="size-4" /> {b.label}
              </Button>
            );
          })}
        </div>

        {!podeEscolherProjeto && estadoDia.estado === "descansando" && (
          <p className="text-center text-xs text-muted-foreground">
            Em descanso — o tempo de descanso não conta como trabalhado.
          </p>
        )}

        {pendentes > 0 && (
          <button
            type="button"
            onClick={() => void sincronizarFila()}
            className="mx-auto inline-flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
            title="Toque para tentar sincronizar agora"
          >
            <CloudOff className="size-4" />
            {pendentes} batida(s) pendente(s) offline · toque para sincronizar
          </button>
        )}

        {/* Timeline do dia: batidas + trocas de projeto, com tempo por projeto. */}
        {estadoDia.timeline.length > 0 && (
          <div className="rounded-lg border">
            <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
              Batidas de hoje
            </div>
            <ul className="divide-y text-sm">
              {estadoDia.timeline.map((item) => {
                const isTroca = item.kind === "troca";
                const label = isTroca ? "Troca de projeto" : TIPO_LABEL[item.kind as TipoBatida];
                const abertura = item.adicionadoMin != null; // entrada/fim_descanso/troca
                return (
                  <li
                    key={item.key}
                    className={`flex gap-3 px-3 py-2 ${isTroca ? "text-muted-foreground" : ""}`}
                  >
                    <span className="pt-0.5 font-mono tabular-nums">{hhmm(item.horario)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {isTroca && <Repeat className="size-3.5 shrink-0" />}
                        <span>{label}</span>
                        {abertura && (
                          <span className="truncate text-foreground">
                            ·{" "}
                            {item.projeto
                              ? `${formatarCodigo(item.projeto.codigo)} ${item.projeto.nome}`
                              : "Sem projeto"}
                          </span>
                        )}
                        {item.editada && (
                          <Badge variant="secondary" className="ml-1">
                            editada
                          </Badge>
                        )}
                      </div>
                      {abertura && (
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                          <span className="font-medium text-success">+{fmtHoras(item.adicionadoMin!)}</span>
                          <span>neste trecho</span>
                          <span aria-hidden>·</span>
                          <span>{fmtHoras(item.totalDiaProjMin!)} no dia</span>
                          {item.historicoProjMin != null && (
                            <>
                              <span aria-hidden>·</span>
                              <span>{fmtHoras(item.historicoProjMin)} acumulado</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {estadoDia.incompleto && (
              <p className="flex items-center gap-1.5 border-t px-3 py-2 text-xs text-warning">
                <MapPin className="size-3.5" /> Jornada sem encerramento — ajuste depois se necessário.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
