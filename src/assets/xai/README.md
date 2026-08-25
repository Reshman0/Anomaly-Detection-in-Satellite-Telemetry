# XAI görselleri

Bu klasöre **bildiriden alınmış gerçek model çıktıları** konur. Sentetik olarak
yeniden çizilmiş grafik konulmaz (yönerge §7, §10).

Dosya bulunmadığında XAI paneli boş bir yuva çizer ve beklenen dosya adını
gösterir — uydurma bir grafik üretmez.

Senaryo dosyalarının beklediği adlar:

| Dosya | Senaryo | Seviye | Model |
|---|---|---|---|
| `specae_ss1_spectrogram.png` | Nokta anomalisi | 1 · Artık | Spectrogram-AE |
| `specae_ss1_channel_attr.png` | Nokta anomalisi | 2 · Kanal katkısı | Spectrogram-AE |
| `specae_ss1_gradcam.png` | Nokta anomalisi | 3 · Grad-CAM | Spectrogram-AE |
| `tcn_ss3_residual.png` | Yavaş sürüklenme | 1 · Artık | TCN-AE |
| `tcn_ss3_channel_attr.png` | Yavaş sürüklenme | 2 · Kanal katkısı | TCN-AE |
| `tcn_ss3_gradcam.png` | Yavaş sürüklenme | 3 · Grad-CAM | TCN-AE |
| `collective_residual.png` | Kolektif sapma | 1 · Artık | TCN-AE |
| `collective_channel_attr.png` | Kolektif sapma | 2 · Kanal katkısı | TCN-AE |
| `collective_gradcam.png` | Kolektif sapma | 3 · Grad-CAM | TCN-AE |

Adları değiştirmek isterseniz `src/data/scenario_*.json` içindeki `show_xai`
adımlarının `asset` alanını güncelleyin. PNG'ler `npm run build` sırasında tek
dosya çıktısına gömülür; çalışma zamanında ağdan çekilmez.

Panelin görsel alanı yaklaşık 520×170 px'dir; en boy oranı geniş (yatay)
görseller en iyi oturur.
