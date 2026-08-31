import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { SidebarNav } from "@/components/app/sidebar-nav";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getBalanceKobo } from "@/lib/billing/credits";
import { formatNgn } from "@/lib/billing/pricing";
import { Wallet, LogOut } from "lucide-react";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const balanceKobo = await getBalanceKobo(session.user.id);

  const initials = (session.user.name ?? session.user.email ?? "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex flex-1">
      <aside className="hidden w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground sm:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <Image
            src="/brand/hiva-icon-192.png"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7"
          />
          <span className="font-heading text-[15px] font-semibold tracking-tight">
            Hivameet
          </span>
        </div>

        <SidebarNav />

        <Link
          href="/billing"
          className="mx-3 mt-4 flex items-center justify-between rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2.5 transition-colors hover:bg-sidebar-accent"
        >
          <span className="flex items-center gap-2 text-xs font-medium text-sidebar-foreground/70">
            <Wallet className="h-3.5 w-3.5" />
            Balance
          </span>
          <span className="text-sm font-semibold text-sidebar-primary">
            {formatNgn(balanceKobo)}
          </span>
        </Link>

        <div className="mt-auto flex items-center gap-2 border-t border-sidebar-border p-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={session.user.image ?? undefined} />
            <AvatarFallback className="bg-sidebar-accent text-sidebar-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{session.user.name}</p>
            <p className="truncate text-xs text-sidebar-foreground/50">{session.user.email}</p>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button
              variant="ghost"
              size="icon"
              type="submit"
              className="h-8 w-8 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </aside>
      <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
