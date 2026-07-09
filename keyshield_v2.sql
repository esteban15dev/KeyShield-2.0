-- ============================================================
-- KeyShield v2 — Esquema Supabase con Auth Nativo + RLS
-- Ejecutar en: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Tabla de Clasificaciones
CREATE TABLE IF NOT EXISTS clasificacion (
    id_clasificacion SERIAL PRIMARY KEY,
    id_usuario       UUID NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre           VARCHAR(50)  NOT NULL,
    color            VARCHAR(7)   DEFAULT '#3b82f6',
    icono            VARCHAR(30)  DEFAULT 'folder',
    fecha_creacion   TIMESTAMPTZ  DEFAULT NOW()
);

-- Tabla de Cuentas
CREATE TABLE IF NOT EXISTS cuenta (
    id_cuenta          SERIAL      PRIMARY KEY,
    id_usuario         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre_servicio    VARCHAR(100) NOT NULL,
    url_servicio       VARCHAR(255) NULL,
    nombre_cuenta      VARCHAR(100) NOT NULL,
    password_cifrada   TEXT         NOT NULL,
    iv                 VARCHAR(64)  NOT NULL,
    notas              TEXT         NULL,
    fecha_creacion     TIMESTAMPTZ  DEFAULT NOW(),
    fecha_modificacion TIMESTAMPTZ  DEFAULT NOW()
);

-- Tabla Puente: Relación Muchos a Muchos
CREATE TABLE IF NOT EXISTS cuenta_clasificacion (
    id_cuenta          INT  NOT NULL REFERENCES cuenta(id_cuenta)          ON DELETE CASCADE,
    id_clasificacion   INT  NOT NULL REFERENCES clasificacion(id_clasificacion) ON DELETE CASCADE,
    PRIMARY KEY (id_cuenta, id_clasificacion)
);

-- Trigger para auto-actualizar fecha_modificacion en cuenta
CREATE OR REPLACE FUNCTION actualizar_fecha_modificacion()
RETURNS TRIGGER AS $$
BEGIN
    NEW.fecha_modificacion = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cuenta_actualizar_fecha ON cuenta;
CREATE TRIGGER trg_cuenta_actualizar_fecha
    BEFORE UPDATE ON cuenta
    FOR EACH ROW
    EXECUTE FUNCTION actualizar_fecha_modificacion();

-- Clasificaciones por defecto globales
INSERT INTO clasificacion (id_usuario, nombre, color, icono) VALUES
(NULL, 'Entretenimiento', '#ec4899', 'film-line'),
(NULL, 'Juegos',          '#8b5cf6', 'gamepad-line'),
(NULL, 'Trabajo',         '#3b82f6', 'briefcase-line'),
(NULL, 'Bancarias',       '#10b981', 'bank-card-line'),
(NULL, 'Redes Sociales',  '#f97316', 'user-heart-line'),
(NULL, 'Compras',         '#06b6d4', 'shopping-cart-line')
ON CONFLICT DO NOTHING;

-- Habilitar Row Level Security (RLS)
ALTER TABLE clasificacion        ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuenta               ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuenta_clasificacion ENABLE ROW LEVEL SECURITY;

-- Políticas para clasificacion
DROP POLICY IF EXISTS "Leer propias y globales" ON clasificacion;
CREATE POLICY "Leer propias y globales" ON clasificacion
    FOR SELECT USING (id_usuario IS NULL OR id_usuario = auth.uid());

DROP POLICY IF EXISTS "Insertar propias" ON clasificacion;
CREATE POLICY "Insertar propias" ON clasificacion
    FOR INSERT WITH CHECK (id_usuario = auth.uid());

DROP POLICY IF EXISTS "Actualizar propias" ON clasificacion;
CREATE POLICY "Actualizar propias" ON clasificacion
    FOR UPDATE USING (id_usuario = auth.uid());

DROP POLICY IF EXISTS "Eliminar propias" ON clasificacion;
CREATE POLICY "Eliminar propias" ON clasificacion
    FOR DELETE USING (id_usuario = auth.uid());

-- Políticas para cuenta
DROP POLICY IF EXISTS "CRUD propio cuenta" ON cuenta;
CREATE POLICY "CRUD propio cuenta" ON cuenta
    FOR ALL USING (id_usuario = auth.uid())
    WITH CHECK (id_usuario = auth.uid());

-- Políticas para cuenta_clasificacion
DROP POLICY IF EXISTS "CRUD propio cuenta_clasificacion" ON cuenta_clasificacion;
CREATE POLICY "CRUD propio cuenta_clasificacion" ON cuenta_clasificacion
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM cuenta
            WHERE cuenta.id_cuenta = cuenta_clasificacion.id_cuenta
              AND cuenta.id_usuario = auth.uid()
        )
    );

-- Función Helper para obtener cuentas con clasificaciones mapeadas
CREATE OR REPLACE FUNCTION get_mis_cuentas()
RETURNS TABLE (
    id_cuenta          INT,
    nombre_servicio    TEXT,
    url_servicio       TEXT,
    nombre_cuenta      TEXT,
    password_cifrada   TEXT,
    iv                 TEXT,
    notas              TEXT,
    fecha_creacion     TIMESTAMPTZ,
    fecha_modificacion TIMESTAMPTZ,
    clasificaciones    JSONB
) SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id_cuenta,
        c.nombre_servicio::TEXT,
        c.url_servicio::TEXT,
        c.nombre_cuenta::TEXT,
        c.password_cifrada::TEXT,
        c.iv::TEXT,
        c.notas::TEXT,
        c.fecha_creacion,
        c.fecha_modificacion,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id_clasificacion', cl.id_clasificacion,
                    'nombre', cl.nombre,
                    'color', cl.color,
                    'icono', cl.icono
                )
            ) FILTER (WHERE cl.id_clasificacion IS NOT NULL),
            '[]'::jsonb
        ) AS clasificaciones
    FROM cuenta c
    LEFT JOIN cuenta_clasificacion cc ON cc.id_cuenta = c.id_cuenta
    LEFT JOIN clasificacion cl ON cl.id_clasificacion = cc.id_clasificacion
    WHERE c.id_usuario = auth.uid()
    GROUP BY c.id_cuenta
    ORDER BY c.nombre_servicio ASC;
END;
$$ LANGUAGE plpgsql;
