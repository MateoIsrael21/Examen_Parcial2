import express from 'express';
import amqp from 'amqplib';
import mariadb from 'mariadb';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const {
  PORT=3003,
  MARIADB_HOST='localhost',
  MARIADB_PORT=3306,
  MARIADB_DB='facturacion',
  MARIADB_USER='fact',
  MARIADB_PASSWORD='fact',
  RABBIT_URL='amqp://guest:guest@localhost:5672',
  CENTRAL_BASE_URL='http://localhost:3001'
} = process.env;

const app = express();
app.use(express.json());

const pool = mariadb.createPool({
  host: MARIADB_HOST, port: MARIADB_PORT, database: MARIADB_DB,
  user: MARIADB_USER, password: MARIADB_PASSWORD, connectionLimit: 5
});

const PRECIOS = { "Arroz Oro": 120, "Café Premium": 300 };

let ch;
async function initRabbit(){
  const conn = await amqp.connect(RABBIT_URL);
  ch = await conn.createChannel();
  await ch.assertExchange('cosechas','topic',{durable:true});
  const q = await ch.assertQueue('cola_facturacion', {durable:true});
  await ch.bindQueue(q.queue, 'cosechas', 'cosechas.nueva');
  ch.consume(q.queue, async (msg)=>{
    const ev = JSON.parse(msg.content.toString());
    try{
      const { cosecha_id, producto, toneladas } = ev.payload || {};
      const monto = (PRECIOS[producto] || 100) * toneladas;
      const factura_id = uuidv4();
      const conn2 = await pool.getConnection();
      await conn2.query(
        'INSERT INTO facturas (factura_id, cosecha_id, monto_total, pagado) VALUES (?,?,?,false)',
        [factura_id, cosecha_id, monto]
      );
      conn2.release();
      // Notificar a central
      await axios.put(`${CENTRAL_BASE_URL}/cosechas/${cosecha_id}/estado`, { estado: 'FACTURADA', factura_id });
      console.log('[facturacion] Generada factura', factura_id, 'para', cosecha_id, 'monto', monto);
      ch.ack(msg);
    }catch(e){
      console.error('facturacion consume error', e.message);
      ch.nack(msg, false, false);
    }
  });
  console.log('[facturacion] RabbitMQ listo');
}
initRabbit().catch(e=>{console.error('Rabbit error', e); process.exit(1);});

app.get('/health',(req,res)=>res.json({ok:true, service:'facturacion'}));

app.get('/facturas', async (req,res)=>{
  const conn = await pool.getConnection();
  const rows = await conn.query('SELECT * FROM facturas ORDER BY fecha_emision DESC LIMIT 50');
  conn.release();
  res.json(rows);
});

app.listen(PORT, ()=>console.log(`[facturacion] escuchando en :${PORT}`));
