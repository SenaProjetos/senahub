"use client";

import { useState } from "react";
import type { ActionResult } from "@/lib/with-action";
import { idDoErro } from "@/components/ui/field-error";

/**
 * Erro por campo — opção A da spec de formulários (`docs/superpowers/specs/2026-08-27-formularios-boas-praticas.md`).
 * `defineAction` sempre devolveu `fieldErrors` na falha do Zod; este hook é o fio que faltava:
 * guarda a mensagem, marca o controle (`aria-invalid` já tem estilo em `Input`/`SelectTrigger`),
 * liga a mensagem por `aria-describedby` e foca o primeiro campo com erro.
 *
 * `campos` mapeia a chave do schema Zod → id do controle no DOM. Só chave mapeada conta: erro
 * num campo que o formulário não mostra (um `id` oculto, por exemplo) volta `false` em
 * `registrar` e o chamador cai no `toast.error` de sempre.
 *
 * Referência de uso: `components/financeiro/folha/efetivar-pagamento-dialog.tsx`.
 */
export function useFieldErrors<K extends string>(campos: Record<K, string>) {
  const [erros, setErros] = useState<Partial<Record<K, string>>>({});
  const chaves = Object.keys(campos) as K[];

  function focar(chave: K) {
    // Depois do render que marca o campo — senão o foco chega antes do `aria-invalid`.
    requestAnimationFrame(() => document.getElementById(campos[chave])?.focus());
  }

  return {
    erros,

    /** Guarda os erros de campo de um resultado. `true` = havia erro mostrável (dispensa o toast). */
    registrar(r: ActionResult<unknown>): boolean {
      const novos: Partial<Record<K, string>> = {};
      if (!r.ok) {
        for (const k of chaves) {
          const msg = r.fieldErrors?.[k]?.[0];
          if (msg) novos[k] = msg;
        }
      }
      setErros(novos);
      const primeiro = chaves.find((k) => novos[k]);
      if (primeiro) focar(primeiro);
      return primeiro !== undefined;
    },

    /** Erro de uma checagem local, antes de chamar a action — mesmo lugar e aparência. */
    definir(chave: K, mensagem: string) {
      setErros({ [chave]: mensagem } as Partial<Record<K, string>>);
      focar(chave);
    },

    /**
     * Marca (ou, sem mensagem, limpa) o erro de UM campo, sem focar e sem tocar nos outros — a
     * validação ao sair do campo. `definir` não serve aqui: ele foca o campo e troca TODOS os erros,
     * o que devolveria o foco a quem acabou de sair e apagaria o erro de outro campo.
     */
    marcar(chave: K, mensagem?: string) {
      setErros((atual) => {
        if (mensagem) return atual[chave] === mensagem ? atual : { ...atual, [chave]: mensagem };
        if (!atual[chave]) return atual;
        const resto = { ...atual };
        delete resto[chave];
        return resto;
      });
    },

    /** Sem argumento limpa tudo (abrir o formulário de novo); com chave, só aquele campo (ao editar). */
    limpar(chave?: K) {
      setErros((atual) => {
        if (!chave) return {};
        if (!atual[chave]) return atual;
        const resto = { ...atual };
        delete resto[chave];
        return resto;
      });
    },

    /** Props do controle: `id`, `aria-invalid` e `aria-describedby` quando há erro. */
    campo(chave: K) {
      const invalido = !!erros[chave];
      return {
        id: campos[chave],
        "aria-invalid": invalido || undefined,
        "aria-describedby": invalido ? idDoErro(campos[chave]) : undefined,
      };
    },
  };
}
