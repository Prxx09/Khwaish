-- Cover foreign keys used for deletes and member-specific queries.
create index if not exists libraries_owner_id_idx on public.libraries (owner_id);
create index if not exists library_members_user_id_idx on public.library_members (user_id);
create index if not exists wishlist_items_added_by_idx on public.wishlist_items (added_by);
create index if not exists price_observations_created_by_idx on public.price_observations (created_by);
create index if not exists product_media_wishlist_item_id_idx on public.product_media (wishlist_item_id);
create index if not exists product_media_uploaded_by_idx on public.product_media (uploaded_by);

