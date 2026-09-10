-- Consumptieregistratie TVB
-- Productieschema voor PostgreSQL 15+
-- Voer dit script uit op een lege productiedatabase.
-- De backend/API hoort de enige laag te zijn die rechtstreeks met deze
-- database communiceert. Gebruik nooit databasegegevens in de browser.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE companies (
    company_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(150) NOT NULL,
    employer_number varchar(100),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT companies_name_not_blank CHECK (length(btrim(name)) > 0),
    CONSTRAINT companies_employer_number_unique UNIQUE (employer_number)
);

CREATE UNIQUE INDEX companies_name_active_unique
    ON companies (lower(name))
    WHERE active = true;

CREATE TABLE employees (
    employee_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid REFERENCES companies(company_id) ON DELETE SET NULL,
    first_name varchar(100) NOT NULL,
    last_name varchar(150) NOT NULL,
    payroll_code varchar(100),
    personnel_number varchar(100),
    active boolean NOT NULL DEFAULT true,
    color varchar(20),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT employees_first_name_not_blank CHECK (length(btrim(first_name)) > 0),
    CONSTRAINT employees_last_name_not_blank CHECK (length(btrim(last_name)) > 0),
    CONSTRAINT employees_personnel_number_unique UNIQUE (personnel_number)
);

CREATE INDEX employees_company_active_idx
    ON employees (company_id, active);

CREATE INDEX employees_name_idx
    ON employees (lower(last_name), lower(first_name));

CREATE TABLE products (
    product_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(150) NOT NULL,
    price numeric(10, 2) NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT products_name_not_blank CHECK (length(btrim(name)) > 0),
    CONSTRAINT products_price_non_negative CHECK (price >= 0),
    CONSTRAINT products_name_unique UNIQUE (name)
);

CREATE TABLE admins (
    admin_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email varchar(320) NOT NULL,
    password_hash text NOT NULL,
    display_name varchar(150) NOT NULL,
    role varchar(30) NOT NULL DEFAULT 'admin',
    active boolean NOT NULL DEFAULT true,
    last_login_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT admins_role_valid CHECK (role IN ('admin', 'manager')),
    CONSTRAINT admins_display_name_not_blank CHECK (length(btrim(display_name)) > 0)
);

CREATE UNIQUE INDEX admins_email_unique
    ON admins (lower(email));

CREATE TABLE registrations (
    registration_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id uuid NOT NULL REFERENCES employees(employee_id) ON DELETE RESTRICT,
    product_id uuid NOT NULL REFERENCES products(product_id) ON DELETE RESTRICT,
    registered_by_admin_id uuid REFERENCES admins(admin_id) ON DELETE SET NULL,
    registered_at timestamptz NOT NULL DEFAULT now(),
    amount integer NOT NULL DEFAULT 1,
    CONSTRAINT registrations_amount_positive CHECK (amount > 0)
);

CREATE INDEX registrations_employee_date_idx
    ON registrations (employee_id, registered_at DESC);

CREATE INDEX registrations_product_date_idx
    ON registrations (product_id, registered_at DESC);

CREATE INDEX registrations_date_idx
    ON registrations (registered_at DESC);

CREATE TABLE audit_log (
    audit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid REFERENCES admins(admin_id) ON DELETE SET NULL,
    action varchar(100) NOT NULL,
    employee_id uuid REFERENCES employees(employee_id) ON DELETE SET NULL,
    product_id uuid REFERENCES products(product_id) ON DELETE SET NULL,
    registration_id uuid REFERENCES registrations(registration_id) ON DELETE SET NULL,
    details text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT audit_action_not_blank CHECK (length(btrim(action)) > 0)
);

CREATE INDEX audit_log_created_at_idx
    ON audit_log (created_at DESC);

CREATE INDEX audit_log_employee_idx
    ON audit_log (employee_id, created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER companies_set_updated_at
    BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER employees_set_updated_at
    BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER products_set_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER admins_set_updated_at
    BEFORE UPDATE ON admins
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO products (name, price)
VALUES
    ('Blikje', 0.65),
    ('Sneetje brood', 0.10),
    ('Boter', 0.10),
    ('Zoet beleg', 0.20),
    ('Glas melk', 0.20),
    ('Beleg', 0.50),
    ('Ei', 0.50),
    ('Yoghurt', 0.50)
ON CONFLICT (name) DO NOTHING;

-- Maandoverzicht voor het admin-dashboard.
CREATE OR REPLACE VIEW monthly_employee_consumption AS
SELECT
    date_trunc('month', r.registered_at)::date AS month_start,
    e.employee_id,
    e.first_name,
    e.last_name,
    c.company_id,
    c.name AS company_name,
    SUM(r.amount)::integer AS total_amount,
    SUM(r.amount * p.price)::numeric(12, 2) AS total_cost
FROM registrations r
JOIN employees e ON e.employee_id = r.employee_id
LEFT JOIN companies c ON c.company_id = e.company_id
JOIN products p ON p.product_id = r.product_id
GROUP BY
    date_trunc('month', r.registered_at)::date,
    e.employee_id,
    e.first_name,
    e.last_name,
    c.company_id,
    c.name;

-- Voorbeeld: alle registraties binnen een periode.
-- SELECT e.first_name, e.last_name, c.name AS company_name,
--        p.name AS product_name, r.amount, r.registered_at
-- FROM registrations r
-- JOIN employees e ON e.employee_id = r.employee_id
-- LEFT JOIN companies c ON c.company_id = e.company_id
-- JOIN products p ON p.product_id = r.product_id
-- WHERE r.registered_at >= $1 AND r.registered_at < $2
-- ORDER BY r.registered_at DESC;
