-- TEST ONLY: manually review/apply to the ISOLATED Supabase test project.
-- Never run on production. Existing plus_reserve is deliberately unchanged.
begin;
alter table public.plus_cycles drop constraint plus_cycles_recipe_used_check;
alter table public.plus_cycles drop constraint plus_cycles_photo_used_check;
alter table public.plus_cycles add constraint plus_cycles_recipe_used_nonnegative check(recipe_used>=0);
alter table public.plus_cycles add constraint plus_cycles_photo_used_nonnegative check(photo_used>=0);

create function public.plus_reserve_unlimited(p_user uuid,p_id uuid,p_kind text,p_fingerprint text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.plus_cycles; r public.plus_usage_requests; pending int;
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
 select count(*) into pending from plus_usage_requests where cycle_id=c.id and kind=p_kind and state='pending';
 -- Bound in-flight work independently of successful lifetime/cycle usage.
 if pending>=30 then raise exception 'concurrency_limit'; end if;
 insert into plus_usage_requests(id,user_id,cycle_id,kind,fingerprint,state) values(p_id,p_user,c.id,p_kind,p_fingerprint,'pending');
 return jsonb_build_object('state','reserved');
end $$;

create function public.plus_usage_policy()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('version','unlimited-v1','recipeLimit',null,'photoLimit',null,'attemptsPerHour',60,'pendingPerKind',30);
$$;
revoke all on function public.plus_reserve_unlimited(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.plus_usage_policy() from public,anon,authenticated;
grant execute on function public.plus_reserve_unlimited(uuid,uuid,text,text) to service_role;
grant execute on function public.plus_usage_policy() to service_role;
commit;
