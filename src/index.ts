import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createServer } from 'http';
import { Server } from 'socket.io';

// 1. INICIALIZACIÓN
const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'mi_secreto_super_seguro';

// 2. CREAR SERVIDOR HTTP Y SOCKET.IO
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173", // Tu Frontend
    methods: ["GET", "POST"]
  }
});

// 3. MIDDLEWARES
app.use(cors());
app.use(express.json());

// 4. MIDDLEWARE DE AUTENTICACIÓN
const authenticate = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Falta token' });

  try {
    const verified = jwt.verify(token, JWT_SECRET) as any;
    req.userId = verified.userId;
    next();
  } catch (error) {
    res.status(403).json({ error: 'Token inválido' });
  }
};

// --- RUTAS AUTH ---
app.post('/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(400).json({ error: 'Usuario ya existe' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hashedPassword, name },
    });
    res.json({ message: 'Creado', userId: user.id });
  } catch (error) { res.status(500).json({ error: 'Error server' }); }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, user: { email: user.email, name: user.name, role: user.role } });
  } catch (error) { res.status(500).json({ error: 'Error login' }); }
});

// --- RUTAS PRODUCTOS ---
app.get('/products', authenticate, async (req: any, res) => {
  const products = await prisma.product.findMany({
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: 'desc' }
  });
  res.json(products);
});

app.post('/products', authenticate, async (req: any, res) => {
  try {
    const { name, price, stock } = req.body;
    const newProduct = await prisma.product.create({
      data: { name, price: parseFloat(price), stock: parseInt(stock), userId: req.userId }
    });
    res.json(newProduct);
  } catch (error) { res.status(500).json({ error: 'Error creando producto' }); }
});

app.delete('/products/:id', authenticate, async (req: any, res) => {
  try {
    const { id } = req.params;
    await prisma.product.delete({ where: { id: Number(id) } });
    res.json({ message: 'Eliminado' });
  } catch (error) { res.status(500).json({ error: 'Error eliminando' }); }
});

// --- RUTAS PEDIDOS ---
app.post('/orders', authenticate, async (req: any, res) => {
  try {
    const { items, total } = req.body;
    const order = await prisma.order.create({
      data: {
        userId: req.userId, total: parseFloat(total),
        items: { create: items.map((i: any) => ({ description: i.description, quantity: Number(i.quantity), price: parseFloat(i.price) })) }
      }, include: { items: true }
    });
    res.json(order);
  } catch (error) { res.status(500).json({ error: 'Error pedido' }); }
});

app.get('/orders', authenticate, async (req: any, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  const where = user?.role === 'ADMIN' ? {} : { userId: req.userId };
  const orders = await prisma.order.findMany({ where, include: { user: true, items: true }, orderBy: { createdAt: 'desc' } });
  res.json(orders);
});

// --- APROBAR PEDIDO Y GESTIÓN DE STOCK/CLIENTES ---
app.patch('/orders/:id/status', authenticate, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const updatedOrder = await prisma.order.update({
      where: { id: Number(id) },
      data: { status },
      include: { user: true, items: true }
    });

    if (status === 'APROBADO') {
      // 1. Buscar o Crear Cliente
      let client = await prisma.client.findFirst({ where: { email: updatedOrder.user.email } });
      if (!client) {
        client = await prisma.client.create({
          data: { name: updatedOrder.user.name || 'Cliente', email: updatedOrder.user.email, userId: req.userId }
        });
      }

      // 2. Crear Factura
      await prisma.invoice.create({
        data: {
          userId: req.userId, clientId: client.id, total: updatedOrder.total, status: 'PENDIENTE',
          items: { create: updatedOrder.items.map(i => ({ description: i.description, quantity: i.quantity, price: i.price })) }
        }
      });

      // 3. Restar Stock
      for (const item of updatedOrder.items) {
        await prisma.product.updateMany({
          where: { name: item.description },
          data: { stock: { decrement: item.quantity } }
        });
      }
    }
    res.json(updatedOrder);
  } catch (error) { res.status(500).json({ error: 'Error actualizando estado' }); }
});

// --- RUTAS DE CHAT (INDIVIDUALES Y FILTRADAS) ---

// 1. Cargar historial filtrado: Si el usuario lo "borró", no se le muestra
app.get('/chat/history', authenticate, async (req: any, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    const isAdmin = user?.role === 'ADMIN';

    const messages = await prisma.chatMessage.findMany({
      where: {
        // Filtro de borrado individual
        ...(isAdmin ? { deletedByAdmin: false } : { deletedByCustomer: false })
      },
      orderBy: { createdAt: 'asc' },
      take: 50 // Mantenemos el límite de los últimos 50 mensajes
    });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Error al cargar historial' });
  }
});

// 2. Borrado Individual: No borra de la DB, solo oculta para este usuario
app.delete('/chat/history', authenticate, async (req: any, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    const isAdmin = user?.role === 'ADMIN';

    await prisma.chatMessage.updateMany({
      data: isAdmin ? { deletedByAdmin: true } : { deletedByCustomer: true }
    });

    res.json({ message: 'Historial limpiado para tu vista' });
  } catch (error) {
    res.status(500).json({ error: 'Error al ocultar historial' });
  }
});

// --- RUTAS EXTRAS ---
app.get('/invoices', authenticate, async (req: any, res) => {
  const invoices = await prisma.invoice.findMany({ where: { userId: req.userId }, include: { client: true, items: true }, orderBy: { createdAt: 'desc' } });
  res.json(invoices);
});

app.get('/clients', authenticate, async (req: any, res) => {
  const c = await prisma.client.findMany({ where: { userId: req.userId } });
  res.json(c);
});

// 5. CONFIGURACIÓN DE SOCKETS (TIEMPO REAL)
io.on("connection", (socket) => {
  console.log(`⚡ Usuario conectado al chat: ${socket.id}`);

  socket.on("send_message", async (data) => {
    try {
      // Guardar el mensaje en la DB siempre que se envía
      await prisma.chatMessage.create({
        data: {
          author: data.author,
          text: data.message,
        }
      });
      // Retransmitir a todos los conectados
      io.emit("receive_message", data);
    } catch (error) {
      console.error("Error al guardar mensaje:", error);
    }
  });

  socket.on("disconnect", () => {
    console.log("Usuario desconectado", socket.id);
  });
});

// 6. ARRANCAR SERVIDOR (httpServer es necesario para que Socket.io funcione)
httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor y Chat listos en puerto ${PORT}`);
});