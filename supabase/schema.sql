-- Wedding data is accessed only by the authenticated wedding-db Edge Function.
-- RLS is enabled and no client-facing policies are granted.
create table if not exists public.invitations (
  id text primary key,
  slug text not null unique,
  guest_name text not null,
  salutation text not null default '' check (salutation in ('', 'bapak', 'ibu', 'saudara', 'saudari', 'bapak_ibu', 'tuan_nyonya')),
  phone text not null default '',
  seats integer not null default 2 check (seats between 1 and 20),
  event_ids text not null,
  reception_table text not null default '',
  access_token text not null unique,
  private_note text not null default '',
  created_at text not null,
  updated_at text not null,
  shared_at text,
  first_opened_at text,
  last_opened_at text,
  open_count integer not null default 0,
  heart_count integer not null default 0 check (heart_count between 0 and 10000),
  last_heart_at text,
  active integer not null default 1 check (active in (0, 1))
);

create table if not exists public.responses (
  id text primary key,
  invitation_id text not null references public.invitations(id),
  event_id text not null,
  status text not null check (status in ('attending', 'declined', 'pending')),
  guest_count integer not null default 0,
  message text not null default '',
  updated_at text not null,
  unique (invitation_id, event_id)
);
create index if not exists responses_event_status_idx on public.responses(event_id, status);

create table if not exists public.opens (
  id text primary key,
  invitation_id text not null references public.invitations(id),
  visit_id text not null,
  opened_at text not null,
  unique (invitation_id, visit_id)
);

create table if not exists public.gifts (
  id text primary key,
  invitation_id text not null references public.invitations(id),
  request_id text not null,
  kind text not null check (kind in ('transfer', 'cash', 'goods', 'other')),
  amount integer,
  note text not null default '',
  status text not null default 'reported' check (status in ('reported', 'confirmed', 'cancelled')),
  source text not null check (source in ('guest', 'admin')),
  created_at text not null,
  verified_at text,
  proof_key text,
  unique (invitation_id, request_id)
);
create index if not exists gifts_status_idx on public.gifts(status);

create table if not exists public.settings (
  key text primary key,
  value text not null,
  updated_at text not null
);

-- Stores only a secret-keyed digest of the network address for short-lived PIN throttling.
create table if not exists public.admin_login_attempts (
  id text primary key,
  failed_count integer not null default 0,
  updated_at text not null
);

alter table public.invitations enable row level security;
alter table public.responses enable row level security;
alter table public.opens enable row level security;
alter table public.gifts enable row level security;
alter table public.settings enable row level security;
alter table public.admin_login_attempts enable row level security;

revoke all on public.invitations, public.responses, public.opens, public.gifts, public.settings, public.admin_login_attempts from anon, authenticated;

create schema if not exists wedding_internal;
revoke all on schema wedding_internal from public, anon, authenticated;
create table if not exists wedding_internal.api_tokens (
  name text primary key,
  token_hash text not null check (length(token_hash) = 64)
);
revoke all on wedding_internal.api_tokens from public, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.guest_messages (
 id text PRIMARY KEY,
 owner_hash text NOT NULL,
 network_hash text NOT NULL,
 request_id text NOT NULL,
 invitation_id text REFERENCES public.invitations(id),
 guest_name text NOT NULL,
 original text NOT NULL,
 language text NOT NULL DEFAULT 'und',
 translation_id text NOT NULL DEFAULT '',
 translation_en text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','held')),
 reason text NOT NULL DEFAULT '',
 created_at text NOT NULL,
 updated_at text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS guest_messages_request_idx ON public.guest_messages(owner_hash,request_id);
CREATE INDEX IF NOT EXISTS guest_messages_public_idx ON public.guest_messages(status,created_at);
CREATE INDEX IF NOT EXISTS guest_messages_network_idx ON public.guest_messages(network_hash,created_at);
CREATE TABLE IF NOT EXISTS public.general_rsvps (
 owner_hash text PRIMARY KEY,
 guest_name text NOT NULL,
 responses text NOT NULL,
 updated_at text NOT NULL
);
ALTER TABLE public.guest_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.general_rsvps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guest_messages, public.general_rsvps FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.gift_activity (
 id text PRIMARY KEY,
 invitation_id text REFERENCES public.invitations(id),
 visitor_hash text NOT NULL,
 request_id text NOT NULL,
 action text NOT NULL CHECK (action IN ('opened','copy_clicked','account_copied')),
 source text NOT NULL CHECK (source IN ('floating','rsvp')),
 created_at text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS gift_activity_request_idx ON public.gift_activity(visitor_hash,request_id);
CREATE INDEX IF NOT EXISTS gift_activity_invitation_idx ON public.gift_activity(invitation_id);
CREATE INDEX IF NOT EXISTS gift_activity_created_idx ON public.gift_activity(created_at);
ALTER TABLE public.gift_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gift_activity FROM anon,authenticated;

CREATE TABLE IF NOT EXISTS public.reading_progress (
 id text PRIMARY KEY,
 invitation_id text REFERENCES public.invitations(id),
 visitor_hash text NOT NULL,
 session_id text NOT NULL,
 max_depth integer NOT NULL CHECK (max_depth BETWEEN 0 AND 100),
 sections_mask integer NOT NULL CHECK (sections_mask BETWEEN 1 AND 255),
 deepest_section integer NOT NULL CHECK (deepest_section BETWEEN 0 AND 7),
 last_section integer NOT NULL CHECK (last_section BETWEEN 0 AND 7),
 sequence integer NOT NULL CHECK (sequence BETWEEN 1 AND 1000000),
 created_at text NOT NULL,
 updated_at text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS reading_progress_session_idx ON public.reading_progress(visitor_hash,session_id);
CREATE INDEX IF NOT EXISTS reading_progress_invitation_idx ON public.reading_progress(invitation_id);
CREATE INDEX IF NOT EXISTS reading_progress_visitor_date_idx ON public.reading_progress(visitor_hash,created_at);
ALTER TABLE public.reading_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.reading_progress FROM anon,authenticated;

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

CREATE TABLE IF NOT EXISTS public.journey_task_invitations (
 task_id text NOT NULL REFERENCES public.journey_tasks(id) ON DELETE CASCADE,
 invitation_id text NOT NULL REFERENCES public.invitations(id) ON DELETE CASCADE,
 PRIMARY KEY(task_id,invitation_id)
);
CREATE INDEX IF NOT EXISTS journey_task_invitations_invitation_idx ON public.journey_task_invitations(invitation_id);
ALTER TABLE public.journey_task_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.journey_task_invitations FROM anon,authenticated;
INSERT INTO public.journey_task_invitations (task_id,invitation_id) SELECT id,invitation_id FROM public.journey_tasks WHERE invitation_id IS NOT NULL ON CONFLICT(task_id,invitation_id) DO NOTHING;

ALTER TABLE public.journey_tasks ADD COLUMN IF NOT EXISTS write_token text NOT NULL DEFAULT '';
