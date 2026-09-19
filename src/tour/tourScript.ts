import { useConsole } from '../store';
import { SCENARIOS } from '../engine/scenarioRunner';

/**
 * Tanitim turu senaryosu (stant / kiosk).
 *
 * Her adim bir paneli one cikarir. Hedef, panelin kok elemanindaki
 * `data-tour="<id>"` niteligidir.
 *
 * Zamanlama: suruklenme senaryosu "senaryo" adiminda baslar (90 s surer).
 * Sonraki adimlar oyle siralandi ki telemetri adiminda AI skoru yukselmis,
 * alarm / durum / XAI adimlarinda alarm ve kanit olusmus olur. Adim
 * suresi = gecis animasyonu (~3.5 s) + `durationMs` (veya ses suresi).
 * Sirayi ya da sureleri degistirirken durum adiminin hala
 * "NOMINAL / ALARM" gosterdigini kontrol edin.
 *
 * Seslendirme: `src/tour/audio/<id>.mp3` dosyasi varsa derlemeye gomulur ve
 * adim ses bitince ilerler. Yoksa `durationMs` kadar beklenir; altyazi her
 * durumda ekrandadir.
 */
export type TourId = 'tam' | 'ozet';

export interface TourStep {
  /** Adim kimligi; ses dosyasinin adi da budur (`audio/<id>.mp3`). */
  id: string;
  /**
   * `cover`: panel gostermeyen kapak adimi (acilis / kapanis). Konsol kararir,
   * kart ortada durur; hedef panel aranmaz.
   * `live`: panel buyutulmez; yerinde CANLI oynar (kure doner, seritler akar),
   * cevresi kararir. Fotograf cekilmedigi icin hareket gorunur.
   */
  kind?: 'cover' | 'live';
  /**
   * Canli adimda adim boyunca konsolu yoneten koreografi (ornegin kamerayi
   * TUSAS on ayarina ucurmak). `wait` beklemeyi, `alive` adimin hala acik
   * oldugunu soyler; adim degisince `alive()` false doner ve birakilmalidir.
   */
  act?: (c: { wait: (ms: number) => Promise<void>; alive: () => boolean }) => void | Promise<void>;
  /** Adim biterken calisir: `act` ile acilan pencereyi kapatmak icin. */
  leave?: () => void;
  /**
   * Canli adimda paneli CSS ile buyutme. Kure gibi WebGL panellerde buyutme
   * goruntuyu yumusatir (cizim cozunurlugu degismez): onlarda kapatilir.
   */
  noZoom?: boolean;
  /** Hedef panelin `data-tour` degeri; verilmezse `id`. Ayni panel iki kez gezilebilir. */
  target?: string;
  /** Ilerleme seridi ve hedef etiketi icin kisa ad. */
  short: string;
  title: string;
  caption: string;
  /** "Buraya bakin" ipucu: panelde gozun arayacagi tek sey. */
  look: string;
  /** Ses dosyasi yoksa (veya tarayici otomatik oynatmayi engellerse) adim suresi. */
  durationMs: number;
  /** Adima girerken calisir (ornegin senaryo baslatmak). */
  onEnter?: () => void;
}

const AUDIO = import.meta.glob('./audio/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export function audioFor(id: string): string | undefined {
  return AUDIO[`./audio/${id}.mp3`];
}

/** Tur tam gorunumdeki panelleri gezer; Ozet modunda bu panellerin cogu yoktur. */
function showFullConsole() {
  const st = useConsole.getState();
  if (st.summaryMode) st.setSummaryMode(false);
}

/** Ozet turu Ozet modunun panellerini gezer. */
function showSummary() {
  const st = useConsole.getState();
  if (!st.summaryMode) st.setSummaryMode(true);
}

/** Canli adimda panel icindeki sekmeye basar (yazisina gore). */
function tabla(panel: string, yazi: string) {
  const root = document.querySelector(`[data-tour="${panel}"]`);
  const btn = Array.from(root?.querySelectorAll('button') ?? []).find(
    (b) => b.textContent?.trim() === yazi,
  );
  btn?.click();
}

