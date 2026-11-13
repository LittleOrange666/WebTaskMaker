// 對話框與通知（spec §16）：取代瀏覽器內建的 alert / confirm / prompt
// 以 Promise 形式提供，畫面由 components/Dialogs.svelte 顯示

export const dialogState = $state({ current: null, toasts: [] });

const queue = [];
let toastId = 0;

function open(dialog) {
  return new Promise((resolve) => {
    const item = { ...dialog, resolve };
    if (dialogState.current) queue.push(item);
    else dialogState.current = item;
  });
}

/** 由對話框元件呼叫：關閉目前的對話框並回傳結果，接著顯示下一個 */
export function closeDialog(value) {
  const cur = dialogState.current;
  dialogState.current = null;
  cur?.resolve(value);
  if (queue.length) dialogState.current = queue.shift();
}

const asOpts = (opts) => (typeof opts === 'string' ? { message: opts } : opts);

/** 訊息（取代 alert）：{ title, message, okLabel } */
export function alertDialog(opts) {
  const o = asOpts(opts);
  return open({ kind: 'alert', title: o.title ?? '提示', message: o.message ?? '', okLabel: o.okLabel ?? '確定' }).then(() => undefined);
}

/** 確認（取代 confirm）：{ title, message, confirmLabel, cancelLabel, danger }，回傳 true / false */
export function confirmDialog(opts) {
  const o = asOpts(opts);
  return open({
    kind: 'confirm',
    title: o.title ?? '確認',
    message: o.message ?? '',
    confirmLabel: o.confirmLabel ?? '確定',
    cancelLabel: o.cancelLabel ?? '取消',
    danger: !!o.danger,
  }).then((v) => v === true);
}

/**
 * 輸入（取代 prompt）：{ title, message, label, value, placeholder, confirmLabel, validate }
 * validate(value) 回傳錯誤訊息字串或 null；回傳輸入的字串，取消時回傳 null
 */
export function promptDialog(opts) {
  return open({
    kind: 'prompt',
    title: opts.title ?? '輸入',
    message: opts.message ?? '',
    label: opts.label ?? '',
    value: opts.value ?? '',
    placeholder: opts.placeholder ?? '',
    confirmLabel: opts.confirmLabel ?? '確定',
    cancelLabel: opts.cancelLabel ?? '取消',
    validate: opts.validate ?? null,
  }).then((v) => (typeof v === 'string' ? v : null));
}

/** 短暫出現的通知（spec §16.2） */
export function toast(message, ms = 2500) {
  const id = ++toastId;
  dialogState.toasts.push({ id, message });
  setTimeout(() => {
    const i = dialogState.toasts.findIndex((t) => t.id === id);
    if (i >= 0) dialogState.toasts.splice(i, 1);
  }, ms);
}
