import {html, css, nothing, isServer} from 'lit';
import {customElement} from 'lit/decorators.js';
import {AIUXElement} from '@servicenow/aiux/aiux-components-core';
import {i18n} from '@servicenow/aiux/aiux-services';
import {fetchTop, submitScore, formatTime} from './ranking-api.js';

const GAME_KEYS = [
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Space',
  'KeyA',
  'KeyD',
  'KeyW',
  'KeyS',
  'KeyE',
  'ShiftLeft',
  'ShiftRight'
];

@customElement('x-2302769-backlog-game')
export default class BacklogGame extends AIUXElement {
  static properties = {
    _screen: {type: String, state: true}, // title | play | won
    _deaths: {type: Number, state: true},
    _clock: {type: String, state: true},
    _result: {type: Object, state: true},
    _name: {type: String, state: true},
    _saving: {type: Boolean, state: true},
    _saved: {type: Boolean, state: true},
    _top: {type: Array, state: true},
    _error: {type: String, state: true},
    _muted: {type: Boolean, state: true}
  };

  static styles = css`
    :host {
      display: block;
    }
  `;

  constructor() {
    super();
    this._screen = 'title';
    this._deaths = 0;
    this._clock = '0:00.00';
    this._result = null;
    this._name = '';
    this._saving = false;
    this._saved = false;
    this._top = [];
    this._error = '';
    this._muted = false;
    this._engine = null;
    this._sound = null;
  }

  _labels() {
    return {
      'INC0000001 - still open': i18n.getMessage('INC0000001 - still open'),
      'Queue: 9,999+': i18n.getMessage('Queue: 9,999+'),
      'Approval required': i18n.getMessage('Approval required'),
      'Workflow in progress': i18n.getMessage('Workflow in progress'),
      'SLA breach imminent': i18n.getMessage('SLA breach imminent'),
      Resolved: i18n.getMessage('Resolved')
    };
  }

  async firstUpdated() {
    if (isServer) return;
    // Engine and sound only exist in the browser.
    const [{BacklogEngine}, {BacklogSound}] = await Promise.all([
      import('./engine.js'),
      import('./sound.js')
    ]);
    this._sound = new BacklogSound();
    const canvas = this.renderRoot.querySelector('canvas');
    this._engine = new BacklogEngine(canvas, this._sound, this._labels(), {
      onDeath: n => {
        this._deaths = n;
      },
      onWin: stats => {
        this._result = stats;
        this._screen = 'won';
        this._saved = false;
        this._loadTop();
      }
    });
    this._engine.state = 'won'; // frozen behind the title screen
    this._engine.fade = 0.35;
    this._engine.run();
    this._clockTimer = setInterval(() => {
      if (this._engine && this._screen === 'play') {
        this._clock = formatTime(this._engine.elapsed * 1000);
      }
    }, 100);
    this._onKey = e => this._key(e);
    window.addEventListener('keydown', this._onKey);
    window.addEventListener('keyup', this._onKey);
    this._loadTop();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (isServer) return;
    this._engine?.stop();
    clearInterval(this._clockTimer);
    if (this._onKey) {
      window.removeEventListener('keydown', this._onKey);
      window.removeEventListener('keyup', this._onKey);
    }
  }

  _key(e) {
    const typing = e.composedPath?.().some(el => el?.tagName === 'INPUT');
    if (typing) return;
    if (this._screen === 'title' && e.type === 'keydown' && (e.code === 'Enter' || e.code === 'Space')) {
      e.preventDefault();
      this._start();
      return;
    }
    if (this._screen !== 'play' || !this._engine) return;
    if (e.code === 'KeyM' && e.type === 'keydown') this._toggleMute();
    if (e.code === 'KeyR' && e.type === 'keydown') this._start();
    if (GAME_KEYS.includes(e.code)) {
      e.preventDefault();
      this._engine.key(e.code, e.type === 'keydown');
    }
  }

  _start() {
    if (!this._engine) return;
    this._sound.start();
    this._engine.keys.clear();
    this._engine.reset();
    this._deaths = 0;
    this._clock = '0:00.00';
    this._screen = 'play';
    this.renderRoot.querySelector('canvas')?.focus();
  }

  _toggleMute() {
    this._muted = !this._muted;
    this._sound?.setMuted(this._muted);
  }

  async _loadTop() {
    try {
      this._top = await fetchTop(10);
      this._error = '';
    } catch {
      this._error = i18n.getMessage('Ranking unavailable right now.');
    }
  }

