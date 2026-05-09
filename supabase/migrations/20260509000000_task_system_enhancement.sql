-- 20260509000000_task_system_enhancement.sql
-- Phase 1: Fix task edit RLS so all fields can be updated (not just status/description)
-- Phase 2: Add approved_by_id column for per-task approver designation

-- ============================================================================
-- PHASE 1: Fix task UPDATE RLS
-- ============================================================================
-- Problem: The original "Employees can update status of assigned tasks" policy
-- had a WITH CHECK clause that restricted employees to only updating the status
-- column to specific values. This silently blocked updates to title, due_date,
-- priority, etc.
--
-- The later fix_all_rls migration added a broader "Users can update assigned tasks"
-- policy but the old restrictive policy may still exist or conflict.
--
-- Solution: Drop all task policies and recreate clean ones that allow:
-- - Admins/Superadmins: full access to all tasks
-- - Employees: can view their assigned tasks + update ALL fields on assigned tasks

-- Helper function: is the current user an admin or superadmin?
CREATE OR REPLACE FUNCTION public.is_admin_or_superadmin()
RETURNS boolean AS $$
DECLARE
  _role text;
BEGIN
  SELECT role::text INTO _role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
  RETURN _role IN ('admin', 'superadmin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Drop ALL existing task policies to start clean
DROP POLICY IF EXISTS "Admins have full access to tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can view assigned tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can update assigned tasks" ON public.tasks;
DROP POLICY IF EXISTS "Employees can view assigned tasks" ON public.tasks;
DROP POLICY IF EXISTS "Employees can update status of assigned tasks" ON public.tasks;
DROP POLICY IF EXISTS "Admins can manage all tasks" ON public.tasks;
DROP POLICY IF EXISTS "tasks_secure_policy" ON public.tasks;

-- Recreate clean policies
-- 1. Admins & Superadmins: full CRUD on all tasks
CREATE POLICY "Admins have full access to tasks"
  ON public.tasks FOR ALL
  USING (public.is_admin_or_superadmin());

-- 2. Employees: can SELECT tasks assigned to them or created by them
CREATE POLICY "Users can view assigned tasks"
  ON public.tasks FOR SELECT
  USING (assignee_id = auth.uid() OR created_by = auth.uid());

-- 3. Employees: can UPDATE any field on tasks assigned to them (no WITH CHECK restriction)
CREATE POLICY "Users can update assigned tasks"
  ON public.tasks FOR UPDATE
  USING (assignee_id = auth.uid());

-- 4. Any authenticated user can INSERT tasks (needed for self-task creation)
DROP POLICY IF EXISTS "Users can insert tasks" ON public.tasks;
CREATE POLICY "Users can insert tasks"
  ON public.tasks FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================================
-- PHASE 2: Add approved_by_id column
-- ============================================================================
-- This column stores the designated approver for a task.
-- If NULL, the existing hierarchy-based approval routing is used.
-- If set, only that specific person can approve the task.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'approved_by_id'
  ) THEN
    ALTER TABLE public.tasks ADD COLUMN approved_by_id UUID;
  END IF;
END $$;

-- Enable realtime on tasks table (ensure it's on)
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
