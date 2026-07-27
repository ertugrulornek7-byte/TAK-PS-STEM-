<script setup>
import { ref, onMounted, watch } from 'vue'
import { useEtutStore } from '../stores/etutStore'
import { useAuthStore } from '../stores/authStore'
import axios from 'axios'

const etutStore = useEtutStore()
const authStore = useAuthStore()
const islemDurumu = ref('')

const branslar = ['TÜRKÇE', 'MATEMATİK', 'FEN BİLİMLERİ', 'SOSYAL BİLGİLER', 'İNGİLİZCE', 'DİN KÜLTÜRÜ']
const seciliBrans = ref('TÜRKÇE')

const konular = ref([])
const acikKonular = ref({}) 
const komisyonSeciliSinif = ref('GENEL')

const yeniKonu = ref({ title: '', normalSoru: 0, yeniNesilSoru: 0 })
const sonuclar = ref({})

onMounted(async () => {
  await etutStore.gruplariGetir()
  if (etutStore.talebler.length === 0) await etutStore.talebeleriGetir()
  await verileriCek()
})

watch(seciliBrans, async () => { await verileriCek() })
watch(() => etutStore.aktifSinifFiltresi, async () => { await verileriCek() })

const verileriCek = async () => {
  const kurumId = authStore.user?.institutionId
  if (!kurumId) return
  const sinifFiltresi = etutStore.aktifSinifFiltresi || 'GENEL'

  try {
    const res = await axios.get(`http://localhost:3000/api/testbook/${kurumId}/${seciliBrans.value}/${sinifFiltresi}`)
    konular.value = res.data
    sonuclar.value = {}
    
    konular.value.forEach(konu => {
      if (acikKonular.value[konu.id] === undefined) acikKonular.value[konu.id] = false
      etutStore.talebler.forEach(t => { sonuclar.value[`${t.id}-${konu.id}`] = { nD: '', nY: '', yD: '', yY: '' } })
      konu.results.forEach(r => {
        sonuclar.value[`${r.studentId}-${konu.id}`] = {
          nD: r.normalDogru !== null ? r.normalDogru : '', nY: r.normalYanlis !== null ? r.normalYanlis : '',
          yD: r.yeniNesilDogru !== null ? r.yeniNesilDogru : '', yY: r.yeniNesilYanlis !== null ? r.yeniNesilYanlis : ''
        }
      })
    })
  } catch (error) { console.error('Veriler çekilemedi', error) }
}

const konuEkle = async () => {
  if (!yeniKonu.value.title) return
  const kurumId = authStore.user?.institutionId
  if (!kurumId) return

  islemDurumu.value = 'Ekleniyor...'
  try {
    await axios.post('http://localhost:3000/api/testbook/topic', {
      institutionId: kurumId,
      subject: seciliBrans.value,
      title: yeniKonu.value.title,
      normalQuestionCount: parseInt(yeniKonu.value.normalSoru) || 0,
      yeniNesilCount: parseInt(yeniKonu.value.yeniNesilSoru) || 0,
      orderIndex: konular.value.length + 1,
      classGroupId: komisyonSeciliSinif.value
    })
    yeniKonu.value = { title: '', normalSoru: 0, yeniNesilSoru: 0 }
    islemDurumu.value = 'Eklendi!'; setTimeout(() => islemDurumu.value = '', 1500)
    await verileriCek()
  } catch (error) { islemDurumu.value = 'Hata!' }
}

const sonucKaydet = async (studentId, topicId) => {
  const v = sonuclar.value[`${studentId}-${topicId}`]
  const clean = (val) => (val === "" || val === null) ? null : parseInt(val)

  islemDurumu.value = 'Kaydediliyor...'
  try {
    await axios.post('http://localhost:3000/api/testbook/result', {
      studentId, topicId, normalDogru: clean(v.nD), normalYanlis: clean(v.nY),
      yeniNesilDogru: clean(v.yD), yeniNesilYanlis: clean(v.yY)
    })
    islemDurumu.value = 'Kaydedildi!'; setTimeout(() => islemDurumu.value = '', 1000)
  } catch (error) { islemDurumu.value = 'Hata!' }
}

