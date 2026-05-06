import { Link, useParams, useNavigate } from "react-router-dom";
import { useProfile, useUpdateProfile } from "@/hooks/useProfiles";
import { useTasks } from "@/hooks/useTasks";
import { useRankings, useVisibilitySettings } from "@/hooks/useSettings";
import { useDepartments, useMyDepartmentGrants } from "@/hooks/useDepartments";
import { UserAvatar } from "@/components/UserAvatar";
import { TaskCard } from "@/components/TaskCard";
import { ArrowLeft, Mail, Building2, CalendarDays, CheckCircle2, Clock, AlertTriangle, Download, Zap, Timer, TrendingUp, ShieldAlert, Pencil } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { downloadCSV, calculateTaskDuration } from "@/lib/csv-export";
import { formatDue } from "@/lib/task-utils";
import { useEffect, useState } from "react";
import { canViewProfile, getVisibilitySettings } from "@/lib/permissions";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid
} from "recharts";


export default function AdminEmployeeProfile() {
  const { id } = useParams();
  const { data: employee } = useProfile(id);
  const { user, profile } = useApp();
  const { data: rankings = { departments: [], jobTitles: [] } } = useRankings();
  const { data: visibility = {} } = useVisibilitySettings();
  const { data: departmentsData = [] } = useDepartments();
  const { data: myGrants = [] } = useMyDepartmentGrants(profile?.id);
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const isSuperAdmin = user?.role === 'superadmin';
  const { data: tasks = [] } = useTasks(isAdmin ? { role: "admin" } : undefined);
  const [editMode, setEditMode] = useState(false);

  // Matrix-aware canView: respects viewable_profile_depts, sees_profiles, etc.
  const canView = () => {
    if (!profile || !employee) return false;
    if (isSuperAdmin) return true;
    if (profile.id === employee.id) return true;
    return canViewProfile(profile, employee, myGrants, departmentsData, visibility);
  };

  // Can this viewer edit their own profile?
  const mySettings = profile ? getVisibilitySettings(profile, visibility) : null;
  const canSelfEdit = isSuperAdmin || !!mySettings?.can_edit_self;
  const isOwnProfile = profile?.id === employee?.id;


  if (!employee) {
    return (
      <div className="surface-card p-10 text-center">
        <p className="text-muted-foreground">Employee not found.</p>
        <Link to={isAdmin ? "/admin/employees" : "/me/team"} className="story-link text-primary font-medium mt-2 inline-block">Back to team</Link>
      </div>
    );
  }

  if (!canView()) {
    return (
      <div className="surface-card p-20 text-center flex flex-col items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
          <ShieldAlert className="h-10 w-10" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="text-muted-foreground mt-1">You do not have the required rank to view this performance report.</p>
        </div>
        <Link to={isAdmin ? "/admin/employees" : "/me/team"}>
           <Button variant="outline" className="mt-4">Return to Safety</Button>
        </Link>
      </div>
    );
  }

  const my = tasks.filter(t => t.assignee_id === employee.id);
  const doneTasks = my.filter(t => t.status === "completed");
  
  const total = my.length;
  const done  = doneTasks.length;
  const pending = my.filter(t => t.status !== "completed").length;
  const overdue = my.filter(t => t.status === "overdue").length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  // Efficiency: Avg hours per task
  const totalHours = doneTasks.reduce((acc, t) => {
    if (!t.started_at || !t.approved_at) return acc;
    const diff = new Date(t.approved_at).getTime() - new Date(t.started_at).getTime();
    return acc + (diff / 3600000);
  }, 0);
  const avgHours = done > 0 ? (totalHours / done).toFixed(1) : "—";

  // Punctuality: % of tasks finished before deadline
  const onTimeTasks = doneTasks.filter(t => {
    if (!t.approved_at) return false;
    const due = formatDue(t);
    return new Date(t.approved_at) <= due;
  }).length;
  const punctuality = done > 0 ? Math.round((onTimeTasks / done) * 100) : 0;

  // 7-Day Productivity Trend
  const last7Days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    const count = doneTasks.filter(t => t.approved_at?.slice(0, 10) === key).length;
    return { day: d.toLocaleDateString(undefined, { weekday: "short" }), count };
  });

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pb-4 border-b -mx-4 px-4 pt-2 mb-4 shadow-sm flex items-center justify-between">
        <Link to={isAdmin ? "/admin/employees" : "/me/team"} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to team
        </Link>
        <div className="flex items-center gap-2">
          {isOwnProfile && canSelfEdit && (
            <Button variant="outline" size="sm" onClick={() => setEditMode(e => !e)}>
              <Pencil className="h-4 w-4 mr-1" /> {editMode ? "Cancel Edit" : "Edit My Profile"}
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const rows = my.map(t => [
                  t.title, t.priority, t.status, t.due_date,
                  t.started_at ? new Date(t.started_at).toLocaleString() : "—",
                  t.approved_at ? new Date(t.approved_at).toLocaleString() : "—",
                  calculateTaskDuration(t)
                ]);
                downloadCSV(`${employee.name.replace(/\s+/g, '_')}_Performance_Full`,
                  ["Task", "Priority", "Status", "Due Date", "Started At", "Completed At", "Time Taken"],
                  rows
                );
              }}
            >
              <Download className="mr-2 h-4 w-4" /> Download Report
            </Button>
          )}
        </div>
      </div>

      <div className="surface-card p-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          <UserAvatar name={employee.name} color={employee.avatar_color ?? undefined} size="xl" />
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3">
               <h1 className="font-display text-3xl font-bold">{employee.name}</h1>
               <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                 {employee.department || "No Dept"}
               </span>
            </div>
            <p className="text-muted-foreground">{employee.role}</p>
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><Mail className="h-4 w-4" /> {employee.email}</span>
              <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4" /> Joined {employee.joined_at ? new Date(employee.joined_at).toLocaleDateString() : "—"}</span>
            </div>
          </div>
          <div className="flex gap-4 border-t pt-4 md:border-l md:border-t-0 md:pl-8 md:pt-0">
             <div className="text-center">
                <div className="text-2xl font-bold gradient-text">{pct}%</div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Success Rate</div>
             </div>
             <div className="text-center">
                <div className="text-2xl font-bold text-info">{avgHours}h</div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Avg Speed</div>
             </div>
             <div className="text-center">
                <div className="text-2xl font-bold text-success">{punctuality}%</div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Punctuality</div>
             </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat icon={CheckCircle2}  tone="success"     label="Completed" value={done} />
            <Stat icon={Clock}         tone="warning"     label="Pending"   value={pending} />
            <Stat icon={AlertTriangle} tone="destructive" label="Overdue"   value={overdue} />
          </div>

          <div className="surface-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" /> Productivity Trend
                </h2>
                <p className="text-xs text-muted-foreground">Tasks completed in the last 7 days</p>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={last7Days}>
                  <defs>
                    <linearGradient id="pgrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4}/>
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="count" stroke="hsl(var(--primary))" fill="url(#pgrad)" strokeWidth={3} name="Tasks" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="surface-card p-5">
            <h2 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
              <Zap className="h-5 w-5 text-warning" /> Performance Insight
            </h2>
            <div className="space-y-4">
              <InsightItem 
                icon={Timer} 
                label="Efficiency" 
                value={avgHours === "—" ? "N/A" : `${avgHours}h per task`}
                desc="Time from start to approval"
              />
              <InsightItem 
                icon={CheckCircle2} 
                label="On-Time Rate" 
                value={`${punctuality}%`}
                desc="Tasks finished before deadline"
              />
              <div className="mt-4 rounded-xl bg-muted/50 p-4 text-xs italic text-muted-foreground">
                "This employee is currently performing at {pct}% capacity with a {punctuality > 80 ? 'high' : 'standard'} punctuality rating."
              </div>
            </div>
          </div>

          <div className="surface-card p-5 overflow-hidden">
             <h2 className="font-display text-lg font-semibold mb-4">Task Durations</h2>
             <div className="space-y-3 max-h-60 overflow-auto pr-1">
                {doneTasks.slice(0, 10).map(t => (
                  <div key={t.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-sm">{t.title}</div>
                      <div className="text-[10px] text-muted-foreground">{new Date(t.approved_at!).toLocaleDateString()}</div>
                    </div>
                    <div className="text-right ml-2">
                      <div className="text-xs font-mono font-bold text-primary">{calculateTaskDuration(t)}</div>
                    </div>
                  </div>
                ))}
                {doneTasks.length === 0 && <p className="text-center py-4 text-sm text-muted-foreground">No completed tasks recorded.</p>}
             </div>
          </div>
        </div>
      </div>

      <div className="pt-4">
        <h2 className="font-display text-xl font-bold mb-4">Current Assignments</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {my.filter(t => t.status !== 'completed').map(t => (
            <TaskCard key={t.id} task={t} showAssignee={false} canManage={isAdmin} />
          ))}
          {my.filter(t => t.status !== 'completed').length === 0 && (
            <div className="surface-card p-12 text-center text-muted-foreground lg:col-span-3">
              No active tasks in progress.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }: any) {
  const tones: Record<string, string> = {
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    destructive: "bg-destructive/15 text-destructive",
  };
  return (
    <div className="surface-card p-5 flex items-center gap-4">
      <div className={`grid h-12 w-12 place-items-center rounded-xl ${tones[tone]}`}><Icon className="h-5 w-5" /></div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="font-display text-2xl font-bold">{value}</div>
      </div>
    </div>
  );
}

function InsightItem({ icon: Icon, label, value, desc }: any) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-1 grid h-8 w-8 place-items-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold">{label}</div>
        <div className="text-lg font-bold text-foreground leading-none my-0.5">{value}</div>
        <div className="text-[10px] text-muted-foreground">{desc}</div>
      </div>
    </div>
  );
}
