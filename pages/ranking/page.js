import {html, css} from 'lit';
import {customElement} from 'lit/decorators.js';
import {AIUXElement} from '@servicenow/aiux/aiux-components-core';
import {i18n} from '@servicenow/aiux/aiux-services';
import {fetchTop, formatTime} from '../play/components/ranking-api.js';

@customElement('x-2302769-backlog-ranking-page')
export default class RankingPage extends AIUXElement {
  static styles = css`
    :host {
      display: block;
    }
  `;

  static async loader() {
    const top = await fetchTop(25).catch(() => null);
    return {top};
  }

  render() {
    const {top} = this.loaderData || {};
    return html`
      <div class="mx-auto flex max-w-3xl flex-col gap-4 p-4 lg:p-8">
        <h1 class="font-mono text-3xl font-bold tracking-widest">${i18n.getMessage('Ranking')}</h1>
        <p class="text-sm text-text-secondary">
          ${i18n.getMessage('Fastest resolutions of Backlog. Ties are broken by fewer deaths.')}
        </p>
        ${top === null
          ? html`<p>${i18n.getMessage('Ranking unavailable right now.')}</p>`
          : top.length === 0
            ? html`<p>${i18n.getMessage('No resolutions yet. Be the first.')}</p>`
            : html`<table class="aiux-table">
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">${i18n.getMessage('Player')}</th>
                    <th scope="col">${i18n.getMessage('Time')}</th>
                    <th scope="col">${i18n.getMessage('Deaths')}</th>
                  </tr>
                </thead>
                <tbody>
                  ${top.map(
                    (r, i) => html`<tr>
                      <td>${i + 1}</td>
                      <td>${r.name}</td>
                      <td class="font-mono">${formatTime(r.timeMs)}</td>
                      <td>${r.deaths}</td>
                    </tr>`
                  )}
                </tbody>
              </table>`}
      </div>
    `;
  }
}
