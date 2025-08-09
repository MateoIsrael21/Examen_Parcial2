CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS agricultores (
  agricultor_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre VARCHAR(100) NOT NULL,
  finca VARCHAR(100) NOT NULL,
  ubicacion VARCHAR(100) NOT NULL,
  correo VARCHAR(150) UNIQUE NOT NULL,
  fecha_registro TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cosechas (
  cosecha_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agricultor_id UUID REFERENCES agricultores(agricultor_id),
  producto VARCHAR(50) NOT NULL,
  toneladas DECIMAL(10,2) CHECK (toneladas >= 0) NOT NULL,
  estado VARCHAR(20) DEFAULT 'REGISTRADA',
  creado_en TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  factura_id UUID NULL
);
