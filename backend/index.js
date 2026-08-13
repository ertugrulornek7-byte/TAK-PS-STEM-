const app = require('./app');
const SchedulerService = require('./services/schedulerService');
const PORT = process.env.PORT || 3000;

// Zamanlanmış görevleri başlat
SchedulerService.init();

const BackupService = require('./services/backupService');
BackupService.start();

// Sunucuyu ayağa kaldır
app.listen(PORT, () => {
  console.log(`🚀 Backend servisi http://localhost:${PORT} adresinde çalışıyor`);
});