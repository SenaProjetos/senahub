"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogOut, KeyRound, Camera, Pencil, HelpCircle, Moon, Sun, Smartphone, IdCard, SlidersHorizontal, BookOpen, BookMarked } from "lucide-react";
import { useTheme } from "next-themes";
import { AbrirNoCelularDialog } from "@/components/pwa/abrir-no-celular";
import { signOut } from "@/lib/auth-client";
import { atualizarNomeExibicao } from "@/modules/usuarios/actions";
import { useOnboarding } from "@/components/onboarding/onboarding-provider";
import { AvatarCropper } from "@/components/configuracoes/avatar-cropper";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

/** Telas que saíram do menu lateral e moram aqui (modelo aprovado do menu). */
export type AtalhosConta = { minhaConta: boolean; preferencias: boolean; ajuda: boolean; guias: boolean };

export function UserMenu({
  user,
  atalhos,
}: {
  user: { name: string; email: string; role: Role; image?: string | null };
  atalhos?: AtalhosConta;
}) {
  const router = useRouter();
  const { setTheme, resolvedTheme } = useTheme();
  const { temGuia, reverGuiaDaTela } = useOnboarding();
  const fileRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [fotoParaAjustar, setFotoParaAjustar] = useState<File | null>(null);
  const [nomeAberto, setNomeAberto] = useState(false);
  const [qrAberto, setQrAberto] = useState(false);
  const [nome, setNome] = useState(user.name);
  const [salvando, startSalvar] = useTransition();

  function salvarNome() {
    const n = nome.trim();
    if (n.length < 2) {
      toast.error("Informe o nome.");
      return;
    }
    startSalvar(async () => {
      const res = await atualizarNomeExibicao({ name: n });
      if (res.ok) {
        toast.success("Nome de exibição atualizado.");
        setNomeAberto(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  async function logout() {
    await signOut();
    router.push("/login");
    router.refresh();
  }

  function onArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast.error("Envie uma imagem.");
    setFotoParaAjustar(f);
  }

  async function enviarFoto(recortada: File) {
    setFotoParaAjustar(null);
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append("file", recortada);
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
      {fotoParaAjustar && (
        <AvatarCropper
          file={fotoParaAjustar}
          onConfirmar={(recortada) => void enviarFoto(recortada)}
          onFechar={() => setFotoParaAjustar(null)}
        />
      )}
      <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" aria-label={`Conta de ${user.name}`} title={user.name} className="size-9 rounded-full p-0">
            <Avatar className="size-8 shrink-0">
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
        {atalhos?.minhaConta && (
          <DropdownMenuItem onClick={() => router.push("/minha-ficha")}>
            <IdCard className="size-4" />
            Minha conta
          </DropdownMenuItem>
        )}
        {atalhos?.preferencias && (
          <DropdownMenuItem onClick={() => router.push("/preferencias")}>
            <SlidersHorizontal className="size-4" />
            Preferências
          </DropdownMenuItem>
        )}
        {/* No celular a barra do topo não tem o "?": Ajuda e Guias ficam aqui. */}
        {atalhos?.ajuda && (
          <DropdownMenuItem className="md:hidden" onClick={() => router.push("/ajuda")}>
            <BookOpen className="size-4" />
            Ajuda e manual
          </DropdownMenuItem>
        )}
        {atalhos?.guias && (
          <DropdownMenuItem className="md:hidden" onClick={() => router.push("/guias")}>
            <BookMarked className="size-4" />
            Guias de uso
          </DropdownMenuItem>
        )}
        {(atalhos?.minhaConta || atalhos?.preferencias) && <DropdownMenuSeparator />}
        <DropdownMenuItem onClick={() => { setNome(user.name); setNomeAberto(true); }}>
          <Pencil className="size-4" />
          Nome de exibição
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => fileRef.current?.click()} disabled={enviando}>
          <Camera className="size-4" />
          {enviando ? "Enviando…" : "Alterar foto"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push("/trocar-senha")}>
          <KeyRound className="size-4" />
          Trocar senha
        </DropdownMenuItem>
        {temGuia && (
          <DropdownMenuItem onClick={reverGuiaDaTela}>
            <HelpCircle className="size-4" />
            Rever guia da tela
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="hidden md:flex" onClick={() => setQrAberto(true)}>
          <Smartphone className="size-4" />
          Abrir no celular
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
          {resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          {resolvedTheme === "dark" ? "Tema claro" : "Tema escuro"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={logout} variant="destructive">
          <LogOut className="size-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
      </DropdownMenu>

      <AbrirNoCelularDialog aberto={qrAberto} onOpenChange={setQrAberto} />

      <Dialog open={nomeAberto} onOpenChange={setNomeAberto}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nome de exibição</DialogTitle>
            <DialogDescription>
              Como seu nome aparece nas telas do sistema. Não altera seu nome completo de cadastro.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="nome-exibicao">Nome</Label>
            <Input
              id="nome-exibicao"
              value={nome}
              autoFocus
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") salvarNome(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNomeAberto(false)}>Cancelar</Button>
            <Button onClick={salvarNome} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
