-- Khwahish initial schema
-- Apply only to the dedicated Khwahish Supabase project.
-- All exposed application tables use RLS. Storage is private.

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.libraries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  kind text not null check (kind in ('personal', 'shared')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table if not exists public.library_members (
  library_id uuid not null references public.libraries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (library_id, user_id)
);

create table if not exists public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references public.libraries(id) on delete cascade,
  added_by uuid not null references auth.users(id) on delete restrict,
  product_name text not null check (char_length(product_name) between 1 and 240),
  product_url text,
  canonical_url text,
  retailer text,
  brand text,
  category text,
  image_url text,
  currency char(3) not null default 'INR',
  initial_price numeric(12,2) check (initial_price is null or initial_price >= 0),
  initial_price_at timestamptz,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  status text not null default 'want' check (status in ('want', 'considering', 'purchased', 'not_now')),
  target_date date,
  notes text not null default '',
  extraction_confidence numeric(4,3) check (extraction_confidence is null or extraction_confidence between 0 and 1),
  extraction_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wishlist_items_library_idx on public.wishlist_items (library_id, created_at desc);
create index if not exists wishlist_items_name_idx on public.wishlist_items using gin (to_tsvector('simple', product_name));
create index if not exists wishlist_items_category_idx on public.wishlist_items (category);

create table if not exists public.price_observations (
  id uuid primary key default gen_random_uuid(),
  wishlist_item_id uuid not null references public.wishlist_items(id) on delete cascade,
  price numeric(12,2) check (price is null or price >= 0),
  currency char(3) not null default 'INR',
  availability text not null default 'unknown' check (availability in ('in_stock', 'out_of_stock', 'unknown')),
  source text not null,
  source_url text,
  confidence numeric(4,3) check (confidence is null or confidence between 0 and 1),
  observed_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists price_observations_item_time_idx
  on public.price_observations (wishlist_item_id, observed_at desc);

create table if not exists public.product_media (
  id uuid primary key default gen_random_uuid(),
  library_id uuid not null references public.libraries(id) on delete cascade,
  wishlist_item_id uuid references public.wishlist_items(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  storage_path text not null unique,
  media_type text not null check (media_type in ('screenshot', 'product_image')),
  mime_type text not null,
  ocr_text text,
  created_at timestamptz not null default now()
);

create index if not exists product_media_library_idx on public.product_media (library_id, created_at desc);

-- SECURITY DEFINER helpers live in a non-exposed schema and are called by RLS policies.
-- They use a fixed empty search_path and fully-qualified relation names.
create or replace function private.has_library_access(target_library_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.library_members as lm
    where lm.library_id::text = target_library_id
      and lm.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_library_owner(target_library_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.library_members as lm
    where lm.library_id = target_library_id
      and lm.user_id = (select auth.uid())
      and lm.role = 'owner'
  );
$$;

revoke all on function private.has_library_access(text) from public, anon;
revoke all on function private.is_library_owner(uuid) from public, anon;
create or replace function private.is_library_owner_text(target_library_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.library_members as lm
    where lm.library_id::text = target_library_id
      and lm.user_id = (select auth.uid())
      and lm.role = 'owner'
  );
$$;
revoke all on function private.is_library_owner_text(text) from public, anon;
grant execute on function private.has_library_access(text) to authenticated;
grant execute on function private.is_library_owner(uuid) to authenticated;
grant execute on function private.is_library_owner_text(text) to authenticated;

create or replace function private.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.create_profile_for_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function private.create_profile_for_new_user();

-- Make a newly-created library visible to its owner immediately.
create or replace function private.add_library_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.library_members (library_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (library_id, user_id) do nothing;
  return new;
end;
$$;

revoke all on function private.add_library_owner_membership() from public, anon, authenticated;

drop trigger if exists on_library_created_add_owner on public.libraries;
create trigger on_library_created_add_owner
  after insert on public.libraries
  for each row execute function private.add_library_owner_membership();

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function private.touch_updated_at() from public, anon, authenticated;

drop trigger if exists touch_profiles_updated_at on public.profiles;
create trigger touch_profiles_updated_at before update on public.profiles
  for each row execute function private.touch_updated_at();
drop trigger if exists touch_libraries_updated_at on public.libraries;
create trigger touch_libraries_updated_at before update on public.libraries
  for each row execute function private.touch_updated_at();
drop trigger if exists touch_wishlist_items_updated_at on public.wishlist_items;
create trigger touch_wishlist_items_updated_at before update on public.wishlist_items
  for each row execute function private.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.libraries enable row level security;
alter table public.library_members enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.price_observations enable row level security;
alter table public.product_media enable row level security;

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists libraries_select_member on public.libraries;
create policy libraries_select_member on public.libraries
  for select to authenticated using (private.has_library_access(id::text));
drop policy if exists libraries_insert_owner on public.libraries;
create policy libraries_insert_owner on public.libraries
  for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists libraries_update_owner on public.libraries;
create policy libraries_update_owner on public.libraries
  for update to authenticated
  using (private.is_library_owner(id))
  with check (private.is_library_owner(id) and owner_id = (select auth.uid()));
drop policy if exists libraries_delete_owner on public.libraries;
create policy libraries_delete_owner on public.libraries
  for delete to authenticated using (private.is_library_owner(id));

drop policy if exists library_members_select_member on public.library_members;
create policy library_members_select_member on public.library_members
  for select to authenticated using (private.has_library_access(library_id::text));
drop policy if exists library_members_insert_owner on public.library_members;
create policy library_members_insert_owner on public.library_members
  for insert to authenticated with check (private.is_library_owner(library_id));
drop policy if exists library_members_update_owner on public.library_members;
create policy library_members_update_owner on public.library_members
  for update to authenticated
  using (private.is_library_owner(library_id))
  with check (private.is_library_owner(library_id));
drop policy if exists library_members_delete_owner_or_self on public.library_members;
create policy library_members_delete_owner_or_self on public.library_members
  for delete to authenticated
  using (
    (private.is_library_owner(library_id) and user_id <> (select auth.uid()))
    or (user_id = (select auth.uid()) and role <> 'owner')
  );

drop policy if exists wishlist_items_select_member on public.wishlist_items;
create policy wishlist_items_select_member on public.wishlist_items
  for select to authenticated using (private.has_library_access(library_id::text));
drop policy if exists wishlist_items_insert_member on public.wishlist_items;
create policy wishlist_items_insert_member on public.wishlist_items
  for insert to authenticated
  with check (
    added_by = (select auth.uid())
    and private.has_library_access(library_id::text)
    and exists (
      select 1 from public.library_members lm
      where lm.library_id = wishlist_items.library_id
        and lm.user_id = (select auth.uid())
        and lm.role in ('owner', 'editor')
    )
  );
drop policy if exists wishlist_items_update_editor on public.wishlist_items;
create policy wishlist_items_update_editor on public.wishlist_items
  for update to authenticated
  using (exists (
    select 1 from public.library_members lm
    where lm.library_id = wishlist_items.library_id
      and lm.user_id = (select auth.uid())
      and lm.role in ('owner', 'editor')
  ))
  with check (exists (
    select 1 from public.library_members lm
    where lm.library_id = wishlist_items.library_id
      and lm.user_id = (select auth.uid())
      and lm.role in ('owner', 'editor')
  ));
drop policy if exists wishlist_items_delete_editor on public.wishlist_items;
create policy wishlist_items_delete_editor on public.wishlist_items
  for delete to authenticated
  using (exists (
    select 1 from public.library_members lm
    where lm.library_id = wishlist_items.library_id
      and lm.user_id = (select auth.uid())
      and lm.role in ('owner', 'editor')
  ));

drop policy if exists price_observations_select_member on public.price_observations;
create policy price_observations_select_member on public.price_observations
  for select to authenticated using (exists (
    select 1 from public.wishlist_items wi
    where wi.id = price_observations.wishlist_item_id
      and private.has_library_access(wi.library_id::text)
  ));
drop policy if exists price_observations_insert_editor on public.price_observations;
create policy price_observations_insert_editor on public.price_observations
  for insert to authenticated with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.wishlist_items wi
      join public.library_members lm on lm.library_id = wi.library_id
      where wi.id = price_observations.wishlist_item_id
        and lm.user_id = (select auth.uid())
        and lm.role in ('owner', 'editor')
    )
  );
drop policy if exists price_observations_delete_owner on public.price_observations;
create policy price_observations_delete_owner on public.price_observations
  for delete to authenticated using (exists (
    select 1 from public.wishlist_items wi
    where wi.id = price_observations.wishlist_item_id
      and private.is_library_owner(wi.library_id)
  ));

drop policy if exists product_media_select_member on public.product_media;
create policy product_media_select_member on public.product_media
  for select to authenticated using (private.has_library_access(library_id::text));
drop policy if exists product_media_insert_editor on public.product_media;
create policy product_media_insert_editor on public.product_media
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and private.has_library_access(library_id::text)
    and exists (
      select 1 from public.library_members lm
      where lm.library_id = product_media.library_id
        and lm.user_id = (select auth.uid())
        and lm.role in ('owner', 'editor')
    )
  );
drop policy if exists product_media_delete_owner_or_uploader on public.product_media;
create policy product_media_delete_owner_or_uploader on public.product_media
  for delete to authenticated using (
    private.has_library_access(library_id::text)
    and (uploaded_by = (select auth.uid()) or private.is_library_owner(library_id))
  );

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.libraries to authenticated;
grant select, insert, update, delete on public.library_members to authenticated;
grant select, insert, update, delete on public.wishlist_items to authenticated;
grant select, insert, delete on public.price_observations to authenticated;
grant select, insert, delete on public.product_media to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wishlist-assets', 'wishlist-assets', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists wishlist_assets_select_member on storage.objects;
create policy wishlist_assets_select_member on storage.objects
  for select to authenticated using (
    bucket_id = 'wishlist-assets'
    and private.has_library_access((storage.foldername(name))[1])
  );
drop policy if exists wishlist_assets_insert_editor on storage.objects;
create policy wishlist_assets_insert_editor on storage.objects
  for insert to authenticated with check (
    bucket_id = 'wishlist-assets'
    and private.has_library_access((storage.foldername(name))[1])
    and exists (
      select 1 from public.library_members lm
      where lm.library_id::text = (storage.foldername(name))[1]
        and lm.user_id = (select auth.uid())
        and lm.role in ('owner', 'editor')
    )
  );
drop policy if exists wishlist_assets_delete_owner_or_uploader on storage.objects;
create policy wishlist_assets_delete_owner_or_uploader on storage.objects
  for delete to authenticated using (
    bucket_id = 'wishlist-assets'
    and private.has_library_access((storage.foldername(name))[1])
    and (
      owner_id = (select auth.uid())::text
      or private.is_library_owner_text((storage.foldername(name))[1])
    )
  );
