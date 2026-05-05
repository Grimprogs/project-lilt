import { useState, useMemo, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { useProfiles, useCreateEmployee, useUpdateProfile, useDeleteEmployee, useDeleteMetadata } from "@/hooks/useProfiles";
import { useTasks } from "@/hooks/useTasks";
import { useRankings, useUpdateRankings, Rankings, VisibilityMap, useVisibilitySettings, useUpdateVisibilitySettings } from "@/hooks/useSettings";
import { useDepartments, useMyDepartmentGrants, DepartmentGrant, Department } from "@/hooks/useDepartments";
import { DepartmentGrantsMatrix } from "@/components/DepartmentGrantsMatrix";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/UserAvatar";
import { Search, Plus, Pencil, Trash2, Mail, Building2, Eye, Briefcase, Check, ChevronsUpDown, X, Filter, ListOrdered, ShieldCheck, Settings2, LayoutGrid, Shield, HelpCircle } from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
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
 * Hierarchical Permission Check based on Department Grants
 */
function canManage(currentAdmin: any, target: any, myGrants: DepartmentGrant[], departments: Department[], visibility: VisibilityMap) {
  if (!currentAdmin) return false;
  if (currentAdmin.id === target.id) return true; // Can manage yourself
  if (currentAdmin.role === 'superadmin') return true;
  if (target.role === 'superadmin') return false; // Cannot manage superadmin
  
  const targetDeptId = target.department_id || departments.find(d => d.name === target.department)?.id;
  if (!targetDeptId) return false;

  const grant = myGrants.find(g => g.department_id === targetDeptId);
  if (grant?.can_update_role) return true;

  const targetDeptName = target.department || departments.find(d => d.id === targetDeptId)?.name || "";
  const settings = getVisibilitySettings(currentAdmin, visibility) || {};
  const editable = (settings.editable_depts || []).map((d: string) => d.toLowerCase());
  if (settings.can_edit_profiles) {
    if (editable.length > 0 && targetDeptName && editable.includes(targetDeptName.toLowerCase())) return true;
    if (editable.length === 0 && targetDeptName && currentAdmin.department
      && targetDeptName.toLowerCase() === currentAdmin.department.toLowerCase()) return true;
  }

  return false;
}

function canViewProfile(currentAdmin: any, target: any, myGrants: DepartmentGrant[], departments: Department[]) {
  if (currentAdmin.id === target.id) return true;
  if (currentAdmin.role === 'superadmin') return true;
  
  const targetDeptId = target.department_id || departments.find(d => d.name === target.department)?.id;
  if (!targetDeptId) return true; // Default to true if unassigned
  
  const grant = myGrants.find(g => g.department_id === targetDeptId);
  return grant ? grant.can_read_role : true; 
}

function canSeeJobTitle(currentAdmin: any, target: any, myGrants: DepartmentGrant[], departments: Department[]) {
  return true; // Simplified for now
}

function getVisibilitySettings(profile: any, visibility: VisibilityMap) {
  if (!profile) return null;
  // Priority: person-specific override -> role override (dept:job) -> department override
  const personKey = `profile:${profile.id}`;
  const roleKey = `${profile.department}:${profile.job_title}`;
  return visibility[personKey] || visibility[roleKey] || visibility[profile.department] || null;
}

function canAccessControlCenter(admin: any, visibility: VisibilityMap) {
  if (admin?.role === 'superadmin') return true;
  const settings = getVisibilitySettings(admin, visibility);
  return !!settings?.can_access_control;
}

function canEditControlCenter(admin: any, visibility: VisibilityMap) {
  if (admin?.role === 'superadmin') return true;
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
  const [visibilityForm, setVisibilityForm] = useState<VisibilityMap>({});

  const { data: departmentsData = [] } = useDepartments();
  const { data: myGrants = [] } = useMyDepartmentGrants(profile?.id);

  // Role-specific visibility/settings for the current user (may include manages_depts)
  const currentSettings = profile ? getVisibilitySettings(profile, visibility) : null;

  const [openRankings, setOpenRankings] = useState(false);
  const [rankingsForm, setRankingsForm] = useState<Rankings>({ departments: [], jobTitles: [], deptToJobs: {} });
  const [selectedRankDept, setSelectedRankDept] = useState<string | null>(null);

  // Filtered options for the Add/Edit form based on hierarchy
  const availableDeptOptions = useMemo(() => {
    // Source of department names (prefer ranked list if present, otherwise the de-duped list)
    const sourceNames = (rankings.departments && rankings.departments.length > 0)
      ? rankings.departments
      : (departmentsData && departmentsData.length > 0)
        ? departmentsData.map(d => d.name)
        : departments;

    if (!profile) return sourceNames;
    if (isSuperAdmin) return sourceNames;

    // Non-superadmins may see departments they have grants for OR departments granted by their role-specific visibility overrides
    const editableDeptIds = new Set(myGrants.filter(g => g.can_update_role || g.can_create_role).map(g => g.department_id));
    const editableNamesFromGrants = departmentsData.filter(d => editableDeptIds.has(d.id)).map(d => d.name);

    const managedByRole = Array.isArray(currentSettings?.manages_depts) ? currentSettings!.manages_depts : [];

    const editableNames = Array.from(new Set([...editableNamesFromGrants, ...managedByRole]));

    return sourceNames.filter(n => editableNames.includes(n));
  }, [rankings.departments, departmentsData, departments, profile, isSuperAdmin, myGrants]);

  const availableJobOptions = useMemo(() => {
    const deptName = form.department || profile?.department;
    if (!deptName) return [];
    // Prefer department-specific role list; do NOT fall back to a global ranking
    const deptJobs = (rankings.deptToJobs && rankings.deptToJobs[deptName]) ? rankings.deptToJobs[deptName] : [];
    return deptJobs;
  }, [rankings.deptToJobs, form.department, profile?.department]);

  // For UI: determine whether the current user can create roles in the department selected in the form
  const selectedFormDeptObj = departmentsData.find(d => form.department && d.name && form.department && d.name.toLowerCase() === form.department.toLowerCase());
  const selectedFormDeptId = selectedFormDeptObj?.id;
  const canCreateRoleForSelectedDept = isSuperAdmin
    || myGrants.some(g => g.department_id === selectedFormDeptId && g.can_create_role)
    || (Array.isArray(currentSettings?.manages_depts) && form.department && currentSettings!.manages_depts.map(s => s.toLowerCase()).includes(form.department.toLowerCase()));

  const filteredAndSorted = useMemo(() => {
    const filtered = employees.filter(e => {
      // 1. Stealth Mode: Super Admins are invisible to everyone except themselves
      if (e.role === 'superadmin' && e.id !== profile?.id) {
        return false;
      }

      // 2. Security Map & Hierarchy
      if (profile && !canManage(profile, e, myGrants, departmentsData, visibility) && e.id !== profile.id && !isSuperAdmin) {
        // If they can't even "Manage", should they be visible?
        // Use viewer-specific visibility settings which prioritize person overrides.
        const viewerSettings = getVisibilitySettings(profile, visibility) || { sees: [profile.department || ''] };
        const seesList = (viewerSettings.sees || []).map((s: string) => s.toLowerCase());
        const targetDept = (e.department || '').toLowerCase();
        if (!seesList.includes(targetDept)) return false;
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

      // determine selected department id
      const selectedDeptName = form.department || editing.department || null;
      const deptObj = departmentsData.find(d => d.name && selectedDeptName && d.name.toLowerCase() === selectedDeptName.toLowerCase());
      const selectedDeptId = deptObj?.id;

      const canEditProfilesInDept = isSuperAdmin
        || myGrants.some(g => g.department_id === selectedDeptId && g.can_update_role)
        || (Array.isArray(currentSettings?.manages_depts) && selectedDeptName && currentSettings!.manages_depts.map(s => s.toLowerCase()).includes(selectedDeptName.toLowerCase()))
        || (currentSettings?.can_edit_profiles && Array.isArray(currentSettings?.editable_depts)
          && selectedDeptName && currentSettings.editable_depts.map(s => s.toLowerCase()).includes(selectedDeptName.toLowerCase()));

      const patch: any = {
        name: form.name,
        username: form.username,
        email: form.email || null,
      };
      if (canEditProfilesInDept) patch.department = form.department || null;
      if (isSuperAdmin) patch.role = form.role;
      if (canEditProfilesInDept) patch.job_title = normalizedJobTitle;

      updateProfile.mutate({
        id: editing.id,
        patch,
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

      const deptObj = departmentsData.find(d => d.name && form.department && d.name.toLowerCase() === form.department.toLowerCase());
      const selectedDeptId = deptObj?.id;
      const canCreateRoleInDept = isSuperAdmin
        || myGrants.some(g => g.department_id === selectedDeptId && g.can_create_role)
        || (Array.isArray(currentSettings?.manages_depts) && form.department && currentSettings!.manages_depts.map(s => s.toLowerCase()).includes(form.department.toLowerCase()));

      const payload: any = {
        name: form.name,
        username: form.username,
        email: form.email,
        password: form.password,
        department: form.department || undefined,
        role: form.role,
      };
      if (canCreateRoleInDept) payload.job_title = normalizedJobTitle || undefined;

      createEmployee.mutate(payload, {
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
                    {availableJobOptions.length > 0 ? (
                      <select
                        value={form.jobTitle}
                        onChange={e => setForm({ ...form, jobTitle: e.target.value })}
                        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="">Select job title...</option>
                        {availableJobOptions.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    ) : (
                      // If no predefined roles for this department, allow free-text when the user is permitted to create roles
                      <>
                        {canCreateRoleForSelectedDept ? (
                          <Input value={form.jobTitle} onChange={e => setForm({ ...form, jobTitle: e.target.value })} placeholder="Enter job title..." />
                        ) : (
                          <select disabled className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm opacity-50">
                            <option>No roles available</option>
                          </select>
                        )}
                      </>
                    )}
                  </div>

                  <div className="space-y-1.5 flex flex-col">
                    <Label>Department</Label>
                    <select
                      value={form.department}
                      onChange={e => setForm({ ...form, department: e.target.value, jobTitle: "" })}
                      disabled={availableDeptOptions.length === 0}
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
                  {/* Global seniority removed — roles are department-scoped only */}
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

                {/* Global seniority removed — roles are department-scoped only */}
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
                  <div className="flex items-center gap-2">
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
                    <AddPersonOverrideButton
                      employees={employees}
                      departments={rankingsForm.departments.length > 0 ? rankingsForm.departments : departments}
                      onAdd={(profileId: string, settings: any) => {
                        const prof = employees.find((p: any) => p.id === profileId);
                        if (!prof) { toast.error('Profile not found'); return; }
                        const key = `profile:${profileId}`;
                        if (visibilityForm[key]) { toast.error('Override already exists for this person.'); return; }
                        setVisibilityForm({
                          ...visibilityForm,
                          [key]: settings
                        });
                        toast.success(`Added override for ${prof.name}`);
                      }}
                    />
                  </div>
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
                  const canM = profile ? canManage(profile, e, myGrants, departmentsData, visibility) : false;
                  const canV = profile ? canViewProfile(profile, e, myGrants, departmentsData) : false;
                  const canJ = profile ? canSeeJobTitle(profile, e, myGrants, departmentsData) : true;

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
                  const canM = profile ? canManage(profile, e, myGrants, departmentsData, visibility) : false;
                  const canV = profile ? canViewProfile(profile, e, myGrants, departmentsData) : false;
                  const canJ = profile ? canSeeJobTitle(profile, e, myGrants, departmentsData) : true;

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

function AddPersonOverrideButton({ employees, departments, onAdd }: { employees: any[]; departments: string[]; onAdd: (id: string, settings: any) => void }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState("");
  const [deptMap, setDeptMap] = useState<Record<string, { see: boolean; assign: boolean; edit: boolean }>>({});
  const [allowSelf, setAllowSelf] = useState(false);

  useEffect(() => {
    // initialize per-department check state when opened or selection changes
    const map: Record<string, { see: boolean; assign: boolean; edit: boolean }> = {};
    for (const d of (departments || [])) map[d] = { see: false, assign: false, edit: false };
    if (sel) {
      const prof = employees.find((p: any) => p.id === sel);
      if (prof?.department) {
        const match = (departments || []).find(d => d.toLowerCase() === (prof.department || '').toLowerCase());
        if (match) map[match].see = true;
      }
    }
    setDeptMap(map);
  }, [open, sel, departments, employees]);

  const toggleSee = (d: string) => setDeptMap(prev => ({ ...prev, [d]: { ...(prev[d] || { see: false, assign: false, edit: false }), see: !prev[d]?.see } }));
  const toggleAssign = (d: string) => setDeptMap(prev => ({ ...prev, [d]: { ...(prev[d] || { see: false, assign: false, edit: false }), assign: !prev[d]?.assign } }));
  const toggleEdit = (d: string) => setDeptMap(prev => ({ ...prev, [d]: { ...(prev[d] || { see: false, assign: false, edit: false }), edit: !prev[d]?.edit } }));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-2 border-slate-200 bg-slate-50/10 text-slate-700 hover:bg-slate-50">Add Person Override</Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4">
        <div className="space-y-4">
          <Label className="text-[10px] uppercase font-bold text-muted-foreground">Select Person</Label>
          <select
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={sel}
            onChange={e => setSel(e.target.value)}
          >
            <option value="">Choose person...</option>
            {employees.map(p => <option key={p.id} value={p.id}>{p.name} — {p.department || 'No Dept'}</option>)}
          </select>

          <div>
            <Label className="text-[10px] uppercase font-bold text-muted-foreground mb-2">Departments (View / Assign / Profile Edit)</Label>
            <div className="grid grid-cols-1 gap-1 max-h-40 overflow-y-auto p-1 border rounded">
              {(departments || []).map(d => (
                <div key={d} className="flex items-center justify-between text-sm">
                  <div className="truncate">{d}</div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1 text-xs">
                      <input type="checkbox" checked={!!deptMap[d]?.see} onChange={() => toggleSee(d)} />
                      <span className="text-[11px]">See</span>
                    </label>
                    <label className="flex items-center gap-1 text-xs">
                      <input type="checkbox" checked={!!deptMap[d]?.assign} onChange={() => toggleAssign(d)} />
                      <span className="text-[11px]">Assign</span>
                    </label>
                    <label className="flex items-center gap-1 text-xs">
                      <input type="checkbox" checked={!!deptMap[d]?.edit} onChange={() => toggleEdit(d)} />
                      <span className="text-[11px]">Profile Edit</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allowSelf} onChange={() => setAllowSelf(s => !s)} />
            <span className="text-[13px]">Allow assign to self</span>
          </label>

          <Button
            className="w-full bg-primary text-white"
            disabled={!sel}
            onClick={() => {
              const sees = Object.keys(deptMap).filter(k => deptMap[k]?.see);
              const assignable = Object.keys(deptMap).filter(k => deptMap[k]?.assign);
              const editable = Object.keys(deptMap).filter(k => deptMap[k]?.edit);
              const settings: any = {
                sees: sees.length ? sees : [(employees.find((p: any) => p.id === sel)?.department || '')].filter(Boolean),
                sees_jobs: true,
                sees_profiles: true,
                can_assign_tasks: assignable.length > 0,
                assignable_depts: assignable,
                can_assign_self: !!allowSelf,
                can_edit_profiles: editable.length > 0,
                editable_depts: editable,
                manages_depts: []
              };
              onAdd(sel, settings);
              setSel("");
              setOpen(false);
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

  const { data: allProfiles = [] } = useProfiles();

  // Filter keys based on type and management permissions
  const filteredKeys = useMemo(() => {
    const keys = type === 'dept'
      ? [...departments]
      : Object.keys(value).filter(k => !departments.includes(k));

    // Put person-specific overrides (profile:...) first, then role overrides
    const personKeys = keys.filter(k => k.startsWith('profile:'));
    const roleKeys = keys.filter(k => !k.startsWith('profile:'));

    const personKeysSorted = personKeys.sort((a, b) => {
      const aId = a.split(':')[1];
      const bId = b.split(':')[1];
      const aName = (allProfiles.find((p: any) => p.id === aId)?.name || aId).toLowerCase();
      const bName = (allProfiles.find((p: any) => p.id === bId)?.name || bId).toLowerCase();
      return aName.localeCompare(bName);
    });

    const roleKeysSorted = roleKeys.sort((a, b) => a.localeCompare(b));

    let result = [...personKeysSorted, ...roleKeysSorted];

    // FILTERING LOGIC: If not superadmin, only show keys they manage
    if (currentUserManagedDepts) {
      result = result.filter(k => {
        if (k.startsWith('profile:')) {
          const id = k.split(':')[1];
          const prof = allProfiles.find((p: any) => p.id === id);
          const dept = (prof?.department || '').toLowerCase();
          return currentUserManagedDepts.map(d => d.toLowerCase()).includes(dept);
        }
        const [dept] = k.split(':');
        return currentUserManagedDepts.map(d => d.toLowerCase()).includes((dept || '').toLowerCase());
      });
    }

    return result;
  }, [departments, value, currentUserManagedDepts, type, allProfiles]);

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

  const HeaderHelp = ({ label, help }: { label: string; help: string }) => (
    <div className="inline-flex items-center gap-1">
      <span>{label}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground transition-colors cursor-help"
            aria-label={`${label} help`}
          >
            <HelpCircle className="h-3 w-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{help}</TooltipContent>
      </Tooltip>
    </div>
  );

  return (
    <TooltipProvider delayDuration={100}>
      <div className="space-y-4">
        <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr className="bg-muted/50 border-y">
            <th className="px-3 py-2 text-left font-semibold w-40">{type === 'dept' ? 'Viewer Department' : 'Specific Role (Dept:Job)'}</th>
            <th className="px-3 py-2 text-left font-semibold">
              <HeaderHelp label="Visible Departments" help="Departments this viewer can see in lists and search." />
            </th>
            <th className="px-3 py-2 text-center font-semibold w-16">
              <HeaderHelp label="Jobs?" help="Show job titles for visible people." />
            </th>
            <th className="px-3 py-2 text-center font-semibold w-16">
              <HeaderHelp label="Profiles?" help="Allow opening profile details (eye button)." />
            </th>
            <th className="px-3 py-2 text-center font-semibold w-16">
              <HeaderHelp label="Assign?" help="Allow assigning tasks to selected departments." />
            </th>
            <th className="px-3 py-2 text-center font-semibold w-24">
              <HeaderHelp label="Profile Edit?" help="Allow editing profiles in the selected departments." />
            </th>
            <th className="px-3 py-2 text-center font-semibold w-16">
              <HeaderHelp label="Self?" help="Allow assigning tasks to yourself." />
            </th>
            <th className="px-3 py-2 text-center font-semibold w-16 text-primary">
              <HeaderHelp label="Control Access?" help="Allow opening the Control Center." />
            </th>
            <th className="px-3 py-2 text-center font-semibold w-16 text-primary">
              <HeaderHelp label="Can Edit?" help="Allow saving changes in Control Center." />
            </th>
            <th className="px-3 py-2 text-left font-semibold w-48 text-primary">
              <HeaderHelp label="Managed Depts" help="Departments this viewer can manage (roles/rankings)." />
            </th>
            <th className="px-3 py-2 w-8"></th>
          </tr>
        </thead>
        <tbody>
          {filteredKeys.map(key => {
            const settings = value[key] || { sees: [key], sees_jobs: true, sees_profiles: true };
            const isCustom = type === 'role';
            const isPersonKey = key.startsWith('profile:');

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

            const toggleAssignTasks = () => {
              if (!canEdit) return;
              const next = !settings.can_assign_tasks;
              if (type === 'dept') {
                const nextAssignable = next ? [key] : [];
                onChange({ ...value, [key]: { ...settings, can_assign_tasks: next, assignable_depts: nextAssignable } });
                return;
              }
              onChange({ ...value, [key]: { ...settings, can_assign_tasks: next } });
            };

            const toggleEditProfiles = () => {
              if (!canEdit) return;
              const next = !settings.can_edit_profiles;
              if (type === 'dept') {
                const nextEditable = next ? [key] : [];
                onChange({ ...value, [key]: { ...settings, can_edit_profiles: next, editable_depts: nextEditable } });
                return;
              }
              onChange({ ...value, [key]: { ...settings, can_edit_profiles: next } });
            };

            const toggleManagedDept = (dept: string) => {
              if (!canEdit) return;
              const current = settings.manages_depts || [];
              const next = current.includes(dept)
                ? current.filter(d => d !== dept)
                : [...current, dept];
              onChange({ ...value, [key]: { ...settings, manages_depts: next } });
            };

            const displayLabel = isPersonKey
              ? (allProfiles.find((p: any) => p.id === key.split(':')[1])?.name || key)
              : key;

            return (
              <tr key={key} className="border-b hover:bg-muted/5 transition-colors">
                <td className="px-3 py-3 align-top">
                  <div className={cn("font-bold", isCustom ? "text-orange-600" : "text-primary")}>
                    {displayLabel}
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
                <td className="px-3 py-3 text-center align-top">
                  <div className="flex items-center justify-center gap-2">
                    <input
                      type="checkbox"
                      disabled={!canEdit}
                      checked={!!settings.can_assign_tasks}
                      onChange={toggleAssignTasks}
                      className="h-3 w-3 rounded border-gray-300 text-primary"
                    />
                    {type !== 'dept' && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            disabled={!canEdit}
                            className={cn(
                              "text-[11px] px-2 py-1 rounded border text-muted-foreground",
                              !canEdit && "opacity-40 cursor-not-allowed"
                            )}
                            title="Edit assignable departments"
                          >
                            Depts
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-44 p-3">
                          <div className="space-y-2 text-sm">
                            <div className="text-xs text-muted-foreground">Assignable Departments</div>
                            <div className="grid gap-1 max-h-40 overflow-y-auto">
                              {departments.map(target => {
                                const assigned = (settings.assignable_depts || []).includes(target);
                                return (
                                  <label key={target} className="flex items-center justify-between gap-2">
                                    <span className="truncate">{target}</span>
                                    <input
                                      type="checkbox"
                                      disabled={!canEdit}
                                      checked={assigned}
                                      onChange={() => {
                                        if (!canEdit) return;
                                        const current = settings.assignable_depts || [];
                                        const next = current.includes(target)
                                          ? current.filter((d: string) => d !== target)
                                          : [...current, target];
                                        onChange({ ...value, [key]: { ...settings, assignable_depts: next } });
                                      }}
                                    />
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3 text-center align-top">
                  <div className="flex items-center justify-center gap-2">
                    <input
                      type="checkbox"
                      disabled={!canEdit}
                      checked={!!settings.can_edit_profiles}
                      onChange={toggleEditProfiles}
                      className="h-3 w-3 rounded border-gray-300 text-primary"
                    />
                    {type !== 'dept' && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            disabled={!canEdit}
                            className={cn(
                              "text-[11px] px-2 py-1 rounded border text-muted-foreground",
                              !canEdit && "opacity-40 cursor-not-allowed"
                            )}
                            title="Edit editable departments"
                          >
                            Depts
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-44 p-3">
                          <div className="space-y-2 text-sm">
                            <div className="text-xs text-muted-foreground">Editable Departments</div>
                            <div className="grid gap-1 max-h-40 overflow-y-auto">
                              {departments.map(target => {
                                const canEditDept = (settings.editable_depts || []).includes(target);
                                return (
                                  <label key={target} className="flex items-center justify-between gap-2">
                                    <span className="truncate">{target}</span>
                                    <input
                                      type="checkbox"
                                      disabled={!canEdit}
                                      checked={canEditDept}
                                      onChange={() => {
                                        if (!canEdit) return;
                                        const current = settings.editable_depts || [];
                                        const next = current.includes(target)
                                          ? current.filter((d: string) => d !== target)
                                          : [...current, target];
                                        onChange({ ...value, [key]: { ...settings, editable_depts: next } });
                                      }}
                                    />
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                </td>
                <td className="px-3 py-3 text-center align-top">
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={!!settings.can_assign_self}
                    onChange={() => toggleBool('can_assign_self')}
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
    </TooltipProvider>
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
