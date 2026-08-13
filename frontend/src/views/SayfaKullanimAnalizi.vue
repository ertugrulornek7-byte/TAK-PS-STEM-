<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useAuthStore } from '../stores/authStore'
import api from '../api/axios'

const authStore = useAuthStore()
const role = computed(() => authStore.user?.roleLevel || 'PERSONEL')

const moduller = ref([])
const seciliModul = ref('YOKLAMA')
const donemTipi = ref('HAFTALIK') // HAFTALIK | AYLIK
const donemAnahtari = ref('')
const gruplamaTipi = ref('institution') // institution | district | personnel
const seciliKurumId = ref('') // personnel gruplaması için gerekli

const kurumlar = ref([]) // personel bazlı görünümde kurum seçmek için
const sonuc = ref(null)
const yukleniyor = ref(false)
const hataMesaji = ref('')

// Rol bazlı hangi gruplama sekmelerinin gösterileceği
const gruplamaSekmeleri = computed(() => {
  const sekmeler = [{ id: 'institution', ad: '🏢 Kurum Bazlı' }]
  if (['SISTEM', 'BOLGE'].includes(role.value)) sekmeler.push({ id: 'district', ad: '🌍 Mıntıka Bazlı' })
  if (['SISTEM', 'BOLGE', 'MINTIKA', 'KURUM'].includes(role.value)) sekmeler.push({ id: 'personnel', ad: '👤 Personel Bazlı' })
  return sekmeler
})

