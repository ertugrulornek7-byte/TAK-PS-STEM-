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
    // Veri hatalıysa 500 çökmesi yerine detaylı 400 Bad Request dön
    return res.status(400).json({
      error: {
        message: 'Gönderilen veri formatı hatalı veya eksik.',
        details: err.errors.map(e => ({ 
          alan: e.path.join('.').replace('body.', ''), 
          sorun: e.message 
        }))
      }
    });
  }
};

module.exports = validate;