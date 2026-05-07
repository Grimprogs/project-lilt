import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Role } from "@/data/seed";
import { ArrowLeft, CheckSquare2, Eye, EyeOff, ShieldCheck, UserRound, Download } from "lucide-react";
import { toast } from "sonner";
import { usePWAInstall } from "@/hooks/usePWAInstall";

export default function Login({ role }: { role: Role }) {
  const { login } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const { isInstallable, installPWA } = usePWAInstall();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { toast.error("Email is required."); return; }
    setLoading(true);
    const res = await login(email.trim(), password);
    setLoading(false);
    if (!res.ok) {
      toast.error(res.error ?? "Login failed. Check your credentials.");
      return;
    }
    const isUserAdmin = res.profile?.role === "admin" || res.profile?.role === "superadmin";
    const to = isUserAdmin ? "/admin" : "/me";
    const from = (location.state as any)?.from?.pathname;
    navigate(from ?? to, { replace: true });
  };

  const isAdmin = role === "admin";

  return (
    <div className="relative min-h-screen w-screen overflow-x-hidden hero-bg">
      <div className="absolute inset-0 -z-10" aria-hidden />
      <header className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 py-4">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <img src="/ztasks-logo.jpg" alt="Z-Tasksforce Logo" className="h-8 w-8 rounded-xl object-cover shadow-glow" />
          <span className="font-display text-lg font-bold">Z-Tasksforce</span>
        </Link>
        <div className="flex items-center gap-2 shrink-0">
          {isInstallable && (
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-1.5 border-primary/30 hover:bg-primary/5 text-xs"
              onClick={installPWA}
            >
              <Download className="h-3.5 w-3.5" /> Install
            </Button>
          )}
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-sm flex-col px-4 pt-6 pb-12">
        <div className="surface-card p-5 sm:p-7 animate-scale-in">
          <div className="mb-6 flex items-center gap-3">
            <div className={`grid h-11 w-11 place-items-center rounded-xl ${isAdmin ? "bg-gradient-primary text-white shadow-glow" : "bg-accent text-accent-foreground"}`}>
              {isAdmin ? <ShieldCheck className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold">{isAdmin ? "Admin sign in" : "Employee sign in"}</h1>
              <p className="text-sm text-muted-foreground">Welcome back. Please enter your details.</p>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@zeexai.com"
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow(s => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" disabled={loading} className="w-full bg-gradient-primary text-white shadow-glow hover:opacity-95">
              {loading ? "Signing in…" : `Sign in as ${isAdmin ? "Admin" : "Employee"}`}
            </Button>
          </form>



          <div className="mt-5 text-center text-sm text-muted-foreground">
            {isAdmin
              ? <><span>Are you a team member? </span><Link to="/login/employee" className="story-link text-foreground font-medium">Employee login</Link></>
              : <><span>Looking for the admin portal? </span><Link to="/login/admin" className="story-link text-foreground font-medium">Admin login</Link></>
            }
          </div>
        </div>
      </main>
    </div>
  );
}
