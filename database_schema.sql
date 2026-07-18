--
-- PostgreSQL database dump
--

\restrict HAvjGUw2nMp9OFD2L6hYxAK8jzwlJmTc6of48NMsXAmUoE4B8EhZWcVUOWj1uay

-- Dumped from database version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: animal_feed_cost_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.animal_feed_cost_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    animal_id uuid NOT NULL,
    log_date date NOT NULL,
    daily_cost numeric(10,2) DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: attendance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    worker_id uuid,
    date date NOT NULL,
    check_in time without time zone,
    check_out time without time zone,
    status character varying(20) DEFAULT 'PRESENT'::character varying,
    overtime_hours numeric(4,2) DEFAULT 0,
    notes text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    user_id uuid,
    action_type character varying(50) NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id uuid,
    details jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: breeding_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.breeding_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    animal_id uuid NOT NULL,
    cycle_id uuid,
    event_type character varying(20) NOT NULL,
    event_date date NOT NULL,
    details jsonb DEFAULT '{}'::jsonb,
    created_by uuid,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: cattle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cattle (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid,
    tag_number character varying(50) NOT NULL,
    name character varying(255),
    type character varying(50) DEFAULT 'Bull'::character varying,
    breed character varying(100),
    gender character varying(20) DEFAULT 'Male'::character varying,
    teeth integer DEFAULT 0,
    color character varying(100),
    status character varying(50) DEFAULT 'Active'::character varying,
    vaccination_status boolean DEFAULT false,
    arrival_type character varying(50) DEFAULT 'Mandi Purchase'::character varying,
    father_tag character varying(50),
    mother_tag character varying(50),
    entry_date date DEFAULT CURRENT_DATE,
    entry_weight numeric(10,2) DEFAULT 0,
    current_weight numeric(10,2) DEFAULT 0,
    target_weight numeric(10,2) DEFAULT 0,
    daily_target_gain numeric(5,2) DEFAULT 0,
    purchase_price numeric(12,2) DEFAULT 0,
    owner_name character varying(255) DEFAULT 'Farm Owned'::character varying,
    owner_email character varying(255),
    owner_mobile character varying(50),
    owner_address text,
    monthly_package_id uuid,
    notes text,
    image_url text,
    weight_history jsonb DEFAULT '[]'::jsonb,
    vaccination_history jsonb DEFAULT '[]'::jsonb,
    transactions jsonb DEFAULT '[]'::jsonb,
    qurbani_details jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    monthly_charges numeric(12,2) DEFAULT 0,
    photos jsonb DEFAULT '[]'::jsonb,
    video_links jsonb DEFAULT '[]'::jsonb,
    documents jsonb DEFAULT '[]'::jsonb,
    health_status character varying(50) DEFAULT 'Healthy'::character varying,
    expected_calving_date date,
    current_daily_milk_yield numeric(10,2) DEFAULT 0,
    age_months integer,
    group_id uuid,
    expected_conceiving_date date,
    pregnancy_type character varying(50),
    pregnancy_sire_embryo character varying(100),
    lactation_number integer,
    branch character varying(255),
    owner_whatsapp_number character varying(50),
    owner_whatsapp_apikey character varying(50)
);


--
-- Name: cattle_costs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cattle_costs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    cattle_id uuid NOT NULL,
    cost_type character varying(50) NOT NULL,
    amount numeric(12,2) DEFAULT 0 NOT NULL,
    description text,
    date date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT cattle_costs_cost_type_check CHECK (((cost_type)::text = ANY (ARRAY[('MEDICAL'::character varying)::text, ('VACCINATION'::character varying)::text, ('LABOR'::character varying)::text, ('OTHER'::character varying)::text])))
);


