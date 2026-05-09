import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { useProfiles } from "@/hooks/useProfiles";
import { useCreateTask } from "@/hooks/useTasks";
import { useVisibilitySettings } from "@/hooks/useSettings";
import { useMyDepartmentGrants, useDepartments } from "@/hooks/useDepartments";
import { canAssignTask } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserAvatar } from "@/components/UserAvatar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Check, ChevronsUpDown, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Priority } from "@/data/seed";
import { toast } from "sonner";

export default function AdminCreateTask() {
  const { user, profile } = useApp();
  const isSuperAdmin = user?.role === 'superadmin';
  const { data: allEmployees = [] } = useProfiles();
  const createTask = useCreateTask();
  const navigate = useNavigate();

  const { data: visibility = {} } = useVisibilitySettings();
  const { data: departmentsData = [] } = useDepartments();
  const { data: myGrants = [] } = useMyDepartmentGrants(profile?.id);

  // Allowed assignees based on viewer permissions and visibility settings
  const employees = useMemo(() => {
    const visible = allEmployees.filter(e => isSuperAdmin || e.role !== 'superadmin');

    if (!profile) return visible;

    const viewer = profile;

    function canAssignTo(target: any) {
      return canAssignTask(profile, target, visibility, departmentsData, myGrants);
    }

    return visible.filter(e => canAssignTo(e));
  }, [allEmployees, isSuperAdmin, profile, visibility, myGrants, departmentsData]);

  const today = new Date();
  const inWeek = new Date(); inWeek.setDate(inWeek.getDate() + 7);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [openAssignee, setOpenAssignee] = useState(false);
  const [priority, setPriority] = useState<Priority>("medium");
  const [startDate, setStartDate] = useState<Date>(today);
  const [dueDate, setDueDate] = useState<Date>(inWeek);
  const [dueTime, setDueTime] = useState("17:00");
  const [approverIds, setApproverIds] = useState<string[]>([]);
  const [openApprover, setOpenApprover] = useState(false);
  const [visibleTo, setVisibleTo] = useState<string[]>([]);
  const [openVisible, setOpenVisible] = useState(false);

  // Self-task: ensure self is always an approver, but allow adding others
  const isSelfTask = assigneeId === profile?.id;
  const finalApproverIds = Array.from(new Set([
    ...approverIds,
    ...(isSelfTask ? [profile?.id ?? ""] : [])
  ])).filter(Boolean);


  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !assigneeId) { toast.error("Title and assignee are required."); return; }
    createTask.mutate({
      title: title.trim(),
      description: description.trim(),
      assignee_id: assigneeId,
      priority,
      due_date: dueDate.toISOString().slice(0, 10),
      due_time: dueTime,
      approver_ids: finalApproverIds,
      visible_to: visibleTo,
      created_by: profile?.id,
    } as any);
    toast.success("Task created");
    navigate("/admin/tasks");
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Create a new task</h1>
        <p className="text-muted-foreground">Assign work to a team member with clear deadlines.</p>
      </div>

      <form onSubmit={submit} className="surface-card p-6 space-y-5">
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Implement Q2 launch landing page" required />
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
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openAssignee}
                  className="justify-between font-normal"
                >
                  {assigneeId
                    ? (() => {
                        const emp = employees.find((e) => e.id === assigneeId);
                        return emp ? `${emp.name} · ${emp.job_title ?? "Employee"}` : "Select user";
                      })()
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
                      {employees.map((e) => (
                        <CommandItem
                          key={e.id}
                          value={`${e.name} ${e.username} ${e.job_title}`}
                          onSelect={() => {
                            setAssigneeId(e.id);
                            setOpenAssignee(false);
                          }}
                          className="flex items-center gap-2"
                        >
                          <Check
                            className={cn(
                              "h-4 w-4 shrink-0",
                              assigneeId === e.id ? "opacity-100" : "opacity-0"
                            )}
                          />
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
            <Label>Start date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                  <CalendarIcon className="h-4 w-4" /> {format(startDate, "PPP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={startDate} onSelect={d => d && setStartDate(d)} disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))} initialFocus className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
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
                <Calendar mode="single" selected={dueDate} onSelect={d => d && setDueDate(d)} disabled={(date) => date < new Date(new Date().setHours(0,0,0,0)) || date < new Date(new Date(startDate).setHours(0,0,0,0))} initialFocus className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Due time</Label>
            <Input type="time" value={dueTime} onChange={e => setDueTime(e.target.value)} className="w-44" />
          </div>

          {/* Approver picker (Multi-select) */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Who can approve this task?
            </Label>
            <Popover open={openApprover} onOpenChange={setOpenApprover}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={openApprover} className="w-full justify-between font-normal h-auto min-h-[40px] py-2">
                  <div className="flex flex-wrap gap-1">
                    {finalApproverIds.length > 0 ? (
                      finalApproverIds.map(id => {
                        const emp = employees.find(e => e.id === id);
                        if (!emp) return null;
                        return (
                          <div key={id} className="flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded text-xs">
                            {emp.name} {id === profile?.id && isSelfTask && "(Auto)"}
                          </div>
                        );
                      })
                    ) : "Select approvers (optional)"}
                  </div>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search approver..." />
                  <CommandList>
                    <CommandEmpty>No user found.</CommandEmpty>
                    <CommandGroup>
                      {employees.map((e) => {
                        const isSelected = finalApproverIds.includes(e.id);
                        const isAutoSelected = isSelfTask && e.id === profile?.id;
                        return (
                          <CommandItem
                            key={e.id}
                            value={`${e.name} ${e.username} ${e.job_title}`}
                            onSelect={() => {
                              if (isAutoSelected) return; // Can't unselect self if self-task
                              setApproverIds(prev =>
                                prev.includes(e.id) ? prev.filter(x => x !== e.id) : [...prev, e.id]
                              );
                            }}
                            className={cn("flex items-center gap-2", isAutoSelected && "opacity-50 cursor-not-allowed")}
                          >
                            <Check className={cn("h-4 w-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
                            <UserAvatar name={e.name} color={e.avatar_color ?? undefined} size="sm" />
                            <div className="flex flex-col">
                              <span className="font-medium">{e.name}</span>
                              <span className="text-[10px] text-muted-foreground leading-none">{e.job_title ?? "Employee"}</span>
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-[10px] text-muted-foreground">Choose who can approve when the assignee requests completion. Leave blank to use default department managers.</p>
          </div>

          {/* Watchers (Visible To) picker (Multi-select) */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="flex items-center gap-1.5">
              Who else should see this task? (Watchers)
            </Label>
            <Popover open={openVisible} onOpenChange={setOpenVisible}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={openVisible} className="w-full justify-between font-normal h-auto min-h-[40px] py-2">
                  <div className="flex flex-wrap gap-1">
                    {visibleTo.length > 0 ? (
                      visibleTo.map(id => {
                        const emp = employees.find(e => e.id === id);
                        return emp ? (
                          <div key={id} className="flex items-center gap-1 bg-muted text-foreground px-2 py-0.5 rounded text-xs">
                            {emp.name}
                          </div>
                        ) : null;
                      })
                    ) : "Select watchers (optional)"}
                  </div>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search user..." />
                  <CommandList>
                    <CommandEmpty>No user found.</CommandEmpty>
                    <CommandGroup>
                      {employees.map((e) => {
                        const isSelected = visibleTo.includes(e.id);
                        return (
                          <CommandItem
                            key={e.id}
                            value={`${e.name} ${e.username} ${e.job_title}`}
                            onSelect={() => {
                              setVisibleTo(prev =>
                                prev.includes(e.id) ? prev.filter(x => x !== e.id) : [...prev, e.id]
                              );
                            }}
                            className="flex items-center gap-2"
                          >
                            <Check className={cn("h-4 w-4 shrink-0", isSelected ? "opacity-100" : "opacity-0")} />
                            <UserAvatar name={e.name} color={e.avatar_color ?? undefined} size="sm" />
                            <div className="flex flex-col">
                              <span className="font-medium">{e.name}</span>
                              <span className="text-[10px] text-muted-foreground leading-none">{e.job_title ?? "Employee"}</span>
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-[10px] text-muted-foreground">These users will be able to see the task and get notified on completion, but cannot approve it.</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" className="bg-gradient-primary text-white shadow-glow hover:opacity-95">Create task</Button>
        </div>
      </form>
    </div>
  );
}
