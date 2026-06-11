import { Shell } from "@/components/shell/shell";

// TODO(onda-0/auth): substituir por role da sessão quando better-auth entrar.
const MOCK_ROLE = "admin" as const;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Shell role={MOCK_ROLE}>{children}</Shell>;
}
