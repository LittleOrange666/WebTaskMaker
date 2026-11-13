// 執行環境偵測

/** 是否為手機或平板（iPadOS 的 Safari 會偽裝成 Mac，以觸控點數判斷） */
export const IS_MOBILE = typeof navigator !== 'undefined' && (
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))
);
