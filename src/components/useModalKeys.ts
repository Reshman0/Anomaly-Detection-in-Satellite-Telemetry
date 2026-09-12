import { useEffect } from 'react';

/**
 * Acik bir pencere varken Esc ile kapatir ve diger tuslarin arkadaki
 * kisayollara ulasmasini engeller.
 *
 * App.tsx kisayollari pencere seviyesinde dinler ve acik pencereleri store'daki
 * alanlarla (selectedAlarmId, packetOpen) anlar. Burada o yola gidilmedi:
 * yeni bir alan eklemek store.ts'i degistirmek demekti. Bunun yerine olay
 * yakalama (capture) fazinda durdurulur; App'in dinleyicisi hic calismaz.
 */
export function useModalKeys(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return;
    const bas = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // stopImmediatePropagation: olay dogrudan window'a gonderildiginde yakalama
      // ve kabarcik fazi ayrismaz; stopPropagation ayni dugumdeki App
      // dinleyicisini durdurmaz. Bu cagri her iki yolu da kapatir.
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', bas, true);
    return () => window.removeEventListener('keydown', bas, true);
  }, [open, onClose]);
}
