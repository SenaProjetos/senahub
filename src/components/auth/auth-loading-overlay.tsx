import { LogoLoader } from "@/components/ui/logo-loader";

export function AuthLoadingOverlay({ label }: { label: string }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background">
      <LogoLoader className="size-24" label={label} />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
