import Phaser from "phaser";

const FONT   = "'Press Start 2P'";
const W      = 1280;
const H      = 720;

const OPTIONS = [
  { label: "REINICIAR NIVEL", key: "level" },
  { label: "IR AL INICIO",    key: "start" },
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
    this.add.rectangle(W / 2, H / 2, W, H, 0x0a0a0a);

    // Smog overlay
    const smog = this.add.rectangle(W / 2, H / 2, W, H, 0xcc5500).setAlpha(0.08);
    this.tweens.add({ targets: smog, alpha: 0.18, duration: 3000, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    // ── Title ─────────────────────────────────────────────────────
    const title = this.add.text(W / 2, H * 0.26, "SE TE ACABÓ EL AIRE", {
      fontSize: "38px", fontFamily: FONT,
      color: "#ff3322",
      stroke: "#000000", strokeThickness: 6,
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({ targets: title, alpha: 1, duration: 600, ease: "Quad.Out" });

    // ── Subtitle ──────────────────────────────────────────────────
    const sub = this.add.text(W / 2, H * 0.39, "la contaminación te alcanzó.", {
      fontSize: "16px", fontFamily: FONT,
      color: "#888888",
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({ targets: sub, alpha: 1, duration: 600, delay: 300, ease: "Quad.Out" });

    // ── Options ───────────────────────────────────────────────────
    const baseY = H * 0.57;
    const gap   = 70;

    OPTIONS.forEach((opt, i) => {
      const t = this.add.text(W / 2, baseY + i * gap, opt.label, {
        fontSize: "22px", fontFamily: FONT,
        color: "#ffffff",
      }).setOrigin(0.5).setAlpha(0);
      this.optionTexts.push(t);
      this.tweens.add({ targets: t, alpha: 1, duration: 400, delay: 500 + i * 120 });
    });

    // Cursor arrow (left of options)
    this.time.delayedCall(700, () => {
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
    if (this.sound.get("sfx_select")) this.sound.play("sfx_select", { volume: 1.0 });
    this.inputCooldown = 200;
    this.updateUI();
  }

  private updateUI() {
    this.optionTexts.forEach((t, i) => {
      if (i === this.selected) {
        t.setColor("#ffdd00").setText("> " + OPTIONS[i].label);
      } else {
        t.setColor("#555555").setText("  " + OPTIONS[i].label);
      }
    });
  }

  private confirm() {
    if (this.confirmed) return;
    this.confirmed = true;
    if (this.sound.get("sfx_select")) this.sound.play("sfx_select", { volume: 1.0 });
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      if (OPTIONS[this.selected].key === "level") {
        this.scene.start(this.from);
      } else {
        this.scene.start("StartScene");
      }
    });
  }
}
