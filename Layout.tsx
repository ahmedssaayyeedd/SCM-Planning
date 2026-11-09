import { NavLink, Outlet } from "react-router-dom";
import {
  Boxes, CalendarRange, ClipboardList, Database, Factory, FlaskConical, LayoutDashboard, LogOut, ShieldAlert,
} from "lucide-react";
import { isDemo, supabase } from "../lib/db";
import { useStore } from "../lib/store";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/planner", label: "Gantt planner", icon: CalendarRange },
  { to: "/orders", label: "Manufacturing orders", icon: ClipboardList },
  { to: "/materials", label: "Material plan (MRP)", icon: Boxes },
  { to: "/capacity", label: "Factory capacity", icon: Factory },
  { to: "/risks", label: "Risks & compliance", icon: ShieldAlert },
  { to: "/data", label: "Master data", icon: Database },
];

export default function Layout({ email }: { email: string | null }) {
  const { resetDemo } = useStore();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><FlaskConical size={20} /></span>
          <div><b>PharmaPlan</b><small>Production planning</small></div>
        </div>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? "active" : "")}>
              <n.icon size={18} /> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          {isDemo ? (
            <>
              <div className="demo-pill">Demo mode · data stored in this browser</div>
              <button className="btn btn-ghost-light" onClick={() => confirm("Reset all demo data to the Excel seed?") && resetDemo()}>Reset demo data</button>
            </>
          ) : (
            <>
              <div className="user">{email}</div>
              <button className="btn btn-ghost-light" onClick={() => supabase?.auth.signOut()}><LogOut size={15} /> Sign out</button>
            </>
          )}
        </div>
      </aside>
      <main className="main"><Outlet /></main>
    </div>
  );
}
