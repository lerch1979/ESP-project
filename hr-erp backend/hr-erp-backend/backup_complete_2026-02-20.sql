--
-- PostgreSQL database dump
--

\restrict wATj6IGeRnvH9n8LA17YderhrBnXpzu0j1RejL2sBPRIBtkeSOTHgk9c5iv0y3r

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
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


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
    CONSTRAINT employee_notes_note_type_check CHECK (((note_type)::text = ANY ((ARRAY['general'::character varying, 'warning'::character varying, 'positive'::character varying, 'document'::character varying])::text[])))
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
    profile_photo_url character varying(500) DEFAULT NULL::character varying,
    room_id uuid,
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
    CONSTRAINT google_calendar_sync_map_local_event_type_check CHECK (((local_event_type)::text = ANY ((ARRAY['shift'::character varying, 'medical_appointment'::character varying, 'personal_event'::character varying])::text[]))),
    CONSTRAINT google_calendar_sync_map_sync_direction_check CHECK (((sync_direction)::text = ANY ((ARRAY['outbound'::character varying, 'inbound'::character varying])::text[])))
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
    CONSTRAINT medical_appointments_appointment_type_check CHECK (((appointment_type)::text = ANY ((ARRAY['general'::character varying, 'specialist'::character varying, 'emergency'::character varying, 'dental'::character varying, 'eye'::character varying, 'other'::character varying])::text[])))
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
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
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
    CONSTRAINT personal_events_event_type_check CHECK (((event_type)::text = ANY ((ARRAY['birthday'::character varying, 'meeting'::character varying, 'reminder'::character varying, 'holiday'::character varying, 'other'::character varying])::text[])))
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
    CONSTRAINT shifts_shift_type_check CHECK (((shift_type)::text = ANY ((ARRAY['morning'::character varying, 'afternoon'::character varying, 'night'::character varying, 'full_day'::character varying])::text[])))
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
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
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
4982ff72-2f22-47b1-85ac-82f3f9768131	5701ff3d-5286-4cd5-96c3-9e56a684106e	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	2026-02-14	2026-02-14	\N	2026-02-14 20:01:25.685325
91a23851-0521-4c97-b452-61b847da5045	5701ff3d-5286-4cd5-96c3-9e56a684106e	1be0580d-5fa8-4db9-880e-d7f2ae31e154	2026-02-14	\N	\N	2026-02-14 20:02:11.625339
d686685b-5933-408f-82e2-090df8c39bc1	69a1978e-2a26-4ebb-b29d-e433a069d273	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	2026-02-19	\N	\N	2026-02-19 19:44:12.773672
\.


--
-- Data for Name: accommodation_rooms; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.accommodation_rooms (id, accommodation_id, room_number, floor, beds, room_type, notes, is_active, created_at, updated_at) FROM stdin;
a1a4868f-3b54-4515-a75f-099185a35578	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	01	1	2	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:12:16.689366+00
6ade11c0-d24b-449a-af4f-0518414e1700	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	02	1	2	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:12:16.689366+00
a37085e6-132c-40e0-8a30-070e95243711	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	03	1	2	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:12:16.689366+00
ec0d5a05-ffdd-49c5-935d-29e997b0b0ad	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	04	1	2	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:12:16.689366+00
e5e4e2c1-8d30-4911-8c48-91b70e3c20bc	5701ff3d-5286-4cd5-96c3-9e56a684106e	01	1	2	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:12:16.689366+00
6c4fd9ee-0272-4924-a15c-10c461899d58	5701ff3d-5286-4cd5-96c3-9e56a684106e	02	1	2	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:12:16.689366+00
7830e963-276e-4bca-9c95-3faca091981a	e91f95df-4c8b-4878-90df-1cd7aba337ce	01	1	2	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:12:16.689366+00
ccd04496-2e57-474f-9f44-a1d028e8c0aa	e91f95df-4c8b-4878-90df-1cd7aba337ce	02	1	2	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:12:16.689366+00
77ec56a1-4144-4a20-80d2-27773080394f	e91f95df-4c8b-4878-90df-1cd7aba337ce	03	1	2	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:12:16.689366+00
5d93a6ed-9ea3-4696-8162-1831e56ba0bf	69a1978e-2a26-4ebb-b29d-e433a069d273	05	1	2	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:12:16.689366+00
61b3a863-e293-4dd1-832a-74619355149c	69a1978e-2a26-4ebb-b29d-e433a069d273	06	1	2	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:12:16.689366+00
6d101310-53da-4396-8c94-7148cd7b2f74	69a1978e-2a26-4ebb-b29d-e433a069d273	07	1	2	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:12:16.689366+00
ca15c050-2bd6-4a66-b7a7-591efc4b1580	69a1978e-2a26-4ebb-b29d-e433a069d273	08	1	2	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:12:16.689366+00
7b19cf61-1b9a-4e26-ac05-56fcf18854c5	69a1978e-2a26-4ebb-b29d-e433a069d273	09	1	2	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:12:16.689366+00
7b9cff0b-4c50-4829-b831-229c2cb8a7ed	69a1978e-2a26-4ebb-b29d-e433a069d273	10	1	2	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:12:16.689366+00
135f68e0-31fc-4a3d-b390-de0b149efc25	69a1978e-2a26-4ebb-b29d-e433a069d273	11	1	2	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:12:16.689366+00
f6cb8f88-a9c5-4c4f-b25b-1594fa2613d6	69a1978e-2a26-4ebb-b29d-e433a069d273	12	1	2	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:12:16.689366+00
ba162e45-35b4-4356-8a06-072ffc9ec13d	69a1978e-2a26-4ebb-b29d-e433a069d273	13	1	2	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:12:16.689366+00
e64e605e-a367-480c-abb4-a96f076febb0	69a1978e-2a26-4ebb-b29d-e433a069d273	14	1	2	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:12:16.689366+00
376d9826-3da1-4bd2-a4c4-699e6c7e47e6	69a1978e-2a26-4ebb-b29d-e433a069d273	15	1	2	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:12:16.689366+00
23ba26ea-42a6-45aa-bc26-b6b9e98e2c4f	69a1978e-2a26-4ebb-b29d-e433a069d273	16	1	2	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:12:16.689366+00
9707aabe-401a-4934-8a9a-62f1aba5de8e	69a1978e-2a26-4ebb-b29d-e433a069d273	17	1	2	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:12:16.689366+00
eaef8f3f-edbf-4cd2-81ab-8b0721331ac5	69a1978e-2a26-4ebb-b29d-e433a069d273	18	1	2	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:12:16.689366+00
0622d142-ec0c-4f36-a281-4de9a1d3edf7	69a1978e-2a26-4ebb-b29d-e433a069d273	19	1	2	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:12:16.689366+00
f7adcd26-9890-4755-b652-fdd042d1be13	69a1978e-2a26-4ebb-b29d-e433a069d273	20	1	2	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:12:16.689366+00
5f4d590c-5e59-4553-8208-af03d2af9734	69a1978e-2a26-4ebb-b29d-e433a069d273	21	1	2	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:12:16.689366+00
11985b21-09cd-47a4-bf30-1a800cdfb8f4	69a1978e-2a26-4ebb-b29d-e433a069d273	22	1	2	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:12:16.689366+00
540e5b6e-ec8d-4e9c-8874-95e7f137c4c4	69a1978e-2a26-4ebb-b29d-e433a069d273	23	1	2	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:12:16.689366+00
36302b5a-bcae-40ff-9024-fa84819b83db	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	98	2	4	premium	Frissitett szoba	f	2026-02-19 20:23:09.782174+00	2026-02-19 20:23:10.298809+00
0b2b3090-4981-4964-9487-1d654c1183be	69a1978e-2a26-4ebb-b29d-e433a069d273	26	1	1	standard	\N	f	2026-02-19 20:12:16.689366+00	2026-02-19 20:35:09.047477+00
856abb9a-25d1-4830-b6ec-767dd40d3590	69a1978e-2a26-4ebb-b29d-e433a069d273	25	1	2	standard	\N	f	2026-02-19 20:12:16.689366+00	2026-02-19 20:35:15.891804+00
dce87844-40c8-46f2-a5ff-5c52f50561c6	69a1978e-2a26-4ebb-b29d-e433a069d273	01	1	2	standard	\N	f	2026-02-19 20:12:16.689366+00	2026-02-19 20:35:41.522758+00
12d28903-8e87-4644-9e84-719c0aab1e6b	69a1978e-2a26-4ebb-b29d-e433a069d273	2	0	2	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:36:08.423132+00
05d6312d-f54d-4aa8-a538-4a888a0c7dcb	69a1978e-2a26-4ebb-b29d-e433a069d273	3	0	2	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:36:37.059206+00
2e3be975-a366-4d05-ac8b-de890e88d79c	69a1978e-2a26-4ebb-b29d-e433a069d273	24	1	4	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:37:04.780139+00
038ab8d4-0884-4b39-8105-ad112857fa90	69a1978e-2a26-4ebb-b29d-e433a069d273	04	1	2	standard	felújítandó	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:37:23.658659+00
68b71049-3835-42d4-a99e-a6ce84d15a33	c3adfaac-25ad-43f3-8332-ff4b124c9777	3	\N	2	standard	\N	t	2026-02-19 20:39:42.769126+00	2026-02-19 20:39:42.769126+00
c46dba55-e36f-44ac-9018-e1f83bd95d00	c3adfaac-25ad-43f3-8332-ff4b124c9777	2	\N	4	standard	Teszt Elek	t	2026-02-19 20:39:21.655626+00	2026-02-19 20:40:18.696261+00
728e4464-14f8-4bba-b279-745e130e1387	c3adfaac-25ad-43f3-8332-ff4b124c9777	1	1	4	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:41:30.398155+00
cd4bd91a-cb97-40b3-841a-fd116c7cb48f	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	2	0	2	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:45:31.461191+00
a69ade09-c92c-4118-a758-b64be786191e	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	1	0	2	standard	\N	t	2026-02-19 20:12:16.689366+00	2026-02-19 20:45:37.99064+00
\.


--
-- Data for Name: accommodations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.accommodations (id, name, address, type, capacity, current_contractor_id, status, monthly_rent, notes, is_active, created_at, updated_at) FROM stdin;
307fd8b2-09c6-41b3-a30d-dbf451119939	A epulet 101	1052 Budapest, Teszt utca 1.	studio	2	\N	available	150000.00	Felujitott lakas	f	2026-02-14 20:01:25.103933	2026-02-14 20:02:35.548074
69a1978e-2a26-4ebb-b29d-e433a069d273	Röjtökmuzsaj	9451 Röjtökmuzsaj, Röjtöki u 200.	dormitory	51	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	occupied	500000.00	\N	t	2026-02-19 19:44:12.765378	2026-02-19 19:44:12.765378
c3adfaac-25ad-43f3-8332-ff4b124c9777	Petőháza	Petőháza, Kinizsi u.53.	dormitory	30	\N	occupied	280000.00	Új lakás	t	2026-02-14 20:06:19.04737	2026-02-19 20:38:52.620515
e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Fertőszéplak	9463 Fertőszéplak, Szent Imre u. 2. 	dormitory	20	\N	occupied	600000.00	\N	t	2026-02-14 20:06:19.04737	2026-02-19 20:44:59.217516
5701ff3d-5286-4cd5-96c3-9e56a684106e	Sarród I.	Sarród	dormitory	19	1be0580d-5fa8-4db9-880e-d7f2ae31e154	occupied	1000000.00	\N	t	2026-02-14 20:01:25.663691	2026-02-19 20:54:33.13812
e91f95df-4c8b-4878-90df-1cd7aba337ce	Sopronhorpács	Sopronhorpács, Fő utca 53.	dormitory	60	\N	occupied	\N	Felújítás alatt	t	2026-02-14 20:06:19.04737	2026-02-19 20:57:57.689272
cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Bük	Bük	dormitory	35	\N	maintenance	\N	\N	t	2026-02-14 20:01:25.390497	2026-02-19 20:58:32.641102
bdd1a3fa-1fe8-464e-9d7b-e01eb0ba8ff7	Fertőrákos	Fertőrákos, Fő utca 	dormitory	25	\N	available	\N	\N	t	2026-02-19 20:59:21.217671	2026-02-19 20:59:21.217671
c2d11227-add2-4e7a-acba-b862cf133576	Sarród II.	Sarród, Fő utca	dormitory	14	\N	available	\N	\N	t	2026-02-19 20:59:53.841026	2026-02-19 20:59:53.841026
ba3794c6-b665-4489-98d3-b3c62cf9f6bd	Beled	Beled, Fő utca	studio	37	\N	available	\N	\N	t	2026-02-19 21:02:59.672647	2026-02-19 21:02:59.672647
0e49902f-b7cf-4f43-a048-536111110f73	Győr	\N	2br	5	\N	occupied	\N	\N	t	2026-02-19 21:03:58.927526	2026-02-19 21:03:58.927526
ef1acb0d-a1f5-4f6d-a922-94cfa804f76b	Ungvár utca	Budapest, Ungvár utca 2. 	studio	5	\N	available	\N	\N	t	2026-02-19 21:05:01.165166	2026-02-19 21:05:01.165166
35758788-bf87-41ab-81b9-d1629b336793	Szigetszentmiklós	\N	studio	4	\N	occupied	\N	\N	t	2026-02-19 21:04:30.879997	2026-02-19 21:05:24.033017
\.


--
-- Data for Name: activity_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.activity_logs (id, user_id, entity_type, entity_id, action, changes, metadata, ip_address, created_at) FROM stdin;
1522e842-012b-4219-87e7-0f54725a0d0b	dd66df25-a92f-4285-9f3c-e1d007f8d9c6	employee	f0843efa-e4d5-428b-8733-a37a83a733d3	create	\N	{"name": "Elek Teszt", "employee_number": "EMP-0308"}	::ffff:172.18.0.1	2026-02-20 11:02:00.357278+00
933c8ff7-8f78-46f7-846d-ea0f299f0836	dd66df25-a92f-4285-9f3c-e1d007f8d9c6	employee	f0843efa-e4d5-428b-8733-a37a83a733d3	update	{"position": {"new": "Senior Fejleszto", "old": "Fejleszt�"}, "workplace": {"new": "Debrecen", "old": "Budapest"}}	{"name": "Elek Teszt"}	::ffff:172.18.0.1	2026-02-20 11:02:25.376613+00
\.


--
-- Data for Name: contractors; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.contractors (id, name, slug, email, phone, address, is_active, created_at, updated_at) FROM stdin;
cb0a5d7f-0daf-42b8-927b-66fba6241d7d	Villanyszerelő Kristóf Kft.	villanyszerelo-kristof-kft	info@abc-kft.hu	+36 1 234 5678	\N	t	2026-02-14 07:29:26.941885	2026-02-19 21:24:55.491693
1be0580d-5fa8-4db9-880e-d7f2ae31e154	Vizes Laci Zrt.	vizes-laci-zrt	info@xyz-zrt.hu	+36 1 987 6543	\N	t	2026-02-14 07:29:26.941885	2026-02-19 21:25:14.483343
cb74725f-6b42-47b5-acc4-fd4ccb37b106	Asztalos Norbi	asztalos-norbi	infó@ssdsdsd.hu	\N	\N	t	2026-02-19 21:25:39.983104	2026-02-19 21:25:39.983104
b0f15328-7d4c-4306-bee1-6e3dbc5253ed	Gondnok Öcsi	gondnok-ocsi	info@adjasdsandnsa.hu	\N	\N	t	2026-02-19 21:26:07.247359	2026-02-19 21:26:07.247359
3a678473-4cd2-48ba-ad7b-00b5a08b82a1	Dugulásos Sopron	dugulasos-sopron	info@jkkmk.hu	\N	\N	t	2026-02-19 21:26:39.837029	2026-02-19 21:26:39.837029
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
a29d0966-e195-415e-8e20-b8270f3321e0	\N	\N	3719f580-dcec-4033-a09d-40a373e3242b	Friss�tett teszt dokumentum	M�dos�tott le�r�s	C:\\Users\\Hp\\Downloads\\housing solutions Kft\\project\\hr-erp backend\\hr-erp-backend\\uploads\\documents\\1771286552866-809243041.txt	test-document.txt	43	text/plain	contract	t	2026-02-17 00:02:32.869818	2026-02-17 00:03:15.371208+00	2026-02-17 00:03:08.456082+00
\.


--
-- Data for Name: email_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.email_logs (id, contractor_id, to_email, subject, body, status, error_message, sent_at, created_at) FROM stdin;
230d8a76-4f9c-4155-a24e-75b18674dc60	\N	horvath.gabor@employee.com	Teszt �rtes�t�s	<p>Kedves Gábor Horváth, ez egy teszt �zenet.</p>	sent	\N	2026-02-15 15:41:21.521	2026-02-15 14:41:21.530208
7c22168a-6db6-4ec4-889a-63818dd63a99	\N	farkas.katalin@employee.com	Teszt �rtes�t�s	<p>Kedves Katalin Farkas, ez egy teszt �zenet.</p>	sent	\N	2026-02-15 15:41:21.551	2026-02-15 14:41:21.558971
50dd7a91-d8a4-4d27-981a-51660cc67f89	\N	varga.istvan@employee.com	Teszt �rtes�t�s	<p>Kedves István Varga, ez egy teszt �zenet.</p>	sent	\N	2026-02-15 15:41:21.555	2026-02-15 14:41:21.56276
deac5893-a256-44a4-989b-4b474e51f4c2	\N	molnar.zsuzsanna@employee.com	Teszt �rtes�t�s	<p>Kedves Zsuzsanna Molnár, ez egy teszt �zenet.</p>	sent	\N	2026-02-15 15:41:21.558	2026-02-15 14:41:21.565426
4a0917fa-67d1-4251-99be-6c1038b9aff4	\N	horvath.gabor@employee.com	kjjlh	lkjlgh	sent	\N	2026-02-15 16:06:27.823	2026-02-15 15:06:27.826663
aca2fcb8-900b-468f-8c86-e0533ef531f4	\N	farkas.katalin@employee.com	kjjlh	lkjlgh	sent	\N	2026-02-15 16:06:27.855	2026-02-15 15:06:27.857356
4c3bd6db-674a-4054-b60e-e1c5f5f8bd1a	\N	varga.istvan@employee.com	kjjlh	lkjlgh	sent	\N	2026-02-15 16:06:27.861	2026-02-15 15:06:27.862604
b67fefa4-a008-4c57-b33c-114ecf0ec3cc	\N	molnar.zsuzsanna@employee.com	kjjlh	lkjlgh	sent	\N	2026-02-15 16:06:27.866	2026-02-15 15:06:27.867927
f8dbb991-1198-4134-853b-891330909c8c	\N	varga.istvan@employee.com	Szerződés lejárati értesítés	<p>Kedves István Varga,</p><p>Ezúton értesítjük, hogy a(z) <strong></strong> munkahelyen fennálló szerződése <strong></strong> napon lejár.</p><p>Kérjük, vegye fel a kapcsolatot a HR osztállyal a szerződés megújítása érdekében.</p><p>Üdvözlettel,<br/>HR-ERP Rendszer</p>	sent	\N	2026-02-16 16:06:00.449	2026-02-16 15:06:00.450862
9e06b15a-9f0e-47b9-a11b-f3e90f5eae47	\N	molnar.zsuzsanna@employee.com	Szerződés lejárati értesítés	<p>Kedves Zsuzsanna Molnár,</p><p>Ezúton értesítjük, hogy a(z) <strong></strong> munkahelyen fennálló szerződése <strong></strong> napon lejár.</p><p>Kérjük, vegye fel a kapcsolatot a HR osztállyal a szerződés megújítása érdekében.</p><p>Üdvözlettel,<br/>HR-ERP Rendszer</p>	sent	\N	2026-02-16 16:06:00.482	2026-02-16 15:06:00.483046
0e13812f-23b3-4eba-9f9e-34bcb2ea57ba	\N	horvath.gabor@employee.com	Szerződés lejárati értesítés	<p>Kedves Gábor Horváth,</p><p>Ezúton értesítjük, hogy a(z) <strong></strong> munkahelyen fennálló szerződése <strong></strong> napon lejár.</p><p>Kérjük, vegye fel a kapcsolatot a HR osztállyal a szerződés megújítása érdekében.</p><p>Üdvözlettel,<br/>HR-ERP Rendszer</p>	sent	\N	2026-02-16 16:06:00.486	2026-02-16 15:06:00.487035
\.


--
-- Data for Name: employee_documents; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.employee_documents (id, employee_id, document_type, file_name, file_path, file_size, mime_type, thumbnail_path, uploaded_by, uploaded_at, notes, scanned_file_path) FROM stdin;
3	f0843efa-e4d5-428b-8733-a37a83a733d3	taj_card	test_doc.jpg	/uploads/employee-documents/f0843efa-e4d5-428b-8733-a37a83a733d3/doc_1771601988579-28355426.jpg	347	image/jpeg	/uploads/employee-documents/f0843efa-e4d5-428b-8733-a37a83a733d3/thumb_doc_1771601988579-28355426.jpg	dd66df25-a92f-4285-9f3c-e1d007f8d9c6	2026-02-20 15:39:48.618701+00	TAJ kartya	\N
5	f0843efa-e4d5-428b-8733-a37a83a733d3	address_card	document.jpg	/uploads/employee-documents/f0843efa-e4d5-428b-8733-a37a83a733d3/doc_1771602560130-688277365.jpg	630749	image/jpeg	/uploads/employee-documents/f0843efa-e4d5-428b-8733-a37a83a733d3/thumb_doc_1771602560130-688277365.jpg	3719f580-dcec-4033-a09d-40a373e3242b	2026-02-20 15:49:20.413681+00	\N	\N
6	24d22383-4ee2-4c62-a03b-c4b42cf6e19e	passport	document.jpg	/uploads/employee-documents/24d22383-4ee2-4c62-a03b-c4b42cf6e19e/doc_1771604924586-665152912.jpg	596381	image/jpeg	/uploads/employee-documents/24d22383-4ee2-4c62-a03b-c4b42cf6e19e/thumb_doc_1771604924586-665152912.jpg	3719f580-dcec-4033-a09d-40a373e3242b	2026-02-20 16:28:44.776738+00	\N	\N
7	f0843efa-e4d5-428b-8733-a37a83a733d3	taj_card	document.jpg	/uploads/employee-documents/f0843efa-e4d5-428b-8733-a37a83a733d3/doc_1771604979433-39245497.jpg	685328	image/jpeg	/uploads/employee-documents/f0843efa-e4d5-428b-8733-a37a83a733d3/thumb_doc_1771604979433-39245497.jpg	3719f580-dcec-4033-a09d-40a373e3242b	2026-02-20 16:29:39.609885+00	\N	\N
8	f0843efa-e4d5-428b-8733-a37a83a733d3	other	document.jpg	/uploads/employee-documents/f0843efa-e4d5-428b-8733-a37a83a733d3/doc_1771605084362-716364310.jpg	384468	image/jpeg	/uploads/employee-documents/f0843efa-e4d5-428b-8733-a37a83a733d3/thumb_doc_1771605084362-716364310.jpg	3719f580-dcec-4033-a09d-40a373e3242b	2026-02-20 16:31:24.554997+00	\N	\N
9	24d22383-4ee2-4c62-a03b-c4b42cf6e19e	other	document.jpg	/uploads/employee-documents/24d22383-4ee2-4c62-a03b-c4b42cf6e19e/doc_1771605483307-298717882.jpg	430560	image/jpeg	/uploads/employee-documents/24d22383-4ee2-4c62-a03b-c4b42cf6e19e/thumb_doc_1771605483307-298717882.jpg	3719f580-dcec-4033-a09d-40a373e3242b	2026-02-20 16:38:03.422456+00	\N	\N
10	24d22383-4ee2-4c62-a03b-c4b42cf6e19e	other	document.jpg	/uploads/employee-documents/24d22383-4ee2-4c62-a03b-c4b42cf6e19e/doc_1771605540449-653629598.jpg	340166	image/jpeg	/uploads/employee-documents/24d22383-4ee2-4c62-a03b-c4b42cf6e19e/thumb_doc_1771605540449-653629598.jpg	3719f580-dcec-4033-a09d-40a373e3242b	2026-02-20 16:39:00.582309+00	\N	\N
13	f0843efa-e4d5-428b-8733-a37a83a733d3	other	BalÃ¡zs.jpg	/uploads/employee-documents/f0843efa-e4d5-428b-8733-a37a83a733d3/original_1771611229314_Bal__zs.jpg	63120	image/jpeg	/uploads/employee-documents/f0843efa-e4d5-428b-8733-a37a83a733d3/thumb_original_1771611229314_Bal__zs.jpg	3719f580-dcec-4033-a09d-40a373e3242b	2026-02-20 18:13:49.586265+00	\N	/uploads/employee-documents/f0843efa-e4d5-428b-8733-a37a83a733d3/scanned_1771611229314_Bal__zs.jpg
14	f0843efa-e4d5-428b-8733-a37a83a733d3	passport	BalÃ¡zs.jpg	/uploads/employee-documents/f0843efa-e4d5-428b-8733-a37a83a733d3/original_1771611261154_Bal__zs.jpg	63120	image/jpeg	/uploads/employee-documents/f0843efa-e4d5-428b-8733-a37a83a733d3/thumb_original_1771611261154_Bal__zs.jpg	3719f580-dcec-4033-a09d-40a373e3242b	2026-02-20 18:14:21.424456+00	\N	/uploads/employee-documents/f0843efa-e4d5-428b-8733-a37a83a733d3/scanned_1771611261154_Bal__zs.jpg
\.


--
-- Data for Name: employee_notes; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.employee_notes (id, employee_id, created_by, note_type, title, content, created_at, updated_at) FROM stdin;
1bd3cebd-fb53-4c93-9163-239e4161bf25	a82d5c4d-5eef-4a32-a0d6-df455856167b	dd66df25-a92f-4285-9f3c-e1d007f8d9c6	general	Teszt jegyzet	Ez egy teszt jegyzet az id�vonalhoz	2026-02-16 17:31:02.612313+00	2026-02-16 17:31:02.612313+00
86e93866-7ea7-4345-af89-61bee6c42a07	24d22383-4ee2-4c62-a03b-c4b42cf6e19e	3719f580-dcec-4033-a09d-40a373e3242b	general	Ügyes...	xy ügyes	2026-02-19 21:22:26.621946+00	2026-02-19 21:22:26.621946+00
\.


--
-- Data for Name: employee_status_types; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.employee_status_types (id, name, slug, description, color) FROM stdin;
7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Aktív	active	Aktív munkaviszony	#10b981
b0717711-ef3d-4ea3-adef-9b6f6f69f0f2	Szabadságon (fizetett)	paid_leave	Fizetett szabadság	#3b82f6
b8a8dbc8-1f4c-4ef0-b571-a3baf8add0c7	Szabadságon (fizetés nélküli)	unpaid_leave	Fizetés nélküli szabadság	#f59e0b
9a4e9fab-c0ea-4a0c-ab32-565c5fc4a6af	Szüneteltetett	suspended	Szüneteltetett munkaviszony	#94a3b8
34ecd29d-b915-4fc3-9dd4-b5dd0867f773	Kilépett	left	Megszűnt munkaviszony	#ef4444
e85c6c39-e04d-49ff-ad2d-cfca95664c03	Felfüggesztett	on_hold	Felfüggesztett státusz	#f97316
22015ae5-c3d7-4709-bacf-dd91302e9de6	Várakozó	waiting	Várakozó státusz	#94a3b8
\.


