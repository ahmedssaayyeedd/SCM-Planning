import { FormEvent, useState } from "react";
import { FlaskConical } from "lucide-react";
import { supabase } from "../lib/db";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMsg(null);
    const { error } = mode === "in"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    if (error) setMsg(error.message);
    else if (mode === "up") setMsg("Account created. If email confirmation is enabled, check your inbox, then sign in.");
    setBusy(false);
  };

  return (
    <div className="login-bg">
      <form className="login-card" onSubmit={submit}>
        <div className="brand dark"><span className="brand-mark"><FlaskConical size={22} /></span><div><b>PharmaPlan</b><small>Production planning &amp; Gantt</small></div></div>
        <h2>{mode === "in" ? "Sign in" : "Create account"}</h2>
        <label className="field"><span>Email</span><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></label>
        <label className="field"><span>Password</span><input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {msg && <div className="note">{msg}</div>}
        <button className="btn btn-primary" disabled={busy}>{busy ? "Please wait…" : mode === "in" ? "Sign in" : "Sign up"}</button>
        <button type="button" className="link" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "No account? Create one" : "Have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