const bugununDonemAnahtari = () => {
  const now = new Date()
  if (donemTipi.value === 'AYLIK') {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }
  // ISO hafta hesabı (backend ile aynı mantık)
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

const modulleriGetir = async () => {
  try {
    const res = await api.get('/analytics/desteklenen-moduller')
    moduller.value = res.data || []
    if (moduller.value.length > 0 && !moduller.value.includes(seciliModul.value)) {
      seciliModul.value = moduller.value[0]
    }
  } catch (e) { console.error('Modül listesi alınamadı', e) }
}

const kurumlariGetir = async () => {
  try {
    const res = await api.get('/hierarchy/institutions')
    kurumlar.value = res.data || []
    if (role.value === 'KURUM') seciliKurumId.value = authStore.user?.institutionId || ''
    else if (kurumlar.value.length > 0 && !seciliKurumId.value) seciliKurumId.value = kurumlar.value[0].id
  } catch (e) { console.error('Kurum listesi alınamadı', e) }
}

const analizYap = async () => {
  yukleniyor.value = true
  hataMesaji.value = ''
  sonuc.value = null
  try {
    const params = { moduleType: seciliModul.value, period: donemAnahtari.value, groupBy: gruplamaTipi.value }
    if (gruplamaTipi.value === 'personnel') {
      if (!seciliKurumId.value) { hataMesaji.value = 'Lütfen bir kurum seçin.'; yukleniyor.value = false; return }
      params.institutionId = seciliKurumId.value
    }
    const res = await api.get('/analytics/module-usage', { params })
    sonuc.value = res.data
  } catch (e) {
    hataMesaji.value = e.response?.data?.error || 'Analiz yapılamadı.'
  } finally {
    yukleniyor.value = false
  }
}

const yuzdeRengi = (yuzde) => {
  if (yuzde === null || yuzde === undefined) return 'renk-bilinmiyor'
  if (yuzde >= 80) return 'renk-iyi'
  if (yuzde >= 50) return 'renk-orta'
  return 'renk-kotu'
}

const tarihFormatla = (tarih) => {
  if (!tarih) return '—'
  return new Date(tarih).toLocaleDateString('tr-TR')
}

watch(donemTipi, () => { donemAnahtari.value = bugununDonemAnahtari() })
watch(gruplamaTipi, () => { if (gruplamaTipi.value === 'personnel' && kurumlar.value.length === 0) kurumlariGetir() })

onMounted(async () => {
  donemAnahtari.value = bugununDonemAnahtari()
  await modulleriGetir()
  if (['SISTEM', 'BOLGE', 'MINTIKA'].includes(role.value)) await kurumlariGetir()
  await analizYap()
})
</script>

<template>
  <div class="sayfa-container">
    <div class="baslik-alani">
      <h2>📊 Kullanım Analizi</h2>
      <p style="color:#64748b;">Etüt takip defterinin her sekmesi için, kapsamınızdaki kurum/mıntıka/personelin ne kadar ve zamanında kullandığını görün.</p>
    </div>

    <div class="kutu-panel filtre-paneli">
      <div class="form-grid">
        <div class="form-eleman">
          <label>Modül</label>
          <select v-model="seciliModul" class="input-text" @change="analizYap">
            <option v-for="m in moduller" :key="m" :value="m">{{ m }}</option>
          </select>
        </div>

        <div class="form-eleman">
          <label>Dönem Tipi</label>
          <select v-model="donemTipi" class="input-text" @change="analizYap">
            <option value="HAFTALIK">Haftalık</option>
            <option value="AYLIK">Aylık</option>
          </select>
        </div>

        <div class="form-eleman">
          <label>Dönem ({{ donemTipi === 'HAFTALIK' ? 'ör: 2026-W33' : 'ör: 2026-08' }})</label>
          <input type="text" v-model="donemAnahtari" class="input-text" @keyup.enter="analizYap" />
        </div>

        <div class="form-eleman" v-if="gruplamaTipi === 'personnel'">
          <label>Kurum</label>
          <select v-model="seciliKurumId" class="input-text" @change="analizYap">
            <option v-for="k in kurumlar" :key="k.id" :value="k.id">{{ k.name }}</option>
          </select>
        </div>

        <div class="form-eleman">
          <label>&nbsp;</label>
          <button @click="analizYap" class="btn-ata">🔍 Analiz Et</button>
        </div>
      </div>
    </div>

    <div class="sekme-alani">
      <button v-for="s in gruplamaSekmeleri" :key="s.id"
        :class="{ 'aktif': gruplamaTipi === s.id }"
        @click="gruplamaTipi = s.id; analizYap()">{{ s.ad }}</button>
    </div>

    <div v-if="yukleniyor" class="bilgi-mesaj">Hesaplanıyor...</div>
    <div v-if="hataMesaji" class="uyari-mesaj">{{ hataMesaji }}</div>

    <div v-if="sonuc && !yukleniyor" class="kutu-panel">
      <h3>{{ sonuc.moduleType }} — {{ sonuc.periodKey }} sonuçları</h3>

      <table class="analiz-tablo" v-if="sonuc.satirlar && sonuc.satirlar.length > 0">
        <thead>
          <tr>
            <th v-if="gruplamaTipi === 'institution'">Kurum</th>
            <th v-if="gruplamaTipi === 'institution'">Mıntıka</th>
            <th v-if="gruplamaTipi === 'district'">Mıntıka</th>
            <th v-if="gruplamaTipi === 'district'">Kurum Sayısı</th>
            <th v-if="gruplamaTipi === 'personnel'">Personel</th>
            <th v-if="gruplamaTipi === 'personnel'">Sorumlu Sınıf</th>
            <th>Tamamlanan / Beklenen</th>
            <th>Yüzde</th>
            <th>Son İşlem</th>
            <th>Gecikme</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(satir, i) in sonuc.satirlar" :key="i">
            <td v-if="gruplamaTipi === 'institution'">{{ satir.kurumAdi }}</td>
            <td v-if="gruplamaTipi === 'institution'">{{ satir.mintikaAdi || '—' }}</td>
            <td v-if="gruplamaTipi === 'district'">{{ satir.mintikaAdi }}</td>
            <td v-if="gruplamaTipi === 'district'">{{ satir.kurumSayisi }}</td>
            <td v-if="gruplamaTipi === 'personnel'">{{ satir.personelAdi }}</td>
            <td v-if="gruplamaTipi === 'personnel'">{{ satir.sorumluSinifSayisi }}</td>
            <td>{{ satir.tamamlananSayi ?? satir.toplamTamamlanan }} / {{ satir.beklenenSayi ?? satir.toplamBeklenen }}</td>
            <td>
              <span class="yuzde-rozeti" :class="yuzdeRengi(satir.tamamlananYuzde)">
                {{ satir.tamamlananYuzde !== null ? satir.tamamlananYuzde + '%' : '—' }}
              </span>
            </td>
            <td>{{ tarihFormatla(satir.sonIslemTarihi) }}</td>
            <td>
              <span v-if="satir.gecikmeGunu > 0" class="gecikme-rozeti">⚠️ {{ satir.gecikmeGunu }} gün</span>
              <span v-else class="zamaninda-rozeti">✅ Zamanında</span>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-else class="bilgi-mesaj">Bu dönem için kapsamınızda veri bulunamadı.</div>
    </div>
  </div>
</template>

<style scoped>
.sayfa-container { padding: 20px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f1f5f9; min-height: 100vh; }
.baslik-alani { margin-bottom: 20px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
.baslik-alani h2 { margin: 0 0 5px 0; color: #1e293b; }

.kutu-panel { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); margin-bottom: 20px; }
.filtre-paneli { border-top: 5px solid #3b82f6; }
.form-grid { display: flex; flex-wrap: wrap; gap: 15px; align-items: end; }
.form-eleman { display: flex; flex-direction: column; gap: 5px; min-width: 160px; }
.form-eleman label { font-weight: bold; color: #334155; font-size: 0.85rem; }
.input-text { padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.95rem; background: #f8fafc; }
.btn-ata { background: #3b82f6; color: white; border: none; padding: 10px 18px; border-radius: 6px; font-weight: bold; cursor: pointer; }
.btn-ata:hover { background: #2563eb; }

.sekme-alani { display: flex; gap: 10px; margin-bottom: 15px; }
.sekme-alani button { background: white; border: 1px solid #cbd5e1; padding: 8px 16px; border-radius: 6px; font-weight: bold; color: #475569; cursor: pointer; }
.sekme-alani button.aktif { background: #1e293b; color: white; border-color: #1e293b; }

.analiz-tablo { width: 100%; border-collapse: collapse; }
.analiz-tablo th { text-align: left; padding: 10px; border-bottom: 2px solid #e2e8f0; color: #475569; font-size: 0.85rem; }
.analiz-tablo td { padding: 10px; border-bottom: 1px solid #f1f5f9; font-size: 0.9rem; }

.yuzde-rozeti { padding: 4px 10px; border-radius: 12px; font-weight: bold; font-size: 0.85rem; }
.renk-iyi { background: #dcfce7; color: #166534; }
.renk-orta { background: #fef3c7; color: #d97706; }
.renk-kotu { background: #fee2e2; color: #b91c1c; }
.renk-bilinmiyor { background: #f1f5f9; color: #64748b; }

.gecikme-rozeti { color: #d97706; font-weight: bold; font-size: 0.85rem; }
.zamaninda-rozeti { color: #16a34a; font-weight: bold; font-size: 0.85rem; }

.bilgi-mesaj { color: #94a3b8; font-style: italic; padding: 15px; text-align: center; }
.uyari-mesaj { background: #fee2e2; color: #b91c1c; padding: 12px; border-radius: 6px; margin-bottom: 15px; }
</style>