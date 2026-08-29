# XAI görselleri

Bu klasöre **bildiriden alınmış gerçek model çıktıları** konur. Sentetik olarak
yeniden çizilmiş grafik konulmaz (yönerge §7, §10).

Dosya bulunmadığında XAI paneli boş bir yuva çizer ve beklenen dosya adını
gösterir — uydurma bir grafik üretmez.

## Yerleştirilmiş görseller

Hepsi `ESA-AD/ewma_model/` altındaki notebook hücre çıktılarından **birebir**
alındı; hiçbiri yeniden çizilmedi, kırpılmadı, yeniden ölçeklenmedi.

| Dosya | Senaryo | Seviye | Kaynak | Şekil |
|---|---|---|---|---|
| `specae_ss5_profiles.png` | Nokta anomalisi | 1 · Artık | `ewma_model.ipynb` h.70 | Level-1: Frequency & Time Error Profiles — `channel_44`, `channel_46` |
| `specae_ss5_channel_attr.png` | Nokta anomalisi | 2 · Kanal katkısı | `ewma_model.ipynb` h.72 | Level-1: Per-Channel Error Contribution — `ch_44` %56,3 baskın |
| `specae_ss5_gradcam.png` | Nokta anomalisi | 3 · Grad-CAM | `ewma_model.ipynb` h.91 | Level-3: Grad-CAM (Bottleneck Attention), NORMAL vs ANOMALY |
| `tcn_ss3_residual.png` | Sürüklenme · Kolektif | 1 · Artık | `ewma_v2_tcn_xai.ipynb` h.42 | L1 kalıntı haritası: TCN-AE Residual, ANOMALY vs NORMAL — `ch_75` baskın |
| `tcn_ss3_channel_attr.png` | Sürüklenme | 2 · Kanal katkısı | `ewma_v2_tcn_xai.ipynb` h.47 | L2 kanal artığı + FFT spektral köprüsü — `ch_75`, `ch_42`, `ch_74` |
| `tcn_ss3_gradcam.png` | Sürüklenme · Kolektif | 3 · Grad-CAM | `ewma_v2_tcn_xai.ipynb` h.53 | L3a Grad-CAM (zamansal) + kanal × zaman kalıntı ısı haritası |
| `collective_channel_attr.png` | Kolektif | 2 · Kanal katkısı | `ewma_v2_tcn_xai.ipynb` h.65 | Alt sistem atfı: Spec-AE %52,4 → alt sistem 5, TCN-AE %62,3 → alt sistem 3 |

### Neden yedi dosya, dokuz yuva değil

Notebook'larda **altı** gerçek XAI şekil ailesi var: üç Spectrogram-AE, üç
TCN-AE. Demoda dokuz yuva var çünkü sürüklenme ve kolektif senaryolarının ikisi
de TCN-AE kullanıyor. Bu iki senaryo, aynı modelin aynı kanıt türünü gösterdiği
için **1. ve 3. seviyede aynı görseli paylaşır**; 2. seviyede ayrışırlar:
sürüklenme kanal düzeyinde artığı, kolektif ise iki modelin alt sistem atfını
gösterir. Uydurma görsel üretmemek için tercih bu yönde yapıldı.

## Etiket tutarlılığı

Ekrandaki etiketler bu görsellerle **çelişmez.** Kanal listesi ESA-ADB'nin
resmî `channels.csv` tablosuyla hizalandı:

| Konsolda | ESA-ADB alt sistemi | Görsellerdeki karşılığı |
|---|---|---|
| `ch_42`, `ch_44`, `ch_46` → SS5 | subsystem_5 | h.72 katkı grafiği ve h.47 "ch_42 (subsystem_5)" |
| `ch_74`, `ch_75` → SS3 | subsystem_3 | h.47 "ch_75 (subsystem_3)", "ch_74 (subsystem_3)" |

Model–alt sistem eşleşmesi de bildirinin kendi bulgusundan gelir:
`AI_SCORE_SS5` → Spectrogram-AE (%52,4), `AI_SCORE_SS3` → TCN-AE (%62,3).

Frekans bandı alanları da şekillerin kendi değerleridir: sürüklenme için
`ch_75` dom = 0,0098 Hz; kolektif için üç kanalın aralığı 0,002–0,125 Hz.

## Not

Adları değiştirmek isterseniz `src/data/scenario_*.json` içindeki `show_xai`
adımlarının `asset` alanını güncelleyin. PNG'ler `npm run build` sırasında tek
dosya çıktısına gömülür; çalışma zamanında ağdan çekilmez.

Panelin görsel alanı tasarım biriminde yaklaşık **528×207 px**; en boy oranı
~2,55 olan yatay görseller yuvayı tam doldurur. Buradaki şekiller 1,76–2,55
aralığında, yani desen okunur ama eksen etiketleri küçüktür — yan sütundaki
başlık, model, katkı ve bant bilgisi bu yüzden metin olarak da veriliyor.
