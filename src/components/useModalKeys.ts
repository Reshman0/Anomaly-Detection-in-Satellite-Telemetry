import { useEffect } from 'react';

/**
 * Pencerelerin basilacagi kok: #root.
 *
 * Erisilebilirlik olcegi (WCAG 1.4.4) `zoom` ile yalnizca #root'a uygulanir
 * (bkz. index.css). document.body'ye basilan bir pencere olcegi izlemez; ayar
 * buyutulse bile kucuk kalir. Konsolun kendi pencereleri (paket denetleyici,
 * alarm detayi, erisilebilirlik) de #root altinda cizilir.
 */
export function portalHedefi(): HTMLElement {
  return document.getElementById('root') ?? document.body;
}

/**
 * Gecerli arayuz olcegi (--ui-scale). #root'a basilan `position: fixed` bir
 * ogenin left/top degerleri de zoom ile carpilir; ekran koordinatindan
 * (getBoundingClientRect) konum hesaplarken bu degere bolunmelidir.
 */
export function arayuzOlcegi(): number {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale'));
  return Number.isFinite(v) && v > 0 ? v : 1;
}

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
