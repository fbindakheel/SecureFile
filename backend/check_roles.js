const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const members = await prisma.workspaceMember.findMany({
    include: { user: true, workspace: true }
  });
  console.log(JSON.stringify(members, null, 2));
}

check();
