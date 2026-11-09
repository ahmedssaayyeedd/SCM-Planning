import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { isDemo, supabase } from "./lib/db";
import { DataProvider } from "./lib/store";
import Layout from "./components/Layout";
import Login from "./components/Login";
import Dashboard from "./pages/Dashboard";
import Planner from "./pages/Planner";
import Orders from "./pages/Orders";
import Materials from "./pages/Materials";
import Capacity from "./pages/Capacity";
import RisksPage from "./pages/Risks";
import MasterData from "./pages/MasterData";

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(isDemo ? null : undefined);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!isDemo && session === undefined) return <div className="boot">Loading…</div>;
  if (!isDemo && !session) return <Login />;

  return (
    <DataProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout email={session?.user.email ?? null} />}>
            <Route index element={<Dashboard />} />
            <Route path="planner" element={<Planner />} />
            <Route path="orders" element={<Orders />} />
            <Route path="materials" element={<Materials />} />
            <Route path="capacity" element={<Capacity />} />
            <Route path="risks" element={<RisksPage />} />
            <Route path="data" element={<MasterData />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </DataProvider>
  );
}
