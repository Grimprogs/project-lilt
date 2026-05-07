import { useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { useTasks } from "@/hooks/useTasks";
import { useProfile } from "@/hooks/useProfiles";
import { useVisibilitySettings } from "@/hooks/useSettings";
import { getVisibilitySettings } from "@/lib/permissions";
import { TaskCard } from "@/components/TaskCard";
import { CheckCircle2, Clock, AlertTriangle, ListTodo, Sparkles, Calendar } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Link } from "react-router-dom";

export default function EmployeeDashboard() {
  const { user, profile } = useApp();
  const { data: me } = useProfile(user?.employeeId);
  const { data: my = [] } = useTasks({ role: "employee", userId: user?.employeeId });
  const { data: visibility = {} } = useVisibilitySettings();

  const canSelfAssign = useMemo(() => {
    if (!profile) return false;
    if (profile.role === 'superadmin') return true;
    const settings = getVisibilitySettings(profile, visibility);
    return !!settings?.can_assign_self;
  }, [profile, visibility]);
  
  const total = my.length;
  const done = my.filter(t => t.status === "completed").length;
  const active = my.filter(t => ["pending", "in_progress"].includes(t.status)).length;
  const overdue = my.filter(t => t.status === "overdue").length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const upcoming = [...my]
    .filter(t => t.status !== "completed")
    .sort((a, b) => (a.due_date + a.due_time).localeCompare(b.due_date + b.due_time))
    .slice(0, 6);

  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() - 3 + i);
    const key = d.toISOString().slice(0, 10);
    return {
      key,
      label: d.toLocaleDateString(undefined, { weekday: "short" }),
      day: d.getDate(),
      isToday: i === 3,
      tasks: my.filter(t => t.due_date === key),
    };
  });

  return (
    <div className="space-y-6">
      {/* Compact Hero */}
      <div className="surface-card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">Hello, {me?.name.split(" ")[0]} 👋</h1>
          <p className="text-sm text-muted-foreground">You have {active} active tasks for today.</p>
        </div>
        <div className="flex items-center gap-4 min-w-[200px]">
          <div className="flex-1">
            <div className="flex justify-between text-[10px] uppercase tracking-widest font-bold mb-1">
              <span>Progress</span>
              <span>{pct}%</span>
            </div>
            <Progress value={pct} className="h-1.5" />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
           {/* Mini Stats Bar */}
           <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MiniStat icon={ListTodo} label="Total" value={total} color="text-primary" />
              <MiniStat icon={CheckCircle2} label="Done" value={done} color="text-success" />
              <MiniStat icon={Clock} label="Active" value={active} color="text-warning" />
              <MiniStat icon={AlertTriangle} label="Late" value={overdue} color="text-destructive" />
           </div>

           {/* Priority Tasks */}
           <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display text-lg font-semibold flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> Your Focus
                </h2>
                <Link to="/me/tasks" className="text-xs font-medium text-primary hover:underline">View all tasks</Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {upcoming.map(t => <TaskCard key={t.id} task={t} showAssignee={false} canComplete canSelfAssign={canSelfAssign} compact />)}
                {upcoming.length === 0 && (
                  <div className="surface-card p-10 text-center text-sm text-muted-foreground sm:col-span-2 border-dashed">
                    No pending tasks. You're all caught up! 🥂
                  </div>
                )}
              </div>
           </section>
        </div>

        {/* Weekly View */}
        <div className="surface-card p-5">
          <h2 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" /> Schedule
          </h2>
          <div className="space-y-2">
            {days.map(d => (
              <div key={d.key} className={`flex items-center justify-between p-2 rounded-lg border ${d.isToday ? "bg-primary/5 border-primary/20" : "bg-muted/30 border-transparent"}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded flex flex-col items-center justify-center ${d.isToday ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
                    <span className="text-[10px] uppercase leading-none font-bold">{d.label}</span>
                    <span className="text-xs font-bold">{d.day}</span>
                  </div>
                  <div className="text-xs font-medium">{d.tasks.length > 0 ? `${d.tasks.length} tasks` : "No tasks"}</div>
                </div>
                <div className="flex -space-x-1">
                   {d.tasks.map(t => (
                      <div key={t.id} className="h-1.5 w-1.5 rounded-full ring-1 ring-background bg-primary" />
                   ))}
                </div>
              </div>
            ))}
          </div>
          <Link to="/me/tasks">
            <Button variant="ghost" className="w-full mt-4 text-xs">Full Calendar</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, color }: any) {
  return (
    <div className="surface-card p-3 flex items-center gap-3">
      <Icon className={`h-4 w-4 ${color}`} />
      <div>
        <div className="text-[10px] uppercase tracking-tighter text-muted-foreground">{label}</div>
        <div className="text-base font-bold leading-none">{value}</div>
      </div>
    </div>
  );
}

function Button({ children, variant, className, ...props }: any) {
  const styles = variant === "ghost" ? "hover:bg-muted" : "";
  return <button className={`inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 h-9 px-4 py-2 ${styles} ${className}`} {...props}>{children}</button>;
}
