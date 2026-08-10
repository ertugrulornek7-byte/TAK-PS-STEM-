module.exports = (err, req, res, next) => {
  console.error("🚨 Sistem Hatası Yakalandı:", err.message || err);

  const statusCode = err.status || 500;
  const response = {
    error: {
      message: err.message || 'Sunucuda beklenmeyen bir hata oluştu.',
      code: err.code || 'INTERNAL_SERVER_ERROR'
    }
  };

  res.status(statusCode).json(response);
};