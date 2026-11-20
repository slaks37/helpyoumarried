ALTER TABLE public.invitations DROP CONSTRAINT invitations_salutation_check;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_salutation_check
  CHECK (salutation IN ('', 'bapak', 'ibu', 'saudara', 'saudari', 'bapak_ibu', 'tuan_nyonya'));
