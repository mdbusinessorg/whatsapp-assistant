import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const token = Deno.env.get("WA_PANEL_TOKEN");
  if (!token || req.headers.get("x-token") !== token) return json({ error: "unauthorized" }, 401);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({}));
  if (body.action === "cmd") {
    if (!["toggle", "context", "send", "outcome", "agent"].includes(body.cmd)) return json({ error: "cmd inválido" }, 400);
    const { error } = await sb.from("wa_cmds").insert({
      instance: String(body.instance),
      cmd: body.cmd,
      arg: body.arg == null ? null : String(body.arg).slice(0, 20000),
    });
    return error ? json({ error: error.message }, 500) : json({ ok: true });
  }
  const { data, error } = await sb.from("wa_panel").select("instance,data,updated_at").order("instance");
  return error ? json({ error: error.message }, 500) : json({ now: new Date().toISOString(), instances: data });
});
