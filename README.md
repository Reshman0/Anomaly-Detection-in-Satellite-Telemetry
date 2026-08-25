# AzSonra — Yer İstasyonu Operatör Konsolu

Uydu telemetrisinde **açıklanabilir anomali tespiti** fikrini tek ekranda
anlatan, ECSS/CCSDS terminolojisine sadık bir yer istasyonu operatör konsolu
demosu. TUSAŞ LIFT UP finali (21 Eylül 2026) için hazırlandı.

> ### SİMÜLE VERİ — KAVRAMSAL GÖSTERİM
>
> Gerçek bir makine öğrenmesi modeli çalışmaz. Gerçek bir uydu bağlantısı
> yoktur. Anomali skorları, açıklanabilirlik çıktıları ve alarmlar önceden
> yazılmış senaryo dosyalarından okunur.
>
> Buna karşılık ekrandaki **her etiket, her alan adı, her servis numarası ve
> her sayı gerçek standartlara dayanır.** Demonun inandırıcılığı buradan gelir.

---

## 1. Proje nedir

Klasik uydu yer segmentinde arıza tespiti **sabit limit kontrolüne** dayanır:
uçuş yazılımı her parametreyi önceden tanımlı bir bandın içinde tutar, bant
aşılınca alarm üretir (ECSS ST[12] on-board monitoring). Bu yaklaşım keskin
sıçramaları yakalar; ancak **bandın içinde kalan yavaş sürüklenmeleri ve
kanallar arası ilişkinin bozulmasını göremez.**

AzSonra'nın tezi şudur: bu iki boşluk, telemetriyi çok değişkenli olarak
modelleyen bir otokodlayıcının rekonstrüksiyon hatasıyla kapatılabilir — ve
sonuç, operatörün güvenebileceği şekilde **açıklanabilir** hale getirilebilir.

Bu depo o tezin **görsel argümanıdır.** Konsolun tamamı tek bir kareyi
kurmak için vardır:

```
ST[12] Sabit limit : NOMİNAL        ← uçuş yazılımı bir şey görmüyor
AI Tespiti         : ALARM          ← model sapmayı çoktan yakaladı
```

Bu kare ekranda göründüğünde projenin gerekçesi anlatılmış olur.

**Bağlam:** ESA-ADB (ESA Anomaly Dataset) ve OPS-SAT üzerinde çalışan AzSonra
ekibinin bildirisine dayanır. Kanal adları (`ch_42`, `ch_75`) ESA-ADB'nin
anonimleştirilmiş adlandırmasından gelir; bu yüzden mühendislik birimi yoktur
(`—`) ve `TEMP_BATTERY_1` gibi uydurma isimler kullanılmaz.

---

## 2. Bu demo ne yapar, ne yapmaz

| Yapar | Yapmaz |
|---|---|
| Gerçek CCSDS 133.0-B bit alanları üretir ve ekranda gösterir | PyTorch/ONNX yüklemez, çıkarım yapmaz |
| MIB limitleriyle **gerçekten** limit kontrolü hesaplar | RF, SLE bağlantısı, çerçeve kodlaması kurmaz |
| SGP4 ile gerçek yörünge yayılımı yapar | Ağdan TLE, doku veya font çekmez |
| Senaryoları tohumlu ve tekrarlanabilir oynatır | Playback/geri sarma, çoklu operatör, hesap yönetimi sunmaz |
| Tek dosya, internetsiz çalışır | Backend, veritabanı, WebSocket kullanmaz |

Ekranın bir köşesinde `SİMÜLE VERİ — KAVRAMSAL GÖSTERİM` rozeti **sürekli
görünür.** Kaldırmayın.

---

## 3. Hızlı başlangıç

Node 20+ gerekir (geliştirme sırasında Node 22.14 kullanıldı).

Bağımlılıkları kurun:

```bash
npm install
```

