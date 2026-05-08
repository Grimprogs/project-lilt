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
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useTasks } from "@/hooks/useTasks";
import { useProfiles } from "@/hooks/useProfiles";
import { useVisibilitySettings } from "@/hooks/useSettings";
import { useDepartments, useMyDepartmentGrants } from "@/hooks/useDepartments";
import { canViewProfile, canAssignTask } from "@/lib/permissions";
import { useNavigate } from "react-router-dom";
import { useEffect, useMemo } from "react";

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user, profile, logout, theme, toggleTheme, unreadCount, notificationPermission, requestNotificationPermission } = useApp();
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();

  // Load data for search
  const { data: tasks = [] } = useTasks(profile?.role === 'admin' ? { role: 'admin' } : { role: 'employee', userId: profile?.id });
  const { data: profiles = [] } = useProfiles();
  const { data: visibility = {} } = useVisibilitySettings();
  const { data: departmentsData = [] } = useDepartments();
  const { data: myGrants = [] } = useMyDepartmentGrants(profile?.id);

  const isSuperAdmin = profile?.role === 'superadmin';

  // Filter tasks based on hierarchy & permissions
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (isSuperAdmin) return true;
      if (t.assignee_id === profile?.id) return true; // Always see own tasks

      const assignee = profiles.find((p) => p.id === t.assignee_id);
      if (assignee?.role === 'superadmin' && assignee.id !== profile?.id) return false;

      return assignee && canAssignTask(profile, assignee, visibility, departmentsData, myGrants);
    });
  }, [tasks, profiles, profile, isSuperAdmin, visibility, departmentsData, myGrants]);

  // Filter profiles based on hierarchy & permissions
  const filteredProfiles = useMemo(() => {
    return profiles.filter((p) => {
      if (isSuperAdmin) return true;
      if (p.id === profile?.id) return true; // Always see self
      if (p.role === 'superadmin') return false; // Stealth mode

      return canViewProfile(profile, p, myGrants, departmentsData, visibility);
    });
  }, [profiles, profile, isSuperAdmin, visibility, departmentsData, myGrants]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);


  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/90 px-3 sm:px-5 backdrop-blur-xl">
      {/* Hamburger — always on mobile */}
      <Button variant="ghost" size="icon" onClick={onMenu} className="md:hidden shrink-0" aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </Button>

      {/* Search — desktop only */}
      <div className="hidden flex-1 max-w-md md:block">
        <div 
          className="relative flex items-center h-9 w-full rounded-md border border-input bg-muted/50 px-3 py-1 text-sm shadow-sm transition-colors cursor-text text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          onClick={() => setSearchOpen(true)}
        >
          <Search className="mr-2 h-4 w-4 shrink-0" />
          <span className="flex-1 truncate text-left">Search tasks, people…</span>
          <kbd className="pointer-events-none absolute right-1.5 top-1.5 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
            <span className="text-xs">⌘</span>K
          </kbd>
        </div>
      </div>

      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput placeholder="Type a command or search..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          
          {filteredTasks.length > 0 && (
            <CommandGroup heading="Tasks">
              {filteredTasks.slice(0, 10).map((task) => (
                <CommandItem
                  key={task.id}
                  onSelect={() => {
                    setSearchOpen(false);
                    const path = profile?.role === 'admin' ? '/admin/tasks' : '/me/tasks';
                    navigate(path, { state: { highlightTaskId: task.id } });
                  }}
                  className="flex flex-col items-start cursor-pointer"
                >
                  <div className="font-medium truncate w-full">{task.title}</div>
                  {task.description && <div className="text-xs text-muted-foreground truncate w-full">{task.description}</div>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {filteredProfiles.length > 0 && (
            <CommandGroup heading="People">
              {filteredProfiles.slice(0, 10).map((p) => (
                <CommandItem
                  key={p.id}
                  onSelect={() => {
                    setSearchOpen(false);
                    const path = profile?.role === 'admin' ? `/admin/employees/${p.id}` : `/me/employees/${p.id}`;
                    navigate(path);
                  }}
                  className="cursor-pointer"
                >
                  {p.name} <span className="text-xs text-muted-foreground ml-2">({p.job_title})</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>

      {/* Right icons — always visible, compact on mobile */}
      <div className="ml-auto flex items-center gap-0.5 sm:gap-1.5 shrink-0">
        {/* Desktop Notification Prompt */}
        {notificationPermission === "default" && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={requestNotificationPermission}
            className="hidden lg:flex h-8 text-[10px] uppercase tracking-wider font-bold bg-primary/10 border-primary/20 text-primary hover:bg-primary/20"
          >
            Enable Alerts
          </Button>
        )}

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
