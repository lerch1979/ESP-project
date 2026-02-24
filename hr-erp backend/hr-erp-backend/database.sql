--
-- PostgreSQL database dump
--

\restrict VuiLabk1FEbTWe5SPMQH1YX9JQTbrJpZftMdMUXWz6rdrDKhenRd6eXNG0MGwcN

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
-- Name: update_cost_center_path(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_cost_center_path() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        IF NEW.parent_id IS NULL THEN
          NEW.level := 1;
          NEW.path := NEW.id::TEXT;
        ELSE
          SELECT level + 1, path || '.' || NEW.id::TEXT
          INTO NEW.level, NEW.path
          FROM cost_centers
          WHERE id = NEW.parent_id;
        END IF;
        RETURN NEW;
      END;
      $$;


ALTER FUNCTION public.update_cost_center_path() OWNER TO postgres;

--
-- Name: update_cost_center_summary(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_cost_center_summary() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE cost_centers
    SET
      total_invoices = (
        SELECT COUNT(*) FROM invoices WHERE cost_center_id = NEW.cost_center_id
      ),
      total_net_amount = (
        SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE cost_center_id = NEW.cost_center_id
      ),
      total_vat_amount = (
        SELECT COALESCE(SUM(vat_amount), 0) FROM invoices WHERE cost_center_id = NEW.cost_center_id
      ),
      total_gross_amount = (
        SELECT COALESCE(SUM(total_amount), 0) FROM invoices WHERE cost_center_id = NEW.cost_center_id
      ),
      first_invoice_date = (
        SELECT MIN(invoice_date) FROM invoices WHERE cost_center_id = NEW.cost_center_id
      ),
      last_invoice_date = (
        SELECT MAX(invoice_date) FROM invoices WHERE cost_center_id = NEW.cost_center_id
      )
    WHERE id = NEW.cost_center_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    UPDATE cost_centers
    SET
      total_invoices = (
        SELECT COUNT(*) FROM invoices WHERE cost_center_id = OLD.cost_center_id
      ),
      total_net_amount = (
        SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE cost_center_id = OLD.cost_center_id
      ),
      total_vat_amount = (
        SELECT COALESCE(SUM(vat_amount), 0) FROM invoices WHERE cost_center_id = OLD.cost_center_id
      ),
      total_gross_amount = (
        SELECT COALESCE(SUM(total_amount), 0) FROM invoices WHERE cost_center_id = OLD.cost_center_id
      ),
      first_invoice_date = (
        SELECT MIN(invoice_date) FROM invoices WHERE cost_center_id = OLD.cost_center_id
      ),
      last_invoice_date = (
        SELECT MAX(invoice_date) FROM invoices WHERE cost_center_id = OLD.cost_center_id
      )
    WHERE id = OLD.cost_center_id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_cost_center_summary() OWNER TO postgres;

--
-- Name: update_cost_center_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_cost_center_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$;


ALTER FUNCTION public.update_cost_center_updated_at() OWNER TO postgres;

--
-- Name: update_invoice_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_invoice_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$;


ALTER FUNCTION public.update_invoice_updated_at() OWNER TO postgres;

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
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    parent_id uuid,
    level integer DEFAULT 1,
    path text,
    budget numeric(15,2),
    color character varying(20),
    icon character varying(50),
    created_by uuid,
    total_invoices integer DEFAULT 0,
    total_net_amount numeric(15,2) DEFAULT 0,
    total_vat_amount numeric(15,2) DEFAULT 0,
    total_gross_amount numeric(15,2) DEFAULT 0,
    first_invoice_date date,
    last_invoice_date date
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
-- Name: email_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.email_templates (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(200) NOT NULL,
    slug character varying(100) NOT NULL,
    subject character varying(500) NOT NULL,
    body text NOT NULL,
    template_type character varying(50) DEFAULT 'custom'::character varying,
    variables jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    contractor_id uuid,
    created_by uuid,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.email_templates OWNER TO postgres;

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
-- Name: invoice_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.invoice_categories (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(100) NOT NULL,
    icon character varying(50),
    color character varying(20),
    is_active boolean DEFAULT true
);


ALTER TABLE public.invoice_categories OWNER TO postgres;

--
-- Name: invoices; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.invoices (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    invoice_number character varying(100),
    vendor_name character varying(200),
    vendor_tax_number character varying(50),
    amount numeric(15,2) NOT NULL,
    currency character varying(3) DEFAULT 'HUF'::character varying,
    vat_amount numeric(15,2),
    total_amount numeric(15,2),
    invoice_date date NOT NULL,
    due_date date,
    payment_date date,
    payment_status character varying(50) DEFAULT 'pending'::character varying,
    cost_center_id uuid NOT NULL,
    category_id uuid,
    description text,
    notes text,
    file_path character varying(500),
    ocr_data jsonb,
    contractor_id uuid,
    created_by uuid,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.invoices OWNER TO postgres;

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

COPY public.cost_centers (id, contractor_id, name, code, description, is_active, created_at, updated_at, parent_id, level, path, budget, color, icon, created_by, total_invoices, total_net_amount, total_vat_amount, total_gross_amount, first_invoice_date, last_invoice_date) FROM stdin;
95f11e38-afbc-4e28-aa4f-fa0658b28f91	\N	Operatív költségek	OPR	Napi működési költségek	t	2026-02-24 09:05:30.063336	2026-02-24 11:36:09.292498	\N	1	95f11e38-afbc-4e28-aa4f-fa0658b28f91	\N	#3b82f6	📊	\N	0	0.00	0.00	0.00	\N	\N
6c4aa12e-1a5f-4de9-a174-0703f41132e2	\N	Stratégiai befektetések	STR	Hosszú távú befektetések	t	2026-02-24 09:05:30.063336	2026-02-24 11:36:09.292498	\N	1	6c4aa12e-1a5f-4de9-a174-0703f41132e2	\N	#10b981	📈	\N	0	0.00	0.00	0.00	\N	\N
6b4e942b-e880-4179-9d3f-1af78bcb13df	\N	Budapest Projekt	OPR-BP	Budapesti építkezés	t	2026-02-24 09:05:30.086802	2026-02-24 11:36:09.292498	95f11e38-afbc-4e28-aa4f-fa0658b28f91	2	95f11e38-afbc-4e28-aa4f-fa0658b28f91.6b4e942b-e880-4179-9d3f-1af78bcb13df	\N	#f59e0b	🏗️	\N	0	0.00	0.00	0.00	\N	\N
4ee717cc-f7a5-490f-a36d-dbe0689caacf	\N	Szálláshelyek	OPR-SZALL	Szálláshely költségek	t	2026-02-24 09:05:30.091764	2026-02-24 11:36:09.292498	95f11e38-afbc-4e28-aa4f-fa0658b28f91	2	95f11e38-afbc-4e28-aa4f-fa0658b28f91.4ee717cc-f7a5-490f-a36d-dbe0689caacf	\N	#ec4899	🏢	\N	0	0.00	0.00	0.00	\N	\N
0c5b14d7-fe4a-43df-a5c1-9a05debe93f7	\N	Irodai költségek	OPR-IRODA	Irodai működés	t	2026-02-24 09:05:30.093772	2026-02-24 11:36:09.292498	95f11e38-afbc-4e28-aa4f-fa0658b28f91	2	95f11e38-afbc-4e28-aa4f-fa0658b28f91.0c5b14d7-fe4a-43df-a5c1-9a05debe93f7	\N	#6366f1	🏬	\N	0	0.00	0.00	0.00	\N	\N
f46ff7d3-4d43-4ae2-b0f4-4edc2c84938f	\N	Ingatlan vásárlás	STR-INGAT	Új ingatlan beszerzés	t	2026-02-24 09:05:30.09565	2026-02-24 11:36:09.292498	6c4aa12e-1a5f-4de9-a174-0703f41132e2	2	6c4aa12e-1a5f-4de9-a174-0703f41132e2.f46ff7d3-4d43-4ae2-b0f4-4edc2c84938f	\N	#10b981	🏘️	\N	0	0.00	0.00	0.00	\N	\N
1c8a5868-c5a8-4ec7-97c5-a2d307e4e270	\N	IT fejlesztés	STR-IT	Szoftverfejlesztés és rendszerek	t	2026-02-24 09:05:30.097579	2026-02-24 11:36:09.292498	6c4aa12e-1a5f-4de9-a174-0703f41132e2	2	6c4aa12e-1a5f-4de9-a174-0703f41132e2.1c8a5868-c5a8-4ec7-97c5-a2d307e4e270	\N	#06b6d4	💻	\N	0	0.00	0.00	0.00	\N	\N
be3c3177-76d5-478b-aa5a-5bab5aa12ebb	\N	Budapest Lakás 101	OPR-SZALL-BP101	Budapest lakás	t	2026-02-24 09:05:30.108436	2026-02-24 11:36:09.292498	4ee717cc-f7a5-490f-a36d-dbe0689caacf	3	95f11e38-afbc-4e28-aa4f-fa0658b28f91.4ee717cc-f7a5-490f-a36d-dbe0689caacf.be3c3177-76d5-478b-aa5a-5bab5aa12ebb	\N	#ec4899	🏠	\N	0	0.00	0.00	0.00	\N	\N
db994db5-2000-45c1-abbe-3c3916820636	\N	Budapest Lakás 202	OPR-SZALL-BP202	Budapest lakás 2	t	2026-02-24 09:05:30.109768	2026-02-24 11:36:09.292498	4ee717cc-f7a5-490f-a36d-dbe0689caacf	3	95f11e38-afbc-4e28-aa4f-fa0658b28f91.4ee717cc-f7a5-490f-a36d-dbe0689caacf.db994db5-2000-45c1-abbe-3c3916820636	\N	#f472b6	🏠	\N	0	0.00	0.00	0.00	\N	\N
1495da44-8c63-49ad-afba-ce4d1e546713	\N	Internet	OPR-SZALL-BP101-NET	Internet szolgáltatás	t	2026-02-24 09:05:30.115765	2026-02-24 11:36:09.292498	be3c3177-76d5-478b-aa5a-5bab5aa12ebb	4	95f11e38-afbc-4e28-aa4f-fa0658b28f91.4ee717cc-f7a5-490f-a36d-dbe0689caacf.be3c3177-76d5-478b-aa5a-5bab5aa12ebb.1495da44-8c63-49ad-afba-ce4d1e546713	\N	#06b6d4	🌐	\N	0	0.00	0.00	0.00	\N	\N
1137a680-07b9-4305-baff-401f05a1a132	\N	Emberi erőforrás	HR	Munkaerő költségek	t	2026-02-24 09:05:30.063336	2026-02-24 11:36:09.292498	4ee717cc-f7a5-490f-a36d-dbe0689caacf	3	95f11e38-afbc-4e28-aa4f-fa0658b28f91.4ee717cc-f7a5-490f-a36d-dbe0689caacf.1137a680-07b9-4305-baff-401f05a1a132	\N	#8b5cf6	🏢	\N	0	0.00	0.00	0.00	\N	\N
07048479-48d0-47a7-9340-3d87ced6aa5d	\N	Bérek és juttatások	HR-BER	Fizetések, bónuszok	t	2026-02-24 09:05:30.099353	2026-02-24 11:36:09.292498	1137a680-07b9-4305-baff-401f05a1a132	4	95f11e38-afbc-4e28-aa4f-fa0658b28f91.4ee717cc-f7a5-490f-a36d-dbe0689caacf.1137a680-07b9-4305-baff-401f05a1a132.07048479-48d0-47a7-9340-3d87ced6aa5d	\N	#8b5cf6	💰	\N	0	0.00	0.00	0.00	\N	\N
041ec1bd-9e24-4424-a16a-a8a2d9b6388c	\N	Képzés és oktatás	HR-KEPZES	Tréningek, továbbképzés	t	2026-02-24 09:05:30.101165	2026-02-24 11:36:09.292498	1137a680-07b9-4305-baff-401f05a1a132	4	95f11e38-afbc-4e28-aa4f-fa0658b28f91.4ee717cc-f7a5-490f-a36d-dbe0689caacf.1137a680-07b9-4305-baff-401f05a1a132.041ec1bd-9e24-4424-a16a-a8a2d9b6388c	\N	#a855f7	🎓	\N	0	0.00	0.00	0.00	\N	\N
3e1ba5b7-b402-47fb-a0e2-3548be6df140	\N	Alvállalkozók	OPR-BP-ALVAL	Alvállalkozói díjak	t	2026-02-24 09:05:30.107054	2026-02-24 11:44:24.592958	6b4e942b-e880-4179-9d3f-1af78bcb13df	3	95f11e38-afbc-4e28-aa4f-fa0658b28f91.6b4e942b-e880-4179-9d3f-1af78bcb13df.3e1ba5b7-b402-47fb-a0e2-3548be6df140	\N	#ef4444	👷	\N	1	4881890.00	1318110.00	6200000.00	2026-02-01	2026-02-01
a64050d0-ecf5-4a27-8a91-9ffd9dc3b556	\N	Áram	OPR-SZALL-BP101-ARAM	Villanyáram	t	2026-02-24 09:05:30.1113	2026-02-24 11:44:24.674029	be3c3177-76d5-478b-aa5a-5bab5aa12ebb	4	95f11e38-afbc-4e28-aa4f-fa0658b28f91.4ee717cc-f7a5-490f-a36d-dbe0689caacf.be3c3177-76d5-478b-aa5a-5bab5aa12ebb.a64050d0-ecf5-4a27-8a91-9ffd9dc3b556	\N	#f59e0b	⚡	\N	1	98425.00	26575.00	125000.00	2026-01-31	2026-01-31
eb608596-a528-405e-b1af-dd7e7fd64d92	\N	Gáz	OPR-SZALL-BP101-GAZ	Gázfogyasztás	t	2026-02-24 09:05:30.114211	2026-02-24 11:44:24.76636	be3c3177-76d5-478b-aa5a-5bab5aa12ebb	4	95f11e38-afbc-4e28-aa4f-fa0658b28f91.4ee717cc-f7a5-490f-a36d-dbe0689caacf.be3c3177-76d5-478b-aa5a-5bab5aa12ebb.eb608596-a528-405e-b1af-dd7e7fd64d92	\N	#ef4444	🔥	\N	1	145669.00	39331.00	185000.00	2026-02-05	2026-02-05
06e540f4-b89d-47b9-a355-a6b7b2536279	\N	Víz	OPR-SZALL-BP101-VIZ	Vízfogyasztás	t	2026-02-24 09:05:30.112798	2026-02-24 11:44:24.856305	be3c3177-76d5-478b-aa5a-5bab5aa12ebb	4	95f11e38-afbc-4e28-aa4f-fa0658b28f91.4ee717cc-f7a5-490f-a36d-dbe0689caacf.be3c3177-76d5-478b-aa5a-5bab5aa12ebb.06e540f4-b89d-47b9-a355-a6b7b2536279	\N	#3b82f6	💧	\N	1	33071.00	8929.00	42000.00	2026-02-10	2026-02-10
b42c8e34-1850-4ea2-8758-8f23c34b3bed	\N	Anyagok	OPR-BP-ANYAG	Építőanyag beszerzés	t	2026-02-24 09:05:30.10553	2026-02-24 11:44:24.958659	6b4e942b-e880-4179-9d3f-1af78bcb13df	3	95f11e38-afbc-4e28-aa4f-fa0658b28f91.6b4e942b-e880-4179-9d3f-1af78bcb13df.b42c8e34-1850-4ea2-8758-8f23c34b3bed	\N	#3b82f6	🔨	\N	2	2582677.00	697323.00	3280000.00	2026-01-20	2026-02-12
53e29322-1f4e-43a8-854a-ad69b1bc01c0	\N	Rezsi	OPR-BP-REZSI	Közüzemi költségek	t	2026-02-24 09:05:30.103635	2026-02-24 11:44:25.044769	6b4e942b-e880-4179-9d3f-1af78bcb13df	3	95f11e38-afbc-4e28-aa4f-fa0658b28f91.6b4e942b-e880-4179-9d3f-1af78bcb13df.53e29322-1f4e-43a8-854a-ad69b1bc01c0	\N	#f59e0b	⚡	\N	2	1023622.00	276578.00	1300200.00	2026-01-15	2026-02-15
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
-- Data for Name: email_templates; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.email_templates (id, name, slug, subject, body, template_type, variables, is_active, contractor_id, created_by, created_at, updated_at) FROM stdin;
dd70a2e9-98d6-4fc2-afbc-6e07c7b30c6b	Új munkavállaló üdvözlő	welcome_employee	Üdvözöljük a {{company_name}} csapatában!	Kedves {{employee_name}}!\n\nÖrömmel értesítünk, hogy felvételt nyertél a {{company_name}} csapatába.\n\nMunkavállalói adataid:\n- Munkavállalói szám: {{employee_number}}\n- Email: {{employee_email}}\n- Belépés dátuma: {{start_date}}\n- Pozíció: {{position}}\n- Munkahely: {{workplace}}\n\nTovábbi információkért látogasd meg a portálunkat.\n\nÜdvözlettel,\n{{company_name}} HR csapat	welcome	["employee_name", "employee_email", "employee_number", "company_name", "start_date", "position", "workplace"]	t	\N	\N	2026-02-23 20:13:13.849095	2026-02-23 20:13:13.849095
caf58fba-7896-4e5c-b6ca-3f688111fd81	Hibajegy létrehozva	ticket_created	Hibajegy létrehozva: {{ticket_number}} - {{ticket_title}}	Kedves {{employee_name}}!\n\nA hibajegyed sikeresen létrejött.\n\nJegy adatok:\n- Szám: {{ticket_number}}\n- Tárgy: {{ticket_title}}\n- Kategória: {{category}}\n- Prioritás: {{priority}}\n- Leírás: {{description}}\n\nHamarosan foglalkozunk a problémával. A jegy állapotáról értesítést fogsz kapni.\n\nÜdvözlettel,\nÜgyfélszolgálat	ticket_created	["employee_name", "ticket_number", "ticket_title", "category", "priority", "description"]	t	\N	\N	2026-02-23 20:13:13.849095	2026-02-23 20:13:13.849095
cf46f17a-5519-452e-b104-f3bbc7ebfe40	Hibajegy státusz változás	ticket_status_changed	Hibajegy frissítve: {{ticket_number}} - {{new_status}}	Kedves {{employee_name}}!\n\nA(z) {{ticket_number}} számú hibajegyed státusza megváltozott.\n\n- Jegy száma: {{ticket_number}}\n- Tárgy: {{ticket_title}}\n- Előző státusz: {{old_status}}\n- Új státusz: {{new_status}}\n- Megjegyzés: {{comment}}\n\nÜdvözlettel,\nÜgyfélszolgálat	ticket_status_changed	["employee_name", "ticket_number", "ticket_title", "old_status", "new_status", "comment"]	t	\N	\N	2026-02-23 20:13:13.849095	2026-02-23 20:13:13.849095
76c38994-323d-423f-9bbd-424bf631b4b1	Jelszó visszaállítás	password_reset	Jelszó visszaállítási kérelem	Kedves {{employee_name}}!\n\nJelszó visszaállítási kérelmet kaptunk a fiókodhoz.\n\nKattints az alábbi linkre a jelszavad megváltoztatásához:\n{{reset_link}}\n\nA link {{expiry_hours}} órán belül lejár.\n\nHa nem te kérted a jelszó visszaállítást, kérjük figyelmen kívül hagyni ezt az emailt.\n\nÜdvözlettel,\n{{company_name}}	password_reset	["employee_name", "reset_link", "expiry_hours", "company_name"]	t	\N	\N	2026-02-23 20:13:13.849095	2026-02-23 20:13:13.849095
1971211b-1403-4a90-8384-9126ed07c854	Szállás hozzárendelés	accommodation_assigned	Szállás hozzárendelve: {{accommodation_name}}	Kedves {{employee_name}}!\n\nSzállás lett hozzárendelve a profilodhoz.\n\nSzállás adatok:\n- Szálláshely: {{accommodation_name}}\n- Cím: {{accommodation_address}}\n- Szoba: {{room_number}}\n- Beköltözés dátuma: {{check_in_date}}\n\nKérjük, ismerkedj meg a házirenddel a beköltözés előtt.\n\nÜdvözlettel,\n{{company_name}} HR csapat	accommodation_assigned	["employee_name", "accommodation_name", "accommodation_address", "room_number", "check_in_date", "company_name"]	t	\N	\N	2026-02-23 20:13:13.849095	2026-02-23 20:13:13.849095
869a4394-481d-47dd-a5c5-4bb216364f5c	Dokumentum feltöltés értesítés	document_uploaded	Új dokumentum feltöltve: {{document_type}}	Kedves {{employee_name}}!\n\nÚj dokumentum lett feltöltve a profilodhoz.\n\nDokumentum adatok:\n- Típus: {{document_type}}\n- Fájlnév: {{file_name}}\n- Feltöltő: {{uploaded_by}}\n- Dátum: {{upload_date}}\n\nA dokumentumot a profilod Dokumentumok fülén tekintheted meg.\n\nÜdvözlettel,\n{{company_name}} HR csapat	document_uploaded	["employee_name", "document_type", "file_name", "uploaded_by", "upload_date", "company_name"]	t	\N	\N	2026-02-23 20:13:13.849095	2026-02-23 20:13:13.849095
76cc5ad4-fe1b-48c7-9c6d-3ea11eb43b69	Munkaviszony megszűnés	employment_terminated	Munkaviszony megszűnés - {{employee_name}}	Kedves {{employee_name}}!\n\nEzúton értesítünk, hogy a munkaviszonyd a(z) {{company_name}} cégnél {{end_date}} nappal megszűnik.\n\nKilépési teendők:\n- Kulcsok, kártyák leadása\n- Szálláshely elhagyása (ha releváns)\n- Utolsó elszámolás: {{settlement_date}}\n\nKérdés esetén keresd a HR osztályt.\n\nÜdvözlettel,\n{{company_name}} HR csapat	employment_terminated	["employee_name", "company_name", "end_date", "settlement_date"]	t	\N	\N	2026-02-23 20:13:13.849095	2026-02-23 20:13:13.849095
fe57ee57-845e-4c60-8499-e1714df041c7	Szabadság jóváhagyás	leave_approved	Szabadság jóváhagyva: {{leave_start}} - {{leave_end}}	Kedves {{employee_name}}!\n\nA szabadság kérelmed jóváhagyásra került.\n\nSzabadság adatok:\n- Kezdés: {{leave_start}}\n- Befejezés: {{leave_end}}\n- Típus: {{leave_type}}\n- Jóváhagyta: {{approved_by}}\n\nJó pihenést kívánunk!\n\nÜdvözlettel,\n{{company_name}} HR csapat	leave_approved	["employee_name", "leave_start", "leave_end", "leave_type", "approved_by", "company_name"]	t	\N	\N	2026-02-23 20:13:13.849095	2026-02-23 20:13:13.849095
2ba3fe0b-020f-4040-b8b1-4f6d687cb3af	Teszt sablon (frissitett)	test_template	Frissitett targy: {{employee_name}}	Kedves {{employee_name}}! Ez egy teszt sablon.	custom	["employee_name", "company_name"]	f	\N	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	2026-02-23 20:28:59.048291	2026-02-23 20:29:54.557808
b604ee58-8e9d-4a63-b683-7220f107e2ae	Teszt sablon masolat	test_template_copy	Frissitett targy: {{employee_name}}	Kedves {{employee_name}}! Ez egy teszt sablon.	custom	["employee_name", "company_name"]	f	\N	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	2026-02-23 20:29:30.793056	2026-02-23 20:29:54.606604
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
73601d21-8c74-405e-863e-4bc43af6aa38	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0006	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Burkoló	2026-01-28	\N	C kategóriás jogosítvánnyal rendelkezik.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Fanni	Magyar	female	1974-07-05	Cegléd	Lukács Krisztina	5219623331	\N	062-370-359	single	2026-01-28	\N	\N	\N	Kecskemét - Gyárvárosi építkezés	5600	Magyarország	Békés	Békéscsaba	Kodály körönd	90	ABC Kereskedelmi Kft.	magyar.fanni7@abc-kft.hu	+36 50 395 1815	b4888603-1870-4196-ad56-4c55471e98d7	\N
86f7ba07-c4ae-4aa7-91a3-7679a517ac7e	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0007	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Tetőfedő	2025-07-09	\N	Előző munkahelyről jó referenciával érkezett.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Mónika	Vincze	female	1994-12-11	Miskolc	Orsós Andrea	7842849995	BN6175676	321-359-505	single	2025-07-09	\N	\N	59922127-49515294-18885620	Budapest - Budaörs logisztikai központ	5601	Magyarország	Békés	Békéscsaba	Arany János utca	106/B	ABC Kereskedelmi Kft.	vincze.monika8@abc-kft.hu	+36 30 367 7985	b4888603-1870-4196-ad56-4c55471e98d7	\N
8e2b1d27-3887-42c8-9627-a4566ddfba07	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0008	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Rakodómunkás	2023-07-27	\N	Részmunkaidős foglalkoztatás.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Andrea	Szilágyi	female	2003-06-25	Sopron	Orsós Csilla	1813061168	\N	\N	married	2023-07-27	\N	\N	\N	Kecskemét - Gyárvárosi építkezés	8003	Magyarország	Fejér	Székesfehérvár	Mikszáth Kálmán tér	115	ABC Kereskedelmi Kft.	szilagyi.andrea9@abc-kft.hu	+36 30 316 5735	7c65ce89-c2e7-4a79-8cac-311051629c78	\N
9f5c24d2-6aef-4594-b19c-f9484ede5476	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0009	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Minőségellenőr	2024-09-17	\N	Próbaidős időszak alatt.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Gergő	Szalai	male	1994-05-28	Győr	Török Bernadett	\N	\N	143-070-103	married	2024-09-17	\N	\N	82358594-49877838-31755070	Szeged - Belváros rekonstrukció	6725	Magyarország	Csongrád-Csanád	Szeged	Szent István tér	70	ABC Kereskedelmi Kft.	szalai.gergo10@abc-kft.hu	+36 50 365 7620	7c65ce89-c2e7-4a79-8cac-311051629c78	\N
40687157-9cb6-4195-84ce-e50ea464abea	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0010	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Adminisztrátor	2021-11-15	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Szilvia	Gál	female	1992-09-23	Szombathely	Magyar Hanna	3730094507	\N	032-322-130	married	2021-11-15	\N	\N	14810495-31546717-27378944	Szeged - Belváros rekonstrukció	9701	Magyarország	Vas	Szombathely	Mikszáth Kálmán tér	106	ABC Kereskedelmi Kft.	gal.szilvia11@abc-kft.hu	+36 20 165 9394	\N	\N
493a63e2-eb4a-44d1-88af-baf236de5624	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0011	f2254bf6-b3ef-48f6-b5ee-a8f9ac2d9fed	Tetőfedő	2024-05-03	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Károly	Rácz	male	1997-09-22	Nyíregyháza	Török Gabriella	6451623862	\N	061-237-351	married	2024-05-03	\N	\N	52014141-87289367-70213715	Budapest - Újpest raktártelep	6031	Magyarország	Bács-Kiskun	Kecskemét	Szent István tér	105	ABC Kereskedelmi Kft.	racz.karoly12@abc-kft.hu	+36 70 955 8945	\N	\N
1f4dbc5d-555b-45bc-b2ca-d2a64803a822	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0012	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Tűzvédelmi felelős	2024-09-21	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	György	Lakatos	male	1983-04-12	Nyíregyháza	Szűcs Orsolya	3676703593	\N	689-205-011	married	2024-09-21	\N	\N	\N	Budapest - Budaörs logisztikai központ	7622	Magyarország	Baranya	Pécs	Ady Endre utca	25	ABC Kereskedelmi Kft.	lakatos.gyorgy13@abc-kft.hu	+36 31 463 9336	\N	\N
dab1e219-87b7-40b6-85b2-bceedb9c9cae	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0013	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Irodai asszisztens	2021-06-23	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Balázs	Nemes	male	1967-09-13	Cegléd	Antal Fruzsina	0175658894	\N	221-675-903	divorced	2021-06-23	\N	\N	22705768-42404842-66469596	Budapest - Angyalföld építkezés	2501	Magyarország	Komárom-Esztergom	Esztergom	Deák Ferenc utca	15	ABC Kereskedelmi Kft.	nemes.balazs14@abc-kft.hu	+36 50 235 8669	0d08cbc6-b692-4e7c-b269-f47eb41d996a	\N
7ba7c547-d55e-4d33-a19c-e603b471e270	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0014	c5d51752-dff2-4728-a944-c3692937106f	Irodai asszisztens	2022-02-14	2026-09-12	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Károly	Jakab	male	1972-04-29	Tatabánya	Vincze Veronika	7034502977	NA6173016	\N	married	2022-02-14	\N	\N	\N	Budapest - Budaörs logisztikai központ	6000	Magyarország	Bács-Kiskun	Kecskemét	Jókai Mór utca	122	ABC Kereskedelmi Kft.	jakab.karoly15@abc-kft.hu	+36 70 268 6422	\N	\N
7c1acd98-6d1f-441b-991e-22503873e085	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0015	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Rakodómunkás	2025-03-31	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Tibor	Lukács	male	1969-06-06	Sopron	Gál Nikolett	5382570800	\N	073-902-854	single	2025-03-31	\N	\N	84269461-61683779-95703709	Kecskemét - Gyárvárosi építkezés	2801	Magyarország	Komárom-Esztergom	Tatabánya	Liszt Ferenc tér	73	ABC Kereskedelmi Kft.	lukacs.tibor16@abc-kft.hu	+36 70 353 1167	0d08cbc6-b692-4e7c-b269-f47eb41d996a	\N
208f6597-f3b6-4558-bc5b-0f560da7a45a	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0016	c5d51752-dff2-4728-a944-c3692937106f	Zsaluzó	2026-10-14	2024-02-28	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Sándor	Boros	male	1989-05-03	Győr	Szabó Orsolya	1675742558	DR3933140	307-029-187	single	2026-10-14	\N	\N	65659566-94461654-50655809	Budapest - Újpest raktártelep	7401	Magyarország	Somogy	Kaposvár	Móricz Zsigmond körtér	96	ABC Kereskedelmi Kft.	boros.sandor17@abc-kft.hu	+36 20 729 5409	\N	\N
0d93dc4f-4578-4dcd-be25-b39f81ab4317	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0017	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Karbantartó	2026-01-29	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Ferenc	Balázs	male	1979-06-17	Dunaújváros	Kocsis Gabriella	3139954972	\N	185-254-758	married	2026-01-29	\N	\N	42914149-65605480-48268327	Budapest - Újpest raktártelep	4432	Magyarország	Szabolcs-Szatmár-Bereg	Nyíregyháza	Kodály körönd	8	ABC Kereskedelmi Kft.	balazs.ferenc18@abc-kft.hu	+36 20 850 9876	35af414c-1808-4056-8fcf-0bdfd33b9862	\N
a7c775b2-18b2-4025-95f0-8edb80f36a5c	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0018	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Műszaki ellenőr	2024-02-07	\N	Részmunkaidős foglalkoztatás.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Gabriella	Hegedűs	female	1980-10-04	Sopron	Hegedűs Andrea	1278855881	\N	482-211-330	married	2024-02-07	\N	\N	36756026-12583777-17052454	Budapest - Budaörs logisztikai központ	2600	Magyarország	Pest	Vác	Munkácsy Mihály utca	147/B	ABC Kereskedelmi Kft.	hegedus.gabriella19@abc-kft.hu	+36 30 346 6260	35af414c-1808-4056-8fcf-0bdfd33b9862	\N
68264a18-6b4e-47c2-83a7-7786403a87b0	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0019	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Biztonsági őr	2021-11-05	\N	OKJ végzettséggel rendelkezik.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Roland	Orosz	male	1999-10-02	Győr	Szűcs Bianka	5880138093	\N	\N	married	2021-11-05	2028-08-07	\N	70212453-36700284-12933756	Kecskemét - Gyárvárosi építkezés	6800	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Deák Ferenc utca	45	ABC Kereskedelmi Kft.	orosz.roland20@abc-kft.hu	+36 70 557 9107	\N	\N
47804bec-89c9-4d44-a57c-5f6d051ea68e	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0020	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Tűzvédelmi felelős	2023-02-12	\N	Tapasztalt dolgozó, megbízható.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	József	Balogh	male	1969-02-19	Eger	Lakatos Beáta	1606967398	\N	079-348-405	single	2023-02-12	\N	\N	88707266-35699823-85814453	Budapest - Csepel ipari park	5008	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Szent István tér	97	ABC Kereskedelmi Kft.	balogh.jozsef21@abc-kft.hu	+36 30 397 2439	94eda3e8-6e8f-45df-a5f2-9690f2c19ccf	\N
4bc40a4f-257a-4494-bf85-3b16259fabbc	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0021	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Karbantartó	2021-12-30	\N	Új munkaerő, betanulás alatt.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Edina	Fülöp	female	2000-07-31	Budapest	Balog Dóra	1222409456	\N	059-474-405	single	2021-12-30	\N	\N	\N	Kecskemét - Gyárvárosi építkezés	9023	Magyarország	Győr-Moson-Sopron	Győr	Mikszáth Kálmán tér	8/C	ABC Kereskedelmi Kft.	fulop.edina22@abc-kft.hu	+36 50 691 2616	94eda3e8-6e8f-45df-a5f2-9690f2c19ccf	\N
47d9e9ab-8d71-4537-99b4-de529206281c	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0022	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Szigetelő	2025-12-02	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Sándor	Sándor	male	1999-11-05	Sopron	Lukács Flóra	6655905429	\N	206-029-958	single	2025-12-02	\N	\N	87962497-57421447-29814830	Budapest - Csepel ipari park	6031	Magyarország	Bács-Kiskun	Kecskemét	Liszt Ferenc tér	106	ABC Kereskedelmi Kft.	sandor.sandor23@abc-kft.hu	+36 50 205 4908	\N	\N
d3fcec56-a659-44fb-bbf2-7fa901fcefdb	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0023	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Takarító	2025-12-29	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Szabolcs	Nagy	male	2004-11-22	Zalaegerszeg	Jakab Zsuzsanna	9545736293	\N	920-755-077	married	2025-12-29	\N	\N	\N	Székesfehérvár - Gyáripari terület	2600	Magyarország	Pest	Vác	Mátyás király utca	145	ABC Kereskedelmi Kft.	nagy.szabolcs24@abc-kft.hu	+36 20 477 7205	d24a0a6b-de8f-4afc-8fc3-9ba31235ad91	\N
7063dff3-6c7d-44e7-939f-9ab8e8775978	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0024	80b828b8-e846-455b-b9ac-36a60a30d6d3	Karbantartó	2021-12-07	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Dániel	Kiss	male	1989-04-23	Miskolc	Lakatos Ilona	9973116622	UV8676734	453-940-482	single	2021-12-07	2026-08-04	\N	\N	Miskolc - Diósgyőri felújítás	3528	Magyarország	Borsod-Abaúj-Zemplén	Miskolc	Kazinczy utca	31	ABC Kereskedelmi Kft.	kiss.daniel25@abc-kft.hu	+36 50 961 9530	\N	\N
b399fccb-f1e5-4035-bdec-1e3113b8c777	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0025	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Rakodómunkás	2026-09-19	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Tamás	Tóth	male	1989-12-22	Szeged	Németh Zsuzsanna	0037841617	\N	163-665-353	married	2026-09-19	\N	\N	47491140-43553861-39525074	Kecskemét - Gyárvárosi építkezés	2803	Magyarország	Komárom-Esztergom	Tatabánya	Táncsics Mihály utca	140/B	ABC Kereskedelmi Kft.	toth.tamas26@abc-kft.hu	+36 20 330 4822	d24a0a6b-de8f-4afc-8fc3-9ba31235ad91	\N
0ac83072-98d5-4adf-bcba-db16487be839	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0026	c5d51752-dff2-4728-a944-c3692937106f	Raktáros	2023-02-26	2024-04-02	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Kornél	Budai	male	1974-12-06	Gödöllő	Veres Edina	4062572409	\N	043-430-806	married	2023-02-26	2028-11-18	\N	54507209-22861762-16116995	Miskolc - Diósgyőri felújítás	9401	Magyarország	Győr-Moson-Sopron	Sopron	Mikszáth Kálmán tér	103	ABC Kereskedelmi Kft.	budai.kornel27@abc-kft.hu	+36 20 909 1424	\N	\N
a1a53c9a-3f7c-4f5b-aff6-e29c141fb56e	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0027	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Adminisztrátor	2023-06-11	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Károly	Lakatos	male	1970-07-31	Tatabánya	Deák Anna	7158233120	\N	\N	single	2023-06-11	2028-07-28	\N	16161718-74063271-57973992	Budapest - Újpest raktártelep	6801	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Kossuth Lajos utca	146/A	ABC Kereskedelmi Kft.	lakatos.karoly28@abc-kft.hu	+36 70 468 6487	02137110-1f01-4ea8-9652-cb3057178ec0	\N
403d5810-073a-4a2d-b0cb-c9614b6cb085	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0028	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Irodai asszisztens	2025-03-14	\N	Külföldi munkavállalási engedéllyel rendelkezik.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Szilvia	Lukács	female	1961-10-29	Szeged	Juhász Fruzsina	1052454743	\N	169-640-618	single	2025-03-14	\N	\N	\N	Szeged - Belváros rekonstrukció	2501	Magyarország	Komárom-Esztergom	Esztergom	Széchenyi István tér	30/C	ABC Kereskedelmi Kft.	lukacs.szilvia29@abc-kft.hu	+36 50 302 3553	02137110-1f01-4ea8-9652-cb3057178ec0	\N
18038b22-324d-4e2c-aaa5-f9151e8c165e	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0029	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Takarító	2024-10-09	\N	Tapasztalt dolgozó, megbízható.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Zsolt	Pintér	male	1984-03-24	Érd	Budai Vivien	5715837688	\N	\N	married	2024-10-09	\N	\N	\N	Budapest - Újpest raktártelep	5001	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Jókai Mór utca	43	ABC Kereskedelmi Kft.	pinter.zsolt30@abc-kft.hu	+36 20 611 6647	13ad850c-f7c6-4b1c-8119-b2a785a56673	\N
16b93a6a-e863-46e6-bd09-daa27a555983	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0030	c5d51752-dff2-4728-a944-c3692937106f	Szállítómunkás	2022-08-19	2025-12-08	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Fruzsina	Farkas	female	1990-07-09	Miskolc	Kiss Szilvia	2818852007	\N	\N	single	2022-08-19	\N	\N	79389505-14907308-68054036	Szeged - Belváros rekonstrukció	6031	Magyarország	Bács-Kiskun	Kecskemét	Kodály körönd	113/A	ABC Kereskedelmi Kft.	farkas.fruzsina31@abc-kft.hu	+36 70 467 6456	\N	\N
dabc7c79-6948-4b64-8cf5-3d6da99fcaa2	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0031	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Zsaluzó	2022-07-02	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	András	Varga	male	1963-09-30	Győr	Kovács Boglárka	9807416963	\N	616-847-712	single	2022-07-02	\N	\N	11408656-61379897-81842253	Budapest - Váci út irodaház	2700	Magyarország	Pest	Cegléd	Bocskai utca	71	ABC Kereskedelmi Kft.	varga.andras32@abc-kft.hu	+36 31 856 4070	13ad850c-f7c6-4b1c-8119-b2a785a56673	\N
6e47cbd0-061a-4492-83a5-13ec0bea5403	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0032	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Szállítómunkás	2024-09-18	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Tamás	Orosz	male	1990-08-13	Eger	Budai Szilvia	5417378556	OM2940147	731-185-392	married	2024-09-18	2026-12-04	\N	95697125-77046932-64902531	Budapest - Újpest raktártelep	5601	Magyarország	Békés	Békéscsaba	Kossuth Lajos utca	35	ABC Kereskedelmi Kft.	orosz.tamas33@abc-kft.hu	+36 70 664 4667	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
6016f798-ece2-482c-9971-b2c9306a64d2	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0033	80b828b8-e846-455b-b9ac-36a60a30d6d3	Vasbetonszerelő	2024-02-08	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Barnabás	Antal	male	1976-09-10	Érd	Balogh Eszter	7619419659	WI2560445	268-804-371	married	2024-02-08	\N	\N	88038703-38765105-68981295	Budapest - Váci út irodaház	4401	Magyarország	Szabolcs-Szatmár-Bereg	Nyíregyháza	Munkácsy Mihály utca	89/C	ABC Kereskedelmi Kft.	antal.barnabas34@abc-kft.hu	+36 20 117 8964	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
4a499c60-f88a-4c23-b6b2-3624e470c09f	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0034	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Daruzó	2021-10-01	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Botond	László	male	1966-07-09	Vác	Szűcs Viktória	\N	YH5618703	278-981-843	married	2021-10-01	2028-11-15	\N	40415833-96679903-66483523	Debrecen - Ipari Park	6801	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Tompa Mihály utca	150	ABC Kereskedelmi Kft.	laszlo.botond35@abc-kft.hu	+36 70 409 1849	\N	\N
512da1a3-acfe-40de-869a-2107431d215d	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0035	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Adminisztrátor	2021-06-04	\N	Nyelvtudás: angol alapfok.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Orsolya	Fülöp	female	1988-09-22	Szombathely	Balogh Hanna	\N	\N	056-364-748	married	2021-06-04	\N	\N	\N	Kecskemét - Gyárvárosi építkezés	7628	Magyarország	Baranya	Pécs	Kodály körönd	130	ABC Kereskedelmi Kft.	fulop.orsolya36@abc-kft.hu	+36 70 628 1311	acac124f-7479-48fa-a1ac-b7d62b6489fc	\N
4e4d9aa2-c0ee-49aa-ac5c-f7582e3f6b71	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0036	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Raktáros	2026-08-29	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Béla	Máté	male	1994-09-11	Esztergom	Kovács Nóra	1284246902	\N	588-001-662	married	2026-08-29	\N	\N	98559547-21217376-42287968	Budapest - Budaörs logisztikai központ	9400	Magyarország	Győr-Moson-Sopron	Sopron	Jókai Mór utca	130	ABC Kereskedelmi Kft.	mate.bela37@abc-kft.hu	+36 30 543 3000	acac124f-7479-48fa-a1ac-b7d62b6489fc	\N
28bce3f7-15bb-4c6b-baa7-875e97b9bad0	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0037	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Takarító	2021-05-05	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Szilvia	Molnár	female	1978-12-08	Gödöllő	Boros Dóra	7153924541	\N	\N	married	2021-05-05	\N	\N	\N	Győr - Északi Ipari Park	8200	Magyarország	Veszprém	Veszprém	Deák Ferenc utca	119	ABC Kereskedelmi Kft.	molnar.szilvia38@abc-kft.hu	+36 50 959 3735	2779c0ef-9d97-470f-839c-f818469d43d6	\N
f7ef9caa-783f-4b2e-b138-95589fb7fbda	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0038	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Kőműves	2024-05-31	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Krisztián	Tóth	male	2004-05-06	Eger	Pál Fanni	0802192718	QJ7864449	376-021-282	married	2024-05-31	\N	\N	14369953-62232855-78244295	Budapest - Budaörs logisztikai központ	8000	Magyarország	Fejér	Székesfehérvár	Fő utca	5	ABC Kereskedelmi Kft.	toth.krisztian39@abc-kft.hu	+36 20 910 6769	2779c0ef-9d97-470f-839c-f818469d43d6	\N
a24e1157-f550-4ef6-8edd-3db876524be9	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0039	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	HR asszisztens	2026-04-28	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Erzsébet	Illés	female	1965-08-15	Cegléd	Budai Éva	4465812042	\N	800-103-479	married	2026-04-28	\N	\N	34999917-91320802-30591400	Kecskemét - Gyárvárosi építkezés	1211	Magyarország	Budapest	Budapest	Fő utca	143	ABC Kereskedelmi Kft.	illes.erzsebet40@abc-kft.hu	+36 50 263 2451	\N	\N
55556d6a-a900-477a-a3a8-ab4bac9cf7a1	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0040	c5d51752-dff2-4728-a944-c3692937106f	Zsaluzó	2026-02-06	2024-07-23	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Emese	Jakab	female	1963-11-27	Vác	Deák Mónika	\N	\N	089-410-752	single	2026-02-06	2028-09-26	\N	39387125-99705892-24969950	Szeged - Belváros rekonstrukció	7401	Magyarország	Somogy	Kaposvár	Vörösmarty utca	139	ABC Kereskedelmi Kft.	jakab.emese41@abc-kft.hu	+36 20 204 2616	\N	\N
ef4df082-8aae-40f2-a039-a276b2c69827	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0041	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Irodai asszisztens	2026-12-07	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Barnabás	Budai	male	1992-02-02	Eger	Fodor Zsófia	8573926714	\N	\N	married	2026-12-07	2028-06-27	\N	45748076-96142436-21321869	Győr - Északi Ipari Park	9401	Magyarország	Győr-Moson-Sopron	Sopron	Munkácsy Mihály utca	99	ABC Kereskedelmi Kft.	budai.barnabas42@abc-kft.hu	+36 20 520 1644	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
022a5c3f-dce7-4f8e-807e-4e9a6123bbcd	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0042	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Daruzó	2022-03-18	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Balázs	Mészáros	male	1993-08-04	Dunaújváros	Pintér Piroska	5592544567	\N	415-765-732	single	2022-03-18	2026-01-20	\N	\N	Budapest - Újpest raktártelep	2800	Magyarország	Komárom-Esztergom	Tatabánya	Kazinczy utca	90	ABC Kereskedelmi Kft.	meszaros.balazs43@abc-kft.hu	+36 30 799 3024	\N	\N
1f2f7b39-7d2f-4a0f-a145-2a923b860d78	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0043	80b828b8-e846-455b-b9ac-36a60a30d6d3	Tűzvédelmi felelős	2024-09-11	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Ilona	Biró	female	1991-09-17	Sopron	Virág Dóra	1493476819	\N	829-683-584	single	2024-09-11	\N	\N	76882687-60917228-83505165	Budapest - Csepel ipari park	5008	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Damjanich utca	21/C	ABC Kereskedelmi Kft.	biro.ilona44@abc-kft.hu	+36 70 546 6355	\N	\N
61ab774d-61c4-4ef0-bcfa-5ff516cdaff1	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0044	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Biztonsági őr	2023-02-08	\N	Próbaidős időszak alatt.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Bence	Magyar	male	1971-11-08	Zalaegerszeg	Takács Edina	6767150739	SL6439091	961-512-038	married	2023-02-08	\N	\N	85726508-45431859-98807986	Győr - Északi Ipari Park	6721	Magyarország	Csongrád-Csanád	Szeged	Petőfi Sándor utca	45/B	ABC Kereskedelmi Kft.	magyar.bence45@abc-kft.hu	+36 70 370 6714	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
6f82e36d-feb1-4204-ac9b-050e2f0ab69c	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0045	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Vasbetonszerelő	2024-10-26	\N	Új munkaerő, betanulás alatt.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Ádám	Fazekas	male	1975-05-22	Nyíregyháza	Tóth Bianka	0012001083	TZ6107482	705-964-535	married	2024-10-26	\N	\N	43217943-59122209-48665831	Budapest - Angyalföld építkezés	7626	Magyarország	Baranya	Pécs	Templom utca	135	ABC Kereskedelmi Kft.	fazekas.adam46@abc-kft.hu	+36 31 990 6431	acfc75f8-6ffd-4fc4-aaf4-e51409068b30	\N
4650e51d-18c0-4602-af2a-2636c3ba3ff3	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0046	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Zsaluzó	2022-05-24	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Roland	Lakatos	male	1997-05-10	Békéscsaba	Takács Fruzsina	\N	\N	204-710-241	single	2022-05-24	\N	\N	19743953-58057920-97545472	Győr - Északi Ipari Park	2500	Magyarország	Komárom-Esztergom	Esztergom	Batthyány utca	25	ABC Kereskedelmi Kft.	lakatos.roland47@abc-kft.hu	+36 20 752 7776	acfc75f8-6ffd-4fc4-aaf4-e51409068b30	\N
fcde5934-380a-46ac-a062-f5f118a8ae2c	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0047	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Rakodómunkás	2025-10-04	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Orsolya	Biró	female	1966-04-10	Szolnok	Szabó Zoé	4525051682	CT6983718	\N	married	2025-10-04	\N	\N	39701319-46940285-86545963	Kecskemét - Gyárvárosi építkezés	6000	Magyarország	Bács-Kiskun	Kecskemét	Zrínyi utca	150	ABC Kereskedelmi Kft.	biro.orsolya48@abc-kft.hu	+36 20 481 8321	\N	\N
74436f33-c61d-4928-87ac-c7278d1a9e41	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0048	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Vízvezeték-szerelő	2021-09-09	\N	Próbaidős időszak alatt.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Kornél	Lukács	male	1986-12-18	Hódmezővásárhely	Fülöp Éva	9943279700	YV6116441	466-068-104	single	2021-09-09	\N	\N	\N	Budapest - Budaörs logisztikai központ	2400	Magyarország	Fejér	Dunaújváros	Arany János utca	31/B	ABC Kereskedelmi Kft.	lukacs.kornel49@abc-kft.hu	+36 70 618 3595	0d08cbc6-b692-4e7c-b269-f47eb41d996a	\N
62028952-1a2c-48fe-9f41-e2c94eeb74ff	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0049	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Vízvezeték-szerelő	2023-05-27	\N	Részmunkaidős foglalkoztatás.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Imre	Boros	male	2004-11-13	Hódmezővásárhely	Farkas Flóra	9756115906	\N	684-277-083	single	2023-05-27	\N	\N	75326518-57912750-64170490	Győr - Északi Ipari Park	6800	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Ady Endre utca	135	ABC Kereskedelmi Kft.	boros.imre50@abc-kft.hu	+36 30 130 3363	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
9583963e-ba33-4d3a-8c98-8cc69c83f19c	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0050	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Építésvezető	2022-07-06	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Zsófia	Pál	female	1990-07-30	Nyíregyháza	Török Sára	\N	\N	104-001-313	married	2022-07-06	\N	\N	85024500-72960824-52509870	Szeged - Belváros rekonstrukció	5601	Magyarország	Békés	Békéscsaba	Mikszáth Kálmán tér	51/C	ABC Kereskedelmi Kft.	pal.zsofia51@abc-kft.hu	+36 20 923 5738	\N	\N
ee17fb5b-dd72-4788-a6d4-f1d6b750b646	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0051	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Zsaluzó	2023-01-26	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Hunor	Fazekas	male	1998-09-24	Érd	Király Veronika	0587511724	\N	582-832-108	married	2023-01-26	\N	\N	\N	Budapest - Váci út irodaház	4401	Magyarország	Szabolcs-Szatmár-Bereg	Nyíregyháza	Zrínyi utca	100	ABC Kereskedelmi Kft.	fazekas.hunor52@abc-kft.hu	+36 20 170 8235	acac124f-7479-48fa-a1ac-b7d62b6489fc	\N
366a95d6-3f65-434e-8e52-fec09ddc52ef	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0052	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Tetőfedő	2025-12-13	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Miklós	Vincze	male	1982-12-21	Dunaújváros	Varga Gabriella	7244331140	\N	705-231-411	divorced	2025-12-13	\N	\N	\N	Kecskemét - Gyárvárosi építkezés	2030	Magyarország	Pest	Érd	Rákóczi út	53	ABC Kereskedelmi Kft.	vincze.miklos53@abc-kft.hu	+36 50 519 6977	13ad850c-f7c6-4b1c-8119-b2a785a56673	\N
e6a8b62c-f236-4170-88e7-d200d47fe7fe	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0053	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Könyvelő	2024-01-14	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Bendegúz	Farkas	male	1968-11-22	Debrecen	Oláh Erzsébet	8447089144	\N	356-102-079	divorced	2024-01-14	\N	\N	67818168-52623471-35140598	Debrecen - Ipari Park	2401	Magyarország	Fejér	Dunaújváros	Ady Endre utca	123	ABC Kereskedelmi Kft.	farkas.bendeguz54@abc-kft.hu	+36 20 854 3273	0d08cbc6-b692-4e7c-b269-f47eb41d996a	\N
135b9dcc-232a-4876-9410-af97bb0fcac2	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0054	c5d51752-dff2-4728-a944-c3692937106f	Tűzvédelmi felelős	2021-06-12	2026-07-17	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Miklós	Balogh	male	2006-06-30	Kecskemét	Máté Zoé	\N	UV9634318	\N	married	2021-06-12	\N	\N	\N	Szeged - Belváros rekonstrukció	8900	Magyarország	Zala	Zalaegerszeg	Kodály körönd	99	ABC Kereskedelmi Kft.	balogh.miklos55@abc-kft.hu	+36 70 983 4763	\N	\N
2facd3df-4fb3-47c6-ae59-19eb7af2c436	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0055	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Projektkoordinátor	2021-04-01	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Dániel	Budai	male	1988-03-03	Nyíregyháza	Pintér Zsófia	0827258692	\N	259-201-547	single	2021-04-01	\N	\N	73807375-29611545-13486598	Székesfehérvár - Gyáripari terület	7401	Magyarország	Somogy	Kaposvár	Fő utca	112/C	ABC Kereskedelmi Kft.	budai.daniel56@abc-kft.hu	+36 50 526 4623	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
18b73d79-c9b3-4e36-90ee-f61a5b64279f	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0056	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Vízvezeték-szerelő	2026-06-06	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Dezső	Boros	male	1974-09-23	Kaposvár	Török Emese	3019296894	\N	900-538-171	married	2026-06-06	\N	\N	41380033-91308031-11314204	Budapest - Újpest raktártelep	2700	Magyarország	Pest	Cegléd	Damjanich utca	132	ABC Kereskedelmi Kft.	boros.dezso57@abc-kft.hu	+36 70 893 9166	\N	\N
cab67d6b-8d79-4f16-90fa-7d8cc6260df6	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0057	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Állványozó	2024-06-21	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Ferenc	Somogyi	male	1984-04-02	Tatabánya	Kis Boglárka	4844414749	\N	247-489-864	divorced	2024-06-21	\N	\N	11848256-91409135-15291729	Kecskemét - Gyárvárosi építkezés	5001	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Templom utca	61/C	ABC Kereskedelmi Kft.	somogyi.ferenc58@abc-kft.hu	+36 30 738 4830	acac124f-7479-48fa-a1ac-b7d62b6489fc	\N
e8214960-633a-46b4-9fb6-b67f6c306b59	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0058	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Festő	2025-07-29	\N	Túlóra vállalására hajlandó.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Szabolcs	Katona	male	1988-09-22	Nyíregyháza	Simon Klára	7887453873	\N	562-555-453	single	2025-07-29	\N	\N	\N	Budapest - Újpest raktártelep	6726	Magyarország	Csongrád-Csanád	Szeged	Bartók Béla út	90/C	ABC Kereskedelmi Kft.	katona.szabolcs59@abc-kft.hu	+36 50 592 4075	\N	\N
28c99a6f-6091-4d48-929e-8ea0bb514e0e	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0059	b7c28743-1740-4c82-a15f-91fb033fd7cd	Daruzó	2024-04-17	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Lajos	Orsós	male	1961-06-01	Miskolc	Török Hanna	4552460374	LR8583869	220-764-858	single	2024-04-17	\N	\N	73202011-26145960-58345048	Budapest - Csepel ipari park	2700	Magyarország	Pest	Cegléd	Széchenyi István tér	25	ABC Kereskedelmi Kft.	orsos.lajos60@abc-kft.hu	+36 20 842 3150	b4888603-1870-4196-ad56-4c55471e98d7	\N
c73e641c-c250-4808-bae6-63e59a5eb359	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0060	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Gépkezelő	2023-06-04	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	József	Hegedűs	male	1999-01-19	Budapest	Szilágyi Judit	\N	\N	869-880-163	single	2023-06-04	\N	\N	11873546-96815397-38033576	Szeged - Belváros rekonstrukció	2400	Magyarország	Fejér	Dunaújváros	Bartók Béla út	99/C	ABC Kereskedelmi Kft.	hegedus.jozsef61@abc-kft.hu	+36 70 674 6738	b4888603-1870-4196-ad56-4c55471e98d7	\N
4aedfebc-b388-43c9-8e83-e43428962435	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0061	80b828b8-e846-455b-b9ac-36a60a30d6d3	Biztonsági őr	2026-04-19	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Péter	Gál	male	2005-09-02	Békéscsaba	Juhász Nóra	9414038060	\N	432-453-332	married	2026-04-19	\N	\N	99825376-65184588-91838816	Budapest - Dél-Buda fejlesztés	2700	Magyarország	Pest	Cegléd	Bethlen Gábor utca	144/C	ABC Kereskedelmi Kft.	gal.peter62@abc-kft.hu	+36 20 210 2046	acfc75f8-6ffd-4fc4-aaf4-e51409068b30	\N
6d10f6cc-eac0-4e09-b94f-5a6432a5ccf9	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0062	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Sofőr	2024-12-17	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Renáta	Juhász	female	1975-07-05	Sopron	Boros Fanni	4518566389	\N	989-928-591	single	2024-12-17	\N	\N	99216525-49014486-31961709	Szeged - Belváros rekonstrukció	1151	Magyarország	Budapest	Budapest	Ady Endre utca	135	ABC Kereskedelmi Kft.	juhasz.renata63@abc-kft.hu	+36 50 399 7973	35af414c-1808-4056-8fcf-0bdfd33b9862	\N
ed9a605d-cc1c-4be3-b7c8-cd1c377737c4	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0063	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Tűzvédelmi felelős	2026-09-19	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Erika	Tóth	female	1969-08-09	Zalaegerszeg	Antal Flóra	4025733254	\N	\N	single	2026-09-19	\N	\N	\N	Budapest - Váci út irodaház	7401	Magyarország	Somogy	Kaposvár	Petőfi Sándor utca	50/A	ABC Kereskedelmi Kft.	toth.erika64@abc-kft.hu	+36 31 482 7474	b4888603-1870-4196-ad56-4c55471e98d7	\N
b6c8afa3-8c9f-4425-858c-cc17aea5a34f	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0064	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Segédmunkás	2023-12-06	\N	Csapatvezetői potenciállal rendelkezik.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Viktor	Antal	male	1972-10-20	Miskolc	Kiss Sára	1544114920	\N	887-775-168	single	2023-12-06	\N	\N	50871095-34195549-86240685	Budapest - Dél-Buda fejlesztés	9025	Magyarország	Győr-Moson-Sopron	Győr	Fő utca	37/C	ABC Kereskedelmi Kft.	antal.viktor65@abc-kft.hu	+36 70 900 1415	\N	\N
82a92416-e052-46ef-ab22-b0336650e62d	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0065	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Karbantartó	2024-01-11	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Dezső	Fülöp	male	1986-08-06	Pécs	Simon Veronika	0929445655	\N	999-941-058	single	2024-01-11	2027-10-14	\N	95314593-85462237-80371615	Budapest - Újpest raktártelep	8002	Magyarország	Fejér	Székesfehérvár	Tompa Mihály utca	124	ABC Kereskedelmi Kft.	fulop.dezso66@abc-kft.hu	+36 30 551 5994	0d08cbc6-b692-4e7c-b269-f47eb41d996a	\N
5fdaadee-194e-41af-be21-267a6635d5c2	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0066	80b828b8-e846-455b-b9ac-36a60a30d6d3	Gondnok	2021-09-16	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Zsolt	Kocsis	male	1988-05-25	Nyíregyháza	Nagy Anna	4190654952	\N	\N	single	2021-09-16	\N	\N	67611311-94630083-15649668	Budapest - Csepel ipari park	9701	Magyarország	Vas	Szombathely	Széchenyi István tér	44	ABC Kereskedelmi Kft.	kocsis.zsolt67@abc-kft.hu	+36 30 468 2266	02137110-1f01-4ea8-9652-cb3057178ec0	\N
4b3fbbff-94f3-42a1-85dd-e0073fbcc6bc	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0067	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Targoncavezető	2025-10-31	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Dániel	Orosz	male	1972-05-15	Veszprém	Bogdán Erika	9945541024	\N	\N	married	2025-10-31	\N	\N	17402991-69495167-25082550	Budapest - Váci út irodaház	8201	Magyarország	Veszprém	Veszprém	Mátyás király utca	24	ABC Kereskedelmi Kft.	orosz.daniel68@abc-kft.hu	+36 31 532 7916	2779c0ef-9d97-470f-839c-f818469d43d6	\N
8de67465-934b-4f64-af1a-0040db67b0a8	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0068	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	HR asszisztens	2024-12-08	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Viktor	Simon	male	1987-11-15	Eger	Németh Nikolett	2843734639	\N	792-710-634	married	2024-12-08	\N	\N	94851754-28418738-36369081	Kecskemét - Gyárvárosi építkezés	5001	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Szent István tér	102	ABC Kereskedelmi Kft.	simon.viktor69@abc-kft.hu	+36 70 558 4012	\N	\N
287a1943-d081-4911-83d3-453a963f2d84	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0069	b7c28743-1740-4c82-a15f-91fb033fd7cd	Daruzó	2026-09-11	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Hunor	Farkas	male	1964-04-25	Érd	Papp Mária	5670846182	\N	646-466-985	married	2026-09-11	\N	\N	57706490-10177751-85449555	Budapest - Váci út irodaház	9400	Magyarország	Győr-Moson-Sopron	Sopron	Kossuth Lajos utca	92/C	ABC Kereskedelmi Kft.	farkas.hunor70@abc-kft.hu	+36 50 676 7183	\N	\N
3a24bebc-2047-45e7-aeb5-74d734d821d3	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0070	80b828b8-e846-455b-b9ac-36a60a30d6d3	HR asszisztens	2026-05-08	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Zalán	Rácz	male	1961-10-13	Békéscsaba	Papp Barbara	9781207372	\N	560-801-473	married	2026-05-08	\N	\N	44063015-15358511-51870238	Kecskemét - Gyárvárosi építkezés	7401	Magyarország	Somogy	Kaposvár	Bethlen Gábor utca	115	ABC Kereskedelmi Kft.	racz.zalan71@abc-kft.hu	+36 20 473 3884	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
fa3c4b34-e879-49f1-888e-ec636bd695a7	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0071	f2254bf6-b3ef-48f6-b5ee-a8f9ac2d9fed	Ács	2025-11-14	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Dániel	Magyar	male	1988-05-24	Kaposvár	Balog Réka	0957915897	EN8952712	502-605-713	married	2025-11-14	\N	\N	\N	Debrecen - Ipari Park	3301	Magyarország	Heves	Eger	Bocskai utca	100/C	ABC Kereskedelmi Kft.	magyar.daniel72@abc-kft.hu	+36 20 971 8159	\N	\N
a5b55f7b-b4ee-4e17-b45e-446b86060b02	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0072	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Takarító	2026-05-24	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Zoé	Török	female	1971-09-01	Székesfehérvár	László Renáta	5479379439	\N	017-035-735	married	2026-05-24	2027-10-24	\N	97082626-82556332-90386274	Kecskemét - Gyárvárosi építkezés	2030	Magyarország	Pest	Érd	Kodály körönd	97	ABC Kereskedelmi Kft.	torok.zoe73@abc-kft.hu	+36 70 978 9718	35af414c-1808-4056-8fcf-0bdfd33b9862	\N
1a529982-d140-4fcf-8d6e-ca881e190efb	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0073	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Raktáros	2025-07-03	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Vivien	Antal	female	1984-11-26	Szolnok	Budai Bernadett	1574769823	BY1772225	419-043-114	single	2025-07-03	\N	\N	88725346-47991560-58766714	Debrecen - Ipari Park	5008	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Szent István tér	123	ABC Kereskedelmi Kft.	antal.vivien74@abc-kft.hu	+36 50 154 5223	\N	\N
de15e0b6-6c46-44c3-a796-db97a8c50df4	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0074	80b828b8-e846-455b-b9ac-36a60a30d6d3	Sofőr	2026-07-14	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Mária	Molnár	female	1991-12-02	Kaposvár	Fülöp Lili	\N	LC5647804	070-236-039	single	2026-07-14	\N	\N	94003754-78914021-13331326	Miskolc - Diósgyőri felújítás	3301	Magyarország	Heves	Eger	Munkácsy Mihály utca	142/A	ABC Kereskedelmi Kft.	molnar.maria75@abc-kft.hu	+36 20 638 6985	2779c0ef-9d97-470f-839c-f818469d43d6	\N
70456f4e-1bd0-4f68-9b33-cb2aa2308a9f	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0075	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Könyvelő	2025-01-21	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Márk	Juhász	male	2006-01-27	Szeged	Nemes Erika	3921745165	\N	\N	single	2025-01-21	\N	\N	63625324-73752439-23599497	Miskolc - Diósgyőri felújítás	4024	Magyarország	Hajdú-Bihar	Debrecen	Dózsa György út	93	ABC Kereskedelmi Kft.	juhasz.mark76@abc-kft.hu	+36 70 779 7729	7c65ce89-c2e7-4a79-8cac-311051629c78	\N
cd3c40cd-fd74-48e4-af94-7cdd26050138	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0076	80b828b8-e846-455b-b9ac-36a60a30d6d3	Munkavédelmi felelős	2022-04-17	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Beáta	Tóth	female	1961-05-14	Győr	Sándor Beáta	8683691973	XZ9654193	530-896-465	married	2022-04-17	\N	\N	\N	Budapest - Váci út irodaház	2700	Magyarország	Pest	Cegléd	Bethlen Gábor utca	105	ABC Kereskedelmi Kft.	toth.beata77@abc-kft.hu	+36 31 513 1156	b4888603-1870-4196-ad56-4c55471e98d7	\N
e6601b30-ba2e-4d20-845d-32aa862048ce	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0077	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Karbantartó	2024-11-27	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	György	Hegedűs	male	1999-06-21	Pécs	Kis Nóra	8243808165	\N	679-113-971	single	2024-11-27	2026-07-06	\N	\N	Budapest - Dél-Buda fejlesztés	4028	Magyarország	Hajdú-Bihar	Debrecen	Bartók Béla út	4	ABC Kereskedelmi Kft.	hegedus.gyorgy78@abc-kft.hu	+36 30 645 1733	acac124f-7479-48fa-a1ac-b7d62b6489fc	\N
f83ec9af-5a32-48e9-98a5-c445208d3344	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0078	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Gondnok	2021-05-03	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Petra	Simon	female	1993-11-05	Esztergom	Sipos Nikolett	1608044138	\N	236-009-691	single	2021-05-03	\N	\N	29354307-85507272-83781327	Szeged - Belváros rekonstrukció	2803	Magyarország	Komárom-Esztergom	Tatabánya	Dózsa György út	122	ABC Kereskedelmi Kft.	simon.petra79@abc-kft.hu	+36 30 812 1197	7c65ce89-c2e7-4a79-8cac-311051629c78	\N
d30d52b1-cfa3-4493-ad02-1ec35a0da51e	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0079	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Épületgépész	2026-02-11	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Mihály	Kiss	male	1970-04-05	Szeged	Horváth Gabriella	6394593339	\N	\N	single	2026-02-11	2027-06-26	\N	11647848-57684794-73651043	Debrecen - Ipari Park	2700	Magyarország	Pest	Cegléd	Rákóczi út	53/C	ABC Kereskedelmi Kft.	kiss.mihaly80@abc-kft.hu	+36 50 235 1851	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
3b8a8502-6ac7-4d5e-94fa-f084c950f454	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0080	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Állványozó	2024-10-25	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Dávid	Gál	male	1986-02-07	Vác	Szilágyi Beáta	\N	PT2335080	722-956-897	married	2024-10-25	\N	\N	96137335-40720327-72439702	Szeged - Belváros rekonstrukció	2030	Magyarország	Pest	Érd	Kodály körönd	121	ABC Kereskedelmi Kft.	gal.david81@abc-kft.hu	+36 31 739 1748	d24a0a6b-de8f-4afc-8fc3-9ba31235ad91	\N
cda4e545-6549-41c1-97f1-e8eddfd3f166	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0081	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Vasbetonszerelő	2024-07-03	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Zoltán	Máté	male	1968-11-24	Debrecen	Papp Judit	4112688896	QI8990818	307-413-364	married	2024-07-03	\N	\N	97318469-67725031-36864104	Budapest - Újpest raktártelep	4027	Magyarország	Hajdú-Bihar	Debrecen	Vörösmarty utca	53	ABC Kereskedelmi Kft.	mate.zoltan82@abc-kft.hu	+36 31 200 4234	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
a9f7d834-dcb8-41f5-af03-1fbd938184b9	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0082	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Szállítómunkás	2023-10-01	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Krisztina	Veres	female	2002-09-07	Cegléd	Németh Bernadett	8569294935	FY3040580	300-808-581	married	2023-10-01	\N	\N	78030601-38667962-76928036	Budapest - Újpest raktártelep	5001	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Jókai Mór utca	2/C	ABC Kereskedelmi Kft.	veres.krisztina83@abc-kft.hu	+36 30 976 6641	7c65ce89-c2e7-4a79-8cac-311051629c78	\N
ccc01e8c-8f48-429e-8b05-2a64c6373e4f	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0083	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Segédmunkás	2022-01-27	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Lilla	Hegedűs	female	1975-07-27	Szolnok	Bogdán Mária	0516521219	WQ5226834	310-417-270	married	2022-01-27	\N	\N	17334878-74316760-67603281	Székesfehérvár - Gyáripari terület	6031	Magyarország	Bács-Kiskun	Kecskemét	Bem József utca	16	ABC Kereskedelmi Kft.	hegedus.lilla84@abc-kft.hu	+36 31 505 5655	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
83b0c3f3-d9da-40fc-9c80-9bc73962114e	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0084	c5d51752-dff2-4728-a944-c3692937106f	Műszaki ellenőr	2023-08-19	2025-04-11	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Nikolett	Papp	female	1972-06-05	Sopron	Pintér Margit	9614835559	IC1957964	556-956-464	married	2023-08-19	\N	\N	39586508-82089096-73531738	Budapest - Újpest raktártelep	8901	Magyarország	Zala	Zalaegerszeg	Mikszáth Kálmán tér	1	ABC Kereskedelmi Kft.	papp.nikolett85@abc-kft.hu	+36 30 597 4682	\N	\N
97b6e287-314d-4064-942d-7616b28c92d8	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0085	80b828b8-e846-455b-b9ac-36a60a30d6d3	Takarító	2021-11-03	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Dorina	Bogdán	female	1988-06-01	Esztergom	Szalai Hanna	7837668190	\N	\N	married	2021-11-03	\N	\N	66031135-90285096-92517447	Kecskemét - Gyárvárosi építkezés	2700	Magyarország	Pest	Cegléd	Kossuth Lajos utca	69	ABC Kereskedelmi Kft.	bogdan.dorina86@abc-kft.hu	+36 30 132 8620	02137110-1f01-4ea8-9652-cb3057178ec0	\N
24c33154-2cc9-4c85-96b9-26888b41c50f	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0086	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Zsaluzó	2022-08-11	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Máté	Farkas	male	1999-11-10	Székesfehérvár	Kis Julianna	1563223743	\N	\N	single	2022-08-11	\N	\N	65056636-13173767-71929235	Budapest - Újpest raktártelep	9026	Magyarország	Győr-Moson-Sopron	Győr	Kossuth Lajos utca	45	ABC Kereskedelmi Kft.	farkas.mate87@abc-kft.hu	+36 31 367 4494	\N	\N
b6933feb-63e4-493e-a17d-cdab8c404e32	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0087	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Szállítómunkás	2026-10-29	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Barnabás	Nagy	male	2000-02-16	Nyíregyháza	Sipos Erzsébet	2032766341	GK5651252	\N	single	2026-10-29	\N	\N	59971897-41443674-89989890	Miskolc - Diósgyőri felújítás	2030	Magyarország	Pest	Érd	Kossuth Lajos utca	84/C	ABC Kereskedelmi Kft.	nagy.barnabas88@abc-kft.hu	+36 50 276 6810	\N	\N
a670b691-9c1c-4923-bd91-a53d6ea81fb8	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0088	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Raktáros	2021-06-23	\N	Tapasztalt dolgozó, megbízható.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Dávid	Pál	male	2006-08-26	Kecskemét	Sipos Nikolett	0199280622	AN8743146	474-780-483	single	2021-06-23	\N	\N	30400208-28023902-91789359	Kecskemét - Gyárvárosi építkezés	5600	Magyarország	Békés	Békéscsaba	Arany János utca	37/A	ABC Kereskedelmi Kft.	pal.david89@abc-kft.hu	+36 31 583 9153	\N	\N
bbe3cb22-1caa-498d-9a06-c491a13efe11	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0089	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Irodai asszisztens	2021-03-30	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Ilona	Juhász	female	1991-06-03	Szolnok	Simon Mária	5173847087	\N	\N	married	2021-03-30	\N	\N	34462408-37406022-49328162	Székesfehérvár - Gyáripari terület	2801	Magyarország	Komárom-Esztergom	Tatabánya	Liszt Ferenc tér	53	ABC Kereskedelmi Kft.	juhasz.ilona90@abc-kft.hu	+36 70 429 9304	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
223b4e07-e78e-46bb-850d-1a1982a918c3	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0090	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Biztonsági őr	2021-09-26	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Barnabás	Molnár	male	1988-03-03	Veszprém	Kozma Viktória	4791092292	\N	677-001-771	married	2021-09-26	\N	\N	75163206-53129216-95282672	Debrecen - Ipari Park	7400	Magyarország	Somogy	Kaposvár	Rákóczi út	114/C	ABC Kereskedelmi Kft.	molnar.barnabas91@abc-kft.hu	+36 70 316 2032	acfc75f8-6ffd-4fc4-aaf4-e51409068b30	\N
f3e2724f-943b-4d38-8bea-d548d801907a	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0091	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Építésvezető	2026-06-15	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Éva	Illés	female	1977-01-04	Nyíregyháza	Rácz Lilla	6452864763	FO8515861	153-976-606	single	2026-06-15	\N	\N	30642062-68270601-21477802	Budapest - Angyalföld építkezés	2600	Magyarország	Pest	Vác	Bem József utca	33/A	ABC Kereskedelmi Kft.	illes.eva92@abc-kft.hu	+36 30 543 8738	b4888603-1870-4196-ad56-4c55471e98d7	\N
456cb416-7593-43e2-afc4-fc7c3ebe3256	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0092	c5d51752-dff2-4728-a944-c3692937106f	Karbantartó	2022-12-25	2025-08-06	Előző munkahelyről jó referenciával érkezett.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	László	Király	male	2001-04-25	Vác	Jakab Viktória	9678265811	KT5579778	971-137-880	single	2022-12-25	\N	\N	\N	Budapest - Csepel ipari park	3304	Magyarország	Heves	Eger	Templom utca	46/B	ABC Kereskedelmi Kft.	kiraly.laszlo93@abc-kft.hu	+36 20 271 9856	\N	\N
caf0055b-6b49-4b19-9950-014028983691	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0093	f2254bf6-b3ef-48f6-b5ee-a8f9ac2d9fed	Projektkoordinátor	2021-04-29	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Csaba	Lukács	male	1992-12-30	Érd	László Noémi	\N	YX4271636	021-856-130	single	2021-04-29	\N	\N	80328753-70291835-10022770	Budapest - Angyalföld építkezés	9701	Magyarország	Vas	Szombathely	Petőfi Sándor utca	39	ABC Kereskedelmi Kft.	lukacs.csaba94@abc-kft.hu	+36 50 825 7871	\N	\N
3414f5d1-e981-4175-8e6d-983a11314c51	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0094	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Építésvezető	2026-01-26	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Viktor	Sándor	male	1988-08-13	Győr	Máté Diána	2214535668	\N	906-023-341	divorced	2026-01-26	\N	\N	39062055-82967228-16940189	Győr - Északi Ipari Park	9401	Magyarország	Győr-Moson-Sopron	Sopron	Munkácsy Mihály utca	66/A	ABC Kereskedelmi Kft.	sandor.viktor95@abc-kft.hu	+36 70 531 3126	b4888603-1870-4196-ad56-4c55471e98d7	\N
f3839373-9927-4273-abb6-ff12a6d7b28a	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0095	c5d51752-dff2-4728-a944-c3692937106f	Gondnok	2022-11-27	2024-01-23	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Imre	Fodor	male	1963-09-08	Szolnok	Török Anikó	0974649569	\N	759-147-833	married	2022-11-27	2027-11-22	\N	90078097-20510042-56362900	Budapest - Váci út irodaház	5000	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Kodály körönd	91	ABC Kereskedelmi Kft.	fodor.imre96@abc-kft.hu	+36 31 610 2686	\N	\N
2a0bf5fc-768b-4778-87e8-baa41850ae10	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0096	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Ács	2023-02-28	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Diána	Kovács	female	1982-12-29	Debrecen	Kis Zsófia	5007016476	\N	390-669-533	single	2023-02-28	\N	\N	\N	Budapest - Csepel ipari park	9021	Magyarország	Győr-Moson-Sopron	Győr	Fő utca	32	ABC Kereskedelmi Kft.	kovacs.diana97@abc-kft.hu	+36 20 681 3086	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
1d073b14-9171-4376-9b9e-264a5f2c6ff9	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0097	f2254bf6-b3ef-48f6-b5ee-a8f9ac2d9fed	Kőműves	2021-09-03	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Botond	Jakab	male	1979-04-25	Zalaegerszeg	Farkas Nikolett	1955342170	\N	435-597-744	single	2021-09-03	\N	\N	27871896-37099938-97220110	Szeged - Belváros rekonstrukció	8900	Magyarország	Zala	Zalaegerszeg	Mátyás király utca	121	ABC Kereskedelmi Kft.	jakab.botond98@abc-kft.hu	+36 31 164 7272	\N	\N
943f86e8-cf53-4e62-b432-b42026ed5462	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0098	80b828b8-e846-455b-b9ac-36a60a30d6d3	Biztonsági őr	2023-09-25	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Julianna	Katona	female	1962-09-22	Zalaegerszeg	Mészáros Vivien	3185744365	IS2195696	445-777-040	single	2023-09-25	\N	\N	46021782-90322091-43868155	Budapest - Újpest raktártelep	2100	Magyarország	Pest	Gödöllő	Táncsics Mihály utca	100	ABC Kereskedelmi Kft.	katona.julianna99@abc-kft.hu	+36 30 422 9298	\N	\N
f7f2a7b0-c73e-4dca-ab20-a2fd207d0bf5	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0099	c5d51752-dff2-4728-a944-c3692937106f	Rakodómunkás	2021-04-26	2024-10-05	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Sándor	Orsós	male	1969-10-17	Szeged	Kis Eszter	8150427348	AV2701550	109-515-052	married	2021-04-26	2028-10-12	\N	77018672-55117719-15818228	Székesfehérvár - Gyáripari terület	6000	Magyarország	Bács-Kiskun	Kecskemét	Mikszáth Kálmán tér	15	ABC Kereskedelmi Kft.	orsos.sandor100@abc-kft.hu	+36 30 375 7095	\N	\N
a42a4ef2-3d3f-40c4-a6c3-56fc2abd3ea7	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0100	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Kőműves	2026-10-31	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Lajos	Lukács	male	1976-05-13	Szombathely	Magyar Nikolett	2377282535	\N	203-955-175	single	2026-10-31	\N	\N	99556589-26242981-49696067	Kecskemét - Gyárvárosi építkezés	3301	Magyarország	Heves	Eger	Zrínyi utca	28/C	ABC Kereskedelmi Kft.	lukacs.lajos101@abc-kft.hu	+36 20 983 5541	\N	\N
dbb422e4-7286-4724-a528-e309d4ea5205	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0101	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Hegesztő	2024-10-03	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Bence	Orosz	male	1984-03-20	Esztergom	Sándor Boglárka	1525306324	\N	369-848-799	divorced	2024-10-03	\N	\N	62403710-87714301-69929249	Budapest - Angyalföld építkezés	4032	Magyarország	Hajdú-Bihar	Debrecen	Kazinczy utca	7/B	ABC Kereskedelmi Kft.	orosz.bence102@abc-kft.hu	+36 20 488 5567	02137110-1f01-4ea8-9652-cb3057178ec0	\N
a206915c-5944-4474-b1f8-16e25509ebf9	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0102	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Hegesztő	2026-04-02	\N	Első munkahelyes, szakmai gyakorlat keretében.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Ernő	Kelemen	male	1961-05-30	Dunaújváros	Kozma Beáta	8366873638	\N	717-007-594	married	2026-04-02	\N	\N	26085012-49840200-84645356	Budapest - Váci út irodaház	6801	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Jókai Mór utca	126	ABC Kereskedelmi Kft.	kelemen.erno103@abc-kft.hu	+36 70 866 8672	d24a0a6b-de8f-4afc-8fc3-9ba31235ad91	\N
cdfe5987-9408-4fce-94c8-452c2be8076f	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0103	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Daruzó	2024-06-12	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Béla	Molnár	male	1999-05-11	Szolnok	Magyar Éva	\N	\N	997-154-231	divorced	2024-06-12	\N	\N	34924260-71751800-40303820	Budapest - Dél-Buda fejlesztés	2700	Magyarország	Pest	Cegléd	Kazinczy utca	114/B	ABC Kereskedelmi Kft.	molnar.bela104@abc-kft.hu	+36 31 751 1697	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
fdd694d6-ce57-4609-85c3-aee2dd8259a0	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0104	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Irodai asszisztens	2025-08-30	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Kristóf	Fodor	male	1987-05-03	Nyíregyháza	Somogyi Lilla	4863926025	\N	877-764-195	married	2025-08-30	\N	\N	34715946-58181668-39792138	Budapest - Angyalföld építkezés	7623	Magyarország	Baranya	Pécs	Kazinczy utca	110	ABC Kereskedelmi Kft.	fodor.kristof105@abc-kft.hu	+36 50 837 5409	\N	\N
3f20adc9-4524-4404-a8e7-53f16d03a9f8	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0105	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Szállítómunkás	2022-04-12	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Róbert	Szabó	male	1978-05-29	Eger	Lukács Ilona	1899410248	\N	\N	married	2022-04-12	\N	\N	46131621-20582333-32310810	Budapest - Váci út irodaház	2030	Magyarország	Pest	Érd	Bethlen Gábor utca	101/A	ABC Kereskedelmi Kft.	szabo.robert106@abc-kft.hu	+36 70 108 6758	7c65ce89-c2e7-4a79-8cac-311051629c78	\N
8a4e5f52-bf2d-40f3-8b71-e5c21a92a583	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0106	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Szállítómunkás	2021-04-06	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Tibor	Orsós	male	1978-09-08	Sopron	Tóth Mária	9097789363	\N	\N	married	2021-04-06	2028-01-05	\N	66206035-72091057-74970672	Budapest - Angyalföld építkezés	2030	Magyarország	Pest	Érd	Mikszáth Kálmán tér	44	ABC Kereskedelmi Kft.	orsos.tibor107@abc-kft.hu	+36 20 598 8952	02137110-1f01-4ea8-9652-cb3057178ec0	\N
48888a49-06fe-4ad0-abd6-99c76176069c	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0107	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Épületgépész	2025-09-08	\N	Többéves iparági tapasztalat.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Bence	Fekete	male	2003-03-04	Debrecen	Varga Gabriella	9602767672	FT4157457	113-893-183	married	2025-09-08	\N	\N	37160981-41811409-45318667	Székesfehérvár - Gyáripari terület	7628	Magyarország	Baranya	Pécs	Kazinczy utca	19	ABC Kereskedelmi Kft.	fekete.bence108@abc-kft.hu	+36 50 480 1874	2779c0ef-9d97-470f-839c-f818469d43d6	\N
c60ff20d-2d35-47e0-88fe-0e9e88c66bf8	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0108	80b828b8-e846-455b-b9ac-36a60a30d6d3	Adminisztrátor	2023-05-23	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Zsófia	Kozma	female	1981-02-02	Vác	Virág Diána	3424239046	SN3833182	043-770-249	divorced	2023-05-23	\N	\N	50495206-89080124-30798638	Debrecen - Ipari Park	2100	Magyarország	Pest	Gödöllő	Bem József utca	144/C	ABC Kereskedelmi Kft.	kozma.zsofia109@abc-kft.hu	+36 70 268 8585	d24a0a6b-de8f-4afc-8fc3-9ba31235ad91	\N
2fbdd7f5-3b3f-4f58-8b67-2c6c0e1b4b92	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0109	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Ács	2023-04-22	\N	Előző munkahelyről jó referenciával érkezett.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Patrik	Veres	male	1984-05-22	Szolnok	Antal Diána	6483965593	\N	\N	single	2023-04-22	\N	\N	80852645-98794745-85359954	Kecskemét - Gyárvárosi építkezés	7630	Magyarország	Baranya	Pécs	Bethlen Gábor utca	11	ABC Kereskedelmi Kft.	veres.patrik110@abc-kft.hu	+36 20 797 1660	acac124f-7479-48fa-a1ac-b7d62b6489fc	\N
38d4dd77-f96e-442c-92f4-d59f5ccdcd35	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0110	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Targoncavezető	2021-01-08	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Tímea	Kiss	female	1990-12-25	Kaposvár	Németh Andrea	5794379484	\N	122-585-202	single	2021-01-08	\N	\N	\N	Miskolc - Diósgyőri felújítás	1139	Magyarország	Budapest	Budapest	Kölcsey utca	47	ABC Kereskedelmi Kft.	kiss.timea111@abc-kft.hu	+36 50 460 5478	\N	\N
0e8b885a-2d68-45f1-957a-7aae8d974e72	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0111	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Festő	2024-04-29	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Margit	Pintér	female	1983-04-17	Veszprém	Molnár Bernadett	0469825682	\N	224-513-587	single	2024-04-29	\N	\N	94955809-73685610-23817811	Budapest - Váci út irodaház	8901	Magyarország	Zala	Zalaegerszeg	Liszt Ferenc tér	142	ABC Kereskedelmi Kft.	pinter.margit112@abc-kft.hu	+36 50 930 5751	02137110-1f01-4ea8-9652-cb3057178ec0	\N
61d55e15-a1d0-48ce-9e03-2f4cb4556a5f	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0112	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Rakodómunkás	2023-08-25	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Luca	Németh	female	1999-07-27	Hódmezővásárhely	Kis Katalin	6003771653	WT2835491	889-603-571	married	2023-08-25	\N	\N	41147774-76696910-89225630	Budapest - Angyalföld építkezés	2100	Magyarország	Pest	Gödöllő	Kazinczy utca	69/C	ABC Kereskedelmi Kft.	nemeth.luca113@abc-kft.hu	+36 30 545 8682	\N	\N
122076fb-f51c-4b48-b33b-56fc1629abc1	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0113	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Kőműves	2025-03-24	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Gyula	Horváth	male	1998-01-29	Eger	Papp Bernadett	5048620643	MK8218463	909-999-170	widowed	2025-03-24	\N	\N	\N	Budapest - Dél-Buda fejlesztés	4431	Magyarország	Szabolcs-Szatmár-Bereg	Nyíregyháza	Mátyás király utca	113	ABC Kereskedelmi Kft.	horvath.gyula114@abc-kft.hu	+36 70 343 2142	7c65ce89-c2e7-4a79-8cac-311051629c78	\N
7ee2a0be-034b-46a3-a16d-477193adc4ea	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0114	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Raktáros	2023-08-13	\N	Többéves iparági tapasztalat.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Krisztina	Illés	female	2001-03-22	Szolnok	Virág Dorina	1879337170	XB6698981	086-196-031	married	2023-08-13	\N	\N	\N	Debrecen - Ipari Park	2400	Magyarország	Fejér	Dunaújváros	Kazinczy utca	144	ABC Kereskedelmi Kft.	illes.krisztina115@abc-kft.hu	+36 30 364 7956	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
4d376c0b-149f-4b11-9fad-b11834f7d4b2	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0115	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Villanyszerelő	2022-05-20	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Ádám	Gál	male	1968-04-16	Cegléd	Juhász Mónika	0478857607	\N	757-390-759	married	2022-05-20	\N	\N	54163730-35445744-74412235	Budapest - Dél-Buda fejlesztés	9028	Magyarország	Győr-Moson-Sopron	Győr	Bartók Béla út	86	ABC Kereskedelmi Kft.	gal.adam116@abc-kft.hu	+36 30 322 2522	\N	\N
6bee4655-05ba-4c88-865a-0be4797339d1	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0116	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Építésvezető	2023-01-06	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Ilona	Kis	female	1966-03-19	Cegléd	Orosz Emese	4931575689	SI1995952	\N	married	2023-01-06	\N	\N	11602613-99332156-88166674	Budapest - Csepel ipari park	6801	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Bartók Béla út	11/B	ABC Kereskedelmi Kft.	kis.ilona117@abc-kft.hu	+36 70 755 6081	b4888603-1870-4196-ad56-4c55471e98d7	\N
94e4efa4-9038-42cc-9d06-bd1135092456	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0117	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Irodai asszisztens	2023-12-06	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Tímea	Vincze	female	1985-06-02	Veszprém	Kocsis Diána	4235421047	EM2455028	910-915-543	divorced	2023-12-06	\N	\N	64382676-85751229-78311642	Győr - Északi Ipari Park	1171	Magyarország	Budapest	Budapest	Templom utca	144/B	ABC Kereskedelmi Kft.	vincze.timea118@abc-kft.hu	+36 70 320 7279	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
b5887fc5-9bf5-43a9-a1b9-ac9c58111a7f	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0118	c5d51752-dff2-4728-a944-c3692937106f	Daruzó	2023-05-20	2025-11-01	Első munkahelyes, szakmai gyakorlat keretében.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Noel	Rácz	male	1962-08-12	Vác	Papp Réka	7037569873	ID5121348	851-187-017	single	2023-05-20	\N	\N	44727844-57309875-92872234	Debrecen - Ipari Park	6726	Magyarország	Csongrád-Csanád	Szeged	Kazinczy utca	50	ABC Kereskedelmi Kft.	racz.noel119@abc-kft.hu	+36 31 172 9078	\N	\N
00ceb78b-31ca-4d30-bf18-c5381b95c93f	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0119	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Műszaki ellenőr	2025-03-24	\N	Próbaidős időszak alatt.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Judit	Papp	female	1983-02-22	Debrecen	Horváth Hajnalka	8511227637	PI1335713	593-813-386	divorced	2025-03-24	\N	\N	25155562-88521515-21162376	Miskolc - Diósgyőri felújítás	5008	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Hunyadi utca	82	ABC Kereskedelmi Kft.	papp.judit120@abc-kft.hu	+36 70 197 2701	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
bb2a0ba6-c4f5-4b4b-b57a-5c6c531e0585	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0120	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Szigetelő	2023-10-09	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Mihály	Takács	male	1976-07-18	Pécs	Török Bernadett	9933403670	\N	550-374-616	married	2023-10-09	\N	\N	\N	Budapest - Csepel ipari park	5601	Magyarország	Békés	Békéscsaba	Táncsics Mihály utca	115	ABC Kereskedelmi Kft.	takacs.mihaly121@abc-kft.hu	+36 30 832 2467	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
8053927e-2b53-428f-9643-f8c3a284fb4b	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0121	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Projektkoordinátor	2021-02-22	\N	Nyelvtudás: angol alapfok.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Hunor	Papp	male	1983-07-05	Békéscsaba	Vincze Bianka	1659318330	XS9669667	854-563-045	married	2021-02-22	2027-08-19	\N	60672461-90078152-51147607	Debrecen - Ipari Park	3301	Magyarország	Heves	Eger	Batthyány utca	41/B	ABC Kereskedelmi Kft.	papp.hunor122@abc-kft.hu	+36 20 475 5979	\N	\N
f561d7b1-af27-4794-bae6-10170f8d9056	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0122	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Targoncavezető	2021-11-08	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Bence	Fazekas	male	1963-08-23	Gödöllő	Juhász Zoé	4782784044	\N	069-948-275	married	2021-11-08	\N	\N	63564524-15476094-76923745	Győr - Északi Ipari Park	5600	Magyarország	Békés	Békéscsaba	Kossuth Lajos utca	95	ABC Kereskedelmi Kft.	fazekas.bence123@abc-kft.hu	+36 20 540 9177	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
36d26d08-6124-47d7-a8df-e935ba8c8dad	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0123	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Targoncavezető	2025-07-28	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Viktor	Katona	male	1970-02-19	Veszprém	Magyar Ilona	0356540745	\N	\N	single	2025-07-28	\N	\N	30852679-71935284-40786404	Szeged - Belváros rekonstrukció	4433	Magyarország	Szabolcs-Szatmár-Bereg	Nyíregyháza	Damjanich utca	91	ABC Kereskedelmi Kft.	katona.viktor124@abc-kft.hu	+36 70 332 4854	\N	\N
e2689318-9a44-480b-b119-504fd66c0314	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0124	80b828b8-e846-455b-b9ac-36a60a30d6d3	Gépkezelő	2023-10-09	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Csilla	Lakatos	female	1969-04-12	Sopron	Kis Csilla	5691760676	AL5044711	350-207-653	married	2023-10-09	\N	\N	38050150-66264982-70299205	Budapest - Váci út irodaház	1041	Magyarország	Budapest	Budapest	Kölcsey utca	52	ABC Kereskedelmi Kft.	lakatos.csilla125@abc-kft.hu	+36 31 857 4582	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
2dca8a8c-41c3-45f5-a83f-1235d4e3bc4b	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0125	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Biztonsági őr	2022-07-19	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Tímea	Biró	female	1980-09-07	Győr	Kozma Ágnes	5572490291	\N	547-470-748	married	2022-07-19	\N	\N	90344081-17965162-88263395	Miskolc - Diósgyőri felújítás	6726	Magyarország	Csongrád-Csanád	Szeged	Mátyás király utca	14	ABC Kereskedelmi Kft.	biro.timea126@abc-kft.hu	+36 70 869 5816	acfc75f8-6ffd-4fc4-aaf4-e51409068b30	\N
6fc4288e-9255-48aa-9c5a-880e3310e441	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0126	c5d51752-dff2-4728-a944-c3692937106f	Művezető	2023-09-20	2026-11-27	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Dezső	Hegedűs	male	1998-12-13	Eger	Kelemen Petra	0751889023	TS8375321	\N	single	2023-09-20	\N	\N	40745738-33232340-28790484	Budapest - Csepel ipari park	7400	Magyarország	Somogy	Kaposvár	Bocskai utca	45	ABC Kereskedelmi Kft.	hegedus.dezso127@abc-kft.hu	+36 50 860 6805	\N	\N
55a1efd4-2ed2-4c6d-85b1-0570298de350	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0127	80b828b8-e846-455b-b9ac-36a60a30d6d3	Burkoló	2024-08-13	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Richárd	Deák	male	1975-02-28	Vác	Juhász Nikolett	4494556043	\N	327-961-266	divorced	2024-08-13	2028-06-03	\N	36736782-85722716-76152406	Győr - Északi Ipari Park	6031	Magyarország	Bács-Kiskun	Kecskemét	Bem József utca	2/B	ABC Kereskedelmi Kft.	deak.richard128@abc-kft.hu	+36 20 364 8904	35af414c-1808-4056-8fcf-0bdfd33b9862	\N
96564863-90c5-4937-ac94-0a06dd41e74c	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0128	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Segédmunkás	2023-12-15	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Ferenc	Katona	male	1994-08-23	Szombathely	Boros Beáta	\N	\N	338-155-271	divorced	2023-12-15	\N	\N	\N	Budapest - Csepel ipari park	5601	Magyarország	Békés	Békéscsaba	Munkácsy Mihály utca	63	ABC Kereskedelmi Kft.	katona.ferenc129@abc-kft.hu	+36 20 876 6384	35af414c-1808-4056-8fcf-0bdfd33b9862	\N
e712373f-b9b1-4e72-b9d8-adcdb9432001	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0129	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Burkoló	2021-11-10	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Tamás	Sándor	male	1990-09-07	Szombathely	Mészáros Dóra	\N	BG5204724	368-260-752	single	2021-11-10	\N	\N	21865441-95203518-41447640	Debrecen - Ipari Park	8200	Magyarország	Veszprém	Veszprém	Munkácsy Mihály utca	144/C	ABC Kereskedelmi Kft.	sandor.tamas130@abc-kft.hu	+36 70 950 9411	\N	\N
001f3d16-803b-4f9a-a047-712144bd9892	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0130	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Munkavédelmi felelős	2021-10-29	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Diána	Illés	female	1984-01-02	Békéscsaba	Boros Zoé	7734847506	VL6220849	258-018-354	divorced	2021-10-29	\N	\N	51335612-31391626-46487561	Debrecen - Ipari Park	2501	Magyarország	Komárom-Esztergom	Esztergom	Bajcsy-Zsilinszky utca	113/C	ABC Kereskedelmi Kft.	illes.diana131@abc-kft.hu	+36 70 453 9299	0d08cbc6-b692-4e7c-b269-f47eb41d996a	\N
2873330b-eba4-4a82-9a75-ba478595ba18	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0131	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Tűzvédelmi felelős	2021-05-01	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Sára	Oláh	female	1975-08-31	Dunaújváros	Máté Hajnalka	9844264478	\N	359-934-736	single	2021-05-01	2027-09-28	\N	\N	Debrecen - Ipari Park	5002	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Bartók Béla út	38/B	ABC Kereskedelmi Kft.	olah.sara132@abc-kft.hu	+36 70 760 9914	7c65ce89-c2e7-4a79-8cac-311051629c78	\N
f5c52610-b4ea-48df-80c1-ff0f944d2dba	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0132	f2254bf6-b3ef-48f6-b5ee-a8f9ac2d9fed	Villanyszerelő	2025-04-23	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	János	Katona	male	2005-04-29	Eger	Rácz Barbara	7982221924	\N	\N	divorced	2025-04-23	\N	\N	66702727-28978130-48794260	Budapest - Angyalföld építkezés	2801	Magyarország	Komárom-Esztergom	Tatabánya	Hunyadi utca	113/A	ABC Kereskedelmi Kft.	katona.janos133@abc-kft.hu	+36 70 437 2089	\N	\N
155e2e4f-ac86-4d0d-bdf4-6eaf0c743d61	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0133	c5d51752-dff2-4728-a944-c3692937106f	Szigetelő	2026-08-28	2026-04-05	Első munkahelyes, szakmai gyakorlat keretében.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Réka	Boros	female	1970-05-20	Győr	Hegedűs Eszter	8611253889	\N	527-537-172	married	2026-08-28	\N	\N	64372514-82942924-82529438	Budapest - Dél-Buda fejlesztés	5600	Magyarország	Békés	Békéscsaba	Tompa Mihály utca	140/A	ABC Kereskedelmi Kft.	boros.reka134@abc-kft.hu	+36 70 320 4523	\N	\N
a051282d-109c-4f94-bb4c-1f2be6905e6e	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0134	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Minőségellenőr	2022-08-05	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Hunor	Sándor	male	1961-11-19	Miskolc	Balog Csilla	3105042527	\N	\N	single	2022-08-05	\N	\N	71094220-96524878-90905077	Debrecen - Ipari Park	2400	Magyarország	Fejér	Dunaújváros	Hunyadi utca	11/C	ABC Kereskedelmi Kft.	sandor.hunor135@abc-kft.hu	+36 70 217 1347	acfc75f8-6ffd-4fc4-aaf4-e51409068b30	\N
08c60014-c782-491f-88e0-064934c583f7	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0135	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Daruzó	2023-01-26	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Krisztián	Katona	male	1968-02-04	Sopron	Lakatos Erika	2249232520	\N	363-020-282	married	2023-01-26	\N	\N	24126459-90164187-66342605	Budapest - Budaörs logisztikai központ	7622	Magyarország	Baranya	Pécs	Dózsa György út	133/C	ABC Kereskedelmi Kft.	katona.krisztian136@abc-kft.hu	+36 31 249 4618	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
f826dea9-6b30-4f39-ba4f-f27c025b41d1	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0136	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Szigetelő	2021-02-21	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Ferenc	Veres	male	1964-01-04	Győr	Sipos Petra	7372707432	DV1913347	032-053-024	single	2021-02-21	\N	\N	66114210-62294025-82843869	Budapest - Angyalföld építkezés	6800	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Kossuth Lajos utca	143	ABC Kereskedelmi Kft.	veres.ferenc137@abc-kft.hu	+36 31 529 6266	acac124f-7479-48fa-a1ac-b7d62b6489fc	\N
9e3d2451-796b-4043-8a57-7102ed52b1ba	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0137	80b828b8-e846-455b-b9ac-36a60a30d6d3	Művezető	2024-05-05	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Éva	Szűcs	female	1992-08-16	Tatabánya	Bogdán Andrea	0475018364	OA1771977	360-494-359	single	2024-05-05	\N	\N	51755144-42059003-30057211	Budapest - Újpest raktártelep	9027	Magyarország	Győr-Moson-Sopron	Győr	Tompa Mihály utca	9/A	ABC Kereskedelmi Kft.	szucs.eva138@abc-kft.hu	+36 50 361 3896	7c65ce89-c2e7-4a79-8cac-311051629c78	\N
397aa82b-6691-42d5-9cd8-dd198691e569	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0138	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Műszaki ellenőr	2022-06-03	\N	Első munkahelyes, szakmai gyakorlat keretében.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Szilvia	Kiss	female	1962-09-15	Szombathely	Máté Erzsébet	5683601691	\N	\N	single	2022-06-03	\N	\N	85405748-70487551-16200145	Debrecen - Ipari Park	2401	Magyarország	Fejér	Dunaújváros	Arany János utca	38	ABC Kereskedelmi Kft.	kiss.szilvia139@abc-kft.hu	+36 31 342 4815	35af414c-1808-4056-8fcf-0bdfd33b9862	\N
828a4269-523e-4655-a1a3-af684f048caf	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0139	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Tetőfedő	2023-05-19	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Barnabás	László	male	1988-03-21	Zalaegerszeg	Deák Gabriella	1353780698	\N	696-299-476	married	2023-05-19	\N	\N	\N	Budapest - Dél-Buda fejlesztés	4401	Magyarország	Szabolcs-Szatmár-Bereg	Nyíregyháza	Ady Endre utca	76	ABC Kereskedelmi Kft.	laszlo.barnabas140@abc-kft.hu	+36 30 184 1736	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
0c4b42cf-5460-4972-948f-6d6e5b3e3772	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0140	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Szigetelő	2024-11-20	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	András	Kocsis	male	1965-11-02	Budapest	Varga Margit	7176890702	\N	558-421-951	married	2024-11-20	\N	\N	72656082-33549381-84737180	Szeged - Belváros rekonstrukció	9401	Magyarország	Győr-Moson-Sopron	Sopron	Dózsa György út	125/B	ABC Kereskedelmi Kft.	kocsis.andras141@abc-kft.hu	+36 20 612 1106	\N	\N
56044a3d-160a-4434-b858-6692fb9da7f3	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0141	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Sofőr	2022-02-23	\N	B kategóriás jogosítvánnyal rendelkezik.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Imre	Fehér	male	1999-02-28	Veszprém	Orosz Gabriella	3683352887	\N	793-625-867	divorced	2022-02-23	2026-02-15	\N	17084892-72159771-12296868	Budapest - Váci út irodaház	5601	Magyarország	Békés	Békéscsaba	Templom utca	125	ABC Kereskedelmi Kft.	feher.imre142@abc-kft.hu	+36 50 451 6568	7c65ce89-c2e7-4a79-8cac-311051629c78	\N
23abbae0-9ef4-4ec9-b8aa-0e0b8667599f	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0142	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Gépkezelő	2026-02-12	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	István	Katona	male	1969-03-08	Kecskemét	Fehér Bianka	\N	\N	430-169-745	married	2026-02-12	\N	\N	54544736-62032766-74115796	Miskolc - Diósgyőri felújítás	9401	Magyarország	Győr-Moson-Sopron	Sopron	Kossuth Lajos utca	8/B	ABC Kereskedelmi Kft.	katona.istvan143@abc-kft.hu	+36 50 745 9195	\N	\N
80813d84-4c4c-4248-ad10-ab5823d9f268	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0143	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Gépkezelő	2025-05-21	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Judit	Juhász	female	1968-07-18	Hódmezővásárhely	Somogyi Eszter	5076845708	\N	014-312-407	single	2025-05-21	2027-03-20	\N	74565256-60060978-45679627	Budapest - Újpest raktártelep	2700	Magyarország	Pest	Cegléd	Vörösmarty utca	19	ABC Kereskedelmi Kft.	juhasz.judit144@abc-kft.hu	+36 70 755 6587	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
037da150-0a51-4951-a35b-ba393ec0e15b	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0144	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Targoncavezető	2024-12-13	\N	Túlóra vállalására hajlandó.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Hunor	Varga	male	2004-01-24	Szolnok	Oláh Szilvia	0589310914	\N	987-275-568	married	2024-12-13	2028-06-25	\N	38979441-81940114-35015127	Budapest - Budaörs logisztikai központ	9024	Magyarország	Győr-Moson-Sopron	Győr	Szent István tér	85	ABC Kereskedelmi Kft.	varga.hunor145@abc-kft.hu	+36 70 885 6516	2779c0ef-9d97-470f-839c-f818469d43d6	\N
3501a6e3-ea94-45a1-a3b9-ff4bea48b684	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0145	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Építésvezető	2022-07-15	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	András	Budai	male	1972-12-20	Gödöllő	Sipos Klára	5841908218	\N	719-274-668	married	2022-07-15	\N	\N	\N	Budapest - Budaörs logisztikai központ	3529	Magyarország	Borsod-Abaúj-Zemplén	Miskolc	Bajcsy-Zsilinszky utca	121	ABC Kereskedelmi Kft.	budai.andras146@abc-kft.hu	+36 70 702 9545	\N	\N
5a94f00e-f4bf-41c3-8be5-0a22276578ae	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0146	f2254bf6-b3ef-48f6-b5ee-a8f9ac2d9fed	Munkavédelmi felelős	2026-11-19	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Szabolcs	Oláh	male	1962-12-30	Hódmezővásárhely	Sándor Mónika	\N	\N	117-100-100	married	2026-11-19	\N	\N	27236411-55165927-32837753	Debrecen - Ipari Park	6726	Magyarország	Csongrád-Csanád	Szeged	Bethlen Gábor utca	24	ABC Kereskedelmi Kft.	olah.szabolcs147@abc-kft.hu	+36 20 363 2710	\N	\N
8cfdc4ae-f184-4269-8acf-fdfd67de6e98	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0147	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Tűzvédelmi felelős	2023-05-15	\N	Nyelvtudás: angol alapfok.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Beáta	Hegedűs	female	1988-04-22	Tatabánya	Orosz Orsolya	8794386249	FO4056501	160-893-659	married	2023-05-15	\N	\N	77486571-89386330-61626706	Debrecen - Ipari Park	9400	Magyarország	Győr-Moson-Sopron	Sopron	Bartók Béla út	89	ABC Kereskedelmi Kft.	hegedus.beata148@abc-kft.hu	+36 20 253 5533	13ad850c-f7c6-4b1c-8119-b2a785a56673	\N
e076b8fd-7338-4976-993b-5a489c8f8eae	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0148	80b828b8-e846-455b-b9ac-36a60a30d6d3	HR asszisztens	2022-06-21	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Piroska	Veres	female	2006-03-21	Gödöllő	Balogh Sára	7393299871	\N	407-105-576	single	2022-06-21	\N	\N	72185767-85319936-82276313	Szeged - Belváros rekonstrukció	2030	Magyarország	Pest	Érd	Vörösmarty utca	24/C	ABC Kereskedelmi Kft.	veres.piroska149@abc-kft.hu	+36 20 262 2055	acfc75f8-6ffd-4fc4-aaf4-e51409068b30	\N
d26be171-a6ca-4118-830e-5d71d5f31615	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0149	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Szállítómunkás	2022-07-05	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Barnabás	Gulyás	male	1991-12-15	Zalaegerszeg	Mészáros Petra	5107029745	\N	\N	single	2022-07-05	\N	\N	44138679-37531439-10930385	Budapest - Váci út irodaház	2401	Magyarország	Fejér	Dunaújváros	Ady Endre utca	111	ABC Kereskedelmi Kft.	gulyas.barnabas150@abc-kft.hu	+36 30 171 6994	d24a0a6b-de8f-4afc-8fc3-9ba31235ad91	\N
b0661958-c306-4e6d-bc4d-54bf384202e3	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0150	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Ács	2024-12-17	\N	Első munkahelyes, szakmai gyakorlat keretében.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Zoltán	Rácz	male	2000-09-19	Budapest	Kozma Erzsébet	7395367082	\N	610-116-626	single	2024-12-17	\N	\N	\N	Budapest - Váci út irodaház	6801	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Munkácsy Mihály utca	102	ABC Kereskedelmi Kft.	racz.zoltan151@abc-kft.hu	+36 50 431 1269	13ad850c-f7c6-4b1c-8119-b2a785a56673	\N
655e0401-eabb-48b1-bd14-312da02d4f02	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0151	c5d51752-dff2-4728-a944-c3692937106f	HR asszisztens	2022-02-12	2026-09-27	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Zoltán	Balázs	male	1997-07-04	Szeged	Fekete Barbara	\N	\N	361-382-909	married	2022-02-12	2026-02-24	\N	35297336-84591874-42821041	Kecskemét - Gyárvárosi építkezés	2700	Magyarország	Pest	Cegléd	Jókai Mór utca	63	ABC Kereskedelmi Kft.	balazs.zoltan152@abc-kft.hu	+36 20 189 2632	\N	\N
2e260b4b-2036-45b8-a260-cc0665df4460	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0152	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Daruzó	2023-04-02	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Viktor	Kocsis	male	1990-09-26	Dunaújváros	Németh Réka	1478652168	BU8431598	\N	single	2023-04-02	\N	\N	\N	Budapest - Újpest raktártelep	8001	Magyarország	Fejér	Székesfehérvár	Munkácsy Mihály utca	140/B	ABC Kereskedelmi Kft.	kocsis.viktor153@abc-kft.hu	+36 20 444 3844	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
ae19d30a-e3d1-499b-8a0f-7dd898d6a908	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0153	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Festő	2025-09-10	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Erzsébet	Orsós	female	1977-06-30	Tatabánya	Simon Vivien	6371276101	\N	785-597-047	divorced	2025-09-10	\N	\N	\N	Budapest - Angyalföld építkezés	8000	Magyarország	Fejér	Székesfehérvár	Kölcsey utca	17	ABC Kereskedelmi Kft.	orsos.erzsebet154@abc-kft.hu	+36 50 536 1693	\N	\N
b2ffb03a-3090-45ed-b727-0e0e74c9b78a	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0154	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Gondnok	2022-07-20	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Petra	Fehér	female	2000-09-08	Szeged	Fülöp Nóra	0669185184	TF3361724	\N	single	2022-07-20	\N	\N	86122537-50343494-51920082	Budapest - Újpest raktártelep	1101	Magyarország	Budapest	Budapest	Bajcsy-Zsilinszky utca	111	ABC Kereskedelmi Kft.	feher.petra155@abc-kft.hu	+36 20 886 3131	94eda3e8-6e8f-45df-a5f2-9690f2c19ccf	\N
dcc5a765-3936-4461-a0e3-e58c7fd2af20	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0155	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Állványozó	2021-08-01	\N	Havi bruttó bér: 362 000 Ft	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Tibor	Orosz	male	2005-07-14	Békéscsaba	Hegedűs Gabriella	5162479028	\N	528-243-735	single	2021-08-01	\N	\N	17970689-73594780-50685772	Székesfehérvár - Gyáripari terület	9401	Magyarország	Győr-Moson-Sopron	Sopron	Fő utca	54	ABC Kereskedelmi Kft.	orosz.tibor156@abc-kft.hu	+36 30 348 7551	d24a0a6b-de8f-4afc-8fc3-9ba31235ad91	\N
71afc996-285b-40a0-b10a-be15adf29fdd	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0156	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Szigetelő	2025-09-14	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Ágnes	Király	female	1972-05-12	Eger	Rácz Ágnes	0083775377	\N	135-079-534	single	2025-09-14	\N	\N	20034264-64974038-37626021	Székesfehérvár - Gyáripari terület	2030	Magyarország	Pest	Érd	Batthyány utca	43/A	ABC Kereskedelmi Kft.	kiraly.agnes157@abc-kft.hu	+36 50 578 7356	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
98cf2933-e311-4cf6-9882-79a5315a59ed	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0157	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Festő	2024-04-22	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Margit	Illés	female	1980-11-15	Vác	Gulyás Emese	4251391280	\N	398-045-872	single	2024-04-22	\N	\N	55175596-59564756-90747225	Budapest - Csepel ipari park	2700	Magyarország	Pest	Cegléd	Templom utca	39/C	ABC Kereskedelmi Kft.	illes.margit158@abc-kft.hu	+36 31 386 7390	2779c0ef-9d97-470f-839c-f818469d43d6	\N
ab0fae3e-24da-42d8-81b0-3a2f7645823f	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0158	f2254bf6-b3ef-48f6-b5ee-a8f9ac2d9fed	Szigetelő	2024-02-04	\N	Előző munkahelyről jó referenciával érkezett.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Lajos	Király	male	1996-08-05	Szeged	Budai Renáta	7035256758	MI9652378	185-832-305	divorced	2024-02-04	\N	\N	40512445-30731596-28493502	Győr - Északi Ipari Park	6801	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Tompa Mihály utca	14/B	ABC Kereskedelmi Kft.	kiraly.lajos159@abc-kft.hu	+36 30 855 5452	\N	\N
b544d0ec-151b-447d-a926-25ef6c394c12	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0159	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Hegesztő	2022-07-13	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Gyula	Király	male	1971-06-17	Szombathely	Kocsis Boglárka	6961625319	\N	539-272-726	single	2022-07-13	\N	\N	66528835-62160107-77745131	Budapest - Csepel ipari park	7621	Magyarország	Baranya	Pécs	Dózsa György út	107	ABC Kereskedelmi Kft.	kiraly.gyula160@abc-kft.hu	+36 30 416 5228	b4888603-1870-4196-ad56-4c55471e98d7	\N
310f108f-f059-4f36-bb43-2b7fa79b2385	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0160	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Rakodómunkás	2022-10-30	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Imre	Király	male	1981-01-27	Zalaegerszeg	Kocsis Fanni	3367780324	CW4344877	625-157-022	divorced	2022-10-30	\N	\N	10596930-63208849-18166602	Szeged - Belváros rekonstrukció	2401	Magyarország	Fejér	Dunaújváros	Kossuth Lajos utca	27	ABC Kereskedelmi Kft.	kiraly.imre161@abc-kft.hu	+36 20 221 4335	02137110-1f01-4ea8-9652-cb3057178ec0	\N
5742cb4f-f0d8-485a-b2de-1b62bd5a2c81	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0161	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Munkavédelmi felelős	2024-12-24	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Viktória	Pál	female	2002-04-16	Zalaegerszeg	Biró Zoé	7164169215	NL1710755	561-119-901	widowed	2024-12-24	\N	\N	64037531-16197063-64145239	Budapest - Angyalföld építkezés	7400	Magyarország	Somogy	Kaposvár	Hunyadi utca	55	ABC Kereskedelmi Kft.	pal.viktoria162@abc-kft.hu	+36 30 618 8783	13ad850c-f7c6-4b1c-8119-b2a785a56673	\N
cabb8a4e-d94f-475d-91a0-dbcddb2e2c08	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0162	f2254bf6-b3ef-48f6-b5ee-a8f9ac2d9fed	Takarító	2024-09-01	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Bendegúz	Tóth	male	1961-02-11	Hódmezővásárhely	Juhász Julianna	7559845077	\N	562-277-048	married	2024-09-01	\N	\N	23373314-27743505-75517296	Budapest - Csepel ipari park	6720	Magyarország	Csongrád-Csanád	Szeged	Arany János utca	133/B	ABC Kereskedelmi Kft.	toth.bendeguz163@abc-kft.hu	+36 70 546 8348	\N	\N
bd9c4f9d-4dfd-4314-9fca-b8c0eba29965	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0163	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Rakodómunkás	2024-10-26	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Lilla	Nagy	female	1974-11-10	Veszprém	Simon Mária	4123638367	KG3235466	265-023-769	single	2024-10-26	\N	\N	92616066-56754840-14089493	Miskolc - Diósgyőri felújítás	4400	Magyarország	Szabolcs-Szatmár-Bereg	Nyíregyháza	Vörösmarty utca	142	ABC Kereskedelmi Kft.	nagy.lilla164@abc-kft.hu	+36 31 185 7083	b4888603-1870-4196-ad56-4c55471e98d7	\N
8e1f4760-a30a-4017-82f6-25e8052f4553	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0164	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Rakodómunkás	2022-02-03	\N	C kategóriás jogosítvánnyal rendelkezik.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Patrik	Fehér	male	1999-10-20	Pécs	Fazekas Katalin	3757498016	\N	654-459-654	single	2022-02-03	\N	\N	21849752-99337232-67225213	Budapest - Újpest raktártelep	6801	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Batthyány utca	132	ABC Kereskedelmi Kft.	feher.patrik165@abc-kft.hu	+36 30 124 6376	35af414c-1808-4056-8fcf-0bdfd33b9862	\N
a4b4b227-aa71-45ac-8b21-72c62c82046b	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0165	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Rakodómunkás	2026-04-08	\N	Túlóra vállalására hajlandó.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Margit	Király	female	2001-10-11	Gödöllő	Fekete Éva	8456423938	\N	536-503-206	married	2026-04-08	\N	\N	90362820-75675656-67418563	Kecskemét - Gyárvárosi építkezés	7400	Magyarország	Somogy	Kaposvár	Deák Ferenc utca	91	ABC Kereskedelmi Kft.	kiraly.margit166@abc-kft.hu	+36 70 104 6890	2779c0ef-9d97-470f-839c-f818469d43d6	\N
2220316e-6929-4e51-b089-0fa402b2dc0f	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0166	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	HR asszisztens	2021-11-19	\N	Próbaidős időszak alatt.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Renáta	Török	female	1979-09-22	Cegléd	Bogdán Fanni	8796435613	QO8848375	380-648-480	widowed	2021-11-19	\N	\N	68916833-99658105-51798055	Szeged - Belváros rekonstrukció	6800	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Rákóczi út	135	ABC Kereskedelmi Kft.	torok.renata167@abc-kft.hu	+36 31 821 1139	\N	\N
55776732-bacc-44ff-a4a6-934a2e70e0c8	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0167	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Biztonsági őr	2026-06-12	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Zalán	Budai	male	1973-04-26	Hódmezővásárhely	Balogh Flóra	0768078556	\N	\N	married	2026-06-12	\N	\N	70325771-81492149-64804396	Debrecen - Ipari Park	2400	Magyarország	Fejér	Dunaújváros	Mátyás király utca	129	ABC Kereskedelmi Kft.	budai.zalan168@abc-kft.hu	+36 31 147 5934	\N	\N
5b904906-20de-4468-8bd5-cbfd5df27935	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0168	c5d51752-dff2-4728-a944-c3692937106f	Daruzó	2025-10-20	2025-11-28	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	István	Fodor	male	1990-05-22	Nyíregyháza	Sipos Dorina	3021464335	WN7492793	\N	single	2025-10-20	\N	\N	\N	Budapest - Váci út irodaház	8901	Magyarország	Zala	Zalaegerszeg	Bajcsy-Zsilinszky utca	69	ABC Kereskedelmi Kft.	fodor.istvan169@abc-kft.hu	+36 30 756 7738	\N	\N
f806263d-2962-4b2b-ad93-e7db253a6e55	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0169	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Szigetelő	2022-01-07	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Pál	Kelemen	male	1979-09-29	Pécs	Kovács Judit	\N	\N	973-553-650	single	2022-01-07	2026-12-09	\N	\N	Miskolc - Diósgyőri felújítás	7626	Magyarország	Baranya	Pécs	Mikszáth Kálmán tér	45	ABC Kereskedelmi Kft.	kelemen.pal170@abc-kft.hu	+36 30 532 4472	\N	\N
9f36d6d4-bc08-4ff7-a1f0-86c827b55a2a	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0170	80b828b8-e846-455b-b9ac-36a60a30d6d3	Tetőfedő	2021-04-07	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Zalán	Virág	male	2003-07-04	Vác	Fehér Csilla	8123101290	\N	386-520-426	divorced	2021-04-07	\N	\N	32444743-51528881-20707253	Budapest - Dél-Buda fejlesztés	6800	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Munkácsy Mihály utca	119	ABC Kereskedelmi Kft.	virag.zalan171@abc-kft.hu	+36 31 455 1175	\N	\N
1ac82d23-bc9d-408b-a33e-c4737f958b0a	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0171	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Állványozó	2024-10-21	\N	Próbaidős időszak alatt.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Gyula	Fekete	male	1990-09-18	Vác	Balázs Anna	9348962625	\N	558-708-515	divorced	2024-10-21	\N	\N	64660486-50078439-97203390	Kecskemét - Gyárvárosi építkezés	6801	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Munkácsy Mihály utca	131/A	ABC Kereskedelmi Kft.	fekete.gyula172@abc-kft.hu	+36 30 678 7043	\N	\N
36a98c89-d05e-4d9d-8e41-a9b5e489af6e	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0172	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Épületgépész	2024-09-26	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Diána	Török	female	1964-03-16	Cegléd	Török Dorina	6675000673	\N	\N	single	2024-09-26	\N	\N	30469373-86375116-46233580	Budapest - Váci út irodaház	9400	Magyarország	Győr-Moson-Sopron	Sopron	Mikszáth Kálmán tér	1	ABC Kereskedelmi Kft.	torok.diana173@abc-kft.hu	+36 70 499 7998	acfc75f8-6ffd-4fc4-aaf4-e51409068b30	\N
074c11d9-3c6d-4c1e-a77f-940ff6e6c0e6	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0173	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Állványozó	2024-06-23	\N	Új munkaerő, betanulás alatt.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Erzsébet	Antal	female	2003-01-08	Győr	Balog Orsolya	\N	\N	562-551-836	single	2024-06-23	\N	\N	93942499-23227201-45900076	Budapest - Angyalföld építkezés	1041	Magyarország	Budapest	Budapest	Tompa Mihály utca	84/C	ABC Kereskedelmi Kft.	antal.erzsebet174@abc-kft.hu	+36 70 100 7937	02137110-1f01-4ea8-9652-cb3057178ec0	\N
e6809df9-650c-4dcc-a30d-690c136feb7d	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0174	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Segédmunkás	2024-03-25	\N	Új munkaerő, betanulás alatt.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Ákos	Katona	male	1974-01-18	Zalaegerszeg	Tóth Diána	\N	RI1118784	918-536-793	single	2024-03-25	\N	\N	93191668-35838958-44783055	Szeged - Belváros rekonstrukció	2800	Magyarország	Komárom-Esztergom	Tatabánya	Hunyadi utca	32	ABC Kereskedelmi Kft.	katona.akos175@abc-kft.hu	+36 50 201 6339	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
7688debd-4fd7-486a-bec8-434e7180574b	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0175	c5d51752-dff2-4728-a944-c3692937106f	Művezető	2025-11-19	2026-08-12	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Kornél	Németh	male	2002-09-30	Győr	Antal Boglárka	2537600491	\N	407-197-323	single	2025-11-19	\N	\N	83897925-90072482-88967857	Kecskemét - Gyárvárosi építkezés	8200	Magyarország	Veszprém	Veszprém	Arany János utca	49/B	ABC Kereskedelmi Kft.	nemeth.kornel176@abc-kft.hu	+36 30 283 6221	\N	\N
3738ac38-5d8b-4790-9e7e-a1f13dbde301	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0176	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Művezető	2023-03-20	\N	Csapatvezetői potenciállal rendelkezik.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Tibor	Somogyi	male	1993-10-08	Nyíregyháza	Fehér Nikolett	9777643269	\N	390-138-858	married	2023-03-20	\N	\N	98317339-78700682-23488637	Miskolc - Diósgyőri felújítás	9025	Magyarország	Győr-Moson-Sopron	Győr	Munkácsy Mihály utca	57	ABC Kereskedelmi Kft.	somogyi.tibor177@abc-kft.hu	+36 20 179 1004	acfc75f8-6ffd-4fc4-aaf4-e51409068b30	\N
b953711b-1cc6-40c7-ac7e-010bf858ec98	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0177	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Daruzó	2024-06-13	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Olivér	Orosz	male	1971-12-13	Szolnok	Oláh Emese	8963440686	\N	268-446-157	divorced	2024-06-13	\N	\N	\N	Debrecen - Ipari Park	9701	Magyarország	Vas	Szombathely	Bethlen Gábor utca	49	ABC Kereskedelmi Kft.	orosz.oliver178@abc-kft.hu	+36 20 608 7491	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
3aeaf31a-fd9d-4f4d-9b27-8eee1b6a6153	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0178	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Művezető	2023-01-08	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Róbert	Virág	male	1993-12-05	Dunaújváros	Illés Anna	3628072913	\N	544-864-033	single	2023-01-08	\N	\N	\N	Budapest - Újpest raktártelep	5002	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Hunyadi utca	5	ABC Kereskedelmi Kft.	virag.robert179@abc-kft.hu	+36 31 402 3834	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
5b4e6406-5b92-4db1-beee-f410c0c5589a	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0179	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Állványozó	2021-03-04	\N	Első munkahelyes, szakmai gyakorlat keretében.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Bendegúz	Hegedűs	male	1969-10-11	Esztergom	Fehér Anna	4359585772	OS8049036	421-013-983	married	2021-03-04	2026-08-14	\N	\N	Miskolc - Diósgyőri felújítás	4024	Magyarország	Hajdú-Bihar	Debrecen	Bem József utca	77	ABC Kereskedelmi Kft.	hegedus.bendeguz180@abc-kft.hu	+36 50 855 2068	0d08cbc6-b692-4e7c-b269-f47eb41d996a	\N
2f75e9ac-08ec-44fd-bea9-9370b333fa0f	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0180	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Ács	2021-08-21	\N	C kategóriás jogosítvánnyal rendelkezik.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Lili	Németh	female	1994-07-13	Eger	Balog Luca	3640685153	\N	616-661-148	single	2021-08-21	2026-04-24	\N	55872010-40104759-87319514	Budapest - Újpest raktártelep	2700	Magyarország	Pest	Cegléd	Mátyás király utca	40	ABC Kereskedelmi Kft.	nemeth.lili181@abc-kft.hu	+36 20 726 9028	0d08cbc6-b692-4e7c-b269-f47eb41d996a	\N
2188b08e-03cd-428a-bde2-c6c60a750e21	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0181	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Tűzvédelmi felelős	2024-03-03	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Mária	Török	female	1983-12-27	Békéscsaba	Bogdán Edina	8557447961	PS1040737	704-754-888	married	2024-03-03	\N	\N	\N	Szeged - Belváros rekonstrukció	5002	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Dózsa György út	30	ABC Kereskedelmi Kft.	torok.maria182@abc-kft.hu	+36 20 962 8152	94eda3e8-6e8f-45df-a5f2-9690f2c19ccf	\N
47b787a7-f37c-4949-87fa-14abfac0e6a6	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0182	80b828b8-e846-455b-b9ac-36a60a30d6d3	Építésvezető	2026-04-29	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Ádám	Kiss	male	1961-10-17	Cegléd	Katona Julianna	9484865390	\N	\N	married	2026-04-29	\N	\N	68226499-85999032-44249417	Kecskemét - Gyárvárosi építkezés	7401	Magyarország	Somogy	Kaposvár	Mátyás király utca	16/C	ABC Kereskedelmi Kft.	kiss.adam183@abc-kft.hu	+36 30 102 3943	\N	\N
5c0ef89c-931e-45bc-8277-05addf3e2cc9	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0183	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Könyvelő	2021-08-01	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Márk	Orosz	male	1999-10-24	Székesfehérvár	Sipos Anikó	1873138601	BZ4950288	\N	single	2021-08-01	2026-07-06	\N	\N	Miskolc - Diósgyőri felújítás	6031	Magyarország	Bács-Kiskun	Kecskemét	Zrínyi utca	11/B	ABC Kereskedelmi Kft.	orosz.mark184@abc-kft.hu	+36 30 886 4978	d24a0a6b-de8f-4afc-8fc3-9ba31235ad91	\N
efce7735-dadd-4498-ba51-f49d154e958b	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0184	c5d51752-dff2-4728-a944-c3692937106f	Hegesztő	2023-03-20	2025-05-29	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Csaba	Fehér	male	1963-02-04	Esztergom	Németh Zoé	7424705893	\N	094-725-392	single	2023-03-20	2028-08-07	\N	18437777-16737330-57844885	Debrecen - Ipari Park	1021	Magyarország	Budapest	Budapest	Batthyány utca	99	ABC Kereskedelmi Kft.	feher.csaba185@abc-kft.hu	+36 31 596 7134	\N	\N
da59c51c-441f-458d-8119-71f0f7786277	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0185	c5d51752-dff2-4728-a944-c3692937106f	Ács	2024-02-24	2025-04-09	Tapasztalt dolgozó, megbízható.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Éva	Fehér	female	1966-07-07	Vác	Farkas Katalin	9398640518	\N	397-071-065	single	2024-02-24	\N	\N	20480676-31315369-87748516	Székesfehérvár - Gyáripari terület	8201	Magyarország	Veszprém	Veszprém	Liszt Ferenc tér	86	ABC Kereskedelmi Kft.	feher.eva186@abc-kft.hu	+36 20 769 7099	\N	\N
e7794d74-2174-4680-a2fd-2479eddd3c97	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0186	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Zsaluzó	2025-03-09	\N	Túlóra vállalására hajlandó.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Olivér	Simon	male	1970-09-20	Sopron	Tóth Anikó	0750648501	\N	601-121-692	married	2025-03-09	\N	\N	85166618-99704475-81039538	Miskolc - Diósgyőri felújítás	6722	Magyarország	Csongrád-Csanád	Szeged	Liszt Ferenc tér	125	ABC Kereskedelmi Kft.	simon.oliver187@abc-kft.hu	+36 70 224 2373	\N	\N
ffac2c33-ad4b-40e1-a944-80ae881b2eec	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0187	80b828b8-e846-455b-b9ac-36a60a30d6d3	Villanyszerelő	2026-11-11	\N	Csapatvezetői potenciállal rendelkezik.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Ferenc	Magyar	male	1981-07-27	Tatabánya	Somogyi Noémi	6741994966	EI6156175	\N	married	2026-11-11	2027-11-28	\N	76300016-81610177-84837275	Miskolc - Diósgyőri felújítás	9700	Magyarország	Vas	Szombathely	Batthyány utca	55	ABC Kereskedelmi Kft.	magyar.ferenc188@abc-kft.hu	+36 30 448 6100	\N	\N
c3869d99-0d12-4a86-a458-f7169d5102e9	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0188	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Biztonsági őr	2021-06-30	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Dániel	Fehér	male	1987-10-30	Eger	Simon Zsófia	5812738728	\N	639-654-541	married	2021-06-30	\N	\N	42647958-32302443-69208592	Budapest - Angyalföld építkezés	9700	Magyarország	Vas	Szombathely	Kazinczy utca	28	ABC Kereskedelmi Kft.	feher.daniel189@abc-kft.hu	+36 31 912 9044	\N	\N
806a6b77-655b-4419-b28b-b6afa60ef01c	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0189	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Takarító	2021-10-19	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Beáta	Pál	female	2001-05-12	Szeged	Sipos Barbara	4909383473	\N	936-302-958	married	2021-10-19	\N	\N	\N	Budapest - Váci út irodaház	4027	Magyarország	Hajdú-Bihar	Debrecen	Rákóczi út	142/C	ABC Kereskedelmi Kft.	pal.beata190@abc-kft.hu	+36 30 267 7797	d24a0a6b-de8f-4afc-8fc3-9ba31235ad91	\N
54d34a35-447e-4865-92a8-3ca7963e86a2	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0190	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Sofőr	2024-01-10	\N	Próbaidős időszak alatt.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Imre	Németh	male	1978-01-22	Sopron	Kiss Erzsébet	8500362807	\N	870-165-189	married	2024-01-10	\N	\N	52828120-39570233-34269125	Székesfehérvár - Gyáripari terület	3530	Magyarország	Borsod-Abaúj-Zemplén	Miskolc	Batthyány utca	73	ABC Kereskedelmi Kft.	nemeth.imre191@abc-kft.hu	+36 70 791 7250	94eda3e8-6e8f-45df-a5f2-9690f2c19ccf	\N
213a107c-fe5f-46a9-92ff-40e5b5401230	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0191	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Segédmunkás	2023-10-20	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Katalin	Takács	female	1968-04-21	Dunaújváros	Török Zsuzsanna	6605642512	\N	095-041-345	single	2023-10-20	\N	\N	22463023-78849159-22496076	Szeged - Belváros rekonstrukció	2500	Magyarország	Komárom-Esztergom	Esztergom	Munkácsy Mihály utca	13	ABC Kereskedelmi Kft.	takacs.katalin192@abc-kft.hu	+36 70 735 3544	\N	\N
a71e3e41-c8fb-4698-961c-2c1d235da3cc	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0192	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Villanyszerelő	2024-06-23	\N	Túlóra vállalására hajlandó.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Béla	Papp	male	1971-09-05	Békéscsaba	Kis Orsolya	3888508484	\N	\N	married	2024-06-23	\N	\N	87486708-13741201-55000668	Győr - Északi Ipari Park	6801	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Petőfi Sándor utca	127	ABC Kereskedelmi Kft.	papp.bela193@abc-kft.hu	+36 50 109 5951	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
5d2c9159-c791-44da-b7d2-758dcb2e09d2	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0193	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Ács	2025-04-06	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Milán	Somogyi	male	1974-02-12	Szeged	Pál Fanni	6702883898	\N	746-383-051	married	2025-04-06	\N	\N	37681746-17641248-49622816	Kecskemét - Gyárvárosi építkezés	8002	Magyarország	Fejér	Székesfehérvár	Kölcsey utca	75	ABC Kereskedelmi Kft.	somogyi.milan194@abc-kft.hu	+36 50 516 3746	35af414c-1808-4056-8fcf-0bdfd33b9862	\N
2cb2e9fe-b195-4601-b212-d132bdfa0dcf	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0194	f2254bf6-b3ef-48f6-b5ee-a8f9ac2d9fed	Projektkoordinátor	2021-01-15	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Péter	Takács	male	1976-08-21	Gödöllő	Simon Katalin	1894188043	\N	503-632-424	married	2021-01-15	\N	\N	79266004-31166446-41183540	Debrecen - Ipari Park	3300	Magyarország	Heves	Eger	Zrínyi utca	45	ABC Kereskedelmi Kft.	takacs.peter195@abc-kft.hu	+36 20 818 3592	\N	\N
029d5109-bb23-4544-9325-123a62e791ee	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0195	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Sofőr	2022-01-13	\N	Csapatvezetői potenciállal rendelkezik.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Gábor	Katona	male	1971-06-27	Dunaújváros	Vincze Szilvia	8461182872	\N	257-743-307	single	2022-01-13	\N	\N	21023109-91802229-23132007	Budapest - Dél-Buda fejlesztés	6000	Magyarország	Bács-Kiskun	Kecskemét	Damjanich utca	11	ABC Kereskedelmi Kft.	katona.gabor196@abc-kft.hu	+36 20 284 1880	2779c0ef-9d97-470f-839c-f818469d43d6	\N
c18e98e8-1474-45c3-ac6e-7d04c2686831	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0196	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Festő	2021-05-18	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Fanni	Kiss	female	1962-06-18	Békéscsaba	Sipos Orsolya	2560175944	\N	218-662-725	married	2021-05-18	\N	\N	76877719-72886359-23926803	Székesfehérvár - Gyáripari terület	9701	Magyarország	Vas	Szombathely	Liszt Ferenc tér	76	ABC Kereskedelmi Kft.	kiss.fanni197@abc-kft.hu	+36 31 822 3884	acfc75f8-6ffd-4fc4-aaf4-e51409068b30	\N
27b4dba0-54d6-4346-a335-5adc5aea0744	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0197	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Projektkoordinátor	2025-08-22	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Dániel	Fülöp	male	1970-01-12	Esztergom	Szalai Lili	3768820107	\N	029-118-851	married	2025-08-22	2027-02-22	\N	\N	Budapest - Csepel ipari park	5002	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Ady Endre utca	57	ABC Kereskedelmi Kft.	fulop.daniel198@abc-kft.hu	+36 20 138 5318	acac124f-7479-48fa-a1ac-b7d62b6489fc	\N
76e14da3-5616-4306-9332-8bda30fa74a7	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0198	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Raktáros	2024-05-30	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Márk	Pintér	male	1986-01-01	Esztergom	Szilágyi Zsófia	6747719070	\N	218-885-556	married	2024-05-30	\N	\N	17098015-24324191-31805672	Budapest - Budaörs logisztikai központ	3300	Magyarország	Heves	Eger	Bethlen Gábor utca	98	ABC Kereskedelmi Kft.	pinter.mark199@abc-kft.hu	+36 70 705 2788	13ad850c-f7c6-4b1c-8119-b2a785a56673	\N
fe2bb1b8-fb1c-4332-9891-4e87d32228ef	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0199	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Vasbetonszerelő	2024-11-23	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Béla	Deák	male	1984-03-04	Cegléd	Király Andrea	3733056434	\N	772-095-953	divorced	2024-11-23	\N	\N	\N	Debrecen - Ipari Park	4400	Magyarország	Szabolcs-Szatmár-Bereg	Nyíregyháza	Batthyány utca	9	ABC Kereskedelmi Kft.	deak.bela200@abc-kft.hu	+36 31 740 8277	\N	\N
a362d06a-f048-4da0-bde0-d2e40f6b6370	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0200	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Építésvezető	2021-11-29	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Bence	Simon	male	2004-01-29	Debrecen	Biró Beáta	9439171610	\N	881-524-801	single	2021-11-29	2026-02-10	\N	\N	Budapest - Csepel ipari park	3301	Magyarország	Heves	Eger	Fő utca	147/A	ABC Kereskedelmi Kft.	simon.bence201@abc-kft.hu	+36 70 396 8168	\N	\N
4a0c9155-6c8c-459f-a148-c1f916343e0a	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0201	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Festő	2026-11-08	\N	OKJ végzettséggel rendelkezik.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Krisztina	Virág	female	1996-09-04	Cegléd	Pál Csilla	6446098652	\N	708-100-127	divorced	2026-11-08	\N	\N	47560504-78313479-12488271	Budapest - Budaörs logisztikai központ	3304	Magyarország	Heves	Eger	Petőfi Sándor utca	80/A	ABC Kereskedelmi Kft.	virag.krisztina202@abc-kft.hu	+36 50 637 4207	13ad850c-f7c6-4b1c-8119-b2a785a56673	\N
7e582e07-2f44-46bf-88b1-bd9b09cc21cf	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0202	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Kőműves	2024-09-14	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Zsolt	Juhász	male	1992-10-30	Veszprém	Boros Anna	1482274932	\N	498-668-297	married	2024-09-14	\N	\N	\N	Kecskemét - Gyárvárosi építkezés	6000	Magyarország	Bács-Kiskun	Kecskemét	Zrínyi utca	19	ABC Kereskedelmi Kft.	juhasz.zsolt203@abc-kft.hu	+36 50 692 9471	13ad850c-f7c6-4b1c-8119-b2a785a56673	\N
3047d3de-1b1e-42ff-b962-6081e6617b9e	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0203	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Műszaki ellenőr	2021-08-15	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Eszter	Magyar	female	1973-02-22	Pécs	Szalai Krisztina	\N	\N	367-578-884	married	2021-08-15	\N	\N	92684690-10797428-77999182	Székesfehérvár - Gyáripari terület	9700	Magyarország	Vas	Szombathely	Móricz Zsigmond körtér	17/A	ABC Kereskedelmi Kft.	magyar.eszter204@abc-kft.hu	+36 70 932 1230	7c65ce89-c2e7-4a79-8cac-311051629c78	\N
4ae410df-7db8-4b7c-b9e8-ba221fb51aad	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0204	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Kőműves	2025-09-18	\N	Többéves iparági tapasztalat.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Szabolcs	Takács	male	1971-10-16	Szeged	Rácz Edina	6005090405	FT5221352	\N	single	2025-09-18	2026-04-25	\N	57600291-29589804-70463601	Budapest - Váci út irodaház	2401	Magyarország	Fejér	Dunaújváros	Templom utca	111	ABC Kereskedelmi Kft.	takacs.szabolcs205@abc-kft.hu	+36 31 368 7035	acac124f-7479-48fa-a1ac-b7d62b6489fc	\N
80609eb7-b05e-4572-8521-6aac2e8bc47e	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0205	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Minőségellenőr	2023-10-09	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Norbert	Varga	male	1996-12-26	Békéscsaba	Sándor Beáta	9194700774	\N	011-469-650	married	2023-10-09	\N	\N	12157413-35431695-39719971	Győr - Északi Ipari Park	5600	Magyarország	Békés	Békéscsaba	Széchenyi István tér	42	ABC Kereskedelmi Kft.	varga.norbert206@abc-kft.hu	+36 30 765 9785	94eda3e8-6e8f-45df-a5f2-9690f2c19ccf	\N
5a9c85c9-1302-436f-be25-98e4f927aee8	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0206	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Épületgépész	2026-04-15	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Ernő	Takács	male	1964-12-10	Kecskemét	Molnár Beáta	3858542222	\N	942-583-446	divorced	2026-04-15	\N	\N	\N	Budapest - Budaörs logisztikai központ	8901	Magyarország	Zala	Zalaegerszeg	Széchenyi István tér	95/A	ABC Kereskedelmi Kft.	takacs.erno207@abc-kft.hu	+36 50 992 4903	\N	\N
40247db0-7a84-4520-afaa-6e1d7007f584	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0207	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Ács	2022-08-14	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Mónika	Tóth	female	1967-12-14	Zalaegerszeg	Antal Nikolett	7670720242	\N	608-785-085	married	2022-08-14	\N	\N	99301428-57082943-99891687	Budapest - Dél-Buda fejlesztés	2100	Magyarország	Pest	Gödöllő	Mátyás király utca	69	ABC Kereskedelmi Kft.	toth.monika208@abc-kft.hu	+36 50 467 6971	\N	\N
6ab0dde1-5a9d-4cbb-a01b-3359c83be6b5	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0208	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Ács	2021-07-19	\N	Első munkahelyes, szakmai gyakorlat keretében.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Kornél	Kovács	male	1985-08-21	Zalaegerszeg	Balázs Piroska	9090545196	VP6735670	\N	single	2021-07-19	\N	\N	58936870-16942867-92242820	Budapest - Dél-Buda fejlesztés	5002	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Kodály körönd	102	ABC Kereskedelmi Kft.	kovacs.kornel209@abc-kft.hu	+36 50 132 6226	94eda3e8-6e8f-45df-a5f2-9690f2c19ccf	\N
b744f709-109a-4063-b9fb-697b57c57917	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0209	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Hegesztő	2025-03-14	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Tímea	Tóth	female	1987-03-09	Debrecen	Budai Ágnes	0278357881	\N	654-841-423	married	2025-03-14	\N	\N	\N	Budapest - Újpest raktártelep	2801	Magyarország	Komárom-Esztergom	Tatabánya	Bartók Béla út	7	ABC Kereskedelmi Kft.	toth.timea210@abc-kft.hu	+36 50 979 6800	d24a0a6b-de8f-4afc-8fc3-9ba31235ad91	\N
2b199864-64bb-48b7-b37c-e3a4707f9f69	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0210	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Targoncavezető	2024-08-29	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Viktor	Vincze	male	1991-01-03	Sopron	Budai Réka	5408720510	\N	718-179-134	married	2024-08-29	\N	\N	\N	Budapest - Dél-Buda fejlesztés	6801	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Bartók Béla út	118/B	ABC Kereskedelmi Kft.	vincze.viktor211@abc-kft.hu	+36 50 815 4919	\N	\N
928fff45-b089-4d9b-af9c-47ab3f2fe5cf	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0211	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Gondnok	2021-12-10	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Margit	Jakab	female	1987-09-13	Székesfehérvár	Király Petra	2780015171	\N	286-798-857	single	2021-12-10	\N	\N	\N	Budapest - Angyalföld építkezés	6800	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Petőfi Sándor utca	103/C	ABC Kereskedelmi Kft.	jakab.margit212@abc-kft.hu	+36 20 611 4797	94eda3e8-6e8f-45df-a5f2-9690f2c19ccf	\N
cb7d20fe-72b7-4b8b-9dcf-fe6a230e75cb	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0212	f2254bf6-b3ef-48f6-b5ee-a8f9ac2d9fed	Kőműves	2022-01-24	\N	Külföldi munkavállalási engedéllyel rendelkezik.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Gergő	László	male	1996-12-27	Szolnok	Jakab Ilona	2413693303	\N	496-117-650	single	2022-01-24	\N	\N	19460778-11440523-26896030	Budapest - Dél-Buda fejlesztés	8201	Magyarország	Veszprém	Veszprém	Kodály körönd	138/C	ABC Kereskedelmi Kft.	laszlo.gergo213@abc-kft.hu	+36 70 391 4245	\N	\N
048e4fc5-5972-4052-9d6e-0ff1eb6a9e83	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0213	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Munkavédelmi felelős	2022-06-30	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Dávid	Takács	male	2006-01-29	Hódmezővásárhely	Szűcs Hajnalka	0888153827	\N	441-441-763	divorced	2022-06-30	2028-08-05	\N	\N	Budapest - Csepel ipari park	1181	Magyarország	Budapest	Budapest	Móricz Zsigmond körtér	55	ABC Kereskedelmi Kft.	takacs.david214@abc-kft.hu	+36 50 703 4393	acac124f-7479-48fa-a1ac-b7d62b6489fc	\N
07306aef-1874-45ed-8f02-c427443bd006	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0214	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Projektkoordinátor	2025-01-07	\N	Részmunkaidős foglalkoztatás.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Sándor	Deák	male	1985-08-22	Kaposvár	Veres Beáta	7933752005	SN5967102	514-914-918	married	2025-01-07	\N	\N	86307724-66396738-98452392	Győr - Északi Ipari Park	8004	Magyarország	Fejér	Székesfehérvár	Bem József utca	94	ABC Kereskedelmi Kft.	deak.sandor215@abc-kft.hu	+36 20 764 3183	\N	\N
bf72ebb9-85fc-4458-8ae1-fd8e0dca1edc	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0215	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Rakodómunkás	2024-07-22	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	István	László	male	1970-12-22	Veszprém	Pál Lilla	8524967987	\N	\N	married	2024-07-22	2026-10-11	\N	38571403-72330006-58873092	Budapest - Budaörs logisztikai központ	8900	Magyarország	Zala	Zalaegerszeg	Bocskai utca	75	ABC Kereskedelmi Kft.	laszlo.istvan216@abc-kft.hu	+36 70 191 6881	7c65ce89-c2e7-4a79-8cac-311051629c78	\N
cbbe0775-b545-4fe0-baa8-7b3edb18abed	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0216	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Biztonsági őr	2023-07-16	\N	Havi bruttó bér: 357 000 Ft	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Nikolett	Varga	female	1985-01-26	Esztergom	Orosz Ágnes	2545539074	EG3047544	909-555-158	married	2023-07-16	\N	\N	\N	Miskolc - Diósgyőri felújítás	4433	Magyarország	Szabolcs-Szatmár-Bereg	Nyíregyháza	Batthyány utca	21/C	ABC Kereskedelmi Kft.	varga.nikolett217@abc-kft.hu	+36 70 381 9158	02137110-1f01-4ea8-9652-cb3057178ec0	\N
407b2dde-507b-401b-80ed-059a2dfc8ece	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0217	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Szigetelő	2024-08-07	\N	C kategóriás jogosítvánnyal rendelkezik.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Dominik	Orosz	male	1988-08-18	Cegléd	Szilágyi Bianka	\N	ST3891918	\N	divorced	2024-08-07	\N	\N	93520727-12669836-65356539	Budapest - Angyalföld építkezés	9701	Magyarország	Vas	Szombathely	Hunyadi utca	129	ABC Kereskedelmi Kft.	orosz.dominik218@abc-kft.hu	+36 70 513 2381	02137110-1f01-4ea8-9652-cb3057178ec0	\N
19d8a1df-835c-47f9-ab12-be753f7558b1	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0218	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Projektkoordinátor	2022-11-27	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Zsolt	Molnár	male	1977-07-24	Pécs	Fülöp Barbara	5502959766	\N	\N	single	2022-11-27	\N	\N	65417101-11110250-57916173	Szeged - Belváros rekonstrukció	2600	Magyarország	Pest	Vác	Bartók Béla út	29	ABC Kereskedelmi Kft.	molnar.zsolt219@abc-kft.hu	+36 20 702 8643	13ad850c-f7c6-4b1c-8119-b2a785a56673	\N
17fe6a7f-fdf7-4eae-bc24-e4b61de4e257	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0219	f2254bf6-b3ef-48f6-b5ee-a8f9ac2d9fed	Segédmunkás	2022-08-07	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Vivien	Barta	female	1972-11-11	Kaposvár	Fodor Veronika	0627912689	YG4988136	291-163-613	single	2022-08-07	\N	\N	\N	Szeged - Belváros rekonstrukció	6720	Magyarország	Csongrád-Csanád	Szeged	Petőfi Sándor utca	136/A	ABC Kereskedelmi Kft.	barta.vivien220@abc-kft.hu	+36 30 950 2562	\N	\N
b5612257-092d-4c7e-92bf-2b5f83b7185a	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0220	b7c28743-1740-4c82-a15f-91fb033fd7cd	Szállítómunkás	2024-02-18	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Barbara	Simon	female	1998-06-23	Esztergom	Mészáros Mónika	0057475628	\N	180-023-214	married	2024-02-18	\N	\N	73251460-68104047-70493552	Budapest - Angyalföld építkezés	6723	Magyarország	Csongrád-Csanád	Szeged	Munkácsy Mihály utca	64	ABC Kereskedelmi Kft.	simon.barbara221@abc-kft.hu	+36 50 441 6368	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
dbbdc979-64f7-409e-8ad4-e38ad509c8fd	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0221	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Kőműves	2023-06-28	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Noel	Horváth	male	2005-01-01	Miskolc	Fehér Eszter	8101606177	\N	800-262-810	single	2023-06-28	2028-06-10	\N	\N	Miskolc - Diósgyőri felújítás	3300	Magyarország	Heves	Eger	Táncsics Mihály utca	109	ABC Kereskedelmi Kft.	horvath.noel222@abc-kft.hu	+36 30 252 2519	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
43c61333-8724-4a26-a7ed-e48c420ca6b3	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0222	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Ács	2023-10-10	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Gergő	Kocsis	male	1972-11-14	Kaposvár	Szilágyi Margit	9678936720	\N	116-584-491	married	2023-10-10	\N	\N	\N	Debrecen - Ipari Park	8002	Magyarország	Fejér	Székesfehérvár	Munkácsy Mihály utca	105	ABC Kereskedelmi Kft.	kocsis.gergo223@abc-kft.hu	+36 30 987 5163	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
5fe005af-86a2-40a4-aa4d-b212fb7bea49	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0223	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Állványozó	2026-01-20	\N	Tapasztalt dolgozó, megbízható.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	György	Balogh	male	1971-07-01	Eger	Boros Boglárka	2851161678	\N	972-393-856	single	2026-01-20	\N	\N	71828047-68810690-25596456	Budapest - Dél-Buda fejlesztés	2501	Magyarország	Komárom-Esztergom	Esztergom	Tompa Mihály utca	1	ABC Kereskedelmi Kft.	balogh.gyorgy224@abc-kft.hu	+36 30 254 4444	2779c0ef-9d97-470f-839c-f818469d43d6	\N
84e726bc-0444-45d6-9462-d266e011fa97	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0224	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Takarító	2021-04-07	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Zsolt	Biró	male	1986-09-14	Székesfehérvár	Nemes Hanna	9118686876	\N	626-454-257	widowed	2021-04-07	\N	\N	21234752-34903176-49738280	Budapest - Dél-Buda fejlesztés	1071	Magyarország	Budapest	Budapest	Bajcsy-Zsilinszky utca	33	ABC Kereskedelmi Kft.	biro.zsolt225@abc-kft.hu	+36 30 967 3946	\N	\N
552c757a-2778-4277-9bb2-57eeede4878e	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0225	80b828b8-e846-455b-b9ac-36a60a30d6d3	Ács	2021-01-09	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Norbert	Kocsis	male	1968-05-11	Szolnok	Balog Erika	\N	\N	791-410-635	married	2021-01-09	\N	\N	56291618-25945229-29067240	Budapest - Budaörs logisztikai központ	2030	Magyarország	Pest	Érd	Zrínyi utca	26	ABC Kereskedelmi Kft.	kocsis.norbert226@abc-kft.hu	+36 50 172 1012	b4888603-1870-4196-ad56-4c55471e98d7	\N
4f3c1485-810e-482e-bbfc-d1651b3c2c30	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0226	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Biztonsági őr	2021-05-27	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Hunor	Balogh	male	2004-03-29	Vác	Tóth Zsuzsanna	8668386105	HQ5473368	\N	married	2021-05-27	2026-12-05	\N	44701656-16679346-89304129	Szeged - Belváros rekonstrukció	8001	Magyarország	Fejér	Székesfehérvár	Fő utca	63/A	ABC Kereskedelmi Kft.	balogh.hunor227@abc-kft.hu	+36 70 721 3475	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
18ed6690-0536-4bc6-bf99-2e38a230c228	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0227	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Biztonsági őr	2022-02-03	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Szabolcs	Balogh	male	1995-04-15	Gödöllő	Oláh Krisztina	5305041473	\N	136-539-740	married	2022-02-03	\N	\N	\N	Budapest - Váci út irodaház	5008	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Táncsics Mihály utca	117/C	ABC Kereskedelmi Kft.	balogh.szabolcs228@abc-kft.hu	+36 50 119 6177	02137110-1f01-4ea8-9652-cb3057178ec0	\N
99e17c72-b075-4ca7-93d3-f28ee83163ab	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0228	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Állványozó	2024-05-14	\N	Külföldi munkavállalási engedéllyel rendelkezik.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Ádám	Budai	male	1963-12-02	Szeged	Vincze Fanni	0992903558	XV5806373	087-471-416	married	2024-05-14	\N	\N	\N	Budapest - Budaörs logisztikai központ	7401	Magyarország	Somogy	Kaposvár	Munkácsy Mihály utca	19/B	ABC Kereskedelmi Kft.	budai.adam229@abc-kft.hu	+36 50 817 8727	2779c0ef-9d97-470f-839c-f818469d43d6	\N
caeba2c6-9e0a-4340-a9a8-9d375cc8b8a5	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0229	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Burkoló	2021-03-21	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Margit	Kocsis	female	2001-02-28	Győr	Magyar Orsolya	4424579962	\N	\N	single	2021-03-21	\N	\N	17982688-84432741-78887088	Budapest - Váci út irodaház	9028	Magyarország	Győr-Moson-Sopron	Győr	Kossuth Lajos utca	150	ABC Kereskedelmi Kft.	kocsis.margit230@abc-kft.hu	+36 50 832 1085	7c65ce89-c2e7-4a79-8cac-311051629c78	\N
0499f15c-c9d9-4d90-a761-953c1507afa1	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0230	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Burkoló	2021-07-23	\N	Részmunkaidős foglalkoztatás.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Róbert	Varga	male	2002-09-17	Debrecen	Tóth Ilona	\N	\N	394-824-163	single	2021-07-23	\N	\N	\N	Debrecen - Ipari Park	2100	Magyarország	Pest	Gödöllő	Damjanich utca	84	ABC Kereskedelmi Kft.	varga.robert231@abc-kft.hu	+36 70 959 7750	acac124f-7479-48fa-a1ac-b7d62b6489fc	\N
b171ad34-97d8-4368-baa6-0d5e8819904b	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0231	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Vízvezeték-szerelő	2022-02-23	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Dóra	Farkas	female	1996-11-18	Kaposvár	Balázs Andrea	5718689992	\N	310-798-578	married	2022-02-23	\N	\N	46249062-13459591-76032958	Budapest - Váci út irodaház	2800	Magyarország	Komárom-Esztergom	Tatabánya	Mikszáth Kálmán tér	149	ABC Kereskedelmi Kft.	farkas.dora232@abc-kft.hu	+36 31 582 1023	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
09a21afa-4d73-4e68-95c9-7e06581988f1	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0232	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	HR asszisztens	2023-06-13	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Lili	Deák	female	1966-06-30	Kaposvár	Fehér Flóra	5039504930	WT4611097	278-522-363	married	2023-06-13	\N	\N	17330799-31293155-63535309	Miskolc - Diósgyőri felújítás	8004	Magyarország	Fejér	Székesfehérvár	Liszt Ferenc tér	148	ABC Kereskedelmi Kft.	deak.lili233@abc-kft.hu	+36 70 146 7794	\N	\N
4d9ba965-e4f4-42e3-8a7f-1b8c7932cfec	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0233	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Vízvezeték-szerelő	2023-07-01	\N	Új munkaerő, betanulás alatt.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Anna	Papp	female	1988-01-24	Sopron	Papp Mónika	\N	\N	965-814-860	divorced	2023-07-01	\N	\N	63513137-15274091-69972758	Szeged - Belváros rekonstrukció	8901	Magyarország	Zala	Zalaegerszeg	Kazinczy utca	7	ABC Kereskedelmi Kft.	papp.anna234@abc-kft.hu	+36 70 736 8748	\N	\N
b94d3ec8-a309-4d55-8f5c-5a785638032d	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0234	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	HR asszisztens	2023-06-23	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Réka	Máté	female	2006-03-05	Zalaegerszeg	Budai Diána	2724985986	\N	077-099-139	single	2023-06-23	\N	\N	59613947-59372616-67022547	Budapest - Budaörs logisztikai központ	8200	Magyarország	Veszprém	Veszprém	Tompa Mihály utca	63	ABC Kereskedelmi Kft.	mate.reka235@abc-kft.hu	+36 50 626 9269	d24a0a6b-de8f-4afc-8fc3-9ba31235ad91	\N
76de0070-5a2f-415a-85bc-b0fa10fee517	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0235	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Zsaluzó	2024-02-13	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Olivér	Török	male	1973-10-09	Székesfehérvár	Szűcs Zsófia	\N	\N	916-237-991	single	2024-02-13	\N	\N	\N	Győr - Északi Ipari Park	8004	Magyarország	Fejér	Székesfehérvár	Dózsa György út	131/A	ABC Kereskedelmi Kft.	torok.oliver236@abc-kft.hu	+36 50 250 9687	94eda3e8-6e8f-45df-a5f2-9690f2c19ccf	\N
ee63fd99-eab6-4c65-be11-c5539d067db9	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0236	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Rakodómunkás	2024-10-12	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Klára	Mészáros	female	1978-07-30	Szolnok	Kocsis Réka	\N	\N	173-941-858	married	2024-10-12	2026-11-02	\N	10864378-16766346-97424541	Kecskemét - Gyárvárosi építkezés	4025	Magyarország	Hajdú-Bihar	Debrecen	Vörösmarty utca	117/B	ABC Kereskedelmi Kft.	meszaros.klara237@abc-kft.hu	+36 30 540 4246	\N	\N
7fe8223b-20f5-435d-9471-f312b5a0acc3	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0237	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Minőségellenőr	2025-11-12	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Lilla	Magyar	female	1979-05-04	Székesfehérvár	Balogh Bianka	1072093272	\N	232-429-199	married	2025-11-12	\N	\N	83253319-87070218-70136334	Budapest - Újpest raktártelep	1121	Magyarország	Budapest	Budapest	Széchenyi István tér	85	ABC Kereskedelmi Kft.	magyar.lilla238@abc-kft.hu	+36 20 790 5439	7c65ce89-c2e7-4a79-8cac-311051629c78	\N
2d3c5c52-6069-4176-88b1-71ce94535862	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0238	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Szállítómunkás	2023-12-17	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Lajos	László	male	2001-07-25	Vác	László Flóra	0976407906	GF9880503	257-016-830	married	2023-12-17	\N	\N	73689338-71044622-55926055	Debrecen - Ipari Park	1111	Magyarország	Budapest	Budapest	Dózsa György út	58	ABC Kereskedelmi Kft.	laszlo.lajos239@abc-kft.hu	+36 30 223 9053	13ad850c-f7c6-4b1c-8119-b2a785a56673	\N
ae024139-efdb-49c9-b71d-eb88899f0b4f	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0239	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Villanyszerelő	2026-01-05	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Krisztina	Szabó	female	1966-06-26	Gödöllő	Király Eszter	0869741554	AZ2759771	007-815-174	single	2026-01-05	\N	\N	\N	Győr - Északi Ipari Park	1011	Magyarország	Budapest	Budapest	Kossuth Lajos utca	105	ABC Kereskedelmi Kft.	szabo.krisztina240@abc-kft.hu	+36 30 460 9498	\N	\N
abdfe309-20b2-4d04-8f0d-57b7159b0295	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0240	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Szigetelő	2022-08-06	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Boglárka	Barta	female	1984-08-26	Kaposvár	Somogyi Fruzsina	3924653255	PM9396865	462-013-090	married	2022-08-06	\N	\N	84729697-97859772-70479591	Szeged - Belváros rekonstrukció	1121	Magyarország	Budapest	Budapest	Mikszáth Kálmán tér	13	ABC Kereskedelmi Kft.	barta.boglarka241@abc-kft.hu	+36 50 489 8648	02137110-1f01-4ea8-9652-cb3057178ec0	\N
7bf8fe72-9963-42e9-86bd-ed19e241acf4	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0241	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Kőműves	2022-06-08	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Patrik	Németh	male	1973-02-20	Miskolc	Budai Judit	5024794851	\N	693-440-921	single	2022-06-08	2027-09-11	\N	65351102-42525226-10889814	Szeged - Belváros rekonstrukció	6726	Magyarország	Csongrád-Csanád	Szeged	Mikszáth Kálmán tér	98	ABC Kereskedelmi Kft.	nemeth.patrik242@abc-kft.hu	+36 50 917 6558	\N	\N
ca7b0190-4f9e-4d2a-882e-081ecc247970	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0242	c5d51752-dff2-4728-a944-c3692937106f	Burkoló	2021-10-24	2025-03-20	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Dominik	Kelemen	male	1984-10-04	Érd	Szabó Boglárka	4601364001	\N	103-203-753	married	2021-10-24	\N	\N	\N	Győr - Északi Ipari Park	2500	Magyarország	Komárom-Esztergom	Esztergom	Bocskai utca	16	ABC Kereskedelmi Kft.	kelemen.dominik243@abc-kft.hu	+36 50 638 3618	\N	\N
930f99de-9dff-4457-9d9a-8880b99b8fb9	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0243	f2254bf6-b3ef-48f6-b5ee-a8f9ac2d9fed	Adminisztrátor	2025-02-02	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Ernő	Varga	male	1973-06-19	Kaposvár	Virág Beáta	\N	\N	759-451-813	married	2025-02-02	\N	\N	28040407-11519597-98879531	Debrecen - Ipari Park	8200	Magyarország	Veszprém	Veszprém	Templom utca	18	ABC Kereskedelmi Kft.	varga.erno244@abc-kft.hu	+36 31 293 1683	\N	\N
5dcfae22-37ba-45e8-a731-fc18d37941b3	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0244	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Adminisztrátor	2024-03-19	\N	Túlóra vállalására hajlandó.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Roland	Sipos	male	1961-10-19	Szolnok	Molnár Viktória	\N	\N	595-819-131	single	2024-03-19	\N	\N	\N	Budapest - Dél-Buda fejlesztés	4400	Magyarország	Szabolcs-Szatmár-Bereg	Nyíregyháza	Móricz Zsigmond körtér	87/C	ABC Kereskedelmi Kft.	sipos.roland245@abc-kft.hu	+36 20 590 1085	94eda3e8-6e8f-45df-a5f2-9690f2c19ccf	\N
f8744989-cdd8-4c11-a6a7-f7834e892486	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0245	c5d51752-dff2-4728-a944-c3692937106f	Segédmunkás	2023-11-16	2024-03-28	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Petra	Lakatos	female	1994-11-02	Pécs	Németh Lilla	8774996350	\N	237-481-050	single	2023-11-16	\N	\N	\N	Budapest - Újpest raktártelep	3527	Magyarország	Borsod-Abaúj-Zemplén	Miskolc	Munkácsy Mihály utca	77	ABC Kereskedelmi Kft.	lakatos.petra246@abc-kft.hu	+36 70 986 4882	\N	\N
7d8985fc-e30c-4b47-8416-470a316f1fb2	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0246	c5d51752-dff2-4728-a944-c3692937106f	Festő	2021-08-06	2026-04-14	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Mónika	Illés	female	1966-12-14	Szolnok	Varga Andrea	4838516850	\N	867-666-998	divorced	2021-08-06	2026-01-29	\N	71351368-59393454-79470017	Szeged - Belváros rekonstrukció	2501	Magyarország	Komárom-Esztergom	Esztergom	Bartók Béla út	68	ABC Kereskedelmi Kft.	illes.monika247@abc-kft.hu	+36 70 827 1110	\N	\N
082c6991-9095-4887-8cb8-762d06c71a18	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0247	80b828b8-e846-455b-b9ac-36a60a30d6d3	Szigetelő	2021-08-03	\N	Előző munkahelyről jó referenciával érkezett.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Richárd	Katona	male	1991-06-08	Békéscsaba	Molnár Bianka	\N	\N	846-343-112	married	2021-08-03	\N	\N	58794056-93761357-62342063	Kecskemét - Gyárvárosi építkezés	9023	Magyarország	Győr-Moson-Sopron	Győr	Ady Endre utca	19	ABC Kereskedelmi Kft.	katona.richard248@abc-kft.hu	+36 70 748 5905	\N	\N
90b964a2-8469-42ba-95f7-1d177c982aef	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0248	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Biztonsági őr	2021-09-25	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Krisztina	Király	female	1995-11-08	Veszprém	Lakatos Julianna	9969373425	\N	542-534-553	single	2021-09-25	\N	\N	39849665-32750769-56432992	Székesfehérvár - Gyáripari terület	2700	Magyarország	Pest	Cegléd	Fő utca	33	ABC Kereskedelmi Kft.	kiraly.krisztina249@abc-kft.hu	+36 70 873 7059	02137110-1f01-4ea8-9652-cb3057178ec0	\N
43aaa5c5-4d13-46b6-8b44-a17d07fc9bac	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0249	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Irodai asszisztens	2021-07-29	\N	OKJ végzettséggel rendelkezik.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Petra	Katona	female	1987-11-18	Érd	Simon Réka	9842808687	HC5288776	949-949-373	single	2021-07-29	\N	\N	58213944-49773034-70508611	Székesfehérvár - Gyáripari terület	1191	Magyarország	Budapest	Budapest	Zrínyi utca	1/C	ABC Kereskedelmi Kft.	katona.petra250@abc-kft.hu	+36 31 820 6863	94eda3e8-6e8f-45df-a5f2-9690f2c19ccf	\N
55da4fc5-c777-4bb0-871c-e046c430eb9e	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0250	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Biztonsági őr	2025-10-14	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Milán	Budai	male	1994-05-09	Székesfehérvár	Orosz Viktória	7320553161	SM5376396	323-338-124	single	2025-10-14	2027-08-05	\N	71608813-62143435-55647439	Budapest - Dél-Buda fejlesztés	2100	Magyarország	Pest	Gödöllő	Rákóczi út	27	ABC Kereskedelmi Kft.	budai.milan251@abc-kft.hu	+36 50 352 3551	acac124f-7479-48fa-a1ac-b7d62b6489fc	\N
68859930-aeac-4b7b-bf5e-3bb07fff8578	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0251	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Sofőr	2025-09-05	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	László	Oláh	male	2005-12-16	Gödöllő	Deák Barbara	5287168743	ZQ8000559	914-323-649	single	2025-09-05	\N	\N	96007782-94662182-34184311	Győr - Északi Ipari Park	6001	Magyarország	Bács-Kiskun	Kecskemét	Bocskai utca	83	ABC Kereskedelmi Kft.	olah.laszlo252@abc-kft.hu	+36 50 126 2279	02137110-1f01-4ea8-9652-cb3057178ec0	\N
94c2a346-e49c-44d1-bf48-6f3a174978e7	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0252	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Irodai asszisztens	2024-01-04	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Attila	Sándor	male	1966-07-10	Pécs	Balogh Anna	6673496518	PI8622714	477-059-371	married	2024-01-04	2027-03-07	\N	38550280-16886229-17982697	Székesfehérvár - Gyáripari terület	8901	Magyarország	Zala	Zalaegerszeg	Hunyadi utca	82	ABC Kereskedelmi Kft.	sandor.attila253@abc-kft.hu	+36 31 426 3578	2779c0ef-9d97-470f-839c-f818469d43d6	\N
1b6c5473-ef31-4a18-8e69-174054c82310	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0253	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Irodai asszisztens	2025-11-08	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Levente	Virág	male	1999-01-31	Érd	Fekete Erika	9373956658	\N	661-502-373	married	2025-11-08	\N	\N	98872020-28644096-36173001	Debrecen - Ipari Park	8200	Magyarország	Veszprém	Veszprém	Fő utca	62	ABC Kereskedelmi Kft.	virag.levente254@abc-kft.hu	+36 20 927 5188	94eda3e8-6e8f-45df-a5f2-9690f2c19ccf	\N
b4dbb5f9-ff8a-4873-9547-70ed967fb669	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0254	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Villanyszerelő	2025-07-05	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Ferenc	Horváth	male	1991-08-05	Dunaújváros	Vincze Tímea	2557629048	TU3794714	\N	divorced	2025-07-05	\N	\N	87994294-92942840-44388787	Szeged - Belváros rekonstrukció	8200	Magyarország	Veszprém	Veszprém	Batthyány utca	40/C	ABC Kereskedelmi Kft.	horvath.ferenc255@abc-kft.hu	+36 20 266 4368	02137110-1f01-4ea8-9652-cb3057178ec0	\N
cc44634f-4b59-4de6-b8a6-2c0fa6d5bbed	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0255	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Daruzó	2025-04-14	\N	Próbaidős időszak alatt.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Károly	Balogh	male	1971-03-26	Szeged	Nagy Fanni	6447996069	\N	146-698-591	married	2025-04-14	\N	\N	92198050-17798990-37181309	Kecskemét - Gyárvárosi építkezés	7625	Magyarország	Baranya	Pécs	Ady Endre utca	83	ABC Kereskedelmi Kft.	balogh.karoly256@abc-kft.hu	+36 70 209 6878	acac124f-7479-48fa-a1ac-b7d62b6489fc	\N
1c642646-ed02-4d86-849b-5370fe13c3f4	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0256	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Karbantartó	2022-10-08	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Márk	Mészáros	male	1978-03-04	Miskolc	Fehér Andrea	8717214201	\N	244-629-789	married	2022-10-08	2028-07-26	\N	60706157-53644292-59509087	Budapest - Váci út irodaház	9027	Magyarország	Győr-Moson-Sopron	Győr	Liszt Ferenc tér	44	ABC Kereskedelmi Kft.	meszaros.mark257@abc-kft.hu	+36 31 585 5530	94eda3e8-6e8f-45df-a5f2-9690f2c19ccf	\N
dd4e9a10-9ae6-40c3-a0ff-c47302db400c	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0257	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Karbantartó	2023-08-10	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	György	Fekete	male	1969-12-04	Szeged	Nemes Dóra	3823399588	CL3016723	924-800-954	divorced	2023-08-10	\N	\N	42754370-40266676-66409491	Debrecen - Ipari Park	5008	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Jókai Mór utca	90	ABC Kereskedelmi Kft.	fekete.gyorgy258@abc-kft.hu	+36 31 546 3345	b4888603-1870-4196-ad56-4c55471e98d7	\N
0496823f-296f-4929-b3fc-18189e344711	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0258	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Gépkezelő	2023-12-21	\N	Első munkahelyes, szakmai gyakorlat keretében.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Zoltán	Farkas	male	2001-12-09	Nyíregyháza	Juhász Fanni	1281618946	\N	328-529-209	divorced	2023-12-21	\N	\N	30912674-18101123-28223176	Székesfehérvár - Gyáripari terület	6800	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Ady Endre utca	95	ABC Kereskedelmi Kft.	farkas.zoltan259@abc-kft.hu	+36 30 958 5392	13ad850c-f7c6-4b1c-8119-b2a785a56673	\N
102f5d1d-dfe0-4e08-95a2-388185b2f218	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0259	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Segédmunkás	2022-09-26	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Fanni	Deák	female	1973-04-21	Pécs	Sándor Nóra	3473651542	\N	694-073-954	married	2022-09-26	\N	\N	\N	Szeged - Belváros rekonstrukció	5601	Magyarország	Békés	Békéscsaba	Kazinczy utca	84	ABC Kereskedelmi Kft.	deak.fanni260@abc-kft.hu	+36 70 429 1307	2779c0ef-9d97-470f-839c-f818469d43d6	\N
c9fdee3c-0a8e-487b-bd27-5564a0cc0331	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0260	f2254bf6-b3ef-48f6-b5ee-a8f9ac2d9fed	Burkoló	2025-03-02	\N	Külföldi munkavállalási engedéllyel rendelkezik.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Tamás	Török	male	1995-12-25	Budapest	László Andrea	1657325865	\N	\N	single	2025-03-02	\N	\N	33052407-30647793-91172534	Győr - Északi Ipari Park	8201	Magyarország	Veszprém	Veszprém	Kazinczy utca	46/C	ABC Kereskedelmi Kft.	torok.tamas261@abc-kft.hu	+36 70 320 4810	\N	\N
8b00d866-afcf-45a9-a5e4-5c3929938706	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0261	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Festő	2021-07-15	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	György	Kocsis	male	1974-04-04	Debrecen	Nagy Dóra	3571811376	\N	835-311-029	married	2021-07-15	\N	\N	44071695-21140789-26487949	Győr - Északi Ipari Park	8001	Magyarország	Fejér	Székesfehérvár	Hunyadi utca	118	ABC Kereskedelmi Kft.	kocsis.gyorgy262@abc-kft.hu	+36 70 602 1484	b4888603-1870-4196-ad56-4c55471e98d7	\N
e69a7dce-f312-4d5d-b61c-f3acf616efdd	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0262	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Zsaluzó	2023-01-02	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Emese	Farkas	female	1998-09-11	Dunaújváros	Fazekas Emese	1818302678	\N	403-440-211	single	2023-01-02	\N	\N	88826277-86831656-24704997	Kecskemét - Gyárvárosi építkezés	8901	Magyarország	Zala	Zalaegerszeg	Dózsa György út	100/A	ABC Kereskedelmi Kft.	farkas.emese263@abc-kft.hu	+36 31 809 6446	0d08cbc6-b692-4e7c-b269-f47eb41d996a	\N
a6f08662-4682-46de-a619-8cc1e026fa71	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0263	80b828b8-e846-455b-b9ac-36a60a30d6d3	Hegesztő	2022-11-11	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Veronika	Máté	female	1973-01-15	Szombathely	Szűcs Dorina	\N	\N	909-253-111	married	2022-11-11	2027-05-29	\N	12045088-32226000-79115290	Kecskemét - Gyárvárosi építkezés	9028	Magyarország	Győr-Moson-Sopron	Győr	Petőfi Sándor utca	46	ABC Kereskedelmi Kft.	mate.veronika264@abc-kft.hu	+36 30 559 2020	2779c0ef-9d97-470f-839c-f818469d43d6	\N
0146108f-0189-4537-b890-474cdd40c8e5	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0264	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Raktáros	2021-05-25	\N	B kategóriás jogosítvánnyal rendelkezik.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Szabolcs	Fazekas	male	1970-09-17	Budapest	Gulyás Boglárka	3463282695	AX4372796	088-872-274	married	2021-05-25	2026-04-13	\N	30656297-37874570-28554419	Budapest - Csepel ipari park	7401	Magyarország	Somogy	Kaposvár	Mikszáth Kálmán tér	31/B	ABC Kereskedelmi Kft.	fazekas.szabolcs265@abc-kft.hu	+36 30 790 6461	\N	\N
529d2706-662b-4995-bb78-d89cdb8febc0	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0265	80b828b8-e846-455b-b9ac-36a60a30d6d3	Műszaki ellenőr	2022-04-28	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Klára	Gulyás	female	1971-08-26	Kaposvár	Nemes Anikó	\N	GY7924625	604-035-304	married	2022-04-28	\N	\N	\N	Budapest - Angyalföld építkezés	7400	Magyarország	Somogy	Kaposvár	Bocskai utca	118/B	ABC Kereskedelmi Kft.	gulyas.klara266@abc-kft.hu	+36 20 651 3232	0d08cbc6-b692-4e7c-b269-f47eb41d996a	\N
4703a44d-20ee-414f-82a9-07bb4da16ef0	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0266	c5d51752-dff2-4728-a944-c3692937106f	Daruzó	2025-08-25	2026-01-02	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Botond	Tóth	male	1982-04-27	Tatabánya	Katona Zsófia	8423774258	\N	649-336-424	single	2025-08-25	\N	\N	63504864-26526201-38737948	Budapest - Dél-Buda fejlesztés	7401	Magyarország	Somogy	Kaposvár	Bem József utca	82/C	ABC Kereskedelmi Kft.	toth.botond267@abc-kft.hu	+36 30 483 2012	\N	\N
35b83e88-0b6b-4c20-a88f-0dae6750f188	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0267	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Projektkoordinátor	2023-11-08	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Pál	Farkas	male	1968-03-01	Békéscsaba	Fehér Fanni	6055044352	\N	526-610-565	married	2023-11-08	\N	\N	59795288-33704725-82864525	Szeged - Belváros rekonstrukció	8900	Magyarország	Zala	Zalaegerszeg	Móricz Zsigmond körtér	104	ABC Kereskedelmi Kft.	farkas.pal268@abc-kft.hu	+36 50 951 3496	\N	\N
05ffbaf1-4cf4-4d66-bf0a-35baf0615eb1	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0268	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Raktáros	2022-01-15	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	László	Fülöp	male	1999-04-24	Veszprém	Szabó Klára	6157351049	\N	386-262-009	single	2022-01-15	2027-03-14	\N	68152458-16966270-68422594	Budapest - Újpest raktártelep	5002	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Tompa Mihály utca	90	ABC Kereskedelmi Kft.	fulop.laszlo269@abc-kft.hu	+36 31 370 5361	02137110-1f01-4ea8-9652-cb3057178ec0	\N
e201c11c-ff8d-4560-a78d-ed2049e88e4e	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0269	c5d51752-dff2-4728-a944-c3692937106f	Minőségellenőr	2026-04-22	2026-05-30	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Pál	Deák	male	1971-11-27	Érd	Bogdán Ilona	\N	\N	595-857-806	single	2026-04-22	\N	\N	60582915-54520224-21684537	Székesfehérvár - Gyáripari terület	2600	Magyarország	Pest	Vác	Bartók Béla út	5	ABC Kereskedelmi Kft.	deak.pal270@abc-kft.hu	+36 20 120 2741	\N	\N
9982cb19-7000-4a06-b0cb-b673fb493293	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0270	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Targoncavezető	2025-11-05	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Bernadett	Vincze	female	1999-04-04	Szombathely	Pál Petra	9215030972	\N	936-268-544	married	2025-11-05	\N	\N	45752957-46666549-29190650	Kecskemét - Gyárvárosi építkezés	6001	Magyarország	Bács-Kiskun	Kecskemét	Deák Ferenc utca	46	ABC Kereskedelmi Kft.	vincze.bernadett271@abc-kft.hu	+36 70 467 8572	\N	\N
85dc27b7-9f31-4309-b6b4-b1a5502cf07e	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0271	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Ács	2026-09-03	\N	Csapatvezetői potenciállal rendelkezik.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Patrik	Magyar	male	1975-06-03	Esztergom	Juhász Réka	1567763747	\N	602-326-246	widowed	2026-09-03	\N	\N	91304321-89640324-26609913	Budapest - Angyalföld építkezés	4433	Magyarország	Szabolcs-Szatmár-Bereg	Nyíregyháza	Liszt Ferenc tér	117/A	ABC Kereskedelmi Kft.	magyar.patrik272@abc-kft.hu	+36 70 663 2193	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
eca12909-c66f-4d99-80dd-0f628baf8cdb	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0272	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Gépkezelő	2021-09-23	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Klára	Rácz	female	1999-01-22	Pécs	Balog Dorina	\N	\N	753-352-011	single	2021-09-23	\N	\N	69519361-89205667-41908138	Budapest - Újpest raktártelep	9401	Magyarország	Győr-Moson-Sopron	Sopron	Móricz Zsigmond körtér	150	ABC Kereskedelmi Kft.	racz.klara273@abc-kft.hu	+36 30 342 5568	2779c0ef-9d97-470f-839c-f818469d43d6	\N
b66a7bb5-3c68-4ba1-914b-0d2712023b67	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0273	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Szigetelő	2024-05-14	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Zsolt	Gulyás	male	2002-12-01	Budapest	Deák Fanni	3214569907	\N	019-784-562	married	2024-05-14	\N	\N	18318971-81496403-70242719	Budapest - Budaörs logisztikai központ	2500	Magyarország	Komárom-Esztergom	Esztergom	Petőfi Sándor utca	45/A	ABC Kereskedelmi Kft.	gulyas.zsolt274@abc-kft.hu	+36 70 310 1203	\N	\N
d4d73587-98ec-4be5-81ee-06da2416e9f5	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0274	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Vasbetonszerelő	2022-11-16	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Patrik	Rácz	male	1976-09-17	Gödöllő	Kocsis Lili	8021472162	\N	\N	married	2022-11-16	\N	\N	89012246-79176274-65068516	Budapest - Angyalföld építkezés	6000	Magyarország	Bács-Kiskun	Kecskemét	Mikszáth Kálmán tér	56	ABC Kereskedelmi Kft.	racz.patrik275@abc-kft.hu	+36 31 817 6515	\N	\N
f0d86565-36b5-4ba8-9450-c85a28005940	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0275	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Szállítómunkás	2026-07-21	\N	B kategóriás jogosítvánnyal rendelkezik.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Tímea	Deák	female	2003-11-11	Debrecen	Máté Hajnalka	6191112611	\N	954-948-453	single	2026-07-21	2026-04-29	\N	12101995-46071548-83312579	Budapest - Váci út irodaház	9700	Magyarország	Vas	Szombathely	Kossuth Lajos utca	21/B	ABC Kereskedelmi Kft.	deak.timea276@abc-kft.hu	+36 31 679 1435	35af414c-1808-4056-8fcf-0bdfd33b9862	\N
ad02869a-e810-497a-a08e-2c2528685c52	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0276	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Vasbetonszerelő	2023-08-14	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Vivien	Kelemen	female	1989-09-24	Dunaújváros	Balogh Fanni	6097636561	\N	985-414-468	single	2023-08-14	\N	\N	36215985-46587983-77837055	Budapest - Váci út irodaház	2600	Magyarország	Pest	Vác	Munkácsy Mihály utca	4	ABC Kereskedelmi Kft.	kelemen.vivien277@abc-kft.hu	+36 30 268 9312	acfc75f8-6ffd-4fc4-aaf4-e51409068b30	\N
73aa9f6d-3a54-4d74-b043-5b638db4f597	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0277	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Adminisztrátor	2025-04-06	\N	Túlóra vállalására hajlandó.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Hajnalka	Katona	female	1996-08-20	Békéscsaba	Hegedűs Zoé	2450851106	\N	918-036-992	married	2025-04-06	2026-01-07	\N	62717043-13634390-55350587	Budapest - Csepel ipari park	3525	Magyarország	Borsod-Abaúj-Zemplén	Miskolc	Széchenyi István tér	71	ABC Kereskedelmi Kft.	katona.hajnalka278@abc-kft.hu	+36 70 801 7140	7c65ce89-c2e7-4a79-8cac-311051629c78	\N
d825197a-b93b-4c66-be98-89a081d02643	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0278	f2254bf6-b3ef-48f6-b5ee-a8f9ac2d9fed	Sofőr	2021-07-23	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Sándor	Magyar	male	1963-04-22	Gödöllő	Szilágyi Zoé	\N	\N	027-413-791	single	2021-07-23	\N	\N	\N	Budapest - Csepel ipari park	2030	Magyarország	Pest	Érd	Arany János utca	123	ABC Kereskedelmi Kft.	magyar.sandor279@abc-kft.hu	+36 20 758 3335	\N	\N
5e504404-4751-45be-b77c-387fb83bb6ab	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0279	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Műszaki ellenőr	2024-08-26	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Luca	Papp	female	1992-03-04	Nyíregyháza	Antal Sára	1169176672	VF1731337	096-861-884	divorced	2024-08-26	\N	\N	33326457-59999096-18021037	Miskolc - Diósgyőri felújítás	7400	Magyarország	Somogy	Kaposvár	Rákóczi út	63	ABC Kereskedelmi Kft.	papp.luca280@abc-kft.hu	+36 20 656 3674	35af414c-1808-4056-8fcf-0bdfd33b9862	\N
1fc2e9b9-d089-4adc-93c8-f756f5c0915d	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0280	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Állványozó	2021-02-01	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Noémi	Fekete	female	1987-01-20	Budapest	Kocsis Beáta	1186975646	\N	664-626-762	married	2021-02-01	\N	\N	47449147-81663046-20490642	Budapest - Csepel ipari park	4432	Magyarország	Szabolcs-Szatmár-Bereg	Nyíregyháza	Liszt Ferenc tér	106/B	ABC Kereskedelmi Kft.	fekete.noemi281@abc-kft.hu	+36 31 238 4914	7c65ce89-c2e7-4a79-8cac-311051629c78	\N
69f1ceaf-62e1-453e-869d-7103ac5a98dd	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0281	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Raktáros	2023-03-29	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Flóra	Orsós	female	1975-10-17	Esztergom	Budai Ilona	5897306309	\N	\N	married	2023-03-29	2027-04-25	\N	76718843-34782434-94043115	Miskolc - Diósgyőri felújítás	7401	Magyarország	Somogy	Kaposvár	Szent István tér	129	ABC Kereskedelmi Kft.	orsos.flora282@abc-kft.hu	+36 70 239 8888	35af414c-1808-4056-8fcf-0bdfd33b9862	\N
42197de7-cd53-4fa0-ab20-f25562a84da9	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0282	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Raktáros	2024-08-02	\N	OKJ végzettséggel rendelkezik.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Gyula	Barta	male	1999-02-18	Szombathely	Király Margit	2738687865	\N	950-949-581	married	2024-08-02	2028-05-23	\N	\N	Budapest - Budaörs logisztikai központ	9700	Magyarország	Vas	Szombathely	Liszt Ferenc tér	86	ABC Kereskedelmi Kft.	barta.gyula283@abc-kft.hu	+36 30 741 6913	acfc75f8-6ffd-4fc4-aaf4-e51409068b30	\N
62980559-9608-4793-8917-f81435072c5a	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0283	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Munkavédelmi felelős	2023-07-25	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Zsófia	Juhász	female	1977-04-21	Érd	Fodor Edina	6270752543	\N	145-572-852	single	2023-07-25	\N	\N	65696358-77898276-36651652	Szeged - Belváros rekonstrukció	6801	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Liszt Ferenc tér	100	ABC Kereskedelmi Kft.	juhasz.zsofia284@abc-kft.hu	+36 31 777 5277	35af414c-1808-4056-8fcf-0bdfd33b9862	\N
8a1d70ed-4a1d-49eb-be1a-d24db54b0b6e	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0284	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Karbantartó	2025-12-16	\N	Első munkahelyes, szakmai gyakorlat keretében.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Nikolett	Rácz	female	1984-07-13	Kaposvár	Veres Zsuzsanna	4835384176	SM6122484	375-279-447	single	2025-12-16	\N	\N	\N	Debrecen - Ipari Park	2400	Magyarország	Fejér	Dunaújváros	Kossuth Lajos utca	102	ABC Kereskedelmi Kft.	racz.nikolett285@abc-kft.hu	+36 70 778 1362	7c65ce89-c2e7-4a79-8cac-311051629c78	\N
22a6af36-c80e-4640-b059-7864916d9928	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0285	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Könyvelő	2022-05-07	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Sándor	Szabó	male	1984-11-20	Vác	Fodor Anikó	\N	PG2855436	\N	single	2022-05-07	\N	\N	21321393-44794611-79954495	Debrecen - Ipari Park	6001	Magyarország	Bács-Kiskun	Kecskemét	Táncsics Mihály utca	89/B	ABC Kereskedelmi Kft.	szabo.sandor286@abc-kft.hu	+36 20 947 9694	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
cd929775-a3a9-4b5c-abf6-4f4cf5ad84c4	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0286	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Szállítómunkás	2021-04-30	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Ernő	Barta	male	1961-03-13	Békéscsaba	Antal Eszter	6801112695	\N	066-121-930	married	2021-04-30	\N	\N	55315383-51634435-91906875	Budapest - Angyalföld építkezés	5000	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Széchenyi István tér	109	ABC Kereskedelmi Kft.	barta.erno287@abc-kft.hu	+36 70 145 3107	acac124f-7479-48fa-a1ac-b7d62b6489fc	\N
78c2a60b-add4-4de4-abfc-d1ff1975e016	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0287	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Tűzvédelmi felelős	2025-07-23	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Zsuzsanna	Fodor	female	1974-05-18	Debrecen	Molnár Diána	4791064648	\N	433-100-568	single	2025-07-23	\N	\N	\N	Székesfehérvár - Gyáripari terület	2700	Magyarország	Pest	Cegléd	Bocskai utca	14	ABC Kereskedelmi Kft.	fodor.zsuzsanna288@abc-kft.hu	+36 20 487 6227	\N	\N
a840df84-6048-43e6-9a2d-8fec253975e6	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0288	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Műszaki ellenőr	2024-05-02	\N	Részmunkaidős foglalkoztatás.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Zoé	Katona	female	1996-04-07	Győr	László Mária	9902340795	\N	633-679-428	single	2024-05-02	\N	\N	13913160-35190742-54160213	Győr - Északi Ipari Park	2600	Magyarország	Pest	Vác	Kazinczy utca	102	ABC Kereskedelmi Kft.	katona.zoe289@abc-kft.hu	+36 31 576 2404	13ad850c-f7c6-4b1c-8119-b2a785a56673	\N
3a6a26df-786c-49fa-8f45-18b6a6682b9d	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0289	c5d51752-dff2-4728-a944-c3692937106f	HR asszisztens	2023-04-11	2026-02-24	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Katalin	Szalai	female	1973-10-28	Miskolc	Tóth Csilla	1444924690	\N	228-150-985	married	2023-04-11	2026-04-14	\N	\N	Budapest - Újpest raktártelep	9024	Magyarország	Győr-Moson-Sopron	Győr	Bartók Béla út	103	ABC Kereskedelmi Kft.	szalai.katalin290@abc-kft.hu	+36 50 912 3122	\N	\N
621017be-28ae-4144-8c16-8fdc75cd02e2	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0290	80b828b8-e846-455b-b9ac-36a60a30d6d3	Karbantartó	2024-11-23	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Mihály	Balogh	male	1998-01-13	Hódmezővásárhely	Boros Hajnalka	8877105550	\N	110-451-504	single	2024-11-23	\N	\N	81144958-57050775-71441124	Budapest - Dél-Buda fejlesztés	3304	Magyarország	Heves	Eger	Tompa Mihály utca	108/C	ABC Kereskedelmi Kft.	balogh.mihaly291@abc-kft.hu	+36 30 194 3669	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
89eaa6b5-bcb2-42da-a368-86dc8a6b6a4b	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0291	f2254bf6-b3ef-48f6-b5ee-a8f9ac2d9fed	Gépkezelő	2026-04-02	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Zalán	Papp	male	1992-06-07	Szolnok	Antal Mária	5164383808	\N	644-602-326	single	2026-04-02	\N	\N	95090583-87461287-90755882	Győr - Északi Ipari Park	8005	Magyarország	Fejér	Székesfehérvár	Rákóczi út	19	ABC Kereskedelmi Kft.	papp.zalan292@abc-kft.hu	+36 70 686 6221	\N	\N
af24edc9-9e51-416c-81f0-d48b27696bca	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0292	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Vízvezeték-szerelő	2024-11-22	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Károly	Szabó	male	1979-02-03	Esztergom	Sipos Ilona	4978499399	JX5008359	746-873-720	single	2024-11-22	\N	\N	22790611-48446314-42397834	Győr - Északi Ipari Park	2801	Magyarország	Komárom-Esztergom	Tatabánya	Mátyás király utca	105	ABC Kereskedelmi Kft.	szabo.karoly293@abc-kft.hu	+36 20 760 8503	b4888603-1870-4196-ad56-4c55471e98d7	\N
815a0f38-f302-4c05-859a-7f95571f34d5	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0293	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Targoncavezető	2024-09-10	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Piroska	Kocsis	female	1994-05-28	Érd	Horváth Lilla	3098361289	ZQ3804679	429-394-199	divorced	2024-09-10	\N	\N	71474916-85418786-71985279	Miskolc - Diósgyőri felújítás	6031	Magyarország	Bács-Kiskun	Kecskemét	Bajcsy-Zsilinszky utca	140/B	ABC Kereskedelmi Kft.	kocsis.piroska294@abc-kft.hu	+36 50 353 6915	13ad850c-f7c6-4b1c-8119-b2a785a56673	\N
d3bfcd4c-7bf6-4c1c-b2c3-0e0500a4e691	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0294	f2254bf6-b3ef-48f6-b5ee-a8f9ac2d9fed	Karbantartó	2021-05-24	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Dóra	Orosz	female	1970-09-11	Eger	Nagy Anna	9897077922	MZ9748984	503-667-230	single	2021-05-24	2028-11-02	\N	24548033-14896083-42005636	Debrecen - Ipari Park	8001	Magyarország	Fejér	Székesfehérvár	Móricz Zsigmond körtér	44	ABC Kereskedelmi Kft.	orosz.dora295@abc-kft.hu	+36 30 611 5133	\N	\N
d2865824-5183-4741-94ce-5183d873f6ee	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0295	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Épületgépész	2025-05-22	\N	Első munkahelyes, szakmai gyakorlat keretében.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	eca0550a-f596-4937-bcd5-37b5bf867db7	Dániel	Mészáros	male	1977-04-26	Esztergom	Pál Noémi	5471554164	\N	575-314-963	married	2025-05-22	\N	\N	70393141-40268619-55954643	Budapest - Újpest raktártelep	2803	Magyarország	Komárom-Esztergom	Tatabánya	Jókai Mór utca	34	ABC Kereskedelmi Kft.	meszaros.daniel296@abc-kft.hu	+36 20 495 1398	2779c0ef-9d97-470f-839c-f818469d43d6	\N
45090752-2df6-4f8a-a885-1ef868a58ba7	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0296	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Takarító	2024-09-28	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Emese	Biró	female	1991-11-19	Szeged	Veres Zsófia	9178118491	JS8014788	\N	single	2024-09-28	\N	\N	\N	Budapest - Váci út irodaház	4433	Magyarország	Szabolcs-Szatmár-Bereg	Nyíregyháza	Bajcsy-Zsilinszky utca	21	ABC Kereskedelmi Kft.	biro.emese297@abc-kft.hu	+36 20 458 9346	0d08cbc6-b692-4e7c-b269-f47eb41d996a	\N
7e6100af-2777-42c9-8c42-97ea6ccace9a	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0297	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Könyvelő	2021-08-02	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Hajnalka	Fodor	female	2003-04-06	Szolnok	Kelemen Emese	7838173383	\N	449-806-629	divorced	2021-08-02	2028-07-20	\N	\N	Kecskemét - Gyárvárosi építkezés	7400	Magyarország	Somogy	Kaposvár	Zrínyi utca	86/B	ABC Kereskedelmi Kft.	fodor.hajnalka298@abc-kft.hu	+36 70 227 7050	acac124f-7479-48fa-a1ac-b7d62b6489fc	\N
6f97331b-cc25-45ef-b590-3444650d8a9c	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0298	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Hegesztő	2026-12-06	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Zoltán	Király	male	1972-09-28	Vác	Illés Anikó	\N	MY9999512	148-049-537	single	2026-12-06	\N	\N	17157828-60409938-87698555	Budapest - Dél-Buda fejlesztés	8200	Magyarország	Veszprém	Veszprém	Tompa Mihály utca	65/C	ABC Kereskedelmi Kft.	kiraly.zoltan299@abc-kft.hu	+36 31 328 5540	\N	\N
e0f0c349-4adc-4856-bf4e-fec2ca80064b	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0299	f2254bf6-b3ef-48f6-b5ee-a8f9ac2d9fed	Kőműves	2022-09-25	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Kornél	Juhász	male	2005-01-23	Békéscsaba	Kocsis Erika	0408125271	\N	520-294-481	married	2022-09-25	\N	\N	42508310-48372512-82668638	Debrecen - Ipari Park	8001	Magyarország	Fejér	Székesfehérvár	Bem József utca	92	ABC Kereskedelmi Kft.	juhasz.kornel300@abc-kft.hu	+36 20 761 1647	\N	\N
0c0d4111-89ce-4de3-ad38-40b93cd33b49	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0300	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Épületgépész	2021-11-05	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Dezső	Vincze	male	1971-07-05	Kecskemét	Hegedűs Klára	3636462108	BI8478952	772-828-310	single	2021-11-05	\N	\N	\N	Budapest - Dél-Buda fejlesztés	2400	Magyarország	Fejér	Dunaújváros	Dózsa György út	118	ABC Kereskedelmi Kft.	vincze.dezso301@abc-kft.hu	+36 31 391 2463	94eda3e8-6e8f-45df-a5f2-9690f2c19ccf	\N
331b21cd-8eef-443d-82d7-b057fd92ae35	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0301	c5d51752-dff2-4728-a944-c3692937106f	Tűzvédelmi felelős	2023-09-02	2026-10-30	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Béla	Takács	male	1986-01-10	Zalaegerszeg	Kocsis Szilvia	0166731419	\N	464-487-080	divorced	2023-09-02	\N	\N	45155632-32713409-66469088	Szeged - Belváros rekonstrukció	6721	Magyarország	Csongrád-Csanád	Szeged	Jókai Mór utca	103	ABC Kereskedelmi Kft.	takacs.bela302@abc-kft.hu	+36 50 754 5761	\N	\N
335ed044-aeaf-4a63-960d-6c3d42a5b898	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0302	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Gondnok	2021-12-12	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	ce612502-f8b9-4988-bb46-295d4f9cff6b	Tibor	Pál	male	1995-11-12	Cegléd	Kocsis Vivien	2383823466	LP1841986	306-090-361	single	2021-12-12	\N	\N	71433948-73338355-38191382	Kecskemét - Gyárvárosi építkezés	4032	Magyarország	Hajdú-Bihar	Debrecen	Kossuth Lajos utca	60/A	ABC Kereskedelmi Kft.	pal.tibor303@abc-kft.hu	+36 70 767 9020	35af414c-1808-4056-8fcf-0bdfd33b9862	\N
7f5281c3-256c-4bb1-9797-77cf6f65c4ed	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0303	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Épületgépész	2023-05-19	\N	Túlóra vállalására hajlandó.	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	\N	Róbert	Fodor	male	2001-06-27	Zalaegerszeg	Németh Beáta	\N	\N	737-305-504	single	2023-05-19	\N	\N	48912162-21652419-88802997	Budapest - Angyalföld építkezés	2401	Magyarország	Fejér	Dunaújváros	Ady Endre utca	116/A	ABC Kereskedelmi Kft.	fodor.robert304@abc-kft.hu	+36 31 207 5626	\N	\N
fe7545e0-0173-4ac4-9d8b-f33a974dac45	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0304	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Ács	2024-03-20	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Zoé	Balázs	female	2000-05-18	Esztergom	Rácz Gabriella	2620347616	EL2311159	859-055-149	single	2024-03-20	\N	\N	89341011-35528874-71871094	Budapest - Budaörs logisztikai központ	6801	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Petőfi Sándor utca	25	ABC Kereskedelmi Kft.	balazs.zoe305@abc-kft.hu	+36 30 553 8136	acac124f-7479-48fa-a1ac-b7d62b6489fc	\N
a6a3cbdb-9d02-4ff2-9196-80ff0dce55df	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0305	80b828b8-e846-455b-b9ac-36a60a30d6d3	Vízvezeték-szerelő	2026-09-16	\N	\N	2026-02-23 20:03:59.683673	2026-02-23 20:03:59.683673	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Veronika	Orosz	female	1985-08-16	Eger	Fodor Mária	7439768334	\N	165-560-311	single	2026-09-16	\N	\N	26615289-35736969-33673189	Miskolc - Diósgyőri felújítás	6800	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Móricz Zsigmond körtér	4	ABC Kereskedelmi Kft.	orosz.veronika306@abc-kft.hu	+36 70 184 9881	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
cbbdd738-b22b-4f4b-ada8-f2654af6ea89	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0306	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Kőműves	2025-11-27	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Bianka	Kiss	female	1963-07-27	Veszprém	Biró Orsolya	1472696105	WU9262583	\N	married	2025-11-27	2028-11-15	\N	88221007-61567916-32430846	Budapest - Váci út irodaház	6723	Magyarország	Csongrád-Csanád	Szeged	Arany János utca	88	ABC Kereskedelmi Kft.	kiss.bianka307@abc-kft.hu	+36 70 561 6376	b4888603-1870-4196-ad56-4c55471e98d7	\N
9c9fec67-66e8-4210-a6a8-89912ec6ce67	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0307	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Zsaluzó	2022-08-23	\N	Részmunkaidős foglalkoztatás.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Mónika	Balog	female	2000-10-04	Kaposvár	Deák Krisztina	7259226552	\N	283-246-710	divorced	2022-08-23	\N	\N	19274611-40860340-54561246	Budapest - Budaörs logisztikai központ	8201	Magyarország	Veszprém	Veszprém	Dózsa György út	17/A	ABC Kereskedelmi Kft.	balog.monika308@abc-kft.hu	+36 20 713 8213	\N	\N
7c095e33-6b74-44f2-bde0-18e8bf2120cb	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0308	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Tetőfedő	2024-01-14	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Bence	Kozma	male	1997-05-24	Székesfehérvár	Szabó Eszter	\N	\N	305-135-419	married	2024-01-14	\N	\N	77325175-33799622-81856799	Budapest - Csepel ipari park	7629	Magyarország	Baranya	Pécs	Petőfi Sándor utca	61/A	ABC Kereskedelmi Kft.	kozma.bence309@abc-kft.hu	+36 30 268 5187	b4888603-1870-4196-ad56-4c55471e98d7	\N
5ad2b2d5-6e34-42ad-b2b0-871fecf289af	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0309	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Hegesztő	2021-12-09	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Imre	Szalai	male	1979-07-08	Tatabánya	Sándor Luca	4126883390	MO1447760	259-356-275	divorced	2021-12-09	\N	\N	23470952-39329205-98769376	Miskolc - Diósgyőri felújítás	8201	Magyarország	Veszprém	Veszprém	Hunyadi utca	97/C	ABC Kereskedelmi Kft.	szalai.imre310@abc-kft.hu	+36 70 455 7179	\N	\N
543cc736-d53c-4d1a-8d31-829d2d93159c	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0310	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Projektkoordinátor	2024-10-16	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Ernő	Király	male	1992-02-07	Zalaegerszeg	Vincze Erzsébet	9924452442	PS2391773	\N	single	2024-10-16	2028-05-10	\N	\N	Debrecen - Ipari Park	8901	Magyarország	Zala	Zalaegerszeg	Ady Endre utca	57	ABC Kereskedelmi Kft.	kiraly.erno311@abc-kft.hu	+36 31 869 8015	7c65ce89-c2e7-4a79-8cac-311051629c78	\N
8aba5adf-3248-4d39-aeed-8a97988226a8	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0311	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Tetőfedő	2023-04-07	\N	Többéves iparági tapasztalat.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Kristóf	Kovács	male	1980-08-31	Szombathely	Szalai Eszter	6408280941	\N	\N	married	2023-04-07	\N	\N	27428766-33351948-23900294	Kecskemét - Gyárvárosi építkezés	9701	Magyarország	Vas	Szombathely	Táncsics Mihály utca	114	ABC Kereskedelmi Kft.	kovacs.kristof312@abc-kft.hu	+36 30 215 8300	7c65ce89-c2e7-4a79-8cac-311051629c78	\N
718464a7-545b-4817-99fe-d2ce0cb512f9	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0312	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Kőműves	2023-05-25	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Flóra	Hegedűs	female	1986-05-14	Győr	László Beáta	0748312895	DF7637080	345-008-059	married	2023-05-25	\N	\N	64891742-34023361-77057386	Budapest - Váci út irodaház	8002	Magyarország	Fejér	Székesfehérvár	Rákóczi út	71/A	ABC Kereskedelmi Kft.	hegedus.flora313@abc-kft.hu	+36 30 875 6663	0d08cbc6-b692-4e7c-b269-f47eb41d996a	\N
cef0be35-de69-43de-ad70-f57b73950e65	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0313	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Kőműves	2022-07-18	\N	C kategóriás jogosítvánnyal rendelkezik.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Kristóf	Juhász	male	1971-12-12	Kaposvár	Kovács Zoé	7478198327	\N	807-614-974	married	2022-07-18	\N	\N	42433704-93943807-86432071	Budapest - Budaörs logisztikai központ	2801	Magyarország	Komárom-Esztergom	Tatabánya	Kodály körönd	99/A	ABC Kereskedelmi Kft.	juhasz.kristof314@abc-kft.hu	+36 30 232 8005	0d08cbc6-b692-4e7c-b269-f47eb41d996a	\N
e70825ae-0b83-4eaf-ac29-66433efdbb89	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0314	80b828b8-e846-455b-b9ac-36a60a30d6d3	Daruzó	2023-08-02	\N	Havi bruttó bér: 455 000 Ft	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Dávid	Farkas	male	1970-01-06	Békéscsaba	Biró Erika	5209369173	\N	451-446-402	single	2023-08-02	\N	\N	62448011-60557465-96702523	Székesfehérvár - Gyáripari terület	6001	Magyarország	Bács-Kiskun	Kecskemét	Móricz Zsigmond körtér	48	ABC Kereskedelmi Kft.	farkas.david315@abc-kft.hu	+36 50 267 5540	35af414c-1808-4056-8fcf-0bdfd33b9862	\N
f38137a2-3af8-4329-ad8a-4c62b4c2311b	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0315	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Festő	2026-10-29	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Tamás	Oláh	male	1976-11-22	Érd	Biró Petra	9962338294	\N	368-948-836	single	2026-10-29	2026-04-18	\N	94844857-15781570-94146927	Budapest - Budaörs logisztikai központ	5000	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Batthyány utca	64/A	ABC Kereskedelmi Kft.	olah.tamas316@abc-kft.hu	+36 70 151 1448	\N	\N
c9b756ab-e644-4acf-8963-41ff68e038ce	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0316	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Építésvezető	2026-05-11	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Margit	Gál	female	1965-09-19	Budapest	Gál Erzsébet	1968304159	\N	901-782-612	widowed	2026-05-11	\N	\N	75427242-78234561-66497963	Budapest - Váci út irodaház	6000	Magyarország	Bács-Kiskun	Kecskemét	Zrínyi utca	61	ABC Kereskedelmi Kft.	gal.margit317@abc-kft.hu	+36 70 582 6843	\N	\N
63a70ab0-1a09-47d4-b28c-50f2785417fe	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0317	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Tűzvédelmi felelős	2021-03-24	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Katalin	Magyar	female	1997-06-24	Békéscsaba	Pál Bianka	8762655854	RZ5676793	\N	single	2021-03-24	2028-03-15	\N	\N	Budapest - Budaörs logisztikai központ	7401	Magyarország	Somogy	Kaposvár	Ady Endre utca	125/B	ABC Kereskedelmi Kft.	magyar.katalin318@abc-kft.hu	+36 20 461 7262	35af414c-1808-4056-8fcf-0bdfd33b9862	\N
a17a0e59-d963-4ab2-93bf-5ce6e9bc53b9	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0318	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Vasbetonszerelő	2025-03-04	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Miklós	Török	male	1987-08-15	Győr	Virág Katalin	8866568359	ON9066951	576-961-663	widowed	2025-03-04	2028-04-28	\N	83814613-16998842-12903671	Budapest - Újpest raktártelep	2500	Magyarország	Komárom-Esztergom	Esztergom	Ady Endre utca	145	ABC Kereskedelmi Kft.	torok.miklos319@abc-kft.hu	+36 70 687 6598	94eda3e8-6e8f-45df-a5f2-9690f2c19ccf	\N
bc880d39-5c06-47a1-9470-5140ca8bbee9	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0319	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Gépkezelő	2025-07-16	\N	Próbaidős időszak alatt.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Éva	Deák	female	1994-05-04	Eger	Papp Zsuzsanna	2308246217	\N	173-652-244	single	2025-07-16	\N	\N	26376301-41178961-62320369	Budapest - Csepel ipari park	9700	Magyarország	Vas	Szombathely	Liszt Ferenc tér	35/B	ABC Kereskedelmi Kft.	deak.eva320@abc-kft.hu	+36 20 309 9973	94eda3e8-6e8f-45df-a5f2-9690f2c19ccf	\N
73f8f209-72e4-4414-98e9-0a639ca7ba30	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0320	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Épületgépész	2023-10-01	\N	Többéves iparági tapasztalat.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	József	Lakatos	male	2005-01-21	Szombathely	Nemes Boglárka	5592957568	\N	774-552-503	single	2023-10-01	\N	\N	77066161-85426762-75173793	Budapest - Csepel ipari park	2700	Magyarország	Pest	Cegléd	Móricz Zsigmond körtér	31	ABC Kereskedelmi Kft.	lakatos.jozsef321@abc-kft.hu	+36 30 459 3018	d24a0a6b-de8f-4afc-8fc3-9ba31235ad91	\N
9c17b11d-8a11-46ab-b4ad-58d9247f7177	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0321	80b828b8-e846-455b-b9ac-36a60a30d6d3	Kőműves	2023-04-29	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Milán	Sándor	male	1990-09-22	Tatabánya	Pintér Viktória	6188191538	\N	699-122-924	married	2023-04-29	\N	\N	48862415-35357502-63291155	Budapest - Váci út irodaház	6801	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Móricz Zsigmond körtér	104	ABC Kereskedelmi Kft.	sandor.milan322@abc-kft.hu	+36 70 828 6014	d24a0a6b-de8f-4afc-8fc3-9ba31235ad91	\N
277a49cc-7932-4064-85ea-b425f0622615	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0322	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Szigetelő	2024-01-23	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	László	Kovács	male	1971-04-18	Székesfehérvár	Balog Judit	8781807227	UE5705749	119-594-082	married	2024-01-23	\N	\N	18545756-89584452-52521537	Székesfehérvár - Gyáripari terület	8901	Magyarország	Zala	Zalaegerszeg	Vörösmarty utca	92	ABC Kereskedelmi Kft.	kovacs.laszlo323@abc-kft.hu	+36 70 330 9763	02137110-1f01-4ea8-9652-cb3057178ec0	\N
406b669e-041d-46d5-bc03-ef5daf15feb7	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0323	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Könyvelő	2022-03-24	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Katalin	Gulyás	female	1969-07-05	Kecskemét	Szalai Mónika	9031304712	\N	521-144-862	married	2022-03-24	2028-02-05	\N	91745336-70488463-62203338	Székesfehérvár - Gyáripari terület	6801	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Bartók Béla út	70	ABC Kereskedelmi Kft.	gulyas.katalin324@abc-kft.hu	+36 20 399 1408	02137110-1f01-4ea8-9652-cb3057178ec0	\N
b3831693-d3eb-4e32-a15f-b12d82950b78	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0324	80b828b8-e846-455b-b9ac-36a60a30d6d3	Irodai asszisztens	2022-11-17	\N	Próbaidős időszak alatt.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Emese	Kelemen	female	1985-04-26	Zalaegerszeg	Hegedűs Anikó	1056184095	BZ7384941	836-387-299	married	2022-11-17	2026-11-18	\N	18985323-89722341-29649292	Budapest - Csepel ipari park	3529	Magyarország	Borsod-Abaúj-Zemplén	Miskolc	Szent István tér	22	ABC Kereskedelmi Kft.	kelemen.emese325@abc-kft.hu	+36 20 738 4051	13ad850c-f7c6-4b1c-8119-b2a785a56673	\N
8b9fb404-48f6-4299-9799-8fee6ea263d9	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0325	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Festő	2024-08-10	\N	Tapasztalt dolgozó, megbízható.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Botond	Virág	male	1991-04-13	Kaposvár	Vincze Csilla	1665520018	\N	678-469-962	married	2024-08-10	\N	\N	\N	Budapest - Váci út irodaház	4032	Magyarország	Hajdú-Bihar	Debrecen	Bethlen Gábor utca	68/C	ABC Kereskedelmi Kft.	virag.botond326@abc-kft.hu	+36 30 996 5788	13ad850c-f7c6-4b1c-8119-b2a785a56673	\N
c93d79a8-68ae-459c-9e59-40ebe1b734f4	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0326	c5d51752-dff2-4728-a944-c3692937106f	Burkoló	2021-12-29	2024-07-04	Első munkahelyes, szakmai gyakorlat keretében.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Csaba	Pál	male	1988-10-15	Zalaegerszeg	Gulyás Éva	4513093558	\N	435-207-733	single	2021-12-29	\N	\N	37683830-56106592-52353815	Szeged - Belváros rekonstrukció	3527	Magyarország	Borsod-Abaúj-Zemplén	Miskolc	Liszt Ferenc tér	84	ABC Kereskedelmi Kft.	pal.csaba327@abc-kft.hu	+36 30 740 8682	\N	\N
49c6550c-8d09-4919-b511-92bd3f68321f	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0327	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Állványozó	2022-07-26	\N	Havi bruttó bér: 673 000 Ft	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Barnabás	Lukács	male	1969-08-29	Debrecen	Király Szilvia	7296752112	KN3097757	354-117-247	single	2022-07-26	\N	\N	38412736-47542464-89001053	Budapest - Váci út irodaház	4032	Magyarország	Hajdú-Bihar	Debrecen	Bocskai utca	100/A	ABC Kereskedelmi Kft.	lukacs.barnabas328@abc-kft.hu	+36 30 318 5086	\N	\N
08026ff4-3fb1-4c21-9d31-a5b3e9157165	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0328	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Kőműves	2026-05-29	\N	Csapatvezetői potenciállal rendelkezik.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Fruzsina	Orsós	female	1985-03-02	Székesfehérvár	Barta Piroska	0695265119	GP2268860	362-328-006	divorced	2026-05-29	\N	\N	70053846-89145254-26488487	Debrecen - Ipari Park	2501	Magyarország	Komárom-Esztergom	Esztergom	Bocskai utca	127/B	ABC Kereskedelmi Kft.	orsos.fruzsina329@abc-kft.hu	+36 70 230 2660	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
285b8ad3-040f-44ce-b714-28b172a67d0d	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0329	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Burkoló	2022-03-28	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Miklós	Kocsis	male	2006-12-03	Budapest	Nagy Krisztina	7364189307	\N	211-120-903	single	2022-03-28	\N	\N	79420611-74808608-32259784	Budapest - Újpest raktártelep	2800	Magyarország	Komárom-Esztergom	Tatabánya	Széchenyi István tér	110	ABC Kereskedelmi Kft.	kocsis.miklos330@abc-kft.hu	+36 50 778 5512	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
6b4ad64f-0d4a-486a-9bff-8e1d100fb0e4	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0330	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Vízvezeték-szerelő	2026-07-12	\N	OKJ végzettséggel rendelkezik.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Klára	Biró	female	2005-04-07	Kecskemét	Kiss Gabriella	8676540802	JR7947607	\N	married	2026-07-12	\N	\N	14988280-57635657-40094941	Budapest - Budaörs logisztikai központ	8200	Magyarország	Veszprém	Veszprém	Ady Endre utca	144	ABC Kereskedelmi Kft.	biro.klara331@abc-kft.hu	+36 30 610 8231	\N	\N
2cd81fc1-1b56-44cf-ba81-58b559a733bb	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0331	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Rakodómunkás	2023-01-07	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Attila	Molnár	male	1967-07-02	Debrecen	Biró Barbara	5428403136	\N	966-606-569	divorced	2023-01-07	\N	\N	40804310-75870156-98459018	Budapest - Angyalföld építkezés	9701	Magyarország	Vas	Szombathely	Batthyány utca	78/C	ABC Kereskedelmi Kft.	molnar.attila332@abc-kft.hu	+36 50 481 8845	\N	\N
44fb4d28-b549-4312-9b56-7154d72541ed	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0332	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Szigetelő	2024-03-04	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Attila	Balázs	male	2004-12-28	Vác	Mészáros Piroska	6296164765	PF8092424	766-258-516	single	2024-03-04	\N	\N	74760779-62113660-26913013	Miskolc - Diósgyőri felújítás	6800	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Fő utca	65/A	ABC Kereskedelmi Kft.	balazs.attila333@abc-kft.hu	+36 30 242 9989	acac124f-7479-48fa-a1ac-b7d62b6489fc	\N
e86fed82-56ee-45aa-bc76-a5bea607168b	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0333	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Projektkoordinátor	2024-04-23	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Barnabás	Németh	male	1999-06-08	Szombathely	Papp Orsolya	\N	\N	928-910-155	single	2024-04-23	\N	\N	\N	Budapest - Váci út irodaház	4431	Magyarország	Szabolcs-Szatmár-Bereg	Nyíregyháza	Kodály körönd	62	ABC Kereskedelmi Kft.	nemeth.barnabas334@abc-kft.hu	+36 31 643 7991	acac124f-7479-48fa-a1ac-b7d62b6489fc	\N
99cee839-5891-46c4-a40d-fd6d4bf80f71	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0334	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Irodai asszisztens	2023-03-02	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Réka	Takács	female	1989-10-17	Szeged	Orosz Andrea	\N	\N	065-627-722	single	2023-03-02	\N	\N	55960979-42758394-79406955	Budapest - Váci út irodaház	5601	Magyarország	Békés	Békéscsaba	Móricz Zsigmond körtér	42/A	ABC Kereskedelmi Kft.	takacs.reka335@abc-kft.hu	+36 31 233 2308	2779c0ef-9d97-470f-839c-f818469d43d6	\N
eb319dac-0654-4093-afe7-dd955dfbf582	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0335	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Tűzvédelmi felelős	2022-08-15	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Ernő	Hegedűs	male	1979-09-19	Győr	Barta Judit	3168515117	MP5576441	395-798-991	married	2022-08-15	\N	\N	\N	Debrecen - Ipari Park	5000	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Szent István tér	78/C	ABC Kereskedelmi Kft.	hegedus.erno336@abc-kft.hu	+36 50 100 5553	2779c0ef-9d97-470f-839c-f818469d43d6	\N
9f38621c-d3ce-48cc-b8d2-cc3974eff740	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0336	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Műszaki ellenőr	2024-05-26	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Gergő	Antal	male	1986-06-14	Debrecen	Molnár Boglárka	9084985493	LR1527268	568-120-841	single	2024-05-26	\N	\N	71715968-80878820-73920525	Debrecen - Ipari Park	2500	Magyarország	Komárom-Esztergom	Esztergom	Kossuth Lajos utca	112	ABC Kereskedelmi Kft.	antal.gergo337@abc-kft.hu	+36 31 419 1755	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
e2415277-af0e-46f3-bbaa-28fef39d59ac	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0337	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Kőműves	2023-08-18	\N	Próbaidős időszak alatt.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Piroska	Németh	female	1983-11-20	Miskolc	Tóth Viktória	0040645124	\N	091-403-791	single	2023-08-18	\N	\N	\N	Debrecen - Ipari Park	6726	Magyarország	Csongrád-Csanád	Szeged	Rákóczi út	75/A	ABC Kereskedelmi Kft.	nemeth.piroska338@abc-kft.hu	+36 31 429 9465	\N	\N
b3bd28e1-afac-4a36-a06b-ce31dd1efbc5	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0338	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Segédmunkás	2022-12-09	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Balázs	Barta	male	1987-05-16	Veszprém	Lukács Krisztina	\N	\N	059-593-265	divorced	2022-12-09	\N	\N	88660158-10009009-93120436	Kecskemét - Gyárvárosi építkezés	2700	Magyarország	Pest	Cegléd	Damjanich utca	22	ABC Kereskedelmi Kft.	barta.balazs339@abc-kft.hu	+36 31 769 9088	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
05e77d0f-5fed-4c31-b541-e213090a45a7	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0339	80b828b8-e846-455b-b9ac-36a60a30d6d3	Adminisztrátor	2024-08-25	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Ferenc	Kelemen	male	1985-01-03	Dunaújváros	Szalai Andrea	0234815655	YY2414715	584-594-443	married	2024-08-25	\N	\N	81090585-24576010-84019304	Győr - Északi Ipari Park	5002	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Móricz Zsigmond körtér	22	ABC Kereskedelmi Kft.	kelemen.ferenc340@abc-kft.hu	+36 70 430 1116	acfc75f8-6ffd-4fc4-aaf4-e51409068b30	\N
f8879f0e-387a-4a12-b2f3-c396c320a2cc	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0340	c5d51752-dff2-4728-a944-c3692937106f	Zsaluzó	2023-01-01	2024-07-16	Új munkaerő, betanulás alatt.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Hunor	Simon	male	1974-10-24	Gödöllő	Fazekas Orsolya	\N	\N	247-885-896	married	2023-01-01	\N	\N	68938358-34606325-55087808	Budapest - Budaörs logisztikai központ	3528	Magyarország	Borsod-Abaúj-Zemplén	Miskolc	Hunyadi utca	47	ABC Kereskedelmi Kft.	simon.hunor341@abc-kft.hu	+36 70 362 3511	\N	\N
929a71cf-a851-4c96-8217-e34bf0cc39ac	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0341	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Projektkoordinátor	2021-06-24	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	György	Boros	male	1986-09-30	Cegléd	Barta Tímea	\N	KD8600200	\N	married	2021-06-24	\N	\N	35469196-34770871-62337543	Győr - Északi Ipari Park	6722	Magyarország	Csongrád-Csanád	Szeged	Liszt Ferenc tér	88/B	ABC Kereskedelmi Kft.	boros.gyorgy342@abc-kft.hu	+36 20 689 4720	\N	\N
cd78b2a2-b4c5-49bb-8792-c962fea69ab9	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0342	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Zsaluzó	2026-03-18	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Milán	Máté	male	1983-01-26	Szolnok	Veres Tímea	5937561937	XC8473740	696-351-486	divorced	2026-03-18	\N	\N	\N	Kecskemét - Gyárvárosi építkezés	5600	Magyarország	Békés	Békéscsaba	Arany János utca	90/A	ABC Kereskedelmi Kft.	mate.milan343@abc-kft.hu	+36 31 575 6536	\N	\N
60fe265d-c703-4fd6-81d3-bec738722c41	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0343	80b828b8-e846-455b-b9ac-36a60a30d6d3	Daruzó	2026-12-05	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Pál	Takács	male	1978-04-19	Sopron	Fekete Szilvia	7557812778	\N	\N	single	2026-12-05	\N	\N	20890288-52000526-51478228	Szeged - Belváros rekonstrukció	8900	Magyarország	Zala	Zalaegerszeg	Arany János utca	120	ABC Kereskedelmi Kft.	takacs.pal344@abc-kft.hu	+36 70 980 1943	\N	\N
a9133915-86b4-44de-b5d2-9990dbf4dacb	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0344	c5d51752-dff2-4728-a944-c3692937106f	Takarító	2023-08-20	2026-03-17	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Piroska	Vincze	female	1974-01-08	Dunaújváros	Virág Lili	\N	\N	839-484-956	single	2023-08-20	\N	\N	11713350-23799968-72589610	Budapest - Újpest raktártelep	9400	Magyarország	Győr-Moson-Sopron	Sopron	Rákóczi út	77	ABC Kereskedelmi Kft.	vincze.piroska345@abc-kft.hu	+36 30 622 2823	\N	\N
85a6804a-286d-4a0f-8f8f-bc407e674c4b	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0345	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Ács	2021-01-18	\N	Nyelvtudás: angol alapfok.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Imre	Oláh	male	1983-06-02	Pécs	Sipos Veronika	8798565145	\N	183-721-396	single	2021-01-18	\N	\N	\N	Budapest - Angyalföld építkezés	2501	Magyarország	Komárom-Esztergom	Esztergom	Hunyadi utca	61/C	ABC Kereskedelmi Kft.	olah.imre346@abc-kft.hu	+36 70 245 5209	\N	\N
72afe0d6-2224-414a-a9e6-3cbd30b2472d	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0346	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Irodai asszisztens	2022-01-20	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Zoé	Budai	female	2006-12-10	Zalaegerszeg	Nemes Erzsébet	5558509442	\N	530-349-666	married	2022-01-20	\N	\N	12117810-75267620-14639456	Budapest - Budaörs logisztikai központ	8001	Magyarország	Fejér	Székesfehérvár	Batthyány utca	49	ABC Kereskedelmi Kft.	budai.zoe347@abc-kft.hu	+36 70 234 1977	\N	\N
48773128-5391-4d06-95e4-f7ec7b92d886	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0347	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Projektkoordinátor	2024-10-08	\N	Előző munkahelyről jó referenciával érkezett.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Mónika	Jakab	female	2005-07-25	Zalaegerszeg	Orosz Anna	9835728819	\N	064-381-011	single	2024-10-08	\N	\N	\N	Budapest - Dél-Buda fejlesztés	7401	Magyarország	Somogy	Kaposvár	Bem József utca	74	ABC Kereskedelmi Kft.	jakab.monika348@abc-kft.hu	+36 31 157 6267	acfc75f8-6ffd-4fc4-aaf4-e51409068b30	\N
44530d15-088f-45f2-8fe6-2066645dc527	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0348	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	HR asszisztens	2022-02-14	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Miklós	Barta	male	1966-09-25	Eger	Kiss Zsófia	9755682498	\N	414-841-233	married	2022-02-14	\N	\N	\N	Győr - Északi Ipari Park	9700	Magyarország	Vas	Szombathely	Kazinczy utca	72	ABC Kereskedelmi Kft.	barta.miklos349@abc-kft.hu	+36 31 501 3531	\N	\N
478b88f0-128e-45ef-a74a-8cdaae7cdab2	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0349	80b828b8-e846-455b-b9ac-36a60a30d6d3	Tűzvédelmi felelős	2023-01-12	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Zsolt	Horváth	male	1976-07-27	Esztergom	Bogdán Éva	6016546472	TN4855256	897-875-714	married	2023-01-12	\N	\N	49119101-16621503-79036484	Szeged - Belváros rekonstrukció	9400	Magyarország	Győr-Moson-Sopron	Sopron	Széchenyi István tér	90	ABC Kereskedelmi Kft.	horvath.zsolt350@abc-kft.hu	+36 70 250 8749	0d08cbc6-b692-4e7c-b269-f47eb41d996a	\N
fda72593-ae7f-43d1-96f0-93d8c8011786	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0350	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Szállítómunkás	2022-08-02	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	László	Kis	male	1966-11-14	Dunaújváros	Fazekas Beáta	2398459813	ZT5939804	611-742-030	married	2022-08-02	\N	\N	39332749-27193060-90310547	Budapest - Újpest raktártelep	6031	Magyarország	Bács-Kiskun	Kecskemét	Petőfi Sándor utca	136/B	ABC Kereskedelmi Kft.	kis.laszlo351@abc-kft.hu	+36 31 147 9939	2779c0ef-9d97-470f-839c-f818469d43d6	\N
44efc867-48e5-46a2-8708-3e40bc9c12ed	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0351	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Takarító	2023-12-13	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Ferenc	Boros	male	1993-11-16	Zalaegerszeg	Bogdán Nikolett	7025654271	\N	809-096-487	single	2023-12-13	\N	\N	84873622-97026194-54621662	Budapest - Angyalföld építkezés	2100	Magyarország	Pest	Gödöllő	Bajcsy-Zsilinszky utca	124	ABC Kereskedelmi Kft.	boros.ferenc352@abc-kft.hu	+36 50 328 1707	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
9f5799ce-2d3a-4f38-a30c-7967beeba1e5	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0352	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Hegesztő	2023-06-01	\N	Előző munkahelyről jó referenciával érkezett.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Károly	Szilágyi	male	1965-07-28	Hódmezővásárhely	Török Bianka	8591250116	NE4207393	\N	married	2023-06-01	2026-09-02	\N	45769758-72673938-95926541	Kecskemét - Gyárvárosi építkezés	6031	Magyarország	Bács-Kiskun	Kecskemét	Jókai Mór utca	3	ABC Kereskedelmi Kft.	szilagyi.karoly353@abc-kft.hu	+36 70 123 9477	94eda3e8-6e8f-45df-a5f2-9690f2c19ccf	\N
e6b381cd-606e-45b6-9a4e-945309612bb7	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0353	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Műszaki ellenőr	2024-11-01	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Anna	Biró	female	1989-08-09	Debrecen	Varga Julianna	8700765026	\N	\N	married	2024-11-01	\N	\N	76614284-35704293-17538175	Budapest - Angyalföld építkezés	8901	Magyarország	Zala	Zalaegerszeg	Fő utca	150	ABC Kereskedelmi Kft.	biro.anna354@abc-kft.hu	+36 70 673 5300	acac124f-7479-48fa-a1ac-b7d62b6489fc	\N
5a889047-5abb-4aa6-92cc-a7a866dca795	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0354	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Targoncavezető	2021-01-25	\N	Első munkahelyes, szakmai gyakorlat keretében.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Ernő	Vincze	male	1991-09-05	Dunaújváros	Somogyi Mónika	3980360351	\N	808-975-857	married	2021-01-25	\N	\N	95343401-39489397-34039951	Debrecen - Ipari Park	2500	Magyarország	Komárom-Esztergom	Esztergom	Mikszáth Kálmán tér	102/C	ABC Kereskedelmi Kft.	vincze.erno355@abc-kft.hu	+36 31 484 1251	\N	\N
3261a510-7339-4df9-824c-7ad23d1884c4	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0355	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Karbantartó	2021-01-14	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Márk	Deák	male	1984-07-14	Kecskemét	Balázs Fanni	7512678069	\N	\N	married	2021-01-14	\N	\N	52222160-73444272-94590684	Szeged - Belváros rekonstrukció	3527	Magyarország	Borsod-Abaúj-Zemplén	Miskolc	Mikszáth Kálmán tér	55	ABC Kereskedelmi Kft.	deak.mark356@abc-kft.hu	+36 31 146 4460	b4888603-1870-4196-ad56-4c55471e98d7	\N
5b346660-fdf1-40ce-a628-71f0ad4b61b7	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0356	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Takarító	2025-11-19	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Noel	Lukács	male	1982-01-24	Cegléd	Antal Éva	0144816904	\N	210-828-841	married	2025-11-19	\N	\N	73110336-92116327-76471607	Budapest - Csepel ipari park	2030	Magyarország	Pest	Érd	Rákóczi út	105	ABC Kereskedelmi Kft.	lukacs.noel357@abc-kft.hu	+36 20 720 1744	\N	\N
fbf61aac-1b17-4897-8d9f-79edd47588be	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0357	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Villanyszerelő	2021-01-15	\N	Első munkahelyes, szakmai gyakorlat keretében.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Beáta	Oláh	female	1987-02-07	Cegléd	Máté Edina	1875332917	DF7756176	027-564-746	single	2021-01-15	\N	\N	16589785-83203635-34243462	Budapest - Újpest raktártelep	4031	Magyarország	Hajdú-Bihar	Debrecen	Bocskai utca	76	ABC Kereskedelmi Kft.	olah.beata358@abc-kft.hu	+36 30 395 3740	2779c0ef-9d97-470f-839c-f818469d43d6	\N
eb6371d9-cfad-41e3-8975-a3b0e7d60b4d	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0358	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Irodai asszisztens	2023-10-05	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Milán	Takács	male	1983-03-10	Budapest	Fehér Lili	8020649504	\N	615-990-921	married	2023-10-05	\N	\N	\N	Budapest - Váci út irodaház	2401	Magyarország	Fejér	Dunaújváros	Hunyadi utca	45	ABC Kereskedelmi Kft.	takacs.milan359@abc-kft.hu	+36 31 768 9066	acac124f-7479-48fa-a1ac-b7d62b6489fc	\N
d6ecb41a-f4f2-45f3-bd46-0b35084bb689	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0359	c5d51752-dff2-4728-a944-c3692937106f	Targoncavezető	2026-11-21	2024-12-11	B kategóriás jogosítvánnyal rendelkezik.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Mónika	Kocsis	female	1994-03-05	Érd	László Réka	4529598217	\N	578-159-251	divorced	2026-11-21	2028-01-05	\N	65317834-57668511-88278229	Debrecen - Ipari Park	7628	Magyarország	Baranya	Pécs	Liszt Ferenc tér	38	ABC Kereskedelmi Kft.	kocsis.monika360@abc-kft.hu	+36 50 636 1631	\N	\N
1420dd76-e5e8-46d3-b1bc-5e28bf8ad64d	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0360	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Adminisztrátor	2023-06-02	\N	OKJ végzettséggel rendelkezik.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Milán	Fehér	male	1967-07-06	Pécs	Molnár Anna	8650216858	\N	\N	single	2023-06-02	\N	\N	10520506-93059071-47986457	Debrecen - Ipari Park	1011	Magyarország	Budapest	Budapest	Kodály körönd	95	ABC Kereskedelmi Kft.	feher.milan361@abc-kft.hu	+36 70 872 7210	\N	\N
0cb7619b-058a-42fe-8cc2-97aba428f960	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0361	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Állványozó	2023-12-18	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Norbert	Lakatos	male	1974-06-07	Gödöllő	Király Julianna	\N	ZZ8915031	218-030-995	married	2023-12-18	\N	\N	25647906-76288496-51818266	Budapest - Csepel ipari park	7401	Magyarország	Somogy	Kaposvár	Vörösmarty utca	15	ABC Kereskedelmi Kft.	lakatos.norbert362@abc-kft.hu	+36 70 234 8050	2779c0ef-9d97-470f-839c-f818469d43d6	\N
5f948ad6-5a08-4cdf-bc14-d5fb6696a3b5	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0362	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Daruzó	2022-01-19	\N	Tapasztalt dolgozó, megbízható.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	István	Somogyi	male	1972-09-18	Vác	Kozma Tímea	\N	\N	354-440-425	divorced	2022-01-19	\N	\N	93553260-91187968-79892571	Kecskemét - Gyárvárosi építkezés	1011	Magyarország	Budapest	Budapest	Zrínyi utca	24	ABC Kereskedelmi Kft.	somogyi.istvan363@abc-kft.hu	+36 31 244 3484	\N	\N
651e8330-76a8-405b-b11f-1d152dcc4da8	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0363	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Irodai asszisztens	2021-02-27	\N	Tapasztalt dolgozó, megbízható.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Klára	Balogh	female	1966-11-21	Székesfehérvár	Magyar Nikolett	4755133018	HS2803799	\N	single	2021-02-27	\N	\N	95445409-83985359-70626512	Budapest - Budaörs logisztikai központ	3530	Magyarország	Borsod-Abaúj-Zemplén	Miskolc	Kodály körönd	100	ABC Kereskedelmi Kft.	balogh.klara364@abc-kft.hu	+36 20 918 8441	2779c0ef-9d97-470f-839c-f818469d43d6	\N
e5f24f26-da58-4521-a3f5-aec997e1a0c9	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0364	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Tetőfedő	2021-12-14	\N	Részmunkaidős foglalkoztatás.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Zoltán	Kiss	male	2006-09-30	Hódmezővásárhely	Veres Judit	3343858220	\N	\N	married	2021-12-14	2026-03-09	\N	39704188-69160736-11584691	Budapest - Angyalföld építkezés	2801	Magyarország	Komárom-Esztergom	Tatabánya	Munkácsy Mihály utca	4	ABC Kereskedelmi Kft.	kiss.zoltan365@abc-kft.hu	+36 70 232 2809	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
ae1cb4c9-8531-493f-8759-044df93c1c62	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0365	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Villanyszerelő	2023-10-05	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Eszter	Katona	female	1981-05-04	Nyíregyháza	Deák Bianka	5202232608	\N	981-719-254	married	2023-10-05	\N	\N	71312765-83712579-69928422	Budapest - Újpest raktártelep	2401	Magyarország	Fejér	Dunaújváros	Dózsa György út	116	ABC Kereskedelmi Kft.	katona.eszter366@abc-kft.hu	+36 70 101 2211	0d08cbc6-b692-4e7c-b269-f47eb41d996a	\N
ef03ea26-1664-4757-a314-c9ddf20f683f	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0366	80b828b8-e846-455b-b9ac-36a60a30d6d3	Tűzvédelmi felelős	2022-09-18	\N	Előző munkahelyről jó referenciával érkezett.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Judit	Nagy	female	1998-07-18	Szombathely	Gál Tímea	2422170669	CU3496520	088-616-880	married	2022-09-18	\N	\N	80037257-21092646-71104738	Budapest - Angyalföld építkezés	3530	Magyarország	Borsod-Abaúj-Zemplén	Miskolc	Damjanich utca	129	ABC Kereskedelmi Kft.	nagy.judit367@abc-kft.hu	+36 20 651 5763	94eda3e8-6e8f-45df-a5f2-9690f2c19ccf	\N
c3b83e34-4b03-47b4-862c-e3728b0cd87b	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0367	f2254bf6-b3ef-48f6-b5ee-a8f9ac2d9fed	Vasbetonszerelő	2022-11-18	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Erika	Kovács	female	1963-07-04	Szolnok	Varga Szilvia	1967824602	\N	953-577-729	single	2022-11-18	\N	\N	41676965-35333888-45957076	Budapest - Dél-Buda fejlesztés	5601	Magyarország	Békés	Békéscsaba	Mikszáth Kálmán tér	53	ABC Kereskedelmi Kft.	kovacs.erika368@abc-kft.hu	+36 31 198 6207	\N	\N
8e36786d-5b14-4274-9077-c62c06e061af	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0368	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Festő	2025-01-15	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Szabolcs	Király	male	1990-02-28	Pécs	Bogdán Ágnes	0253192647	\N	116-605-641	married	2025-01-15	\N	\N	26511429-90221657-17306518	Budapest - Budaörs logisztikai központ	3301	Magyarország	Heves	Eger	Móricz Zsigmond körtér	123	ABC Kereskedelmi Kft.	kiraly.szabolcs369@abc-kft.hu	+36 31 350 6316	acac124f-7479-48fa-a1ac-b7d62b6489fc	\N
8d07592c-6d6f-4585-89b7-a07a8921ffec	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0369	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Villanyszerelő	2021-10-08	\N	Nyelvtudás: angol alapfok.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Zsolt	Virág	male	1963-02-22	Gödöllő	Pintér Anna	3947197170	\N	603-099-761	married	2021-10-08	\N	\N	81803474-88702204-20175110	Miskolc - Diósgyőri felújítás	2700	Magyarország	Pest	Cegléd	Liszt Ferenc tér	101/A	ABC Kereskedelmi Kft.	virag.zsolt370@abc-kft.hu	+36 70 192 4781	acfc75f8-6ffd-4fc4-aaf4-e51409068b30	\N
804687b2-2ec5-4acf-8906-1eeb9cf8f0f3	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0370	c5d51752-dff2-4728-a944-c3692937106f	Rakodómunkás	2022-09-01	2025-07-14	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Bernadett	Orsós	female	1971-11-13	Sopron	Fekete Fanni	0265207652	\N	672-366-899	married	2022-09-01	\N	\N	81339831-49677023-49933401	Budapest - Dél-Buda fejlesztés	1151	Magyarország	Budapest	Budapest	Bocskai utca	52/C	ABC Kereskedelmi Kft.	orsos.bernadett371@abc-kft.hu	+36 50 286 2519	\N	\N
ba3b16a1-8ec8-40a5-b049-4c4668044896	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0371	80b828b8-e846-455b-b9ac-36a60a30d6d3	Vízvezeték-szerelő	2022-07-02	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Zsófia	Kozma	female	1971-10-20	Cegléd	Király Emese	2643552505	WS4360861	324-031-754	single	2022-07-02	\N	\N	\N	Budapest - Váci út irodaház	8004	Magyarország	Fejér	Székesfehérvár	Kazinczy utca	125	ABC Kereskedelmi Kft.	kozma.zsofia372@abc-kft.hu	+36 30 196 1605	acfc75f8-6ffd-4fc4-aaf4-e51409068b30	\N
d4acf627-755b-4047-99de-56c2bf1b34a8	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0372	80b828b8-e846-455b-b9ac-36a60a30d6d3	Épületgépész	2022-02-05	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Anikó	Szűcs	female	1968-07-21	Érd	Somogyi Julianna	2626452632	\N	\N	divorced	2022-02-05	\N	\N	68067776-42565650-22969144	Kecskemét - Gyárvárosi építkezés	7621	Magyarország	Baranya	Pécs	Munkácsy Mihály utca	119	ABC Kereskedelmi Kft.	szucs.aniko373@abc-kft.hu	+36 50 713 5421	b4888603-1870-4196-ad56-4c55471e98d7	\N
842c1ec4-012d-45fd-81ce-b427f39333d6	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0373	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Munkavédelmi felelős	2024-09-16	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Dániel	Molnár	male	1995-10-03	Dunaújváros	Török Beáta	8685960904	\N	\N	single	2024-09-16	\N	\N	\N	Győr - Északi Ipari Park	6001	Magyarország	Bács-Kiskun	Kecskemét	Batthyány utca	148	ABC Kereskedelmi Kft.	molnar.daniel374@abc-kft.hu	+36 50 563 2637	13ad850c-f7c6-4b1c-8119-b2a785a56673	\N
1ee910ae-e46f-4335-af24-6a0fa8cde5e3	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0374	c5d51752-dff2-4728-a944-c3692937106f	Vízvezeték-szerelő	2024-09-30	2024-04-11	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Gábor	Varga	male	1971-11-06	Nyíregyháza	Oláh Vivien	\N	\N	139-072-357	divorced	2024-09-30	\N	\N	48238558-55837742-95799736	Budapest - Angyalföld építkezés	6001	Magyarország	Bács-Kiskun	Kecskemét	Kossuth Lajos utca	70	ABC Kereskedelmi Kft.	varga.gabor375@abc-kft.hu	+36 31 714 4491	\N	\N
bbac8e51-d37e-4225-b89c-2b971f25143e	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0375	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Villanyszerelő	2026-10-22	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Mihály	Fehér	male	1996-08-18	Békéscsaba	Mészáros Barbara	8551202347	\N	145-505-086	single	2026-10-22	2028-12-16	\N	\N	Budapest - Váci út irodaház	7625	Magyarország	Baranya	Pécs	Zrínyi utca	31/C	ABC Kereskedelmi Kft.	feher.mihaly376@abc-kft.hu	+36 50 166 2034	b4888603-1870-4196-ad56-4c55471e98d7	\N
1edc460e-1de4-493a-88d3-ca8c9276430d	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0376	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Hegesztő	2022-03-16	\N	Többéves iparági tapasztalat.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Kristóf	Orsós	male	1970-06-21	Debrecen	Fodor Bernadett	5366000366	CE1849865	125-421-019	divorced	2022-03-16	\N	\N	\N	Kecskemét - Gyárvárosi építkezés	4431	Magyarország	Szabolcs-Szatmár-Bereg	Nyíregyháza	Mátyás király utca	18	ABC Kereskedelmi Kft.	orsos.kristof377@abc-kft.hu	+36 50 647 1027	\N	\N
d69365f3-dd31-4dcc-9259-e01cccf304fc	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0377	80b828b8-e846-455b-b9ac-36a60a30d6d3	Műszaki ellenőr	2021-01-20	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Roland	Vincze	male	1990-11-21	Hódmezővásárhely	Gulyás Zoé	9759289174	\N	\N	married	2021-01-20	\N	\N	50211486-90936999-86905330	Budapest - Újpest raktártelep	1081	Magyarország	Budapest	Budapest	Kossuth Lajos utca	125	ABC Kereskedelmi Kft.	vincze.roland378@abc-kft.hu	+36 70 320 2827	35af414c-1808-4056-8fcf-0bdfd33b9862	\N
ad6d2bdb-c43e-4983-ad0a-172434d4c9ce	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0378	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Villanyszerelő	2024-10-12	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Ferenc	Fehér	male	1974-08-07	Békéscsaba	Mészáros Lilla	8448724387	\N	514-104-667	married	2024-10-12	\N	\N	\N	Miskolc - Diósgyőri felújítás	2600	Magyarország	Pest	Vác	Mikszáth Kálmán tér	50	ABC Kereskedelmi Kft.	feher.ferenc379@abc-kft.hu	+36 30 897 4521	2779c0ef-9d97-470f-839c-f818469d43d6	\N
28b584a4-0f12-45f2-a606-f290caa51a9d	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0379	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Műszaki ellenőr	2023-12-23	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Szabolcs	Fekete	male	1984-09-24	Hódmezővásárhely	Fehér Mónika	6017771781	DW5209310	102-506-019	married	2023-12-23	\N	\N	81071407-84495505-39070814	Szeged - Belváros rekonstrukció	2501	Magyarország	Komárom-Esztergom	Esztergom	Templom utca	2	ABC Kereskedelmi Kft.	fekete.szabolcs380@abc-kft.hu	+36 31 995 7447	35af414c-1808-4056-8fcf-0bdfd33b9862	\N
6ad97ed7-be42-462e-9da7-499d3640de09	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0380	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Gondnok	2025-08-04	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Sándor	Gulyás	male	2006-05-21	Veszprém	Szalai Lili	3522661574	\N	730-928-671	married	2025-08-04	2028-12-21	\N	\N	Budapest - Angyalföld építkezés	9401	Magyarország	Győr-Moson-Sopron	Sopron	Rákóczi út	19	ABC Kereskedelmi Kft.	gulyas.sandor381@abc-kft.hu	+36 50 733 4220	\N	\N
535ce316-01e1-4462-9441-44d003c1d3db	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0381	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Festő	2026-04-08	\N	Külföldi munkavállalási engedéllyel rendelkezik.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Julianna	Szalai	female	2001-01-29	Miskolc	Fülöp Nikolett	9465514633	\N	145-260-375	single	2026-04-08	\N	\N	\N	Budapest - Dél-Buda fejlesztés	3301	Magyarország	Heves	Eger	Petőfi Sándor utca	63	ABC Kereskedelmi Kft.	szalai.julianna382@abc-kft.hu	+36 50 284 2499	7c65ce89-c2e7-4a79-8cac-311051629c78	\N
db34ac40-cca8-4045-9332-d28f2991670b	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0382	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Rakodómunkás	2023-09-27	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Roland	Rácz	male	1990-06-05	Eger	Orosz Lili	1196955253	\N	477-500-759	single	2023-09-27	\N	\N	42724494-59127979-32835700	Győr - Északi Ipari Park	3304	Magyarország	Heves	Eger	Kazinczy utca	67/A	ABC Kereskedelmi Kft.	racz.roland383@abc-kft.hu	+36 30 434 2197	\N	\N
8f81d056-5b54-403d-9a06-e82f1e8aee11	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0383	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Biztonsági őr	2021-01-10	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Miklós	Nagy	male	1999-03-17	Vác	Takács Petra	6191661360	KO3730366	\N	married	2021-01-10	\N	\N	36313113-46834436-53456725	Budapest - Csepel ipari park	9701	Magyarország	Vas	Szombathely	Batthyány utca	64	ABC Kereskedelmi Kft.	nagy.miklos384@abc-kft.hu	+36 20 605 8820	\N	\N
fbdf23ec-b53a-46a5-a0b7-2dfffb3ddeee	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0384	c5d51752-dff2-4728-a944-c3692937106f	Hegesztő	2023-04-06	2026-06-12	B kategóriás jogosítvánnyal rendelkezik.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Pál	Varga	male	1972-06-18	Nyíregyháza	Kelemen Lilla	2295844354	UF5754259	022-952-656	married	2023-04-06	2027-01-20	\N	40438292-46106467-45772346	Debrecen - Ipari Park	4024	Magyarország	Hajdú-Bihar	Debrecen	Petőfi Sándor utca	69/A	ABC Kereskedelmi Kft.	varga.pal385@abc-kft.hu	+36 31 365 1343	\N	\N
d6bfa7a7-8307-471c-b004-bf59d608f5b7	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0385	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Rakodómunkás	2024-09-09	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Emese	Mészáros	female	1995-12-01	Cegléd	Juhász Boglárka	4688397059	\N	580-137-969	married	2024-09-09	2028-12-12	\N	48402739-42031852-81014283	Kecskemét - Gyárvárosi építkezés	2803	Magyarország	Komárom-Esztergom	Tatabánya	Dózsa György út	56/B	ABC Kereskedelmi Kft.	meszaros.emese386@abc-kft.hu	+36 70 735 1321	13ad850c-f7c6-4b1c-8119-b2a785a56673	\N
b47ada43-b7d9-40b6-9249-19ebdac9a849	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0386	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Villanyszerelő	2022-08-18	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Milán	Molnár	male	1962-03-19	Eger	Illés Ilona	7279555784	\N	027-966-411	single	2022-08-18	\N	\N	28057269-87562409-75657905	Budapest - Váci út irodaház	9400	Magyarország	Győr-Moson-Sopron	Sopron	Móricz Zsigmond körtér	102	ABC Kereskedelmi Kft.	molnar.milan387@abc-kft.hu	+36 50 796 4229	13ad850c-f7c6-4b1c-8119-b2a785a56673	\N
7dccdc57-aceb-4c47-aa67-3ea1651b71fb	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0387	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Rakodómunkás	2023-01-18	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Orsolya	Lukács	female	1965-08-28	Érd	Takács Csilla	2992337266	\N	303-894-940	divorced	2023-01-18	2027-12-07	\N	84480093-64766292-81966411	Kecskemét - Gyárvárosi építkezés	2401	Magyarország	Fejér	Dunaújváros	Hunyadi utca	35	ABC Kereskedelmi Kft.	lukacs.orsolya388@abc-kft.hu	+36 20 135 3032	\N	\N
b81b494a-387f-41c9-9572-52e6fc5034ab	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0388	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Takarító	2026-04-06	\N	Túlóra vállalására hajlandó.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Ernő	Fodor	male	1963-07-06	Kaposvár	Hegedűs Anikó	2857379178	UT5278640	386-171-092	married	2026-04-06	\N	\N	56665400-61035542-95313943	Szeged - Belváros rekonstrukció	2700	Magyarország	Pest	Cegléd	Tompa Mihály utca	147	ABC Kereskedelmi Kft.	fodor.erno389@abc-kft.hu	+36 30 493 8652	d24a0a6b-de8f-4afc-8fc3-9ba31235ad91	\N
97990ebe-830b-4b46-8b82-463ff4e844f7	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0389	80b828b8-e846-455b-b9ac-36a60a30d6d3	Irodai asszisztens	2026-12-01	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Pál	Orosz	male	1989-01-13	Eger	Hegedűs Anna	\N	\N	847-747-525	single	2026-12-01	\N	\N	29876206-91549279-45377089	Győr - Északi Ipari Park	4433	Magyarország	Szabolcs-Szatmár-Bereg	Nyíregyháza	Bethlen Gábor utca	22	ABC Kereskedelmi Kft.	orosz.pal390@abc-kft.hu	+36 50 625 1841	\N	\N
9f5f927d-fa77-4e1b-8a91-08f43150a833	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0390	c5d51752-dff2-4728-a944-c3692937106f	Sofőr	2022-03-26	2024-04-06	Többéves iparági tapasztalat.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Noel	Kelemen	male	1982-03-07	Esztergom	Fodor Krisztina	9137277326	\N	072-367-102	divorced	2022-03-26	\N	\N	33250396-11616961-91757686	Budapest - Újpest raktártelep	9026	Magyarország	Győr-Moson-Sopron	Győr	Dózsa György út	132	ABC Kereskedelmi Kft.	kelemen.noel391@abc-kft.hu	+36 30 124 3885	\N	\N
7d24d153-9688-4289-9b21-60bd173d00ae	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0391	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Hegesztő	2023-01-04	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Julianna	Németh	female	1985-06-24	Veszprém	Szalai Luca	2070348129	\N	895-213-642	single	2023-01-04	\N	\N	37701927-67162877-22454438	Budapest - Váci út irodaház	2801	Magyarország	Komárom-Esztergom	Tatabánya	Rákóczi út	69	ABC Kereskedelmi Kft.	nemeth.julianna392@abc-kft.hu	+36 70 808 2656	35af414c-1808-4056-8fcf-0bdfd33b9862	\N
decbdd34-3f97-4217-95bb-fb408e8aa699	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0392	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Ács	2021-09-28	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Mihály	Tóth	male	1966-11-17	Érd	Biró Renáta	7159602118	\N	736-021-171	divorced	2021-09-28	\N	\N	91349444-77251567-89089972	Budapest - Újpest raktártelep	2803	Magyarország	Komárom-Esztergom	Tatabánya	Bem József utca	80	ABC Kereskedelmi Kft.	toth.mihaly393@abc-kft.hu	+36 31 509 7564	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
193dd2f7-7857-4322-af4f-ff8b06da3cb2	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0393	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Állványozó	2025-04-26	\N	Új munkaerő, betanulás alatt.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Károly	Farkas	male	2001-01-05	Sopron	Deák Margit	0312727118	\N	479-188-134	divorced	2025-04-26	\N	\N	22551713-37285214-36542830	Kecskemét - Gyárvárosi építkezés	6800	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Tompa Mihály utca	98	ABC Kereskedelmi Kft.	farkas.karoly394@abc-kft.hu	+36 70 581 2179	7c65ce89-c2e7-4a79-8cac-311051629c78	\N
7dda34b1-413e-43b3-bed2-ed33f5e06506	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0394	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Segédmunkás	2022-07-20	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Viktor	Budai	male	1984-05-04	Békéscsaba	Varga Anna	7624282346	\N	114-229-305	single	2022-07-20	2028-04-10	\N	90454536-23487776-79613452	Szeged - Belváros rekonstrukció	8900	Magyarország	Zala	Zalaegerszeg	Batthyány utca	11	ABC Kereskedelmi Kft.	budai.viktor395@abc-kft.hu	+36 50 540 5203	\N	\N
c6725c31-c5ca-4e4e-9676-147dba666aeb	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0395	f2254bf6-b3ef-48f6-b5ee-a8f9ac2d9fed	Műszaki ellenőr	2021-07-23	\N	Részmunkaidős foglalkoztatás.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Erika	Juhász	female	1991-08-13	Debrecen	Tóth Renáta	\N	\N	\N	single	2021-07-23	2028-11-01	\N	57653667-48818802-46725680	Kecskemét - Gyárvárosi építkezés	2500	Magyarország	Komárom-Esztergom	Esztergom	Petőfi Sándor utca	136	ABC Kereskedelmi Kft.	juhasz.erika396@abc-kft.hu	+36 31 500 9756	\N	\N
8d1f5b90-4a52-4e00-a6f3-24d71e1d167d	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0396	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Daruzó	2022-04-14	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Olivér	Somogyi	male	1965-07-09	Cegléd	Kocsis Zsófia	4321573816	\N	849-006-741	single	2022-04-14	\N	\N	\N	Budapest - Angyalföld építkezés	4024	Magyarország	Hajdú-Bihar	Debrecen	Munkácsy Mihály utca	91/B	ABC Kereskedelmi Kft.	somogyi.oliver397@abc-kft.hu	+36 70 576 2781	35af414c-1808-4056-8fcf-0bdfd33b9862	\N
7f9f0cda-01e0-4511-bfc0-3701a70d5f3d	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0397	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Minőségellenőr	2021-12-29	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Norbert	László	male	2006-01-23	Szolnok	Fazekas Zsófia	5696835929	\N	794-523-822	single	2021-12-29	\N	\N	32371658-60651629-10371139	Budapest - Újpest raktártelep	2801	Magyarország	Komárom-Esztergom	Tatabánya	Fő utca	34/A	ABC Kereskedelmi Kft.	laszlo.norbert398@abc-kft.hu	+36 50 591 1441	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
a30c5af9-000c-4784-904d-147d63ec0954	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0398	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Takarító	2024-11-19	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Gergő	Lukács	male	1962-04-26	Cegléd	Fülöp Réka	3477712172	\N	382-612-379	single	2024-11-19	2027-05-31	\N	65017822-90126067-91415499	Kecskemét - Gyárvárosi építkezés	5001	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Munkácsy Mihály utca	147	ABC Kereskedelmi Kft.	lukacs.gergo399@abc-kft.hu	+36 50 954 7771	\N	\N
47958058-2892-4c83-bae7-db57f9de6fa0	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0399	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Állványozó	2024-10-03	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Mária	Máté	female	1999-05-19	Székesfehérvár	Magyar Judit	7531291645	FB3240764	766-301-028	married	2024-10-03	\N	\N	28588344-52475204-34727017	Budapest - Váci út irodaház	3530	Magyarország	Borsod-Abaúj-Zemplén	Miskolc	Deák Ferenc utca	129	ABC Kereskedelmi Kft.	mate.maria400@abc-kft.hu	+36 30 758 7414	02137110-1f01-4ea8-9652-cb3057178ec0	\N
660da97d-3c0f-4bc9-96ab-8a8f69beb2dc	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0400	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Takarító	2026-10-19	\N	B kategóriás jogosítvánnyal rendelkezik.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Péter	Kozma	male	1961-08-02	Szeged	Biró Anna	1665795522	\N	542-014-402	single	2026-10-19	2027-07-22	\N	81355896-48300699-27185155	Budapest - Budaörs logisztikai központ	3530	Magyarország	Borsod-Abaúj-Zemplén	Miskolc	Templom utca	40	ABC Kereskedelmi Kft.	kozma.peter401@abc-kft.hu	+36 20 516 7866	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
a2560bf5-7ea7-4b11-b202-49c35e8de2ee	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0401	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Segédmunkás	2024-01-06	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Flóra	Kis	female	2006-01-15	Szolnok	Szabó Szilvia	2429573508	\N	751-093-199	divorced	2024-01-06	\N	\N	51425433-66402236-92950492	Budapest - Dél-Buda fejlesztés	6720	Magyarország	Csongrád-Csanád	Szeged	Vörösmarty utca	124	ABC Kereskedelmi Kft.	kis.flora402@abc-kft.hu	+36 31 641 8090	acfc75f8-6ffd-4fc4-aaf4-e51409068b30	\N
5b82e3aa-b427-44ac-be09-f6adc9e394bd	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0402	80b828b8-e846-455b-b9ac-36a60a30d6d3	Állványozó	2023-05-17	\N	Részmunkaidős foglalkoztatás.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Bence	Biró	male	1985-03-26	Szeged	Jakab Klára	2931095880	XT9215385	745-738-119	single	2023-05-17	\N	\N	\N	Budapest - Váci út irodaház	7625	Magyarország	Baranya	Pécs	Zrínyi utca	68	ABC Kereskedelmi Kft.	biro.bence403@abc-kft.hu	+36 20 639 9381	acac124f-7479-48fa-a1ac-b7d62b6489fc	\N
7f8cc3cb-403c-42ff-9f63-43159f9ecacc	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0403	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Irodai asszisztens	2023-12-14	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Gyula	Pál	male	1992-06-20	Érd	Varga Hajnalka	4217582172	\N	608-255-789	single	2023-12-14	\N	\N	86712315-40559949-52884573	Budapest - Dél-Buda fejlesztés	2801	Magyarország	Komárom-Esztergom	Tatabánya	Zrínyi utca	64	ABC Kereskedelmi Kft.	pal.gyula404@abc-kft.hu	+36 50 486 9788	94eda3e8-6e8f-45df-a5f2-9690f2c19ccf	\N
aff62487-3f91-4212-a231-f9d70800ac1a	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0404	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Vízvezeték-szerelő	2024-08-11	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Ilona	Lakatos	female	1985-03-02	Eger	Fazekas Éva	1833202237	DY1107003	942-343-431	single	2024-08-11	\N	\N	66422249-98947750-90027436	Budapest - Váci út irodaház	5601	Magyarország	Békés	Békéscsaba	Arany János utca	50/B	ABC Kereskedelmi Kft.	lakatos.ilona405@abc-kft.hu	+36 31 843 3121	acac124f-7479-48fa-a1ac-b7d62b6489fc	\N
e6a29a17-d161-4146-808f-8228d67fe6ef	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0405	c5d51752-dff2-4728-a944-c3692937106f	Gépkezelő	2025-08-14	2026-03-20	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Sándor	Lakatos	male	1976-10-11	Veszprém	Király Emese	5947625780	\N	576-085-361	single	2025-08-14	\N	\N	43984672-56979370-94135436	Miskolc - Diósgyőri felújítás	4027	Magyarország	Hajdú-Bihar	Debrecen	Liszt Ferenc tér	19	ABC Kereskedelmi Kft.	lakatos.sandor406@abc-kft.hu	+36 30 619 6639	\N	\N
9b50c683-59b7-45bb-bafe-3b93537e5771	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0406	80b828b8-e846-455b-b9ac-36a60a30d6d3	Minőségellenőr	2025-03-09	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Dóra	Katona	female	1979-03-29	Hódmezővásárhely	Fazekas Anikó	5802283417	JM2351419	442-164-441	single	2025-03-09	\N	\N	77387451-10103979-12434927	Budapest - Csepel ipari park	6801	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Liszt Ferenc tér	31/A	ABC Kereskedelmi Kft.	katona.dora407@abc-kft.hu	+36 31 252 4557	\N	\N
9adbfcf1-db12-4fcf-8730-29f2444d89da	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0407	c5d51752-dff2-4728-a944-c3692937106f	Tűzvédelmi felelős	2023-04-23	2026-09-03	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Dominik	Máté	male	1995-07-20	Budapest	Kiss Mónika	\N	\N	672-458-737	married	2023-04-23	\N	\N	23721327-53814698-80317355	Debrecen - Ipari Park	8201	Magyarország	Veszprém	Veszprém	Kazinczy utca	105/B	ABC Kereskedelmi Kft.	mate.dominik408@abc-kft.hu	+36 50 279 1126	\N	\N
cca25ea5-8e58-4efa-8720-d512672560e6	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0408	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Épületgépész	2021-01-22	\N	Havi bruttó bér: 380 000 Ft	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Béla	Nagy	male	1984-05-24	Békéscsaba	Bogdán Vivien	4988198278	\N	849-490-206	married	2021-01-22	\N	\N	34896231-15747313-44874437	Miskolc - Diósgyőri felújítás	1191	Magyarország	Budapest	Budapest	Tompa Mihály utca	1/B	ABC Kereskedelmi Kft.	nagy.bela409@abc-kft.hu	+36 70 570 5670	\N	\N
43bd580e-da4e-4b73-b316-aea1f136829c	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0409	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Biztonsági őr	2024-03-23	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Vivien	Orsós	female	1981-06-07	Vác	Budai Dóra	2833304885	\N	587-853-223	married	2024-03-23	\N	\N	42638031-22391714-31879554	Kecskemét - Gyárvárosi építkezés	3300	Magyarország	Heves	Eger	Batthyány utca	23	ABC Kereskedelmi Kft.	orsos.vivien410@abc-kft.hu	+36 50 936 4997	0d08cbc6-b692-4e7c-b269-f47eb41d996a	\N
9f092cbc-0abb-402d-b8e9-408f526985b4	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0410	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Szállítómunkás	2021-09-03	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Réka	Hegedűs	female	1963-02-08	Gödöllő	Kovács Zsófia	3382274859	\N	272-658-232	divorced	2021-09-03	\N	\N	17013362-27999443-95908395	Székesfehérvár - Gyáripari terület	3304	Magyarország	Heves	Eger	Táncsics Mihály utca	91	ABC Kereskedelmi Kft.	hegedus.reka411@abc-kft.hu	+36 50 934 8599	\N	\N
9eec3a9b-4d7e-453c-bfaf-5fd9f706c8c8	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0411	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Targoncavezető	2021-04-09	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Máté	Somogyi	male	1981-05-02	Cegléd	Pál Ágnes	2528870081	PK4103214	831-218-455	single	2021-04-09	\N	\N	10750776-46485771-84686138	Miskolc - Diósgyőri felújítás	9401	Magyarország	Győr-Moson-Sopron	Sopron	Damjanich utca	142	ABC Kereskedelmi Kft.	somogyi.mate412@abc-kft.hu	+36 20 196 6883	2779c0ef-9d97-470f-839c-f818469d43d6	\N
20125296-39a7-40c4-aed5-286d52505223	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0412	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Épületgépész	2024-12-15	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Richárd	Vincze	male	2000-01-11	Esztergom	Virág Boglárka	9345913198	\N	301-028-943	widowed	2024-12-15	\N	\N	\N	Debrecen - Ipari Park	8005	Magyarország	Fejér	Székesfehérvár	Bethlen Gábor utca	130	ABC Kereskedelmi Kft.	vincze.richard413@abc-kft.hu	+36 70 961 4245	d24a0a6b-de8f-4afc-8fc3-9ba31235ad91	\N
9a710b1b-3e26-4ffc-9620-0cdb2330c401	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0413	c5d51752-dff2-4728-a944-c3692937106f	Biztonsági őr	2023-09-30	2026-04-28	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Milán	Hegedűs	male	1995-12-04	Pécs	Jakab Luca	3213624785	\N	862-199-772	single	2023-09-30	\N	\N	54539362-10969996-37359767	Győr - Északi Ipari Park	2600	Magyarország	Pest	Vác	Hunyadi utca	54	ABC Kereskedelmi Kft.	hegedus.milan414@abc-kft.hu	+36 30 943 7542	\N	\N
a4c845d0-0a9b-4e5e-9d2c-7cdb8a8314f1	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0414	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Targoncavezető	2022-05-24	\N	OKJ végzettséggel rendelkezik.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Judit	László	female	1963-07-27	Szolnok	Gál Boglárka	\N	\N	923-206-404	married	2022-05-24	\N	\N	45770279-58033227-41978258	Budapest - Váci út irodaház	2030	Magyarország	Pest	Érd	Dózsa György út	129/A	ABC Kereskedelmi Kft.	laszlo.judit415@abc-kft.hu	+36 50 515 3380	b4888603-1870-4196-ad56-4c55471e98d7	\N
6c0be555-4af7-4ad3-a194-11ab88dc071b	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0415	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Szigetelő	2023-12-13	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Renáta	Török	female	1963-03-20	Eger	Fehér Réka	8616292006	\N	509-658-589	single	2023-12-13	\N	\N	33742828-68807939-74755996	Budapest - Váci út irodaház	2600	Magyarország	Pest	Vác	Bem József utca	126	ABC Kereskedelmi Kft.	torok.renata416@abc-kft.hu	+36 70 449 1555	13ad850c-f7c6-4b1c-8119-b2a785a56673	\N
f42271b1-fd3a-495d-8513-e5c524e87495	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0416	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Műszaki ellenőr	2021-02-19	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Klára	Orosz	female	2001-10-20	Hódmezővásárhely	Virág Renáta	7727110326	\N	004-763-272	single	2021-02-19	\N	\N	67690162-19870590-17202704	Budapest - Dél-Buda fejlesztés	3300	Magyarország	Heves	Eger	Széchenyi István tér	5	ABC Kereskedelmi Kft.	orosz.klara417@abc-kft.hu	+36 31 114 6491	0d08cbc6-b692-4e7c-b269-f47eb41d996a	\N
99a85ac2-fa85-4f41-bcf0-12c86a3ea239	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0417	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Daruzó	2025-06-15	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Szabolcs	Pintér	male	2002-08-27	Érd	Kocsis Flóra	8711901428	\N	892-695-353	married	2025-06-15	\N	\N	\N	Budapest - Angyalföld építkezés	8200	Magyarország	Veszprém	Veszprém	Munkácsy Mihály utca	17/C	ABC Kereskedelmi Kft.	pinter.szabolcs418@abc-kft.hu	+36 50 185 4647	94eda3e8-6e8f-45df-a5f2-9690f2c19ccf	\N
4161b2c8-70e5-423c-9604-faedc51e3409	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0418	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Szállítómunkás	2026-07-28	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Judit	Budai	female	1969-06-22	Dunaújváros	Nagy Vivien	\N	RO1982348	970-855-948	single	2026-07-28	\N	\N	24194610-39156910-45064197	Budapest - Csepel ipari park	9027	Magyarország	Győr-Moson-Sopron	Győr	Deák Ferenc utca	47	ABC Kereskedelmi Kft.	budai.judit419@abc-kft.hu	+36 31 156 3611	13ad850c-f7c6-4b1c-8119-b2a785a56673	\N
c6ef5a63-a3dc-441f-be29-dea2f1b0620e	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0419	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Irodai asszisztens	2022-07-16	\N	Külföldi munkavállalási engedéllyel rendelkezik.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Botond	Lukács	male	1964-10-26	Eger	Magyar Julianna	5758418931	NX8502639	525-329-991	single	2022-07-16	\N	\N	63874140-30083209-18580329	Budapest - Angyalföld építkezés	5000	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Kossuth Lajos utca	60	ABC Kereskedelmi Kft.	lukacs.botond420@abc-kft.hu	+36 70 851 4733	\N	\N
7ef1f96e-327b-48a4-9bc2-0537a36645f9	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0420	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Minőségellenőr	2025-03-14	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Judit	Jakab	female	1964-10-21	Székesfehérvár	Gál Nikolett	5395389079	EX7121437	478-114-099	single	2025-03-14	\N	\N	84037526-24895888-79462403	Szeged - Belváros rekonstrukció	1221	Magyarország	Budapest	Budapest	Bethlen Gábor utca	84	ABC Kereskedelmi Kft.	jakab.judit421@abc-kft.hu	+36 50 757 5723	02137110-1f01-4ea8-9652-cb3057178ec0	\N
e1c929bd-9c5c-45b6-b068-3c37bc398935	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0421	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Munkavédelmi felelős	2024-10-16	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Róbert	László	male	1994-12-18	Cegléd	Nagy Hanna	6020510745	\N	\N	married	2024-10-16	\N	\N	11082929-20756887-64997317	Szeged - Belváros rekonstrukció	9400	Magyarország	Győr-Moson-Sopron	Sopron	Batthyány utca	2/A	ABC Kereskedelmi Kft.	laszlo.robert422@abc-kft.hu	+36 50 731 4097	acfc75f8-6ffd-4fc4-aaf4-e51409068b30	\N
7efd09a0-417a-4cc9-b65b-0ad28546f85f	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0422	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Biztonsági őr	2025-02-18	\N	B kategóriás jogosítvánnyal rendelkezik.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Gábor	Balázs	male	1998-10-14	Dunaújváros	Simon Vivien	\N	\N	934-724-039	married	2025-02-18	\N	\N	71654868-39861804-36625051	Miskolc - Diósgyőri felújítás	3525	Magyarország	Borsod-Abaúj-Zemplén	Miskolc	Arany János utca	60/C	ABC Kereskedelmi Kft.	balazs.gabor423@abc-kft.hu	+36 20 845 6392	acfc75f8-6ffd-4fc4-aaf4-e51409068b30	\N
001bb845-ae7b-4bf4-879b-9cfdf6fd19a3	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0423	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	HR asszisztens	2022-11-19	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Norbert	Biró	male	1982-11-06	Szolnok	Balogh Lili	5301133591	PS5986878	897-665-873	single	2022-11-19	\N	\N	\N	Budapest - Váci út irodaház	7401	Magyarország	Somogy	Kaposvár	Munkácsy Mihály utca	38	ABC Kereskedelmi Kft.	biro.norbert424@abc-kft.hu	+36 20 600 2946	0d08cbc6-b692-4e7c-b269-f47eb41d996a	\N
f967b58f-79df-4077-80e0-42b3049b4868	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0424	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Ács	2026-04-24	\N	Tapasztalt dolgozó, megbízható.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Barnabás	Fekete	male	1963-09-02	Szeged	Máté Bianka	3291468324	\N	\N	married	2026-04-24	\N	\N	46698660-30846675-69093313	Budapest - Budaörs logisztikai központ	3301	Magyarország	Heves	Eger	Ady Endre utca	137/A	ABC Kereskedelmi Kft.	fekete.barnabas425@abc-kft.hu	+36 30 674 3828	94eda3e8-6e8f-45df-a5f2-9690f2c19ccf	\N
1fc4535e-a8cc-462e-8f57-ba50f009428d	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0425	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Művezető	2023-06-22	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Bernadett	Horváth	female	1982-05-06	Zalaegerszeg	Illés Mária	1613456683	PW5173445	618-764-516	single	2023-06-22	\N	\N	98854232-92903590-73447231	Budapest - Váci út irodaház	8901	Magyarország	Zala	Zalaegerszeg	Kodály körönd	45/A	ABC Kereskedelmi Kft.	horvath.bernadett426@abc-kft.hu	+36 31 932 6251	94eda3e8-6e8f-45df-a5f2-9690f2c19ccf	\N
c0f10dc2-ce91-4dac-b679-3bb93e66a915	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0426	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Tetőfedő	2021-03-08	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Zalán	Török	male	1973-10-18	Székesfehérvár	Máté Gabriella	5967551418	\N	517-040-377	married	2021-03-08	\N	\N	37932159-97665435-21506532	Kecskemét - Gyárvárosi építkezés	9027	Magyarország	Győr-Moson-Sopron	Győr	Bartók Béla út	60	ABC Kereskedelmi Kft.	torok.zalan427@abc-kft.hu	+36 30 860 9178	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
ff73fb36-a267-45b8-b6d7-7a0df9438fa1	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0427	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Épületgépész	2024-10-16	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Piroska	Balogh	female	2000-02-10	Székesfehérvár	Antal Krisztina	\N	\N	000-320-335	single	2024-10-16	\N	\N	16252120-21859927-21239090	Budapest - Dél-Buda fejlesztés	7629	Magyarország	Baranya	Pécs	Munkácsy Mihály utca	60	ABC Kereskedelmi Kft.	balogh.piroska428@abc-kft.hu	+36 70 196 9666	13ad850c-f7c6-4b1c-8119-b2a785a56673	\N
f17690fa-fdc7-4d2e-8d02-388343e57a1f	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0428	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Szigetelő	2022-05-18	\N	Nyelvtudás: angol alapfok.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Dezső	Jakab	male	2006-05-27	Kecskemét	Deák Hajnalka	\N	\N	793-068-656	single	2022-05-18	\N	\N	\N	Szeged - Belváros rekonstrukció	6031	Magyarország	Bács-Kiskun	Kecskemét	Mátyás király utca	126	ABC Kereskedelmi Kft.	jakab.dezso429@abc-kft.hu	+36 30 292 5883	b4888603-1870-4196-ad56-4c55471e98d7	\N
2bd38255-0113-44d5-8430-a10d901b9ef0	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0429	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Kőműves	2022-05-10	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Erika	Gulyás	female	1970-10-08	Szolnok	Budai Lili	3572709452	AB3756513	199-260-874	single	2022-05-10	\N	\N	\N	Miskolc - Diósgyőri felújítás	4028	Magyarország	Hajdú-Bihar	Debrecen	Bethlen Gábor utca	77	ABC Kereskedelmi Kft.	gulyas.erika430@abc-kft.hu	+36 50 696 7150	\N	\N
e3e4440e-fa2b-485b-bbc6-61db86d38962	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0430	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Biztonsági őr	2021-02-16	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Anikó	Illés	female	1968-11-01	Szolnok	Fazekas Diána	8758585536	\N	579-141-584	single	2021-02-16	\N	\N	33884631-67319705-55212595	Budapest - Angyalföld építkezés	4032	Magyarország	Hajdú-Bihar	Debrecen	Bajcsy-Zsilinszky utca	57	ABC Kereskedelmi Kft.	illes.aniko431@abc-kft.hu	+36 20 806 8251	35af414c-1808-4056-8fcf-0bdfd33b9862	\N
76f63095-b9dd-43ef-891b-4049001df309	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0431	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Minőségellenőr	2024-11-03	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Julianna	Fazekas	female	2004-04-26	Miskolc	Pintér Zoé	5170721021	\N	900-151-830	single	2024-11-03	\N	\N	49735068-26082310-75755994	Budapest - Csepel ipari park	6800	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Bajcsy-Zsilinszky utca	148/A	ABC Kereskedelmi Kft.	fazekas.julianna432@abc-kft.hu	+36 50 331 8570	\N	\N
80a2b45b-06d1-4ba3-b6a3-f268b43ccc0c	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0432	80b828b8-e846-455b-b9ac-36a60a30d6d3	Vasbetonszerelő	2026-11-22	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Ilona	Juhász	female	1979-09-14	Érd	Kozma Nóra	9847947615	\N	145-173-768	single	2026-11-22	\N	\N	99767110-33254457-28979123	Budapest - Váci út irodaház	2100	Magyarország	Pest	Gödöllő	Széchenyi István tér	94	ABC Kereskedelmi Kft.	juhasz.ilona433@abc-kft.hu	+36 50 282 5259	acac124f-7479-48fa-a1ac-b7d62b6489fc	\N
1a1f78e4-d342-4121-a511-c81255c31e7e	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0433	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Adminisztrátor	2022-09-16	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Csilla	Papp	female	1995-06-12	Dunaújváros	Varga Orsolya	9836562251	\N	499-500-297	married	2022-09-16	\N	\N	18428995-20627811-81599507	Miskolc - Diósgyőri felújítás	9401	Magyarország	Győr-Moson-Sopron	Sopron	Deák Ferenc utca	12	ABC Kereskedelmi Kft.	papp.csilla434@abc-kft.hu	+36 30 104 7676	\N	\N
53fb25af-3cc6-48ee-a870-50be3b94e7e8	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0434	80b828b8-e846-455b-b9ac-36a60a30d6d3	Munkavédelmi felelős	2026-02-12	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Zoltán	Szilágyi	male	1981-09-29	Gödöllő	Király Dóra	6808335048	PD2206070	\N	married	2026-02-12	\N	\N	83237988-22896519-50595979	Budapest - Budaörs logisztikai központ	2100	Magyarország	Pest	Gödöllő	Bartók Béla út	138	ABC Kereskedelmi Kft.	szilagyi.zoltan435@abc-kft.hu	+36 50 930 2905	7c65ce89-c2e7-4a79-8cac-311051629c78	\N
40a56d8f-fdd2-451c-925b-08b059545c8b	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0435	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Rakodómunkás	2024-09-18	\N	Első munkahelyes, szakmai gyakorlat keretében.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Zsuzsanna	Kelemen	female	1970-10-11	Hódmezővásárhely	Pál Julianna	0779507767	\N	548-000-629	single	2024-09-18	\N	\N	98866536-71798629-18364224	Budapest - Újpest raktártelep	7622	Magyarország	Baranya	Pécs	Liszt Ferenc tér	40	ABC Kereskedelmi Kft.	kelemen.zsuzsanna436@abc-kft.hu	+36 20 324 3566	\N	\N
0f2ff6db-24f2-4473-bdf7-7831c4fdb926	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0436	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Állványozó	2022-04-04	\N	B kategóriás jogosítvánnyal rendelkezik.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Zalán	Horváth	male	1968-04-26	Gödöllő	Kis Vivien	\N	PJ8115033	\N	divorced	2022-04-04	2028-07-31	\N	49344800-53333786-80688007	Győr - Északi Ipari Park	5001	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Munkácsy Mihály utca	94/A	ABC Kereskedelmi Kft.	horvath.zalan437@abc-kft.hu	+36 20 198 5587	\N	\N
a7638833-a9c8-4fc3-abf7-b42ef44a187b	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0437	80b828b8-e846-455b-b9ac-36a60a30d6d3	Rakodómunkás	2025-12-05	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Gergő	Sipos	male	1991-03-26	Miskolc	Szilágyi Tímea	5882571990	EL6791036	\N	married	2025-12-05	\N	\N	95535948-82277680-91862433	Budapest - Angyalföld építkezés	2600	Magyarország	Pest	Vác	Bartók Béla út	150/B	ABC Kereskedelmi Kft.	sipos.gergo438@abc-kft.hu	+36 70 817 4356	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
5a046b36-d2f0-4d00-a1db-4384bd43fc21	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0438	80b828b8-e846-455b-b9ac-36a60a30d6d3	Vízvezeték-szerelő	2023-06-09	\N	Első munkahelyes, szakmai gyakorlat keretében.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Emese	Hegedűs	female	1963-12-10	Vác	Kovács Erika	3642726443	HY9242447	722-525-554	married	2023-06-09	\N	\N	\N	Kecskemét - Gyárvárosi építkezés	4431	Magyarország	Szabolcs-Szatmár-Bereg	Nyíregyháza	Jókai Mór utca	67	ABC Kereskedelmi Kft.	hegedus.emese439@abc-kft.hu	+36 31 196 5894	\N	\N
5b4094fd-2fca-4a0f-83de-032dabd4669a	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0439	f2254bf6-b3ef-48f6-b5ee-a8f9ac2d9fed	Karbantartó	2026-08-26	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Bianka	Boros	female	1977-04-19	Győr	Kis Lili	6767008413	\N	\N	married	2026-08-26	\N	\N	95061747-34639800-21984266	Budapest - Dél-Buda fejlesztés	8201	Magyarország	Veszprém	Veszprém	Petőfi Sándor utca	123	ABC Kereskedelmi Kft.	boros.bianka440@abc-kft.hu	+36 30 208 5992	\N	\N
f3543568-392f-469e-8c8b-8610617df70f	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0440	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Burkoló	2025-11-08	\N	Túlóra vállalására hajlandó.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Zsolt	Balog	male	1988-10-22	Cegléd	Bogdán Veronika	\N	\N	\N	married	2025-11-08	\N	\N	30629914-81194177-91579881	Székesfehérvár - Gyáripari terület	9401	Magyarország	Győr-Moson-Sopron	Sopron	Széchenyi István tér	114/C	ABC Kereskedelmi Kft.	balog.zsolt441@abc-kft.hu	+36 50 153 6994	\N	\N
5b6b9350-694e-477a-86a1-5e5850bb1b8c	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0441	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Műszaki ellenőr	2023-01-05	\N	B kategóriás jogosítvánnyal rendelkezik.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Bence	Sipos	male	2003-10-29	Érd	Veres Krisztina	\N	\N	537-399-608	married	2023-01-05	\N	\N	88226316-24056694-43228242	Budapest - Angyalföld építkezés	2030	Magyarország	Pest	Érd	Bocskai utca	56	ABC Kereskedelmi Kft.	sipos.bence442@abc-kft.hu	+36 30 603 1478	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
6b47888d-539c-489b-8e0c-077f4c3def2b	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0442	80b828b8-e846-455b-b9ac-36a60a30d6d3	Zsaluzó	2026-10-25	\N	Részmunkaidős foglalkoztatás.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Bianka	Molnár	female	1976-08-06	Vác	Kelemen Boglárka	7119033172	HZ4030405	300-864-274	single	2026-10-25	\N	\N	50910174-36314804-85685746	Szeged - Belváros rekonstrukció	5002	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Liszt Ferenc tér	68	ABC Kereskedelmi Kft.	molnar.bianka443@abc-kft.hu	+36 70 810 7524	acfc75f8-6ffd-4fc4-aaf4-e51409068b30	\N
c27c0a98-7e4a-4112-95c6-d5f690379625	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0443	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Gépkezelő	2022-11-28	\N	Új munkaerő, betanulás alatt.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Veronika	Szilágyi	female	1981-04-04	Kecskemét	Kocsis Mária	\N	\N	\N	divorced	2022-11-28	\N	\N	23704987-32579122-79740531	Budapest - Csepel ipari park	2100	Magyarország	Pest	Gödöllő	Kazinczy utca	59	ABC Kereskedelmi Kft.	szilagyi.veronika444@abc-kft.hu	+36 30 622 3146	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
7005fba0-e678-4498-8df3-485ce4966cde	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0444	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Vasbetonszerelő	2021-07-27	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Roland	Jakab	male	1991-12-17	Zalaegerszeg	Balázs Emese	6847825064	KK9907807	579-773-215	married	2021-07-27	\N	\N	\N	Budapest - Csepel ipari park	6000	Magyarország	Bács-Kiskun	Kecskemét	Kölcsey utca	130	ABC Kereskedelmi Kft.	jakab.roland445@abc-kft.hu	+36 30 408 5179	7c65ce89-c2e7-4a79-8cac-311051629c78	\N
b6bb7110-530c-4e7a-8461-ae82490615d3	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0445	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Építésvezető	2025-11-28	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Béla	Németh	male	2001-09-15	Szeged	Varga Ilona	3828127277	\N	368-504-301	divorced	2025-11-28	\N	\N	40391038-22443455-71978949	Miskolc - Diósgyőri felújítás	3300	Magyarország	Heves	Eger	Templom utca	71/C	ABC Kereskedelmi Kft.	nemeth.bela446@abc-kft.hu	+36 20 288 9017	acfc75f8-6ffd-4fc4-aaf4-e51409068b30	\N
c87bbf50-e8d8-4103-9e1b-4e94d9a0cf50	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0446	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Zsaluzó	2021-06-27	\N	Első munkahelyes, szakmai gyakorlat keretében.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Miklós	Rácz	male	1990-07-28	Székesfehérvár	Pintér Hanna	7754945253	\N	157-573-809	single	2021-06-27	\N	\N	37553256-10355202-45923985	Budapest - Dél-Buda fejlesztés	2801	Magyarország	Komárom-Esztergom	Tatabánya	Vörösmarty utca	89/A	ABC Kereskedelmi Kft.	racz.miklos447@abc-kft.hu	+36 31 858 3351	d24a0a6b-de8f-4afc-8fc3-9ba31235ad91	\N
4ff8c7f4-d17f-4b57-8de3-c635cb4a72f9	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0447	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Vízvezeték-szerelő	2025-04-16	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Mihály	Takács	male	1962-06-18	Szolnok	Lakatos Katalin	\N	\N	465-785-403	married	2025-04-16	\N	\N	\N	Debrecen - Ipari Park	5001	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Kossuth Lajos utca	126/C	ABC Kereskedelmi Kft.	takacs.mihaly448@abc-kft.hu	+36 50 113 2685	\N	\N
b2003f3d-a802-4980-8d3c-a208025b1863	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0448	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Takarító	2025-04-27	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Bence	Horváth	male	2002-06-21	Cegléd	Kovács Beáta	3173434429	\N	192-870-147	single	2025-04-27	2026-10-30	\N	49072619-25413043-15634959	Budapest - Újpest raktártelep	9700	Magyarország	Vas	Szombathely	Arany János utca	58	ABC Kereskedelmi Kft.	horvath.bence449@abc-kft.hu	+36 70 431 5310	\N	\N
00d20b1f-549f-4d9d-a096-38e1691c1884	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0449	80b828b8-e846-455b-b9ac-36a60a30d6d3	Műszaki ellenőr	2023-07-12	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Bendegúz	Papp	male	1984-10-28	Gödöllő	Kocsis Emese	9387665997	HY2597370	\N	single	2023-07-12	\N	\N	64012955-42183825-75502231	Debrecen - Ipari Park	5601	Magyarország	Békés	Békéscsaba	Deák Ferenc utca	119	ABC Kereskedelmi Kft.	papp.bendeguz450@abc-kft.hu	+36 20 990 8017	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
aef64191-fe4c-4d4e-b8ae-1232d3b33043	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0450	c5d51752-dff2-4728-a944-c3692937106f	Biztonsági őr	2022-12-27	2026-12-21	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Ferenc	Török	male	1990-05-06	Zalaegerszeg	Németh Ágnes	\N	\N	715-559-946	divorced	2022-12-27	\N	\N	99125426-98537334-95737443	Szeged - Belváros rekonstrukció	2500	Magyarország	Komárom-Esztergom	Esztergom	Bethlen Gábor utca	44	ABC Kereskedelmi Kft.	torok.ferenc451@abc-kft.hu	+36 70 649 6931	\N	\N
35f62bdd-6ec1-44f0-ad7f-a8798a51ff55	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0451	80b828b8-e846-455b-b9ac-36a60a30d6d3	Épületgépész	2023-02-14	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Mária	Balogh	female	1994-05-07	Gödöllő	Pál Viktória	4537807190	\N	658-455-051	married	2023-02-14	2028-11-23	\N	\N	Kecskemét - Gyárvárosi építkezés	6800	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Liszt Ferenc tér	107	ABC Kereskedelmi Kft.	balogh.maria452@abc-kft.hu	+36 70 453 6203	d24a0a6b-de8f-4afc-8fc3-9ba31235ad91	\N
c9483e8f-7489-46d5-9ee3-3a5a68ae0107	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0452	80b828b8-e846-455b-b9ac-36a60a30d6d3	Épületgépész	2026-12-20	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Zoltán	Jakab	male	1972-08-10	Kaposvár	Tóth Zsuzsanna	0212033185	\N	765-010-677	single	2026-12-20	\N	\N	44445421-31218719-95803658	Győr - Északi Ipari Park	3526	Magyarország	Borsod-Abaúj-Zemplén	Miskolc	Dózsa György út	68	ABC Kereskedelmi Kft.	jakab.zoltan453@abc-kft.hu	+36 20 887 6438	b4888603-1870-4196-ad56-4c55471e98d7	\N
349ac71c-fbb2-4da1-80c1-2c3d49949897	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0453	80b828b8-e846-455b-b9ac-36a60a30d6d3	Irodai asszisztens	2021-11-07	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Katalin	Kelemen	female	1984-08-26	Zalaegerszeg	Tóth Edina	2184954702	\N	\N	married	2021-11-07	\N	\N	\N	Győr - Északi Ipari Park	9700	Magyarország	Vas	Szombathely	Petőfi Sándor utca	143	ABC Kereskedelmi Kft.	kelemen.katalin454@abc-kft.hu	+36 20 345 2307	d24a0a6b-de8f-4afc-8fc3-9ba31235ad91	\N
fe514a2d-8aa4-4827-ad97-a0e0c6ff41d1	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0454	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Könyvelő	2022-04-11	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Nóra	Király	female	1980-09-08	Vác	Boros Mária	3420069388	\N	183-095-092	married	2022-04-11	\N	\N	77757452-49936504-65513156	Debrecen - Ipari Park	2500	Magyarország	Komárom-Esztergom	Esztergom	Szent István tér	144	ABC Kereskedelmi Kft.	kiraly.nora455@abc-kft.hu	+36 30 990 2507	0d08cbc6-b692-4e7c-b269-f47eb41d996a	\N
e77348dc-585b-4930-b2fe-18edb3121131	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0455	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Projektkoordinátor	2025-01-06	\N	Tapasztalt dolgozó, megbízható.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Norbert	Kovács	male	1971-09-21	Nyíregyháza	Horváth Hajnalka	1380642432	ZM1592566	090-908-894	married	2025-01-06	\N	\N	27019473-39394659-59111031	Székesfehérvár - Gyáripari terület	2401	Magyarország	Fejér	Dunaújváros	Zrínyi utca	130	ABC Kereskedelmi Kft.	kovacs.norbert456@abc-kft.hu	+36 20 913 6752	2779c0ef-9d97-470f-839c-f818469d43d6	\N
c4bcff6a-3d4c-49fe-a8ac-3b40916a12a7	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0456	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Gondnok	2025-12-20	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Bendegúz	Veres	male	1963-01-13	Nyíregyháza	Szűcs Orsolya	6432082619	\N	450-565-897	married	2025-12-20	\N	\N	45063539-63749708-85973389	Budapest - Budaörs logisztikai központ	2501	Magyarország	Komárom-Esztergom	Esztergom	Templom utca	57	ABC Kereskedelmi Kft.	veres.bendeguz457@abc-kft.hu	+36 70 822 9304	7c65ce89-c2e7-4a79-8cac-311051629c78	\N
9d52e52e-41fb-4212-918b-4b744d0c0f11	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0457	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Vasbetonszerelő	2023-03-11	\N	C kategóriás jogosítvánnyal rendelkezik.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Bence	Szabó	male	1961-09-12	Sopron	Jakab Bianka	\N	\N	835-233-196	married	2023-03-11	\N	\N	36359490-76051537-36523396	Szeged - Belváros rekonstrukció	2700	Magyarország	Pest	Cegléd	Hunyadi utca	53/A	ABC Kereskedelmi Kft.	szabo.bence458@abc-kft.hu	+36 30 817 6715	\N	\N
a2d20552-5c0f-458b-b49e-dd67b4fb5659	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0458	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Segédmunkás	2025-02-21	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Krisztián	Deák	male	1971-08-23	Szeged	Fekete Andrea	\N	\N	894-053-565	married	2025-02-21	2027-02-07	\N	92571927-92480030-61844520	Budapest - Angyalföld építkezés	2803	Magyarország	Komárom-Esztergom	Tatabánya	Bethlen Gábor utca	30	ABC Kereskedelmi Kft.	deak.krisztian459@abc-kft.hu	+36 70 415 4050	\N	\N
4e8d651a-dbb4-4a9f-bd4e-372a89347256	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0459	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Munkavédelmi felelős	2026-01-11	\N	Előző munkahelyről jó referenciával érkezett.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Zsófia	Szilágyi	female	2001-01-05	Dunaújváros	Magyar Judit	9399302678	\N	\N	married	2026-01-11	\N	\N	\N	Debrecen - Ipari Park	2100	Magyarország	Pest	Gödöllő	Dózsa György út	47	ABC Kereskedelmi Kft.	szilagyi.zsofia460@abc-kft.hu	+36 50 909 5787	7c65ce89-c2e7-4a79-8cac-311051629c78	\N
fe39a873-0695-4c3e-ac09-f84436221653	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0460	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Épületgépész	2021-08-21	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	István	Juhász	male	1974-08-21	Szolnok	Somogyi Mária	5845455174	\N	188-874-098	married	2021-08-21	\N	\N	\N	Debrecen - Ipari Park	8901	Magyarország	Zala	Zalaegerszeg	Bem József utca	29	ABC Kereskedelmi Kft.	juhasz.istvan461@abc-kft.hu	+36 70 567 8739	\N	\N
7bdc8f9b-5016-409c-841a-a2d99b6a8f5c	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0461	80b828b8-e846-455b-b9ac-36a60a30d6d3	Műszaki ellenőr	2021-12-05	\N	Többéves iparági tapasztalat.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Ferenc	Jakab	male	1998-11-21	Kaposvár	Kozma Lili	9866734032	\N	413-937-039	married	2021-12-05	\N	\N	\N	Budapest - Angyalföld építkezés	7400	Magyarország	Somogy	Kaposvár	Bajcsy-Zsilinszky utca	88/A	ABC Kereskedelmi Kft.	jakab.ferenc462@abc-kft.hu	+36 30 130 7030	\N	\N
fe58fc4b-7fe8-47f8-8735-2494403997f4	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0480	c5d51752-dff2-4728-a944-c3692937106f	Építésvezető	2025-07-10	2024-09-25	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Dániel	Farkas	male	1970-11-24	Nyíregyháza	Szilágyi Klára	4707876087	VZ5679560	349-433-242	married	2025-07-10	\N	\N	61268287-47564958-67830833	Debrecen - Ipari Park	8900	Magyarország	Zala	Zalaegerszeg	Templom utca	48/C	ABC Kereskedelmi Kft.	farkas.daniel481@abc-kft.hu	+36 50 490 8000	\N	\N
5b506ce6-2404-4118-91a2-5e40ddba4526	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0462	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Burkoló	2025-01-01	\N	Próbaidős időszak alatt.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Dominik	Kocsis	male	2002-08-21	Nyíregyháza	Király Erzsébet	1089265348	\N	197-170-800	single	2025-01-01	\N	\N	69152461-72730445-62549619	Szeged - Belváros rekonstrukció	6001	Magyarország	Bács-Kiskun	Kecskemét	Bartók Béla út	89	ABC Kereskedelmi Kft.	kocsis.dominik463@abc-kft.hu	+36 50 372 6421	\N	\N
26204e7c-64a6-47ca-9448-f6522faa2b3b	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0463	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Villanyszerelő	2021-12-25	\N	Túlóra vállalására hajlandó.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Katalin	Kiss	female	1998-01-19	Szeged	Gulyás Edina	8096408304	\N	796-563-672	single	2021-12-25	\N	\N	32680990-52250984-70114339	Budapest - Dél-Buda fejlesztés	8900	Magyarország	Zala	Zalaegerszeg	Deák Ferenc utca	77	ABC Kereskedelmi Kft.	kiss.katalin464@abc-kft.hu	+36 70 532 4148	13ad850c-f7c6-4b1c-8119-b2a785a56673	\N
b48f243f-b36f-45b7-ae2d-99fc767df352	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0464	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Ács	2022-05-21	\N	Külföldi munkavállalási engedéllyel rendelkezik.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Ernő	Oláh	male	1973-02-09	Pécs	Takács Julianna	7533936841	\N	779-127-404	married	2022-05-21	\N	\N	70086791-28316748-35241870	Miskolc - Diósgyőri felújítás	7401	Magyarország	Somogy	Kaposvár	Liszt Ferenc tér	100	ABC Kereskedelmi Kft.	olah.erno465@abc-kft.hu	+36 31 652 5541	b4888603-1870-4196-ad56-4c55471e98d7	\N
76ac3918-8602-4845-b191-2e77af19552a	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0465	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Minőségellenőr	2023-01-09	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Gyula	Somogyi	male	2005-05-17	Vác	Nagy Zoé	3494553998	\N	137-809-562	single	2023-01-09	\N	\N	\N	Budapest - Dél-Buda fejlesztés	2401	Magyarország	Fejér	Dunaújváros	Rákóczi út	52	ABC Kereskedelmi Kft.	somogyi.gyula466@abc-kft.hu	+36 20 954 1919	94eda3e8-6e8f-45df-a5f2-9690f2c19ccf	\N
602d5ede-0728-4608-ae22-320b2e72bddb	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0466	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Daruzó	2021-08-29	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Anna	Jakab	female	1965-02-01	Cegléd	Veres Boglárka	6947809334	\N	667-641-537	married	2021-08-29	\N	\N	85845526-77497490-14287762	Budapest - Váci út irodaház	8003	Magyarország	Fejér	Székesfehérvár	Mátyás király utca	9	ABC Kereskedelmi Kft.	jakab.anna467@abc-kft.hu	+36 20 799 5264	\N	\N
1ad2ecf0-273d-4bf1-b256-fe44b2d05124	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0467	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Villanyszerelő	2025-07-23	\N	Tapasztalt dolgozó, megbízható.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Mária	Simon	female	1988-12-11	Miskolc	Deák Fruzsina	7129424180	\N	529-442-723	married	2025-07-23	2028-01-28	\N	64195739-33430293-19065627	Kecskemét - Gyárvárosi építkezés	2800	Magyarország	Komárom-Esztergom	Tatabánya	Petőfi Sándor utca	132	ABC Kereskedelmi Kft.	simon.maria468@abc-kft.hu	+36 50 940 6205	b4888603-1870-4196-ad56-4c55471e98d7	\N
b8b87075-aa27-478d-ae0c-a3b0e70faa1a	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0468	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Tűzvédelmi felelős	2024-10-18	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Kornél	Kis	male	1990-10-29	Kecskemét	Nemes Hanna	5575512583	DR1352094	868-959-325	married	2024-10-18	\N	\N	90052526-30269473-77747236	Budapest - Budaörs logisztikai központ	2400	Magyarország	Fejér	Dunaújváros	Petőfi Sándor utca	129/A	ABC Kereskedelmi Kft.	kis.kornel469@abc-kft.hu	+36 31 593 2792	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
6ff1c292-9097-4514-a42c-f5ba6af0ddb5	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0469	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Adminisztrátor	2025-08-12	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Márk	Papp	male	1992-04-06	Kaposvár	Kovács Mónika	8142156961	\N	387-950-266	divorced	2025-08-12	\N	\N	45997571-80773289-13157857	Kecskemét - Gyárvárosi építkezés	9400	Magyarország	Győr-Moson-Sopron	Sopron	Bartók Béla út	47	ABC Kereskedelmi Kft.	papp.mark470@abc-kft.hu	+36 50 512 8108	13ad850c-f7c6-4b1c-8119-b2a785a56673	\N
af449cb2-cc33-4f58-986f-10f5f8b99a3a	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0470	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Vasbetonszerelő	2023-07-10	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Julianna	Kocsis	female	1965-03-26	Vác	Hegedűs Viktória	8805005635	\N	027-357-501	single	2023-07-10	\N	\N	71929884-14756720-18871842	Budapest - Váci út irodaház	9701	Magyarország	Vas	Szombathely	Vörösmarty utca	141	ABC Kereskedelmi Kft.	kocsis.julianna471@abc-kft.hu	+36 70 155 5885	\N	\N
0695da05-247f-4926-908b-604f4166bceb	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0471	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Művezető	2024-03-20	\N	Havi bruttó bér: 810 000 Ft	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Balázs	Hegedűs	male	1966-02-05	Szolnok	Mészáros Gabriella	\N	\N	322-213-383	married	2024-03-20	2026-11-15	\N	59394963-13073479-10519796	Budapest - Váci út irodaház	6000	Magyarország	Bács-Kiskun	Kecskemét	Jókai Mór utca	48	ABC Kereskedelmi Kft.	hegedus.balazs472@abc-kft.hu	+36 50 630 6152	\N	\N
f879f610-5a65-41af-be18-aa9d32dcd703	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0472	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Állványozó	2026-07-17	\N	Előző munkahelyről jó referenciával érkezett.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Mihály	Deák	male	2006-04-04	Miskolc	Nagy Emese	2847877081	EV3145169	181-390-071	married	2026-07-17	2028-02-19	\N	43142710-33456787-52449557	Székesfehérvár - Gyáripari terület	2500	Magyarország	Komárom-Esztergom	Esztergom	Kossuth Lajos utca	146	ABC Kereskedelmi Kft.	deak.mihaly473@abc-kft.hu	+36 31 490 4917	\N	\N
b45b72bd-9c60-4b65-b40b-14d2bdf8cc37	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0473	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Rakodómunkás	2022-05-26	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	György	Fazekas	male	1969-02-28	Vác	Antal Dóra	8600283978	\N	053-244-137	widowed	2022-05-26	2026-11-27	\N	98175682-79288262-85941854	Budapest - Budaörs logisztikai központ	8900	Magyarország	Zala	Zalaegerszeg	Mikszáth Kálmán tér	41/B	ABC Kereskedelmi Kft.	fazekas.gyorgy474@abc-kft.hu	+36 70 858 1102	94eda3e8-6e8f-45df-a5f2-9690f2c19ccf	\N
a0a70f86-118c-4e7a-bc1f-d01616e82cdc	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0474	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Karbantartó	2025-02-04	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Levente	Balázs	male	2005-01-22	Debrecen	Virág Erika	\N	XG3676873	413-007-377	married	2025-02-04	\N	\N	38800677-75089506-88720948	Székesfehérvár - Gyáripari terület	5601	Magyarország	Békés	Békéscsaba	Rákóczi út	113	ABC Kereskedelmi Kft.	balazs.levente475@abc-kft.hu	+36 20 528 9969	b4888603-1870-4196-ad56-4c55471e98d7	\N
71c150b9-0bc3-4c03-85e4-5a6fd89b7b51	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0475	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Munkavédelmi felelős	2021-07-31	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Katalin	Fekete	female	1980-03-06	Eger	Balogh Renáta	\N	\N	\N	single	2021-07-31	2026-02-06	\N	10026676-41593116-64606425	Budapest - Újpest raktártelep	9028	Magyarország	Győr-Moson-Sopron	Győr	Deák Ferenc utca	38	ABC Kereskedelmi Kft.	fekete.katalin476@abc-kft.hu	+36 31 482 8550	acfc75f8-6ffd-4fc4-aaf4-e51409068b30	\N
c30c8ca9-430e-47e0-aa4b-c0e82b75266c	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0476	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Zsaluzó	2025-09-18	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Orsolya	Balogh	female	1989-07-27	Nyíregyháza	Fekete Petra	8694042417	\N	607-469-503	married	2025-09-18	\N	\N	69527267-54089483-50504152	Kecskemét - Gyárvárosi építkezés	3304	Magyarország	Heves	Eger	Petőfi Sándor utca	133/C	ABC Kereskedelmi Kft.	balogh.orsolya477@abc-kft.hu	+36 50 890 6361	\N	\N
f1bd85c5-382f-4dae-aee9-af1e11d083ab	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0477	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Műszaki ellenőr	2026-03-28	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Lajos	Máté	male	1964-09-24	Vác	Rácz Gabriella	9030546270	KA4109162	509-851-298	single	2026-03-28	\N	\N	41655031-30947109-10763425	Budapest - Váci út irodaház	2803	Magyarország	Komárom-Esztergom	Tatabánya	Mikszáth Kálmán tér	58	ABC Kereskedelmi Kft.	mate.lajos478@abc-kft.hu	+36 20 794 2172	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
b1c1ce2a-f64f-4f4f-a9c8-9ba8fea95d42	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0478	f2254bf6-b3ef-48f6-b5ee-a8f9ac2d9fed	Biztonsági őr	2023-11-11	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	András	Fekete	male	1978-01-27	Dunaújváros	Nagy Anikó	6354119213	\N	668-652-708	single	2023-11-11	\N	\N	27212226-73690122-89708711	Győr - Északi Ipari Park	8200	Magyarország	Veszprém	Veszprém	Széchenyi István tér	132	ABC Kereskedelmi Kft.	fekete.andras479@abc-kft.hu	+36 20 786 1018	\N	\N
23d21dab-e8cc-4b42-8975-2cdc5da12302	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0479	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Vasbetonszerelő	2022-01-21	\N	Többéves iparági tapasztalat.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Petra	Kis	female	1991-01-16	Szeged	Mészáros Beáta	9572150157	\N	477-477-495	married	2022-01-21	\N	\N	97487461-66341498-76078846	Szeged - Belváros rekonstrukció	5002	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Batthyány utca	49	ABC Kereskedelmi Kft.	kis.petra480@abc-kft.hu	+36 30 332 3726	d24a0a6b-de8f-4afc-8fc3-9ba31235ad91	\N
3d5c6362-e404-46e8-894f-5100abf01ff6	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0481	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Gondnok	2026-12-15	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Patrik	Pál	male	1996-09-22	Zalaegerszeg	Szilágyi Diána	9837239150	GM2205151	081-484-634	single	2026-12-15	\N	\N	49183347-23415861-63405869	Székesfehérvár - Gyáripari terület	8201	Magyarország	Veszprém	Veszprém	Rákóczi út	129/C	ABC Kereskedelmi Kft.	pal.patrik482@abc-kft.hu	+36 20 193 7221	d24a0a6b-de8f-4afc-8fc3-9ba31235ad91	\N
d616212a-7c7b-4eee-bf53-5a8f3582ad6e	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0482	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Rakodómunkás	2021-05-25	\N	C kategóriás jogosítvánnyal rendelkezik.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Klára	Simon	female	2006-08-15	Eger	Vincze Piroska	3485477932	DF3795099	956-488-500	single	2021-05-25	\N	\N	58088507-65046012-93012377	Miskolc - Diósgyőri felújítás	7625	Magyarország	Baranya	Pécs	Liszt Ferenc tér	64	ABC Kereskedelmi Kft.	simon.klara483@abc-kft.hu	+36 31 845 9278	7c65ce89-c2e7-4a79-8cac-311051629c78	\N
4c969e49-da25-443a-9f1c-df86bb0c328a	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0483	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Daruzó	2023-01-10	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Zsófia	Tóth	female	1990-03-04	Békéscsaba	Horváth Luca	4654965094	\N	\N	married	2023-01-10	\N	\N	86893420-22950011-70937646	Budapest - Váci út irodaház	8002	Magyarország	Fejér	Székesfehérvár	Bocskai utca	93	ABC Kereskedelmi Kft.	toth.zsofia484@abc-kft.hu	+36 30 560 1492	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
0c1b9cb7-d0b4-472e-a175-11837e9b3be6	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0484	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Munkavédelmi felelős	2023-07-03	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Levente	Juhász	male	1991-06-21	Kecskemét	Jakab Éva	7551801806	\N	224-030-273	single	2023-07-03	\N	\N	\N	Budapest - Váci út irodaház	5000	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Damjanich utca	67	ABC Kereskedelmi Kft.	juhasz.levente485@abc-kft.hu	+36 70 442 9510	\N	\N
02271488-8d9a-411c-b0d6-72846079e6f8	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0485	c5d51752-dff2-4728-a944-c3692937106f	Segédmunkás	2026-02-04	2026-04-06	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Orsolya	Máté	female	1967-04-22	Győr	Gál Gabriella	4439151044	\N	\N	married	2026-02-04	\N	\N	\N	Budapest - Budaörs logisztikai központ	4030	Magyarország	Hajdú-Bihar	Debrecen	Móricz Zsigmond körtér	70	ABC Kereskedelmi Kft.	mate.orsolya486@abc-kft.hu	+36 30 485 9939	\N	\N
6fe3b9cd-f15f-4e49-a12a-5f5cac80b36b	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0486	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Festő	2026-06-15	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Sára	Takács	female	2005-10-12	Kaposvár	Pintér Fanni	\N	\N	676-119-311	single	2026-06-15	\N	\N	19165218-52239279-71000115	Győr - Északi Ipari Park	7401	Magyarország	Somogy	Kaposvár	Bajcsy-Zsilinszky utca	130	ABC Kereskedelmi Kft.	takacs.sara487@abc-kft.hu	+36 20 631 5567	acac124f-7479-48fa-a1ac-b7d62b6489fc	\N
eddfef91-ae88-4853-ab01-7f8f80ed276d	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0487	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Építésvezető	2021-03-14	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Zsuzsanna	Lukács	female	1976-09-09	Gödöllő	Budai Noémi	1573439470	\N	\N	divorced	2021-03-14	\N	\N	95197307-44085040-65168008	Szeged - Belváros rekonstrukció	3301	Magyarország	Heves	Eger	Arany János utca	80	ABC Kereskedelmi Kft.	lukacs.zsuzsanna488@abc-kft.hu	+36 20 377 9371	b4888603-1870-4196-ad56-4c55471e98d7	\N
285100f2-78d8-4bd8-931e-c7d650dff6f1	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0488	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Szigetelő	2026-02-22	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Emese	Lukács	female	2006-11-27	Miskolc	Budai Erika	9004506305	VV4297698	703-730-842	single	2026-02-22	2028-05-19	\N	\N	Miskolc - Diósgyőri felújítás	2501	Magyarország	Komárom-Esztergom	Esztergom	Széchenyi István tér	126	ABC Kereskedelmi Kft.	lukacs.emese489@abc-kft.hu	+36 30 367 6381	\N	\N
e6515bbf-a9df-4b0c-a4bd-b4577ae426ad	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0489	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Gondnok	2026-01-06	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Viktor	Magyar	male	1967-03-10	Esztergom	Antal Zoé	5244293210	SC8989706	872-524-486	single	2026-01-06	2026-06-18	\N	92105659-94407538-55829860	Miskolc - Diósgyőri felújítás	2700	Magyarország	Pest	Cegléd	Bethlen Gábor utca	27	ABC Kereskedelmi Kft.	magyar.viktor490@abc-kft.hu	+36 30 375 8352	\N	\N
42b0c58e-c9e6-48bb-8588-c5e1f3b420ce	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0490	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Gépkezelő	2022-04-23	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Noel	Veres	male	1964-11-26	Tatabánya	Kozma Zsófia	4447374189	\N	\N	married	2022-04-23	\N	\N	\N	Budapest - Dél-Buda fejlesztés	2600	Magyarország	Pest	Vác	Liszt Ferenc tér	60	ABC Kereskedelmi Kft.	veres.noel491@abc-kft.hu	+36 31 249 6829	\N	\N
97ce19b0-03a7-44aa-aafb-1f5f601d3369	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0491	c5d51752-dff2-4728-a944-c3692937106f	Villanyszerelő	2024-03-17	2026-07-06	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Márk	Veres	male	1971-10-14	Kecskemét	Lukács Réka	1364770222	\N	535-985-623	married	2024-03-17	\N	\N	70830094-66929355-66810492	Budapest - Váci út irodaház	2800	Magyarország	Komárom-Esztergom	Tatabánya	Batthyány utca	76	ABC Kereskedelmi Kft.	veres.mark492@abc-kft.hu	+36 20 626 5842	\N	\N
b3aa4ce2-9fb7-480c-95ca-9f03280b0f0d	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0492	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Gépkezelő	2024-02-13	\N	Túlóra vállalására hajlandó.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Flóra	Fülöp	female	1992-01-06	Szolnok	Fazekas Nóra	2748620149	HY9940772	548-911-441	single	2024-02-13	\N	\N	38106943-53640105-27402472	Budapest - Dél-Buda fejlesztés	2030	Magyarország	Pest	Érd	Liszt Ferenc tér	25/A	ABC Kereskedelmi Kft.	fulop.flora493@abc-kft.hu	+36 20 857 7985	d24a0a6b-de8f-4afc-8fc3-9ba31235ad91	\N
d21f7df0-bd24-44b9-8d9c-2bdc07c76c66	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0493	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Ács	2021-08-04	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Emese	Kiss	female	1961-04-30	Budapest	Balog Klára	\N	\N	283-732-838	single	2021-08-04	\N	\N	24873388-46136428-50057774	Debrecen - Ipari Park	2803	Magyarország	Komárom-Esztergom	Tatabánya	Ady Endre utca	16/A	ABC Kereskedelmi Kft.	kiss.emese494@abc-kft.hu	+36 50 595 9909	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
ff97f42c-89d0-45b5-b914-c94caf41a430	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0494	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Villanyszerelő	2021-05-01	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Gábor	Máté	male	2001-09-23	Székesfehérvár	Oláh Diána	7676929116	DA8957458	088-559-588	divorced	2021-05-01	\N	\N	49138041-92000182-20996988	Budapest - Váci út irodaház	7400	Magyarország	Somogy	Kaposvár	Dózsa György út	1	ABC Kereskedelmi Kft.	mate.gabor495@abc-kft.hu	+36 70 291 8824	b4888603-1870-4196-ad56-4c55471e98d7	\N
3df6cf8f-8ef2-43cf-b5ef-8e0be5f441dd	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0495	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Szigetelő	2021-06-21	\N	Előző munkahelyről jó referenciával érkezett.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Dániel	Gulyás	male	1973-09-08	Zalaegerszeg	Kis Emese	7374769610	RO5968774	066-698-486	single	2021-06-21	\N	\N	70495073-75850856-72115493	Budapest - Angyalföld építkezés	8901	Magyarország	Zala	Zalaegerszeg	Zrínyi utca	5/A	ABC Kereskedelmi Kft.	gulyas.daniel496@abc-kft.hu	+36 70 990 2778	\N	\N
5b9d7ba2-c0a5-4bff-bc33-b13f131ccccb	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0496	f2254bf6-b3ef-48f6-b5ee-a8f9ac2d9fed	Daruzó	2022-09-23	\N	Csapatvezetői potenciállal rendelkezik.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Botond	Vincze	male	1964-07-26	Dunaújváros	Magyar Viktória	9468818375	\N	962-599-710	single	2022-09-23	\N	\N	90501071-44615300-44718952	Budapest - Váci út irodaház	6000	Magyarország	Bács-Kiskun	Kecskemét	Damjanich utca	77	ABC Kereskedelmi Kft.	vincze.botond497@abc-kft.hu	+36 70 837 2202	\N	\N
df50b5a0-abbe-4d34-8bbc-2d7731534ca3	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0497	80b828b8-e846-455b-b9ac-36a60a30d6d3	Vasbetonszerelő	2025-10-14	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Zsolt	Illés	male	1973-08-22	Esztergom	Gulyás Nóra	\N	YW2361000	173-558-716	married	2025-10-14	2026-05-18	\N	64373582-61372832-86914540	Budapest - Dél-Buda fejlesztés	6800	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Rákóczi út	134	ABC Kereskedelmi Kft.	illes.zsolt498@abc-kft.hu	+36 50 836 3311	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
21ebb92c-90c7-408f-b5d3-ff3953610208	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0498	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Munkavédelmi felelős	2025-01-24	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Péter	Sipos	male	1998-05-29	Szombathely	Gulyás Zsuzsanna	\N	XG7894269	703-278-004	divorced	2025-01-24	\N	\N	26672001-82694725-61031573	Budapest - Budaörs logisztikai központ	2030	Magyarország	Pest	Érd	Kölcsey utca	16	ABC Kereskedelmi Kft.	sipos.peter499@abc-kft.hu	+36 70 263 9522	35af414c-1808-4056-8fcf-0bdfd33b9862	\N
fab29bbb-64b1-4763-8ae7-faf89dad3e3e	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0499	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Targoncavezető	2022-08-17	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Balázs	Papp	male	1974-05-01	Győr	Vincze Flóra	2066013213	\N	463-514-720	divorced	2022-08-17	2027-01-07	\N	79480592-79394555-54419403	Debrecen - Ipari Park	7624	Magyarország	Baranya	Pécs	Liszt Ferenc tér	120	ABC Kereskedelmi Kft.	papp.balazs500@abc-kft.hu	+36 31 565 3965	acfc75f8-6ffd-4fc4-aaf4-e51409068b30	\N
2761f675-f859-4fad-8699-a616238fdf26	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0500	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Gondnok	2023-10-21	\N	Túlóra vállalására hajlandó.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Levente	Török	male	1970-03-06	Tatabánya	Török Barbara	0485768204	FZ8307101	\N	married	2023-10-21	\N	\N	\N	Budapest - Budaörs logisztikai központ	2400	Magyarország	Fejér	Dunaújváros	Széchenyi István tér	100	ABC Kereskedelmi Kft.	torok.levente501@abc-kft.hu	+36 30 816 2287	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
8799ca60-c968-4de8-b052-f1b5b1d3a415	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0501	f2254bf6-b3ef-48f6-b5ee-a8f9ac2d9fed	Kőműves	2026-07-11	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Ernő	Katona	male	1978-12-14	Tatabánya	Kelemen Diána	7731039476	PD4610071	952-592-902	married	2026-07-11	\N	\N	\N	Szeged - Belváros rekonstrukció	7400	Magyarország	Somogy	Kaposvár	Kazinczy utca	54	ABC Kereskedelmi Kft.	katona.erno502@abc-kft.hu	+36 31 850 6486	\N	\N
92688c82-95f8-4d93-87fa-8781f02dca33	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0502	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Építésvezető	2024-03-17	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Dávid	Varga	male	2004-12-10	Budapest	Biró Nikolett	3618774265	\N	519-604-571	single	2024-03-17	\N	\N	\N	Győr - Északi Ipari Park	9025	Magyarország	Győr-Moson-Sopron	Győr	Rákóczi út	125/C	ABC Kereskedelmi Kft.	varga.david503@abc-kft.hu	+36 20 553 2053	\N	\N
51016c0a-8de2-4941-a862-5db4fb7c31d1	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0503	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Műszaki ellenőr	2025-12-28	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Tamás	Biró	male	1979-03-10	Dunaújváros	Szalai Lili	6242965684	IC1754660	677-322-795	divorced	2025-12-28	2027-01-28	\N	68194099-48548642-54903415	Székesfehérvár - Gyáripari terület	6720	Magyarország	Csongrád-Csanád	Szeged	Rákóczi út	98	ABC Kereskedelmi Kft.	biro.tamas504@abc-kft.hu	+36 20 574 1324	\N	\N
562e9ebe-a05b-4333-abc6-334e6820b109	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0504	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Biztonsági őr	2026-03-18	\N	Többéves iparági tapasztalat.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Krisztián	Sándor	male	1993-03-06	Dunaújváros	Fülöp Hajnalka	2027763077	\N	135-482-188	married	2026-03-18	\N	\N	83676488-79892008-45460878	Budapest - Budaörs logisztikai központ	2700	Magyarország	Pest	Cegléd	Batthyány utca	132	ABC Kereskedelmi Kft.	sandor.krisztian505@abc-kft.hu	+36 20 197 2811	d24a0a6b-de8f-4afc-8fc3-9ba31235ad91	\N
3e3c0ed6-10a3-4b79-b603-10a59136ae93	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0505	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Minőségellenőr	2023-08-04	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Dominik	Barta	male	1984-03-17	Győr	Sándor Margit	8702711030	\N	458-396-586	married	2023-08-04	\N	\N	42246341-71565031-39989013	Győr - Északi Ipari Park	2401	Magyarország	Fejér	Dunaújváros	Kölcsey utca	13/A	ABC Kereskedelmi Kft.	barta.dominik506@abc-kft.hu	+36 20 402 4724	02137110-1f01-4ea8-9652-cb3057178ec0	\N
13f72310-6050-491d-b836-0de980260149	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0506	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Gépkezelő	2024-10-21	\N	Túlóra vállalására hajlandó.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	József	Vincze	male	1993-10-03	Vác	Sándor Julianna	8717958148	\N	568-898-154	single	2024-10-21	2026-12-11	\N	27652929-87446606-10350885	Budapest - Dél-Buda fejlesztés	7628	Magyarország	Baranya	Pécs	Ady Endre utca	60	ABC Kereskedelmi Kft.	vincze.jozsef507@abc-kft.hu	+36 70 450 4874	0d08cbc6-b692-4e7c-b269-f47eb41d996a	\N
207437f6-4193-4755-b652-43c28c866f81	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0507	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Építésvezető	2023-10-08	\N	Első munkahelyes, szakmai gyakorlat keretében.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Margit	Boros	female	2002-11-15	Szolnok	Molnár Boglárka	0949092784	\N	817-993-005	married	2023-10-08	\N	\N	62010329-68292589-56108897	Szeged - Belváros rekonstrukció	8200	Magyarország	Veszprém	Veszprém	Bethlen Gábor utca	124	ABC Kereskedelmi Kft.	boros.margit508@abc-kft.hu	+36 70 923 6677	acfc75f8-6ffd-4fc4-aaf4-e51409068b30	\N
fa6a073d-de26-4c77-be97-1708997dd215	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0508	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Projektkoordinátor	2024-05-04	\N	B kategóriás jogosítvánnyal rendelkezik.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Szilvia	Takács	female	1983-03-16	Szeged	Biró Krisztina	8215425231	EY3974926	\N	single	2024-05-04	\N	\N	\N	Debrecen - Ipari Park	2100	Magyarország	Pest	Gödöllő	Hunyadi utca	114	ABC Kereskedelmi Kft.	takacs.szilvia509@abc-kft.hu	+36 50 352 6606	0d08cbc6-b692-4e7c-b269-f47eb41d996a	\N
c9c0d3cf-a324-4b0a-b9d5-02c8df1742ec	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0509	80b828b8-e846-455b-b9ac-36a60a30d6d3	Munkavédelmi felelős	2022-09-08	\N	Havi bruttó bér: 302 000 Ft	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Beáta	Juhász	female	2000-12-24	Kecskemét	Szalai Edina	7637434970	\N	\N	single	2022-09-08	\N	\N	74724668-66353952-33846891	Budapest - Angyalföld építkezés	9700	Magyarország	Vas	Szombathely	Rákóczi út	2	ABC Kereskedelmi Kft.	juhasz.beata510@abc-kft.hu	+36 70 924 1881	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
621eadc9-0674-45f3-b44a-85e8f3da4f72	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0510	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Hegesztő	2021-09-11	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Dániel	Pál	male	2005-09-29	Hódmezővásárhely	Illés Szilvia	7903960395	\N	633-229-153	married	2021-09-11	2026-08-08	\N	10115407-33421508-61754755	Kecskemét - Gyárvárosi építkezés	4027	Magyarország	Hajdú-Bihar	Debrecen	Liszt Ferenc tér	120/B	ABC Kereskedelmi Kft.	pal.daniel511@abc-kft.hu	+36 30 362 3371	0d08cbc6-b692-4e7c-b269-f47eb41d996a	\N
99736f44-4a86-4417-81c9-0305097af591	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0511	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	HR asszisztens	2026-01-24	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Kristóf	Takács	male	1996-08-01	Szombathely	Pál Petra	1488801603	\N	744-530-179	single	2026-01-24	\N	\N	24137295-22717357-11587535	Győr - Északi Ipari Park	9701	Magyarország	Vas	Szombathely	Bartók Béla út	80	ABC Kereskedelmi Kft.	takacs.kristof512@abc-kft.hu	+36 70 387 5566	\N	\N
6f58d974-3dfc-4f8e-8942-ddbe630f877a	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0512	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Takarító	2022-12-17	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Viktor	Gulyás	male	1997-12-06	Veszprém	Mészáros Emese	6914331880	IA2874304	754-051-237	divorced	2022-12-17	\N	\N	37823804-98163789-98754900	Budapest - Újpest raktártelep	8002	Magyarország	Fejér	Székesfehérvár	Bartók Béla út	98/C	ABC Kereskedelmi Kft.	gulyas.viktor513@abc-kft.hu	+36 30 831 7573	2779c0ef-9d97-470f-839c-f818469d43d6	\N
3f88c245-0ebd-4569-8be9-20a83d400e43	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0513	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Műszaki ellenőr	2021-03-09	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Levente	Szalai	male	1986-01-10	Szolnok	Gál Piroska	3722571866	\N	762-279-981	married	2021-03-09	\N	\N	89559474-12432766-17967866	Budapest - Angyalföld építkezés	9024	Magyarország	Győr-Moson-Sopron	Győr	Dózsa György út	43	ABC Kereskedelmi Kft.	szalai.levente514@abc-kft.hu	+36 70 224 3065	acfc75f8-6ffd-4fc4-aaf4-e51409068b30	\N
f2cec3a6-e66c-4ad9-a7f3-33ce41c15c23	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0514	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Vízvezeték-szerelő	2026-09-06	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Krisztián	Szilágyi	male	1961-02-01	Cegléd	Kocsis Lili	4821625697	\N	506-747-320	married	2026-09-06	\N	\N	79269286-40295842-11132509	Debrecen - Ipari Park	3300	Magyarország	Heves	Eger	Zrínyi utca	10	ABC Kereskedelmi Kft.	szilagyi.krisztian515@abc-kft.hu	+36 31 543 7137	94eda3e8-6e8f-45df-a5f2-9690f2c19ccf	\N
e29757bd-6de1-4b4f-af67-876c1ced06af	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0515	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Segédmunkás	2024-06-19	\N	Próbaidős időszak alatt.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Tamás	Nemes	male	1991-04-22	Kaposvár	László Piroska	3561930041	VZ3343819	523-401-347	single	2024-06-19	2028-11-25	\N	\N	Szeged - Belváros rekonstrukció	2501	Magyarország	Komárom-Esztergom	Esztergom	Táncsics Mihály utca	123	ABC Kereskedelmi Kft.	nemes.tamas516@abc-kft.hu	+36 30 139 3700	0d08cbc6-b692-4e7c-b269-f47eb41d996a	\N
c7b1ecf2-41bd-40ff-a00c-e9074ba6456a	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0516	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Könyvelő	2022-09-01	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Botond	Illés	male	1981-04-02	Békéscsaba	Orosz Erika	\N	\N	400-447-194	divorced	2022-09-01	\N	\N	57639828-44926190-67434498	Budapest - Angyalföld építkezés	2500	Magyarország	Komárom-Esztergom	Esztergom	Petőfi Sándor utca	10	ABC Kereskedelmi Kft.	illes.botond517@abc-kft.hu	+36 30 255 4887	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
c5a8a2f9-a1c6-4026-970f-d3639e049d77	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0517	f2254bf6-b3ef-48f6-b5ee-a8f9ac2d9fed	Gondnok	2025-10-12	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	István	László	male	2002-02-06	Nyíregyháza	Katona Orsolya	3425355232	\N	230-125-690	married	2025-10-12	\N	\N	98874797-48048422-53693688	Budapest - Váci út irodaház	6000	Magyarország	Bács-Kiskun	Kecskemét	Deák Ferenc utca	32	ABC Kereskedelmi Kft.	laszlo.istvan518@abc-kft.hu	+36 30 480 9500	\N	\N
2f99c8d0-e46d-4c5b-92f6-cda870f413a6	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0518	80b828b8-e846-455b-b9ac-36a60a30d6d3	Segédmunkás	2023-12-20	\N	Túlóra vállalására hajlandó.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Zoé	Hegedűs	female	1998-11-29	Nyíregyháza	Fülöp Edina	0648384779	\N	364-007-704	divorced	2023-12-20	\N	\N	\N	Budapest - Budaörs logisztikai központ	7400	Magyarország	Somogy	Kaposvár	Vörösmarty utca	37	ABC Kereskedelmi Kft.	hegedus.zoe519@abc-kft.hu	+36 20 111 7959	94eda3e8-6e8f-45df-a5f2-9690f2c19ccf	\N
82e83860-0e60-4942-91bc-922344baadb1	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0519	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Villanyszerelő	2025-06-21	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Olivér	Kozma	male	1990-05-22	Veszprém	Papp Boglárka	2282738023	LC4995881	668-397-355	divorced	2025-06-21	\N	\N	86338169-99397634-81954107	Budapest - Váci út irodaház	1021	Magyarország	Budapest	Budapest	Arany János utca	143	ABC Kereskedelmi Kft.	kozma.oliver520@abc-kft.hu	+36 70 843 2787	35af414c-1808-4056-8fcf-0bdfd33b9862	\N
8b0ed93f-0ca9-4486-a41d-04253b93ebee	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0520	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Minőségellenőr	2024-09-02	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Botond	Szalai	male	1999-05-24	Budapest	Magyar Noémi	3086144998	XC1903957	955-454-430	married	2024-09-02	2026-10-16	\N	72986434-96710976-21811862	Szeged - Belváros rekonstrukció	6801	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Vörösmarty utca	36/C	ABC Kereskedelmi Kft.	szalai.botond521@abc-kft.hu	+36 30 456 3388	02137110-1f01-4ea8-9652-cb3057178ec0	\N
40e06df7-6257-4151-903e-2f4a57e0508e	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0521	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Rakodómunkás	2025-05-23	\N	Havi bruttó bér: 367 000 Ft	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Kristóf	Tóth	male	1981-12-05	Győr	Kovács Viktória	7796113115	\N	467-105-128	divorced	2025-05-23	\N	\N	\N	Budapest - Váci út irodaház	2501	Magyarország	Komárom-Esztergom	Esztergom	Petőfi Sándor utca	100	ABC Kereskedelmi Kft.	toth.kristof522@abc-kft.hu	+36 70 751 2302	02137110-1f01-4ea8-9652-cb3057178ec0	\N
2d7f1650-e204-4169-8b78-c1c2f820461f	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0522	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Hegesztő	2024-09-28	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Lajos	Fazekas	male	2004-10-14	Debrecen	László Mónika	\N	QY1704186	340-380-781	single	2024-09-28	\N	\N	10014827-40594010-16521150	Székesfehérvár - Gyáripari terület	5008	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Tompa Mihály utca	15	ABC Kereskedelmi Kft.	fazekas.lajos523@abc-kft.hu	+36 31 620 5577	13ad850c-f7c6-4b1c-8119-b2a785a56673	\N
d5f1fe70-bbf4-4393-8fda-e3d035140236	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0523	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Targoncavezető	2021-01-04	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Veronika	Orsós	female	1971-08-29	Eger	Hegedűs Eszter	5136689080	\N	\N	single	2021-01-04	\N	\N	\N	Budapest - Budaörs logisztikai központ	6725	Magyarország	Csongrád-Csanád	Szeged	Templom utca	118	ABC Kereskedelmi Kft.	orsos.veronika524@abc-kft.hu	+36 30 948 6753	35af414c-1808-4056-8fcf-0bdfd33b9862	\N
bb66f82a-a4a9-49b3-b043-aeaec3175409	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0524	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Raktáros	2024-04-22	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Lili	Fehér	female	2006-01-08	Veszprém	Deák Margit	8272375703	\N	740-287-381	single	2024-04-22	\N	\N	35262208-18123427-92788073	Miskolc - Diósgyőri felújítás	8901	Magyarország	Zala	Zalaegerszeg	Széchenyi István tér	46/C	ABC Kereskedelmi Kft.	feher.lili525@abc-kft.hu	+36 31 717 2247	02137110-1f01-4ea8-9652-cb3057178ec0	\N
d287dca6-150d-4c26-b45d-d9c75b8cad47	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0525	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Vasbetonszerelő	2023-07-15	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Mónika	Nemes	female	1994-01-19	Hódmezővásárhely	Deák Eszter	6812469186	\N	916-744-307	married	2023-07-15	\N	\N	41922509-19239365-38614235	Miskolc - Diósgyőri felújítás	7401	Magyarország	Somogy	Kaposvár	Templom utca	3	ABC Kereskedelmi Kft.	nemes.monika526@abc-kft.hu	+36 70 747 9574	94eda3e8-6e8f-45df-a5f2-9690f2c19ccf	\N
535a7a9a-5092-44f5-92d2-a447b56fbdfb	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0526	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Sofőr	2022-02-22	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Tímea	Sándor	female	1990-04-25	Eger	Sipos Zoé	5600993263	\N	\N	married	2022-02-22	\N	\N	88403348-69811436-21034977	Szeged - Belváros rekonstrukció	6800	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Batthyány utca	28	ABC Kereskedelmi Kft.	sandor.timea527@abc-kft.hu	+36 31 869 8533	acac124f-7479-48fa-a1ac-b7d62b6489fc	\N
2a88de34-1d0b-4524-a77f-4ea9b5191c92	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0527	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Takarító	2021-03-10	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Levente	Molnár	male	1974-11-16	Békéscsaba	Kovács Julianna	\N	BJ9374166	\N	married	2021-03-10	\N	\N	63784661-87840825-10661360	Budapest - Csepel ipari park	2803	Magyarország	Komárom-Esztergom	Tatabánya	Munkácsy Mihály utca	76	ABC Kereskedelmi Kft.	molnar.levente528@abc-kft.hu	+36 31 759 3779	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
08c00bdc-8b7e-4969-8779-df4528880821	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0528	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Állványozó	2023-05-27	\N	Előző munkahelyről jó referenciával érkezett.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Ernő	Budai	male	2002-03-12	Pécs	Balogh Renáta	9138401747	\N	487-591-925	single	2023-05-27	\N	\N	63814677-99578561-76915126	Budapest - Budaörs logisztikai központ	6721	Magyarország	Csongrád-Csanád	Szeged	Fő utca	147	ABC Kereskedelmi Kft.	budai.erno529@abc-kft.hu	+36 50 850 1300	\N	\N
3dfdddd7-ca2b-4059-bb4c-002dd11316b3	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0529	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Festő	2022-08-24	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Zoltán	Vincze	male	1961-11-27	Cegléd	Somogyi Fruzsina	\N	\N	755-639-331	divorced	2022-08-24	\N	\N	72943883-97705026-31538272	Budapest - Váci út irodaház	4432	Magyarország	Szabolcs-Szatmár-Bereg	Nyíregyháza	Zrínyi utca	68/A	ABC Kereskedelmi Kft.	vincze.zoltan530@abc-kft.hu	+36 50 412 3100	02137110-1f01-4ea8-9652-cb3057178ec0	\N
aeababe6-59fe-4922-8ec6-9142e2f2ba5d	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0530	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Adminisztrátor	2021-08-16	\N	Első munkahelyes, szakmai gyakorlat keretében.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Sándor	Fehér	male	1966-07-14	Békéscsaba	Szilágyi Mária	9017114854	\N	750-839-263	single	2021-08-16	\N	\N	\N	Kecskemét - Gyárvárosi építkezés	9401	Magyarország	Győr-Moson-Sopron	Sopron	Deák Ferenc utca	139/B	ABC Kereskedelmi Kft.	feher.sandor531@abc-kft.hu	+36 20 154 6892	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
7148811f-b430-4536-8e21-ae30d06ab1b1	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0531	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Építésvezető	2025-09-08	\N	Részmunkaidős foglalkoztatás.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Orsolya	Hegedűs	female	1984-09-09	Pécs	Kovács Beáta	1641177616	QI3512594	771-178-762	single	2025-09-08	2026-05-01	\N	68587664-80090830-71351194	Budapest - Angyalföld építkezés	4028	Magyarország	Hajdú-Bihar	Debrecen	Fő utca	98/B	ABC Kereskedelmi Kft.	hegedus.orsolya532@abc-kft.hu	+36 31 935 9193	acac124f-7479-48fa-a1ac-b7d62b6489fc	\N
63457d13-ae2e-4141-b6b6-f95dcc81f665	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0532	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Takarító	2021-02-02	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Sándor	Molnár	male	1982-01-16	Debrecen	Fülöp Tímea	8257803712	OZ4695771	\N	married	2021-02-02	\N	\N	42236621-40309555-15172146	Szeged - Belváros rekonstrukció	4401	Magyarország	Szabolcs-Szatmár-Bereg	Nyíregyháza	Templom utca	72	ABC Kereskedelmi Kft.	molnar.sandor533@abc-kft.hu	+36 50 283 1009	\N	\N
812d345d-6fc1-46ea-aabe-9a22a1563602	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0533	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Építésvezető	2022-02-12	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Zsolt	Farkas	male	1973-05-22	Érd	László Szilvia	9297771476	\N	654-245-055	married	2022-02-12	\N	\N	83837579-51602518-33011421	Székesfehérvár - Gyáripari terület	9401	Magyarország	Győr-Moson-Sopron	Sopron	Arany János utca	147/A	ABC Kereskedelmi Kft.	farkas.zsolt534@abc-kft.hu	+36 70 733 1976	2779c0ef-9d97-470f-839c-f818469d43d6	\N
7bd8008b-d9ba-4614-abff-9d5f45d667fb	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0534	b7c28743-1740-4c82-a15f-91fb033fd7cd	Vízvezeték-szerelő	2023-04-26	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Barbara	Katona	female	2000-05-10	Zalaegerszeg	Király Diána	6818350830	\N	642-622-982	married	2023-04-26	\N	\N	70216211-76910335-52188041	Budapest - Csepel ipari park	6800	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Kazinczy utca	3	ABC Kereskedelmi Kft.	katona.barbara535@abc-kft.hu	+36 70 417 2748	7c65ce89-c2e7-4a79-8cac-311051629c78	\N
82a6066c-ef06-4015-9ce2-c52d4974845b	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0535	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Műszaki ellenőr	2021-03-28	\N	B kategóriás jogosítvánnyal rendelkezik.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Erzsébet	Kiss	female	1985-07-01	Székesfehérvár	Tóth Mária	9591635467	\N	505-460-443	married	2021-03-28	\N	\N	14574220-72850204-64208411	Budapest - Dél-Buda fejlesztés	6031	Magyarország	Bács-Kiskun	Kecskemét	Kölcsey utca	136	ABC Kereskedelmi Kft.	kiss.erzsebet536@abc-kft.hu	+36 70 734 3409	0d08cbc6-b692-4e7c-b269-f47eb41d996a	\N
a21828bf-8121-4bd4-be0f-92825586354d	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0536	c5d51752-dff2-4728-a944-c3692937106f	Burkoló	2022-04-29	2024-05-27	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Szabolcs	Kovács	male	2003-10-24	Kecskemét	Kelemen Mónika	8213361806	\N	276-370-992	single	2022-04-29	\N	\N	25243079-54869996-96800260	Miskolc - Diósgyőri felújítás	7400	Magyarország	Somogy	Kaposvár	Kodály körönd	61	ABC Kereskedelmi Kft.	kovacs.szabolcs537@abc-kft.hu	+36 30 868 9163	\N	\N
19413d2b-f5f1-4295-baca-aeac6c78a507	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0537	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Művezető	2021-09-24	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Olivér	Illés	male	2004-01-11	Gödöllő	Nemes Eszter	2208669570	\N	929-344-755	single	2021-09-24	\N	\N	16156604-31918793-89254296	Budapest - Budaörs logisztikai központ	2401	Magyarország	Fejér	Dunaújváros	Széchenyi István tér	144	ABC Kereskedelmi Kft.	illes.oliver538@abc-kft.hu	+36 30 393 1150	0d08cbc6-b692-4e7c-b269-f47eb41d996a	\N
5f738a82-ae8d-4e84-b445-d14f31f03332	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0538	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Ács	2024-05-25	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Patrik	Németh	male	2006-11-27	Vác	Gulyás Tímea	8534219814	\N	342-713-254	married	2024-05-25	\N	\N	35520843-52129758-35932663	Budapest - Dél-Buda fejlesztés	4025	Magyarország	Hajdú-Bihar	Debrecen	Kölcsey utca	63/C	ABC Kereskedelmi Kft.	nemeth.patrik539@abc-kft.hu	+36 20 746 9213	2779c0ef-9d97-470f-839c-f818469d43d6	\N
587f7f69-5a9d-4b91-b52d-a18d89a2815e	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0539	c5d51752-dff2-4728-a944-c3692937106f	Festő	2025-07-12	2025-02-08	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Ádám	Barta	male	1981-02-04	Érd	Budai Tímea	4795274298	ZP7572072	\N	married	2025-07-12	\N	\N	71646494-56082526-76928577	Miskolc - Diósgyőri felújítás	6801	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Hunyadi utca	28	ABC Kereskedelmi Kft.	barta.adam540@abc-kft.hu	+36 31 577 2497	\N	\N
f938589e-62f2-4a47-9e0d-4598a737f1a3	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0540	f2254bf6-b3ef-48f6-b5ee-a8f9ac2d9fed	Zsaluzó	2021-09-19	\N	Túlóra vállalására hajlandó.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Eszter	Bogdán	female	1988-02-13	Nyíregyháza	Budai Mónika	9003189788	\N	558-197-658	married	2021-09-19	\N	\N	\N	Debrecen - Ipari Park	6031	Magyarország	Bács-Kiskun	Kecskemét	Bajcsy-Zsilinszky utca	114	ABC Kereskedelmi Kft.	bogdan.eszter541@abc-kft.hu	+36 50 852 1582	\N	\N
93ce86d4-3bc0-4382-b5c9-d9c3f2d168ed	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0541	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Burkoló	2024-04-12	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Anna	Balázs	female	2000-08-30	Kecskemét	Horváth Piroska	8901592313	\N	691-446-049	married	2024-04-12	\N	\N	56926039-17869355-46183310	Budapest - Budaörs logisztikai központ	4401	Magyarország	Szabolcs-Szatmár-Bereg	Nyíregyháza	Tompa Mihály utca	102	ABC Kereskedelmi Kft.	balazs.anna542@abc-kft.hu	+36 50 989 2734	0d08cbc6-b692-4e7c-b269-f47eb41d996a	\N
c04458c9-3d5b-41bf-b9c9-648874f582e8	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0542	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Munkavédelmi felelős	2021-01-28	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Réka	Juhász	female	1993-05-27	Pécs	Varga Katalin	0934625396	\N	642-070-269	divorced	2021-01-28	\N	\N	29607382-23528576-96027582	Budapest - Dél-Buda fejlesztés	5008	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Táncsics Mihály utca	80/A	ABC Kereskedelmi Kft.	juhasz.reka543@abc-kft.hu	+36 31 577 4062	b4888603-1870-4196-ad56-4c55471e98d7	\N
8be18a8f-8b2a-435a-be72-14bbfc041b60	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0543	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Karbantartó	2024-03-13	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Veronika	Virág	female	1994-12-23	Cegléd	Kovács Éva	0554351648	KP6517008	819-630-581	divorced	2024-03-13	\N	\N	\N	Székesfehérvár - Gyáripari terület	4031	Magyarország	Hajdú-Bihar	Debrecen	Kazinczy utca	104	ABC Kereskedelmi Kft.	virag.veronika544@abc-kft.hu	+36 31 372 8773	d24a0a6b-de8f-4afc-8fc3-9ba31235ad91	\N
c4a7c884-2aad-49d1-96d1-1f07858a5480	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0544	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Segédmunkás	2024-06-12	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Bence	Varga	male	1987-03-01	Győr	Fodor Sára	4342405312	\N	338-839-766	married	2024-06-12	\N	\N	51410381-95263680-76014938	Miskolc - Diósgyőri felújítás	8201	Magyarország	Veszprém	Veszprém	Bajcsy-Zsilinszky utca	131	ABC Kereskedelmi Kft.	varga.bence545@abc-kft.hu	+36 31 252 6522	d24a0a6b-de8f-4afc-8fc3-9ba31235ad91	\N
12ee83d5-1915-48c2-852a-e930161b22b3	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0545	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Segédmunkás	2023-10-03	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Emese	Budai	female	1968-10-07	Nyíregyháza	Oláh Viktória	6765930532	\N	055-172-788	single	2023-10-03	2028-10-24	\N	44125047-67967125-13290639	Szeged - Belváros rekonstrukció	6724	Magyarország	Csongrád-Csanád	Szeged	Mátyás király utca	32/B	ABC Kereskedelmi Kft.	budai.emese546@abc-kft.hu	+36 31 900 5516	\N	\N
ad17bd84-ea34-488e-bc6d-b27cc4f7cb36	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0546	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Projektkoordinátor	2024-05-23	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Imre	Balog	male	2000-02-24	Győr	Rácz Judit	\N	ED3093534	947-633-419	married	2024-05-23	\N	\N	65888114-54748079-64833476	Szeged - Belváros rekonstrukció	3528	Magyarország	Borsod-Abaúj-Zemplén	Miskolc	Dózsa György út	110	ABC Kereskedelmi Kft.	balog.imre547@abc-kft.hu	+36 30 480 2235	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
0cd82f4d-f42e-4532-8186-d767c80ae4dd	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0547	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Könyvelő	2023-11-04	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Béla	Farkas	male	1997-08-21	Szolnok	Gulyás Judit	3025136240	\N	540-648-450	married	2023-11-04	2028-12-20	\N	16750139-43318151-29781478	Szeged - Belváros rekonstrukció	9401	Magyarország	Győr-Moson-Sopron	Sopron	Kazinczy utca	18	ABC Kereskedelmi Kft.	farkas.bela548@abc-kft.hu	+36 30 519 4746	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
7443d4aa-c9c5-4e3a-bd2e-7dbf9fef749d	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0548	c5d51752-dff2-4728-a944-c3692937106f	Minőségellenőr	2026-12-23	2025-12-18	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Dóra	Deák	female	2002-01-27	Székesfehérvár	Deák Petra	3415505961	PF5300062	144-724-955	single	2026-12-23	\N	\N	\N	Győr - Északi Ipari Park	7400	Magyarország	Somogy	Kaposvár	Rákóczi út	13	ABC Kereskedelmi Kft.	deak.dora549@abc-kft.hu	+36 20 740 4401	\N	\N
61884ca4-8818-447f-be81-bbc88b2edf83	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0549	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Ács	2026-05-26	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Dorina	Somogyi	female	2000-02-22	Kecskemét	Balogh Nóra	3213734706	\N	060-787-012	single	2026-05-26	\N	\N	\N	Miskolc - Diósgyőri felújítás	9021	Magyarország	Győr-Moson-Sopron	Győr	Dózsa György út	74	ABC Kereskedelmi Kft.	somogyi.dorina550@abc-kft.hu	+36 50 492 8175	\N	\N
5a388607-9439-4d39-a2d9-01d2bf783566	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0550	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Hegesztő	2025-11-10	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Károly	Szűcs	male	1978-03-22	Érd	Balog Viktória	8596664322	\N	877-038-802	divorced	2025-11-10	\N	\N	63856633-68011906-47404180	Budapest - Budaörs logisztikai központ	6725	Magyarország	Csongrád-Csanád	Szeged	Táncsics Mihály utca	3	ABC Kereskedelmi Kft.	szucs.karoly551@abc-kft.hu	+36 20 624 7822	02137110-1f01-4ea8-9652-cb3057178ec0	\N
49c95484-d3b7-41df-b6cf-98665474c611	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0551	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Tetőfedő	2021-03-15	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Erzsébet	Antal	female	1975-01-17	Veszprém	Varga Mónika	4290550126	\N	972-429-585	single	2021-03-15	\N	\N	\N	Budapest - Budaörs logisztikai központ	3300	Magyarország	Heves	Eger	Bocskai utca	34	ABC Kereskedelmi Kft.	antal.erzsebet552@abc-kft.hu	+36 20 730 1797	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
8bc20aa6-41db-4c98-985c-cc5229e295ea	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0552	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Daruzó	2025-06-24	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Viktor	Hegedűs	male	1976-08-26	Cegléd	Török Anna	0127521337	\N	051-303-146	single	2025-06-24	\N	\N	28216845-28458990-58631555	Miskolc - Diósgyőri felújítás	5600	Magyarország	Békés	Békéscsaba	Bem József utca	128/A	ABC Kereskedelmi Kft.	hegedus.viktor553@abc-kft.hu	+36 31 482 5844	acac124f-7479-48fa-a1ac-b7d62b6489fc	\N
ed913004-b8bd-4f00-af68-b741d657dc6b	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0553	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Segédmunkás	2021-10-03	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Nóra	Juhász	female	2005-10-10	Szeged	Orosz Flóra	1047043485	\N	985-123-173	single	2021-10-03	\N	\N	27410228-47255474-49844914	Budapest - Dél-Buda fejlesztés	3527	Magyarország	Borsod-Abaúj-Zemplén	Miskolc	Bartók Béla út	138	ABC Kereskedelmi Kft.	juhasz.nora554@abc-kft.hu	+36 30 137 8244	13ad850c-f7c6-4b1c-8119-b2a785a56673	\N
fd823c5d-3493-4453-8f56-77897330d45a	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0554	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Vízvezeték-szerelő	2024-04-17	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Pál	Orsós	male	1989-02-23	Eger	Vincze Zsófia	\N	JG1788465	851-533-357	single	2024-04-17	\N	\N	23891792-39861709-37861341	Budapest - Csepel ipari park	9024	Magyarország	Győr-Moson-Sopron	Győr	Damjanich utca	18	ABC Kereskedelmi Kft.	orsos.pal555@abc-kft.hu	+36 70 557 6006	\N	\N
5a171087-2d5f-402d-8708-67a84683979b	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0555	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Gépkezelő	2025-09-22	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	András	Magyar	male	1975-08-18	Pécs	Sipos Dorina	2735983061	BM2410433	995-933-856	married	2025-09-22	\N	\N	38214580-46410969-92048557	Budapest - Angyalföld építkezés	5000	Magyarország	Jász-Nagykun-Szolnok	Szolnok	Táncsics Mihály utca	22/C	ABC Kereskedelmi Kft.	magyar.andras556@abc-kft.hu	+36 31 962 1432	35af414c-1808-4056-8fcf-0bdfd33b9862	\N
5431812a-d242-4308-974a-27099ee35697	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0556	f2254bf6-b3ef-48f6-b5ee-a8f9ac2d9fed	Állványozó	2025-06-26	\N	Havi bruttó bér: 504 000 Ft	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Milán	Kiss	male	1967-02-08	Gödöllő	Fekete Petra	\N	\N	383-184-682	married	2025-06-26	\N	\N	49759135-16145915-64054043	Budapest - Váci út irodaház	3304	Magyarország	Heves	Eger	Bajcsy-Zsilinszky utca	81	ABC Kereskedelmi Kft.	kiss.milan557@abc-kft.hu	+36 20 204 2555	\N	\N
a2e52269-02aa-4577-b7b5-b3730466fe82	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0557	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Hegesztő	2025-05-22	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Gyula	Fehér	male	1981-02-08	Cegléd	Kozma Anikó	9564282534	\N	940-729-354	single	2025-05-22	2026-02-26	\N	47497597-81353023-56266439	Budapest - Angyalföld építkezés	2801	Magyarország	Komárom-Esztergom	Tatabánya	Zrínyi utca	110/A	ABC Kereskedelmi Kft.	feher.gyula558@abc-kft.hu	+36 70 324 3170	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
63437310-e736-4d27-a4cd-710db3940be0	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0558	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Projektkoordinátor	2023-09-04	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Noel	Boros	male	1972-07-26	Hódmezővásárhely	Máté Luca	1579520077	\N	708-240-677	single	2023-09-04	\N	\N	\N	Szeged - Belváros rekonstrukció	9401	Magyarország	Győr-Moson-Sopron	Sopron	Bethlen Gábor utca	124	ABC Kereskedelmi Kft.	boros.noel559@abc-kft.hu	+36 50 290 8533	35af414c-1808-4056-8fcf-0bdfd33b9862	\N
cb50ee0c-d86b-427b-b0f1-d754e1703476	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0559	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Épületgépész	2021-09-17	\N	Részmunkaidős foglalkoztatás.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Bendegúz	Somogyi	male	1979-12-11	Hódmezővásárhely	Hegedűs Veronika	0152193755	\N	142-921-269	single	2021-09-17	\N	\N	98534791-91687874-88026928	Győr - Északi Ipari Park	8901	Magyarország	Zala	Zalaegerszeg	Szent István tér	13	ABC Kereskedelmi Kft.	somogyi.bendeguz560@abc-kft.hu	+36 31 695 1118	\N	\N
69675af0-28b0-4048-b253-6e3f10a7f03d	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0560	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Daruzó	2026-07-10	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Viktor	Vincze	male	1981-04-09	Gödöllő	Barta Nóra	1260921834	\N	678-510-667	married	2026-07-10	\N	\N	30681266-11776716-57284230	Budapest - Váci út irodaház	9400	Magyarország	Győr-Moson-Sopron	Sopron	Bem József utca	106	ABC Kereskedelmi Kft.	vincze.viktor561@abc-kft.hu	+36 50 277 1478	\N	\N
dca8df51-2cb1-460c-ae54-1e00d2f3efba	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0561	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Villanyszerelő	2022-03-25	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Péter	Szalai	male	1989-04-05	Győr	Oláh Bianka	1290271568	\N	577-442-458	married	2022-03-25	\N	\N	\N	Debrecen - Ipari Park	9401	Magyarország	Győr-Moson-Sopron	Sopron	Széchenyi István tér	143	ABC Kereskedelmi Kft.	szalai.peter562@abc-kft.hu	+36 20 682 2879	\N	\N
b10de197-1b41-4635-97c4-b01cbc78f1b2	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0562	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Zsaluzó	2025-02-16	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Patrik	Somogyi	male	1962-07-13	Zalaegerszeg	Balog Orsolya	7158851154	\N	959-790-340	married	2025-02-16	\N	\N	15263413-94086934-68802039	Kecskemét - Gyárvárosi építkezés	2500	Magyarország	Komárom-Esztergom	Esztergom	Rákóczi út	127	ABC Kereskedelmi Kft.	somogyi.patrik563@abc-kft.hu	+36 50 493 6564	d24a0a6b-de8f-4afc-8fc3-9ba31235ad91	\N
6293ba38-5113-464a-89ed-97514808dcd5	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0563	80b828b8-e846-455b-b9ac-36a60a30d6d3	Villanyszerelő	2021-10-25	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Hunor	Kovács	male	1967-09-26	Érd	Kovács Sára	6125669447	\N	472-456-286	divorced	2021-10-25	\N	\N	\N	Miskolc - Diósgyőri felújítás	6000	Magyarország	Bács-Kiskun	Kecskemét	Hunyadi utca	112	ABC Kereskedelmi Kft.	kovacs.hunor564@abc-kft.hu	+36 50 460 7681	02137110-1f01-4ea8-9652-cb3057178ec0	\N
5c3e7550-f754-4121-887a-a11f58faec4d	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0564	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Kőműves	2024-09-18	\N	Új munkaerő, betanulás alatt.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	István	Deák	male	1985-04-26	Szolnok	Nagy Margit	6932792436	ZO5596927	573-068-688	single	2024-09-18	\N	\N	26487552-29769840-57680659	Budapest - Csepel ipari park	7400	Magyarország	Somogy	Kaposvár	Mikszáth Kálmán tér	34	ABC Kereskedelmi Kft.	deak.istvan565@abc-kft.hu	+36 50 186 7474	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
8fb5c37a-0cd2-478c-9b65-f3465cfdafc3	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0565	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Tűzvédelmi felelős	2021-05-26	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Mónika	Sipos	female	1977-05-08	Békéscsaba	Pintér Luca	6130399540	KN6704609	396-825-904	married	2021-05-26	\N	\N	\N	Szeged - Belváros rekonstrukció	3525	Magyarország	Borsod-Abaúj-Zemplén	Miskolc	Tompa Mihály utca	57	ABC Kereskedelmi Kft.	sipos.monika566@abc-kft.hu	+36 70 488 3533	\N	\N
dd36187a-095c-4f8c-a969-e808fc54ac4c	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0566	80b828b8-e846-455b-b9ac-36a60a30d6d3	Irodai asszisztens	2025-06-20	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Máté	Szalai	male	1976-07-03	Gödöllő	Takács Piroska	2509342054	YF5052865	795-517-175	married	2025-06-20	\N	\N	47983982-25184429-26238923	Miskolc - Diósgyőri felújítás	2500	Magyarország	Komárom-Esztergom	Esztergom	Templom utca	118	ABC Kereskedelmi Kft.	szalai.mate567@abc-kft.hu	+36 30 549 2438	35af414c-1808-4056-8fcf-0bdfd33b9862	\N
d60a0fc8-3351-4300-8534-03b72cbaf388	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0567	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Targoncavezető	2021-09-02	\N	Előző munkahelyről jó referenciával érkezett.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Zalán	Bogdán	male	1968-08-28	Kaposvár	Hegedűs Zoé	7515409549	BG8951743	470-625-970	married	2021-09-02	\N	\N	17259383-31153290-18780801	Budapest - Váci út irodaház	6801	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Bethlen Gábor utca	7	ABC Kereskedelmi Kft.	bogdan.zalan568@abc-kft.hu	+36 30 888 5139	\N	\N
1a160b30-5850-4f4e-954d-8366a1e57595	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0568	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Vasbetonszerelő	2022-10-11	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Károly	Budai	male	1972-12-03	Nyíregyháza	Balázs Gabriella	\N	RH7106731	326-607-993	single	2022-10-11	2026-07-10	\N	14509516-53800132-46434774	Debrecen - Ipari Park	6800	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Tompa Mihály utca	63/C	ABC Kereskedelmi Kft.	budai.karoly569@abc-kft.hu	+36 50 391 9417	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
ff19cfc3-7447-43fc-8226-9fcb93482ec3	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0569	c5d51752-dff2-4728-a944-c3692937106f	Zsaluzó	2021-07-27	2024-05-09	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Szabolcs	Boros	male	1971-03-03	Esztergom	Varga Nóra	7096039762	PT3554583	534-949-864	married	2021-07-27	\N	\N	93358416-61494738-45322794	Debrecen - Ipari Park	9700	Magyarország	Vas	Szombathely	Ady Endre utca	65	ABC Kereskedelmi Kft.	boros.szabolcs570@abc-kft.hu	+36 30 174 6510	\N	\N
533ee839-5dd4-4d12-a3d5-85c8090e01e1	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0570	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Takarító	2022-03-01	\N	Túlóra vállalására hajlandó.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Kristóf	Bogdán	male	1988-09-10	Vác	Sipos Szilvia	7498356822	\N	122-611-314	single	2022-03-01	\N	\N	\N	Debrecen - Ipari Park	2401	Magyarország	Fejér	Dunaújváros	Kazinczy utca	72	ABC Kereskedelmi Kft.	bogdan.kristof571@abc-kft.hu	+36 30 991 5980	35af414c-1808-4056-8fcf-0bdfd33b9862	\N
f95d8219-c86f-4a80-b301-0990a6634b40	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0571	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Burkoló	2026-01-28	\N	Részmunkaidős foglalkoztatás.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Zsófia	Somogyi	female	1974-08-27	Nyíregyháza	Sipos Veronika	7471230645	\N	175-900-328	married	2026-01-28	\N	\N	93183612-55321079-88031003	Budapest - Váci út irodaház	6800	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Arany János utca	131	ABC Kereskedelmi Kft.	somogyi.zsofia572@abc-kft.hu	+36 50 809 8378	13ad850c-f7c6-4b1c-8119-b2a785a56673	\N
e170e05f-295c-45fa-ba73-a63d1caf4eb0	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0572	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Biztonsági őr	2021-10-30	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Bence	Orosz	male	1998-09-03	Veszprém	Boros Boglárka	\N	\N	422-679-318	single	2021-10-30	\N	\N	93044818-23562782-73518823	Debrecen - Ipari Park	3304	Magyarország	Heves	Eger	Hunyadi utca	26	ABC Kereskedelmi Kft.	orosz.bence573@abc-kft.hu	+36 31 841 8342	35af414c-1808-4056-8fcf-0bdfd33b9862	\N
0bae645c-041f-4e63-903d-4fc6f2a9bf0b	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0573	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Tetőfedő	2026-05-27	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Olivér	Szűcs	male	1993-03-02	Szombathely	Balog Nóra	6128257906	\N	153-832-148	single	2026-05-27	\N	\N	\N	Budapest - Csepel ipari park	8900	Magyarország	Zala	Zalaegerszeg	Szent István tér	146	ABC Kereskedelmi Kft.	szucs.oliver574@abc-kft.hu	+36 50 314 5312	02137110-1f01-4ea8-9652-cb3057178ec0	\N
fa51ee6a-7860-4828-a086-10ada796f16f	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0574	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Építésvezető	2024-10-19	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Éva	Bogdán	female	1986-08-20	Kaposvár	Simon Ágnes	7904268087	\N	816-055-758	divorced	2024-10-19	\N	\N	\N	Debrecen - Ipari Park	7623	Magyarország	Baranya	Pécs	Kodály körönd	139	ABC Kereskedelmi Kft.	bogdan.eva575@abc-kft.hu	+36 70 644 5135	\N	\N
8e2a100d-fcac-4969-ac19-1bdeefc1ef13	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0575	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Daruzó	2023-06-20	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Lilla	Takács	female	1962-08-12	Nyíregyháza	Orsós Éva	3651170029	\N	098-288-340	married	2023-06-20	\N	\N	55225982-97124156-36758352	Kecskemét - Gyárvárosi építkezés	9026	Magyarország	Győr-Moson-Sopron	Győr	Templom utca	43	ABC Kereskedelmi Kft.	takacs.lilla576@abc-kft.hu	+36 50 425 8728	acac124f-7479-48fa-a1ac-b7d62b6489fc	\N
9892bbc7-3f3b-4300-a27f-f0f9b282c045	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0576	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Gépkezelő	2021-01-24	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Levente	Kocsis	male	1966-05-11	Nyíregyháza	Pintér Ágnes	2593133950	\N	650-351-943	married	2021-01-24	\N	\N	\N	Szeged - Belváros rekonstrukció	6031	Magyarország	Bács-Kiskun	Kecskemét	Liszt Ferenc tér	54	ABC Kereskedelmi Kft.	kocsis.levente577@abc-kft.hu	+36 20 653 6551	d24a0a6b-de8f-4afc-8fc3-9ba31235ad91	\N
bc791b98-9007-401c-84d8-75a027effbdf	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0577	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Daruzó	2022-01-01	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Mária	Takács	female	1975-01-26	Hódmezővásárhely	Simon Diána	9669231585	MR9717782	142-402-632	divorced	2022-01-01	\N	\N	30742510-41366184-53664668	Miskolc - Diósgyőri felújítás	4032	Magyarország	Hajdú-Bihar	Debrecen	Petőfi Sándor utca	30	ABC Kereskedelmi Kft.	takacs.maria578@abc-kft.hu	+36 30 845 4249	0d08cbc6-b692-4e7c-b269-f47eb41d996a	\N
44399a79-8132-4b2f-ab35-f45bb7b5007f	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0578	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Munkavédelmi felelős	2024-12-21	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Lilla	Kelemen	female	2004-02-07	Pécs	Papp Julianna	8951845409	\N	717-771-259	single	2024-12-21	\N	\N	\N	Szeged - Belváros rekonstrukció	2501	Magyarország	Komárom-Esztergom	Esztergom	Móricz Zsigmond körtér	62	ABC Kereskedelmi Kft.	kelemen.lilla579@abc-kft.hu	+36 50 276 3167	7c65ce89-c2e7-4a79-8cac-311051629c78	\N
89150430-bf2e-4a7c-8c07-f25fa1d289b8	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0579	80b828b8-e846-455b-b9ac-36a60a30d6d3	Gépkezelő	2023-09-30	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Judit	Simon	female	1968-04-24	Hódmezővásárhely	Biró Bernadett	2147968741	IT3101158	294-159-702	single	2023-09-30	\N	\N	14552091-38398496-72365628	Budapest - Csepel ipari park	4433	Magyarország	Szabolcs-Szatmár-Bereg	Nyíregyháza	Munkácsy Mihály utca	24	ABC Kereskedelmi Kft.	simon.judit580@abc-kft.hu	+36 70 762 3955	2779c0ef-9d97-470f-839c-f818469d43d6	\N
967b4d36-072e-414d-ae52-c441e8414375	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0580	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Állványozó	2024-04-08	\N	Külföldi munkavállalási engedéllyel rendelkezik.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Róbert	Balog	male	1987-05-13	Nyíregyháza	Vincze Diána	7527184395	\N	618-587-920	married	2024-04-08	2028-05-02	\N	55869592-19049128-68119631	Budapest - Váci út irodaház	6720	Magyarország	Csongrád-Csanád	Szeged	Mátyás király utca	66/B	ABC Kereskedelmi Kft.	balog.robert581@abc-kft.hu	+36 30 749 6711	94eda3e8-6e8f-45df-a5f2-9690f2c19ccf	\N
481aacab-6f11-417c-bf56-05f603982fdf	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0581	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Biztonsági őr	2024-01-15	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Fanni	Virág	female	1976-10-11	Veszprém	László Beáta	2018837839	\N	184-754-977	married	2024-01-15	\N	\N	53058785-33883743-63943510	Budapest - Angyalföld építkezés	8200	Magyarország	Veszprém	Veszprém	Liszt Ferenc tér	131/B	ABC Kereskedelmi Kft.	virag.fanni582@abc-kft.hu	+36 20 118 4421	85428cf6-c6fc-4221-bca5-a397b4d198d4	\N
dbac6526-f196-4df5-9b30-5cb55377937d	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0582	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Építésvezető	2021-03-09	\N	Próbaidős időszak alatt.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Pál	Szalai	male	1963-03-17	Székesfehérvár	Kocsis Zsófia	\N	WT5556501	440-584-147	single	2021-03-09	\N	\N	26897174-80062000-12026225	Kecskemét - Gyárvárosi építkezés	6000	Magyarország	Bács-Kiskun	Kecskemét	Vörösmarty utca	1/B	ABC Kereskedelmi Kft.	szalai.pal583@abc-kft.hu	+36 50 370 7420	0d08cbc6-b692-4e7c-b269-f47eb41d996a	\N
0f26238c-8b29-4dab-a1b8-0f39e0da8ec1	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0583	f2254bf6-b3ef-48f6-b5ee-a8f9ac2d9fed	Villanyszerelő	2022-09-13	\N	Próbaidős időszak alatt.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Judit	Gulyás	female	1975-09-24	Eger	Lukács Erzsébet	2159948276	ZA1954292	465-554-936	married	2022-09-13	\N	\N	\N	Székesfehérvár - Gyáripari terület	7400	Magyarország	Somogy	Kaposvár	Batthyány utca	1	ABC Kereskedelmi Kft.	gulyas.judit584@abc-kft.hu	+36 20 926 7738	\N	\N
8c6fbb16-ecd0-4493-9c31-53ff57b11387	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0584	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Állványozó	2021-04-15	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Balázs	Szilágyi	male	1969-11-21	Esztergom	Budai Margit	1130033531	GS6699811	798-687-366	single	2021-04-15	\N	\N	\N	Budapest - Angyalföld építkezés	8901	Magyarország	Zala	Zalaegerszeg	Kazinczy utca	131	ABC Kereskedelmi Kft.	szilagyi.balazs585@abc-kft.hu	+36 20 196 2730	d24a0a6b-de8f-4afc-8fc3-9ba31235ad91	\N
d52c80f1-d551-4416-961a-fbd8074a1cb3	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0585	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Vasbetonszerelő	2024-05-29	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Mónika	Varga	female	1976-09-13	Nyíregyháza	Illés Vivien	7989567434	\N	438-614-879	divorced	2024-05-29	\N	\N	76752814-14640348-14303794	Miskolc - Diósgyőri felújítás	6801	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Bethlen Gábor utca	58	ABC Kereskedelmi Kft.	varga.monika586@abc-kft.hu	+36 30 498 4753	b4888603-1870-4196-ad56-4c55471e98d7	\N
aaab7a60-648e-4eda-b8f4-5921e094e899	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0586	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Épületgépész	2022-08-02	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Miklós	Szalai	male	1979-08-26	Tatabánya	Katona Lili	1137630481	\N	142-765-654	single	2022-08-02	\N	\N	\N	Budapest - Csepel ipari park	2400	Magyarország	Fejér	Dunaújváros	Liszt Ferenc tér	52/A	ABC Kereskedelmi Kft.	szalai.miklos587@abc-kft.hu	+36 20 466 7840	acac124f-7479-48fa-a1ac-b7d62b6489fc	\N
6c78777d-756f-4287-829e-39386f727271	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0587	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Hegesztő	2021-01-14	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Sándor	Szilágyi	male	1968-04-16	Békéscsaba	Pintér Viktória	\N	\N	801-053-601	married	2021-01-14	\N	\N	51498140-27469238-61642156	Győr - Északi Ipari Park	7401	Magyarország	Somogy	Kaposvár	Széchenyi István tér	88/C	ABC Kereskedelmi Kft.	szilagyi.sandor588@abc-kft.hu	+36 20 416 5799	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
787980cf-9a71-4e6e-98f3-575377f05de8	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0588	80b828b8-e846-455b-b9ac-36a60a30d6d3	Zsaluzó	2021-04-27	\N	Külföldi munkavállalási engedéllyel rendelkezik.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	János	Szabó	male	1983-03-06	Eger	Sipos Csilla	7460394960	\N	669-111-368	widowed	2021-04-27	\N	\N	90713919-71066826-93707276	Budapest - Dél-Buda fejlesztés	2501	Magyarország	Komárom-Esztergom	Esztergom	Arany János utca	81	ABC Kereskedelmi Kft.	szabo.janos589@abc-kft.hu	+36 30 254 7079	35af414c-1808-4056-8fcf-0bdfd33b9862	\N
b64e6f27-3d2a-4dd0-9c66-7ce1e51784fc	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0589	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Tetőfedő	2021-09-17	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Zalán	Rácz	male	2006-03-14	Szolnok	Király Lilla	\N	\N	881-282-704	married	2021-09-17	\N	\N	35102538-75087952-17645947	Székesfehérvár - Gyáripari terület	9027	Magyarország	Győr-Moson-Sopron	Győr	Arany János utca	22	ABC Kereskedelmi Kft.	racz.zalan590@abc-kft.hu	+36 70 606 9703	13ad850c-f7c6-4b1c-8119-b2a785a56673	\N
7eaa3312-3834-40e3-abe6-fd1304b0ad80	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0590	80b828b8-e846-455b-b9ac-36a60a30d6d3	Építésvezető	2024-09-03	\N	Külföldi munkavállalási engedéllyel rendelkezik.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Renáta	Szűcs	female	2005-06-22	Esztergom	Nemes Anna	4004697214	KP4552346	279-938-607	single	2024-09-03	\N	\N	67434026-25477817-24130534	Kecskemét - Gyárvárosi építkezés	1191	Magyarország	Budapest	Budapest	Bajcsy-Zsilinszky utca	93	ABC Kereskedelmi Kft.	szucs.renata591@abc-kft.hu	+36 30 132 7689	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
d898eed0-177f-4593-9ac0-37ecac21fe3c	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0591	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Épületgépész	2022-06-01	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Máté	Máté	male	1998-01-24	Dunaújváros	Bogdán Barbara	1361349078	\N	892-874-224	single	2022-06-01	\N	\N	\N	Budapest - Váci út irodaház	2700	Magyarország	Pest	Cegléd	Hunyadi utca	104	ABC Kereskedelmi Kft.	mate.mate592@abc-kft.hu	+36 30 880 9254	acac124f-7479-48fa-a1ac-b7d62b6489fc	\N
ba732ba2-f3d1-45d2-956e-d79f424c5295	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0592	c5d51752-dff2-4728-a944-c3692937106f	Szállítómunkás	2022-01-27	2025-12-06	Nyelvtudás: angol alapfok.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Csaba	Bogdán	male	1994-07-15	Békéscsaba	Kelemen Renáta	9140472682	\N	329-099-206	single	2022-01-27	\N	\N	34068812-81654018-54275234	Székesfehérvár - Gyáripari terület	2030	Magyarország	Pest	Érd	Bem József utca	142	ABC Kereskedelmi Kft.	bogdan.csaba593@abc-kft.hu	+36 20 143 7677	\N	\N
862b6279-cc0c-47bb-9d3c-593b03a19d13	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0593	c5d51752-dff2-4728-a944-c3692937106f	Sofőr	2026-11-18	2024-10-11	C kategóriás jogosítvánnyal rendelkezik.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Boglárka	Kiss	female	1996-09-21	Szombathely	Biró Veronika	6973675656	\N	817-328-858	single	2026-11-18	\N	\N	67512840-60125412-80386838	Debrecen - Ipari Park	2700	Magyarország	Pest	Cegléd	Liszt Ferenc tér	2	ABC Kereskedelmi Kft.	kiss.boglarka594@abc-kft.hu	+36 31 927 3767	\N	\N
d6753481-70b8-4a5b-9b1e-9764909348ab	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0594	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Villanyszerelő	2022-01-15	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Piroska	Gál	female	1979-06-11	Veszprém	Balogh Anna	5016023538	\N	660-410-297	single	2022-01-15	\N	\N	\N	Kecskemét - Gyárvárosi építkezés	2500	Magyarország	Komárom-Esztergom	Esztergom	Petőfi Sándor utca	85	ABC Kereskedelmi Kft.	gal.piroska595@abc-kft.hu	+36 50 855 6124	\N	\N
caa337b9-2095-4463-8b88-2326ea76f8c5	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0595	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Gondnok	2021-04-25	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Csilla	Nemes	female	1988-05-30	Szolnok	Virág Julianna	2491978412	FF8026046	467-986-324	single	2021-04-25	\N	\N	11370602-45021329-74320743	Székesfehérvár - Gyáripari terület	6720	Magyarország	Csongrád-Csanád	Szeged	Batthyány utca	5	ABC Kereskedelmi Kft.	nemes.csilla596@abc-kft.hu	+36 31 155 5990	\N	\N
14b1398b-ffb7-4a54-a433-c3367546ad82	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0596	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Burkoló	2025-10-17	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Diána	Budai	female	1991-07-08	Hódmezővásárhely	Kovács Beáta	7346707390	\N	966-840-785	married	2025-10-17	\N	\N	89980059-79650248-27416485	Budapest - Újpest raktártelep	9700	Magyarország	Vas	Szombathely	Bartók Béla út	107	ABC Kereskedelmi Kft.	budai.diana597@abc-kft.hu	+36 30 990 1910	94eda3e8-6e8f-45df-a5f2-9690f2c19ccf	\N
30d9961a-24ff-4804-823d-b3ec8cc94e15	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0597	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Gépkezelő	2021-04-02	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Kornél	Oláh	male	1970-03-23	Szeged	Papp Ilona	8318286442	WL7626007	494-244-435	single	2021-04-02	\N	\N	17594920-51751845-35120830	Budapest - Budaörs logisztikai központ	2401	Magyarország	Fejér	Dunaújváros	Damjanich utca	69/B	ABC Kereskedelmi Kft.	olah.kornel598@abc-kft.hu	+36 30 404 9346	13ad850c-f7c6-4b1c-8119-b2a785a56673	\N
e8aaa89e-b299-43d4-b153-afb328d3b71d	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0598	c5d51752-dff2-4728-a944-c3692937106f	Művezető	2022-01-07	2026-02-09	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Anikó	Fodor	female	1967-02-03	Vác	Fülöp Réka	0702917060	\N	908-266-926	single	2022-01-07	\N	\N	99706726-58211310-40661341	Budapest - Budaörs logisztikai központ	9701	Magyarország	Vas	Szombathely	Templom utca	84/C	ABC Kereskedelmi Kft.	fodor.aniko599@abc-kft.hu	+36 31 447 9428	\N	\N
9913df63-0630-433c-9787-b4cc92d62a3f	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0599	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Daruzó	2025-03-29	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Mária	Barta	female	1999-08-23	Vác	Pál Piroska	1596188010	LS3935583	003-933-963	divorced	2025-03-29	\N	\N	\N	Kecskemét - Gyárvárosi építkezés	6800	Magyarország	Csongrád-Csanád	Hódmezővásárhely	Kossuth Lajos utca	70	ABC Kereskedelmi Kft.	barta.maria600@abc-kft.hu	+36 31 421 5910	2e438423-b276-4f43-a8c4-2fe3ad297a8a	\N
7486fcc3-4584-4db3-94a7-6a7ac8b77791	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0600	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Burkoló	2021-12-09	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	ce612502-f8b9-4988-bb46-295d4f9cff6b	Veronika	Antal	female	1969-05-22	Érd	Varga Margit	\N	\N	\N	married	2021-12-09	\N	\N	77448827-88003353-67997188	Kecskemét - Gyárvárosi építkezés	2030	Magyarország	Pest	Érd	Hunyadi utca	104	ABC Kereskedelmi Kft.	antal.veronika601@abc-kft.hu	+36 30 421 2760	35af414c-1808-4056-8fcf-0bdfd33b9862	\N
e990c6a9-70a8-4f48-973f-a64afe72eb9e	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0601	c5d51752-dff2-4728-a944-c3692937106f	Gépkezelő	2024-11-09	2025-02-26	C kategóriás jogosítvánnyal rendelkezik.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Klára	Takács	female	1995-08-04	Gödöllő	Farkas Dóra	5754674147	\N	826-647-367	married	2024-11-09	2028-11-08	\N	79982665-88659709-56522900	Budapest - Budaörs logisztikai központ	2600	Magyarország	Pest	Vác	Templom utca	112	ABC Kereskedelmi Kft.	takacs.klara602@abc-kft.hu	+36 50 179 3111	\N	\N
b5ece9cf-1a4d-480e-838d-4feb05a71826	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0602	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Daruzó	2023-12-04	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Dezső	Szalai	male	2003-05-13	Szombathely	Varga Anikó	7385486968	\N	\N	married	2023-12-04	\N	\N	\N	Miskolc - Diósgyőri felújítás	7625	Magyarország	Baranya	Pécs	Jókai Mór utca	27/A	ABC Kereskedelmi Kft.	szalai.dezso603@abc-kft.hu	+36 30 999 4707	acac124f-7479-48fa-a1ac-b7d62b6489fc	\N
9c6de8f0-c664-4ea1-91b2-837acd0bebef	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0603	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Gépkezelő	2025-11-15	\N	Tapasztalt dolgozó, megbízható.	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	eca0550a-f596-4937-bcd5-37b5bf867db7	Pál	Szabó	male	1988-03-01	Dunaújváros	Balogh Mónika	2545884976	\N	451-455-217	single	2025-11-15	\N	\N	61760928-94149988-78712527	Győr - Északi Ipari Park	2600	Magyarország	Pest	Vác	Deák Ferenc utca	42	ABC Kereskedelmi Kft.	szabo.pal604@abc-kft.hu	+36 20 194 5115	acfc75f8-6ffd-4fc4-aaf4-e51409068b30	\N
1bd0daf6-dbac-432d-ad7e-adb27c0d19c7	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0604	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Művezető	2024-01-13	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	\N	Dániel	Balog	male	1996-04-01	Érd	Sándor Margit	9437955670	\N	183-675-870	single	2024-01-13	\N	\N	24115191-89980874-36460608	Budapest - Újpest raktártelep	7624	Magyarország	Baranya	Pécs	Petőfi Sándor utca	92	ABC Kereskedelmi Kft.	balog.daniel605@abc-kft.hu	+36 31 142 9521	\N	\N
b99afc1c-8281-4adb-ac33-28f5b51ad865	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	\N	\N	EMP-0605	ffeba932-1b3e-4bf6-ae31-22bc5ad26696	Építésvezető	2025-06-27	\N	\N	2026-02-23 20:23:17.38856	2026-02-23 20:23:17.38856	b0ef0ddc-a221-479f-8db0-cf3dacc6caa4	Nikolett	László	female	1988-02-27	Békéscsaba	Horváth Ágnes	9879293104	\N	971-841-729	married	2025-06-27	\N	\N	45883651-64530755-20546090	Debrecen - Ipari Park	7401	Magyarország	Somogy	Kaposvár	Táncsics Mihály utca	128/C	ABC Kereskedelmi Kft.	laszlo.nikolett606@abc-kft.hu	+36 70 730 1078	02137110-1f01-4ea8-9652-cb3057178ec0	\N
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
-- Data for Name: invoice_categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.invoice_categories (id, name, icon, color, is_active) FROM stdin;
1dd7b735-99db-4298-b0c7-9b0391e6bb09	Anyagköltség	🔨	#3b82f6	t
631ebcad-50c9-4066-a42a-243898494f74	Bérköltség	👷	#10b981	t
5092aeb8-e91a-4f00-97d9-6b3cb613fe20	Szolgáltatás	🛠️	#8b5cf6	t
28c2bed3-8617-4203-8961-e3bb9ea79ce1	Beszerzés	📦	#ec4899	t
483376de-e46b-482d-8160-8f8cdb13ef8b	Rezsi (Utilities)	⚡	#f59e0b	t
4a9d46d7-4473-454b-96dc-8beff9558a5c	Marketing	📢	#ef4444	t
50c3b18c-0dae-4876-a716-cab517a67513	Egyéb	📋	#6b7280	t
\.


--
-- Data for Name: invoices; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.invoices (id, invoice_number, vendor_name, vendor_tax_number, amount, currency, vat_amount, total_amount, invoice_date, due_date, payment_date, payment_status, cost_center_id, category_id, description, notes, file_path, ocr_data, contractor_id, created_by, created_at, updated_at) FROM stdin;
c918cd6b-9e9f-4cbd-816f-55943ebe6aa3	VILL-2026-001	E.ON Energiaszolg�ltat�	10001234-2-44	669291.00	HUF	180909.00	850200.00	2026-01-15	2026-02-15	2026-02-10	paid	53e29322-1f4e-43a8-854a-ad69b1bc01c0	483376de-e46b-482d-8160-8f8cdb13ef8b	Villamos energia 2026 janu�r	\N	\N	\N	\N	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	2026-02-24 11:44:24.392764	2026-02-24 11:44:24.392764
b12ab167-002b-4d78-8ca0-5be6627e93e7	ANYAG-2026-012	Praktiker Kft.	22334455-2-13	1968504.00	HUF	531496.00	2500000.00	2026-01-20	2026-02-20	\N	pending	b42c8e34-1850-4ea2-8758-8f23c34b3bed	1dd7b735-99db-4298-b0c7-9b0391e6bb09	�p�t�anyag beszerz�s - Budapest projekt	\N	\N	\N	\N	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	2026-02-24 11:44:24.482261	2026-02-24 11:44:24.482261
f7818e07-16fd-494c-861f-548682f286d7	ALVAL-2026-003	BuildMaster �p�t� Zrt.	55667788-2-41	4881890.00	HUF	1318110.00	6200000.00	2026-02-01	2026-03-01	\N	overdue	3e1ba5b7-b402-47fb-a0e2-3548be6df140	5092aeb8-e91a-4f00-97d9-6b3cb613fe20	Alv�llalkoz�i munkad�j - Febru�ri fel�j�t�s	\N	\N	\N	\N	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	2026-02-24 11:44:24.592958	2026-02-24 11:44:24.592958
801e89e3-0045-4eb5-a85f-ca306e296a9d	ARAM-2026-001	ELM�-�M�SZ Kft.	11223344-2-44	98425.00	HUF	26575.00	125000.00	2026-01-31	2026-02-28	2026-02-20	paid	a64050d0-ecf5-4a27-8a91-9ffd9dc3b556	483376de-e46b-482d-8160-8f8cdb13ef8b	Villamosenergia BP Lak�s 101 - Janu�r	\N	\N	\N	\N	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	2026-02-24 11:44:24.674029	2026-02-24 11:44:24.674029
96338656-ecb5-4f6d-9b54-a416a4fd40f7	GAZ-2026-001	F�g�z Zrt.	33445566-2-44	145669.00	HUF	39331.00	185000.00	2026-02-05	2026-03-05	\N	pending	eb608596-a528-405e-b1af-dd7e7fd64d92	483376de-e46b-482d-8160-8f8cdb13ef8b	G�zszolg�ltat�s BP Lak�s 101 - Janu�r	\N	\N	\N	\N	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	2026-02-24 11:44:24.76636	2026-02-24 11:44:24.76636
ba0ea1c9-0f7a-42da-a1e6-7dea060f91a7	VIZ-2026-001	F�v�rosi V�zm�vek	44556677-2-44	33071.00	HUF	8929.00	42000.00	2026-02-10	2026-03-10	\N	pending	06e540f4-b89d-47b9-a355-a6b7b2536279	483376de-e46b-482d-8160-8f8cdb13ef8b	V�zszolg�ltat�s BP Lak�s 101 - Janu�r	\N	\N	\N	\N	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	2026-02-24 11:44:24.856305	2026-02-24 11:44:24.856305
7f8d9b0b-ba6d-4972-bb01-cae5c232bac2	ANYAG-2026-013	OBI Bark�cs�ruh�z	66778899-2-13	614173.00	HUF	165827.00	780000.00	2026-02-12	2026-03-12	2026-02-22	paid	b42c8e34-1850-4ea2-8758-8f23c34b3bed	28c2bed3-8617-4203-8961-e3bb9ea79ce1	Fest�k �s fel�j�t�si anyagok	\N	\N	\N	\N	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	2026-02-24 11:44:24.958659	2026-02-24 11:44:24.958659
faf2866e-6957-4596-af58-fbcee668bbc2	REZSI-2026-002	F�g�z Zrt.	33445566-2-44	354331.00	HUF	95669.00	450000.00	2026-02-15	2026-03-15	\N	pending	53e29322-1f4e-43a8-854a-ad69b1bc01c0	483376de-e46b-482d-8160-8f8cdb13ef8b	G�z szolg�ltat�s - Budapest projekt iroda	\N	\N	\N	\N	d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	2026-02-24 11:44:25.044769	2026-02-24 11:44:25.044769
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
d3ab9d8b-1fa7-48a0-966e-689dd40a60bf	1bad6c67-0350-4dd2-82b2-d96caf9e4f2a	kiss.janos@abc-kft.hu	$2a$10$beO0B8ZoUrc7lofWoi0qVOduHNS0WG.c3vEE6l.EgcmFZPpc.X0Xa	Kiss	János	+36 30 111 2233	t	t	2026-02-24 15:01:06.265785	2026-02-21 09:28:36.093901	2026-02-24 15:01:06.265785	11339aa9-1791-43d3-be36-83c0be662bc6
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
-- Name: cost_centers cost_centers_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_code_key UNIQUE (code);


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
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);


--
-- Name: email_templates email_templates_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_slug_key UNIQUE (slug);


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
-- Name: invoice_categories invoice_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_categories
    ADD CONSTRAINT invoice_categories_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


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
-- Name: idx_cost_centers_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cost_centers_active ON public.cost_centers USING btree (is_active);


--
-- Name: idx_cost_centers_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cost_centers_code ON public.cost_centers USING btree (code);


--
-- Name: idx_cost_centers_parent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cost_centers_parent ON public.cost_centers USING btree (parent_id);


--
-- Name: idx_cost_centers_path; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cost_centers_path ON public.cost_centers USING btree (path);


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
-- Name: idx_email_templates_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_email_templates_active ON public.email_templates USING btree (is_active);


--
-- Name: idx_email_templates_contractor; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_email_templates_contractor ON public.email_templates USING btree (contractor_id);


--
-- Name: idx_email_templates_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_email_templates_slug ON public.email_templates USING btree (slug);


--
-- Name: idx_email_templates_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_email_templates_type ON public.email_templates USING btree (template_type);


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
-- Name: idx_invoices_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_invoices_category ON public.invoices USING btree (category_id);


--
-- Name: idx_invoices_cost_center; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_invoices_cost_center ON public.invoices USING btree (cost_center_id);


--
-- Name: idx_invoices_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_invoices_date ON public.invoices USING btree (invoice_date);


--
-- Name: idx_invoices_due_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_invoices_due_date ON public.invoices USING btree (due_date);


--
-- Name: idx_invoices_payment_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_invoices_payment_status ON public.invoices USING btree (payment_status);


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
-- Name: cost_centers cost_center_path_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER cost_center_path_trigger BEFORE INSERT OR UPDATE ON public.cost_centers FOR EACH ROW EXECUTE FUNCTION public.update_cost_center_path();


--
-- Name: cost_centers cost_center_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER cost_center_updated_at_trigger BEFORE UPDATE ON public.cost_centers FOR EACH ROW EXECUTE FUNCTION public.update_cost_center_updated_at();


--
-- Name: invoices invoice_cost_center_summary_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER invoice_cost_center_summary_trigger AFTER INSERT OR DELETE OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_cost_center_summary();


--
-- Name: invoices invoice_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER invoice_updated_at_trigger BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_invoice_updated_at();


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
-- Name: email_templates update_email_templates_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON public.email_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


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
-- Name: cost_centers cost_centers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: cost_centers cost_centers_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cost_centers
    ADD CONSTRAINT cost_centers_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.cost_centers(id);


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
-- Name: email_templates email_templates_contractor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(id) ON DELETE SET NULL;


--
-- Name: email_templates email_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


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
-- Name: invoices invoices_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.invoice_categories(id);


--
-- Name: invoices invoices_contractor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.contractors(id);


--
-- Name: invoices invoices_cost_center_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_cost_center_id_fkey FOREIGN KEY (cost_center_id) REFERENCES public.cost_centers(id);


--
-- Name: invoices invoices_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


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

\unrestrict VuiLabk1FEbTWe5SPMQH1YX9JQTbrJpZftMdMUXWz6rdrDKhenRd6eXNG0MGwcN

