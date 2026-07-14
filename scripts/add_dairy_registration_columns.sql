ALTER TABLE public.cattle
ADD COLUMN IF NOT EXISTS health_status character varying(50) DEFAULT 'Healthy',
ADD COLUMN IF NOT EXISTS expected_calving_date date,
ADD COLUMN IF NOT EXISTS current_daily_milk_yield numeric(10,2) DEFAULT 0;
