import Phaser from "phaser";

const BG_COLOR   = 0x000000;
const TEXT_COLOR = "#ffffff";
const FONT       = "'Press Start 2P'";
const FONT_SIZE  = "20px";
const LINE_H     = 52;
const GAP_H      = 32;
const CHAR_DELAY = 50;
const LINE_PAUSE = 220;
const FLASH_DELAY = 8000;

const LINES: { text: string; gap?: boolean }[] = [
  { text: "AREA METROPOLITANA DE MONTERREY (AMM)" },
  { text: "", gap: true },
  { text: "POBLACION:  5,341,171 PERSONAS" },
  { text: "AREA:       6,679 KM2" },
  { text: "", gap: true },
  { text: "RODEADA POR LA SIERRA MADRE, EL AMM ES CONOCIDA COMO" },
  { text: "LA CIUDAD DE LAS MONTAÑAS." },
  { text: "", gap: true },
  { text: "PERO HAY DIAS EN QUE LAS MISMAS DESAPARECEN" },
  { text: "POR COMPLETO." },
  { text: "", gap: true },
  { text: "EL AIRE AQUI SUPERA 4 VECES LA RECOMENDACION" },
  { text: "SALUDABLE DE PARTICULAS RESPIRABLES PM2.5" },
  { text: "DE LA ORGANIZACION MUNDIAL DE LA SALUD." },
  { text: "", gap: true },
  { text: "", gap: true },
  { text: "ESTO SE TRADUCE EN 3,000 MUERTES PREMATURAS CADA AÑO." },
  { text: "", gap: true },
  { text: "", gap: true },
  { text: "SOLO EN ENERO Y FEBRERO DE 2026:" },
  { text: "EL 60% DE LOS DIAS SE HAN REGISTRADO CON" },
  { text: "MALA CALIDAD DEL AIRE." },
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
    const cursor = this.add.rectangle(startX, paddingTop, 18, 24, 0xff8833, 1)
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
      const grad = textObj.context.createLinearGradient(0, 0, 0, textObj.height || 24);
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(1, "#ff8833");
      textObj.setFill(grad);
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
      // Fade to black, then show centered closing line
      this.time.delayedCall(1200, () => {
        this.cameras.main.fadeOut(800, 0, 0, 0);
        this.cameras.main.once("camerafadeoutcomplete", () => {
          // Destroy all scrolling text
          lineObjects.forEach(o => o.destroy());
          cursor.destroy();

          const closing = this.add.text(W / 2, H / 2, "CUANDO EL SMOG ES TAN DENSO...", {
            fontSize: FONT_SIZE, fontFamily: FONT,
            color: TEXT_COLOR, align: "center",
          }).setOrigin(0.5).setAlpha(0).setDepth(10);
          const closingGrad = closing.context.createLinearGradient(0, 0, 0, closing.height);
          closingGrad.addColorStop(0, "#ffffff");
          closingGrad.addColorStop(1, "#ff8833");
          closing.setFill(closingGrad);

          this.time.delayedCall(1000, () => {
            this.cameras.main.fadeIn(600, 0, 0, 0);
            this.tweens.add({
              targets: closing, alpha: 1,
              duration: 600, ease: "Sine.easeIn",
            });
          });

          this.time.delayedCall(1000, () => this.advance());
        });
      });
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
    this.sound.stopAll();
    this.scene.start("StartScene");
  }
}