--
-- Name: cattle_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cattle_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    color character varying(20) DEFAULT '#10b981'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: email_verification_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_verification_tokens (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid,
    token character varying(255) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: embryo_bank; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.embryo_bank (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    code character varying(50) NOT NULL,
    bull_name character varying(100),
    donor_cow character varying(100),
    breed character varying(50),
    type character varying(20) DEFAULT 'FROZEN'::character varying,
    source character varying(50),
    notes text,
    status character varying(20) DEFAULT 'AVAILABLE'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: feed_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feed_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid,
    name character varying(255) NOT NULL,
    category character varying(100),
    unit character varying(50) DEFAULT 'kg'::character varying,
    cost_per_kg numeric(10,2) DEFAULT 0,
    stock_quantity numeric(10,2) DEFAULT 0,
    min_stock_level numeric(10,2) DEFAULT 0,
    protein_percentage numeric(5,2) DEFAULT 0,
    energy_mcal numeric(5,2) DEFAULT 0,
    fiber_percentage numeric(5,2) DEFAULT 0,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    price_history jsonb DEFAULT '[]'::jsonb
);


--
-- Name: feed_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feed_packages (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid,
    name character varying(255) NOT NULL,
    description text,
    target_animal_type character varying(50),
    daily_quantity_kg numeric(10,2) DEFAULT 0,
    daily_intake_percent numeric(5,2) DEFAULT 2.5,
    cost_per_day numeric(10,2) DEFAULT 0,
    ingredients jsonb DEFAULT '[]'::jsonb,
    items jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: feed_usage_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.feed_usage_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    date date NOT NULL,
    total_animals integer DEFAULT 0,
    total_weight_kg numeric(12,2) DEFAULT 0,
    total_feed_consumed_kg numeric(12,2) DEFAULT 0,
    breakdown jsonb DEFAULT '[]'::jsonb,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: general_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.general_transactions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    type character varying(20) NOT NULL,
    category character varying(100) NOT NULL,
    amount numeric(12,2) DEFAULT 0 NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    source character varying(255),
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT general_transactions_type_check CHECK (((type)::text = ANY (ARRAY[('INCOME'::character varying)::text, ('EXPENSE'::character varying)::text])))
);


--
-- Name: lactations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lactations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    animal_id uuid NOT NULL,
    lactation_number integer NOT NULL,
    start_date date NOT NULL,
    end_date date,
    expected_breeding_date date,
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    end_reason text
);


--
-- Name: medical_inventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medical_inventory (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    type character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    batch_number character varying(100),
    manufacturer character varying(255),
    quantity numeric(10,2) DEFAULT 0,
    unit character varying(50) DEFAULT 'doses'::character varying NOT NULL,
    cost_per_unit numeric(10,2) DEFAULT 0,
    expiry_date date,
    status character varying(50) DEFAULT 'ACTIVE'::character varying,
    notes text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT medical_inventory_status_check CHECK (((status)::text = ANY (ARRAY[('ACTIVE'::character varying)::text, ('EXPIRED'::character varying)::text, ('DEPLETED'::character varying)::text]))),
    CONSTRAINT medical_inventory_type_check CHECK (((type)::text = ANY (ARRAY[('VACCINE'::character varying)::text, ('MEDICINE'::character varying)::text])))
);


--
-- Name: milk_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.milk_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    animal_id uuid NOT NULL,
    lactation_id uuid,
    log_date date NOT NULL,
    morning_yield numeric(5,2) DEFAULT 0,
    evening_yield numeric(5,2) DEFAULT 0,
    total_yield numeric(5,2) GENERATED ALWAYS AS ((morning_yield + evening_yield)) STORED,
    notes text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: milk_sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.milk_sales (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    sale_date date NOT NULL,
    shift character varying(20) NOT NULL,
    quantity_liters numeric(10,2) NOT NULL,
    price_per_liter numeric(10,2) NOT NULL,
    total_amount numeric(12,2) NOT NULL,
    buyer_name character varying(255) NOT NULL,
    payment_status character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    paid_amount numeric(12,2) DEFAULT 0.00 NOT NULL,
    notes text,
    transaction_id uuid,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid,
    token character varying(255) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    cattle_id uuid,
    amount numeric(12,2) NOT NULL,
    due_date date NOT NULL,
    paid_date date,
    status character varying(20) DEFAULT 'Pending'::character varying,
    payment_method character varying(50),
    notes text,
    reminder_sent boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    billing_period_start date,
    billing_period_end date
);


--
-- Name: payment_action_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_action_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    cattle_id uuid NOT NULL,
    token character varying(255) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used_at timestamp without time zone,
    used_action character varying(20),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: payment_review_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_review_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    token character varying(255) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: plan_features; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_features (
    id integer NOT NULL,
    plan_id integer,
    feature_text character varying(255) NOT NULL,
    display_order integer DEFAULT 0
);


--
-- Name: plan_features_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.plan_features_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: plan_features_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.plan_features_id_seq OWNED BY public.plan_features.id;


