"use client";

import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Row = {
  id: string;
  modulo: string;
  acao: string;
  tipo: string;
  resultado: string;
  entidade: string | null;
  ip: string | null;
  createdAt: Date;
  user: { name: string; email: string } | null;
};

const RESULTADO_VARIANT: Record<string, string> = {
  sucesso: "bg-success/10 text-success border-success/40",
  falha: "bg-destructive/10 text-destructive border-destructive/40",
  bloqueado: "bg-warning/10 text-warning border-warning/40",
};

export function AuditoriaTabela({
  data,
  filtro,
}: {
  data: {
    rows: Row[];
    page: number;
    pages: number;
    modulos: string[];
  };
  filtro: { modulo?: string; resultado?: string; q?: string };
}) {
  const router = useRouter();

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(
      Object.entries(filtro).filter(([, v]) => v) as [string, string][],
    );
    if (value) params.set(key, value);
    else params.delete(key);
    // Trocar um filtro reinicia a paginação; navegar páginas não.
    if (key !== "page") params.delete("page");
    router.push(`/auditoria?${params.toString()}`);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar ação, entidade ou pessoa…"
          defaultValue={filtro.q ?? ""}
          className="max-w-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value || null);
          }}
        />
        <Select
          value={filtro.modulo ?? "todos"}
          onValueChange={(v) => setParam("modulo", v === "todos" ? null : v)}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Módulo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os módulos</SelectItem>
            {data.modulos.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filtro.resultado ?? "todos"}
          onValueChange={(v) => setParam("resultado", v === "todos" ? null : v)}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Resultado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="sucesso">Sucesso</SelectItem>
            <SelectItem value="falha">Falha</SelectItem>
            <SelectItem value="bloqueado">Bloqueado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-sm border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">Quando</TableHead>
              <TableHead>Quem</TableHead>
              <TableHead>Módulo</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Resultado</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Nenhum evento encontrado.
                </TableCell>
              </TableRow>
            ) : (
              data.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                    {format(new Date(r.createdAt), "dd/MM/yy HH:mm:ss", { locale: ptBR })}
                  </TableCell>
                  <TableCell className="text-sm">{r.user?.name ?? "—"}</TableCell>
                  <TableCell>
                    <span className="font-mono text-xs">{r.modulo}</span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.acao}
                    {r.entidade && (
                      <span className="ml-1 text-xs text-muted-foreground">({r.entidade})</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={`border ${RESULTADO_VARIANT[r.resultado] ?? ""}`}
                      variant="outline"
                    >
                      {r.resultado}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {r.ip ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {data.pages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={data.page <= 1}
            onClick={() => setParam("page", String(data.page - 1))}
          >
            Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            {data.page} / {data.pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={data.page >= data.pages}
            onClick={() => setParam("page", String(data.page + 1))}
          >
            Próxima
          </Button>
        </div>
      )}
    </div>
  );
}
