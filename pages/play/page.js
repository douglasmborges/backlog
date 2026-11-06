import {html, css} from 'lit';
import {customElement} from 'lit/decorators.js';
import {AIUXElement} from '@servicenow/aiux/aiux-components-core';
import './components/backlog-game.js';

@customElement('x-2302769-backlog-play-page')
export default class PlayPage extends AIUXElement {
  static styles = css`
    :host {
      display: block;
    }
  `;

  render() {
    return html`<x-2302769-backlog-game></x-2302769-backlog-game>`;
  }
}
