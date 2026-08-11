const validate = (schema) => (req, res, next) => {
  try {
    // Gelen isteğin gövdesini (body), URL parametrelerini ve query'leri test et
    schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    // Her şey kurallara uygunsa rotaya devam etmesine izin ver
    next();
  } catch (err) {
    // 🔥 DÜZELTME: package.json'da zod@^4.4.3 kullanılıyor. Zod v4'te ZodError'ın
    // ".errors" özelliği kaldırıldı, artık ".issues" kullanılıyor. Bunu gerçekten
    // npm ile zod 4.4.3 kurup test ederek doğruladım: err.errors "undefined",
    // err.issues gerçek dizi. Eskisi (.errors) her validasyon hatasında
    // "Cannot read properties of undefined (reading 'map')" fırlatıyordu — yani
    // beklenen açıklayıcı 400 yerine belirsiz bir 500 dönüyordu. Bu, hem login
    // hem görev atama (assign-smart) hem kanıt yükleme (proof) uçlarını etkiliyordu.
    return res.status(400).json({
      error: {
        message: 'Gönderilen veri formatı hatalı veya eksik.',
        details: err.issues.map(e => ({
          alan: e.path.join('.').replace('body.', ''),
          sorun: e.message
        }))
      }
    });
  }
};

module.exports = validate;