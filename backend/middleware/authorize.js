// Bu bir 'Factory' fonksiyondur. İçine ['BOLGE', 'SISTEM'] gibi izinli makamları alır.
const authorize = (allowedRoles = []) => {
  return (req, res, next) => {
    
    // Eğer kimlik kontrolünden (authenticate) geçmemişse doğrudan reddet
    if (!req.user) {
      return res.status(401).json({ error: 'Önce giriş yapmalısınız.' });
    }

    // Sistemin kurucu Admin'i (SISTEM) ise her kapıdan sorgusuz geçer
    if (req.user.roleLevel === 'SISTEM') {
      return next();
    }

    // İzin verilen makamlar listesi doluysa ve bu kullanıcının makamı o listede yoksa, kapıdan çevir!
    if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.roleLevel)) {
      return res.status(403).json({ error: 'Bu işlemi yapmaya makamınızın (yetkinizin) seviyesi yetmemektedir.' });
    }

    // Geçiş izni verildi
    next();
  };
};

module.exports = authorize;