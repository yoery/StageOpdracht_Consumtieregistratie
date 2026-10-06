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

-- Een bedrijf kan geen, één of meerdere consumptiepunten hebben.
CREATE TABLE consumption_points (
    point_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES companies(company_id) ON DELETE RESTRICT,
    name varchar(150) NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT consumption_points_name_not_blank CHECK (length(btrim(name)) > 0)
);

-- Naam van een punt is uniek binnen het bedrijf; hoofdletters tellen niet (zoals in de app).
CREATE UNIQUE INDEX consumption_points_name_unique
    ON consumption_points (company_id, lower(name));

CREATE TABLE employees (
    employee_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid REFERENCES companies(company_id) ON DELETE SET NULL,
    point_id uuid REFERENCES consumption_points(point_id) ON DELETE SET NULL,
    first_name varchar(100) NOT NULL,
    last_name varchar(150) NOT NULL,
    payroll_code varchar(100),
    personnel_number varchar(100),
    -- Optioneel afwijkend werkgevernummer; NULL = companies.employer_number.
    employer_number varchar(100),
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
    CONSTRAINT products_price_non_negative CHECK (price >= 0)
);

-- Productnaam is uniek; hoofdletters tellen niet (zoals in de app).
CREATE UNIQUE INDEX products_name_unique
    ON products (lower(name));

