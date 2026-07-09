-- Creación de la Base de Datos (opcional si ya está creada en el gestor de BD)
CREATE DATABASE IF NOT EXISTS gestor_passwords CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE gestor_passwords;

-- Tabla de Usuarios
CREATE TABLE IF NOT EXISTS USUARIO (
    id_usuario INT AUTO_INCREMENT PRIMARY KEY,
    nombre_usuario VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    salt VARCHAR(64) NOT NULL,
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Tabla de Clasificaciones
CREATE TABLE IF NOT EXISTS CLASIFICACION (
    id_clasificacion INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NULL, -- NULL si es del sistema por defecto, o FK a USUARIO si es personalizada
    nombre VARCHAR(50) NOT NULL,
    color VARCHAR(7) DEFAULT '#3b82f6', -- Color en hexadecimal para interfaz amigable
    icono VARCHAR(30) DEFAULT 'folder', -- Nombre del icono a renderizar (e.g. FontAwesome o SVG)
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_usuario) REFERENCES USUARIO(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Tabla de Cuentas
CREATE TABLE IF NOT EXISTS CUENTA (
    id_cuenta INT AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT NOT NULL,
    nombre_servicio VARCHAR(100) NOT NULL,
    url_servicio VARCHAR(255) NULL,
    nombre_cuenta VARCHAR(100) NOT NULL,
    password_cifrada TEXT NOT NULL,
    iv VARCHAR(64) NOT NULL, -- Vector de inicialización para cifrado AES
    notas TEXT NULL,
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
    fecha_modificacion DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (id_usuario) REFERENCES USUARIO(id_usuario) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Tabla Puente: Relación Muchos a Muchos entre Cuenta y Clasificación
CREATE TABLE IF NOT EXISTS CUENTA_CLASIFICACION (
    id_cuenta INT NOT NULL,
    id_clasificacion INT NOT NULL,
    PRIMARY KEY (id_cuenta, id_clasificacion),
    FOREIGN KEY (id_cuenta) REFERENCES CUENTA(id_cuenta) ON DELETE CASCADE,
    FOREIGN KEY (id_clasificacion) REFERENCES CLASIFICACION(id_clasificacion) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Nota: Las clasificaciones por defecto globales (id_usuario = NULL) se insertan para que estén disponibles para todos los usuarios.
INSERT INTO CLASIFICACION (id_usuario, nombre, color, icono) VALUES
(NULL, 'Entretenimiento', '#ec4899', 'film'),
(NULL, 'Juegos', '#8b5cf6', 'gamepad'),
(NULL, 'Trabajo', '#3b82f6', 'briefcase'),
(NULL, 'Bancarias', '#10b981', 'credit-card')
ON DUPLICATE KEY UPDATE nombre=nombre;
