<script>
  import { onMount, onDestroy } from 'svelte';
  import { EditorView, basicSetup } from 'codemirror';
  import { EditorState, Compartment } from '@codemirror/state';
  import { keymap } from '@codemirror/view';
  import { indentWithTab } from '@codemirror/commands';
  import { indentUnit } from '@codemirror/language';
  import { python } from '@codemirror/lang-python';
  import { javascript } from '@codemirror/lang-javascript';
  import { cpp } from '@codemirror/lang-cpp';
  import { oneDark } from '@codemirror/theme-one-dark';

  /** docKey 改變時重建編輯器內容（切換檔案） */
  let { value = '', lang = null, docKey = '', onchange = () => {} } = $props();

  let host;
  let view;
  let currentKey = null;
  const themeComp = new Compartment();
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  function langExt(l) {
    if (l === 'py') return python();
    if (l === 'js') return javascript();
    if (l === 'cpp') return cpp();
    return [];
  }

  function themeExt() {
    return media.matches ? oneDark : [];
  }

  function makeState(doc, l) {
    return EditorState.create({
      doc,
      extensions: [
        basicSetup,
        keymap.of([indentWithTab]),
        indentUnit.of('    '),
        langExt(l),
        themeComp.of(themeExt()),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onchange(u.state.doc.toString());
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '14px' },
          '.cm-scroller': { fontFamily: 'var(--mono)' },
        }),
      ],
    });
  }

  const onTheme = () => view?.dispatch({ effects: themeComp.reconfigure(themeExt()) });

  onMount(() => {
    view = new EditorView({ state: makeState(value, lang), parent: host });
    currentKey = docKey + '|' + lang;
    media.addEventListener('change', onTheme);
  });

  onDestroy(() => {
    media.removeEventListener('change', onTheme);
    view?.destroy();
  });

  $effect(() => {
    const key = docKey + '|' + lang;
    if (view && key !== currentKey) {
      currentKey = key;
      view.setState(makeState(value, lang));
    }
  });
</script>

<div class="editor" bind:this={host}></div>

<style>
  .editor {
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: var(--surface);
  }
</style>
