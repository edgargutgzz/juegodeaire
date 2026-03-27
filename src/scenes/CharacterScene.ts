import Phaser from "phaser";

const CHARACTERS = {
  normal: [
    { key: "malePerson",   label: "JUGADOR 1" },
    { key: "femalePerson", label: "JUGADOR 2" },
  ],
  dificil: [
    { key: "maleAdventurer",   label: "JUGADOR 1" },
    { key: "femaleAdventurer", label: "JUGADOR 2" },
  ],
} as const;

export class CharacterScene extends Phaser.Scene {
  private selected = 0;
  private confirmed = false;
  private inputEnabled = false;
  private inputCooldown = 0;
  private pad: Phaser.Input.Gamepad.Gamepad | null = null;
  private selectionGraphics!: Phaser.GameObjects.Graphics;
  private options: { key: string; label: string }[] = [];

  constructor() { super("CharacterScene"); }

  preload() {
    const all = [...CHARACTERS.normal, ...CHARACTERS.dificil];
    all.forEach(c => {
      this.load.image(`idle_${c.key}`, `/assets/character/character_${c.key}_idle.png`);
    });
    if (!this.cache.audio.exists("sfx_select"))
      this.load.audio("sfx_select", "/assets/sfx/vgmenuselect.ogg");
  }

  create() {
    this.selected = 0;
    this.confirmed = false;
    this.inputEnabled = false;
    this.inputCooldown = 0;

    const W = this.scale.width;
    const H = this.scale.height;

    const difficulty = this.registry.get("difficulty") as "normal" | "dificil" ?? "normal";
    this.options = [...CHARACTERS[difficulty]];

    const isHard = difficulty === "dificil";
    const accentColor = isHard ? 0xff6644 : 0x44cc88;
    const accentHex   = isHard ? "#ff6644" : "#44cc88";
    const groupLabel  = isHard ? "POBLACION SENSIBLE" : "POBLACION GENERAL";

    // ── Background ────────────────────────────────────────────────
    const bgFill = this.add.graphics();
    bgFill.fillStyle(0x080c10, 1);
    bgFill.fillRect(0, 0, W, H);

    // ── Panel ─────────────────────────────────────────────────────
    const pX = W * 0.06;
    const pY = H * 0.05;
    const pW = W * 0.88;
    const pH = H * 0.90;

    const panel = this.add.graphics();
    panel.fillStyle(0x000000, 0.4);
    panel.fillRect(pX + 5, pY + 5, pW, pH);
    panel.fillGradientStyle(0x0c1018, 0x0c1018, 0x101820, 0x101820, 0.97);
    panel.fillRect(pX, pY, pW, pH);
    panel.lineStyle(2, 0x1e6070, 0.9);
    panel.strokeRect(pX, pY, pW, pH);
    panel.lineStyle(1, 0x0f3040, 0.5);
    panel.strokeRect(pX + 6, pY + 6, pW - 12, pH - 12);

    // ── Título ────────────────────────────────────────────────────
    this.add.text(W / 2, pY + 32, "ELIGE TU PERSONAJE", {
      fontSize: "22px", fontFamily: "'Press Start 2P'",
      color: "#ffffff", stroke: "#020608", strokeThickness: 8,
    }).setOrigin(0.5, 0);

    this.add.text(W / 2, pY + 70, groupLabel, {
      fontSize: "10px", fontFamily: "'Press Start 2P'",
      color: accentHex,
    }).setOrigin(0.5, 0);

    const sep = this.add.graphics();
    sep.lineStyle(1, 0x1e4a58, 0.7);
    sep.lineBetween(pX + 14, pY + 94, pX + pW - 14, pY + 94);

    // ── Cards de personaje ────────────────────────────────────────
    const cardY = pY + 120;
    const cardH = pH - 148;
    const gap   = W * 0.06;
    const cardW = (pW - gap * 3) / 2;

    this.selectionGraphics = this.add.graphics();

    this.options.forEach((opt, i) => {
      const cardX = pX + gap + i * (cardW + gap);

      // Fondo card
      const card = this.add.graphics();
      card.fillStyle(0x0a1520, 0.95);
      card.fillRect(cardX, cardY, cardW, cardH);

      // Sprite idle centrado
      const sprite = this.add.image(cardX + cardW / 2, cardY + cardH * 0.45, `idle_${opt.key}`)
        .setOrigin(0.5)
        .setScale(2.2);

      // Nombre
      this.add.text(cardX + cardW / 2, cardY + cardH - 36, opt.label, {
        fontSize: "13px", fontFamily: "'Press Start 2P'",
        color: "#ffffff",
      }).setOrigin(0.5, 0);
    });

    // ── Input ─────────────────────────────────────────────────────
    this.time.delayedCall(300, () => {
      this.inputEnabled = true;
      this.input.keyboard!.on("keydown", (e: KeyboardEvent) => {
        if (!this.inputEnabled || this.confirmed) return;
        if (e.code === "ArrowLeft" || e.code === "ArrowUp") {
          this.selected = 0; this.sound.play("sfx_select", { volume: 1.0 }); this.updateUI();
        } else if (e.code === "ArrowRight" || e.code === "ArrowDown") {
          this.selected = 1; this.sound.play("sfx_select", { volume: 1.0 }); this.updateUI();
        } else if (e.code === "Enter" || e.code === "Space") {
          this.confirm();
        }
      });
      this.input.gamepad!.on("connected", (pad: Phaser.Input.Gamepad.Gamepad) => { this.pad = pad; });
      if (this.input.gamepad!.total > 0) this.pad = this.input.gamepad!.getPad(0);
    });

    this.cameras.main.fadeIn(300, 0, 0, 0);
    this.updateUI();
  }

