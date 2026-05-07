import { useState, useMemo, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useProfiles, useDeleteMetadata } from "@/hooks/useProfiles";
import { useRankings, useUpdateRankings, Rankings, VisibilityMap, useVisibilitySettings, useUpdateVisibilitySettings } from "@/hooks/useSettings";
import { useDepartments } from "@/hooks/useDepartments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, ListOrdered, LayoutGrid, ChevronsUpDown, Building2, Plus, X, Trash2, HelpCircle, ArrowLeft, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useApp } from "@/context/AppContext";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from "lucide-react";
import { getRank, normalize, getVisibilitySettings, canEditControlCenter } from "@/lib/permissions";

export default function AdminControlCenter() {
  const { profile } = useApp();
  const navigate = useNavigate();
  const isSuperAdmin = profile?.role === 'superadmin';

  const { data: employees = [] } = useProfiles();
  const { data: departmentsData = [] } = useDepartments();
  const { data: rankings = { departments: [], jobTitles: [], deptToJobs: {} } } = useRankings();
  const updateRankings = useUpdateRankings();
  const deleteMetadata = useDeleteMetadata();
  const { data: visibility = {} } = useVisibilitySettings();
  const updateVisibility = useUpdateVisibilitySettings();

  const [rankingsForm, setRankingsForm] = useState<Rankings>({ departments: [], jobTitles: [], deptToJobs: {} });
  const [visibilityForm, setVisibilityForm] = useState<VisibilityMap>({});
  const [selectedRankDept, setSelectedRankDept] = useState<string | null>(null);

  // Initialize form states when data loads
  useEffect(() => {
    if (rankings) {
      setRankingsForm({
        departments: [...(rankings.departments || [])],
        jobTitles: [...(rankings.jobTitles || [])],
        deptToJobs: rankings.deptToJobs ? { ...rankings.deptToJobs } : {}
      });
      if (rankings.departments && rankings.departments.length > 0 && !selectedRankDept) {
        setSelectedRankDept(rankings.departments[0]);
      }
    }
  }, [rankings]);

  useEffect(() => {
    if (visibility) {
      setVisibilityForm({ ...visibility });
    }
  }, [visibility]);

  // Deduplicated, normalized, sorted departments from DB (fallback)
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

  const handleSave = () => {
    updateRankings.mutate(rankingsForm);
    updateVisibility.mutate(visibilityForm, {
      onSuccess: () => {
        toast.success("Security and Ranking settings updated!");
        navigate(-1);
      }
    });
  };

  return (
    <div className="max-w-[1200px] mx-auto pb-10">
      <Tabs defaultValue="rankings" className="space-y-6">
      <div className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 -mx-4 px-4 pt-4 border-b shadow-sm space-y-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-display text-3xl font-bold flex items-center gap-2">
              <ShieldCheck className="h-8 w-8 text-primary" /> Administrative Control Center
            </h1>
            <p className="text-muted-foreground text-sm">Manage organizational priority and departmental visibility restrictions.</p>
          </div>
        </div>
        
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="rankings" className="flex items-center gap-2"><ListOrdered className="h-4 w-4" /> Rankings</TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Access Matrix</TabsTrigger>
        </TabsList>
      </div>

        <TabsContent value="rankings" className="py-4 space-y-6">
          <Tabs defaultValue="departmental" className="w-full">
            <TabsList className="grid w-full grid-cols-1 mb-6 h-9 p-1 bg-muted/50">
              <TabsTrigger value="departmental" className="text-xs gap-2">
                <LayoutGrid className="h-3.5 w-3.5" /> Departmental Roles
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
                        onAdd={v => setRankingsForm(prev => ({ ...prev, departments: [...(prev.departments || []), normalize(v)] }))}
                      />
                    )}
                  </div>
                  <RankListBuilder
                    items={rankingsForm.departments || []}
                    available={departments}
                    viewerItem={profile?.department}
                    seniorityList={rankings.departments}
                    onChange={v => setRankingsForm({ ...rankingsForm, departments: v })}
                    onDeleteGlobal={isSuperAdmin ? (v => deleteMetadata.mutate({ type: 'department', value: v }, {
                      onSuccess: () => {
                        toast.success(`Department "${v}" deleted`);
                        setRankingsForm(prev => ({ ...prev, departments: (prev.departments || []).filter(x => x !== v) }));
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

                        const visibleDepts = (rankingsForm.departments || []).filter(d =>
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
                                  jobTitles: Array.from(new Set([...(prev.jobTitles || []), normalized])),
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
                        available={rankingsForm.jobTitles || []}
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
                              jobTitles: (prev.jobTitles || []).filter(x => x !== v),
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
          </Tabs>
        </TabsContent>

        <TabsContent value="security" className="py-4 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="rounded-lg border bg-muted/20 p-1 flex-1 w-full">
              <p className="text-[10px] text-muted-foreground p-2 italic">
                Define visibility and administrative access. Base department rules apply to everyone unless overridden by a specific role.
              </p>
            </div>
            {isSuperAdmin && (
              <div className="flex items-center gap-2">
                <AddRoleOverrideButton
                  departments={(rankingsForm.departments || []).length > 0 ? (rankingsForm.departments || []) : departments}
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
                  departments={(rankingsForm.departments || []).length > 0 ? (rankingsForm.departments || []) : departments}
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
            const depts = (rankingsForm.departments || []).length > 0 ? (rankingsForm.departments || []) : departments;
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
                  <div className="overflow-x-auto rounded-md border bg-card shadow-sm w-full">
                    <AccessMatrix
                      departments={depts}
                      value={visibilityForm}
                      onChange={setVisibilityForm}
                      canEdit={canE}
                      currentUserManagedDepts={currentUserManagedDepts}
                      type="dept"
                      employees={employees}
                      rankings={rankingsForm}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="roles_table" className="mt-0">
                  <div className="overflow-x-auto rounded-md border bg-card shadow-sm w-full">
                    <AccessMatrix
                      departments={depts}
                      value={visibilityForm}
                      onChange={setVisibilityForm}
                      canEdit={canE}
                      currentUserManagedDepts={currentUserManagedDepts}
                      type="role"
                      employees={employees}
                      rankings={rankingsForm}
                    />
                  </div>
                </TabsContent>
              </Tabs>
            );
          })()}
        </TabsContent>
      </Tabs>

      <div className="mt-6 border-t pt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
        <Button onClick={handleSave} className="bg-gradient-primary text-white" disabled={updateRankings.isPending || updateVisibility.isPending}>
          {updateRankings.isPending || updateVisibility.isPending ? "Saving..." : "Save All Changes"}
        </Button>
      </div>
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
  type = 'dept',
  employees,
  rankings
}: {
  departments: string[],
  value: VisibilityMap,
  onChange: (v: VisibilityMap) => void,
  canEdit?: boolean,
  currentUserManagedDepts?: string[] | null,
  type?: 'dept' | 'role',
  employees: any[],
  rankings: Rankings
}) {
  const { profile } = useApp();
  const isSuperAdmin = profile?.role === 'superadmin';

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
      const aName = (employees.find((p: any) => p.id === aId)?.name || aId).toLowerCase();
      const bName = (employees.find((p: any) => p.id === bId)?.name || bId).toLowerCase();
      return aName.localeCompare(bName);
    });

    const roleKeysSorted = roleKeys.sort((a, b) => a.localeCompare(b));

    let result = [...personKeysSorted, ...roleKeysSorted];

    // FILTERING LOGIC: If not superadmin, only show keys they manage
    if (currentUserManagedDepts) {
      result = result.filter(k => {
        if (k.startsWith('profile:')) {
          const id = k.split(':')[1];
          const prof = employees.find((p: any) => p.id === id);
          const dept = (prof?.department || '').toLowerCase();
          return currentUserManagedDepts.map(d => d.toLowerCase()).includes(dept);
        }
        const [dept] = k.split(':');
        return currentUserManagedDepts.map(d => d.toLowerCase()).includes((dept || '').toLowerCase());
      });
    }

    return result;
  }, [departments, value, currentUserManagedDepts, type, employees]);

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
        <TooltipContent
          className="z-[9999] max-w-[220px] text-center shadow-lg"
          side="top"
          sideOffset={8}
          avoidCollisions
          collisionPadding={16}
        >
          {help}
        </TooltipContent>
      </Tooltip>
    </div>
  );

  // Reusable dept picker popover used in multiple columns
  const DeptPicker = ({ title, selected, onToggle, disabled, triggerLabel }: {
    title: string; selected: string[]; onToggle: (d: string) => void; disabled?: boolean; triggerLabel?: string;
  }) => (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "text-[10px] px-1.5 py-0.5 rounded border transition-colors",
            selected.length > 0 ? "border-primary/40 bg-primary/10 text-primary" : "border-muted text-muted-foreground",
            disabled && "opacity-40 cursor-not-allowed"
          )}
        >
          {selected.length > 0 ? `${selected.length}d` : (triggerLabel || "Depts")}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-3 z-[200]" side="right">
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</div>
          <div className="grid gap-1 max-h-48 overflow-y-auto">
            {departments.map(d => (
              <label key={d} className="flex items-center justify-between gap-2 text-xs hover:bg-muted/40 px-1 rounded">
                <span className="truncate">{d}</span>
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={selected.includes(d)}
                  onChange={() => onToggle(d)}
                  className="h-3 w-3"
                />
              </label>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );

  // Separate person vs role keys for the role override tab
  const personKeys = type === 'role' ? filteredKeys.filter(k => k.startsWith('profile:')) : [];
  const roleOnlyKeys = type === 'role' ? filteredKeys.filter(k => !k.startsWith('profile:')) : [];

  const renderRow = (key: string) => {
    const settings = value[key] || { sees: [key], sees_jobs: true, sees_profiles: true };
    const isPersonKey = key.startsWith('profile:');
    const isCustom = type === 'role';

    const toggleDept = (dept: string) => {
      if (!canEdit) return;
      const newSees = (settings.sees||[]).includes(dept)
        ? (settings.sees||[]).filter(d => d !== dept)
        : [...(settings.sees||[]), dept];
      onChange({ ...value, [key]: { ...settings, sees: newSees } });
    };
    const toggleBool = (field: keyof VisibilityMap[string]) => {
      if (!canEdit) return;
      onChange({ ...value, [key]: { ...settings, [field]: !settings[field] } });
    };
    const toggleAssignDept = (dept: string) => {
      if (!canEdit) return;
      const cur = settings.assignable_depts || [];
      const next = cur.includes(dept) ? cur.filter(d => d !== dept) : [...cur, dept];
      onChange({ ...value, [key]: { ...settings, can_assign_tasks: next.length > 0, assignable_depts: next } });
    };
    const toggleEditDept = (dept: string) => {
      if (!canEdit) return;
      const cur = settings.editable_depts || [];
      const next = cur.includes(dept) ? cur.filter(d => d !== dept) : [...cur, dept];
      onChange({ ...value, [key]: { ...settings, can_edit_profiles: next.length > 0, editable_depts: next } });
    };
    const toggleProfileDept = (dept: string) => {
      if (!canEdit) return;
      const cur = settings.viewable_profile_depts || [];
      const next = cur.includes(dept) ? cur.filter(d => d !== dept) : [...cur, dept];
      onChange({ ...value, [key]: { ...settings, viewable_profile_depts: next } });
    };
    const toggleManagedDept = (dept: string) => {
      if (!canEdit) return;
      const cur = settings.manages_depts || [];
      const next = cur.includes(dept) ? cur.filter(d => d !== dept) : [...cur, dept];
      onChange({ ...value, [key]: { ...settings, manages_depts: next } });
    };
    const displayLabel = isPersonKey
      ? (employees.find((p: any) => p.id === key.split(':')[1])?.name || key)
      : key;

    return (
      <tr key={key} className="border-b hover:bg-muted/5 transition-colors">
        <td className="sticky left-0 z-10 bg-background px-3 py-2.5 align-middle border-r">
          <div className={cn("font-semibold text-[11px]", isPersonKey ? "text-violet-600" : isCustom ? "text-orange-600" : "text-primary")}>
            {displayLabel}
          </div>
          {isPersonKey && (
            <div className="text-[9px] text-muted-foreground">
              {employees.find((p: any) => p.id === key.split(':')[1])?.department || ''}
            </div>
          )}
          {isCustom && !isPersonKey && (
            <div className="text-[9px] text-muted-foreground">{key.split(':')[0]}</div>
          )}
        </td>
        <td className="px-3 py-2.5 align-middle">
          <div className="flex flex-wrap gap-1">
            {departments.map(target => (
              <button
                key={target}
                disabled={!canEdit}
                onClick={() => toggleDept(target)}
                className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] border transition-all",
                  (settings.sees||[]).includes(target)
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "bg-background border-muted text-muted-foreground opacity-40 hover:opacity-100"
                )}
              >{target}</button>
            ))}
          </div>
        </td>
        <td className="px-3 py-2.5 text-center align-middle">
          <input type="checkbox" disabled={!canEdit} checked={!!settings.sees_jobs}
            onChange={() => toggleBool('sees_jobs')} className="h-3 w-3" />
        </td>
        <td className="px-3 py-2.5 text-center align-middle">
          <div className="flex flex-col items-center gap-1">
            <input type="checkbox" disabled={!canEdit} checked={!!settings.sees_profiles}
              onChange={() => toggleBool('sees_profiles')} className="h-3 w-3" />
            <DeptPicker
              title="Viewable Profile Depts"
              selected={settings.viewable_profile_depts || []}
              onToggle={toggleProfileDept}
              disabled={!canEdit}
            />
          </div>
        </td>
        <td className="px-3 py-2.5 text-center align-middle">
          <div className="flex flex-col items-center gap-1">
            <input type="checkbox" disabled={!canEdit} checked={!!settings.can_assign_tasks}
              onChange={() => {
                if (!canEdit) return;
                const next = !settings.can_assign_tasks;
                if (!next) onChange({ ...value, [key]: { ...settings, can_assign_tasks: false, assignable_depts: [] } });
                else onChange({ ...value, [key]: { ...settings, can_assign_tasks: true } });
              }} className="h-3 w-3" />
            <DeptPicker
              title="Assignable Departments"
              selected={settings.assignable_depts || []}
              onToggle={toggleAssignDept}
              disabled={!canEdit}
            />
          </div>
        </td>
        {/* Update profiles */}
        <td className="px-3 py-2.5 text-center align-middle">
          <div className="flex flex-col items-center gap-1">
            <input type="checkbox" disabled={!canEdit} checked={!!settings.can_edit_profiles}
              onChange={() => {
                if (!canEdit) return;
                const next = !settings.can_edit_profiles;
                if (!next) onChange({ ...value, [key]: { ...settings, can_edit_profiles: false, editable_depts: [] } });
                else onChange({ ...value, [key]: { ...settings, can_edit_profiles: true } });
              }} className="h-3 w-3" />
            <DeptPicker
              title="Editable Departments"
              selected={settings.editable_depts || []}
              onToggle={toggleEditDept}
              disabled={!canEdit}
            />
          </div>
        </td>
        {/* Create profiles */}
        <td className="px-3 py-2.5 text-center align-middle bg-green-500/5">
          <div className="flex flex-col items-center gap-1">
            <input type="checkbox" disabled={!canEdit} checked={!!settings.can_create_profiles}
              onChange={() => {
                if (!canEdit) return;
                onChange({ ...value, [key]: { ...settings, can_create_profiles: !settings.can_create_profiles } });
              }} className="h-3 w-3" />
            
            <div className="flex flex-col gap-1 w-full max-w-[80px]">
              {/* Role picker */}
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" disabled={!canEdit} className={cn(
                    "text-[9px] px-1 py-0.5 rounded border transition-colors truncate",
                    (settings.creatable_roles || []).length > 0 ? "border-green-500/40 bg-green-500/10 text-green-700" : "border-muted text-muted-foreground",
                    !canEdit && "opacity-40 cursor-not-allowed"
                  )}>
                    Roles: {(settings.creatable_roles || ['emp']).join('+')}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-44 p-3 z-[200]" side="right">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-muted-foreground uppercase text-[10px]">Max Role to Create</div>
                    {(['employee', 'admin'] as const).map(role => (
                      <label key={role} className="flex items-center justify-between gap-2 text-xs hover:bg-muted/40 px-1 rounded cursor-pointer">
                        <span className="capitalize">{role}</span>
                        <input type="checkbox" disabled={!canEdit}
                          checked={(settings.creatable_roles || ['employee']).includes(role)}
                          onChange={() => {
                            if (!canEdit) return;
                            const cur = settings.creatable_roles || ['employee'];
                            const next = cur.includes(role) ? cur.filter(r => r !== role) : [...cur, role];
                            onChange({ ...value, [key]: { ...settings, creatable_roles: next } });
                          }} className="h-3 w-3" />
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Dept picker for creation */}
              <DeptPicker
                title="Creatable Departments"
                selected={settings.creatable_depts || []}
                onToggle={(d) => {
                  if (!canEdit) return;
                  const cur = settings.creatable_depts || [];
                  const next = cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d];
                  onChange({ ...value, [key]: { ...settings, creatable_depts: next } });
                }}
                disabled={!canEdit}
                triggerLabel="Depts"
              />

              {/* Job picker for creation */}
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" disabled={!canEdit} className={cn(
                    "text-[9px] px-1 py-0.5 rounded border transition-colors truncate",
                    (settings.creatable_jobs || []).length > 0 ? "border-green-500/40 bg-green-500/10 text-green-700" : "border-muted text-muted-foreground",
                    !canEdit && "opacity-40 cursor-not-allowed"
                  )}>
                    Jobs: {(settings.creatable_jobs || []).length > 0 ? settings.creatable_jobs?.length : 'All'}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-3 z-[200]" side="right">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-muted-foreground uppercase text-[10px]">Creatable Job Titles</div>
                    <div className="max-h-[200px] overflow-y-auto space-y-1 pr-1">
                      {rankings.jobTitles.map(title => (
                        <label key={title} className="flex items-center justify-between gap-2 text-xs hover:bg-muted/40 px-1 rounded cursor-pointer">
                          <span className="truncate">{title}</span>
                          <input type="checkbox" disabled={!canEdit}
                            checked={(settings.creatable_jobs || []).includes(title)}
                            onChange={() => {
                              if (!canEdit) return;
                              const cur = settings.creatable_jobs || [];
                              const next = cur.includes(title) ? cur.filter(t => t !== title) : [...cur, title];
                              onChange({ ...value, [key]: { ...settings, creatable_jobs: next } });
                            }} className="h-3 w-3" />
                        </label>
                      ))}
                      {rankings.jobTitles.length === 0 && <div className="text-[10px] italic text-muted-foreground text-center">No jobs defined.</div>}
                    </div>
                    <div className="text-[9px] text-muted-foreground border-t pt-1 mt-1">If none selected, all jobs are allowed.</div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </td>
        {/* Delete profiles */}
        <td className="px-3 py-2.5 text-center align-middle bg-red-500/5">
          <div className="flex flex-col items-center gap-1">
            <input type="checkbox" disabled={!canEdit} checked={!!settings.can_delete_profiles}
              onChange={() => {
                if (!canEdit) return;
                const next = !settings.can_delete_profiles;
                if (!next) onChange({ ...value, [key]: { ...settings, can_delete_profiles: false, deletable_depts: [] } });
                else onChange({ ...value, [key]: { ...settings, can_delete_profiles: true } });
              }} className="h-3 w-3" />
            <DeptPicker
              title="Deletable Departments"
              selected={settings.deletable_depts || []}
              onToggle={(d) => {
                if (!canEdit) return;
                const cur = settings.deletable_depts || [];
                const next = cur.includes(d) ? cur.filter(x => x !== d) : [...cur, d];
                onChange({ ...value, [key]: { ...settings, can_delete_profiles: next.length > 0, deletable_depts: next } });
              }}
              disabled={!canEdit}
            />
          </div>
        </td>
        <td className="px-3 py-2.5 text-center align-middle">
          <input type="checkbox" disabled={!canEdit} checked={!!settings.can_assign_self}
            onChange={() => toggleBool('can_assign_self')} className="h-3 w-3" />
        </td>
        <td className="px-3 py-2.5 text-center align-middle">
          <input type="checkbox" disabled={!canEdit} checked={!!settings.can_edit_self}
            onChange={() => toggleBool('can_edit_self')} className="h-3 w-3" />
        </td>
        <td className="px-3 py-2.5 text-center align-middle bg-primary/5">
          <input type="checkbox" disabled={!isSuperAdmin} checked={!!settings.can_access_control}
            onChange={() => toggleBool('can_access_control')} className="h-3 w-3 cursor-pointer disabled:cursor-not-allowed" />
        </td>
        <td className="px-3 py-2.5 text-center align-middle bg-primary/5">
          <input type="checkbox" disabled={!isSuperAdmin} checked={!!settings.can_edit_control}
            onChange={() => toggleBool('can_edit_control')} className="h-3 w-3 cursor-pointer disabled:cursor-not-allowed" />
        </td>
        <td className="px-3 py-2.5 align-middle bg-primary/5">
          <DeptPicker
            title="Managed Departments"
            selected={settings.manages_depts || []}
            onToggle={toggleManagedDept}
            disabled={!isSuperAdmin}
          />
        </td>
        <td className="px-3 py-2.5 text-center align-middle">
          {isCustom && canEdit && isSuperAdmin && (
            <Button type="button" variant="ghost" size="sm"
              className="h-6 px-2 text-[10px] text-muted-foreground hover:text-destructive"
              onClick={() => removeKey(key)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </td>
      </tr>
    );
  };

  return (
    <TooltipProvider delayDuration={100}>
      <div className="overflow-auto max-h-[70vh] rounded-lg border">
        <table className="w-full text-[11px] border-separate border-spacing-0">
          <thead className="sticky top-0 z-20">
            <tr className="bg-muted backdrop-blur border-y">
              <th className="sticky left-0 z-30 bg-muted px-3 py-2 text-left font-semibold w-40 border-b border-r">{type === 'dept' ? 'Viewer Dept' : 'Override Key'}</th>
              <th className="px-3 py-2 text-left font-semibold border-b"><HeaderHelp label="Visible Depts" help="Departments this viewer can see in lists." /></th>
              <th className="px-3 py-2 text-center font-semibold w-14 border-b"><HeaderHelp label="Jobs?" help="Show job titles for visible people." /></th>
              <th className="px-3 py-2 text-center font-semibold w-20 border-b"><HeaderHelp label="Profiles?" help="Eye button visibility. Use Depts picker to restrict to specific departments." /></th>
              <th className="px-3 py-2 text-center font-semibold w-20 border-b"><HeaderHelp label="Assign?" help="Can assign tasks. Use Depts picker to set which depts." /></th>
              <th className="px-3 py-2 text-center font-semibold w-20 border-b"><HeaderHelp label="Update?" help="Can edit existing profiles. Use Depts picker." /></th>
              <th className="px-3 py-2 text-center font-semibold w-20 border-b bg-green-500/5"><HeaderHelp label="Create?" help="Can create new users. Use Role picker to set max role allowed." /></th>
              <th className="px-3 py-2 text-center font-semibold w-20 border-b bg-red-500/5"><HeaderHelp label="Delete?" help="Can delete profiles. Use Depts picker." /></th>
              <th className="px-3 py-2 text-center font-semibold w-14 border-b"><HeaderHelp label="Self Task?" help="Can assign tasks to themselves." /></th>
              <th className="px-3 py-2 text-center font-semibold w-14 border-b"><HeaderHelp label="Self Edit?" help="Can edit own profile." /></th>
              <th className="px-3 py-2 text-center font-semibold w-16 text-primary border-b"><HeaderHelp label="CC Access?" help="Can open Control Center." /></th>
              <th className="px-3 py-2 text-center font-semibold w-16 text-primary border-b"><HeaderHelp label="CC Edit?" help="Can save in Control Center." /></th>
              <th className="px-3 py-2 text-left font-semibold w-20 text-primary border-b"><HeaderHelp label="Mgd Depts" help="Depts this viewer can manage (rankings/matrix)." /></th>
              <th className="px-3 py-2 text-center font-semibold w-14 border-b">Del</th>
            </tr>
          </thead>
          <tbody>
            {type === 'dept' && filteredKeys.map(key => renderRow(key))}
            {type === 'role' && (
              <>
                {personKeys.length > 0 && (
                  <>
                    <tr><td colSpan={14} className="px-3 pt-4 pb-1"><span className="text-[10px] font-bold uppercase tracking-wider text-violet-600">Person Overrides</span></td></tr>
                    {personKeys.map(key => renderRow(key))}
                  </>
                )}
                {roleOnlyKeys.length > 0 && (
                  <>
                    <tr><td colSpan={14} className="px-3 pt-4 pb-1"><span className="text-[10px] font-bold uppercase tracking-wider text-orange-600">Role Overrides</span></td></tr>
                    {roleOnlyKeys.map(key => renderRow(key))}
                  </>
                )}
                {filteredKeys.length === 0 && (
                  <tr><td colSpan={14} className="px-4 py-8 text-center text-muted-foreground italic text-xs">No overrides yet. Use the buttons above to add role or person overrides.</td></tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
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
