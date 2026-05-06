const { PrismaClient } = require('./node_modules/.prisma/client');
const p = new PrismaClient();

async function main() {
  try {
    const result = await p.$queryRaw`SELECT unnest(enum_range(NULL::"NotificationType"))::text AS enum_value`;
    console.log('NotificationType enum values:');
    result.forEach(r => console.log(' -', r.enum_value));
  } catch (e) {
    console.log('Error:', e.message);
  } finally {
    await p.$disconnect();
  }
}
main();