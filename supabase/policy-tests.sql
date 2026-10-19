-- Transactional security checks. All synthetic users and records are rolled back.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('10000000-0000-4000-8000-000000000001','khwahish-owner@tests.invalid','{"name":"Test Owner"}'),
 ('10000000-0000-4000-8000-000000000002','khwahish-member@tests.invalid','{"name":"Test Member"}');
create temp table test_invitation(token text);
grant select,insert,update on test_invitation to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select public.ensure_personal_library();
select public.ensure_personal_library();
insert into public.libraries(id,owner_id,name,kind) values('20000000-0000-4000-8000-000000000001',auth.uid(),'Shared test','shared') returning id;
insert into public.wishlist_items(id,library_id,added_by,product_name,initial_price,currency) values('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',auth.uid(),'Shared headphones',1000,'INR');
do $$ begin if (select count(*) from public.libraries where kind='personal') <> 1 then raise exception 'Personal library initialization is not idempotent'; end if; end $$;
insert into test_invitation select public.create_library_invite('20000000-0000-4000-8000-000000000001','viewer');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$ begin
 if (select count(*) from public.libraries) <> 0 then raise exception 'Private library leaked to outsider'; end if;
 if (select count(*) from public.wishlist_items) <> 0 then raise exception 'Private item leaked to outsider'; end if;
 begin
  insert into public.library_members(library_id,user_id,role) values('20000000-0000-4000-8000-000000000001',auth.uid(),'owner');
  raise exception 'Outsider could self-enroll';
 exception when insufficient_privilege then null;
 when raise_exception then if sqlerrm not like '%original owner%' then raise; end if;
 end;
end $$;
select public.accept_library_invite((select token from test_invitation));
do $$ declare affected integer; begin
 if (select count(*) from public.libraries) <> 1 then raise exception 'Viewer can see more than their shared library'; end if;
 if (select count(*) from public.wishlist_items) <> 1 then raise exception 'Viewer cannot read shared item'; end if;
 update public.wishlist_items set notes='unauthorized' where id='30000000-0000-4000-8000-000000000001';
 get diagnostics affected = row_count;
 if affected <> 0 then raise exception 'Viewer could edit an item'; end if;
 begin
  insert into public.wishlist_items(library_id,added_by,product_name) values('20000000-0000-4000-8000-000000000001',auth.uid(),'unauthorized item');
  raise exception 'Viewer could create an item';
 exception when insufficient_privilege then null;
 end;
 if private.can_edit_library('20000000-0000-4000-8000-000000000001') then raise exception 'Viewer can edit storage'; end if;
end $$;
insert into public.item_comments(wishlist_item_id,user_id,body) values('30000000-0000-4000-8000-000000000001',auth.uid(),'Viewers may comment.');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
delete from public.library_members where library_id='20000000-0000-4000-8000-000000000001' and user_id='10000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$ begin
 if (select count(*) from public.wishlist_items) <> 0 then raise exception 'Removed member can still read item'; end if;
 begin
  perform public.accept_library_invite((select token from test_invitation));
  raise exception 'Removed member reused consumed invite';
 exception when raise_exception then
  if sqlerrm not like '%already been used%' then raise; end if;
 end;
end $$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
update test_invitation set token=public.create_library_invite('20000000-0000-4000-8000-000000000001','editor');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select public.accept_library_invite((select token from test_invitation));
insert into public.wishlist_items(library_id,added_by,product_name) values('20000000-0000-4000-8000-000000000001',auth.uid(),'Editor item') returning id;
update public.wishlist_items set notes='authorized edit' where id='30000000-0000-4000-8000-000000000001';
do $$ declare allowed boolean; begin
 if not private.can_edit_library('20000000-0000-4000-8000-000000000001') then raise exception 'Editor cannot edit storage'; end if;
 begin
  update public.wishlist_items set initial_price=1 where id='30000000-0000-4000-8000-000000000001';
  raise exception 'Editor could overwrite initial price';
 exception when raise_exception then
  if sqlerrm not like '%original price%' then raise; end if;
 end;
 for counter in 1..40 loop
  allowed := public.consume_request_budget('metadata');
  if not allowed then raise exception 'Budget rejected a permitted request'; end if;
 end loop;
 if public.consume_request_budget('metadata') then raise exception 'Budget did not enforce limit'; end if;
end $$;
reset role;
rollback;
select 'PASS: personal privacy, viewer/editor rights, invite revocation, historical baseline, rate limits; fixtures rolled back' as result;
