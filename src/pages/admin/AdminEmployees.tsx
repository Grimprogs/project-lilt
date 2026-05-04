import { useState, useMemo, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { useProfiles, useCreateEmployee, useUpdateProfile, useDeleteEmployee, useDeleteMetadata } from "@/hooks/useProfiles";
import { useTasks } from "@/hooks/useTasks";
import { useRankings, useUpdateRankings, useVisibilitySettings, useUpdateVisibilitySettings, VisibilityMap, Rankings } from "@/hooks/useSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/UserAvatar";
import { Search, Plus, Pencil, Trash2, Mail, Building2, Eye, Briefcase, Check, ChevronsUpDown, X, Filter, ListOrdered, ShieldCheck, Settings2, LayoutGrid, Shield } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useApp } from "@/context/AppContext";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from "lucide-react";

const empty = { name: "", username: "", password: "", email: "", jobTitle: "", department: "", role: "employee" };

function getRank(item: string | null | undefined, rankedList: string[]) {
  if (!item) return 9999;
  const idx = rankedList.findIndex(x => x.toLowerCase() === item.toLowerCase());
  return idx >= 0 ? idx : 9998;
}

/** Normalize a job title: trim + Title Case for deduplication display */
function normalize(s: string) {
  return s.trim().replace(/\b\w/g, c => c.toUpperCase());
}

/** 
 * Hierarchical Permission Check:
 * An admin can only manage someone who is BELOW them in the rankings.
 */
function canManage(currentAdmin: any, target: any, rankings: { departments: string[], jobTitles: string[] }, visibility: VisibilityMap) {
  if (!currentAdmin) return false;
  if (currentAdmin.id === target.id) return true; // Can manage yourself
  if (currentAdmin.role === 'superadmin') return true;

  // Check visibility map first
  const mySettings = visibility[currentAdmin.department] || { sees: [currentAdmin.department], sees_jobs: true, sees_profiles: true };
  const canSeeDept = mySettings.sees.includes(target.department);
  if (!canSeeDept) return false;

  // Rule 1: Admins can ALWAYS manage Employees in allowed depts
  if (target.role === 'employee') return true;

  // Rule 2: If both are Admins, check hierarchy
  const adminDeptRank = getRank(currentAdmin.department, rankings.departments);
  const targetDeptRank = getRank(target.department, rankings.departments);

  if (adminDeptRank < targetDeptRank) return true;
  if (adminDeptRank > targetDeptRank) return false;

  // Same department rank, check job title rank
  const adminJobRank = getRank(currentAdmin.job_title, rankings.jobTitles);
  const targetJobRank = getRank(target.job_title, rankings.jobTitles);

  return adminJobRank < targetJobRank;
}

function canViewProfile(currentAdmin: any, target: any, visibility: VisibilityMap) {
  if (currentAdmin.id === target.id) return true;
  if (currentAdmin.role === 'superadmin') return true;
  const mySettings = visibility[currentAdmin.department];
  if (!mySettings) return true; // Default to true if not set
  return mySettings.sees_profiles && mySettings.sees.includes(target.department);
}

function canSeeJobTitle(currentAdmin: any, target: any, visibility: VisibilityMap) {
  if (currentAdmin.id === target.id) return true;
  if (currentAdmin.role === 'superadmin') return true;
  const mySettings = visibility[currentAdmin.department];
  if (!mySettings) return true;
  return mySettings.sees_jobs && mySettings.sees.includes(target.department);
}

function getVisibilitySettings(admin: any, visibility: VisibilityMap) {
  if (!admin) return null;
  const dept = admin.department || "";
  const job = admin.job_title || "";
  // Check specific Dept:JobTitle first
  const specificKey = `${dept}:${job}`;
  if (visibility[specificKey]) return visibility[specificKey];
  // Fallback to general Department settings
  return visibility[dept] || null;
}

function canAccessControlCenter(admin: any, visibility: VisibilityMap) {
  if (!admin) return false;
  if (admin.role === 'superadmin') return true;
  const settings = getVisibilitySettings(admin, visibility);
  return !!settings?.can_access_control;
}

function canEditControlCenter(admin: any, visibility: VisibilityMap) {
  if (!admin) return false;
  if (admin.role === 'superadmin') return true;
  const settings = getVisibilitySettings(admin, visibility);
  return !!settings?.can_edit_control;
}


