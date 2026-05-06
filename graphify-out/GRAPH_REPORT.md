# Graph Report - project-lilt  (2026-05-06)

## Corpus Check
- 113 files · ~51,357 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 232 nodes · 304 edges · 9 communities detected
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 18 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `cec0cd50`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]

## God Nodes (most connected - your core abstractions)
1. `cn()` - 53 edges
2. `AdminEmployees()` - 14 edges
3. `useTasks()` - 11 edges
4. `useProfiles()` - 9 edges
5. `UserAvatar()` - 8 edges
6. `useVisibilitySettings()` - 8 edges
7. `useTaskActions()` - 8 edges
8. `useStatusMutation()` - 6 edges
9. `calculateTaskDuration()` - 5 edges
10. `getVisibilitySettings()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `AdminEmployees()` --calls--> `useDepartments()`  [INFERRED]
  src/pages/admin/AdminEmployees.tsx → src/hooks/useDepartments.ts
- `AdminEmployees()` --calls--> `useMyDepartmentGrants()`  [INFERRED]
  src/pages/admin/AdminEmployees.tsx → src/hooks/useDepartments.ts
- `AdminEmployees()` --calls--> `useVisibilitySettings()`  [INFERRED]
  src/pages/admin/AdminEmployees.tsx → src/hooks/useSettings.ts
- `AdminEmployees()` --calls--> `useTasks()`  [INFERRED]
  src/pages/admin/AdminEmployees.tsx → src/hooks/useTasks.ts
- `StatusBadge()` --calls--> `statusMeta()`  [INFERRED]
  src/components/StatusBadge.tsx → src/lib/task-utils.ts

## Communities (37 total, 2 thin omitted)

### Community 1 - "Community 1"
Cohesion: 0.1
Nodes (16): AdminEmployees(), canAccessControlCenter(), canEditControlCenter(), canManage(), getRank(), getVisibilitySettings(), handleDragEnd(), isSenior() (+8 more)

### Community 2 - "Community 2"
Cohesion: 0.13
Nodes (9): canView(), getRank(), UserAvatar(), useProfile(), useVisibilitySettings(), useTasks(), calculateTaskDuration(), downloadCSV() (+1 more)

### Community 3 - "Community 3"
Cohesion: 0.2
Nodes (14): addToRemoveQueue(), dispatch(), genId(), reducer(), toast(), useToast(), Toaster(), Toaster() (+6 more)

### Community 4 - "Community 4"
Cohesion: 0.24
Nodes (9): PriorityBadge(), StatusBadge(), formatDue(), initials(), priorityMeta(), statusMeta(), timeRemaining(), PriorityBadge() (+1 more)

### Community 5 - "Community 5"
Cohesion: 0.17
Nodes (4): AppLayout(), WideAppLayout(), AppProvider(), Toaster()

### Community 7 - "Community 7"
Cohesion: 0.2
Nodes (4): useDepartments(), useMyDepartmentGrants(), useCreateTask(), Calendar()

### Community 9 - "Community 9"
Cohesion: 0.44
Nodes (8): useApproveCompletion(), useDeleteTask(), useRejectCompletion(), useRequestCompletion(), useStartTask(), useStatusMutation(), useStopTask(), useTaskActions()

## Knowledge Gaps
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `Community 0` to `Community 1`, `Community 2`, `Community 4`, `Community 6`, `Community 7`, `Community 8`, `Community 10`, `Community 14`, `Community 15`, `Community 16`, `Community 17`, `Community 20`?**
  _High betweenness centrality (0.420) - this node is a cross-community bridge._
- **Why does `useTasks()` connect `Community 2` to `Community 9`, `Community 1`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Why does `UserAvatar()` connect `Community 2` to `Community 1`, `Community 4`, `Community 7`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Are the 12 inferred relationships involving `AdminEmployees()` (e.g. with `useProfiles()` and `useTasks()`) actually correct?**
  _`AdminEmployees()` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._