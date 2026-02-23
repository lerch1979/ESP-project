--
-- PostgreSQL database dump
--

\restrict eeWOMLSNXy93uqqsUwjnNrBqBlSdCqN2SuKrGlRl0BApOm0PfBPAL0grRDRVXKb

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

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: chatbot_kb_search_vector_update(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.chatbot_kb_search_vector_update() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', COALESCE(NEW.question, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(array_to_string(NEW.keywords, ' '), '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.answer, '')), 'B');
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.chatbot_kb_search_vector_update() OWNER TO postgres;

--
-- Name: update_accommodation_rooms_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_accommodation_rooms_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_accommodation_rooms_updated_at() OWNER TO postgres;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO postgres;

--
-- Name: update_videos_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_videos_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_videos_updated_at() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: accommodation_contractors; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.accommodation_contractors (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    accommodation_id uuid NOT NULL,
    contractor_id uuid NOT NULL,
    check_in date NOT NULL,
    check_out date,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.accommodation_contractors OWNER TO postgres;

--
-- Name: accommodation_rooms; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.accommodation_rooms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    accommodation_id uuid NOT NULL,
    room_number character varying(20) NOT NULL,
    floor integer,
    beds integer DEFAULT 1 NOT NULL,
    room_type character varying(50) DEFAULT 'standard'::character varying,
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.accommodation_rooms OWNER TO postgres;

--
-- Name: accommodation_tenants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.accommodation_tenants (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    accommodation_id uuid NOT NULL,
    contractor_id uuid NOT NULL,
    check_in date NOT NULL,
    check_out date,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.accommodation_tenants OWNER TO postgres;

--
-- Name: TABLE accommodation_tenants; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.accommodation_tenants IS 'Szálláshely bérlő történet';


--
-- Name: accommodations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.accommodations (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    address text,
    type character varying(50) DEFAULT 'studio'::character varying NOT NULL,
    capacity integer DEFAULT 1 NOT NULL,
    current_contractor_id uuid,
    status character varying(50) DEFAULT 'available'::character varying NOT NULL,
    monthly_rent numeric(12,2),
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.accommodations OWNER TO postgres;

--
-- Name: TABLE accommodations; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.accommodations IS 'Szálláshelyek (lakások, szobák)';


--
-- Name: activity_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    entity_type character varying(50) NOT NULL,
    entity_id uuid NOT NULL,
    action character varying(20) NOT NULL,
    changes jsonb,
    metadata jsonb,
    ip_address character varying(45),
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.activity_logs OWNER TO postgres;

--
-- Name: chatbot_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chatbot_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contractor_id uuid,
    welcome_message text DEFAULT 'Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.'::text,
    fallback_message text DEFAULT 'Sajnos nem találtam megfelelő választ. Szeretné, ha továbbítanám kérdését egy munkatársunknak?'::text,
    escalation_message text DEFAULT 'Kérdését továbbítottam munkatársainknak. Hamarosan felvesszük Önnel a kapcsolatot egy hibajegyen keresztül.'::text,
    keyword_threshold integer DEFAULT 1,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.chatbot_config OWNER TO postgres;

--
-- Name: chatbot_conversations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chatbot_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contractor_id uuid,
    user_id uuid NOT NULL,
    title character varying(200) DEFAULT 'Új beszélgetés'::character varying,
    status character varying(20) DEFAULT 'active'::character varying,
    current_tree_id uuid,
    current_node_id uuid,
    escalation_ticket_id uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    closed_at timestamp with time zone,
    resolution_type character varying(20),
    CONSTRAINT chatbot_conversations_resolution_type_check CHECK ((((resolution_type)::text = ANY ((ARRAY['resolved'::character varying, 'escalated'::character varying, 'abandoned'::character varying])::text[])) OR (resolution_type IS NULL))),
    CONSTRAINT chatbot_conversations_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'escalated'::character varying, 'closed'::character varying])::text[])))
);


ALTER TABLE public.chatbot_conversations OWNER TO postgres;

--
-- Name: chatbot_decision_nodes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chatbot_decision_nodes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tree_id uuid NOT NULL,
    parent_id uuid,
    node_type character varying(20) NOT NULL,
    content text NOT NULL,
    sort_order integer DEFAULT 0,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chatbot_decision_nodes_node_type_check CHECK (((node_type)::text = ANY ((ARRAY['root'::character varying, 'question'::character varying, 'option'::character varying, 'answer'::character varying])::text[])))
);


ALTER TABLE public.chatbot_decision_nodes OWNER TO postgres;

--
-- Name: chatbot_decision_trees; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chatbot_decision_trees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contractor_id uuid,
    name character varying(200) NOT NULL,
    description text,
    trigger_keywords text[] DEFAULT '{}'::text[],
    is_active boolean DEFAULT true,
    usage_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.chatbot_decision_trees OWNER TO postgres;

--
-- Name: chatbot_faq_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chatbot_faq_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contractor_id uuid,
    name character varying(100) NOT NULL,
    slug character varying(100) NOT NULL,
    description text,
    icon character varying(50) DEFAULT 'help'::character varying,
    color character varying(7) DEFAULT '#3b82f6'::character varying,
    sort_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.chatbot_faq_categories OWNER TO postgres;

--
-- Name: chatbot_knowledge_base; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chatbot_knowledge_base (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contractor_id uuid,
    category_id uuid,
    question text NOT NULL,
    answer text NOT NULL,
    keywords text[] DEFAULT '{}'::text[],
    priority integer DEFAULT 0,
    is_active boolean DEFAULT true,
    usage_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    search_vector tsvector
);


ALTER TABLE public.chatbot_knowledge_base OWNER TO postgres;

--
-- Name: chatbot_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chatbot_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    sender_type character varying(10) NOT NULL,
    message_type character varying(20) DEFAULT 'text'::character varying,
    content text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chatbot_messages_message_type_check CHECK (((message_type)::text = ANY ((ARRAY['text'::character varying, 'options'::character varying, 'faq_list'::character varying, 'escalation'::character varying, 'suggestions'::character varying])::text[]))),
    CONSTRAINT chatbot_messages_sender_type_check CHECK (((sender_type)::text = ANY ((ARRAY['user'::character varying, 'bot'::character varying, 'system'::character varying])::text[])))
);


ALTER TABLE public.chatbot_messages OWNER TO postgres;

--
-- Name: contractors; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.contractors (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(100) NOT NULL,
    email character varying(255),
    phone character varying(50),
    address text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.contractors OWNER TO postgres;

--
-- Name: TABLE contractors; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.contractors IS 'Megbízó cégek (multi-tenant architektúra)';


--
-- Name: cost_centers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cost_centers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    contractor_id uuid,
    name character varying(255) NOT NULL,
    code character varying(50),
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.cost_centers OWNER TO postgres;

--
-- Name: documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.documents (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tenant_id uuid,
    employee_id uuid,
    uploaded_by uuid,
    title character varying(255) NOT NULL,
    description text,
    file_path character varying(500) NOT NULL,
    file_name character varying(255) NOT NULL,
    file_size integer,
    mime_type character varying(100),
    document_type character varying(100),
    is_private boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    deleted_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.documents OWNER TO postgres;

--
-- Name: email_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.email_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    contractor_id uuid,
    to_email character varying(255) NOT NULL,
    subject character varying(500),
    body text,
    status character varying(50) NOT NULL,
    error_message text,
    sent_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.email_logs OWNER TO postgres;

--
-- Name: employee_documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.employee_documents (
    id integer NOT NULL,
    employee_id uuid NOT NULL,
    document_type character varying(30) DEFAULT 'other'::character varying NOT NULL,
    file_name character varying(255) NOT NULL,
    file_path character varying(500) NOT NULL,
    file_size integer DEFAULT 0,
    mime_type character varying(100),
    thumbnail_path character varying(500),
    uploaded_by uuid,
    uploaded_at timestamp with time zone DEFAULT now(),
    notes text,
    scanned_file_path character varying(500)
);


ALTER TABLE public.employee_documents OWNER TO postgres;

--
-- Name: employee_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.employee_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.employee_documents_id_seq OWNER TO postgres;

--
-- Name: employee_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.employee_documents_id_seq OWNED BY public.employee_documents.id;


--
-- Name: employee_notes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.employee_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    created_by uuid,
    note_type character varying(20) DEFAULT 'general'::character varying NOT NULL,
    title character varying(255) NOT NULL,
    content text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT employee_notes_note_type_check CHECK (((note_type)::text = ANY (ARRAY[('general'::character varying)::text, ('warning'::character varying)::text, ('positive'::character varying)::text, ('document'::character varying)::text])))
);


ALTER TABLE public.employee_notes OWNER TO postgres;

--
-- Name: employee_status_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.employee_status_types (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(100) NOT NULL,
    slug character varying(100) NOT NULL,
    description text,
    color character varying(7)
);


ALTER TABLE public.employee_status_types OWNER TO postgres;

--
-- Name: employees; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.employees (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    contractor_id uuid,
    user_id uuid,
    organizational_unit_id uuid,
    employee_number character varying(50),
    status_id uuid,
    "position" character varying(255),
    start_date date,
    end_date date,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    accommodation_id uuid,
    first_name character varying(100),
    last_name character varying(100),
    gender character varying(10),
    birth_date date,
    birth_place character varying(255),
    mothers_name character varying(255),
    tax_id character varying(50),
    passport_number character varying(100),
    social_security_number character varying(50),
    marital_status character varying(20),
    arrival_date date,
    visa_expiry date,
    room_number character varying(50),
    bank_account character varying(100),
    workplace character varying(255),
    permanent_address_zip character varying(20),
    permanent_address_country character varying(100),
    permanent_address_county character varying(100),
    permanent_address_city character varying(255),
    permanent_address_street character varying(255),
    permanent_address_number character varying(50),
    company_name character varying(255),
    company_email character varying(255),
    company_phone character varying(50),
    room_id uuid,
    profile_photo_url character varying(500) DEFAULT NULL::character varying,
    CONSTRAINT employees_gender_check CHECK (((gender)::text = ANY ((ARRAY['male'::character varying, 'female'::character varying, 'other'::character varying])::text[]))),
    CONSTRAINT employees_marital_status_check CHECK (((marital_status)::text = ANY ((ARRAY['single'::character varying, 'married'::character varying, 'divorced'::character varying, 'widowed'::character varying])::text[])))
);


ALTER TABLE public.employees OWNER TO postgres;

--
-- Name: google_calendar_sync_map; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.google_calendar_sync_map (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    local_event_id uuid,
    local_event_type character varying(30),
    google_event_id character varying(255),
    google_calendar_id character varying(255),
    sync_direction character varying(10) NOT NULL,
    last_synced_at timestamp with time zone DEFAULT now(),
    local_updated_at timestamp with time zone,
    google_updated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT google_calendar_sync_map_local_event_type_check CHECK (((local_event_type)::text = ANY (ARRAY[('shift'::character varying)::text, ('medical_appointment'::character varying)::text, ('personal_event'::character varying)::text]))),
    CONSTRAINT google_calendar_sync_map_sync_direction_check CHECK (((sync_direction)::text = ANY (ARRAY[('outbound'::character varying)::text, ('inbound'::character varying)::text])))
);


ALTER TABLE public.google_calendar_sync_map OWNER TO postgres;

--
-- Name: google_calendar_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.google_calendar_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    token_expiry timestamp with time zone,
    google_email character varying(255),
    calendar_id character varying(255) DEFAULT 'primary'::character varying,
    webhook_channel_id character varying(255),
    webhook_resource_id character varying(255),
    webhook_expiry timestamp with time zone,
    last_sync_at timestamp with time zone,
    sync_enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.google_calendar_tokens OWNER TO postgres;

--
-- Name: medical_appointments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.medical_appointments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    appointment_date date NOT NULL,
    appointment_time time without time zone,
    doctor_name character varying(255),
    clinic_location character varying(255),
    appointment_type character varying(20) NOT NULL,
    notes text,
    reminder_sent boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT medical_appointments_appointment_type_check CHECK (((appointment_type)::text = ANY (ARRAY[('general'::character varying)::text, ('specialist'::character varying)::text, ('emergency'::character varying)::text, ('dental'::character varying)::text, ('eye'::character varying)::text, ('other'::character varying)::text])))
);


ALTER TABLE public.medical_appointments OWNER TO postgres;

--
-- Name: notification_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notification_templates (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    contractor_id uuid,
    name character varying(255) NOT NULL,
    slug character varying(100) NOT NULL,
    subject character varying(500),
    body_html text,
    body_text text,
    event_type character varying(100) NOT NULL,
    language character varying(5) DEFAULT 'hu'::character varying,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    available_variables jsonb DEFAULT '[]'::jsonb
);


ALTER TABLE public.notification_templates OWNER TO postgres;

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifications (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    contractor_id uuid,
    user_id uuid,
    type character varying(50) NOT NULL,
    title character varying(255),
    message text NOT NULL,
    data jsonb,
    is_read boolean DEFAULT false,
    read_at timestamp without time zone,
    sent_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    link character varying(500)
);


ALTER TABLE public.notifications OWNER TO postgres;

--
-- Name: TABLE notifications; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.notifications IS 'Összes értesítés (push, email, in-app)';


--
-- Name: organizational_units; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.organizational_units (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    contractor_id uuid,
    name character varying(255) NOT NULL,
    parent_id uuid,
    manager_id uuid,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.organizational_units OWNER TO postgres;

--
-- Name: permissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.permissions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(100) NOT NULL,
    slug character varying(100) NOT NULL,
    module character varying(50) NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    display_name character varying(200),
    action character varying(50)
);


ALTER TABLE public.permissions OWNER TO postgres;

--
-- Name: personal_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.personal_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    event_date date NOT NULL,
    event_time time without time zone,
    event_type character varying(20) NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    all_day boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT personal_events_event_type_check CHECK (((event_type)::text = ANY (ARRAY[('birthday'::character varying)::text, ('meeting'::character varying)::text, ('reminder'::character varying)::text, ('holiday'::character varying)::text, ('other'::character varying)::text])))
);


ALTER TABLE public.personal_events OWNER TO postgres;

