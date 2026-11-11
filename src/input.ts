/**
 * 統一的輸入層：鍵盤、滑鼠、觸控都轉成同一組數值，
 * 遊戲邏輯不需要知道玩家用的是哪種裝置。
 */
export class Input {
  /** 移動向量：x 為左右、y 為前後，長度 0..1 */
  moveX = 0;
  moveY = 0;
  sprint = false;

  private keys = new Set<string>();
  private lookDX = 0;
  private lookDY = 0;
  private jumpQueued = false;

  private stickId: number | null = null;
  private stickX = 0;
  private stickY = 0;
  private stickCX = 0;
  private stickCY = 0;
  private lookPointers = new Map<number, { x: number; y: number }>();

  private readonly STICK_R = 50;

  constructor(
    private canvas: HTMLCanvasElement,
    private stickEl: HTMLElement,
    private knobEl: HTMLElement,
    jumpBtn: HTMLElement,
  ) {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'Space') {
        this.jumpQueued = true;
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    jumpBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.jumpQueued = true;
    });
  }

  private onDown = (e: PointerEvent): void => {
    this.canvas.setPointerCapture(e.pointerId);
    const isTouch = e.pointerType !== 'mouse';
    if (isTouch && this.stickId === null && e.clientX < window.innerWidth / 2) {
      // 左半邊：在手指落點出現虛擬搖桿
      this.stickId = e.pointerId;
      this.stickCX = e.clientX;
      this.stickCY = e.clientY;
      this.stickX = 0;
      this.stickY = 0;
      this.stickEl.style.display = 'block';
      this.stickEl.style.left = `${e.clientX}px`;
      this.stickEl.style.top = `${e.clientY}px`;
      this.knobEl.style.transform = 'translate(0px, 0px)';
    } else {
      this.lookPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
  };

  private onMove = (e: PointerEvent): void => {
    if (e.pointerId === this.stickId) {
      let dx = e.clientX - this.stickCX;
      let dy = e.clientY - this.stickCY;
      const len = Math.hypot(dx, dy);
      if (len > this.STICK_R) {
        dx = (dx / len) * this.STICK_R;
        dy = (dy / len) * this.STICK_R;
      }
      this.stickX = dx / this.STICK_R;
      this.stickY = -dy / this.STICK_R;
      this.knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
      return;
    }
    const p = this.lookPointers.get(e.pointerId);
    if (p) {
      this.lookDX += e.clientX - p.x;
      this.lookDY += e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
    }
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId === this.stickId) {
      this.stickId = null;
      this.stickX = 0;
      this.stickY = 0;
      this.stickEl.style.display = 'none';
    }
    this.lookPointers.delete(e.pointerId);
  };

  /** 每幀呼叫一次，整合鍵盤與搖桿 */
  update(): void {
    const k = this.keys;
    let x = this.stickX;
    let y = this.stickY;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.moveX = x;
    this.moveY = y;
    this.sprint = k.has('ShiftLeft') || k.has('ShiftRight');
  }

  /** 取出並清空這一幀累積的視角拖曳量（像素） */
  consumeLook(): { dx: number; dy: number } {
    const r = { dx: this.lookDX, dy: this.lookDY };
    this.lookDX = 0;
    this.lookDY = 0;
    return r;
  }

  consumeJump(): boolean {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j;
  }
}
