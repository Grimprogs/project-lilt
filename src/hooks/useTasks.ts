// src/hooks/useTasks.ts
// Task CRUD + workflow mutations with hierarchy-aware notification routing.
// When an employee requests completion, ONLY the admins/managers who have
// can_assign_tasks permission over that employee's department are notified.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Task, TaskStatus, TaskPriority } from '@/integrations/supabase/types';
import { useApp } from '@/context/AppContext';
import { useVisibilitySettings } from '@/hooks/useSettings';
import { useProfiles } from '@/hooks/useProfiles';

type UseTasksOptions = {
  role?: 'admin' | 'employee';
  userId?: string;
};

// Compute overdue client-side
function applyOverdue(tasks: Task[]): Task[] {
  const now = new Date();
  return tasks.map(t => {
    if (t.status === 'completed' || t.status === 'completion_requested' || t.status === 'in_progress') return t;
    const time = t.due_time.includes(':') && t.due_time.split(':').length === 2
      ? `${t.due_time}:00`
      : t.due_time;
    const due = new Date(`${t.due_date}T${time}`);
    if (due < now) return { ...t, status: 'overdue' as TaskStatus };
    if (t.status === 'overdue') return { ...t, status: 'pending' as TaskStatus };
    return t;
  });
}

// -- Queries --

/** Admin: all tasks. Employee: only their tasks (RLS handles this) */
export function useTasks(options?: string | UseTasksOptions) {
  const assigneeId = typeof options === 'string'
    ? options
    : options?.role === 'employee'
      ? options.userId
      : undefined;
  const enabled = typeof options !== 'object'
    ? true
    : options == null || options.role !== 'employee' || Boolean(options.userId);

  return useQuery({
    queryKey: ['tasks', assigneeId ?? 'all'],
    queryFn: async () => {
      let q = supabase.from('tasks').select('*').order('created_at', { ascending: false });
      if (assigneeId) q = q.eq('assignee_id', assigneeId);
      const { data, error } = await q;
      if (error) throw error;
      return applyOverdue(data as Task[]);
    },
    enabled,
    refetchInterval: enabled ? 60_000 : false,
  });
}

// -- Create --

export function useCreateTask() {
  const qc = useQueryClient();
  const { pushNotification, user } = useApp();

  return useMutation({
    mutationFn: async (input: {
      title: string; description?: string; assignee_id: string;
      priority: TaskPriority; due_date: string; due_time: string; created_by?: string;
      approver_ids?: string[];
      visible_to?: string[];
    }) => {
      const { data, error } = await supabase.from('tasks').insert(input as any).select().single();
      if (error) throw error;
      return data as Task;
    },
    onSuccess: (task) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      // Notify the assignee they received a task
      if (task.assignee_id && task.assignee_id !== user?.employeeId) {
        pushNotification({
          type: 'task_assigned',
          actorId: user?.employeeId ?? 'admin',
          actorName: user?.name ?? 'Admin',
          taskTitle: task.title,
          taskDescription: task.description ?? undefined,
          taskId: task.id,
          audience: task.assignee_id,
        });
      }
    },
  });
}

// -- Delete --

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('notifications').delete().eq('task_id', id);
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

