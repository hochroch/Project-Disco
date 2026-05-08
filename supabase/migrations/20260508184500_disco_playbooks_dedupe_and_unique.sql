-- Fix: 12 duplicate playbook rows landed on first login because both the auth
-- getSession() resolution and the onAuthStateChange INITIAL_SESSION/SIGNED_IN
-- events fired the loadPlaybooks() useEffect twice in quick succession; the
-- _seedingPlaybooks JS guard only covered the "missing templates" path, not
-- the first-login else branch.
--
-- This migration deletes the existing duplicates (keeping the earliest row of
-- each pair) and adds a UNIQUE index on (created_by, name) so a future
-- frontend race can't reintroduce duplicates. App.jsx is being changed in the
-- same commit to use upsert(ignoreDuplicates:true) so concurrent inserts now
-- silently collapse instead of throwing.

DELETE FROM public.disco_playbooks
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY created_by, name ORDER BY created_at, id) AS rn
    FROM public.disco_playbooks
  ) t
  WHERE rn > 1
);

-- Partial index because created_by is nullable in this table — we don't want
-- to block edge-case rows that legitimately have no owner.
CREATE UNIQUE INDEX IF NOT EXISTS disco_playbooks_created_by_name_uidx
  ON public.disco_playbooks (created_by, name)
  WHERE created_by IS NOT NULL;
