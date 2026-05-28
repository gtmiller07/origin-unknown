-- Postgres triggers. search_vector needs no trigger; it is a STORED generated
-- column (see 0000). This file maintains updated_at and aggregates API cost.

-- updated_at maintenance ------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

DROP TRIGGER IF EXISTS "sources_set_updated_at" ON "sources";--> statement-breakpoint
CREATE TRIGGER "sources_set_updated_at" BEFORE UPDATE ON "sources" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "artifacts_set_updated_at" ON "artifacts";--> statement-breakpoint
CREATE TRIGGER "artifacts_set_updated_at" BEFORE UPDATE ON "artifacts" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "scores_set_updated_at" ON "scores";--> statement-breakpoint
CREATE TRIGGER "scores_set_updated_at" BEFORE UPDATE ON "scores" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "evidence_panels_set_updated_at" ON "evidence_panels";--> statement-breakpoint
CREATE TRIGGER "evidence_panels_set_updated_at" BEFORE UPDATE ON "evidence_panels" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "era_stations_set_updated_at" ON "era_stations";--> statement-breakpoint
CREATE TRIGGER "era_stations_set_updated_at" BEFORE UPDATE ON "era_stations" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "curator_notes_set_updated_at" ON "curator_notes";--> statement-breakpoint
CREATE TRIGGER "curator_notes_set_updated_at" BEFORE UPDATE ON "curator_notes" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS "cost_caps_set_updated_at" ON "cost_caps";--> statement-breakpoint
CREATE TRIGGER "cost_caps_set_updated_at" BEFORE UPDATE ON "cost_caps" FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint

-- Cost aggregation + circuit breaker ------------------------------------------
-- On each api_call_log insert, fold the cost into the matching service cap and
-- the 'all' aggregate. Daily and monthly windows roll over from a single
-- spend_window_start_date. is_breached is recomputed from the post-insert spend.
CREATE OR REPLACE FUNCTION apply_api_cost() RETURNS trigger AS $$
BEGIN
  IF NEW.cost_usd IS NULL OR NEW.cost_usd <= 0 THEN
    RETURN NEW;
  END IF;

  UPDATE cost_caps c
  SET
    current_daily_spend_usd = d.new_daily,
    current_monthly_spend_usd = d.new_monthly,
    spend_window_start_date = current_date,
    is_breached = (d.new_daily >= c.daily_cap_usd OR d.new_monthly >= c.monthly_cap_usd),
    breached_at = CASE
      WHEN (d.new_daily >= c.daily_cap_usd OR d.new_monthly >= c.monthly_cap_usd)
        THEN COALESCE(c.breached_at, now())
      ELSE NULL
    END,
    updated_at = now()
  FROM (
    SELECT
      cc.id,
      CASE WHEN cc.spend_window_start_date < current_date
           THEN NEW.cost_usd
           ELSE cc.current_daily_spend_usd + NEW.cost_usd END AS new_daily,
      CASE WHEN date_trunc('month', cc.spend_window_start_date) < date_trunc('month', current_date)
           THEN NEW.cost_usd
           ELSE cc.current_monthly_spend_usd + NEW.cost_usd END AS new_monthly
    FROM cost_caps cc
    WHERE cc.service IN (NEW.service, 'all')
  ) d
  WHERE c.id = d.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;--> statement-breakpoint

DROP TRIGGER IF EXISTS "api_call_log_apply_cost" ON "api_call_log";--> statement-breakpoint
CREATE TRIGGER "api_call_log_apply_cost" AFTER INSERT ON "api_call_log" FOR EACH ROW EXECUTE FUNCTION apply_api_cost();