const hesaplaNet = (dogru, yanlis) => {
  if (dogru === '' || yanlis === '') return '-'
  return (parseInt(dogru || 0) - (parseInt(yanlis || 0) / 3)).toFixed(2)
}

const hesaplaBasari = (dogru, yanlis, soruAdedi) => {
  if (soruAdedi === 0 || dogru === '' || yanlis === '') return '-'
  const net = parseFloat(hesaplaNet(dogru, yanlis))
  const basari = (net / soruAdedi) * 100
  return basari < 0 ? '0%' : `${Math.round(basari)}%`
}

const toggleKonu = (topicId) => acikKonular.value[topicId] = !acikKonular.value[topicId]
</script>

<template>
  <div class="sayfa-container">
    
    <div class="global-filtre-paneli">
      <div class="filtre-baslik">
        <span class="ikon">📚</span>
        <div>
          <h3>Sınıf Seçimi (Soru Takibi)</h3>
          <p>Hangi sınıfın test sonuçlarını girmek veya kontrol etmek istiyorsunuz?</p>
        </div>
      </div>
      <div class="filtre-secici">
        <select v-model="etutStore.aktifSinifFiltresi" class="input-text vurgulu-secim">
          <option value="">-- Tüm Sınıfların Ortak Kitapları --</option>
          <option v-for="sinif in etutStore.siniflar" :key="sinif.id" :value="sinif.id">{{ sinif.name }} Testleri</option>
        </select>
      </div>
    </div>

    <h2>Sayfa 9 - Kitap / Test Takibi (Workwin)</h2>

    <div class="filtre-paneli">
      <div class="filtre-grup">
        <label>🏷️ Branş Seçin:</label>
        <div class="brans-butonlari">
          <button v-for="brans in branslar" :key="brans" @click="seciliBrans = brans" class="btn-brans" :class="{'aktif': seciliBrans === brans}">{{ brans }}</button>
        </div>
      </div>
      <div v-if="islemDurumu" class="toast">{{ islemDurumu }}</div>
    </div>

    <div class="komisyon-paneli" v-if="authStore.user?.roles?.includes('KURUM_EM') || authStore.user?.roles?.includes('BOLGE_EM')">
      <h3>👑 Komisyon - Sınıfa Özel Test/Konu Ekleme</h3>
      
      <div class="form-grup ufak" style="margin-bottom: 10px;">
         <label style="font-weight: bold; color: #475569;">Bu test hangi sınıf için eklenecek?</label>
         <select v-model="komisyonSeciliSinif" class="select-kutu w-kucuk" style="width: 200px;">
            <option value="GENEL">Tüm Sınıflar İçin Ortak</option>
            <option v-for="sinif in etutStore.siniflar" :key="sinif.id" :value="sinif.id">Sadece {{ sinif.name }} İçin</option>
         </select>
      </div>

      <div class="form-grup detayli-form">
        <input type="text" v-model="yeniKonu.title" placeholder="Konu Adı (Örn: Sözcükte Anlam)" class="input-text w-buyuk" />
        <div class="soru-giris">
          <label>Normal Test Soru:</label>
          <input type="number" v-model="yeniKonu.normalSoru" class="input-text w-kucuk" min="0" />
        </div>
        <div class="soru-giris">
          <label>Yeni Nesil Soru:</label>
          <input type="number" v-model="yeniKonu.yeniNesilSoru" class="input-text w-kucuk" min="0" />
        </div>
        <button @click="konuEkle" class="btn-yesil">Konuyu Ekle</button>
      </div>
    </div>

    <div class="ogretmen-paneli">
      <p class="aciklama" v-if="etutStore.aktifSinifFiltresi">Şu an <strong>seçili sınıfın</strong> test konularını görüyorsunuz.</p>
      <p class="aciklama" style="color: #b91c1c; font-weight: bold;" v-else>Lütfen yukarıdan sonuç gireceğiniz sınıfı seçin!</p>

      <div v-if="konular.length === 0" class="uyari-mesaj">Bu branş/sınıf eşleşmesi için henüz test konusu eklenmemiş.</div>

      <div v-for="konu in konular" :key="konu.id" class="ders-karti">
        <div class="ders-baslik" @click="toggleKonu(konu.id)" :class="{'acik': acikKonular[konu.id]}">
          <h4>{{ acikKonular[konu.id] ? '📂' : '📁' }} {{ konu.title }}</h4>
          <span class="konu-sayisi">Detayları Göster</span>
        </div>

        <div class="ders-icerik" v-if="acikKonular[konu.id]">
          <table class="etut-table">
            <thead>
              <tr>
                <th rowspan="2" style="width: 50px;">Sıra</th>
                <th rowspan="2" style="width: 200px;">Talebe Adı Soyadı</th>
                <th colspan="5" class="normal-baslik" v-if="konu.normalQuestionCount > 0">Normal Test</th>
                <th colspan="5" class="yeni-baslik" v-if="konu.yeniNesilCount > 0">Yeni Nesil Test</th>
              </tr>
              <tr>
                <template v-if="konu.normalQuestionCount > 0">
                  <th class="alt-baslik">S.A</th><th class="alt-baslik">D</th><th class="alt-baslik">Y</th><th class="alt-baslik">NET</th><th class="alt-baslik">%</th>
                </template>
                <template v-if="konu.yeniNesilCount > 0">
                  <th class="alt-baslik">S.A</th><th class="alt-baslik">D</th><th class="alt-baslik">Y</th><th class="alt-baslik">NET</th><th class="alt-baslik">%</th>
                </template>
              </tr>
            </thead>
            <tbody>
              <tr v-for="talebe in etutStore.gosterilenTalebeler" :key="talebe.id">
                <td><strong>{{ talebe.dinamikSira }}</strong></td>
                <td><strong>{{ talebe.fullName }}</strong></td>
                
                <template v-if="konu.normalQuestionCount > 0">
                  <td class="sabit-deger">{{ konu.normalQuestionCount }}</td>
                  <td><input type="number" v-model="sonuclar[`${talebe.id}-${konu.id}`].nD" @blur="sonucKaydet(talebe.id, konu.id)" class="not-input" :disabled="!etutStore.aktifSinifFiltresi" /></td>
                  <td><input type="number" v-model="sonuclar[`${talebe.id}-${konu.id}`].nY" @blur="sonucKaydet(talebe.id, konu.id)" class="not-input" :disabled="!etutStore.aktifSinifFiltresi" /></td>
                  <td class="hesap-hucre net-renk"><strong>{{ hesaplaNet(sonuclar[`${talebe.id}-${konu.id}`].nD, sonuclar[`${talebe.id}-${konu.id}`].nY) }}</strong></td>
                  <td class="hesap-hucre basari-renk"><strong>{{ hesaplaBasari(sonuclar[`${talebe.id}-${konu.id}`].nD, sonuclar[`${talebe.id}-${konu.id}`].nY, konu.normalQuestionCount) }}</strong></td>
                </template>

                <template v-if="konu.yeniNesilCount > 0">
                  <td class="sabit-deger">{{ konu.yeniNesilCount }}</td>
                  <td><input type="number" v-model="sonuclar[`${talebe.id}-${konu.id}`].yD" @blur="sonucKaydet(talebe.id, konu.id)" class="not-input y-nesil" :disabled="!etutStore.aktifSinifFiltresi" /></td>
                  <td><input type="number" v-model="sonuclar[`${talebe.id}-${konu.id}`].yY" @blur="sonucKaydet(talebe.id, konu.id)" class="not-input y-nesil" :disabled="!etutStore.aktifSinifFiltresi" /></td>
                  <td class="hesap-hucre net-renk"><strong>{{ hesaplaNet(sonuclar[`${talebe.id}-${konu.id}`].yD, sonuclar[`${talebe.id}-${konu.id}`].yY) }}</strong></td>
                  <td class="hesap-hucre basari-renk"><strong>{{ hesaplaBasari(sonuclar[`${talebe.id}-${konu.id}`].yD, sonuclar[`${talebe.id}-${konu.id}`].yY, konu.yeniNesilCount) }}</strong></td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sayfa-container { padding: 20px; font-family: sans-serif; }

