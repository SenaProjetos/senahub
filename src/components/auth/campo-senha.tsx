"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Campo de senha nova com botão de exibir/ocultar próprio (trocar senha e redefinir pelo link). */
export function CampoSenha({
  id,
  name,
  label,
  descricaoId,
  invalido,
}: {
  id: string;
  name: string;
  label: string;
  /** Id do texto de ajuda/erro ligado ao campo (`aria-describedby`). */
  descricaoId?: string;
  invalido?: boolean;
}) {
  const [mostrar, setMostrar] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={mostrar ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          aria-describedby={descricaoId}
          aria-invalid={invalido || undefined}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setMostrar((v) => !v)}
          aria-label="Mostrar senha"
          aria-pressed={mostrar}
          className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {mostrar ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );
}
