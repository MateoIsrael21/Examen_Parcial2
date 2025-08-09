import express from 'express';
import amqp from 'amqplib';
import mysql from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';

const {
  PORT=3002,
  MYSQL_HOST='localhost',
  MYSQL_PORT=3306,
  MYSQL_DB='inventario',
  MYSQL_USER='inv',
  MYSQL_PASSWORD='inv',
  RABBIT_URL='amqp://guest:guest@localhost:5672'
} = process.env;

const app = express();
app.use(express.json());

let pool;
async function initDB(){
  pool = await mysql.createPool({host: MYSQL_HOST, port: MYSQL_PORT, user: MYSQL_USER, password: MYSQL_PASSWORD, database: MYSQL_DB, waitForConnections: true, connectionLimit: 10});
  // Ensure base insumos exist (optional)
}
initDB().catch(err=>{console.error('MySQL error:', err); process.exit(1);});

let ch;
async function initRabbit(){
  const conn = await amqp.connect(RABBIT_URL);
  ch = await conn.createChannel();
  await ch.assertExchange('cosechas','topic',{durable:true});
  const q = await ch.assertQueue('cola_inventario', {durable: true});
  await ch.bindQueue(q.queue, 'cosechas', 'cosechas.nueva');
  ch.consume(q.queue, async (msg)=>{
    try{
      const ev = JSON.parse(msg.content.toString());
      const { cosecha_id, toneladas } = ev.payload || {};
      // 5kg semilla/ton + 2kg fertilizante/ton
      const semilla = toneladas * 5;
      const fertil = toneladas * 2;
      await pool.execute("UPDATE insumos SET stock = stock - ? WHERE nombre_insumo = 'Semilla Arroz L-23'", [semilla]);
      await pool.execute("UPDATE insumos SET stock = stock - ? WHERE nombre_insumo = 'Fertilizante N-PK'", [fertil]);
      console.log('[inventario] Ajuste aplicado:', {cosecha_id, semilla, fertil});
      ch.ack(msg);
    }catch(e){
      console.error('inventario consume error', e);
      ch.nack(msg, false, false);
    }
  });
  console.log('[inventario] RabbitMQ listo');
}
initRabbit().catch(err=>{console.error('Rabbit error:', err); process.exit(1);});

app.get('/health',(req,res)=>res.json({ok:true, service:'inventario'}));

// CRUD insumos
app.post('/insumos', async (req,res)=>{
  const { nombre, stock=0, unidad_medida='kg', categoria='Semilla' } = req.body;
  if(!nombre) return res.status(400).json({error:'nombre requerido'});
  const id = uuidv4();
  await pool.execute('INSERT INTO insumos (insumo_id, nombre_insumo, stock, unidad_medida, categoria) VALUES (?,?,?,?,?)',[id, nombre, stock, unidad_medida, categoria]);
  const [rows] = await pool.execute('SELECT * FROM insumos WHERE insumo_id=?',[id]);
  res.json(rows[0]);
});

app.get('/insumos', async (req,res)=>{
  const [rows] = await pool.execute('SELECT * FROM insumos ORDER BY nombre_insumo');
  res.json(rows);
});

app.put('/insumos/:id', async (req,res)=>{
  const { nombre, stock, unidad_medida, categoria } = req.body;
  await pool.execute('UPDATE insumos SET nombre_insumo=?, stock=?, unidad_medida=?, categoria=? WHERE insumo_id=?',[nombre, stock, unidad_medida, categoria, req.params.id]);
  const [rows] = await pool.execute('SELECT * FROM insumos WHERE insumo_id=?',[req.params.id]);
  res.json(rows[0] || {ok:true});
});

app.delete('/insumos/:id', async (req,res)=>{
  await pool.execute('DELETE FROM insumos WHERE insumo_id=?',[req.params.id]);
  res.json({ok:true});
});

app.listen(PORT, ()=>console.log(`[inventario] escuchando en :${PORT}`));
