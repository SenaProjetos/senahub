"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { OpcaoVersao } from "@/modules/projetos/nomenclatura/catalogo/apresentacao";

const TODAS = "__todas__";

/**
 * Seletor de versão em LISTA (spec 2026-09-30, E2): as versões se acumulam com os anos, e uma fila
 * de botões encheria o topo. "Todas as versões" abre o cadastro inteiro — até a F3 da spec, é a tela
 * de Disciplinas de hoje.
 */
export function SeletorVersao({
  opcoes,
  atual,
  aba,
  mostrarTodas,
}: {
  opcoes: OpcaoVersao[];
  atual: number;
  aba: string;
  /** Quem não administra o catálogo de disciplinas não tem para onde ir em "Todas as versões". */
  mostrarTodas: boolean;
}) {
  const router = useRouter();
  const sufixo = aba === "disciplinas" ? "" : `?aba=${aba}`;
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span id="rotulo-versao" className="text-xs font-semibold text-muted-foreground">
        Versão
      </span>
      <Select
        value={String(atual)}
        onValueChange={(v) => {
          if (!v || v === String(atual)) return;
          router.push(v === TODAS ? "/configuracoes/disciplinas" : `/configuracoes/nomenclatura/${v}${sufixo}`);
        }}
      >
        <SelectTrigger className="w-[380px] max-w-full" aria-labelledby="rotulo-versao">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          {mostrarTodas && (
          <SelectItem value={TODAS}>
            <span className="flex flex-col">
              <span className="font-semibold">Todas as versões</span>
              <span className="text-xs text-muted-foreground">O cadastro: nome, ícone, categoria, ordem, arquivar</span>
            </span>
          </SelectItem>
          )}
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
