-- Recreate the disco_playbooks / disco_sessions / disco_session_results tables
-- that were dropped by Werner-Backbone migration 20260429231814_drop_disco_sales_playbooks
-- on 2026-04-29. That migration mistook these for an unused Werner internal "sales
-- discovery" subsystem because the table COMMENTs in the Werner baseline labelled
-- them that way. They are actually the persistence layer for THIS app
-- (Project-Disco / Interview Copilot, hochroch/Project-Disco).
--
-- Schema mirrors the dropped baseline exactly so the existing App.jsx queries
-- (created_by, name, mindset, role_title, enabled_signals, objectives, is_shared,
--  created_at) keep working without code changes.
--
-- Lost rows from the 2026-04-29 drop: 12 playbooks, 10 sessions, 10 session results.
-- Default templates re-seed automatically on next user login (App.jsx loadPlaybooks).
--
-- IMPORTANT: This DB is shared with Werner-Backbone (project dtazswxluhmdwwibgawn).
-- Future Werner cleanup passes must NOT drop these tables. The COMMENTs below
-- exist to flag ownership for any future migration author.

CREATE TABLE IF NOT EXISTS public.disco_playbooks (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    created_by uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    created_by_email text,
    name text NOT NULL,
    mindset text DEFAULT 'interviewer'::text NOT NULL,
    role_title text DEFAULT ''::text NOT NULL,
    enabled_signals jsonb DEFAULT '{}'::jsonb NOT NULL,
    objectives jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_shared boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.disco_playbooks IS
  'OWNED BY Project-Disco app (hochroch/Project-Disco) — interview/sales copilot playbook templates. '
  'NOT a Werner-Backbone table. Do NOT drop from Werner cleanup migrations. '
  'See Werner CLAUDE.md / memory for context on the 2026-04-29 incident.';

CREATE TABLE IF NOT EXISTS public.disco_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    user_email text,
    candidate_name text,
    role_title text,
    mindset text DEFAULT 'interviewer'::text,
    playbook_name text,
    started_at timestamptz DEFAULT now(),
    ended_at timestamptz,
    duration_seconds integer,
    created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.disco_sessions IS
  'OWNED BY Project-Disco app — live interview/sales session header rows. '
  'NOT a Werner-Backbone table. Do NOT drop from Werner cleanup migrations.';

CREATE TABLE IF NOT EXISTS public.disco_session_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    session_id uuid REFERENCES public.disco_sessions(id) ON DELETE CASCADE,
    transcript jsonb DEFAULT '[]'::jsonb,
    final_scores jsonb DEFAULT '{}'::jsonb,
    debrief jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.disco_session_results IS
  'OWNED BY Project-Disco app — full transcript + final scores + debrief per session. '
  'NOT a Werner-Backbone table. Do NOT drop from Werner cleanup migrations.';

-- RLS — same shape as the dropped baseline policies.

ALTER TABLE public.disco_playbooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY disco_playbooks_select ON public.disco_playbooks FOR SELECT TO authenticated
  USING (is_shared = true OR created_by = auth.uid());
CREATE POLICY disco_playbooks_insert ON public.disco_playbooks FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY disco_playbooks_update ON public.disco_playbooks FOR UPDATE TO authenticated
  USING (created_by = auth.uid());
CREATE POLICY disco_playbooks_delete ON public.disco_playbooks FOR DELETE TO authenticated
  USING (created_by = auth.uid());

ALTER TABLE public.disco_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY disco_sessions_select ON public.disco_sessions FOR SELECT TO authenticated
  USING (true);
CREATE POLICY disco_sessions_insert ON public.disco_sessions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY disco_sessions_update ON public.disco_sessions FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

ALTER TABLE public.disco_session_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY disco_results_select ON public.disco_session_results FOR SELECT TO authenticated
  USING (true);
CREATE POLICY disco_results_insert ON public.disco_session_results FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.disco_sessions s
    WHERE s.id = disco_session_results.session_id AND s.user_id = auth.uid()
  ));
