-- Application workflows: guarded sharing, invites, comments, import budget and tracking.
alter table public.wishlist_items add column if not exists product_code text;
alter table public.wishlist_items add column if not exists variant text;
alter table public.wishlist_items add column if not exists target_price numeric(12,2) check (target_price >= 0);
alter table public.wishlist_items add column if not exists tracking_enabled boolean not null default false;
alter table public.wishlist_items add column if not exists last_price_check_at timestamptz;
create unique index if not exists personal_library_per_owner on public.libraries(owner_id) where kind = 'personal';
create index if not exists tracking_due_idx on public.wishlist_items(last_price_check_at) where tracking_enabled = true;
alter table public.wishlist_items add constraint wishlist_item_library_unique unique(id,library_id);
alter table public.product_media add constraint media_item_same_library foreign key(wishlist_item_id,library_id) references public.wishlist_items(id,library_id) on delete cascade;
alter table public.product_media add constraint media_library_path check (split_part(storage_path,'/',1) = library_id::text);

create or replace function private.guard_library_identity() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.owner_id <> old.owner_id or new.kind <> old.kind or new.id <> old.id then
    raise exception 'Library ownership and type cannot be changed through this operation.';
  end if;
  return new;
end; $$;
revoke all on function private.guard_library_identity() from public,anon,authenticated;
create trigger guard_library_identity before update on public.libraries for each row execute function private.guard_library_identity();

-- A library has exactly one canonical owner. Membership changes cannot transfer ownership.
create or replace function private.guard_membership() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op = 'UPDATE' and (new.library_id <> old.library_id or new.user_id <> old.user_id) then raise exception 'Membership identity is immutable.'; end if;
  if tg_op = 'UPDATE' and old.role = 'owner' then raise exception 'The library owner cannot be demoted.'; end if;
  if new.role = 'owner' and not exists(select 1 from public.libraries l where l.id = new.library_id and l.owner_id = new.user_id) then raise exception 'Only the original owner may hold the owner role.'; end if;
  if new.role <> 'owner' and not exists(select 1 from public.libraries l where l.id = new.library_id and l.kind = 'shared') then raise exception 'Personal libraries cannot be shared.'; end if;
  return new;
end; $$;
revoke all on function private.guard_membership() from public,anon,authenticated;
create trigger guard_membership before insert or update on public.library_members for each row execute function private.guard_membership();

drop policy library_members_insert_owner on public.library_members;
create policy library_members_insert_owner on public.library_members for insert to authenticated with check(private.is_library_owner(library_id) and role in ('editor','viewer'));
drop policy library_members_update_owner on public.library_members;
create policy library_members_update_owner on public.library_members for update to authenticated using(private.is_library_owner(library_id) and role <> 'owner') with check(private.is_library_owner(library_id) and role in ('editor','viewer'));
drop policy library_members_delete_owner_or_self on public.library_members;
create policy library_members_delete_owner_or_self on public.library_members for delete to authenticated using(role <> 'owner' and (private.is_library_owner(library_id) or user_id = (select auth.uid())));

create or replace function public.ensure_personal_library() returns uuid
language plpgsql security invoker set search_path='' as $$
declare result uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select id into result from public.libraries where owner_id = auth.uid() and kind='personal';
  if result is null then
    insert into public.libraries(owner_id,name,kind) values(auth.uid(),'My wishlist','personal')
    on conflict(owner_id) where kind='personal' do update set owner_id=excluded.owner_id returning id into result;
  end if;
  return result;
end; $$;
revoke all on function public.ensure_personal_library() from public,anon;
grant execute on function public.ensure_personal_library() to authenticated;