--
-- Name: pregnancy_cycles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pregnancy_cycles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    animal_id uuid NOT NULL,
    cycle_start_date date NOT NULL,
    status character varying(20) NOT NULL,
    expected_calving_date date,
    actual_calving_date date,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id integer NOT NULL,
    user_id uuid,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: push_subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.push_subscriptions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: push_subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.push_subscriptions_id_seq OWNED BY public.push_subscriptions.id;


--
-- Name: semen_bank; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.semen_bank (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    code character varying(50) NOT NULL,
    bull_name character varying(100),
    breed character varying(50),
    source character varying(50),
    notes text,
    status character varying(20) DEFAULT 'AVAILABLE'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid,
    token text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: subscription_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subscription_id uuid,
    tenant_id uuid,
    invoice_number character varying(50) NOT NULL,
    amount numeric(12,2) NOT NULL,
    tax_amount numeric(12,2) DEFAULT 0,
    total_amount numeric(12,2) NOT NULL,
    currency character varying(10) DEFAULT 'PKR'::character varying,
    status character varying(20) DEFAULT 'PENDING'::character varying,
    due_date date NOT NULL,
    paid_date date,
    payment_method character varying(50),
    payment_reference character varying(100),
    notes text,
    billing_period_start date,
    billing_period_end date,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT subscription_invoices_status_check CHECK (((status)::text = ANY (ARRAY[('PENDING'::character varying)::text, ('PAID'::character varying)::text, ('OVERDUE'::character varying)::text, ('CANCELLED'::character varying)::text, ('REFUNDED'::character varying)::text])))
);


--
-- Name: TABLE subscription_invoices; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.subscription_invoices IS 'Stores all subscription invoices with payment tracking';


--
-- Name: subscription_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_plans (
    id integer NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    price_pkr numeric(10,2),
    billing_period character varying(20) DEFAULT '/month'::character varying,
    description text,
    is_custom boolean DEFAULT false,
    contact_email character varying(255),
    is_popular boolean DEFAULT false,
    display_order integer DEFAULT 0,
    user_limit integer DEFAULT 3,
    cattle_limit character varying(50) DEFAULT 'Unlimited'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: subscription_plans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.subscription_plans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: subscription_plans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.subscription_plans_id_seq OWNED BY public.subscription_plans.id;


--
-- Name: supplier_purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_purchases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    supplier_id uuid,
    purchase_date date NOT NULL,
    invoice_number character varying(100),
    items jsonb DEFAULT '[]'::jsonb,
    subtotal numeric(12,2) DEFAULT 0,
    tax_amount numeric(12,2) DEFAULT 0,
    total_amount numeric(12,2) NOT NULL,
    payment_status character varying(20) DEFAULT 'PENDING'::character varying,
    paid_amount numeric(12,2) DEFAULT 0,
    payment_date date,
    payment_method character varying(50),
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    name character varying(255) NOT NULL,
    company character varying(255),
    phone character varying(50),
    email character varying(255),
    address text,
    category character varying(100),
    notes text,
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: system_content; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_content (
    id integer NOT NULL,
    key character varying(100) NOT NULL,
    content jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_by character varying(255)
);


--
-- Name: system_content_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.system_content_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: system_content_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.system_content_id_seq OWNED BY public.system_content.id;


--
-- Name: tenant_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    plan_id integer,
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    billing_cycle character varying(20) DEFAULT 'MONTHLY'::character varying,
    amount numeric(12,2) NOT NULL,
    currency character varying(10) DEFAULT 'PKR'::character varying,
    start_date date DEFAULT CURRENT_DATE,
    trial_end_date date,
    next_billing_date date,
    last_payment_date date,
    cancelled_at timestamp without time zone,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    cattle_limit_override character varying(50),
    CONSTRAINT tenant_subscriptions_billing_cycle_check CHECK (((billing_cycle)::text = ANY (ARRAY[('MONTHLY'::character varying)::text, ('QUARTERLY'::character varying)::text, ('YEARLY'::character varying)::text]))),
    CONSTRAINT tenant_subscriptions_status_check CHECK (((status)::text = ANY (ARRAY[('ACTIVE'::character varying)::text, ('TRIAL'::character varying)::text, ('PAST_DUE'::character varying)::text, ('CANCELLED'::character varying)::text, ('SUSPENDED'::character varying)::text])))
);


