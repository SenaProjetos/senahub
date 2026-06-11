import { Shell } from "@/components/shell/shell";
import { requireUser } from "@/lib/session";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  return (
    <Shell role={user.role} user={user}>
      {children}
    </Shell>
  );
}
