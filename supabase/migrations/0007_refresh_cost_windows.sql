-- refresh_cost_windows(): proactively roll the daily/monthly spend windows and
-- recompute is_breached for every cost cap, independent of new api_call_log
-- inserts. apply_api_cost() (0003) already rolls windows lazily on each insert;
-- this lets the refresh-cost-window cron reset the breaker at day/month
-- boundaries even when a service has been idle. Mirrors the rollover in 0003;
-- updated_at is maintained by the cost_caps_set_updated_at trigger.
CREATE OR REPLACE FUNCTION refresh_cost_windows() RETURNS void AS $$
BEGIN
  UPDATE cost_caps c
  SET
    current_daily_spend_usd = e.new_daily,
    current_monthly_spend_usd = e.new_monthly,
    is_breached = (e.new_daily >= c.daily_cap_usd OR e.new_monthly >= c.monthly_cap_usd),
    breached_at = CASE
      WHEN (e.new_daily >= c.daily_cap_usd OR e.new_monthly >= c.monthly_cap_usd)
        THEN COALESCE(c.breached_at, now())
      ELSE NULL
    END,
    spend_window_start_date = current_date
  FROM (
    SELECT
      cc.id,
      CASE WHEN cc.spend_window_start_date < current_date
           THEN 0
           ELSE cc.current_daily_spend_usd END AS new_daily,
      CASE WHEN date_trunc('month', cc.spend_window_start_date) < date_trunc('month', current_date)
           THEN 0
           ELSE cc.current_monthly_spend_usd END AS new_monthly
    FROM cost_caps cc
  ) e
  WHERE c.id = e.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
