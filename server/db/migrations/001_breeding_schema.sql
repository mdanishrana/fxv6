
CREATE TABLE IF NOT EXISTS pregnancy_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  animal_id UUID NOT NULL,
  cycle_start_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL,
  expected_calving_date DATE,
  actual_calving_date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS breeding_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  animal_id UUID NOT NULL,
  cycle_id UUID,
  event_type VARCHAR(20) NOT NULL,
  event_date DATE NOT NULL,
  details JSONB DEFAULT '{}',
  created_by UUID,
  created_at TIMESTAMP DEFAULT NOW()
);