--
-- Name: priorities; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.priorities (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(100) NOT NULL,
    slug character varying(100) NOT NULL,
    level integer NOT NULL,
    color character varying(7),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.priorities OWNER TO postgres;

--
-- Name: projects; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.projects (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    contractor_id uuid,
    name character varying(255) NOT NULL,
    code character varying(50),
    cost_center_id uuid,
    manager_id uuid,
    start_date date,
    end_date date,
    budget numeric(15,2),
    status character varying(50) DEFAULT 'active'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.projects OWNER TO postgres;

--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.role_permissions (
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL
);


ALTER TABLE public.role_permissions OWNER TO postgres;

--
-- Name: roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.roles (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(100) NOT NULL,
    slug character varying(100) NOT NULL,
    description text,
    is_system boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.roles OWNER TO postgres;

--
-- Name: TABLE roles; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.roles IS 'Szerepkörök a jogosultságkezeléshez';


--
-- Name: scheduled_report_runs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.scheduled_report_runs (
    id integer NOT NULL,
    scheduled_report_id integer NOT NULL,
    status character varying(20) DEFAULT 'running'::character varying NOT NULL,
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    records_count integer DEFAULT 0,
    file_size integer DEFAULT 0,
    recipients_count integer DEFAULT 0,
    error_message text
);


ALTER TABLE public.scheduled_report_runs OWNER TO postgres;

--
-- Name: scheduled_report_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.scheduled_report_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.scheduled_report_runs_id_seq OWNER TO postgres;

--
-- Name: scheduled_report_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.scheduled_report_runs_id_seq OWNED BY public.scheduled_report_runs.id;


--
-- Name: scheduled_reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.scheduled_reports (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    report_type character varying(50) NOT NULL,
    schedule_type character varying(20) NOT NULL,
    schedule_time time without time zone DEFAULT '08:00:00'::time without time zone NOT NULL,
    day_of_week integer,
    day_of_month integer,
    recipients text[] DEFAULT '{}'::text[] NOT NULL,
    filters jsonb DEFAULT '[]'::jsonb,
    format character varying(10) DEFAULT 'excel'::character varying NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    next_run_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.scheduled_reports OWNER TO postgres;

--
-- Name: scheduled_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.scheduled_reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.scheduled_reports_id_seq OWNER TO postgres;

--
-- Name: scheduled_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.scheduled_reports_id_seq OWNED BY public.scheduled_reports.id;


--
-- Name: shifts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.shifts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id uuid NOT NULL,
    shift_date date NOT NULL,
    shift_start_time time without time zone NOT NULL,
    shift_end_time time without time zone NOT NULL,
    shift_type character varying(20) NOT NULL,
    location character varying(255),
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT shifts_shift_type_check CHECK (((shift_type)::text = ANY (ARRAY[('morning'::character varying)::text, ('afternoon'::character varying)::text, ('night'::character varying)::text, ('full_day'::character varying)::text])))
);


ALTER TABLE public.shifts OWNER TO postgres;

--
-- Name: ticket_attachments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ticket_attachments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    ticket_id uuid,
    comment_id uuid,
    uploaded_by uuid,
    file_path character varying(500) NOT NULL,
    file_name character varying(255) NOT NULL,
    file_size integer,
    mime_type character varying(100),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.ticket_attachments OWNER TO postgres;

--
-- Name: ticket_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ticket_categories (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    contractor_id uuid,
    name character varying(100) NOT NULL,
    slug character varying(100) NOT NULL,
    description text,
    color character varying(7),
    icon character varying(50),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.ticket_categories OWNER TO postgres;

--
-- Name: ticket_comments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ticket_comments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    ticket_id uuid,
    user_id uuid,
    comment text NOT NULL,
    is_internal boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.ticket_comments OWNER TO postgres;

--
-- Name: ticket_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ticket_history (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    ticket_id uuid,
    user_id uuid,
    action character varying(100) NOT NULL,
    field_name character varying(100),
    old_value text,
    new_value text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.ticket_history OWNER TO postgres;

--
-- Name: TABLE ticket_history; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.ticket_history IS 'Teljes audit log minden ticket módosításról';


--
-- Name: ticket_number_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ticket_number_seq
    START WITH 1004
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ticket_number_seq OWNER TO postgres;

--
-- Name: ticket_statuses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ticket_statuses (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(100) NOT NULL,
    slug character varying(100) NOT NULL,
    description text,
    color character varying(7),
    order_index integer DEFAULT 0,
    is_final boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.ticket_statuses OWNER TO postgres;

--
-- Name: tickets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tickets (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    contractor_id uuid,
    ticket_number character varying(50) NOT NULL,
    title character varying(500) NOT NULL,
    description text,
    category_id uuid,
    status_id uuid,
    priority_id uuid,
    created_by uuid,
    assigned_to uuid,
    resolved_at timestamp without time zone,
    closed_at timestamp without time zone,
    due_date timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.tickets OWNER TO postgres;

--
-- Name: TABLE tickets; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.tickets IS 'Hibajegyek / bejelentések';


--
-- Name: user_permissions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_permissions (
    user_id uuid NOT NULL,
    permission_id uuid NOT NULL,
    granted boolean DEFAULT true,
    granted_by uuid,
    granted_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_permissions OWNER TO postgres;

--
-- Name: user_preferences; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_preferences (
    user_id uuid NOT NULL,
    preferences jsonb DEFAULT '{}'::jsonb,
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.user_preferences OWNER TO postgres;

--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_roles (
    user_id uuid NOT NULL,
    role_id uuid NOT NULL,
    contractor_id uuid NOT NULL,
    assigned_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_roles OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    contractor_id uuid,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    phone character varying(50),
    is_active boolean DEFAULT true,
    is_email_verified boolean DEFAULT false,
    last_login timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    role_id uuid
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: TABLE users; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.users IS 'Összes felhasználó (minden tenant)';


--
-- Name: video_views; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.video_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    video_id uuid NOT NULL,
    watched_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    completed boolean DEFAULT false NOT NULL
);


ALTER TABLE public.video_views OWNER TO postgres;

--
-- Name: videos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.videos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    url character varying(1000) NOT NULL,
    thumbnail_url character varying(1000),
    category character varying(50) DEFAULT 'ceg_info'::character varying NOT NULL,
    duration integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.videos OWNER TO postgres;

--
-- Name: employee_documents id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_documents ALTER COLUMN id SET DEFAULT nextval('public.employee_documents_id_seq'::regclass);


--
-- Name: scheduled_report_runs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scheduled_report_runs ALTER COLUMN id SET DEFAULT nextval('public.scheduled_report_runs_id_seq'::regclass);


--
-- Name: scheduled_reports id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scheduled_reports ALTER COLUMN id SET DEFAULT nextval('public.scheduled_reports_id_seq'::regclass);


--
-- Data for Name: accommodation_contractors; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.accommodation_contractors (id, accommodation_id, contractor_id, check_in, check_out, notes, created_at) FROM stdin;
977639ad-c51c-46f6-8047-4df85fea5e36	ce612502-f8b9-4988-bb46-295d4f9cff6b	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	2026-02-21	\N	A épület bérlet	2026-02-21 09:28:36.093901
0c63e0a6-e7d4-43cf-9e5d-1dc13d9c4b6c	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	2026-02-21	\N	B épület bérlet	2026-02-21 09:28:36.093901
4442f6e2-a264-43d2-a6ac-a60b86f15112	eca0550a-f596-4937-bcd5-37b5bf867db7	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	2026-02-21	\N	C épület bérlet	2026-02-21 09:28:36.093901
\.


--
-- Data for Name: accommodation_rooms; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.accommodation_rooms (id, accommodation_id, room_number, floor, beds, room_type, notes, is_active, created_at, updated_at) FROM stdin;
b4888603-1870-4196-ad56-4c55471e98d7	ce612502-f8b9-4988-bb46-295d4f9cff6b	101	1	2	standard	\N	t	2026-02-21 09:28:36.093901+00	2026-02-21 09:28:36.093901+00
7c65ce89-c2e7-4a79-8cac-311051629c78	ce612502-f8b9-4988-bb46-295d4f9cff6b	102	1	2	standard	\N	t	2026-02-21 09:28:36.093901+00	2026-02-21 09:28:36.093901+00
0d08cbc6-b692-4e7c-b269-f47eb41d996a	ce612502-f8b9-4988-bb46-295d4f9cff6b	103	1	2	standard	\N	t	2026-02-21 09:28:36.093901+00	2026-02-21 09:28:36.093901+00
35af414c-1808-4056-8fcf-0bdfd33b9862	ce612502-f8b9-4988-bb46-295d4f9cff6b	201	2	2	standard	\N	t	2026-02-21 09:28:36.093901+00	2026-02-21 09:28:36.093901+00
94eda3e8-6e8f-45df-a5f2-9690f2c19ccf	ce612502-f8b9-4988-bb46-295d4f9cff6b	202	2	2	standard	\N	t	2026-02-21 09:28:36.093901+00	2026-02-21 09:28:36.093901+00
d24a0a6b-de8f-4afc-8fc3-9ba31235ad91	ce612502-f8b9-4988-bb46-295d4f9cff6b	203	2	2	standard	\N	t	2026-02-21 09:28:36.093901+00	2026-02-21 09:28:36.093901+00
02137110-1f01-4ea8-9652-cb3057178ec0	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	101	1	2	standard	\N	t	2026-02-21 09:28:36.093901+00	2026-02-21 09:28:36.093901+00
13ad850c-f7c6-4b1c-8119-b2a785a56673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	102	1	2	standard	\N	t	2026-02-21 09:28:36.093901+00	2026-02-21 09:28:36.093901+00
2e438423-b276-4f43-a8c4-2fe3ad297a8a	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	201	2	2	standard	\N	t	2026-02-21 09:28:36.093901+00	2026-02-21 09:28:36.093901+00
acac124f-7479-48fa-a1ac-b7d62b6489fc	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	202	2	2	standard	\N	t	2026-02-21 09:28:36.093901+00	2026-02-21 09:28:36.093901+00
2779c0ef-9d97-470f-839c-f818469d43d6	eca0550a-f596-4937-bcd5-37b5bf867db7	101	1	2	standard	\N	t	2026-02-21 09:28:36.093901+00	2026-02-21 09:28:36.093901+00
85428cf6-c6fc-4221-bca5-a397b4d198d4	eca0550a-f596-4937-bcd5-37b5bf867db7	102	1	2	standard	\N	t	2026-02-21 09:28:36.093901+00	2026-02-21 09:28:36.093901+00
acfc75f8-6ffd-4fc4-aaf4-e51409068b30	eca0550a-f596-4937-bcd5-37b5bf867db7	201	2	2	standard	\N	t	2026-02-21 09:28:36.093901+00	2026-02-21 09:28:36.093901+00
\.


--
-- Data for Name: accommodation_tenants; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.accommodation_tenants (id, accommodation_id, contractor_id, check_in, check_out, notes, created_at) FROM stdin;
\.


--
-- Data for Name: accommodations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.accommodations (id, name, address, type, capacity, current_contractor_id, status, monthly_rent, notes, is_active, created_at, updated_at) FROM stdin;
ce612502-f8b9-4988-bb46-295d4f9cff6b	A épület	1138 Budapest, Váci út 15.	dormitory	12	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	occupied	450000.00	\N	t	2026-02-21 09:28:36.093901	2026-02-21 09:28:36.093901
b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	B épület	1138 Budapest, Váci út 17.	dormitory	8	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	occupied	350000.00	\N	t	2026-02-21 09:28:36.093901	2026-02-21 09:28:36.093901
eca0550a-f596-4937-bcd5-37b5bf867db7	C épület	1139 Budapest, Frangepán utca 8.	dormitory	6	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	available	280000.00	\N	t	2026-02-21 09:28:36.093901	2026-02-21 09:28:36.093901
\.


--
-- Data for Name: activity_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.activity_logs (id, user_id, entity_type, entity_id, action, changes, metadata, ip_address, created_at) FROM stdin;
\.


--
-- Data for Name: chatbot_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.chatbot_config (id, contractor_id, welcome_message, fallback_message, escalation_message, keyword_threshold, is_active, created_at, updated_at) FROM stdin;
cf1b6795-4057-4f33-ac49-f5f9afe6bcec	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	Sajnos nem találtam megfelelő választ a kérdésére. Szeretné, ha továbbítanám kérdését egy munkatársunknak?	Kérdését továbbítottam munkatársainknak. Hamarosan felvesszük Önnel a kapcsolatot egy hibajegyen keresztül.	1	t	2026-02-21 09:28:36.093901+00	2026-02-21 09:28:36.093901+00
\.


--
-- Data for Name: chatbot_conversations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.chatbot_conversations (id, contractor_id, user_id, title, status, current_tree_id, current_node_id, escalation_ticket_id, created_at, updated_at, closed_at, resolution_type) FROM stdin;
f03a6225-35c5-4ecf-b915-e917e444e839	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	Hogyan tudok wifi-hez csatlakozni?	escalated	\N	\N	b0a5d45a-37a9-4e4f-b229-21f91195e1a4	2026-02-21 09:31:46.42104+00	2026-02-21 09:32:32.322162+00	\N	\N
0650cba3-c758-4866-8ca6-a2c3ee078d31	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	Új beszélgetés	active	\N	\N	\N	2026-02-21 10:51:01.449792+00	2026-02-21 10:51:01.449792+00	\N	\N
c8510bda-5f57-44a4-8e2a-f18bad3f3ff1	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	Szállás	active	\N	\N	\N	2026-02-21 10:51:01.436705+00	2026-02-21 10:51:05.866119+00	\N	\N
604ac623-51fd-4a70-9383-0a755d3c56e4	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	Új beszélgetés	active	\N	\N	\N	2026-02-21 11:07:45.596634+00	2026-02-21 11:07:45.596634+00	\N	\N
0a14a0e1-e7e5-470c-b2af-bb2d6bfbe29a	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	szia!	active	\N	\N	\N	2026-02-21 11:07:45.581223+00	2026-02-21 11:07:49.683827+00	\N	\N
eb4686e1-e796-4e1a-a2fd-8188db52ae67	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	Új beszélgetés	active	\N	\N	\N	2026-02-21 11:19:08.289799+00	2026-02-21 11:19:08.289799+00	\N	\N
c4e9470f-a9a2-4932-b194-d36f1af1c392	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	hello	active	\N	\N	\N	2026-02-21 11:19:08.275845+00	2026-02-21 11:19:15.71584+00	\N	\N
8fb8f55c-aa85-4977-bd23-68e4244cad52	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	Új beszélgetés	active	\N	\N	\N	2026-02-21 11:25:38.152287+00	2026-02-21 11:25:38.152287+00	\N	\N
d728fe61-5ea7-4584-abba-fce21f71ca05	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	Új beszélgetés	active	\N	\N	\N	2026-02-21 11:25:38.18254+00	2026-02-21 11:25:38.18254+00	\N	\N
05836bda-ec90-4572-a627-2d714baca609	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	Új beszélgetés	active	\N	\N	\N	2026-02-21 11:25:59.964448+00	2026-02-21 11:25:59.964448+00	\N	\N
016f9ac8-d74f-4900-8dd6-b091a4554a48	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	Új beszélgetés	active	\N	\N	\N	2026-02-21 11:25:59.966565+00	2026-02-21 11:25:59.966565+00	\N	\N
f0e8b7ba-76e1-4f5b-8934-c2185dfe8df9	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	Új beszélgetés	active	\N	\N	\N	2026-02-21 11:27:45.571922+00	2026-02-21 11:27:45.571922+00	\N	\N
6eeae944-9759-4642-b809-ad2ce2c6490b	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	Új beszélgetés	active	\N	\N	\N	2026-02-21 11:27:45.575256+00	2026-02-21 11:27:45.575256+00	\N	\N
2eb9b6a5-669a-4ca7-b1b7-6cf9597c9229	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	Új beszélgetés	active	\N	\N	\N	2026-02-21 11:36:30.430991+00	2026-02-21 11:36:30.430991+00	\N	\N
722c27e8-0199-4617-b0be-7d0a631cbe42	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	Új beszélgetés	active	\N	\N	\N	2026-02-21 11:37:56.325351+00	2026-02-21 11:37:56.325351+00	\N	\N
89dcf075-73c2-4b74-86d7-5e16068d9dba	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	Új beszélgetés	active	\N	\N	\N	2026-02-21 11:37:56.325744+00	2026-02-21 11:37:56.325744+00	\N	\N
2c42836f-0666-4346-a6cc-6d51f509ce9c	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	Új beszélgetés	active	\N	\N	\N	2026-02-21 12:21:37.848551+00	2026-02-21 12:21:37.848551+00	\N	\N
1ff2bfba-d9e0-4513-9632-11abf9677341	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	Új beszélgetés	active	\N	\N	\N	2026-02-21 12:21:37.848836+00	2026-02-21 12:21:37.848836+00	\N	\N
1854bcf0-578b-4845-9e62-edd8f01e8d0d	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	Új beszélgetés	active	\N	\N	\N	2026-02-21 12:23:20.147505+00	2026-02-21 12:23:20.147505+00	\N	\N
b21b66c6-89e9-45d6-9f43-49b3b7f5ed49	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	Új beszélgetés	active	\N	\N	\N	2026-02-21 12:23:20.164452+00	2026-02-21 12:23:20.164452+00	\N	\N
a2d249c2-5f7f-458f-a51e-711e268e047d	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	Új beszélgetés	active	\N	\N	\N	2026-02-21 12:41:38.103532+00	2026-02-21 12:41:38.103532+00	\N	\N
c4f80531-1e3f-493d-add5-e1c32281d277	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	Új beszélgetés	active	\N	\N	\N	2026-02-21 12:41:38.12023+00	2026-02-21 12:41:38.12023+00	\N	\N
34e3bf8a-9638-4740-8bbb-7a71967f2c7e	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	eb3c7373-4de4-4645-a83b-22c56452b288	szabads�g	active	\N	\N	\N	2026-02-21 13:24:44.429566+00	2026-02-21 13:32:50.144802+00	\N	\N
a21f3fea-6830-4ce3-be28-b6565acba514	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	eb3c7373-4de4-4645-a83b-22c56452b288	Hogyan kérhetek szabadságot?	closed	\N	\N	\N	2026-02-21 13:35:14.79185+00	2026-02-21 13:35:14.887239+00	2026-02-21 13:35:14.887239+00	\N
56382e4b-f7c4-4e07-9189-7c670998a865	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	eb3c7373-4de4-4645-a83b-22c56452b288	Suggestion test	active	\N	\N	\N	2026-02-21 13:35:14.897205+00	2026-02-21 13:35:14.897205+00	\N	\N
495e9181-20ae-45ed-be79-cf5c990dac81	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	eb3c7373-4de4-4645-a83b-22c56452b288	Suggestion test 2	active	\N	\N	\N	2026-02-21 13:35:33.666533+00	2026-02-21 13:35:33.666533+00	\N	\N
aceb0b2e-aad0-4b6d-9408-b65d77313749	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	eb3c7373-4de4-4645-a83b-22c56452b288	Hogyan kérhetek szabadságot?	closed	\N	\N	\N	2026-02-21 13:58:23.854187+00	2026-02-21 13:58:24.064675+00	2026-02-21 13:58:24.064675+00	resolved
8b9b325b-27f8-4323-bf18-7e6b8a64aaa3	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	eb3c7373-4de4-4645-a83b-22c56452b288	Suggestion test	active	\N	\N	\N	2026-02-21 13:58:24.078864+00	2026-02-21 13:58:24.078864+00	\N	\N
ef73402b-dabb-448d-a1ad-713480862d35	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	eb3c7373-4de4-4645-a83b-22c56452b288	test message 1	active	\N	\N	\N	2026-02-21 13:58:24.528986+00	2026-02-21 13:58:24.548628+00	\N	\N
7f7df8f5-0d1b-4ec4-bd68-261f9e6349b7	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	eb3c7373-4de4-4645-a83b-22c56452b288	szabadsg igenyles	active	\N	\N	\N	2026-02-21 14:15:30.597931+00	2026-02-21 14:15:30.639189+00	\N	\N
aa5145db-4053-4682-874e-3804b8e6a4ed	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	eb3c7373-4de4-4645-a83b-22c56452b288	betegseg jelentes	active	\N	\N	\N	2026-02-21 14:18:03.546029+00	2026-02-21 14:18:03.597869+00	\N	\N
095bd56a-3b58-4539-8c6c-30a6287ed7ca	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	eb3c7373-4de4-4645-a83b-22c56452b288	szallas szabalyai	active	\N	\N	\N	2026-02-21 14:19:21.367383+00	2026-02-21 14:19:21.396652+00	\N	\N
02cd55fb-1427-48ca-85ab-b6e8f74cc1e0	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	eb3c7373-4de4-4645-a83b-22c56452b288	fizetes mennyi	active	\N	\N	\N	2026-02-21 14:20:28.306752+00	2026-02-21 14:20:28.339022+00	\N	\N
\.


--
-- Data for Name: chatbot_decision_nodes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.chatbot_decision_nodes (id, tree_id, parent_id, node_type, content, sort_order, metadata, created_at, updated_at) FROM stdin;
77c5f1eb-8f3e-4090-9677-46fcece37db4	185bace7-7467-4833-af6f-4891fe5132a7	\N	root	Milyen jellegű problémát szeretne bejelenteni?	0	{}	2026-02-21 09:28:36.093901+00	2026-02-21 09:28:36.093901+00
ef699283-9e36-49ee-b02d-afdc9f8b83d3	185bace7-7467-4833-af6f-4891fe5132a7	77c5f1eb-8f3e-4090-9677-46fcece37db4	option	Vízszerelés (csapok, csövek, WC)	1	{}	2026-02-21 09:28:36.093901+00	2026-02-21 09:28:36.093901+00
7b31ddba-12f3-4185-a2fb-f2297bc1bb28	185bace7-7467-4833-af6f-4891fe5132a7	77c5f1eb-8f3e-4090-9677-46fcece37db4	option	Villanyszerelés (áram, lámpa, konnektor)	2	{}	2026-02-21 09:28:36.093901+00	2026-02-21 09:28:36.093901+00
60a18378-1b88-4acc-8663-7c20873cf078	185bace7-7467-4833-af6f-4891fe5132a7	77c5f1eb-8f3e-4090-9677-46fcece37db4	option	Fűtés / Klíma probléma	3	{}	2026-02-21 09:28:36.093901+00	2026-02-21 09:28:36.093901+00
2633780d-ab6f-48ce-af95-bfb2e480d863	185bace7-7467-4833-af6f-4891fe5132a7	ef699283-9e36-49ee-b02d-afdc9f8b83d3	answer	Vízszerelési problémáját rögzítettük. Kérjük, zárja el a legközelebbi főcsapot, ha vízszivárgást észlel. Hibajegy automatikusan létrehozva, szervizünk 24 órán belül jelentkezik.	0	{}	2026-02-21 09:28:36.093901+00	2026-02-21 09:28:36.093901+00
ba307400-0246-471b-a5e5-7aba0bccb818	185bace7-7467-4833-af6f-4891fe5132a7	7b31ddba-12f3-4185-a2fb-f2297bc1bb28	answer	Villanyszerelési problémáját rögzítettük. Kérjük, ne nyúljon a hibás berendezéshez! Hibajegy automatikusan létrehozva, villanyszervizünk hamarosan jelentkezik.	0	{}	2026-02-21 09:28:36.093901+00	2026-02-21 09:28:36.093901+00
1caf52d7-4c78-4259-a3d6-78f88b9cf903	185bace7-7467-4833-af6f-4891fe5132a7	60a18378-1b88-4acc-8663-7c20873cf078	answer	Fűtés/klíma problémáját rögzítettük. Kérjük, ellenőrizze a termosztát beállításait. Hibajegy automatikusan létrehozva, karbantartónk 48 órán belül orvossolja a problémát.	0	{}	2026-02-21 09:28:36.093901+00	2026-02-21 09:28:36.093901+00
\.


--
-- Data for Name: chatbot_decision_trees; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.chatbot_decision_trees (id, contractor_id, name, description, trigger_keywords, is_active, usage_count, created_at, updated_at) FROM stdin;
185bace7-7467-4833-af6f-4891fe5132a7	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	Szállási probléma bejelentés	Szállással kapcsolatos problémák bejelentésének lépésről-lépésre vezetése	{problema,bejelentes,hiba,szallas,panasz}	t	1	2026-02-21 09:28:36.093901+00	2026-02-21 14:18:03.581341+00
\.


--
-- Data for Name: chatbot_faq_categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.chatbot_faq_categories (id, contractor_id, name, slug, description, icon, color, sort_order, is_active, created_at, updated_at) FROM stdin;
2d299ec4-aab3-4010-b641-a26766da5c4e	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	HR Kérdések	hr	Munkaügyi és HR kérdések	people	#3b82f6	1	t	2026-02-21 09:28:36.093901+00	2026-02-21 09:28:36.093901+00
e1b1783f-ba60-411c-99ad-6257a015706d	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	Szállás	szallas	Szállással kapcsolatos kérdések	home	#10b981	2	t	2026-02-21 09:28:36.093901+00	2026-02-21 09:28:36.093901+00
de7e5d82-6982-42eb-ba52-19502c2743a6	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	Technikai	technikai	Technikai és IT kérdések	build	#f59e0b	3	t	2026-02-21 09:28:36.093901+00	2026-02-21 09:28:36.093901+00
36d7e305-19fd-4e63-b7d6-5833ae6bd45f	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	Általános	altalanos	Általános információk	info	#8b5cf6	4	t	2026-02-21 09:28:36.093901+00	2026-02-21 09:28:36.093901+00
\.


--
-- Data for Name: chatbot_knowledge_base; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.chatbot_knowledge_base (id, contractor_id, category_id, question, answer, keywords, priority, is_active, usage_count, created_at, updated_at, search_vector) FROM stdin;
47dc4f08-5e72-4d11-9e83-f44c448f3bd4	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	2d299ec4-aab3-4010-b641-a26766da5c4e	Mi a munkaidő beosztás?	A munkaidő beosztás a Naptár menüben található. Általában hétfőtől péntekig, 8:00-16:00 óráig. Műszakbeosztás esetén a vezető értesíti Önt.	{munkaid,muoszak,beosztas,ora,mikor,schedule}	4	t	5	2026-02-21 09:28:36.093901+00	2026-02-21 15:02:52.727138+00	'-16':23B '00':22B,24B '8':21B 'a':2A,11B,14B,28B 'beosztas':7A 'beosztás':4A,13B 'esetén':27B 'hétfőtől':19B 'menüben':16B 'mi':1A 'mikor':9A 'munkaid':5A 'munkaidő':3A,12B 'muoszak':6A 'műszakbeosztás':26B 'naptár':15B 'ora':8A 'péntekig':20B 'schedule':10A 'található':17B 'vezető':29B 'általában':18B 'értesíti':30B 'óráig':25B 'önt':31B
b938f264-f174-4fdf-a4dd-cd821d376623	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	36d7e305-19fd-4e63-b7d6-5833ae6bd45f	Kihez fordulhatok sürgős esetben?	Sürgős esetben hívja az alábbi számokat: Szálláskezelő: +36 30 111 2233, Mentők: 104, Tűzoltók: 105, Rendőrség: 107.	{surgos,segitseg,veszely,baj,telefon,hivas,emergency}	5	t	0	2026-02-21 09:28:36.093901+00	2026-02-21 15:02:52.727138+00	'+36':19B '104':24B '105':26B '107':28B '111':21B '2233':22B '30':20B 'alábbi':16B 'az':15B 'baj':8A 'emergency':11A 'esetben':4A,13B 'fordulhatok':2A 'hivas':10A 'hívja':14B 'kihez':1A 'mentők':23B 'rendőrség':27B 'segitseg':6A 'surgos':5A 'szálláskezelő':18B 'számokat':17B 'sürgős':3A,12B 'telefon':9A 'tűzoltók':25B 'veszely':7A
8572bcef-7c1a-4f0e-87df-772c06a397be	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	de7e5d82-6982-42eb-ba52-19502c2743a6	Hogyan csatlakozom a WiFi hálózathoz?	A WiFi hálózat neve: "HS-Guest". A jelszó a szálláson kihelyezett tájékoztatóban található, vagy kérdezze meg a szálláskezelőt.	{wifi,internet,halozat,jelszo,net,network}	4	t	0	2026-02-21 09:28:36.093901+00	2026-02-21 15:02:52.727138+00	'a':3A,12B,19B,21B,29B 'csatlakozom':2A 'guest':18B 'halozat':8A 'hogyan':1A 'hs':17B 'hs-guest':16B 'hálózat':14B 'hálózathoz':5A 'internet':7A 'jelszo':9A 'jelszó':20B 'kihelyezett':23B 'kérdezze':27B 'meg':28B 'net':10A 'network':11A 'neve':15B 'szálláskezelőt':30B 'szálláson':22B 'található':25B 'tájékoztatóban':24B 'vagy':26B 'wifi':4A,6A,13B
0b96c9e6-b9d7-403c-ac4b-f9994b73d35a	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	2d299ec4-aab3-4010-b641-a26766da5c4e	Hogyan kérhetek szabadságot?	Szabadság kérelmét a felettesének kell benyújtania legalább 5 munkanappal előtte. Használja a Hibajegyek menüt, és válassza a HR kategóriát.	{szabadsag,szabadnap,pihenonap,holiday,vacation}	5	t	9	2026-02-21 09:28:36.093901+00	2026-02-21 15:02:52.727138+00	'5':16B 'a':11B,20B,25B 'benyújtania':14B 'előtte':18B 'felettesének':12B 'használja':19B 'hibajegyek':21B 'hogyan':1A 'holiday':7A 'hr':26B 'kategóriát':27B 'kell':13B 'kérelmét':10B 'kérhetek':2A 'legalább':15B 'menüt':22B 'munkanappal':17B 'pihenonap':6A 'szabadnap':5A 'szabadsag':4A 'szabadság':9B 'szabadságot':3A 'vacation':8A 'válassza':24B 'és':23B
635173ed-1972-48a6-bddd-590486ddd5ca	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	e1b1783f-ba60-411c-99ad-6257a015706d	Hogyan jelenthetem a szálláson keletkezett hibát?	A szálláson észlelt hibákat a Hibajegyek menüben, Technikai kategóriában jelezheti. Kérjük, adjon részletes leírást és ha lehetséges, csatoljon fényképet.	{hiba,meghibasodas,elromlott,"nem mukodik",szallas,javitas}	5	t	2	2026-02-21 09:28:36.093901+00	2026-02-21 15:02:52.727138+00	'a':3A,14B,18B 'adjon':25B 'csatoljon':31B 'elromlott':9A 'fényképet':32B 'ha':29B 'hiba':7A 'hibajegyek':19B 'hibákat':17B 'hibát':6A 'hogyan':1A 'javitas':13A 'jelenthetem':2A 'jelezheti':23B 'kategóriában':22B 'keletkezett':5A 'kérjük':24B 'lehetséges':30B 'leírást':27B 'meghibasodas':8A 'menüben':20B 'mukodik':11A 'nem':10A 'részletes':26B 'szallas':12A 'szálláson':4A,15B 'technikai':21B 'és':28B 'észlelt':16B
031784b7-e7c5-4cb0-a746-97084814aeaa	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	Mennyi a fizetesem netto osszege?	A netto fizetesed a berszamfejtesi lapon talalhato. Kerdessel fordulj a HR osztaly fele.	{fizetes,netto,ber,fizetesi}	0	t	4	2026-02-21 14:20:06.260124+00	2026-02-21 15:02:52.727138+00	'a':2A,10B,13B,19B 'ber':8A 'berszamfejtesi':14B 'fele':22B 'fizetes':6A 'fizetesed':12B 'fizetesem':3A 'fizetesi':9A 'fordulj':18B 'hr':20B 'kerdessel':17B 'lapon':15B 'mennyi':1A 'netto':4A,7A,11B 'osszege':5A 'osztaly':21B 'talalhato':16B
de840c80-8f3b-4245-a1ca-d0b273b86abd	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	e1b1783f-ba60-411c-99ad-6257a015706d	Mik a szállás házirendjének főbb pontjai?	A szálláson tilos a dohányzás, az éjszakai csendháborítás (22:00-6:00), és a szobákba külső személyeket bevinni. Részletes házirendet a Dokumentumok menüben talál.	{hazirend,szabaly,dohany,csend,tilos,szallas}	3	t	3	2026-02-21 09:28:36.093901+00	2026-02-21 15:02:52.727138+00	'-6':23B '00':22B,24B '22':21B 'a':2A,13B,16B,26B,33B 'az':18B 'bevinni':30B 'csend':10A 'csendháborítás':20B 'dohany':9A 'dohányzás':17B 'dokumentumok':34B 'főbb':5A 'hazirend':7A 'házirendet':32B 'házirendjének':4A 'külső':28B 'menüben':35B 'mik':1A 'pontjai':6A 'részletes':31B 'szabaly':8A 'szallas':12A 'személyeket':29B 'szobákba':27B 'szállás':3A 'szálláson':14B 'talál':36B 'tilos':11A,15B 'éjszakai':19B 'és':25B
c8979872-d498-4d0e-9e53-28d7f974ec2f	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	36d7e305-19fd-4e63-b7d6-5833ae6bd45f	Hol találom a dokumentumaimat?	Az összes személyes dokumentumát (szerződés, igazolások) a Dokumentumok menüben érheti el. Ha valamely dokumentum hiányzik, jelezze az adminisztrátornak.	{dokumentum,irat,szerzodes,igazolas,papir}	3	t	0	2026-02-21 09:28:36.093901+00	2026-02-21 15:02:52.727138+00	'a':3A,16B 'adminisztrátornak':27B 'az':10B,26B 'dokumentum':5A,23B 'dokumentumaimat':4A 'dokumentumok':17B 'dokumentumát':13B 'el':20B 'ha':21B 'hiányzik':24B 'hol':1A 'igazolas':8A 'igazolások':15B 'irat':6A 'jelezze':25B 'menüben':18B 'papir':9A 'személyes':12B 'szerzodes':7A 'szerződés':14B 'találom':2A 'valamely':22B 'érheti':19B 'összes':11B
f8e19ee4-ea87-425e-b23f-df14ca4ecb8f	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	de7e5d82-6982-42eb-ba52-19502c2743a6	Nem tudok bejelentkezni az alkalmazásba	Ha bejelentkezési problémája van: 1) Ellenőrizze az email címet és jelszót 2) Próbálja meg a "Jelszó emlékeztető" funkciót 3) Ha továbbra sem sikerül, jelezze a problémát az adminisztrátornak.	{bejelentkezes,login,jelszo,"nem tudok",belep,hozzaferes}	5	t	4	2026-02-21 09:28:36.093901+00	2026-02-21 15:02:52.727138+00	'1':17B '2':24B '3':31B 'a':27B,37B 'adminisztrátornak':40B 'alkalmazásba':5A 'az':4A,19B,39B 'bejelentkezes':6A 'bejelentkezni':3A 'bejelentkezési':14B 'belep':11A 'címet':21B 'ellenőrizze':18B 'email':20B 'emlékeztető':29B 'funkciót':30B 'ha':13B,32B 'hozzaferes':12A 'jelezze':36B 'jelszo':8A 'jelszó':28B 'jelszót':23B 'login':7A 'meg':26B 'nem':1A,9A 'problémája':15B 'problémát':38B 'próbálja':25B 'sem':34B 'sikerül':35B 'továbbra':33B 'tudok':2A,10A 'van':16B 'és':22B
\.


--
-- Data for Name: chatbot_messages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.chatbot_messages (id, conversation_id, sender_type, message_type, content, metadata, created_at) FROM stdin;
750e4a83-3144-48f9-9556-f57eb71400e4	f03a6225-35c5-4ecf-b915-e917e444e839	bot	text	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	{}	2026-02-21 09:31:46.446424+00
8f2c41ba-4274-44e6-9122-d8d70c65d128	f03a6225-35c5-4ecf-b915-e917e444e839	bot	faq_list	Válasszon témát:	{"categories": [{"id": "2d299ec4-aab3-4010-b641-a26766da5c4e", "icon": "people", "name": "HR Kérdések", "slug": "hr", "color": "#3b82f6", "sort_order": 1, "description": "Munkaügyi és HR kérdések"}, {"id": "e1b1783f-ba60-411c-99ad-6257a015706d", "icon": "home", "name": "Szállás", "slug": "szallas", "color": "#10b981", "sort_order": 2, "description": "Szállással kapcsolatos kérdések"}, {"id": "de7e5d82-6982-42eb-ba52-19502c2743a6", "icon": "build", "name": "Technikai", "slug": "technikai", "color": "#f59e0b", "sort_order": 3, "description": "Technikai és IT kérdések"}, {"id": "36d7e305-19fd-4e63-b7d6-5833ae6bd45f", "icon": "info", "name": "Általános", "slug": "altalanos", "color": "#8b5cf6", "sort_order": 4, "description": "Általános információk"}]}	2026-02-21 09:31:46.453899+00
6e07b4ac-f49a-4fe6-9d9c-9451e72e8a50	f03a6225-35c5-4ecf-b915-e917e444e839	user	text	Hogyan tudok wifi-hez csatlakozni?	{}	2026-02-21 09:32:04.99271+00
02c85ba2-a375-4ade-bba4-f2074acde367	f03a6225-35c5-4ecf-b915-e917e444e839	bot	text	Ha bejelentkezési problémája van: 1) Ellenőrizze az email címet és jelszót 2) Próbálja meg a "Jelszó emlékeztető" funkciót 3) Ha továbbra sem sikerül, jelezze a problémát az adminisztrátornak.	{"kb_id": "f8e19ee4-ea87-425e-b23f-df14ca4ecb8f", "source": "knowledge_base", "question": "Nem tudok bejelentkezni az alkalmazásba"}	2026-02-21 09:32:05.022486+00
ed12f61c-5ac8-4c90-a37e-338e04c165b7	f03a6225-35c5-4ecf-b915-e917e444e839	user	text	Szabads�got szeretn�k kivenni	{}	2026-02-21 09:32:14.466514+00
da56d48e-ebcd-4836-a6b2-53b08160dd65	f03a6225-35c5-4ecf-b915-e917e444e839	bot	text	Sajnos nem találtam megfelelő választ a kérdésére. Szeretné, ha továbbítanám kérdését egy munkatársunknak?	{"source": "fallback"}	2026-02-21 09:32:14.492783+00
49aba8e2-7304-4a59-9f7a-6884ac79142c	f03a6225-35c5-4ecf-b915-e917e444e839	system	escalation	Kérdését továbbítottam munkatársainknak. Hamarosan felvesszük Önnel a kapcsolatot egy hibajegyen keresztül.	{"ticket_id": "b0a5d45a-37a9-4e4f-b229-21f91195e1a4", "ticket_number": "#1003"}	2026-02-21 09:32:32.368835+00
8de1a97e-aca7-4b5f-8de7-337128e086ab	c8510bda-5f57-44a4-8e2a-f18bad3f3ff1	bot	text	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	{}	2026-02-21 10:51:01.461831+00
efc04eb8-5afc-4f15-8c1f-e5573d85cd07	0650cba3-c758-4866-8ca6-a2c3ee078d31	bot	text	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	{}	2026-02-21 10:51:01.462352+00
74467720-5cde-4502-93b6-d1132eead2ab	0650cba3-c758-4866-8ca6-a2c3ee078d31	bot	faq_list	Válasszon témát:	{"categories": [{"id": "2d299ec4-aab3-4010-b641-a26766da5c4e", "icon": "people", "name": "HR Kérdések", "slug": "hr", "color": "#3b82f6", "sort_order": 1, "description": "Munkaügyi és HR kérdések"}, {"id": "e1b1783f-ba60-411c-99ad-6257a015706d", "icon": "home", "name": "Szállás", "slug": "szallas", "color": "#10b981", "sort_order": 2, "description": "Szállással kapcsolatos kérdések"}, {"id": "de7e5d82-6982-42eb-ba52-19502c2743a6", "icon": "build", "name": "Technikai", "slug": "technikai", "color": "#f59e0b", "sort_order": 3, "description": "Technikai és IT kérdések"}, {"id": "36d7e305-19fd-4e63-b7d6-5833ae6bd45f", "icon": "info", "name": "Általános", "slug": "altalanos", "color": "#8b5cf6", "sort_order": 4, "description": "Általános információk"}]}	2026-02-21 10:51:01.469431+00
15e60a15-3af1-4dd1-bd27-7e6a2636ea1f	c8510bda-5f57-44a4-8e2a-f18bad3f3ff1	bot	faq_list	Válasszon témát:	{"categories": [{"id": "2d299ec4-aab3-4010-b641-a26766da5c4e", "icon": "people", "name": "HR Kérdések", "slug": "hr", "color": "#3b82f6", "sort_order": 1, "description": "Munkaügyi és HR kérdések"}, {"id": "e1b1783f-ba60-411c-99ad-6257a015706d", "icon": "home", "name": "Szállás", "slug": "szallas", "color": "#10b981", "sort_order": 2, "description": "Szállással kapcsolatos kérdések"}, {"id": "de7e5d82-6982-42eb-ba52-19502c2743a6", "icon": "build", "name": "Technikai", "slug": "technikai", "color": "#f59e0b", "sort_order": 3, "description": "Technikai és IT kérdések"}, {"id": "36d7e305-19fd-4e63-b7d6-5833ae6bd45f", "icon": "info", "name": "Általános", "slug": "altalanos", "color": "#8b5cf6", "sort_order": 4, "description": "Általános információk"}]}	2026-02-21 10:51:01.469852+00
e96e27b0-3d84-42c3-8037-91a9e9966f06	c8510bda-5f57-44a4-8e2a-f18bad3f3ff1	user	text	Szállás	{}	2026-02-21 10:51:05.83297+00
e8c2934f-5210-43cc-b322-bc71e047ebed	c8510bda-5f57-44a4-8e2a-f18bad3f3ff1	bot	text	A szálláson észlelt hibákat a Hibajegyek menüben, Technikai kategóriában jelezheti. Kérjük, adjon részletes leírást és ha lehetséges, csatoljon fényképet.	{"kb_id": "635173ed-1972-48a6-bddd-590486ddd5ca", "source": "knowledge_base", "question": "Hogyan jelenthetem a szálláson keletkezett hibát?"}	2026-02-21 10:51:05.861209+00
c890e2cd-201c-4884-9ed1-74f97aa8fabd	0a14a0e1-e7e5-470c-b2af-bb2d6bfbe29a	bot	text	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	{}	2026-02-21 11:07:45.606766+00
e42fb901-c093-472d-87ce-2e71e771020a	604ac623-51fd-4a70-9383-0a755d3c56e4	bot	text	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	{}	2026-02-21 11:07:45.607496+00
a33d0753-552c-4355-b55e-33123870ae6f	604ac623-51fd-4a70-9383-0a755d3c56e4	bot	faq_list	Válasszon témát:	{"categories": [{"id": "2d299ec4-aab3-4010-b641-a26766da5c4e", "icon": "people", "name": "HR Kérdések", "slug": "hr", "color": "#3b82f6", "sort_order": 1, "description": "Munkaügyi és HR kérdések"}, {"id": "e1b1783f-ba60-411c-99ad-6257a015706d", "icon": "home", "name": "Szállás", "slug": "szallas", "color": "#10b981", "sort_order": 2, "description": "Szállással kapcsolatos kérdések"}, {"id": "de7e5d82-6982-42eb-ba52-19502c2743a6", "icon": "build", "name": "Technikai", "slug": "technikai", "color": "#f59e0b", "sort_order": 3, "description": "Technikai és IT kérdések"}, {"id": "36d7e305-19fd-4e63-b7d6-5833ae6bd45f", "icon": "info", "name": "Általános", "slug": "altalanos", "color": "#8b5cf6", "sort_order": 4, "description": "Általános információk"}]}	2026-02-21 11:07:45.612686+00
5b14ec36-c0e6-485d-a2d0-77f55553aa45	0a14a0e1-e7e5-470c-b2af-bb2d6bfbe29a	bot	faq_list	Válasszon témát:	{"categories": [{"id": "2d299ec4-aab3-4010-b641-a26766da5c4e", "icon": "people", "name": "HR Kérdések", "slug": "hr", "color": "#3b82f6", "sort_order": 1, "description": "Munkaügyi és HR kérdések"}, {"id": "e1b1783f-ba60-411c-99ad-6257a015706d", "icon": "home", "name": "Szállás", "slug": "szallas", "color": "#10b981", "sort_order": 2, "description": "Szállással kapcsolatos kérdések"}, {"id": "de7e5d82-6982-42eb-ba52-19502c2743a6", "icon": "build", "name": "Technikai", "slug": "technikai", "color": "#f59e0b", "sort_order": 3, "description": "Technikai és IT kérdések"}, {"id": "36d7e305-19fd-4e63-b7d6-5833ae6bd45f", "icon": "info", "name": "Általános", "slug": "altalanos", "color": "#8b5cf6", "sort_order": 4, "description": "Általános információk"}]}	2026-02-21 11:07:45.612338+00
830ed798-0ff6-449c-bfbd-99af56cbf8de	0a14a0e1-e7e5-470c-b2af-bb2d6bfbe29a	user	text	szia!	{}	2026-02-21 11:07:49.654227+00
30f638bf-03cd-4853-985b-f2beecda4b4e	0a14a0e1-e7e5-470c-b2af-bb2d6bfbe29a	bot	text	Sajnos nem találtam megfelelő választ a kérdésére. Szeretné, ha továbbítanám kérdését egy munkatársunknak?	{"source": "fallback"}	2026-02-21 11:07:49.680433+00
ae82091d-7cab-40ab-8709-34e76d569b80	c4e9470f-a9a2-4932-b194-d36f1af1c392	bot	text	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	{}	2026-02-21 11:19:08.300211+00
315165fc-b2d9-4f02-8643-535d8454187b	eb4686e1-e796-4e1a-a2fd-8188db52ae67	bot	text	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	{}	2026-02-21 11:19:08.300947+00
23ae40f9-3189-4727-a893-2d72221bf73b	c4e9470f-a9a2-4932-b194-d36f1af1c392	bot	faq_list	Válasszon témát:	{"categories": [{"id": "2d299ec4-aab3-4010-b641-a26766da5c4e", "icon": "people", "name": "HR Kérdések", "slug": "hr", "color": "#3b82f6", "sort_order": 1, "description": "Munkaügyi és HR kérdések"}, {"id": "e1b1783f-ba60-411c-99ad-6257a015706d", "icon": "home", "name": "Szállás", "slug": "szallas", "color": "#10b981", "sort_order": 2, "description": "Szállással kapcsolatos kérdések"}, {"id": "de7e5d82-6982-42eb-ba52-19502c2743a6", "icon": "build", "name": "Technikai", "slug": "technikai", "color": "#f59e0b", "sort_order": 3, "description": "Technikai és IT kérdések"}, {"id": "36d7e305-19fd-4e63-b7d6-5833ae6bd45f", "icon": "info", "name": "Általános", "slug": "altalanos", "color": "#8b5cf6", "sort_order": 4, "description": "Általános információk"}]}	2026-02-21 11:19:08.30533+00
74606612-55e0-4107-b410-13c524243d37	722c27e8-0199-4617-b0be-7d0a631cbe42	bot	text	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	{}	2026-02-21 11:37:56.329981+00
b391c091-e7ed-494d-b374-02e3c8fb8c8b	89dcf075-73c2-4b74-86d7-5e16068d9dba	bot	text	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	{}	2026-02-21 11:37:56.331066+00
73f74a9d-d9a8-442f-ad7c-0245c1058993	722c27e8-0199-4617-b0be-7d0a631cbe42	bot	faq_list	Válasszon témát:	{"categories": [{"id": "2d299ec4-aab3-4010-b641-a26766da5c4e", "icon": "people", "name": "HR Kérdések", "slug": "hr", "color": "#3b82f6", "sort_order": 1, "description": "Munkaügyi és HR kérdések"}, {"id": "e1b1783f-ba60-411c-99ad-6257a015706d", "icon": "home", "name": "Szállás", "slug": "szallas", "color": "#10b981", "sort_order": 2, "description": "Szállással kapcsolatos kérdések"}, {"id": "de7e5d82-6982-42eb-ba52-19502c2743a6", "icon": "build", "name": "Technikai", "slug": "technikai", "color": "#f59e0b", "sort_order": 3, "description": "Technikai és IT kérdések"}, {"id": "36d7e305-19fd-4e63-b7d6-5833ae6bd45f", "icon": "info", "name": "Általános", "slug": "altalanos", "color": "#8b5cf6", "sort_order": 4, "description": "Általános információk"}]}	2026-02-21 11:37:56.33649+00
3ad5d95a-f118-4541-980f-f9c1cc9e9f2b	89dcf075-73c2-4b74-86d7-5e16068d9dba	bot	faq_list	Válasszon témát:	{"categories": [{"id": "2d299ec4-aab3-4010-b641-a26766da5c4e", "icon": "people", "name": "HR Kérdések", "slug": "hr", "color": "#3b82f6", "sort_order": 1, "description": "Munkaügyi és HR kérdések"}, {"id": "e1b1783f-ba60-411c-99ad-6257a015706d", "icon": "home", "name": "Szállás", "slug": "szallas", "color": "#10b981", "sort_order": 2, "description": "Szállással kapcsolatos kérdések"}, {"id": "de7e5d82-6982-42eb-ba52-19502c2743a6", "icon": "build", "name": "Technikai", "slug": "technikai", "color": "#f59e0b", "sort_order": 3, "description": "Technikai és IT kérdések"}, {"id": "36d7e305-19fd-4e63-b7d6-5833ae6bd45f", "icon": "info", "name": "Általános", "slug": "altalanos", "color": "#8b5cf6", "sort_order": 4, "description": "Általános információk"}]}	2026-02-21 11:37:56.33679+00
cc089ed9-a719-46b0-86ad-5aa5f80517c6	2c42836f-0666-4346-a6cc-6d51f509ce9c	bot	text	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	{}	2026-02-21 12:21:37.867276+00
fe49da6f-e957-4707-99d4-18c72d9ba3a8	1ff2bfba-d9e0-4513-9632-11abf9677341	bot	text	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	{}	2026-02-21 12:21:37.868352+00
57499b68-9944-4502-9f08-f6b929a8cc29	2c42836f-0666-4346-a6cc-6d51f509ce9c	bot	faq_list	Válasszon témát:	{"categories": [{"id": "2d299ec4-aab3-4010-b641-a26766da5c4e", "icon": "people", "name": "HR Kérdések", "slug": "hr", "color": "#3b82f6", "sort_order": 1, "description": "Munkaügyi és HR kérdések"}, {"id": "e1b1783f-ba60-411c-99ad-6257a015706d", "icon": "home", "name": "Szállás", "slug": "szallas", "color": "#10b981", "sort_order": 2, "description": "Szállással kapcsolatos kérdések"}, {"id": "de7e5d82-6982-42eb-ba52-19502c2743a6", "icon": "build", "name": "Technikai", "slug": "technikai", "color": "#f59e0b", "sort_order": 3, "description": "Technikai és IT kérdések"}, {"id": "36d7e305-19fd-4e63-b7d6-5833ae6bd45f", "icon": "info", "name": "Általános", "slug": "altalanos", "color": "#8b5cf6", "sort_order": 4, "description": "Általános információk"}]}	2026-02-21 12:21:37.873843+00
8562db12-b862-454f-a8d3-99c2907649fe	1ff2bfba-d9e0-4513-9632-11abf9677341	bot	faq_list	Válasszon témát:	{"categories": [{"id": "2d299ec4-aab3-4010-b641-a26766da5c4e", "icon": "people", "name": "HR Kérdések", "slug": "hr", "color": "#3b82f6", "sort_order": 1, "description": "Munkaügyi és HR kérdések"}, {"id": "e1b1783f-ba60-411c-99ad-6257a015706d", "icon": "home", "name": "Szállás", "slug": "szallas", "color": "#10b981", "sort_order": 2, "description": "Szállással kapcsolatos kérdések"}, {"id": "de7e5d82-6982-42eb-ba52-19502c2743a6", "icon": "build", "name": "Technikai", "slug": "technikai", "color": "#f59e0b", "sort_order": 3, "description": "Technikai és IT kérdések"}, {"id": "36d7e305-19fd-4e63-b7d6-5833ae6bd45f", "icon": "info", "name": "Általános", "slug": "altalanos", "color": "#8b5cf6", "sort_order": 4, "description": "Általános információk"}]}	2026-02-21 12:21:37.874094+00
21a7f736-12bb-4b49-aad2-0c4135b0ab52	1854bcf0-578b-4845-9e62-edd8f01e8d0d	bot	text	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	{}	2026-02-21 12:23:20.162113+00
44ddc75a-cd36-444c-a3e6-967c0075307c	b21b66c6-89e9-45d6-9f43-49b3b7f5ed49	bot	text	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	{}	2026-02-21 12:23:20.169874+00
421df5d3-a1a5-44f6-bbbc-541c7bab116c	1854bcf0-578b-4845-9e62-edd8f01e8d0d	bot	faq_list	Válasszon témát:	{"categories": [{"id": "2d299ec4-aab3-4010-b641-a26766da5c4e", "icon": "people", "name": "HR Kérdések", "slug": "hr", "color": "#3b82f6", "sort_order": 1, "description": "Munkaügyi és HR kérdések"}, {"id": "e1b1783f-ba60-411c-99ad-6257a015706d", "icon": "home", "name": "Szállás", "slug": "szallas", "color": "#10b981", "sort_order": 2, "description": "Szállással kapcsolatos kérdések"}, {"id": "de7e5d82-6982-42eb-ba52-19502c2743a6", "icon": "build", "name": "Technikai", "slug": "technikai", "color": "#f59e0b", "sort_order": 3, "description": "Technikai és IT kérdések"}, {"id": "36d7e305-19fd-4e63-b7d6-5833ae6bd45f", "icon": "info", "name": "Általános", "slug": "altalanos", "color": "#8b5cf6", "sort_order": 4, "description": "Általános információk"}]}	2026-02-21 12:23:20.170637+00
1d99eb99-53dd-4b1a-8b93-603b34cfa192	b21b66c6-89e9-45d6-9f43-49b3b7f5ed49	bot	faq_list	Válasszon témát:	{"categories": [{"id": "2d299ec4-aab3-4010-b641-a26766da5c4e", "icon": "people", "name": "HR Kérdések", "slug": "hr", "color": "#3b82f6", "sort_order": 1, "description": "Munkaügyi és HR kérdések"}, {"id": "e1b1783f-ba60-411c-99ad-6257a015706d", "icon": "home", "name": "Szállás", "slug": "szallas", "color": "#10b981", "sort_order": 2, "description": "Szállással kapcsolatos kérdések"}, {"id": "de7e5d82-6982-42eb-ba52-19502c2743a6", "icon": "build", "name": "Technikai", "slug": "technikai", "color": "#f59e0b", "sort_order": 3, "description": "Technikai és IT kérdések"}, {"id": "36d7e305-19fd-4e63-b7d6-5833ae6bd45f", "icon": "info", "name": "Általános", "slug": "altalanos", "color": "#8b5cf6", "sort_order": 4, "description": "Általános információk"}]}	2026-02-21 12:23:20.177392+00
fffa7245-cdb3-4d6d-bf86-0475545d4f68	a2d249c2-5f7f-458f-a51e-711e268e047d	bot	text	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	{}	2026-02-21 12:41:38.121953+00
fc8494c3-db41-4fe6-bffd-84959a496ffd	c4f80531-1e3f-493d-add5-e1c32281d277	bot	text	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	{}	2026-02-21 12:41:38.126129+00
e3ddf662-a5d9-411d-b316-a1ac664e7aa6	ef73402b-dabb-448d-a1ad-713480862d35	bot	text	Sajnos nem találtam megfelelő választ a kérdésére. Szeretné, ha továbbítanám kérdését egy munkatársunknak?	{"source": "fallback", "response_time_ms": 3}	2026-02-21 13:58:24.585515+00
76259766-4d99-43d3-827e-47aea5c5b524	095bd56a-3b58-4539-8c6c-30a6287ed7ca	bot	text	A szálláson észlelt hibákat a Hibajegyek menüben, Technikai kategóriában jelezheti. Kérjük, adjon részletes leírást és ha lehetséges, csatoljon fényképet.	{"kb_id": "635173ed-1972-48a6-bddd-590486ddd5ca", "source": "knowledge_base", "question": "Hogyan jelenthetem a szálláson keletkezett hibát?", "response_time_ms": 8}	2026-02-21 14:19:21.394725+00
65dda460-93c2-464c-81a1-5d71c7161690	095bd56a-3b58-4539-8c6c-30a6287ed7ca	user	text	dokumentumok hol vannak	{}	2026-02-21 14:19:21.405424+00
6ed9ee7d-0a31-46f2-a55f-4c3f90f066db	eb4686e1-e796-4e1a-a2fd-8188db52ae67	bot	faq_list	Válasszon témát:	{"categories": [{"id": "2d299ec4-aab3-4010-b641-a26766da5c4e", "icon": "people", "name": "HR Kérdések", "slug": "hr", "color": "#3b82f6", "sort_order": 1, "description": "Munkaügyi és HR kérdések"}, {"id": "e1b1783f-ba60-411c-99ad-6257a015706d", "icon": "home", "name": "Szállás", "slug": "szallas", "color": "#10b981", "sort_order": 2, "description": "Szállással kapcsolatos kérdések"}, {"id": "de7e5d82-6982-42eb-ba52-19502c2743a6", "icon": "build", "name": "Technikai", "slug": "technikai", "color": "#f59e0b", "sort_order": 3, "description": "Technikai és IT kérdések"}, {"id": "36d7e305-19fd-4e63-b7d6-5833ae6bd45f", "icon": "info", "name": "Általános", "slug": "altalanos", "color": "#8b5cf6", "sort_order": 4, "description": "Általános információk"}]}	2026-02-21 11:19:08.306037+00
56547452-7055-403f-8047-13caabcbdaee	c4e9470f-a9a2-4932-b194-d36f1af1c392	user	text	hello	{}	2026-02-21 11:19:15.702591+00
b8375f0d-a121-499f-a2e8-4c06431c0f54	c4e9470f-a9a2-4932-b194-d36f1af1c392	bot	text	Sajnos nem találtam megfelelő választ a kérdésére. Szeretné, ha továbbítanám kérdését egy munkatársunknak?	{"source": "fallback"}	2026-02-21 11:19:15.710504+00
41cbe4b1-8a09-486b-b7fb-280ee5d92239	8fb8f55c-aa85-4977-bd23-68e4244cad52	bot	text	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	{}	2026-02-21 11:25:38.183141+00
20c5a4e0-5261-4379-a2da-f7013705cad6	d728fe61-5ea7-4584-abba-fce21f71ca05	bot	text	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	{}	2026-02-21 11:25:38.19597+00
80b22314-0042-4160-95e4-ec01b299ece2	8fb8f55c-aa85-4977-bd23-68e4244cad52	bot	faq_list	Válasszon témát:	{"categories": [{"id": "2d299ec4-aab3-4010-b641-a26766da5c4e", "icon": "people", "name": "HR Kérdések", "slug": "hr", "color": "#3b82f6", "sort_order": 1, "description": "Munkaügyi és HR kérdések"}, {"id": "e1b1783f-ba60-411c-99ad-6257a015706d", "icon": "home", "name": "Szállás", "slug": "szallas", "color": "#10b981", "sort_order": 2, "description": "Szállással kapcsolatos kérdések"}, {"id": "de7e5d82-6982-42eb-ba52-19502c2743a6", "icon": "build", "name": "Technikai", "slug": "technikai", "color": "#f59e0b", "sort_order": 3, "description": "Technikai és IT kérdések"}, {"id": "36d7e305-19fd-4e63-b7d6-5833ae6bd45f", "icon": "info", "name": "Általános", "slug": "altalanos", "color": "#8b5cf6", "sort_order": 4, "description": "Általános információk"}]}	2026-02-21 11:25:38.198324+00
26692c81-09dd-4304-8308-e67275060c8a	d728fe61-5ea7-4584-abba-fce21f71ca05	bot	faq_list	Válasszon témát:	{"categories": [{"id": "2d299ec4-aab3-4010-b641-a26766da5c4e", "icon": "people", "name": "HR Kérdések", "slug": "hr", "color": "#3b82f6", "sort_order": 1, "description": "Munkaügyi és HR kérdések"}, {"id": "e1b1783f-ba60-411c-99ad-6257a015706d", "icon": "home", "name": "Szállás", "slug": "szallas", "color": "#10b981", "sort_order": 2, "description": "Szállással kapcsolatos kérdések"}, {"id": "de7e5d82-6982-42eb-ba52-19502c2743a6", "icon": "build", "name": "Technikai", "slug": "technikai", "color": "#f59e0b", "sort_order": 3, "description": "Technikai és IT kérdések"}, {"id": "36d7e305-19fd-4e63-b7d6-5833ae6bd45f", "icon": "info", "name": "Általános", "slug": "altalanos", "color": "#8b5cf6", "sort_order": 4, "description": "Általános információk"}]}	2026-02-21 11:25:38.213574+00
9e7bd4c2-6326-4fde-bf3d-4ae48cc7b257	05836bda-ec90-4572-a627-2d714baca609	bot	text	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	{}	2026-02-21 11:25:59.991716+00
60660521-d2b4-446a-b261-7f3949a233b5	016f9ac8-d74f-4900-8dd6-b091a4554a48	bot	text	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	{}	2026-02-21 11:25:59.99267+00
96e7b7ec-09e3-4f0c-ab29-9a17706cbcd9	05836bda-ec90-4572-a627-2d714baca609	bot	faq_list	Válasszon témát:	{"categories": [{"id": "2d299ec4-aab3-4010-b641-a26766da5c4e", "icon": "people", "name": "HR Kérdések", "slug": "hr", "color": "#3b82f6", "sort_order": 1, "description": "Munkaügyi és HR kérdések"}, {"id": "e1b1783f-ba60-411c-99ad-6257a015706d", "icon": "home", "name": "Szállás", "slug": "szallas", "color": "#10b981", "sort_order": 2, "description": "Szállással kapcsolatos kérdések"}, {"id": "de7e5d82-6982-42eb-ba52-19502c2743a6", "icon": "build", "name": "Technikai", "slug": "technikai", "color": "#f59e0b", "sort_order": 3, "description": "Technikai és IT kérdések"}, {"id": "36d7e305-19fd-4e63-b7d6-5833ae6bd45f", "icon": "info", "name": "Általános", "slug": "altalanos", "color": "#8b5cf6", "sort_order": 4, "description": "Általános információk"}]}	2026-02-21 11:26:00.030169+00
f08da643-b1b4-49ac-9af2-46147e545d5d	016f9ac8-d74f-4900-8dd6-b091a4554a48	bot	faq_list	Válasszon témát:	{"categories": [{"id": "2d299ec4-aab3-4010-b641-a26766da5c4e", "icon": "people", "name": "HR Kérdések", "slug": "hr", "color": "#3b82f6", "sort_order": 1, "description": "Munkaügyi és HR kérdések"}, {"id": "e1b1783f-ba60-411c-99ad-6257a015706d", "icon": "home", "name": "Szállás", "slug": "szallas", "color": "#10b981", "sort_order": 2, "description": "Szállással kapcsolatos kérdések"}, {"id": "de7e5d82-6982-42eb-ba52-19502c2743a6", "icon": "build", "name": "Technikai", "slug": "technikai", "color": "#f59e0b", "sort_order": 3, "description": "Technikai és IT kérdések"}, {"id": "36d7e305-19fd-4e63-b7d6-5833ae6bd45f", "icon": "info", "name": "Általános", "slug": "altalanos", "color": "#8b5cf6", "sort_order": 4, "description": "Általános információk"}]}	2026-02-21 11:26:00.057326+00
1279fd15-d8b6-4886-8ee0-72fd77456e13	f0e8b7ba-76e1-4f5b-8934-c2185dfe8df9	bot	text	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	{}	2026-02-21 11:27:45.585295+00
6508cbf4-d5b0-4db8-95d3-e56178b9b520	6eeae944-9759-4642-b809-ad2ce2c6490b	bot	text	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	{}	2026-02-21 11:27:45.587781+00
80a5ebf3-fddf-4840-8c95-031ae12a3dc7	f0e8b7ba-76e1-4f5b-8934-c2185dfe8df9	bot	faq_list	Válasszon témát:	{"categories": [{"id": "2d299ec4-aab3-4010-b641-a26766da5c4e", "icon": "people", "name": "HR Kérdések", "slug": "hr", "color": "#3b82f6", "sort_order": 1, "description": "Munkaügyi és HR kérdések"}, {"id": "e1b1783f-ba60-411c-99ad-6257a015706d", "icon": "home", "name": "Szállás", "slug": "szallas", "color": "#10b981", "sort_order": 2, "description": "Szállással kapcsolatos kérdések"}, {"id": "de7e5d82-6982-42eb-ba52-19502c2743a6", "icon": "build", "name": "Technikai", "slug": "technikai", "color": "#f59e0b", "sort_order": 3, "description": "Technikai és IT kérdések"}, {"id": "36d7e305-19fd-4e63-b7d6-5833ae6bd45f", "icon": "info", "name": "Általános", "slug": "altalanos", "color": "#8b5cf6", "sort_order": 4, "description": "Általános információk"}]}	2026-02-21 11:27:45.596687+00
4033dbcd-7d0c-4a6b-9955-f1240b72c2bb	6eeae944-9759-4642-b809-ad2ce2c6490b	bot	faq_list	Válasszon témát:	{"categories": [{"id": "2d299ec4-aab3-4010-b641-a26766da5c4e", "icon": "people", "name": "HR Kérdések", "slug": "hr", "color": "#3b82f6", "sort_order": 1, "description": "Munkaügyi és HR kérdések"}, {"id": "e1b1783f-ba60-411c-99ad-6257a015706d", "icon": "home", "name": "Szállás", "slug": "szallas", "color": "#10b981", "sort_order": 2, "description": "Szállással kapcsolatos kérdések"}, {"id": "de7e5d82-6982-42eb-ba52-19502c2743a6", "icon": "build", "name": "Technikai", "slug": "technikai", "color": "#f59e0b", "sort_order": 3, "description": "Technikai és IT kérdések"}, {"id": "36d7e305-19fd-4e63-b7d6-5833ae6bd45f", "icon": "info", "name": "Általános", "slug": "altalanos", "color": "#8b5cf6", "sort_order": 4, "description": "Általános információk"}]}	2026-02-21 11:27:45.600125+00
f0c46bf7-1727-4c7e-a413-e32ef95880f4	2eb9b6a5-669a-4ca7-b1b7-6cf9597c9229	bot	text	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	{}	2026-02-21 11:36:30.43652+00
8fd29890-9b31-4c25-b2ed-9dffae3fd6de	2eb9b6a5-669a-4ca7-b1b7-6cf9597c9229	bot	faq_list	Válasszon témát:	{"categories": [{"id": "2d299ec4-aab3-4010-b641-a26766da5c4e", "icon": "people", "name": "HR Kérdések", "slug": "hr", "color": "#3b82f6", "sort_order": 1, "description": "Munkaügyi és HR kérdések"}, {"id": "e1b1783f-ba60-411c-99ad-6257a015706d", "icon": "home", "name": "Szállás", "slug": "szallas", "color": "#10b981", "sort_order": 2, "description": "Szállással kapcsolatos kérdések"}, {"id": "de7e5d82-6982-42eb-ba52-19502c2743a6", "icon": "build", "name": "Technikai", "slug": "technikai", "color": "#f59e0b", "sort_order": 3, "description": "Technikai és IT kérdések"}, {"id": "36d7e305-19fd-4e63-b7d6-5833ae6bd45f", "icon": "info", "name": "Általános", "slug": "altalanos", "color": "#8b5cf6", "sort_order": 4, "description": "Általános információk"}]}	2026-02-21 11:36:30.446863+00
2d854c4c-8480-4d62-aa8e-9c1c491feca3	a2d249c2-5f7f-458f-a51e-711e268e047d	bot	faq_list	Válasszon témát:	{"categories": [{"id": "2d299ec4-aab3-4010-b641-a26766da5c4e", "icon": "people", "name": "HR Kérdések", "slug": "hr", "color": "#3b82f6", "sort_order": 1, "description": "Munkaügyi és HR kérdések"}, {"id": "e1b1783f-ba60-411c-99ad-6257a015706d", "icon": "home", "name": "Szállás", "slug": "szallas", "color": "#10b981", "sort_order": 2, "description": "Szállással kapcsolatos kérdések"}, {"id": "de7e5d82-6982-42eb-ba52-19502c2743a6", "icon": "build", "name": "Technikai", "slug": "technikai", "color": "#f59e0b", "sort_order": 3, "description": "Technikai és IT kérdések"}, {"id": "36d7e305-19fd-4e63-b7d6-5833ae6bd45f", "icon": "info", "name": "Általános", "slug": "altalanos", "color": "#8b5cf6", "sort_order": 4, "description": "Általános információk"}]}	2026-02-21 12:41:38.12993+00
8b4d62d7-64b7-4cb2-a1fc-72a61ae100d2	c4f80531-1e3f-493d-add5-e1c32281d277	bot	faq_list	Válasszon témát:	{"categories": [{"id": "2d299ec4-aab3-4010-b641-a26766da5c4e", "icon": "people", "name": "HR Kérdések", "slug": "hr", "color": "#3b82f6", "sort_order": 1, "description": "Munkaügyi és HR kérdések"}, {"id": "e1b1783f-ba60-411c-99ad-6257a015706d", "icon": "home", "name": "Szállás", "slug": "szallas", "color": "#10b981", "sort_order": 2, "description": "Szállással kapcsolatos kérdések"}, {"id": "de7e5d82-6982-42eb-ba52-19502c2743a6", "icon": "build", "name": "Technikai", "slug": "technikai", "color": "#f59e0b", "sort_order": 3, "description": "Technikai és IT kérdések"}, {"id": "36d7e305-19fd-4e63-b7d6-5833ae6bd45f", "icon": "info", "name": "Általános", "slug": "altalanos", "color": "#8b5cf6", "sort_order": 4, "description": "Általános információk"}]}	2026-02-21 12:41:38.133096+00
213ffac8-ebe7-42f9-acb8-311c86f75034	34e3bf8a-9638-4740-8bbb-7a71967f2c7e	bot	text	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	{}	2026-02-21 13:24:44.444935+00
0aa95b9e-1099-4d53-945d-69425b670e1a	34e3bf8a-9638-4740-8bbb-7a71967f2c7e	bot	faq_list	Válasszon témát:	{"categories": [{"id": "2d299ec4-aab3-4010-b641-a26766da5c4e", "icon": "people", "name": "HR Kérdések", "slug": "hr", "color": "#3b82f6", "sort_order": 1, "description": "Munkaügyi és HR kérdések"}, {"id": "e1b1783f-ba60-411c-99ad-6257a015706d", "icon": "home", "name": "Szállás", "slug": "szallas", "color": "#10b981", "sort_order": 2, "description": "Szállással kapcsolatos kérdések"}, {"id": "de7e5d82-6982-42eb-ba52-19502c2743a6", "icon": "build", "name": "Technikai", "slug": "technikai", "color": "#f59e0b", "sort_order": 3, "description": "Technikai és IT kérdések"}, {"id": "36d7e305-19fd-4e63-b7d6-5833ae6bd45f", "icon": "info", "name": "Általános", "slug": "altalanos", "color": "#8b5cf6", "sort_order": 4, "description": "Általános információk"}]}	2026-02-21 13:24:44.448755+00
cf33dd8a-112b-4f3a-b662-251d757818a1	34e3bf8a-9638-4740-8bbb-7a71967f2c7e	user	text	szabads�g	{}	2026-02-21 13:32:50.117671+00
01c67af7-6b6e-4cbf-980e-360ecc24df52	34e3bf8a-9638-4740-8bbb-7a71967f2c7e	bot	text	Sajnos nem találtam megfelelő választ a kérdésére. Szeretné, ha továbbítanám kérdését egy munkatársunknak?	{"source": "fallback"}	2026-02-21 13:32:50.140162+00
302c695f-2b9e-496f-8832-7fb309dea706	34e3bf8a-9638-4740-8bbb-7a71967f2c7e	user	text	szabadság	{}	2026-02-21 13:34:48.530802+00
9becf127-d271-4542-aca2-4bf15fd98c48	34e3bf8a-9638-4740-8bbb-7a71967f2c7e	bot	text	Szabadság kérelmét a felettesének kell benyújtania legalább 5 munkanappal előtte. Használja a Hibajegyek menüt, és válassza a HR kategóriát.	{"kb_id": "0b96c9e6-b9d7-403c-ac4b-f9994b73d35a", "source": "knowledge_base", "question": "Hogyan kérhetek szabadságot?"}	2026-02-21 13:34:48.541708+00
6d3315aa-7d34-4336-9217-2d064e40fc1f	34e3bf8a-9638-4740-8bbb-7a71967f2c7e	user	text	szabadsg igenyles	{}	2026-02-21 13:34:48.553821+00
ad2828de-b30a-4333-acc0-f1d71e29f185	34e3bf8a-9638-4740-8bbb-7a71967f2c7e	bot	text	Sajnos nem találtam megfelelő választ a kérdésére. Szeretné, ha továbbítanám kérdését egy munkatársunknak?	{"source": "fallback"}	2026-02-21 13:34:48.558698+00
59e945ec-244e-4349-9a1d-06e287e2791d	34e3bf8a-9638-4740-8bbb-7a71967f2c7e	user	text	mennyi a munkaidő	{}	2026-02-21 13:34:48.567283+00
53d0a586-1eee-417b-9c4c-e9251e468953	34e3bf8a-9638-4740-8bbb-7a71967f2c7e	bot	text	A munkaidő beosztás a Naptár menüben található. Általában hétfőtől péntekig, 8:00-16:00 óráig. Műszakbeosztás esetén a vezető értesíti Önt.	{"kb_id": "47dc4f08-5e72-4d11-9e83-f44c448f3bd4", "source": "knowledge_base", "question": "Mi a munkaidő beosztás?"}	2026-02-21 13:34:48.571962+00
7118d8f0-7fdb-4126-ab1f-e23bdc6526a1	a21f3fea-6830-4ce3-be28-b6565acba514	bot	text	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	{}	2026-02-21 13:35:14.805311+00
c2f3196b-f4d8-4618-b6a7-5e869b7b31f9	a21f3fea-6830-4ce3-be28-b6565acba514	bot	faq_list	Válasszon témát:	{"categories": [{"id": "2d299ec4-aab3-4010-b641-a26766da5c4e", "icon": "people", "name": "HR Kérdések", "slug": "hr", "color": "#3b82f6", "sort_order": 1, "description": "Munkaügyi és HR kérdések"}, {"id": "e1b1783f-ba60-411c-99ad-6257a015706d", "icon": "home", "name": "Szállás", "slug": "szallas", "color": "#10b981", "sort_order": 2, "description": "Szállással kapcsolatos kérdések"}, {"id": "de7e5d82-6982-42eb-ba52-19502c2743a6", "icon": "build", "name": "Technikai", "slug": "technikai", "color": "#f59e0b", "sort_order": 3, "description": "Technikai és IT kérdések"}, {"id": "36d7e305-19fd-4e63-b7d6-5833ae6bd45f", "icon": "info", "name": "Általános", "slug": "altalanos", "color": "#8b5cf6", "sort_order": 4, "description": "Általános információk"}]}	2026-02-21 13:35:14.811659+00
c3451c35-160b-456c-abad-9200cf71ff77	a21f3fea-6830-4ce3-be28-b6565acba514	user	text	Hogyan kérhetek szabadságot?	{}	2026-02-21 13:35:14.82424+00
529eb9e0-f5e9-485c-b52b-142377d6756d	a21f3fea-6830-4ce3-be28-b6565acba514	bot	text	Szabadság kérelmét a felettesének kell benyújtania legalább 5 munkanappal előtte. Használja a Hibajegyek menüt, és válassza a HR kategóriát.	{"kb_id": "0b96c9e6-b9d7-403c-ac4b-f9994b73d35a", "source": "knowledge_base", "question": "Hogyan kérhetek szabadságot?"}	2026-02-21 13:35:14.830685+00
10d8d20e-4dfc-4d11-9db0-bd6bc84999c1	a21f3fea-6830-4ce3-be28-b6565acba514	user	text	hogyan kérhetek szabadságt	{}	2026-02-21 13:35:14.841945+00
cf1a65a8-6f72-4c82-abdf-c7d12b367b80	a21f3fea-6830-4ce3-be28-b6565acba514	bot	text	Szabadság kérelmét a felettesének kell benyújtania legalább 5 munkanappal előtte. Használja a Hibajegyek menüt, és válassza a HR kategóriát.	{"kb_id": "0b96c9e6-b9d7-403c-ac4b-f9994b73d35a", "source": "knowledge_base", "question": "Hogyan kérhetek szabadságot?"}	2026-02-21 13:35:14.847277+00
88522448-8aa0-44da-9b81-50751ba99368	a21f3fea-6830-4ce3-be28-b6565acba514	user	text	és a betegszabadság?	{}	2026-02-21 13:35:14.856408+00
a396f825-3653-4424-b497-656b4fbf55ca	a21f3fea-6830-4ce3-be28-b6565acba514	bot	text	Ha bejelentkezési problémája van: 1) Ellenőrizze az email címet és jelszót 2) Próbálja meg a "Jelszó emlékeztető" funkciót 3) Ha továbbra sem sikerül, jelezze a problémát az adminisztrátornak.	{"kb_id": "f8e19ee4-ea87-425e-b23f-df14ca4ecb8f", "source": "knowledge_base", "question": "Nem tudok bejelentkezni az alkalmazásba"}	2026-02-21 13:35:14.862512+00
1d262a39-9706-440e-81d9-06f6443ed86c	a21f3fea-6830-4ce3-be28-b6565acba514	user	text	xyzzy foobar	{}	2026-02-21 13:35:14.871916+00
3f4943d5-c699-4bb6-8fab-5851dfb59f84	a21f3fea-6830-4ce3-be28-b6565acba514	bot	text	Sajnos nem találtam megfelelő választ a kérdésére. Szeretné, ha továbbítanám kérdését egy munkatársunknak?	{"source": "fallback"}	2026-02-21 13:35:14.877408+00
23a8163f-6ea7-413f-9f6c-0cd8e7fc697c	a21f3fea-6830-4ce3-be28-b6565acba514	system	text	A beszélgetés lezárva.	{}	2026-02-21 13:35:14.889447+00
c5dd5a3f-f761-4a56-ae4e-2793f8529a2a	56382e4b-f7c4-4e07-9189-7c670998a865	bot	text	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	{}	2026-02-21 13:35:14.899974+00
09b01ed1-2bc5-47a1-8ef5-2ec8f9ff38ca	56382e4b-f7c4-4e07-9189-7c670998a865	bot	faq_list	Válasszon témát:	{"categories": [{"id": "2d299ec4-aab3-4010-b641-a26766da5c4e", "icon": "people", "name": "HR Kérdések", "slug": "hr", "color": "#3b82f6", "sort_order": 1, "description": "Munkaügyi és HR kérdések"}, {"id": "e1b1783f-ba60-411c-99ad-6257a015706d", "icon": "home", "name": "Szállás", "slug": "szallas", "color": "#10b981", "sort_order": 2, "description": "Szállással kapcsolatos kérdések"}, {"id": "de7e5d82-6982-42eb-ba52-19502c2743a6", "icon": "build", "name": "Technikai", "slug": "technikai", "color": "#f59e0b", "sort_order": 3, "description": "Technikai és IT kérdések"}, {"id": "36d7e305-19fd-4e63-b7d6-5833ae6bd45f", "icon": "info", "name": "Általános", "slug": "altalanos", "color": "#8b5cf6", "sort_order": 4, "description": "Általános információk"}]}	2026-02-21 13:35:14.902271+00
a0803a1a-802b-42b3-a61b-626e52dff8b8	495e9181-20ae-45ed-be79-cf5c990dac81	bot	text	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	{}	2026-02-21 13:35:33.679217+00
861bbce5-bdfa-49ea-895b-f3942af2210b	ef73402b-dabb-448d-a1ad-713480862d35	bot	text	Sajnos nem találtam megfelelő választ a kérdésére. Szeretné, ha továbbítanám kérdését egy munkatársunknak?	{"source": "fallback", "response_time_ms": 2}	2026-02-21 13:58:24.560147+00
705a5e22-4bee-4944-810f-75c2961e716b	ef73402b-dabb-448d-a1ad-713480862d35	user	text	test message 3	{}	2026-02-21 13:58:24.568871+00
7fc5e164-e60d-45b3-ba73-e844bce475b0	ef73402b-dabb-448d-a1ad-713480862d35	bot	text	Sajnos nem találtam megfelelő választ a kérdésére. Szeretné, ha továbbítanám kérdését egy munkatársunknak?	{"source": "fallback", "response_time_ms": 2}	2026-02-21 13:58:24.573174+00
87a2cbe0-231a-4b92-a327-26c8b22222c3	ef73402b-dabb-448d-a1ad-713480862d35	user	text	test message 4	{}	2026-02-21 13:58:24.58149+00
f25f1162-cf1a-4fc0-9a34-2ec4c38e516b	7f7df8f5-0d1b-4ec4-bd68-261f9e6349b7	bot	text	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	{}	2026-02-21 14:15:30.602605+00
08170e3b-b9ce-40ef-bfb9-abd07ae4e2a0	495e9181-20ae-45ed-be79-cf5c990dac81	bot	faq_list	Válasszon témát:	{"categories": [{"id": "2d299ec4-aab3-4010-b641-a26766da5c4e", "icon": "people", "name": "HR Kérdések", "slug": "hr", "color": "#3b82f6", "sort_order": 1, "description": "Munkaügyi és HR kérdések"}, {"id": "e1b1783f-ba60-411c-99ad-6257a015706d", "icon": "home", "name": "Szállás", "slug": "szallas", "color": "#10b981", "sort_order": 2, "description": "Szállással kapcsolatos kérdések"}, {"id": "de7e5d82-6982-42eb-ba52-19502c2743a6", "icon": "build", "name": "Technikai", "slug": "technikai", "color": "#f59e0b", "sort_order": 3, "description": "Technikai és IT kérdések"}, {"id": "36d7e305-19fd-4e63-b7d6-5833ae6bd45f", "icon": "info", "name": "Általános", "slug": "altalanos", "color": "#8b5cf6", "sort_order": 4, "description": "Általános információk"}]}	2026-02-21 13:35:33.683272+00
51cf96f4-7155-4a6a-90ab-38b17ad8d8b1	aceb0b2e-aad0-4b6d-9408-b65d77313749	bot	text	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	{}	2026-02-21 13:58:23.871784+00
c6fb9a54-6727-4355-be76-2455c692fdaf	aceb0b2e-aad0-4b6d-9408-b65d77313749	bot	faq_list	Válasszon témát:	{"categories": [{"id": "2d299ec4-aab3-4010-b641-a26766da5c4e", "icon": "people", "name": "HR Kérdések", "slug": "hr", "color": "#3b82f6", "sort_order": 1, "description": "Munkaügyi és HR kérdések"}, {"id": "e1b1783f-ba60-411c-99ad-6257a015706d", "icon": "home", "name": "Szállás", "slug": "szallas", "color": "#10b981", "sort_order": 2, "description": "Szállással kapcsolatos kérdések"}, {"id": "de7e5d82-6982-42eb-ba52-19502c2743a6", "icon": "build", "name": "Technikai", "slug": "technikai", "color": "#f59e0b", "sort_order": 3, "description": "Technikai és IT kérdések"}, {"id": "36d7e305-19fd-4e63-b7d6-5833ae6bd45f", "icon": "info", "name": "Általános", "slug": "altalanos", "color": "#8b5cf6", "sort_order": 4, "description": "Általános információk"}]}	2026-02-21 13:58:23.883723+00
34a6f68f-1352-43b1-ac0b-126f25d13b42	aceb0b2e-aad0-4b6d-9408-b65d77313749	user	text	Hogyan kérhetek szabadságot?	{}	2026-02-21 13:58:23.901101+00
31e846ac-3451-4f63-80e4-cddbfcacbda2	aceb0b2e-aad0-4b6d-9408-b65d77313749	bot	text	Szabadság kérelmét a felettesének kell benyújtania legalább 5 munkanappal előtte. Használja a Hibajegyek menüt, és válassza a HR kategóriát.	{"kb_id": "0b96c9e6-b9d7-403c-ac4b-f9994b73d35a", "source": "knowledge_base", "question": "Hogyan kérhetek szabadságot?", "response_time_ms": 47}	2026-02-21 13:58:23.949783+00
76527ec6-8f1a-4701-87ef-79f5bf4c2673	aceb0b2e-aad0-4b6d-9408-b65d77313749	user	text	hogyn kérhtek szabadságot	{}	2026-02-21 13:58:23.967988+00
0ea09c1a-f8e9-4a6d-8a3a-e7e9461911ef	aceb0b2e-aad0-4b6d-9408-b65d77313749	bot	text	Szabadság kérelmét a felettesének kell benyújtania legalább 5 munkanappal előtte. Használja a Hibajegyek menüt, és válassza a HR kategóriát.	{"kb_id": "0b96c9e6-b9d7-403c-ac4b-f9994b73d35a", "source": "knowledge_base", "question": "Hogyan kérhetek szabadságot?", "response_time_ms": 5}	2026-02-21 13:58:23.97436+00
8da2ed4d-127b-4d7e-8895-a2d0c910bff0	aceb0b2e-aad0-4b6d-9408-b65d77313749	user	text	Mi a munkaidő beosztás?	{}	2026-02-21 13:58:23.989842+00
828e85ef-667d-494f-bdc9-8d64275d1575	aceb0b2e-aad0-4b6d-9408-b65d77313749	bot	text	A munkaidő beosztás a Naptár menüben található. Általában hétfőtől péntekig, 8:00-16:00 óráig. Műszakbeosztás esetén a vezető értesíti Önt.	{"kb_id": "47dc4f08-5e72-4d11-9e83-f44c448f3bd4", "source": "knowledge_base", "question": "Mi a munkaidő beosztás?", "response_time_ms": 6}	2026-02-21 13:58:23.998916+00
96ef5769-f9cb-40bc-a130-94b0700f2619	aceb0b2e-aad0-4b6d-9408-b65d77313749	user	text	xyzzy foobar qux	{}	2026-02-21 13:58:24.015166+00
cda76a8b-3aa8-407c-a8e0-e92133fc495a	aceb0b2e-aad0-4b6d-9408-b65d77313749	bot	text	Sajnos nem találtam megfelelő választ a kérdésére. Szeretné, ha továbbítanám kérdését egy munkatársunknak?	{"source": "fallback", "response_time_ms": 11}	2026-02-21 13:58:24.028823+00
63eead71-6a24-4890-836b-7052d9c1ba72	aceb0b2e-aad0-4b6d-9408-b65d77313749	user	text	alert(1)bejelentkezés	{}	2026-02-21 13:58:24.04421+00
e684e161-7b6c-43a6-9cf2-726bfbb9f2a2	aceb0b2e-aad0-4b6d-9408-b65d77313749	bot	text	Ha bejelentkezési problémája van: 1) Ellenőrizze az email címet és jelszót 2) Próbálja meg a "Jelszó emlékeztető" funkciót 3) Ha továbbra sem sikerül, jelezze a problémát az adminisztrátornak.	{"kb_id": "f8e19ee4-ea87-425e-b23f-df14ca4ecb8f", "source": "knowledge_base", "question": "Nem tudok bejelentkezni az alkalmazásba", "response_time_ms": 5}	2026-02-21 13:58:24.051988+00
71ad18cb-d170-4f0f-a16e-90765dfc1815	aceb0b2e-aad0-4b6d-9408-b65d77313749	system	text	A beszélgetés lezárva.	{}	2026-02-21 13:58:24.06712+00
8114fd76-d0b0-41bc-a672-02d19522c03a	8b9b325b-27f8-4323-bf18-7e6b8a64aaa3	bot	text	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	{}	2026-02-21 13:58:24.081296+00
513021ad-c6ac-4b75-b9a2-bb107d9254e2	8b9b325b-27f8-4323-bf18-7e6b8a64aaa3	bot	faq_list	Válasszon témát:	{"categories": [{"id": "2d299ec4-aab3-4010-b641-a26766da5c4e", "icon": "people", "name": "HR Kérdések", "slug": "hr", "color": "#3b82f6", "sort_order": 1, "description": "Munkaügyi és HR kérdések"}, {"id": "e1b1783f-ba60-411c-99ad-6257a015706d", "icon": "home", "name": "Szállás", "slug": "szallas", "color": "#10b981", "sort_order": 2, "description": "Szállással kapcsolatos kérdések"}, {"id": "de7e5d82-6982-42eb-ba52-19502c2743a6", "icon": "build", "name": "Technikai", "slug": "technikai", "color": "#f59e0b", "sort_order": 3, "description": "Technikai és IT kérdések"}, {"id": "36d7e305-19fd-4e63-b7d6-5833ae6bd45f", "icon": "info", "name": "Általános", "slug": "altalanos", "color": "#8b5cf6", "sort_order": 4, "description": "Általános információk"}]}	2026-02-21 13:58:24.083462+00
9dc43625-1305-49e5-8af7-3566b8d1a1c8	8b9b325b-27f8-4323-bf18-7e6b8a64aaa3	user	text	Hogyan kérhetek szabadságot?	{}	2026-02-21 13:58:24.163476+00
f63f01e6-470b-4a2a-a5fc-208248fd465a	8b9b325b-27f8-4323-bf18-7e6b8a64aaa3	bot	text	Szabadság kérelmét a felettesének kell benyújtania legalább 5 munkanappal előtte. Használja a Hibajegyek menüt, és válassza a HR kategóriát.	{"kb_id": "0b96c9e6-b9d7-403c-ac4b-f9994b73d35a", "source": "knowledge_base", "question": "Hogyan kérhetek szabadságot?"}	2026-02-21 13:58:24.165745+00
689de215-7bff-4237-9a19-63e8c27cc77a	ef73402b-dabb-448d-a1ad-713480862d35	bot	text	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	{}	2026-02-21 13:58:24.532709+00
cef55a08-e235-41ad-9847-b014af25f8fe	ef73402b-dabb-448d-a1ad-713480862d35	bot	faq_list	Válasszon témát:	{"categories": [{"id": "2d299ec4-aab3-4010-b641-a26766da5c4e", "icon": "people", "name": "HR Kérdések", "slug": "hr", "color": "#3b82f6", "sort_order": 1, "description": "Munkaügyi és HR kérdések"}, {"id": "e1b1783f-ba60-411c-99ad-6257a015706d", "icon": "home", "name": "Szállás", "slug": "szallas", "color": "#10b981", "sort_order": 2, "description": "Szállással kapcsolatos kérdések"}, {"id": "de7e5d82-6982-42eb-ba52-19502c2743a6", "icon": "build", "name": "Technikai", "slug": "technikai", "color": "#f59e0b", "sort_order": 3, "description": "Technikai és IT kérdések"}, {"id": "36d7e305-19fd-4e63-b7d6-5833ae6bd45f", "icon": "info", "name": "Általános", "slug": "altalanos", "color": "#8b5cf6", "sort_order": 4, "description": "Általános információk"}]}	2026-02-21 13:58:24.534935+00
ac1aa0a7-c30a-4dee-9a54-3e9cb18718fe	ef73402b-dabb-448d-a1ad-713480862d35	user	text	test message 1	{}	2026-02-21 13:58:24.542103+00
e993c399-d199-4b2d-b35c-213f9676a8c9	ef73402b-dabb-448d-a1ad-713480862d35	bot	text	Sajnos nem találtam megfelelő választ a kérdésére. Szeretné, ha továbbítanám kérdését egy munkatársunknak?	{"source": "fallback", "response_time_ms": 3}	2026-02-21 13:58:24.546306+00
69d46d82-b716-47f0-8650-af5c6eff1037	ef73402b-dabb-448d-a1ad-713480862d35	user	text	test message 2	{}	2026-02-21 13:58:24.555825+00
d3dec6f8-5889-421d-a668-f953a2adbd91	7f7df8f5-0d1b-4ec4-bd68-261f9e6349b7	bot	faq_list	Válasszon témát:	{"categories": [{"id": "2d299ec4-aab3-4010-b641-a26766da5c4e", "icon": "people", "name": "HR Kérdések", "slug": "hr", "color": "#3b82f6", "sort_order": 1, "description": "Munkaügyi és HR kérdések"}, {"id": "e1b1783f-ba60-411c-99ad-6257a015706d", "icon": "home", "name": "Szállás", "slug": "szallas", "color": "#10b981", "sort_order": 2, "description": "Szállással kapcsolatos kérdések"}, {"id": "de7e5d82-6982-42eb-ba52-19502c2743a6", "icon": "build", "name": "Technikai", "slug": "technikai", "color": "#f59e0b", "sort_order": 3, "description": "Technikai és IT kérdések"}, {"id": "36d7e305-19fd-4e63-b7d6-5833ae6bd45f", "icon": "info", "name": "Általános", "slug": "altalanos", "color": "#8b5cf6", "sort_order": 4, "description": "Általános információk"}]}	2026-02-21 14:15:30.608673+00
ae2b7b11-974e-488e-a6ff-c66398b84e42	7f7df8f5-0d1b-4ec4-bd68-261f9e6349b7	user	text	szabadsg igenyles	{}	2026-02-21 14:15:30.622503+00
3d6089fa-02c1-4457-956e-cab1748e5b78	7f7df8f5-0d1b-4ec4-bd68-261f9e6349b7	bot	text	Szabadság kérelmét a felettesének kell benyújtania legalább 5 munkanappal előtte. Használja a Hibajegyek menüt, és válassza a HR kategóriát.	{"kb_id": "0b96c9e6-b9d7-403c-ac4b-f9994b73d35a", "source": "knowledge_base", "question": "Hogyan kérhetek szabadságot?", "response_time_ms": 12}	2026-02-21 14:15:30.636668+00
a1d947a5-31e2-4ce6-a0e0-4fea5542adc4	7f7df8f5-0d1b-4ec4-bd68-261f9e6349b7	user	text	munkido beosztas	{}	2026-02-21 14:15:30.649383+00
f63a252e-c588-4adb-9a76-03d804ed2789	7f7df8f5-0d1b-4ec4-bd68-261f9e6349b7	bot	text	A munkaidő beosztás a Naptár menüben található. Általában hétfőtől péntekig, 8:00-16:00 óráig. Műszakbeosztás esetén a vezető értesíti Önt.	{"kb_id": "47dc4f08-5e72-4d11-9e83-f44c448f3bd4", "source": "knowledge_base", "question": "Mi a munkaidő beosztás?", "response_time_ms": 4}	2026-02-21 14:15:30.655186+00
a92ceec9-86a6-4663-a922-8623f58515fb	aa5145db-4053-4682-874e-3804b8e6a4ed	bot	text	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	{}	2026-02-21 14:18:03.550389+00
625f4a62-8d21-4d62-b78a-9c1b450ea541	aa5145db-4053-4682-874e-3804b8e6a4ed	bot	faq_list	Válasszon témát:	{"categories": [{"id": "2d299ec4-aab3-4010-b641-a26766da5c4e", "icon": "people", "name": "HR Kérdések", "slug": "hr", "color": "#3b82f6", "sort_order": 1, "description": "Munkaügyi és HR kérdések"}, {"id": "e1b1783f-ba60-411c-99ad-6257a015706d", "icon": "home", "name": "Szállás", "slug": "szallas", "color": "#10b981", "sort_order": 2, "description": "Szállással kapcsolatos kérdések"}, {"id": "de7e5d82-6982-42eb-ba52-19502c2743a6", "icon": "build", "name": "Technikai", "slug": "technikai", "color": "#f59e0b", "sort_order": 3, "description": "Technikai és IT kérdések"}, {"id": "36d7e305-19fd-4e63-b7d6-5833ae6bd45f", "icon": "info", "name": "Általános", "slug": "altalanos", "color": "#8b5cf6", "sort_order": 4, "description": "Általános információk"}]}	2026-02-21 14:18:03.553486+00
ce7631a7-dcf7-4931-a868-748cb8a049a3	aa5145db-4053-4682-874e-3804b8e6a4ed	user	text	betegseg jelentes	{}	2026-02-21 14:18:03.563477+00
5df6e702-6a57-4f57-9549-692e3b467423	aa5145db-4053-4682-874e-3804b8e6a4ed	bot	options	Milyen jellegű problémát szeretne bejelenteni?	{"source": "decision_tree", "options": [{"id": "ef699283-9e36-49ee-b02d-afdc9f8b83d3", "label": "Vízszerelés (csapok, csövek, WC)", "node_type": "option"}, {"id": "7b31ddba-12f3-4185-a2fb-f2297bc1bb28", "label": "Villanyszerelés (áram, lámpa, konnektor)", "node_type": "option"}, {"id": "60a18378-1b88-4acc-8663-7c20873cf078", "label": "Fűtés / Klíma probléma", "node_type": "option"}], "tree_id": "185bace7-7467-4833-af6f-4891fe5132a7", "response_time_ms": 19}	2026-02-21 14:18:03.584843+00
cb560c24-f60c-4f27-ba0a-8d7023898271	aa5145db-4053-4682-874e-3804b8e6a4ed	user	text	mikor kapom a pihenot	{}	2026-02-21 14:18:03.594848+00
0f8ac18f-38b7-4b84-8225-c321dcad6314	aa5145db-4053-4682-874e-3804b8e6a4ed	bot	text	A munkaidő beosztás a Naptár menüben található. Általában hétfőtől péntekig, 8:00-16:00 óráig. Műszakbeosztás esetén a vezető értesíti Önt.	{"kb_id": "47dc4f08-5e72-4d11-9e83-f44c448f3bd4", "source": "knowledge_base", "question": "Mi a munkaidő beosztás?", "response_time_ms": 6}	2026-02-21 14:18:03.602628+00
5ac4c038-e091-432c-886e-19331d452673	aa5145db-4053-4682-874e-3804b8e6a4ed	user	text	csendhaboritassal mi a helyzet	{}	2026-02-21 14:18:03.610816+00
7b75adf5-3be3-4ca9-ba69-baab495b9fee	aa5145db-4053-4682-874e-3804b8e6a4ed	bot	text	A munkaidő beosztás a Naptár menüben található. Általában hétfőtől péntekig, 8:00-16:00 óráig. Műszakbeosztás esetén a vezető értesíti Önt.	{"kb_id": "47dc4f08-5e72-4d11-9e83-f44c448f3bd4", "source": "knowledge_base", "question": "Mi a munkaidő beosztás?", "response_time_ms": 4}	2026-02-21 14:18:03.615291+00
825a066f-1474-4648-9951-479643da1104	aa5145db-4053-4682-874e-3804b8e6a4ed	user	text	szallashely szabaly	{}	2026-02-21 14:18:03.623874+00
406014cc-f437-4d3f-9f2d-2d884d43f0c3	aa5145db-4053-4682-874e-3804b8e6a4ed	bot	text	A szálláson tilos a dohányzás, az éjszakai csendháborítás (22:00-6:00), és a szobákba külső személyeket bevinni. Részletes házirendet a Dokumentumok menüben talál.	{"kb_id": "de840c80-8f3b-4245-a1ca-d0b273b86abd", "source": "knowledge_base", "question": "Mik a szállás házirendjének főbb pontjai?", "response_time_ms": 3}	2026-02-21 14:18:03.628092+00
db714f92-707a-49f5-a295-3e924989a548	aa5145db-4053-4682-874e-3804b8e6a4ed	user	text	jelszo elfelejtettem	{}	2026-02-21 14:18:03.637602+00
b195ff79-b55e-40a8-95e2-a469459f4508	aa5145db-4053-4682-874e-3804b8e6a4ed	bot	text	Ha bejelentkezési problémája van: 1) Ellenőrizze az email címet és jelszót 2) Próbálja meg a "Jelszó emlékeztető" funkciót 3) Ha továbbra sem sikerül, jelezze a problémát az adminisztrátornak.	{"kb_id": "f8e19ee4-ea87-425e-b23f-df14ca4ecb8f", "source": "knowledge_base", "question": "Nem tudok bejelentkezni az alkalmazásba", "response_time_ms": 3}	2026-02-21 14:18:03.642372+00
89070cbd-7efa-4616-a719-99171e556c41	aa5145db-4053-4682-874e-3804b8e6a4ed	user	text	szabalyok haz	{}	2026-02-21 14:18:03.652383+00
2911663a-0873-4d00-9233-2df26cbdd849	aa5145db-4053-4682-874e-3804b8e6a4ed	bot	text	A szálláson tilos a dohányzás, az éjszakai csendháborítás (22:00-6:00), és a szobákba külső személyeket bevinni. Részletes házirendet a Dokumentumok menüben talál.	{"kb_id": "de840c80-8f3b-4245-a1ca-d0b273b86abd", "source": "knowledge_base", "question": "Mik a szállás házirendjének főbb pontjai?", "response_time_ms": 4}	2026-02-21 14:18:03.657329+00
45d169bc-b84d-424f-b131-a64da25f5de8	095bd56a-3b58-4539-8c6c-30a6287ed7ca	bot	text	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	{}	2026-02-21 14:19:21.370713+00
da8f94e9-111e-4901-a2ad-6933eff6e885	095bd56a-3b58-4539-8c6c-30a6287ed7ca	bot	faq_list	Válasszon témát:	{"categories": [{"id": "2d299ec4-aab3-4010-b641-a26766da5c4e", "icon": "people", "name": "HR Kérdések", "slug": "hr", "color": "#3b82f6", "sort_order": 1, "description": "Munkaügyi és HR kérdések"}, {"id": "e1b1783f-ba60-411c-99ad-6257a015706d", "icon": "home", "name": "Szállás", "slug": "szallas", "color": "#10b981", "sort_order": 2, "description": "Szállással kapcsolatos kérdések"}, {"id": "de7e5d82-6982-42eb-ba52-19502c2743a6", "icon": "build", "name": "Technikai", "slug": "technikai", "color": "#f59e0b", "sort_order": 3, "description": "Technikai és IT kérdések"}, {"id": "36d7e305-19fd-4e63-b7d6-5833ae6bd45f", "icon": "info", "name": "Általános", "slug": "altalanos", "color": "#8b5cf6", "sort_order": 4, "description": "Általános információk"}]}	2026-02-21 14:19:21.373181+00
36abcc60-fd4c-426d-b3f2-86683c66e237	095bd56a-3b58-4539-8c6c-30a6287ed7ca	user	text	szallas szabalyai	{}	2026-02-21 14:19:21.384882+00
1f0eac87-d0de-4978-88f5-f3228c1b3a49	095bd56a-3b58-4539-8c6c-30a6287ed7ca	bot	text	Szabadság kérelmét a felettesének kell benyújtania legalább 5 munkanappal előtte. Használja a Hibajegyek menüt, és válassza a HR kategóriát.	{"kb_id": "0b96c9e6-b9d7-403c-ac4b-f9994b73d35a", "source": "knowledge_base", "question": "Hogyan kérhetek szabadságot?", "response_time_ms": 3}	2026-02-21 14:19:21.409719+00
66ba578b-6f09-4309-84db-ca4cd9b8e813	095bd56a-3b58-4539-8c6c-30a6287ed7ca	user	text	hazirend kerdes	{}	2026-02-21 14:19:21.419914+00
14f30205-1bc1-4528-aa94-2902efb9a374	095bd56a-3b58-4539-8c6c-30a6287ed7ca	bot	text	A szálláson tilos a dohányzás, az éjszakai csendháborítás (22:00-6:00), és a szobákba külső személyeket bevinni. Részletes házirendet a Dokumentumok menüben talál.	{"kb_id": "de840c80-8f3b-4245-a1ca-d0b273b86abd", "source": "knowledge_base", "question": "Mik a szállás házirendjének főbb pontjai?", "response_time_ms": 3}	2026-02-21 14:19:21.424876+00
fbe1ac3e-dbd7-4046-84a9-e793652aa608	095bd56a-3b58-4539-8c6c-30a6287ed7ca	user	text	Hogyan kérhetek szabadságot?	{}	2026-02-21 14:19:21.43747+00
dd88fef7-e6a6-40ed-be52-d5e8ce17d51a	095bd56a-3b58-4539-8c6c-30a6287ed7ca	bot	text	Szabadság kérelmét a felettesének kell benyújtania legalább 5 munkanappal előtte. Használja a Hibajegyek menüt, és válassza a HR kategóriát.	{"kb_id": "0b96c9e6-b9d7-403c-ac4b-f9994b73d35a", "source": "knowledge_base", "question": "Hogyan kérhetek szabadságot?"}	2026-02-21 14:19:21.43872+00
89b735a4-e865-421b-b2c0-cd35c3d6702d	02cd55fb-1427-48ca-85ab-b6e8f74cc1e0	bot	text	Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.	{}	2026-02-21 14:20:28.315293+00
5a046299-8e18-451e-91d9-92a5269f72e4	02cd55fb-1427-48ca-85ab-b6e8f74cc1e0	bot	faq_list	Válasszon témát:	{"categories": [{"id": "2d299ec4-aab3-4010-b641-a26766da5c4e", "icon": "people", "name": "HR Kérdések", "slug": "hr", "color": "#3b82f6", "sort_order": 1, "description": "Munkaügyi és HR kérdések"}, {"id": "e1b1783f-ba60-411c-99ad-6257a015706d", "icon": "home", "name": "Szállás", "slug": "szallas", "color": "#10b981", "sort_order": 2, "description": "Szállással kapcsolatos kérdések"}, {"id": "de7e5d82-6982-42eb-ba52-19502c2743a6", "icon": "build", "name": "Technikai", "slug": "technikai", "color": "#f59e0b", "sort_order": 3, "description": "Technikai és IT kérdések"}, {"id": "36d7e305-19fd-4e63-b7d6-5833ae6bd45f", "icon": "info", "name": "Általános", "slug": "altalanos", "color": "#8b5cf6", "sort_order": 4, "description": "Általános információk"}]}	2026-02-21 14:20:28.319431+00
0fe243d1-82da-4bdd-9e00-834c8b7a6828	02cd55fb-1427-48ca-85ab-b6e8f74cc1e0	user	text	fizetes mennyi	{}	2026-02-21 14:20:28.331388+00
e674d608-13de-432c-a520-e694898c1ef4	02cd55fb-1427-48ca-85ab-b6e8f74cc1e0	bot	text	A netto fizetesed a berszamfejtesi lapon talalhato. Kerdessel fordulj a HR osztaly fele.	{"kb_id": "031784b7-e7c5-4cb0-a746-97084814aeaa", "source": "knowledge_base", "question": "Mennyi a fizetesem netto osszege?", "response_time_ms": 4}	2026-02-21 14:20:28.336294+00
09eb91ec-ae70-4c54-9a2c-9c9aae35c2b1	02cd55fb-1427-48ca-85ab-b6e8f74cc1e0	user	text	fizetesem osszeg	{}	2026-02-21 14:20:28.349038+00
9d406d3f-4775-4854-9f33-1596546281f6	02cd55fb-1427-48ca-85ab-b6e8f74cc1e0	bot	text	A netto fizetesed a berszamfejtesi lapon talalhato. Kerdessel fordulj a HR osztaly fele.	{"kb_id": "031784b7-e7c5-4cb0-a746-97084814aeaa", "source": "knowledge_base", "question": "Mennyi a fizetesem netto osszege?", "response_time_ms": 4}	2026-02-21 14:20:28.354352+00
919ccb7d-941a-44f5-a99b-e6a20c0192d8	02cd55fb-1427-48ca-85ab-b6e8f74cc1e0	user	text	netto ber kerdes	{}	2026-02-21 14:20:28.364402+00
185bf846-84ed-4ff3-8bd1-212655a07405	02cd55fb-1427-48ca-85ab-b6e8f74cc1e0	bot	text	A netto fizetesed a berszamfejtesi lapon talalhato. Kerdessel fordulj a HR osztaly fele.	{"kb_id": "d9f31647-d814-4c1d-90fd-99f264f9a28f", "source": "knowledge_base", "question": "Mennyi a fizetesem netto osszege?", "response_time_ms": 3}	2026-02-21 14:20:28.369141+00
297b24e8-8844-436f-b0c1-217321b52140	02cd55fb-1427-48ca-85ab-b6e8f74cc1e0	user	text	mennyi netto fizetes	{}	2026-02-21 14:20:28.379865+00
6e68700f-6c02-48d6-b06c-2e185ca6e97d	02cd55fb-1427-48ca-85ab-b6e8f74cc1e0	bot	text	A netto fizetesed a berszamfejtesi lapon talalhato. Kerdessel fordulj a HR osztaly fele.	{"kb_id": "031784b7-e7c5-4cb0-a746-97084814aeaa", "source": "knowledge_base", "question": "Mennyi a fizetesem netto osszege?", "response_time_ms": 2}	2026-02-21 14:20:28.383826+00
1f88f14d-e681-44a0-88c1-624013f6e1eb	02cd55fb-1427-48ca-85ab-b6e8f74cc1e0	user	text	a fizetesem mennyi	{}	2026-02-21 14:20:28.392794+00
621b7ba5-fb99-46e1-b52a-490a0ea4d28b	02cd55fb-1427-48ca-85ab-b6e8f74cc1e0	bot	text	A netto fizetesed a berszamfejtesi lapon talalhato. Kerdessel fordulj a HR osztaly fele.	{"kb_id": "d9f31647-d814-4c1d-90fd-99f264f9a28f", "source": "knowledge_base", "question": "Mennyi a fizetesem netto osszege?", "response_time_ms": 3}	2026-02-21 14:20:28.3969+00
7b8cf324-0f98-48cb-982f-88fb0a4bf663	02cd55fb-1427-48ca-85ab-b6e8f74cc1e0	user	text	netto osszeg	{}	2026-02-21 14:20:28.405708+00
cae1e727-9b64-4524-92ba-e69afa5620b8	02cd55fb-1427-48ca-85ab-b6e8f74cc1e0	bot	text	A netto fizetesed a berszamfejtesi lapon talalhato. Kerdessel fordulj a HR osztaly fele.	{"kb_id": "031784b7-e7c5-4cb0-a746-97084814aeaa", "source": "knowledge_base", "question": "Mennyi a fizetesem netto osszege?", "response_time_ms": 3}	2026-02-21 14:20:28.410329+00
0dbfcee0-2a89-454b-a568-99d534cd5531	02cd55fb-1427-48ca-85ab-b6e8f74cc1e0	user	text	Mennyi a fizetesem netto osszege?	{}	2026-02-21 14:20:28.420663+00
a5ee6305-d363-4e8a-bcdb-cbc89c55b976	02cd55fb-1427-48ca-85ab-b6e8f74cc1e0	bot	text	A netto fizetesed a berszamfejtesi lapon talalhato. Kerdessel fordulj a HR osztaly fele.	{"kb_id": "d9f31647-d814-4c1d-90fd-99f264f9a28f", "source": "knowledge_base", "question": "Mennyi a fizetesem netto osszege?"}	2026-02-21 14:20:28.422765+00
\.