function startDrift() {
  const st = useConsole.getState();
  const drift = SCENARIOS.find((s) => s.id === 'drift');
  st.setSpeed(1);
  if (drift) st.runScenario(drift);
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'ust-serit',
    short: 'Üst şerit',
    title: 'Üst şerit',
    caption:
      'Görev adı, yer saati (UTC) ile uydu saati (OBT), yer istasyonu bağlantısı ve seçili uydu. Operatör “şu an uyduya erişebiliyor muyum?” sorusunun cevabını buradan okur.',
    look: 'AOS / LOS geri sayımı: uyduyla bağlantı penceresinin açılmasına ya da kapanmasına kalan süre.',
    durationMs: 11500,
    onEnter: showFullConsole,
  },
  {
    id: 'dunya',
    kind: 'live',
    // Kure zaten ekranin en buyuk paneli; CSS ile buyutulunce WebGL goruntusu
    // yumusuyor ve kamera hareketsizken "donmus" gibi duruyor.
    noZoom: true,
    short: 'Dünya',
    title: 'Dünya görünümü',
    caption:
      'Türk uydularının gerçek yörünge verisiyle (TLE + SGP4) hesaplanan anlık konumları ve Kahramankazan istasyonunun görüş alanı. Kamera şimdi bütün filodan alçak yörünge kuşağına, oradan da TUSAŞ tesislerinin üzerine iniyor.',
    look: 'Panel canlı: uydular gerçek zamanlı ilerliyor, kamera ön ayarlar arasında süzülüyor.',
    durationMs: 12500,
    act: async ({ wait, alive }) => {
      const st = () => useConsole.getState();
      st().setMapMode('3D');
      // Dongude kamera TUSAS'ta kalmis olur: bu, hemen geri ucusu baslatir.
      st().setGlobeView('ALL');
      await wait(1000);
      if (!alive()) return;
      st().setGlobeView('LEO');
      await wait(2200);
      if (!alive()) return;
      // TUSAS ucusu ~5 sn surer; sesin sonuna eklenen sessizlikle yakin
      // goruntu ekranda ~7 saniye kalir.
      st().setGlobeView('TUSAS');
    },
  },
  {
    id: 'senaryo',
    kind: 'live',
    short: 'Senaryo',
    title: 'Senaryo konsolu',
    caption:
      'Gösterim için anomali senaryoları: ani sıçrama, yavaş sürüklenme ve çok kanallı bozulma. Senaryolar gösterim amaçlı kurgulanmıştır; model başarımı ayrıca gerçek uçuş verisiyle ölçülmüştür.',
    look: 'Şu an “Yavaş sürüklenme” çalışıyor: düğmenin altındaki çubuk senaryonun ilerleyişi.',
    durationMs: 10000,
    onEnter: startDrift,
  },
  {
    id: 'gecis',
    kind: 'live',
    short: 'Geçiş',
    title: 'Geçiş planı',
    caption:
      'Uydunun istasyonun üzerinden sıradaki geçişleri: ne zaman görünür olacağı, ne kadar kalacağı ve ne kadar yükseğe çıkacağı.',
    look: 'Soldaki daire gökyüzü: antenin geçiş boyunca izleyeceği yol.',
    durationMs: 10500,
  },
  {
    id: 'paket',
    short: 'Paket',
    title: 'Paket denetleyici',
    caption:
      'Telemetrinin ham hâli: uzay standartlarına (CCSDS / ECSS) uygun paket, çerçeve ve hata düzeltme katmanları. Tıklanınca katman katman açılır.',
    look: '“PEC OK”: paketin hata denetimi (CRC) tuttu, veri bozulmadan geldi.',
    durationMs: 8500,
  },
  {
    id: 'telemetri',
    kind: 'live',
    short: 'Telemetri',
    title: 'Telemetri şeritleri',
    caption:
      'Uydunun düzenli gönderdiği sağlık verisi. Her kanalda ölçülen değer ve uyarı / kritik limitleri; ◆ işaretli şeritler ise yerde hesaplanan yapay zekâ anomali skoru.',
    look: 'En alttaki ◆ AI_SCORE şeritleri: kanal değerleri limit içindeyken skor yükseliyor.',
    durationMs: 9000,
  },
  {
    id: 'alarm',
    kind: 'live',
    short: 'Alarm',
    title: 'Alarm kuyruğu',
    caption:
      'Oluşan alarmlar şiddetine göre sıralanır. Bir karta tıklanınca standart (ECSS) alanlar, limit bilgisi ve operatörün izleyeceği prosedür açılır.',
    look: '“◆ AI türetilmiş” kartlar: sabit limit değil, anomali skoru tetikledi.',
    durationMs: 9000,
  },
  {
    id: 'durum',
    kind: 'live',
    short: 'Durum',
    title: 'Sabit limit ve yapay zekâ yan yana',
    caption:
      'Solda uydunun kendi limit kontrolü, sağda anomali skoru. Yavaş sürüklenmede limit hâlâ NOMİNAL derken skor alarma geçer: sorun, limit aşılmadan önce görünür.',
    look: 'Solda NOMİNAL, sağda ALARM: projenin ana fikri bu farkta.',
    durationMs: 9500,
  },
  {
    id: 'xai',
    kind: 'live',
    act: async ({ wait, alive }) => {
      const st = () => useConsole.getState();
      const hazir = (l: 1 | 2 | 3) => st().sim.xai.some((e) => e.level === l);
      st().setXaiLevel(1);
      await wait(2200);
      if (!alive()) return;
      st().setXaiLevel(2);
      await wait(2200);
      // Isi haritasi kaniti senaryoda 62. saniyede olusur. Hazir degilse bos
      // sekme gostermek yerine beklenir; adim biterse zaten birakilir.
      for (let i = 0; i < 30 && alive() && !hazir(3); i++) await wait(300);
      if (!alive()) return;
      st().setXaiLevel(3);
    },
    short: 'XAI',
    title: 'Model neden alarm verdi?',
    caption:
      'Açıklanabilirlik paneli üç seviyede cevap verir: hangi anda, hangi kanalda ve hangi frekans yapısında sapma var. Operatör yalnızca alarmı değil, gerekçesini görür.',
    look: 'Üç sekme: nerede sapmış, hangi kanal, ısı haritası. Sağda sorumlu kanal ve model.',
    durationMs: 10000,
  },
  {
    id: 'bilgi',
    kind: 'live',
    short: 'Bilgi',
    title: 'Operatör bilgi paneli',
    caption:
      'Senaryo boyunca operatöre bağlam veren notlar ve bildirimler: tespit, geçmişte benzer olaylar, yapısal kırılma ve önerilen eylem.',
    look: '“Öneri” satırı: operatöre önerilen bir sonraki adım.',
    durationMs: 8500,
  },
  {
    id: 'bildirim',
    target: 'bilgi',
    kind: 'live',
    short: 'Bildirim',
    title: 'Doğrulanan anomaliler kalıcı kayda geçer',
    caption:
      'Bildirimler sekmesi, doğrulanan her anomali için öneriyi ve gerekçesini kalıcı olarak saklar. Operatör vardiya devrinde bu listeyi okur; hiçbir uyarı ekran kapanınca kaybolmaz.',
    look: 'Sekme kendiliğinden BİLDİRİMLER’e geçti: açık öneriler ve yazıldıkları an.',
    durationMs: 12500,
    act: () => tabla('bilgi', 'BİLDİRİMLER'),
    leave: () => tabla('bilgi', 'INFO'),
  },
  {
    id: 'erisim',
    kind: 'live',
    short: 'Erişim',
    title: 'Erişilebilirlik ayarları',
    caption:
      'Konsol renk körlüğü, azaltılmış hareket, yazı boyutu ve ekran okuyucu duyurusu için ayar taşır. Alarm şiddeti yalnızca renkle değil şekil ve metinle de verilir; operatör ekranı herkes için okunabilir olmalıdır.',
    look: 'Renk paleti seçenekleri ve hareket / yazı boyutu ayarları.',
    durationMs: 11500,
    // Pencere hedef aranmadan once acilmali: `onEnter` adimin en basinda calisir.
    onEnter: () => useConsole.getState().setA11yOpen(true),
    leave: () => useConsole.getState().setA11yOpen(false),
  },
];

