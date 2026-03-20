import Phaser from "phaser";

const SIDEWALK_Y  = 560;  // superficie donde camina el jugador
const ROAD_Y      = 660;  // superficie de la calle
const LEVEL_WIDTH = 6400;

// Alturas de proyectiles relativas a la banqueta
const PROJ_LOW  = SIDEWALK_Y - 28;   // al ras del suelo → hay que saltar
const PROJ_MID  = SIDEWALK_Y - 90;   // al pecho → saltar o esquivar
const PROJ_HIGH = SIDEWALK_Y - 155;  // a la cabeza → quedarse en el suelo

export class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private projectiles!: Phaser.Physics.Arcade.Group;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private pad: Phaser.Input.Gamepad.Gamepad | null = null;
  private invincible  = false;
  private isCrouching = false;
  private levelComplete = false;
  private goalX = 0;
  private health = 10;
  private healthBar!: Phaser.GameObjects.Graphics;
  private difficultyMultiplier = 1;

  constructor() {
    super("GameScene");
  }

  preload() {
    const character = this.registry.get("character") || "maleAdventurer";
    this.load.image("char_idle", `/assets/character/character_${character}_idle.png`);
    this.load.image("char_jump", `/assets/character/character_${character}_jump.png`);
    this.load.image("char_fall", `/assets/character/character_${character}_fall.png`);
    this.load.image("char_duck", `/assets/character/character_${character}_duck.png`);
    for (let i = 0; i < 8; i++) {
      this.load.image(`char_walk${i}`, `/assets/character/character_${character}_walk${i}.png`);
    }

    const allVehicles = [
      "sedan","sedan-blue","taxi","police","sports-red","sports-green","convertible",
      "suv","suv-closed","van","van-large",
      "truck","bus","firetruck",
    ];
    for (const v of allVehicles) {
      this.load.image(`car_${v}`, `/assets/cars/${v}.png`);
    }
  }

  create() {
    this.levelComplete = false;
    this.invincible    = false;
    this.isCrouching   = false;
    this.health        = 10;
    this.difficultyMultiplier = this.registry.get("difficulty") === "hard" ? 2 : 1;

    // Mundo extendido hacia arriba para el drop-in
    this.physics.world.setBounds(0, -800, LEVEL_WIDTH, 1520);

    this.buildWorld();

    // ── Proyectiles ────────────────────────────────────────────────
    this.projectiles = this.physics.add.group();

    // ── Meta ───────────────────────────────────────────────────────
    this.goalX = LEVEL_WIDTH - 160;
    this.createGoal(this.goalX);

    // ── Player — empieza arriba y cae ─────────────────────────────
    this.player = this.physics.add.sprite(120, -600, "char_idle");
    this.player.setCollideWorldBounds(true);
    this.player.setScale(0.85);
    this.player.setDepth(5);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(64, 88, false);
    body.setOffset(16, 20);

    this.anims.create({
      key: "walk",
      frames: Array.from({ length: 8 }, (_, i) => ({ key: `char_walk${i}` })),
      frameRate: 12,
      repeat: -1,
    });

    this.physics.add.collider(this.player, this.platforms);

    // Colisión jugador ↔ proyectiles
    this.physics.add.overlap(this.player, this.projectiles, (_p, proj) => {
      (proj as Phaser.Physics.Arcade.Image).destroy();
      this.onHit();
    });

    // ── Spawner de contaminación desde la derecha ──────────────────
    this.startPollutionSpawner();

    // ── Cámara ─────────────────────────────────────────────────────
    this.cameras.main.setBounds(0, -800, LEVEL_WIDTH, 1520);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // ── Drop-in intro: jugador invisible hasta aterrizar ───────────
    this.player.setVisible(false);
    this.levelComplete = true;
    const checkLanding = this.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => {
        if (this.player.body!.blocked.down) {
          checkLanding.remove();
          this.player.setVisible(true);
          this.time.delayedCall(200, () => { this.levelComplete = false; });
        }
      },
    });

    // ── HUD ────────────────────────────────────────────────────────
    this.add.text(20, 20, "AIRE", {
      fontSize: "10px", fontFamily: "'Press Start 2P'", color: "#ffffff",
    }).setScrollFactor(0).setDepth(10);
    this.healthBar = this.add.graphics().setScrollFactor(0).setDepth(10);
    this.drawHealthBar();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.input.gamepad!.once("connected", (pad: Phaser.Input.Gamepad.Gamepad) => {
      this.pad = pad;
    });
  }

  update() {
    if (this.levelComplete) return;

    const onGround   = this.player.body!.blocked.down;
    const leftStickX = this.pad?.leftStick.x ?? 0;
    const buttonA    = this.pad?.isButtonDown(0) ?? false;
    const dpadLeft   = this.pad?.left  ?? false;
    const dpadRight  = this.pad?.right ?? false;

    const goLeft  = this.cursors.left.isDown  || leftStickX < -0.3 || dpadLeft;
    const goRight = this.cursors.right.isDown || leftStickX >  0.3 || dpadRight;
    const crouch  = this.cursors.down.isDown  || (this.pad?.down ?? false);
    const jump    = Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
                    Phaser.Input.Keyboard.JustDown(this.cursors.space!) ||
                    buttonA;

    // Agacharse
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (crouch && onGround && !this.isCrouching) {
      this.isCrouching = true;
      body.setSize(64, 44, false);
      body.setOffset(16, 64);
      this.player.anims.stop();
      this.player.setTexture("char_duck");
    } else if (!crouch && this.isCrouching) {
      this.isCrouching = false;
      body.setSize(64, 88, false);
      body.setOffset(16, 20);
    }

    if (goLeft)       { this.player.setVelocityX(-220); this.player.setFlipX(true);  }
    else if (goRight) { this.player.setVelocityX( 220); this.player.setFlipX(false); }
    else              { this.player.setVelocityX(0); }

    if (jump && onGround && !this.isCrouching) this.player.setVelocityY(-520);

    if (this.player.x >= this.goalX) this.onLevelComplete();

    // Destruir proyectiles fuera de pantalla o por encima del mundo de juego
    for (const proj of this.projectiles.getChildren()) {
      const p = proj as Phaser.Physics.Arcade.Image;
      if (p.x < -100 || p.x > LEVEL_WIDTH + 100 || p.y < -800) p.destroy();
    }

    // Animación
    if (!onGround) {
      const goingUp = (this.player.body!.velocity.y ?? 0) < 0;
      this.player.anims.stop();
      this.player.setTexture(goingUp ? "char_jump" : "char_fall");
    } else if (this.isCrouching) {
      this.player.anims.stop();
      this.player.setTexture("char_duck");
    } else if (goLeft || goRight) {
      if (!this.player.anims.isPlaying) this.player.play("walk");
    } else {
      this.player.anims.stop();
      this.player.setTexture("char_idle");
    }
  }

  // ── Mundo ────────────────────────────────────────────────────────

  private buildWorld() {
    // Cielo nocturno
    this.add.rectangle(LEVEL_WIDTH / 2, -400, LEVEL_WIDTH, 2000, 0x07091a).setDepth(-3);

    this.drawCityBackground();

    // Calle (fondo)
    this.add.rectangle(LEVEL_WIDTH / 2, (ROAD_Y + 720) / 2, LEVEL_WIDTH, 720 - ROAD_Y + 60, 0x2e2e2e).setDepth(0);
    const roadG = this.add.graphics().setDepth(0.5);
    roadG.fillStyle(0xffffff, 0.4);
    for (let x = 0; x < LEVEL_WIDTH; x += 112) roadG.fillRect(x, ROAD_Y + 14, 56, 4);

    // Banqueta
    this.add.rectangle(LEVEL_WIDTH / 2, SIDEWALK_Y + 40, LEVEL_WIDTH, 80, 0xc4bba8).setDepth(1);
    this.add.rectangle(LEVEL_WIDTH / 2, SIDEWALK_Y + 2,  LEVEL_WIDTH, 4,  0xd8d0bc).setDepth(1.1);
    this.add.rectangle(LEVEL_WIDTH / 2, SIDEWALK_Y + 72, LEVEL_WIDTH, 8,  0x7a7060).setDepth(1.1);

    // Losetas
    const sg = this.add.graphics().setDepth(1.2);
    sg.lineStyle(1, 0xa09888, 0.5);
    for (let x = 88; x < LEVEL_WIDTH; x += 88) {
      sg.beginPath(); sg.moveTo(x, SIDEWALK_Y + 6); sg.lineTo(x, SIDEWALK_Y + 68); sg.strokePath();
    }

    // Física banqueta
    const canvas = document.createElement("canvas");
    canvas.width = 64; canvas.height = 16;
    canvas.getContext("2d")!.fillRect(0, 0, 64, 16);
    this.textures.addCanvas("sidewalk", canvas);
    this.platforms = this.physics.add.staticGroup();
    for (let x = 0; x < LEVEL_WIDTH; x += 64) {
      this.platforms.create(x + 32, SIDEWALK_Y + 64, "sidewalk").setAlpha(0);
    }
  }

  private drawCityBackground() {
    // ── Estrellas ──────────────────────────────────────────────────
    const stars = this.add.graphics().setDepth(-2.9);
    const starPositions = [
      [80,  -680], [210, -720], [400, -650], [560, -700], [730, -660],
      [920, -710], [1100,-680], [1280,-640], [1450,-700], [1600,-720],
      [1750,-660], [1900,-690], [2050,-710], [2200,-650], [2380,-680],
      [2500,-720], [2650,-670], [2820,-700], [2980,-650], [3140,-710],
      [3300,-680], [3460,-720], [3620,-660], [3780,-690], [3940,-650],
      [4100,-710], [4260,-680], [4420,-720], [4580,-660], [4740,-700],
      [4900,-650], [5060,-710], [5220,-680], [5380,-720], [5540,-660],
      [5700,-690], [5860,-650], [6020,-710], [6180,-680], [6340,-720],
      // Estrellas más pequeñas/tenues
      [150, -600], [350, -580], [500, -610], [700, -590], [850, -620],
      [1050,-580], [1200,-600], [1400,-610], [1550,-580], [1700,-600],
      [1850,-620], [2000,-590], [2150,-610], [2300,-580], [2450,-620],
    ];
    for (const [sx, sy] of starPositions) {
      const size   = ((sx * 7 + sy * 3) % 3) === 0 ? 2.5 : 1.5;
      const bright = ((sx + sy) % 5) === 0;
      stars.fillStyle(bright ? 0xffffff : 0xaabbcc, bright ? 0.9 : 0.55);
      stars.fillCircle(sx, sy, size);
    }

    // ── Montañas lejanas (estilo Cerro de la Silla) ────────────────
    // Perfil inspirado en el skyline de Monterrey:
    // Cerro de la Silla (doble pico / silla), Sierra Madre al fondo
    const mtnFar = this.add.graphics().setDepth(-2.7);
    mtnFar.fillStyle(0x0d1a2e, 1);
    this.drawMountainRange(mtnFar, [
      // Perfil del Cerro de la Silla — se repite a lo largo del nivel
      { x: 0,    y: 0    },
      { x: 180,  y: -260 },  // pico izq de la silla
      { x: 310,  y: -190 },  // silla (depresión)
      { x: 460,  y: -310 },  // pico der de la silla (más alto)
      { x: 620,  y: -140 },
      { x: 800,  y: -200 },  // otro cerro
      { x: 960,  y: -80  },
    ], 960);

    // Montañas más cercanas (un poco más claras)
    const mtnNear = this.add.graphics().setDepth(-2.5);
    mtnNear.fillStyle(0x111f35, 1);
    this.drawMountainRange(mtnNear, [
      { x: 0,    y: 0    },
      { x: 120,  y: -160 },
      { x: 280,  y: -100 },
      { x: 440,  y: -220 },
      { x: 560,  y: -150 },
      { x: 700,  y: -180 },
      { x: 840,  y: -90  },
      { x: 960,  y: 0    },
    ], 960);

    // ── Edificios (noche: colores más oscuros, ventanas iluminadas) ──
    const pattern: { ox: number; w: number; h: number; c: number }[] = [
      { ox:   0, w: 180, h: 440, c: 0x0e1e38 },
      { ox: 190, w:  90, h: 280, c: 0x0e2818 },
      { ox: 290, w: 220, h: 380, c: 0x0c1a30 },
      { ox: 520, w: 140, h: 500, c: 0x091424 },
      { ox: 670, w: 100, h: 220, c: 0x0e2018 },
      { ox: 780, w: 170, h: 320, c: 0x0c1a2e },
    ];
    const tiles = Math.ceil(LEVEL_WIDTH / 960) + 1;

    const g = this.add.graphics().setDepth(-2);
    for (let t = 0; t < tiles; t++) {
      for (const b of pattern) {
        const bx = t * 960 + b.ox;
        const by = SIDEWALK_Y - b.h;

        g.fillStyle(b.c, 1);
        g.fillRect(bx, by, b.w, b.h);

        // Highlight lateral izquierdo
        g.fillStyle(0xffffff, 0.04);
        g.fillRect(bx, by, 3, b.h);

        // Ventanas — mayoría apagadas, algunas encendidas (noche)
        for (let wy = by + 20; wy < SIDEWALK_Y - 12; wy += 26) {
          for (let wx = bx + 10; wx < bx + b.w - 10; wx += 20) {
            const hash = (wx * 13 + wy * 7) % 100;
            if (hash < 35) {
              // Ventana encendida — amarillo/naranja cálido
              g.fillStyle(hash < 15 ? 0xffdd88 : 0xffaa44, 0.85);
              g.fillRect(wx, wy, 10, 14);
            } else if (hash < 50) {
              // Ventana apagada visible
              g.fillStyle(0x1a2a44, 0.5);
              g.fillRect(wx, wy, 10, 14);
            }
          }
        }
      }
    }
  }

  private drawMountainRange(
    g: Phaser.GameObjects.Graphics,
    profile: { x: number; y: number }[],
    tileW: number,
  ) {
    const baseY = SIDEWALK_Y - 20;
    const tiles = Math.ceil(LEVEL_WIDTH / tileW) + 1;

    for (let t = 0; t < tiles; t++) {
      const offsetX = t * tileW;
      g.beginPath();
      g.moveTo(offsetX, baseY);
      for (const p of profile) {
        g.lineTo(offsetX + p.x, baseY + p.y);
      }
      g.lineTo(offsetX + tileW, baseY);
      g.closePath();
      g.fillPath();
    }
  }

  // Patrones de oleadas: cada entrada es [altura, delay_ms_desde_inicio_de_oleada]
  private readonly WAVES: [number, number][][] = [
    [[PROJ_LOW,  0]],
    [[PROJ_MID,  0]],
    [[PROJ_HIGH, 0]],
    [[PROJ_LOW,  0], [PROJ_LOW,  300]],
    [[PROJ_MID,  0], [PROJ_HIGH, 300]],
    [[PROJ_LOW,  0], [PROJ_MID,  250], [PROJ_LOW, 500]],
    [[PROJ_HIGH, 0], [PROJ_LOW,  200]],
    [[PROJ_MID,  0], [PROJ_MID,  200], [PROJ_MID, 400]],
  ];
  private waveIndex = 0;

  private startPollutionSpawner() {
    this.waveIndex = 0;
    // Esperar a que el jugador aterrice antes de empezar
    this.time.delayedCall(2500, () => {
      this.time.addEvent({
        delay: 2200,
        loop: true,
        callback: () => {
          if (this.levelComplete) return;
          const wave = this.WAVES[this.waveIndex % this.WAVES.length];
          this.waveIndex++;
          for (const [y, delay] of wave) {
            this.time.delayedCall(delay, () => {
              if (this.levelComplete) return;
              this.fireProjectile(y);
            });
          }
        },
      });
    });
  }

  private fireProjectile(targetY: number) {
    const spawnX = this.cameras.main.scrollX + 1380;

    // Tamaño y color según altura
    const isLow  = targetY === PROJ_LOW;
    const isHigh = targetY === PROJ_HIGH;
    const radius = isLow ? 18 : isHigh ? 12 : 15;
    const color  = isLow ? 0xcc3300 : isHigh ? 0x88b840 : 0xc8a040;
    const speed  = isLow ? -260 : isHigh ? -320 : -290;

    const key = `proj_${Date.now()}_${Math.random()}`;
    const gfx = this.make.graphics({ x: 0, y: 0 });
    gfx.fillStyle(Phaser.Display.Color.ValueToColor(color).darken(35).color, 1);
    gfx.fillCircle(radius, radius, radius);
    gfx.fillStyle(color, 1);
    gfx.fillCircle(radius, radius, radius * 0.62);
    gfx.fillStyle(0xffffff, 0.3);
    gfx.fillCircle(radius * 0.6, radius * 0.5, radius * 0.25);
    gfx.generateTexture(key, radius * 2, radius * 2);
    gfx.destroy();

    const proj = this.projectiles.create(spawnX, targetY, key) as Phaser.Physics.Arcade.Image;
    proj.setDepth(4);
    (proj.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    proj.setVelocity(speed, 0);

    this.tweens.add({ targets: proj, angle: -360, duration: 900, repeat: -1 });

    proj.on("destroy", () => {
      if (this.textures.exists(key)) this.textures.remove(key);
    });
  }

  private createGoal(x: number) {
    const goalCenterY = SIDEWALK_Y - 60;
    const glow = this.add.rectangle(x + 40, goalCenterY, 80, 120, 0x44ff88, 0.35).setDepth(3);
    this.add.rectangle(x + 40, goalCenterY, 6, 120, 0x22cc66).setDepth(3);
    this.tweens.add({ targets: glow, alpha: 0.1, duration: 800, yoyo: true, repeat: -1 });
    this.add.text(x + 40, SIDEWALK_Y - 140, "META", {
      fontSize: "20px", fontFamily: "'Press Start 2P'", color: "#22cc66",
    }).setOrigin(0.5).setDepth(3);
  }

  private onLevelComplete() {
    if (this.levelComplete) return;
    this.levelComplete = true;
    this.player.setVelocity(0, 0);
    this.cameras.main.fadeOut(800, 255, 255, 255);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.start("LevelCompleteScene");
    });
  }

  private onHit() {
    if (this.invincible || this.levelComplete) return;
    this.invincible = true;
    this.health = Math.max(0, this.health - this.difficultyMultiplier);
    this.drawHealthBar();
    this.player.setTint(0xff4444);
    this.cameras.main.shake(200, 0.005);

    if (this.health <= 0) {
      this.levelComplete = true;
      this.cameras.main.fadeOut(800, 0, 0, 0);
      this.cameras.main.once("camerafadeoutcomplete", () => {
        this.scene.start("GameOverScene");
      });
      return;
    }

    this.time.delayedCall(800, () => {
      this.player.clearTint();
      this.invincible = false;
    });
  }

  private drawHealthBar() {
    const segments = 10;
    const segH     = 16;
    const segGap   = 1;
    const innerW   = 22;
    const railW    = 7;
    const totalW   = innerW + railW * 2;
    const totalH   = segments * segH + (segments - 1) * segGap;
    const barX     = 20;
    const barTop   = 38;

    this.healthBar.clear();

    // ── Tapa superior ─────────────────────────────────────────────
    this.healthBar.fillStyle(0x222222, 1);
    this.healthBar.fillRect(barX, barTop - 10, totalW, 10);
    this.healthBar.fillStyle(0x666666, 1);
    this.healthBar.fillRect(barX + 2, barTop - 10, totalW - 4, 3);

    // ── Fondo del área de segmentos ────────────────────────────────
    this.healthBar.fillStyle(0x110000, 1);
    this.healthBar.fillRect(barX + railW, barTop, innerW, totalH);

    // ── Segmentos (de abajo hacia arriba) ─────────────────────────
    for (let i = 0; i < segments; i++) {
      const segY   = barTop + totalH - (i + 1) * segH - i * segGap;
      const filled = i < this.health;

      if (filled) {
        // Mitad inferior: rojo
        this.healthBar.fillStyle(0xcc2200, 1);
        this.healthBar.fillRect(barX + railW, segY + segH / 2, innerW, segH / 2);
        // Mitad superior: naranja
        this.healthBar.fillStyle(0xff7722, 1);
        this.healthBar.fillRect(barX + railW, segY, innerW, segH / 2);
        // Brillo
        this.healthBar.fillStyle(0xffcc66, 0.35);
        this.healthBar.fillRect(barX + railW, segY, innerW, 2);
      } else {
        this.healthBar.fillStyle(0x1e0000, 1);
        this.healthBar.fillRect(barX + railW, segY, innerW, segH);
      }

      // Línea divisoria entre segmentos
      this.healthBar.fillStyle(0x000000, 1);
      this.healthBar.fillRect(barX + railW, segY + segH - 1, innerW, 1);
    }

    // ── Riel izquierdo ─────────────────────────────────────────────
    this.healthBar.fillStyle(0x888888, 1);
    this.healthBar.fillRect(barX, barTop, railW, totalH);
    this.healthBar.fillStyle(0xdddddd, 1);
    this.healthBar.fillRect(barX, barTop, 2, totalH);
    this.healthBar.fillStyle(0x444444, 1);
    this.healthBar.fillRect(barX + railW - 2, barTop, 2, totalH);
    // Remaches
    this.healthBar.fillStyle(0xaaaaaa, 1);
    for (let y = barTop + 6; y < barTop + totalH - 4; y += 24) {
      this.healthBar.fillRect(barX + 1, y, railW - 2, 4);
    }

    // ── Riel derecho ──────────────────────────────────────────────
    const rx = barX + railW + innerW;
    this.healthBar.fillStyle(0x888888, 1);
    this.healthBar.fillRect(rx, barTop, railW, totalH);
    this.healthBar.fillStyle(0xdddddd, 1);
    this.healthBar.fillRect(rx, barTop, 2, totalH);
    this.healthBar.fillStyle(0x444444, 1);
    this.healthBar.fillRect(rx + railW - 2, barTop, 2, totalH);
    for (let y = barTop + 6; y < barTop + totalH - 4; y += 24) {
      this.healthBar.fillRect(rx + 1, y, railW - 2, 4);
    }

    // ── Tapa inferior ─────────────────────────────────────────────
    this.healthBar.fillStyle(0x222222, 1);
    this.healthBar.fillRect(barX, barTop + totalH, totalW, 8);
    this.healthBar.fillStyle(0x555555, 1);
    this.healthBar.fillRect(barX + 2, barTop + totalH, totalW - 4, 3);

    // ── Gema azul ─────────────────────────────────────────────────
    const gemX = barX + totalW / 2;
    const gemY = barTop + totalH + 18;
    this.healthBar.fillStyle(0x111133, 1);
    this.healthBar.fillCircle(gemX, gemY, 11);
    this.healthBar.fillStyle(0x2255cc, 1);
    this.healthBar.fillCircle(gemX, gemY, 9);
    this.healthBar.fillStyle(0x88aaff, 0.7);
    this.healthBar.fillCircle(gemX - 3, gemY - 3, 4);
    this.healthBar.fillStyle(0xffffff, 0.5);
    this.healthBar.fillCircle(gemX - 3, gemY - 4, 2);
  }
}
