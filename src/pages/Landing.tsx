import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CheckSquare2, ShieldCheck, UserRound, ArrowRight, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { useNavigate } from "react-router-dom";

export default function Landing() {
  const { user } = useApp();
  const navigate = useNavigate();
  useEffect(() => {
    if (user?.role === "admin") navigate("/admin", { replace: true });
    if (user?.role === "employee") navigate("/me", { replace: true });
  }, [user, navigate]);

  return (
    <div className="relative min-h-screen overflow-hidden hero-bg">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/ztasks-logo.jpg" alt="Z-Tasksforce Logo" className="h-9 w-9 rounded-xl object-cover shadow-glow" />
          <span className="font-display text-xl font-bold">Z-Tasksforce</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm md:flex">
          <a className="story-link text-muted-foreground hover:text-foreground" href="#features">Features</a>
          <a className="story-link text-muted-foreground hover:text-foreground" href="#roles">Roles</a>
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost"><Link to="/login/employee">Employee</Link></Button>
          <Button asChild className="bg-gradient-primary text-white shadow-glow hover:opacity-95"><Link to="/login/admin">Admin login</Link></Button>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 pt-12 pb-20 md:pt-20 md:pb-32">
        <div className="grid items-center gap-12 md:grid-cols-2">
          <div className="animate-fade-in">
            <span className="inline-flex items-center gap-2 rounded-full border bg-card/70 px-3 py-1 text-xs font-medium backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              New · Smart deadline tracking
            </span>
            <h1 className="mt-5 font-display text-5xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
              The calmer way to <span className="gradient-text">run your team's work.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              Assign tasks, track progress, and never miss a deadline. A modern workspace built for admins and their teams — beautifully simple.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-gradient-primary text-white shadow-glow hover:opacity-95">
                <Link to="/login/admin">
                  <ShieldCheck className="h-4 w-4" /> Continue as Admin <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/login/employee">
                  <UserRound className="h-4 w-4" /> Continue as Employee
                </Link>
              </Button>
            </div>
            <div className="mt-8 grid grid-cols-3 gap-6 max-w-md">
              {[
                { k: "98%", l: "On-time rate" },
                { k: "12k+", l: "Tasks shipped" },
                { k: "4.9★", l: "Team rating" },
              ].map(s => (
                <div key={s.l}>
                  <div className="font-display text-2xl font-bold">{s.k}</div>
                  <div className="text-xs text-muted-foreground">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative animate-scale-in">
            <div className="glass-card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Today</div>
                  <div className="font-display text-xl font-bold">Sprint overview</div>
                </div>
                <div className="text-xs rounded-full border bg-success/10 text-success border-success/30 px-2 py-0.5">On track</div>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3">
                {[
                  { l: "Done", v: 24, c: "bg-success" },
                  { l: "In progress", v: 12, c: "bg-info" },
                  { l: "Overdue", v: 3,  c: "bg-destructive" },
                ].map(x => (
                  <div key={x.l} className="rounded-xl border bg-background/60 p-3">
                    <div className={`mb-2 h-1.5 w-8 rounded-full ${x.c}`} />
                    <div className="font-display text-2xl font-bold">{x.v}</div>
                    <div className="text-xs text-muted-foreground">{x.l}</div>
                  </div>
                ))}
              </div>
              <div className="mt-5 space-y-2.5">
                {["Redesign onboarding flow","Cluster autoscaling","Q2 launch landing page"].map((t, i) => (
                  <div key={t} className="flex items-center justify-between rounded-xl border bg-background/70 p-3">
                    <div className="flex items-center gap-3">
                      <div className={`h-2 w-2 rounded-full ${["bg-info","bg-success","bg-warning"][i]}`} />
                      <div className="text-sm font-medium">{t}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">Due {["Tue","Mon","Fri"][i]}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/30 blur-3xl animate-float" />
            <div className="absolute -bottom-8 -left-8 h-28 w-28 rounded-full bg-primary-glow/30 blur-3xl animate-float" />
          </div>
        </div>
      </section>
    </div>
  );
}