/**
 * Ozet gorunum turu. Genel durum karti iki kez gezilir: once sakin hali, sonra
 * suruklenme ilerledikten sonra (sabit limit NOMINAL, AI tespiti alarm).
 * Zamanlama: suruklenme `oz-senaryo` adiminda baslar; `oz-durum-alarm`
 * ~60 s, `oz-xai` ~90 s (3/3 kanit), `oz-oneri` ~100 s sonra (oneri 76 s'de gelir).
 */
export const OZET_STEPS: TourStep[] = [
  {
    id: 'oz-durum',
    kind: 'live',
    target: 'oz-durum',
    short: 'Durum',
    title: 'Özet görünüm: genel durum',
    caption:
      'Özet görünüm operatörün tek bakışta okuyacağı hükümdür: uydunun genel durumu, istasyonla temas penceresi ve anomali izleme aşaması tek bir kartta.',
    look: 'Soldaki iki rozet: uydunun kendi sabit limit kontrolü ve yapay zekâ tespiti ayrı ayrı yazılır.',
    durationMs: 10000,
    onEnter: showSummary,
  },
  {
    id: 'oz-senaryo',
    kind: 'live',
    target: 'senaryo',
    short: 'Senaryo',
    title: 'Senaryo konsolu',
    caption:
      'Gösterim için anomali senaryoları. Şimdi yavaş sürüklenme başlatıldı; özet görünümün bu sırada nasıl değiştiğini izleyeceğiz. Senaryolar gösterim amaçlı kurgulanmıştır.',
    look: 'Seçili düğme: çalışan senaryo “Yavaş sürüklenme”.',
    durationMs: 7000,
    onEnter: startDrift,
  },
  {
    id: 'oz-parametre',
    kind: 'live',
    target: 'oz-parametre',
    short: 'Parametre',
    title: 'Parametreler',
    caption:
      'Her kanalın son değeri ve limit bandındaki yeri. Grafik okumadan “değer nerede duruyor?” sorusunun cevabı; ◆ işaretli kutular yapay zekâ skorları.',
    look: 'Renkli çubuktaki ince çizgi: değerin yeşil (nominal), sarı (uyarı) ve kırmızı (kritik) bölgeye göre konumu.',
    durationMs: 9500,
  },
  {
    id: 'oz-filo',
    kind: 'live',
    target: 'oz-filo',
    short: 'Filo',
    title: 'Filo durumu',
    caption:
      'Katalogdaki Türk uydularının kısa durumu: istasyondan görünüyor mu, yükseltisi kaç derece, onaysız alarmı var mı. Bir karta tıklamak o uyduyu seçer.',
    look: '“SEÇİLİ” etiketli kart: şu an izlenen uydu.',
    durationMs: 8000,
  },
  {
    id: 'oz-telemetri',
    kind: 'live',
    target: 'oz-telemetri',
    short: 'Telemetri',
    title: 'Yalnızca dikkat isteyen kanallar',
    caption:
      'Özet görünüm her kanalı çizmez: sapan ya da operatörün sabitlediği kanallar kendiliğinden açılır. Yapay zekâ skorları her zaman altta durur.',
    look: 'Kendiliğinden açılan ch_42: değeri hâlâ limit içinde, ama model onu dikkat isteyen kanal olarak işaretledi.',
    durationMs: 8500,
  },
  {
    id: 'oz-durum-alarm',
    kind: 'live',
    target: 'oz-durum',
    short: 'Kontrast',
    title: 'Aynı kart, birkaç saniye sonra',
    caption:
      'Sabit limit hâlâ NOMİNAL derken yapay zekâ skoru eşiği geçti: kart önce İZLEME, skor büyüdükçe ALARM der ve “KONTRAST” diye işaretlenir. Altındaki şerit onaysız alarmı gösterir. Sorun, limit aşılmadan önce görünür.',
    look: 'İki rozet farklı söylüyor: ST[12] sabit limit NOMİNAL, AI tespiti İZLEME ya da ALARM.',
    durationMs: 8500,
  },
  {
    id: 'oz-dunya',
    kind: 'live',
    target: 'dunya',
    short: 'Harita',
    title: 'Harita',
    caption:
      'Özet görünümde uydu listesi gizlenir, harita genişler: uyduların anlık konumu (TLE + SGP4) ve Kahramankazan istasyonunun görüş alanı.',
    look: 'Kesik daire: istasyonun uyduyu 5° üstünde görebildiği alan.',
    durationMs: 7500,
  },
  {
    id: 'oz-xai',
    kind: 'live',
    target: 'xai',
    short: 'XAI',
    title: 'Model neden alarm verdi?',
    caption:
      'Açıklanabilirlik paneli üç seviyede cevap verir: hangi anda, hangi kanalda ve hangi frekans yapısında sapma var. Operatör yalnızca alarmı değil, gerekçesini görür.',
    look: 'Üç sekme: nerede sapmış, hangi kanal, ısı haritası. Sağda sorumlu kanal ve model.',
    durationMs: 8000,
  },
  {
    id: 'oz-oneri',
    kind: 'live',
    target: 'oz-oneri',
    short: 'Öneri',
    title: 'Öneri',
    caption:
      'Doğrulanan anomali için operatöre önerilen eylem, tek satırda. Ayrıntısı tam görünümdeki bildirimlerde.',
    look: 'Soldaki rozet önerinin aciliyeti; yanında önerilen eylem.',
    durationMs: 8000,
  },
];

