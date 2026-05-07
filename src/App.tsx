import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AppProvider } from "@/context/AppContext";
import { AppLayout } from "@/components/AppLayout";
import { WideAppLayout } from "@/components/WideAppLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminEmployees from "./pages/admin/AdminEmployees";
import AdminEmployeeProfile from "./pages/admin/AdminEmployeeProfile";
import AdminTasks from "./pages/admin/AdminTasks";
import AdminCreateTask from "./pages/admin/AdminCreateTask";
import AdminEditTask from "./pages/admin/AdminEditTask";
import AdminApprovals from "./pages/admin/AdminApprovals";
import AdminControlCenter from "./pages/admin/AdminControlCenter";

import EmployeeDashboard from "./pages/employee/EmployeeDashboard";
import EmployeeTasks from "./pages/employee/EmployeeTasks";
import EmployeeProfile from "./pages/employee/EmployeeProfile";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AppProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login/admin" element={<Login role="admin" />} />
            <Route path="/login/employee" element={<Login role="employee" />} />

            <Route path="/admin" element={<ProtectedRoute role="admin"><AppLayout><AdminDashboard /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/employees" element={<ProtectedRoute role="admin"><AppLayout><AdminEmployees /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/employees/wide" element={<ProtectedRoute role="admin"><WideAppLayout><AdminEmployees /></WideAppLayout></ProtectedRoute>} />
            <Route path="/admin/employees/:id" element={<ProtectedRoute role="admin"><AppLayout><AdminEmployeeProfile /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/tasks" element={<ProtectedRoute role="admin"><AppLayout><AdminTasks /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/my-tasks" element={<ProtectedRoute role="admin"><AppLayout><EmployeeTasks /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/tasks/new" element={<ProtectedRoute role="admin"><AppLayout><AdminCreateTask /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/tasks/:id/edit" element={<ProtectedRoute role="admin"><AppLayout><AdminEditTask /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/approvals" element={<ProtectedRoute role="admin"><AppLayout><AdminApprovals /></AppLayout></ProtectedRoute>} />
            <Route path="/admin/control-center" element={<ProtectedRoute role="admin"><AppLayout><AdminControlCenter /></AppLayout></ProtectedRoute>} />

            <Route path="/me" element={<ProtectedRoute role="employee"><AppLayout><EmployeeDashboard /></AppLayout></ProtectedRoute>} />
            <Route path="/me/tasks" element={<ProtectedRoute role="employee"><AppLayout><EmployeeTasks /></AppLayout></ProtectedRoute>} />
            <Route path="/me/team" element={<ProtectedRoute role="employee"><AppLayout><AdminEmployees /></AppLayout></ProtectedRoute>} />
            <Route path="/me/team/wide" element={<ProtectedRoute role="employee"><WideAppLayout><AdminEmployees /></WideAppLayout></ProtectedRoute>} />
            <Route path="/me/employees/:id" element={<ProtectedRoute role="employee"><AppLayout><AdminEmployeeProfile /></AppLayout></ProtectedRoute>} />
            <Route path="/me/profile" element={<ProtectedRoute role="employee"><AppLayout><EmployeeProfile /></AppLayout></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AppProvider>
  </QueryClientProvider>
);

export default App;
