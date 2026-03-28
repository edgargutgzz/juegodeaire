import Phaser from "phaser";

// topPad centra verticalmente el bloque de contenido dentro de la card.
// NORMAL tiene menos líneas que DIFICIL, así que necesita más padding superior.
const OPTIONS = [
  {
    key: "normal",
    label: "NORMAL",
    group: "POBLACION GENERAL",
    barLabel: "MENOR RIESGO A LA CONTAMINACION",
    desc: "",
    multiplier: 0.5,
    accentColor: 0x2ecc87,
    accentHex: "#2ecc87",
    bgSelected: 0x0e1a16,
    bars: 3,
  },
  {
    key: "dificil",
    label: "DIFICIL",
    group: "POBLACION SENSIBLE",
    barLabel: "MAYOR RIESGO A LA CONTAMINACION",
    desc: "• Ninos menores de 12\n• Adultos mayores\n• Mujeres embarazadas\n• Condiciones cardiovasculares\n  o respiratorias",
    multiplier: 0.85,
    accentColor: 0xff5533,
    accentHex: "#ff5533",
    bgSelected: 0x1a0e0b,
    bars: 9,
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
      this.add.text(cardX, baseY + 110, opt.barLabel, {
        fontSize: "11px", fontFamily: "'Press Start 2P'",
        color: "#ffffff",
        wordWrap: { width: cardW * 0.92 }, align: "center", lineSpacing: 6,
        fixedWidth: cardW,
      }).setOrigin(0, 0);

      const SEG = 10;
      const skullSize = 28;
      const skullGap  = 8;
      const totalSkullW = SEG * skullSize + (SEG - 1) * skullGap;
      const skullStartX = Math.round(cx - totalSkullW / 2);
      const barY = baseY + 152;

      for (let b = 0; b < SEG; b++) {
        const filled = b < opt.bars;
        const sx = skullStartX + b * (skullSize + skullGap);
        this.add.text(sx + skullSize / 2, barY + skullSize / 2, "🤧", {
          fontSize: `${skullSize}px`, fontFamily: "serif",
          color: filled ? opt.accentHex : "#333333",
          align: "center",
        }).setOrigin(0.5, 0.5).setAlpha(filled ? 1 : 0.3);
      }

      if (opt.key === "dificil") {
        const tags = ["NINOS MENORES DE 12", "ADULTOS MAYORES", "MUJERES EMBARAZADAS", "COND. CARDIOVASCULAR\nO RESPIRATORIA"];
        const tagW = cardW * 0.42;
        const tagH = 48;
        const tagGapX = cardW * 0.06;
        const tagGapY = 14;
        const startY = barY + skullSize + 90;
        const col0X = cardX + cardW * 0.04;
        const col1X = col0X + tagW + tagGapX;

        tags.forEach((label, idx) => {
          const tx = idx % 2 === 0 ? col0X : col1X;
          const ty = startY + Math.floor(idx / 2) * (tagH + tagGapY);

          const g = this.add.graphics();
          g.fillStyle(0xff5533, 0.12);
          g.fillRect(tx, ty, tagW, tagH);
          g.lineStyle(1, 0xff5533, 0.8);
          g.strokeRect(tx, ty, tagW, tagH);

          this.add.text(tx + tagW / 2, ty + tagH / 2, label, {
            fontSize: "9px", fontFamily: "'Press Start 2P'",
            color: "#ffffff", align: "center", lineSpacing: 6,
          }).setOrigin(0.5, 0.5);
        });
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

    const left  = this.pad.left;
    const right = this.pad.right;
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
