"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Save } from "lucide-react";
import {
  salvarEscalaRole,
  salvarEscalaUsuario,
  removerEscalaUsuario,
} from "@/modules/rh/escalas/actions";
import type { DiaGrade } from "@/modules/rh/escalas/queries";
import { ROLE_LABELS, type Role } from "@/lib/roles";
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

/** `salvarEscalaRole` recusa o perfil "cliente" (validado no schema) — refletido aqui no tipo. */
type RoleInterno = Exclude<Role, "cliente">;

type Usuario = { id: string; name: string; role: Role };

type Props = {
  roles: RoleInterno[];
  gradesPorRole: Record<string, DiaGrade[]>;
  usuarios: Usuario[];
  escalasPorUsuario: Record<string, { temOverride: boolean; dias: DiaGrade[] }>;
};

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
                  className="w-24 text-center font-mono text-xs"
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
                        className="w-20 text-center font-mono text-xs"
                      />
                      <span className="text-xs text-muted-foreground">–</span>
                      <Input
                        type="time"
                        value={desc.fim}
                        disabled={disabled || !d.ativo}
                        onChange={(e) => updateDescanso(idx, dIdx, "fim", e.target.value)}
                        className="w-20 text-center font-mono text-xs"
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
                  className="w-24 text-center font-mono text-xs"
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

function AbaPerfil({
  roles,
  gradesPorRole,
}: {
  roles: RoleInterno[];
  gradesPorRole: Record<string, DiaGrade[]>;
}) {
  const [role, setRole] = useState<RoleInterno>(roles[0]);
  const [dias, setDias] = useState<DiaGrade[]>(gradesPorRole[roles[0]] ?? []);
  const [pending, startTransition] = useTransition();

  function selecionar(r: RoleInterno) {
    setRole(r);
    setDias(gradesPorRole[r] ?? []);
  }

  function salvar() {
    startTransition(async () => {
      const res = await salvarEscalaRole({ role, dias });
      if (res.ok) toast.success(`Escala do perfil ${ROLE_LABELS[role]} salva.`);
      else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={role} onValueChange={(v) => v && selecionar(v as RoleInterno)}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roles.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          Escala padrão de todo colaborador deste perfil, sem escala personalizada.
        </p>
      </div>
      <GradeTable dias={dias} onChange={setDias} disabled={pending} />
      <Button onClick={salvar} disabled={pending} loading={pending}>
        <Save /> Salvar escala do perfil
      </Button>
    </div>
  );
}

function AbaUsuario({
  usuarios,
  escalasPorUsuario,
  gradesPorRole,
}: {
  usuarios: Usuario[];
  escalasPorUsuario: Record<string, { temOverride: boolean; dias: DiaGrade[] }>;
  gradesPorRole: Record<string, DiaGrade[]>;
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
    const base = gradesPorRole[usuarioAtual?.role ?? ""] ?? dias;
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
        toast.success("Escala personalizada removida — volta a usar a escala do perfil.");
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
                {u.name} · {ROLE_LABELS[u.role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {temOverride ? (
          <Badge variant="outline">Escala personalizada</Badge>
        ) : (
          <Badge variant="secondary">
            Usando escala do perfil{usuarioAtual ? ` (${ROLE_LABELS[usuarioAtual.role]})` : ""}
          </Badge>
        )}
      </div>

      {!temOverride ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="mb-3 text-sm text-muted-foreground">
            Este usuário segue a escala do perfil{usuarioAtual ? ` ${ROLE_LABELS[usuarioAtual.role]}` : ""}.
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

export function EscalasView({ roles, gradesPorRole, usuarios, escalasPorUsuario }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Escalas de trabalho</h1>
        <p className="text-sm text-muted-foreground">
          Jornada esperada por perfil, com opção de personalizar por usuário. Usada no banco de horas, no
          espelho de ponto e nos alertas de jornada.
        </p>
      </div>
      <Tabs defaultValue="perfil">
        <TabsList>
          <TabsTrigger value="perfil">Por perfil</TabsTrigger>
          <TabsTrigger value="usuario">Por usuário</TabsTrigger>
        </TabsList>
        <TabsContent value="perfil" className="pt-4">
          <AbaPerfil roles={roles} gradesPorRole={gradesPorRole} />
        </TabsContent>
        <TabsContent value="usuario" className="pt-4">
          <AbaUsuario
            usuarios={usuarios}
            escalasPorUsuario={escalasPorUsuario}
            gradesPorRole={gradesPorRole}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
