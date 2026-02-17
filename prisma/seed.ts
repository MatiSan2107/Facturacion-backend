import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // ID de tu usuario ADMIN (cámbialo si es necesario)
  const ADMIN_ID = 1; 

  const products = [
    { name: 'Laptop Gamer Pro 15"', price: 1200.00, stock: 5 },
    { name: 'Mouse Inalámbrico', price: 25.00, stock: 50 },
    { name: 'Monitor 4K 27"', price: 450.00, stock: 8 },
    { name: 'Teclado Mecánico', price: 80.00, stock: 15 },
    { name: 'Silla Ergonómica', price: 250.00, stock: 10 },
    { name: 'Auriculares Noise Cancel', price: 120.00, stock: 20 },
    { name: 'Webcam HD 1080p', price: 60.00, stock: 25 },
    { name: 'Disco SSD 1TB', price: 90.00, stock: 30 },
    { name: 'Memoria RAM 16GB', price: 75.00, stock: 40 },
    { name: 'Router Wi-Fi 6', price: 110.00, stock: 12 },
  ]

  console.log('🌱 Sembrando productos...')

  for (const product of products) {
    await prisma.product.create({
      data: {
        name: product.name,
        price: product.price,
        stock: product.stock,
        userId: ADMIN_ID, // Relacionamos el producto con el admin
      }
    })
  }

  console.log('✅ ¡Productos creados correctamente!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })