"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogOut, KeyRound, Camera } from "lucide-react";
import { signOut } from "@/lib/auth-client";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function UserMenu({
  user,
}: {
  user: { name: string; email: string; role: Role; image?: string | null };
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  async function logout() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  async function onArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/avatar", { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Foto atualizada.");
        router.refresh();
      } else {
        toast.error(j.error ?? "Falha ao enviar a foto.");
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onArquivo} />
      <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" aria-label="Conta" className="h-9 gap-2 rounded-full px-1 sm:rounded-sm sm:pr-2.5">
            <Avatar className="size-8 shrink-0">
              {user.image && <AvatarImage src={user.image} alt={user.name} />}
              <AvatarFallback className="text-xs">{initials(user.name)}</AvatarFallback>
            </Avatar>
            {/* Nome + função visíveis em telas largas (Mód 14); só avatar no mobile. */}
            <span className="hidden min-w-0 flex-col items-start leading-tight sm:flex">
              <span className="max-w-[9rem] truncate text-xs font-medium">{user.name}</span>
              <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                {ROLE_LABELS[user.role]}
              </span>
            </span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="truncate font-medium">{user.name}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">
              {user.email}
            </span>
            <span className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {ROLE_LABELS[user.role]}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => fileRef.current?.click()} disabled={enviando}>
          <Camera className="size-4" />
          {enviando ? "Enviando…" : "Alterar foto"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/trocar-senha")}>
          <KeyRound className="size-4" />
          Trocar senha
        </DropdownMenuItem>
        <DropdownMenuItem onClick={logout} variant="destructive">
          <LogOut className="size-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
