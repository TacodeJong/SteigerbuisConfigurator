-- Ensure service_role can call redemption bump from mollie-webhook Edge Function
revoke all on function public.increment_discount_redemption(text) from public;
grant execute on function public.increment_discount_redemption(text) to service_role;
