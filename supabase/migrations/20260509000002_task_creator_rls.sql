-- 20260509000002_task_creator_rls.sql
-- Allow the creator of a task to update and delete it, even if they aren't the assignee or a general admin.

-- 1. Update the "Users can update assigned tasks" policy to include creator
DROP POLICY IF EXISTS "Users can update assigned tasks" ON public.tasks;
CREATE POLICY "Users can update assigned or created tasks"
  ON public.tasks FOR UPDATE
  USING (assignee_id = auth.uid() OR created_by = auth.uid());

-- 2. Add a DELETE policy for creators
DROP POLICY IF EXISTS "Users can delete their own created tasks" ON public.tasks;
CREATE POLICY "Users can delete their own created tasks"
  ON public.tasks FOR DELETE
  USING (created_by = auth.uid());
