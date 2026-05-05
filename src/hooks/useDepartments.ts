import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type Department = {
  id: string;
  name: string;
  rank: number;
  parent_id?: string | null;
};

export type DepartmentGrant = {
  id?: string;
  profile_id: string;
  department_id: string;
  can_create_dept: boolean;
  can_read_dept: boolean;
  can_update_dept: boolean;
  can_delete_dept: boolean;
  can_create_role: boolean;
  can_read_role: boolean;
  can_update_role: boolean;
  can_delete_role: boolean;
};

export function useDepartments() {
  return useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data, error } = await supabase.from('departments').select('*').order('rank');
      if (error) throw error;
      return data as Department[];
    }
  });
}

export function useAllDepartmentGrants() {
  return useQuery({
    queryKey: ['department_grants'],
    queryFn: async () => {
      const { data, error } = await supabase.from('department_grants').select('*');
      if (error) throw error;
      return data as DepartmentGrant[];
    }
  });
}

export function useMyDepartmentGrants(profileId: string | undefined) {
  return useQuery({
    queryKey: ['department_grants', profileId],
    enabled: !!profileId,
    queryFn: async () => {
      const { data, error } = await supabase.from('department_grants').select('*').eq('profile_id', profileId);
      if (error) throw error;
      return data as DepartmentGrant[];
    }
  });
}

export function useUpsertDepartmentGrant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (grant: Partial<DepartmentGrant>) => {
      const { error } = await (supabase.from('department_grants') as any).upsert(grant, { onConflict: 'profile_id, department_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['department_grants'] });
    }
  });
}
