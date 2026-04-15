-- Migration 019: Extend sdk_events decision constraint
--
-- Adds 'allowed_opt_in' to the sdk_events decision check constraint.

-- 1. Extend sdk_events decision values
ALTER TABLE public.sdk_events
  DROP CONSTRAINT IF EXISTS sdk_events_decision_check;

ALTER TABLE public.sdk_events
  ADD CONSTRAINT sdk_events_decision_check CHECK (decision IN (
    'granted',
    'denied',
    'blocked_no_catalog',
    'authorized_paid',
    'denied_authorization_required',
    'denied_invalid_token',
    'denied_identity_check'
  ));