--
-- Data for Name: employees; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.employees (id, contractor_id, user_id, organizational_unit_id, employee_number, status_id, "position", start_date, end_date, notes, created_at, updated_at, accommodation_id, first_name, last_name, gender, birth_date, birth_place, mothers_name, tax_id, passport_number, social_security_number, marital_status, arrival_date, visa_expiry, room_number, bank_account, workplace, permanent_address_zip, permanent_address_country, permanent_address_county, permanent_address_city, permanent_address_street, permanent_address_number, company_name, company_email, company_phone, profile_photo_url, room_id) FROM stdin;
a82d5c4d-5eef-4a32-a0d6-df455856167b	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	e24a1539-d7eb-4f12-8d64-66fb64aa06c8	\N	EMP-0001	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Szállásolt munkavállaló	2026-02-14	\N	\N	2026-02-14 20:36:38.769954	2026-02-14 20:36:38.769954	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
54f94713-f6d3-4c6f-a8f3-14cc3089c337	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	b58290eb-433a-49da-beab-0ac8d7c3d8e5	\N	EMP-0002	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Szállásolt munkavállaló	2026-02-14	\N	\N	2026-02-14 20:36:38.769954	2026-02-14 20:36:38.769954	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
01e71f3e-a280-45ac-8af3-fbb625f471fa	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	43ea7786-efce-4b5a-a55b-dd38a6273cbf	\N	EMP-0003	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Szállásolt munkavállaló	2026-02-14	\N	\N	2026-02-14 20:36:38.769954	2026-02-14 20:36:38.769954	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
c8f6c193-3db8-49d4-a260-bacb1a351386	\N	\N	\N	EMP-0005	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Tesztelő	2026-02-14	\N	\N	2026-02-14 20:38:50.032623	2026-02-14 20:38:50.032623	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
be1a361e-7505-4a65-9b94-610cfb4701d5	\N	\N	\N	EMP-0006	34ecd29d-b915-4fc3-9dd4-b5dd0867f773	Senior Tesztelő	2026-02-14	2026-02-14	Frissített megjegyzés	2026-02-14 20:39:02.945516	2026-02-14 20:39:25.950171	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
15a601c1-b1a0-4180-8f1c-a5f577e28fbd	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	fe07da44-7181-4e4e-931d-9b5a0734cd56	\N	EMP-0004	e85c6c39-e04d-49ff-ad2d-cfca95664c03	Szállásolt munkavállaló	2026-02-13	\N	\N	2026-02-14 20:36:38.769954	2026-02-15 12:56:52.750981	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
df9d8ceb-4644-4c0f-bea6-8d63eee462d5	\N	\N	\N	EMP-0261	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Műszakvezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-20 09:56:53.044818	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Mihály	Simon	male	1999-12-08	Szigetszentmiklós	Hegedűs Réka	8410418524	BW1269680	230786326	married	2024-07-07	2027-10-29	256	89804496-46660853-61978186	BorgWarner Kft.	4319	Magyarország	Hajdú-Bihar	Debrecen	Baross utca	56	Housing Solutions Kft.	info@housingsolution.hu	+36 1 611 4528	\N	\N
ef4903c2-863d-4d46-91ab-233232b7ac06	\N	\N	\N	EMP-0037	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Raktáros	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-20 09:55:56.417416	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Ágnes	Szűcs	female	1987-12-21	Gyöngyös	Rácz Vivien	8048602337	DC6692965	257612264	divorced	2025-04-18	2027-10-14	275	63414176-21205695-75093148	Denso Gyártó Magyarország Kft.	4296	Magyarország	Hajdú-Bihar	Debrecen	Garay utca	99	Housing Solutions Kft.	info@housingsolution.hu	+36 1 966 7416	\N	ec0d5a05-ffdd-49c5-935d-29e997b0b0ad
1cd405e4-f721-48cd-8b9f-2ffce1710d5b	\N	\N	\N	EMP-0361	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Villanyszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	János	Antal	male	1999-04-10	Miskolc	Simon Katalin	8508857859	FC3244649	091861286	married	2024-06-18	2027-11-21	423	55294979-12052543-91061328	Continental Automotive Kft.	4903	Magyarország	Szabolcs-Szatmár-Bereg	Nyíregyháza	Damjanich utca	67/C	TempJob Services Kft.	info@tempjobservices.hu	+36 1 243 5988	\N	\N
619f5585-92d8-461f-b2bb-383984ef14ab	\N	\N	\N	EMP-0385	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Betanított munkás	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	János	Budai	male	1991-11-24	Szolnok	Rácz Renáta	8003093048	TM1759010	773868977	single	2024-07-16	2027-07-08	419	35035387-36960014-58336759	Audi Hungária Kft.	7602	Magyarország	Baranya	Pécs	Mátyás király utca	110	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 865 8450	\N	\N
a9cb195e-5632-4587-833d-f30e7553187d	\N	\N	\N	EMP-0231	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Lakatos	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Bernadett	Illés	female	1996-08-04	Szigetszentmiklós	Kiss Viktória	8208782991	YK6714691	400127519	single	2024-07-17	2026-08-15	351	33770456-66193869-46546811	Bosch Csoport Magyarország	8187	Magyarország	Fejér	Székesfehérvár	Vörösmarty utca	119	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 386 6475	\N	\N
a4b9560c-c282-4762-9581-ed8d83bb99a4	\N	\N	\N	EMP-0115	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Villanyszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Klára	Budai	female	1987-05-07	Kecskemét	Lakatos Éva	8028677590	HQ2989563	642968459	married	2024-07-22	2027-08-09	219	38186427-85794655-11314727	Denso Gyártó Magyarország Kft.	9958	Magyarország	Vas	Szombathely	Bem József utca	91/B	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 509 7748	\N	\N
104a3f47-a1f6-404a-83b6-7d138883bc42	\N	\N	\N	EMP-0393	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Raktári adminisztrátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Lilla	Budai	female	1984-07-17	Szigetszentmiklós	Gulyás Anna	8297328173	HW5078073	282418232	single	2024-07-28	2027-01-23	266	34540528-67177809-75279435	Audi Hungária Kft.	2132	Magyarország	Pest	Szigetszentmiklós	Damjanich utca	50/A	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 936 7885	\N	\N
b4398680-779b-4fdd-b7fa-f13155d58ea4	\N	\N	\N	EMP-0173	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gépkezelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Edit	Fülöp	female	1981-08-08	Tatabánya	Soós Eszter	8147264778	MJ9061811	531677744	married	2024-08-08	2027-06-21	352	25522167-75349379-78046498	Hankook Tire Kft.	6195	Magyarország	Csongrád-Csanád	Szeged	Király utca	23/C	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 802 3138	\N	\N
973d65c5-72e9-4da7-ac33-02ba9c34cae6	\N	\N	\N	EMP-0083	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Műszakvezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Márton	Kelemen	male	1988-07-19	Cegléd	Oláh Gabriella	8403559712	LS5080054	044705533	married	2024-08-11	2028-02-03	316	47397076-89858183-78875064	Denso Gyártó Magyarország Kft.	2199	Magyarország	Fejér	Dunaújváros	Deák Ferenc utca	47	Housing Solutions Kft.	info@housingsolution.hu	+36 1 618 7665	\N	\N
f7d33b5b-7953-4047-91bb-839e4db633f2	\N	\N	\N	EMP-0139	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Anyagmozgató	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Viktor	Takács	male	1998-01-24	Zalaegerszeg	Orbán Eszter	8521751497	ZE7930962	742770771	single	2024-08-12	2027-06-11	271	20149437-25385544-38638636	Hankook Tire Kft.	9565	Magyarország	Vas	Szombathely	Arany János utca	58	Housing Solutions Kft.	info@housingsolution.hu	+36 1 200 7934	\N	\N
24d22383-4ee2-4c62-a03b-c4b42cf6e19e	\N	\N	\N	EMP-0307	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	\N	\N	\N	\N	2026-02-19 21:21:12.903615	2026-02-20 09:55:56.417416	69a1978e-2a26-4ebb-b29d-e433a069d273	Eszter	Fülöp	female	\N	Sopron	Kovács Timea	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	61b3a863-e293-4dd1-832a-74619355149c
279379d7-d7c5-4542-b3d3-1f8022777d93	\N	\N	\N	EMP-0043	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Takarító	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Nikolett	Oláh	female	1971-04-10	Dunaújváros	Kovács Mónika	8257091246	RB5232943	500897860	single	2025-08-13	2026-09-23	186	70116107-43904800-86054380	Suzuki Manufacturing Kft.	3886	Magyarország	Borsod-Abaúj-Zemplén	Miskolc	Garay utca	34/C	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 715 7008	\N	\N
ea19ada6-cd8d-4c6d-ab99-f627a0bae777	\N	\N	\N	EMP-0087	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	CNC operátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Bernadett	Tóth	female	1985-04-25	Veszprém	Katona Réka	8843424548	IN7336656	991140640	married	2024-08-17	2028-01-04	160	46724302-88599367-25636351	Bosch Csoport Magyarország	2989	Magyarország	Pest	Érd	Baross utca	1	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 863 5917	\N	\N
6875ffac-6e81-452b-839c-41ba5773e5b4	\N	\N	\N	EMP-0565	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Műszakvezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Petra	Antal	female	1975-07-27	Cegléd	Pál Krisztina	8552189683	NJ3678941	190785458	single	2024-09-04	2027-04-04	391	40307267-20592106-85340822	Videoton Holding Zrt.	6853	Magyarország	Csongrád-Csanád	Szeged	Dózsa György út	93/C	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 680 4481	\N	\N
25593948-65ed-4321-a876-7350ed6afb5d	\N	\N	\N	EMP-0267	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Takarító	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Károly	Pintér	male	1995-07-09	Kecskemét	Bodnár Nikolett	8502827187	ZC8944354	183214990	single	2024-09-25	2027-02-28	320	30283778-33374666-37139644	Audi Hungária Kft.	6272	Magyarország	Bács-Kiskun	Kecskemét	Bem József utca	117	Housing Solutions Kft.	info@housingsolution.hu	+36 1 689 1122	\N	\N
c96eb64c-5841-4ef2-96cc-aed08e364b99	\N	\N	\N	EMP-0095	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gépkezelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Norbert	Bogdán	male	1982-07-01	Szombathely	Antal Adrienn	8262232024	JJ1354361	649435164	divorced	2024-10-05	2027-01-27	332	38505270-12507022-13954770	Suzuki Manufacturing Kft.	6860	Magyarország	Bács-Kiskun	Kecskemét	Arany János utca	64	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 396 9888	\N	\N
812e6557-b136-4fcb-aa59-fdc107454b20	\N	\N	\N	EMP-0235	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Lakatos	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Tamás	Kelemen	male	1987-04-29	Szombathely	Török Petra	8861822987	EO9311419	021095986	married	2024-10-13	2028-01-11	187	60464801-24070224-42100634	Bosch Csoport Magyarország	9224	Magyarország	Győr-Moson-Sopron	Sopron	Fő utca	92	TempJob Services Kft.	info@tempjobservices.hu	+36 1 708 4286	\N	\N
b0a711d0-0fad-4a21-a6dd-7a5225d46110	\N	\N	\N	EMP-0355	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Betanított munkás	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Petra	Bogdán	female	1993-03-12	Kaposvár	Gulyás Dóra	8585185230	WI8332096	761015745	married	2024-10-28	2026-10-02	423	76138755-75767674-33345939	BorgWarner Kft.	2355	Magyarország	Pest	Érd	Fő utca	93	Housing Solutions Kft.	info@housingsolution.hu	+36 1 262 9759	\N	\N
6aa2a793-0d72-44f0-9743-06019bfd3ec8	\N	\N	\N	EMP-0193	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Raktári adminisztrátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Krisztián	Illés	male	1986-05-01	Szombathely	Farkas Renáta	8374459878	TS2934799	295850572	single	2024-11-01	2026-06-06	149	79400164-35354634-11201581	Bosch Csoport Magyarország	2193	Magyarország	Pest	Szigetszentmiklós	Alkotmány utca	56	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 411 4565	\N	\N
aad9e80e-e9ce-4457-81f8-f8307b754b22	\N	\N	\N	EMP-0135	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Betanított munkás	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Klára	Szalai	female	1991-10-05	Veszprém	Kovács Anna	8270109046	DT9752896	606613038	married	2024-12-19	2026-10-24	182	17356254-43495359-72674995	Continental Automotive Kft.	7452	Magyarország	Baranya	Pécs	Király utca	111/B	Housing Solutions Kft.	info@housingsolution.hu	+36 1 291 8134	\N	\N
22abb919-2d4d-4386-82fd-1d0cc2c4184b	\N	\N	\N	EMP-0317	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Targoncavezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Sándor	Horváth	male	1989-10-14	Eger	Fekete Kinga	8646484575	VQ2974265	212225199	single	2025-01-27	2027-03-23	348	24930545-24424020-72770618	Hankook Tire Kft.	6303	Magyarország	Csongrád-Csanád	Szeged	Damjanich utca	35	TempJob Services Kft.	info@tempjobservices.hu	+36 1 549 3611	\N	\N
bff4dea1-2c10-4fad-84e4-8fa185c7b5ab	\N	\N	\N	EMP-0189	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Lakatos	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Patrik	Fehér	male	1993-07-27	Székesfehérvár	Soós Erzsébet	8256498732	HB7941287	858720912	single	2025-02-03	2027-04-22	274	20495634-94946787-36345060	Samsung SDI Magyarország Kft.	4617	Magyarország	Hajdú-Bihar	Debrecen	Damjanich utca	109	Housing Solutions Kft.	info@housingsolution.hu	+36 1 877 4095	\N	\N
d5e9f2e4-a12d-41bc-9281-c0b0b786b0d2	\N	\N	\N	EMP-0185	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Raktári adminisztrátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Dávid	Török	male	1985-06-27	Kaposvár	Bíró Dóra	8377615986	LT4237531	444697886	divorced	2025-02-16	2028-02-12	386	93098794-40428636-19538510	Videoton Holding Zrt.	7492	Magyarország	Somogy	Kaposvár	Bartók Béla út	27	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 956 1000	\N	\N
7df16e0e-97a9-4da6-bc2d-cacb908b512c	\N	\N	\N	EMP-0551	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Villanyszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Bianka	Kiss	female	1978-09-23	Miskolc	Gulyás Andrea	8827326758	VV6954343	082941991	single	2025-03-03	2027-02-25	381	39391688-90828195-88785419	Samsung SDI Magyarország Kft.	7092	Magyarország	Baranya	Pécs	Hunyadi utca	82	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 560 6641	\N	\N
689e8af1-372a-4ff5-910f-2a0434107155	\N	\N	\N	EMP-0487	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Csomagoló	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Margit	Hegedűs	female	1984-10-20	Székesfehérvár	Kovács Szilvia	8887902909	JL6734856	340943864	single	2025-04-04	2027-09-01	329	92876783-71539404-50972225	Samsung SDI Magyarország Kft.	8250	Magyarország	Zala	Zalaegerszeg	Mátyás király utca	77	TempJob Services Kft.	info@tempjobservices.hu	+36 1 638 9549	\N	\N
e542c0cf-c4ad-4b42-9e74-a3e8abbdd0ef	\N	\N	\N	EMP-0519	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gépkezelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	János	Fehér	male	1979-12-05	Veszprém	Pintér Réka	8192257747	ZB9537162	702639099	married	2025-04-11	2027-12-22	245	11423976-94470302-68608115	Suzuki Manufacturing Kft.	9164	Magyarország	Győr-Moson-Sopron	Győr	Ady Endre utca	47	TempJob Services Kft.	info@tempjobservices.hu	+36 1 916 8095	\N	\N
d5d47a53-ae5d-489c-9587-379072cb1f69	\N	\N	\N	EMP-0597	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gépkezelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Tamás	Szabó	male	1971-01-21	Eger	Tóth Emese	8363213794	CN3800141	730591166	single	2025-04-14	2026-06-12	197	31163104-44910639-75620950	Audi Hungária Kft.	6007	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Váci utca	44	Housing Solutions Kft.	info@housingsolution.hu	+36 1 334 5547	\N	\N
7efbef09-a1f8-432e-b10f-2a259b886996	\N	\N	\N	EMP-0367	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Raktári adminisztrátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Miklós	Máté	male	1984-12-12	Dunakeszi	Budai Edit	8650902505	LO9792969	429553086	married	2025-04-27	2027-03-10	174	91144248-61129616-73902168	Bosch Csoport Magyarország	2623	Magyarország	Komárom-Esztergom	Tatabánya	Petőfi Sándor utca	106	Housing Solutions Kft.	info@housingsolution.hu	+36 1 329 2571	\N	\N
745f5181-3b85-4339-9156-1a6ead9ece5c	\N	\N	\N	EMP-0483	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Betanított munkás	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:43:20.88007	c3adfaac-25ad-43f3-8332-ff4b124c9777	Erika	Papp	female	1996-09-08	Debrecen	Bodnár Krisztina	8135920703	PN5466738	954905863	married	2024-11-18	2027-03-01	192	70998255-22652442-54342772	Hankook Tire Kft.	1265	Magyarország	Budapest	Budapest	Fő utca	118/A	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 755 7124	\N	728e4464-14f8-4bba-b279-745e130e1387
f0843efa-e4d5-428b-8733-a37a83a733d3	\N	\N	\N	EMP-0308	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Senior Fejleszto	\N	\N	\N	2026-02-20 11:02:00.347533	2026-02-20 11:02:25.373616	\N	Teszt	Elek	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	Debrecen	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
ca2a1d24-1bcb-4271-b950-3f1fb567912c	\N	\N	\N	EMP-0435	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Műszakvezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Máté	Szalai	male	1978-05-27	Székesfehérvár	Kozma Zsuzsanna	8589054756	BI7563906	083115406	single	2025-04-30	2027-12-17	285	75287763-98280188-59375732	Continental Automotive Kft.	2263	Magyarország	Pest	Érd	Jókai Mór utca	68	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 328 1295	\N	\N
26308847-0d5b-4afd-ba0a-41543ab8de69	\N	\N	\N	EMP-0295	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Villanyszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Sándor	Jakab	male	1986-05-19	Gyöngyös	Török Petra	8652699026	JN1379980	214470164	single	2025-05-03	2026-12-11	388	28745225-49520506-78437974	Denso Gyártó Magyarország Kft.	3735	Magyarország	Borsod-Abaúj-Zemplén	Miskolc	Hunyadi utca	6	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 482 1254	\N	\N
771f2f0b-1193-4c2e-a721-98c056ae6834	\N	\N	\N	EMP-0583	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Lakatos	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	István	Máté	male	1997-04-16	Hódmezővásárhely	Molnár Klára	8993135589	XF6958814	188339762	married	2025-05-08	2027-07-04	347	60953921-44928180-71362111	Suzuki Manufacturing Kft.	5430	Magyarország	Békés	Békéscsaba	Múzeum körút	15	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 959 4790	\N	\N
02ee4b0c-3861-4df1-b639-d84f5815fd96	\N	\N	\N	EMP-0183	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Festő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Péter	Oláh	male	1990-11-05	Zalaegerszeg	Simon Viktória	8276345750	EM5966907	727889624	single	2025-06-28	2027-08-06	377	20857465-99412907-91856996	Flex Hungary Kft.	8586	Magyarország	Fejér	Székesfehérvár	Hunyadi utca	24	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 948 4214	\N	\N
70cd827b-f2c9-443b-9017-063a3eab851e	\N	\N	\N	EMP-0397	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Anyagmozgató	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Márton	Varga	male	1996-09-28	Sopron	Varga Tímea	8470162925	EO2625731	493090259	single	2025-07-02	2026-05-16	192	49734927-36664373-15912491	Bosch Csoport Magyarország	6387	Magyarország	Bács-Kiskun	Kecskemét	Mátyás király utca	32	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 621 7478	\N	\N
3701e4e5-5896-46b2-97c5-cfc088f4faef	\N	\N	\N	EMP-0569	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Targoncavezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Máté	Jakab	male	1986-08-11	Veszprém	Hegedűs Petra	8434706415	QL3560182	736150392	single	2025-08-09	2026-08-09	102	53198858-69070673-24916783	BorgWarner Kft.	6396	Magyarország	Bács-Kiskun	Kecskemét	Múzeum körút	3	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 290 5767	\N	\N
dcbed795-853f-4a04-855e-61bdbcacfcf4	\N	\N	\N	EMP-0225	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Anyagmozgató	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Balázs	Budai	male	1975-01-01	Debrecen	Németh Petra	8390872171	ML4391812	442473102	married	2025-08-16	2026-07-11	346	16736080-34013289-18189527	Continental Automotive Kft.	2468	Magyarország	Fejér	Dunaújváros	Fő utca	100	Housing Solutions Kft.	info@housingsolution.hu	+36 1 558 9778	\N	\N
72545326-24b6-41c4-bb44-1e5c624d37da	\N	\N	\N	EMP-0503	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Minőségellenőr	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Vivien	Nemes	female	1976-07-18	Cegléd	Katona Margit	8957231376	ZD7324972	000977523	married	2025-08-20	2027-06-07	381	54160124-22774889-15038812	Denso Gyártó Magyarország Kft.	8311	Magyarország	Veszprém	Veszprém	Szent István körút	63	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 340 6560	\N	\N
61805efe-2e21-4aa1-9c27-dc52bd3b9b72	\N	\N	\N	EMP-0443	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gyártósori operátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Mária	Horváth	female	1980-07-06	Tatabánya	Bálint Nikolett	8301123422	KD3406792	447989891	single	2025-08-21	2026-10-11	420	33896511-33689708-80062655	Suzuki Manufacturing Kft.	3291	Magyarország	Heves	Eger	Garay utca	92	TempJob Services Kft.	info@tempjobservices.hu	+36 1 807 2258	\N	\N
ba5a0ec9-7bcc-4696-8854-47d710ebb8be	\N	\N	\N	EMP-0447	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Összeszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Judit	Soós	female	1978-07-16	Miskolc	Máté Orsolya	8701242996	JK3582420	658276556	divorced	2025-09-04	2026-11-13	189	23131145-87025810-92884261	Samsung SDI Magyarország Kft.	6087	Magyarország	Csongrád-Csanád	Szeged	Alkotmány utca	64	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 517 8450	\N	\N
b04a9c88-8ea8-4fdb-8487-f5b5f5a6ed32	\N	\N	\N	EMP-0345	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Műszakvezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Éva	Kovács	female	1993-03-20	Kaposvár	Horváth Kinga	8458215375	HH2582377	510853955	married	2025-09-13	2027-09-18	128	84847465-72341745-33743945	Videoton Holding Zrt.	2864	Magyarország	Komárom-Esztergom	Tatabánya	Garay utca	15	Housing Solutions Kft.	info@housingsolution.hu	+36 1 903 4632	\N	\N
ada6cd77-e61f-4662-b1e4-20ae3b8c36c6	\N	\N	\N	EMP-0091	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Összeszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Dániel	Budai	male	1975-01-14	Székesfehérvár	Vincze Gabriella	8260509408	OB4082999	507328845	single	2025-09-21	2027-12-27	198	64113693-68704834-49273379	Denso Gyártó Magyarország Kft.	2899	Magyarország	Pest	Érd	Király utca	16/C	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 531 3893	\N	\N
4890167a-e92f-4873-b61b-2d076f9c51dd	\N	\N	\N	EMP-0075	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Hegesztő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	György	Soós	male	1989-04-03	Sopron	Papp Anna	8025933641	DN1615620	941271409	married	2025-09-23	2027-01-29	307	57248121-11467616-45153191	Hankook Tire Kft.	2894	Magyarország	Pest	Érd	Wesselényi utca	77	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 985 1193	\N	\N
121f80b1-5143-4191-944e-39ba2f96d87b	\N	\N	\N	EMP-0143	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Összeszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Erika	Simon	female	1991-08-31	Szolnok	Bíró Mónika	8862424086	XZ6829528	680416112	married	2025-09-25	2027-10-08	175	79402758-34275918-44363741	Suzuki Manufacturing Kft.	4733	Magyarország	Hajdú-Bihar	Debrecen	Széchenyi István tér	57	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 274 5305	\N	\N
51f4cc18-8892-4de2-8c3e-912291c5cdf2	\N	\N	\N	EMP-0013	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Hegesztő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Lajos	Illés	male	1973-12-14	Nyíregyháza	Fülöp Katalin	8124585724	NT9226065	380049221	married	2025-09-25	2026-10-18	415	23379254-66991219-93946076	Denso Gyártó Magyarország Kft.	8970	Magyarország	Zala	Zalaegerszeg	Széchenyi István tér	62/C	TempJob Services Kft.	info@tempjobservices.hu	+36 1 499 5638	\N	\N
58c74e55-f92d-4b80-8991-0833b8559edf	\N	\N	\N	EMP-0251	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Műszakvezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Edit	Nagy	female	1986-04-04	Hódmezővásárhely	Papp Renáta	8640376706	AJ1128137	438888579	divorced	2025-09-26	2027-08-24	278	89376840-82040534-24456001	Audi Hungária Kft.	4051	Magyarország	Hajdú-Bihar	Debrecen	Alkotmány utca	114	Housing Solutions Kft.	info@housingsolution.hu	+36 1 815 1624	\N	\N
f87dbf60-888d-4d8f-89c5-1c5683f11d40	\N	\N	\N	EMP-0545	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Hegesztő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Richárd	Bálint	male	1972-12-30	Békéscsaba	Nagy Krisztina	8191869477	IE3802814	100616128	married	2025-10-01	2027-05-27	353	48965207-54042185-27996336	Denso Gyártó Magyarország Kft.	2029	Magyarország	Komárom-Esztergom	Tatabánya	Baross utca	85/A	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 962 6596	\N	\N
70abdb63-9554-43b9-b6ec-1d5789574767	\N	\N	\N	EMP-0213	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Karbantartó	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Ádám	Nagy	male	1976-03-07	Székesfehérvár	Farkas Ágnes	8381025686	TT3494699	158303134	divorced	2025-10-05	2026-03-21	405	96305777-34938523-38865814	Bosch Csoport Magyarország	6311	Magyarország	Bács-Kiskun	Kecskemét	Petőfi Sándor utca	102/C	Housing Solutions Kft.	info@housingsolution.hu	+36 1 953 5548	\N	\N
3608bfac-3cd6-4d2e-84f3-809829b4c1f2	\N	\N	\N	EMP-0399	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gépkezelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Éva	Szabó	female	1992-02-01	Zalaegerszeg	Fehér Eszter	8808791552	LL2593441	076626368	single	2025-10-10	2027-04-25	254	59333761-96761987-76925178	Audi Hungária Kft.	8957	Magyarország	Fejér	Székesfehérvár	Múzeum körút	114	Housing Solutions Kft.	info@housingsolution.hu	+36 1 962 8565	\N	\N
6c05ead1-b6f4-45a4-91d2-334326ab55c4	\N	\N	\N	EMP-0349	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Műszakvezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Gábor	Juhász	male	1990-08-25	Nyíregyháza	Máté Anett	8764691223	MV2571319	209584304	married	2025-11-03	2027-05-08	284	38280411-41651790-12066041	Continental Automotive Kft.	2507	Magyarország	Pest	Érd	Ady Endre utca	61/A	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 410 1822	\N	\N
d72459ab-3d07-45f3-81e4-a31f3718c6a4	\N	\N	\N	EMP-0513	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Betanított munkás	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	István	Antal	male	1991-04-06	Hódmezővásárhely	Takács Eszter	8936038304	CU2616260	451207888	married	2025-11-11	2027-07-02	140	26722260-97131455-68128045	Audi Hungária Kft.	5612	Magyarország	Békés	Békéscsaba	Arany János utca	80/C	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 894 5940	\N	\N
668d8776-3ea4-4787-832c-ade754e4e949	\N	\N	\N	EMP-0485	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gépkezelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Bence	Farkas	male	1990-04-04	Székesfehérvár	Nagy Erzsébet	8606665099	FM3949035	119253155	divorced	2025-11-22	2026-12-20	406	17538839-72265986-84666995	Denso Gyártó Magyarország Kft.	5281	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Alkotmány utca	43	Housing Solutions Kft.	info@housingsolution.hu	+36 1 874 5835	\N	\N
56176b34-20a2-422d-a96e-fb6515c673da	\N	\N	\N	EMP-0347	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Hegesztő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Ádám	Oláh	male	1979-01-21	Szolnok	Takács Erika	8327233087	FW6394864	143325977	married	2025-11-24	2027-03-30	202	34353827-59193933-65072792	Samsung SDI Magyarország Kft.	9731	Magyarország	Győr-Moson-Sopron	Sopron	Bethlen Gábor utca	115	TempJob Services Kft.	info@tempjobservices.hu	+36 1 443 9464	\N	\N
c9637796-2587-4b08-8be3-ab6b8fd10d64	\N	\N	\N	EMP-0591	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gépkezelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Zsófia	Fehér	female	1991-06-03	Eger	Máté Bernadett	8823460955	WP7494581	842949716	divorced	2025-12-02	2027-08-27	381	82376097-78218254-64057836	Denso Gyártó Magyarország Kft.	8479	Magyarország	Fejér	Székesfehérvár	Dózsa György út	24	TempJob Services Kft.	info@tempjobservices.hu	+36 1 889 8736	\N	\N
579eb36e-02fb-48a2-9ba2-42ef359cb951	\N	\N	\N	EMP-0405	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Anyagmozgató	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Attila	Budai	male	1975-08-01	Debrecen	Kozma Anett	8148912863	EQ4648309	187041290	married	2026-01-10	2026-05-06	417	59756629-94613684-47803601	Audi Hungária Kft.	5910	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Ady Endre utca	58	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 503 6799	\N	\N
b8ba7aa0-6dcc-461f-a172-8b894ff25acb	\N	\N	\N	EMP-0111	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Targoncavezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Boglárka	Takács	female	1976-11-27	Dunakeszi	Simon Edit	8260285801	FQ9125058	986711525	married	2024-04-27	2026-06-14	280	90777184-38424287-95472037	Audi Hungária Kft.	5656	Magyarország	Békés	Békéscsaba	Bajcsy-Zsilinszky utca	85/C	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 440 3353	\N	\N
501d4caa-8cca-4801-98f8-7b4536db10aa	\N	\N	\N	EMP-0177	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Logisztikai munkatárs	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Anikó	Sárközi	female	1973-11-19	Sopron	Szilágyi Edit	8566951862	SZ2443745	182174932	married	2024-04-30	2027-06-12	254	45119164-85387722-87229707	Continental Automotive Kft.	9029	Magyarország	Vas	Szombathely	Hunyadi utca	102	TempJob Services Kft.	info@tempjobservices.hu	+36 1 385 8680	\N	\N
a64828b4-fc94-405d-acec-4f19336d5f84	\N	\N	\N	EMP-0395	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gépkezelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Katalin	Hegedűs	female	1976-12-23	Sopron	Kiss Ágnes	8477849758	VX3776832	628533685	single	2024-05-03	2026-08-19	345	43745952-24205798-88730459	Hankook Tire Kft.	8847	Magyarország	Fejér	Székesfehérvár	Deák Ferenc utca	5	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 452 3475	\N	\N
e4d38777-6a17-460b-97d7-51e0e847a63f	\N	\N	\N	EMP-0403	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Karbantartó	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Tamás	Vincze	male	1990-09-02	Dunaújváros	Varga Eszter	8376936799	TQ3097058	607233172	married	2024-05-22	2026-07-06	157	58080943-28004283-51242029	BorgWarner Kft.	6136	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Jókai Mór utca	76	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 690 3991	\N	\N
6c56192d-9214-4ab2-bb11-5b334d2c0568	\N	\N	\N	EMP-0455	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gépkezelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Hajnalka	Oláh	female	1992-12-06	Érd	Molnár Réka	8946190236	YL9146027	998192969	married	2024-05-30	2026-03-05	199	23626462-80205957-42261750	Suzuki Manufacturing Kft.	9854	Magyarország	Győr-Moson-Sopron	Győr	Jókai Mór utca	10	Housing Solutions Kft.	info@housingsolution.hu	+36 1 777 1684	\N	\N
1a455000-ab23-4600-ad2e-2af6839b930e	\N	\N	\N	EMP-0369	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Raktári adminisztrátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Levente	Török	male	1990-08-16	Cegléd	Tóth Nóra	8283136125	YM9804831	350980726	single	2024-05-31	2027-12-16	294	15477814-17189852-78036815	Videoton Holding Zrt.	3822	Magyarország	Heves	Eger	Hunyadi utca	21	TempJob Services Kft.	info@tempjobservices.hu	+36 1 434 8958	\N	\N
ac47d541-48be-4bfc-966b-73700751e89a	\N	\N	\N	EMP-0105	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Vágógép kezelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Tamás	Kovács	male	1994-08-26	Gyöngyös	Bodnár Emese	8403134248	AN6504207	463651723	married	2024-06-04	2026-11-29	286	96913952-49431374-19874483	Hankook Tire Kft.	1296	Magyarország	Budapest	Budapest	Deák Ferenc utca	10	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 274 6699	\N	\N
1182de3c-8438-4aa9-9346-4a4c34588cb7	\N	\N	\N	EMP-0103	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Raktári adminisztrátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Viktor	Sárközi	male	1980-03-16	Szeged	Farkas Nóra	8487885996	UW1664543	108690320	single	2024-07-05	2027-01-17	318	71276972-13062807-82984220	Flex Hungary Kft.	7157	Magyarország	Baranya	Pécs	Bartók Béla út	14/C	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 451 4954	\N	\N
cfc48b6e-82f7-49c2-a745-9c1fc29bbe59	\N	\N	\N	EMP-0297	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Csomagoló	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Tibor	Pál	male	1978-01-31	Szolnok	Lakatos Erzsébet	8468415745	NU2575081	037552278	single	2024-07-12	2027-05-23	322	47194918-23470560-73187082	Audi Hungária Kft.	5280	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Damjanich utca	80	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 981 5272	\N	\N
77bfeb03-ee96-4c6a-a371-02f42ca96b4d	\N	\N	\N	EMP-0325	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Anyagmozgató	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Emese	Oláh	female	1977-11-07	Sopron	Hegedűs Anna	8996205256	EU5137320	085384819	single	2024-08-12	2026-03-13	142	35425097-24767168-24589932	BorgWarner Kft.	2984	Magyarország	Komárom-Esztergom	Tatabánya	Alkotmány utca	58	TempJob Services Kft.	info@tempjobservices.hu	+36 1 202 6411	\N	\N
4f677e66-80af-4781-8bff-af159dfa894c	\N	\N	\N	EMP-0011	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Logisztikai munkatárs	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Ferenc	Jakab	male	1983-06-15	Szombathely	Mészáros Lilla	8362458883	SF1830952	772993168	divorced	2024-08-14	2026-04-04	227	26395652-49963385-70373048	Suzuki Manufacturing Kft.	9598	Magyarország	Vas	Szombathely	Bartók Béla út	119	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 401 5340	\N	\N
801b2892-49da-4098-9b6a-fe1982ed95a7	\N	\N	\N	EMP-0117	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Karbantartó	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Lilla	Szántó	female	1975-08-24	Debrecen	Németh Réka	8372877474	NP8454956	337247530	married	2024-08-18	2026-05-30	197	11012524-18176590-36670635	BorgWarner Kft.	3312	Magyarország	Borsod-Abaúj-Zemplén	Miskolc	Wesselényi utca	49	Housing Solutions Kft.	info@housingsolution.hu	+36 1 686 8665	\N	\N
5c3efbb3-58cd-46ed-a14a-f6b90643b3e6	\N	\N	\N	EMP-0329	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Festő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Ilona	Molnár	female	1987-12-11	Miskolc	Varga Tímea	8247785456	GJ8228408	458580538	single	2024-08-28	2026-07-12	416	32139502-18658147-47760206	Flex Hungary Kft.	1102	Magyarország	Budapest	Budapest	Múzeum körút	65	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 814 1008	\N	\N
e276e5ed-c483-4749-ab92-6dcceb573afa	\N	\N	\N	EMP-0489	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Takarító	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Lajos	Fehér	male	1976-07-25	Nyíregyháza	Németh Andrea	8852795677	OL4878259	557033228	divorced	2024-08-29	2026-05-14	143	26189660-26904897-67715073	Flex Hungary Kft.	8674	Magyarország	Zala	Zalaegerszeg	Arany János utca	89/B	Housing Solutions Kft.	info@housingsolution.hu	+36 1 398 9680	\N	\N
09272134-62c2-4cbc-a1b9-4cea131a489e	\N	\N	\N	EMP-0179	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Vágógép kezelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Richárd	Bálint	male	1988-09-09	Budapest	Lukács Judit	8239883816	DF9242905	453900775	divorced	2024-08-31	2027-08-14	223	40686552-31073575-36434169	Videoton Holding Zrt.	9782	Magyarország	Győr-Moson-Sopron	Győr	Thököly út	86	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 256 1713	\N	\N
6f63211a-0473-4bf5-a757-f5158b3c0c04	\N	\N	\N	EMP-0535	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Villanyszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Balázs	Takács	male	1996-04-01	Miskolc	Kozma Klára	8829210444	IA4146605	093236964	married	2024-09-07	2026-12-11	125	34808848-61027682-53604174	Continental Automotive Kft.	9164	Magyarország	Győr-Moson-Sopron	Sopron	Hunyadi utca	36	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 741 7023	\N	\N
2d15c1c8-b62c-47fe-831b-ab961b76dd8e	\N	\N	\N	EMP-0081	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Festő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Orsolya	Antal	female	1996-07-30	Szombathely	Lukács Nikolett	8353233503	NZ7437547	241606212	divorced	2024-09-13	2027-09-08	250	80338617-91075774-49722006	Bosch Csoport Magyarország	8156	Magyarország	Fejér	Székesfehérvár	Mátyás király utca	4	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 726 8735	\N	\N
354ef0f5-256e-4d2f-b289-40657d39c6ff	\N	\N	\N	EMP-0151	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Összeszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Edit	Oláh	female	1975-05-31	Szombathely	Antal Nóra	8817299011	KW1080370	144556578	married	2024-09-15	2026-09-13	404	95790005-27340207-40052509	BorgWarner Kft.	1279	Magyarország	Budapest	Budapest	Király utca	56/B	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 762 3063	\N	\N
02df1360-0442-4a1b-8a67-faf6dfc911ee	\N	\N	\N	EMP-0019	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Villanyszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Bence	Jakab	male	1977-10-30	Békéscsaba	Nemes Krisztina	8815941237	SB6859356	791712949	single	2024-09-20	2027-07-23	221	13104713-71984013-70366097	Audi Hungária Kft.	5652	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Petőfi Sándor utca	51/A	Housing Solutions Kft.	info@housingsolution.hu	+36 1 944 7369	\N	\N
4eebf363-4658-40b1-ade9-6bd300be4d5f	\N	\N	\N	EMP-0017	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Karbantartó	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Dávid	Horváth	male	1990-01-15	Pécs	Bodnár Erika	8747647185	HB3653084	336381209	single	2024-09-29	2027-11-01	280	14771069-33161079-42048977	Flex Hungary Kft.	2752	Magyarország	Fejér	Dunaújváros	Arany János utca	74/A	TempJob Services Kft.	info@tempjobservices.hu	+36 1 450 7445	\N	\N
ce31a270-df53-47d2-83a4-c98ac1cf2f41	\N	\N	\N	EMP-0311	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Vágógép kezelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Ákos	Szabó	male	1977-03-15	Székesfehérvár	Hegedűs Klára	8634066983	XU4951684	358326979	married	2024-10-15	2027-03-18	252	94559369-95295018-95743891	Suzuki Manufacturing Kft.	9093	Magyarország	Győr-Moson-Sopron	Győr	Wesselényi utca	76	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 561 8644	\N	\N
b3ff153b-10ba-401f-be24-34c0b35f6310	\N	\N	\N	EMP-0359	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Logisztikai munkatárs	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Krisztián	Rácz	male	1981-01-24	Gyöngyös	Máté Bernadett	8129401055	HP5807966	315404012	married	2024-11-01	2026-06-15	166	99024352-79764244-11403870	Bosch Csoport Magyarország	2762	Magyarország	Fejér	Dunaújváros	Wesselényi utca	7/B	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 459 3176	\N	\N
b15468a8-6a33-4a6d-8da2-8a0d5f6f5d8a	\N	\N	\N	EMP-0603	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Lakatos	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Eszter	Rácz	female	1973-01-22	Debrecen	Vincze Anna	8808867847	QU8001952	535740258	married	2024-11-09	2027-08-30	291	49015201-19080789-20539841	Suzuki Manufacturing Kft.	8367	Magyarország	Fejér	Székesfehérvár	Dózsa György út	103	TempJob Services Kft.	info@tempjobservices.hu	+36 1 513 2591	\N	\N
593c3c4f-6b22-49f5-9ed0-f0316ed966b7	\N	\N	\N	EMP-0077	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Műszakvezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Adrienn	Szűcs	female	1970-12-15	Debrecen	Nagy Orsolya	8765970722	TR8382156	201004205	single	2024-11-12	2026-08-03	384	97935509-88584684-24412925	Samsung SDI Magyarország Kft.	2778	Magyarország	Komárom-Esztergom	Tatabánya	Kossuth Lajos utca	107	Housing Solutions Kft.	info@housingsolution.hu	+36 1 490 7458	\N	\N
d76c775b-9ca0-48b8-9966-a4995186a96e	\N	\N	\N	EMP-0445	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Betanított munkás	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Károly	Nagy	male	1975-12-18	Cegléd	Török Adrienn	8817128924	PF6568462	348068094	single	2024-11-16	2027-10-01	276	74350385-68697124-23194571	BorgWarner Kft.	2377	Magyarország	Pest	Szigetszentmiklós	Széchenyi István tér	37/A	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 682 7437	\N	\N
cbfbd45d-2e2f-4363-8e9d-3f3fc85f43a5	\N	\N	\N	EMP-0047	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	CNC operátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Eszter	Kelemen	female	1978-02-10	Székesfehérvár	Katona Judit	8122486944	PS3116835	146678281	divorced	2024-11-22	2027-06-11	155	54166617-46733231-17408551	Audi Hungária Kft.	2234	Magyarország	Pest	Cegléd	Dózsa György út	13	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 585 8221	\N	\N
0f09fef6-8b96-4ca7-a2f2-803b7aeecc83	\N	\N	\N	EMP-0021	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Raktáros	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Róbert	Fülöp	male	1992-11-20	Kaposvár	Gulyás Nóra	8019885014	LT6791787	332890390	married	2024-11-24	2026-11-11	192	54273252-46141737-46220705	Bosch Csoport Magyarország	5864	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Deák Ferenc utca	72	TempJob Services Kft.	info@tempjobservices.hu	+36 1 855 4435	\N	\N
aecc8ed7-ff9b-469c-8033-53cb7efa625d	\N	\N	\N	EMP-0321	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Targoncavezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Viktor	Takács	male	1978-03-17	Sopron	Fekete Edit	8160647307	BR1465815	838005567	married	2024-12-03	2028-02-05	339	62661784-14902238-77930079	Flex Hungary Kft.	5061	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Garay utca	39	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 388 7837	\N	\N
cb1e6314-94c1-4224-8407-e9a66051b747	\N	\N	\N	EMP-0191	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Targoncavezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Ilona	Bodnár	female	1981-10-04	Szombathely	Illés Bernadett	8858302976	VJ1656976	426360796	married	2024-12-09	2027-02-13	104	39016774-41867112-72216764	Samsung SDI Magyarország Kft.	3738	Magyarország	Borsod-Abaúj-Zemplén	Miskolc	Bajcsy-Zsilinszky utca	58/C	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 578 5731	\N	\N
a60fa03a-d05f-4468-a8ef-efa1516ecc42	\N	\N	\N	EMP-0463	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	CNC operátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Petra	Balogh	female	1978-04-12	Kaposvár	Szalai Adrienn	8996200049	XT5679848	331602555	single	2024-12-23	2027-09-19	405	13678817-56183495-86723798	Suzuki Manufacturing Kft.	4385	Magyarország	Hajdú-Bihar	Debrecen	Dózsa György út	10	TempJob Services Kft.	info@tempjobservices.hu	+36 1 595 2266	\N	\N
7a93bbb8-8cfb-4c17-8b21-aaa3e6ee011d	\N	\N	\N	EMP-0319	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Vágógép kezelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Hajnalka	Szántó	female	1977-10-08	Kaposvár	Varga Andrea	8122349104	YW9768305	317627674	single	2024-12-28	2027-08-19	428	61049535-79342083-56110100	Videoton Holding Zrt.	8548	Magyarország	Zala	Zalaegerszeg	Múzeum körút	23/B	Housing Solutions Kft.	info@housingsolution.hu	+36 1 466 3110	\N	\N
56d8a5cc-f9c0-47ca-bf46-4ea0fce09720	\N	\N	\N	EMP-0459	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Lakatos	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Imre	Bodnár	male	1995-09-11	Győr	Pintér Vivien	8508808651	RT2181573	575002160	married	2025-01-05	2026-11-15	254	11110594-77039401-41965664	Videoton Holding Zrt.	9470	Magyarország	Győr-Moson-Sopron	Sopron	Fő utca	103	Housing Solutions Kft.	info@housingsolution.hu	+36 1 732 7265	\N	\N
92587637-b7fa-4ca3-afe8-98d49ca6e9cc	\N	\N	\N	EMP-0025	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Csomagoló	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Orsolya	Molnár	other	1978-07-07	Dunakeszi	Simon Petra	8553192989	WQ3253533	808793727	divorced	2025-02-09	2027-04-21	154	22906172-21520199-45505466	Audi Hungária Kft.	8806	Magyarország	Fejér	Székesfehérvár	Széchenyi István tér	104	TempJob Services Kft.	info@tempjobservices.hu	+36 1 654 4944	\N	\N
b5089258-c818-4292-b71d-9baba1bb79c7	\N	\N	\N	EMP-0097	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Raktári adminisztrátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Krisztina	Soós	female	1998-08-10	Cegléd	Szűcs Lilla	8559907482	MP3684358	214629877	married	2025-03-07	2026-12-27	165	77670251-24193205-87555904	Denso Gyártó Magyarország Kft.	3057	Magyarország	Heves	Gyöngyös	Wesselényi utca	49	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 351 3399	\N	\N
bbb5fe0d-e0b4-49fd-8dc0-65fbac226d53	\N	\N	\N	EMP-0541	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Festő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Károly	Szilágyi	male	1983-05-06	Dunakeszi	Papp Anikó	8867828432	SO4789876	019814157	divorced	2025-03-19	2027-01-27	363	99140628-46472553-79014937	Hankook Tire Kft.	2124	Magyarország	Pest	Cegléd	Damjanich utca	71	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 507 2015	\N	\N
62820105-a23f-4a42-b3ea-ec7f93ded689	\N	\N	\N	EMP-0525	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Hegesztő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Anikó	Takács	other	1977-03-29	Cegléd	Sárközi Zsófia	8893059993	CK6474501	678872692	divorced	2025-04-18	2027-06-10	103	39611463-55489877-72179746	Audi Hungária Kft.	2788	Magyarország	Pest	Érd	Szent István körút	11	TempJob Services Kft.	info@tempjobservices.hu	+36 1 277 2478	\N	\N
dd970b29-3fb1-4436-b92d-634e9bb7ee2d	\N	\N	\N	EMP-0215	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Anyagmozgató	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Krisztina	Mészáros	female	1995-03-11	Szeged	Pál Andrea	8969776218	PK8642485	283419159	divorced	2025-04-23	2027-06-05	279	71272615-47796683-47339060	Denso Gyártó Magyarország Kft.	2101	Magyarország	Pest	Szigetszentmiklós	Garay utca	75	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 813 6375	\N	\N
4b7f6334-8021-4aa5-99a9-41bb6f631ed1	\N	\N	\N	EMP-0163	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gyártósori operátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Zoltán	Máté	male	1978-08-27	Nyíregyháza	Varga Anna	8359116427	HH5428816	007455401	married	2025-05-05	2027-07-25	407	30111203-50377251-41652663	Continental Automotive Kft.	2656	Magyarország	Pest	Szigetszentmiklós	Deák Ferenc utca	52	TempJob Services Kft.	info@tempjobservices.hu	+36 1 206 3547	\N	\N
25d4dded-1c36-4e13-b10f-dab375a3d24f	\N	\N	\N	EMP-0575	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Csomagoló	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Nóra	Bíró	female	1976-10-13	Veszprém	Papp Zsuzsanna	8590874957	MD4899102	079180384	single	2025-05-11	2027-11-18	157	22978882-61710540-44800544	Audi Hungária Kft.	2797	Magyarország	Pest	Cegléd	Fő utca	103	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 307 4280	\N	\N
255f3bb7-bb37-4125-9c1a-aa00e510ed1f	\N	\N	\N	EMP-0039	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Villanyszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Boglárka	Juhász	female	1972-10-04	Kaposvár	Varga Mónika	8216430534	TO9840147	448242009	married	2025-05-18	2027-11-09	351	83924389-19583550-83289763	Bosch Csoport Magyarország	8050	Magyarország	Fejér	Székesfehérvár	Bajcsy-Zsilinszky utca	67	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 755 8652	\N	\N
50e033ab-9724-4aea-bab7-ab567389e3a2	\N	\N	\N	EMP-0033	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Minőségellenőr	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Krisztián	Nagy	male	1999-04-12	Nyíregyháza	Takács Tímea	8433679222	XZ3405363	980024866	married	2025-06-06	2027-07-24	278	63826401-56701060-93604937	Continental Automotive Kft.	9577	Magyarország	Győr-Moson-Sopron	Győr	Széchenyi István tér	43	Housing Solutions Kft.	info@housingsolution.hu	+36 1 219 5849	\N	\N
fbf468d2-5dfe-43b4-be8e-e1e29da6782c	\N	\N	\N	EMP-0605	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Betanított munkás	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	György	Varga	male	1993-09-05	Szeged	Sárközi Réka	8955548893	TY4184046	406824929	married	2025-06-07	2027-09-20	261	95610147-52354012-77958757	Samsung SDI Magyarország Kft.	6484	Magyarország	Csongrád-Csanád	Szeged	Vörösmarty utca	8	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 806 8487	\N	\N
7d57eb69-f38e-464f-9b8c-36dd6d1fa52c	\N	\N	\N	EMP-0159	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Raktári adminisztrátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Nikolett	Fülöp	female	1988-09-21	Hódmezővásárhely	Pintér Éva	8008898279	FP6349835	768775851	single	2025-07-01	2026-07-14	245	20614816-56620100-68675030	Hankook Tire Kft.	8495	Magyarország	Veszprém	Veszprém	Bajcsy-Zsilinszky utca	101	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 639 6654	\N	\N
7b07578c-7cd1-4e88-87ac-9be7a74a634d	\N	\N	\N	EMP-0051	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Villanyszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Dávid	Varga	male	1977-06-19	Gyöngyös	Horváth Andrea	8966739136	OX2036006	727983361	single	2025-07-09	2026-05-29	297	54085201-58630837-18057472	Audi Hungária Kft.	7168	Magyarország	Baranya	Pécs	Vörösmarty utca	57/B	Housing Solutions Kft.	info@housingsolution.hu	+36 1 858 8194	\N	\N
b88c9a5c-182b-429b-ad42-01afe5f7e395	\N	\N	\N	EMP-0205	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Lakatos	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Zsófia	Tóth	female	1987-04-12	Nyíregyháza	Simon Renáta	8625554097	EM7676239	688579287	married	2025-07-13	2027-07-28	131	38672083-26577359-24142969	Continental Automotive Kft.	5919	Magyarország	Békés	Békéscsaba	Alkotmány utca	7	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 314 7734	\N	\N
1832fccb-7b01-4a1f-893b-91a6166915b9	\N	\N	\N	EMP-0169	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Összeszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Béla	Szilágyi	male	1980-01-15	Kecskemét	Fülöp Katalin	8696258257	HL1414839	299697089	married	2025-07-17	2026-11-04	327	72671101-50139342-37110347	Videoton Holding Zrt.	2858	Magyarország	Pest	Érd	Mátyás király utca	18	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 344 6120	\N	\N
3e0918c9-9a67-4d13-97ab-fbb7095a5e6f	\N	\N	\N	EMP-0379	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Takarító	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Péter	Lukács	male	1989-05-02	Veszprém	Varga Viktória	8227326411	GG1355396	359320865	single	2025-07-18	2027-09-26	392	27811127-40315397-73734916	BorgWarner Kft.	9954	Magyarország	Győr-Moson-Sopron	Sopron	Király utca	24	TempJob Services Kft.	info@tempjobservices.hu	+36 1 649 8493	\N	\N
0a28f5a0-1c86-4aab-9f50-fcc3b3a914e6	\N	\N	\N	EMP-0141	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Raktári adminisztrátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Dániel	Lakatos	male	1999-01-15	Zalaegerszeg	Oláh Krisztina	8487229607	SD4443914	317673142	single	2025-08-12	2027-02-13	218	29038916-59538699-99828599	Continental Automotive Kft.	2473	Magyarország	Pest	Szigetszentmiklós	Deák Ferenc utca	59	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 989 8325	\N	\N
1a6774a0-1168-4962-919e-4102aaa23779	\N	\N	\N	EMP-0149	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Minőségellenőr	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Ágnes	Illés	female	1986-09-01	Szeged	Nemes Ilona	8003302614	ML5282742	967147594	married	2025-09-16	2028-02-26	385	56829095-47801441-24766148	Hankook Tire Kft.	3508	Magyarország	Borsod-Abaúj-Zemplén	Miskolc	Fő utca	77	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 739 9404	\N	\N
80103ffd-7c57-4c6e-95c0-a9106b228921	\N	\N	\N	EMP-0371	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Raktáros	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Patrik	Simon	male	1996-12-27	Békéscsaba	Orbán Gabriella	8608124737	BA6451147	476590057	married	2025-09-20	2026-06-20	147	47910967-61091757-11831959	Hankook Tire Kft.	9424	Magyarország	Vas	Szombathely	Arany János utca	75	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 446 8011	\N	\N
6e07124e-7c4c-43ef-85cb-769f3f858669	\N	\N	\N	EMP-0107	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Raktári adminisztrátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Nóra	Antal	female	1972-03-15	Eger	Bíró Katalin	8904257813	GF5099758	403163938	married	2025-10-09	2027-05-19	350	50398547-21449520-55940101	Denso Gyártó Magyarország Kft.	8643	Magyarország	Veszprém	Veszprém	Széchenyi István tér	89	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 335 8718	\N	\N
11721c33-fbbb-4ab7-95e5-120e8c2fa549	\N	\N	\N	EMP-0599	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Villanyszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Gábor	Bogdán	male	1999-05-22	Veszprém	Szűcs Margit	8008376677	VT5795319	200606014	married	2025-10-14	2026-11-29	425	52662486-82983602-55536240	Flex Hungary Kft.	2993	Magyarország	Pest	Érd	Kossuth Lajos utca	48	TempJob Services Kft.	info@tempjobservices.hu	+36 1 508 9422	\N	\N
e386d900-4027-48c5-a09a-cd9790f8cef4	\N	\N	\N	EMP-0531	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gépkezelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Katalin	Bíró	female	1990-06-06	Veszprém	Simon Boglárka	8643738008	RU3538547	394270427	divorced	2025-11-13	2027-05-30	317	95763327-90433303-93982184	BorgWarner Kft.	9563	Magyarország	Győr-Moson-Sopron	Sopron	Kossuth Lajos utca	106	Housing Solutions Kft.	info@housingsolution.hu	+36 1 273 5886	\N	\N
e15d706b-2950-4907-b682-9b517893665b	\N	\N	\N	EMP-0389	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	CNC operátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Lilla	Molnár	female	1999-09-13	Veszprém	Budai Nóra	8231931471	TV4440267	324868437	married	2025-11-16	2026-12-12	226	50836142-82872947-28001018	Denso Gyártó Magyarország Kft.	4733	Magyarország	Hajdú-Bihar	Debrecen	Petőfi Sándor utca	56	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 578 6253	\N	\N
ac851f76-58c2-4eb4-800b-95f5731bc378	\N	\N	\N	EMP-0475	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Műszakvezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Csaba	Kiss	male	1972-02-05	Kaposvár	Németh Orsolya	8032379135	RT9566171	688797673	single	2025-11-19	2026-08-25	346	17111116-66263079-68956993	Samsung SDI Magyarország Kft.	2976	Magyarország	Pest	Cegléd	Széchenyi István tér	33	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 613 5719	\N	\N
8579ed85-6dcb-450a-8cf2-949ecc54b04b	\N	\N	\N	EMP-0437	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Takarító	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	János	Antal	male	1994-07-09	Békéscsaba	Kovács Klára	8366273284	FN3678306	819440521	married	2025-12-21	2026-10-06	404	61915161-18889400-67048645	Audi Hungária Kft.	2140	Magyarország	Komárom-Esztergom	Tatabánya	Széchenyi István tér	86	Housing Solutions Kft.	info@housingsolution.hu	+36 1 344 4686	\N	\N
141fa38f-2acc-4c3f-a275-9ab1dfd6b940	\N	\N	\N	EMP-0453	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Raktári adminisztrátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Katalin	Lakatos	female	1989-08-25	Kaposvár	Takács Zsófia	8772946595	PV5916198	520989994	divorced	2024-03-05	2027-08-23	365	13601670-21272250-44475250	Samsung SDI Magyarország Kft.	8346	Magyarország	Zala	Zalaegerszeg	Bartók Béla út	36	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 695 1311	\N	\N
4718b04f-b2c4-4066-9dce-3417d082ae63	\N	\N	\N	EMP-0247	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Vágógép kezelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Béla	Hegedűs	male	1988-03-18	Eger	Bíró Renáta	8341853906	KG5133584	942210345	married	2024-03-10	2027-02-24	400	33401558-36268975-50801243	Continental Automotive Kft.	2810	Magyarország	Fejér	Dunaújváros	Arany János utca	116	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 251 3311	\N	\N
97457651-bc6f-4cd9-bf5e-83b80e05c937	\N	\N	\N	EMP-0537	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Karbantartó	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Bernadett	Varga	female	1984-01-03	Miskolc	Katona Vivien	8412350284	XF7979718	863058558	married	2024-03-11	2027-12-11	171	74219850-93700821-68281268	Denso Gyártó Magyarország Kft.	3956	Magyarország	Heves	Eger	Móricz Zsigmond körtér	79	TempJob Services Kft.	info@tempjobservices.hu	+36 1 335 9610	\N	\N
1ed0f07b-2fd9-4993-9763-432bebc4d472	\N	\N	\N	EMP-0501	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Raktári adminisztrátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Péter	Fülöp	male	1996-09-12	Érd	Szántó Hajnalka	8454897129	KG1304633	498119492	married	2024-03-21	2026-09-18	132	70875313-34833512-10824638	Continental Automotive Kft.	8503	Magyarország	Veszprém	Veszprém	Bethlen Gábor utca	76	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 970 2827	\N	\N
f8329fda-c418-4a95-9f3f-4702a6aa1df8	\N	\N	\N	EMP-0061	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Villanyszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Dominik	Lukács	male	1997-03-24	Békéscsaba	Nagy Adrienn	8172031329	XZ8261085	613718247	single	2024-04-10	2027-08-09	220	55486893-18016071-51146393	Continental Automotive Kft.	6421	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Váci utca	43	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 878 1775	\N	\N
a1a7a06b-b742-4d1d-8169-d94a7bdf1f7c	\N	\N	\N	EMP-0155	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Minőségellenőr	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Réka	Szalai	female	1997-03-04	Kecskemét	Varga Tímea	8390488507	YG6416689	128686526	married	2024-04-20	2028-01-13	207	10614065-50774417-24343073	Videoton Holding Zrt.	5765	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Bem József utca	70	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 234 9426	\N	\N
ba020f0b-32cd-436d-8be4-90bb87159b22	\N	\N	\N	EMP-0363	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Anyagmozgató	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Márton	Vincze	male	1983-08-09	Szombathely	Bogdán Lilla	8427967424	JT3307754	204924109	married	2024-04-27	2027-09-02	179	52512731-81031463-22218240	Continental Automotive Kft.	2257	Magyarország	Pest	Érd	Damjanich utca	90	TempJob Services Kft.	info@tempjobservices.hu	+36 1 764 7593	\N	\N
b5690f1c-f0b9-44d0-bc1f-c7a9d914a50b	\N	\N	\N	EMP-0449	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gyártósori operátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Gábor	Horváth	male	1970-04-16	Hódmezővásárhely	Fekete Hajnalka	8456792864	FO7909721	371644275	married	2024-05-16	2028-01-04	392	77865713-25633332-42637148	Hankook Tire Kft.	2851	Magyarország	Komárom-Esztergom	Tatabánya	Jókai Mór utca	102	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 842 8897	\N	\N
1bdd5538-26af-491a-86df-acb1dc4ebdba	\N	\N	\N	EMP-0515	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Csomagoló	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Kinga	Horváth	female	1980-07-09	Dunakeszi	Szántó Hajnalka	8348447935	RR8371964	305022164	single	2024-05-16	2026-06-11	257	85336758-73924959-27783596	Audi Hungária Kft.	9916	Magyarország	Győr-Moson-Sopron	Győr	Alkotmány utca	114	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 365 8696	\N	\N
4bc3cad6-7f28-46fc-ba9b-5666fee4d139	\N	\N	\N	EMP-0099	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Lakatos	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Ádám	Vincze	male	1976-01-26	Miskolc	Bodnár Eszter	8283438717	SM4313168	481671680	married	2024-05-25	2027-08-04	253	99074028-16705654-40440365	Denso Gyártó Magyarország Kft.	6945	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Szent István körút	33	Housing Solutions Kft.	info@housingsolution.hu	+36 1 862 7959	\N	\N
328709ec-85c5-4c89-9a95-36f966058722	\N	\N	\N	EMP-0209	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Festő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Adrienn	Máté	other	1995-02-20	Miskolc	Takács Réka	8063130877	EJ8750907	848487164	divorced	2024-05-29	2026-09-16	283	14204259-70490253-51435642	Continental Automotive Kft.	6284	Magyarország	Csongrád-Csanád	Szeged	Deák Ferenc utca	68/A	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 810 7899	\N	\N
832f05f2-84a5-4e78-affb-4c518604c3b5	\N	\N	\N	EMP-0509	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Raktáros	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Balázs	Vincze	male	1975-01-11	Győr	Nagy Margit	8410621005	RP7400104	082878702	single	2024-06-12	2026-04-30	108	92028323-67150603-69382690	Continental Automotive Kft.	7166	Magyarország	Baranya	Pécs	Jókai Mór utca	79	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 968 4975	\N	\N
fb8b14e9-498a-495c-9ba1-1940890b5d01	\N	\N	\N	EMP-0595	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Takarító	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Andrea	Orbán	female	1998-10-26	Szolnok	Vincze Orsolya	8741573697	OG5208871	001460257	single	2024-06-28	2026-09-17	378	83520655-59158442-95667166	Samsung SDI Magyarország Kft.	9010	Magyarország	Győr-Moson-Sopron	Győr	Hunyadi utca	60	Housing Solutions Kft.	info@housingsolution.hu	+36 1 494 5768	\N	\N
6f5fe251-3031-4638-abbf-bfa294db13c0	\N	\N	\N	EMP-0357	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Összeszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Hajnalka	Bíró	female	1991-08-11	Tatabánya	Nagy Andrea	8112290357	ND9211256	093272952	single	2024-07-09	2028-02-21	200	54630028-82349043-30175592	Videoton Holding Zrt.	2874	Magyarország	Pest	Dunakeszi	Baross utca	62/B	Housing Solutions Kft.	info@housingsolution.hu	+36 1 929 3413	\N	\N
089fbb63-f105-442f-a264-5a7196f9d76c	\N	\N	\N	EMP-0415	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Raktári adminisztrátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Réka	Gulyás	other	1984-11-28	Budapest	Szabó Lilla	8122878333	GO1129222	173287675	single	2024-07-10	2026-04-02	237	17475823-24999874-20894919	BorgWarner Kft.	6479	Magyarország	Bács-Kiskun	Kecskemét	Garay utca	77/B	TempJob Services Kft.	info@tempjobservices.hu	+36 1 812 1273	\N	\N
3cce4f1a-1b64-4a01-82db-cfb2419c7c42	\N	\N	\N	EMP-0417	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Hegesztő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Dóra	Pál	female	1986-06-15	Tatabánya	Simon Katalin	8234162463	GK7216547	442684344	married	2024-07-10	2026-07-13	147	28842670-56132316-68191501	Denso Gyártó Magyarország Kft.	2430	Magyarország	Pest	Szigetszentmiklós	Múzeum körút	44	TempJob Services Kft.	info@tempjobservices.hu	+36 1 762 9190	\N	\N
41622fbc-59fe-454f-9895-819a33106d9f	\N	\N	\N	EMP-0167	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Hegesztő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Dávid	Lakatos	male	1989-09-15	Székesfehérvár	Kiss Emese	8331656149	EW9214145	419727255	divorced	2024-07-21	2027-04-03	208	82507423-84308006-86071007	Continental Automotive Kft.	2275	Magyarország	Pest	Dunakeszi	Hunyadi utca	19	Housing Solutions Kft.	info@housingsolution.hu	+36 1 403 6599	\N	\N
1a5c88e3-d0e6-43d6-b64e-3d176997016b	\N	\N	\N	EMP-0561	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Karbantartó	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Adrienn	Balogh	female	1992-10-29	Nyíregyháza	Lukács Anna	8751344820	IZ5897128	133781233	divorced	2024-07-23	2026-12-10	156	75346495-85511245-64762610	Continental Automotive Kft.	8661	Magyarország	Zala	Zalaegerszeg	Wesselényi utca	35	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 710 9294	\N	\N
ea206a45-84f9-4a6a-8f34-3f71a3acb9dc	\N	\N	\N	EMP-0197	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gyártósori operátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Nikolett	Bogdán	female	1984-10-26	Sopron	Rácz Andrea	8747999244	RX4014974	093621574	married	2024-08-02	2027-08-26	234	17342500-69161424-51558509	Suzuki Manufacturing Kft.	2829	Magyarország	Fejér	Dunaújváros	Vörösmarty utca	89	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 840 9923	\N	\N
783e56ef-cfc9-4f95-a3b9-f9e3c1129eb8	\N	\N	\N	EMP-0327	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Logisztikai munkatárs	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Margit	Oláh	female	1987-07-18	Miskolc	Jakab Zsófia	8016269792	EQ4575840	423169605	married	2024-08-03	2027-01-29	263	88495742-65115743-79320667	Bosch Csoport Magyarország	2702	Magyarország	Pest	Dunakeszi	Dózsa György út	32	TempJob Services Kft.	info@tempjobservices.hu	+36 1 768 5440	\N	\N
a7b65b56-8fb0-4c64-b2d4-1b6fb848c746	\N	\N	\N	EMP-0165	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Raktáros	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Richárd	Bodnár	male	1982-02-07	Miskolc	Pintér Katalin	8913697895	MJ9413400	394071232	single	2024-09-20	2026-12-12	344	83149176-56643629-59456402	Flex Hungary Kft.	5254	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Szent István körút	101	Housing Solutions Kft.	info@housingsolution.hu	+36 1 428 1308	\N	\N
f5466716-d1cc-41e5-bf6c-6fd284bd7e50	\N	\N	\N	EMP-0201	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Műszakvezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Péter	Szűcs	male	1985-10-07	Dunaújváros	Rácz Lilla	8123048204	YW6003204	548056870	single	2024-10-24	2027-08-11	205	96373375-76820209-90836379	Denso Gyártó Magyarország Kft.	8717	Magyarország	Zala	Zalaegerszeg	Bem József utca	73/A	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 279 6275	\N	\N
669f415c-462c-4172-a8c4-63bb133ed839	\N	\N	\N	EMP-0175	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Csomagoló	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Boglárka	Antal	female	1990-01-02	Győr	Kozma Eszter	8730541592	CJ1280893	248028727	single	2024-11-28	2026-03-03	139	95238677-14539451-50802101	BorgWarner Kft.	5601	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Baross utca	44	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 889 5951	\N	\N
1301b796-aa6b-4416-84e6-47a61968b2d8	\N	\N	\N	EMP-0521	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Műszakvezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Krisztián	Jakab	male	1991-12-19	Dunakeszi	Nagy Erika	8742407280	NW6341177	299501513	married	2024-12-08	2026-09-20	228	17993205-73287634-91153163	Flex Hungary Kft.	4368	Magyarország	Hajdú-Bihar	Debrecen	Arany János utca	96/B	TempJob Services Kft.	info@tempjobservices.hu	+36 1 284 5625	\N	\N
486d5f8c-63ab-444b-994f-30cd9666498e	\N	\N	\N	EMP-0283	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Műszakvezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Boglárka	Kelemen	female	1983-12-31	Eger	Nemes Réka	8968991201	KJ9169974	372629624	single	2024-12-10	2027-01-19	362	68877081-47267807-15037029	Suzuki Manufacturing Kft.	2938	Magyarország	Komárom-Esztergom	Tatabánya	Múzeum körút	32	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 629 9680	\N	\N
bf46a283-5ad1-4db5-9553-1903a1c67301	\N	\N	\N	EMP-0467	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Villanyszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Péter	Bogdán	male	1997-07-17	Szeged	Máté Viktória	8956759641	JO4956124	835403273	married	2024-12-19	2027-11-11	152	78819095-68858073-49785668	Bosch Csoport Magyarország	2735	Magyarország	Pest	Dunakeszi	Mátyás király utca	101	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 910 6297	\N	\N
d1fcc62b-7a3f-4079-92d9-b067e552504a	\N	\N	\N	EMP-0559	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Csomagoló	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Máté	Soós	male	1980-03-19	Dunaújváros	Fülöp Réka	8844681387	CH1509250	117687947	married	2025-01-13	2026-06-17	236	54628679-36554751-19462728	Flex Hungary Kft.	6137	Magyarország	Bács-Kiskun	Kecskemét	Széchenyi István tér	71	TempJob Services Kft.	info@tempjobservices.hu	+36 1 410 4760	\N	\N
6de68c0b-b504-4c3b-90be-3f4c7b1a0b0f	\N	\N	\N	EMP-0287	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Targoncavezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Zoltán	Budai	male	1995-01-31	Székesfehérvár	Papp Éva	8679369756	WU8270377	855616017	single	2025-02-18	2027-04-02	101	85423137-27023495-22879471	Samsung SDI Magyarország Kft.	6702	Magyarország	Bács-Kiskun	Kecskemét	Alkotmány utca	112	Housing Solutions Kft.	info@housingsolution.hu	+36 1 931 2103	\N	\N
54f88570-bc29-4d88-ae39-8478030a9e72	\N	\N	\N	EMP-0293	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Raktári adminisztrátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	József	Szalai	male	1979-05-19	Tatabánya	Oláh Hajnalka	8333441564	CW8416813	760464174	married	2025-03-08	2027-04-07	347	51425388-29843996-43070704	Bosch Csoport Magyarország	4814	Magyarország	Szabolcs-Szatmár-Bereg	Nyíregyháza	Dózsa György út	40/A	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 482 2813	\N	\N
c4e217da-f1d6-464c-b83b-cd442087babd	\N	\N	\N	EMP-0133	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Vágógép kezelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Lilla	Szűcs	female	1998-06-08	Dunakeszi	Budai Nóra	8617894360	JC2511826	940776579	married	2025-03-17	2027-02-09	277	31102003-22372514-37237589	BorgWarner Kft.	5716	Magyarország	Békés	Békéscsaba	Bem József utca	106	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 971 4146	\N	\N
c1d0f77e-a574-4bab-b8a9-850e9e7741be	\N	\N	\N	EMP-0353	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	CNC operátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Gyula	Fekete	male	1998-09-25	Szeged	Varga Vivien	8180387591	WD7436731	750831613	married	2025-04-09	2027-09-16	226	76658608-81324928-62093636	Continental Automotive Kft.	2908	Magyarország	Fejér	Dunaújváros	Arany János utca	81	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 595 8020	\N	\N
b8f55da3-68ca-49e8-bfd6-72a7136d8538	\N	\N	\N	EMP-0549	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Csomagoló	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	István	Fekete	male	1972-06-14	Gyöngyös	Szűcs Katalin	8184462891	QY5890964	347461836	single	2025-05-19	2027-06-13	231	43015260-49889998-91375236	Bosch Csoport Magyarország	2892	Magyarország	Pest	Dunakeszi	Thököly út	59	TempJob Services Kft.	info@tempjobservices.hu	+36 1 214 4826	\N	\N
cece267a-98e1-45c6-a14d-169861449c18	\N	\N	\N	EMP-0223	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Csomagoló	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Dóra	Török	female	1995-12-22	Tatabánya	Szűcs Ilona	8498875725	GM5940476	807092806	married	2025-06-07	2027-06-11	128	33534325-52974366-27813226	Flex Hungary Kft.	7560	Magyarország	Somogy	Kaposvár	Király utca	46	Housing Solutions Kft.	info@housingsolution.hu	+36 1 673 3865	\N	\N
d12beb5b-f899-4178-bd66-4e6a49867206	\N	\N	\N	EMP-0495	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Hegesztő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Ágnes	Pál	female	1979-01-18	Dunaújváros	Szilágyi Zsófia	8950278491	BO8569198	111536469	single	2025-06-08	2027-01-07	223	43234964-63115494-53240317	Denso Gyártó Magyarország Kft.	3836	Magyarország	Heves	Eger	Király utca	90/A	TempJob Services Kft.	info@tempjobservices.hu	+36 1 203 1861	\N	\N
7a1606fe-c97d-4a76-acfe-902b1695824f	\N	\N	\N	EMP-0305	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Csomagoló	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Judit	Illés	female	1993-06-24	Gyöngyös	Orbán Nikolett	8473230453	GH1097790	144669755	single	2025-06-29	2028-01-10	226	13061710-15906121-69425303	Denso Gyártó Magyarország Kft.	6293	Magyarország	Bács-Kiskun	Kecskemét	Deák Ferenc utca	1	Housing Solutions Kft.	info@housingsolution.hu	+36 1 656 1881	\N	\N
0cb688d2-0e6a-4dde-a5d7-50b3544927db	\N	\N	\N	EMP-0203	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Villanyszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Szilvia	Varga	female	1981-12-20	Dunaújváros	Illés Margit	8113703249	JS9386566	647926278	married	2025-07-18	2027-01-14	116	72356712-44849638-57954017	Samsung SDI Magyarország Kft.	5823	Magyarország	Békés	Békéscsaba	Móricz Zsigmond körtér	8	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 901 1575	\N	\N
80ca75ef-a005-4225-9416-a777101ab245	\N	\N	\N	EMP-0181	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Takarító	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Zsuzsanna	Mészáros	female	1982-08-08	Dunaújváros	Antal Emese	8565964351	DK1198485	650590482	divorced	2025-07-22	2026-05-22	238	24264749-94204384-17628329	BorgWarner Kft.	7663	Magyarország	Somogy	Kaposvár	Kossuth Lajos utca	7	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 958 5385	\N	\N
508869e0-b532-4ebc-95dc-7e11fad05c27	\N	\N	\N	EMP-0245	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Raktári adminisztrátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Kinga	Sárközi	female	1972-03-31	Győr	Papp Klára	8309740132	WQ7778230	755649085	married	2025-07-28	2027-04-25	275	50388394-80881659-18751486	BorgWarner Kft.	2615	Magyarország	Pest	Cegléd	Vörösmarty utca	14	Housing Solutions Kft.	info@housingsolution.hu	+36 1 953 5866	\N	\N
d9ce5625-9a57-4b67-8c47-53a154af7476	\N	\N	\N	EMP-0291	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Raktári adminisztrátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Lilla	Fekete	female	2000-03-09	Dunakeszi	Bogdán Nikolett	8474901987	MC5152023	937919280	single	2025-08-13	2026-11-04	150	82985237-69502700-28855396	Continental Automotive Kft.	2042	Magyarország	Pest	Cegléd	Mátyás király utca	93	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 820 3035	\N	\N
499c561b-ce0d-4cbb-84f8-b915b24818ae	\N	\N	\N	EMP-0547	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Targoncavezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	József	Varga	male	1998-12-18	Eger	Simon Mónika	8547121184	XM6842090	042685567	single	2025-08-29	2027-11-07	429	18580607-95489133-51074507	Videoton Holding Zrt.	3394	Magyarország	Heves	Gyöngyös	Széchenyi István tér	62/A	Housing Solutions Kft.	info@housingsolution.hu	+36 1 698 1089	\N	\N
5c85489d-a243-4218-9cf5-78ee388ed631	\N	\N	\N	EMP-0529	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Karbantartó	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Erika	Szabó	female	1998-05-13	Székesfehérvár	Szalai Szilvia	8707798794	KW3703807	344933046	married	2025-09-01	2027-06-29	148	59794072-42265939-46144984	Continental Automotive Kft.	6978	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Bartók Béla út	96	TempJob Services Kft.	info@tempjobservices.hu	+36 1 659 2954	\N	\N
62d560bb-4ee2-4073-8d00-cb2c6650ca65	\N	\N	\N	EMP-0243	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Hegesztő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Orsolya	Pál	female	1994-09-20	Kecskemét	Bogdán Ilona	8257451160	GE2964089	214510049	single	2025-09-01	2027-02-13	249	28881726-42795480-36701799	Videoton Holding Zrt.	6453	Magyarország	Bács-Kiskun	Kecskemét	Garay utca	2	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 985 6976	\N	\N
1ab01331-7f09-46b5-b178-228e36742060	\N	\N	\N	EMP-0027	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Lakatos	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Renáta	Török	female	1995-06-03	Székesfehérvár	Mészáros Anna	8611087372	PH8780202	259669877	married	2025-09-22	2027-01-22	125	95173807-43288950-69467621	Flex Hungary Kft.	8304	Magyarország	Zala	Zalaegerszeg	Váci utca	21	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 939 7553	\N	\N
cc87d799-f68b-4fcc-a5eb-b66649f2c9f0	\N	\N	\N	EMP-0409	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Betanított munkás	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Bernadett	Bodnár	female	1991-04-27	Debrecen	Török Eszter	8553776336	CT2826372	238884214	married	2025-10-05	2028-02-04	287	71912644-50984200-14758204	Denso Gyártó Magyarország Kft.	6886	Magyarország	Csongrád-Csanád	Szeged	Bajcsy-Zsilinszky utca	117/A	TempJob Services Kft.	info@tempjobservices.hu	+36 1 614 6468	\N	\N
120d098d-19d6-43fe-a949-15f38ac23d8e	\N	\N	\N	EMP-0089	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Festő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Ferenc	Szilágyi	male	1998-02-18	Tatabánya	Török Anett	8455748756	DC9688439	361452444	single	2025-10-07	2027-02-09	390	51634777-29633605-34928837	Suzuki Manufacturing Kft.	3963	Magyarország	Heves	Gyöngyös	Jókai Mór utca	22	TempJob Services Kft.	info@tempjobservices.hu	+36 1 637 6299	\N	\N
56f4640e-a97e-4f2a-8d5c-3a9c6a037a8f	\N	\N	\N	EMP-0057	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Karbantartó	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	János	Sárközi	male	1985-10-10	Dunaújváros	Orbán Zsófia	8230787750	GR8901980	175641594	married	2025-10-08	2026-05-24	312	20653046-37812780-47733186	Videoton Holding Zrt.	2970	Magyarország	Pest	Cegléd	Bartók Béla út	24/C	Housing Solutions Kft.	info@housingsolution.hu	+36 1 522 1296	\N	\N
55366046-a8be-4296-b197-846dfbb04f6c	\N	\N	\N	EMP-0477	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Karbantartó	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Gabriella	Varga	female	1997-08-25	Pécs	Fülöp Réka	8320683718	RJ6703035	126427630	single	2025-10-11	2026-10-15	409	48267986-95282817-29868556	Videoton Holding Zrt.	3363	Magyarország	Heves	Gyöngyös	Király utca	28	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 473 9880	\N	\N
1ce9d3a1-95d8-4e68-bc58-4728f11a5064	\N	\N	\N	EMP-0375	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Anyagmozgató	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Szabolcs	Szántó	male	1978-05-02	Eger	Rácz Vivien	8537251271	CQ8820715	973863661	single	2025-10-21	2026-09-20	215	19694659-14856372-47498031	Continental Automotive Kft.	8928	Magyarország	Veszprém	Veszprém	Móricz Zsigmond körtér	41	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 509 4760	\N	\N
e119863d-5f5b-4579-bdc4-0fdb687ceab1	\N	\N	\N	EMP-0465	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gyártósori operátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Ádám	Lakatos	male	1994-04-14	Szigetszentmiklós	Katona Vivien	8098821464	AT4718552	873105339	single	2025-11-24	2028-01-25	429	37600471-89110922-64072499	Audi Hungária Kft.	8243	Magyarország	Zala	Zalaegerszeg	Jókai Mór utca	44	Housing Solutions Kft.	info@housingsolution.hu	+36 1 444 4498	\N	\N
53fb05f8-a88a-4fed-a412-0cdd67a76ed6	\N	\N	\N	EMP-0469	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Anyagmozgató	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Anikó	Mészáros	female	1981-10-14	Dunakeszi	Tóth Judit	8909625490	VL3353672	875334629	single	2025-11-24	2028-01-15	258	73614254-65147425-94569190	Flex Hungary Kft.	8860	Magyarország	Fejér	Székesfehérvár	Múzeum körút	48	Housing Solutions Kft.	info@housingsolution.hu	+36 1 894 4644	\N	\N
d3ba5c1b-4bc4-4d3a-8552-1e832eeef40c	\N	\N	\N	EMP-0255	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Csomagoló	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Boglárka	Illés	female	1990-06-21	Dunakeszi	Szűcs Hajnalka	8605535130	SP5307479	758913430	single	2025-12-24	2028-01-05	369	53261025-65058054-81373851	Samsung SDI Magyarország Kft.	2050	Magyarország	Fejér	Dunaújváros	Deák Ferenc utca	38	TempJob Services Kft.	info@tempjobservices.hu	+36 1 648 5888	\N	\N
da82c94b-f456-45b8-8188-7f3dfc1d0f54	\N	\N	\N	EMP-0471	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gyártósori operátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Vivien	Oláh	female	1977-12-24	Veszprém	Lukács Judit	8137532156	ET7299216	658883735	single	2025-12-31	2026-11-16	384	43882708-21300185-69926384	Hankook Tire Kft.	9703	Magyarország	Győr-Moson-Sopron	Győr	Damjanich utca	97	Housing Solutions Kft.	info@housingsolution.hu	+36 1 225 5583	\N	\N
16d9ffa0-00e9-4a7a-b421-7115dc437c1f	\N	\N	\N	EMP-0593	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Lakatos	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Levente	Bíró	male	1979-03-17	Érd	Juhász Ilona	8683037687	RR3880633	884052193	married	2026-01-10	2026-03-15	379	44892364-77201475-86869492	Audi Hungária Kft.	6183	Magyarország	Csongrád-Csanád	Szeged	Petőfi Sándor utca	120	TempJob Services Kft.	info@tempjobservices.hu	+36 1 600 7668	\N	\N
8abd5301-170e-4578-adb7-82ec1978d11b	\N	\N	\N	EMP-0341	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Logisztikai munkatárs	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Mónika	Vincze	female	1978-07-27	Dunakeszi	Bodnár Petra	8034175742	MO6114947	299112961	married	2026-01-15	2026-10-26	219	84475559-84902626-81435560	Samsung SDI Magyarország Kft.	9372	Magyarország	Győr-Moson-Sopron	Győr	Damjanich utca	33	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 655 1495	\N	\N
eaa26255-1e46-4ac3-adb3-ac0d667cadae	\N	\N	\N	EMP-0029	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gyártósori operátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Tibor	Vincze	male	1989-11-08	Szolnok	Szalai Petra	8255472438	ZF2336029	381115199	married	2024-06-15	2026-05-31	224	88943938-79683111-21947471	Hankook Tire Kft.	7042	Magyarország	Baranya	Pécs	Múzeum körút	91	TempJob Services Kft.	info@tempjobservices.hu	+36 1 876 8381	\N	\N
01af7337-b861-450f-8cc3-b9d05ecb04cf	\N	\N	\N	EMP-0323	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Anyagmozgató	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Emese	Bíró	female	1989-04-13	Debrecen	Varga Andrea	8080299221	RO6425598	389823583	single	2024-08-14	2026-12-06	181	75115634-40990043-31288884	Samsung SDI Magyarország Kft.	2880	Magyarország	Komárom-Esztergom	Tatabánya	Fő utca	21	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 721 6642	\N	\N
448c60de-0526-4b24-bce4-9ec79f79b4b4	\N	\N	\N	EMP-0049	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Raktáros	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Eszter	Kovács	female	1993-08-07	Hódmezővásárhely	Nagy Boglárka	8916887437	YA3800061	389127949	married	2024-08-14	2027-12-03	117	99920306-46690651-30007709	Suzuki Manufacturing Kft.	8586	Magyarország	Zala	Zalaegerszeg	Kossuth Lajos utca	38	TempJob Services Kft.	info@tempjobservices.hu	+36 1 779 6640	\N	\N
381ad6af-a0c5-4347-9fe6-e6964de3d754	\N	\N	\N	EMP-0275	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Csomagoló	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Lilla	Jakab	other	1995-03-11	Nyíregyháza	Bodnár Krisztina	8131366534	NQ9232212	224447646	single	2024-09-17	2027-12-15	204	82002000-46424954-88751419	BorgWarner Kft.	8040	Magyarország	Zala	Zalaegerszeg	Rákóczi út	76	Housing Solutions Kft.	info@housingsolution.hu	+36 1 215 8672	\N	\N
043115e5-0382-418b-84ce-a9fe35a39175	\N	\N	\N	EMP-0093	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Raktáros	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Miklós	Tóth	male	1972-08-12	Győr	Simon Anett	8852174084	SJ1138788	116345185	married	2024-09-20	2027-07-10	385	74860109-73335785-54057819	Continental Automotive Kft.	3437	Magyarország	Heves	Eger	Széchenyi István tér	100/A	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 298 7073	\N	\N
d36dcee6-9882-4a8e-bca4-5fdfd50b2512	\N	\N	\N	EMP-0041	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Lakatos	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Tibor	Katona	male	1992-09-19	Székesfehérvár	Takács Klára	8798726531	ZY1839882	093747551	married	2024-09-28	2027-02-12	287	47138202-35014771-82297558	BorgWarner Kft.	2689	Magyarország	Pest	Cegléd	Széchenyi István tér	16	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 799 1480	\N	\N
9e622ce6-962a-4d07-843c-8b6ae329fca9	\N	\N	\N	EMP-0425	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Villanyszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Mónika	Varga	female	1975-05-25	Debrecen	Török Orsolya	8113561674	CH1282150	085875110	single	2024-10-21	2027-07-07	188	72577304-50910475-50704986	Samsung SDI Magyarország Kft.	9255	Magyarország	Vas	Szombathely	Bartók Béla út	47	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 330 9381	\N	\N
b901dabe-1d0d-457a-b192-3cb84d6446e4	\N	\N	\N	EMP-0517	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gépkezelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Róbert	Pintér	male	1987-10-30	Szeged	Katona Anikó	8174334203	CM9544407	261321476	married	2024-11-17	2026-10-21	380	15233879-98297889-71118856	Hankook Tire Kft.	6075	Magyarország	Bács-Kiskun	Kecskemét	Bethlen Gábor utca	52	Housing Solutions Kft.	info@housingsolution.hu	+36 1 593 3817	\N	\N
696b24a3-6535-4cac-9054-15f241714760	\N	\N	\N	EMP-0539	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Raktáros	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Mónika	Jakab	female	1986-02-05	Nyíregyháza	Jakab Edit	8889815679	MQ9453222	776935649	married	2024-11-21	2026-04-16	171	21086096-28039359-71026129	Videoton Holding Zrt.	9819	Magyarország	Vas	Szombathely	Arany János utca	45	Housing Solutions Kft.	info@housingsolution.hu	+36 1 733 2019	\N	\N
5b9316a1-cfbc-4c07-be95-0b9874f886fd	\N	\N	\N	EMP-0259	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Takarító	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	János	Pál	male	1983-07-17	Dunaújváros	Nemes Nikolett	8749582503	UA5896279	303909288	married	2024-11-23	2026-08-10	328	63001615-65754185-34521348	Videoton Holding Zrt.	7928	Magyarország	Baranya	Pécs	Fő utca	77	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 930 2491	\N	\N
92d87bed-e7c9-4ea5-8391-af488deaeea7	\N	\N	\N	EMP-0207	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Összeszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Lilla	Sárközi	female	1987-03-18	Kecskemét	Antal Katalin	8098653378	SM8878763	123640996	married	2024-11-27	2027-06-13	358	58927991-74701824-21662900	Suzuki Manufacturing Kft.	3794	Magyarország	Heves	Eger	Hunyadi utca	12/A	TempJob Services Kft.	info@tempjobservices.hu	+36 1 725 7753	\N	\N
a3ca5c11-386b-43f6-833e-a9011fb61db9	\N	\N	\N	EMP-0303	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Villanyszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	István	Szűcs	male	1996-12-14	Budapest	Papp Mónika	8409270450	YS9540022	722696138	single	2024-12-24	2027-12-04	209	31374417-41645486-13699596	Audi Hungária Kft.	9436	Magyarország	Győr-Moson-Sopron	Sopron	Hunyadi utca	82	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 524 5696	\N	\N
a1955998-f3d9-41dd-8f59-7014fb35c2cf	\N	\N	\N	EMP-0301	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Anyagmozgató	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Norbert	Németh	male	1986-11-24	Eger	Nemes Mónika	8349566316	QR3879348	234988424	single	2025-01-06	2027-12-23	179	47004622-18468656-62004855	Samsung SDI Magyarország Kft.	2629	Magyarország	Fejér	Dunaújváros	Fő utca	32	Housing Solutions Kft.	info@housingsolution.hu	+36 1 658 5264	\N	\N
e5ae9097-6707-4330-9dea-331c3cb8f5cb	\N	\N	\N	EMP-0035	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gyártósori operátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	István	Szántó	male	1975-11-19	Hódmezővásárhely	Bálint Bernadett	8563193604	TN3652941	398317873	married	2025-01-08	2026-06-08	239	73663896-39355758-37726967	Suzuki Manufacturing Kft.	3778	Magyarország	Borsod-Abaúj-Zemplén	Miskolc	Szent István körút	15/C	TempJob Services Kft.	info@tempjobservices.hu	+36 1 686 6737	\N	\N
1a66cd6b-bddf-42be-b780-bd7b3ebb5314	\N	\N	\N	EMP-0273	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Lakatos	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	György	Varga	male	1972-05-21	Sopron	Vincze Hajnalka	8124525972	MB2446906	601917170	single	2025-01-10	2026-08-31	296	52308663-23116570-56651584	Samsung SDI Magyarország Kft.	2512	Magyarország	Komárom-Esztergom	Tatabánya	Deák Ferenc utca	52	TempJob Services Kft.	info@tempjobservices.hu	+36 1 396 7633	\N	\N
f0cbf1e4-b6c7-46c7-8f44-bb271116c5f4	\N	\N	\N	EMP-0373	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Targoncavezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Renáta	Antal	female	1980-01-23	Dunaújváros	Tóth Petra	8437597328	CK7476809	700123866	married	2025-01-12	2027-04-29	137	72363200-48952026-60742301	Samsung SDI Magyarország Kft.	7556	Magyarország	Somogy	Kaposvár	Bethlen Gábor utca	61	TempJob Services Kft.	info@tempjobservices.hu	+36 1 388 8164	\N	\N
491e8c08-1d56-4cfa-8433-31072e823f68	\N	\N	\N	EMP-0015	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Csomagoló	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Lajos	Mészáros	other	1972-07-03	Gyöngyös	Lakatos Ágnes	8560830833	YW2628519	382639550	married	2025-01-16	2026-12-27	280	17600263-93654264-75088278	Audi Hungária Kft.	2843	Magyarország	Pest	Szigetszentmiklós	Vörösmarty utca	22	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 642 3170	\N	\N
d2ec4faf-19c2-4064-967b-89adeed08fd9	\N	\N	\N	EMP-0331	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Targoncavezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Béla	Kiss	male	1995-03-27	Érd	Pintér Lilla	8492274676	AC7903827	357705344	divorced	2025-01-16	2026-12-29	141	76172666-46367750-19164955	BorgWarner Kft.	4420	Magyarország	Hajdú-Bihar	Debrecen	Bajcsy-Zsilinszky utca	77	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 904 9023	\N	\N
fa840680-462a-4c73-82f5-61f959314904	\N	\N	\N	EMP-0271	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Műszakvezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Zsófia	Török	female	1998-01-11	Miskolc	Illés Erzsébet	8013905882	TR3977451	064278704	married	2025-01-26	2027-10-01	316	93974244-84742195-10315355	Bosch Csoport Magyarország	2821	Magyarország	Pest	Érd	Széchenyi István tér	93	Housing Solutions Kft.	info@housingsolution.hu	+36 1 215 5366	\N	\N
91d496c9-9186-45b7-81c0-4f028ade996f	\N	\N	\N	EMP-0511	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Karbantartó	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Ádám	Kelemen	male	1979-08-01	Dunaújváros	Bálint Andrea	8029501927	RP9329360	012109461	single	2025-01-30	2026-11-03	418	69802953-90094485-11044551	Videoton Holding Zrt.	9224	Magyarország	Győr-Moson-Sopron	Győr	Alkotmány utca	89	Housing Solutions Kft.	info@housingsolution.hu	+36 1 436 6929	\N	\N
ce1aa7af-5276-4703-a99b-242adcdead9b	\N	\N	\N	EMP-0479	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Betanított munkás	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Ákos	Fekete	male	1995-07-17	Szigetszentmiklós	Oláh Gabriella	8027748714	JD9955382	614379143	married	2025-02-07	2027-10-23	324	14821294-62133742-36726687	BorgWarner Kft.	8221	Magyarország	Fejér	Székesfehérvár	Múzeum körút	29/A	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 200 9391	\N	\N
9da71a43-2fcb-4ef0-82d3-07ac792056d4	\N	\N	\N	EMP-0279	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	CNC operátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Mihály	Szűcs	male	1984-08-15	Zalaegerszeg	Antal Krisztina	8580409266	WT5261842	646561995	single	2025-02-13	2028-01-05	135	97325597-62083243-50857028	Audi Hungária Kft.	6609	Magyarország	Csongrád-Csanád	Szeged	Garay utca	117	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 309 8073	\N	\N
71dabdac-6baf-4286-bb95-0b771f2f624f	\N	\N	\N	EMP-0187	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Minőségellenőr	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Norbert	Jakab	male	1982-01-27	Kaposvár	Oláh Mária	8828729391	BH5111299	604476911	divorced	2025-02-17	2027-06-04	167	88581833-85620262-51267926	BorgWarner Kft.	4929	Magyarország	Hajdú-Bihar	Debrecen	Bajcsy-Zsilinszky utca	102/B	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 525 9860	\N	\N
c355d50d-e1dd-4a6f-b70c-61404b4e7ba8	\N	\N	\N	EMP-0119	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Vágógép kezelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Róbert	Katona	male	1980-10-24	Szombathely	Nemes Margit	8681470482	YT1780223	865121681	single	2025-02-24	2026-08-29	368	86518283-36572112-18393216	Videoton Holding Zrt.	9495	Magyarország	Győr-Moson-Sopron	Győr	Váci utca	98	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 746 6476	\N	\N
09ee8166-5bf0-4391-8dcc-60b0d0b4135a	\N	\N	\N	EMP-0381	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Takarító	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Zsófia	Simon	female	1977-05-01	Érd	Szalai Réka	8155837418	WF9064740	790606036	single	2025-03-01	2026-06-18	166	44899765-43791184-54120723	Hankook Tire Kft.	2061	Magyarország	Fejér	Dunaújváros	Jókai Mór utca	85/B	Housing Solutions Kft.	info@housingsolution.hu	+36 1 444 1021	\N	\N
1e7c32cf-51e0-434f-99b0-18ad906ea4f6	\N	\N	\N	EMP-0157	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Villanyszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Dominik	Kocsis	male	1993-11-22	Sopron	Budai Eszter	8984387770	WF7083937	303905406	married	2025-03-13	2026-10-06	375	23432541-86809524-73504884	Bosch Csoport Magyarország	8620	Magyarország	Zala	Zalaegerszeg	Bajcsy-Zsilinszky utca	109	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 729 1889	\N	\N
01f67687-428b-4bb3-95d4-9ebd81ccecef	\N	\N	\N	EMP-0313	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Műszakvezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Andrea	Fülöp	female	1996-10-04	Szeged	Szilágyi Edit	8998785861	UL1402800	844807727	divorced	2025-04-07	2026-10-10	214	11538675-52995475-77504911	Flex Hungary Kft.	3056	Magyarország	Heves	Gyöngyös	Wesselényi utca	9/A	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 616 7969	\N	\N
5586c59e-5d59-4ddd-ae64-27aed7450bba	\N	\N	\N	EMP-0063	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gépkezelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Mária	Pál	female	1994-07-18	Sopron	Illés Mónika	8661945997	ZT2610207	342394386	single	2025-04-12	2028-02-11	400	62518750-49588362-52019589	Bosch Csoport Magyarország	9691	Magyarország	Győr-Moson-Sopron	Sopron	Damjanich utca	115	TempJob Services Kft.	info@tempjobservices.hu	+36 1 838 3183	\N	\N
4514e702-ed1f-4b96-9bcc-01b45297594f	\N	\N	\N	EMP-0101	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gépkezelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Orsolya	Bíró	female	1986-03-28	Szeged	Juhász Dóra	8014765970	AO3255061	982466363	single	2025-04-15	2027-10-30	377	14954060-24741936-83825678	Suzuki Manufacturing Kft.	6516	Magyarország	Csongrád-Csanád	Szeged	Király utca	2	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 526 1010	\N	\N
d62a143d-b9e0-4c40-8d96-aea09a8aba76	\N	\N	\N	EMP-0473	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Festő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Péter	Bálint	male	1975-05-26	Érd	Kiss Mónika	8653898709	SX9085936	941306194	single	2025-04-18	2026-06-03	132	65814134-60036201-79986577	Bosch Csoport Magyarország	8562	Magyarország	Veszprém	Veszprém	Kossuth Lajos utca	64	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 997 9185	\N	\N
7016d78a-9f55-42d0-a365-fec3a1858d5d	\N	\N	\N	EMP-0493	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Raktári adminisztrátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Orsolya	Fehér	female	1998-11-21	Kaposvár	Orbán Anett	8807760900	CS4763657	688224092	married	2025-04-26	2027-06-30	174	82228328-22982891-60088133	Audi Hungária Kft.	9062	Magyarország	Győr-Moson-Sopron	Győr	Thököly út	115/B	TempJob Services Kft.	info@tempjobservices.hu	+36 1 655 7015	\N	\N
76297ed8-40f8-4778-b942-966812edb775	\N	\N	\N	EMP-0333	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Betanított munkás	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Attila	Lakatos	male	2000-10-08	Hódmezővásárhely	Szűcs Anikó	8353450234	UD1036032	194487224	single	2025-05-08	2026-12-07	193	21337804-23526654-32364229	Suzuki Manufacturing Kft.	5677	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Szent István körút	16	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 733 1473	\N	\N
4da36d8c-5d7d-42b8-bb57-930229e507a0	\N	\N	\N	EMP-0071	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Vágógép kezelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Zsuzsanna	Fülöp	female	1996-04-08	Dunakeszi	Lakatos Klára	8221633419	AQ3393552	943745375	single	2025-05-18	2027-09-19	117	50318220-97508447-23657686	Videoton Holding Zrt.	8922	Magyarország	Fejér	Székesfehérvár	Fő utca	51	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 585 4582	\N	\N
155e0c10-9ed1-4250-a779-2b1195f9c98b	\N	\N	\N	EMP-0219	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Minőségellenőr	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	János	Gulyás	male	1982-10-03	Veszprém	Lakatos Eszter	8739731161	TE5844541	371785689	single	2025-05-28	2026-10-15	310	53486070-34480848-23325301	Videoton Holding Zrt.	5850	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Mátyás király utca	40	Housing Solutions Kft.	info@housingsolution.hu	+36 1 305 9268	\N	\N
17f74ee7-2b55-4c65-a56f-b82f3d8b5034	\N	\N	\N	EMP-0281	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Anyagmozgató	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Petra	Orbán	female	1980-02-18	Szombathely	Szabó Anikó	8263190038	IH8847491	930475451	married	2025-06-16	2026-03-30	196	86617494-46851279-59017007	Flex Hungary Kft.	7416	Magyarország	Somogy	Kaposvár	Baross utca	58	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 500 8410	\N	\N
0044a370-f27c-46a0-82df-212b879d8b6f	\N	\N	\N	EMP-0481	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Karbantartó	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Gergő	Bogdán	male	1970-10-06	Eger	Szalai Adrienn	8211193121	DB3585920	816082396	divorced	2025-06-22	2027-07-12	151	88625451-25477744-84472350	Samsung SDI Magyarország Kft.	5306	Magyarország	Békés	Békéscsaba	Deák Ferenc utca	93	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 386 8912	\N	\N
407dea8e-ff52-4487-8ee2-5eb55103c6a7	\N	\N	\N	EMP-0233	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	CNC operátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Orsolya	Takács	female	1985-11-08	Szeged	Máté Katalin	8314606678	LG6312534	803614533	married	2025-07-09	2026-11-17	129	86190051-96534408-96388994	Hankook Tire Kft.	2514	Magyarország	Pest	Dunakeszi	Baross utca	19	TempJob Services Kft.	info@tempjobservices.hu	+36 1 660 5837	\N	\N
a80f1fa9-3023-4715-b28e-4643a0871023	\N	\N	\N	EMP-0419	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Összeszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Orsolya	Máté	female	1977-01-14	Győr	Bogdán Hajnalka	8449840460	LB5713457	547899943	divorced	2025-07-12	2027-06-22	376	78028888-96767821-90147911	Denso Gyártó Magyarország Kft.	2098	Magyarország	Pest	Érd	Thököly út	47	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 217 5170	\N	\N
02fa4dae-bb71-4c45-aac3-d72778279bff	\N	\N	\N	EMP-0263	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Festő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	János	Gulyás	male	1986-05-31	Kecskemét	Molnár Margit	8996054673	HA1766095	704382321	single	2025-07-19	2027-01-24	286	99533076-48181711-56922189	Suzuki Manufacturing Kft.	2397	Magyarország	Pest	Érd	Petőfi Sándor utca	19	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 460 6829	\N	\N
bd4c64be-31a2-4693-a74b-762ff83af566	\N	\N	\N	EMP-0383	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Villanyszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Anna	Hegedűs	female	1994-05-07	Debrecen	Sárközi Dóra	8740135536	XB1641389	568578091	married	2025-07-19	2026-08-19	429	78443637-77516977-26790394	Denso Gyártó Magyarország Kft.	3603	Magyarország	Heves	Eger	Bajcsy-Zsilinszky utca	27	TempJob Services Kft.	info@tempjobservices.hu	+36 1 525 6150	\N	\N
d1857b49-3124-4a88-82e3-a71ade469d1e	\N	\N	\N	EMP-0411	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Lakatos	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Erika	Fehér	female	1984-03-21	Eger	Fehér Mária	8198632782	CQ4509676	394664862	married	2025-08-03	2027-05-19	317	17111363-97602505-70425601	Flex Hungary Kft.	7531	Magyarország	Baranya	Pécs	Dózsa György út	92	TempJob Services Kft.	info@tempjobservices.hu	+36 1 217 8945	\N	\N
fd1d4c17-5c49-4633-8a2d-5dc8ad5a573a	\N	\N	\N	EMP-0065	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Raktári adminisztrátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Anikó	Balogh	female	1974-08-23	Érd	Vincze Anett	8367584170	BE4066546	388231005	married	2025-08-04	2027-01-28	369	11673999-31980380-22127544	Continental Automotive Kft.	7374	Magyarország	Somogy	Kaposvár	Szent István körút	105	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 935 2958	\N	\N
6bec8cd3-56eb-4a42-bb05-674e6afbb28c	\N	\N	\N	EMP-0123	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Vágógép kezelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Sándor	Nagy	male	1982-05-31	Székesfehérvár	Kozma Anna	8122123827	CY9752053	588095624	married	2025-08-06	2026-06-28	240	99499385-25636550-13121392	Bosch Csoport Magyarország	9930	Magyarország	Győr-Moson-Sopron	Sopron	Baross utca	18	Housing Solutions Kft.	info@housingsolution.hu	+36 1 474 4168	\N	\N
c49d44e7-3a70-4532-bd21-e216a9a227fa	\N	\N	\N	EMP-0217	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Összeszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Dominik	Jakab	male	1994-08-12	Sopron	Pintér Edit	8450333174	EC7581926	781171033	single	2025-08-21	2027-11-26	341	27589815-78039830-14985346	Videoton Holding Zrt.	9242	Magyarország	Győr-Moson-Sopron	Sopron	Bem József utca	11	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 248 5043	\N	\N
bf4277a5-9507-4ddc-a03a-d4f5467dc486	\N	\N	\N	EMP-0439	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Raktári adminisztrátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Lajos	Katona	male	1995-12-08	Szeged	Nagy Andrea	8463711457	OI7609704	060833875	single	2025-09-06	2026-12-26	245	47967331-70048995-43813628	Denso Gyártó Magyarország Kft.	5461	Magyarország	Békés	Békéscsaba	Bartók Béla út	49	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 445 7294	\N	\N
17572ae9-fb22-4343-be15-bd5b5bbec714	\N	\N	\N	EMP-0127	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Műszakvezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Viktor	Fehér	male	1989-11-19	Érd	Török Renáta	8716442856	EV6656549	570349116	married	2025-09-11	2026-07-29	368	22166010-69095976-69962586	Denso Gyártó Magyarország Kft.	3951	Magyarország	Borsod-Abaúj-Zemplén	Miskolc	Bartók Béla út	93	TempJob Services Kft.	info@tempjobservices.hu	+36 1 460 7830	\N	\N
b9b44ed0-dbb6-4b6d-83ba-4b33d06f9949	\N	\N	\N	EMP-0023	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Lakatos	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Lajos	Lukács	male	1985-09-17	Cegléd	Kelemen Orsolya	8627157322	IV3105035	396488215	single	2025-09-28	2027-08-18	290	62053111-27501759-82725848	Bosch Csoport Magyarország	9239	Magyarország	Győr-Moson-Sopron	Győr	Bajcsy-Zsilinszky utca	109/B	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 255 9504	\N	\N
75275c8c-f2f0-47cd-97b5-d963a02e0a0d	\N	\N	\N	EMP-0241	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Takarító	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Vivien	Máté	other	1970-02-11	Kaposvár	Máté Viktória	8119245479	NN8759199	607109065	divorced	2025-11-15	2027-04-26	238	73092652-92516400-44657543	Flex Hungary Kft.	5402	Magyarország	Békés	Békéscsaba	Mátyás király utca	20	Housing Solutions Kft.	info@housingsolution.hu	+36 1 640 8672	\N	\N
2d24a46b-39de-4e35-9d2b-61097b44515e	\N	\N	\N	EMP-0413	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Műszakvezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Dávid	Lakatos	male	1994-05-31	Hódmezővásárhely	Tóth Mária	8423825664	XV3282432	152677843	single	2025-12-23	2026-12-13	234	98155318-83976103-39148718	BorgWarner Kft.	9012	Magyarország	Vas	Szombathely	Szent István körút	82	Housing Solutions Kft.	info@housingsolution.hu	+36 1 282 3188	\N	\N
163790b6-b9d7-4a8e-85e1-913cd2f818d6	\N	\N	\N	EMP-0577	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Minőségellenőr	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Anikó	Bíró	female	1991-11-14	Sopron	Szabó Orsolya	8244067938	DU1837076	802673980	single	2025-12-24	2027-06-01	168	10052489-53401576-92849955	Continental Automotive Kft.	3507	Magyarország	Heves	Gyöngyös	Bajcsy-Zsilinszky utca	3	Housing Solutions Kft.	info@housingsolution.hu	+36 1 483 4195	\N	\N
5a071ef8-5503-4d62-9fe7-54b80d2134a6	\N	\N	\N	EMP-0377	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Műszakvezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Judit	Kiss	other	1982-09-29	Székesfehérvár	Simon Katalin	8834583013	HD2807582	878981268	single	2026-01-13	2027-07-26	141	55379459-63694881-29713551	BorgWarner Kft.	9068	Magyarország	Győr-Moson-Sopron	Győr	Széchenyi István tér	64	Housing Solutions Kft.	info@housingsolution.hu	+36 1 854 1532	\N	\N
e8fa4e7b-b51a-4d14-8f2b-357f54b0704b	\N	\N	\N	EMP-0009	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Karbantartó	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Judit	Sárközi	female	1975-07-06	Kecskemét	Bálint Anikó	8708058062	IY7881665	616909365	married	2026-01-26	2027-05-15	174	76199062-45905235-36635157	Audi Hungária Kft.	6992	Magyarország	Bács-Kiskun	Kecskemét	Dózsa György út	118	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 230 9545	\N	\N
5b30e419-4f45-4d8e-a698-b38ab0b91085	\N	\N	\N	EMP-0589	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	CNC operátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Dávid	Szilágyi	male	1990-05-14	Pécs	Oláh Ágnes	8167354460	FF9041563	401541950	married	2024-05-03	2027-01-05	186	69913164-58102108-32540473	Suzuki Manufacturing Kft.	3602	Magyarország	Heves	Eger	Alkotmány utca	96	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 644 6066	\N	\N
8d1dcd86-fda1-46e6-94c9-794719b90329	\N	\N	\N	EMP-0315	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Targoncavezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Renáta	Máté	other	1986-06-16	Budapest	Kozma Katalin	8876051250	EI8400900	254355002	divorced	2024-05-08	2027-12-16	137	43264309-36256982-44195659	BorgWarner Kft.	5618	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Vörösmarty utca	44	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 439 1442	\N	\N
a803df02-b7f2-4c7b-9999-9f685237c7a2	\N	\N	\N	EMP-0069	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gépkezelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Adrienn	Budai	female	1974-07-13	Szeged	Balogh Erika	8762500057	JP9086453	755343228	single	2024-05-08	2027-06-27	413	89996618-44045157-20176811	Audi Hungária Kft.	7337	Magyarország	Somogy	Kaposvár	Dózsa György út	52	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 875 1599	\N	\N
b3de8436-97da-44a0-aa1c-a29a39a7b160	\N	\N	\N	EMP-0073	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gépkezelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Imre	Budai	male	1998-05-03	Cegléd	Hegedűs Viktória	8830583875	TJ2881771	205378906	divorced	2024-06-18	2027-04-19	239	67735493-67790276-69304141	Bosch Csoport Magyarország	8061	Magyarország	Zala	Zalaegerszeg	Király utca	30	Housing Solutions Kft.	info@housingsolution.hu	+36 1 467 8843	\N	\N
a7449f4f-165c-471f-be47-809102974506	\N	\N	\N	EMP-0587	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Raktáros	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Zsuzsanna	Bíró	female	1997-08-19	Pécs	Bálint Ilona	8611451044	ST6437074	437210306	single	2024-06-21	2027-03-11	321	22956523-72793816-72103098	Samsung SDI Magyarország Kft.	4863	Magyarország	Hajdú-Bihar	Debrecen	Arany János utca	59	TempJob Services Kft.	info@tempjobservices.hu	+36 1 701 6431	\N	\N
630784b8-37ee-4d77-a232-dbc15dbe35a0	\N	\N	\N	EMP-0423	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Hegesztő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Lajos	Kiss	male	1996-07-29	Cegléd	Hegedűs Eszter	8352771125	SW5993719	414265198	single	2024-06-22	2026-09-17	348	45263150-52636138-51170657	Hankook Tire Kft.	3614	Magyarország	Heves	Gyöngyös	Szent István körút	91	Housing Solutions Kft.	info@housingsolution.hu	+36 1 821 5598	\N	\N
6134928b-63a4-44b9-97b5-de7bc7fcad57	\N	\N	\N	EMP-0237	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Anyagmozgató	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Krisztián	Simon	male	1998-08-25	Székesfehérvár	Sárközi Krisztina	8950591076	SK5637000	878654107	married	2024-06-23	2026-10-31	377	75172496-52271541-45802819	Samsung SDI Magyarország Kft.	7825	Magyarország	Baranya	Pécs	Móricz Zsigmond körtér	21	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 810 1740	\N	\N
7bfb1092-9197-4ea0-9049-92d5304feea9	\N	\N	\N	EMP-0277	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	CNC operátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Bence	Antal	male	1973-05-13	Zalaegerszeg	Simon Zsófia	8657904448	WF4190254	658998897	single	2024-07-01	2026-08-18	279	89467106-29703041-18565546	BorgWarner Kft.	9455	Magyarország	Vas	Szombathely	Szent István körút	107	TempJob Services Kft.	info@tempjobservices.hu	+36 1 879 5779	\N	\N
59eca617-9a46-43db-97e8-2bde539654bb	\N	\N	\N	EMP-0113	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Karbantartó	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Sándor	Vincze	male	1983-06-18	Dunakeszi	Takács Kinga	8280249562	XI8559157	682144379	married	2024-07-12	2026-03-19	113	71259613-35682972-47486290	Flex Hungary Kft.	2207	Magyarország	Pest	Cegléd	Deák Ferenc utca	15/C	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 694 6046	\N	\N
14c79bbb-de5f-4620-940b-05aac54abb73	\N	\N	\N	EMP-0433	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Összeszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Miklós	Balogh	male	1974-12-06	Pécs	Gulyás Éva	8345920165	RD9865622	139191602	married	2024-07-13	2026-03-24	400	65915372-37042576-25918159	Audi Hungária Kft.	6559	Magyarország	Csongrád-Csanád	Szeged	Hunyadi utca	61	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 629 5124	\N	\N
f0b37036-0323-4e07-b42f-1a2fae06fe9c	\N	\N	\N	EMP-0269	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Logisztikai munkatárs	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Ádám	Szántó	male	1999-10-02	Veszprém	Orbán Erzsébet	8184484312	DN3920449	986507151	married	2024-07-31	2028-01-19	324	30474066-97875176-68192384	Flex Hungary Kft.	6135	Magyarország	Csongrád-Csanád	Szeged	Rákóczi út	74	Housing Solutions Kft.	info@housingsolution.hu	+36 1 341 9766	\N	\N
88b0e6f9-2d81-4f29-bfd3-e20357243f03	\N	\N	\N	EMP-0451	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Raktári adminisztrátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Béla	Nagy	male	1979-02-22	Zalaegerszeg	Bálint Ágnes	8027068106	GC7676759	395140704	married	2024-08-08	2027-09-07	427	42427900-75231871-85554836	Audi Hungária Kft.	1033	Magyarország	Budapest	Budapest	Szent István körút	63	TempJob Services Kft.	info@tempjobservices.hu	+36 1 605 3834	\N	\N
d8d8a0a9-1f0b-4de3-8a9c-a3149308c0d5	\N	\N	\N	EMP-0007	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Lakatos	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Levente	Vincze	male	1975-09-19	Békéscsaba	Katona Anna	8624150759	JM4558690	956671066	married	2024-08-19	2026-11-03	296	72564271-60973458-93521390	Samsung SDI Magyarország Kft.	2440	Magyarország	Pest	Érd	Bartók Béla út	40	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 963 1607	\N	\N
c2dc1abb-4183-402f-a337-9aafd54cb059	\N	\N	\N	EMP-0391	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Villanyszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Emese	Nagy	female	1971-12-18	Veszprém	Vincze Renáta	8788289626	VA2982115	492848589	single	2024-08-29	2026-04-28	188	24998558-51882717-62334026	BorgWarner Kft.	9329	Magyarország	Győr-Moson-Sopron	Sopron	Baross utca	5/C	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 852 7635	\N	\N
8463559d-a779-4cbb-b8ba-5f51278382f8	\N	\N	\N	EMP-0265	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Vágógép kezelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Emese	Budai	female	1979-08-18	Gyöngyös	Takács Anikó	8389562746	QK1534897	934217993	married	2024-09-07	2027-06-09	194	46808349-95555498-99485985	Continental Automotive Kft.	5223	Magyarország	Békés	Békéscsaba	Jókai Mór utca	82	TempJob Services Kft.	info@tempjobservices.hu	+36 1 539 7668	\N	\N
eb1aa907-23e6-4ddf-a90c-2a5d8f86dac4	\N	\N	\N	EMP-0067	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Lakatos	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Norbert	Fehér	male	1984-12-22	Cegléd	Kelemen Edit	8593886037	LL2029196	177094386	married	2024-09-30	2026-05-01	351	35998331-33971284-54736150	Videoton Holding Zrt.	4630	Magyarország	Hajdú-Bihar	Debrecen	Petőfi Sándor utca	114	Housing Solutions Kft.	info@housingsolution.hu	+36 1 355 8278	\N	\N
f252b9ca-0267-4c2c-b24f-4cd840b42c95	\N	\N	\N	EMP-0229	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Műszakvezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Attila	Lakatos	male	1978-10-17	Dunaújváros	Jakab Zsuzsanna	8490255796	VV8079925	304718219	single	2024-10-18	2026-03-17	169	35972396-53461963-98440915	Audi Hungária Kft.	9526	Magyarország	Győr-Moson-Sopron	Sopron	Bethlen Gábor utca	30	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 595 6569	\N	\N
b819a740-4d19-40b8-b5bb-900f4c2cee44	\N	\N	\N	EMP-0499	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Összeszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Mária	Balogh	female	1995-12-27	Eger	Soós Zsuzsanna	8921422712	QK1666368	558537706	married	2024-10-29	2027-12-22	123	66735111-75665176-92928183	Hankook Tire Kft.	3527	Magyarország	Heves	Gyöngyös	Thököly út	66	Housing Solutions Kft.	info@housingsolution.hu	+36 1 975 8874	\N	\N
42198f46-08ea-4230-a432-53818fd7c688	\N	\N	\N	EMP-0339	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Karbantartó	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Hajnalka	Jakab	female	1989-02-28	Szombathely	Budai Erzsébet	8959442346	NH5385174	462338643	divorced	2024-10-30	2027-12-22	243	69693340-83217666-24056978	Continental Automotive Kft.	7535	Magyarország	Somogy	Kaposvár	Bem József utca	59	TempJob Services Kft.	info@tempjobservices.hu	+36 1 515 6008	\N	\N
2bfe05a3-6646-4389-9e3a-0171ac0a934f	\N	\N	\N	EMP-0441	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Minőségellenőr	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Orsolya	Kelemen	female	1974-11-07	Nyíregyháza	Illés Margit	8285711762	XP9840386	037199231	single	2024-11-07	2026-09-10	420	77476289-94611538-19418473	Suzuki Manufacturing Kft.	9889	Magyarország	Vas	Szombathely	Kossuth Lajos utca	37/C	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 809 7900	\N	\N
feda4684-02ff-4a95-aa40-13a0cd1935d2	\N	\N	\N	EMP-0055	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Targoncavezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Hajnalka	Simon	female	1997-01-30	Győr	Nagy Szilvia	8161581560	YK9757295	201653915	single	2024-11-09	2026-10-11	101	41513922-63743849-56297558	Flex Hungary Kft.	6093	Magyarország	Bács-Kiskun	Kecskemét	Deák Ferenc utca	58	TempJob Services Kft.	info@tempjobservices.hu	+36 1 318 7755	\N	\N
f7d5c4ab-8a13-4d27-b01f-201529623a8b	\N	\N	\N	EMP-0125	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gyártósori operátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Lajos	Budai	male	1986-06-18	Pécs	Bíró Ilona	8973938048	TQ2564556	658499280	married	2024-11-13	2026-08-09	156	80006236-27138147-21001626	Flex Hungary Kft.	9095	Magyarország	Győr-Moson-Sopron	Sopron	Bajcsy-Zsilinszky utca	97/C	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 712 1690	\N	\N
4085351f-f23f-47ea-bd46-42322909e415	\N	\N	\N	EMP-0343	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Vágógép kezelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Róbert	Fülöp	male	1973-05-20	Gyöngyös	Bíró Erzsébet	8797566551	NN8417526	847000730	married	2024-11-13	2026-10-30	306	17083998-37351651-81345381	Hankook Tire Kft.	3299	Magyarország	Borsod-Abaúj-Zemplén	Miskolc	Arany János utca	113	TempJob Services Kft.	info@tempjobservices.hu	+36 1 523 4519	\N	\N
aafe2838-5c68-4e6c-be5a-f3b71ed9c690	\N	\N	\N	EMP-0137	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Minőségellenőr	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Ágnes	Pál	female	1996-08-23	Kaposvár	Fülöp Hajnalka	8765745391	CU8680334	425850768	married	2024-11-27	2026-11-02	119	89848447-99609055-29051979	Flex Hungary Kft.	7439	Magyarország	Somogy	Kaposvár	Váci utca	8/A	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 261 5391	\N	\N
e98a4ca6-dbd4-4fde-914f-d4630b7b4ebc	\N	\N	\N	EMP-0579	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gyártósori operátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Nikolett	Soós	female	1998-11-17	Dunakeszi	Horváth Ilona	8237324026	VX3734107	918521544	single	2024-12-12	2026-09-29	248	15463376-62696722-49607160	Bosch Csoport Magyarország	5949	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Arany János utca	1	Housing Solutions Kft.	info@housingsolution.hu	+36 1 377 8417	\N	\N
7cfe5810-ff8b-4665-ae6e-878784aba007	\N	\N	\N	EMP-0571	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Takarító	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	András	Rácz	male	1978-05-29	Győr	Kozma Hajnalka	8740914562	TD6590169	349058041	single	2024-12-17	2027-04-07	171	73675397-93819384-74698249	Samsung SDI Magyarország Kft.	2420	Magyarország	Pest	Dunakeszi	Vörösmarty utca	68	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 930 9867	\N	\N
094c45b2-3c67-4316-a02a-4045b37df54a	\N	\N	\N	EMP-0585	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Műszakvezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Edit	Juhász	female	1999-07-10	Kaposvár	Orbán Nóra	8155422544	FJ8975976	407631398	single	2025-01-15	2026-08-15	230	86138934-53657125-24302424	Bosch Csoport Magyarország	5937	Magyarország	Békés	Békéscsaba	Petőfi Sándor utca	51	TempJob Services Kft.	info@tempjobservices.hu	+36 1 904 6310	\N	\N
18f73606-74e2-490b-be83-e4bbcdb6e5a5	\N	\N	\N	EMP-0253	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Műszakvezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Ágnes	Budai	female	1997-05-20	Kecskemét	Budai Margit	8544599714	IZ5584937	680957382	married	2025-02-26	2027-11-30	180	99004518-20952192-20434983	Videoton Holding Zrt.	3458	Magyarország	Heves	Eger	Garay utca	12	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 965 1140	\N	\N
8abafd27-0f6b-435e-b7fc-e77c72d3fdfb	\N	\N	\N	EMP-0221	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Összeszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Gabriella	Kelemen	female	1991-12-21	Kecskemét	Szabó Adrienn	8645039198	JM4766900	836907848	single	2025-03-01	2027-06-08	145	77768853-86316464-16255802	Continental Automotive Kft.	2008	Magyarország	Pest	Érd	Ady Endre utca	86	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 216 7017	\N	\N
b2d96af5-bf35-436f-bbbf-008b20dd27ea	\N	\N	\N	EMP-0387	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Lakatos	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Dániel	Fülöp	male	1970-01-30	Eger	Nemes Mónika	8759763468	CH8257628	171124676	married	2025-03-11	2026-04-07	224	70593198-76621187-48383650	Flex Hungary Kft.	6330	Magyarország	Csongrád-Csanád	Szeged	Fő utca	5	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 797 2498	\N	\N
d3158ddc-d7ac-4f34-b99f-0f7610498dab	\N	\N	\N	EMP-0457	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gyártósori operátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Csaba	Pál	male	1982-11-19	Pécs	Kelemen Ágnes	8396224869	EE7404800	037884198	married	2025-03-29	2028-01-02	355	28574224-66425011-33430767	Suzuki Manufacturing Kft.	2308	Magyarország	Pest	Szigetszentmiklós	Múzeum körút	115	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 880 1529	\N	\N
407acada-54a6-46cb-87a2-13f3c9df5a58	\N	\N	\N	EMP-0079	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Lakatos	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Róbert	Varga	male	1996-09-03	Debrecen	Lakatos Eszter	8375205041	MO1304377	858775535	married	2025-04-01	2026-11-20	180	62077352-69638526-40959509	Samsung SDI Magyarország Kft.	2907	Magyarország	Pest	Érd	Király utca	25	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 605 3136	\N	\N
439fff74-799b-4285-8974-d42884477efa	\N	\N	\N	EMP-0431	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Betanított munkás	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Ágnes	Oláh	female	1985-06-11	Eger	Molnár Krisztina	8493374116	NE2250502	020354563	single	2025-04-11	2027-06-14	141	16880655-20735075-76890663	Flex Hungary Kft.	1263	Magyarország	Budapest	Budapest	Kossuth Lajos utca	115	Housing Solutions Kft.	info@housingsolution.hu	+36 1 260 9077	\N	\N
ba882c29-756f-4b25-85af-0835b3495e48	\N	\N	\N	EMP-0257	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Műszakvezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	György	Hegedűs	male	1981-10-02	Szombathely	Jakab Zsuzsanna	8675047961	YE4039068	784052303	single	2025-04-18	2027-03-22	399	23973390-54214777-60389680	Hankook Tire Kft.	6265	Magyarország	Csongrád-Csanád	Szeged	Széchenyi István tér	2	TempJob Services Kft.	info@tempjobservices.hu	+36 1 452 2418	\N	\N
8ae790ce-2ae5-4ba4-acfb-bd9776212746	\N	\N	\N	EMP-0337	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Minőségellenőr	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Dominik	Lukács	male	1988-10-21	Székesfehérvár	Orbán Zsófia	8571836955	NA1603096	312117383	single	2025-04-25	2027-07-02	117	36710371-27409641-97200036	Continental Automotive Kft.	2197	Magyarország	Pest	Érd	Mátyás király utca	96	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 447 4611	\N	\N
1d648b9c-beca-4958-b2f4-73e253dd07e4	\N	\N	\N	EMP-0285	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gyártósori operátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Renáta	Juhász	female	1995-11-28	Szolnok	Juhász Erzsébet	8502535978	JQ6814415	172060103	single	2025-05-20	2027-02-15	172	12365856-31239757-94124329	Flex Hungary Kft.	2399	Magyarország	Fejér	Dunaújváros	Bethlen Gábor utca	115	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 368 6185	\N	\N
2d5d24bf-7088-4554-aedc-323eaed987bf	\N	\N	\N	EMP-0429	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gyártósori operátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Klára	Jakab	female	1988-12-12	Szeged	Máté Katalin	8749987434	UU8320949	191148744	single	2025-05-29	2026-03-24	388	80167937-73774193-90661477	BorgWarner Kft.	6521	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Damjanich utca	97	TempJob Services Kft.	info@tempjobservices.hu	+36 1 292 1057	\N	\N
ab02187d-03e6-4609-ba13-94ad50378de3	\N	\N	\N	EMP-0421	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Anyagmozgató	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Lajos	Kelemen	male	1986-01-20	Szolnok	Vincze Orsolya	8950074573	LW1488216	341601374	divorced	2025-05-30	2026-04-08	167	58799544-99016433-24774555	Continental Automotive Kft.	6030	Magyarország	Csongrád-Csanád	Szeged	Rákóczi út	84	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 531 2365	\N	\N
1a801d26-d6a2-4110-9635-b8c3ab659bf7	\N	\N	\N	EMP-0129	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	CNC operátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Adrienn	Hegedűs	female	1991-05-24	Eger	Szilágyi Anikó	8216503743	YI3477155	322397406	married	2025-06-06	2028-01-26	153	89735599-19432767-66494310	Denso Gyártó Magyarország Kft.	7809	Magyarország	Baranya	Pécs	Bartók Béla út	12	TempJob Services Kft.	info@tempjobservices.hu	+36 1 812 3765	\N	\N
94bc0328-4ad6-40e9-9a2b-ff254752caa2	\N	\N	\N	EMP-0335	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gépkezelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Lilla	Bodnár	female	1994-10-20	Szeged	Török Margit	8734505709	SE4923573	824944588	single	2025-06-10	2026-04-03	291	81322931-13669154-38276282	Flex Hungary Kft.	3215	Magyarország	Heves	Gyöngyös	Király utca	86	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 349 6113	\N	\N
091a7a68-9805-4789-b1c7-a61163f4b934	\N	\N	\N	EMP-0365	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	CNC operátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Emese	Kovács	female	1982-08-06	Kecskemét	Simon Edit	8118192424	GB7538101	222808989	married	2025-06-30	2027-10-05	282	10686181-93620930-70301973	Videoton Holding Zrt.	5100	Magyarország	Békés	Békéscsaba	Hunyadi utca	76	TempJob Services Kft.	info@tempjobservices.hu	+36 1 841 4582	\N	\N
8e6adc19-0659-454e-8e18-cea710fdd98e	\N	\N	\N	EMP-0045	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gépkezelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Krisztián	Lukács	male	1976-07-13	Nyíregyháza	Varga Nóra	8874129066	UE8969557	730117399	single	2025-07-27	2027-04-09	120	45998606-48500881-16565008	BorgWarner Kft.	8542	Magyarország	Zala	Zalaegerszeg	Dózsa György út	54/A	Housing Solutions Kft.	info@housingsolution.hu	+36 1 885 2182	/uploads/employees/thumb_1771527337307.jpg	\N
11433071-b57b-4290-b140-21dfcced7211	\N	\N	\N	EMP-0121	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Csomagoló	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Levente	Takács	male	1975-09-25	Békéscsaba	Pál Erzsébet	8347814511	GO9469231	560445928	married	2025-08-08	2028-01-20	341	56814603-11896536-84748512	Flex Hungary Kft.	9295	Magyarország	Győr-Moson-Sopron	Sopron	Széchenyi István tér	17/A	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 901 2933	\N	\N
fec43f3d-131b-4fc3-bd67-375bf1c9371c	\N	\N	\N	EMP-0557	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gépkezelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Miklós	Bogdán	male	1993-10-02	Zalaegerszeg	Bálint Zsuzsanna	8799071680	HY2392483	646045489	single	2025-08-16	2027-10-23	399	93328875-97336472-60397190	Samsung SDI Magyarország Kft.	2173	Magyarország	Pest	Szigetszentmiklós	Dózsa György út	101	TempJob Services Kft.	info@tempjobservices.hu	+36 1 921 4717	\N	\N
427e1e3e-ea22-4232-95c3-0b4924010f0f	\N	\N	\N	EMP-0289	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gépkezelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Krisztina	Szántó	female	1996-02-15	Szeged	Szűcs Bianka	8511270534	AF6421672	947418479	married	2025-08-23	2027-06-03	240	44838399-76962001-24987829	BorgWarner Kft.	9222	Magyarország	Győr-Moson-Sopron	Sopron	Vörösmarty utca	84/C	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 792 9344	\N	\N
a2483c25-6894-4ae1-b7b9-e44b3bbf5097	\N	\N	\N	EMP-0407	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Villanyszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Ákos	Molnár	other	1998-02-15	Szolnok	Gulyás Bianka	8769502174	OJ5209164	695344287	divorced	2025-09-13	2027-06-23	273	54443748-54830349-86603812	Hankook Tire Kft.	1188	Magyarország	Budapest	Budapest	Bethlen Gábor utca	19	TempJob Services Kft.	info@tempjobservices.hu	+36 1 250 9082	\N	\N
8b2f2da3-c8c2-4cd2-a5e7-b848645127fa	\N	\N	\N	EMP-0161	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gyártósori operátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Éva	Sárközi	female	1986-08-25	Debrecen	Soós Kinga	8254391465	NW1540047	310199756	married	2025-09-18	2026-10-09	370	95340509-97976410-71141111	Videoton Holding Zrt.	2649	Magyarország	Komárom-Esztergom	Tatabánya	Kossuth Lajos utca	78	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 438 4561	\N	\N
2efba6da-d7bf-497c-8a2f-61f55cc618da	\N	\N	\N	EMP-0601	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Raktári adminisztrátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Erzsébet	Jakab	female	1977-04-11	Dunakeszi	Lukács Gabriella	8473113523	NW2251930	247344877	married	2024-11-02	2027-06-17	318	58027923-59156595-49678512	Bosch Csoport Magyarország	9980	Magyarország	Győr-Moson-Sopron	Sopron	Széchenyi István tér	101	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 358 6639	\N	\N
b537a41f-50b9-404b-9b4d-75d33036936c	\N	\N	\N	EMP-0211	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Logisztikai munkatárs	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Bence	Kelemen	male	1984-03-21	Miskolc	Szántó Nóra	8708426316	RI6805004	775192983	single	2025-12-05	2026-10-19	249	93804111-52933886-41569994	Hankook Tire Kft.	2733	Magyarország	Pest	Érd	Kossuth Lajos utca	31	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 998 3131	\N	\N
754df26f-f36e-4562-950a-911f420b257e	\N	\N	\N	EMP-0351	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Összeszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Gábor	Nemes	male	1977-03-10	Debrecen	Török Anna	8254231595	AO2636915	774995548	single	2025-12-09	2027-06-17	155	47226586-71596413-95493483	Videoton Holding Zrt.	9230	Magyarország	Győr-Moson-Sopron	Győr	Móricz Zsigmond körtér	104	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 441 1079	\N	\N
b78a7d17-b8b6-4117-bb6f-3fb6c5b95389	\N	\N	\N	EMP-0131	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Műszakvezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Kinga	Jakab	female	1992-03-17	Veszprém	Oláh Krisztina	8292038661	EI8789889	742950600	divorced	2025-12-27	2027-01-03	376	75065806-57701012-41739645	Videoton Holding Zrt.	8791	Magyarország	Veszprém	Veszprém	Bem József utca	61/B	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 224 6980	\N	\N
cda05adf-5985-497c-ac58-ae0f2301be65	\N	\N	\N	EMP-0145	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Összeszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	János	Illés	male	1981-07-20	Eger	Török Klára	8825056505	CW9092938	172138149	divorced	2026-01-01	2027-01-29	118	82894574-68245987-40508391	Samsung SDI Magyarország Kft.	8618	Magyarország	Zala	Zalaegerszeg	Garay utca	18	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 306 7647	\N	\N
5fd285bb-daff-4ae5-b36e-8931bedd39a4	\N	\N	\N	EMP-0533	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Logisztikai munkatárs	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Krisztina	Máté	female	1982-08-27	Tatabánya	Fülöp Margit	8629637611	BI6601311	670452132	divorced	2026-01-06	2027-11-13	408	69962494-88095055-72345392	Bosch Csoport Magyarország	7860	Magyarország	Baranya	Pécs	Vörösmarty utca	84	Housing Solutions Kft.	info@housingsolution.hu	+36 1 513 5435	\N	\N
c7686068-71fd-44ea-8a85-d4dfd51ab5e6	\N	\N	\N	EMP-0171	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Logisztikai munkatárs	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Renáta	Nagy	female	1970-09-27	Győr	Orbán Edit	8158427911	JG9413503	379910740	divorced	2026-01-18	2026-10-26	270	98169131-70629280-77923548	BorgWarner Kft.	9456	Magyarország	Győr-Moson-Sopron	Győr	Kossuth Lajos utca	50	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 893 1096	\N	\N
8083d295-f161-4465-ae30-f01e163dbcae	\N	\N	\N	EMP-0153	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Takarító	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Zsófia	Szántó	female	1978-10-22	Pécs	Juhász Gabriella	8966812778	DH2308554	423112391	single	2026-01-20	2027-05-31	339	26702814-81923803-15175042	Flex Hungary Kft.	4836	Magyarország	Hajdú-Bihar	Debrecen	Garay utca	112/A	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 584 5305	\N	\N
4850314d-dc38-47e2-98ba-5cf3d54a5b1a	\N	\N	\N	EMP-0147	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gyártósori operátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Mónika	Hegedűs	female	1982-09-21	Székesfehérvár	Pál Zsófia	8097930029	RK2007975	384414969	divorced	2024-03-17	2027-12-02	285	57521306-80804970-14515619	Bosch Csoport Magyarország	1176	Magyarország	Budapest	Budapest	Dózsa György út	103	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 369 3854	\N	a1a4868f-3b54-4515-a75f-099185a35578
8c01332c-284f-46b0-946a-ddc69aa8a14b	\N	\N	\N	EMP-0249	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Lakatos	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Ilona	Pál	female	1974-03-17	Pécs	Szalai Tímea	8708137707	UZ5604515	242302790	married	2024-03-18	2027-03-27	297	61253631-38965490-13687155	Hankook Tire Kft.	6383	Magyarország	Csongrád-Csanád	Szeged	Bem József utca	84	Housing Solutions Kft.	info@housingsolution.hu	+36 1 533 9839	\N	a1a4868f-3b54-4515-a75f-099185a35578
0e8c2a3b-5914-4b56-9646-2ca67cf6da26	\N	\N	\N	EMP-0195	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Műszakvezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Gabriella	Gulyás	female	1973-11-17	Zalaegerszeg	Sárközi Bernadett	8096179785	TV5597410	221322060	single	2024-03-23	2026-08-26	387	20697555-14644359-17631174	Videoton Holding Zrt.	3128	Magyarország	Heves	Gyöngyös	Wesselényi utca	55/B	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 771 7601	\N	6ade11c0-d24b-449a-af4f-0518414e1700
564c6410-506a-401a-968b-5493a2425a27	\N	\N	\N	EMP-0307	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Csomagoló	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Attila	Oláh	male	1975-10-15	Dunaújváros	Balogh Renáta	8647695906	QJ7193753	141568720	divorced	2024-04-09	2026-03-16	418	57125522-38037149-36572521	Hankook Tire Kft.	2687	Magyarország	Pest	Érd	Móricz Zsigmond körtér	28	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 788 1453	\N	6ade11c0-d24b-449a-af4f-0518414e1700
122b7c6f-02fa-4f47-864a-323e793a08a6	\N	\N	\N	EMP-0543	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Festő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Eszter	Juhász	female	1987-03-15	Pécs	Takács Edit	8747036357	HM5680325	997484314	single	2024-04-26	2026-08-26	259	72911644-53016058-27620149	Suzuki Manufacturing Kft.	4311	Magyarország	Hajdú-Bihar	Debrecen	Arany János utca	51	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 524 3701	\N	a37085e6-132c-40e0-8a30-070e95243711
75b6c7a5-5adf-489e-a63f-d4d3807caf8c	\N	\N	\N	EMP-0109	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Műszakvezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Dóra	Juhász	female	1974-11-19	Dunaújváros	Orbán Ilona	8941305671	FM8040122	641452194	single	2024-05-28	2028-02-22	298	11974279-50346730-41915488	Flex Hungary Kft.	6136	Magyarország	Csongrád-Csanád	Szeged	Vörösmarty utca	119	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 293 9614	\N	a37085e6-132c-40e0-8a30-070e95243711
6a1567f7-bd46-4558-a568-78690e9ae90e	\N	\N	\N	EMP-0461	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Targoncavezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Ákos	Orbán	male	1999-05-29	Győr	Orbán Eszter	8813198663	LQ3181618	669048651	married	2025-08-14	2027-11-28	122	49191144-39679749-44213768	Audi Hungária Kft.	4307	Magyarország	Szabolcs-Szatmár-Bereg	Nyíregyháza	Király utca	114	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 984 1296	\N	\N
56f559e0-8cc2-48ef-a02f-18352e2aa5a0	\N	\N	\N	EMP-0227	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Karbantartó	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Vivien	Orbán	female	1973-07-07	Szeged	Jakab Mária	8948075989	DD7628729	404597790	single	2025-03-27	2027-04-12	132	80745714-18750970-79978737	BorgWarner Kft.	6342	Magyarország	Csongrád-Csanád	Szeged	Vörösmarty utca	21	TempJob Services Kft.	info@tempjobservices.hu	+36 1 425 6765	\N	\N
9cceb046-cbba-4dc5-8612-9be8de0cedb4	\N	\N	\N	EMP-0581	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Karbantartó	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Andrea	Papp	female	1992-11-01	Szigetszentmiklós	Juhász Viktória	8884368397	XD1200137	883432112	divorced	2025-09-24	2026-04-25	212	57869733-36344695-20743554	Samsung SDI Magyarország Kft.	7721	Magyarország	Baranya	Pécs	Móricz Zsigmond körtér	11	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 459 4478	\N	\N
6266d5f0-6414-4d43-ae24-6b9f5975e2a3	\N	\N	\N	EMP-0491	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Csomagoló	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Máté	Szalai	male	1994-05-28	Veszprém	Pintér Orsolya	8377026451	ZM1153623	581537265	married	2025-09-25	2027-04-20	417	50740029-73446567-20337736	BorgWarner Kft.	2638	Magyarország	Komárom-Esztergom	Tatabánya	Múzeum körút	119	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 837 9844	\N	\N
153fb6b2-4b04-4138-9526-9108b004d9b1	\N	\N	\N	EMP-0553	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Logisztikai munkatárs	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Béla	Szűcs	male	1984-07-17	Békéscsaba	Soós Margit	8808724911	ML7965144	148086234	divorced	2025-10-14	2027-05-28	343	81546762-27927843-86600940	Hankook Tire Kft.	2632	Magyarország	Komárom-Esztergom	Tatabánya	Baross utca	30	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 672 7497	\N	\N
38e0500e-4b8e-4b6d-a714-626cd8343398	\N	\N	\N	EMP-0299	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Karbantartó	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Sándor	Bodnár	male	1989-04-09	Hódmezővásárhely	Budai Katalin	8676713196	ZG2742634	600566701	married	2025-11-07	2027-05-10	119	65517649-61637216-47523657	Audi Hungária Kft.	6866	Magyarország	Bács-Kiskun	Kecskemét	Váci utca	108	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 343 7881	\N	\N
92a4271e-6028-41fd-8631-55d18bdb01b5	\N	\N	\N	EMP-0053	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Betanított munkás	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Edit	Kiss	female	1984-08-09	Debrecen	Farkas Anna	8527583739	AZ9728525	291550317	married	2025-11-30	2027-07-19	183	83044012-34019311-96499690	Bosch Csoport Magyarország	2788	Magyarország	Pest	Szigetszentmiklós	Arany János utca	36	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 433 6317	\N	\N
4377ebf8-5026-4854-94ad-1d60404963df	\N	\N	\N	EMP-0031	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Anyagmozgató	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Dániel	Antal	male	1976-04-19	Hódmezővásárhely	Máté Petra	8332839119	QK7465458	080193024	single	2025-12-02	2026-08-09	160	28493890-37326484-30560164	Flex Hungary Kft.	5869	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Wesselényi utca	1	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 491 5051	\N	\N
faa3f95a-66b3-44c4-a4ed-4fbeab129ff3	\N	\N	\N	EMP-0567	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Raktáros	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Ágnes	Pál	female	1989-04-11	Székesfehérvár	Gulyás Kinga	8847161159	ZH6309637	875653720	married	2024-05-28	2027-04-11	130	31746333-45006286-84668584	Audi Hungária Kft.	3724	Magyarország	Heves	Gyöngyös	Rákóczi út	33	TempJob Services Kft.	info@tempjobservices.hu	+36 1 964 9853	\N	ec0d5a05-ffdd-49c5-935d-29e997b0b0ad
9552cc02-0c72-4988-b150-8ca10beb0c3c	\N	\N	\N	EMP-0309	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gyártósori operátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	cf2bb1c3-cc48-4903-b8db-e6b3e5d324ff	Márton	Szabó	male	1978-07-10	Budapest	Varga Adrienn	8783368853	XB7361056	172542037	single	2024-05-29	2027-07-31	342	17551934-67360683-48435012	Flex Hungary Kft.	4568	Magyarország	Hajdú-Bihar	Debrecen	Széchenyi István tér	69	TempJob Services Kft.	info@tempjobservices.hu	+36 1 218 4190	\N	ec0d5a05-ffdd-49c5-935d-29e997b0b0ad
51d17def-78b6-431e-909f-22df2a05500b	\N	\N	\N	EMP-0401	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Hegesztő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Gabriella	Bálint	female	1997-01-22	Szombathely	Fehér Vivien	8682353966	FC8544985	463761516	divorced	2024-03-29	2027-12-19	236	45256652-49420213-94766805	Bosch Csoport Magyarország	7090	Magyarország	Baranya	Pécs	Thököly út	76	Housing Solutions Kft.	info@housingsolution.hu	+36 1 927 5333	\N	e5e4e2c1-8d30-4911-8c48-91b70e3c20bc
eabd422c-83a3-4cdd-b97e-0f73cc81cf38	\N	\N	\N	EMP-0573	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gépkezelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Attila	Soós	male	1970-06-28	Szigetszentmiklós	Farkas Petra	8532007482	PY5399536	864700481	married	2024-04-19	2026-08-17	120	78494916-67301804-92909006	Denso Gyártó Magyarország Kft.	8602	Magyarország	Veszprém	Veszprém	Szent István körút	93/A	TempJob Services Kft.	info@tempjobservices.hu	+36 1 938 9152	\N	6c4fd9ee-0272-4924-a15c-10c461899d58
a1e63b77-682a-4c80-947d-1c32124ab933	\N	\N	\N	EMP-0059	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Összeszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	5701ff3d-5286-4cd5-96c3-9e56a684106e	Mihály	Illés	male	1990-02-09	Pécs	Kiss Ágnes	8340568769	HE4778987	282894518	divorced	2024-04-22	2027-10-11	137	72623816-61325927-90043068	Samsung SDI Magyarország Kft.	2508	Magyarország	Fejér	Dunaújváros	Múzeum körút	37/B	TempJob Services Kft.	info@tempjobservices.hu	+36 1 414 2374	\N	6c4fd9ee-0272-4924-a15c-10c461899d58
7899e001-7996-4c18-93ab-6a3fdc876213	\N	\N	\N	EMP-0199	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Betanított munkás	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	c3adfaac-25ad-43f3-8332-ff4b124c9777	Krisztina	Hegedűs	female	1981-11-03	Békéscsaba	Orbán Margit	8361678604	KU1125314	201662054	married	2024-03-03	2026-08-09	394	20031434-44713276-11261244	Hankook Tire Kft.	6902	Magyarország	Csongrád-Csanád	Szeged	Petőfi Sándor utca	87	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 866 5197	\N	728e4464-14f8-4bba-b279-745e130e1387
2bd65d86-9229-4ae8-b5ae-f34db8e38520	\N	\N	\N	EMP-0497	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Takarító	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Levente	Kozma	male	1978-02-09	Szolnok	Kozma Zsófia	8466353101	MR4092588	549992079	divorced	2024-03-07	2027-07-11	103	43079972-51391083-89655382	Audi Hungária Kft.	5092	Magyarország	Békés	Békéscsaba	Alkotmány utca	56	TempJob Services Kft.	info@tempjobservices.hu	+36 1 553 6078	\N	7830e963-276e-4bca-9c95-3faca091981a
09cd9160-6877-413c-9e17-a120e9611e73	\N	\N	\N	EMP-0563	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Targoncavezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Zsófia	Máté	female	1976-12-15	Dunaújváros	Bálint Zsuzsanna	8527371269	HX7150621	687394571	single	2024-04-06	2028-01-03	237	65325495-50557993-41194474	Hankook Tire Kft.	3635	Magyarország	Borsod-Abaúj-Zemplén	Miskolc	Dózsa György út	102/C	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 638 4039	\N	7830e963-276e-4bca-9c95-3faca091981a
d38b68bf-ea1e-4875-9a25-2fa1d6db766f	\N	\N	\N	EMP-0427	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Logisztikai munkatárs	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Éva	Orbán	female	1974-02-18	Kecskemét	Kelemen Hajnalka	8524367743	UC7184688	190268313	married	2024-04-20	2027-10-13	201	27462872-61628183-40962991	Videoton Holding Zrt.	2838	Magyarország	Pest	Dunakeszi	Hunyadi utca	19	Housing Solutions Kft.	info@housingsolution.hu	+36 1 298 4938	\N	ccd04496-2e57-474f-9f44-a1d028e8c0aa
c9e7abcf-a2a1-4869-afe1-2083dea4f449	\N	\N	\N	EMP-0085	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Villanyszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Dominik	Papp	other	1973-08-30	Nyíregyháza	Máté Ágnes	8330216336	RK7215813	667111978	married	2024-04-22	2027-03-24	157	17182690-86956520-52613066	BorgWarner Kft.	2637	Magyarország	Pest	Dunakeszi	Rákóczi út	107/C	ProStaff Hungary Kft.	info@prostaffhungary.hu	+36 1 411 4046	\N	ccd04496-2e57-474f-9f44-a1d028e8c0aa
a4f24300-fd4f-4e19-9e58-5487b4c05caa	\N	\N	\N	EMP-0555	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Targoncavezető	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Judit	Fehér	female	1977-11-09	Nyíregyháza	Soós Eszter	8727514075	AP9245379	401411041	married	2024-05-28	2026-04-24	277	42073983-41493094-12724867	Audi Hungária Kft.	9879	Magyarország	Győr-Moson-Sopron	Győr	Mátyás király utca	120	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 997 1103	\N	77ec56a1-4144-4a20-80d2-27773080394f
8dd91606-62fd-4937-8a16-aab688182f6a	\N	\N	\N	EMP-0239	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Csomagoló	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e91f95df-4c8b-4878-90df-1cd7aba337ce	Lilla	Kiss	female	1972-12-23	Budapest	Soós Zsófia	8588762557	DR3782864	713900424	single	2024-06-12	2026-03-16	175	69900517-21346419-17214623	BorgWarner Kft.	8220	Magyarország	Fejér	Székesfehérvár	Petőfi Sándor utca	92/C	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 481 9243	\N	77ec56a1-4144-4a20-80d2-27773080394f
3d37a8f6-d204-4f84-9ca3-608557303d5b	\N	\N	\N	EMP-0527	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Összeszerelő	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Zoltán	Lakatos	male	1974-10-02	Békéscsaba	Bodnár Réka	8923698477	YD3286924	263722315	single	2024-03-21	2028-02-16	105	68767442-65245686-68610243	Flex Hungary Kft.	9650	Magyarország	Vas	Szombathely	Vörösmarty utca	67	WorkForce Plusz Kft.	info@workforcepluszk.hu	+36 1 246 1260	\N	a69ade09-c92c-4118-a758-b64be786191e
7f8b959b-e1b5-4802-a04f-2e56bd0bf27a	\N	\N	\N	EMP-0523	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Betanított munkás	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Szabolcs	Illés	male	1990-08-07	Nyíregyháza	Simon Mária	8915027000	JL8357114	269295153	divorced	2024-04-05	2026-09-07	239	20729821-93311626-28925353	Denso Gyártó Magyarország Kft.	6163	Magyarország	Bács-Kiskun	Kecskemét	Damjanich utca	49	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 973 5731	\N	a69ade09-c92c-4118-a758-b64be786191e
c5269b69-d702-4cf0-b69f-c7c3c3229b53	\N	\N	\N	EMP-0505	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	CNC operátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:25:00.412161	e664e190-ca8c-4f33-8b8a-5e307df7f8f9	Hajnalka	Balogh	female	1974-01-03	Cegléd	Fülöp Andrea	8532719293	PV4642771	472212034	single	2024-04-17	2027-09-29	354	93142915-19921595-32300441	Suzuki Manufacturing Kft.	9095	Magyarország	Győr-Moson-Sopron	Győr	Rákóczi út	88/C	MunkaErő Partner Kft.	info@munkaeropartner.hu	+36 1 881 6190	\N	cd4bd91a-cb97-40b3-841a-fd116c7cb48f
42d85154-5a3f-4cf9-a9bb-2cf5d73d419c	\N	\N	\N	EMP-0507	7f80a3c9-c6e0-4b3e-b15f-646faaed946c	Gyártósori operátor	2026-02-19	\N	\N	2026-02-19 09:24:29.496284	2026-02-19 20:56:16.759001	69a1978e-2a26-4ebb-b29d-e433a069d273	Nóra	Szalai	female	1975-06-14	Szeged	Juhász Bianka	8002077681	NQ3974530	918282886	married	2024-03-12	2026-09-15	377	72030605-66997788-16367242	Continental Automotive Kft.	2115	Magyarország	Pest	Érd	Hunyadi utca	12	TempJob Services Kft.	info@tempjobservices.hu	+36 1 340 1211	\N	038ab8d4-0884-4b39-8105-ad112857fa90
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
559600a1-da75-46a8-bef3-391a62985455	15a601c1-b1a0-4180-8f1c-a5f577e28fbd	2026-03-10	\N	Dr. Fogas	\N	dental	\N	f	2026-02-16 06:54:25.413215+00	2026-02-16 06:54:25.413215+00
\.


