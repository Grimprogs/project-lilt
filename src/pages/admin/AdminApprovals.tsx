import { useTasks } from "@/hooks/useTasks";
import { useProfiles } from "@/hooks/useProfiles";
import { useVisibilitySettings } from "@/hooks/useSettings";
import { TaskCard } from "@/components/TaskCard";
import { Inbox } from "lucide-react";
import { useMemo } from "react";
import { useApp } from "@/context/AppContext";

export default function AdminApprovals() {
  const { profile } = useApp();
  const { data: tasks = [] } = useTasks({ role: "admin" });
  const { data: employees = [] } = useProfiles();
  const { data: visibility = {} } = useVisibilitySettings();

  const getVisibilitySettings = (p: any) => {
    if (!p) return null;
    const personKey = `profile:${p.id}`;
    const roleKey = `${p.department}:${p.job_title}`;
    return visibility[personKey] || visibility[roleKey] || visibility[p.department] || null;
  };

  const allowedAssignDepts = useMemo(() => {
    if (profile?.role === 'superadmin') return null;
    if (!profile) return [] as string[];
    const settings = getVisibilitySettings(profile) || { sees: [], sees_jobs: false, sees_profiles: false };
    const assignable = (settings.assignable_depts || []).map((d: string) => d.toLowerCase());
    if (assignable.length > 0) return assignable;
    if (settings.can_assign_tasks && profile.department) return [profile.department.toLowerCase()];
    return [] as string[];
  }, [profile, visibility]);

  const requested = tasks.filter(t => t.status === "completion_requested");
  const filteredRequested = requested.filter(t => {
    if (profile?.role === 'superadmin') return true;
    const emp = employees.find(e => e.id === t.assignee_id);
    const dept = (emp?.department || '').toLowerCase();
    if (!allowedAssignDepts) return false;
    return allowedAssignDepts.includes(dept);
  });
  const empMap = new Map(employees.map(e => [e.id, e]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold flex items-center gap-2">
          <Inbox className="h-7 w-7 text-primary" /> Approval queue
        </h1>
        <p className="text-muted-foreground">
          Review tasks employees have marked as ready for completion.
        </p>
      </div>

      {filteredRequested.length === 0 ? (
        <div className="surface-card p-12 text-center text-muted-foreground">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-muted">
            <Inbox className="h-6 w-6" />
          </div>
          <p className="font-medium text-foreground">No pending approvals</p>
          <p className="text-sm">When employees request completion, they'll appear here.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredRequested.map(t => (
            <div key={t.id}>
              <TaskCard task={t} canApprove />
              <div className="mt-1 px-1 text-xs text-muted-foreground">
                Submitted by {empMap.get(t.assignee_id)?.name ?? "Unknown"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