-- Aanbod en voorraad per consumptiepunt per product.
-- Een nieuw product krijgt bij ieder punt een regel met offered = false.
CREATE TABLE point_products (
    point_id uuid NOT NULL REFERENCES consumption_points(point_id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    offered boolean NOT NULL DEFAULT false,
    stock integer NOT NULL DEFAULT 0,
    minimum integer NOT NULL DEFAULT 0,
    -- Tijdstip van de laatste telling van de voorraad; NULL = nooit geteld.
    -- Een registratie van vóór dit tijdstip verandert de voorraad niet (ook niet bij een
    -- correctie), omdat het product dan al niet meer in de getelde voorraad zat.
    counted_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (point_id, product_id),
    CONSTRAINT point_products_minimum_non_negative CHECK (minimum >= 0)
);

-- Producten die bijbesteld moeten worden (op of onder het minimum).
CREATE OR REPLACE VIEW stock_alerts AS
SELECT
    c.name AS company_name,
    cp.name AS point_name,
    p.name AS product_name,
    pp.stock,
    pp.minimum,
    CASE WHEN pp.stock <= 0 THEN 'Op' ELSE 'Bijbestellen' END AS status
FROM point_products pp
JOIN consumption_points cp ON cp.point_id = pp.point_id
JOIN companies c ON c.company_id = cp.company_id
JOIN products p ON p.product_id = pp.product_id
WHERE pp.offered = true
  AND pp.stock <= pp.minimum;

-- Beheerders die mogen inloggen op het beheerscherm.
CREATE TABLE admins (
    admin_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email varchar(320) NOT NULL,
    -- Alleen de hash van het wachtwoord, nooit het wachtwoord zelf (geen platte tekst).
    -- Gebruik Argon2id (of anders bcrypt) met een eigen, willekeurige salt per gebruiker.
    -- De backend maakt en controleert de hash; de database ziet het wachtwoord nooit.
    password_hash text NOT NULL,
    display_name varchar(150) NOT NULL,
    -- Rollen uit hoofdstuk 3 van het TO:
    --   'admin'        = de beheerder (beheert medewerkers, producten, bedrijven, voorraad
    --                    en registraties);
    --   'system_admin' = de systeembeheerder (technisch beheer, gebruikersbeheer).
    role varchar(30) NOT NULL DEFAULT 'admin',
    active boolean NOT NULL DEFAULT true,
    last_login_at timestamptz,
    -- Aantal mislukte inlogpogingen na elkaar; wordt 0 na een geslaagde login.
    failed_login_count integer NOT NULL DEFAULT 0,
    -- Na te veel mislukte pogingen is het account tot dit tijdstip geblokkeerd
    -- (bescherming tegen het raden van wachtwoorden). NULL = niet geblokkeerd.
    locked_until timestamptz,
    -- Staat tweestapsverificatie (MFA) aan voor deze beheerder?
    mfa_enabled boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT admins_role_valid CHECK (role IN ('admin', 'system_admin')),
    CONSTRAINT admins_failed_login_count_non_negative CHECK (failed_login_count >= 0),
    CONSTRAINT admins_display_name_not_blank CHECK (length(btrim(display_name)) > 0)
);

CREATE UNIQUE INDEX admins_email_unique
    ON admins (lower(email));

CREATE TABLE registrations (
    registration_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id uuid NOT NULL REFERENCES employees(employee_id) ON DELETE RESTRICT,
    product_id uuid NOT NULL REFERENCES products(product_id) ON DELETE RESTRICT,
    -- Consumptiepunt dat het product aanbood (NULL als het punt het product niet aanbood).
    -- Er ging alleen voorraad af als de registratie niet vóór de laatste telling
    -- (point_products.counted_at) lag.
    point_id uuid REFERENCES consumption_points(point_id) ON DELETE SET NULL,
    registered_by_admin_id uuid REFERENCES admins(admin_id) ON DELETE SET NULL,
    registered_at timestamptz NOT NULL DEFAULT now(),
    amount integer NOT NULL DEFAULT 1,
    -- Prijs op het moment van registreren (per stuk). Een latere prijswijziging van het
    -- product verandert oude maanden in de loonexport dus niet.
    price numeric(8, 2) NOT NULL,
    -- Werkgevernummer op het moment van registreren, om dezelfde reden als de prijs:
    -- een oude loonmaand in de export verandert niet als de medewerker van bedrijf wisselt.
    employer_number varchar(100),
    CONSTRAINT registrations_amount_positive CHECK (amount > 0),
    CONSTRAINT registrations_price_non_negative CHECK (price >= 0)
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

CREATE TRIGGER consumption_points_set_updated_at
    BEFORE UPDATE ON consumption_points
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER point_products_set_updated_at
    BEFORE UPDATE ON point_products
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER products_set_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER admins_set_updated_at
    BEFORE UPDATE ON admins
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO companies (name)
VALUES
    ('TVB'),
    ('E-Control'),
    ('Home Service Nederland'),
    ('IT Supervision'),
    ('Klik'),
    ('MVIE'),
    ('STB'),
    ('Technisch Beheer Nederland'),
    ('Terberg Totaal Installaties'),
    ('Titanium 24'),
    ('Van den Broek Loodgietersbedrijf'),
    ('VR Bedrijven'),
    ('TVB Academy');

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
ON CONFLICT ((lower(name))) DO NOTHING;

-- Maandoverzicht voor het admin-dashboard.
-- De kosten gebruiken de prijs die bij de registratie is bewaard (r.price), niet de huidige productprijs.
CREATE OR REPLACE VIEW monthly_employee_consumption AS
SELECT
    date_trunc('month', r.registered_at)::date AS month_start,
    e.employee_id,
    e.first_name,
    e.last_name,
    c.company_id,
    c.name AS company_name,
    SUM(r.amount)::integer AS total_amount,
    SUM(r.amount * r.price)::numeric(12, 2) AS total_cost
FROM registrations r
JOIN employees e ON e.employee_id = r.employee_id
LEFT JOIN companies c ON c.company_id = e.company_id
GROUP BY
    date_trunc('month', r.registered_at)::date,
    e.employee_id,
    e.first_name,
    e.last_name,
    c.company_id,
    c.name;

-- Voorbeeld: alle registraties binnen een periode.
-- SELECT e.first_name, e.last_name, c.name AS company_name,
--        p.name AS product_name, r.amount, r.price, r.registered_at
-- FROM registrations r
-- JOIN employees e ON e.employee_id = r.employee_id
-- LEFT JOIN companies c ON c.company_id = e.company_id
-- JOIN products p ON p.product_id = r.product_id
-- WHERE r.registered_at >= $1 AND r.registered_at < $2
-- ORDER BY r.registered_at DESC;

-- ------------------------------------------------------------------
-- Beveiliging: rollen met zo weinig rechten als nodig (least privilege)
-- ------------------------------------------------------------------
-- Voorbeeld; pas namen en wachtwoorden aan per omgeving en zet wachtwoorden nooit in dit bestand.
--
-- De applicatie (backend/API) logt in met een eigen rol die geen tabellen mag aanmaken of
-- verwijderen en geen eigenaar van de tabellen is.
-- CREATE ROLE blikjes_app LOGIN PASSWORD '...';
-- REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
-- GRANT USAGE ON SCHEMA public TO blikjes_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE
--     ON companies, consumption_points, employees, products, point_products, registrations
--     TO blikjes_app;
-- GRANT SELECT, INSERT, UPDATE ON admins TO blikjes_app;
-- GRANT SELECT ON stock_alerts, monthly_employee_consumption TO blikjes_app;
--
-- Het logboek is alleen-toevoegen (append-only): de applicatie mag regels lezen en
-- toevoegen, maar niet wijzigen of verwijderen. Zo blijft het logboek controleerbaar.
-- GRANT SELECT, INSERT ON audit_log TO blikjes_app;
-- REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM blikjes_app;
--
-- Een aparte rol met alleen leesrechten, bijvoorbeeld voor rapportages.
-- CREATE ROLE blikjes_rapportage LOGIN PASSWORD '...';
-- GRANT USAGE ON SCHEMA public TO blikjes_rapportage;
-- GRANT SELECT ON monthly_employee_consumption, stock_alerts TO blikjes_rapportage;
--
-- Bewaartermijn en anonimiseren (AVG):
--   - Bewaar registraties niet langer dan nodig voor de loonadministratie
--     (bijvoorbeeld de fiscale bewaarplicht van 7 jaar) en verwijder of anonimiseer ze daarna.
--   - Gaat een medewerker uit dienst, anonimiseer dan na de bewaartermijn de persoonsgegevens
--     (naam, looncode, personeelsnummer), zodat totalen bruikbaar blijven zonder persoon.
--   - Voer dit periodiek uit met een geplande taak door de systeembeheerder.
--
-- Queries vanuit de applicatie:
--   De applicatie gebruikt uitsluitend geparametriseerde queries (zoals $1 en $2 in het
--   voorbeeld hierboven) en plakt nooit invoer van gebruikers in de SQL-tekst.
--   Zo is SQL-injectie niet mogelijk.
