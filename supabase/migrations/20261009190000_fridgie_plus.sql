-- TEST ONLY. Review and apply manually to an isolated Supabase test project.
begin;
create table public.plus_subscriptions (
 user_id uuid primary key references auth.users(id) on delete cascade,
 provider_subscription_id text unique not null, provider_customer_id text not null,
 status text not null, paid_until timestamptz not null, cancel_at timestamptz,
 last_event_at timestamptz not null
);
create table public.plus_cycles (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 transaction_id text unique not null, starts_at timestamptz not null, ends_at timestamptz not null,
 recipe_used int not null default 0 check(recipe_used between 0 and 30),
 photo_used int not null default 0 check(photo_used between 0 and 30), check(ends_at>starts_at), unique(user_id,starts_at,ends_at)
);
create table public.plus_usage_requests (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 cycle_id uuid not null references public.plus_cycles(id), kind text not null check(kind in ('recipe','photo')),
 fingerprint text not null, state text not null check(state in ('pending','success','failed')),
 result jsonb, created_at timestamptz not null default now(), finished_at timestamptz
);
create index on public.plus_usage_requests(user_id,created_at);
create table public.plus_recipes (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null references public.plus_usage_requests(id), position int not null,
 recipe jsonb not null, created_at timestamptz not null default now(), unique(request_id,position), unique(id,user_id)
);
create table public.plus_meal_plans (
 user_id uuid not null references auth.users(id) on delete cascade, week date not null,
 slots jsonb not null check(jsonb_typeof(slots)='array' and jsonb_array_length(slots)=7),
 updated_at timestamptz not null default now(), primary key(user_id,week)
);
create table public.plus_shopping_lists (
 user_id uuid not null references auth.users(id) on delete cascade, week date not null,
 items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items)<=100),
 updated_at timestamptz not null default now(), primary key(user_id,week)
);
create table public.plus_checkouts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 transaction_id text unique, created_at timestamptz not null default now()
);
create table public.plus_events (
 event_id text primary key, occurred_at timestamptz not null, processed_at timestamptz not null default now(),
 transaction_id text, event_type text not null
);
-- Clients only get SELECT on entitlement/usage; no client can grant itself Plus.
do $$ declare t text; begin
 foreach t in array array['plus_subscriptions','plus_cycles','plus_usage_requests','plus_recipes','plus_meal_plans','plus_shopping_lists','plus_checkouts','plus_events'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 if t not in ('plus_checkouts','plus_events') then
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy own_rows on public.%I for select to authenticated using (user_id=auth.uid())',t);
 end if;
 end loop;
end $$;

create function public.plus_reserve(p_user uuid,p_id uuid,p_kind text,p_fingerprint text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.plus_cycles; r public.plus_usage_requests; used int; pending int;
begin
 -- Serialize requests per user, including idempotency and attempt-rate accounting.
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into r from plus_usage_requests where id=p_id;
 if found then
  if r.user_id<>p_user or r.kind<>p_kind or r.fingerprint<>p_fingerprint then raise exception 'idempotency_conflict'; end if;
  return jsonb_build_object('state',r.state,'result',r.result);
 end if;
 if p_kind not in ('recipe','photo') then raise exception 'invalid_kind'; end if;
 select pc.* into c from plus_cycles pc join plus_subscriptions s on s.user_id=pc.user_id
 where pc.user_id=p_user and pc.starts_at<=now() and pc.ends_at>now() and s.paid_until>now()
 order by pc.starts_at desc limit 1 for update of pc;
 if not found then raise exception 'subscription_required'; end if;
 if (select count(*) from plus_usage_requests where user_id=p_user and created_at>now()-interval '1 hour')>=60 then raise exception 'attempt_limit'; end if;
 used:=case when p_kind='recipe' then c.recipe_used else c.photo_used end;
 select count(*) into pending from plus_usage_requests where cycle_id=c.id and kind=p_kind and state='pending';
 if used+pending>=30 then raise exception 'quota_exhausted'; end if;
 insert into plus_usage_requests(id,user_id,cycle_id,kind,fingerprint,state) values(p_id,p_user,c.id,p_kind,p_fingerprint,'pending');
 return jsonb_build_object('state','reserved');
end $$;
create function public.plus_finish(p_user uuid,p_id uuid,p_success boolean,p_result jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.plus_usage_requests; i int; v jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into r from plus_usage_requests where id=p_id and user_id=p_user for update;
 if not found then raise exception 'request_missing'; end if;
 if r.state<>'pending' then return r.result; end if;
 if p_success then
  if r.kind='recipe' then
   if jsonb_array_length(p_result->'recipes')<>3 then raise exception 'invalid_recipes'; end if;
   update plus_cycles set recipe_used=recipe_used+1 where id=r.cycle_id;
   i:=0; for v in select * from jsonb_array_elements(p_result->'recipes') loop
    insert into plus_recipes(user_id,request_id,position,recipe) values(p_user,p_id,i,v); i:=i+1;
   end loop;
  else update plus_cycles set photo_used=photo_used+1 where id=r.cycle_id;
  end if;
 end if;
 update plus_usage_requests set state=case when p_success then 'success' else 'failed' end,result=p_result,finished_at=now() where id=p_id;
 return p_result;
end $$;
-- A verified completed provider transaction grants exactly one paid cycle. Never calendar resets.
create function public.plus_apply_payment(p_event text,p_at timestamptz,p_type text,p_user uuid,p_transaction text,p_subscription text,p_customer text,p_start timestamptz,p_end timestamptz,p_status text,p_cancel timestamptz)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if p_end<=p_start then raise exception 'invalid_period'; end if;
 if exists(select 1 from plus_subscriptions where provider_subscription_id=p_subscription and user_id<>p_user) then raise exception 'owner_conflict'; end if;
 insert into plus_events(event_id,occurred_at,event_type,transaction_id) values(p_event,p_at,p_type,p_transaction) on conflict do nothing;
 if not found then return false; end if;
 insert into plus_subscriptions(user_id,provider_subscription_id,provider_customer_id,status,paid_until,cancel_at,last_event_at)
 values(p_user,p_subscription,p_customer,p_status,p_end,p_cancel,p_at)
 on conflict(user_id) do update set paid_until=greatest(plus_subscriptions.paid_until,excluded.paid_until),
 status=case when excluded.last_event_at>=plus_subscriptions.last_event_at then excluded.status else plus_subscriptions.status end,
 cancel_at=case when excluded.last_event_at>=plus_subscriptions.last_event_at then excluded.cancel_at else plus_subscriptions.cancel_at end,
 last_event_at=greatest(plus_subscriptions.last_event_at,excluded.last_event_at)
 where plus_subscriptions.provider_subscription_id=excluded.provider_subscription_id;
 if not found then raise exception 'different_subscription'; end if;
 if exists(select 1 from plus_cycles where user_id=p_user and starts_at<p_end and ends_at>p_start and (starts_at<>p_start or ends_at<>p_end) and transaction_id<>p_transaction) then raise exception 'overlapping_period'; end if;
 insert into plus_cycles(user_id,transaction_id,starts_at,ends_at) values(p_user,p_transaction,p_start,p_end) on conflict do nothing;
 return true;
end $$;
revoke all on function public.plus_reserve(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.plus_finish(uuid,uuid,boolean,jsonb) from public,anon,authenticated;
revoke all on function public.plus_apply_payment(text,timestamptz,text,uuid,text,text,text,timestamptz,timestamptz,text,timestamptz) from public,anon,authenticated;
grant execute on function public.plus_reserve(uuid,uuid,text,text) to service_role;
grant execute on function public.plus_finish(uuid,uuid,boolean,jsonb) to service_role;
grant execute on function public.plus_apply_payment(text,timestamptz,text,uuid,text,text,text,timestamptz,timestamptz,text,timestamptz) to service_role;
create function public.plus_save_plan(p_user uuid,p_week date,p_slots jsonb,p_items jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $
begin
 if jsonb_array_length(p_slots)<>7 or jsonb_array_length(p_items)>100 then raise exception 'invalid_plan'; end if;
 if exists(select 1 from jsonb_array_elements_text(p_slots) as slot(value) where slot.value is not null and not exists(select 1 from plus_recipes where id=slot.value::uuid and user_id=p_user)) then raise exception 'recipe_owner'; end if;
 if not exists(select 1 from plus_subscriptions s join plus_cycles c on c.user_id=s.user_id where s.user_id=p_user and s.paid_until>now() and c.starts_at<=now() and c.ends_at>now()) then raise exception 'subscription_required'; end if;
 insert into plus_meal_plans(user_id,week,slots) values(p_user,p_week,p_slots) on conflict(user_id,week) do update set slots=excluded.slots,updated_at=now();
 insert into plus_shopping_lists(user_id,week,items) values(p_user,p_week,p_items) on conflict(user_id,week) do update set items=excluded.items,updated_at=now();
end $;
revoke all on function public.plus_save_plan(uuid,date,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.plus_save_plan(uuid,date,jsonb,jsonb) to service_role;
commit;
