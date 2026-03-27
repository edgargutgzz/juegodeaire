import Phaser from "phaser";

// topPad centra verticalmente el bloque de contenido dentro de la card.
// NORMAL tiene menos líneas que DIFICIL, así que necesita más padding superior.
const OPTIONS = [
  {
    key: "normal",
    label: "NORMAL",
    group: "POBLACION GENERAL",
    desc: "",
    multiplier: 0.5,
    accentColor: 0x2ecc87,
    accentHex: "#2ecc87",
    bgSelected: 0x0e1a16,
    bars: 9,
  },
  {
    key: "dificil",
    label: "DIFICIL",
    group: "POBLACION SENSIBLE",
    desc: "• Ninos menores de 12\n• Adultos mayores\n• Mujeres embarazadas\n• Condiciones cardiovasculares\n  o respiratorias",
    multiplier: 2.0,
    accentColor: 0xff5533,
    accentHex: "#ff5533",
    bgSelected: 0x1a0e0b,
    bars: 3,
  },
] as const;

export class DifficultyScene extends Phaser.Scene {
  private selected = 0;
  private confirmed = false;
  private inputEnabled = false;
  private inputCooldown = 0;
  private pad: Phaser.Input.Gamepad.Gamepad | null = null;
  private cardBgs: Phaser.GameObjects.Rectangle[] = [];
  private cardBorders: Phaser.GameObjects.Graphics[] = [];
  private flashTween: Phaser.Tweens.Tween | null = null;

  constructor() { super("DifficultyScene"); }

  preload() {
    this.load.audio("sfx_select", "/assets/sfx/vgmenuselect.ogg");
  }

