-- RETURNING must see a newly created library before its AFTER INSERT membership trigger.
drop policy libraries_select_member on public.libraries;
create policy libraries_select_member on public.libraries for select to authenticated using(owner_id=(select auth.uid()) or private.has_library_access(id::text));

-- A previously used invite must not restore access after a member has been removed.
create or replace function private.accept_library_invite(invite_token text) returns uuid
language plpgsql security definer set search_path='' as $$
declare invitation public.library_invites%rowtype;
begin
 if auth.uid() is null then raise exception 'Please sign in before joining'; end if;
 if char_length(invite_token) > 150 then raise exception 'Invalid invitation'; end if;
 select * into invitation from public.library_invites where token_hash=encode(sha256(convert_to(invite_token,'UTF8')),'hex') for update;
 if not found or invitation.revoked_at is not null or invitation.expires_at < now() then raise exception 'This invitation is invalid or expired'; end if;
 if invitation.accepted_at is not null then
  if invitation.accepted_by=auth.uid() and exists(select 1 from public.library_members where library_id=invitation.library_id and user_id=auth.uid()) then return invitation.library_id; end if;
  raise exception 'This invitation has already been used';
 end if;
 if exists(select 1 from public.library_members where library_id=invitation.library_id and user_id=auth.uid()) then return invitation.library_id; end if;
 insert into public.library_members(library_id,user_id,role) values(invitation.library_id,auth.uid(),invitation.role);
 update public.library_invites set accepted_by=auth.uid(),accepted_at=now() where id=invitation.id;
 return invitation.library_id;
end; $$;
revoke all on function private.accept_library_invite(text) from public,anon;
grant execute on function private.accept_library_invite(text) to authenticated;

-- Preserve the historical baseline and author even when a shared editor changes details.
create or replace function private.guard_item_history() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.added_by is distinct from old.added_by or new.created_at is distinct from old.created_at
    or new.initial_price is distinct from old.initial_price or new.initial_price_at is distinct from old.initial_price_at
    or new.currency is distinct from old.currency or new.id is distinct from old.id or new.library_id is distinct from old.library_id then
  raise exception 'The original price, currency, author, and library are preserved. Add a new wish or a price observation instead.';
 end if;
 return new;
end; $$;
revoke all on function private.guard_item_history() from public,anon,authenticated;
create trigger guard_item_history before update on public.wishlist_items for each row execute function private.guard_item_history();

-- Explicitly deny direct access; only the private rate-budget function may mutate this table.
create policy request_budgets_internal_only on private.request_budgets for all to authenticated using(false) with check(false);
