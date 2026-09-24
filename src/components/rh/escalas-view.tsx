"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Save } from "lucide-react";
import {
  salvarEscalaContratacao,
  salvarEscalaUsuario,
  removerEscalaUsuario,
} from "@/modules/rh/escalas/actions";
import type { DiaGrade } from "@/modules/rh/escalas/queries";
import { CONTRATACOES_COM_ESCALA, type ContratacaoComEscala } from "@/modules/rh/escalas/schemas";
import { CONTRATACAO_LABELS } from "@/modules/usuarios/vinculo/labels";
import type { Contratacao } from "@/generated/prisma/enums";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

type Usuario = { id: string; name: string; contratacao: Contratacao | null };

type Props = {
  gradesPorContratacao: Record<string, DiaGrade[]>;
  usuarios: Usuario[];
  escalasPorUsuario: Record<string, { temOverride: boolean; dias: DiaGrade[] }>;
};

function rotuloContratacao(c: Contratacao | null): string {
  return c ? CONTRATACAO_LABELS[c] : "sem contratação";
}

function temEscalaPadrao(c: Contratacao | null): boolean {
  return (CONTRATACOES_COM_ESCALA as readonly string[]).includes(c ?? "");
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Espelha o cálculo do hub antigo: horas = (saída-entrada) - Σ descansos. Só informativo. */
function calcularHoras(dia: DiaGrade): number {
  if (!dia.ativo || !dia.entrada || !dia.saida) return 0;
  const total = toMin(dia.saida) - toMin(dia.entrada);
  const descanso = dia.descansos.reduce((acc, d) => {
    if (!d.inicio || !d.fim) return acc;
    return acc + Math.max(0, toMin(d.fim) - toMin(d.inicio));
  }, 0);
  return Math.max(0, Math.round(((total - descanso) / 60) * 100) / 100);
}

function GradeTable({
  dias,
  onChange,
  disabled,
}: {
  dias: DiaGrade[];
  onChange: (dias: DiaGrade[]) => void;
  disabled?: boolean;
}) {
  function atualizar(idx: number, patch: Partial<DiaGrade>) {
    const next = [...dias];
    const dia = { ...next[idx], ...patch };
    dia.horasDia = calcularHoras(dia);
    next[idx] = dia;
    onChange(next);
  }

  function addDescanso(idx: number) {
    atualizar(idx, { descansos: [...dias[idx].descansos, { inicio: "12:00", fim: "13:00" }] });
  }
  function removeDescanso(idx: number, dIdx: number) {
    atualizar(idx, { descansos: dias[idx].descansos.filter((_, i) => i !== dIdx) });
  }
  function updateDescanso(idx: number, dIdx: number, campo: "inicio" | "fim", valor: string) {
    const next = dias[idx].descansos.map((d, i) => (i === dIdx ? { ...d, [campo]: valor } : d));
    atualizar(idx, { descansos: next });
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">Dia</TableHead>
            <TableHead className="text-center">Ativo</TableHead>
            <TableHead className="text-center">Entrada</TableHead>
            <TableHead>Descansos</TableHead>
            <TableHead className="text-center">Saída</TableHead>
            <TableHead className="text-center">Horas/dia</TableHead>
            <TableHead className="text-center">Tolerância (min)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dias.map((d, idx) => (
            <TableRow key={d.diaSemana} className={!d.ativo ? "opacity-50" : undefined}>
              <TableCell className="font-medium">{DIAS[d.diaSemana]}</TableCell>
              <TableCell className="text-center">
                <Switch
                  checked={d.ativo}
                  onCheckedChange={(c) => atualizar(idx, { ativo: Boolean(c) })}
                  disabled={disabled}
                />
              </TableCell>
              <TableCell className="text-center">
                <Input
                  type="time"
                  value={d.entrada ?? ""}
                  disabled={disabled || !d.ativo}
                  onChange={(e) => atualizar(idx, { entrada: e.target.value || null })}
                  className="w-28 px-2 text-center font-mono text-xs"
                />
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  {d.descansos.map((desc, dIdx) => (
                    <div key={dIdx} className="flex items-center gap-1">
                      <Input
                        type="time"
                        value={desc.inicio}
                        disabled={disabled || !d.ativo}
                        onChange={(e) => updateDescanso(idx, dIdx, "inicio", e.target.value)}
                        className="w-28 px-2 text-center font-mono text-xs"
                      />
                      <span className="text-xs text-muted-foreground">–</span>
                      <Input
                        type="time"
                        value={desc.fim}
                        disabled={disabled || !d.ativo}
                        onChange={(e) => updateDescanso(idx, dIdx, "fim", e.target.value)}
                        className="w-28 px-2 text-center font-mono text-xs"
                      />
                      {!disabled && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => removeDescanso(idx, dIdx)}
                          aria-label="Remover descanso"
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  ))}
                  {!disabled && d.ativo && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="w-fit justify-start"
                      onClick={() => addDescanso(idx)}
                    >
                      <Plus /> descanso
                    </Button>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-center">
                <Input
                  type="time"
                  value={d.saida ?? ""}
                  disabled={disabled || !d.ativo}
                  onChange={(e) => atualizar(idx, { saida: e.target.value || null })}
                  className="w-28 px-2 text-center font-mono text-xs"
                />
              </TableCell>
              <TableCell className="text-center font-mono text-sm text-muted-foreground">
                {d.ativo ? `${d.horasDia.toFixed(1)}h` : "—"}
              </TableCell>
              <TableCell className="text-center">
                <Input
                  type="number"
                  min={0}
                  max={240}
                  value={d.toleranciaMin}
                  disabled={disabled || !d.ativo}
                  onChange={(e) => atualizar(idx, { toleranciaMin: Number(e.target.value) || 0 })}
                  className="w-16 text-center text-xs"
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AbaContratacao({ gradesPorContratacao }: { gradesPorContratacao: Record<string, DiaGrade[]> }) {
  const [contratacao, setContratacao] = useState<ContratacaoComEscala>("clt");
  const [dias, setDias] = useState<DiaGrade[]>(gradesPorContratacao.clt ?? []);
  const [pending, startTransition] = useTransition();

  function selecionar(c: ContratacaoComEscala) {
    setContratacao(c);
    setDias(gradesPorContratacao[c] ?? []);
  }

  function salvar() {
    startTransition(async () => {
      const res = await salvarEscalaContratacao({ contratacao, dias });
      if (res.ok) toast.success(`Escala da contratação ${CONTRATACAO_LABELS[contratacao]} salva.`);
      else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={contratacao} onValueChange={(v) => v && selecionar(v as ContratacaoComEscala)}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONTRATACOES_COM_ESCALA.map((c) => (
              <SelectItem key={c} value={c}>
                {CONTRATACAO_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          Escala padrão de todo colaborador com esta contratação, sem escala personalizada.
        </p>
      </div>
      {contratacao === "estagio" && (
        <p className="text-sm text-muted-foreground">
          Estágio tem no máximo 6h por dia e 30h por semana (Lei 11.788). Grade acima disso não é salva.
        </p>
      )}
      <GradeTable dias={dias} onChange={setDias} disabled={pending} />
      <Button onClick={salvar} disabled={pending} loading={pending}>
        <Save /> Salvar escala da contratação
      </Button>
      <p className="text-xs text-muted-foreground">
        PJ, autônomo (RPA) e sócio (pró-labore) não têm jornada controlada, por isso não têm escala padrão
        aqui. Se precisar de uma grade para alguém nessas contratações, personalize por usuário.
      </p>
    </div>
  );
}

function AbaUsuario({
  usuarios,
  escalasPorUsuario,
  gradesPorContratacao,
}: {
  usuarios: Usuario[];
  escalasPorUsuario: Record<string, { temOverride: boolean; dias: DiaGrade[] }>;
  gradesPorContratacao: Record<string, DiaGrade[]>;
}) {
  const primeiro = usuarios[0];
  const [userId, setUserId] = useState(primeiro?.id ?? "");
  const [temOverride, setTemOverride] = useState(escalasPorUsuario[primeiro?.id ?? ""]?.temOverride ?? false);
  const [dias, setDias] = useState<DiaGrade[]>(escalasPorUsuario[primeiro?.id ?? ""]?.dias ?? []);
  const [pending, startTransition] = useTransition();

  const usuarioAtual = usuarios.find((u) => u.id === userId);

  function selecionar(id: string) {
    setUserId(id);
    const e = escalasPorUsuario[id];
    setTemOverride(e?.temOverride ?? false);
    setDias(e?.dias ?? []);
  }

  function ativarPersonalizada() {
    const base = gradesPorContratacao[usuarioAtual?.contratacao ?? ""] ?? dias;
    setDias(base.map((d) => ({ ...d })));
    setTemOverride(true);
  }

  function salvar() {
    startTransition(async () => {
      const res = await salvarEscalaUsuario({ userId, dias });
      if (res.ok) toast.success("Escala personalizada salva.");
      else toast.error(res.error);
    });
  }

  function remover() {
    startTransition(async () => {
      const res = await removerEscalaUsuario({ userId });
      if (res.ok) {
        toast.success("Escala personalizada removida — volta a usar a escala da contratação.");
        setTemOverride(false);
      } else toast.error(res.error);
    });
  }

  if (!primeiro) {
    return <p className="text-sm text-muted-foreground">Nenhum colaborador interno encontrado.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={userId} onValueChange={(v) => v && selecionar(v)}>
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {usuarios.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name} · {rotuloContratacao(u.contratacao)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {temOverride ? (
          <Badge variant="outline">Escala personalizada</Badge>
        ) : (
          <Badge variant="secondary">
            Usando escala da contratação{usuarioAtual ? ` (${rotuloContratacao(usuarioAtual.contratacao)})` : ""}
          </Badge>
        )}
      </div>

      {!temOverride ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="mb-3 text-sm text-muted-foreground">
            {usuarioAtual && !temEscalaPadrao(usuarioAtual.contratacao)
              ? "Sem jornada controlada pela contratação — os cálculos usam 8h nos dias úteis."
              : `Este usuário segue a escala da contratação ${rotuloContratacao(usuarioAtual?.contratacao ?? null)}.`}
          </p>
          <Button variant="outline" onClick={ativarPersonalizada}>
            Personalizar escala deste usuário
          </Button>
        </div>
      ) : (
        <>
          <GradeTable dias={dias} onChange={setDias} disabled={pending} />
          <div className="flex gap-2">
            <Button onClick={salvar} disabled={pending} loading={pending}>
              <Save /> Salvar escala personalizada
            </Button>
            <Button variant="outline" onClick={remover} disabled={pending}>
              Remover personalização
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export function EscalasView({ gradesPorContratacao, usuarios, escalasPorUsuario }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Escalas de trabalho</h1>
        <p className="text-sm text-muted-foreground">
          Jornada esperada por contratação, com opção de personalizar por usuário. Usada no banco de horas, no
          espelho de ponto e nos alertas de jornada.
        </p>
      </div>
      <Tabs defaultValue="contratacao">
        <TabsList>
          <TabsTrigger value="contratacao">Por contratação</TabsTrigger>
          <TabsTrigger value="usuario">Por usuário</TabsTrigger>
        </TabsList>
        <TabsContent value="contratacao" className="pt-4">
          <AbaContratacao gradesPorContratacao={gradesPorContratacao} />
        </TabsContent>
        <TabsContent value="usuario" className="pt-4">
          <AbaUsuario
            usuarios={usuarios}
            escalasPorUsuario={escalasPorUsuario}
            gradesPorContratacao={gradesPorContratacao}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
