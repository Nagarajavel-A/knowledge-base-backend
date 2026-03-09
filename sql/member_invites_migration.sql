-- Required for gen_random_uuid()
create extension if not exists pgcrypto;

-- Invite table used by backend invite + post-login sync flow
create table if not exists public.member_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null,
  role text not null default 'member',
  can_invite_members boolean not null default false,
  can_upload_documents boolean not null default false,
  status text not null default 'pending',
  invited_by uuid null references public.user_profiles (id) on delete set null,
  accepted_at timestamp without time zone null,
  created_at timestamp without time zone not null default now(),
  constraint member_invites_role_check check (role in ('owner', 'member')),
  constraint member_invites_status_check check (status in ('approval_pending', 'pending', 'accepted', 'revoked', 'expired'))
);

-- If table already exists with fewer columns, add missing ones
alter table public.member_invites add column if not exists role text not null default 'member';
alter table public.member_invites add column if not exists can_invite_members boolean not null default false;
alter table public.member_invites add column if not exists can_upload_documents boolean not null default false;
alter table public.member_invites add column if not exists status text not null default 'pending';
alter table public.member_invites add column if not exists invited_by uuid null;
alter table public.member_invites add column if not exists accepted_at timestamp without time zone null;
alter table public.member_invites add column if not exists created_at timestamp without time zone not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'member_invites_invited_by_fkey'
  ) then
    alter table public.member_invites
      add constraint member_invites_invited_by_fkey
      foreign key (invited_by) references public.user_profiles (id) on delete set null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'member_invites_status_check'
  ) then
    alter table public.member_invites
      drop constraint member_invites_status_check;
  end if;

  alter table public.member_invites
    add constraint member_invites_status_check
    check (status in ('approval_pending', 'pending', 'accepted', 'revoked', 'expired'));
end $$;

-- Ensure invite lookups are fast and prevent duplicate open invites for same email/workspace
drop index if exists member_invites_pending_unique_idx;

create unique index if not exists member_invites_open_unique_idx
  on public.member_invites (workspace_id, lower(email))
  where status in ('approval_pending', 'pending');

create index if not exists member_invites_email_status_idx
  on public.member_invites (lower(email), status);
