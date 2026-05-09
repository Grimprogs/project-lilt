import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type Rankings = {
  departments: string[];
  jobTitles: string[];
  deptToJobs?: Record<string, string[]>;
};

export type VisibilityMap = Record<string, {
  sees: string[]; // list of department names they can view
  sees_jobs: boolean; // can they see job titles of those they can view?
  sees_profiles: boolean; // can they click the eye button (global toggle)?
  viewable_profile_depts?: string[]; // specific depts whose profiles (eye) they can open
  can_access_control?: boolean; // can they open the control center?
  can_edit_control?: boolean; // can they save changes in the control center?
  manages_depts?: string[]; // which depts can they manage (matrix rows/rankings)?
  // Task assignment permissions
  can_assign_tasks?: boolean; // can assign tasks to people they can see
  can_assign_self?: boolean; // can assign tasks to themselves
  can_edit_self?: boolean; // can edit their own profile
  // Departments they are allowed to assign tasks to (optional more granular control)
  assignable_depts?: string[];
  // Departments whose tasks they can approve (Task Enhancement v2)
  approvable_depts?: string[];
  // Profile CREATE permission
  can_create_profiles?: boolean; // can add new employees
  creatable_roles?: ('employee' | 'admin')[]; // which roles they can create (default: employee only)
  creatable_depts?: string[]; // which departments they can create users in
  creatable_jobs?: string[]; // specific job titles they are allowed to assign
  // Profile UPDATE permission
  can_edit_profiles?: boolean; // can edit profiles in editable_depts
  editable_depts?: string[]; // departments they can edit profiles in
  // Profile DELETE permission
  can_delete_profiles?: boolean;
  deletable_depts?: string[];
}>;

export function useRankings() {
  return useQuery({
    queryKey: ["app_settings", "rankings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "rankings")
        .maybeSingle();

      if (error) {
        console.error("Error fetching rankings:", error);
        return { departments: [], jobTitles: [], deptToJobs: {} } as Rankings;
      }

      if (!data) {
        return { departments: [], jobTitles: [], deptToJobs: {} } as Rankings;
      }

      const val = (data as any).value as Rankings;
      return {
        departments: val?.departments || [],
        jobTitles: val?.jobTitles || [],
        deptToJobs: val?.deptToJobs || {}
      } as Rankings;
    }
  });
}

export function useUpdateRankings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (value: Rankings) => {
      // 1. Save rankings to app_settings
      const { error } = await supabase
        .from("app_settings")
        .upsert({ key: "rankings", value } as any);
      if (error) throw error;

      // 2. Sync departments list → departments table
      // Upsert each dept by name (using name as unique identifier)
      if (value.departments && value.departments.length > 0) {
        const rows = value.departments.map((name, idx) => ({
          name,
          rank: idx,
        }));

        // Get existing departments to find ones to delete
        const db = supabase as any;
        const { data: existing } = await db.from("departments").select("id, name");
        const existingList: { id: string; name: string }[] = existing || [];

        // Upsert all current departments
        for (const row of rows) {
          const existingRow = existingList.find(
            e => e.name.toLowerCase() === row.name.toLowerCase()
          );
          if (existingRow) {
            await db.from("departments").update({ rank: row.rank }).eq("id", existingRow.id);
          } else {
            await db.from("departments").insert({ name: row.name, rank: row.rank });
          }
        }

        // Delete departments removed from rankings
        const currentNames = value.departments.map(n => n.toLowerCase());
        const toDelete = existingList.filter(e => !currentNames.includes(e.name.toLowerCase()));
        for (const d of toDelete) {
          await db.from("departments").delete().eq("id", d.id);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app_settings", "rankings"] });
      qc.invalidateQueries({ queryKey: ["departments"] });
      toast.success("Rankings updated");
    }
  });
}

export function useVisibilitySettings() {
  return useQuery({
    queryKey: ["app_settings", "visibility"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "visibility_settings")
        .maybeSingle();

      if (error) return {} as VisibilityMap;
      if (!data) return {} as VisibilityMap;

      return ((data as any).value as VisibilityMap) || {};
    }
  });
}

export function useUpdateVisibilitySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (value: VisibilityMap) => {
      const { error } = await supabase
        .from("app_settings")
        .upsert({ key: "visibility_settings", value } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app_settings", "visibility"] });
      toast.success("Security settings updated");
    }
  });
}
