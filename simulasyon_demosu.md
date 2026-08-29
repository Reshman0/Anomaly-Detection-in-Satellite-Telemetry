# Uydu Telemetrisinde Açıklanabilir Anomali Tespiti — Simülasyon Demosu Brief'i

> **Bu doküman ne işe yarıyor?**
> Bitmiş bir araştırma projesinin özeti ve bu projenin üzerine kurulacak yeni bir işin tarifi.
> Yeni iş: projenin nasıl çalıştığını anlatan bir **simülasyon demo ortamı**.
> Aşağıdaki 1. bölüm bağlam, 2. bölüm asıl istenen şey, 3. bölüm uyulması istenen standartlar.
> Uzay telemetrisi hakkında ön bilgi gerekmiyor; gereken her şey burada.

---

## 1. Yapılmış olan proje

### 1.1 Tek cümlelik özet

Uydulardan yere inen telemetri verisinde arızaları/anormallikleri otomatik yakalayan **ve neden alarm verdiğini operatöre açıklayabilen** bir yapay zekâ sistemi geliştirildi.

### 1.2 Çözülen problem

Bir uydu, üzerindeki yüzlerce sensörden sürekli ölçüm gönderir: sıcaklıklar, voltajlar, akımlar, tepki tekeri hızları, batarya durumu vb. Buna **telemetri** denir. Bugün yörüngede 14.000'den fazla aktif uydu var ve her birinde yüzlerce kanal akıyor. Bir insanın hepsini gözle takip etmesi mümkün değil.

Mevcut izleme sistemleri bir anormallik olduğunu söyleyebiliyor, ancak **nedenini açıklayamıyor**. Operatör şu soruya cevap bulamıyor:

> "Hangi kanalda, hangi anda, ne tür bir sapma oldu?"

Bu belirsizlik müdahale süresini uzatıyor ve görev riskini artırıyor. Projenin çıkış noktası tam olarak bu boşluk.

### 1.3 Kullanılan veri

| Veri kaynağı | Açıklama |
|---|---|
| **ESA-ADB Mission 1** | Avrupa Uzay Ajansı'nın kamuya açık anomali tespiti kıyaslama veri seti. Gerçek uydu telemetrisi, uzman etiketli anomaliler. |
| **OPS-SAT** | ESA'nın küp uydusu. İkinci, bağımsız doğrulama veri seti. |

- 76'dan fazla telemetri kanalı, 2.100'den fazla segment
- Alt sistem kombinasyonları ile deneyler: AS3+AS5, AS1+AS5, AS1+AS3
- Faz bölünmesi: **63 gün eğitim + 21 gün doğrulama + 281 gün test** (365 gün)
- Kronolojik bölünme — geleceğe ait bilgi eğitime sızmıyor
- **Yarı-gözetimli eğitim:** model yalnızca normal (nominal) veriyle eğitildi, anomali örneği görmedi

### 1.4 Geliştirilen modeller

Dördü de **otokodlayıcı (autoencoder)** mantığıyla çalışır: model normali yeniden üretmeyi öğrenir, üretemediği yerde anomali vardır.

| Model | Yaklaşım | Not |
|---|---|---|
| **Spektrogram-AE** | Sinyali zaman-frekans görüntüsüne çevirip 2B evrişimli ağla işler. Çok ölçekli STFT, `n_fft = 64 / 96 / 128` | Ana model |
| **TCN-AE** | Nedensel genişletilmiş evrişim, zaman domeni | Ayrışma oranı ~67x |
| **LSTM-AE** | Yinelemeli kodlayıcı-kod çözücü, zaman domeni | Ayrışma oranı ~22x |
| **Feature-AE** | Öznitelik tabanlı, OPS-SAT üzerinde | İkinci veri seti |
| Isolation Forest | 130 boyutlu öznitelik, klasik yöntem | Karşılaştırma tabanı |

