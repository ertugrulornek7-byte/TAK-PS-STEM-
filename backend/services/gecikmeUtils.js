/**
 * Bir görevin/dönemin son tarihine göre kaç gün geç kaldığını hesaplar.
 * tamamlanmaTarihi verilmemişse (henüz tamamlanmamışsa) "şu ana kadar kaç
 * gün geçti" hesaplanır — bu, "hâlâ devam eden bir gecikme" anlamına gelir.
 */
function gecikmeHesapla(sonTarih, tamamlanmaTarihi = null) {
  if (!sonTarih) return { geciktiMi: false, gunSayisi: 0 };

  const dl = new Date(sonTarih);
  const kiyasNoktasi = tamamlanmaTarihi ? new Date(tamamlanmaTarihi) : new Date();

  if (kiyasNoktasi <= dl) return { geciktiMi: false, gunSayisi: 0 };

  const ms = kiyasNoktasi.getTime() - dl.getTime();
  const gunSayisi = Math.ceil(ms / 86400000);
  return { geciktiMi: true, gunSayisi };
}

module.exports = { gecikmeHesapla };