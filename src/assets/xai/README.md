# XAI görselleri

Bu klasördeki dokuz PNG **üretilmiş görselleştirmelerdir** — bir modelin gerçek
çıktısı değildir. `tools/xai-figures/generate.mjs` tarafından, demonun kendi
senaryo tanımlarından türetilirler.

```bash
npm run xai:figures
```

Dosyaları elle düzenlemeyin; script'i çalıştırın. Üretim tohumludur, aynı girdi
her zaman aynı görseli verir.

## Neden üretilmiş görsel

İlk sürümde bildirinin notebook çıktıları doğrudan yerleştirilmişti. İki sorun
çıktı:

1. **Kanal ve alt sistem uyuşmazlığı.** Bildiri şekilleri gerçek anomali
   pencerelerine aitti; demonun senaryolarıyla aynı kanalları, aynı zamanlamayı
   ve aynı baskınlık sırasını göstermiyorlardı. Ekrandaki yan sütun "sorumlu
   kanal: ch_44" derken görselde başka bir kanal öne çıkıyordu.
2. **Yapı tutarsızlığı.** Üç senaryo için elde altı gerçek şekil vardı ve
   bunlar birbirinden farklı türdeydi; panelin üç adımı senaryolar arasında
   aynı şeyi anlatmıyordu.

Şimdi her senaryo, panelin üç adımına birebir karşılık gelen **aynı yapıda** üç
görsel üretiyor ve her biri o senaryonun gerçekten enjekte ettiği sapmayı
gösteriyor.

## Üretilen dosyalar

| Dosya | Senaryo | Panel adımı | Ne gösteriyor |
|---|---|---|---|
| `specae_ss5_residual.png` | Nokta anomalisi | 1 · Nerede saptı | Kanal × zaman sapma haritası, anomali ve normal pencere alt alta |
| `specae_ss5_channel_attr.png` | Nokta anomalisi | 2 · Hangi kanal | Sapma enerjisinin kanallara yüzde dağılımı |
| `specae_ss5_gradcam.png` | Nokta anomalisi | 3 · Isı haritası | Sapma haritası + ortalama sapma + modelin dikkat eğrisi |
| `tcn_ss3_residual.png` | Yavaş sürüklenme | 1 · Nerede saptı | aynı yapı |
| `tcn_ss3_channel_attr.png` | Yavaş sürüklenme | 2 · Hangi kanal | aynı yapı |
| `tcn_ss3_gradcam.png` | Yavaş sürüklenme | 3 · Isı haritası | aynı yapı |
| `collective_residual.png` | Kolektif sapma | 1 · Nerede saptı | aynı yapı |
| `collective_channel_attr.png` | Kolektif sapma | 2 · Hangi kanal | aynı yapı |
| `collective_gradcam.png` | Kolektif sapma | 3 · Isı haritası | aynı yapı |

Her görsel 1120×420 px, konsolun kendi paletinde, ~5–12 kB.

## Veri nereden geliyor

Script `src/data/mib.json` ve `src/data/scenario_*.json` dosyalarını okur.
Enjeksiyon şekilleri (rampa, tekil sıçrama, ilişkili kayma + salınım)
`src/engine/scenarioRunner.ts` içindeki tanımların aynısıdır. Sonuç olarak:

- görseldeki **kanal listesi** MIB'deki kanal listesiyle aynıdır,
- **baskın kanal** senaryonun enjekte ettiği kanaldır,
- **zamanlama** senaryonun zaman çizelgesiyle örtüşür,
- kolektif senaryoda salınım ve enjeksiyonun `t = 78`'de bitişi görselde de
  görünür.

Yani ekranda gördüğünüz şeritlerle görseldeki hikâye aynıdır.

## Dürüstlük

Her görselin alt kenarında şu satır yazılıdır:

> AzSonra demo · simüle veri · gerçek model çıktısı değildir

Konsolun sağ üstündeki `SİMÜLE VERİ — KAVRAMSAL GÖSTERİM` rozeti de sürekli
görünür. Bu iki işaret birlikte, görselin bir bildiri çıktısı sanılmasını
engeller.

**Bildiriden alınmış gerçek çıktılarla değiştirmek isterseniz:** PNG'leri bu
klasöre aynı adlarla koyun ve bu README'yi kaynak künyesiyle (hangi notebook,
hangi hücre) güncelleyin. O durumda `npm run xai:figures` çalıştırmayın —
dosyaların üzerine yazar.

## Panele sığma

Panelin görsel alanı tasarım biriminde yaklaşık **528×207 px**. Üretilen
görsellerin en-boy oranı 2,67 olduğu için yuvayı neredeyse tam doldurur.
Farklı boyut isterseniz `tools/xai-figures/generate.mjs` içindeki `W` ve `H`
sabitlerini değiştirin.
