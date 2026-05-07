export type Role = "superadmin" | "admin" | "employee";

export type TaskStatus = "pending" | "in_progress" | "completion_requested" | "completed" | "overdue";
export type Priority = "low" | "medium" | "high" | "urgent";

export type NotificationType =
  | "task_assigned"
  | "task_started"
  | "task_stopped"
  | "completion_requested"
  | "completion_approved"
  | "completion_rejected";

export interface AppNotification {
  id: string;
  type: NotificationType;
  taskId: string;
  taskTitle: string;
  taskDescription?: string;  // short snippet for approval cards
  actorId: string;
  actorName: string;
  audience: string; // profile id OR 'admin'
  createdAt: string;
  read: boolean;
}

export interface Employee {
  id: string;
  name: string;
  username: string;
  password: string;
  email: string;
  role: string; // job title
  department: string;
  avatarColor: string;
  joinedAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  assigneeId: string;
  priority: Priority;
  status: TaskStatus;
  startDate: string; // ISO
  dueDate: string;   // ISO
  dueTime: string;   // HH:mm
  createdAt: string;
}

const colors = [
  "from-indigo-500 to-violet-500",
  "from-fuchsia-500 to-pink-500",
  "from-sky-500 to-blue-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-red-500",
  "from-cyan-500 to-sky-500",
  "from-purple-500 to-indigo-500",
];

export const seedEmployees: Employee[] = [
  { id: "e1", name: "Aarav Sharma",  username: "aarav",  password: "emp123", email: "aarav@tasklane.io",  role: "Frontend Engineer", department: "Engineering", avatarColor: colors[0], joinedAt: "2024-02-11" },
  { id: "e2", name: "Sofia Martínez", username: "sofia", password: "emp123", email: "sofia@tasklane.io", role: "Product Designer",  department: "Design",      avatarColor: colors[1], joinedAt: "2023-09-04" },
  { id: "e3", name: "Liam O'Connor",  username: "liam",  password: "emp123", email: "liam@tasklane.io",  role: "Backend Engineer",  department: "Engineering", avatarColor: colors[2], joinedAt: "2024-05-22" },
  { id: "e4", name: "Yuki Tanaka",    username: "yuki",  password: "emp123", email: "yuki@tasklane.io",  role: "QA Engineer",       department: "Engineering", avatarColor: colors[3], joinedAt: "2025-01-14" },
  { id: "e5", name: "Nadia Hassan",   username: "nadia", password: "emp123", email: "nadia@tasklane.io", role: "Marketing Lead",    department: "Marketing",   avatarColor: colors[4], joinedAt: "2023-04-08" },
  { id: "e6", name: "Diego Rossi",    username: "diego", password: "emp123", email: "diego@tasklane.io", role: "DevOps Engineer",   department: "Platform",    avatarColor: colors[5], joinedAt: "2024-11-30" },
  { id: "e7", name: "Priya Iyer",     username: "priya", password: "emp123", email: "priya@tasklane.io", role: "Data Analyst",      department: "Data",        avatarColor: colors[6], joinedAt: "2025-03-19" },
  { id: "e8", name: "Marcus Cole",    username: "marcus",password: "emp123", email: "marcus@tasklane.io",role: "Account Manager",   department: "Sales",       avatarColor: colors[7], joinedAt: "2024-08-02" },
];

const today = new Date();
function daysFrom(d: number) {
  const dt = new Date(today);
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().slice(0, 10);
}

