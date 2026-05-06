import { useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { useTasks } from "@/hooks/useTasks";
import { useProfiles } from "@/hooks/useProfiles";
import { useVisibilitySettings } from "@/hooks/useSettings";
import { Users, ListTodo, CheckCircle2, Clock, AlertTriangle, TrendingUp, Inbox, Activity, Download } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TaskCard } from "@/components/TaskCard";
import { UserAvatar } from "@/components/UserAvatar";
import { downloadCSV, calculateTaskDuration } from "@/lib/csv-export";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend
} from "recharts";

function StatCard({ icon: Icon, label, value, trend, tone = "primary" }: any) {
  const tones: Record<string, string> = {
    primary:     "bg-gradient-primary text-white",
    success:     "bg-success/15 text-success",
    warning:     "bg-warning/15 text-warning",
    info:        "bg-info/15 text-info",
    destructive: "bg-destructive/15 text-destructive",
  };
  return (
    <div className="surface-card hover-lift p-5 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="mt-2 font-display text-3xl font-bold">{value}</div>
        </div>
        <div className={`grid h-11 w-11 place-items-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {trend && (
        <div className="mt-3 inline-flex items-center gap-1 text-xs text-success">
          <TrendingUp className="h-3.5 w-3.5" /> {trend}
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const { user, profile, visibleNotifications } = useApp();
  const isSuperAdmin = user?.role === 'superadmin';
  const { data: allTasks = [] } = useTasks({ role: "admin" });
  const { data: allEmployees = [] } = useProfiles();
  const { data: visibility = {} } = useVisibilitySettings();

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

  // Stealth Mode: Filter out other Super Admins and their tasks
  const employees = useMemo(() => {
    return allEmployees.filter(e => {
      if (e.role === 'superadmin') return e.id === profile?.id;
      return true;
    });
  }, [allEmployees, profile?.id]);

  const tasks = useMemo(() => {
    return allTasks.filter(t => {
      const emp = allEmployees.find(e => e.id === t.assignee_id);
      if (emp?.role === 'superadmin') return emp.id === profile?.id;
      if (!isSuperAdmin && allowedAssignDepts) {
        const dept = (emp?.department || '').toLowerCase();
        if (!allowedAssignDepts.includes(dept)) return false;
      }
      return true;
    });
  }, [allTasks, allEmployees, profile?.id, allowedAssignDepts, isSuperAdmin]);

  const completed = tasks.filter(t => t.status === "completed").length;
  const pending   = tasks.filter(t => t.status === "pending").length;
  const inprog    = tasks.filter(t => t.status === "in_progress").length;
  const requested = tasks.filter(t => t.status === "completion_requested").length;
  const overdue   = tasks.filter(t => t.status === "overdue").length;

  // 7-day completion trend (mocked from created_at)
  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return d;
  });
  const trend = days.map(d => {
    const key = d.toISOString().slice(0, 10);
    const created = tasks.filter(t => t.created_at.slice(0, 10) === key).length;
    const done = tasks.filter(t => t.status === "completed" && t.due_date <= key).length;
    return { day: d.toLocaleDateString(undefined, { weekday: "short" }), created, done };
  });

  const pie = [
    { name: "Completed",   value: completed, color: "hsl(var(--success))" },
    { name: "In Progress", value: inprog,    color: "hsl(var(--info))" },
    { name: "Pending",     value: pending,   color: "hsl(var(--warning))" },
    { name: "Overdue",     value: overdue,   color: "hsl(var(--destructive))" },
  ];

  const recent = [...tasks].sort((a,b) => a.created_at < b.created_at ? 1 : -1).slice(0, 6);
  const empMap = new Map(employees.map(e => [e.id, e]));

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pb-4 border-b -mx-4 px-4 pt-2 mb-4 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold">Welcome back, Admin 👋</h1>
            <p className="text-muted-foreground text-sm">Here's what's happening across your team today.</p>
          </div>
          <Button 
            className="bg-gradient-primary shadow-glow hover:opacity-95 text-white"
            onClick={() => {
              downloadCSV(`ZTasksforce_Global_Report_${new Date().toISOString().slice(0, 10)}`, 
                ["Employee", "Role", "Department", "Task", "Priority", "Status", "Due Date", "Started At", "Completed At", "Time Taken"], 
                tasks.map(t => {
                  const emp = empMap.get(t.assignee_id ?? "");
                  return [
                    emp?.name || "Unassigned",
                    emp?.role || "—",
                    emp?.department || "—",
                    t.title,
                    t.priority,
                    t.status,
                    t.due_date,
                    t.started_at ? new Date(t.started_at).toLocaleString() : "—",
                    t.approved_at ? new Date(t.approved_at).toLocaleString() : "—",
                    calculateTaskDuration(t)
                  ];
                })
              );
            }}
          >
            <Download className="mr-2 h-4 w-4" /> Export Global Report
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <StatCard icon={Users}         label="Employees"  value={employees.length} tone="primary" />
        <StatCard icon={ListTodo}      label="Total tasks" value={tasks.length}    tone="info" />
        <StatCard icon={CheckCircle2}  label="Completed"  value={completed}        tone="success" trend="+12% this week" />
        <StatCard icon={Clock}         label="Pending"    value={pending + inprog} tone="warning" />
        <StatCard icon={Inbox}         label="Approvals"  value={requested}        tone="info" />
        <StatCard icon={AlertTriangle} label="Overdue"    value={overdue}          tone="destructive" />
      </div>

      {/* NEW: My Assigned Tasks Section */}
      <div className="surface-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <ListTodo className="h-5 w-5 text-primary" /> My Assigned Tasks
          </h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tasks.filter(t => t.assignee_id === profile?.id && t.status !== 'completed').map(t => (
            <TaskCard key={t.id} task={t} canComplete compact />
          ))}
          {tasks.filter(t => t.assignee_id === profile?.id && t.status !== 'completed').length === 0 && (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground sm:col-span-2 lg:col-span-3 xl:col-span-4">
              You have no active tasks assigned to you.
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="surface-card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold">Activity overview</h2>
              <p className="text-xs text-muted-foreground">Tasks created vs. completed (last 7 days)</p>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="hsl(var(--primary))" stopOpacity={0.5}/>
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="hsl(var(--success))" stopOpacity={0.4}/>
                    <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} stroke="hsl(var(--border))" />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} stroke="hsl(var(--border))" />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} />
                <Area type="monotone" dataKey="created" stroke="hsl(var(--primary))" fill="url(#g1)" strokeWidth={2.5} name="Created" />
                <Area type="monotone" dataKey="done"    stroke="hsl(var(--success))" fill="url(#g2)" strokeWidth={2.5} name="Completed" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface-card p-5">
          <h2 className="font-display text-lg font-semibold">Status breakdown</h2>
          <p className="text-xs text-muted-foreground">All tasks by current status</p>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie} dataKey="value" innerRadius={50} outerRadius={80} paddingAngle={3}>
                  {pie.map((p, i) => <Cell key={i} fill={p.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="surface-card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold flex items-center gap-2">
              <Inbox className="h-5 w-5 text-primary" /> Approval queue
              {requested > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                  {requested}
                </span>
              )}
            </h2>
            <Link to="/admin/approvals" className="story-link text-sm text-primary font-medium">Review all</Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {tasks.filter(t => t.status === "completion_requested").slice(0, 4).map(t => (
              <TaskCard key={t.id} task={t} canApprove compact />
            ))}
            {requested === 0 && (
              <div className="rounded-xl border bg-muted/30 p-6 text-center text-sm text-muted-foreground sm:col-span-2">
                No tasks awaiting approval right now.
              </div>
            )}
          </div>
        </div>

        <div className="surface-card p-5">
          <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" /> Activity feed
          </h2>
          <ul className="space-y-3 max-h-80 overflow-auto pr-1">
            {visibleNotifications.slice(0, 12).map(n => (
              <li key={n.id} className="flex items-start gap-3 text-sm animate-fade-in">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0">
                  <div className="leading-snug">
                    <span className="font-semibold">{n.actorName}</span>{" "}
                    <span className="text-muted-foreground">
                      {n.type === "task_started" && "started"}
                      {n.type === "task_stopped" && "stopped working on"}
                      {n.type === "completion_requested" && "requested completion of"}
                      {n.type === "completion_approved" && "approved"}
                      {n.type === "completion_rejected" && "rejected"}
                    </span>{" "}
                    <span className="font-medium">{n.taskTitle}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(n.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </li>
            ))}
            {visibleNotifications.length === 0 && (
              <li className="text-sm text-muted-foreground">No activity yet.</li>
            )}
          </ul>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="surface-card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">Recent tasks</h2>
            <Link to="/admin/tasks" className="story-link text-sm text-primary font-medium">View all</Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {recent.map(t => <TaskCard key={t.id} task={t} canManage compact />)}
          </div>
        </div>

        <div className="surface-card p-5">
          <h2 className="font-display text-lg font-semibold mb-4">Top performers</h2>
          <ul className="space-y-3">
            {(isSuperAdmin || !allowedAssignDepts
              ? [...employees]
              : employees.filter(e => allowedAssignDepts.includes((e.department || '').toLowerCase()))
            )
              .map(e => {
                const total = tasks.filter(t => t.assignee_id === e.id).length;
                const done  = tasks.filter(t => t.assignee_id === e.id && t.status === "completed").length;
                const pct = total ? Math.round((done / total) * 100) : 0;
                return { ...e, total, done, pct };
              })
              .sort((a, b) => b.pct - a.pct || b.done - a.done)
              .slice(0, 6)
              .map(e => (
                <li key={e.id} className="flex items-center gap-3">
                  <UserAvatar name={e.name} color={e.avatar_color ?? undefined} size="md" />
                  <div className="min-w-0 flex-1">
                    <Link to={`/admin/employees/${e.id}`} className="font-medium text-sm truncate hover:underline">{e.name}</Link>
                    <div className="text-xs text-muted-foreground truncate">{e.role} • {e.department || "No Dept"}</div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-gradient-primary transition-all duration-500" style={{ width: `${e.pct}%` }} />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold tabular-nums">{e.pct}%</div>
                    <div className="text-[10px] text-muted-foreground">{e.done}/{e.total}</div>
                  </div>
                </li>
              ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
