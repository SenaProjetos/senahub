import { Sidebar } from "@/components/shell/sidebar";
import { Header } from "@/components/shell/header";
import { BottomNav } from "@/components/shell/bottom-nav";
import { CommandPalette } from "@/components/shell/command-palette";
import type { Role } from "@/lib/roles";
import type { SessionUser } from "@/lib/session";

export function Shell({
  role,
  user,
  title,
  children,
}: {
  role: Role;
  user: Pick<SessionUser, "name" | "email" | "role" | "image">;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh">
      <Sidebar role={role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header title={title} user={user} />
        <main className="flex-1 p-4 pb-24 lg:p-6 lg:pb-6">{children}</main>
      </div>
      <BottomNav role={role} />
      <CommandPalette />
    </div>
  );
}
