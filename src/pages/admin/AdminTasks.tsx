import { useMemo, useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { useTasks } from "@/hooks/useTasks";
import { useProfiles } from "@/hooks/useProfiles";
import { useVisibilitySettings, useRankings } from "@/hooks/useSettings";
import { useDepartments, useMyDepartmentGrants } from "@/hooks/useDepartments";
import { getVisibilitySettings } from "@/lib/permissions";
import { TaskCard } from "@/components/TaskCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, ListFilter, Building2, Briefcase, User, X, ChevronDown, LayoutGrid, List } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/UserAvatar";

import { TaskDetailDialog } from "@/components/TaskDetailDialog";
import type { Task } from "@/integrations/supabase/types";

export default function AdminTasks() {
  const { profile } = useApp();
  const { data: allTasks = [] } = useTasks({ role: "admin" });
  const { data: profiles = [] } = useProfiles();
  const { data: visibility = {} } = useVisibilitySettings();
  const { data: rankings = { departments: [], jobTitles: [], deptToJobs: {} } } = useRankings();
  const { data: departmentsData = [] } = useDepartments();
  const { data: myGrants = [] } = useMyDepartmentGrants(profile?.id);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | any>("all");
  const [priority, setPriority] = useState<"all" | any>("all");
  const [deptFilter, setDeptFilter] = useState<string | null>(null);
  const [jobFilter, setJobFilter] = useState<string | null>(null);
  const [employeeFilter, setEmployeeFilter] = useState<string | null>(null);
  const [employeeOpen, setEmployeeOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const location = useLocation();
  const highlightTaskId = location.state?.highlightTaskId;

  useEffect(() => {
    if (highlightTaskId && allTasks.length > 0) {
      const el = document.getElementById(`task-${highlightTaskId}`);
      if (el) {
        setTimeout(() => {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
      }
    }
  }, [highlightTaskId, allTasks.length, viewMode]);

  const isSuperAdmin = profile?.role === 'superadmin';

  // ── Hierarchy-Aware Settings ──────────────────────────────────────────
  const viewerSettings = useMemo(() => {
    if (!profile) return null;
    return getVisibilitySettings(profile, visibility) || { sees: [], sees_jobs: false, sees_profiles: false };
  }, [profile, visibility]);

  const allowedAssignDepts = useMemo(() => {
    if (isSuperAdmin) return null; // null = all
    if (!profile || !viewerSettings) return [] as string[];
    const assignable = (viewerSettings.assignable_depts || []).map((d: string) => d.toLowerCase());
    if (assignable.length > 0) return assignable;
    if (viewerSettings.can_assign_tasks && profile.department) return [profile.department.toLowerCase()];
    return [] as string[];
  }, [isSuperAdmin, profile, viewerSettings]);

  // ── Available Filter Options (hierarchy-gated) ────────────────────────
  const availableDepts = useMemo(() => {
    const allDepts = (rankings.departments && rankings.departments.length > 0)
      ? rankings.departments
      : departmentsData.map(d => d.name);

    if (isSuperAdmin || !allowedAssignDepts) return allDepts;

    // Only show departments the user can see
    const seenDepts = (viewerSettings?.sees || []).map((d: string) => d.toLowerCase());
    const all = new Set([...allowedAssignDepts, ...seenDepts]);
    return allDepts.filter(d => all.has(d.toLowerCase()));
  }, [rankings.departments, departmentsData, isSuperAdmin, allowedAssignDepts, viewerSettings]);

  const availableJobs = useMemo(() => {
    // If a department is filtered, show only that dept's jobs
    if (deptFilter && rankings.deptToJobs?.[deptFilter]) {
      return rankings.deptToJobs[deptFilter];
    }
    // Otherwise show all job titles from ranked list
    return rankings.jobTitles || [];
  }, [deptFilter, rankings.deptToJobs, rankings.jobTitles]);

  // Employees available for filter (hierarchy-gated, same as create task logic)
  const filterableEmployees = useMemo(() => {
    let visible = profiles.filter(e => isSuperAdmin || e.role !== 'superadmin');

    if (!isSuperAdmin && profile) {
      const seenDepts = new Set([
        ...(allowedAssignDepts || []),
        ...(viewerSettings?.sees || []).map((d: string) => d.toLowerCase())
      ]);
      if (seenDepts.size > 0) {
        visible = visible.filter(e => seenDepts.has((e.department || '').toLowerCase()));
      }
    }

    // Apply current dept/job filters to narrow the employee list
    if (deptFilter) {
      visible = visible.filter(e => (e.department || '').toLowerCase() === deptFilter.toLowerCase());
    }
    if (jobFilter) {
      visible = visible.filter(e => (e.job_title || '').toLowerCase() === jobFilter.toLowerCase());
    }

    return visible.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [profiles, isSuperAdmin, profile, allowedAssignDepts, viewerSettings, deptFilter, jobFilter]);

  // ── Filtered Tasks ────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const canManageTask = (task: any) => {
      if (isSuperAdmin) return true;
      if (task.assignee_id === profile?.id) return true; // Always see own tasks
      const assignee = profiles.find(p => p.id === task.assignee_id);
      const assigneeDept = (assignee?.department || '').toLowerCase();
      if (!allowedAssignDepts) return false;
      return allowedAssignDepts.includes(assigneeDept);
    };

    return allTasks.filter(t => {
      // 1. Stealth Mode
      const assignee = profiles.find(p => p.id === t.assignee_id);
      if (assignee?.role === 'superadmin' && assignee.id !== profile?.id) return false;

      // 2. Scope to allowed departments (and own tasks)
      if (!canManageTask(t)) return false;

      // 3. Department filter
      if (deptFilter) {
        const assigneeDept = (assignee?.department || '').toLowerCase();
        if (assigneeDept !== deptFilter.toLowerCase()) return false;
      }

      // 4. Job title filter
      if (jobFilter) {
        const assigneeJob = (assignee?.job_title || '').toLowerCase();
        if (assigneeJob !== jobFilter.toLowerCase()) return false;
      }

      // 5. Employee filter
      if (employeeFilter) {
        if (t.assignee_id !== employeeFilter) return false;
      }

      // 6. Standard filters
      const matchesSearch = q === "" ||
        (t.title && t.title.toLowerCase().includes(q.toLowerCase())) ||
        (t.description && t.description.toLowerCase().includes(q.toLowerCase()));
      const matchesStatus = status === "all" || t.status === status;
      const matchesPriority = priority === "all" || t.priority === priority;

      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [allTasks, profiles, q, status, priority, isSuperAdmin, allowedAssignDepts, profile?.id, deptFilter, jobFilter, employeeFilter]);

  // ── Stats ─────────────────────────────────────────────────────────────
  const activeFilterCount = [deptFilter, jobFilter, employeeFilter].filter(Boolean).length
    + (status !== "all" ? 1 : 0) + (priority !== "all" ? 1 : 0);

  const clearAllFilters = () => {
    setDeptFilter(null);
    setJobFilter(null);
    setEmployeeFilter(null);
    setStatus("all");
    setPriority("all");
    setQ("");
  };

  // Find currently selected employee for display
  const selectedEmpObj = employeeFilter ? profiles.find(p => p.id === employeeFilter) : null;

  return (
    <div className="space-y-4">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pb-4 border-b -mx-4 px-4 pt-2 mb-2 shadow-sm space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold">All tasks</h1>
            <p className="text-muted-foreground text-sm">
              {filtered.length} task{filtered.length !== 1 ? 's' : ''} found
              {activeFilterCount > 0 && <span className="text-primary"> · {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border overflow-hidden">
              <button onClick={() => setViewMode("grid")}
                className={cn("p-2 transition-colors", viewMode === "grid" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50")}>
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button onClick={() => setViewMode("list")}
                className={cn("p-2 transition-colors", viewMode === "list" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50")}>
                <List className="h-4 w-4" />
              </button>
            </div>
            <Button asChild className="bg-gradient-primary text-white shadow-glow hover:opacity-95">
              <Link to="/admin/tasks/new"><Plus className="h-4 w-4" /> Create task</Link>
            </Button>
          </div>
        </div>

        {/* ── Search + Filter Bar ──────────────────────────────── */}
        <div className="surface-card p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9 h-9" placeholder="Search tasks…" value={q} onChange={e => setQ(e.target.value)} />
            </div>

            {/* Department Filter */}
            <Select value={deptFilter || "all"} onValueChange={(v: any) => {
              setDeptFilter(v === "all" ? null : v);
              // Reset job & employee when dept changes
              setJobFilter(null);
              setEmployeeFilter(null);
            }}>
              <SelectTrigger className={cn("w-[160px] h-9 text-xs", deptFilter && "border-primary/50 bg-primary/5")}>
                <Building2 className="h-3.5 w-3.5 mr-1 shrink-0" />
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {availableDepts.map(d => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Job Title Filter */}
            <Select value={jobFilter || "all"} onValueChange={(v: any) => {
              setJobFilter(v === "all" ? null : v);
              setEmployeeFilter(null);
            }}>
              <SelectTrigger className={cn("w-[160px] h-9 text-xs", jobFilter && "border-primary/50 bg-primary/5")}>
                <Briefcase className="h-3.5 w-3.5 mr-1 shrink-0" />
                <SelectValue placeholder="Job Title" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Titles</SelectItem>
                {availableJobs.map(j => (
                  <SelectItem key={j} value={j}>{j}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Employee Filter */}
            <Popover open={employeeOpen} onOpenChange={setEmployeeOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox"
                  className={cn("w-[180px] h-9 text-xs justify-between font-normal",
                    employeeFilter && "border-primary/50 bg-primary/5")}>
                  <User className="h-3.5 w-3.5 mr-1 shrink-0" />
                  {selectedEmpObj ? selectedEmpObj.name : "All Employees"}
                  <ChevronDown className="ml-auto h-3 w-3 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[240px]" align="start">
                <Command>
                  <CommandInput placeholder="Search employee..." className="h-9" />
                  <CommandList>
                    <CommandEmpty>No employee found.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="__all__"
                        onSelect={() => { setEmployeeFilter(null); setEmployeeOpen(false); }}
                        className="text-xs"
                      >
                        All Employees
                      </CommandItem>
                      {filterableEmployees.map(e => (
                        <CommandItem
                          key={e.id}
                          value={`${e.name} ${e.username} ${e.job_title}`}
                          onSelect={() => { setEmployeeFilter(e.id); setEmployeeOpen(false); }}
                          className="flex items-center gap-2 text-xs"
                        >
                          <UserAvatar name={e.name} color={e.avatar_color ?? undefined} size="sm" />
                          <div className="flex flex-col min-w-0">
                            <span className="font-medium truncate">{e.name}</span>
                            <span className="text-[9px] text-muted-foreground leading-tight truncate">
                              {e.department}{e.job_title ? ` · ${e.job_title}` : ''}
                            </span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Status & Priority Row */}
          <div className="flex flex-wrap items-center gap-2">
            <ListFilter className="h-3.5 w-3.5 text-muted-foreground" />
            <Select value={status} onValueChange={(v: any) => setStatus(v)}>
              <SelectTrigger className={cn("w-[140px] h-8 text-xs", status !== "all" && "border-primary/50 bg-primary/5")}>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completion_requested">Completion Requested</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priority} onValueChange={(v: any) => setPriority(v)}>
              <SelectTrigger className={cn("w-[130px] h-8 text-xs", priority !== "all" && "border-primary/50 bg-primary/5")}>
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>

            {/* Active filter badges */}
            {activeFilterCount > 0 && (
              <>
                <div className="h-4 w-px bg-border mx-1" />
                {deptFilter && (
                  <Badge variant="secondary" className="text-[10px] gap-1 h-6 cursor-pointer hover:bg-destructive/10"
                    onClick={() => { setDeptFilter(null); setJobFilter(null); setEmployeeFilter(null); }}>
                    <Building2 className="h-2.5 w-2.5" /> {deptFilter} <X className="h-2.5 w-2.5" />
                  </Badge>
                )}
                {jobFilter && (
                  <Badge variant="secondary" className="text-[10px] gap-1 h-6 cursor-pointer hover:bg-destructive/10"
                    onClick={() => { setJobFilter(null); setEmployeeFilter(null); }}>
                    <Briefcase className="h-2.5 w-2.5" /> {jobFilter} <X className="h-2.5 w-2.5" />
                  </Badge>
                )}
                {employeeFilter && selectedEmpObj && (
                  <Badge variant="secondary" className="text-[10px] gap-1 h-6 cursor-pointer hover:bg-destructive/10"
                    onClick={() => setEmployeeFilter(null)}>
                    <User className="h-2.5 w-2.5" /> {selectedEmpObj.name} <X className="h-2.5 w-2.5" />
                  </Badge>
                )}
                <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground hover:text-destructive px-2"
                  onClick={clearAllFilters}>
                  Clear all
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Task Grid / List ──────────────────────────────────── */}
      {viewMode === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(t => {
            const assignee = profiles.find(p => p.id === t.assignee_id);
            const assigneeDept = (assignee?.department || '').toLowerCase();
            const canManageTask = isSuperAdmin || (allowedAssignDepts?.includes(assigneeDept) ?? false);
            return (
              <TaskCard
                key={t.id}
                task={t}
                canManage={canManageTask}
                canApprove={canManageTask || t.approver_ids?.includes(profile?.id ?? "")}
                canComplete={t.assignee_id === profile?.id}
                id={`task-${t.id}`}
                highlighted={highlightTaskId === t.id}
              />
            );
          })}
          {filtered.length === 0 && (
            <div className="surface-card p-10 text-center text-muted-foreground sm:col-span-2 xl:col-span-3 space-y-2">
              <p className="text-lg font-medium">No tasks match these filters</p>
              <p className="text-xs">Try adjusting your department, job, or status filters.</p>
              {activeFilterCount > 0 && (
                <Button variant="outline" size="sm" onClick={clearAllFilters}>Clear all filters</Button>
              )}
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
                  <th className="px-4 py-3 text-left border-b min-w-[120px]">Assignee</th>
                  <th className="px-4 py-3 text-left border-b min-w-[120px]">Department</th>
                  <th className="px-4 py-3 text-center border-b min-w-[100px]">Status</th>
                  <th className="px-4 py-3 text-center border-b min-w-[100px]">Priority</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const assignee = profiles.find(p => p.id === t.assignee_id);
                  const assigneeDept = assignee?.department || '—';
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
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {assignee && <UserAvatar name={assignee.name} color={assignee.avatar_color ?? undefined} size="sm" />}
                          <span className="text-xs truncate">{assignee?.name || '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{assigneeDept}</td>
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
                    <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground space-y-2">
                      <p className="text-lg font-medium">No tasks match these filters</p>
                      <p className="text-xs">Try adjusting your filters.</p>
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
          canManage={isSuperAdmin || (allowedAssignDepts?.includes((profiles.find(p => p.id === selectedTask.assignee_id)?.department || '').toLowerCase()) ?? false)}
          canApprove={isSuperAdmin || (allowedAssignDepts?.includes((profiles.find(p => p.id === selectedTask.assignee_id)?.department || '').toLowerCase()) ?? false) || selectedTask.approver_ids?.includes(profile?.id ?? "")}
          canComplete={selectedTask.assignee_id === profile?.id}
        />
      )}
    </div>
  );
}
