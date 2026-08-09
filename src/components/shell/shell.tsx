import { Sidebar } from "@/components/shell/sidebar";
import { Header } from "@/components/shell/header";
import { BottomNav } from "@/components/shell/bottom-nav";
import { CommandPalette } from "@/components/shell/command-palette";
import type { ContextoNav } from "@/lib/nav-config";
import type { SessionUser } from "@/lib/session";

export function Shell({
  nav,
  user,
  title,
  children,
}: {
  nav: ContextoNav;
  user: Pick<SessionUser, "name" | "email" | "role" | "image">;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh">
      <Sidebar nav={nav} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header title={title} user={user} nav={nav} />
        <main className="flex-1 p-4 pb-24 lg:p-6 lg:pb-6">{children}</main>
      </div>
      <BottomNav nav={nav} />
      <CommandPalette />
    </div>
  );
}
