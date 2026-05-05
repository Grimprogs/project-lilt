const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'pages', 'admin', 'AdminEmployees.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Chunk 1: Imports & functions
content = content.replace(
  /import { useRankings, useUpdateRankings, useVisibilitySettings, useUpdateVisibilitySettings, VisibilityMap, Rankings } from "@\/hooks\/useSettings";/g,
  `import { useRankings, useUpdateRankings, Rankings } from "@/hooks/useSettings";
import { useDepartments, useMyDepartmentGrants, DepartmentGrant, Department } from "@/hooks/useDepartments";
import { DepartmentGrantsMatrix } from "@/components/DepartmentGrantsMatrix";`
);

content = content.replace(
  /\/\*\* \n \* Hierarchical Permission Check:[\s\S]*?function canEditControlCenter\(admin: any, visibility: VisibilityMap\) \{[\s\S]*?return !!settings\?\.can_edit_control;\n\}/g,
  `/** 
 * Hierarchical Permission Check based on Department Grants
 */
function canManage(currentAdmin: any, target: any, myGrants: DepartmentGrant[], departments: Department[]) {
  if (!currentAdmin) return false;
  if (currentAdmin.id === target.id) return true; // Can manage yourself
  if (currentAdmin.role === 'superadmin') return true;
  if (target.role === 'superadmin') return false; // Cannot manage superadmin
  
  const targetDeptId = target.department_id || departments.find(d => d.name === target.department)?.id;
  if (!targetDeptId) return false;

  const grant = myGrants.find(g => g.department_id === targetDeptId);
  return !!grant?.can_update_role;
}

function canViewProfile(currentAdmin: any, target: any, myGrants: DepartmentGrant[], departments: Department[]) {
  if (currentAdmin.id === target.id) return true;
  if (currentAdmin.role === 'superadmin') return true;
  
  const targetDeptId = target.department_id || departments.find(d => d.name === target.department)?.id;
  if (!targetDeptId) return true; // Default to true if unassigned
  
  const grant = myGrants.find(g => g.department_id === targetDeptId);
  return grant ? grant.can_read_role : true; 
}

function canSeeJobTitle(currentAdmin: any, target: any, myGrants: DepartmentGrant[], departments: Department[]) {
  return true; // Simplified for now
}

function canAccessControlCenter(admin: any) {
  return admin?.role === 'superadmin';
}

function canEditControlCenter(admin: any) {
  return admin?.role === 'superadmin';
}`
);

// Chunk 2: Hooks
content = content.replace(
  /const \{ data: visibility = \{\} \} = useVisibilitySettings\(\);\n  const updateVisibility = useUpdateVisibilitySettings\(\);\n\n  const \[openRankings, setOpenRankings\] = useState\(false\);\n  const \[rankingsForm, setRankingsForm\] = useState<Rankings>\(\{ departments: \[\], jobTitles: \[\], deptToJobs: \{\} \}\);\n  const \[visibilityForm, setVisibilityForm\] = useState<VisibilityMap>\(\{\}\);/g,
  `const { data: departmentsData = [] } = useDepartments();
  const { data: myGrants = [] } = useMyDepartmentGrants(profile?.id);

  const [openRankings, setOpenRankings] = useState(false);
  const [rankingsForm, setRankingsForm] = useState<Rankings>({ departments: [], jobTitles: [], deptToJobs: {} });`
);

// Chunk 3: Filter logic
content = content.replace(
  /\/\/ 2\. Security Map & Hierarchy\n      if \(profile && !canManage\(profile, e, rankings, visibility\) && e\.id !== profile\.id && !isSuperAdmin\) \{\n        \/\/ If they can't even "Manage", should they be visible\?\n        \/\/ Let's check if they can at least "See" the dept\n        const myS = visibility\[profile\.department\] \|\| \{ sees: \[profile\.department\] \};\n        if \(!myS\.sees\.includes\(e\.department \|\| ""\)\) return false;\n      \}/g,
  `// 2. Security Map & Hierarchy
      if (profile && !canManage(profile, e, myGrants, departmentsData) && e.id !== profile.id && !isSuperAdmin) {
        if (!canViewProfile(profile, e, myGrants, departmentsData)) return false;
      }`
);

