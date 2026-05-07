import { useMemo, useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { useProfiles } from "@/hooks/useProfiles";
import { useTasks, useUpdateTask } from "@/hooks/useTasks";
import { useVisibilitySettings } from "@/hooks/useSettings";
import { useMyDepartmentGrants, useDepartments } from "@/hooks/useDepartments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserAvatar } from "@/components/UserAvatar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Check, ChevronsUpDown, ArrowLeft, Pencil } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Priority } from "@/data/seed";
import { toast } from "sonner";

export default function AdminEditTask() {
  const { id } = useParams<{ id: string }>();
  const { user, profile } = useApp();
  const isSuperAdmin = user?.role === 'superadmin';
  const navigate = useNavigate();

  const { data: allTasks = [] } = useTasks({ role: "admin" });
  const { data: allEmployees = [] } = useProfiles();
  const updateTask = useUpdateTask();
  const { data: visibility = {} } = useVisibilitySettings();
  const { data: departmentsData = [] } = useDepartments();
  const { data: myGrants = [] } = useMyDepartmentGrants(profile?.id);

  const task = allTasks.find(t => t.id === id);

  // Same visibility logic as create task
  const employees = useMemo(() => {
    const visible = allEmployees.filter(e => isSuperAdmin || e.role !== 'superadmin');
    if (!profile) return visible;
    const getViewerSettings = (p: any) => {
      if (!p) return null;
      const personKey = `profile:${p.id}`;
      const roleKey = `${p.department}:${p.job_title}`;
      return visibility[personKey] || visibility[roleKey] || visibility[p.department] || null;
    };
    const viewerSettings = getViewerSettings(profile) || { sees: [], sees_jobs: false, sees_profiles: false };
    function canAssignTo(target: any) {
      if (isSuperAdmin) return true;
      if (!target) return false;
      if (target.role === 'superadmin' && target.id !== profile.id) return false;
      if (target.id === profile.id && !viewerSettings.can_assign_self) return false;
      const targetDept = (target.department || '').toLowerCase();
      const assignable = (viewerSettings.assignable_depts || []).map((s: string) => s.toLowerCase());
      if (assignable.length > 0) return assignable.includes(targetDept);
      if (viewerSettings.can_assign_tasks) {
        const ownDept = (profile.department || '').toLowerCase();
        return ownDept && targetDept === ownDept;
      }
      const targetDeptObj = departmentsData.find(d => d.name?.toLowerCase() === (target.department || '').toLowerCase());
      const targetDeptId = targetDeptObj?.id;
      if (targetDeptId && myGrants.some(g => g.department_id === targetDeptId && (g.can_update_role || g.can_create_role))) return true;
      return false;
    }
    return visible.filter(e => canAssignTo(e));
  }, [allEmployees, isSuperAdmin, profile, visibility, myGrants, departmentsData]);

  // Form state — pre-filled from task
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [openAssignee, setOpenAssignee] = useState(false);
  const [priority, setPriority] = useState<Priority>("medium");
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [dueDate, setDueDate] = useState<Date>(new Date());
  const [dueTime, setDueTime] = useState("17:00");

  // Pre-fill when task loads
  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDescription(task.description ?? "");
    setAssigneeId(task.assignee_id ?? "");
    setPriority((task.priority as Priority) ?? "medium");
    if (task.due_date) setDueDate(new Date(task.due_date));
    setDueTime(task.due_time ?? "17:00");
  }, [task]);

  if (!task) {
    return (
      <div className="flex items-center justify-center h-60 text-muted-foreground">
        Task not found or still loading…
      </div>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !assigneeId) { toast.error("Title and assignee are required."); return; }
    updateTask.mutate({
      id: task.id,
      patch: {
        title: title.trim(),
        description: description.trim(),
        assignee_id: assigneeId,
        priority,
        due_date: dueDate.toISOString().slice(0, 10),
        due_time: dueTime,
      }
    }, {
      onSuccess: () => {
        toast.success("Task updated!");
        navigate(-1);
      },
      onError: () => toast.error("Failed to update task."),
    });
  };

  const selectedEmployee = employees.find(e => e.id === assigneeId);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2">
            <Pencil className="h-6 w-6 text-primary" /> Edit task
          </h1>
          <p className="text-muted-foreground text-sm">Update task details, assignee or deadline.</p>
        </div>
      </div>

      <form onSubmit={submit} className="surface-card p-6 space-y-5">
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title" required />
        </div>

        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="Add context, acceptance criteria, links…" />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5 flex flex-col">
            <Label>Assign to</Label>
            <Popover open={openAssignee} onOpenChange={setOpenAssignee}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={openAssignee} className="justify-between font-normal">
                  {selectedEmployee
                    ? `${selectedEmployee.name} · ${selectedEmployee.job_title ?? "Employee"}`
                    : "Select user"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search user..." />
                  <CommandList>
                    <CommandEmpty>No user found.</CommandEmpty>
                    <CommandGroup>
                      {employees.map(e => (
                        <CommandItem key={e.id} value={`${e.name} ${e.username} ${e.job_title}`}
                          onSelect={() => { setAssigneeId(e.id); setOpenAssignee(false); }}
                          className="flex items-center gap-2">
                          <Check className={cn("h-4 w-4 shrink-0", assigneeId === e.id ? "opacity-100" : "opacity-0")} />
                          <UserAvatar name={e.name} color={e.avatar_color ?? undefined} size="sm" />
                          <div className="flex flex-col">
                            <span className="font-medium">{e.name}</span>
                            <span className="text-[10px] text-muted-foreground leading-none">{e.job_title ?? "Employee"}</span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v: any) => setPriority(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Due date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dueDate && "text-muted-foreground")}>
                  <CalendarIcon className="h-4 w-4" /> {format(dueDate, "PPP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={dueDate} onSelect={d => d && setDueDate(d)} initialFocus className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label>Due time</Label>
            <Input type="time" value={dueTime} onChange={e => setDueTime(e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" disabled={updateTask.isPending} className="bg-gradient-primary text-white shadow-glow hover:opacity-95">
            {updateTask.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