--
-- Name: TABLE tenant_subscriptions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tenant_subscriptions IS 'Tracks SaaS subscription details for each tenant/farm';


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    owner_name character varying(255) NOT NULL,
    owner_email character varying(255),
    owner_mobile character varying(50),
    tier character varying(20) DEFAULT 'BASIC'::character varying,
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    modules text[] DEFAULT ARRAY['CORE'::text],
    locale character varying(10) DEFAULT 'en-PK'::character varying,
    currency character varying(10) DEFAULT 'PKR'::character varying,
    max_cattle integer DEFAULT 50,
    max_users integer DEFAULT 3,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    herd_value_rate numeric(10,2) DEFAULT 1100,
    manager_email character varying(255),
    smtp_settings jsonb,
    logo_url text,
    weight_unit character varying(10) DEFAULT 'kg'::character varying,
    branches jsonb DEFAULT '[]'::jsonb,
    whatsapp_number character varying(50),
    whatsapp_apikey character varying(50),
    CONSTRAINT tenants_status_check CHECK (((status)::text = ANY (ARRAY[('ACTIVE'::character varying)::text, ('SUSPENDED'::character varying)::text, ('TRIAL'::character varying)::text]))),
    CONSTRAINT tenants_tier_check CHECK (((tier)::text = ANY (ARRAY[('BASIC'::character varying)::text, ('STANDARD'::character varying)::text, ('PREMIUM'::character varying)::text])))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid,
    name character varying(255) NOT NULL,
    email character varying(255),
    mobile character varying(50),
    password_hash character varying(255),
    role character varying(20) DEFAULT 'LABOR'::character varying,
    is_verified boolean DEFAULT false,
    last_login timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_role_check CHECK (((role)::text = ANY (ARRAY[('OWNER'::character varying)::text, ('MANAGER'::character varying)::text, ('LABOR'::character varying)::text, ('SAAS_ADMIN'::character varying)::text, ('ANIMAL_OWNER'::character varying)::text])))
);


--
-- Name: wage_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wage_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    worker_id uuid,
    period_start date NOT NULL,
    period_end date NOT NULL,
    days_worked integer DEFAULT 0,
    base_amount numeric(12,2) NOT NULL,
    overtime_amount numeric(12,2) DEFAULT 0,
    deductions numeric(12,2) DEFAULT 0,
    bonus numeric(12,2) DEFAULT 0,
    total_amount numeric(12,2) NOT NULL,
    payment_status character varying(20) DEFAULT 'PENDING'::character varying,
    payment_date date,
    payment_method character varying(50),
    notes text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: workers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    name character varying(255) NOT NULL,
    phone character varying(50),
    cnic character varying(20),
    address text,
    role character varying(100),
    salary_type character varying(20) DEFAULT 'MONTHLY'::character varying,
    salary_amount numeric(12,2) DEFAULT 0,
    join_date date,
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    emergency_contact character varying(100),
    emergency_phone character varying(50),
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: plan_features id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_features ALTER COLUMN id SET DEFAULT nextval('public.plan_features_id_seq'::regclass);


--
-- Name: push_subscriptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions ALTER COLUMN id SET DEFAULT nextval('public.push_subscriptions_id_seq'::regclass);


--
-- Name: subscription_plans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_plans ALTER COLUMN id SET DEFAULT nextval('public.subscription_plans_id_seq'::regclass);


--
-- Name: system_content id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_content ALTER COLUMN id SET DEFAULT nextval('public.system_content_id_seq'::regclass);


--
-- Name: animal_feed_cost_logs animal_feed_cost_logs_animal_id_log_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.animal_feed_cost_logs
    ADD CONSTRAINT animal_feed_cost_logs_animal_id_log_date_key UNIQUE (animal_id, log_date);


--
-- Name: animal_feed_cost_logs animal_feed_cost_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.animal_feed_cost_logs
    ADD CONSTRAINT animal_feed_cost_logs_pkey PRIMARY KEY (id);


--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);


--
-- Name: attendance attendance_worker_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_worker_id_date_key UNIQUE (worker_id, date);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: breeding_events breeding_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.breeding_events
    ADD CONSTRAINT breeding_events_pkey PRIMARY KEY (id);


--
-- Name: cattle_costs cattle_costs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cattle_costs
    ADD CONSTRAINT cattle_costs_pkey PRIMARY KEY (id);


--
-- Name: cattle_groups cattle_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cattle_groups
    ADD CONSTRAINT cattle_groups_pkey PRIMARY KEY (id);


