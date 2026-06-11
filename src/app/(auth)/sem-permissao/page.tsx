import type { Metadata } from "next";
import Link from "next/link";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Sem permissão" };

export default function SemPermissaoPage() {
  return (
    <div className="flex max-w-sm flex-col items-center text-center">
      <ShieldX className="mb-4 size-12 text-muted-foreground" />
      <h1 className="text-xl font-bold">Sem permissão</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Seu perfil não tem acesso a esta área. Se acredita que isso é um engano,
        fale com a administração.
      </p>
      <Button className="mt-6" render={<Link href="/">Voltar ao início</Link>} />
    </div>
  );
}
