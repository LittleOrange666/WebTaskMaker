<script>
  // 顯示 lib/dialog.svelte.js 的對話框與通知（spec §16）
  import { tick } from 'svelte';
  import { dialogState, closeDialog } from '../lib/dialog.svelte.js';

  let panel = $state(null);
  let input = $state(null);
  let primary = $state(null);
  let cancelBtn = $state(null);
  let value = $state('');
  let error = $state('');
  let returnFocus = null;
  let shownFor = null;

  let d = $derived(dialogState.current);

  // 開啟時：記住原本的焦點、填入預設值並把焦點移進對話框
  $effect(() => {
    const cur = d;
    if (cur && cur !== shownFor) {
      shownFor = cur;
      if (!returnFocus) returnFocus = document.activeElement;
      value = cur.kind === 'prompt' ? cur.value : '';
      error = '';
      tick().then(() => {
        if (cur.kind === 'prompt' && input) {
          input.focus();
          // 選取檔名主體（不含副檔名），方便直接改名
          const dot = value.lastIndexOf('.');
          input.setSelectionRange(0, dot > 0 ? dot : value.length);
        } else if (cur.kind === 'confirm' && cur.danger) {
          // 無法復原的動作：預設焦點在「取消」，避免誤按 Enter
          cancelBtn?.focus();
        } else {
          primary?.focus();
        }
      });
    } else if (!cur && shownFor) {
      shownFor = null;
      const el = returnFocus;
      returnFocus = null;
      if (el && typeof el.focus === 'function' && document.contains(el)) el.focus();
    }
  });

  function cancel() {
    closeDialog(d.kind === 'confirm' ? false : null);
  }

  function submit() {
    if (d.kind === 'prompt') {
      const v = value.trim();
      const msg = d.validate ? d.validate(v) : null;
      if (msg) {
        error = msg;
        input?.focus();
        return;
      }
      closeDialog(v);
    } else if (d.kind === 'confirm') {
      closeDialog(true);
    } else {
      closeDialog(undefined);
    }
  }

  function onBackdrop(e) {
    if (e.target !== e.currentTarget) return;
    // 輸入框中有修改過的內容時，點背景不關閉，避免誤觸遺失輸入
    if (d.kind === 'prompt' && value !== d.value) return;
    cancel();
  }

  function onKeydown(e) {
    if (!d) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    } else if (e.key === 'Enter' && d.kind === 'prompt' && e.target === input) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Tab' && panel) {
      // 焦點限制在對話框內
      const items = [...panel.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.disabled);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if d}
  <div class="backdrop" role="presentation" onclick={onBackdrop}>
    <div class="panel" role={d.kind === 'alert' ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby="dlg-title" aria-describedby={d.message ? 'dlg-msg' : undefined} bind:this={panel}>
      <h2 id="dlg-title">{d.title}</h2>
      {#if d.message}<p id="dlg-msg" class="msg">{d.message}</p>{/if}
      {#if d.kind === 'prompt'}
        <label class="field">
          {#if d.label}<span>{d.label}</span>{/if}
          <input
            bind:this={input}
            bind:value
            placeholder={d.placeholder}
            spellcheck="false"
            autocomplete="off"
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? 'dlg-err' : undefined}
            oninput={() => (error = '')}
          />
        </label>
        {#if error}<p id="dlg-err" class="error" role="alert">{error}</p>{/if}
      {/if}
      <div class="buttons">
        {#if d.kind !== 'alert'}
          <button bind:this={cancelBtn} onclick={cancel}>{d.cancelLabel}</button>
        {/if}
        <button
          bind:this={primary}
          class={d.kind === 'confirm' && d.danger ? 'danger-solid' : 'primary'}
          onclick={submit}
        >
          {d.kind === 'alert' ? d.okLabel : d.confirmLabel}
        </button>
      </div>
    </div>
  </div>
{/if}

<div class="toasts" aria-live="polite">
  {#each dialogState.toasts as t (t.id)}
    <div class="toast">{t.message}</div>
  {/each}
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    z-index: 100;
  }
  .panel {
    background: var(--surface);
    color: var(--text);
    border-radius: 12px;
    width: 100%;
    max-width: 440px;
    max-height: calc(100vh - 32px);
    overflow: auto;
    padding: 18px 20px 16px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
    border: 1px solid var(--border);
  }
  h2 { margin: 0 0 8px; font-size: 17px; }
  .msg { margin: 0 0 12px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; color: var(--text); }
  .field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--muted); }
  .field input { font-family: var(--mono); font-size: 14px; padding: 6px 8px; }
  .field input[aria-invalid='true'] { border-color: var(--danger); }
  .error { margin: 6px 0 0; font-size: 13px; color: var(--danger); }
  .buttons { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
  .buttons button { min-width: 72px; padding: 6px 14px; }
  .danger-solid { background: var(--danger); border-color: var(--danger); color: #fff; font-weight: 600; }
  .danger-solid:hover { filter: brightness(1.08); background: var(--danger) !important; }
  .toasts {
    position: fixed;
    left: 50%;
    bottom: 20px;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 6px;
    z-index: 110;
    pointer-events: none;
    max-width: calc(100vw - 32px);
  }
  .toast {
    background: var(--text);
    color: var(--bg);
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 13px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  }
</style>
