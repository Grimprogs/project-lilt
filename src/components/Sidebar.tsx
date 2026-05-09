import { useMemo } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, ListTodo, PlusCircle, User, LogOut, CheckSquare2, Inbox } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useTasks } from "@/hooks/useTasks";
import { useProfiles } from "@/hooks/useProfiles";
import { useVisibilitySettings, VisibilityMap } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";

const adminNav = [
  { to: "/admin",            label: "Dashboard",   icon: LayoutDashboard, end: true },
  { to: "/admin/employees",  label: "Employees",   icon: Users },
  { to: "/admin/tasks",      label: "All tasks",   icon: ListTodo },
  { to: "/admin/my-tasks",   label: "My tasks",    icon: CheckSquare2 },
  { to: "/admin/employees/ME", label: "My Profile",  icon: User },
  { to: "/admin/approvals",  label: "Approvals",   icon: Inbox, badge: "approvals" as const },
  { to: "/admin/tasks/new",  label: "Create task", icon: PlusCircle },
];

const empNav = [
  { to: "/me",         label: "Dashboard",      icon: LayoutDashboard, end: true },
  { to: "/me/tasks",   label: "My tasks",       icon: ListTodo },
  { to: "/me/team",    label: "Team Directory", icon: Users },
  { to: "/me/employees/ME", label: "Profile",   icon: User },
];

interface Props { open: boolean; onClose: () => void; }

export function Sidebar({ open, onClose }: Props) {
  const { user, profile, logout } = useApp();
  const { pathname } = useLocation();
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const items = isAdmin ? adminNav : empNav;
  const { data: allTasks = [] } = useTasks(
    user?.role === "employee"
      ? { role: "employee", userId: user.employeeId }
      : user
        ? { role: "admin" }
        : undefined
  );
  const { data: profiles = [] } = useProfiles();
  const { data: visibility = {} } = useVisibilitySettings() as { data: VisibilityMap };
  const isSuperAdmin = user?.role === "superadmin";

  const getVisibilitySettings = (p: any) => {
    if (!p) return null;
    const personKey = `profile:${p.id}`;
    const roleKey = `${p.department}:${p.job_title}`;
    return visibility[personKey] || visibility[roleKey] || visibility[p.department] || null;
  };

  const allowedAssignDepts = useMemo(() => {
    if (isSuperAdmin) return null;
    if (!profile) return [] as string[];
    const settings = getVisibilitySettings(profile) || { sees: [], sees_jobs: false, sees_profiles: false };
    const assignable = (settings.assignable_depts || []).map((d: string) => d.toLowerCase());
    if (assignable.length > 0) return assignable;
    if (settings.can_assign_tasks && profile.department) return [profile.department.toLowerCase()];
    return [] as string[];
  }, [isSuperAdmin, profile, visibility]);

  const approvalsCount = useMemo(() => {
    return allTasks.filter(t => {
      if (t.status !== "completion_requested") return false;
      
      // Stealth Mode: Hide other Super Admin tasks
      const assignee = profiles.find(p => p.id === t.assignee_id);
      if (assignee?.role === 'superadmin' && assignee.id !== profile?.id) {
        return false;
      }

      // Scope to allowed assignment departments (non-superadmin)
      if (!isSuperAdmin && allowedAssignDepts) {
        const dept = (assignee?.department || '').toLowerCase();
        if (!allowedAssignDepts.includes(dept)) return false;
      }
      return true;
    }).length;
  }, [allTasks, profiles, profile, isSuperAdmin, allowedAssignDepts]);

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm md:hidden transition-opacity",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
      />
      <aside
        className={cn(
          "fixed z-50 md:static inset-y-0 left-0 w-64 shrink-0 border-r bg-sidebar text-sidebar-foreground flex flex-col h-full",
          "transform transition-transform duration-300 md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center gap-2.5 px-5 border-b border-sidebar-border">
          <img src="/ztasks-logo.jpg" alt="ZeexTaskforce Logo" className="h-9 w-9 rounded-xl object-cover shadow-glow" />
          <div>
            <div className="font-display text-lg font-bold leading-none">ZeexTaskforce</div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-0.5">
              {user?.role === "superadmin" ? "Master Admin" : user?.role === "admin" ? "Admin workspace" : "Employee"}
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 overflow-y-auto custom-scrollbar">
          <div className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Workspace</div>
          <ul className="space-y-1">
            {items.map(item => {
              const to = item.to.replace("ME", user?.employeeId || profile?.id || "");
              const active = item.end ? pathname === to : pathname.startsWith(to);
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <NavLink
                    to={to}
                    end={item.end}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-soft"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Icon className={cn("h-4.5 w-4.5", active ? "text-sidebar-primary" : "")} />
                    <span className="flex-1">{item.label}</span>
                    {(item as any).badge === "approvals" && approvalsCount > 0 && (
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                        {approvalsCount}
                      </span>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="p-3 border-t border-sidebar-border shrink-0">
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-destructive transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
