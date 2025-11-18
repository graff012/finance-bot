import 'dotenv/config'
import prisma from '../src/db'

async function main() {
  const count = await prisma.user.count()
  console.log('Users in DB: ', count)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
