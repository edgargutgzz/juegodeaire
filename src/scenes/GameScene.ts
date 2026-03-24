import Phaser from "phaser";

const SIDEWALK_Y  = 660;
const GROUND_Y    = SIDEWALK_Y - 70; // visual top of grass tile = 610
const LEVEL_WIDTH = 6400;

const PROJ_LOW  = GROUND_Y - 28;
const PROJ_MID  = GROUND_Y - 90;
const PROJ_HIGH = GROUND_Y - 155;



export class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private projectiles!: Phaser.Physics.Arcade.Group;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private pad: Phaser.Input.Gamepad.Gamepad | null = null;

  private invincible      = false;
  private isCrouching     = false;
  private levelComplete   = false;

  private jumpsAvailable  = 1;

  private goalX           = 0;
  private health          = 10;
  private difficultyMultiplier = 1;

  private healthBar!:     Phaser.GameObjects.Graphics;
  private smogOverlay!:   Phaser.GameObjects.Rectangle;
  private vignetteRect!:  Phaser.GameObjects.Rectangle;

  private waveIndex       = 0;
  private wasOnGround     = false;

  private blinkTween:     Phaser.Tweens.Tween | null = null;
  private bgTile!:        Phaser.GameObjects.TileSprite;

  constructor() { super("GameScene"); }

  preload() {
    const character = this.registry.get("character") || "maleAdventurer";
    this.load.image("char_idle", `/assets/character/character_${character}_idle.png`);
    this.load.image("char_jump", `/assets/character/character_${character}_jump.png`);
    this.load.image("char_fall", `/assets/character/character_${character}_fall.png`);
    this.load.image("char_duck", `/assets/character/character_${character}_duck.png`);
    for (let i = 0; i < 8; i++) {
      this.load.image(`char_walk${i}`, `/assets/character/character_${character}_walk${i}.png`);
    }

    this.load.image("bg_talltrees",   "/assets/bg/bg_talltrees.png");
    this.load.image("ground_top",     "/assets/ground/ground_top.png");
    this.load.image("ground_fill",    "/assets/ground/ground_fill.png");
    this.load.image("asphalt_top",    "/assets/ground/asphalt_top.png");
    this.load.image("asphalt_fill",   "/assets/ground/asphalt_fill.png");
    this.load.image("ptcl_spark1", "/assets/particles/spark_01.png");
    this.load.image("ptcl_spark2", "/assets/particles/spark_02.png");
    this.load.image("ptcl_spark3", "/assets/particles/spark_03.png");
    for (let i = 0; i <= 8; i++)
      this.load.image(`expl_${i}`, `/assets/particles/explosion/explosion0${i}.png`);
    this.load.audio("sfx_jump",       "/assets/sfx/SoundJump1.wav");
    this.load.audio("sfx_hit",        "/assets/sfx/SoundPlayerHit.wav");
    this.load.audio("sfx_explode",    "/assets/sfx/SoundExplosionSmall.wav");
    this.load.audio("sfx_goal",       "/assets/sfx/SoundReachGoal.wav");
    this.load.audio("sfx_gameover",   "/assets/sfx/SoundGameOver.wav");
    this.load.audio("sfx_death",      "/assets/sfx/SoundDeath.wav");
  }

  create() {
    this.levelComplete        = false;
    this.invincible           = false;
    this.isCrouching          = false;
    this.health               = 10;
    this.jumpsAvailable       = 1;
    this.waveIndex            = 0;
    this.wasOnGround          = false;
    this.blinkTween           = null;
    this.difficultyMultiplier = this.registry.get("difficulty") === "hard" ? 2 : 1;

    this.physics.world.setBounds(0, -800, LEVEL_WIDTH, 1520);

    this.buildWorld();
    this.projectiles = this.physics.add.group();
    this.goalX = LEVEL_WIDTH - 160;
    this.createGoal(this.goalX);

    // ── Player ────────────────────────────────────────────────────
    this.player = this.physics.add.sprite(120, GROUND_Y - 300, "char_idle");
    this.player.setCollideWorldBounds(true);
    this.player.setScale(0.85);
    this.player.setDepth(5);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(64, 88, false);
    body.setOffset(16, 40);

    if (!this.anims.exists("walk")) {
      this.anims.create({
        key: "walk",
        frames: Array.from({ length: 8 }, (_, i) => ({ key: `char_walk${i}` })),
        frameRate: 12, repeat: -1,
      });
    }

    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.overlap(this.player, this.projectiles, (_p, proj) => {
      const p = proj as Phaser.Physics.Arcade.Image;
      const damage = p.getData("damage") as number ?? 1;
      this.spawnParticles(p.x, p.y, p.tintTopLeft || 0xff6600);
      this.sfx("sfx_explode", 0.5);
      p.destroy();
      this.onHit(damage);
    });


    this.startPollutionSpawner();

    // ── Camera ────────────────────────────────────────────────────
    this.cameras.main.setBounds(0, -800, LEVEL_WIDTH, 1520);
    this.cameras.main.startFollow(this.player, true, 0.15, 0);
    this.cameras.main.scrollY = 0;
    this.cameras.main.fadeIn(500, 212, 234, 247);

    // ── Drop-in ───────────────────────────────────────────────────
    this.player.setVisible(false);
    this.levelComplete = true;
    const checkLanding = this.time.addEvent({
      delay: 100, loop: true,
      callback: () => {
        if (this.player.body!.blocked.down) {
          checkLanding.remove();
          this.player.setVisible(true);
          this.time.delayedCall(200, () => { this.levelComplete = false; });
        }
      },
    });

    // ── HUD ───────────────────────────────────────────────────────
    this.add.text(20, 20, "AIRE", {
      fontSize: "10px", fontFamily: "'Press Start 2P'", color: "#ffffff",
    }).setScrollFactor(0).setDepth(10);

    this.healthBar = this.add.graphics().setScrollFactor(0).setDepth(10);
    this.drawHealthBar();


    // ── Smog overlay (thickens as health drops) ───────────────────
    this.smogOverlay = this.add.rectangle(
      this.scale.width / 2, this.scale.height / 2,
      this.scale.width, this.scale.height,
      0x4466aa, 0,
    ).setScrollFactor(0).setDepth(9);

    // ── Hit vignette ──────────────────────────────────────────────
    this.vignetteRect = this.add.rectangle(
      this.scale.width / 2, this.scale.height / 2,
      this.scale.width, this.scale.height,
      0xff0000, 0,
    ).setScrollFactor(0).setDepth(11);

    // ── Input ─────────────────────────────────────────────────────
    this.cursors  = this.input.keyboard!.createCursorKeys();
    this.input.gamepad!.once("connected", (pad: Phaser.Input.Gamepad.Gamepad) => {
      this.pad = pad;
    });
    if (this.input.gamepad!.total > 0) this.pad = this.input.gamepad!.getPad(0);
  }

  update() {
    if (this.levelComplete) return;
    this.bgTile.tilePositionX = this.cameras.main.scrollX * 0.2;

    const onGround   = this.player.body!.blocked.down;
    if (onGround) {
      this.jumpsAvailable = 1;
    }
    this.wasOnGround = onGround;

    const leftStickX = this.pad?.leftStick.x ?? 0;
    const buttonA    = this.pad?.isButtonDown(0) ?? false;
    const dpadLeft   = this.pad?.left  ?? false;
    const dpadRight  = this.pad?.right ?? false;

    const goLeft  = this.cursors.left.isDown  || leftStickX < -0.3 || dpadLeft;
    const goRight = this.cursors.right.isDown || leftStickX >  0.3 || dpadRight;
    const crouch  = this.cursors.down.isDown  || (this.pad?.down ?? false);
    const jump    = Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
                    Phaser.Input.Keyboard.JustDown(this.cursors.space!) || buttonA;

    // ── Crouch ────────────────────────────────────────────────────
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (crouch && onGround && !this.isCrouching) {
      this.isCrouching = true;
      body.setSize(64, 44, false);
      body.setOffset(16, 84);
      this.player.anims.stop();
      this.player.setTexture("char_duck");
    } else if (!crouch && this.isCrouching) {
      this.isCrouching = false;
      body.setSize(64, 88, false);
      body.setOffset(16, 40);
    }

    // ── Movement ──────────────────────────────────────────────────
    if (goLeft)       { this.player.setVelocityX(-220); this.player.setFlipX(true);  }
    else if (goRight) { this.player.setVelocityX( 220); this.player.setFlipX(false); }
    else              { this.player.setVelocityX(0); }

    if (jump && this.jumpsAvailable > 0 && !this.isCrouching) {
      this.player.setVelocityY(-520);
      this.sfx("sfx_jump", 0.6);
      this.jumpsAvailable--;
    }

    if (this.player.x >= this.goalX) this.onLevelComplete();

    // ── Destroy off-screen projectiles ────────────────────────────
    for (const proj of this.projectiles.getChildren()) {
      const p = proj as Phaser.Physics.Arcade.Image;
      if (p.x < -100 || p.x > LEVEL_WIDTH + 100 || p.y < -800) p.destroy();
    }


    // ── Animation ─────────────────────────────────────────────────
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


  // ── Particles ────────────────────────────────────────────────────

  private spawnParticles(x: number, y: number, _color: number) {
    // Explosion animation — step through frames manually
    const frames = 9;
    const frameDuration = 55; // ms per frame
    let frame = 0;
    const img = this.add.image(x, y, "expl_0")
      .setDepth(7).setScale(0.7).setAlpha(0.92);
    const timer = this.time.addEvent({
      delay: frameDuration,
      repeat: frames - 1,
      callback: () => {
        frame++;
        if (frame < frames) {
          img.setTexture(`expl_${frame}`);
        } else {
          img.destroy();
          timer.remove();
        }
      },
    });

    // A few sparks flying out
    const sparkKeys = ["ptcl_spark1", "ptcl_spark2", "ptcl_spark3"];
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const speed = Phaser.Math.Between(50, 120);
      const spark = this.add.image(x, y, sparkKeys[i % sparkKeys.length])
        .setDepth(6)
        .setScale(Phaser.Math.FloatBetween(0.1, 0.25))
        .setTint(0xff6600)
        .setAngle(Phaser.Math.Between(0, 360));
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: 0, scale: 0,
        duration: Phaser.Math.Between(300, 500),
        ease: "Quad.Out",
        onComplete: () => spark.destroy(),
      });
    }
  }



  // ── Spawn rate ramps up with distance ────────────────────────────

  private get progressFactor() {
    return Math.min(this.player.x / LEVEL_WIDTH, 1);
  }

  private get spawnDelay() {
    return Phaser.Math.Linear(2200, 900, this.progressFactor);
  }

  private get projSpeedMult() {
    return Phaser.Math.Linear(1.0, 1.7, this.progressFactor);
  }

  // ── World ─────────────────────────────────────────────────────────

  private buildWorld() {
    this.drawCityBackground();

    // ── Ground visuals ────────────────────────────────────────────
    const TRANSITION_X = 3200; // grass → asphalt
    const grassW   = TRANSITION_X;
    const asphaltW = LEVEL_WIDTH - TRANSITION_X;

    // Solid base fills (block transparency)
    this.add.rectangle(TRANSITION_X / 2, SIDEWALK_Y + 100, grassW, 200, 0xc8904c).setDepth(0);
    this.add.rectangle(TRANSITION_X + asphaltW / 2, SIDEWALK_Y + 100, asphaltW, 200, 0x8a9fa0).setDepth(0);

    // Dirt fill — grass zone
    this.add.tileSprite(0, SIDEWALK_Y - 2, grassW, 202, "ground_fill")
      .setOrigin(0, 0).setDepth(1);
    // Asphalt fill — city zone
    this.add.tileSprite(TRANSITION_X, SIDEWALK_Y - 2, asphaltW, 202, "asphalt_fill")
      .setOrigin(0, 0).setDepth(1);

    // Grass top row
    this.add.tileSprite(0, SIDEWALK_Y, grassW, 70, "ground_top")
      .setOrigin(0, 1).setDepth(2);
    // Asphalt top row
    this.add.tileSprite(TRANSITION_X, SIDEWALK_Y, asphaltW, 70, "asphalt_top")
      .setOrigin(0, 1).setDepth(2);


    const canvas = document.createElement("canvas");
    canvas.width = 64; canvas.height = 16;
    canvas.getContext("2d")!.fillRect(0, 0, 64, 16);
    this.textures.addCanvas("sidewalk", canvas);
    this.platforms = this.physics.add.staticGroup();
    for (let x = 0; x < LEVEL_WIDTH; x += 64) {
      this.platforms.create(x + 32, GROUND_Y + 8, "sidewalk").setAlpha(0);
    }
  }


  private drawCityBackground() {
    const W = this.scale.width;
    const H = this.scale.height;
    // Below grass: top half green, bottom half brown
    const belowH = H - GROUND_Y;
    const greenH = belowH * 0.1;
    const brownH = belowH * 0.9;
    this.add.rectangle(W / 2, GROUND_Y + greenH / 2, W, greenH, 0x80be1f)
      .setScrollFactor(0).setDepth(-3);
    this.add.rectangle(W / 2, GROUND_Y + greenH + brownH / 2, W, brownH, 0xc8904c)
      .setScrollFactor(0).setDepth(-3);
    // Sky bg image
    this.bgTile = this.add.tileSprite(0, -100, W, H, "bg_talltrees")
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-2);
  }

  // ── Pollution spawner (speed ramps with distance) ─────────────────

  // [y, delay, isPM25?]
  private readonly WAVES: [number, number, boolean?][][] = [
    [[PROJ_LOW,  0]],
    [[PROJ_MID,  0]],
    [[PROJ_HIGH, 0]],
    [[PROJ_LOW,  0, true]],                                    // PM2.5 solo
    [[PROJ_LOW,  0],[PROJ_LOW,  300]],
    [[PROJ_MID,  0],[PROJ_HIGH, 300]],
    [[PROJ_LOW,  0, true],[PROJ_MID, 250]],                   // PM2.5 + PM10
    [[PROJ_HIGH, 0],[PROJ_LOW,  200, true]],                  // mix
    [[PROJ_MID,  0],[PROJ_MID,  200],[PROJ_MID, 400]],
    [[PROJ_LOW,  0, true],[PROJ_MID, 200, true],[PROJ_HIGH, 400]], // PM2.5 barrage
  ];

  private startPollutionSpawner() {
    const scheduleNext = () => {
      this.time.addEvent({
        delay: this.spawnDelay,
        callback: () => {
          if (!this.levelComplete) {
            const wave = this.WAVES[this.waveIndex % this.WAVES.length];
            this.waveIndex++;
            for (const [y, delay, isPM25] of wave) {
              this.time.delayedCall(delay, () => {
                if (!this.levelComplete) {
                  // 30% chance: spawn as cloud cluster instead of single particle
                  if (Math.random() < 0.3) {
                    this.fireCloud(y, !!isPM25);
                  } else {
                    this.fireProjectile(y, !!isPM25);
                  }
                }
              });
            }
          }
          scheduleNext();
        },
      });
    };
    this.time.delayedCall(2500, scheduleNext);
    // Separate spawner: particles falling diagonally from above
    this.startFallingSpawner();
  }

  private startFallingSpawner() {
    const scheduleNext = () => {
      const delay = 3000 + Math.random() * 2000;
      this.time.addEvent({
        delay,
        callback: () => {
          if (!this.levelComplete) this.fireFallingCloud();
          scheduleNext();
        },
      });
    };
    this.time.delayedCall(4000, scheduleNext);
  }

  private fireCloud(targetY: number, isPM25: boolean) {
    const count = 3 + Math.floor(Math.random() * 3); // 3–5 particles
    for (let i = 0; i < count; i++) {
      const offsetX = i * 40 + (Math.random() * 20 - 10);
      const offsetY = Math.random() * 50 - 25;
      this.time.delayedCall(i * 80, () => {
        if (!this.levelComplete) this.fireProjectile(targetY + offsetY, isPM25, offsetX);
      });
    }
  }

  private fireFallingCloud() {
    const spawnX   = this.cameras.main.scrollX + 1200 + Math.random() * 300;
    const count    = 4 + Math.floor(Math.random() * 4); // 4–7 particles
    for (let i = 0; i < count; i++) {
      const offsetX = Math.random() * 80 - 40;
      const offsetY = Math.random() * 60 - 30;
      this.time.delayedCall(i * 120, () => {
        if (!this.levelComplete) this.fireDiagonal(spawnX + offsetX, -60 + offsetY);
      });
    }
  }

  private fireDiagonal(spawnX: number, spawnY: number) {
    const isPM25  = Math.random() < 0.6;
    const radius  = isPM25 ? 6 : 14;
    const color   = isPM25 ? 0x9933cc : 0xcc3300;
    const damage  = isPM25 ? 3 : 1;
    const vx      = -(80 + Math.random() * 60) * this.projSpeedMult;
    const vy      = 60 + Math.random() * 50;

    const key = `proj_${Date.now()}_${Math.random()}`;
    const gfx = this.make.graphics({ x: 0, y: 0 } as any);
    gfx.fillStyle(Phaser.Display.Color.ValueToColor(color).darken(35).color, 1);
    gfx.fillCircle(radius, radius, radius);
    gfx.fillStyle(color, 1);
    gfx.fillCircle(radius, radius, radius * 0.62);
    gfx.fillStyle(0xffffff, 0.3);
    gfx.fillCircle(radius * 0.6, radius * 0.5, radius * 0.25);
    gfx.generateTexture(key, radius * 2, radius * 2);
    gfx.destroy();

    const proj = this.projectiles.create(spawnX, spawnY, key) as Phaser.Physics.Arcade.Image;
    proj.setDepth(4);
    proj.setData("damage", damage);
    (proj.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    proj.setVelocity(vx, vy);

    const floatAmp = isPM25 ? 25 : 15;
    const floatDur = 1600 + Math.random() * 600;
    this.tweens.add({
      targets: proj, y: `+=${floatAmp}`,
      duration: floatDur, ease: "Sine.easeInOut",
      yoyo: true, repeat: -1,
    });
    this.tweens.add({ targets: proj, angle: -360, duration: 1800, repeat: -1 });
    proj.on("destroy", () => { if (this.textures.exists(key)) this.textures.remove(key); });
  }

  private fireProjectile(targetY: number, isPM25 = false, extraOffsetX = 0) {
    const spawnX  = this.cameras.main.scrollX + 1380 + extraOffsetX;
    const radius  = isPM25 ? 7 : 18;
    const color   = isPM25 ? 0x9933cc : 0xcc3300;
    const damage  = isPM25 ? 3 : 1;
    const speedVariation = 0.8 + Math.random() * 0.4; // ±20%
    const baseSpd = isPM25 ? -180 : -150;
    const speed   = baseSpd * this.projSpeedMult * speedVariation;

    // Spawn con ligero offset vertical aleatorio
    const spawnY  = targetY + (Math.random() * 40 - 20);

    const key = `proj_${Date.now()}_${Math.random()}`;
    const gfx = this.make.graphics({ x: 0, y: 0 } as any);
    gfx.fillStyle(Phaser.Display.Color.ValueToColor(color).darken(35).color, 1);
    gfx.fillCircle(radius, radius, radius);
    gfx.fillStyle(color, 1);
    gfx.fillCircle(radius, radius, radius * 0.62);
    gfx.fillStyle(0xffffff, 0.3);
    gfx.fillCircle(radius * 0.6, radius * 0.5, radius * 0.25);
    gfx.generateTexture(key, radius * 2, radius * 2);
    gfx.destroy();

    const proj = this.projectiles.create(spawnX, spawnY, key) as Phaser.Physics.Arcade.Image;
    proj.setDepth(4);
    proj.setData("damage", damage);
    (proj.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    proj.setVelocity(speed, 0);

    // Oscilación vertical sinusoidal — flota en el aire
    const floatAmp      = isPM25 ? 35 : 22;
    const floatDuration = isPM25 ? (1800 + Math.random() * 600) : (2400 + Math.random() * 800);
    this.tweens.add({
      targets: proj, y: spawnY + floatAmp,
      duration: floatDuration, ease: "Sine.easeInOut",
      yoyo: true, repeat: -1,
    });

    this.tweens.add({ targets: proj, angle: -360, duration: isPM25 ? 1200 : 2000, repeat: -1 });
    proj.on("destroy", () => { if (this.textures.exists(key)) this.textures.remove(key); });
  }

  // ── Goal ─────────────────────────────────────────────────────────

  private createGoal(x: number) {
    const goalCenterY = SIDEWALK_Y - 60;
    const glow = this.add.rectangle(x + 40, goalCenterY, 80, 120, 0x44ff88, 0.35).setDepth(3);
    this.add.rectangle(x + 40, goalCenterY, 6, 120, 0x22cc66).setDepth(3);
    this.tweens.add({ targets: glow, alpha: 0.1, duration: 800, yoyo: true, repeat: -1 });
    this.add.text(x + 40, SIDEWALK_Y - 140, "META", {
      fontSize: "20px", fontFamily: "'Press Start 2P'", color: "#22cc66",
    }).setOrigin(0.5).setDepth(3);
  }

  // ── Events ────────────────────────────────────────────────────────

  private onLevelComplete() {
    if (this.levelComplete) return;
    this.levelComplete = true;
    this.player.setVelocity(0, 0);
    this.sfx("sfx_goal", 0.8);
    this.cameras.main.fadeOut(800, 255, 255, 255);
    this.cameras.main.once("camerafadeoutcomplete", () => {
      this.scene.start("BossScene");
    });
  }

  private onHit(damage = 1) {
    if (this.invincible || this.levelComplete) return;
    this.invincible = true;
    this.health = Math.max(0, this.health - damage * this.difficultyMultiplier);
    this.drawHealthBar();
    this.sfx("sfx_hit", 0.7);
    this.player.setTint(0xff4444);
    this.cameras.main.shake(220, 0.007);

    // Red vignette flash
    this.vignetteRect.setAlpha(0.45);
    this.tweens.add({ targets: this.vignetteRect, alpha: 0, duration: 500, ease: "Quad.Out" });

    // Smog thickens
    const smogAlpha = ((10 - this.health) / 10) * 0.38;
    this.smogOverlay.setAlpha(smogAlpha);

    if (this.health <= 0) {
      this.levelComplete = true;
      this.sfx("sfx_death", 0.8);
      this.time.delayedCall(600, () => this.sfx("sfx_gameover", 0.8));
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

  // ── HUD ───────────────────────────────────────────────────────────



  private sfx(key: string, volume = 1) {
    if (this.cache.audio.exists(key)) this.sound.play(key, { volume });
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

    this.healthBar.fillStyle(0x222222, 1);
    this.healthBar.fillRect(barX, barTop - 10, totalW, 10);
    this.healthBar.fillStyle(0x666666, 1);
    this.healthBar.fillRect(barX + 2, barTop - 10, totalW - 4, 3);

    this.healthBar.fillStyle(0x110000, 1);
    this.healthBar.fillRect(barX + railW, barTop, innerW, totalH);

    for (let i = 0; i < segments; i++) {
      const segY   = barTop + totalH - (i + 1) * segH - i * segGap;
      const filled = i < this.health;
      if (filled) {
        this.healthBar.fillStyle(0xcc2200, 1);
        this.healthBar.fillRect(barX + railW, segY + segH / 2, innerW, segH / 2);
        this.healthBar.fillStyle(0xff7722, 1);
        this.healthBar.fillRect(barX + railW, segY, innerW, segH / 2);
        this.healthBar.fillStyle(0xffcc66, 0.35);
        this.healthBar.fillRect(barX + railW, segY, innerW, 2);
      } else {
        this.healthBar.fillStyle(0x1e0000, 1);
        this.healthBar.fillRect(barX + railW, segY, innerW, segH);
      }
      this.healthBar.fillStyle(0x000000, 1);
      this.healthBar.fillRect(barX + railW, segY + segH - 1, innerW, 1);
    }

    // Rails
    for (const rx of [barX, barX + railW + innerW]) {
      this.healthBar.fillStyle(0x888888, 1);
      this.healthBar.fillRect(rx, barTop, railW, totalH);
      this.healthBar.fillStyle(0xdddddd, 1);
      this.healthBar.fillRect(rx, barTop, 2, totalH);
      this.healthBar.fillStyle(0x444444, 1);
      this.healthBar.fillRect(rx + railW - 2, barTop, 2, totalH);
      for (let y = barTop + 6; y < barTop + totalH - 4; y += 24) {
        this.healthBar.fillRect(rx + 1, y, railW - 2, 4);
      }
    }

    this.healthBar.fillStyle(0x222222, 1);
    this.healthBar.fillRect(barX, barTop + totalH, totalW, 8);
    this.healthBar.fillStyle(0x555555, 1);
    this.healthBar.fillRect(barX + 2, barTop + totalH, totalW - 4, 3);

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

    // Label below gem
    // (static text added in create, bar handles graphics only)
  }
}
