-- Inferred from legacy C# models and repository parameters. No stored procedures.
BEGIN;
CREATE TABLE customers (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  first_name varchar(100) NOT NULL CHECK (length(trim(first_name)) > 0),
  last_name varchar(100) NOT NULL CHECK (length(trim(last_name)) > 0),
  middle_initial varchar(1),
  ssn_last_four varchar(4) CHECK (ssn_last_four ~ '^[0-9]{4}$'),
  date_of_birth date NOT NULL,
  street varchar(250) NOT NULL,
  city varchar(100) NOT NULL,
  state varchar(2) NOT NULL CHECK (state ~ '^[A-Z]{2}$'),
  zip_code varchar(10) NOT NULL CHECK (zip_code ~ '^[0-9]{5}(-[0-9]{4})?$'),
  county varchar(100),
  phone_number varchar(30) NOT NULL,
  spouse_first_name varchar(100),
  spouse_last_name varchar(100),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE TABLE companies (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name varchar(150) NOT NULL UNIQUE,
  contact_number varchar(30),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE TABLE employees (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  first_name varchar(100) NOT NULL,
  last_name varchar(100) NOT NULL,
  username varchar(150) NOT NULL UNIQUE,
  identity_subject varchar(250) UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE TABLE policy_types (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name varchar(150) NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE TABLE alternate_contacts (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id integer NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  first_name varchar(100) NOT NULL,
  last_name varchar(100) NOT NULL,
  relationship varchar(100) NOT NULL,
  phone_number varchar(30) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE TABLE medicare_enrollments (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id integer NOT NULL UNIQUE REFERENCES customers(id) ON DELETE RESTRICT,
  card_number varchar(30) NOT NULL,
  part_a_enrolled_on date,
  part_b_enrolled_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE TABLE policies (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id integer NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  policy_type_id integer NOT NULL REFERENCES policy_types(id) ON DELETE RESTRICT,
  employee_id integer NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  policy_number varchar(100) NOT NULL,
  policy_holder varchar(200) NOT NULL,
  age_at_issue smallint NOT NULL CHECK (age_at_issue BETWEEN 0 AND 130),
  date_written date NOT NULL,
  date_effective date NOT NULL,
  status varchar(50) NOT NULL,
  billing_period varchar(50) NOT NULL,
  premium numeric(14,2) NOT NULL CHECK (premium >= 0),
  commission_percentage numeric(7,4) NOT NULL CHECK (commission_percentage BETWEEN 0 AND 100),
  initial_percentage numeric(7,4) NOT NULL CHECK (initial_percentage BETWEEN 0 AND 100),
  renewal numeric(14,4) NOT NULL CHECK (renewal >= 0),
  written_by_username varchar(150),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE(company_id, policy_number)
);
CREATE INDEX customers_name_idx ON customers(lower(last_name), lower(first_name));
CREATE INDEX alternate_contacts_customer_idx ON alternate_contacts(customer_id);
CREATE INDEX policies_customer_idx ON policies(customer_id);
CREATE INDEX policies_company_idx ON policies(company_id);
CREATE INDEX policies_type_idx ON policies(policy_type_id);
CREATE INDEX policies_sales_idx ON policies(employee_id, date_written);
COMMIT;