export default function AdminEmployees() {
  const { user, profile } = useApp();
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const isSuperAdmin = user?.role === 'superadmin';
  const { data: employees = [] } = useProfiles();
  const { data: tasks = [] } = useTasks(isAdmin ? { role: "admin" } : undefined);
  const createEmployee = useCreateEmployee();
  const updateProfile = useUpdateProfile();
  const deleteEmployee = useDeleteEmployee();

  const [q, setQ] = useState("");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState(empty);

  // ── Job title filter dropdown (list) ─────────────────────────────────────
  const [openTitleFilter, setOpenTitleFilter] = useState(false);
  const [titleFilter, setTitleFilter] = useState<string | null>(null);

  // ── Department filter dropdown (list) ────────────────────────────────────
  const [openDeptFilter, setOpenDeptFilter] = useState(false);
  const [deptFilter, setDeptFilter] = useState<string | null>(null);

  // Deduplicated, normalized, sorted job titles from DB
  const jobTitles = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const e of employees) {
      if (!e.job_title) continue;
      const norm = normalize(e.job_title);
      const key = norm.toLowerCase();
      if (!seen.has(key)) { seen.add(key); result.push(norm); }
    }
    return result.sort((a, b) => a.localeCompare(b));
  }, [employees]);

  // Deduplicated, normalized, sorted departments from DB
  const departments = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const e of employees) {
      if (!e.department) continue;
      const norm = normalize(e.department);
      const key = norm.toLowerCase();
      if (!seen.has(key)) { seen.add(key); result.push(norm); }
    }
    return result.sort((a, b) => a.localeCompare(b));
  }, [employees]);

  // ── Filter & Sort employees ───────────────────────────────────────────────
  const { data: rankings = { departments: [], jobTitles: [] } } = useRankings();
  const updateRankings = useUpdateRankings();
  const deleteMetadata = useDeleteMetadata();

  const { data: visibility = {} } = useVisibilitySettings();
  const updateVisibility = useUpdateVisibilitySettings();

  const [openRankings, setOpenRankings] = useState(false);
  const [rankingsForm, setRankingsForm] = useState<Rankings>({ departments: [], jobTitles: [], deptToJobs: {} });
  const [visibilityForm, setVisibilityForm] = useState<VisibilityMap>({});
  const [selectedRankDept, setSelectedRankDept] = useState<string | null>(null);

  // Filtered options for the Add/Edit form based on hierarchy
  const availableDeptOptions = useMemo(() => {
    const source = rankings.departments.length > 0 ? rankings.departments : departments;
    if (!profile || isSuperAdmin) return source;
    const adminDeptRank = getRank(profile.department, rankings.departments);
    // Only show departments that are at or below the admin's rank (larger rank number)
    return source.filter(d => getRank(d, rankings.departments) >= adminDeptRank);
  }, [rankings.departments, departments, profile, isSuperAdmin]);

  const availableJobOptions = useMemo(() => {
    const dept = form.department || profile?.department;
    let source = jobTitles;

    if (dept && rankings.deptToJobs?.[dept] && rankings.deptToJobs[dept].length > 0) {
      source = rankings.deptToJobs[dept];
    } else if (rankings.jobTitles.length > 0) {
      source = rankings.jobTitles;
    }

    if (!profile || isSuperAdmin) return source;

    // Check hierarchy if needed
    const adminDeptRank = getRank(profile.department, rankings.departments);
    const targetDeptRank = getRank(form.department, rankings.departments);

    if (adminDeptRank === targetDeptRank) {
      const adminJobRank = getRank(profile.job_title, rankings.jobTitles);
      return source.filter(j => getRank(j, rankings.jobTitles) >= adminJobRank);
    }

    return source;
  }, [jobTitles, rankings, profile, form.department, isSuperAdmin]);

  const filteredAndSorted = useMemo(() => {
    const filtered = employees.filter(e => {
      // 1. Stealth Mode: Super Admins are invisible to everyone except themselves
      if (e.role === 'superadmin' && e.id !== profile?.id) {
        return false;
      }

      // 2. Security Map & Hierarchy
      if (profile && !canManage(profile, e, rankings, visibility) && e.id !== profile.id && !isSuperAdmin) {
        // If they can't even "Manage", should they be visible?
        // Let's check if they can at least "See" the dept
        const myS = visibility[profile.department] || { sees: [profile.department] };
        if (!myS.sees.includes(e.department || "")) return false;
      }

      const email = e.email ?? "";
      const dept = e.department ?? "";
      const title = e.job_title ?? "";
      const matchesSearch = [e.name, e.username, email, title, dept]
        .some(v => v.toLowerCase().includes(q.toLowerCase()));
      const matchesTitle = !titleFilter || normalize(title).toLowerCase() === titleFilter.toLowerCase();
      const matchesDept = !deptFilter || normalize(dept).toLowerCase() === deptFilter.toLowerCase();
      return matchesSearch && matchesTitle && matchesDept;
    });

    return filtered.sort((a, b) => {
      const deptA = getRank(a.department, rankings.departments);
      const deptB = getRank(b.department, rankings.departments);
      if (deptA !== deptB) return deptA - deptB;

      const jobA = getRank(a.job_title, rankings.jobTitles);
      const jobB = getRank(b.job_title, rankings.jobTitles);
      if (jobA !== jobB) return jobA - jobB;

      return a.name.localeCompare(b.name);
    });
  }, [employees, q, titleFilter, deptFilter, rankings, isSuperAdmin, visibility, profile]);

  const groupedByDept = useMemo(() => {
    const groups: { dept: string, emps: typeof filteredAndSorted }[] = [];
    for (const e of filteredAndSorted) {
      const d = e.department || "Other";
      let group = groups.find(g => g.dept === d);
      if (!group) {
        group = { dept: d, emps: [] };
        groups.push(group);
      }
      group.emps.push(e);
    }
    return groups;
  }, [filteredAndSorted]);

  const startCreate = () => { setEditing(null); setForm(empty); setOpen(true); };
  const startEdit = (e: any) => {
    setEditing(e);
    setForm({ name: e.name, username: e.username, password: "", email: e.email || "", jobTitle: e.job_title || "", department: e.department || "", role: e.role || "employee" });
    setOpen(true);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.username) { toast.error("Name and username are required."); return; }
    const normalizedJobTitle = form.jobTitle ? normalize(form.jobTitle) : null;
    if (editing) {
      // Detect if email or password changed (for auth sync)
      const emailChanged = form.email && form.email !== (editing.email || '');
      const passwordChanged = form.password && form.password.trim().length > 0;

      updateProfile.mutate({
        id: editing.id,
        patch: {
          name: form.name,
          username: form.username,
          email: form.email || null,
          role: form.role as any,
          job_title: normalizedJobTitle,
          department: form.department || null,
        },
        ...(emailChanged ? { newEmail: form.email } : {}),
        ...(passwordChanged ? { newPassword: form.password } : {}),
      }, {
        onSuccess: (data: any) => {
          setEditing(null);
          toast.success(data.message || ("Employee updated" + (emailChanged || passwordChanged ? " (auth credentials synced)" : "")));
        },
        onError: (err: any) => toast.error(err?.message ?? "Update failed"),
      });
    } else {
      if (!form.email.trim() || !form.password.trim()) {
        toast.error("Email and password are required to create an employee.");
        return;
      }
      createEmployee.mutate({
        name: form.name,
        username: form.username,
        email: form.email,
        password: form.password,
        department: form.department || undefined,
        job_title: normalizedJobTitle || undefined,
        role: form.role,
      }, {
        onSuccess: () => toast.success("User added"),
        onError: (err: any) => toast.error(err?.message ?? "Create failed"),
      });
    }
    setOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">{isAdmin ? "Employees" : "Team Directory"}</h1>
          <p className="text-muted-foreground">{isAdmin ? "Manage your team, credentials, and roles." : "Find and connect with your colleagues."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Text search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search users" className="pl-9 w-52" value={q} onChange={e => setQ(e.target.value)} />
          </div>

          {/* Job title filter */}
          <Popover open={openTitleFilter} onOpenChange={setOpenTitleFilter}>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("justify-between font-normal gap-2 min-w-[160px]", titleFilter && "border-primary/60 bg-primary/5")}>
                <Briefcase className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-left truncate">{titleFilter ?? "All job titles"}</span>
                <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-56" align="start">
              <Command>
                <CommandInput placeholder="Filter by title..." />
                <CommandList>
                  <CommandEmpty>No titles found.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="__all__"
                      onSelect={() => { setTitleFilter(null); setOpenTitleFilter(false); }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", !titleFilter ? "opacity-100" : "opacity-0")} />
                      All job titles
                    </CommandItem>
                    {jobTitles.map(t => (
                      <CommandItem
                        key={t}
                        value={t}
                        onSelect={() => { setTitleFilter(t); setOpenTitleFilter(false); }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", titleFilter?.toLowerCase() === t.toLowerCase() ? "opacity-100" : "opacity-0")} />
                        {t}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Department filter */}
          <Popover open={openDeptFilter} onOpenChange={setOpenDeptFilter}>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("justify-between font-normal gap-2 min-w-[160px]", deptFilter && "border-primary/60 bg-primary/5")}>
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-left truncate">{deptFilter ?? "All departments"}</span>
                <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-56" align="start">
              <Command>
                <CommandInput placeholder="Filter by department..." />
                <CommandList>
                  <CommandEmpty>No departments found.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="__all_depts__"
                      onSelect={() => { setDeptFilter(null); setOpenDeptFilter(false); }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", !deptFilter ? "opacity-100" : "opacity-0")} />
                      All departments
                    </CommandItem>
                    {departments.map(d => (
                      <CommandItem
                        key={d}
                        value={d}
                        onSelect={() => { setDeptFilter(d); setOpenDeptFilter(false); }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", deptFilter?.toLowerCase() === d.toLowerCase() ? "opacity-100" : "opacity-0")} />
                        {d}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Clear filter chips */}
          {titleFilter && (
            <button
              onClick={() => setTitleFilter(null)}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
            >
              {titleFilter} <X className="h-3 w-3" />
            </button>
          )}
          {deptFilter && (
            <button
              onClick={() => setDeptFilter(null)}
              className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-500/20 transition-colors"
            >
              {deptFilter} <X className="h-3 w-3" />
            </button>
          )}

          {/* Grid / Table toggle */}
          <div className="hidden md:flex rounded-lg border p-0.5 bg-muted/40">
            <button onClick={() => setView("grid")} className={`px-2.5 py-1 text-xs rounded-md ${view === "grid" ? "bg-background shadow-soft" : "text-muted-foreground"}`}>Grid</button>
            <button onClick={() => setView("table")} className={`px-2.5 py-1 text-xs rounded-md ${view === "table" ? "bg-background shadow-soft" : "text-muted-foreground"}`}>Table</button>
          </div>

          {/* Control Center Settings */}
          {canAccessControlCenter(profile, visibility) && (
            <Button
              variant="outline"
              onClick={() => {
                setRankingsForm({
                  departments: [...rankings.departments],
                  jobTitles: [...rankings.jobTitles],
                  deptToJobs: rankings.deptToJobs ? { ...rankings.deptToJobs } : {}
                });
                setVisibilityForm({ ...visibility });
                setSelectedRankDept(rankings.departments[0] || null);
                setOpenRankings(true);
              }}
            >
              <Settings2 className="h-4 w-4 mr-2" /> Control Center
            </Button>
          )}

          {/* Add user dialog (Admin only) */}
          {isAdmin && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button onClick={startCreate} className="bg-gradient-primary text-white shadow-glow hover:opacity-95">
                  <Plus className="h-4 w-4" /> Add user
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editing ? "Edit user" : "Add new user"}</DialogTitle>
                  <DialogDescription>{editing ? "Update profile and credentials." : "Create a new account with credentials they'll use to sign in."}</DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2 space-y-1.5">
                    <Label>Full name</Label>
                    <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Jane Doe" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Username</Label>
                    <Input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="jane" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Password</Label>
                    <Input value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••" required={!editing} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email</Label>
                    <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="jane@ztasks.io" required={!editing} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Role</Label>
                    <select
                      value={form.role}
                      onChange={e => setForm({ ...form, role: e.target.value })}
                      className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="employee">Employee</option>
                      <option value="admin">Admin</option>
                      {isSuperAdmin && <option value="superadmin">Super Admin</option>}
                    </select>
                  </div>

                  <div className="space-y-1.5 flex flex-col">
                    <Label>Job title</Label>
                    <select
                      value={form.jobTitle}
                      onChange={e => setForm({ ...form, jobTitle: e.target.value })}
                      className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="">Select job title...</option>
                      {availableJobOptions.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5 flex flex-col">
                    <Label>Department</Label>
                    <select
                      value={form.department}
                      onChange={e => setForm({ ...form, department: e.target.value })}
                      className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="">Select department...</option>
                      {availableDeptOptions.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>

                  <DialogFooter className="sm:col-span-2 mt-2">
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button type="submit" className="bg-gradient-primary text-white">{editing ? "Save changes" : "Add user"}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <Dialog open={openRankings} onOpenChange={setOpenRankings}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Administrative Control Center</DialogTitle>
            <DialogDescription>
              Manage organizational priority and departmental visibility restrictions.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="rankings" className="mt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="rankings" className="flex items-center gap-2"><ListOrdered className="h-4 w-4" /> Rankings</TabsTrigger>
              <TabsTrigger value="security" className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Access Matrix</TabsTrigger>
            </TabsList>

            <TabsContent value="rankings" className="py-4 space-y-6">
              <Tabs defaultValue="departmental" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6 h-9 p-1 bg-muted/50">
                  <TabsTrigger value="departmental" className="text-xs gap-2">
                    <LayoutGrid className="h-3.5 w-3.5" /> Departmental Roles
                  </TabsTrigger>
                  <TabsTrigger value="global" className="text-xs gap-2">
                    <Shield className="h-3.5 w-3.5" /> Global Seniority (All Roles)
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="departmental" className="space-y-6">
                  <div className="grid gap-6 md:grid-cols-[1fr_2fr]">
                    {/* Left: Department List (Master) */}
                    <div className="space-y-4 border-r pr-6">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-semibold">1. Rank Departments</Label>
                        {isSuperAdmin && (
                          <CreateMetadataButton
                            label="Dept"
                            onAdd={v => setRankingsForm(prev => ({ ...prev, departments: [...prev.departments, normalize(v)] }))}
                          />
                        )}
                      </div>
                      <RankListBuilder
                        items={rankingsForm.departments}
                        available={departments}
                        viewerItem={profile?.department}
                        seniorityList={rankings.departments}
                        onChange={v => setRankingsForm({ ...rankingsForm, departments: v })}
                        onDeleteGlobal={isSuperAdmin ? (v => deleteMetadata.mutate({ type: 'department', value: v }, {
                          onSuccess: () => {
                            toast.success(`Department "${v}" deleted`);
                            setRankingsForm(prev => ({ ...prev, departments: prev.departments.filter(x => x !== v) }));
                            if (selectedRankDept === v) setSelectedRankDept(null);
                          }
                        })) : undefined}
                      />
                      <div className="pt-4 border-t">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Select to Manage Roles</p>
                        <div className="space-y-1">
                          {(() => {
                            const currentSettings = profile ? getVisibilitySettings(profile, visibility) : null;
                            const currentUserManagedDepts = isSuperAdmin ? null : (currentSettings?.manages_depts || []);

                            const visibleDepts = rankingsForm.departments.filter(d => 
                              isSuperAdmin || (currentUserManagedDepts && currentUserManagedDepts.includes(d))
                            );

                            return visibleDepts.map(d => (
                              <button
                                key={d}
                                onClick={() => setSelectedRankDept(d)}
                                className={cn(
                                  "w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-all text-left",
                                  selectedRankDept === d ? "bg-primary text-white shadow-soft" : "hover:bg-muted"
                                )}
                              >
                                <span className="truncate">{d}</span>
                                <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
                              </button>
                            ));
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* Right: Job Title List for Selected Dept (Detail) */}
                    <div className="space-y-4">
                      {selectedRankDept ? (
                        <div className="animate-in fade-in slide-in-from-right-4">
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <h3 className="font-semibold flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-primary" /> {selectedRankDept} Roles
                              </h3>
                              <p className="text-xs text-muted-foreground">Define and rank roles within this department.</p>
                            </div>
                            {(isSuperAdmin || canEditControlCenter(profile, visibility)) && (
                              <CreateMetadataButton
                                label="Role"
                                onAdd={v => {
                                  const normalized = normalize(v);
                                  setRankingsForm(prev => {
                                    const existing = prev.deptToJobs?.[selectedRankDept] || [];
                                    return {
                                      ...prev,
                                      jobTitles: Array.from(new Set([...prev.jobTitles, normalized])),
                                      deptToJobs: {
                                        ...prev.deptToJobs,
                                        [selectedRankDept]: [...existing, normalized]
                                      }
                                    };
                                  });
                                }}
                              />
                            )}
                          </div>
                          <RankListBuilder
                            items={rankingsForm.deptToJobs?.[selectedRankDept] || []}
                            available={rankingsForm.jobTitles}
                            viewerItem={profile?.job_title}
                            seniorityList={rankingsForm.jobTitles}
                            onChange={v => {
                              if (isSuperAdmin || canEditControlCenter(profile, visibility)) {
                                setRankingsForm(prev => ({
                                  ...prev,
                                  deptToJobs: {
                                    ...prev.deptToJobs,
                                    [selectedRankDept]: v
                                  }
                                }));
                              }
                            }}
                            onDeleteGlobal={isSuperAdmin ? (v => deleteMetadata.mutate({ type: 'job_title', value: v }, {
                              onSuccess: () => {
                                toast.success(`Role "${v}" deleted`);
                                setRankingsForm(prev => ({
                                  ...prev,
                                  jobTitles: prev.jobTitles.filter(x => x !== v),
                                  deptToJobs: Object.fromEntries(
                                    Object.entries(prev.deptToJobs || {}).map(([k, roles]) => [k, (roles as string[]).filter(r => r !== v)])
                                  )
                                }));
                              }
                            })) : undefined}
                          />
                        </div>
                      ) : (
                        <div className="flex h-40 items-center justify-center text-muted-foreground italic text-sm border-2 border-dashed rounded-lg">
                          Select a department on the left to manage its roles.
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="global" className="space-y-6">
                  <div className="max-w-2xl mx-auto space-y-4">
                    <div className="rounded-lg border bg-blue-50/30 p-4 border-blue-100">
                      <h3 className="text-sm font-bold text-blue-800 flex items-center gap-2 mb-1">
                        <Shield className="h-4 w-4" /> Global Job Seniority
                      </h3>
                      <p className="text-xs text-blue-600/80 italic">
                        Admins can only manage roles that are ranked **below them** in this list. 
                        <strong> Move "Founder" to the top (#0) to give it full seniority.</strong>
                      </p>
                    </div>

                    <div className="rounded-md border p-4 bg-card shadow-sm">
                      <RankListBuilder
                        items={rankingsForm.jobTitles}
                        available={rankingsForm.jobTitles}
                        adminRank={isSuperAdmin ? -1 : getRank(profile?.job_title, rankingsForm.jobTitles)}
                        onChange={v => {
                          if (isSuperAdmin || (profile?.department === 'Management' && canEditControlCenter(profile, visibility))) {
                            setRankingsForm(prev => ({ ...prev, jobTitles: v }));
                          } else {
                            toast.error("Only SuperAdmins or top-level Management can reorder global seniority.");
                          }
                        }}
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </TabsContent>

            <TabsContent value="security" className="py-4 space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div className="rounded-lg border bg-muted/20 p-1 flex-1">
                  <p className="text-[10px] text-muted-foreground p-2 italic">
                    Define visibility and administrative access. Base department rules apply to everyone unless overridden by a specific role.
                  </p>
                </div>
                {isSuperAdmin && (
                  <AddRoleOverrideButton 
                    departments={rankingsForm.departments.length > 0 ? rankingsForm.departments : departments}
                    deptToJobs={rankingsForm.deptToJobs || {}}
                    onAdd={(dept, job) => {
                      const key = `${dept}:${job}`;
                      if (visibilityForm[key]) {
                        toast.error("Override already exists for this role.");
                        return;
                      }
                      setVisibilityForm({
                        ...visibilityForm,
                        [key]: { sees: [dept], sees_jobs: true, sees_profiles: true }
                      });
                      toast.success(`Added override for ${key}`);
                    }}
                  />
                )}
              </div>

              {(() => {
                const currentSettings = profile ? getVisibilitySettings(profile, visibility) : null;
                const currentUserManagedDepts = isSuperAdmin ? null : (currentSettings?.manages_depts || []);
                const depts = rankingsForm.departments.length > 0 ? rankingsForm.departments : departments;
                const canE = isSuperAdmin || canEditControlCenter(profile, visibility);

                return (
                  <Tabs defaultValue="depts_table" className="w-full">
                    <TabsList className="grid w-full grid-cols-2 mb-4 h-9 p-1 bg-muted/50">
                      <TabsTrigger value="depts_table" className="text-xs gap-2">
                        <Building2 className="h-3 w-3" /> Department Permissions
                      </TabsTrigger>
                      <TabsTrigger value="roles_table" className="text-xs gap-2">
                        <ShieldCheck className="h-3 w-3" /> Role-Specific Overrides
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="depts_table" className="mt-0">
                      <div className="overflow-x-auto rounded-md border bg-card shadow-sm">
                        <AccessMatrix
                          departments={depts}
                          value={visibilityForm}
                          onChange={setVisibilityForm}
                          canEdit={canE}
                          currentUserManagedDepts={currentUserManagedDepts}
                          type="dept"
                        />
                      </div>
                    </TabsContent>

                    <TabsContent value="roles_table" className="mt-0">
                      <div className="overflow-x-auto rounded-md border bg-card shadow-sm">
                        <AccessMatrix
                          departments={depts}
                          value={visibilityForm}
                          onChange={setVisibilityForm}
                          canEdit={canE}
                          currentUserManagedDepts={currentUserManagedDepts}
                          type="role"
                        />
                      </div>
                    </TabsContent>
                  </Tabs>
                );
              })()}
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6 border-t pt-4">
            <Button variant="outline" onClick={() => setOpenRankings(false)}>Cancel</Button>
            <Button onClick={() => {
              updateRankings.mutate(rankingsForm);
              updateVisibility.mutate(visibilityForm, {
                onSuccess: () => {
                  setOpenRankings(false);
                  toast.success("Security and Ranking settings updated!");
                }
              });
            }} className="bg-gradient-primary text-white" disabled={updateRankings.isPending || updateVisibility.isPending}>
              {updateRankings.isPending || updateVisibility.isPending ? "Saving..." : "Save All Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Active filter summary */}
      {titleFilter && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Briefcase className="h-4 w-4" />
          Showing <span className="font-medium text-foreground">{filteredAndSorted.length}</span> employee{filteredAndSorted.length !== 1 ? "s" : ""} with job title <span className="font-medium text-foreground">"{titleFilter}"</span>
        </div>
      )}

      {view === "grid" ? (
        <div className="space-y-10">
          {groupedByDept.map(({ dept, emps }) => (
            <div key={dept} className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
              <h2 className="font-display text-2xl font-bold flex items-center gap-2 border-b pb-2">
                <Building2 className="h-6 w-6 text-primary" /> {dept}
                <span className="ml-2 text-sm font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{emps.length}</span>
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {emps.map(e => {
                  const total = tasks.filter(t => t.assignee_id === e.id).length;
                  const done = tasks.filter(t => t.assignee_id === e.id && t.status === "completed").length;
                  const pct = total ? Math.round((done / total) * 100) : 0;
                  const canM = profile ? canManage(profile, e, rankings, visibility) : false;
                  const canV = profile ? canViewProfile(profile, e, visibility) : false;
                  const canJ = profile ? canSeeJobTitle(profile, e, visibility) : true;

                  return (
                    <div key={e.id} className="surface-card hover-lift p-5">
                      <div className="flex items-start justify-between">
                        <UserAvatar name={e.name} color={e.avatar_color ?? undefined} size="lg" />
                        <div className="flex gap-1">
                          {isAdmin && canV && (
                            <Button asChild size="icon" variant="ghost" className="h-8 w-8" aria-label="View">
                              <Link to={`/admin/employees/${e.id}`}><Eye className="h-4 w-4" /></Link>
                            </Button>
                          )}
                          {isAdmin && canM && (
                            <>
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(e)} aria-label="Edit">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <DeleteEmpButton onConfirm={() => { deleteEmployee.mutate(e.id); toast.success("Employee deleted"); }} name={e.name} />
                            </>
                          )}
                        </div>
                      </div>
                      <div className="mt-4">
                        {isAdmin && canV ? (
                          <Link to={`/admin/employees/${e.id}`} className="font-display text-lg font-semibold leading-tight hover:underline">{e.name}</Link>
                        ) : (
                          <span className="font-display text-lg font-semibold leading-tight">{e.name}</span>
                        )}
                        <div className="text-sm text-muted-foreground">
                          {canJ ? (e.job_title ?? "Employee") : "—"}
                          {isAdmin && canM && ` • ${e.role === 'admin' ? 'Admin' : (e.role === 'superadmin' ? 'Super Admin' : 'Employee')}`}
                        </div>
                      </div>
                      <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                        <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> {e.email || "—"}</div>
                        <div className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5" /> {e.department || "—"}</div>
                      </div>
                      <div className="mt-4">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Completion</span>
                          <span className="font-semibold tabular-nums">{pct}%</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div className="h-full bg-gradient-primary" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">{done}/{total} tasks completed</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {filteredAndSorted.length === 0 && (
            <div className="surface-card p-10 text-center text-muted-foreground sm:col-span-2 lg:col-span-3 xl:col-span-4">
              No employees match the current filters.
            </div>
          )}
        </div>
      ) : (
        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Username</th>
                  <th className="px-4 py-3 text-left">Job Title</th>
                  <th className="px-4 py-3 text-left">Department</th>
                  <th className="px-4 py-3 text-left">Tasks</th>
                  {isAdmin && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredAndSorted.map(e => {
                  const total = tasks.filter(t => t.assignee_id === e.id).length;
                  const done = tasks.filter(t => t.assignee_id === e.id && t.status === "completed").length;
                  const canM = profile ? canManage(profile, e, rankings, visibility) : false;
                  const canV = profile ? canViewProfile(profile, e, visibility) : false;
                  const canJ = profile ? canSeeJobTitle(profile, e, visibility) : true;

                  return (
                    <tr key={e.id} className="border-t hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <UserAvatar name={e.name} color={e.avatar_color ?? undefined} size="sm" />
                          <div>
                            {isAdmin && canV ? (
                              <Link to={`/admin/employees/${e.id}`} className="font-medium hover:underline">{e.name}</Link>
                            ) : (
                              <span className="font-medium">{e.name}</span>
                            )}
                            {isAdmin && canM && <div className="text-xs text-muted-foreground">{e.role === 'admin' ? 'Admin' : 'Employee'}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{e.username}</td>
                      <td className="px-4 py-3">{canJ ? (e.job_title ?? "—") : "—"}</td>
                      <td className="px-4 py-3">{e.department ?? "—"}</td>
                      <td className="px-4 py-3">{done}/{total}</td>
                      {isAdmin && (
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            {canV && (
                              <Button asChild size="icon" variant="ghost" className="h-8 w-8"><Link to={`/admin/employees/${e.id}`}><Eye className="h-4 w-4" /></Link></Button>
                            )}
                            {canM && (
                              <>
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(e)}><Pencil className="h-4 w-4" /></Button>
                                <DeleteEmpButton onConfirm={() => { deleteEmployee.mutate(e.id); toast.success("Employee deleted"); }} name={e.name} />
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {filteredAndSorted.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No employees match the current filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function CreateMetadataButton({ label, onAdd }: { label: string, onAdd: (val: string) => void }) {
  const [val, setVal] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1 text-primary hover:text-primary hover:bg-primary/5">
          <Plus className="h-3.5 w-3.5" /> Add {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-3">
        <div className="space-y-3">
          <Label className="text-xs">New {label} Name</Label>
          <Input
            value={val}
            onChange={e => setVal(e.target.value)}
            placeholder={`Enter ${label.toLowerCase()}...`}
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter' && val.trim()) {
                onAdd(val);
                setVal("");
                setOpen(false);
              }
            }}
          />
          <Button
            className="w-full h-8 text-xs bg-primary text-white"
            disabled={!val.trim()}
            onClick={() => {
              onAdd(val);
              setVal("");
              setOpen(false);
            }}
          >
            Create
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AddRoleOverrideButton({ 
  departments, 
  deptToJobs, 
  onAdd 
}: { 
  departments: string[], 
  deptToJobs: Record<string, string[]>, 
  onAdd: (dept: string, job: string) => void 
}) {
  const [open, setOpen] = useState(false);
  const [selDept, setSelDept] = useState("");
  const [selJob, setSelJob] = useState("");

  const jobs = selDept ? (deptToJobs[selDept] || []) : [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-2 border-orange-200 bg-orange-50/30 text-orange-700 hover:bg-orange-50 hover:border-orange-300">
          <ShieldCheck className="h-4 w-4" /> Add Role Override
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">1. Select Department</Label>
            <select 
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={selDept}
              onChange={e => { setSelDept(e.target.value); setSelJob(""); }}
            >
              <option value="">Choose department...</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">2. Select Job Title</Label>
            <select 
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
              value={selJob}
              disabled={!selDept}
              onChange={e => setSelJob(e.target.value)}
            >
              <option value="">Choose job title...</option>
              {jobs.map(j => <option key={j} value={j}>{j}</option>)}
            </select>
          </div>
          <Button 
            className="w-full bg-orange-600 text-white hover:bg-orange-700" 
            disabled={!selDept || !selJob}
            onClick={() => {
              onAdd(selDept, selJob);
              setOpen(false);
              setSelDept("");
              setSelJob("");
            }}
          >
            Create Override
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AccessMatrix({ 
  departments, 
  value, 
  onChange,
  canEdit = true,
  currentUserManagedDepts,
  type = 'dept' // 'dept' or 'role'
}: { 
  departments: string[], 
  value: VisibilityMap, 
  onChange: (v: VisibilityMap) => void,
  canEdit?: boolean,
  currentUserManagedDepts?: string[] | null,
  type?: 'dept' | 'role'
}) {
  const { profile } = useApp();
  const isSuperAdmin = profile?.role === 'superadmin';

  // Filter keys based on type and management permissions
  const filteredKeys = useMemo(() => {
    const keys = type === 'dept' 
      ? [...departments] 
      : Object.keys(value).filter(k => !departments.includes(k));

    let result = keys.sort((a, b) => a.localeCompare(b));

    // FILTERING LOGIC: If not superadmin, only show keys they manage
    if (currentUserManagedDepts) {
      result = result.filter(k => {
        const [dept] = k.split(':');
        return currentUserManagedDepts.includes(dept);
      });
    }

    return result;
  }, [departments, value, currentUserManagedDepts, type]);

  if (filteredKeys.length === 0 && type === 'role') {
    return (
      <div className="text-center py-8 border-2 border-dashed rounded-lg text-muted-foreground text-xs italic">
        No role-specific overrides created yet.
      </div>
    );
  }

  const removeKey = (key: string) => {
    const newVal = { ...value };
    delete newVal[key];
    onChange(newVal);
  };

  return (
    <div className="space-y-4">
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr className="bg-muted/50 border-y">
            <th className="px-3 py-2 text-left font-semibold w-40">{type === 'dept' ? 'Viewer Department' : 'Specific Role (Dept:Job)'}</th>
            <th className="px-3 py-2 text-left font-semibold">Visible Departments</th>
            <th className="px-3 py-2 text-center font-semibold w-16">Jobs?</th>
            <th className="px-3 py-2 text-center font-semibold w-16">Profiles?</th>
            <th className="px-3 py-2 text-center font-semibold w-16 text-primary">Control Access?</th>
            <th className="px-3 py-2 text-center font-semibold w-16 text-primary">Can Edit?</th>
            <th className="px-3 py-2 text-left font-semibold w-48 text-primary">Managed Depts</th>
            <th className="px-3 py-2 w-8"></th>
          </tr>
        </thead>
        <tbody>
          {filteredKeys.map(key => {
            const settings = value[key] || { sees: [key], sees_jobs: true, sees_profiles: true };
            const isCustom = type === 'role';

            const toggleDept = (dept: string) => {
              if (!canEdit) return;
              const newSees = settings.sees.includes(dept)
                ? settings.sees.filter(d => d !== dept)
                : [...settings.sees, dept];
              onChange({ ...value, [key]: { ...settings, sees: newSees } });
            };

            const toggleBool = (field: keyof VisibilityMap[string]) => {
              if (!canEdit) return;
              onChange({ ...value, [key]: { ...settings, [field]: !settings[field] } });
            };

            const toggleManagedDept = (dept: string) => {
              if (!canEdit) return;
              const current = settings.manages_depts || [];
              const next = current.includes(dept)
                ? current.filter(d => d !== dept)
                : [...current, dept];
              onChange({ ...value, [key]: { ...settings, manages_depts: next } });
            };

            return (
              <tr key={key} className="border-b hover:bg-muted/5 transition-colors">
                <td className="px-3 py-3 align-top">
                  <div className={cn("font-bold", isCustom ? "text-orange-600" : "text-primary")}>
                    {key}
                  </div>
                </td>
                <td className="px-3 py-3 align-top">
                  <div className="flex flex-wrap gap-1">
                    {departments.map(target => (
                      <button
                        key={target}
                        disabled={!canEdit}
                        onClick={() => toggleDept(target)}
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] border transition-all",
                          settings.sees.includes(target)
                            ? "bg-primary/10 border-primary/30 text-primary"
                            : "bg-background border-muted text-muted-foreground opacity-40 hover:opacity-100"
                        )}
                      >
                        {target}
                      </button>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-3 text-center align-top">
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={!!settings.sees_jobs}
                    onChange={() => toggleBool('sees_jobs')}
                    className="h-3 w-3 rounded border-gray-300 text-primary"
                  />
                </td>
                <td className="px-3 py-3 text-center align-top">
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={!!settings.sees_profiles}
                    onChange={() => toggleBool('sees_profiles')}
                    className="h-3 w-3 rounded border-gray-300 text-primary"
                  />
                </td>
                <td className="px-3 py-3 text-center align-top bg-primary/5">
                  <input
                    type="checkbox"
                    disabled={!isSuperAdmin} // Strictly SuperAdmin only
                    checked={!!settings.can_access_control}
                    onChange={() => toggleBool('can_access_control')}
                    className="h-3 w-3 rounded border-gray-300 text-primary cursor-pointer disabled:cursor-not-allowed"
                  />
                </td>
                <td className="px-3 py-3 text-center align-top bg-primary/5">
                  <input
                    type="checkbox"
                    disabled={!isSuperAdmin} // Strictly SuperAdmin only
                    checked={!!settings.can_edit_control}
                    onChange={() => toggleBool('can_edit_control')}
                    className="h-3 w-3 rounded border-gray-300 text-primary cursor-pointer disabled:cursor-not-allowed"
                  />
                </td>
                <td className="px-3 py-3 align-top bg-primary/5">
                  <div className="flex flex-wrap gap-1">
                    {departments.map(target => (
                      <button
                        key={target}
                        disabled={!isSuperAdmin} // Strictly SuperAdmin only
                        onClick={() => toggleManagedDept(target)}
                        className={cn(
                          "px-1.5 py-0.5 rounded text-[9px] border transition-all",
                          (settings.manages_depts || []).includes(target)
                            ? "bg-blue-600/10 border-blue-600/30 text-blue-700"
                            : "bg-background border-muted text-muted-foreground opacity-30 hover:opacity-100",
                          !isSuperAdmin && "cursor-not-allowed"
                        )}
                      >
                        {target}
                      </button>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-3 text-right align-top">
                  {isCustom && canEdit && (
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => removeKey(key)}>
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DeleteEmpButton({ onConfirm, name }: { onConfirm: () => void; name: string }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label="Delete">
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
          <AlertDialogDescription>This will remove the employee and unassign all their tasks.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Delete Employee
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SortableItem({
  id,
  item,
  onRemove,
  onDeleteGlobal,
  disabled
}: {
  id: string,
  item: string,
  onRemove: () => void,
  onDeleteGlobal?: (item: string) => void,
  disabled?: boolean
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-background p-2.5 shadow-sm transition-shadow",
        isDragging && "shadow-lg ring-1 ring-primary/20 opacity-80"
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className={cn(
          "cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground",
          disabled && "opacity-20 cursor-not-allowed pointer-events-none"
        )}
      >
        <GripVertical className="h-4 w-4" />
      </div>
      <span className={cn("flex-1 text-sm font-medium", disabled && "text-muted-foreground")}>{item}</span>
      <div className="flex items-center gap-1">
        {!disabled && (
          <button
            type="button"
            onClick={onRemove}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Remove from priority list"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {onDeleteGlobal && !disabled && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive transition-colors ml-1"
                title="Delete keyword globally"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete "{item}" globally?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove this keyword from EVERY employee profile that currently has it.
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onDeleteGlobal(item)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete Everywhere
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}

function RankListBuilder({
  items,
  available,
  onChange,
  onDeleteGlobal,
  viewerItem,
  seniorityList
}: {
  items: string[],
  available: string[],
  onChange: (items: string[]) => void;
  onDeleteGlobal?: (item: string) => void;
  viewerItem?: string | null;
  seniorityList?: string[];
}) {
  const [search, setSearch] = useState("");
  const { profile } = useApp();
  const isSuperAdmin = profile?.role === 'superadmin';

  const unranked = available
    .filter(a => !items.includes(a))
    .filter(a => a.toLowerCase().includes(search.toLowerCase()));

  // Helper to check if an item is "Senior" to the viewer
  const isSenior = (item: string) => {
    if (isSuperAdmin) return false;
    if (!viewerItem || !seniorityList) return false;
    
    const itemRank = getRank(item, seniorityList);
    const viewerRank = getRank(viewerItem, seniorityList);
    
    return itemRank < viewerRank;
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      if (isSenior(active.id as string) || isSenior(over.id as string)) {
        toast.error("Hierarchy Protection: You cannot reorder items above your own rank.");
        return;
      }

      const oldIndex = items.indexOf(active.id as string);
      const newIndex = items.indexOf(over.id as string);
      onChange(arrayMove(items, oldIndex, newIndex));
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Priority Order</Label>
          <span className="text-[10px] text-muted-foreground italic">Drag to change rankings</span>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {items.map((item) => (
                <SortableItem
                  key={item}
                  id={item}
                  item={item}
                  disabled={isSenior(item)}
                  onRemove={() => onChange(items.filter(x => x !== item))}
                  onDeleteGlobal={onDeleteGlobal}
                />
              ))}
              {items.length === 0 && (
                <div className="text-sm text-muted-foreground p-4 border border-dashed rounded-lg bg-muted/20 text-center">
                  No priority set. Defaults to alphabetical.
                </div>
              )}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      <div className="space-y-3 pt-2 border-t">
        <div className="flex items-center justify-between gap-4">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">Available (Unranked)</Label>
          <div className="relative flex-1 max-w-[200px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input 
              placeholder="Search roles..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 pl-7 text-[10px]"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto p-1">
          {unranked.map(u => {
            return (
              <button
                key={u}
                type="button"
                onClick={() => onChange([...items, u])}
                className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium hover:bg-primary/10 hover:text-primary transition-colors"
              >
                <Plus className="h-3 w-3" /> {u}
              </button>
            );
          })}
          {unranked.length === 0 && (
            <div className="text-[10px] text-muted-foreground italic">
              {search ? "No matches found." : "All items are ranked."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
