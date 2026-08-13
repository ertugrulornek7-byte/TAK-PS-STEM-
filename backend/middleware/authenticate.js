const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const authenticate = async (req, res, next) => {
  try {
    // 1. Gelen isteğin başlığında (header) Token var mı diye bakıyoruz
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Yetkilendirme hatası: Geçerli bir bilet (Token) bulunamadı.' });
    }

    // 2. Token'ı ayırt edip doğruluyoruz
    const token = authHeader.split(' ')[1];

    // Güvenlik: Şifreyi .env dosyasından alıyoruz
    if (!process.env.JWT_SECRET) {
      console.error("🚨 KRİTİK HATA: .env dosyasında JWT_SECRET tanımlı değil! Sunucu başlatılamıyor.");
      process.exit(1); // Uygulamayı güvenli bir şekilde durdurur
    }

    const JWT_SECRET = process.env.JWT_SECRET;

    const decoded = jwt.verify(token, JWT_SECRET);

    // 3. Veritabanından bu kullanıcıyı tapu kayıtlarıyla birlikte çekiyoruz
    // 🔥 EKLENDİ: managedRegion / managedDistrict — bir BOLGE/MINTIKA
    // kullanıcısının GERÇEKTEN hangi bölgeyi/mıntıkayı yönettiğini bulmak için
    // gerekli. Bu olmadan toplu personel/talebe yüklemesindeki otomatik
    // hiyerarşi oluşturma mantığı kimin nereyi yönettiğini bilemiyordu.
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: {
        district: true,
        institution: true,
        managedRegion: true,
        managedDistrict: true,
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'Geçersiz token: Sistemde böyle bir kullanıcı bulunamadı.' });
    }

    // 4. Kullanıcı bilgilerini diğer sayfalarda kullanmak üzere 'req.user' içine koyuyoruz
    req.user = user;
    next(); // Geçiş izni verildi, bir sonraki işleme devam edebilir!

  } catch (error) {
    console.error("Kimlik doğrulama hatası:", error.message);
    return res.status(401).json({ error: 'Yetkisiz erişim: Biletinizin süresi geçmiş veya geçersiz.' });
  }
};

module.exports = authenticate;