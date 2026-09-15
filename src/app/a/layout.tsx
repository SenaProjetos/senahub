import { PublicoShell } from "@/components/publico/publico-shell";

export default function PublicoLayout({ children }: { children: React.ReactNode }) {
  return <PublicoShell>{children}</PublicoShell>;
}