  update(_t: number, delta: number) {
    if (this.confirmed || !this.inputEnabled) return;
    this.inputCooldown -= delta;
    if (this.inputCooldown > 0 || !this.pad) return;

    const left  = (this.pad.leftStick.x < -0.5) || this.pad.left  || (this.pad.leftStick.y < -0.5) || this.pad.up;
    const right = (this.pad.leftStick.x > 0.5)  || this.pad.right || (this.pad.leftStick.y > 0.5)  || this.pad.down;
    const btn   = this.pad.buttons[0]?.pressed || this.pad.buttons[1]?.pressed;

    if (btn) { this.confirm(); return; }
    if (left)  { this.selected = 0; this.inputCooldown = 200; this.sound.play("sfx_select", { volume: 1.0 }); this.updateUI(); }
    else if (right) { this.selected = 1; this.inputCooldown = 200; this.sound.play("sfx_select", { volume: 1.0 }); this.updateUI(); }
  }

  private updateUI() {
    const W = this.scale.width;
    const H = this.scale.height;
    const pX = W * 0.06;
    const pY = H * 0.05;
    const pW = W * 0.88;
    const pH = H * 0.90;
    const cardY = pY + 120;
    const cardH = pH - 148;
    const gap   = W * 0.06;
    const cardW = (pW - gap * 3) / 2;

    const difficulty = this.registry.get("difficulty") as string;
    const isHard = difficulty === "dificil";
    const accentColor = isHard ? 0xff6644 : 0x44cc88;

    this.selectionGraphics.clear();
    this.options.forEach((_, i) => {
      const cardX = pX + gap + i * (cardW + gap);
      const isSelected = i === this.selected;
      this.selectionGraphics.lineStyle(isSelected ? 3 : 1, accentColor, isSelected ? 0.9 : 0.2);
      this.selectionGraphics.strokeRect(cardX, cardY, cardW, cardH);
      if (isSelected) {
        this.selectionGraphics.fillStyle(accentColor, 0.06);
        this.selectionGraphics.fillRect(cardX, cardY, cardW, cardH);
      }
    });
  }

  private confirm() {
    if (this.confirmed) return;
    this.confirmed = true;
    this.sound.play("sfx_select", { volume: 1.0 });
    this.registry.set("character", this.options[this.selected].key);
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("GameScene"));
  }
}
