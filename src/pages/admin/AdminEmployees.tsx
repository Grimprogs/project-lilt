import { useState, useMemo } from "react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useProfiles, useCreateEmployee, useUpdateProfile, useDeleteEmployee } from "@/hooks/useProfiles";
import { useTasks } from "@/hooks/useTasks";
import { useRankings, VisibilityMap, useVisibilitySettings } from "@/hooks/useSettings";
import { useDepartments, useMyDepartmentGrants } from "@/hooks/useDepartments";
import { getRank, normalize, getVisibilitySettings, canAccessControlCenter, canManage, canViewProfile, canSeeJobTitle, canCreateProfile, canDeleteProfile } from "@/lib/permissions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/UserAvatar";
import { Search, Plus, Pencil, Trash2, Mail, Building2, Eye, Briefcase, Check, ChevronsUpDown, X, Settings2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useApp } from "@/context/AppContext";

const empty = { name: "", username: "", password: "", email: "", jobTitle: "", department: "", role: "employee" };


export default function AdminEmployees() {
  const { user, profile } = useApp();
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const isSuperAdmin = user?.role === 'superadmin';
  const { data: employees = [] } = useProfiles();
  const { data: tasks = [] } = useTasks(isAdmin ? { role: "admin" } : undefined);
  const { data: accessVisibility = {} } = useVisibilitySettings();
  const { data: rankings = { departments: [], jobTitles: [] } } = useRankings();
  const { data: departmentsData = [] } = useDepartments();
  const { data: myGrants = [] } = useMyDepartmentGrants(profile?.id);

  // Role-specific accessVisibility/settings for the current user (may include manages_depts)
  const currentSettings = profile ? getVisibilitySettings(profile, accessVisibility) : null;

  // Granular create/delete permissions from accessVisibility matrix
  const canAddEmployee = isSuperAdmin || canCreateProfile(profile, 'employee', null, null, accessVisibility);
  const canAddAdmin = isSuperAdmin || canCreateProfile(profile, 'admin', null, null, accessVisibility);
  const creatableRoles = isSuperAdmin
    ? ['employee', 'admin', 'superadmin']
    : (currentSettings?.creatable_roles || (canAddEmployee ? ['employee'] : []));

  const createEmployee = useCreateEmployee();
  const updateProfile = useUpdateProfile();
  const deleteEmployee = useDeleteEmployee();
  const location = useLocation();
  const isWideView = location.pathname.endsWith('/wide');
  const wideViewPath = location.pathname.startsWith('/me') ? '/me/team/wide' : '/admin/employees/wide';
  const standardViewPath = location.pathname.startsWith('/me') ? '/me/team' : '/admin/employees';

  const [q, setQ] = useState("");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState(empty);

  // ── Filters ──────────────────────────────────────────────────────────────
  const [titleFilter, setTitleFilter] = useState<string | null>(null);
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

    const currentSettings = getVisibilitySettings(profile, accessVisibility);
    
    // Departments allowed based on action (Edit vs Create)
    const allowedDepts = editing 
      ? (currentSettings?.editable_depts || []) 
      : (currentSettings?.creatable_depts || []);

    // Also include departments they have direct grants for
    const grantDeptIds = new Set(myGrants.filter(g => editing ? g.can_update_role : g.can_create_role).map(g => g.department_id));
    const grantNames = departmentsData.filter(d => grantDeptIds.has(d.id)).map(d => d.name);

    // Merge with managed depts
    const managedByRole = Array.isArray(currentSettings?.manages_depts) ? currentSettings!.manages_depts : [];

    const finalAllowed = Array.from(new Set([...allowedDepts, ...grantNames, ...managedByRole]));

    // If no specific restrictions set, fallback to what they can "see" or just return source if they have the global permission
    if (finalAllowed.length === 0) {
      if (editing && currentSettings?.can_edit_profiles) return sourceNames;
      if (!editing && currentSettings?.can_create_profiles) return sourceNames;
      return [];
    }

    return sourceNames.filter(n => finalAllowed.map(d => d.toLowerCase()).includes(n.toLowerCase()));
  }, [rankings.departments, departmentsData, departments, profile, isSuperAdmin, myGrants, accessVisibility, editing]);

  const availableJobOptions = useMemo(() => {
    const deptName = form.department || profile?.department;
    if (!deptName) return [];
    
    // 1. Get all jobs for this department
    const deptJobs = (rankings.deptToJobs && rankings.deptToJobs[deptName]) ? rankings.deptToJobs[deptName] : [];
    
    if (isSuperAdmin) return deptJobs;

    // 2. Filter by creatable_jobs if restricted
    const currentSettings = getVisibilitySettings(profile, accessVisibility);
    const allowedJobs = currentSettings?.creatable_jobs || [];
    
    if (allowedJobs.length > 0) {
      return deptJobs.filter(j => allowedJobs.map(aj => aj.toLowerCase()).includes(j.toLowerCase()));
    }

    return deptJobs;
  }, [rankings.deptToJobs, form.department, profile?.department, isSuperAdmin, accessVisibility, profile]);

  // For UI: determine whether the current user can create roles in the department selected in the form
  const selectedFormDeptObj = departmentsData.find(d => form.department && d.name && d.name.toLowerCase() === form.department.toLowerCase());
  const selectedFormDeptId = selectedFormDeptObj?.id;
  const canCreateRoleForSelectedDept = isSuperAdmin
    || myGrants.some(g => g.department_id === selectedFormDeptId && g.can_create_role)
    || (Array.isArray(currentSettings?.manages_depts) && form.department && currentSettings!.manages_depts.map(s => s.toLowerCase()).includes(form.department.toLowerCase()))
    || (Array.isArray(currentSettings?.creatable_depts) && form.department && currentSettings!.creatable_depts.map(s => s.toLowerCase()).includes(form.department.toLowerCase()));

  const filteredAndSorted = useMemo(() => {
    const filtered = employees.filter(e => {
      // 1. Stealth Mode: Super Admins are invisible to everyone except themselves
      if (e.role === 'superadmin' && e.id !== profile?.id) {
        return false;
      }

      // 2. Security Map & Hierarchy
      if (profile && !canManage(profile, e, myGrants, departmentsData, accessVisibility) && e.id !== profile.id && !isSuperAdmin) {
        const viewerSettings = getVisibilitySettings(profile, accessVisibility) || { sees: [profile.department || ''], sees_jobs: false, sees_profiles: false };
        const seesList = (viewerSettings.sees || []).map((s: string) => s.toLowerCase());
        // Also include depts in viewable_profile_depts so the Eye button can work
        const profileDepts = (viewerSettings.viewable_profile_depts || []).map((s: string) => s.toLowerCase());
        const allVisible = Array.from(new Set([...seesList, ...profileDepts]));
        const targetDept = (e.department || '').toLowerCase();
        if (!allVisible.includes(targetDept)) return false;
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
  }, [employees, q, titleFilter, deptFilter, rankings, isSuperAdmin, accessVisibility, profile, myGrants, departmentsData]);

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
      <div className="-mx-4 px-4 pt-2 pb-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b shadow-sm space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold">{isAdmin ? "Employees" : "Team Directory"}</h1>
            <p className="text-muted-foreground text-sm">{isAdmin ? "Manage your team, credentials, and roles." : "Find and connect with your colleagues."}</p>
          </div>
        </div>

        <div className="surface-card p-4 flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9 bg-muted/50 border-transparent focus-visible:bg-background" placeholder="Search by name, email or username..." value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterPopover
            icon={<Briefcase className="h-4 w-4 shrink-0 text-muted-foreground" />}
            value={titleFilter}
            options={jobTitles}
            placeholder="All job titles"
            inputPlaceholder="Filter by title..."
            emptyLabel="No titles found."
            onChange={setTitleFilter}
          />
          <FilterPopover
            icon={<Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />}
            value={deptFilter}
            options={departments}
            placeholder="All departments"
            inputPlaceholder="Filter by department..."
            emptyLabel="No departments found."
            onChange={setDeptFilter}
          />
          {titleFilter && (
            <FilterChip
              label={titleFilter}
              className="bg-primary/10 text-primary hover:bg-primary/20"
              onClear={() => setTitleFilter(null)}
            />
          )}
          {deptFilter && (
            <FilterChip
              label={deptFilter}
              className="bg-blue-500/10 text-blue-600 hover:bg-blue-500/20"
              onClear={() => setDeptFilter(null)}
            />
          )}
          <div className="hidden md:flex rounded-lg border p-0.5 bg-muted/40">
            <button onClick={() => setView("grid")} className={`px-2.5 py-1 text-xs rounded-md ${view === "grid" ? "bg-background shadow-soft" : "text-muted-foreground"}`}>Grid</button>
            <button onClick={() => setView("table")} className={`px-2.5 py-1 text-xs rounded-md ${view === "table" ? "bg-background shadow-soft" : "text-muted-foreground"}`}>Table</button>
          </div>
          <Button asChild variant="outline">
            <Link to={isWideView ? standardViewPath : wideViewPath}>
              {isWideView ? "Standard view" : "Open wide view"}
            </Link>
          </Button>
          {canAccessControlCenter(profile, accessVisibility) && (
            <Button variant="outline" asChild>
              <Link to="/admin/control-center">
                <Settings2 className="h-4 w-4 mr-2" /> Control Center
              </Link>
            </Button>
          )}
          {(isAdmin && (canAddEmployee || canAddAdmin)) && (
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
                    <Input value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="******" required={!editing} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase font-bold text-muted-foreground">Email Address</Label>
                    <div className="flex items-center gap-1">
                      <Input
                        type="text"
                        value={form.email.split('@')[0]}
                        onChange={e => {
                          const val = e.target.value.trim().split('@')[0];
                          setForm({ ...form, email: val ? `${val}@zeexai.com` : "" });
                        }}
                        placeholder="username"
                        required={!editing}
                      />
                      <div className="px-3 py-2 rounded-md border bg-muted text-muted-foreground text-sm font-medium whitespace-nowrap">
                        @zeexai.com
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Role</Label>
                    <select
                      value={form.role}
                      onChange={e => setForm({ ...form, role: e.target.value })}
                      className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {creatableRoles.includes('employee') && <option value="employee">Employee</option>}
                      {creatableRoles.includes('admin') && <option value="admin">Admin</option>}
                      {creatableRoles.includes('superadmin') && <option value="superadmin">Super Admin</option>}
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
                  const canM = profile ? canManage(profile, e, myGrants, departmentsData, accessVisibility) : false;
                  const canV = profile ? canViewProfile(profile, e, myGrants, departmentsData, accessVisibility) : false;
                  const canJ = profile ? canSeeJobTitle(profile, e, myGrants, departmentsData) : true;
                  const canDel = profile ? canDeleteProfile(profile, e, departmentsData, accessVisibility) : false;

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
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(e)} aria-label="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {isAdmin && canDel && (
                            <DeleteEmpButton onConfirm={() => { deleteEmployee.mutate(e.id); toast.success("Employee deleted"); }} name={e.name} />
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
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left border-b">Name</th>
                  <th className="px-4 py-3 text-left border-b">Username</th>
                  <th className="px-4 py-3 text-left border-b">Job Title</th>
                  <th className="px-4 py-3 text-left border-b">Department</th>
                  <th className="px-4 py-3 text-left border-b">Tasks</th>
                  {isAdmin && <th className="px-4 py-3 text-right border-b">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredAndSorted.map(e => {
                  const total = tasks.filter(t => t.assignee_id === e.id).length;
                  const done = tasks.filter(t => t.assignee_id === e.id && t.status === "completed").length;
                  const canM = profile ? canManage(profile, e, myGrants, departmentsData, accessVisibility) : false;
                  const canV = profile ? canViewProfile(profile, e, myGrants, departmentsData, accessVisibility) : false;
                  const canJ = profile ? canSeeJobTitle(profile, e, myGrants, departmentsData) : true;
                  const canDel = profile ? canDeleteProfile(profile, e, departmentsData, accessVisibility) : false;

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
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEdit(e)}><Pencil className="h-4 w-4" /></Button>
                            )}
                            {canDel && (
                              <DeleteEmpButton onConfirm={() => { deleteEmployee.mutate(e.id); toast.success("Employee deleted"); }} name={e.name} />
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

// ─── Shared filter/chip helpers ──────────────────────────────────────────────

function FilterPopover({
  icon,
  value,
  options,
  placeholder,
  inputPlaceholder,
  emptyLabel,
  onChange,
}: {
  icon: ReactNode;
  value: string | null;
  options: string[];
  placeholder: string;
  inputPlaceholder: string;
  emptyLabel: string;
  onChange: (val: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("justify-between font-normal gap-2 min-w-[160px]", value && "border-primary/60 bg-primary/5")}>
          {icon}
          <span className="flex-1 text-left truncate">{value ?? placeholder}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-56" align="start">
        <Command>
          <CommandInput placeholder={inputPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__all__"
                onSelect={() => { onChange(null); setOpen(false); }}
              >
                <Check className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                {placeholder}
              </CommandItem>
              {options.map(opt => (
                <CommandItem
                  key={opt}
                  value={opt}
                  onSelect={() => { onChange(opt); setOpen(false); }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value?.toLowerCase() === opt.toLowerCase() ? "opacity-100" : "opacity-0")} />
                  {opt}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function FilterChip({
  label,
  className,
  onClear,
}: {
  label: string;
  className?: string;
  onClear: () => void;
}) {
  return (
    <button
      onClick={onClear}
      className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors", className)}
    >
      {label} <X className="h-3 w-3" />
    </button>
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