--
-- Name: cattle cattle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cattle
    ADD CONSTRAINT cattle_pkey PRIMARY KEY (id);


--
-- Name: cattle cattle_tenant_id_tag_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cattle
    ADD CONSTRAINT cattle_tenant_id_tag_number_key UNIQUE (tenant_id, tag_number);


--
-- Name: email_verification_tokens email_verification_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_pkey PRIMARY KEY (id);


--
-- Name: embryo_bank embryo_bank_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embryo_bank
    ADD CONSTRAINT embryo_bank_pkey PRIMARY KEY (id);


--
-- Name: embryo_bank embryo_bank_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.embryo_bank
    ADD CONSTRAINT embryo_bank_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: feed_items feed_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_items
    ADD CONSTRAINT feed_items_pkey PRIMARY KEY (id);


--
-- Name: feed_packages feed_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_packages
    ADD CONSTRAINT feed_packages_pkey PRIMARY KEY (id);


--
-- Name: feed_usage_log feed_usage_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_usage_log
    ADD CONSTRAINT feed_usage_log_pkey PRIMARY KEY (id);


--
-- Name: feed_usage_log feed_usage_log_tenant_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_usage_log
    ADD CONSTRAINT feed_usage_log_tenant_id_date_key UNIQUE (tenant_id, date);


--
-- Name: general_transactions general_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.general_transactions
    ADD CONSTRAINT general_transactions_pkey PRIMARY KEY (id);


--
-- Name: lactations lactations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lactations
    ADD CONSTRAINT lactations_pkey PRIMARY KEY (id);


--
-- Name: medical_inventory medical_inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medical_inventory
    ADD CONSTRAINT medical_inventory_pkey PRIMARY KEY (id);


--
-- Name: milk_logs milk_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.milk_logs
    ADD CONSTRAINT milk_logs_pkey PRIMARY KEY (id);


--
-- Name: milk_logs milk_logs_tenant_id_animal_id_log_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.milk_logs
    ADD CONSTRAINT milk_logs_tenant_id_animal_id_log_date_key UNIQUE (tenant_id, animal_id, log_date);


--
-- Name: milk_sales milk_sales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.milk_sales
    ADD CONSTRAINT milk_sales_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: payment_action_tokens payment_action_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_action_tokens
    ADD CONSTRAINT payment_action_tokens_pkey PRIMARY KEY (id);


--
-- Name: payment_action_tokens payment_action_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_action_tokens
    ADD CONSTRAINT payment_action_tokens_token_key UNIQUE (token);


--
-- Name: payment_review_tokens payment_review_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_review_tokens
    ADD CONSTRAINT payment_review_tokens_pkey PRIMARY KEY (id);


--
-- Name: payment_review_tokens payment_review_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_review_tokens
    ADD CONSTRAINT payment_review_tokens_token_key UNIQUE (token);


--
-- Name: plan_features plan_features_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_features
    ADD CONSTRAINT plan_features_pkey PRIMARY KEY (id);


--
-- Name: pregnancy_cycles pregnancy_cycles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pregnancy_cycles
    ADD CONSTRAINT pregnancy_cycles_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: semen_bank semen_bank_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.semen_bank
    ADD CONSTRAINT semen_bank_pkey PRIMARY KEY (id);


--
-- Name: semen_bank semen_bank_tenant_id_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.semen_bank
    ADD CONSTRAINT semen_bank_tenant_id_code_key UNIQUE (tenant_id, code);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: subscription_invoices subscription_invoices_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_invoices
    ADD CONSTRAINT subscription_invoices_invoice_number_key UNIQUE (invoice_number);


--
-- Name: subscription_invoices subscription_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_invoices
    ADD CONSTRAINT subscription_invoices_pkey PRIMARY KEY (id);


--
-- Name: subscription_plans subscription_plans_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT subscription_plans_code_key UNIQUE (code);


--
-- Name: subscription_plans subscription_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT subscription_plans_pkey PRIMARY KEY (id);


--
-- Name: supplier_purchases supplier_purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_purchases
    ADD CONSTRAINT supplier_purchases_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: system_content system_content_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_content
    ADD CONSTRAINT system_content_key_key UNIQUE (key);


--
-- Name: system_content system_content_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_content
    ADD CONSTRAINT system_content_pkey PRIMARY KEY (id);