**Önemli bulgu:** Spektrogram-AE kısa ve periyodik anomalilerde çok güçlü, ancak uzun ve yavaş gelişen anomalilerde kör noktası var (55 saat ve 28 saat süren iki olayı kaçırdı). TCN-AE ve LSTM-AE bu olayları yakalıyor. Yani modeller birbirini tamamlıyor; model seçimi anomalinin süresine göre değişiyor.

### 1.5 Eşikleme

Ham hata skorunu alarma çevirmek için dört strateji karşılaştırıldı: **NDT**, **Kuantil**, **MAD**, **POT-EVT** (Genelleştirilmiş Pareto dağılımı). Her model için yanlış alarmı en aza indiren yöntemi seçen bir eşik rehberi çıkarıldı.

Skorlama **EWMA** (üstel ağırlıklı hareketli ortalama) ile yumuşatıldı; anomali maskesinin skora sızmasını engelleyen bir düzeltme uygulandı.

### 1.6 Açıklanabilirlik — projenin asıl farkı

Sistem alarmın yanına gerekçesini de koyar. Üç seviyeli XAI modülü:

- **Seviye 1 —** Artık (residual) ısı haritası: sapmanın hangi kanalda ve hangi zaman aralığında olduğu
- **Seviye 2 —** Alt sistem atfı, FFT spektral köprüsü, morfoloji analizi ve doğal dilde açıklama
- **Seviye 3 —** Grad-CAM, PCA/t-SNE gömme görselleştirmesi, eşik duyarlılık analizi

Ayrıca her etiketli anomali için **tahmin ile gerçeği yan yana koyan** bir karşılaştırma tablosu üretiliyor.

İlginç bir gözlem: Spektrogram-AE sapmayı ağırlıklı olarak AS5'e atfediyor (%52,4), TCN-AE ise AS3'e (%62,3). Farklı modeller farklı alt sistemlere odaklanıyor.

### 1.7 Sonuçlar