// -- Update --

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: {
      id: string;
      patch: Partial<Pick<Task, 'title' | 'description' | 'priority' | 'due_date' | 'due_time' | 'assignee_id' | 'approver_ids' | 'visible_to'>>;
    }) => {
      const { data, error } = await supabase.from('tasks').update(patch as any).eq('id', id).select().single();
      if (error) throw error;
      return data as Task;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

// -- Hierarchy-aware notification routing hook --

/**
 * Returns the list of profile IDs who should be notified when an employee
 * in `assigneeDept` requests task completion — i.e. admins with
 * can_assign_tasks permission over that department.
 */
function getApproverIds(
  assigneeDept: string,
  visibilityMap: Record<string, any>,
  allProfiles: any[]
): string[] {
  const approverIds: string[] = [];
  const deptLower = assigneeDept.toLowerCase();

  for (const profile of allProfiles) {
    if (profile.role !== 'admin' && profile.role !== 'superadmin') continue;

    // SuperAdmins always get notified
    if (profile.role === 'superadmin') {
      approverIds.push(profile.id);
      continue;
    }

    // Check visibility matrix for this profile
    const personKey = `profile:${profile.id}`;
    const roleKey = profile.department && profile.job_title
      ? `${profile.department}:${profile.job_title}`
      : null;
    const settings =
      visibilityMap[personKey] ??
      (roleKey ? visibilityMap[roleKey] : null) ??
      visibilityMap[profile.department ?? ''] ??
      null;

    if (!settings) continue;

    // Check if they have assignment permission for this dept
    const canAssign = settings.can_assign_tasks === true;
    if (!canAssign) continue;

    const assignableDepts = (settings.assignable_depts || []) as string[];
    if (assignableDepts.length === 0) {
      // can_assign_tasks with no dept restriction → their own dept
      if ((profile.department ?? '').toLowerCase() === deptLower) {
        approverIds.push(profile.id);
      }
    } else {
      if (assignableDepts.map((d: string) => d.toLowerCase()).includes(deptLower)) {
        approverIds.push(profile.id);
      }
    }
  }

  // Deduplicate
  return [...new Set(approverIds)];
}

// -- Status Mutations (with hierarchy-aware notifications) --

export function useTaskActions() {
  const qc = useQueryClient();
  const { pushActivityAndNotify, user } = useApp();
  const { data: visibilityMap = {} } = useVisibilitySettings();
  const { data: allProfiles = [] } = useProfiles();

  const updateStatus = async (taskId: string, status: TaskStatus, extra?: Record<string, unknown>) => {
    const patch: Record<string, unknown> = { status, ...extra };
    const { error } = await supabase.from('tasks').update(patch).eq('id', taskId);
    if (error) throw error;
  };

  const startTask = useMutation({
    mutationFn: ({ id }: { id: string; task?: Task }) =>
      updateStatus(id, 'in_progress', { started_at: new Date().toISOString() }),
    onSuccess: (_, { task }) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      if (!task) return;
      const assignee = allProfiles.find((p: any) => p.id === task.assignee_id);
      const dept = assignee?.department ?? '';
      const approvers = getApproverIds(dept, visibilityMap, allProfiles);
      
      pushActivityAndNotify({
        type: 'task_started',
        actorId: user?.employeeId ?? '',
        actorName: user?.name ?? 'Employee',
        taskTitle: task.title,
        taskId: task.id,
        audiences: approvers,
      });
    },
  });

  const stopTask = useMutation({
    mutationFn: ({ id }: { id: string; task?: Task }) =>
      updateStatus(id, 'pending'),
    onSuccess: (_, { task }) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      if (!task) return;
      const assignee = allProfiles.find((p: any) => p.id === task.assignee_id);
      const dept = assignee?.department ?? '';
      const approvers = getApproverIds(dept, visibilityMap, allProfiles);

      pushActivityAndNotify({
        type: 'task_stopped',
        actorId: user?.employeeId ?? '',
        actorName: user?.name ?? 'Employee',
        taskTitle: task.title,
        taskId: task.id,
        audiences: approvers,
      });
    },
  });

  const requestCompletion = useMutation({
    mutationFn: ({ id }: { id: string; task?: Task }) =>
      updateStatus(id, 'completion_requested', { completion_requested_at: new Date().toISOString() }),
    onSuccess: (_, { task }) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      if (!task) return;

      // If a specific approver was designated on this task, only notify them
      // Otherwise fall back to hierarchy-aware department approvers
      let approverIds: string[];
      if (task.approver_ids && task.approver_ids.length > 0) {
        approverIds = task.approver_ids;
      } else {
        const assignee = allProfiles.find((p: any) => p.id === task.assignee_id);
        const dept = assignee?.department ?? '';
        approverIds = getApproverIds(dept, visibilityMap, allProfiles);
      }

      // Notify each approver
      pushActivityAndNotify({
        type: 'completion_requested',
        actorId: user?.employeeId ?? '',
        actorName: user?.name ?? 'Employee',
        taskTitle: task.title,
        taskDescription: task.description ?? undefined,
        taskId: task.id,
        audiences: approverIds,
      });
    },
  });

  const approveCompletion = useMutation({
    mutationFn: async ({ id }: { id: string; task?: Task }) => {
      await supabase.from('notifications').delete().eq('task_id', id).eq('type', 'completion_requested');
      await updateStatus(id, 'completed', { approved_at: new Date().toISOString() });
    },
    onSuccess: (_, { task }) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      if (!task?.assignee_id) return;

      let approvers: string[];
      if (task.approver_ids && task.approver_ids.length > 0) {
        approvers = task.approver_ids;
      } else {
        const assignee = allProfiles.find((p: any) => p.id === task.assignee_id);
        const dept = assignee?.department ?? '';
        approvers = getApproverIds(dept, visibilityMap, allProfiles);
      }
      
      const targets = new Set([task.assignee_id, ...approvers, ...(task.visible_to || [])].filter(Boolean) as string[]);
      pushActivityAndNotify({
        type: 'completion_approved',
        actorId: user?.employeeId ?? '',
        actorName: user?.name ?? 'Admin',
        taskTitle: task.title,
        taskId: task.id,
        audiences: Array.from(targets),
      });
    },
  });

  const rejectCompletion = useMutation({
    mutationFn: async ({ id }: { id: string; task?: Task }) => {
      await supabase.from('notifications').delete().eq('task_id', id).eq('type', 'completion_requested');
      await updateStatus(id, 'in_progress');
    },
    onSuccess: (_, { task }) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      if (!task?.assignee_id) return;

      let approvers: string[];
      if (task.approver_ids && task.approver_ids.length > 0) {
        approvers = task.approver_ids;
      } else {
        const assignee = allProfiles.find((p: any) => p.id === task.assignee_id);
        const dept = assignee?.department ?? '';
        approvers = getApproverIds(dept, visibilityMap, allProfiles);
      }
      
      // Rejection doesn't strictly need to notify watchers, but keeping it consistent with approval
      const targets = new Set([task.assignee_id, ...approvers].filter(Boolean) as string[]);
      pushActivityAndNotify({
        type: 'completion_rejected',
        actorId: user?.employeeId ?? '',
        actorName: user?.name ?? 'Admin',
        taskTitle: task.title,
        taskId: task.id,
        audiences: Array.from(targets),
      });
    },
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('notifications').delete().eq('task_id', id);
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  return {
    startTask: (id: string, task?: Task) => startTask.mutate({ id, task }),
    stopTask: (id: string, task?: Task) => stopTask.mutate({ id, task }),
    requestCompletion: (id: string, task?: Task) => requestCompletion.mutate({ id, task }),
    approveCompletion: (id: string, task?: Task) => approveCompletion.mutate({ id, task }),
    rejectCompletion: (id: string, task?: Task) => rejectCompletion.mutate({ id, task }),
    deleteTask: (id: string) => deleteTask.mutate(id),
  };
}


