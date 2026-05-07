import { Bell, Menu, Moon, Search, Sun } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp } from "@/context/AppContext";
import { UserAvatar } from "./UserAvatar";
import { NotificationsPanel } from "./NotificationsPanel";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user, profile, logout, theme, toggleTheme, unreadCount } = useApp();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/90 px-3 sm:px-5 backdrop-blur-xl">
      {/* Hamburger — always on mobile */}
      <Button variant="ghost" size="icon" onClick={onMenu} className="md:hidden shrink-0" aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </Button>

      {/* Search — desktop only */}
      <div className="hidden flex-1 max-w-md md:block">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search tasks, people…" className="pl-9 bg-muted/50 border-transparent focus-visible:bg-background" />
        </div>
      </div>

      {/* Right icons — always visible, compact on mobile */}
      <div className="ml-auto flex items-center gap-0.5 sm:gap-1.5 shrink-0">
        {/* Theme toggle */}
        <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-9 w-9" aria-label="Toggle theme">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        {/* Notifications bell */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-9 w-9" aria-label="Notifications">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground ring-2 ring-background animate-scale-in">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="p-0 w-[calc(100vw-2rem)] max-w-[22rem]">
            <NotificationsPanel onItemClick={() => setOpen(false)} />
          </PopoverContent>
        </Popover>

        {/* Avatar + dropdown */}
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="ml-0.5 inline-flex items-center gap-1.5 rounded-full pl-0.5 pr-2 py-1 hover:bg-muted transition-colors shrink-0">
                <UserAvatar name={user.name} size="sm" color="from-indigo-500 to-violet-500" />
                <div className="hidden text-left sm:block max-w-[100px]">
                  <div className="text-xs font-medium leading-none truncate">{user.name}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{profile?.job_title ?? ""}</div>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="truncate">{user.name}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive">Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
