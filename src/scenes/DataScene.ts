import Phaser from "phaser";

const BG_COLOR   = 0x000000;
const TEXT_COLOR = "#66ffdd";
const FONT       = "'Press Start 2P'";
const FONT_SIZE  = "20px";
const LINE_H     = 52;
const GAP_H      = 32;
const CHAR_DELAY = 50;
const LINE_PAUSE = 220;
const FLASH_DELAY = 8000;

const LINES: { text: string; gap?: boolean }[] = [
  { text: "AREA METROPOLITANA DE MONTERREY" },
  { text: "", gap: true },
  { text: "POBLACION:  5,341,171 HABITANTES" },
  { text: "AREA:       6,679 KM2" },
  { text: "", gap: true },
  { text: "", gap: true },
  { text: "RODEADA POR LA SIERRA MADRE, EL AMM ES CONOCIDA COMO" },
  { text: "LA CIUDAD DE LAS MONTANAS." },
  { text: "", gap: true },
  { text: "", gap: true },
  { text: "PERO HAY DIAS EN QUE LAS MISMAS DESAPARECEN" },
  { text: "POR COMPLETO." },
  { text: "", gap: true },
  { text: "", gap: true },
  { text: "EL AIRE AQUI SUPERA 4 VECES LA RECOMENDACION" },
  { text: "SALUDABLE DE PARTICULAS RESPIRABLES PM2.5 DE LA OMS." },
  { text: "", gap: true },
  { text: "", gap: true },
  { text: "ESTO CUESTA CADA ANO CERCA DE 3,000 VIDAS PERDIDAS." },
  { text: "", gap: true },
  { text: "", gap: true },
  { text: "SOLO EN ENERO Y FEBRERO DE 2026," },
  { text: "SE HAN REGISTRADO 36 DIAS CON MALA CALIDAD DEL AIRE." },
  { text: "", gap: true },
  { text: "", gap: true },
  { text: "", gap: true },
  { text: "CUANDO EL SMOG ES TAN DENSO..." },
];

export class DataScene extends Phaser.Scene {
  private inputEnabled = false;
  private pad: Phaser.Input.Gamepad.Gamepad | null = null;

  constructor() { super("DataScene"); }

  preload() {}

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    this.add.rectangle(0, 0, W, H, BG_COLOR).setOrigin(0);

    // ── Sonido ────────────────────────────────────────────────────
    this.time.delayedCall(3000, () => this.sound.play("sfx_alarm", { volume: 0.7 }));

    // ── Layout ────────────────────────────────────────────────────
    const startX    = W * 0.08;
    const paddingTop    = H * 0.08;
    const bottomLimit   = H - H * 0.18;

    let currentY = paddingTop;
    const lineObjects: Phaser.GameObjects.Text[] = [];

    // Shift all existing lines up by one LINE_H (instant)
    const shiftUp = (amount: number) => {
      for (let i = lineObjects.length - 1; i >= 0; i--) {
        lineObjects[i].y -= amount;
        if (lineObjects[i].y < -LINE_H) {
          lineObjects[i].destroy();
          lineObjects.splice(i, 1);
        }
      }
      currentY -= amount;
    };

    // ── Cursor parpadeante ────────────────────────────────────────
    const cursor = this.add.rectangle(startX, paddingTop, 18, 24, 0x66ffdd, 1)
      .setOrigin(0, 0).setVisible(false).setDepth(5);
    this.tweens.add({
      targets: cursor, alpha: 0,
      duration: 400, ease: "Stepped",
      yoyo: true, repeat: -1,
    });

    // ── Typewriter ────────────────────────────────────────────────
    const typeSound = this.sound.add("sfx_typewriter", { loop: true, volume: 0.4 });

    const typeEntry = (index: number) => {
      if (index >= LINES.length) {
        typeSound.stop();
        cursor.setVisible(false);
        showPrompt();
        return;
      }

      const line = LINES[index];

      if (line.gap) {
        // gap: shift up if needed, advance Y, move to next line
        if (currentY + GAP_H > bottomLimit) shiftUp(GAP_H);
        else currentY += GAP_H;
        this.time.delayedCall(LINE_PAUSE, () => typeEntry(index + 1));
        return;
      }

      // Shift up if the new line would overflow the bottom
      if (currentY + LINE_H > bottomLimit) {
        shiftUp(LINE_H);
      }

      const posY = currentY;
      currentY += LINE_H;

      const textObj = this.add.text(startX, posY, "", {
        fontSize: FONT_SIZE, fontFamily: FONT,
        color: TEXT_COLOR,
      }).setOrigin(0, 0).setDepth(4);
      lineObjects.push(textObj);

      cursor.setPosition(startX, posY + 4).setVisible(true);
      if (!typeSound.isPlaying) typeSound.play();

      const text = line.text;
      let charIndex = 0;
      const typeChar = () => {
        if (charIndex >= text.length) {
          typeSound.stop();
          this.time.delayedCall(LINE_PAUSE, () => typeEntry(index + 1));
          return;
        }
        textObj.setText(text.slice(0, charIndex + 1));
        cursor.setPosition(startX + textObj.width + 4, posY + 4);
        charIndex++;
        this.time.delayedCall(CHAR_DELAY, typeChar);
      };

      typeChar();
    };

    this.time.delayedCall(FLASH_DELAY, () => typeEntry(0));

    // ── Prompt final ──────────────────────────────────────────────
    const showPrompt = () => {
      this.time.delayedCall(4500, () => this.advance());
    };
  }

  update() {
    if (!this.inputEnabled || !this.pad) return;
    if (this.pad.buttons[0]?.pressed || this.pad.buttons[1]?.pressed) {
      this.inputEnabled = false;
      this.advance();
    }
  }

  private advance() {
    const alarm = this.sound.get("sfx_alarm");
    if (alarm) {
      this.tweens.add({ targets: alarm, volume: 0, duration: 800, onComplete: () => {
        alarm.stop();
        this.scene.start("StartScene");
      }});
    } else {
      this.scene.start("StartScene");
    }
  }
}
