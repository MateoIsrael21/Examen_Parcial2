import express from 'express';
import { Pool } from 'pg';
import amqp from 'amqplib';
import { v4 as uuidv4 } from 'uuid';

const {
  PORT = 3001,
  PG_HOST = 'localhost',
  PG_PORT = 5432,
  PG_DB = 'agroflow',
  PG_USER = 'agro',
  PG_PASSWORD = 'agro',
  RABBIT_URL = 'amqp://guest:guest@localhost:5672',
  CENTRAL_BASE_URL = 'http://localhost:3001'
} = process.env;

const app = express();
app.use(express.json());

const pool = new Pool({
  host: PG_HOST, port: PG_PORT, database: PG_DB, user: PG_USER, password: PG_PASSWORD
});

let amqpConn, amqpChannel;
async function initRabbit() {
  amqpConn = await amqp.connect(RABBIT_URL);
  amqpChannel = await amqpConn.createChannel();
  await amqpChannel.assertExchange('cosechas', 'topic', { durable: true });
  console.log('[central] RabbitMQ listo');
}
initRabbit().catch(err => { console.error('Rabbit error:', err); process.exit(1); });

app.get('/health', (req,res)=>res.json({ok:true, service:'central'}));

// ---- Agricultores CRUD ----
app.post('/agricultores', async (req,res)=>{
  const {nombre, finca, ubicacion, correo} = req.body;
  if(!nombre || !finca || !ubicacion || !correo) return res.status(400).json({error:'faltan campos'});
  const q = `INSERT INTO agricultores (agricultor_id, nombre, finca, ubicacion, correo) VALUES ($1,$2,$3,$4,$5) RETURNING *`;
  const id = uuidv4();
  const {rows} = await pool.query(q, [id, nombre, finca, ubicacion, correo]);
  res.json(rows[0]);
});

app.get('/agricultores/:id', async (req,res)=>{
  const {rows} = await pool.query('SELECT * FROM agricultores WHERE agricultor_id=$1',[req.params.id]);
  if(rows.length===0) return res.status(404).json({error:'no encontrado'});
  res.json(rows[0]);
});

app.put('/agricultores/:id', async (req,res)=>{
  const {nombre, finca, ubicacion, correo} = req.body;
  const {rows} = await pool.query(
    'UPDATE agricultores SET nombre=$1, finca=$2, ubicacion=$3, correo=$4 WHERE agricultor_id=$5 RETURNING *',
    [nombre, finca, ubicacion, correo, req.params.id]
  );
  if(rows.length===0) return res.status(404).json({error:'no encontrado'});
  res.json(rows[0]);
});

app.delete('/agricultores/:id', async (req,res)=>{
  await pool.query('DELETE FROM agricultores WHERE agricultor_id=$1',[req.params.id]);
  res.json({ok:true});
});

// ---- Cosechas ----
app.post('/cosechas', async (req,res)=>{
  const { agricultor_id, producto, toneladas, ubicacion } = req.body;
  if(!agricultor_id || !producto || typeof toneladas!=='number') return res.status(400).json({error:'datos inválidos'});
  // Validar agricultor
  const ag = await pool.query('SELECT 1 FROM agricultores WHERE agricultor_id=$1',[agricultor_id]);
  if(ag.rowCount===0) return res.status(400).json({error:'agricultor inválido'});

  const cosecha_id = uuidv4();
  const insertQ = `INSERT INTO cosechas (cosecha_id, agricultor_id, producto, toneladas, estado) VALUES ($1,$2,$3,$4,'REGISTRADA') RETURNING *`;
  const {rows} = await pool.query(insertQ, [cosecha_id, agricultor_id, producto, toneladas]);
  // Publicar evento
  const payload = {
    event_id: uuidv4(),
    event_type: 'nueva_cosecha',
    timestamp: new Date().toISOString(),
    payload: { cosecha_id, producto, toneladas, requiere_insumos: ['Semilla Arroz L-23','Fertilizante N-PK'] }
  };
  amqpChannel.publish('cosechas','cosechas.nueva', Buffer.from(JSON.stringify(payload)), { persistent: true });
  res.json(rows[0]);
});

app.get('/cosechas/:id', async (req,res)=>{
  const {rows} = await pool.query('SELECT * FROM cosechas WHERE cosecha_id=$1',[req.params.id]);
  if(rows.length===0) return res.status(404).json({error:'no encontrado'});
  res.json(rows[0]);
});

app.put('/cosechas/:id/estado', async (req,res)=>{
  const { estado, factura_id } = req.body;
  const {rows} = await pool.query('UPDATE cosechas SET estado=$1, factura_id=$2 WHERE cosecha_id=$3 RETURNING *',[estado, factura_id, req.params.id]);
  if(rows.length===0) return res.status(404).json({error:'no encontrada'});
  res.json(rows[0]);
});

const server = app.listen(PORT, ()=>console.log(`[central] escuchando en :${PORT}`));
process.on('SIGINT', ()=>{ server.close(()=>process.exit(0)); });
