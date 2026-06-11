import { Sidebar } from "@/components/shell/sidebar";
import { Header } from "@/components/shell/header";
import { BottomNav } from "@/components/shell/bottom-nav";
import type { Role } from "@/lib/roles";

export function Shell({
  role,
  title,
  children,
}: {
  role: Role;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh">
      <Sidebar role={role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header title={title} />
        <main className="flex-1 p-4 pb-24 lg:p-6 lg:pb-6">{children}</main>
      </div>
      <BottomNav role={role} />
    </div>
  );
}
