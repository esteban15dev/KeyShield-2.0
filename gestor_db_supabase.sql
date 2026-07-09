-- =============================================
-- ESQUEMA PARA SUPABASE (PostgreSQL)
-- Ejecutar en: Supabase → SQL Editor → New Query
-- =============================================

-- Tabla de Usuarios (NO usa auth.users de Supabase, mantiene sistema propio)
CREATE TABLE IF NOT EXISTS usuario (
    id_usuario SERIAL PRIMARY KEY,
    nombre_usuario VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    salt VARCHAR(64) NOT NULL,
    fecha_creacion TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de Clasificaciones
CREATE TABLE IF NOT EXISTS clasificacion (
    id_clasificacion SERIAL PRIMARY KEY,
    id_usuario INT NULL,
    nombre VARCHAR(50) NOT NULL,
    color VARCHAR(7) DEFAULT '#3b82f6',
    icono VARCHAR(30) DEFAULT 'folder',
    fecha_creacion TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
);

-- Tabla de Cuentas
CREATE TABLE IF NOT EXISTS cuenta (
    id_cuenta SERIAL PRIMARY KEY,
    id_usuario INT NOT NULL,
    nombre_servicio VARCHAR(100) NOT NULL,
    url_servicio VARCHAR(255) NULL,
    nombre_cuenta VARCHAR(100) NOT NULL,
    password_cifrada TEXT NOT NULL,
    iv VARCHAR(64) NOT NULL,
    notas TEXT NULL,
    fecha_creacion TIMESTAMPTZ DEFAULT NOW(),
    fecha_modificacion TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario) ON DELETE CASCADE
);

-- Tabla Puente: Relación Muchos a Muchos
CREATE TABLE IF NOT EXISTS cuenta_clasificacion (
    id_cuenta INT NOT NULL,
    id_clasificacion INT NOT NULL,
    PRIMARY KEY (id_cuenta, id_clasificacion),
    FOREIGN KEY (id_cuenta) REFERENCES cuenta(id_cuenta) ON DELETE CASCADE,
    FOREIGN KEY (id_clasificacion) REFERENCES clasificacion(id_clasificacion) ON DELETE CASCADE
);

-- Trigger para simular ON UPDATE CURRENT_TIMESTAMP de MySQL
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
(NULL, 'Entretenimiento', '#ec4899', 'film'),
(NULL, 'Juegos', '#8b5cf6', 'gamepad'),
(NULL, 'Trabajo', '#3b82f6', 'briefcase'),
(NULL, 'Bancarias', '#10b981', 'credit-card')
ON CONFLICT (id_clasificacion) DO NOTHING;

-- Habilitar RLS para seguridad por defecto
ALTER TABLE usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuenta ENABLE ROW LEVEL SECURITY;
ALTER TABLE clasificacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuenta_clasificacion ENABLE ROW LEVEL SECURITY;

-- Políticas permisivas para que el rol de conexión del backend (Service Role o Postgres) pueda operar libremente
DROP POLICY IF EXISTS "Backend full access usuario" ON usuario;
CREATE POLICY "Backend full access usuario" ON usuario FOR ALL USING (true);

DROP POLICY IF EXISTS "Backend full access cuenta" ON cuenta;
CREATE POLICY "Backend full access cuenta" ON cuenta FOR ALL USING (true);

DROP POLICY IF EXISTS "Backend full access clasificacion" ON clasificacion;
CREATE POLICY "Backend full access clasificacion" ON clasificacion FOR ALL USING (true);

DROP POLICY IF EXISTS "Backend full access cuenta_clasificacion" ON cuenta_clasificacion;
CREATE POLICY "Backend full access cuenta_clasificacion" ON cuenta_clasificacion FOR ALL USING (true);
