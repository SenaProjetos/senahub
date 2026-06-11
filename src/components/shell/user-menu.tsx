"use client";

import { useRouter } from "next/navigation";
import { LogOut, KeyRound } from "lucide-react";
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

  async function logout() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Conta" className="rounded-full">
            <Avatar className="size-8">
              {user.image && <AvatarImage src={user.image} alt={user.name} />}
              <AvatarFallback className="text-xs">{initials(user.name)}</AvatarFallback>
            </Avatar>
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
  );
}
