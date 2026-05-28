-- Operational seeds (idempotent). The single system_state row drives the
-- live / reduced / archived operating mode. cost_caps arms the circuit breaker
-- from day one with the Section 7 defaults.

INSERT INTO system_state (id, mode, reason)
VALUES (1, 'live', 'Phase 1 bootstrap')
ON CONFLICT (id) DO NOTHING;--> statement-breakpoint

INSERT INTO cost_caps (service, daily_cap_usd, monthly_cap_usd)
VALUES
  ('anthropic', 30, 500),
  ('openai', 5, 50),
  ('all', 40, 600)
ON CONFLICT (service) DO NOTHING;