  async _save(e) {
    e.preventDefault();
    const name = this._name.trim();
    if (!name || !this._result || this._saving) return;
    this._saving = true;
    try {
      await submitScore({name, ...this._result});
      this._saved = true;
      await this._loadTop();
    } catch {
      this._error = i18n.getMessage('Could not save your score.');
    } finally {
      this._saving = false;
    }
  }

  _renderRanking() {
    if (this._error) return html`<p role="status" aria-live="polite" class="text-sm text-neutral-400">${this._error}</p>`;
    if (!this._top.length)
      return html`<p class="text-sm text-neutral-400">${i18n.getMessage('No resolutions yet. Be the first.')}</p>`;
    return html`
      <ol class="w-full space-y-1 font-mono text-sm">
        ${this._top.map(
          (r, i) => html`<li class="flex justify-between gap-4 border-b border-neutral-700 py-1">
            <span class="truncate">${i + 1}. ${r.name}</span>
            <span class="text-neutral-300">${formatTime(r.timeMs)} · ${r.deaths} ${i18n.getMessage('deaths')}</span>
          </li>`
        )}
      </ol>
    `;
  }

  _renderOverlay() {
    if (this._screen === 'title') {
      return html`
        <div class="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-black/60 p-6 text-center text-neutral-100">
          <h1 data-i18n-skip class="font-mono text-5xl font-bold tracking-[0.4em]">BACKLOG</h1>
          <p class="max-w-md text-sm text-neutral-300">
            ${i18n.getMessage('You wake up inside an abandoned instance. One ticket is still open. Find the way to Resolved before the SLA catches you.')}
          </p>
          <button class="aiux-btn aiux-btn-outline border-neutral-200 text-neutral-100" @click=${this._start}>
            ${i18n.getMessage('Press Enter to start')}
          </button>
          <p class="font-mono text-xs text-neutral-400">
            ${i18n.getMessage('Move: A/D or arrows · Jump: W, Up or Space · Use lever: E or Shift · Restart: R · Mute: M')}
          </p>
        </div>
      `;
    }
    if (this._screen === 'won') {
      return html`
        <div class="absolute inset-0 flex flex-col items-center justify-center gap-4 overflow-auto bg-black/80 p-6 text-neutral-100">
          <h2 class="font-mono text-3xl font-bold tracking-[0.3em]">${i18n.getMessage('RESOLVED')}</h2>
          <p class="font-mono">
            ${formatTime(this._result?.timeMs ?? 0)} · ${this._result?.deaths ?? 0} ${i18n.getMessage('deaths')}
          </p>
          ${this._saved
            ? html`<p class="text-sm text-neutral-300">${i18n.getMessage('Score saved to the instance.')}</p>`
            : html`<form class="flex gap-2" aria-label=${i18n.getMessage('Save score')} @submit=${this._save}>
                <input
                  id="pname"
                  aria-label=${i18n.getMessage('Your name')}
                  class="aiux-input aiux-input-sm w-56 bg-neutral-900 text-neutral-100"
                  maxlength="40"
                  placeholder=${i18n.getMessage('Your name')}
                  .value=${this._name}
                  @input=${e => (this._name = e.target.value)}
                />
                <button class="aiux-btn aiux-btn-sm" type="submit" ?disabled=${this._saving || !this._name.trim()}>
                  ${i18n.getMessage('Save score')}
                </button>
              </form>`}
          <div class="w-full max-w-md">
            <h3 class="mb-2 font-mono text-xs uppercase tracking-widest text-neutral-400">${i18n.getMessage('Top 10')}</h3>
            ${this._renderRanking()}
          </div>
          <button class="aiux-btn aiux-btn-outline aiux-btn-sm border-neutral-200 text-neutral-100" @click=${this._start}>
            ${i18n.getMessage('Play again')}
          </button>
        </div>
      `;
    }
    return nothing;
  }

  render() {
    return html`
      <div class="mx-auto w-full max-w-6xl p-2 lg:p-4">
        <div class="relative aspect-video w-full overflow-hidden rounded-box bg-black">
          <canvas
            width="960"
            height="540"
            tabindex="0"
            role="img"
            aria-label=${i18n.getMessage('Backlog game screen')}
            class="block h-full w-full outline-none"
          ></canvas>
          ${this._screen === 'play'
            ? html`<div class="pointer-events-none absolute left-3 top-2 font-mono text-xs text-neutral-200">
                ${this._clock} · ${this._deaths} ${i18n.getMessage('deaths')}${this._muted ? ` · ${i18n.getMessage('muted')}` : nothing}
              </div>`
            : nothing}
          ${this._renderOverlay()}
        </div>
      </div>
    `;
  }
}
