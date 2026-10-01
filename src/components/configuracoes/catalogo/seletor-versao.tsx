"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { OpcaoVersao } from "@/modules/projetos/nomenclatura/catalogo/apresentacao";

const TODAS = "__todas__";

/**
 * Seletor de versão em LISTA (spec 2026-09-30, E2): as versões se acumulam com os anos, e uma fila
 * de botões encheria o topo. "Todas as versões" abre o cadastro inteiro (lente `todas`).
 */
export function SeletorVersao({
  opcoes,
  atual,
  aba,
}: {
  opcoes: OpcaoVersao[];
  atual: number | "todas";
  aba: string;
}) {
  const router = useRouter();
  const sufixo = aba === "disciplinas" ? "" : `?aba=${aba}`;
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span id="rotulo-versao" className="text-xs font-semibold text-muted-foreground">
        Versão
      </span>
      <Select
        value={atual === "todas" ? TODAS : String(atual)}
        onValueChange={(v) => {
          if (!v || v === (atual === "todas" ? TODAS : String(atual))) return;
          router.push(`/configuracoes/nomenclatura/${v === TODAS ? "todas" : v}${sufixo}`);
        }}
      >
        <SelectTrigger className="w-[380px] max-w-full" aria-labelledby="rotulo-versao">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          <SelectItem value={TODAS}>
            <span className="flex flex-col">
              <span className="font-semibold">Todas as versões</span>
              <span className="text-xs text-muted-foreground">O cadastro: nome, ícone, categoria, ordem, arquivar</span>
            </span>
          </SelectItem>
          {opcoes.map((o) => (
            <SelectItem key={o.numero} value={String(o.numero)}>
              <span className="flex items-center gap-2">
                <span>
                  <strong>v{o.numero}</strong> — {o.nome}
                </span>
                {o.rascunho && <Badge variant="outline">rascunho</Badge>}
                {o.vigente && <Badge variant="secondary">vigente</Badge>}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
