CREATE TABLE IF NOT EXISTS public.journey_attendance (
 subject_key text NOT NULL,
 event_id text NOT NULL CHECK (event_id IN ('ceremony','reception','celebration')),
 invitation_id text REFERENCES public.invitations(id) ON DELETE CASCADE,
 general_owner text REFERENCES public.general_rsvps(owner_hash) ON DELETE CASCADE,
 checked_in integer NOT NULL DEFAULT 0 CHECK (checked_in BETWEEN 0 AND 20),
 seated integer NOT NULL DEFAULT 0 CHECK (seated BETWEEN 0 AND checked_in),
 souvenirs integer NOT NULL DEFAULT 0 CHECK (souvenirs BETWEEN 0 AND checked_in),
 note text NOT NULL DEFAULT '',
 revision integer NOT NULL DEFAULT 1,
 updated_at text NOT NULL,
 updated_by text NOT NULL,
 PRIMARY KEY(subject_key,event_id)
);
CREATE INDEX IF NOT EXISTS journey_attendance_invitation_idx ON public.journey_attendance(invitation_id);
CREATE INDEX IF NOT EXISTS journey_attendance_general_idx ON public.journey_attendance(general_owner);
CREATE TABLE IF NOT EXISTS public.journey_tasks (
 id text PRIMARY KEY,
 event_id text NOT NULL CHECK (event_id IN ('ceremony','reception','celebration')),
 kind text NOT NULL CHECK (kind IN ('coordination','tea','photo')),
 family_name text NOT NULL,
 members text NOT NULL DEFAULT '',
 invitation_id text REFERENCES public.invitations(id) ON DELETE SET NULL,
 assignee text NOT NULL DEFAULT '',
 contact text NOT NULL DEFAULT '',
 scheduled_at text NOT NULL DEFAULT '',
 position integer NOT NULL DEFAULT 1 CHECK (position BETWEEN 1 AND 999),
 status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','ready','active','done','cancelled')),
 location text NOT NULL DEFAULT '',
 note text NOT NULL DEFAULT '',
 revision integer NOT NULL DEFAULT 1,
 updated_at text NOT NULL,
 updated_by text NOT NULL
);
CREATE INDEX IF NOT EXISTS journey_tasks_event_order_idx ON public.journey_tasks(event_id,position);
CREATE INDEX IF NOT EXISTS journey_tasks_invitation_idx ON public.journey_tasks(invitation_id);
CREATE TABLE IF NOT EXISTS public.journey_activity (
 id text PRIMARY KEY,
 subject_key text NOT NULL,
 event_id text NOT NULL,
 action text NOT NULL,
 before_value text NOT NULL,
 after_value text NOT NULL,
 created_at text NOT NULL,
 actor text NOT NULL
);
CREATE INDEX IF NOT EXISTS journey_activity_date_idx ON public.journey_activity(created_at);

ALTER TABLE public.journey_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journey_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journey_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.journey_attendance,public.journey_tasks,public.journey_activity FROM anon,authenticated;
