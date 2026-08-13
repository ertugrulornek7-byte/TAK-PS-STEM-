const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const Sentry = require("@sentry/node");

class BackupService {
    static start() {
        console.log('💾 BackupService: Otomatik yedekleme robotu başlatıldı.');

        // Her gece saat 03:00'da çalışacak şekilde ayarlandı
        cron.schedule('0 3 * * *', async () => {
            await this.takeSnapshot();
        });
    }

    static async takeSnapshot() {
        try {
            console.log('⏳ Veritabanı yerel yedeği alınıyor...');
            
            // Yedeklerin tutulacağı klasörü ayarla (backend/backups)
            const backupFolder = path.join(__dirname, '../backups');
            if (!fs.existsSync(backupFolder)) {
                fs.mkdirSync(backupFolder);
            }

            const backupDate = new Date().toISOString().split('T')[0];

            // Kritik tabloları çek (İleride buraya başka tablolar da eklenebilir)
            const users = await prisma.user.findMany();
            const institutions = await prisma.institution.findMany();
            const students = await prisma.student.findMany();

            const snapshot = {
                yedeklemeTarihi: new Date(),
                kayitSayilari: {
                    kullanicilar: users.length,
                    kurumlar: institutions.length,
                    ogrenciler: students.length
                },
                veriler: {
                    users,
                    institutions,
                    students
                }
            };

            // JSON formatında dosyaya yaz
            const fileName = path.join(backupFolder, `backup-${backupDate}.json`);
            fs.writeFileSync(fileName, JSON.stringify(snapshot, null, 2));

            console.log(`✅ Yedekleme başarılı. Dosya: ${fileName}`);
        } catch (error) {
            console.error('❌ Yedekleme sırasında hata oluştu:', error);
            // Yedekleme başarısız olursa Sentry'e fırlat ki hemen haberimiz olsun!
            Sentry.captureException(new Error(`Yedekleme Başarısız: ${error.message}`));
        }
    }
}

module.exports = BackupService;