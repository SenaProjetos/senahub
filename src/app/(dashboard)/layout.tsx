import { Shell } from "@/components/shell/shell";
import { requireUser } from "@/lib/session";
import { PushManager } from "@/components/notificacoes/push-manager";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  return (
    <Shell role={user.role} user={user}>
      <PushManager />
      {children}
    </Shell>
  );
}
