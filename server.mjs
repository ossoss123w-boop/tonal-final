import Fastify from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = Fastify({ logger: false });

// Canciones iniciales por si Audius falla o no hay resultados
const INITIAL_TRENDING = [
  { id: 'd5gvG3-r648', title: 'Monaco', artist: 'Bad Bunny', album: 'Nadie Sabe Lo Que Va a Pasar Mañana', durationSec: 267, artworkUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&h=300&fit=crop' },
  { id: '4NRXx6U8ABQ', title: 'Columbia', artist: 'Quevedo', album: 'Donde Quiero Estar', durationSec: 186, artworkUrl: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=300&h=300&fit=crop' },
  { id: 'g1i137wQ-Hw', title: 'Pelele', artist: 'Morad', album: 'Reinsertado', durationSec: 153, artworkUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=300&h=300&fit=crop' },
  { id: 'k85mRPqvMbE', title: 'LUNA', artist: 'Feid, ATL Jacob', album: 'FERXXOCALIPSIS', durationSec: 196, artworkUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&h=300&fit=crop' }
];

app.get('/', async (req, reply) => {
  const htmlPath = path.join(__dirname, 'index.html');
  if (!fs.existsSync(htmlPath)) return reply.status(404).send('index.html no encontrado');
  reply.type('text/html').send(fs.readFileSync(htmlPath, 'utf-8'));
});

// Endpoint de búsqueda usando Audius
app.get('/api/search', async (req) => {
  const query = (req.query.q || '').trim();
  if (!query) return [];

  try {
    const res = await fetch(`https://api.audius.co/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=TonalApp&limit=20`, {
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.data && data.data.length > 0) {
        return data.data.map(track => ({
          id: track.id,
          title: track.title,
          artist: track.user.name,
          album: track.album_backlink || 'Single',
          durationSec: track.duration,
          artworkUrl: track.artwork?.['480x480'] || track.artwork?.['150x150'] || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=300&h=300&fit=crop',
          // URL de streaming directa. Audius devuelve un redirect 302 al MP3 real.
          streamUrl: `https://api.audius.co/v1/tracks/${track.id}/stream?app_name=TonalApp`
        }));
      }
    }
  } catch (e) {
    console.error('Error buscando en Audius:', e.message);
  }

  // Fallback a las canciones iniciales si Audius no responde
  return INITIAL_TRENDING.filter(t => 
    t.title.toLowerCase().includes(query.toLowerCase()) || 
    t.artist.toLowerCase().includes(query.toLowerCase())
  );
});

// Endpoint proxy para subir imágenes a la nube (img402.dev)
// Recibe el archivo y lo sube sin API Key, devolviendo la URL pública.
app.post('/api/upload', async (req, reply) => {
  try {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'No se envió ningún archivo' });

    const buffer = await data.toBuffer();
    const formData = new FormData();
    formData.append('image', new Blob([buffer], { type: data.mimetype }), data.filename);

    const res = await fetch('https://img402.dev/api/free', {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(15000)
    });

    if (!res.ok) throw new Error('Fallo en el servicio de imágenes');
    const json = await res.json();
    
    // img402.dev devuelve la URL en la propiedad 'url'
    return { url: json.url };
  } catch (e) {
    console.error('Error subiendo imagen:', e.message);
    return reply.status(500).send({ error: 'Error interno subiendo la imagen' });
  }
});

const PORT = Number(process.env.PORT) || 3000;
try {
  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`\n🚀 Tonal Server listo en puerto ${PORT}\n`);
} catch (err) {
  console.error(err);
  process.exit(1);
}