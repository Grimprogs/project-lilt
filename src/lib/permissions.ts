import { DepartmentGrant, Department } from "@/hooks/useDepartments";
import { VisibilityMap } from "@/hooks/useSettings";

export function getRank(item: string | null | undefined, rankedList: string[]) {
  if (!item) return 9999;
  const idx = rankedList.findIndex(x => x.toLowerCase() === item.toLowerCase());
  return idx >= 0 ? idx : 9998;
}

/** Normalize a job title: trim + Title Case for deduplication display */
export function normalize(s: string) {
  return s.trim().replace(/\b\w/g, c => c.toUpperCase());
}

export function getVisibilitySettings(profile: any, visibility: VisibilityMap): VisibilityMap[string] | null {
  if (!profile) return null;
  // Priority: person-specific override -> role override (dept:job) -> department override
  const personKey = `profile:${profile.id}`;
  const roleKey = `${profile.department}:${profile.job_title}`;
  return visibility[personKey] || visibility[roleKey] || visibility[profile.department] || null;
}

export function canAccessControlCenter(admin: any, visibility: VisibilityMap) {
  if (admin?.role === 'superadmin') return true;
  const settings = getVisibilitySettings(admin, visibility);
  return !!settings?.can_access_control;
}

export function canEditControlCenter(admin: any, visibility: VisibilityMap) {
  if (admin?.role === 'superadmin') return true;
  const settings = getVisibilitySettings(admin, visibility);
  return !!settings?.can_edit_control;
}

/** 
 * Hierarchical Permission Check based on Department Grants
 */
export function canManage(currentAdmin: any, target: any, myGrants: DepartmentGrant[], departments: Department[], visibility: VisibilityMap) {
  if (!currentAdmin) return false;

  if (currentAdmin.role === 'superadmin') return true;

  // Hierarchical Check: Prohibit self-edit unless explicitly allowed via "Self Edit?" override
  if (currentAdmin.id === target.id) {
    const settings = getVisibilitySettings(currentAdmin, visibility);
    return !!settings?.can_edit_self;
  }

  if (target.role === 'superadmin') return false; // Cannot manage superadmin

  const targetDeptName = target.department || departments.find(d => d.id === target.department_id)?.name || "";
  const targetJobTitle = target.job_title || "";
  const settings = getVisibilitySettings(currentAdmin, visibility) || { sees: [], sees_jobs: false, sees_profiles: false };
  const editable = (settings.editable_depts || []).map((d: string) => d.toLowerCase());

  // Check Job Title restriction (seniority/rank)
  // If they have a specific list of jobs they can manage, the target must be in that list
  if (settings.creatable_jobs && settings.creatable_jobs.length > 0) {
    if (targetJobTitle && !settings.creatable_jobs.map(j => j.toLowerCase()).includes(targetJobTitle.toLowerCase())) {
      return false; // Target has a job title this admin isn't allowed to manage
    }
  }

  if (settings.can_edit_profiles) {
    // If specific departments are listed, only those are editable
    if (editable.length > 0) {
      return targetDeptName && editable.includes(targetDeptName.toLowerCase());
    }
    // Default behavior: can edit people in their own department if no specific depts listed
    if (targetDeptName && currentAdmin.department) {
      return targetDeptName.toLowerCase() === currentAdmin.department.toLowerCase();
    }
  }

  return false;
}

export function canViewProfile(currentAdmin: any, target: any, myGrants: DepartmentGrant[], departments: Department[], visibility: VisibilityMap) {
  if (currentAdmin.id === target.id) return true;
  if (currentAdmin.role === 'superadmin') return true;

  const targetDeptName = (target.department || departments.find(d => d.id === target.department_id)?.name || "").toLowerCase();
  const settings = getVisibilitySettings(currentAdmin, visibility) || { sees: [], sees_jobs: false, sees_profiles: false };

  // Granular: if viewable_profile_depts is set, use that list exclusively
  const vpd = settings.viewable_profile_depts;
  if (vpd && vpd.length > 0) {
    return targetDeptName ? vpd.map(d => d.toLowerCase()).includes(targetDeptName) : false;
  }

  // Global toggle: if sees_profiles is false, no eye button
  if (!settings.sees_profiles) return false;

  // Check if target dept is in the viewer's visible dept list
  const visibleDepts = (settings.sees || []).map(d => d.toLowerCase());
  return targetDeptName ? visibleDepts.includes(targetDeptName) : false;
}

export function canSeeJobTitle(currentAdmin: any, target: any, myGrants: DepartmentGrant[], departments: Department[]) {
  return true; // Simplified for now
}

/** Can this user create a new profile? */
export function canCreateProfile(
  currentAdmin: any,
  targetRole: 'employee' | 'admin',
  targetDept: string | null,
  targetJob: string | null,
  visibility: VisibilityMap
): boolean {
  if (!currentAdmin) return false;
  if (currentAdmin.role === 'superadmin') return true;
  const settings = getVisibilitySettings(currentAdmin, visibility);
  if (!settings?.can_create_profiles) return false;
  
  // 1. Role check
  const allowedRoles = settings.creatable_roles || ['employee'];
  if (!allowedRoles.includes(targetRole)) return false;

  // 2. Dept check
  if (targetDept && settings.creatable_depts && settings.creatable_depts.length > 0) {
    if (!settings.creatable_depts.map(d => d.toLowerCase()).includes(targetDept.toLowerCase())) return false;
  }

  // 3. Job check
  if (targetJob && settings.creatable_jobs && settings.creatable_jobs.length > 0) {
    if (!settings.creatable_jobs.map(j => j.toLowerCase()).includes(targetJob.toLowerCase())) return false;
  }

  return true;
}

/** Can this user delete the target profile? */
export function canDeleteProfile(
  currentAdmin: any,
  target: any,
  departments: Department[],
  visibility: VisibilityMap
): boolean {
  if (!currentAdmin) return false;
  if (currentAdmin.role === 'superadmin') return true;
  if (target.role === 'superadmin') return false; // can never delete superadmin
  const settings = getVisibilitySettings(currentAdmin, visibility);
  if (!settings?.can_delete_profiles) return false;
  const depts = settings.deletable_depts || [];
  if (depts.length === 0) return false; // must explicitly set depts
  const targetDept = (target.department || '').toLowerCase();
  return depts.map(d => d.toLowerCase()).includes(targetDept);
}
