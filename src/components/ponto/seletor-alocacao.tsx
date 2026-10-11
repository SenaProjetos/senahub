"use client";

import {
  ALOCACAO_REUNIAO_EXTERNA,
  ALOCACAO_REUNIAO_INTERNA,
  ALOCACAO_SEM_PROJETO,
  reuniaoDaSelecao,
  selecaoDeReuniao,
  type ProjetoAlocacao,
} from "@/modules/ponto/alocacao";
import { formatarCodigo } from "@/modules/projetos/numbering";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SEM_PROJETO_DA_REUNIAO = "__sem_projeto_da_reuniao";

/**
 * Seletor de alocação do ponto (computador): "Sem projeto", as duas reuniões e os projetos da
 * pessoa. Escolhendo uma reunião aparece um segundo campo, "Projeto da reunião (opcional)": a
 * reunião ligada a projeto entra no custo dele como reunião (R2 do rateio, decisão 10). O valor
 * que sobe é o mesmo das ações: `__reuniao_externa:<projetoId>`, ou só `__reuniao_externa`.
 *
 * Devolve um fragmento: o segundo campo é irmão do primeiro, para o pai decidir a largura e a
 * quebra de linha (cada tela tem a sua).
 */
export function SeletorAlocacao({
  value,
  onChange,
  projetos,
  triggerClassName,
  size,
  ariaLabel = "Alocação da jornada",
  placeholder = "Alocação da jornada…",
  disabled,
}: {
  value: string;
  onChange: (selecao: string) => void;
  projetos: readonly ProjetoAlocacao[];
  triggerClassName?: string;
  size?: "sm" | "default";
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const reuniao = reuniaoDaSelecao(value);
  return (
    <>
      <Select value={reuniao?.base ?? value} onValueChange={(v) => onChange(selecaoAoTrocarTipo(v ?? ALOCACAO_SEM_PROJETO, reuniao?.projetoId ?? ""))} disabled={disabled}>
        <SelectTrigger size={size} className={triggerClassName} aria-label={ariaLabel}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALOCACAO_SEM_PROJETO}>Sem projeto</SelectItem>
          <SelectItem value={ALOCACAO_REUNIAO_INTERNA}>Reunião interna</SelectItem>
          <SelectItem value={ALOCACAO_REUNIAO_EXTERNA}>Reunião externa</SelectItem>
          {projetos.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {formatarCodigo(p.codigo)} · {p.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {reuniao && (
        <Select
          value={reuniao.projetoId || SEM_PROJETO_DA_REUNIAO}
          onValueChange={(v) => onChange(selecaoDeReuniao(reuniao.base, !v || v === SEM_PROJETO_DA_REUNIAO ? "" : v))}
          disabled={disabled}
        >
          <SelectTrigger size={size} className={triggerClassName} aria-label="Projeto da reunião (opcional)">
            <SelectValue placeholder="Projeto da reunião (opcional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEM_PROJETO_DA_REUNIAO}>Sem projeto ligado</SelectItem>
            {projetos.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {formatarCodigo(p.codigo)} · {p.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </>
  );
}

/** Trocou o primeiro campo: reunião para reunião mantém o projeto já escolhido; o resto zera. */
function selecaoAoTrocarTipo(novo: string, projetoDaReuniao: string): string {
  return novo === ALOCACAO_REUNIAO_INTERNA || novo === ALOCACAO_REUNIAO_EXTERNA ? selecaoDeReuniao(novo, projetoDaReuniao) : novo;
}
