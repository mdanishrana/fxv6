-- Create system_content table
CREATE TABLE IF NOT EXISTS system_content (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  content JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_by VARCHAR(255)
);

-- Insert default content
INSERT INTO system_content (key, content, updated_by)
VALUES ('landing_page', $$
{
    "heroTitle": "Pakistan’s Leading Cattle Feedlot Management Platform",
    "heroSubtitle": "Run your farm like a modern business. Track growth, control costs, and maximize profitability — all in one intelligent system.",
    "features": [
        { "icon": "Scale", "title": "Real-Time Weight & Growth Monitoring", "description": "Track daily gain, performance trends, and herd progress instantly." },
        { "icon": "Calculator", "title": "Smart Feed Optimization & Cost Control", "description": "Design ration packages and automatically calculate feed cost per animal." },
        { "icon": "DollarSign", "title": "Complete Expense & Profit Analytics", "description": "Monitor feed, labor, health, and operational expenses with real-time ROI tracking." },
        { "icon": "Syringe", "title": "Health & Vaccination Automation", "description": "Never miss a vaccination or treatment schedule again." },
        { "icon": "Package", "title": "Inventory & Supplier Management", "description": "Stay ahead with stock alerts and supplier tracking." },
        { "icon": "TrendingUp", "title": "Sales & Seasonal Campaign Tracking", "description": "Manage Qurbani and commercial sales with accurate profit reporting." }
    ],
    "footerPoints": [
        "Multi-animal performance dashboard",
        "Financial reporting & export (PDF)",
        "Secure cloud-based data",
        "Designed for Pakistan & GCC markets"
    ]
}
$$, 'SYSTEM')
ON CONFLICT (key) DO NOTHING;