--
-- Data for Name: contractors; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.contractors (id, name, slug, email, phone, address, is_active, created_at, updated_at) FROM stdin;
1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	ABC Kereskedelmi Kft.	abc-kft	info@abc-kft.hu	+36 1 234 5678	1055 Budapest, Kossuth Lajos tér 1.	t	2026-02-21 09:28:36.093901	2026-02-21 09:28:36.093901
\.


--
-- Data for Name: cost_centers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.cost_centers (id, contractor_id, name, code, description, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: documents; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.documents (id, tenant_id, employee_id, uploaded_by, title, description, file_path, file_name, file_size, mime_type, document_type, is_private, created_at, deleted_at, updated_at) FROM stdin;
\.


--
-- Data for Name: email_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.email_logs (id, contractor_id, to_email, subject, body, status, error_message, sent_at, created_at) FROM stdin;
\.


--
-- Data for Name: employee_documents; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.employee_documents (id, employee_id, document_type, file_name, file_path, file_size, mime_type, thumbnail_path, uploaded_by, uploaded_at, notes, scanned_file_path) FROM stdin;
\.


--
-- Data for Name: employee_notes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.employee_notes (id, employee_id, created_by, note_type, title, content, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: employee_status_types; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.employee_status_types (id, name, slug, description, color) FROM stdin;
ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Aktív	active	Aktív munkaviszony	#10b981
b7c28743-1740-4c82-a15f-91fb033fd7cd	Felfüggesztett	suspended	Felfüggesztett státusz	#f97316
c5d51752-dff2-4728-a944-c3692937106f	Kilépett	left	Megszűnt munkaviszony	#ef4444
80b828b8-e846-455b-b9ac-36a60a30d6d3	Szabadságon	paid_leave	Fizetett szabadságon	#3b82f6
f2254bf6-b3ef-48f6-b5ee-a8f9ac2d9fed	Várakozó	waiting	Várakozó státusz	#94a3b8
\.


--
-- Data for Name: employees; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.employees (id, contractor_id, user_id, organizational_unit_id, employee_number, status_id, "position", start_date, end_date, notes, created_at, updated_at, accommodation_id, first_name, last_name, gender, birth_date, birth_place, mothers_name, tax_id, passport_number, social_security_number, marital_status, arrival_date, visa_expiry, room_number, bank_account, workplace, permanent_address_zip, permanent_address_country, permanent_address_county, permanent_address_city, permanent_address_street, permanent_address_number, company_name, company_email, company_phone, room_id, profile_photo_url) FROM stdin;
ad533842-ded2-424f-802a-60fcbe0de2b2	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	eb3c7373-4de4-4645-a83b-22c56452b288	\N	EMP-0001	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Gépkezelő	2025-06-01	\N	\N	2026-02-21 09:28:36.093901	2026-02-21 09:28:36.093901	ce612502-f8b9-4988-bb46-295d4f9cff6b	Horváth	Gábor	male	1990-03-15	Budapest	Nagy Mária	\N	\N	\N	\N	2025-05-28	\N	101	\N	Budapest	\N	\N	\N	\N	\N	\N	ABC Kereskedelmi Kft.	\N	\N	b4888603-1870-4196-ad56-4c55471e98d7	\N
eb44d39f-d42c-426c-a4d4-575372440140	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	5a6b0436-f78e-4ebe-a4de-5dc76d626589	\N	EMP-0002	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Adminisztrátor	2025-07-15	\N	\N	2026-02-21 09:28:36.093901	2026-02-21 09:28:36.093901	ce612502-f8b9-4988-bb46-295d4f9cff6b	Molnár	Zsuzsanna	female	1988-07-22	Debrecen	Tóth Erzsébet	\N	\N	\N	\N	2025-07-12	\N	102	\N	Budapest	\N	\N	\N	\N	\N	\N	ABC Kereskedelmi Kft.	\N	\N	7c65ce89-c2e7-4a79-8cac-311051629c78	\N
fcf3a190-6ad1-4265-a24d-39b41b80eecd	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	c8372a2c-1038-4ea9-ae81-a2cee92b1187	\N	EMP-0003	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Raktáros	2025-09-01	\N	\N	2026-02-21 09:28:36.093901	2026-02-21 09:28:36.093901	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Varga	István	male	1995-11-08	Szeged	Kovács Anna	\N	\N	\N	\N	2025-08-29	\N	101	\N	Budapest	\N	\N	\N	\N	\N	\N	ABC Kereskedelmi Kft.	\N	\N	02137110-1f01-4ea8-9652-cb3057178ec0	\N
6eb60709-cf9e-40a4-8a52-4b5bfb22227c	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	09a1a353-05be-47bc-9217-ae929eee1f99	\N	EMP-0004	80b828b8-e846-455b-b9ac-36a60a30d6d3	Takarító	2025-04-01	\N	\N	2026-02-21 09:28:36.093901	2026-02-21 09:28:36.093901	ce612502-f8b9-4988-bb46-295d4f9cff6b	Farkas	Katalin	female	1992-01-30	Pécs	Szabó Ilona	\N	\N	\N	\N	2025-03-28	\N	201	\N	Budapest	\N	\N	\N	\N	\N	\N	ABC Kereskedelmi Kft.	\N	\N	35af414c-1808-4056-8fcf-0bdfd33b9862	\N
8a602b44-16b1-4ce5-8e1a-9a26be13cd5b	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	5c9c01d1-6fd6-4990-80d6-e4336c21ab8d	\N	EMP-0005	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Karbantartó	2025-10-15	\N	\N	2026-02-21 09:28:36.093901	2026-02-21 09:28:36.093901	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Németh	Péter	male	1985-09-12	Győr	Kiss Katalin	\N	\N	\N	\N	2025-10-12	\N	102	\N	Budapest	\N	\N	\N	\N	\N	\N	ABC Kereskedelmi Kft.	\N	\N	13ad850c-f7c6-4b1c-8119-b2a785a56673	\N
\.


--
-- Data for Name: google_calendar_sync_map; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.google_calendar_sync_map (id, user_id, local_event_id, local_event_type, google_event_id, google_calendar_id, sync_direction, last_synced_at, local_updated_at, google_updated_at, created_at) FROM stdin;
\.


--
-- Data for Name: google_calendar_tokens; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.google_calendar_tokens (id, user_id, access_token, refresh_token, token_expiry, google_email, calendar_id, webhook_channel_id, webhook_resource_id, webhook_expiry, last_sync_at, sync_enabled, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: medical_appointments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.medical_appointments (id, employee_id, appointment_date, appointment_time, doctor_name, clinic_location, appointment_type, notes, reminder_sent, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: notification_templates; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notification_templates (id, contractor_id, name, slug, subject, body_html, body_text, event_type, language, is_active, created_at, updated_at, available_variables) FROM stdin;
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notifications (id, contractor_id, user_id, type, title, message, data, is_read, read_at, sent_at, created_at, link) FROM stdin;
\.


--
-- Data for Name: organizational_units; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.organizational_units (id, contractor_id, name, parent_id, manager_id, description, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: permissions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.permissions (id, name, slug, module, description, created_at, display_name, action) FROM stdin;
2f211870-75a8-4186-ba2d-5aa02a5b6225	Munkavállalók megtekintése	employees.view	employees	Munkavállalók listájának és részleteinek megtekintése	2026-02-23 09:50:18.208443	Munkavállalók megtekintése	view
de9e048f-42a7-492e-85d8-d28259357c9a	Munkavállaló létrehozása	employees.create	employees	Új munkavállaló hozzáadása a rendszerhez	2026-02-23 09:50:18.208443	Munkavállaló létrehozása	create
9e981b8d-241b-4b16-8b66-81fe69040858	Munkavállaló szerkesztése	employees.edit	employees	Meglévő munkavállaló adatainak módosítása	2026-02-23 09:50:18.208443	Munkavállaló szerkesztése	edit
2daea9b5-273b-4e4b-b0ea-8d0ce787e1a1	Munkavállaló törlése	employees.delete	employees	Munkavállaló eltávolítása a rendszerből	2026-02-23 09:50:18.208443	Munkavállaló törlése	delete
1d932ffc-f89b-4f5b-9178-ffcd59d36c42	Munkavállalók exportálása	employees.export	employees	Munkavállalók adatainak exportálása fájlba	2026-02-23 09:50:18.208443	Munkavállalók exportálása	export
0a2e7d59-3c16-429f-9f55-2df9534481d8	Munkavállaló dokumentum feltöltés	employees.upload_documents	employees	Dokumentumok feltöltése munkavállalókhoz	2026-02-23 09:50:18.208443	Dokumentum feltöltés	upload_documents
34f91373-ed03-40b2-9352-ec5a43c0b7f3	Hibajegyek megtekintése	tickets.view	tickets	Hibajegyek listájának és részleteinek megtekintése	2026-02-23 09:50:18.208443	Hibajegyek megtekintése	view
c92326e7-9946-4176-babc-8e0c0f89d4c3	Hibajegy létrehozása	tickets.create	tickets	Új hibajegy létrehozása	2026-02-23 09:50:18.208443	Hibajegy létrehozása	create
b9744580-9691-4a52-86ad-9cdee9b26edc	Hibajegy szerkesztése	tickets.edit	tickets	Meglévő hibajegy módosítása	2026-02-23 09:50:18.208443	Hibajegy szerkesztése	edit
6e618b43-5ac2-4aef-9445-981d07329274	Hibajegy törlése	tickets.delete	tickets	Hibajegy eltávolítása	2026-02-23 09:50:18.208443	Hibajegy törlése	delete
ed8ab0b1-57c6-49cf-ba90-0997449e10fa	Hibajegy kiosztása	tickets.assign	tickets	Hibajegy hozzárendelése felhasználóhoz	2026-02-23 09:50:18.208443	Hibajegy kiosztása	assign
6c1dc67e-2cc3-4e61-9da9-4d4c546308da	Hibajegy státusz változtatás	tickets.change_status	tickets	Hibajegy státuszának módosítása	2026-02-23 09:50:18.208443	Státusz változtatás	change_status
22063327-c485-4555-a48d-97a32cb6b748	Szálláshelyek megtekintése	accommodations.view	accommodations	Szálláshelyek listájának és részleteinek megtekintése	2026-02-23 09:50:18.208443	Szálláshelyek megtekintése	view
6f94450c-db1e-4b43-adf8-3a16ee053242	Szálláshely létrehozása	accommodations.create	accommodations	Új szálláshely hozzáadása	2026-02-23 09:50:18.208443	Szálláshely létrehozása	create
6572fee4-1001-46e1-8480-9981a2024567	Szálláshely szerkesztése	accommodations.edit	accommodations	Meglévő szálláshely módosítása	2026-02-23 09:50:18.208443	Szálláshely szerkesztése	edit
f313930e-aa67-4423-84e7-c6c5e592aa83	Szálláshely törlése	accommodations.delete	accommodations	Szálláshely eltávolítása	2026-02-23 09:50:18.208443	Szálláshely törlése	delete
0dc47944-2d5f-416d-b500-d65c18bdab81	Riportok megtekintése	reports.view	reports	Riportok megtekintése és futtatása	2026-02-23 09:50:18.208443	Riportok megtekintése	view
0a1037dc-9189-4251-9f9f-9153c3af02bf	Riport létrehozása	reports.create	reports	Új egyedi riport létrehozása	2026-02-23 09:50:18.208443	Riport létrehozása	create
e814dd94-a42e-4c16-bf3d-3c6057df8342	Riport exportálása	reports.export	reports	Riportok exportálása fájlba	2026-02-23 09:50:18.208443	Riport exportálása	export
b0e955a5-5508-4655-b74f-a08bc2a80c1f	Riport ütemezése	reports.schedule	reports	Automatikus riport ütemezés beállítása	2026-02-23 09:50:18.208443	Riport ütemezése	schedule
3cf76d1c-4da0-4b70-80de-410138669cb8	Felhasználók megtekintése	users.view	users	Felhasználók listájának megtekintése	2026-02-23 09:50:18.208443	Felhasználók megtekintése	view
5cce126a-2db5-4fd2-aba0-5e8227ac0cb7	Felhasználó létrehozása	users.create	users	Új felhasználó regisztrálása	2026-02-23 09:50:18.208443	Felhasználó létrehozása	create
7f20f5f3-3186-4615-97e8-90145487f235	Felhasználó szerkesztése	users.edit	users	Felhasználó adatainak módosítása	2026-02-23 09:50:18.208443	Felhasználó szerkesztése	edit
b0b916a7-8578-4594-9371-7d2c02c159c0	Felhasználó törlése	users.delete	users	Felhasználó eltávolítása	2026-02-23 09:50:18.208443	Felhasználó törlése	delete
3b5367b6-8487-4777-8596-1707bbc1d9c0	Jogosultság kezelés	users.manage_permissions	users	Felhasználói jogosultságok és szerepkörök kezelése	2026-02-23 09:50:18.208443	Jogosultság kezelés	manage_permissions
7b994487-35fa-40e3-b7c6-12a4b9d9ee49	Beállítások megtekintése	settings.view	settings	Rendszer beállítások megtekintése	2026-02-23 09:50:18.208443	Beállítások megtekintése	view
95291aa7-e687-417b-9875-5fa9b4ed9d4e	Beállítások szerkesztése	settings.edit	settings	Rendszer beállítások módosítása	2026-02-23 09:50:18.208443	Beállítások szerkesztése	edit
5b5d8294-1a38-4ec7-a056-63256d476d18	Dashboard megtekintése	dashboard.view	dashboard	Irányítópult megtekintése	2026-02-23 09:50:18.208443	Dashboard megtekintése	view
28f76ecf-b188-4cb7-b21e-0dab2e8cc73f	Dashboard testreszabás	dashboard.customize	dashboard	Irányítópult elrendezésének módosítása	2026-02-23 09:50:18.208443	Dashboard testreszabás	customize
82cc26ca-5778-47e5-a2bd-a4113d4e2ad9	Dokumentumok megtekintése	documents.view	documents	Dokumentumok listájának megtekintése és letöltése	2026-02-23 09:50:18.208443	Dokumentumok megtekintése	view
e212df63-f8f5-4a46-8d99-1f7860b8a2bd	Dokumentum feltöltése	documents.upload	documents	Új dokumentum feltöltése	2026-02-23 09:50:18.208443	Dokumentum feltöltése	upload
721013f9-a723-453c-9ead-b6150d586e28	Dokumentum törlése	documents.delete	documents	Dokumentum eltávolítása	2026-02-23 09:50:18.208443	Dokumentum törlése	delete
8ac266bd-8bfd-4e7c-b619-e3ce76548f7e	Naptár megtekintése	calendar.view	calendar	Naptár események megtekintése	2026-02-23 09:50:18.208443	Naptár megtekintése	view
26a6db07-2144-4c25-88a1-6380a91b79c2	Naptár esemény létrehozása	calendar.create	calendar	Új naptár esemény létrehozása	2026-02-23 09:50:18.208443	Esemény létrehozása	create
e611e512-d3ad-4732-90a9-5310d97e0562	Naptár esemény szerkesztése	calendar.edit	calendar	Naptár esemény módosítása	2026-02-23 09:50:18.208443	Esemény szerkesztése	edit
b1568656-909e-465c-bcb5-f5ef0077631b	Naptár esemény törlése	calendar.delete	calendar	Naptár esemény eltávolítása	2026-02-23 09:50:18.208443	Esemény törlése	delete
4cc925cd-e365-4417-8d40-4e722ce018c2	Google naptár szinkronizálás	calendar.sync_google	calendar	Google naptár szinkronizálás kezelése	2026-02-23 09:50:18.208443	Google szinkron	sync_google
9a34ac79-1436-4b8f-8ebe-c5090661cf7d	Videók megtekintése	videos.view	videos	Oktatóvideók megtekintése	2026-02-23 09:50:18.208443	Videók megtekintése	view
3498ee5c-cca9-47c3-936b-ded1f729fa2f	Videó létrehozása	videos.create	videos	Új oktatóvideó hozzáadása	2026-02-23 09:50:18.208443	Videó létrehozása	create
9a105407-7153-43c6-8dd8-2f4cb8adaeb7	Videó szerkesztése	videos.edit	videos	Oktatóvideó módosítása	2026-02-23 09:50:18.208443	Videó szerkesztése	edit
d5b113f6-621f-49eb-98e9-1b17fcbc8f2b	Videó törlése	videos.delete	videos	Oktatóvideó eltávolítása	2026-02-23 09:50:18.208443	Videó törlése	delete
6b4ab3f0-6ec2-4f23-ac02-d3f7aa7c615e	FAQ megtekintése	faq.view	faq	GYIK bejegyzések megtekintése	2026-02-23 09:50:18.208443	FAQ megtekintése	view
0b102810-5061-4184-8173-73a09bedd271	FAQ szerkesztése	faq.edit	faq	GYIK bejegyzések szerkesztése	2026-02-23 09:50:18.208443	FAQ szerkesztése	edit
e3251e61-46ed-478f-ae06-fc21abd57a74	FAQ videók kezelése	faq.manage_videos	faq	FAQ-hoz kapcsolódó videók kezelése	2026-02-23 09:50:18.208443	FAQ videók kezelése	manage_videos
\.


--
-- Data for Name: personal_events; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.personal_events (id, employee_id, event_date, event_time, event_type, title, description, all_day, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: priorities; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.priorities (id, name, slug, level, color, created_at) FROM stdin;
e3127504-6ec1-457d-8605-bd01e8891dc9	Kritikus	critical	4	#ef4444	2026-02-21 09:28:36.093901
a9e00d45-c75a-44b7-9164-1456d0e28a01	Sürgős	urgent	3	#f59e0b	2026-02-21 09:28:36.093901
4b876cca-55f6-467d-972f-069cdbbc68d3	Normál	normal	2	#64748b	2026-02-21 09:28:36.093901
33b9fcee-f17d-462c-b550-befeeaa14595	Alacsony	low	1	#10b981	2026-02-21 09:28:36.093901
\.


--
-- Data for Name: projects; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.projects (id, contractor_id, name, code, cost_center_id, manager_id, start_date, end_date, budget, status, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: role_permissions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.role_permissions (role_id, permission_id) FROM stdin;
11339aa9-1791-43d3-be36-83c0be662bc6	2f211870-75a8-4186-ba2d-5aa02a5b6225
11339aa9-1791-43d3-be36-83c0be662bc6	de9e048f-42a7-492e-85d8-d28259357c9a
11339aa9-1791-43d3-be36-83c0be662bc6	9e981b8d-241b-4b16-8b66-81fe69040858
11339aa9-1791-43d3-be36-83c0be662bc6	2daea9b5-273b-4e4b-b0ea-8d0ce787e1a1
11339aa9-1791-43d3-be36-83c0be662bc6	1d932ffc-f89b-4f5b-9178-ffcd59d36c42
11339aa9-1791-43d3-be36-83c0be662bc6	0a2e7d59-3c16-429f-9f55-2df9534481d8
11339aa9-1791-43d3-be36-83c0be662bc6	34f91373-ed03-40b2-9352-ec5a43c0b7f3
11339aa9-1791-43d3-be36-83c0be662bc6	c92326e7-9946-4176-babc-8e0c0f89d4c3
11339aa9-1791-43d3-be36-83c0be662bc6	b9744580-9691-4a52-86ad-9cdee9b26edc
11339aa9-1791-43d3-be36-83c0be662bc6	6e618b43-5ac2-4aef-9445-981d07329274
11339aa9-1791-43d3-be36-83c0be662bc6	ed8ab0b1-57c6-49cf-ba90-0997449e10fa
11339aa9-1791-43d3-be36-83c0be662bc6	6c1dc67e-2cc3-4e61-9da9-4d4c546308da
11339aa9-1791-43d3-be36-83c0be662bc6	22063327-c485-4555-a48d-97a32cb6b748
11339aa9-1791-43d3-be36-83c0be662bc6	6f94450c-db1e-4b43-adf8-3a16ee053242
11339aa9-1791-43d3-be36-83c0be662bc6	6572fee4-1001-46e1-8480-9981a2024567
11339aa9-1791-43d3-be36-83c0be662bc6	f313930e-aa67-4423-84e7-c6c5e592aa83
11339aa9-1791-43d3-be36-83c0be662bc6	0dc47944-2d5f-416d-b500-d65c18bdab81
11339aa9-1791-43d3-be36-83c0be662bc6	0a1037dc-9189-4251-9f9f-9153c3af02bf
11339aa9-1791-43d3-be36-83c0be662bc6	e814dd94-a42e-4c16-bf3d-3c6057df8342
11339aa9-1791-43d3-be36-83c0be662bc6	b0e955a5-5508-4655-b74f-a08bc2a80c1f
11339aa9-1791-43d3-be36-83c0be662bc6	3cf76d1c-4da0-4b70-80de-410138669cb8
11339aa9-1791-43d3-be36-83c0be662bc6	5cce126a-2db5-4fd2-aba0-5e8227ac0cb7
11339aa9-1791-43d3-be36-83c0be662bc6	7f20f5f3-3186-4615-97e8-90145487f235
11339aa9-1791-43d3-be36-83c0be662bc6	b0b916a7-8578-4594-9371-7d2c02c159c0
11339aa9-1791-43d3-be36-83c0be662bc6	3b5367b6-8487-4777-8596-1707bbc1d9c0
11339aa9-1791-43d3-be36-83c0be662bc6	7b994487-35fa-40e3-b7c6-12a4b9d9ee49
11339aa9-1791-43d3-be36-83c0be662bc6	95291aa7-e687-417b-9875-5fa9b4ed9d4e
11339aa9-1791-43d3-be36-83c0be662bc6	5b5d8294-1a38-4ec7-a056-63256d476d18
11339aa9-1791-43d3-be36-83c0be662bc6	28f76ecf-b188-4cb7-b21e-0dab2e8cc73f
11339aa9-1791-43d3-be36-83c0be662bc6	82cc26ca-5778-47e5-a2bd-a4113d4e2ad9
11339aa9-1791-43d3-be36-83c0be662bc6	e212df63-f8f5-4a46-8d99-1f7860b8a2bd
11339aa9-1791-43d3-be36-83c0be662bc6	721013f9-a723-453c-9ead-b6150d586e28
11339aa9-1791-43d3-be36-83c0be662bc6	8ac266bd-8bfd-4e7c-b619-e3ce76548f7e
11339aa9-1791-43d3-be36-83c0be662bc6	26a6db07-2144-4c25-88a1-6380a91b79c2
11339aa9-1791-43d3-be36-83c0be662bc6	e611e512-d3ad-4732-90a9-5310d97e0562
11339aa9-1791-43d3-be36-83c0be662bc6	b1568656-909e-465c-bcb5-f5ef0077631b
11339aa9-1791-43d3-be36-83c0be662bc6	4cc925cd-e365-4417-8d40-4e722ce018c2
11339aa9-1791-43d3-be36-83c0be662bc6	9a34ac79-1436-4b8f-8ebe-c5090661cf7d
11339aa9-1791-43d3-be36-83c0be662bc6	3498ee5c-cca9-47c3-936b-ded1f729fa2f
11339aa9-1791-43d3-be36-83c0be662bc6	9a105407-7153-43c6-8dd8-2f4cb8adaeb7
11339aa9-1791-43d3-be36-83c0be662bc6	d5b113f6-621f-49eb-98e9-1b17fcbc8f2b
11339aa9-1791-43d3-be36-83c0be662bc6	6b4ab3f0-6ec2-4f23-ac02-d3f7aa7c615e
11339aa9-1791-43d3-be36-83c0be662bc6	0b102810-5061-4184-8173-73a09bedd271
11339aa9-1791-43d3-be36-83c0be662bc6	e3251e61-46ed-478f-ae06-fc21abd57a74
c3942660-f261-428a-b3e7-e95c5e906787	2f211870-75a8-4186-ba2d-5aa02a5b6225
c3942660-f261-428a-b3e7-e95c5e906787	de9e048f-42a7-492e-85d8-d28259357c9a
c3942660-f261-428a-b3e7-e95c5e906787	9e981b8d-241b-4b16-8b66-81fe69040858
c3942660-f261-428a-b3e7-e95c5e906787	2daea9b5-273b-4e4b-b0ea-8d0ce787e1a1
c3942660-f261-428a-b3e7-e95c5e906787	1d932ffc-f89b-4f5b-9178-ffcd59d36c42
c3942660-f261-428a-b3e7-e95c5e906787	0a2e7d59-3c16-429f-9f55-2df9534481d8
c3942660-f261-428a-b3e7-e95c5e906787	34f91373-ed03-40b2-9352-ec5a43c0b7f3
c3942660-f261-428a-b3e7-e95c5e906787	c92326e7-9946-4176-babc-8e0c0f89d4c3
c3942660-f261-428a-b3e7-e95c5e906787	b9744580-9691-4a52-86ad-9cdee9b26edc
c3942660-f261-428a-b3e7-e95c5e906787	6e618b43-5ac2-4aef-9445-981d07329274
c3942660-f261-428a-b3e7-e95c5e906787	ed8ab0b1-57c6-49cf-ba90-0997449e10fa
c3942660-f261-428a-b3e7-e95c5e906787	6c1dc67e-2cc3-4e61-9da9-4d4c546308da
c3942660-f261-428a-b3e7-e95c5e906787	22063327-c485-4555-a48d-97a32cb6b748
c3942660-f261-428a-b3e7-e95c5e906787	6f94450c-db1e-4b43-adf8-3a16ee053242
c3942660-f261-428a-b3e7-e95c5e906787	6572fee4-1001-46e1-8480-9981a2024567
c3942660-f261-428a-b3e7-e95c5e906787	f313930e-aa67-4423-84e7-c6c5e592aa83
c3942660-f261-428a-b3e7-e95c5e906787	0dc47944-2d5f-416d-b500-d65c18bdab81
c3942660-f261-428a-b3e7-e95c5e906787	0a1037dc-9189-4251-9f9f-9153c3af02bf
c3942660-f261-428a-b3e7-e95c5e906787	e814dd94-a42e-4c16-bf3d-3c6057df8342
c3942660-f261-428a-b3e7-e95c5e906787	b0e955a5-5508-4655-b74f-a08bc2a80c1f
c3942660-f261-428a-b3e7-e95c5e906787	3cf76d1c-4da0-4b70-80de-410138669cb8
c3942660-f261-428a-b3e7-e95c5e906787	5cce126a-2db5-4fd2-aba0-5e8227ac0cb7
c3942660-f261-428a-b3e7-e95c5e906787	7f20f5f3-3186-4615-97e8-90145487f235
c3942660-f261-428a-b3e7-e95c5e906787	b0b916a7-8578-4594-9371-7d2c02c159c0
c3942660-f261-428a-b3e7-e95c5e906787	7b994487-35fa-40e3-b7c6-12a4b9d9ee49
c3942660-f261-428a-b3e7-e95c5e906787	95291aa7-e687-417b-9875-5fa9b4ed9d4e
c3942660-f261-428a-b3e7-e95c5e906787	5b5d8294-1a38-4ec7-a056-63256d476d18
c3942660-f261-428a-b3e7-e95c5e906787	28f76ecf-b188-4cb7-b21e-0dab2e8cc73f
c3942660-f261-428a-b3e7-e95c5e906787	82cc26ca-5778-47e5-a2bd-a4113d4e2ad9
c3942660-f261-428a-b3e7-e95c5e906787	e212df63-f8f5-4a46-8d99-1f7860b8a2bd
c3942660-f261-428a-b3e7-e95c5e906787	721013f9-a723-453c-9ead-b6150d586e28
c3942660-f261-428a-b3e7-e95c5e906787	8ac266bd-8bfd-4e7c-b619-e3ce76548f7e
c3942660-f261-428a-b3e7-e95c5e906787	26a6db07-2144-4c25-88a1-6380a91b79c2
c3942660-f261-428a-b3e7-e95c5e906787	e611e512-d3ad-4732-90a9-5310d97e0562
c3942660-f261-428a-b3e7-e95c5e906787	b1568656-909e-465c-bcb5-f5ef0077631b
c3942660-f261-428a-b3e7-e95c5e906787	4cc925cd-e365-4417-8d40-4e722ce018c2
c3942660-f261-428a-b3e7-e95c5e906787	9a34ac79-1436-4b8f-8ebe-c5090661cf7d
c3942660-f261-428a-b3e7-e95c5e906787	3498ee5c-cca9-47c3-936b-ded1f729fa2f
c3942660-f261-428a-b3e7-e95c5e906787	9a105407-7153-43c6-8dd8-2f4cb8adaeb7
c3942660-f261-428a-b3e7-e95c5e906787	d5b113f6-621f-49eb-98e9-1b17fcbc8f2b
c3942660-f261-428a-b3e7-e95c5e906787	6b4ab3f0-6ec2-4f23-ac02-d3f7aa7c615e
c3942660-f261-428a-b3e7-e95c5e906787	0b102810-5061-4184-8173-73a09bedd271
c3942660-f261-428a-b3e7-e95c5e906787	e3251e61-46ed-478f-ae06-fc21abd57a74
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	2f211870-75a8-4186-ba2d-5aa02a5b6225
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	de9e048f-42a7-492e-85d8-d28259357c9a
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	9e981b8d-241b-4b16-8b66-81fe69040858
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	2daea9b5-273b-4e4b-b0ea-8d0ce787e1a1
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	1d932ffc-f89b-4f5b-9178-ffcd59d36c42
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	0a2e7d59-3c16-429f-9f55-2df9534481d8
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	34f91373-ed03-40b2-9352-ec5a43c0b7f3
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	c92326e7-9946-4176-babc-8e0c0f89d4c3
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	b9744580-9691-4a52-86ad-9cdee9b26edc
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	ed8ab0b1-57c6-49cf-ba90-0997449e10fa
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	6c1dc67e-2cc3-4e61-9da9-4d4c546308da
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	22063327-c485-4555-a48d-97a32cb6b748
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	6f94450c-db1e-4b43-adf8-3a16ee053242
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	6572fee4-1001-46e1-8480-9981a2024567
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	f313930e-aa67-4423-84e7-c6c5e592aa83
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	0dc47944-2d5f-416d-b500-d65c18bdab81
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	e814dd94-a42e-4c16-bf3d-3c6057df8342
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	3cf76d1c-4da0-4b70-80de-410138669cb8
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	7b994487-35fa-40e3-b7c6-12a4b9d9ee49
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	5b5d8294-1a38-4ec7-a056-63256d476d18
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	28f76ecf-b188-4cb7-b21e-0dab2e8cc73f
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	82cc26ca-5778-47e5-a2bd-a4113d4e2ad9
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	e212df63-f8f5-4a46-8d99-1f7860b8a2bd
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	721013f9-a723-453c-9ead-b6150d586e28
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	8ac266bd-8bfd-4e7c-b619-e3ce76548f7e
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	26a6db07-2144-4c25-88a1-6380a91b79c2
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	e611e512-d3ad-4732-90a9-5310d97e0562
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	b1568656-909e-465c-bcb5-f5ef0077631b
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	9a34ac79-1436-4b8f-8ebe-c5090661cf7d
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	3498ee5c-cca9-47c3-936b-ded1f729fa2f
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	9a105407-7153-43c6-8dd8-2f4cb8adaeb7
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	d5b113f6-621f-49eb-98e9-1b17fcbc8f2b
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	6b4ab3f0-6ec2-4f23-ac02-d3f7aa7c615e
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	0b102810-5061-4184-8173-73a09bedd271
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	e3251e61-46ed-478f-ae06-fc21abd57a74
22437ca4-4f3c-4866-b2a2-a612a2c84289	2f211870-75a8-4186-ba2d-5aa02a5b6225
22437ca4-4f3c-4866-b2a2-a612a2c84289	34f91373-ed03-40b2-9352-ec5a43c0b7f3
22437ca4-4f3c-4866-b2a2-a612a2c84289	c92326e7-9946-4176-babc-8e0c0f89d4c3
22437ca4-4f3c-4866-b2a2-a612a2c84289	b9744580-9691-4a52-86ad-9cdee9b26edc
22437ca4-4f3c-4866-b2a2-a612a2c84289	6c1dc67e-2cc3-4e61-9da9-4d4c546308da
22437ca4-4f3c-4866-b2a2-a612a2c84289	22063327-c485-4555-a48d-97a32cb6b748
22437ca4-4f3c-4866-b2a2-a612a2c84289	5b5d8294-1a38-4ec7-a056-63256d476d18
22437ca4-4f3c-4866-b2a2-a612a2c84289	82cc26ca-5778-47e5-a2bd-a4113d4e2ad9
22437ca4-4f3c-4866-b2a2-a612a2c84289	8ac266bd-8bfd-4e7c-b619-e3ce76548f7e
22437ca4-4f3c-4866-b2a2-a612a2c84289	26a6db07-2144-4c25-88a1-6380a91b79c2
22437ca4-4f3c-4866-b2a2-a612a2c84289	e611e512-d3ad-4732-90a9-5310d97e0562
22437ca4-4f3c-4866-b2a2-a612a2c84289	b1568656-909e-465c-bcb5-f5ef0077631b
22437ca4-4f3c-4866-b2a2-a612a2c84289	9a34ac79-1436-4b8f-8ebe-c5090661cf7d
22437ca4-4f3c-4866-b2a2-a612a2c84289	6b4ab3f0-6ec2-4f23-ac02-d3f7aa7c615e
a40987d1-7941-48c4-b025-9c0efad9a14f	34f91373-ed03-40b2-9352-ec5a43c0b7f3
a40987d1-7941-48c4-b025-9c0efad9a14f	6c1dc67e-2cc3-4e61-9da9-4d4c546308da
a40987d1-7941-48c4-b025-9c0efad9a14f	5b5d8294-1a38-4ec7-a056-63256d476d18
a40987d1-7941-48c4-b025-9c0efad9a14f	6b4ab3f0-6ec2-4f23-ac02-d3f7aa7c615e
7083e094-9a2a-47ef-bba5-223c45f6083a	34f91373-ed03-40b2-9352-ec5a43c0b7f3
7083e094-9a2a-47ef-bba5-223c45f6083a	c92326e7-9946-4176-babc-8e0c0f89d4c3
7083e094-9a2a-47ef-bba5-223c45f6083a	5b5d8294-1a38-4ec7-a056-63256d476d18
7083e094-9a2a-47ef-bba5-223c45f6083a	82cc26ca-5778-47e5-a2bd-a4113d4e2ad9
7083e094-9a2a-47ef-bba5-223c45f6083a	8ac266bd-8bfd-4e7c-b619-e3ce76548f7e
7083e094-9a2a-47ef-bba5-223c45f6083a	26a6db07-2144-4c25-88a1-6380a91b79c2
7083e094-9a2a-47ef-bba5-223c45f6083a	e611e512-d3ad-4732-90a9-5310d97e0562
7083e094-9a2a-47ef-bba5-223c45f6083a	b1568656-909e-465c-bcb5-f5ef0077631b
7083e094-9a2a-47ef-bba5-223c45f6083a	9a34ac79-1436-4b8f-8ebe-c5090661cf7d
7083e094-9a2a-47ef-bba5-223c45f6083a	6b4ab3f0-6ec2-4f23-ac02-d3f7aa7c615e
e6d16493-d1d5-424b-a636-7179300644c3	34f91373-ed03-40b2-9352-ec5a43c0b7f3
e6d16493-d1d5-424b-a636-7179300644c3	c92326e7-9946-4176-babc-8e0c0f89d4c3
e6d16493-d1d5-424b-a636-7179300644c3	5b5d8294-1a38-4ec7-a056-63256d476d18
e6d16493-d1d5-424b-a636-7179300644c3	82cc26ca-5778-47e5-a2bd-a4113d4e2ad9
e6d16493-d1d5-424b-a636-7179300644c3	8ac266bd-8bfd-4e7c-b619-e3ce76548f7e
e6d16493-d1d5-424b-a636-7179300644c3	26a6db07-2144-4c25-88a1-6380a91b79c2
e6d16493-d1d5-424b-a636-7179300644c3	e611e512-d3ad-4732-90a9-5310d97e0562
e6d16493-d1d5-424b-a636-7179300644c3	b1568656-909e-465c-bcb5-f5ef0077631b
e6d16493-d1d5-424b-a636-7179300644c3	9a34ac79-1436-4b8f-8ebe-c5090661cf7d
e6d16493-d1d5-424b-a636-7179300644c3	6b4ab3f0-6ec2-4f23-ac02-d3f7aa7c615e
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.roles (id, name, slug, description, is_system, created_at) FROM stdin;
11339aa9-1791-43d3-be36-83c0be662bc6	Szuperadmin	superadmin	Teljes rendszer hozzáférés	t	2026-02-21 09:28:36.093901
c3942660-f261-428a-b3e7-e95c5e906787	Megbízó (Adatkezelő)	data_controller	Saját cég teljes adatkezelése	t	2026-02-21 09:28:36.093901
6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	Általános Adminisztrátor	admin	HR és ticket kezelés	t	2026-02-21 09:28:36.093901
22437ca4-4f3c-4866-b2a2-a612a2c84289	Feladat-felelős	task_owner	Ticketek kezelése	t	2026-02-21 09:28:36.093901
a40987d1-7941-48c4-b025-9c0efad9a14f	Külső Alvállalkozó	contractor	Korlátozott ticket hozzáférés	t	2026-02-21 09:28:36.093901
7083e094-9a2a-47ef-bba5-223c45f6083a	Felhasználó	user	Alapvető felhasználói jogok	t	2026-02-21 09:28:36.093901
e6d16493-d1d5-424b-a636-7179300644c3	Szállásolt Munkavállaló	accommodated_employee	Szállásolt munkavállaló	t	2026-02-21 09:28:36.093901
\.


--
-- Data for Name: scheduled_report_runs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.scheduled_report_runs (id, scheduled_report_id, status, started_at, completed_at, records_count, file_size, recipients_count, error_message) FROM stdin;
\.


--
-- Data for Name: scheduled_reports; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.scheduled_reports (id, name, report_type, schedule_type, schedule_time, day_of_week, day_of_month, recipients, filters, format, is_active, next_run_at, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: shifts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.shifts (id, employee_id, shift_date, shift_start_time, shift_end_time, shift_type, location, notes, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: ticket_attachments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ticket_attachments (id, ticket_id, comment_id, uploaded_by, file_path, file_name, file_size, mime_type, created_at) FROM stdin;
\.


--
-- Data for Name: ticket_categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ticket_categories (id, contractor_id, name, slug, description, color, icon, is_active, created_at) FROM stdin;
4e2ab7fa-f87b-4a87-ad2b-093c40df4b76	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	Technikai	technical	\N	#5b21b6	🔧	t	2026-02-21 09:28:36.093901
e9b9a110-330c-4d82-8d52-751c39a433fd	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	HR	hr	\N	#3730a3	👥	t	2026-02-21 09:28:36.093901
406c05a5-3b4c-4d59-acdc-72e755934726	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	Általános	general	\N	#64748b	📋	t	2026-02-21 09:28:36.093901
\.


--
-- Data for Name: ticket_comments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ticket_comments (id, ticket_id, user_id, comment, is_internal, created_at, updated_at) FROM stdin;
43114a31-ce1e-4fb0-b8c7-12f6a5eb036c	9a1b0212-1fe1-46da-a428-9c775b394bdd	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	Vízszerelőt értesítettem, holnap reggel 8-kor érkezik a helyszínre. Addig kérem a vízcsap elzárását.	f	2026-02-21 09:28:36.093901	2026-02-21 09:28:36.093901
\.


--
-- Data for Name: ticket_history; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ticket_history (id, ticket_id, user_id, action, field_name, old_value, new_value, created_at) FROM stdin;
3ad76da4-e73b-4cf8-9977-6512b8f0d3f6	9a1b0212-1fe1-46da-a428-9c775b394bdd	eb3c7373-4de4-4645-a83b-22c56452b288	created	\N	\N	#1001	2026-02-21 09:28:36.093901
29b56027-822d-4005-b4b4-f2d95040e8f6	5922f724-9c4d-4de2-9eea-3f74763e7731	5a6b0436-f78e-4ebe-a4de-5dc76d626589	created	\N	\N	#1002	2026-02-21 09:28:36.093901
33631097-17ad-4fd9-97c6-a21a3a0edd6a	b0a5d45a-37a9-4e4f-b229-21f91195e1a4	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	created	\N	\N	#1003	2026-02-21 09:32:32.322162
\.


--
-- Data for Name: ticket_statuses; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ticket_statuses (id, name, slug, description, color, order_index, is_final, created_at) FROM stdin;
c0b9f495-25a1-43ba-ad37-59680ac2cc04	Új	new	Új bejelentés, feldolgozásra vár	#3b82f6	1	f	2026-02-21 09:28:36.093901
923c0976-9ee2-43b0-9bec-a2eadd19a4a7	Folyamatban	in_progress	Aktív feldolgozás alatt	#f59e0b	2	f	2026-02-21 09:28:36.093901
bb4749af-5f5d-4497-9b77-ccd935cc64e9	Lezárva	completed	Sikeresen lezárva	#10b981	3	t	2026-02-21 09:28:36.093901
5d9329f9-771a-4cd2-89b9-06491fdf3a23	Elutasítva	rejected	Elutasított kérés	#ef4444	4	t	2026-02-21 09:28:36.093901
\.


--
-- Data for Name: tickets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tickets (id, contractor_id, ticket_number, title, description, category_id, status_id, priority_id, created_by, assigned_to, resolved_at, closed_at, due_date, created_at, updated_at) FROM stdin;
9a1b0212-1fe1-46da-a428-9c775b394bdd	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	#1001	Csőtörés az A épület 1. emeleten	Az A épület 1. emeleti mosdóban a vízvezeték cső eltört. Víz szivárog a padlóra, azonnali beavatkozás szükséges. A 101-es szoba lakói jelezték a problémát.	4e2ab7fa-f87b-4a87-ad2b-093c40df4b76	923c0976-9ee2-43b0-9bec-a2eadd19a4a7	a9e00d45-c75a-44b7-9164-1456d0e28a01	eb3c7373-4de4-4645-a83b-22c56452b288	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	\N	\N	\N	2026-02-21 09:28:36.093901	2026-02-21 09:28:36.093901
5922f724-9c4d-4de2-9eea-3f74763e7731	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	#1002	Szabadság kérelem - Molnár Zsuzsanna	Szeretnék 5 nap fizetett szabadságot kérni 2026. március 10-14. között családi okok miatt. Kérem a jóváhagyást.	e9b9a110-330c-4d82-8d52-751c39a433fd	c0b9f495-25a1-43ba-ad37-59680ac2cc04	4b876cca-55f6-467d-972f-069cdbbc68d3	5a6b0436-f78e-4ebe-a4de-5dc76d626589	\N	\N	\N	\N	2026-02-21 09:28:36.093901	2026-02-21 09:28:36.093901
b0a5d45a-37a9-4e4f-b229-21f91195e1a4	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	#1003	Chatbot eszkaláció: Hogyan tudok wifi-hez csatlakozni?	Automatikusan létrehozott hibajegy a chatbot beszélgetésből.\n\n--- Beszélgetés átirat ---\n[Bot]: Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.\n[Bot]: Válasszon témát:\n[Felhasználó]: Hogyan tudok wifi-hez csatlakozni?\n[Bot]: Ha bejelentkezési problémája van: 1) Ellenőrizze az email címet és jelszót 2) Próbálja meg a "Jelszó emlékeztető" funkciót 3) Ha továbbra sem sikerül, jelezze a problémát az adminisztrátornak.\n[Felhasználó]: Szabads�got szeretn�k kivenni\n[Bot]: Sajnos nem találtam megfelelő választ a kérdésére. Szeretné, ha továbbítanám kérdését egy munkatársunknak?	406c05a5-3b4c-4d59-acdc-72e755934726	c0b9f495-25a1-43ba-ad37-59680ac2cc04	4b876cca-55f6-467d-972f-069cdbbc68d3	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	\N	\N	\N	\N	2026-02-21 09:32:32.322162	2026-02-21 09:32:32.322162
\.


--
-- Data for Name: user_permissions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_permissions (user_id, permission_id, granted, granted_by, granted_at) FROM stdin;
\.


--
-- Data for Name: user_preferences; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_preferences (user_id, preferences, updated_at) FROM stdin;
\.


--
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_roles (user_id, role_id, contractor_id, assigned_at) FROM stdin;
d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	2026-02-21 09:28:36.093901
eb3c7373-4de4-4645-a83b-22c56452b288	e6d16493-d1d5-424b-a636-7179300644c3	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	2026-02-21 09:28:36.093901
5a6b0436-f78e-4ebe-a4de-5dc76d626589	e6d16493-d1d5-424b-a636-7179300644c3	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	2026-02-21 09:28:36.093901
c8372a2c-1038-4ea9-ae81-a2cee92b1187	e6d16493-d1d5-424b-a636-7179300644c3	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	2026-02-21 09:28:36.093901
09a1a353-05be-47bc-9217-ae929eee1f99	e6d16493-d1d5-424b-a636-7179300644c3	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	2026-02-21 09:28:36.093901
5c9c01d1-6fd6-4990-80d6-e4336c21ab8d	e6d16493-d1d5-424b-a636-7179300644c3	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	2026-02-21 09:28:36.093901
d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	11339aa9-1791-43d3-be36-83c0be662bc6	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	2026-02-23 11:40:45.020439
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, contractor_id, email, password_hash, first_name, last_name, phone, is_active, is_email_verified, last_login, created_at, updated_at, role_id) FROM stdin;
d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	kiss.janos@abc-kft.hu	$2a$10$.EGORdAdlG18kthHySVXn.Yssj0p3srC31E7AGgpdICG6COa7jDF2	Kiss	János	+36 30 111 2233	t	t	2026-02-23 13:58:11.941018	2026-02-21 09:28:36.093901	2026-02-23 13:58:11.941018	11339aa9-1791-43d3-be36-83c0be662bc6
c8372a2c-1038-4ea9-ae81-a2cee92b1187	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	varga.istvan@employee.com	$2a$10$.EGORdAdlG18kthHySVXn.Yssj0p3srC31E7AGgpdICG6COa7jDF2	Varga	István	+36 30 345 6789	t	t	2026-02-21 13:58:24.252451	2026-02-21 09:28:36.093901	2026-02-23 10:31:10.582556	6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28
5a6b0436-f78e-4ebe-a4de-5dc76d626589	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	molnar.zsuzsanna@employee.com	$2a$10$.EGORdAdlG18kthHySVXn.Yssj0p3srC31E7AGgpdICG6COa7jDF2	Molnár	Zsuzsanna	+36 30 234 5678	t	t	2026-02-21 13:58:24.337267	2026-02-21 09:28:36.093901	2026-02-23 10:31:10.582556	6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28
09a1a353-05be-47bc-9217-ae929eee1f99	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	farkas.katalin@employee.com	$2a$10$.EGORdAdlG18kthHySVXn.Yssj0p3srC31E7AGgpdICG6COa7jDF2	Farkas	Katalin	+36 30 456 7890	t	t	2026-02-21 13:58:24.440755	2026-02-21 09:28:36.093901	2026-02-23 10:31:10.582556	6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28
5c9c01d1-6fd6-4990-80d6-e4336c21ab8d	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	nemeth.peter@employee.com	$2a$10$.EGORdAdlG18kthHySVXn.Yssj0p3srC31E7AGgpdICG6COa7jDF2	Németh	Péter	+36 30 567 8901	t	t	2026-02-21 13:58:24.52	2026-02-21 09:28:36.093901	2026-02-23 10:31:10.582556	6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28
eb3c7373-4de4-4645-a83b-22c56452b288	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	horvath.gabor@employee.com	$2a$10$.EGORdAdlG18kthHySVXn.Yssj0p3srC31E7AGgpdICG6COa7jDF2	Horváth	Gábor	+36 30 123 4567	t	t	2026-02-21 14:20:28.22639	2026-02-21 09:28:36.093901	2026-02-23 10:31:10.582556	6c3fa88c-bb00-49e2-bcce-7e1ba11c9c28
\.


--
-- Data for Name: video_views; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.video_views (id, user_id, video_id, watched_at, completed) FROM stdin;
\.


--
-- Data for Name: videos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.videos (id, title, description, url, thumbnail_url, category, duration, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Name: employee_documents_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.employee_documents_id_seq', 1, false);


--
-- Name: scheduled_report_runs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.scheduled_report_runs_id_seq', 1, true);


--
-- Name: scheduled_reports_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.scheduled_reports_id_seq', 1, true);


--
-- Name: ticket_number_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.ticket_number_seq', 1004, false);


--
-- Name: accommodation_rooms accommodation_rooms_accommodation_id_room_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accommodation_rooms
    ADD CONSTRAINT accommodation_rooms_accommodation_id_room_number_key UNIQUE (accommodation_id, room_number);


--
-- Name: accommodation_rooms accommodation_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accommodation_rooms
    ADD CONSTRAINT accommodation_rooms_pkey PRIMARY KEY (id);


--
-- Name: accommodation_tenants accommodation_tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accommodation_tenants
    ADD CONSTRAINT accommodation_tenants_pkey PRIMARY KEY (id);


--
-- Name: accommodations accommodations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accommodations
    ADD CONSTRAINT accommodations_pkey PRIMARY KEY (id);


--
-- Name: activity_logs activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);


--
-- Name: chatbot_config chatbot_config_contractor_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chatbot_config
    ADD CONSTRAINT chatbot_config_contractor_id_key UNIQUE (contractor_id);


--
-- Name: chatbot_config chatbot_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chatbot_config
    ADD CONSTRAINT chatbot_config_pkey PRIMARY KEY (id);


--
-- Name: chatbot_conversations chatbot_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chatbot_conversations
    ADD CONSTRAINT chatbot_conversations_pkey PRIMARY KEY (id);


--
-- Name: chatbot_decision_nodes chatbot_decision_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chatbot_decision_nodes
    ADD CONSTRAINT chatbot_decision_nodes_pkey PRIMARY KEY (id);


--
-- Name: chatbot_decision_trees chatbot_decision_trees_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chatbot_decision_trees
    ADD CONSTRAINT chatbot_decision_trees_pkey PRIMARY KEY (id);


--
-- Name: chatbot_faq_categories chatbot_faq_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chatbot_faq_categories
    ADD CONSTRAINT chatbot_faq_categories_pkey PRIMARY KEY (id);


--
-- Name: chatbot_knowledge_base chatbot_knowledge_base_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chatbot_knowledge_base
    ADD CONSTRAINT chatbot_knowledge_base_pkey PRIMARY KEY (id);


--
-- Name: chatbot_messages chatbot_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chatbot_messages
    ADD CONSTRAINT chatbot_messages_pkey PRIMARY KEY (id);


--
-- Name: cost_centers cost_centers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: email_logs email_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_logs
    ADD CONSTRAINT email_logs_pkey PRIMARY KEY (id);


--
-- Name: employee_documents employee_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_documents
    ADD CONSTRAINT employee_documents_pkey PRIMARY KEY (id);


--
-- Name: employee_notes employee_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_notes
    ADD CONSTRAINT employee_notes_pkey PRIMARY KEY (id);


--
-- Name: employee_status_types employee_status_types_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_status_types
    ADD CONSTRAINT employee_status_types_name_key UNIQUE (name);


--
-- Name: employee_status_types employee_status_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_status_types
    ADD CONSTRAINT employee_status_types_pkey PRIMARY KEY (id);


--
-- Name: employee_status_types employee_status_types_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_status_types
    ADD CONSTRAINT employee_status_types_slug_key UNIQUE (slug);


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_pkey PRIMARY KEY (id);


--
-- Name: google_calendar_sync_map google_calendar_sync_map_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.google_calendar_sync_map
    ADD CONSTRAINT google_calendar_sync_map_pkey PRIMARY KEY (id);


--
-- Name: google_calendar_tokens google_calendar_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.google_calendar_tokens
    ADD CONSTRAINT google_calendar_tokens_pkey PRIMARY KEY (id);


--
-- Name: google_calendar_tokens google_calendar_tokens_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.google_calendar_tokens
    ADD CONSTRAINT google_calendar_tokens_user_id_key UNIQUE (user_id);


--
-- Name: medical_appointments medical_appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.medical_appointments
    ADD CONSTRAINT medical_appointments_pkey PRIMARY KEY (id);


--
-- Name: notification_templates notification_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: organizational_units organizational_units_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organizational_units
    ADD CONSTRAINT organizational_units_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_slug_key UNIQUE (slug);


--
-- Name: personal_events personal_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personal_events
    ADD CONSTRAINT personal_events_pkey PRIMARY KEY (id);


--
-- Name: priorities priorities_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.priorities
    ADD CONSTRAINT priorities_name_key UNIQUE (name);


--
-- Name: priorities priorities_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.priorities
    ADD CONSTRAINT priorities_pkey PRIMARY KEY (id);


--
-- Name: priorities priorities_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.priorities
    ADD CONSTRAINT priorities_slug_key UNIQUE (slug);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: roles roles_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_slug_key UNIQUE (slug);


--
-- Name: scheduled_report_runs scheduled_report_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scheduled_report_runs
    ADD CONSTRAINT scheduled_report_runs_pkey PRIMARY KEY (id);


--
-- Name: scheduled_reports scheduled_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scheduled_reports
    ADD CONSTRAINT scheduled_reports_pkey PRIMARY KEY (id);


--
-- Name: shifts shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_pkey PRIMARY KEY (id);


--
-- Name: contractors tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contractors
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: contractors tenants_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contractors
    ADD CONSTRAINT tenants_slug_key UNIQUE (slug);


--
-- Name: ticket_attachments ticket_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_attachments
    ADD CONSTRAINT ticket_attachments_pkey PRIMARY KEY (id);


--
-- Name: ticket_categories ticket_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_categories
    ADD CONSTRAINT ticket_categories_pkey PRIMARY KEY (id);


--
-- Name: ticket_comments ticket_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_comments
    ADD CONSTRAINT ticket_comments_pkey PRIMARY KEY (id);


--
-- Name: ticket_history ticket_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_history
    ADD CONSTRAINT ticket_history_pkey PRIMARY KEY (id);


--
-- Name: ticket_statuses ticket_statuses_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_statuses
    ADD CONSTRAINT ticket_statuses_name_key UNIQUE (name);


--
-- Name: ticket_statuses ticket_statuses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_statuses
    ADD CONSTRAINT ticket_statuses_pkey PRIMARY KEY (id);


--
-- Name: ticket_statuses ticket_statuses_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_statuses
    ADD CONSTRAINT ticket_statuses_slug_key UNIQUE (slug);


--
-- Name: tickets tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);


--
-- Name: tickets tickets_ticket_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_ticket_number_key UNIQUE (ticket_number);


--
-- Name: ticket_categories unique_category_slug; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_categories
    ADD CONSTRAINT unique_category_slug UNIQUE (contractor_id, slug);


--
-- Name: cost_centers unique_cost_center_code; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT unique_cost_center_code UNIQUE (contractor_id, code);


--
-- Name: users unique_email_per_tenant; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT unique_email_per_tenant UNIQUE (contractor_id, email);


--
-- Name: employees unique_employee_number; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT unique_employee_number UNIQUE (contractor_id, employee_number);


--
-- Name: projects unique_project_code; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT unique_project_code UNIQUE (contractor_id, code);


--
-- Name: notification_templates unique_template_slug; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT unique_template_slug UNIQUE (contractor_id, slug, language);


--
-- Name: user_permissions user_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_pkey PRIMARY KEY (user_id, permission_id);


--
-- Name: user_preferences user_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id, contractor_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: video_views video_views_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.video_views
    ADD CONSTRAINT video_views_pkey PRIMARY KEY (id);


--
-- Name: videos videos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.videos
    ADD CONSTRAINT videos_pkey PRIMARY KEY (id);


--
-- Name: idx_accommodation_rooms_accommodation; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_accommodation_rooms_accommodation ON public.accommodation_rooms USING btree (accommodation_id);


--
-- Name: idx_accommodation_tenants_accommodation; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_accommodation_tenants_accommodation ON public.accommodation_tenants USING btree (accommodation_id);


--
-- Name: idx_accommodation_tenants_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_accommodation_tenants_tenant ON public.accommodation_tenants USING btree (contractor_id);


--
-- Name: idx_accommodations_current_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_accommodations_current_tenant ON public.accommodations USING btree (current_contractor_id);


--
-- Name: idx_accommodations_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_accommodations_status ON public.accommodations USING btree (status);


--
-- Name: idx_accommodations_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_accommodations_type ON public.accommodations USING btree (type);


--
-- Name: idx_activity_logs_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_activity_logs_created_at ON public.activity_logs USING btree (created_at DESC);


--
-- Name: idx_activity_logs_entity_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_activity_logs_entity_id ON public.activity_logs USING btree (entity_id);


--
-- Name: idx_activity_logs_entity_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_activity_logs_entity_type ON public.activity_logs USING btree (entity_type);


--
-- Name: idx_activity_logs_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_activity_logs_user_id ON public.activity_logs USING btree (user_id);


--
-- Name: idx_chatbot_config_contractor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chatbot_config_contractor ON public.chatbot_config USING btree (contractor_id);


--
-- Name: idx_chatbot_conv_contractor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chatbot_conv_contractor ON public.chatbot_conversations USING btree (contractor_id);


--
-- Name: idx_chatbot_conv_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chatbot_conv_status ON public.chatbot_conversations USING btree (status);


--
-- Name: idx_chatbot_conv_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chatbot_conv_user ON public.chatbot_conversations USING btree (user_id);


--
-- Name: idx_chatbot_dn_parent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chatbot_dn_parent ON public.chatbot_decision_nodes USING btree (parent_id);


--
-- Name: idx_chatbot_dn_tree; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chatbot_dn_tree ON public.chatbot_decision_nodes USING btree (tree_id);


--
-- Name: idx_chatbot_dn_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chatbot_dn_type ON public.chatbot_decision_nodes USING btree (node_type);


--
-- Name: idx_chatbot_dt_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chatbot_dt_active ON public.chatbot_decision_trees USING btree (is_active);


--
-- Name: idx_chatbot_dt_contractor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chatbot_dt_contractor ON public.chatbot_decision_trees USING btree (contractor_id);


--
-- Name: idx_chatbot_dt_keywords; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chatbot_dt_keywords ON public.chatbot_decision_trees USING gin (trigger_keywords);


--
-- Name: idx_chatbot_faq_categories_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chatbot_faq_categories_active ON public.chatbot_faq_categories USING btree (is_active);


--
-- Name: idx_chatbot_faq_categories_contractor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chatbot_faq_categories_contractor ON public.chatbot_faq_categories USING btree (contractor_id);


--
-- Name: idx_chatbot_faq_categories_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chatbot_faq_categories_slug ON public.chatbot_faq_categories USING btree (slug);


--
-- Name: idx_chatbot_kb_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chatbot_kb_active ON public.chatbot_knowledge_base USING btree (is_active);


--
-- Name: idx_chatbot_kb_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chatbot_kb_category ON public.chatbot_knowledge_base USING btree (category_id);


--
-- Name: idx_chatbot_kb_contractor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chatbot_kb_contractor ON public.chatbot_knowledge_base USING btree (contractor_id);


--
-- Name: idx_chatbot_kb_keywords; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chatbot_kb_keywords ON public.chatbot_knowledge_base USING gin (keywords);


--
-- Name: idx_chatbot_messages_conv_sender_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chatbot_messages_conv_sender_created ON public.chatbot_messages USING btree (conversation_id, sender_type, created_at);


--
-- Name: idx_chatbot_msg_conversation; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chatbot_msg_conversation ON public.chatbot_messages USING btree (conversation_id);


--
-- Name: idx_chatbot_msg_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chatbot_msg_created ON public.chatbot_messages USING btree (created_at);


--
-- Name: idx_chatbot_msg_sender; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_chatbot_msg_sender ON public.chatbot_messages USING btree (sender_type);


--
-- Name: idx_documents_deleted_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_documents_deleted_at ON public.documents USING btree (deleted_at);


--
-- Name: idx_documents_document_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_documents_document_type ON public.documents USING btree (document_type);


--
-- Name: idx_documents_employee_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_documents_employee_id ON public.documents USING btree (employee_id);


--
-- Name: idx_documents_uploaded_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_documents_uploaded_by ON public.documents USING btree (uploaded_by);


--
-- Name: idx_employee_documents_employee; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_employee_documents_employee ON public.employee_documents USING btree (employee_id);


--
-- Name: idx_employee_notes_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_employee_notes_created_at ON public.employee_notes USING btree (employee_id, created_at);


--
-- Name: idx_employee_notes_employee_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_employee_notes_employee_id ON public.employee_notes USING btree (employee_id);


--
-- Name: idx_employees_accommodation; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_employees_accommodation ON public.employees USING btree (accommodation_id);


--
-- Name: idx_employees_room_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_employees_room_id ON public.employees USING btree (room_id);


--
-- Name: idx_employees_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_employees_status ON public.employees USING btree (status_id);


--
-- Name: idx_employees_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_employees_tenant ON public.employees USING btree (contractor_id);


--
-- Name: idx_employees_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_employees_user ON public.employees USING btree (user_id);


--
-- Name: idx_google_calendar_tokens_channel; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_google_calendar_tokens_channel ON public.google_calendar_tokens USING btree (webhook_channel_id);


--
-- Name: idx_google_calendar_tokens_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_google_calendar_tokens_user ON public.google_calendar_tokens USING btree (user_id);


--
-- Name: idx_kb_question_trgm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_kb_question_trgm ON public.chatbot_knowledge_base USING gin (question public.gin_trgm_ops);


--
-- Name: idx_kb_search_vector; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_kb_search_vector ON public.chatbot_knowledge_base USING gin (search_vector);


--
-- Name: idx_medical_appointments_employee_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_medical_appointments_employee_date ON public.medical_appointments USING btree (employee_id, appointment_date);


--
-- Name: idx_notifications_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_created ON public.notifications USING btree (created_at DESC);


--
-- Name: idx_notifications_read; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_read ON public.notifications USING btree (is_read);


--
-- Name: idx_notifications_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_tenant ON public.notifications USING btree (contractor_id);


--
-- Name: idx_notifications_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id);


--
-- Name: idx_personal_events_employee_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_personal_events_employee_date ON public.personal_events USING btree (employee_id, event_date);


--
-- Name: idx_scheduled_report_runs_started; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_scheduled_report_runs_started ON public.scheduled_report_runs USING btree (scheduled_report_id, started_at DESC);


--
-- Name: idx_scheduled_reports_next_run; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_scheduled_reports_next_run ON public.scheduled_reports USING btree (next_run_at) WHERE (is_active = true);


--
-- Name: idx_shifts_employee_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_shifts_employee_date ON public.shifts USING btree (employee_id, shift_date);


--
-- Name: idx_sync_map_google; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_sync_map_google ON public.google_calendar_sync_map USING btree (user_id, google_event_id) WHERE (google_event_id IS NOT NULL);


--
-- Name: idx_sync_map_local; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_sync_map_local ON public.google_calendar_sync_map USING btree (user_id, local_event_id, local_event_type) WHERE (local_event_id IS NOT NULL);


--
-- Name: idx_sync_map_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sync_map_user ON public.google_calendar_sync_map USING btree (user_id);


--
-- Name: idx_tickets_assigned_to; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_assigned_to ON public.tickets USING btree (assigned_to);


--
-- Name: idx_tickets_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_created_at ON public.tickets USING btree (created_at DESC);


--
-- Name: idx_tickets_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_created_by ON public.tickets USING btree (created_by);


--
-- Name: idx_tickets_number; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_number ON public.tickets USING btree (ticket_number);


--
-- Name: idx_tickets_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_status ON public.tickets USING btree (status_id);


--
-- Name: idx_tickets_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_tenant ON public.tickets USING btree (contractor_id);


--
-- Name: idx_user_permissions_permission_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_permissions_permission_id ON public.user_permissions USING btree (permission_id);


--
-- Name: idx_user_permissions_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_user_permissions_user_id ON public.user_permissions USING btree (user_id);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_tenant ON public.users USING btree (contractor_id);


--
-- Name: idx_video_views_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_video_views_user_id ON public.video_views USING btree (user_id);


--
-- Name: idx_video_views_video_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_video_views_video_id ON public.video_views USING btree (video_id);


--
-- Name: idx_videos_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_videos_category ON public.videos USING btree (category);


--
-- Name: idx_videos_is_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_videos_is_active ON public.videos USING btree (is_active);


--
-- Name: employee_notes set_employee_notes_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER set_employee_notes_updated_at BEFORE UPDATE ON public.employee_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: google_calendar_tokens set_google_calendar_tokens_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER set_google_calendar_tokens_updated_at BEFORE UPDATE ON public.google_calendar_tokens FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: medical_appointments set_medical_appointments_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER set_medical_appointments_updated_at BEFORE UPDATE ON public.medical_appointments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: personal_events set_personal_events_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER set_personal_events_updated_at BEFORE UPDATE ON public.personal_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: shifts set_shifts_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER set_shifts_updated_at BEFORE UPDATE ON public.shifts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: chatbot_knowledge_base trg_kb_search_vector; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_kb_search_vector BEFORE INSERT OR UPDATE ON public.chatbot_knowledge_base FOR EACH ROW EXECUTE FUNCTION public.chatbot_kb_search_vector_update();


--
-- Name: accommodation_rooms trigger_accommodation_rooms_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_accommodation_rooms_updated_at BEFORE UPDATE ON public.accommodation_rooms FOR EACH ROW EXECUTE FUNCTION public.update_accommodation_rooms_updated_at();


--
-- Name: videos trigger_videos_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_videos_updated_at BEFORE UPDATE ON public.videos FOR EACH ROW EXECUTE FUNCTION public.update_videos_updated_at();


--
-- Name: accommodations update_accommodations_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_accommodations_updated_at BEFORE UPDATE ON public.accommodations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: chatbot_config update_chatbot_config_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_chatbot_config_updated_at BEFORE UPDATE ON public.chatbot_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: chatbot_conversations update_chatbot_conversations_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_chatbot_conversations_updated_at BEFORE UPDATE ON public.chatbot_conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: chatbot_decision_nodes update_chatbot_decision_nodes_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_chatbot_decision_nodes_updated_at BEFORE UPDATE ON public.chatbot_decision_nodes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: chatbot_decision_trees update_chatbot_decision_trees_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_chatbot_decision_trees_updated_at BEFORE UPDATE ON public.chatbot_decision_trees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: chatbot_faq_categories update_chatbot_faq_categories_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_chatbot_faq_categories_updated_at BEFORE UPDATE ON public.chatbot_faq_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: chatbot_knowledge_base update_chatbot_knowledge_base_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_chatbot_knowledge_base_updated_at BEFORE UPDATE ON public.chatbot_knowledge_base FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: employees update_employees_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: organizational_units update_organizational_units_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_organizational_units_updated_at BEFORE UPDATE ON public.organizational_units FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: projects update_projects_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: contractors update_tenants_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON public.contractors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tickets update_tickets_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_tickets_updated_at BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: users update_users_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: accommodation_tenants accommodation_tenants_accommodation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accommodation_tenants
    ADD CONSTRAINT accommodation_tenants_accommodation_id_fkey FOREIGN KEY (accommodation_id) REFERENCES public.accommodations(id) ON DELETE CASCADE;


--
-- Name: accommodation_tenants accommodation_tenants_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accommodation_tenants
    ADD CONSTRAINT accommodation_tenants_tenant_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(id) ON DELETE CASCADE;


--
-- Name: accommodations accommodations_current_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accommodations
    ADD CONSTRAINT accommodations_current_tenant_id_fkey FOREIGN KEY (current_contractor_id) REFERENCES public.contractors(id) ON DELETE SET NULL;


--
-- Name: activity_logs activity_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: chatbot_config chatbot_config_contractor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chatbot_config
    ADD CONSTRAINT chatbot_config_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(id) ON DELETE CASCADE;


--
-- Name: chatbot_conversations chatbot_conversations_contractor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chatbot_conversations
    ADD CONSTRAINT chatbot_conversations_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(id) ON DELETE CASCADE;


--
-- Name: chatbot_conversations chatbot_conversations_current_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chatbot_conversations
    ADD CONSTRAINT chatbot_conversations_current_node_id_fkey FOREIGN KEY (current_node_id) REFERENCES public.chatbot_decision_nodes(id) ON DELETE SET NULL;


--
-- Name: chatbot_conversations chatbot_conversations_current_tree_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chatbot_conversations
    ADD CONSTRAINT chatbot_conversations_current_tree_id_fkey FOREIGN KEY (current_tree_id) REFERENCES public.chatbot_decision_trees(id) ON DELETE SET NULL;


--
-- Name: chatbot_conversations chatbot_conversations_escalation_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chatbot_conversations
    ADD CONSTRAINT chatbot_conversations_escalation_ticket_id_fkey FOREIGN KEY (escalation_ticket_id) REFERENCES public.tickets(id) ON DELETE SET NULL;


--
-- Name: chatbot_conversations chatbot_conversations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chatbot_conversations
    ADD CONSTRAINT chatbot_conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chatbot_decision_nodes chatbot_decision_nodes_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chatbot_decision_nodes
    ADD CONSTRAINT chatbot_decision_nodes_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.chatbot_decision_nodes(id) ON DELETE CASCADE;


--
-- Name: chatbot_decision_nodes chatbot_decision_nodes_tree_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chatbot_decision_nodes
    ADD CONSTRAINT chatbot_decision_nodes_tree_id_fkey FOREIGN KEY (tree_id) REFERENCES public.chatbot_decision_trees(id) ON DELETE CASCADE;


--
-- Name: chatbot_decision_trees chatbot_decision_trees_contractor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chatbot_decision_trees
    ADD CONSTRAINT chatbot_decision_trees_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(id) ON DELETE CASCADE;


--
-- Name: chatbot_faq_categories chatbot_faq_categories_contractor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chatbot_faq_categories
    ADD CONSTRAINT chatbot_faq_categories_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(id) ON DELETE CASCADE;


--
-- Name: chatbot_knowledge_base chatbot_knowledge_base_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chatbot_knowledge_base
    ADD CONSTRAINT chatbot_knowledge_base_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.chatbot_faq_categories(id) ON DELETE SET NULL;


--
-- Name: chatbot_knowledge_base chatbot_knowledge_base_contractor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chatbot_knowledge_base
    ADD CONSTRAINT chatbot_knowledge_base_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(id) ON DELETE CASCADE;


--
-- Name: chatbot_messages chatbot_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chatbot_messages
    ADD CONSTRAINT chatbot_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.chatbot_conversations(id) ON DELETE CASCADE;


--
-- Name: cost_centers cost_centers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_tenant_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(id) ON DELETE CASCADE;


--
-- Name: documents documents_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: documents documents_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.contractors(id) ON DELETE CASCADE;


--
-- Name: documents documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: email_logs email_logs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_logs
    ADD CONSTRAINT email_logs_tenant_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(id) ON DELETE CASCADE;


--
-- Name: employee_documents employee_documents_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_documents
    ADD CONSTRAINT employee_documents_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: employee_documents employee_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_documents
    ADD CONSTRAINT employee_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: employee_notes employee_notes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_notes
    ADD CONSTRAINT employee_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: employee_notes employee_notes_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employee_notes
    ADD CONSTRAINT employee_notes_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: employees employees_accommodation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_accommodation_id_fkey FOREIGN KEY (accommodation_id) REFERENCES public.accommodations(id) ON DELETE SET NULL;


--
-- Name: employees employees_organizational_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_organizational_unit_id_fkey FOREIGN KEY (organizational_unit_id) REFERENCES public.organizational_units(id) ON DELETE SET NULL;


--
-- Name: employees employees_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.accommodation_rooms(id) ON DELETE SET NULL;


--
-- Name: employees employees_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.employee_status_types(id);


--
-- Name: employees employees_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_tenant_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(id) ON DELETE CASCADE;


--
-- Name: employees employees_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT employees_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: google_calendar_sync_map google_calendar_sync_map_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.google_calendar_sync_map
    ADD CONSTRAINT google_calendar_sync_map_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: google_calendar_tokens google_calendar_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.google_calendar_tokens
    ADD CONSTRAINT google_calendar_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notification_templates notification_templates_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_tenant_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_tenant_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: organizational_units organizational_units_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organizational_units
    ADD CONSTRAINT organizational_units_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: organizational_units organizational_units_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organizational_units
    ADD CONSTRAINT organizational_units_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.organizational_units(id) ON DELETE SET NULL;


--
-- Name: organizational_units organizational_units_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organizational_units
    ADD CONSTRAINT organizational_units_tenant_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(id) ON DELETE CASCADE;


--
-- Name: personal_events personal_events_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.personal_events
    ADD CONSTRAINT personal_events_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: projects projects_cost_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_cost_center_id_fkey FOREIGN KEY (cost_center_id) REFERENCES public.cost_centers(id) ON DELETE SET NULL;


--
-- Name: projects projects_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: projects projects_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_tenant_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: scheduled_report_runs scheduled_report_runs_scheduled_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scheduled_report_runs
    ADD CONSTRAINT scheduled_report_runs_scheduled_report_id_fkey FOREIGN KEY (scheduled_report_id) REFERENCES public.scheduled_reports(id) ON DELETE CASCADE;


--
-- Name: shifts shifts_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


--
-- Name: ticket_attachments ticket_attachments_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_attachments
    ADD CONSTRAINT ticket_attachments_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.ticket_comments(id) ON DELETE CASCADE;


--
-- Name: ticket_attachments ticket_attachments_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_attachments
    ADD CONSTRAINT ticket_attachments_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: ticket_attachments ticket_attachments_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_attachments
    ADD CONSTRAINT ticket_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: ticket_categories ticket_categories_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_categories
    ADD CONSTRAINT ticket_categories_tenant_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(id) ON DELETE CASCADE;


--
-- Name: ticket_comments ticket_comments_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_comments
    ADD CONSTRAINT ticket_comments_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: ticket_comments ticket_comments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_comments
    ADD CONSTRAINT ticket_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: ticket_history ticket_history_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_history
    ADD CONSTRAINT ticket_history_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: ticket_history ticket_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_history
    ADD CONSTRAINT ticket_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: tickets tickets_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: tickets tickets_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.ticket_categories(id) ON DELETE SET NULL;


--
-- Name: tickets tickets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: tickets tickets_priority_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_priority_id_fkey FOREIGN KEY (priority_id) REFERENCES public.priorities(id) ON DELETE SET NULL;


--
-- Name: tickets tickets_status_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_status_id_fkey FOREIGN KEY (status_id) REFERENCES public.ticket_statuses(id) ON DELETE SET NULL;


--
-- Name: tickets tickets_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_tenant_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(id) ON DELETE CASCADE;


--
-- Name: user_permissions user_permissions_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.users(id);


--
-- Name: user_permissions user_permissions_permission_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES public.permissions(id) ON DELETE CASCADE;


--
-- Name: user_permissions user_permissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_permissions
    ADD CONSTRAINT user_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_preferences user_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_preferences
    ADD CONSTRAINT user_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_tenant_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);


--
-- Name: users users_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_tenant_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(id) ON DELETE CASCADE;


--
-- Name: video_views video_views_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.video_views
    ADD CONSTRAINT video_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: video_views video_views_video_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.video_views
    ADD CONSTRAINT video_views_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict eeWOMLSNXy93uqqsUwjnNrBqBlSdCqN2SuKrGlRl0BApOm0PfBPAL0grRDRVXKb

