// src/hooks/useTasks.ts
// Task CRUD + workflow mutations via React Query + Supabase
// Notifications are fired on every status change and on task creation.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Task, TaskStatus, TaskPriority } from '@/integrations/supabase/types';
import { useApp } from '@/context/AppContext';

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
    }) => {
      const { data, error } = await supabase.from('tasks').insert(input).select().single();
      if (error) throw error;
      return data as Task;
    },
    onSuccess: (task) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      // Notify the assignee that a task was assigned to them
      if (task.assignee_id !== user?.employeeId) {
        pushNotification({
          type: 'task_started', // reuse as "task_assigned" — we'll map it properly
          actorName: user?.name ?? 'Admin',
          taskTitle: task.title,
          taskId: task.id,
          audience: task.assignee_id,  // notify the person assigned
        });
      }
      // Also notify admins panel
      pushNotification({
        type: 'task_started',
        actorName: user?.name ?? 'Admin',
        taskTitle: task.title,
        taskId: task.id,
        audience: 'admin',
      });
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
      patch: Partial<Pick<Task, 'title' | 'description' | 'priority' | 'due_date' | 'due_time' | 'assignee_id'>>;
    }) => {
      const { data, error } = await supabase.from('tasks').update(patch).eq('id', id).select().single();
      if (error) throw error;
      return data as Task;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

// -- Status Mutations (with notifications) --

interface StatusMutationOptions {
  /** Notification type to fire after success */
  notifType: 'task_started' | 'task_stopped' | 'completion_requested' | 'completion_approved' | 'completion_rejected';
  /** Who should be notified: 'admin' audience or the employee (assignee) */
  notifyAudience: 'admin' | 'assignee';
  extra?: Partial<Task>;
}

function useStatusMutation({ notifType, notifyAudience, extra }: StatusMutationOptions) {
  const qc = useQueryClient();
  const { pushNotification, user } = useApp();

  return useMutation({
    mutationFn: async ({ id, task }: { id: string; task?: Task }) => {
      const patch: Record<string, unknown> = { status: getNewStatus(notifType), ...extra };
      if (notifType === 'task_started') patch.started_at = new Date().toISOString();
      if (notifType === 'completion_requested') patch.completion_requested_at = new Date().toISOString();
      if (notifType === 'completion_approved') patch.approved_at = new Date().toISOString();
      const { error } = await supabase.from('tasks').update(patch).eq('id', id);
      if (error) throw error;
      return task;
    },
    onSuccess: (task) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      if (!task) return;

      const audience = notifyAudience === 'admin' ? 'admin' : task.assignee_id;
      pushNotification({
        type: notifType,
        actorName: user?.name ?? 'Someone',
        taskTitle: task.title,
        taskId: task.id,
        audience,
      });
    },
  });
}

function getNewStatus(notifType: StatusMutationOptions['notifType']): TaskStatus {
  switch (notifType) {
    case 'task_started':           return 'in_progress';
    case 'task_stopped':           return 'pending';
    case 'completion_requested':   return 'completion_requested';
    case 'completion_approved':    return 'completed';
    case 'completion_rejected':    return 'in_progress';
  }
}

// Named hooks —————————————————————————————————————————————
export function useStartTask()         { return useStatusMutation({ notifType: 'task_started',          notifyAudience: 'admin' }); }
export function useStopTask()          { return useStatusMutation({ notifType: 'task_stopped',          notifyAudience: 'admin' }); }
export function useRequestCompletion() { return useStatusMutation({ notifType: 'completion_requested',  notifyAudience: 'admin' }); }
export function useApproveCompletion() { return useStatusMutation({ notifType: 'completion_approved',   notifyAudience: 'assignee' }); }
export function useRejectCompletion()  { return useStatusMutation({ notifType: 'completion_rejected',   notifyAudience: 'assignee' }); }

// -- Convenience (used by TaskCard) --

export function useTaskActions() {
  const startTask      = useStartTask();
  const stopTask       = useStopTask();
  const requestCompl   = useRequestCompletion();
  const approveCompl   = useApproveCompletion();
  const rejectCompl    = useRejectCompletion();
  const deleteTask     = useDeleteTask();

  return {
    startTask:          (id: string, task?: Task) => startTask.mutate({ id, task }),
    stopTask:           (id: string, task?: Task) => stopTask.mutate({ id, task }),
    requestCompletion:  (id: string, task?: Task) => requestCompl.mutate({ id, task }),
    approveCompletion:  (id: string, task?: Task) => approveCompl.mutate({ id, task }),
    rejectCompletion:   (id: string, task?: Task) => rejectCompl.mutate({ id, task }),
    deleteTask:         (id: string) => deleteTask.mutate(id),
  };
}