export const seedTasks: Task[] = [
  { id: "t1",  title: "Redesign onboarding flow",        description: "Refresh the 3-step onboarding with new illustrations and copy.", assigneeId: "e2", priority: "high",   status: "in_progress", startDate: daysFrom(-3), dueDate: daysFrom(2),  dueTime: "17:00", createdAt: daysFrom(-3) },
  { id: "t2",  title: "Fix billing webhook retries",     description: "Stripe webhook is dropping events under load.",                  assigneeId: "e3", priority: "urgent", status: "overdue",     startDate: daysFrom(-8), dueDate: daysFrom(-1), dueTime: "12:00", createdAt: daysFrom(-8) },
  { id: "t3",  title: "Q2 launch landing page",           description: "Build hero, features, pricing, and FAQ.",                        assigneeId: "e1", priority: "high",   status: "in_progress", startDate: daysFrom(-2), dueDate: daysFrom(4),  dueTime: "18:00", createdAt: daysFrom(-2) },
  { id: "t4",  title: "Customer interview synthesis",     description: "Summarize 12 interviews into themes.",                           assigneeId: "e5", priority: "medium", status: "pending",     startDate: daysFrom(0),  dueDate: daysFrom(6),  dueTime: "15:30", createdAt: daysFrom(0)  },
  { id: "t5",  title: "Cluster autoscaling tuning",       description: "Adjust HPA thresholds for the API service.",                     assigneeId: "e6", priority: "medium", status: "completed",   startDate: daysFrom(-10),dueDate: daysFrom(-3), dueTime: "10:00", createdAt: daysFrom(-10)},
  { id: "t6",  title: "Test plan for v2.4 release",       description: "Create regression test plan and assign owners.",                 assigneeId: "e4", priority: "high",   status: "in_progress", startDate: daysFrom(-1), dueDate: daysFrom(3),  dueTime: "16:00", createdAt: daysFrom(-1) },
  { id: "t7",  title: "Pipeline for cohort analytics",    description: "Build dbt models for weekly cohort retention.",                  assigneeId: "e7", priority: "medium", status: "pending",     startDate: daysFrom(1),  dueDate: daysFrom(8),  dueTime: "12:00", createdAt: daysFrom(1)  },
  { id: "t8",  title: "Renew enterprise contracts",       description: "Follow up on 5 expiring enterprise contracts.",                  assigneeId: "e8", priority: "urgent", status: "in_progress", startDate: daysFrom(-4), dueDate: daysFrom(1),  dueTime: "17:30", createdAt: daysFrom(-4) },
  { id: "t9",  title: "Accessibility audit",              description: "Run axe + manual audit on dashboard.",                            assigneeId: "e2", priority: "low",    status: "pending",     startDate: daysFrom(2),  dueDate: daysFrom(10), dueTime: "14:00", createdAt: daysFrom(2)  },
  { id: "t10", title: "Migrate auth to JWT rotation",     description: "Implement refresh token rotation.",                              assigneeId: "e3", priority: "high",   status: "in_progress", startDate: daysFrom(-1), dueDate: daysFrom(5),  dueTime: "18:00", createdAt: daysFrom(-1) },
  { id: "t11", title: "Press kit assets",                 description: "Prepare logos, screenshots, and bios.",                          assigneeId: "e5", priority: "low",    status: "completed",   startDate: daysFrom(-12),dueDate: daysFrom(-5), dueTime: "11:00", createdAt: daysFrom(-12)},
  { id: "t12", title: "Bug bash: dashboard widgets",      description: "Find and triage UI bugs.",                                       assigneeId: "e4", priority: "medium", status: "overdue",     startDate: daysFrom(-9), dueDate: daysFrom(-2), dueTime: "17:00", createdAt: daysFrom(-9) },
  { id: "t13", title: "SOC2 evidence collection",         description: "Gather Q2 control evidence.",                                    assigneeId: "e6", priority: "high",   status: "pending",     startDate: daysFrom(0),  dueDate: daysFrom(7),  dueTime: "16:00", createdAt: daysFrom(0)  },
  { id: "t14", title: "Pricing experiment analysis",      description: "Analyze A/B results from June pricing test.",                    assigneeId: "e7", priority: "medium", status: "completed",   startDate: daysFrom(-14),dueDate: daysFrom(-7), dueTime: "13:00", createdAt: daysFrom(-14)},
  { id: "t15", title: "Onboarding emails sequence",       description: "Draft a 5-email welcome sequence.",                              assigneeId: "e5", priority: "medium", status: "in_progress", startDate: daysFrom(-2), dueDate: daysFrom(3),  dueTime: "17:00", createdAt: daysFrom(-2) },
  { id: "t16", title: "Refactor task list virtualizer",   description: "Improve performance for 5k+ tasks.",                             assigneeId: "e1", priority: "low",    status: "pending",     startDate: daysFrom(3),  dueDate: daysFrom(12), dueTime: "18:00", createdAt: daysFrom(3)  },
];
