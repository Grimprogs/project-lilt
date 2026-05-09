import { useMemo, useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { useTasks } from "@/hooks/useTasks";
import { useVisibilitySettings } from "@/hooks/useSettings";
import { getVisibilitySettings } from "@/lib/permissions";
import { TaskCard } from "@/components/TaskCard";
import { TaskDetailDialog } from "@/components/TaskDetailDialog";
import { Input } from "@/components/ui/input";
import { Search, LayoutGrid, List } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { Task } from "@/integrations/supabase/types";

export default function EmployeeTasks() {
  const { profile } = useApp();
  const { data: my = [] } = useTasks({ role: "employee", userId: profile?.id });
  const { data: visibility = {} } = useVisibilitySettings();
  const [tab, setTab] = useState<"all" | any>("all");
  const [q, setQ] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  
  const location = useLocation();
  const highlightTaskId = location.state?.highlightTaskId;

  useEffect(() => {
    if (highlightTaskId && my.length > 0) {
      const el = document.getElementById(`task-${highlightTaskId}`);
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
      }
    }
  }, [highlightTaskId, my.length]);

  // Check self-assign permission
  const canSelfAssign = useMemo(() => {
    if (!profile) return false;
    if (profile.role === 'superadmin') return true;
    const settings = getVisibilitySettings(profile, visibility);
    return !!settings?.can_assign_self;
  }, [profile, visibility]);

  const filtered = useMemo(() => my.filter(t =>
    (tab === "all" || t.status === tab) &&
    (q === "" || t.title.toLowerCase().includes(q.toLowerCase()) || (t.description ?? '').toLowerCase().includes(q.toLowerCase()))
  ), [my, tab, q]);

  const counts = {
    all: my.length,
    pending: my.filter(t => t.status === "pending").length,
    in_progress: my.filter(t => t.status === "in_progress").length,
    completion_requested: my.filter(t => t.status === "completion_requested").length,
    completed: my.filter(t => t.status === "completed").length,
    overdue: my.filter(t => t.status === "overdue").length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">My tasks</h1>
        <p className="text-muted-foreground">Track, update, and close out your work.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(v: any) => setTab(v)}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="all">All <span className="ml-1.5 text-xs text-muted-foreground">{counts.all}</span></TabsTrigger>
            <TabsTrigger value="pending">Pending <span className="ml-1.5 text-xs text-muted-foreground">{counts.pending}</span></TabsTrigger>
            <TabsTrigger value="in_progress">In Progress <span className="ml-1.5 text-xs text-muted-foreground">{counts.in_progress}</span></TabsTrigger>
            <TabsTrigger value="completion_requested">Awaiting Approval <span className="ml-1.5 text-xs text-muted-foreground">{counts.completion_requested}</span></TabsTrigger>
            <TabsTrigger value="completed">Completed <span className="ml-1.5 text-xs text-muted-foreground">{counts.completed}</span></TabsTrigger>
            <TabsTrigger value="overdue" className="data-[state=active]:text-destructive">Overdue <span className="ml-1.5 text-xs text-muted-foreground">{counts.overdue}</span></TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9 bg-background/50" placeholder="Search my tasks…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div className="flex bg-muted/50 p-1 rounded-lg">
            <button
              onClick={() => setViewMode("grid")}
              className={cn("p-1.5 rounded-md transition-all", viewMode === "grid" ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground")}
              title="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn("p-1.5 rounded-md transition-all", viewMode === "list" ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground")}
              title="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {viewMode === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(t => (
            <TaskCard 
              key={t.id} 
              task={t} 
              showAssignee={false} 
              canComplete 
              canManage={t.created_by === profile?.id}
              canApprove={t.approver_ids?.includes(profile?.id ?? "")}
              canSelfAssign={canSelfAssign}
              id={`task-${t.id}`}
              highlighted={highlightTaskId === t.id}
            />
          ))}
          {filtered.length === 0 && (
            <div className="surface-card p-10 text-center text-muted-foreground sm:col-span-2 xl:col-span-3">
              Nothing here. Enjoy the moment. ☕
            </div>
          )}
        </div>
      ) : (
        <div className="surface-card overflow-hidden">
          <div className="overflow-auto max-h-[70vh] custom-scrollbar">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead className="sticky top-0 z-20 bg-muted/95 backdrop-blur text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                <tr>
                  <th className="sticky left-0 z-30 bg-muted/95 px-4 py-3 text-left border-b border-r min-w-[200px]">Task</th>
                  <th className="px-4 py-3 text-center border-b min-w-[100px]">Status</th>
                  <th className="px-4 py-3 text-center border-b min-w-[100px]">Priority</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const statusColors: Record<string, string> = {
                    pending: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
                    in_progress: "bg-blue-500/10 text-blue-600 border-blue-500/20",
                    completion_requested: "bg-purple-500/10 text-purple-600 border-purple-500/20",
                    completed: "bg-green-500/10 text-green-600 border-green-500/20",
                    overdue: "bg-red-500/10 text-red-600 border-red-500/20",
                  };
                  const priorityColors: Record<string, string> = {
                    urgent: "bg-red-500/10 text-red-600",
                    high: "bg-orange-500/10 text-orange-600",
                    medium: "bg-yellow-500/10 text-yellow-600",
                    low: "bg-green-500/10 text-green-600",
                  };

                  return (
                    <tr 
                      key={t.id} 
                      id={`task-${t.id}`}
                      className={cn(
                        "border-b hover:bg-muted/30 transition-colors group scroll-m-24 cursor-pointer",
                        highlightTaskId === t.id && "bg-primary/10 ring-2 ring-primary ring-inset animate-pulse-3"
                      )}
                      onClick={() => setSelectedTask(t)}
                    >
                      <td className="sticky left-0 z-10 bg-background px-4 py-3 border-r group-hover:bg-muted/30 transition-colors">
                        <div className="block min-w-0">
                          <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{t.title}</p>
                          {t.description && <p className="text-[10px] text-muted-foreground truncate mt-0.5">{t.description}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap", statusColors[t.status] || "")}>
                          {(t.status || '').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap", priorityColors[t.priority] || "")}>
                          {t.priority}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground space-y-2">
                      <p className="text-lg font-medium">Nothing here.</p>
                      <p className="text-xs">Enjoy the moment. ☕</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedTask && (
        <TaskDetailDialog
          task={selectedTask}
          open={!!selectedTask}
          onOpenChange={(open) => !open && setSelectedTask(null)}
          canManage={selectedTask.created_by === profile?.id}
          canComplete
          canApprove={selectedTask.approver_ids?.includes(profile?.id ?? "")}
          canSelfAssign={canSelfAssign}
        />
      )}
    </div>
  );
}
