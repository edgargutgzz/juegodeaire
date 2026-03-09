import Phaser from "phaser";

interface Cloud {
  gfx: Phaser.GameObjects.Graphics;
  speed: number;
  width: number;
  baseY: number;
}

export class StartScene extends Phaser.Scene {
  private clouds: Cloud[] = [];
  private skySmog!: Phaser.GameObjects.Graphics;

  constructor() {
    super("StartScene");
  }

  preload() {}

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // ── Cielo limpio ───────────────────────────────────────────────
    const skyClean = this.add.graphics().setDepth(0);
    this.drawSky(skyClean, W, H, false);

    // ── Cielo contaminado (alpha animado) ──────────────────────────
    this.skySmog = this.add.graphics().setDepth(0);
    this.drawSky(this.skySmog, W, H, true);
    this.skySmog.setAlpha(0);
    this.tweens.add({
      targets: this.skySmog,
      alpha: 1,
      duration: 15000,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });

    // ── Nubes individuales al fondo (capa lejana) ──────────────────
    this.spawnCloud(W, H,  160, H * 0.18, 0.55, 0.15, 1, 0xd8eaf8);
    this.spawnCloud(W, H,  520, H * 0.12, 0.45, 0.12, 1, 0xd8eaf8);
    this.spawnCloud(W, H,  870, H * 0.20, 0.50, 0.13, 1, 0xd8eaf8);
    this.spawnCloud(W, H, 1150, H * 0.15, 0.40, 0.11, 1, 0xd8eaf8);

    // ── Nubes medias ───────────────────────────────────────────────
    this.spawnCloud(W, H,   80, H * 0.35, 0.80, 0.25, 2, 0xe8f4ff);
    this.spawnCloud(W, H,  450, H * 0.30, 0.70, 0.22, 2, 0xe8f4ff);
    this.spawnCloud(W, H,  800, H * 0.38, 0.75, 0.20, 2, 0xe8f4ff);
    this.spawnCloud(W, H, 1100, H * 0.32, 0.65, 0.18, 2, 0xe8f4ff);

    // ── Banco denso de nubes (primer plano) ────────────────────────
    this.createCloudBank(W, H);

    // ── Montañas ──────────────────────────────────────────────────
    this.drawMountains(W, H);