create or replace function private.can_view_profile(target_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
select auth.uid() is not null and (target_user = auth.uid() or exists(
 select 1 from public.library_members me join public.library_members them on them.library_id=me.library_id
 where me.user_id=auth.uid() and them.user_id=target_user
)); $$;
revoke all on function private.can_view_profile(uuid) from public,anon;
grant execute on function private.can_view_profile(uuid) to authenticated;
drop policy profiles_select_self on public.profiles;
create policy profiles_select_visible on public.profiles for select to authenticated using(private.can_view_profile(id));

create table public.library_invites (
 id uuid primary key default gen_random_uuid(), library_id uuid not null references public.libraries(id) on delete cascade,
 created_by uuid not null references auth.users(id) on delete cascade, token_hash text not null unique,
 role text not null check(role in ('editor','viewer')), expires_at timestamptz not null,
 accepted_by uuid references auth.users(id) on delete set null, accepted_at timestamptz, revoked_at timestamptz,
 created_at timestamptz not null default now()
);
create index library_invites_library_idx on public.library_invites(library_id);
create index library_invites_created_by_idx on public.library_invites(created_by);
create index library_invites_accepted_by_idx on public.library_invites(accepted_by);
alter table public.library_invites enable row level security;
create policy invites_owner_read on public.library_invites for select to authenticated using(private.is_library_owner(library_id));
create policy invites_owner_revoke on public.library_invites for update to authenticated using(private.is_library_owner(library_id)) with check(private.is_library_owner(library_id));
revoke all on public.library_invites from anon,authenticated;
grant select on public.library_invites to authenticated;
grant update(revoked_at) on public.library_invites to authenticated;

create or replace function private.create_library_invite(target_library uuid, member_role text default 'editor') returns text
language plpgsql security definer set search_path='' as $$
declare raw_token text;
begin
 if auth.uid() is null or not private.is_library_owner(target_library) then raise exception 'Only the library owner can create invitations'; end if;
 if member_role not in ('editor','viewer') then raise exception 'Choose editor or viewer access'; end if;
 if not exists(select 1 from public.libraries where id=target_library and kind='shared') then raise exception 'Only shared libraries can be invited to'; end if;
 raw_token := gen_random_uuid()::text || gen_random_uuid()::text;
 insert into public.library_invites(library_id,created_by,token_hash,role,expires_at)
 values(target_library,auth.uid(),encode(sha256(convert_to(raw_token,'UTF8')),'hex'),member_role,now()+interval '7 days');
 return raw_token;
end; $$;
revoke all on function private.create_library_invite(uuid,text) from public,anon;
grant execute on function private.create_library_invite(uuid,text) to authenticated;

create or replace function private.accept_library_invite(invite_token text) returns uuid
language plpgsql security definer set search_path='' as $$
declare invitation public.library_invites%rowtype;
begin
 if auth.uid() is null then raise exception 'Please sign in before joining'; end if;
 if char_length(invite_token) > 150 then raise exception 'Invalid invitation'; end if;
 select * into invitation from public.library_invites where token_hash=encode(sha256(convert_to(invite_token,'UTF8')),'hex') for update;
 if not found or invitation.revoked_at is not null or invitation.expires_at < now() then raise exception 'This invitation is invalid or expired'; end if;
 if invitation.accepted_by is not null and invitation.accepted_by <> auth.uid() then raise exception 'This invitation has already been used'; end if;
 if exists(select 1 from public.library_members where library_id=invitation.library_id and user_id=auth.uid()) then return invitation.library_id; end if;
 insert into public.library_members(library_id,user_id,role) values(invitation.library_id,auth.uid(),invitation.role);
 update public.library_invites set accepted_by=auth.uid(),accepted_at=now() where id=invitation.id;
 return invitation.library_id;
end; $$;
revoke all on function private.accept_library_invite(text) from public,anon;
grant execute on function private.accept_library_invite(text) to authenticated;

create table public.item_comments (
 id uuid primary key default gen_random_uuid(), wishlist_item_id uuid not null references public.wishlist_items(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, body text not null check(char_length(body) between 1 and 2000),
 created_at timestamptz not null default now()
);
create index comments_item_idx on public.item_comments(wishlist_item_id,created_at);
create index comments_user_idx on public.item_comments(user_id);
alter table public.item_comments enable row level security;
create policy comments_member_read on public.item_comments for select to authenticated using(exists(select 1 from public.wishlist_items w where w.id=wishlist_item_id and private.has_library_access(w.library_id::text)));
create policy comments_member_insert on public.item_comments for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.wishlist_items w where w.id=wishlist_item_id and private.has_library_access(w.library_id::text)));
create policy comments_author_delete on public.item_comments for delete to authenticated using(user_id=(select auth.uid()));
revoke all on public.item_comments from anon,authenticated;
grant select,insert,delete on public.item_comments to authenticated;

create table private.request_budgets (
 user_id uuid not null references auth.users(id) on delete cascade, action_name text not null,
 hour_bucket timestamptz not null, requests integer not null default 1, primary key(user_id,action_name,hour_bucket)
);
alter table private.request_budgets enable row level security;
revoke all on private.request_budgets from public,anon,authenticated;
create or replace function private.consume_request_budget(p_action text) returns boolean
language plpgsql security definer set search_path='' as $$
declare request_count integer;
begin
 if auth.uid() is null then return false; end if;
 if p_action not in ('metadata','price_refresh','offer_search') then return false; end if;
 insert into private.request_budgets(user_id,action_name,hour_bucket) values(auth.uid(),p_action,date_trunc('hour',now()))
 on conflict(user_id,action_name,hour_bucket) do update set requests=private.request_budgets.requests+1
 where private.request_budgets.requests < 40 returning requests into request_count;
 return request_count is not null;
end; $$;
revoke all on function private.consume_request_budget(text) from public,anon;
grant execute on function private.consume_request_budget(text) to authenticated;

grant select,insert,update,delete on public.wishlist_items,public.price_observations,public.product_media to service_role;
-- Only applications with an explicitly configured server key can use scheduled tracking.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='wishlist_items') then alter publication supabase_realtime add table public.wishlist_items; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='item_comments') then alter publication supabase_realtime add table public.item_comments; end if;
 end if;
end $$;

-- Exposed wrappers keep privileged implementations outside the exposed API schema.
create or replace function public.create_library_invite(target_library uuid, member_role text default 'editor') returns text
language sql security invoker set search_path='' as $$ select private.create_library_invite(target_library,member_role); $$;
create or replace function public.accept_library_invite(invite_token text) returns uuid
language sql security invoker set search_path='' as $$ select private.accept_library_invite(invite_token); $$;
create or replace function public.consume_request_budget(action_name text) returns boolean
language sql security invoker set search_path='' as $$ select private.consume_request_budget(action_name); $$;
revoke all on function public.create_library_invite(uuid,text),public.accept_library_invite(text),public.consume_request_budget(text) from public,anon;
grant execute on function public.create_library_invite(uuid,text),public.accept_library_invite(text),public.consume_request_budget(text) to authenticated;

create or replace function private.can_edit_library(target_library text) returns boolean
language sql stable security definer set search_path='' as $$
select exists(select 1 from public.library_members where library_id::text=target_library and user_id=(select auth.uid()) and role in ('owner','editor'));
$$;
revoke all on function private.can_edit_library(text) from public,anon;
grant execute on function private.can_edit_library(text) to authenticated;
drop policy wishlist_assets_delete_owner_or_uploader on storage.objects;
create policy wishlist_assets_delete_editor on storage.objects for delete to authenticated using(bucket_id='wishlist-assets' and private.can_edit_library((storage.foldername(name))[1]));