--
-- Name: tenant_subscriptions tenant_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_subscriptions
    ADD CONSTRAINT tenant_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: tenant_subscriptions tenant_subscriptions_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_subscriptions
    ADD CONSTRAINT tenant_subscriptions_tenant_id_key UNIQUE (tenant_id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: wage_payments wage_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wage_payments
    ADD CONSTRAINT wage_payments_pkey PRIMARY KEY (id);


--
-- Name: workers workers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workers
    ADD CONSTRAINT workers_pkey PRIMARY KEY (id);


--
-- Name: idx_attendance_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_date ON public.attendance USING btree (date);


--
-- Name: idx_attendance_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_tenant ON public.attendance USING btree (tenant_id);


--
-- Name: idx_attendance_worker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_worker ON public.attendance USING btree (worker_id);


--
-- Name: idx_audit_logs_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_entity ON public.audit_logs USING btree (entity_type, entity_id);


--
-- Name: idx_audit_logs_tenant_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_tenant_created ON public.audit_logs USING btree (tenant_id, created_at DESC);


--
-- Name: idx_cattle_costs_cattle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cattle_costs_cattle ON public.cattle_costs USING btree (cattle_id);


--
-- Name: idx_cattle_costs_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cattle_costs_date ON public.cattle_costs USING btree (date);


--
-- Name: idx_cattle_costs_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cattle_costs_tenant ON public.cattle_costs USING btree (tenant_id);


--
-- Name: idx_cattle_costs_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cattle_costs_type ON public.cattle_costs USING btree (cost_type);


--
-- Name: idx_cattle_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cattle_status ON public.cattle USING btree (status);


--
-- Name: idx_cattle_tag; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cattle_tag ON public.cattle USING btree (tag_number);


--
-- Name: idx_cattle_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cattle_tenant ON public.cattle USING btree (tenant_id);


--
-- Name: idx_feed_items_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feed_items_tenant ON public.feed_items USING btree (tenant_id);


--
-- Name: idx_feed_logs_animal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feed_logs_animal ON public.animal_feed_cost_logs USING btree (animal_id);


--
-- Name: idx_feed_packages_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feed_packages_tenant ON public.feed_packages USING btree (tenant_id);


--
-- Name: idx_feed_usage_tenant_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_feed_usage_tenant_date ON public.feed_usage_log USING btree (tenant_id, date);


--
-- Name: idx_gen_trans_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gen_trans_date ON public.general_transactions USING btree (date);


--
-- Name: idx_gen_trans_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gen_trans_tenant ON public.general_transactions USING btree (tenant_id);


--
-- Name: idx_gen_trans_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gen_trans_type ON public.general_transactions USING btree (type);


--
-- Name: idx_invoices_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_due_date ON public.subscription_invoices USING btree (due_date);


--
-- Name: idx_invoices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_status ON public.subscription_invoices USING btree (status);


--
-- Name: idx_invoices_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_tenant ON public.subscription_invoices USING btree (tenant_id);


--
-- Name: idx_medical_tenant_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_medical_tenant_type ON public.medical_inventory USING btree (tenant_id, type);


--
-- Name: idx_payment_action_tokens_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_action_tokens_token ON public.payment_action_tokens USING btree (token);


--
-- Name: idx_payment_review_tokens_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_review_tokens_token ON public.payment_review_tokens USING btree (token);


--
-- Name: idx_payments_due_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_due_date ON public.payments USING btree (due_date);


--
-- Name: idx_payments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_status ON public.payments USING btree (status);


--
-- Name: idx_payments_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_tenant ON public.payments USING btree (tenant_id);


--
-- Name: idx_subscriptions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_status ON public.tenant_subscriptions USING btree (status);


--
-- Name: idx_subscriptions_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_tenant ON public.tenant_subscriptions USING btree (tenant_id);


--
-- Name: idx_supp_purchases_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supp_purchases_date ON public.supplier_purchases USING btree (purchase_date);


--
-- Name: idx_supp_purchases_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supp_purchases_supplier ON public.supplier_purchases USING btree (supplier_id);


--
-- Name: idx_supp_purchases_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supp_purchases_tenant ON public.supplier_purchases USING btree (tenant_id);


--
-- Name: idx_supplier_purchases_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_purchases_supplier ON public.supplier_purchases USING btree (supplier_id);


--
-- Name: idx_supplier_purchases_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_purchases_tenant ON public.supplier_purchases USING btree (tenant_id);


--
-- Name: idx_suppliers_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_suppliers_tenant ON public.suppliers USING btree (tenant_id);


--
-- Name: idx_users_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_tenant ON public.users USING btree (tenant_id);


--
-- Name: idx_wage_payments_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wage_payments_tenant ON public.wage_payments USING btree (tenant_id);


--
-- Name: idx_wage_payments_worker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wage_payments_worker ON public.wage_payments USING btree (worker_id);


--
-- Name: idx_workers_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workers_tenant ON public.workers USING btree (tenant_id);


--
-- Name: animal_feed_cost_logs animal_feed_cost_logs_animal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.animal_feed_cost_logs
    ADD CONSTRAINT animal_feed_cost_logs_animal_id_fkey FOREIGN KEY (animal_id) REFERENCES public.cattle(id) ON DELETE CASCADE;


--
-- Name: attendance attendance_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: attendance attendance_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance
    ADD CONSTRAINT attendance_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: cattle_costs cattle_costs_cattle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cattle_costs
    ADD CONSTRAINT cattle_costs_cattle_id_fkey FOREIGN KEY (cattle_id) REFERENCES public.cattle(id) ON DELETE CASCADE;


--
-- Name: cattle_costs cattle_costs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cattle_costs
    ADD CONSTRAINT cattle_costs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: cattle cattle_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cattle
    ADD CONSTRAINT cattle_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.cattle_groups(id) ON DELETE SET NULL;


--
-- Name: cattle cattle_monthly_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cattle
    ADD CONSTRAINT cattle_monthly_package_id_fkey FOREIGN KEY (monthly_package_id) REFERENCES public.feed_packages(id) ON DELETE SET NULL;


--
-- Name: cattle cattle_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cattle
    ADD CONSTRAINT cattle_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: email_verification_tokens email_verification_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: feed_items feed_items_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_items
    ADD CONSTRAINT feed_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: feed_packages feed_packages_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_packages
    ADD CONSTRAINT feed_packages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: feed_usage_log feed_usage_log_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.feed_usage_log
    ADD CONSTRAINT feed_usage_log_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: general_transactions general_transactions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.general_transactions
    ADD CONSTRAINT general_transactions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: medical_inventory medical_inventory_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medical_inventory
    ADD CONSTRAINT medical_inventory_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: payments payments_cattle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_cattle_id_fkey FOREIGN KEY (cattle_id) REFERENCES public.cattle(id) ON DELETE CASCADE;


--
-- Name: payments payments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: payment_action_tokens payment_action_tokens_cattle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_action_tokens
    ADD CONSTRAINT payment_action_tokens_cattle_id_fkey FOREIGN KEY (cattle_id) REFERENCES public.cattle(id) ON DELETE CASCADE;


--
-- Name: payment_action_tokens payment_action_tokens_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_action_tokens
    ADD CONSTRAINT payment_action_tokens_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: payment_review_tokens payment_review_tokens_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_review_tokens
    ADD CONSTRAINT payment_review_tokens_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: plan_features plan_features_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_features
    ADD CONSTRAINT plan_features_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions push_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: subscription_invoices subscription_invoices_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_invoices
    ADD CONSTRAINT subscription_invoices_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.tenant_subscriptions(id) ON DELETE CASCADE;


--
-- Name: subscription_invoices subscription_invoices_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_invoices
    ADD CONSTRAINT subscription_invoices_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: supplier_purchases supplier_purchases_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_purchases
    ADD CONSTRAINT supplier_purchases_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: supplier_purchases supplier_purchases_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_purchases
    ADD CONSTRAINT supplier_purchases_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: suppliers suppliers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: tenant_subscriptions tenant_subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_subscriptions
    ADD CONSTRAINT tenant_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id);


--
-- Name: tenant_subscriptions tenant_subscriptions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_subscriptions
    ADD CONSTRAINT tenant_subscriptions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: users users_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: wage_payments wage_payments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wage_payments
    ADD CONSTRAINT wage_payments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: wage_payments wage_payments_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wage_payments
    ADD CONSTRAINT wage_payments_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.workers(id) ON DELETE CASCADE;


--
-- Name: workers workers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workers
    ADD CONSTRAINT workers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict HAvjGUw2nMp9OFD2L6hYxAK8jzwlJmTc6of48NMsXAmUoE4B8EhZWcVUOWj1uay