Geliştirme sunucusu (http://localhost:5173):

```bash
npm run dev
```

Testler:

```bash
npm test
```

Demo için dağıtım derlemesi:

```bash
npm run build
```

Derlemeyi yerelde denemek:

```bash
npm run preview
```

### Dağıtım çıktısı

`npm run build` **tek bir `dist/index.html` dosyası** üretir (~788 kB). Tüm
JavaScript, CSS, MIB, senaryolar, TLE, kıta çizgileri ve XAI görselleri bu
dosyanın içine gömülüdür.

- İnternetsiz bir dizüstünde `file://` ile doğrudan açılır.
- Basit bir statik sunucuyla da çalışır.
- **Sıfır çalışma zamanı ağ isteği.** Doğrulandı: sayfa yüklenirken yalnızca
  `index.html`'in kendisi istenir, başka hiçbir istek çıkmaz.
- Fontlar sistem fontlarıdır (Consolas / Segoe UI ve yedekleri); indirilen font
  yoktur.

Demo makinesine götürmek için **sadece `dist/index.html` dosyasını kopyalamak
yeterlidir.** Bir USB bellek yeter; `node_modules` gerekmez.

---

## 4. Ekranda ne var

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ÜST ŞERİT  Görev · UTC · OBT · Hız · SLE RAF · İstasyon · AOS/LOS · TLE  │
├───────────────────────┬──────────────────────────────────────────────────┤
│                       │  TELEMETRİ ŞERİTLERİ                             │
│   DÜNYA / KÜRE        │  ch_11 ch_12 ch_42 ch_75 ch_58                   │
│   SGP4, yörünge izi,  │  ◆ AI_SCORE_SS1 / SS3 / SS5                      │
│   görüş konisi        ├──────────────────────────────────────────────────┤
│                       │  PAKET DENETLEYİCİ  (hex + bit alanları)         │
│                       ├──────────────────────────────────────────────────┤
│                       │  DURUM   ST[12]: NOMİNAL │ AI: ALARM ← KONTRAST  │
├───────────────────────┼───────────────────────────┬──────────────────────┤
│  SENARYO KONSOLU      │  ALARM KUYRUĞU            │  XAI PANELİ          │
└───────────────────────┴───────────────────────────┴──────────────────────┘
```

**Üst şerit.** Görev adı, UTC ve OBT (aralarında `-0.734 s` sabit ofset — zaman
korelasyonu izlenimi), hız çarpanı, `SLE RAF` durumu (uydu görüş alanındayken
`ACTIVE`, dışındayken `READY`), yer istasyonu, AOS/LOS geri sayımı, anlık
yükselti açısı ve kullanılan TLE'nin yaşı.

**Küre.** `satellite.js` ile gerçek SGP4. Sürükleyerek döndürülür, tekerlekle
yakınlaştırılır. Yörünge izi, yer istasyonu görüş konisi ve görüş anında
istasyon–uydu vektörü çizilir. Terminator, bulut katmanı, atmosfer parıltısı
**bilerek yoktur.**

**Telemetri şeritleri.** Her satırda parametre adı, **ham değer ve mühendislik
değeri yan yana**, limit bandı arka planda gölge olarak. `◆` işaretli satırlar
yer türetilmiş parametrelerdir; on-board ham karşılıkları olmadığı için ham
sütununda `—` görünür.

**Paket denetleyici.** Son üretilen paketin oktet dizisi ve çözülmüş bit
alanları. Renk kodu: gri = birincil başlık, yeşil = PUS ikincil başlığı,
mor = kaynak veri alanı, amber = Packet Error Control.

**Durum bandı.** Solda ST[12] sabit limit durumu, sağda AI tespiti. İkisi
ayrıştığında sağ taraf morla vurgulanır ve `← KONTRAST` etiketi belirir.

**Senaryo konsolu.** Üç senaryo düğmesi, beş kademeli şiddet kaydırıcısı ve
nominal akışa dönüş.

**Alarm kuyruğu.** Servis etiketi, UTC + OBT damgası, APID, sorumlu parametre,
alt sistem, model adı ve güven skoru. Sol kenar rengi kaynağı söyler:
yeşil/amber/kırmızı = `ST[12] LİMİT`, mor = `AI TÜRETİLMİŞ`.

**XAI paneli.** Üç seviyeli sekme (artık → kanal katkısı → Grad-CAM). Görseller
bildiriden alınmış gerçek çıktılardır; dosya konulmamışsa panel boş bir yuva ve
beklenen dosya yolunu gösterir, **sentetik grafik çizmez.**

---

## 5. Demoyu sunma

Senaryo düğmesine basıldığında hız otomatik olarak `1×`'e düşer ve senaryo
**90 saniyede** tamamlanır. Üç senaryoyu bu sırayla oynatın — birlikte tek bir
argüman kurarlar.

### 1. Nokta anomalisi · Spectrogram-AE · ~35 s

`ch_11` kanalında kısa bir sıçrama. Sıçrama sert limiti aşar, `limitChecker`
gerçekten hesap yaptığı için `TM[12,12] Check Transition Report` üretilir ve
alarm kuyruğuna **yeşil/kırmızı kenarlı** bir ST[12] kartı düşer.

> **Söylenecek:** "Klasik limit kontrolü bunu zaten yakalıyor. Burada bir
> sorunumuz yok."

Bu senaryonun işlevi, sonraki ikisinde ST[12]'nin sessiz kalmasının bir hata
değil **bulgu** olduğunu kanıtlamaktır.

### 2. Yavaş sürüklenme · TCN-AE · ~72 s — **demonun kritik anı**

`ch_42` kademeli olarak kayar ama limit bandının içinde kalır. Şerit gözle
görülür şekilde sürüklenirken durum bandının solu `NOMİNAL` kalır; sağdaki AI
skoru 3σ'yı, sonra 5σ'yı aşar ve `TM[5,1] → TM[5,3] → TM[5,4]` sırasıyla mor
kartlar düşer. XAI paneli üç seviyeyi sırayla yükler.

> **Söylenecek:** "Uçuş yazılımı hâlâ hiçbir şey görmüyor — çünkü teknik olarak
> haklı, parametre limitin içinde. Model ise sapmayı 30 saniye önce yakaladı ve
> hangi kanaldan geldiğini söylüyor."

Durum bandındaki `NOMİNAL / ALARM` kontrastını gösterin. **Projenin tüm
gerekçesi bu tek karededir.**

### 3. Kolektif sapma · TCN-AE · ~62 s

`ch_42`, `ch_75` ve `ch_58` birbiriyle ilişkili biçimde kayar. Hiçbiri tek
başına limit aşmaz; anomali yalnızca çok değişkenli yapıda görünür. XAI paneli
`ch_75`'i baskın katkı olarak işaretler.

> **Söylenecek:** "Burada tek tek bakınca hiçbir kanal anormal değil. Anormal
> olan aralarındaki ilişki — ve model kaynağı da teşhis ediyor."

### İpuçları

- **Şiddet kaydırıcısı** enjeksiyon büyüklüğünü ölçekler (`×0.7`–`×1.3`).
  Sürüklenme ve kolektif senaryolarda **en yüksek kademede bile** limit
  aşılmaz; bu birim testiyle garanti altındadır.
- Aynı düğmeye tekrar basmak **birebir aynı** anomaliyi üretir. Üretim tohumlu
  ve senaryo başlangıcı örneklem ızgarasına oturtulmuştur.
- `600×` hız çarpanı küre içindir: İMECE'nin ~98 dakikalık yörüngesi ~10
  saniyede tamamlanır, AOS/LOS dinamiği görünür hale gelir. Telemetriyi bu
  hızda izlemeye çalışmayın.
- Uygulama açılırken şeritler **10 dakikalık geçmişle dolu gelir**; boş grafikle
  açılmaz.

---

## 6. Mimari

```
src/
  data/                 saf veri — kod yok
    mib.json            görev veritabanı: parametreler, limitler, kalibrasyon
    apid_table.json     APID tahsis tablosu
    scenario_*.json     nominal / point / drift / collective
    tle.txt             gömülü TLE
    land_110m.json      Natural Earth 110m kıta çizgileri (kamu malı)
  engine/               saf TypeScript — React'ten bağımsız
    types.ts            ortak tipler
    mib.ts              MIB yükleme, kalibrasyon (raw ↔ mühendislik)
    packetBuilder.ts    CCSDS birincil + PUS-C ikincil başlık + PEC
    missionClock.ts     görev saati, hız çarpanı, zaman biçimleme
    rng.ts              tohumlu rastgelelik (mulberry32 + Box-Muller)
    telemetrySource.ts  nominal seri üretimi + enjeksiyon
    limitChecker.ts     ST[12] sabit limit kontrolü  ← gerçekten hesaplar
    scenarioRunner.ts   senaryo zaman çizelgesi, şiddet ölçeklemesi
    orbit.ts            SGP4, AOS/LOS, görüş konisi
    simulation.ts       hepsini birleştiren düzenleyici
  components/           arayüz (her panel bir dosya)
  ui/colors.ts          durum renkleri
  assets/xai/           bildiriden alınan gerçek XAI görselleri
  store.ts              zustand — tek `Simulation` örneği + tazeleme sayacı
```

### Veri akışı

```
App (rAF, ~15 Hz)
  └─ store.tick(dt)
       └─ Simulation.advance(dt)
            ├─ MissionClock.advance          gerçek süre × hız çarpanı
            └─ her 1 saniyelik görev adımı için:
                 ├─ TelemetrySource.step()   AR(1) + periyodik + enjeksiyon
                 ├─ halka tamponlarına yaz   (10 dakikalık pencere)
                 ├─ packetBuilder            TM[3,25] · APID başına
                 ├─ LimitChecker.push()      durum değişiminde TM[12,12]
                 └─ ScenarioRunner.due()     zamanı gelen TM[5,x] ve XAI
```

`engine/` katmanı tarayıcı API'si kullanmaz; `npm test` bütün senaryoları React
olmadan uçtan uca koşturur.

### Neden AI skoru ayrı bir kutu değil

`AI_SCORE_SS1/SS3/SS5`, `mib.json` içinde tanımlı, **limitleri olan**,
`derived: true` ve `subsystem: "GND"` olan parametrelerdir. Arayüzde diğer
parametrelerle aynı şeridi ve aynı limit rengi mantığını kullanırlar. Farkları
yalnızca kaynaklarıdır: `◆` işareti, ham değer yerine `—`, mor vurgu.

APID 200 uyduya ait değildir; yer tarafında hesaplanan parametrelerin MIB
içindeki adresleme grubudur. Bu APID için **indirilen bir TM paketi üretilmez**;
AI kaynaklı ST[05] bildirimleri yer segmentinde üretilir ve alarm kartında
`AI TÜRETİLMİŞ` olarak etiketlenir. Bu ayrım alarm kuyruğunun altında da yazılı.

---

## 7. Geliştirme rehberi

Altın kural: **ekrandaki hiçbir sayı bileşenin içinde sabit yazılı değildir.**
Değiştirmek istediğiniz şey neredeyse her zaman `src/data/` altındaki bir JSON
dosyasındadır.

### Yeni telemetri parametresi eklemek

`src/data/mib.json` içindeki `parameters` dizisine bir nesne ekleyin. Şeritler
kalan yüksekliği paylaştığı için düzen kendini ayarlar, ayrıca bir şey yapmanız
gerekmez.

```jsonc
{
  "pid": "ch_31",                     // ESA-ADB kanal adı
  "description": "Alt sistem 5 kanalı 31",
  "subsystem": "SS5",                 // subsystems dizisinde tanımlı olmalı
  "apid": 44,
  "sid": 1,                           // housekeeping structure ID
  "raw_type": "u16",
  "eng_unit": "—",
  "calibration": { "type": "linear", "a": 0.0014, "b": -11.2 },
  "sampling_period_s": 1,             // 1'in katı olmalı
  "limits": { "soft_low": -3.0, "soft_high": 3.0,
              "hard_low": -5.0, "hard_high": 5.0 },
  "derived": false,
  "sim": {                            // ECSS modelinin parçası DEĞİL
    "mean": 0.0, "sd": 0.2, "ar1": 0.9,
    "diurnal_amp": 0.4, "diurnal_period_s": 5894, "phase": 1.1
  }
}
```

`sim` bloğu yalnızca nominal seri üretecini besler:

| Alan | Anlamı |
|---|---|
| `mean` | mühendislik biriminde uzun dönem ortalaması |
| `sd` | duruk standart sapma (AR(1) ölçeklemesi otomatik) |
| `ar1` | otokorelasyon katsayısı, 0–1; yükseldikçe seri yumuşar |
| `diurnal_amp` | yavaş periyodik bileşenin genliği |
| `diurnal_period_s` | periyot; 5894 s = TLE'den türetilen yörünge periyodu |
| `phase` | radyan cinsinden faz — kanalların üst üste binmesini önler |
| `floor` | (isteğe bağlı) alt kırpma; AI skorları için `0.0` |

Kalibrasyon `eng = a × raw + b` şeklindedir. `a` ve `b`'yi, beklenen mühendislik
aralığının `u16` (0–65535) içine düşecek şekilde seçin.

### Limitleri değiştirmek

Aynı dosyada `limits` bloğunu düzenleyin. Dört alan da isteğe bağlıdır;
verilmeyen limit kontrol edilmez (AI skorlarında yalnızca üst limitler var).
Değişiklik hem şerit gölgelerine hem `limitChecker`'a aynı anda yansır.

**Dikkat:** sürüklenme ve kolektif senaryoların bütün anlamı sapmanın limit
bandının içinde kalmasıdır. Limit daraltırsanız `npm test` kırmızıya döner —
bu kasıtlıdır.

### Yeni senaryo yazmak

`src/data/scenario_yeni.json` oluşturun, sonra
`src/engine/scenarioRunner.ts` içindeki `SCENARIOS` dizisine ekleyin.

```jsonc
{
  "id": "yeni",
  "name": "Kısa ad",
  "button": "Ne yaptığını söyleyen düğme metni",   // "Senaryo 1" YAZMAYIN
  "description": "İki cümlelik açıklama.",
  "model": "TCN-AE",
  "duration_s": 90,
  "timeline": [ /* adımlar */ ]
}
```

`t` değerleri saniye cinsinden ve senaryonun başlatıldığı ana göredir.

| Adım tipi | Alanlar | Ne yapar |
|---|---|---|
| `inject_drift` | `pid`, `duration_s`, `magnitude`, `max_abs_eng?` | `duration_s` boyunca 0'dan `magnitude`'a doğrusal rampa, sonra tutar |
| `inject_point` | `pid`, `magnitude`, `width_s` | tek örneklem tepe + iki omuz (Gauss) |
| `inject_collective` | `targets[]`, `duration_s`, `ramp_s`, `oscillation_hz`, `max_abs_eng?` | birden çok kanalda ilişkili kayma + salınım |
| `ai_score` | `pid`, `value` | AI skoru kilometre taşı; aralar doğrusal olarak dolar |
| `event` | `service`, `severity`, `pid`, `text`, `model?`, `confidence?` | ST[05] bildirimi + alarm kartı |
| `show_xai` | `level`, `asset`, `caption`, `model`, `top_channels[]`, `band?` | XAI panelinde ilgili seviyeyi yükler |

Kurallar:

- `severity` 0–3'tür ve `service` ile **tutarlı olmalıdır**:
  `0→[5,1]`, `1→[5,2]`, `2→[5,3]`, `3→[5,4]`. Bir birim testi bunu doğrular.
- `max_abs_eng`, enjeksiyon etkin olduğu sürece mühendislik değerini
  `±max_abs_eng` aralığına kelepçeler. Sapmanın limit içinde kalması gereken
  senaryolarda kullanın.
- `event` ve `show_xai` adımları bir kez tetiklenir. Enjeksiyon adımları ise
  sürekli değerlendirilir, sıralamaları önemsizdir.
- Senaryo bittikten 30 saniye sonra enjeksiyonlar ve AI skorları nominale
  yumuşakça döner, sonra çalıştırıcı kendini kapatır.

Yeni senaryo eklediğinizde `src/engine/limitChecker.test.ts` içine ne bekliyorsanız
onu yazın — sürüklenme sınıfı senaryolar için `serviceCounts.get('12,12') === 0`,
sıçrama sınıfı için `> 0`.

### XAI görsellerini koymak

`src/assets/xai/` klasörüne bildiriden alınmış PNG'leri bırakın. Beklenen dosya
adları [o klasördeki README](src/assets/xai/README.md) içinde listelidir. Farklı
ad kullanacaksanız senaryo dosyalarındaki `show_xai.asset` alanını güncelleyin.

Görseller derleme sırasında tek dosya çıktısına gömülür. **Sentetik olarak
yeniden çizilmiş grafik koymayın** — panelin boş yuva göstermesi, uydurma bir
grafik göstermesinden iyidir.

Panelin görsel alanı yaklaşık 520×170 px'dir; yatay (geniş) görseller en iyi
oturur.

### Uyduyu veya yer istasyonunu değiştirmek

TLE için `src/data/tle.txt` dosyasını üç satırlık biçimde (ad + iki satır)
güncelleyin. NORAD numarası, epok ve yörünge periyodu satırlardan otomatik
okunur.

**Uyarı:** GEO uydusunda (örn. TÜRKSAT 6A) AOS/LOS geçişi olmaz, uydu sabit
görünür. Geçiş dinamiği istiyorsanız LEO bir uydu seçin. Şu an İMECE
(NORAD 56178) kullanılıyor.

Yer istasyonu `src/data/mib.json` içindeki `ground_station` bloğundadır:
enlem, boylam, yükseklik ve minimum yükselti açısı. Görüş konisi yarıçapı bu
açıdan ve uydunun anlık irtifasından hesaplanır.

### Görev saati ve pencere ayarları

`src/engine/missionClock.ts`:

| Sabit | Varsayılan | Anlamı |
|---|---|---|
| `SPEED_OPTIONS` | `1, 60, 600` | üst şeritteki hız düğmeleri |
| `PREFILL_S` | `600` | açılışta önceden doldurulan geçmiş (ve şerit penceresi) |
| `BASE_PERIOD_S` | `1` | temel telemetri örnekleme periyodu |

Görev epoğu ve OBT ofseti `mib.json` içindedir (`epoch`, `obt_offset_s`).

### Renkler ve tipografi

Palet iki yerde tanımlıdır ve **senkron tutulmalıdır**:
`tailwind.config.js` (arayüz sınıfları) ve `src/ui/colors.ts` (canvas ve
three.js çizimleri).

| Rol | Renk | Kullanım |
|---|---|---|
| Nominal | soğuk yeşil `#2FBF87` | limit içinde |
| Yumuşak limit | amber `#D9A02B` | yumuşak bant ihlali |
| Sert limit | kırmızı `#E24A5F` | sert bant ihlali |
| **AI tespiti** | mor `#A184F5` | AI kaynaklı alarm, türetilmiş parametre |
| Zemin | `#0E1419` | saf siyah değil — projektörde bantlaşmasın |

Mor ayrımı demonun ana mesajını taşır; başka bir role vermeyin.

Tüm sayısal telemetri tek aralıklı fonttadır ve `font-variant-numeric:
tabular-nums` ile hizalanır. Yeni bir sayı alanı eklerken `num` sınıfını
kullanın, yoksa rakam genişliği oynar.

### Arayüz tazeleme ve başarım

`src/App.tsx` içinde `UI_INTERVAL_MS = 66` (~15 Hz). Sekme arka plana alınırsa
`requestAnimationFrame` durur ve görev saati de durur — bu kasıtlıdır. Geri
dönüldüğünde saatin ileri fırlamaması için tek turda işlenen gerçek süre
`MAX_DT_MS = 500` ile kelepçelenir.

Küre kendi `requestAnimationFrame` döngüsünde çalışır ve store'u doğrudan okur;
React yeniden çizimlerine bağlı değildir.

### Hata ayıklama

Geliştirme derlemesinde tarayıcı konsolundan store'a erişebilirsiniz
(dağıtım derlemesinde bu kanca yoktur):

```js
__azs.getState().sim
```

Faydalı alanlar: `clock.missionT`, `activeScenario`, `scenarioProgress`,
`buffers`, `alarms`, `serviceCounts`, `packetCount`.

Senaryoyu elle adım adım ilerletmek için:

```js
for (let i = 0; i < 130; i++) __azs.getState().tick(1000);
```

---

## 8. Standart eşlemesi

| Ekrandaki şey | Kaynak |
|---|---|
| Space Packet birincil başlığı (3/1/1/11/2/14/16 bit) | CCSDS 133.0-B-2 |
| CUC zaman damgası (4 oktet kaba + 2 oktet ince) | CCSDS 301.0-B |
| PUS-C ikincil başlığı, ST[03] / ST[05] / ST[12] | ECSS-E-ST-70-41C |
| Packet Error Control (CRC-16-CCITT, poly `0x1021`, init `0xFFFF`) | ECSS-E-ST-70-41C |
| MIB parametre tanımı, kalibrasyon eğrisi, limitler | ECSS-E-ST-70-31C |
| SLE RAF durum göstergesi | CCSDS 911.1 |
| Kanal adları (`ch_42`, `ch_75`) | ESA-ADB (anonimleştirilmiş) |
| Önem derecesi 0–3 ↔ `TM[5,1..4]` | ESA-ADB ↔ ECSS eşlemesi |
| Kıta çizgileri | Natural Earth 110m, kamu malı |

Yalnızca **ST[03], ST[05], ST[12]** kullanılır; başka servis numarası yoktur.

Paket sekans sayacı APID başına ayrı tutulur ve 16383'te sarar. Mesaj tipi
sayacı APID + servis + alt tip üçlüsü başına ayrıdır.

Ücretsiz erişim: CCSDS → `public.ccsds.org`, ECSS → `ecss.nl`

---

## 9. Testler

```bash
npm test
```

23 test, tek dosyada: `src/engine/limitChecker.test.ts`.

| Ne doğrulanıyor | Neden önemli |
|---|---|
| Sürüklenmede `ch_42` **beş şiddet kademesinin hepsinde** NOMİNAL kalır, `AI_SCORE_SS3` sert eşiği aşar | demonun ana iddiası |
| Kolektif sapmada üç kanal da tek tek NOMİNAL kalır | ikinci senaryonun iddiası |
| Nokta anomalisinde `ch_11` sert limiti aşar ve `TM[12,12]` üretilir | limit kontrolünün gerçekten çalıştığı |
| Aynı senaryo aynı seriyi üretir | tekrarlanabilirlik |
| Senaryo **kesirli** bir görev saatinde başlatılsa da aynı sonucu verir | canlı uygulamada düğmeye basma anı ondalıklıdır |
| Birincil başlık bit yerleşimi ve `Packet Data Length = uzunluk − 1` | CCSDS uyumu |
| PEC gerçekten CRC-16-CCITT | ECSS uyumu |
| Sekans sayacı APID başına artar, 16383'te sarar | kabul kriteri |
| Yalnızca ST[03]/ST[05]/ST[12] kullanılır | kabul kriteri |
| Senaryo dosyalarındaki `service` ↔ `severity` tutarlılığı | yanlış `TM[5,x]` etiketini önler |

---

## 10. Kabul kriterleri

| Kriter | Durum |
|---|---|
| İnternetsiz makinede açılıyor, ağ isteği yok | ✅ tek dosya çıktı, sistem fontları, doğrulandı |
| Parametreler `mib.json`'dan geliyor, bileşende sabit değer yok | ✅ |
| Sekans sayacı APID başına artıyor, 16383'te sarıyor | ✅ birim test |
| Sadece ST[03], ST[05], ST[12] | ✅ birim test |
| Önem derecesi ↔ `TM[5,x]` eşlemesi | ✅ birim test |
| Sürüklenmede limit NOMİNAL, AI alarmda | ✅ birim test, 5 şiddet kademesi |
| Aynı düğmeye basınca aynı anomali | ✅ birim test, kesirli başlangıç dahil |
| XAI görselleri bildiriden alınmış gerçek çıktılar | ⚠️ **görseller henüz konulmadı** — yuvalar hazır |
| Ham ve mühendislik değer yan yana | ✅ |
| `SİMÜLE VERİ` rozeti sürekli görünür | ✅ sağ üst köşe |
| 1920×1080'de kaydırma çubuğu yok | ✅ ölçüldü: 1920×1080 tam |
| Senaryo 90 saniyede tamamlanıyor | ✅ 1× hızda (bkz. sapma 1) |

### Belgelenen sapmalar

**1. Senaryo süresi ve hız çarpanı.** Yönerge "90 saniyede tamamlanıyor (600×
hızda)" diyor. 600× hızda 90 saniye 15 görev saatine denk gelir; bir anomali bu
ölçekte izlenemez. Senaryolar 90 **görev saniyesi** uzunluğunda tasarlandı ve
senaryo başlatıldığında hız otomatik olarak 1×'e alınıyor — böylece senaryo
gerçekten 90 saniyede, izlenebilir hızda tamamlanıyor. 600× çarpanı küre
içindir.