  create() {
    this.selected = 0;
    this.confirmed = false;
    this.inputEnabled = false;
    this.inputCooldown = 0;
    this.cardBgs = [];
    this.cardBorders = [];

    if (!this.sound.get("venus")?.isPlaying) {
      this.sound.play("venus", { loop: true, volume: 0.6 });
    }

    const W = this.scale.width;
    const H = this.scale.height;

    // ── Background ────────────────────────────────────────────────
    this.add.rectangle(0, 0, W, H, 0x000000).setOrigin(0);

    // ── Título ────────────────────────────────────────────────────
    const titleText = this.add.text(W / 2, H * 0.055, "NIVEL DE DIFICULTAD", {
      fontSize: "22px", fontFamily: "'Press Start 2P'",
      color: "#ffffff",
    }).setOrigin(0.5, 0);
    const titleGrad = titleText.context.createLinearGradient(0, 0, 0, titleText.height);
    titleGrad.addColorStop(0, "#ffffff");
    titleGrad.addColorStop(1, "#ff8833");
    titleText.setFill(titleGrad);

    // ── Cards ─────────────────────────────────────────────────────
    const cardY  = H * 0.15;
    const cardH  = H * 0.72;
    const gap    = W * 0.04;
    const margin = W * 0.06;
    const cardW  = (W - margin * 2 - gap) / 2;
    const cardX0 = margin;

    OPTIONS.forEach((opt, i) => {
      const cardX = cardX0 + i * (cardW + gap);

      // Sombra
      const shadow = this.add.graphics();
      shadow.fillStyle(0x000000, 0.07);
      shadow.fillRect(cardX + 5, cardY + 5, cardW, cardH);

      // Fondo card
      const bg = this.add.rectangle(cardX, cardY, cardW, cardH, 0x111111).setOrigin(0);
      this.cardBgs.push(bg);

      // Barra de color superior
      this.add.rectangle(cardX, cardY, cardW, 5, opt.accentColor).setOrigin(0);

      // Borde (se actualiza en updateUI)
      const border = this.add.graphics();
      this.cardBorders.push(border);

      // ── Contenido ───────────────────────────────────────────────
      const cx    = Math.round(cardX + cardW / 2);
      const baseY = Math.round(cardY + 40);

      // Label de dificultad
      this.add.text(cardX + 8, baseY, opt.label, {
        fontSize: "28px", fontFamily: "'Press Start 2P'",
        color: opt.accentHex,
        fixedWidth: cardW - 8, align: "center",
      }).setOrigin(0, 0);

      // Subtítulo de grupo
      this.add.text(cardX, baseY + 62, opt.group, {
        fontSize: "9px", fontFamily: "'Press Start 2P'",
        color: "#ffffff",
        fixedWidth: cardW, align: "center",
      }).setOrigin(0, 0);

      // Separador
      const sep = this.add.graphics();
      sep.lineStyle(1, 0x222222, 1);
      sep.lineBetween(cardX + 32, baseY + 90, cardX + cardW - 32, baseY + 90);

      // ── Barra de resistencia estilo Mega Man ───────────────────
      this.add.text(cardX, baseY + 130, "RESISTENCIA A LA CONTAMINACION", {
        fontSize: "9px", fontFamily: "'Press Start 2P'",
        color: "#ffffff",
        fixedWidth: cardW, align: "center",
      }).setOrigin(0, 0);

      const SEG = 10;
      const SW   = 36;
      const SH   = 18;
      const SGAP = 4;
      const totalBarW = SEG * SW + (SEG - 1) * SGAP;
      const barStartX = Math.round(cx - totalBarW / 2);
      const barY = baseY + 152;

      const barGfx = this.add.graphics();
      for (let b = 0; b < SEG; b++) {
        const filled = b < opt.bars;
        barGfx.fillStyle(0x222222, 1);
        barGfx.fillRect(barStartX + b * (SW + SGAP), barY, SW, SH);
        if (filled) {
          barGfx.fillStyle(opt.accentColor, 1);
          barGfx.fillRect(barStartX + b * (SW + SGAP), barY, SW, SH);
          barGfx.fillStyle(0xffffff, 0.35);
          barGfx.fillRect(barStartX + b * (SW + SGAP) + 2, barY + 2, SW - 4, 5);
        }
        barGfx.lineStyle(1, 0x333333, 1);
        barGfx.strokeRect(barStartX + b * (SW + SGAP), barY, SW, SH);
      }

      if (opt.desc) {
        this.add.text(cardX, barY + SH + 80, opt.desc, {
          fontSize: "11px", fontFamily: "'Press Start 2P'",
          color: "#ffffff", lineSpacing: 14,
          fixedWidth: cardW, align: "center",
        }).setOrigin(0, 0);
      }
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
    const cardY  = H * 0.15;
    const cardH  = H * 0.72;
    const gap    = W * 0.04;
    const margin = W * 0.06;
    const cardW  = (W - margin * 2 - gap) / 2;
    const cardX0 = margin;

    if (this.flashTween) { this.flashTween.stop(); this.flashTween = null; }

    this.cardBgs.forEach((bg, i) => {
      bg.setFillStyle(i === this.selected ? OPTIONS[i].bgSelected : 0x111111);
    });

    this.cardBorders.forEach((g, i) => {
      g.clear();
      const opt = OPTIONS[i];
      const cardX = cardX0 + i * (cardW + gap);
      const isSelected = i === this.selected;
      g.lineStyle(isSelected ? 3 : 1, isSelected ? opt.accentColor : 0x333333, 1);
      g.strokeRect(cardX, cardY, cardW, cardH);
    });

    const selBorder = this.cardBorders[this.selected];
    this.flashTween = this.tweens.add({
      targets: selBorder, alpha: 0.4,
      duration: 500, ease: "Sine.easeInOut",
      yoyo: true, repeat: -1,
    });
  }

  private confirm() {
    if (this.confirmed) return;
    this.confirmed = true;
    this.sound.play("sfx_select", { volume: 1.0 });
    const opt = OPTIONS[this.selected];
    this.registry.set("difficulty", opt.key);
    this.registry.set("difficultyMultiplier", opt.multiplier);
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("CharacterScene"));
  }
}
