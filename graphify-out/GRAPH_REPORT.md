# Graph Report - project-lilt  (2026-05-04)

## Corpus Check
- 111 files · ~47,428 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 211 nodes · 266 edges · 9 communities detected
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 16 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `cfbcf5f9`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 10|Community 10]]

## God Nodes (most connected - your core abstractions)
1. `cn()` - 53 edges
2. `useTasks()` - 11 edges
3. `AdminEmployees()` - 11 edges
4. `UserAvatar()` - 8 edges
5. `useProfiles()` - 8 edges
6. `useTaskActions()` - 8 edges
7. `useStatusMutation()` - 6 edges
8. `calculateTaskDuration()` - 5 edges
9. `toast()` - 4 edges
10. `useToast()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `AdminEmployees()` --calls--> `useProfiles()`  [INFERRED]
  src/pages/admin/AdminEmployees.tsx → src/hooks/useProfiles.ts
- `AdminEmployees()` --calls--> `useTasks()`  [INFERRED]
  src/pages/admin/AdminEmployees.tsx → src/hooks/useTasks.ts
- `StatusBadge()` --calls--> `statusMeta()`  [INFERRED]
  src/components/StatusBadge.tsx → src/lib/task-utils.ts
- `PriorityBadge()` --calls--> `priorityMeta()`  [INFERRED]
  src/components/StatusBadge.tsx → src/lib/task-utils.ts
- `Toaster()` --calls--> `useToast()`  [INFERRED]
  src/components/ui/toaster.tsx → src/hooks/use-toast.ts

## Communities (37 total, 3 thin omitted)

### Community 1 - "Community 1"
Cohesion: 0.14
Nodes (11): AdminEmployees(), canManage(), getRank(), useCreateEmployee(), useDeleteEmployee(), useDeleteMetadata(), useUpdateProfile(), useRankings() (+3 more)

### Community 2 - "Community 2"
Cohesion: 0.17
Nodes (9): canView(), getRank(), UserAvatar(), useProfile(), useProfiles(), useTasks(), calculateTaskDuration(), downloadCSV() (+1 more)

### Community 3 - "Community 3"
Cohesion: 0.2
Nodes (14): addToRemoveQueue(), dispatch(), genId(), reducer(), toast(), useToast(), Toaster(), Toaster() (+6 more)

### Community 4 - "Community 4"
Cohesion: 0.24
Nodes (9): PriorityBadge(), StatusBadge(), formatDue(), initials(), priorityMeta(), statusMeta(), timeRemaining(), PriorityBadge() (+1 more)

### Community 7 - "Community 7"
Cohesion: 0.2
Nodes (3): AppLayout(), AppProvider(), Toaster()

### Community 8 - "Community 8"
Cohesion: 0.44
Nodes (8): useApproveCompletion(), useDeleteTask(), useRejectCompletion(), useRequestCompletion(), useStartTask(), useStatusMutation(), useStopTask(), useTaskActions()

## Knowledge Gaps
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `cn()` connect `Community 0` to `Community 1`, `Community 2`, `Community 4`, `Community 5`, `Community 6`, `Community 9`, `Community 10`, `Community 11`, `Community 14`, `Community 15`, `Community 16`, `Community 19`?**
  _High betweenness centrality (0.432) - this node is a cross-community bridge._
- **Why does `useTasks()` connect `Community 2` to `Community 8`, `Community 1`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Why does `UserAvatar()` connect `Community 2` to `Community 1`, `Community 10`, `Community 4`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Are the 10 inferred relationships involving `AdminEmployees()` (e.g. with `useProfiles()` and `useTasks()`) actually correct?**
  _`AdminEmployees()` has 10 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.14 - nodes in this community are weakly interconnected._