**2. Sürüklenme büyüklüğü.** Yönergedeki örnek `magnitude: 4.5` değeri `ch_42`
yumuşak limitini (±3.0) aşardı ve §6.3'ün "limit NOMİNAL kalmalı" kısıtını
bozardı. §6.3 kısıtı kazandı: taban büyüklük 1.3, enjeksiyona ayrıca
`max_abs_eng` kelepçesi kondu, birim testi tüm şiddet kademelerinde doğruluyor.

**3. Kanal adları.** `ch_42` ve `ch_75` yönergede geçtiği gibi bırakıldı.
Konsolun dolu görünmesi için ESA-ADB adlandırma şemasına uygun `ch_11`, `ch_12`,
`ch_58` eklendi. Bildirinizde gerçekten geçen kanallarla değiştirmek isterseniz
tek dokunulacak yer `src/data/mib.json`'dır.

---

## 11. Sorun giderme

**Ekran donmuş görünüyor / saat ilerlemiyor.** Sekme arka planda ya da pencere
gizli. Tarayıcılar bu durumda `requestAnimationFrame`'i durdurur. Pencereyi öne
getirin.

**Senaryo düğmesine bastım, bir şey olmadı.** Senaryo 90 saniyeye yayılır; ilk
AI kilometre taşı 18–30. saniyededir. Durum bandındaki skor değerini izleyin.