Ölçüt: **olay-bazlı düzeltilmiş F0,5** (ESA-ADB'nin resmi metriği). Nokta bazlı değil olay bazlı sayar; 1,0 mükemmel.

| Model | Veri | Skor | Not |
|---|---|---|---|
| Spektrogram-AE | ESA Mission 1, AS5 | **F0,5 = 0,990** | Yanlış alarm 0, yakalama 1,0 |
| Spektrogram-AE | ESA Mission 1, AS1 — 14 yıl | F0,5 = 0,908 | Yanlış alarm 0, yakalama 0,667 |
| LSTM-AE / TCN-AE | ESA Mission 1, AS5 | F0,5 = 0,960 | 17 anomalinin 17'sini yakaladı |
| Feature-AE | OPS-SAT | AUROC = 0,963 | AUCPR = 0,840 |

**Literatürle karşılaştırma** — ESA-ADB Görev 1:

| Yöntem | Skor |
|---|---|
| **Spektrogram-AE — bu çalışma, AS5** | **0,990** |
| Telemanom-ESA — 76 kanal | 0,968 |
| **TCN-AE — bu çalışma, AS3+5** | **0,960** |
| Goetze vd. — kenar | 0,927 |
| Allegrini vd. | 0,887 |
| SMED — AS5 | 0,816 |

Anomali anlarında modelin yeniden oluşturma hatası normal seviyenin **23 katına** çıkıyor; sapma gürültünün içinde kaybolmuyor.

> **Dürüstlük notu:** Mission 1 AS5'teki "yanlış alarm 0" sonucu, alarm sonrası uygulanan 300 saniyelik alan bilgisi kuralından sonra elde edildi. Diğer deneylerde kural uygulanmadan sağlandı. Demoda bu ayrım gizlenmemeli.

### 1.8 Çıktılar

- **RAST 2026** konferansında bildiri kabul edildi ve sunuldu
- Üniversite bitirme projeleri yarışmasında **birincilik**
- TUSAŞ LIFT UP programı kapsamında sunum ve poster hazırlandı

### 1.9 Ekip

Ankara Yıldırım Beyazıt Üniversitesi, Yazılım Mühendisliği

| Kişi | Sorumluluk |
|---|---|
| Yaren Dinç | Spektrogram-AE, çok çözünürlüklü STFT hattı, EWMA skorlama ve eşik kalibrasyonu |
| Bekir Berk Yıldırım | OPS-SAT Feature-AE, veri setleri arası doğrulama, ESA küp uydu verisi analizi |
| Mert Özdemir | LSTM-AE / TCN-AE temel modelleri, üç seviyeli XAI modülü |
| Abdulmajeed Alremali | Isolation Forest karşılaştırması, veri ön işleme ve kanal seçimi, olay-bazlı F0,5 değerlendirmesi |

Akademik danışman: Doç. Dr. Hilal Arslan · Sanayi danışmanı: Dr. Abdullah Nuri Somuncuoğlu, TUSAŞ

---

## 2. İstenen yeni iş: simülasyon demosu

### 2.1 Amaç

Yukarıdaki sistemin **nasıl çalıştığını görsel olarak gösteren bir simülasyon ortamı** kurmak.

Gerçek ham veri dosyalarını açıp göstermek yerine, izleyicinin canlı olarak izleyebileceği bir ortam olacak: telemetri akıyor, bir yerde bir şeyler bozuluyor, sistem yakalıyor, ve **neden yakaladığını gösteriyor**.

### 2.2 Hedef kitle — en kritik kısıt

Demoyu izleyenlerin çoğu **uzay telemetrisi hakkında hiçbir şey bilmiyor olacak.** Buna rağmen:

- Ne olup bittiğini anlamalılar
- Etkilenmeliler
- İşin fikri kafalarında oturmalı

Yani ekranda anlamı açıklanmamış tek bir jargon kalmamalı. Aynı anda, konuyu bilen bir mühendis izlediğinde de "bu ciddi iş" demeli. İkisini birden tutturmak demonun asıl zorluğu.

### 2.3 Şartlar

**Standartlara uygunluk.** Demo, **ECSS** ve **PUS** standartlarına uygun bir uydu yer istasyonu ortamını taklit etmeli. **CCSDS Blue Book** ve **Green Book** dokümanları incelenmeli. Bu dokümanlar uydunun nasıl hazırlanıp işletileceğini tarif ediyor; özellikle **yer istasyonu tarafını ilgilendiren** bölümlere bakılmalı ve demo bunlara uygun kurgulanmalı.

**Gerçeğe yakınlık.** İçerik gerçek operasyona mümkün olduğunca yakın olmalı. Uydurma kanal isimleri, gerçekçi olmayan paket yapıları, keyfi birimler ve hayali telemetri şemaları kullanılmamalı. Bir uydu operatörü ekrana baktığında yapıyı tanımalı.

**Genişleme senaryoları.** Aynı yaklaşım **TÜRKSAT** uyduları için de uygulanabilir. Kamuya açık verisi bulunan bir **haberleşme uydusu** üzerinden de kurgulanabilir. Demo tasarlanırken bu ihtimal göz önünde bulundurulmalı; belirli bir uyduya sıkı sıkıya bağlı olmamalı.

### 2.4 Kaçınılması gerekenler

- Anlatılmadan kullanılan kısaltma ve jargon
- Gerçekte karşılığı olmayan uydurma veri alanları
- Konuyu bilmeyeni dışarıda bırakan yoğun sayı tabloları
- Abartılı görsel efekt; sadelik tercih ediliyor

---

## 3. İncelenmesi istenen standartlar

Bu bölüm başlangıç noktası niteliğinde. **Belge numaralarının ve revizyon harflerinin resmî kaynaktan doğrulanması gerekiyor** — CCSDS için `public.ccsds.org`, ECSS için `ecss.nl`. Her ikisi de ücretsiz erişilebilir.

### 3.1 ECSS / PUS

**PUS — Packet Utilization Standard**, ECSS-E-ST-70-41. Uydu ile yer arasındaki telemetri ve telekomut paketlerinin içeriğini standartlaştırır. Anomali tespiti açısından doğrudan ilgili servisler:

| Servis | İçerik | Bu proje için önemi |
|---|---|---|
| **ST[03]** | Housekeeping telemetrisi | Modelin beslendiği periyodik ölçümler tam olarak buradan gelir |
| **ST[05]** | Olay raporlama | Üretilen alarmın standart karşılığı |
| **ST[12]** | Uydu üzerinde parametre izleme | Klasik limit kontrolü; projenin geliştirdiği yöntemin alternatifi |
| ST[01] | Komut doğrulama | Yer istasyonu akışının bütünlüğü |
| ST[15] | Uydu üzerinde depolama ve geri alma | Geçmiş veri çekme senaryosu |

ST[03], ST[05] ve ST[12] üçlüsü demonun omurgasını oluşturmaya en yatkın olanlar: housekeeping paketi gelir, model işler, olay raporu üretilir.

Ayrıca **ECSS-E-ST-70** serisi yer sistemleri ve operasyonlarını kapsar; yer istasyonu tarafı için bakılması gereken yer burasıdır.

### 3.2 CCSDS

**Blue Book** = uyulması önerilen normatif standart. **Green Book** = bilgilendirici rehber, kavramları anlatır. Green Book'lar konuya yeni girenler için Blue Book'lardan daha okunaklıdır; demoyu tasarlarken önce Green Book okumak işi hızlandırır.

Yer istasyonu tarafını ilgilendiren başlıca belgeler:

| Belge | Konu |
|---|---|
| CCSDS 133.0-B | Space Packet Protocol — paket yapısı |
| CCSDS 132.0-B | TM Space Data Link Protocol — telemetri çerçeveleri, uydudan yere |
| CCSDS 232.0-B | TC Space Data Link Protocol — telekomut, yerden uyduya |
| CCSDS 910.4-B | Cross Support Reference Model — SLE mimarisi |
| CCSDS 911.1-B / 911.2-B | SLE Return All Frames / Return Channel Frames — yer istasyonunun veriyi kontrol merkezine taşıması |
| CCSDS 912.1-B | SLE Forward CLTU — komut iletimi |
| CCSDS 301.0-B | Zaman kodu formatları — telemetri zaman damgaları |
| CCSDS 727.0-B | CFDP — dosya aktarımı |

**SLE (Space Link Extension)** grubu yer istasyonu ile görev kontrol merkezi arasındaki veri alışverişini tanımlar; "gerçek bir yer istasyonu gibi görünsün" hedefi için en doğrudan ilgili aile budur.

### 3.3 Standartların demoya yansıması

Sistemin işlediği veri, rastgele üretilmiş bir sayı dizisi değil, **PUS ST[03] housekeeping paketlerinden çıkan parametreler** gibi görünmeli. Ürettiği alarm, gelişigüzel bir uyarı değil, **ST[05] olay raporu** karşılığında olmalı. Zaman damgaları CCSDS zaman formatına uymalı. Bu üç detay, demoyu "öğrenci projesi görünümünden" çıkarıp operasyonel bir sistem görünümüne taşıyan şeydir.

---

## 4. Bu demonun anlatması gereken hikâye

Teknik ayrıntıdan bağımsız olarak, izleyicinin demodan çıkarken aklında kalması gereken şey şu:

1. Uydudan sürekli veri akıyor, insan gözüyle takip edilemeyecek kadar çok
2. Bir şeyler ters gidiyor
3. Sistem bunu yakalıyor — üstelik yanlış alarm üretmeden
4. Ve en önemlisi: **neden alarm verdiğini gösteriyor.** Hangi kanal, hangi zaman aralığı, ne tür bir sapma

Dördüncü madde projenin ayırt edici tarafı. Anomali tespit eden sistem literatürde çok; alarmın gerekçesini operatöre sunan yok denecek kadar az. Demo bu farkı hissettirebilirse görevini yapmış olur.
