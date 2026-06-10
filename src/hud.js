// src/hud.js
export function formatTime(s) {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

export class Hud {
  constructor() {
    const id = (name) => document.getElementById(name);
    this.el = {
      start: id('start-screen'),
      pause: id('pause-screen'),
      win: id('win-screen'),
      status: id('status'),
      counter: id('counter'),
      timer: id('timer'),
      prompt: id('prompt'),
      crosshair: id('crosshair'),
      mute: id('mute'),
      winTime: id('win-time'),
    };
  }

  // name: 'start' | 'pause' | 'win' | 'none' ('none' = playing)
  showScreen(name) {
    for (const k of ['start', 'pause', 'win'])
      this.el[k].classList.toggle('hidden', k !== name);
    const playing = name === 'none';
    this.el.status.classList.toggle('hidden', !playing);
    this.el.crosshair.classList.toggle('hidden', !playing);
    if (!playing) this.setPrompt(false);
  }

  setCaught(n, total) { this.el.counter.textContent = `🐱 ${n} / ${total}`; }
  setTime(s) { this.el.timer.textContent = formatTime(s); }
  setPrompt(visible) { this.el.prompt.classList.toggle('hidden', !visible); }
  setMuted(muted) { this.el.mute.classList.toggle('hidden', !muted); }
  showWin(s) { this.el.winTime.textContent = formatTime(s); this.showScreen('win'); }
}