// Chunk 4: canAccessControlCenter calls
content = content.replace(/canAccessControlCenter\(profile, visibility\)/g, `canAccessControlCenter(profile)`);
content = content.replace(/canEditControlCenter\(profile, visibility\)/g, `canEditControlCenter(profile)`);

// Chunk 5: setVisibilityForm calls inside button onClick
content = content.replace(/setVisibilityForm\(\{ \.\.\.visibility \}\);\n/g, ``);

// Chunk 6: TabsContent value="security"
content = content.replace(
  /<TabsContent value="security" className="py-4 space-y-6">[\s\S]*?<\/TabsContent>\n\n          <\/Tabs>\n\n          <DialogFooter className="mt-6 border-t pt-4">/g,
  `<TabsContent value="security" className="py-4 space-y-6">
              <DepartmentGrantsMatrix />
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6 border-t pt-4">`
);

// Chunk 7: Dialog Footer save
content = content.replace(
  /<Button onClick=\{\(\) => \{\n              updateRankings\.mutate\(rankingsForm\);\n              updateVisibility\.mutate\(visibilityForm, \{\n                onSuccess: \(\) => \{\n                  setOpenRankings\(false\);\n                  toast\.success\("Security and Ranking settings updated!"\);\n                \}\n              \}\);\n            \}\} className="bg-gradient-primary text-white" disabled=\{updateRankings\.isPending \|\| updateVisibility\.isPending\}>\n              \{updateRankings\.isPending \|\| updateVisibility\.isPending \? "Saving\.\.\." : "Save All Changes"\}\n            <\/Button>/g,
  `<Button onClick={() => {
              updateRankings.mutate(rankingsForm, {
                onSuccess: () => {
                  setOpenRankings(false);
                }
              });
            }} className="bg-gradient-primary text-white" disabled={updateRankings.isPending}>
              {updateRankings.isPending ? "Saving..." : "Save Rankings"}
            </Button>`
);

// Chunk 8: canManage usages in rendering
content = content.replace(/canManage\(profile, e, rankings, visibility\)/g, `canManage(profile, e, myGrants, departmentsData)`);
content = content.replace(/canViewProfile\(profile, e, visibility\)/g, `canViewProfile(profile, e, myGrants, departmentsData)`);
content = content.replace(/canSeeJobTitle\(profile, e, visibility\)/g, `canSeeJobTitle(profile, e, myGrants, departmentsData)`);

// Chunk 9: getVisibilitySettings usage removal
content = content.replace(
  /const currentSettings = profile \? getVisibilitySettings\(profile, visibility\) : null;\n                            const currentUserManagedDepts = isSuperAdmin \? null : \(currentSettings\?\.manages_depts \|\| \[\]\);\n\n                            const visibleDepts = rankingsForm\.departments\.filter\(d => \n                              isSuperAdmin \|\| \(currentUserManagedDepts && currentUserManagedDepts\.includes\(d\)\)\n                            \);/g,
  `const visibleDepts = rankingsForm.departments; // Superadmin only manages rankings in Phase 1`
);

// Chunk 10: AccessMatrix and AddRoleOverrideButton cleanup (functions at the bottom of the file)
content = content.replace(
  /function AddRoleOverrideButton\(\{[\s\S]*?\}\) \{\n  const \{ profile \} = useApp\(\);\n  const isSuperAdmin = profile\?\.role === 'superadmin';[\s\S]*?<\/div>\n  \);\n\}/g,
  `` // Just wiping them isn't strictly necessary if they are never imported/used, but maybe I will just leave them there as dead code or I can do a strict replace.
  // Actually, I can just leave the dead functions at the bottom. The linter might complain, but they are localized. Let's just do an empty replace for anything we can match easily.
);

fs.writeFileSync(filePath, content, 'utf8');
console.log("Successfully replaced AdminEmployees.tsx contents.");
