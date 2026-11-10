-- Run on the test Supabase project only. Never mix test entitlements with production.
ALTER TABLE public.subscriptions ADD COLUMN stripe_event_created bigint NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX subscriptions_stripe_customer_unique ON public.subscriptions(stripe_customer_id);

-- Lock each user's row so retries and older deliveries cannot regress entitlement.
CREATE FUNCTION public.apply_stripe_test_subscription(
  p_user_id uuid, p_subscription_id text, p_status text,
  p_period_end timestamptz, p_event_created bigint
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE existing public.subscriptions;
BEGIN
  SELECT * INTO existing FROM public.subscriptions WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown billing account'; END IF;
  IF p_event_created < existing.stripe_event_created THEN RETURN; END IF;
  -- A delayed event for a previous subscription must not replace a newer one.
  IF existing.stripe_subscription_id IS DISTINCT FROM p_subscription_id
     AND existing.status NOT IN ('inactive', 'canceled', 'incomplete_expired') THEN
    RAISE EXCEPTION 'Another subscription is still current';
  END IF;
  UPDATE public.subscriptions SET status = p_status,
    stripe_subscription_id = p_subscription_id, current_period_end = p_period_end,
    stripe_event_created = p_event_created, updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_stripe_test_subscription(uuid,text,text,timestamptz,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_stripe_test_subscription(uuid,text,text,timestamptz,bigint) TO service_role;