/** Acilis kapagi: turun basinda projeyi ve konsolu tanitir. */
function intro(onEnter: () => void): TourStep {
  return {
    id: 'giris',
    kind: 'cover',
    short: 'Giriş',
    title: 'AzSonra · yer istasyonu konsolu',
    caption:
      'Uydu telemetrisinde açıklanabilir yapay zekâ ile anomali tespiti projesinin operatör arayüzüne hoş geldiniz. Şimdi ekrandaki panelleri tek tek gezeceğiz: uydunun konumundan telemetriye, alarmlardan modelin gerekçesine kadar.',
    look: '',
    durationMs: 13500,
    onEnter,
  };
}

/** Kapanis kapagi: tur burada biter ve basa doner. */
const OUTRO: TourStep = {
  id: 'kapanis',
  kind: 'cover',
  short: 'Kapanış',
  title: 'Teşekkür ederiz',
  caption:
    'Gerçek yörünge hesabı, uzay standartlarına uygun telemetri yapısı ve yapay zekâ destekli anomali tespiti tek ekranda. Bizi dinlediğiniz için teşekkür ederiz.',
  look: '',
  durationMs: 12500,
};

export const TOURS: Record<TourId, TourStep[]> = {
  tam: [intro(showFullConsole), ...TOUR_STEPS, OUTRO],
  ozet: [intro(showSummary), ...OZET_STEPS, OUTRO],
};
