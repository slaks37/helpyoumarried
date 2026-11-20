CREATE TABLE public.guest_messages (
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
CREATE UNIQUE INDEX guest_messages_request_idx ON public.guest_messages(owner_hash,request_id);
CREATE INDEX guest_messages_public_idx ON public.guest_messages(status,created_at);
CREATE INDEX guest_messages_network_idx ON public.guest_messages(network_hash,created_at);
CREATE TABLE public.general_rsvps (
 owner_hash text PRIMARY KEY,
 guest_name text NOT NULL,
 responses text NOT NULL,
 updated_at text NOT NULL
);
ALTER TABLE public.guest_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.general_rsvps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.guest_messages, public.general_rsvps FROM anon, authenticated;