**Geliştirme sırasında senaryo yarıda kesiliyor.** Herhangi bir dosyayı
kaydetmek Vite'ın sayfayı yeniden yüklemesine ve simülasyonun sıfırlanmasına yol
açar. Senaryoyu test ederken dosya kaydetmeyin, ya da `dist` derlemesini
kullanın.

**XAI paneli boş yuva gösteriyor.** Beklenen PNG `src/assets/xai/` altında yok.
Tasarım gereği böyle; dosyayı koyup yeniden derleyin.

**1920×1080 dışında bir çözünürlükte açtım, düzen bozuk.** Konsol 1920×1080 için
tasarlandı ve kaydırma yoktur. Daha küçük ekranlarda tarayıcı yakınlaştırmasını
düşürün (`Ctrl` + `-`).

**Küre siyah.** WebGL kapalı ya da GPU hızlandırma yok. Tarayıcıda
`chrome://gpu` ile kontrol edin. Küre olmadan da demo ayakta durur.

---

## 12. Kapsam dışı

Aşağıdakiler bilinçli olarak yapılmadı; her biri demonun ana mesajını sulandırır:

gerçek ML modeli ve çıkarım · backend, veritabanı, WebSocket, kullanıcı hesabı ·
transfer frame kodlaması, Reed-Solomon, RF katmanı · playback/geri sarma modu ·
çoklu operatör, alarm atama, yorum yazma · çalışmayan katman aç/kapa düğmeleri ·
terminator çizgisi, bulut dokusu, atmosfer efekti · ikinci bir uydu misyonu ya
da ikinci ekran · karanlık/aydınlık tema geçişi

---

**Son hatırlatma:** Şüphede kaldığında az yap, doğru yap. Bu demoda eksik bir
özellik affedilir; yanlış bir standart etiketi affedilmez.
