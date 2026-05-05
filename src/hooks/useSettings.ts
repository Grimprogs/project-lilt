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
  sees_profiles: boolean; // can they click the eye button?
  can_access_control?: boolean; // can they open the control center?
  can_edit_control?: boolean; // can they save changes in the control center?
  manages_depts?: string[]; // which depts can they manage (matrix rows/rankings)?
  // Task assignment permissions
  can_assign_tasks?: boolean; // can assign tasks to people they can see
  can_assign_self?: boolean; // can assign tasks to themselves
  // Departments they are allowed to assign tasks to (optional more granular control)
  assignable_depts?: string[];
  // Profile edit permissions
  can_edit_profiles?: boolean; // can edit profiles in editable_depts
  editable_depts?: string[]; // departments they can edit profiles in
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
      const { error } = await supabase
        .from("app_settings")
        .upsert({ key: "rankings", value } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app_settings", "rankings"] });
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