/* GLOBAL FİLTRE PANELİ */
.global-filtre-paneli { display: flex; justify-content: space-between; align-items: center; background: linear-gradient(135deg, #1e293b, #334155); padding: 20px 25px; border-radius: 12px; color: white; margin-bottom: 25px; box-shadow: 0 4px 10px rgba(0,0,0,0.15); }
.filtre-baslik { display: flex; align-items: center; gap: 15px; }
.filtre-baslik .ikon { font-size: 2.5rem; }
.filtre-baslik h3 { margin: 0 0 5px 0; color: #f8fafc; font-size: 1.2rem; }
.filtre-baslik p { margin: 0; color: #94a3b8; font-size: 0.9rem; }
.vurgulu-secim { width: 280px; padding: 12px; font-size: 1.05rem; font-weight: bold; border: 2px solid #3b82f6; background-color: #f8fafc; color: #0f172a; cursor: pointer; border-radius: 8px; }

/* Diğer Tasarımlar */
.filtre-paneli { display: flex; align-items: center; gap: 20px; background: white; padding: 15px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.filtre-grup { display: flex; align-items: center; gap: 10px; }
.filtre-grup label { font-weight: bold; color: #334155; }
.brans-butonlari { display: flex; flex-wrap: wrap; gap: 8px; }
.btn-brans { padding: 8px 15px; border: 1px solid #cbd5e1; background: white; border-radius: 6px; font-weight: bold; color: #64748b; cursor: pointer; transition: 0.2s; }
.btn-brans:hover { background: #f1f5f9; }
.btn-brans.aktif { background: #3b82f6; color: white; border-color: #2563eb; }

.komisyon-paneli { background: #f8fafc; border: 1px dashed #94a3b8; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
.komisyon-paneli h3 { margin-top: 0; color: #334155; border-bottom: 2px solid #cbd5e1; padding-bottom: 10px; }
.detayli-form { display: flex; gap: 15px; width: 100%; align-items: flex-end; }
.soru-giris { display: flex; flex-direction: column; gap: 5px; }
.soru-giris label { font-size: 0.85rem; font-weight: bold; color: #475569; }
.input-text, .select-kutu { padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.95rem; }
.w-kucuk { width: 80px; text-align: center; }
.w-buyuk { flex: 1; }
.btn-yesil { background: #10b981; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; height: 42px; }

.ders-karti { border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 15px; overflow: hidden; background: white; }
.ders-baslik { background: #f8fafc; padding: 15px 20px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: 0.2s; }
.ders-baslik:hover { background: #f1f5f9; }
.ders-baslik.acik { background: #e0e7ff; border-bottom: 1px solid #c7d2fe; }
.ders-baslik h4 { margin: 0; font-size: 1.1rem; color: #1e293b; }
.konu-sayisi { font-size: 0.85rem; color: #64748b; font-weight: bold; background: white; padding: 4px 10px; border-radius: 20px; border: 1px solid #cbd5e1; }

.etut-table { width: 100%; border-collapse: collapse; }
.etut-table th, .etut-table td { padding: 8px; text-align: center; border: 1px solid #e2e8f0; vertical-align: middle; }
.etut-table th:nth-child(2), .etut-table td:nth-child(2) { text-align: left; }
.etut-table tr:hover { background-color: #f8fafc; }

.normal-baslik { background-color: #d1fae5; color: #065f46; border: 2px solid #a7f3d0; font-size: 1.05rem; }
.yeni-baslik { background-color: #fef3c7; color: #92400e; border: 2px solid #fde68a; font-size: 1.05rem; }
.alt-baslik { font-size: 0.8rem; background-color: #f8fafc; color: #475569; }

.sabit-deger { font-weight: bold; font-size: 1.1rem; color: #334155; background: #f1f5f9; }
.not-input { width: 50px; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px; text-align: center; font-weight: bold; font-size: 1rem; color: #334155; }
.not-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2); }
.not-input.y-nesil { border-color: #fcd34d; background: #fffbeb; }
.not-input:disabled { opacity: 0.4; cursor: not-allowed; background: #e2e8f0; }

.hesap-hucre { font-size: 1.1rem; }
.net-renk { color: #2563eb; background-color: #eff6ff; }
.basari-renk { color: #059669; background-color: #ecfdf5; font-weight: 900; }

.toast { margin-left: auto; background: #dcfce7; color: #166534; padding: 8px 15px; border-radius: 6px; font-weight: bold; }
.uyari-mesaj { background: #fffbeb; color: #b45309; padding: 15px; border-radius: 6px; border: 1px solid #fde68a; font-weight: bold; margin-bottom: 20px;}
</style>