--
-- Data for Name: notification_templates; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notification_templates (id, contractor_id, name, slug, subject, body_html, body_text, event_type, language, is_active, created_at, updated_at, available_variables) FROM stdin;
ff33f41e-d78c-4d6f-9f72-c58b231da324	\N	Szerződés lejárat	contract_expiry	Szerződés lejárati értesítés	<p>Kedves {{name}},</p><p>Ezúton értesítjük, hogy a(z) <strong>{{workplace}}</strong> munkahelyen fennálló szerződése <strong>{{contract_end}}</strong> napon lejár.</p><p>Kérjük, vegye fel a kapcsolatot a HR osztállyal a szerződés megújítása érdekében.</p><p>Üdvözlettel,<br/>HR-ERP Rendszer</p>	Kedves {{name}}, Ezúton értesítjük, hogy a(z) {{workplace}} munkahelyen fennálló szerződése {{contract_end}} napon lejár. Kérjük, vegye fel a kapcsolatot a HR osztállyal a szerződés megújítása érdekében.	contract_expiry	hu	t	2026-02-15 14:25:18.355024	2026-02-15 14:25:18.355024	["name", "workplace", "contract_end"]
11771fa2-e918-44d3-baa7-2e8db6eb0f2e	\N	Vízum lejárat	visa_expiry	Vízum lejárati értesítés	<p>Kedves {{name}},</p><p>Ezúton értesítjük, hogy a vízuma <strong>{{visa_expiry}}</strong> napon lejár.</p><p>Kérjük, mielőbb intézkedjen a vízum megújításáról, és értesítse a HR osztályt a folyamatról.</p><p>Üdvözlettel,<br/>HR-ERP Rendszer</p>	Kedves {{name}}, Ezúton értesítjük, hogy a vízuma {{visa_expiry}} napon lejár. Kérjük, mielőbb intézkedjen a vízum megújításáról.	visa_expiry	hu	t	2026-02-15 14:25:18.355024	2026-02-15 14:25:18.355024	["name", "visa_expiry"]
1c7cb705-d365-4a5b-ae78-fec28515df9b	\N	Szálláshely felmérés	accommodation_survey	Szálláshely értesítés	<p>Kedves {{name}},</p><p>A(z) <strong>{{accommodation}}</strong> szálláshellyel kapcsolatban szeretnénk tájékoztatni.</p><p>Kérjük, olvassa el az alábbi információkat, és szükség esetén vegye fel a kapcsolatot a szálláshely kezelőjével.</p><p>Üdvözlettel,<br/>HR-ERP Rendszer</p>	Kedves {{name}}, A(z) {{accommodation}} szálláshellyel kapcsolatban szeretnénk tájékoztatni.	accommodation_survey	hu	t	2026-02-15 14:25:18.355024	2026-02-15 14:25:18.355024	["name", "accommodation"]
e54a6144-df86-4852-82ba-6fca901fe5de	\N	Általános értesítés	general	{{subject}}	{{body}}	{{body}}	general	hu	t	2026-02-15 14:25:18.355024	2026-02-15 14:25:18.355024	["subject", "body"]
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.notifications (id, contractor_id, user_id, type, title, message, data, is_read, read_at, sent_at, created_at, link) FROM stdin;
7f08610a-1637-417e-803a-83dc8f4bdf05	\N	e24a1539-d7eb-4f12-8d64-66fb64aa06c8	email	Teszt �rtes�t�s	<p>Kedves Gábor Horváth, ez egy teszt �zenet.</p>	\N	f	\N	2026-02-15 15:41:21.544	2026-02-15 14:41:21.552415	\N
0ba36c06-e2d7-4960-9faa-eae6b713871a	\N	fe07da44-7181-4e4e-931d-9b5a0734cd56	email	Teszt �rtes�t�s	<p>Kedves Katalin Farkas, ez egy teszt �zenet.</p>	\N	f	\N	2026-02-15 15:41:21.553	2026-02-15 14:41:21.561052	\N
dc1ba2c1-b0ce-48b6-bfcd-39717d79d29d	\N	43ea7786-efce-4b5a-a55b-dd38a6273cbf	email	Teszt �rtes�t�s	<p>Kedves István Varga, ez egy teszt �zenet.</p>	\N	f	\N	2026-02-15 15:41:21.556	2026-02-15 14:41:21.56409	\N
839faa46-972c-441e-a5cb-ccfde31bad18	\N	b58290eb-433a-49da-beab-0ac8d7c3d8e5	email	Teszt �rtes�t�s	<p>Kedves Zsuzsanna Molnár, ez egy teszt �zenet.</p>	\N	f	\N	2026-02-15 15:41:21.559	2026-02-15 14:41:21.56664	\N
f03bc375-3b00-45ec-b60a-7699e86e7082	\N	e24a1539-d7eb-4f12-8d64-66fb64aa06c8	email	kjjlh	lkjlgh	\N	f	\N	2026-02-15 16:06:27.851	2026-02-15 15:06:27.853499	\N
1500aeb3-3e3c-4298-a6ac-fd241d08a87f	\N	fe07da44-7181-4e4e-931d-9b5a0734cd56	email	kjjlh	lkjlgh	\N	f	\N	2026-02-15 16:06:27.858	2026-02-15 15:06:27.859753	\N
2f9ce319-10cb-4012-97d1-6cce12587f31	\N	43ea7786-efce-4b5a-a55b-dd38a6273cbf	email	kjjlh	lkjlgh	\N	f	\N	2026-02-15 16:06:27.864	2026-02-15 15:06:27.865783	\N
7de24246-d32f-406b-ac60-5e9daab4ddc2	\N	b58290eb-433a-49da-beab-0ac8d7c3d8e5	email	kjjlh	lkjlgh	\N	f	\N	2026-02-15 16:06:27.868	2026-02-15 15:06:27.869274	\N
b6fbf505-ca7a-4067-aecf-ae7ac67b0d00	\N	43ea7786-efce-4b5a-a55b-dd38a6273cbf	email	Szerződés lejárati értesítés	<p>Kedves István Varga,</p><p>Ezúton értesítjük, hogy a(z) <strong></strong> munkahelyen fennálló szerződése <strong></strong> napon lejár.</p><p>Kérjük, vegye fel a kapcsolatot a HR osztállyal a szerződés megújítása érdekében.</p><p>Üdvözlettel,<br/>HR-ERP Rendszer</p>	\N	f	\N	2026-02-16 16:06:00.477	2026-02-16 15:06:00.478322	\N
dc7c2b59-35a8-479f-a400-1c389befa034	\N	b58290eb-433a-49da-beab-0ac8d7c3d8e5	email	Szerződés lejárati értesítés	<p>Kedves Zsuzsanna Molnár,</p><p>Ezúton értesítjük, hogy a(z) <strong></strong> munkahelyen fennálló szerződése <strong></strong> napon lejár.</p><p>Kérjük, vegye fel a kapcsolatot a HR osztállyal a szerződés megújítása érdekében.</p><p>Üdvözlettel,<br/>HR-ERP Rendszer</p>	\N	f	\N	2026-02-16 16:06:00.484	2026-02-16 15:06:00.485327	\N
a4d08825-4baf-458f-8d59-6276eb7b718c	\N	e24a1539-d7eb-4f12-8d64-66fb64aa06c8	email	Szerződés lejárati értesítés	<p>Kedves Gábor Horváth,</p><p>Ezúton értesítjük, hogy a(z) <strong></strong> munkahelyen fennálló szerződése <strong></strong> napon lejár.</p><p>Kérjük, vegye fel a kapcsolatot a HR osztállyal a szerződés megújítása érdekében.</p><p>Üdvözlettel,<br/>HR-ERP Rendszer</p>	\N	f	\N	2026-02-16 16:06:00.488	2026-02-16 15:06:00.488581	\N
5a7f5b96-a776-4c61-a2d2-fc4e70e2b938	\N	dd66df25-a92f-4285-9f3c-e1d007f8d9c6	success	Hibajegy lezarva	A "Futes javitas" hibajegy sikeresen lezarva (#TKT-0038)	\N	t	\N	\N	2026-02-19 09:38:45.281751	/tickets
3fdbca2c-ca33-4dd2-8181-bba02c073eb5	\N	dd66df25-a92f-4285-9f3c-e1d007f8d9c6	warning	Szerzodes lejarat	Szabo Istvan szerzodese 30 napon belul lejar.	\N	t	\N	\N	2026-02-17 09:38:45.281751	/employees
7807f4a0-c53a-4ca5-a3c6-e98191b37c53	\N	dd66df25-a92f-4285-9f3c-e1d007f8d9c6	success	Export kesz	A munkavallaloi export sikeresen elkeszult.	\N	t	\N	\N	2026-02-15 09:38:45.281751	\N
58ae6ff4-8631-4d0c-b3a1-21cd4c80378a	\N	dd66df25-a92f-4285-9f3c-e1d007f8d9c6	warning	Vizum lejarat figyelmezetes	Kovacs Janos vizuma 7 napon belul lejar. Kerjuk intezkedjen!	\N	t	2026-02-20 09:51:46.484568	\N	2026-02-20 09:36:45.281751	/employees
8b2e3738-3480-46f7-94eb-90ec86aa5765	\N	dd66df25-a92f-4285-9f3c-e1d007f8d9c6	warning	Vizum lejarat figyelmezetes	Horvath Peter vizuma 14 napon belul lejar.	\N	t	2026-02-20 09:52:46.383489	\N	2026-02-20 08:38:45.281751	/employees
134736f3-23fe-43b6-80b8-82f8ee07e82e	\N	dd66df25-a92f-4285-9f3c-e1d007f8d9c6	info	Uj hibajegy erkezett	Csotores a 3. emeleti furdoszobaban (#TKT-0042)	\N	t	2026-02-20 09:52:46.383489	\N	2026-02-20 06:38:45.281751	/tickets
b8d8c667-6131-41c3-beaf-9ccb3612e020	\N	dd66df25-a92f-4285-9f3c-e1d007f8d9c6	info	Uj munkavallalos regisztralt	Nagy Maria sikeresen regisztralt a rendszerbe.	\N	t	2026-02-20 09:52:46.383489	\N	2026-02-18 09:38:45.281751	/employees
193c7609-570a-4ec5-b481-61b3663b4e02	\N	dd66df25-a92f-4285-9f3c-e1d007f8d9c6	info	Szallashely kapacitas	A Deak Ferenc utca 12. szallashely 90%%-os kihasznaltsagon van.	\N	t	2026-02-20 09:52:46.383489	\N	2026-02-16 09:38:45.281751	/accommodations
\.


--
-- Data for Name: organizational_units; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.organizational_units (id, contractor_id, name, parent_id, manager_id, description, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: permissions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.permissions (id, name, slug, module, description, created_at) FROM stdin;
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
7938b457-fa04-425d-857d-fb9d75cc4f0b	Alacsony	low	1	#10b981	2026-02-14 07:28:46.492972
bc8a9389-cd0d-42d5-8101-26d00ad4199a	Normál	normal	2	#64748b	2026-02-14 07:28:46.492972
7f41a25f-5c9b-431b-852c-8503b8e7f000	Sürgős	urgent	3	#f59e0b	2026-02-14 07:28:46.492972
e1eb6372-daea-46c6-9863-0ff9f4042490	Kritikus	critical	4	#ef4444	2026-02-14 07:28:46.492972
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
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.roles (id, name, slug, description, is_system, created_at) FROM stdin;
8c9f1f2e-fb0b-49ae-ac1d-7042debe0958	Szuperadmin	superadmin	Teljes rendszer hozzáférés	t	2026-02-14 07:28:46.485453
7b6584ae-4081-431f-acbc-c7f24be5cee9	Megbízó (Adatkezelő)	data_controller	Saját cég teljes adatkezelése	t	2026-02-14 07:28:46.485453
d657d9cc-16ba-43e8-8c90-04182fb85fd6	Általános Adminisztrátor	admin	HR és ticket kezelés	t	2026-02-14 07:28:46.485453
fa1fa8c9-d96b-4b29-8e8a-168ad6bf2152	Feladat-felelős	task_owner	Ticketek kezelése	t	2026-02-14 07:28:46.485453
246df6cd-23ff-4997-8bf8-03d5cbd790df	Külső Alvállalkozó	contractor	Korlátozott ticket hozzáférés	t	2026-02-14 07:28:46.485453
c92d75dc-98d6-4d68-b227-683d26485336	Felhasználó	user	Alapvető felhasználói jogok	t	2026-02-14 07:28:46.485453
4b4cfd75-62b5-4e84-8637-3ca66bd5ec56	Szállásolt Munkavállaló	accommodated_employee	Szállásolt munkavállaló	t	2026-02-14 15:56:53.414805
\.


--
-- Data for Name: scheduled_report_runs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.scheduled_report_runs (id, scheduled_report_id, status, started_at, completed_at, records_count, file_size, recipients_count, error_message) FROM stdin;
1	1	success	2026-02-20 14:15:29.202245+00	2026-02-20 14:15:32.772609+00	308	177644	1	\N
\.


--
-- Data for Name: scheduled_reports; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.scheduled_reports (id, name, report_type, schedule_type, schedule_time, day_of_week, day_of_month, recipients, filters, format, is_active, next_run_at, created_by, created_at, updated_at) FROM stdin;
1	Napi munkavallaloi riport	employees	daily	08:00:00	\N	\N	{lerchbalazs@gmail.com}	[]	excel	t	2026-02-21 08:00:00+00	dd66df25-a92f-4285-9f3c-e1d007f8d9c6	2026-02-20 14:15:05.568862+00	2026-02-20 15:08:21.360176+00
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
65c2bf99-dfb3-4b06-adfa-10e70c279599	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	HR	hr	\N	#3730a3	👥	t	2026-02-14 07:29:27.056196
a1ed76f4-0bb6-4fd4-b40e-859ecda34ee2	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	Technikai	technical	\N	#5b21b6	🔧	t	2026-02-14 07:29:27.056196
28ba7997-f961-467e-bf88-d0448b138427	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	Pénzügyi	finance	\N	#831843	💰	t	2026-02-14 07:29:27.056196
2724a8c4-988e-4ad6-b17c-2674cc9e951f	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	Általános	general	\N	#64748b	📋	t	2026-02-14 07:29:27.056196
\.


--
-- Data for Name: ticket_comments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ticket_comments (id, ticket_id, user_id, comment, is_internal, created_at, updated_at) FROM stdin;
1fc3f222-a6e6-47e7-8d82-68bc56d6aa2f	e5591818-02d2-4bb6-9320-b6be5a2d2d91	3719f580-dcec-4033-a09d-40a373e3242b	Jegy átadva a Vízvezeték Kft.-nek. Kérem, foglalkozzanak vele sürgősen!	f	2026-02-14 07:29:27.075802	2026-02-14 07:29:27.075802
efe5ffe9-44d3-4625-9c39-bbaae934a003	e5591818-02d2-4bb6-9320-b6be5a2d2d91	625f8dbb-beda-4f32-8470-9dde018740b7	Holnap reggel 9-kor kimegyünk a helyszínt felmérni. 📸	f	2026-02-14 07:29:27.075802	2026-02-14 07:29:27.075802
97b854e7-d182-40c6-b977-415418fb3269	e5591818-02d2-4bb6-9320-b6be5a2d2d91	625f8dbb-beda-4f32-8470-9dde018740b7	Helyszíni szemle kész. Csövet kell cserélni, alkatrészt rendeltem. Várható megoldás: 2-3 nap.	f	2026-02-14 07:29:27.075802	2026-02-14 07:29:27.075802
\.


--
-- Data for Name: ticket_history; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ticket_history (id, ticket_id, user_id, action, field_name, old_value, new_value, created_at) FROM stdin;
9b30e377-6cc2-458f-93dc-410bcc633dbb	e5591818-02d2-4bb6-9320-b6be5a2d2d91	bc6bc2d3-718f-4582-822a-c7232cb8db26	created	\N	\N	#1243	2026-02-14 07:29:27.078981
1aca3441-5e6a-405b-ba25-04ca8fae9b4e	c2b631e9-bb71-47db-b0c5-f9ca07e3f4e0	bc6bc2d3-718f-4582-822a-c7232cb8db26	created	\N	\N	#1242	2026-02-14 07:29:27.081238
1f4ff769-b052-471c-999e-f594f9a34905	2d84f94a-6700-4461-a799-4ce852bc1d6c	bc6bc2d3-718f-4582-822a-c7232cb8db26	created	\N	\N	#1241	2026-02-14 07:29:27.082411
3f0dbe84-4fa7-4176-94ff-2b781aafd7cb	7f2bb6e3-122d-42ea-aec0-be21ec7191b6	bc6bc2d3-718f-4582-822a-c7232cb8db26	created	\N	\N	#1240	2026-02-14 07:29:27.083583
407e29ef-29ef-4c74-af16-a9371ebd0b23	acb4a463-8b42-4418-9e72-51415a864041	3719f580-dcec-4033-a09d-40a373e3242b	created	\N	\N	sdsdgsg	2026-02-14 16:14:10.98251
54480418-dd53-41f2-be38-5c0a62127ca2	acb4a463-8b42-4418-9e72-51415a864041	3719f580-dcec-4033-a09d-40a373e3242b	status_changed	status	Új (feldolgozásra vár)	Folyamatban	2026-02-19 21:32:17.136257
\.


--
-- Data for Name: ticket_statuses; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ticket_statuses (id, name, slug, description, color, order_index, is_final, created_at) FROM stdin;
e5f1dbda-0092-4641-89f1-0a5d98bdf8d7	Új (feldolgozásra vár)	new	Új bejelentés	#3b82f6	1	f	2026-02-14 07:28:46.49026
3b73bed0-24ff-431f-8095-660c692f61df	Folyamatban	in_progress	Aktív feldolgozás	#f59e0b	2	f	2026-02-14 07:28:46.49026
af0d18b5-5937-4b05-aed8-bb94a7b92a03	Anyagra várunk	waiting_material	Beszerzés folyamatban	#ec4899	3	f	2026-02-14 07:28:46.49026
0f36d84d-1975-46f2-89b8-a6033b338ea4	Számlázás folyamatban	invoicing	Számlázási folyamat	#8b5cf6	4	f	2026-02-14 07:28:46.49026
cf35cfda-cb75-4bb9-9d19-d209bcf63e7e	Pénzügyi teljesítés folyamatban	payment_pending	Fizetésre vár	#f59e0b	5	f	2026-02-14 07:28:46.49026
5909385c-a3d6-4fe1-a9cc-af1728fb03b9	Várakozik	waiting	Egyéb ok miatt várakozik	#94a3b8	6	f	2026-02-14 07:28:46.49026
9fac6453-ff92-4366-89d4-99ccc92601f4	Továbbítva másik területnek	transferred	Átadva más területnek	#06b6d4	7	f	2026-02-14 07:28:46.49026
fc59127c-92c6-4546-9d33-0987e564a34b	Sikeresen lezárva	completed	Sikeresen befejezve	#10b981	8	t	2026-02-14 07:28:46.49026
9b895525-6135-4e43-9910-59eaf0ac6617	Elutasítva	rejected	Elutasított kérés	#ef4444	9	t	2026-02-14 07:28:46.49026
4d08e0d7-585c-416b-89e2-33da479b3eaa	Nem megvalósítható	not_feasible	Nem kivitelezhető	#6b7280	10	t	2026-02-14 07:28:46.49026
\.


--
-- Data for Name: tickets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tickets (id, contractor_id, ticket_number, title, description, category_id, status_id, priority_id, created_by, assigned_to, resolved_at, closed_at, due_date, created_at, updated_at) FROM stdin;
e5591818-02d2-4bb6-9320-b6be5a2d2d91	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	#1243	Vízvezeték javítás - A épület	Az A épület 2. emeletén a mosdóban szivárgás észlelhető. A csap alatt folyamatosan csöpög a víz.	a1ed76f4-0bb6-4fd4-b40e-859ecda34ee2	3b73bed0-24ff-431f-8095-660c692f61df	7f41a25f-5c9b-431b-852c-8503b8e7f000	bc6bc2d3-718f-4582-822a-c7232cb8db26	625f8dbb-beda-4f32-8470-9dde018740b7	\N	\N	\N	2026-02-14 07:29:27.064383	2026-02-14 07:29:27.064383
c2b631e9-bb71-47db-b0c5-f9ca07e3f4e0	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	#1242	HR dokumentum igénylés	Kérném az elmúlt 3 hónap bérszámfejtésének összesítését.	65c2bf99-dfb3-4b06-adfa-10e70c279599	e5f1dbda-0092-4641-89f1-0a5d98bdf8d7	bc8a9389-cd0d-42d5-8101-26d00ad4199a	bc6bc2d3-718f-4582-822a-c7232cb8db26	\N	\N	\N	\N	2026-02-14 07:29:27.068112	2026-02-14 07:29:27.068112
2d84f94a-6700-4461-a799-4ce852bc1d6c	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	#1241	Számítógép javítás	A számítógép nem indul el, fekete képernyő jelenik meg.	a1ed76f4-0bb6-4fd4-b40e-859ecda34ee2	fc59127c-92c6-4546-9d33-0987e564a34b	bc8a9389-cd0d-42d5-8101-26d00ad4199a	bc6bc2d3-718f-4582-822a-c7232cb8db26	df2d309d-896c-4aae-8219-7e52d24ccd8c	\N	\N	\N	2026-02-14 07:29:27.069647	2026-02-14 07:29:27.069647
7f2bb6e3-122d-42ea-aec0-be21ec7191b6	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	#1240	Bútor csere - B iroda	Az irodai székek cseréje szükséges, ergonómiai problémák miatt.	a1ed76f4-0bb6-4fd4-b40e-859ecda34ee2	af0d18b5-5937-4b05-aed8-bb94a7b92a03	bc8a9389-cd0d-42d5-8101-26d00ad4199a	bc6bc2d3-718f-4582-822a-c7232cb8db26	625f8dbb-beda-4f32-8470-9dde018740b7	\N	\N	\N	2026-02-14 07:29:27.071228	2026-02-14 07:29:27.071228
acb4a463-8b42-4418-9e72-51415a864041	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	#1244	sdsdgsg	sdgsghfhd	a1ed76f4-0bb6-4fd4-b40e-859ecda34ee2	3b73bed0-24ff-431f-8095-660c692f61df	7f41a25f-5c9b-431b-852c-8503b8e7f000	3719f580-dcec-4033-a09d-40a373e3242b	625f8dbb-beda-4f32-8470-9dde018740b7	\N	\N	\N	2026-02-14 16:14:10.98251	2026-02-19 21:32:17.136257
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
dd66df25-a92f-4285-9f3c-e1d007f8d9c6	8c9f1f2e-fb0b-49ae-ac1d-7042debe0958	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	2026-02-14 07:29:27.036189
3719f580-dcec-4033-a09d-40a373e3242b	d657d9cc-16ba-43e8-8c90-04182fb85fd6	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	2026-02-14 07:29:27.040085
08f89723-c4b1-4f29-9b0d-ff6de1a4a327	fa1fa8c9-d96b-4b29-8e8a-168ad6bf2152	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	2026-02-14 07:29:27.042383
bc6bc2d3-718f-4582-822a-c7232cb8db26	c92d75dc-98d6-4d68-b227-683d26485336	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	2026-02-14 07:29:27.04492
625f8dbb-beda-4f32-8470-9dde018740b7	246df6cd-23ff-4997-8bf8-03d5cbd790df	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	2026-02-14 07:29:27.046952
df2d309d-896c-4aae-8219-7e52d24ccd8c	246df6cd-23ff-4997-8bf8-03d5cbd790df	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	2026-02-14 07:29:27.049067
c7cc853b-a856-4ea0-b177-1b215d7aeb0c	d657d9cc-16ba-43e8-8c90-04182fb85fd6	1be0580d-5fa8-4db9-880e-d7f2ae31e154	2026-02-14 07:29:27.051242
16e6010d-2359-436d-bb1d-c2814584ad92	c92d75dc-98d6-4d68-b227-683d26485336	1be0580d-5fa8-4db9-880e-d7f2ae31e154	2026-02-14 07:29:27.053254
e24a1539-d7eb-4f12-8d64-66fb64aa06c8	4b4cfd75-62b5-4e84-8637-3ca66bd5ec56	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	2026-02-14 15:56:53.534329
b58290eb-433a-49da-beab-0ac8d7c3d8e5	4b4cfd75-62b5-4e84-8637-3ca66bd5ec56	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	2026-02-14 15:56:53.540361
43ea7786-efce-4b5a-a55b-dd38a6273cbf	4b4cfd75-62b5-4e84-8637-3ca66bd5ec56	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	2026-02-14 15:56:53.546636
fe07da44-7181-4e4e-931d-9b5a0734cd56	4b4cfd75-62b5-4e84-8637-3ca66bd5ec56	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	2026-02-14 15:56:53.553065
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, contractor_id, email, password_hash, first_name, last_name, phone, is_active, is_email_verified, last_login, created_at, updated_at) FROM stdin;
bc6bc2d3-718f-4582-822a-c7232cb8db26	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	toth.anna@abc-kft.hu	$2a$10$X8RLRKuje1RTW5jzmtdVtePbUuLFR35JXC3G2FK3ltxFshs3uYuD.	Tóth	Anna	\N	t	f	\N	2026-02-14 07:29:27.029569	2026-02-14 07:29:27.029569
16e6010d-2359-436d-bb1d-c2814584ad92	1be0580d-5fa8-4db9-880e-d7f2ae31e154	szabo.maria@xyz-zrt.hu	$2a$10$X8RLRKuje1RTW5jzmtdVtePbUuLFR35JXC3G2FK3ltxFshs3uYuD.	Szabó	Mária	\N	t	f	\N	2026-02-14 07:29:27.029569	2026-02-14 07:29:27.029569
625f8dbb-beda-4f32-8470-9dde018740b7	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	vizvezetek@example.com	$2a$10$X8RLRKuje1RTW5jzmtdVtePbUuLFR35JXC3G2FK3ltxFshs3uYuD.	Vízvezeték	Kft.	\N	t	f	\N	2026-02-14 07:29:27.029569	2026-02-14 07:29:27.029569
df2d309d-896c-4aae-8219-7e52d24ccd8c	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	it-support@example.com	$2a$10$X8RLRKuje1RTW5jzmtdVtePbUuLFR35JXC3G2FK3ltxFshs3uYuD.	IT	Support	\N	t	f	\N	2026-02-14 07:29:27.029569	2026-02-14 07:29:27.029569
08f89723-c4b1-4f29-9b0d-ff6de1a4a327	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	nagy.eva@abc-kft.hu	$2a$10$X8RLRKuje1RTW5jzmtdVtePbUuLFR35JXC3G2FK3ltxFshs3uYuD.	Nagy	Éva	\N	t	f	2026-02-20 17:51:13.640153	2026-02-14 07:29:27.029569	2026-02-20 17:51:13.640153
4a4a3cf3-118b-46cb-8254-0ea0c34d2c01	\N	teszt.elek@example.com	$2a$10$FfQ5H6Hka3IVOYpAyBFuG.jLjxkEPJmDIaeKKFxaJ2lisHkt.zk.y	Teszt	Elek	\N	t	f	\N	2026-02-14 20:38:50.210158	2026-02-14 20:38:50.210158
b58290eb-433a-49da-beab-0ac8d7c3d8e5	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	molnar.zsuzsanna@employee.com	$2a$10$8UOKYVNteD4nJO.fknMfOudY2ZNwsPqWGsUwcji462T7SK2cfa8fm	Molnár	Zsuzsanna	+36 30 234 5678	t	f	\N	2026-02-14 15:56:53.536742	2026-02-14 15:56:53.536742
43ea7786-efce-4b5a-a55b-dd38a6273cbf	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	varga.istvan@employee.com	$2a$10$8UOKYVNteD4nJO.fknMfOudY2ZNwsPqWGsUwcji462T7SK2cfa8fm	Varga	István	+36 30 345 6789	t	f	\N	2026-02-14 15:56:53.542635	2026-02-14 15:56:53.542635
c7cc853b-a856-4ea0-b177-1b215d7aeb0c	1be0580d-5fa8-4db9-880e-d7f2ae31e154	kovacs.peter@xyz-zrt.hu	$2a$10$X8RLRKuje1RTW5jzmtdVtePbUuLFR35JXC3G2FK3ltxFshs3uYuD.	Kovács	Péter	\N	t	f	2026-02-20 17:57:21.906393	2026-02-14 07:29:27.029569	2026-02-20 17:57:21.906393
3719f580-dcec-4033-a09d-40a373e3242b	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	kiss.janos@abc-kft.hu	$2a$10$X8RLRKuje1RTW5jzmtdVtePbUuLFR35JXC3G2FK3ltxFshs3uYuD.	Kiss	János	\N	t	f	2026-02-20 18:07:29.529933	2026-02-14 07:29:27.029569	2026-02-20 18:07:29.529933
fe07da44-7181-4e4e-931d-9b5a0734cd56	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	farkas.katalin@employee.com	$2a$10$8UOKYVNteD4nJO.fknMfOudY2ZNwsPqWGsUwcji462T7SK2cfa8fm	Farkas	Katalin	+36 30 456 7890	t	f	2026-02-16 06:54:02.869291	2026-02-14 15:56:53.549365	2026-02-16 06:54:02.869291
e24a1539-d7eb-4f12-8d64-66fb64aa06c8	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	horvath.gabor@employee.com	$2a$10$8UOKYVNteD4nJO.fknMfOudY2ZNwsPqWGsUwcji462T7SK2cfa8fm	Horváth	Gábor	+36 30 123 4567	t	f	2026-02-14 20:06:34.235529	2026-02-14 15:56:53.529667	2026-02-14 20:06:34.235529
dd66df25-a92f-4285-9f3c-e1d007f8d9c6	cb0a5d7f-0daf-42b8-927b-66fba6241d7d	admin@hr-erp.com	$2a$10$IEDGFjxuGiwCQHnWB55wUO47sTFRg6cIWrJVCciXHPKb5KHvpjQ3m	Admin	User	\N	t	f	2026-02-20 15:38:15.680549	2026-02-14 07:29:27.029569	2026-02-20 15:38:15.680549
\.


--
-- Data for Name: video_views; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.video_views (id, user_id, video_id, watched_at, completed) FROM stdin;
8ad4a4c8-c2d0-4fa9-8ce0-083d74808170	3719f580-dcec-4033-a09d-40a373e3242b	28f92f24-aef2-4c75-a6f9-ea45059e49c7	2026-02-19 12:09:24.492805+00	f
335f8903-72d8-4a35-830a-1f8d6cde3c74	3719f580-dcec-4033-a09d-40a373e3242b	28f92f24-aef2-4c75-a6f9-ea45059e49c7	2026-02-19 12:09:24.50243+00	t
36b3758c-08d7-46af-ab24-89a85ce8b09d	3719f580-dcec-4033-a09d-40a373e3242b	f42112a2-be8d-4ff2-b461-278089bcf36a	2026-02-19 12:14:39.863615+00	f
586dd274-bf77-4680-a526-525984efdc10	3719f580-dcec-4033-a09d-40a373e3242b	f42112a2-be8d-4ff2-b461-278089bcf36a	2026-02-19 12:14:39.869119+00	f
75aebb16-033d-4181-b424-546f02b9649c	3719f580-dcec-4033-a09d-40a373e3242b	7b74ca41-a7c2-43d1-a8c8-078b248fc3f8	2026-02-19 12:15:17.319661+00	f
4bece6d4-669a-4770-9d93-bc0a9ae0c9f9	3719f580-dcec-4033-a09d-40a373e3242b	7b74ca41-a7c2-43d1-a8c8-078b248fc3f8	2026-02-19 12:15:17.336938+00	f
9b0a4fce-860c-49bd-8ea5-af41c771542d	3719f580-dcec-4033-a09d-40a373e3242b	424045fd-e2dd-4f36-865a-eebd9ab14899	2026-02-19 12:15:22.253737+00	f
925b8303-60f1-4eb5-ab34-93483631786e	3719f580-dcec-4033-a09d-40a373e3242b	424045fd-e2dd-4f36-865a-eebd9ab14899	2026-02-19 12:15:22.254276+00	f
4273d1fb-483e-4fab-bfda-212418c38787	3719f580-dcec-4033-a09d-40a373e3242b	424045fd-e2dd-4f36-865a-eebd9ab14899	2026-02-19 12:21:09.621631+00	f
eae9a4d5-37d4-42c9-9e6d-dfff0cb6f9cd	3719f580-dcec-4033-a09d-40a373e3242b	424045fd-e2dd-4f36-865a-eebd9ab14899	2026-02-19 12:21:09.641892+00	f
a04165e1-b42e-4700-8e8b-e5b7e7d6bfb3	3719f580-dcec-4033-a09d-40a373e3242b	f42112a2-be8d-4ff2-b461-278089bcf36a	2026-02-19 12:26:47.03395+00	f
b0bbe4eb-c6ca-4da5-8b9d-802d054d580d	3719f580-dcec-4033-a09d-40a373e3242b	f42112a2-be8d-4ff2-b461-278089bcf36a	2026-02-19 12:26:47.044171+00	f
8756a841-6cae-4832-993a-17fa4b54d38c	3719f580-dcec-4033-a09d-40a373e3242b	f42112a2-be8d-4ff2-b461-278089bcf36a	2026-02-19 13:43:43.860301+00	f
4898321a-d2bc-4a0d-81d4-13aee7d867c4	3719f580-dcec-4033-a09d-40a373e3242b	f42112a2-be8d-4ff2-b461-278089bcf36a	2026-02-19 13:43:43.860039+00	f
919b939d-377d-4f4c-bc3d-33842e03ed46	3719f580-dcec-4033-a09d-40a373e3242b	f42112a2-be8d-4ff2-b461-278089bcf36a	2026-02-20 13:49:29.704287+00	f
7189a257-24e9-48c8-aec6-602c863c522d	3719f580-dcec-4033-a09d-40a373e3242b	f42112a2-be8d-4ff2-b461-278089bcf36a	2026-02-20 13:49:29.721525+00	f
\.


--
-- Data for Name: videos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.videos (id, title, description, url, thumbnail_url, category, duration, is_active, created_at, updated_at) FROM stdin;
7b74ca41-a7c2-43d1-a8c8-078b248fc3f8	Magyar nyelvi kurzus - A1 szint	Kezd� magyar nyelvi kurzus k�lf�ldi munkav�llal�knak.	https://www.youtube.com/watch?v=abc123test1	\N	nyelvi_kurzus	1800	t	2026-02-19 12:08:52.17873+00	2026-02-19 12:08:52.17873+00
f42112a2-be8d-4ff2-b461-278089bcf36a	Munkavédelmi alapok - Új dolgozóknak	Alapvető munkavédelmi szabályok és teendők.	https://www.youtube.com/watch?v=dQw4w9WgXcQ	\N	munkabiztonság	420	t	2026-02-19 12:09:24.450445+00	2026-02-19 12:09:24.450445+00
424045fd-e2dd-4f36-865a-eebd9ab14899	Beilleszkedési útmutató	Hogyan illeszkedj be a csapatba.	https://vimeo.com/123456789	\N	beilleszkedés	600	t	2026-02-19 12:09:24.458845+00	2026-02-19 12:09:24.458845+00
28f92f24-aef2-4c75-a6f9-ea45059e49c7	Cégbemutató videó - Frissítve	Ismerd meg a céget!	https://www.youtube.com/watch?v=test_ceg_info	\N	ceg_info	300	f	2026-02-19 12:09:24.467358+00	2026-02-19 12:09:24.543668+00
\.


--
-- Name: employee_documents_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.employee_documents_id_seq', 14, true);


--
-- Name: scheduled_report_runs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.scheduled_report_runs_id_seq', 1, true);


--
-- Name: scheduled_reports_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.scheduled_reports_id_seq', 1, true);


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
-- Name: accommodation_contractors accommodation_tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accommodation_contractors
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
-- Name: contractors contractors_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.contractors
    ADD CONSTRAINT contractors_slug_key UNIQUE (slug);


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

CREATE INDEX idx_accommodation_tenants_accommodation ON public.accommodation_contractors USING btree (accommodation_id);


--
-- Name: idx_accommodation_tenants_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_accommodation_tenants_tenant ON public.accommodation_contractors USING btree (contractor_id);


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
-- Name: accommodation_rooms accommodation_rooms_accommodation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accommodation_rooms
    ADD CONSTRAINT accommodation_rooms_accommodation_id_fkey FOREIGN KEY (accommodation_id) REFERENCES public.accommodations(id) ON DELETE CASCADE;


--
-- Name: accommodation_contractors accommodation_tenants_accommodation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accommodation_contractors
    ADD CONSTRAINT accommodation_tenants_accommodation_id_fkey FOREIGN KEY (accommodation_id) REFERENCES public.accommodations(id) ON DELETE CASCADE;


--
-- Name: accommodation_contractors accommodation_tenants_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accommodation_contractors
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
-- Name: accommodation_contractors fk_accommodation_contractors_accommodation; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accommodation_contractors
    ADD CONSTRAINT fk_accommodation_contractors_accommodation FOREIGN KEY (accommodation_id) REFERENCES public.accommodations(id);


--
-- Name: accommodation_contractors fk_accommodation_contractors_contractor; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accommodation_contractors
    ADD CONSTRAINT fk_accommodation_contractors_contractor FOREIGN KEY (contractor_id) REFERENCES public.contractors(id);


--
-- Name: accommodations fk_accommodations_current_contractor; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.accommodations
    ADD CONSTRAINT fk_accommodations_current_contractor FOREIGN KEY (current_contractor_id) REFERENCES public.contractors(id);


--
-- Name: cost_centers fk_cost_centers_contractor; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT fk_cost_centers_contractor FOREIGN KEY (contractor_id) REFERENCES public.contractors(id);


--
-- Name: email_logs fk_email_logs_contractor; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_logs
    ADD CONSTRAINT fk_email_logs_contractor FOREIGN KEY (contractor_id) REFERENCES public.contractors(id);


--
-- Name: employees fk_employees_contractor; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.employees
    ADD CONSTRAINT fk_employees_contractor FOREIGN KEY (contractor_id) REFERENCES public.contractors(id);


--
-- Name: notification_templates fk_notification_templates_contractor; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT fk_notification_templates_contractor FOREIGN KEY (contractor_id) REFERENCES public.contractors(id);


--
-- Name: notifications fk_notifications_contractor; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT fk_notifications_contractor FOREIGN KEY (contractor_id) REFERENCES public.contractors(id);


--
-- Name: organizational_units fk_organizational_units_contractor; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.organizational_units
    ADD CONSTRAINT fk_organizational_units_contractor FOREIGN KEY (contractor_id) REFERENCES public.contractors(id);


--
-- Name: projects fk_projects_contractor; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT fk_projects_contractor FOREIGN KEY (contractor_id) REFERENCES public.contractors(id);


--
-- Name: ticket_categories fk_ticket_categories_contractor; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ticket_categories
    ADD CONSTRAINT fk_ticket_categories_contractor FOREIGN KEY (contractor_id) REFERENCES public.contractors(id);


--
-- Name: tickets fk_tickets_contractor; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT fk_tickets_contractor FOREIGN KEY (contractor_id) REFERENCES public.contractors(id);


--
-- Name: user_roles fk_user_roles_contractor; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT fk_user_roles_contractor FOREIGN KEY (contractor_id) REFERENCES public.contractors(id);


--
-- Name: users fk_users_contractor; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT fk_users_contractor FOREIGN KEY (contractor_id) REFERENCES public.contractors(id);


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
-- Name: medical_appointments medical_appointments_employee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.medical_appointments
    ADD CONSTRAINT medical_appointments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE;


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
-- Name: scheduled_reports scheduled_reports_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.scheduled_reports
    ADD CONSTRAINT scheduled_reports_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


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

\unrestrict wATj6IGeRnvH9n8LA17YderhrBnXpzu0j1RejL2sBPRIBtkeSOTHgk9c5iv0y3r

