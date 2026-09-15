import { Lock } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { dadosEmpresa } from "@/modules/configuracoes/empresa/queries";

/** Fallback do rodapé enquanto Configurações → Empresa não foi preenchido. */
const NOME_PADRAO = "Sena Projetos de Engenharia";

/**
 * Moldura de marca das páginas públicas por token (`/p/**`, `/a/**`): quem abre é o cliente ou
 * um terceiro sem conta, que conhece "Sena Projetos" — não o produto interno SenaHub. Por isso
 * o logo é o da empresa e o rodapé traz razão social/CNPJ de Configurações → Empresa.
 *
 * Não impõe largura ao conteúdo: cada página mantém o próprio `max-w-*` no seu `<main>`.
 */
export async function PublicoShell({ children }: { children: React.ReactNode }) {
  const empresa = await dadosEmpresa().catch(() => null);
  const nome = empresa?.razaoSocial ?? NOME_PADRAO;

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-4 px-4">
          <span className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/MARCA/logo_sena_completa_dark.svg" alt="Sena Projetos" className="hidden h-10 w-auto dark:block" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/MARCA/logo_sena_completa_light.svg" alt="Sena Projetos" className="h-10 w-auto dark:hidden" />
          </span>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
              <Lock className="size-3.5" aria-hidden />
              Link seguro
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t bg-background/85">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{nome}</p>
            {(empresa?.cnpj || empresa?.endereco) && (
              <p>
                {empresa.cnpj && <span className="font-mono">CNPJ {empresa.cnpj}</span>}
                {empresa.cnpj && empresa.endereco && " · "}
                {empresa.endereco}
              </p>
            )}
          </div>
          <p className="max-w-sm sm:text-right">
            Este link é pessoal e pode expirar ou ser revogado a qualquer momento. Não o compartilhe.
          </p>
        </div>
      </footer>
    </div>
  );
}
