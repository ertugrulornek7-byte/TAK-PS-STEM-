const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  // Şifreyi güvenli bir şekilde kriptoluyoruz
  const hashedPassword = await bcrypt.hash('123456', 10);

  // Sınırları olmayan bir Sistem Yöneticisi oluşturuyoruz
  const adminUser = await prisma.user.create({
    data: {
      username: 'admin',
      password: hashedPassword,
      fullName: 'Sistem Yöneticisi',
      roles: ['SISTEM', 'BOLGE_EM', 'MINTIKA_EM', 'KURUM_EM'],
      roleLevel: 'SISTEM'
    }
  });

  console.log('🚀 Kurşun geçirmez Admin hesabı başarıyla oluşturuldu!');
  console.log('Kullanıcı Adı: admin');
  console.log('Şifre: 123456');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });