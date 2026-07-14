--
-- PostgreSQL database dump
--

\restrict CtYC0DUwEll860uIDxtNIGtweyX5sURSKytNTBV3BbH41L84WFbClcJeux1awNM

-- Dumped from database version 16.11
-- Dumped by pg_dump version 16.11

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

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: animal_feed_cost_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.animal_feed_cost_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id character varying(255) NOT NULL,
    animal_id uuid NOT NULL,
    log_date date NOT NULL,
    daily_cost numeric(10,2) DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.animal_feed_cost_logs OWNER TO postgres;

--
-- Name: animal_feed_cost_logs animal_feed_cost_logs_animal_id_log_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.animal_feed_cost_logs
    ADD CONSTRAINT animal_feed_cost_logs_animal_id_log_date_key UNIQUE (animal_id, log_date);


--
-- Name: animal_feed_cost_logs animal_feed_cost_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.animal_feed_cost_logs
    ADD CONSTRAINT animal_feed_cost_logs_pkey PRIMARY KEY (id);


--
-- Name: idx_feed_logs_animal; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_feed_logs_animal ON public.animal_feed_cost_logs USING btree (animal_id);


--
-- Name: animal_feed_cost_logs animal_feed_cost_logs_animal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.animal_feed_cost_logs
    ADD CONSTRAINT animal_feed_cost_logs_animal_id_fkey FOREIGN KEY (animal_id) REFERENCES public.cattle(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict CtYC0DUwEll860uIDxtNIGtweyX5sURSKytNTBV3BbH41L84WFbClcJeux1awNM

