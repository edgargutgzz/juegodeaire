import Phaser from "phaser";

const FONT   = "'Press Start 2P'";
const W      = 1280;
const H      = 720;

const OPTIONS = [
  { label: "OTRA VEZ",  key: "level" },
  { label: "RENDIRSE",  key: "start" },
] as const;

export class GameOverScene extends Phaser.Scene {
  private selected    = 0;
  private confirmed   = false;
  private inputEnabled = false;
  private inputCooldown = 0;
  private pad: Phaser.Input.Gamepad.Gamepad | null = null;
  private optionTexts: Phaser.GameObjects.Text[] = [];
  private from = "GameScene";

  constructor() { super("GameOverScene"); }

  init(data: { from?: string }) {
    this.from         = data?.from ?? "GameScene";
    this.selected     = 0;
    this.confirmed    = false;
    this.inputEnabled = false;
    this.inputCooldown = 0;
    this.optionTexts  = [];
    this.pad          = null;
  }

  create() {
    // ── Background ────────────────────────────────────────────────
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000);

    // ── Options ───────────────────────────────────────────────────
    const baseY = H * 0.45;
    const gap   = 70;

    OPTIONS.forEach((opt, i) => {
      const t = this.add.text(W / 2, baseY + i * gap, opt.label, {
        fontSize: "22px", fontFamily: FONT,
        color: "#ffffff",
      }).setOrigin(0.5).setAlpha(0);
      // Intro-style white→orange gradient
      const grad = t.context.createLinearGradient(0, 0, 0, t.height || 24);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(1, "#ff8833");
      t.setFill(grad);
      this.optionTexts.push(t);
      this.tweens.add({ targets: t, alpha: 1, duration: 400, delay: 300 + i * 120 });
    });

    // Cursor arrow (left of options)
    this.time.delayedCall(500, () => {
      this.updateUI();
    });

    // ── Input ─────────────────────────────────────────────────────
    this.time.delayedCall(800, () => {
      this.inputEnabled = true;
      this.input.keyboard!.on("keydown", (e: KeyboardEvent) => {
        if (!this.inputEnabled || this.confirmed) return;
        if (e.code === "ArrowUp")   { this.move(-1); }
        else if (e.code === "ArrowDown")  { this.move(1); }
        else if (e.code === "Enter" || e.code === "Space") { this.confirm(); }
      });
      this.input.gamepad!.on("connected", (pad: Phaser.Input.Gamepad.Gamepad) => { this.pad = pad; });
      if (this.input.gamepad!.total > 0) this.pad = this.input.gamepad!.getPad(0);
    });

    this.cameras.main.fadeIn(500, 0, 0, 0);
  }

  update(_t: number, delta: number) {
    if (this.confirmed || !this.inputEnabled || !this.pad) return;
    this.inputCooldown -= delta;
    if (this.inputCooldown > 0) return;

    const up   = this.pad.up   || (this.pad.leftStick.y < -0.5);
    const down = this.pad.down || (this.pad.leftStick.y >  0.5);
    const btn  = this.pad.buttons[0]?.pressed || this.pad.buttons[1]?.pressed;

    if (btn)  { this.confirm(); return; }
    if (up)   { this.move(-1); this.inputCooldown = 200; }
    else if (down) { this.move(1);  this.inputCooldown = 200; }
  }

  private move(dir: number) {
    this.selected = Phaser.Math.Wrap(this.selected + dir, 0, OPTIONS.length);
    if (this.cache.audio.exists("sfx_select")) this.sound.play("sfx_select", { volume: 1.0 });
    this.inputCooldown = 200;
    this.updateUI();
  }

  private updateUI() {
    this.optionTexts.forEach((t, i) => {
      const label = OPTIONS[i].label;
      if (i === this.selected) {
        t.setText("> " + label).setAlpha(1);
        const grad = t.context.createLinearGradient(0, 0, 0, t.height || 24);
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(1, "#ff8833");
        t.setFill(grad);
      } else {
        t.setText("  " + label).setAlpha(0.35);
        const grad = t.context.createLinearGradient(0, 0, 0, t.height || 24);
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(1, "#ff8833");
        t.setFill(grad);
      }
    });
  }

  private confirm() {
    if (this.confirmed) return;
    this.confirmed = true;
    if (this.cache.audio.exists("sfx_select")) this.sound.play("sfx_select", { volume: 1.0 });
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.sound.stopAll();
      if (OPTIONS[this.selected].key === "level") {
        this.scene.start(this.from);
      } else {
        this.scene.start("BootScene");
      }
    });
  }
}
