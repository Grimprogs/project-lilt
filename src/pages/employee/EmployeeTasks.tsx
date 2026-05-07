import { useMemo, useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { useTasks } from "@/hooks/useTasks";
import { useVisibilitySettings } from "@/hooks/useSettings";
import { getVisibilitySettings } from "@/lib/permissions";
import { TaskCard } from "@/components/TaskCard";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function EmployeeTasks() {
  const { profile } = useApp();
  const { data: my = [] } = useTasks({ role: "employee", userId: profile?.id });
  const { data: visibility = {} } = useVisibilitySettings();
  const [tab, setTab] = useState<"all" | any>("all");
  const [q, setQ] = useState("");
  
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
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search my tasks…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map(t => (
          <TaskCard 
            key={t.id} 
            task={t} 
            showAssignee={false} 
            canComplete 
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
    </div>
  );
}