    // ── Título ────────────────────────────────────────────────────
    this.add
      .text(W / 2, H * 0.32, "NO SE VEN LAS\nMONTAÑAS", {
        fontSize: "48px",
        fontFamily: "'Press Start 2P'",
        color: "#c87820",
        stroke: "#7a4a00",
        strokeThickness: 6,
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(20);

    // ── Subtítulo ─────────────────────────────────────────────────
    this.add
      .text(W / 2, H * 0.50, "La contaminación se acerca,\n¿puedes escapar a tiempo?", {
        fontSize: "13px",
        fontFamily: "'Press Start 2P'",
        color: "#ffffff",
        stroke: "#3a6090",
        strokeThickness: 4,
        align: "center",
        lineSpacing: 8,
      })
      .setOrigin(0.5)
      .setDepth(20);

    // ── Prompt parpadeante ────────────────────────────────────────
    const prompt = this.add
      .text(W / 2, H * 0.82, "PRESIONA PARA INICIAR", {
        fontSize: "13px",
        fontFamily: "'Press Start 2P'",
        color: "#ffffff",
        stroke: "#3a6090",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.tweens.add({ targets: prompt, alpha: 0.2, duration: 700, yoyo: true, repeat: -1 });
  }

  private drawSky(gfx: Phaser.GameObjects.Graphics, W: number, H: number, smog: boolean) {
    const steps = 30;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      let r: number, g: number, b: number;
      if (smog) {
        r = Math.round(180 + t * 30);
        g = Math.round(155 + t * 20);
        b = Math.round(80 - t * 20);
      } else {
        r = Math.round(110 + t * 60);
        g = Math.round(175 + t * 40);
        b = Math.round(230 + t * 10);
      }
      gfx.fillStyle((r << 16) | (g << 8) | b, 1);
      gfx.fillRect(0, (i / steps) * H, W, H / steps + 1);
    }
  }

  private spawnCloud(
    W: number, H: number,
    x: number, y: number,
    scale: number, speed: number,
    depth: number, color: number
  ) {
    const gfx = this.add.graphics().setDepth(depth);
    this.drawCloud(gfx, 0, 0, scale, color);
    gfx.setPosition(x, y);
    this.clouds.push({ gfx, speed, width: 380 * scale, baseY: y });
  }

  private createCloudBank(W: number, H: number) {
    // Capa trasera del banco (azul suave)
    const back = this.add.graphics().setDepth(3);
    const positions = [
      { x: -60,  y: H * 0.62, s: 1.4 },
      { x: 200,  y: H * 0.58, s: 1.6 },
      { x: 480,  y: H * 0.65, s: 1.3 },
      { x: 700,  y: H * 0.60, s: 1.5 },
      { x: 940,  y: H * 0.63, s: 1.4 },
      { x: 1150, y: H * 0.59, s: 1.2 },
    ];
    positions.forEach(p => this.drawCloud(back, p.x, p.y, p.s, 0xc8dff0));

    // Capa frontal del banco (blanco)
    const front = this.add.graphics().setDepth(4);
    const front_pos = [
      { x: -40,  y: H * 0.70, s: 1.8 },
      { x: 280,  y: H * 0.72, s: 2.0 },
      { x: 580,  y: H * 0.68, s: 1.9 },
      { x: 860,  y: H * 0.73, s: 1.7 },
      { x: 1120, y: H * 0.70, s: 1.6 },
    ];
    front_pos.forEach(p => this.drawCloud(front, p.x, p.y, p.s, 0xffffff));

    // Animación lenta del banco completo
    this.tweens.add({
      targets: [back, front],
      x: "-=12",
      duration: 8000,
      ease: "Sine.easeInOut",
      yoyo: true,
      repeat: -1,
    });
  }

  private drawCloud(gfx: Phaser.GameObjects.Graphics, cx: number, cy: number, s: number, color: number) {
    // Sombra azulada debajo
    const shadow = Phaser.Display.Color.ValueToColor(color);
    const shadowColor = Phaser.Display.Color.GetColor(
      Math.max(0, shadow.red - 30),
      Math.max(0, shadow.green - 20),
      Math.min(255, shadow.blue + 10)
    );
    gfx.fillStyle(shadowColor, 0.7);
    gfx.fillEllipse(cx,           cy + 14 * s, 200 * s, 85 * s);
    gfx.fillEllipse(cx - 75 * s,  cy + 22 * s, 145 * s, 70 * s);
    gfx.fillEllipse(cx + 75 * s,  cy + 22 * s, 145 * s, 70 * s);
    gfx.fillEllipse(cx - 35 * s,  cy - 18 * s, 125 * s, 75 * s);
    gfx.fillEllipse(cx + 35 * s,  cy - 15 * s, 115 * s, 70 * s);

    // Cuerpo blanco principal
    gfx.fillStyle(color, 1);
    gfx.fillEllipse(cx,           cy,           195 * s, 88 * s);
    gfx.fillEllipse(cx - 70 * s,  cy + 12 * s,  138 * s, 68 * s);
    gfx.fillEllipse(cx + 70 * s,  cy + 12 * s,  138 * s, 68 * s);
    gfx.fillEllipse(cx - 32 * s,  cy - 32 * s,  118 * s, 74 * s);
    gfx.fillEllipse(cx + 32 * s,  cy - 29 * s,  108 * s, 70 * s);
    gfx.fillEllipse(cx - 52 * s,  cy - 14 * s,   92 * s, 62 * s);
    gfx.fillEllipse(cx + 52 * s,  cy - 11 * s,   88 * s, 60 * s);
    gfx.fillEllipse(cx,           cy + 6 * s,   165 * s, 68 * s);
    gfx.fillEllipse(cx - 20 * s,  cy - 48 * s,   72 * s, 52 * s);
    gfx.fillEllipse(cx + 18 * s,  cy - 44 * s,   68 * s, 50 * s);
  }

  private drawMountains(W: number, H: number) {
    // ── Montañas lejanas (más claras) ─────────────────────────────
    const far = this.add.graphics().setDepth(4.5);
    far.fillStyle(0x4a5a6a, 1);
    far.fillTriangle(0,    H, 200, H * 0.55, 400,  H);
    far.fillTriangle(250,  H, 480, H * 0.48, 700,  H);
    far.fillTriangle(550,  H, 750, H * 0.52, 950,  H);
    far.fillTriangle(800,  H, 980, H * 0.46, 1150, H);
    far.fillTriangle(1050, H, 1200, H * 0.53, 1380, H);

    // ── Montañas frontales (más oscuras) ──────────────────────────
    const front = this.add.graphics().setDepth(5);
    front.fillStyle(0x1e2a32, 1);
    front.fillTriangle(-50,  H, 180,  H * 0.62, 420,  H);
    front.fillTriangle(300,  H, 560,  H * 0.55, 800,  H);
    front.fillTriangle(650,  H, 860,  H * 0.58, 1080, H);
    front.fillTriangle(950,  H, 1150, H * 0.60, 1380, H);

    // Nieve en los picos lejanos
    const snow = this.add.graphics().setDepth(4.6);
    snow.fillStyle(0xeef4f8, 0.85);
    [[200, H * 0.55], [480, H * 0.48], [750, H * 0.52], [980, H * 0.46], [1200, H * 0.53]].forEach(([px, py]) => {
      snow.fillTriangle(px - 28, py + 38, px, py, px + 28, py + 38);
    });
  }

  update(_time: number, delta: number) {
    const W = this.scale.width;
    for (const cloud of this.clouds) {
      cloud.gfx.x -= cloud.speed * (delta / 16);
      if (cloud.gfx.x < -cloud.width) {
        cloud.gfx.x = W + cloud.width / 2;
        cloud.gfx.y = cloud.baseY + (Math.random() - 0.5) * 30;
      }
    }
  }

  protected startGame() {
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.start("GameScene");
    });
  }
}
