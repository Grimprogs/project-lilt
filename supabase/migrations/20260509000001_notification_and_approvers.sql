-- 20260509000001_notification_and_approvers.sql

-- 1. TASK ENHANCEMENT V2
-- Switch from single approved_by_id to JSON arrays for multi-approvers and watchers
ALTER TABLE public.tasks DROP COLUMN IF EXISTS approved_by_id;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS approver_ids JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS visible_to JSONB DEFAULT '[]'::jsonb;

-- 2. NOTIFICATION OVERHAUL
-- Create the activity_logs (universal ledger) and user_notifications (inboxes)

CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL,
    actor_id UUID,
    actor_name TEXT,
    task_id UUID,
    task_title TEXT,
    task_description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID REFERENCES public.activity_logs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS for activity_logs
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Activity logs are viewable by everyone authenticated"
  ON public.activity_logs FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Activity logs can be inserted by everyone authenticated"
  ON public.activity_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Activity logs should NOT be deleted or updated by regular users, only superadmins/admins if necessary.
CREATE POLICY "Admins can manage activity logs"
  ON public.activity_logs FOR ALL
  USING (public.is_admin_or_superadmin());

-- RLS for user_notifications
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON public.user_notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert notifications"
  ON public.user_notifications FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own notifications"
  ON public.user_notifications FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own notifications"
  ON public.user_notifications FOR DELETE
  USING (user_id = auth.uid());

-- Enable realtime for user_notifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'user_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
  END IF;
END $$;
