CREATE TABLE IF NOT EXISTS facturas (
  factura_id CHAR(36) PRIMARY KEY,
  cosecha_id CHAR(36) NOT NULL,
  monto_total DECIMAL(10,2) NOT NULL,
  pagado BOOLEAN DEFAULT FALSE,
  fecha_emision TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metodo_pago VARCHAR(30),
  codigo_qr TEXT
);

-- ===== Inventario en MariaDB (para reemplazar MySQL) =====
CREATE DATABASE IF NOT EXISTS inventario;
USE inventario;

CREATE TABLE IF NOT EXISTS insumos (
  insumo_id CHAR(36) PRIMARY KEY,
  nombre_insumo VARCHAR(100) NOT NULL UNIQUE,
  stock INT DEFAULT 0,
  unidad_medida VARCHAR(10) DEFAULT 'kg',
  categoria VARCHAR(30) NOT NULL DEFAULT 'Semilla',
  ultima_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

