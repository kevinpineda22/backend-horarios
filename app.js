import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';

import horariosRoutes from './src/routes/horarios.js';
import observacionesRoutes from './src/routes/observaciones.js';
import publicRoutes from './src/routes/public.js';
import empleadosRoutes from './src/routes/empleadosRoutes.js';

const app = express();
const PORT = process.env.PORT;


app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/horarios', horariosRoutes);
app.use('/api/observaciones', observacionesRoutes);
app.use('/api/empleados', empleadosRoutes);
app.use('/api/public', publicRoutes);

app.get('/', (_, res) => res.send('Gestor de Horarios API corriendooooo'));

app.listen(PORT, () => console.log(`Server on port ${PORT}`));